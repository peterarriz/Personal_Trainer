import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeleteAccountEndpointUnavailableDiagnostics,
  clearTemporarilyUnavailableEndpoint,
  getTemporarilyUnavailableEndpoint,
  isLikelyLocalAppRuntime,
  markEndpointTemporarilyUnavailable,
  shouldTreatSameOriginApiRoutesAsUnavailable,
} from "../src/services/runtime-endpoint-availability-service.js";

const createMemoryStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
};

test("local app runtimes treat same-origin api routes as unavailable by default", () => {
  const storage = createMemoryStorage();
  assert.equal(isLikelyLocalAppRuntime({ hostname: "127.0.0.1" }), true);
  assert.equal(
    shouldTreatSameOriginApiRoutesAsUnavailable({
      endpoint: "/api/auth/delete-account",
      hostname: "127.0.0.1",
      storageLike: storage,
    }),
    true
  );

  storage.setItem("trainer_local_api_routes", "1");
  assert.equal(
    shouldTreatSameOriginApiRoutesAsUnavailable({
      endpoint: "/api/auth/delete-account",
      hostname: "127.0.0.1",
      storageLike: storage,
    }),
    false
  );
});

test("endpoint availability cache remembers missing routes until expiry", () => {
  const storage = createMemoryStorage();
  const now = 1_000_000;

  assert.equal(
    getTemporarilyUnavailableEndpoint({
      endpoint: "/api/adaptive-learning/events",
      storageLike: storage,
      now,
    }),
    null
  );

  markEndpointTemporarilyUnavailable({
    endpoint: "/api/adaptive-learning/events",
    status: 404,
    reason: "endpoint_unavailable",
    ttlMs: 65_000,
    storageLike: storage,
    now,
  });

  const cached = getTemporarilyUnavailableEndpoint({
    endpoint: "/api/adaptive-learning/events",
    storageLike: storage,
    now: now + 1_000,
  });
  assert.equal(cached?.status, 404);
  assert.equal(cached?.reason, "endpoint_unavailable");

  assert.equal(
    getTemporarilyUnavailableEndpoint({
      endpoint: "/api/adaptive-learning/events",
      storageLike: storage,
      now: now + 66_000,
    }),
    null
  );

  clearTemporarilyUnavailableEndpoint({
    endpoint: "/api/adaptive-learning/events",
    storageLike: storage,
  });
  assert.equal(storage.getItem("trainer_endpoint_unavailable_v1"), null);
});

test("delete-account unavailable diagnostics stay honest about local builds", () => {
  const diagnostics = buildDeleteAccountEndpointUnavailableDiagnostics({
    reason: "local_runtime_missing_route",
  });

  assert.equal(diagnostics.configured, false);
  assert.equal(diagnostics.code, "delete_account_endpoint_unavailable");
  assert.match(diagnostics.message, /local build/i);
});
