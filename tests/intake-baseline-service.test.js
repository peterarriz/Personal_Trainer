const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASELINE_METRIC_KEYS,
  buildManualProgressInputsFromIntake,
} = require("../src/services/intake-baseline-service.js");

test("intake baseline capture persists credible first-plan anchors with intake provenance", () => {
  const result = buildManualProgressInputsFromIntake({
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          current_bodyweight: { raw: "185 lb", value: 185 },
          current_waist: { raw: "34 in", value: 34 },
          current_strength_baseline: { raw: "185x5", value: 185, weight: 185, reps: 5 },
          recent_swim_anchor: { raw: "1000 yd in 22:30", value: "1000 yd in 22:30" },
          swim_access_reality: { raw: "open water", value: "open_water" },
          starting_capacity_anchor: { raw: "about 20 to 30 minutes", value: "20_to_30_minutes" },
        },
      },
    },
    resolvedGoals: [
      {
        planningCategory: "strength",
        summary: "Bench press 225 lb",
        primaryMetric: { label: "Bench press" },
      },
    ],
    manualProgressInputs: {},
    profile: {},
    todayKey: "2026-04-14",
    now: Date.parse("2026-04-14T12:00:00.000Z"),
  });

  const bodyweightRow = result.manualProgressInputs.measurements[BASELINE_METRIC_KEYS.bodyweightBaseline][0];
  const waistRow = result.manualProgressInputs.measurements.waist_circumference[0];
  const liftRow = result.manualProgressInputs.benchmarks.lift_results[0];
  const swimRow = result.manualProgressInputs.metrics[BASELINE_METRIC_KEYS.swimBenchmark][0];
  const swimRealityRow = result.manualProgressInputs.metrics[BASELINE_METRIC_KEYS.swimAccessReality][0];
  const startingCapacityRow = result.manualProgressInputs.metrics[BASELINE_METRIC_KEYS.startingCapacity][0];

  assert.equal(result.profilePatch.weight, 185);
  assert.equal(result.profilePatch.bodyweight, 185);
  assert.equal(bodyweightRow.value, 185);
  assert.equal(bodyweightRow.source, "intake_derived");
  assert.match(bodyweightRow.provenance?.summary || "", /intake baseline capture|current bodyweight/i);
  assert.equal(waistRow.value, 34);
  assert.equal(liftRow.exercise, "Bench press");
  assert.equal(liftRow.weight, 185);
  assert.equal(liftRow.reps, 5);
  assert.equal(swimRow.distance, 1000);
  assert.equal(swimRow.distanceUnit, "yd");
  assert.equal(swimRow.duration, "22:30");
  assert.equal(swimRealityRow.value, "open_water");
  assert.equal(swimRealityRow.label, "Open water");
  assert.equal(startingCapacityRow.value, "20_to_30_minutes");
  assert.equal(startingCapacityRow.label, "About 20 to 30 minutes");
  assert.deepEqual(result.capturedKeys.sort(), [
    BASELINE_METRIC_KEYS.bodyweightBaseline,
    BASELINE_METRIC_KEYS.startingCapacity,
    BASELINE_METRIC_KEYS.swimAccessReality,
    BASELINE_METRIC_KEYS.swimBenchmark,
    "lift_results",
    "waist_circumference",
  ].sort());
});

test("appearance proxy deferral does not invent baseline rows during intake capture", () => {
  const result = buildManualProgressInputsFromIntake({
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          appearance_proxy_plan: { raw: "skip_for_now", value: "skip_for_now" },
        },
      },
    },
    resolvedGoals: [],
    manualProgressInputs: {},
    profile: {},
    todayKey: "2026-04-14",
    now: Date.parse("2026-04-14T12:00:00.000Z"),
  });

  assert.deepEqual(result.manualProgressInputs, {
    measurements: {},
    metrics: {},
    benchmarks: {},
  });
  assert.deepEqual(result.profilePatch, {});
  assert.deepEqual(result.capturedKeys, []);
});
