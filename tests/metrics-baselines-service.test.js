const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeGoals } = require("../src/modules-planning.js");
const {
  buildMetricsBaselinesModel,
  buildPlanningBaselineInfluence,
  applyPlanningBaselineInfluence,
} = require("../src/services/metrics-baselines-service.js");

test("manual strength benchmark reduces missing-anchor count and sharpens strength dosing", () => {
  const goals = normalizeGoals([
    { id: "g1", name: "Bench 225", category: "strength", active: true, priority: 1 },
  ]);
  const withoutBenchmark = buildMetricsBaselinesModel({
    athleteProfile: { goals },
    personalization: {},
    logs: {},
    bodyweights: [],
  });
  const withBenchmark = buildMetricsBaselinesModel({
    athleteProfile: { goals },
    personalization: {
      manualProgressInputs: {
        measurements: {},
        benchmarks: {
          lift_results: [{ date: "2026-04-17", exercise: "Bench Press", weight: 225, reps: 1, sets: 1, source: "user_override" }],
        },
        metrics: {},
      },
    },
    logs: {},
    bodyweights: [],
  });

  assert.ok(withoutBenchmark.missingCards.some((card) => card.id === "lift_benchmark"));
  assert.ok(!withBenchmark.missingCards.some((card) => card.id === "lift_benchmark"));

  const influence = buildPlanningBaselineInfluence({
    goals,
    personalization: {
      manualProgressInputs: {
        measurements: {},
        benchmarks: {
          lift_results: [{ date: "2026-04-17", exercise: "Bench Press", weight: 225, reps: 1, sets: 1, source: "user_override" }],
        },
        metrics: {},
      },
    },
  });

  const overlay = applyPlanningBaselineInfluence({
    dayTemplates: {
      1: { type: "strength+prehab", label: "Full-Body Strength A" },
    },
    influence,
  });

  assert.match(overlay.dayTemplates[1].label || "", /Top-Set/i);
  assert.match(overlay.dayTemplates[1].strengthDose || "", /top set/i);
  assert.ok(overlay.summaryLines.some((line) => /anchoring strength dosing/i.test(line)));
});

test("manual running benchmark expands easy and long-run sizing beyond conservative defaults", () => {
  const goals = normalizeGoals([
    { id: "g1", name: "Run a stronger half marathon", category: "running", active: true, priority: 1, targetDate: "2026-10-10" },
  ]);
  const influence = buildPlanningBaselineInfluence({
    goals,
    personalization: {
      manualProgressInputs: {
        measurements: {},
        benchmarks: {
          run_results: [{ date: "2026-04-17", distanceMiles: 9, durationMinutes: "78", paceText: "8:40", source: "user_override" }],
        },
        metrics: {},
      },
    },
  });

  const overlay = applyPlanningBaselineInfluence({
    dayTemplates: {
      3: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "20-30 min" } },
      6: { type: "long-run", label: "Long Run", run: { t: "Long", d: "45-60 min" } },
    },
    influence,
  });

  assert.equal(overlay.dayTemplates[3].run.d, "35-45 min");
  assert.equal(overlay.dayTemplates[6].run.d, "60-80 min");
  assert.ok(overlay.summaryLines.some((line) => /anchoring run volume/i.test(line)));
});
