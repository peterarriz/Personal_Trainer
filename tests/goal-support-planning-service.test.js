const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalSupportPlanningContext,
} = require("../src/services/goal-support-planning-service.js");

const buildGoal = ({
  id = "goal_1",
  name = "Bench 225",
  category = "strength",
  priority = 1,
  resolvedGoal = null,
} = {}) => ({
  id,
  name,
  category,
  priority,
  active: true,
  resolvedGoal,
});

const buildAccessoryLog = (records = []) => ({
  checkin: { status: "completed_as_planned" },
  performanceRecords: records.map((record) => ({
    scope: "exercise",
    exercise: record.exercise,
    actualWeight: record.weight,
    actualReps: record.reps,
    actualSets: record.sets,
    prescribedWeight: record.weight,
    prescribedReps: record.reps,
    prescribedSets: record.sets,
  })),
});

test("bench goals default to shoulder, triceps, and upper-back support when no recent accessory evidence exists", () => {
  const context = buildGoalSupportPlanningContext({
    goals: [
      buildGoal({
        name: "Bench 225",
        resolvedGoal: {
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
        },
      }),
    ],
    logs: {},
    now: "2026-04-21",
  });

  assert.ok(context.strengthFocusDriverIds.includes("shoulder_tolerance"));
  assert.ok(context.strengthFocusDriverIds.includes("anterior_delt_strength"));
  assert.ok(context.strengthFocusDriverIds.includes("triceps_strength"));
});

test("recently covered bench support drivers push the planner toward trunk and tolerance gaps next", () => {
  const context = buildGoalSupportPlanningContext({
    goals: [
      buildGoal({
        name: "Bench 225",
        resolvedGoal: {
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
        },
      }),
    ],
    logs: {
      "2026-04-10": buildAccessoryLog([
        { exercise: "Incline DB Press", weight: 90, reps: 8, sets: 3 },
        { exercise: "Lateral Raise", weight: 20, reps: 15, sets: 3 },
      ]),
      "2026-04-16": buildAccessoryLog([
        { exercise: "Chest-Supported Row", weight: 90, reps: 10, sets: 3 },
        { exercise: "Cable Pressdown", weight: 60, reps: 12, sets: 3 },
      ]),
    },
    now: "2026-04-21",
  });

  assert.ok(context.strengthFocusDriverIds.includes("trunk_bracing"));
  assert.ok(context.strengthFocusDriverIds.some((id) => ["shoulder_tolerance", "scapular_control", "elbow_tolerance"].includes(id)));
});
