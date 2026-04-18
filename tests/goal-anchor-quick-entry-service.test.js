const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_ANCHOR_QUICK_ENTRY_TYPES,
  buildGoalAnchorQuickEntryModel,
  upsertGoalAnchorQuickEntry,
} = require("../src/services/goal-anchor-quick-entry-service.js");

test("quick-entry model exposes bodyweight, waist, run, lift, and swim anchors for relevant goal tracking cards", () => {
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
        {
          summary: "Swim a faster mile",
          primaryDomain: "swimming_endurance_technique",
          trackedItems: [
            { key: "swim_benchmark_retest" },
            { key: "swim_access_reality" },
          ],
        },
      ],
    },
  });

  assert.deepEqual(anchors.map((anchor) => anchor.type), [
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.bodyweight,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.waist,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.liftBenchmark,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.swimBenchmark,
    GOAL_ANCHOR_QUICK_ENTRY_TYPES.swimAccessReality,
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

  const waistRow = manualProgressInputs.measurements.waist_circumference[0];
  const runRow = manualProgressInputs.benchmarks.run_results[0];
  const liftRow = manualProgressInputs.benchmarks.lift_results[0];

  assert.equal(waistRow.date, "2026-04-09");
  assert.equal(waistRow.value, 34.5);
  assert.equal(waistRow.note, "Saved from Metrics / Baselines");
  assert.equal(waistRow.source, "user_override");
  assert.equal(waistRow.provenance?.events?.[0]?.mutationType, "baseline_capture");

  assert.equal(runRow.date, "2026-04-10");
  assert.equal(runRow.distanceMiles, 4);
  assert.equal(runRow.durationMinutes, "31:20");
  assert.equal(runRow.paceText, "7:50");
  assert.equal(runRow.note, "Saved from Metrics / Baselines");
  assert.equal(runRow.source, "user_override");
  assert.equal(runRow.provenance?.events?.[0]?.details?.fieldId, "running_baseline");

  assert.equal(liftRow.date, "2026-04-11");
  assert.equal(liftRow.exercise, "Bench Press");
  assert.equal(liftRow.weight, 205);
  assert.equal(liftRow.reps, 3);
  assert.equal(liftRow.sets, 2);
  assert.equal(liftRow.note, "Saved from Metrics / Baselines");
  assert.equal(liftRow.source, "user_override");
  assert.equal(liftRow.provenance?.events?.[0]?.details?.fieldId, "current_strength_baseline");
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

  assert.equal(manualProgressInputs.benchmarks.run_results.length, 1);
  assert.equal(manualProgressInputs.benchmarks.run_results[0].date, "2026-04-10");
  assert.equal(manualProgressInputs.benchmarks.run_results[0].distanceMiles, 4);
  assert.equal(manualProgressInputs.benchmarks.run_results[0].durationMinutes, "31:20");
  assert.equal(manualProgressInputs.benchmarks.run_results[0].paceText, "7:50");
  assert.equal(manualProgressInputs.benchmarks.run_results[0].note, "Saved from Metrics / Baselines");
});

test("quick-entry upserts swim anchors into the shared manual-progress shape", () => {
  let manualProgressInputs = upsertGoalAnchorQuickEntry({
    manualProgressInputs: {},
    type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.swimBenchmark,
    entry: { date: "2026-04-12", distance: "1500", distanceUnit: "yd", duration: "29:40" },
  });
  manualProgressInputs = upsertGoalAnchorQuickEntry({
    manualProgressInputs,
    type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.swimAccessReality,
    entry: { date: "2026-04-12", value: "pool" },
  });

  const swimRow = manualProgressInputs.metrics.swim_benchmark[0];
  const swimRealityRow = manualProgressInputs.metrics.swim_access_reality[0];

  assert.equal(swimRow.date, "2026-04-12");
  assert.equal(swimRow.distance, 1500);
  assert.equal(swimRow.distanceUnit, "yd");
  assert.equal(swimRow.duration, "29:40");
  assert.equal(swimRow.provenance?.events?.[0]?.details?.fieldId, "recent_swim_anchor");

  assert.equal(swimRealityRow.date, "2026-04-12");
  assert.equal(swimRealityRow.value, "pool");
  assert.equal(swimRealityRow.label, "Pool only");
  assert.equal(swimRealityRow.provenance?.events?.[0]?.details?.fieldId, "swim_access_reality");
});
