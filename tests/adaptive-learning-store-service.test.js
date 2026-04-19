import test from "node:test";
import assert from "node:assert/strict";

import { ADAPTIVE_LEARNING_EVENT_NAMES, ADAPTIVE_OUTCOME_KINDS, ADAPTIVE_RECOMMENDATION_KINDS } from "../src/services/adaptive-learning-event-service.js";
import { createAdaptiveLearningStore } from "../src/services/adaptive-learning-store-service.js";

const createMemoryStorage = () => {
  const bag = new Map();
  return {
    getItem(key) {
      return bag.has(key) ? bag.get(key) : null;
    },
    setItem(key, value) {
      bag.set(key, String(value));
    },
    removeItem(key) {
      bag.delete(key);
    },
  };
};

const buildRecommendationPayload = (joinKey = "day_prescription_1") => ({
  recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
  recommendationJoinKey: joinKey,
  goalStack: [{ id: "goal_1", summary: "Run a faster 10k", category: "running", priority: 1, active: true }],
  planStage: {
    currentPhase: "BUILD",
    currentWeek: 4,
    currentDay: 2,
    dateKey: "2026-04-18",
    planWeekId: "plan_week_4",
    planDayId: "plan_day_2026-04-18",
  },
  contextualInputs: {
    readiness_state: "steady",
  },
  candidateOptionsConsidered: [
    { optionKey: "tempo", label: "Tempo run", source: "base_plan" },
  ],
  chosenOption: {
    optionKey: "tempo",
    label: "Tempo run",
    source: "deterministic_engine",
    accepted: true,
  },
  whyChosen: ["Weekly focus is threshold work."],
  provenance: {
    source: "plan_day_resolution",
    summary: "Resolved the tempo day from the deterministic planner.",
  },
  sourceSurface: "today",
  owner: "planning",
});

const buildOutcomePayload = (joinKey = "day_prescription_1") => ({
  outcomeKind: ADAPTIVE_OUTCOME_KINDS.workoutLog,
  recommendationJoinKey: joinKey,
  decisionId: `decision_${joinKey}`,
  adherenceOutcome: "as_prescribed",
  completionPercentage: 1,
  userModifications: [],
  perceivedDifficulty: "about_right",
  painFlag: false,
  painArea: "",
  satisfactionSignal: "positive",
  frustrationSignal: "",
  shortHorizonResultWindow: {
    windowDays: 3,
    reviewDateKey: "2026-04-18",
    observedSignals: ["as_prescribed"],
    summary: "Completed as prescribed.",
  },
  actualSummary: "Completed as prescribed.",
  sourceSurface: "log",
  owner: "logging",
});

test("adaptive learning store buffers events locally and survives local-only restarts", () => {
  const storage = createMemoryStorage();
  const store = createAdaptiveLearningStore({ storageLike: storage });

  store.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildRecommendationPayload("day_prescription_1"),
  });
  store.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
    dedupeKey: "workout_outcome_2026-04-18",
    payload: buildOutcomePayload("day_prescription_1"),
  });

  const pendingBeforeRestart = store.getPendingEvents();
  const restartedStore = createAdaptiveLearningStore({ storageLike: storage });
  const pendingAfterRestart = restartedStore.getPendingEvents();

  assert.equal(pendingBeforeRestart.length, 2);
  assert.equal(pendingAfterRestart.length, 2);
  assert.equal(restartedStore.getSnapshot().events.length, 2);
});

test("adaptive learning store does not duplicate events during retries and clears pending ids after sync", () => {
  const storage = createMemoryStorage();
  const store = createAdaptiveLearningStore({ storageLike: storage });

  const recommendation = store.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildRecommendationPayload("day_prescription_retry_case"),
  });
  store.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildRecommendationPayload("day_prescription_retry_case"),
  });

  assert.equal(store.getSnapshot().events.length, 1);
  assert.equal(store.getSnapshot().pendingEventIds.length, 1);
  assert.equal(store.getSnapshot().pendingServerEventIds.length, 1);

  store.markEventsSynced({ eventIds: [recommendation.eventId], at: Date.UTC(2026, 3, 18, 13, 0, 0) });

  assert.equal(store.getSnapshot().pendingEventIds.length, 0);
  assert.equal(store.getSnapshot().pendingServerEventIds.length, 1);
  assert.equal(store.getSnapshot().lastCloudWriteAt, Date.UTC(2026, 3, 18, 13, 0, 0));
});

test("adaptive learning store tracks dedicated server-ingest replay separately from trainer-data replay", () => {
  const storage = createMemoryStorage();
  const store = createAdaptiveLearningStore({ storageLike: storage });

  const recommendation = store.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildRecommendationPayload("day_prescription_server_sink_case"),
  });

  assert.equal(store.getPendingEvents().length, 1);
  assert.equal(store.getPendingServerEvents().length, 1);

  store.markEventsSynced({ eventIds: [recommendation.eventId], at: Date.UTC(2026, 3, 18, 13, 15, 0) });

  assert.equal(store.getPendingEvents().length, 0);
  assert.equal(store.getPendingServerEvents().length, 1);

  store.markEventsIngested({ eventIds: [recommendation.eventId], at: Date.UTC(2026, 3, 18, 13, 20, 0) });

  assert.equal(store.getPendingServerEvents().length, 0);
  assert.equal(store.getSnapshot().lastServerIngestAt, Date.UTC(2026, 3, 18, 13, 20, 0));
  assert.equal(store.getSnapshot().lastServerIngestErrorCode, "");
});

test("adaptive learning store merges cloud snapshots without duplicating history and resolves cross-device replay", () => {
  const storage = createMemoryStorage();
  const deviceA = createAdaptiveLearningStore({ storageLike: storage });
  const localRecommendation = deviceA.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildRecommendationPayload("day_prescription_cross_device"),
  });

  const cloudSnapshot = {
    ...deviceA.buildPersistenceSnapshot(),
    pendingEventIds: [],
    lastCloudWriteAt: Date.UTC(2026, 3, 18, 14, 0, 0),
  };

  const deviceBStorage = createMemoryStorage();
  const deviceB = createAdaptiveLearningStore({ storageLike: deviceBStorage });
  deviceB.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildRecommendationPayload("day_prescription_cross_device"),
  });
  deviceB.importPersistedSnapshot({
    persistedSnapshot: cloudSnapshot,
    source: "cloud",
    at: Date.UTC(2026, 3, 18, 14, 5, 0),
  });

  const merged = deviceB.getSnapshot();

  assert.equal(merged.events.length, 1);
  assert.equal(merged.events[0].eventId, localRecommendation.eventId);
  assert.deepEqual(merged.pendingEventIds, []);
  assert.equal(merged.lastCloudReadAt, Date.UTC(2026, 3, 18, 14, 5, 0));
});
