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

test("missing benchmarks do not emit reader-facing still-missing baseline sentences", () => {
  const goals = normalizeGoals([
    { id: "g1", name: "Bench 225", category: "strength", active: true, priority: 1 },
  ]);

  const influence = buildPlanningBaselineInfluence({
    goals,
    personalization: {},
    logs: {},
    bodyweights: [],
  });

  const overlay = applyPlanningBaselineInfluence({
    dayTemplates: {
      1: { type: "strength+prehab", label: "Full-Body Strength A" },
    },
    influence,
  });

  assert.deepEqual(influence.lowConfidenceMessages, [
    "Strength work is staying technique-first until you add a recent lift anchor.",
  ]);
  assert.ok(!overlay.summaryLines.some((line) => /still missing/i.test(line)));
});

test("swim goals surface swim anchor and water reality as required-now baselines", () => {
  const model = buildMetricsBaselinesModel({
    athleteProfile: {
      goals: [
        {
          id: "g_swim",
          name: "Swim a mile in open water",
          category: "endurance",
          active: true,
          priority: 1,
          resolvedGoal: {
            summary: "Swim a mile in open water",
            planningCategory: "performance",
            goalFamily: "performance",
          },
        },
      ],
    },
    personalization: {},
    logs: {},
    bodyweights: [],
  });

  const swimBenchmarkCard = model.cards.find((card) => card.id === "swim_benchmark");
  const swimRealityCard = model.cards.find((card) => card.id === "swim_access_reality");

  assert.equal(swimBenchmarkCard?.requiredNow, true);
  assert.equal(swimRealityCard?.requiredNow, true);
  assert.equal(swimBenchmarkCard?.missing, true);
  assert.equal(swimRealityCard?.missing, true);
  assert.match(swimRealityCard?.whyItMatters || "", /open-water reality/i);
});

test("re-entry baselines stay honest when safe starting capacity is still missing", () => {
  const goals = [
    {
      id: "g_reentry",
      name: "Get back in shape",
      category: "general_fitness",
      active: true,
      priority: 1,
      resolvedGoal: {
        summary: "Get back into consistent training shape",
        goalFamily: "re_entry",
      },
    },
  ];
  const influence = buildPlanningBaselineInfluence({
    goals,
    personalization: {},
    logs: {},
    bodyweights: [],
  });

  assert.equal(influence.safeStart.level, "");
  assert.ok(influence.lowConfidenceMessages.some((line) => /shorter and more cautious/i.test(line)));
});

test("saved safe starting capacity and swim reality become visible planning anchors", () => {
  const goals = [
    {
      id: "g_combo",
      name: "Swim back into shape",
      category: "general_fitness",
      active: true,
      priority: 1,
      resolvedGoal: {
        summary: "Swim back into shape",
        goalFamily: "re_entry",
      },
    },
  ];
  const personalization = {
    manualProgressInputs: {
      measurements: {},
      benchmarks: {},
      metrics: {
        swim_benchmark: [{ date: "2026-04-14", distance: 1000, distanceUnit: "yd", duration: "22:30", source: "intake_derived" }],
        swim_access_reality: [{ date: "2026-04-14", value: "pool", label: "Pool only", source: "intake_derived" }],
        starting_capacity: [{ date: "2026-04-14", value: "20_to_30_minutes", label: "About 20 to 30 minutes", source: "user_override" }],
      },
    },
  };

  const model = buildMetricsBaselinesModel({
    athleteProfile: { goals },
    personalization,
    logs: {},
    bodyweights: [],
  });
  const influence = buildPlanningBaselineInfluence({
    goals,
    personalization,
    logs: {},
    bodyweights: [],
  });

  assert.match(model.cards.find((card) => card.id === "swim_access_reality")?.provenanceSummary || "", /captured during intake|saved/i);
  assert.ok(influence.summaryLines.some((line) => /Pool only is shaping swim structure/i.test(line)));
  assert.ok(influence.summaryLines.some((line) => /About 20 to 30 minutes is shaping the starting block/i.test(line)));
});
