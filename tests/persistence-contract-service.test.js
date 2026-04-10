const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
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
