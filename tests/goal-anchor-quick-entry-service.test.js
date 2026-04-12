const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_ANCHOR_QUICK_ENTRY_TYPES,
  buildGoalAnchorQuickEntryModel,
  upsertGoalAnchorQuickEntry,
} = require("../src/services/goal-anchor-quick-entry-service.js");

test("quick-entry model exposes bodyweight, waist, run, and lift anchors for relevant goal tracking cards", () => {
  const anchors = buildGoalAnchorQuickEntryModel({
    goalProgressTracking: {
      goalCards: [
        {
          planningCategory: "body_comp",
          goalFamily: "appearance",
          trackedItems: [
            { key: "bodyweight_trend" },
            { key: "waist_circumference" },
          ],
        },
        {
          planningCategory: "strength",
          trackedItems: [{ key: "performance_record" }],
        },
        {
          planningCategory: "running",
          trackedItems: [{ key: "goal_pace_anchor" }],
        },
      ],
    },
  });

  assert.deepEqual(anchors.map((anchor) => anchor.type), [
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.bodyweight,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.waist,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.liftBenchmark,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark,
  ]);
});

test("quick-entry model stays empty when no goal-tracking cards are available", () => {
  assert.deepEqual(buildGoalAnchorQuickEntryModel({ goalProgressTracking: null }), []);
});

test("quick-entry upserts waist and benchmark rows into the shared manual-progress shape", () => {
  let manualProgressInputs = upsertGoalAnchorQuickEntry({
    manualProgressInputs: {},
    type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.waist,
    entry: { date: "2026-04-09", value: "34.5" },
  });
  manualProgressInputs = upsertGoalAnchorQuickEntry({
    manualProgressInputs,
    type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark,
    entry: { date: "2026-04-10", distance: "4", duration: "31:20", pace: "7:50" },
  });
  manualProgressInputs = upsertGoalAnchorQuickEntry({
    manualProgressInputs,
    type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.liftBenchmark,
    entry: { date: "2026-04-11", exercise: "Bench Press", weight: "205", reps: "3", sets: "2" },
  });

  assert.deepEqual(manualProgressInputs.measurements.waist_circumference, [
    { date: "2026-04-09", value: 34.5, note: "" },
  ]);
  assert.deepEqual(manualProgressInputs.benchmarks.run_results, [
    { date: "2026-04-10", distanceMiles: 4, durationMinutes: "31:20", paceText: "7:50", note: "" },
  ]);
  assert.deepEqual(manualProgressInputs.benchmarks.lift_results, [
    { date: "2026-04-11", exercise: "Bench Press", weight: 205, reps: 3, sets: 2, note: "" },
  ]);
});

test("quick-entry upserts replace same-day benchmark entries instead of duplicating them", () => {
  const manualProgressInputs = upsertGoalAnchorQuickEntry({
    manualProgressInputs: {
      benchmarks: {
        run_results: [{ date: "2026-04-10", distanceMiles: 3, durationMinutes: "24:00", paceText: "8:00", note: "" }],
      },
    },
    type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark,
    entry: { date: "2026-04-10", distance: "4", duration: "31:20", pace: "7:50" },
  });

  assert.deepEqual(manualProgressInputs.benchmarks.run_results, [
    { date: "2026-04-10", distanceMiles: 4, durationMinutes: "31:20", paceText: "7:50", note: "" },
  ]);
});
