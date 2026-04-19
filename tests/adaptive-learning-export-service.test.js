import test from "node:test";
import assert from "node:assert/strict";

import {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_OUTCOME_KINDS,
  ADAPTIVE_RECOMMENDATION_KINDS,
  createAdaptiveLearningEvent,
} from "../src/services/adaptive-learning-event-service.js";
import {
  buildAdaptiveLearningExportArtifacts,
  normalizeAdaptiveLearningSinkRowsForExtraction,
} from "../src/services/adaptive-learning-export-service.js";

const buildRecommendation = () => createAdaptiveLearningEvent({
  eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
  actorId: "local_actor_1",
  localActorId: "local_actor_1",
  dedupeKey: "day_prescription_plan_day_2026-04-18",
  payload: {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
    recommendationJoinKey: "join_1",
    goalStack: [{ id: "goal_1", summary: "Run faster", category: "running", priority: 1, active: true }],
    planStage: {
      currentPhase: "BUILD",
      currentWeek: 4,
      currentDay: 2,
      dateKey: "2026-04-18",
      planWeekId: "plan_week_4",
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

const buildOutcome = (decisionId) => createAdaptiveLearningEvent({
  eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
  actorId: "local_actor_1",
  localActorId: "local_actor_1",
  dedupeKey: "workout_outcome_plan_day_2026-04-18",
  payload: {
    outcomeKind: ADAPTIVE_OUTCOME_KINDS.workoutLog,
    recommendationJoinKey: "join_1",
    decisionId,
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
  },
});

test("adaptive learning export normalizes event-sink rows into extraction envelopes", () => {
  const recommendation = buildRecommendation();
  const normalized = normalizeAdaptiveLearningSinkRowsForExtraction({
    rows: [recommendation],
    actorId: "local_actor_1",
    userId: "user_1",
  });

  assert.equal(normalized.adaptiveLearning.actorId, "local_actor_1");
  assert.equal(normalized.adaptiveLearning.userId, "user_1");
  assert.equal(normalized.adaptiveLearning.events.length, 1);
  assert.equal(normalized.adaptiveLearning.events[0].eventId, recommendation.eventId);
});

test("adaptive learning export artifacts summarize normalized events deterministically", () => {
  const recommendation = buildRecommendation();
  const outcome = buildOutcome(recommendation.payload.decisionId);
  const artifacts = buildAdaptiveLearningExportArtifacts({
    rawSources: [
      {
        adaptiveLearning: {
          actorId: "local_actor_1",
          userId: "user_1",
          events: [recommendation, outcome],
          pendingEventIds: [],
        },
      },
    ],
    sourceKind: "trainer_data",
    exportedAt: 1713441600000,
    label: "regression_export",
  });

  assert.equal(artifacts.summary.eventCount, 2);
  assert.equal(artifacts.summary.byEventName[ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated], 1);
  assert.equal(artifacts.summary.byEventName[ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded], 1);
  assert.equal(artifacts.summary.byOwner.planning, 1);
  assert.equal(artifacts.summary.byOwner.logging, 1);
});
