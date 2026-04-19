import test from "node:test";
import assert from "node:assert/strict";

import {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_OUTCOME_KINDS,
  ADAPTIVE_RECOMMENDATION_KINDS,
  buildAdaptiveLearningEventId,
  buildRecommendationJoinKey,
  createAdaptiveLearningEvent,
} from "../src/services/adaptive-learning-event-service.js";

test("recommendation events validate core planning fields and produce stable ids from dedupe keys", () => {
  const joinKey = buildRecommendationJoinKey({
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
    planWeekId: "plan_week_4",
    planDayId: "plan_day_2026-04-18",
    dateKey: "2026-04-18",
    weekNumber: 4,
    chosenOption: {
      optionKey: "tempo_session",
      label: "Tempo session",
    },
  });

  const event = createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    actorId: "local_actor_1",
    localActorId: "local_actor_1",
    occurredAt: Date.UTC(2026, 3, 18, 12, 0, 0),
    dedupeKey: `day_prescription_${joinKey}`,
    payload: {
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
      recommendationJoinKey: joinKey,
      goalStack: [
        { id: "goal_1", summary: "Run a faster 10k", category: "running", priority: 1, active: true },
      ],
      planStage: {
        currentPhase: "BUILD",
        currentWeek: 4,
        currentDay: 6,
        dateKey: "2026-04-18",
        planWeekId: "plan_week_4",
        planDayId: "plan_day_2026-04-18",
      },
      contextualInputs: {
        readiness_state: "steady",
        environment_mode: "gym",
      },
      candidateOptionsConsidered: [
        {
          optionKey: "base_plan",
          label: "Tempo session",
          source: "base_plan",
        },
      ],
      chosenOption: {
        optionKey: "tempo_session",
        label: "Tempo session",
        source: "deterministic_engine",
        accepted: true,
      },
      whyChosen: ["Weekly focus is threshold durability."],
      provenance: {
        source: "plan_day_resolution",
        summary: "Resolved the planned tempo day without changing the stress target.",
      },
      adaptivePolicyShadow: {
        runtimeMode: "shadow",
        decisions: [
          {
            decisionPointId: "time_crunched_session_format_choice",
            mode: "shadow",
            decisionMode: "shadow",
            defaultActionId: "default_structure",
            chosenActionId: "default_structure",
            shadowTopActionId: "short_separate_sessions",
            fallbackReason: "shadow_mode",
            contextSnapshot: {
              primaryGoalCategory: "hybrid",
              scheduleReliability: "busy",
              timeCrunched: true,
            },
            candidateScores: [
              {
                actionId: "default_structure",
                label: "Default structure",
                score: 0.01,
                confidenceScore: 20,
                sampleSize: 8,
                evidenceEffectSize: 0.01,
              },
              {
                actionId: "short_separate_sessions",
                label: "Short separate sessions",
                score: 0.11,
                confidenceScore: 84,
                sampleSize: 22,
                evidenceEffectSize: 0.08,
                matchedRuleIds: ["time_crunched_rule_1"],
                matchedEvidenceSummaries: ["Busy users finished more often when the session stayed concise."],
              },
            ],
            explanation: "Shadow mode scored short separate sessions but kept the default structure.",
          },
        ],
      },
      sourceSurface: "today",
      owner: "planning",
    },
  });

  assert.equal(event.payload.recommendationKind, ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription);
  assert.equal(event.payload.planStage.planDayId, "plan_day_2026-04-18");
  assert.equal(event.payload.goalStack[0].summary, "Run a faster 10k");
  assert.equal(event.payload.adaptivePolicyShadow?.runtimeMode, "shadow");
  assert.equal(event.payload.adaptivePolicyShadow?.decisions?.[0]?.shadowTopActionId, "short_separate_sessions");
  assert.equal(event.payload.adaptivePolicyShadow?.decisions?.[0]?.contextSnapshot?.scheduleReliability, "busy");
  assert.equal(event.payload.adaptivePolicyShadow?.decisions?.[0]?.contextSnapshot?.timeCrunched, true);
  assert.equal(event.eventId, buildAdaptiveLearningEventId({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    actorId: "local_actor_1",
    dedupeKey: `day_prescription_${joinKey}`,
    occurredAt: Date.UTC(2026, 3, 18, 12, 0, 0),
  }));
});

test("outcome events reject missing recommendation joins and sanitize execution signals", () => {
  assert.throws(() => createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
    actorId: "local_actor_1",
    localActorId: "local_actor_1",
    payload: {
      outcomeKind: ADAPTIVE_OUTCOME_KINDS.workoutLog,
      adherenceOutcome: "as_prescribed",
    },
  }));

  const event = createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
    actorId: "local_actor_1",
    localActorId: "local_actor_1",
    dedupeKey: "outcome_plan_day_2026-04-18",
    payload: {
      outcomeKind: ADAPTIVE_OUTCOME_KINDS.workoutLog,
      recommendationJoinKey: "day_prescription_abc123",
      decisionId: "decision_abc123",
      adherenceOutcome: "modified",
      completionPercentage: 0.72,
      userModifications: ["shortened session"],
      perceivedDifficulty: "harder_than_expected",
      painFlag: true,
      painArea: "Achilles",
      satisfactionSignal: "neutral",
      frustrationSignal: "pain",
      shortHorizonResultWindow: {
        windowDays: 3,
        reviewDateKey: "2026-04-18",
        observedSignals: ["modified", "pain"],
        summary: "Finished the session but cut the last block.",
      },
      actualSummary: "Finished the session but cut the last block.",
      sourceSurface: "log",
      owner: "logging",
    },
  });

  assert.equal(event.payload.recommendationJoinKey, "day_prescription_abc123");
  assert.equal(event.payload.completionPercentage, 0.72);
  assert.equal(event.payload.painFlag, true);
  assert.equal(event.payload.shortHorizonResultWindow.windowDays, 3);
});

test("snapshot and lifecycle events sanitize payloads into compact machine-readable records", () => {
  const cohortEvent = createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.cohortSnapshotCaptured,
    actorId: "local_actor_2",
    localActorId: "local_actor_2",
    dedupeKey: "cohort_snapshot_strength_beginner",
    payload: {
      cohortKey: "strength_only__beginner__home",
      planArchetypeId: "strength_only",
      primaryGoalCategory: "strength",
      secondaryGoalCategories: ["body_comp"],
      experienceLevel: "beginner",
      trainingDaysPerWeek: 3,
      environmentMode: "home",
      equipmentAccess: ["dumbbells", "bench"],
      nutritionBias: "high-protein performance",
      coachTone: "balanced direct coaching",
    },
  });
  const syncEvent = createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.syncLifecycleChanged,
    actorId: "local_actor_2",
    localActorId: "local_actor_2",
    dedupeKey: "sync_error_gateway_timeout",
    payload: {
      syncEvent: "persist_all",
      status: "error",
      reason: "gateway_timeout",
      endpoint: "rest/v1/trainer_data",
      httpStatus: 504,
      pendingLocalWrites: true,
      retryEligible: true,
      detail: "Cloud sync timed out and the device kept the local copy.",
    },
  });

  assert.equal(cohortEvent.payload.trainingDaysPerWeek, 3);
  assert.equal(cohortEvent.payload.secondaryGoalCategories[0], "body_comp");
  assert.equal(syncEvent.payload.httpStatus, 504);
  assert.equal(syncEvent.payload.pendingLocalWrites, true);
});
