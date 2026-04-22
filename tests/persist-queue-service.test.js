import test from "node:test";
import assert from "node:assert/strict";

import { createPersistQueueController } from "../src/services/persist-queue-service.js";

const createDeferred = () => {
  let resolve = null;
  let reject = null;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

test("persist queue collapses duplicate in-flight requests into one execution", async () => {
  const calls = [];
  const gate = createDeferred();
  const controller = createPersistQueueController({
    execute: async (request) => {
      calls.push(request.label);
      await gate.promise;
      return { ok: true, label: request.label };
    },
  });

  const firstPromise = controller.enqueue({
    key: "same_payload",
    ownerId: "user_1",
    request: { label: "first" },
  });
  const secondPromise = controller.enqueue({
    key: "same_payload",
    ownerId: "user_1",
    request: { label: "second" },
  });

  gate.resolve();
  const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

  assert.deepEqual(calls, ["first"]);
  assert.equal(firstResult?.label, "first");
  assert.equal(secondResult?.label, "first");
});

test("persist queue keeps only the latest queued request while one is active", async () => {
  const calls = [];
  const firstGate = createDeferred();
  const controller = createPersistQueueController({
    execute: async (request) => {
      calls.push(request.label);
      if (request.label === "first") {
        await firstGate.promise;
      }
      return { ok: true, label: request.label };
    },
  });

  const firstPromise = controller.enqueue({
    key: "payload_a",
    ownerId: "user_1",
    request: { label: "first" },
  });
  const secondPromise = controller.enqueue({
    key: "payload_b",
    ownerId: "user_1",
    request: { label: "second" },
  });
  const thirdPromise = controller.enqueue({
    key: "payload_c",
    ownerId: "user_1",
    request: { label: "third" },
  });

  assert.strictEqual(secondPromise, thirdPromise);

  firstGate.resolve();
  const [firstResult, secondResult, thirdResult] = await Promise.all([
    firstPromise,
    secondPromise,
    thirdPromise,
  ]);

  assert.deepEqual(calls, ["first", "third"]);
  assert.equal(firstResult?.label, "first");
  assert.equal(secondResult?.label, "third");
  assert.equal(thirdResult?.label, "third");
});

test("persist queue can invalidate a queued request before it executes", async () => {
  const calls = [];
  const firstGate = createDeferred();
  const controller = createPersistQueueController({
    execute: async (request) => {
      calls.push(request.label);
      if (request.label === "first") {
        await firstGate.promise;
      }
      return { ok: true, label: request.label };
    },
  });

  const firstPromise = controller.enqueue({
    key: "payload_a",
    ownerId: "user_1",
    request: { label: "first" },
  });
  const queuedPromise = controller.enqueue({
    key: "payload_b",
    ownerId: "user_1",
    request: { label: "second" },
  });

  const invalidated = controller.invalidateQueued({
    ok: false,
    skipped: true,
    stale: true,
    reason: "signed_out",
  });

  assert.equal(invalidated, true);

  firstGate.resolve();
  const [firstResult, queuedResult] = await Promise.all([firstPromise, queuedPromise]);

  assert.deepEqual(calls, ["first"]);
  assert.equal(firstResult?.label, "first");
  assert.equal(queuedResult?.reason, "signed_out");
  assert.equal(queuedResult?.stale, true);
});
