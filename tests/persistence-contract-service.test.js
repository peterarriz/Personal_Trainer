const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_OUTCOME_KINDS,
  ADAPTIVE_RECOMMENDATION_KINDS,
  createAdaptiveLearningEvent,
} = require("../src/services/adaptive-learning-event-service.js");
const { buildPersistedTrainerPayload } = require("../src/services/persistence-adapter-service.js");
const {
  createPrescribedDayHistoryEntry,
} = require("../src/services/prescribed-day-history-service.js");
const {
  createPersistedPlanWeekRecord,
} = require("../src/services/plan-week-persistence-service.js");
const {
  sanitizeExercisePerformanceRowsForRest,
  sanitizeGoalRowsForRest,
} = require("../src/services/persistence-contract-service.js");

test("trainer payload sanitizes high-risk canonical entities before REST persistence", () => {
  const plannedDayRecord = buildPlannedDayRecord({
    id: "plan_day_2026-04-07",
    dateKey: "2026-04-07",
    base: { training: { label: "Tempo", type: "run", run: { t: "tempo", d: "3 x 8 min" } } },
    resolved: { training: { label: "Tempo", type: "run", run: { t: "tempo", d: "3 x 8 min" } } },
    decision: { mode: "progression_ready" },
    provenance: { summary: "Captured from plan day.", keyDrivers: [], events: [] },
    week: { currentWeek: 4, phase: "BUILD", label: "BUILD", status: "planned", programBlock: null, weeklyIntent: null, constraints: [], successDefinition: "" },
    flags: {},
  });
  const plannedHistory = createPrescribedDayHistoryEntry({
    plannedDayRecord,
    capturedAt: 1712664000000,
  });
  const planWeekRecord = createPersistedPlanWeekRecord({
    planWeek: {
      id: "plan_week_4",
      weekNumber: 4,
      absoluteWeek: 4,
      phase: "BUILDING",
      label: "BUILDING - Week 4",
      status: "planned",
      summary: "Hit the key sessions.",
      constraints: [],
      weeklyIntent: { focus: "Run durability" },
      sessionsByDay: {},
    },
    capturedAt: 1712664000000,
  });

  const payload = buildPersistedTrainerPayload({
    runtimeState: {
      goals: [
        {
          id: "goal_1",
          name: "Bench 225",
          category: "strength",
          active: true,
          priority: 1,
          nonPersistable: { fn: () => "noop" },
          resolvedGoal: {
            id: "resolved_1",
            summary: "Bench 225",
            planningCategory: "strength",
            reviewCadence: "weekly",
            driverProfile: {
              version: "2026-04-goal-driver-graph-v1",
              primaryDomain: "strength_hypertrophy",
              primaryOutcomeId: "bench_press_strength",
              primaryOutcomeLabel: "Bench press strength",
              directDrivers: [{ id: "horizontal_press_strength", label: "Horizontal pressing strength", weight: 0.42 }],
              supportDrivers: [{ id: "anterior_delt_strength", label: "Shoulder pressing support", weight: 0.18 }],
              protectiveDrivers: [{ id: "shoulder_tolerance", label: "Shoulder tolerance", weight: 0.12 }],
            },
            weird: new Map(),
          },
        },
      ],
      logs: {
        "2026-04-07": {
          type: "Bench",
          performanceRecords: [
            { bad: true },
            {
              scope: "exercise",
              exercise: "Bench Press",
              actual: { reps: 5, sets: 3, weight: 185 },
              prescribed: { reps: 5, sets: 3, weight: 185 },
            },
          ],
        },
      },
      plannedDayRecords: {
        "2026-04-07": plannedHistory,
        "2026-04-08": { broken: true },
      },
      planWeekRecords: {
        "4": planWeekRecord,
        "bad": { nope: true },
      },
    },
  });

  assert.equal(payload.goals.length, 1);
  assert.equal(payload.goals[0].name, "Bench 225");
  assert.equal(payload.goals[0].nonPersistable, undefined);
  assert.equal(payload.goals[0].resolvedGoal.summary, "Bench 225");
  assert.equal(payload.goals[0].resolvedGoal.driverProfile.primaryOutcomeId, "bench_press_strength");
  assert.deepEqual(Object.keys(payload.plannedDayRecords), ["2026-04-07"]);
  assert.deepEqual(Object.keys(payload.planWeekRecords), ["4"]);
  assert.equal(payload.logs["2026-04-07"].performanceRecords.length >= 1, true);
});

test("REST row sanitizers keep allowed fields and drop malformed rows", () => {
  const goalRows = sanitizeGoalRowsForRest({
    userId: "00000000-0000-0000-0000-000000000001",
    goals: [
      { id: "not-a-uuid", name: "Get lean", category: "body_comp", priority: 1, active: true, tempUiState: "ignore" },
      { name: "", category: "running" },
    ],
  });
  assert.equal(goalRows.length, 1);
  assert.equal(goalRows[0].id, undefined);
  assert.equal(goalRows[0].title, "Get lean");
  assert.equal(goalRows[0].tempUiState, undefined);

  const exerciseRows = sanitizeExercisePerformanceRowsForRest({
    userId: "00000000-0000-0000-0000-000000000001",
    dateKey: "2026-04-07",
    rows: [
      { exercise_name: "Bench Press", actual_weight: "185", actual_sets: "3", temp: "ignore" },
      { exercise_name: "" },
    ],
  });
  assert.equal(exerciseRows.length, 1);
  assert.equal(exerciseRows[0].exercise_name, "Bench Press");
  assert.equal(exerciseRows[0].actual_weight, 185);
  assert.equal(exerciseRows[0].temp, undefined);
});

test("trainer payload preserves adaptive learning joins through the persistence boundary", () => {
  const recommendationEvent = createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    actorId: "local_actor_1",
    localActorId: "local_actor_1",
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: {
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
      recommendationJoinKey: "day_prescription_join_1",
      goalStack: [
        { id: "goal_1", summary: "Run a faster 10k", category: "running", priority: 1, active: true },
      ],
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
        { optionKey: "tempo", label: "Tempo session", source: "deterministic_engine" },
      ],
      chosenOption: {
        optionKey: "tempo",
        label: "Tempo session",
        source: "deterministic_engine",
        accepted: true,
      },
      whyChosen: ["Threshold work is the build priority."],
      provenance: {
        source: "plan_day_resolution",
        summary: "Resolved the tempo day from the deterministic planner.",
      },
      sourceSurface: "today",
      owner: "planning",
    },
  });
  const outcomeEvent = createAdaptiveLearningEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
    actorId: "local_actor_1",
    localActorId: "local_actor_1",
    dedupeKey: "workout_outcome_plan_day_2026-04-18",
    payload: {
      outcomeKind: ADAPTIVE_OUTCOME_KINDS.workoutLog,
      recommendationJoinKey: "day_prescription_join_1",
      decisionId: recommendationEvent.payload.decisionId,
      adherenceOutcome: "modified",
      completionPercentage: 0.75,
      userModifications: ["shortened cooldown"],
      perceivedDifficulty: "harder_than_expected",
      painFlag: false,
      painArea: "",
      satisfactionSignal: "neutral",
      frustrationSignal: "",
      shortHorizonResultWindow: {
        windowDays: 3,
        reviewDateKey: "2026-04-18",
        observedSignals: ["modified"],
        summary: "Completed most of the session with a shorter finish.",
      },
      actualSummary: "Completed most of the session with a shorter finish.",
      sourceSurface: "log",
      owner: "logging",
    },
  });

  const payload = buildPersistedTrainerPayload({
    runtimeState: {},
    adaptiveLearningSnapshot: {
      actorId: "local_actor_1",
      userId: "",
      seq: 2,
      events: [recommendationEvent, outcomeEvent],
      pendingEventIds: [outcomeEvent.eventId],
      lastLocalWriteAt: 1713441600000,
      lastCloudReadAt: 0,
      lastCloudWriteAt: 0,
      lastReplayAt: 0,
    },
  });

  assert.equal(payload.adaptiveLearning.events.length, 2);
  assert.equal(payload.adaptiveLearning.events[0].payload.recommendationJoinKey, "day_prescription_join_1");
  assert.equal(payload.adaptiveLearning.events[1].payload.recommendationJoinKey, "day_prescription_join_1");
  assert.deepEqual(payload.adaptiveLearning.pendingEventIds, [outcomeEvent.eventId]);
});
