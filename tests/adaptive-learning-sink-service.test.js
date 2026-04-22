import test from "node:test";
import assert from "node:assert/strict";

import {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_RECOMMENDATION_KINDS,
  createAdaptiveLearningEvent,
} from "../src/services/adaptive-learning-event-service.js";
import {
  buildAdaptiveLearningSinkBatch,
  ingestAdaptiveLearningEvents,
} from "../src/services/adaptive-learning-sink-service.js";

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

const buildEvent = () => createAdaptiveLearningEvent({
  eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
  actorId: "local_actor_1",
  localActorId: "local_actor_1",
  dedupeKey: "day_prescription_plan_day_2026-04-18",
  payload: {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
    recommendationJoinKey: "day_prescription_join_1",
    goalStack: [{ id: "goal_1", summary: "Run faster", category: "running", priority: 1, active: true }],
    planStage: {
      currentPhase: "BUILD",
      currentWeek: 3,
      currentDay: 2,
      dateKey: "2026-04-18",
      planWeekId: "plan_week_3",
      planDayId: "plan_day_2026-04-18",
    },
    contextualInputs: {},
    candidateOptionsConsidered: [],
    chosenOption: {
      optionKey: "tempo",
      label: "Tempo run",
      source: "deterministic_engine",
      accepted: true,
    },
    whyChosen: ["Threshold focus"],
    provenance: {
      source: "plan_day_resolution",
      summary: "Resolved from planner",
    },
    sourceSurface: "today",
    owner: "planning",
  },
});

test("adaptive learning sink batch preserves snapshot identity and event ids", () => {
  const event = buildEvent();
  const batch = buildAdaptiveLearningSinkBatch({
    events: [event],
    snapshot: {
      actorId: "local_actor_1",
      userId: "user_1",
    },
  });

  assert.equal(batch.actorId, "local_actor_1");
  assert.equal(batch.userId, "user_1");
  assert.equal(batch.eventCount, 1);
  assert.deepEqual(batch.eventIds, [event.eventId]);
});

test("adaptive learning sink ingests events and returns ingested ids", async () => {
  const event = buildEvent();
  const result = await ingestAdaptiveLearningEvents({
    authSession: {
      access_token: "token",
    },
    safeFetchWithTimeout: async () => ({
      ok: true,
      status: 202,
      json: async () => ({
        ok: true,
        ingestedEventIds: [event.eventId],
        pendingEventIds: [],
        transport: "supabase_event_sink",
      }),
    }),
    events: [event],
    snapshot: {
      actorId: "local_actor_1",
      userId: "user_1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ingestedEventIds, [event.eventId]);
  assert.equal(result.transport, "supabase_event_sink");
});

test("adaptive learning sink leaves events pending when the server rejects the batch", async () => {
  const event = buildEvent();
  await assert.rejects(
    ingestAdaptiveLearningEvents({
      authSession: {
        access_token: "token",
      },
      safeFetchWithTimeout: async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          code: "adaptive_event_sink_disabled",
          message: "Adaptive event sink is disabled on this deployment.",
        }),
      }),
      events: [event],
    }),
    (error) => {
      assert.equal(error.code, "adaptive_event_sink_disabled");
      assert.deepEqual(error.pendingEventIds, [event.eventId]);
      return true;
    }
  );
});

test("adaptive learning sink skips same-origin api routes in the local app runtime", async () => {
  const event = buildEvent();
  const previousWindow = global.window;
  const previousLocalStorage = global.localStorage;
  const localStorage = createMemoryStorage();
  let fetchCalled = false;

  global.window = {
    location: { hostname: "127.0.0.1" },
    localStorage,
  };
  global.localStorage = localStorage;

  try {
    const result = await ingestAdaptiveLearningEvents({
      authSession: {
        access_token: "token",
      },
      safeFetchWithTimeout: async () => {
        fetchCalled = true;
        throw new Error("fetch should not run in local app runtime");
      },
      events: [event],
    });

    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "endpoint_unavailable");
    assert.deepEqual(result.pendingEventIds, [event.eventId]);
    assert.equal(fetchCalled, false);
  } finally {
    global.window = previousWindow;
    global.localStorage = previousLocalStorage;
  }
});
