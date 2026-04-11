const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_MEASURABILITY_TIERS,
  resolveGoalTranslation,
  applyResolvedGoalsToGoalSlots,
} = require("../src/services/goal-resolution-service.js");
const {
  normalizeGoals,
} = require("../src/services/canonical-athlete-service.js");

const DEFAULT_GOAL_SLOTS = [
  { id: "g_primary", name: "Primary goal", type: "ongoing", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "progress_tracker" } },
  { id: "g_secondary_1", name: "Secondary goal 1", type: "ongoing", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "weekly_checkin", unit: "lb" } },
  { id: "g_secondary_2", name: "Secondary goal 2", type: "ongoing", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "logged_lifts", unit: "lb" } },
  { id: "g_resilience", name: "Resilience", type: "ongoing", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true, tracking: { mode: "progress_tracker" } },
];

const buildIntakePacket = ({
  rawGoalText,
  timingConstraints = [],
  appearanceConstraints = [],
} = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background; 4 training days per week available",
    },
    scheduleReality: {
      trainingDaysPerWeek: 4,
      sessionLength: "45 min",
      trainingLocation: "Both",
    },
    equipmentAccessContext: {
      trainingLocation: "Both",
      equipment: ["Dumbbells", "Pull-up bar"],
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints,
      appearanceConstraints,
      additionalContext: "Find the balance",
    },
  },
});

test("resolves a fully measurable running goal into a canonical running planning object", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.fullyMeasurable);
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "half_marathon_time");
  assert.equal(result.resolvedGoals[0].primaryMetric.targetValue, "1:45:00");
  assert.equal(result.planningGoals[0].category, "running");
  assert.match(result.planningGoals[0].measurableTarget, /Half marathon time 1:45:00/i);
});

test("marathon goals resolve to running/event interpretation instead of generic hybrid phrasing", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "I want to run a marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "I want to run a marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a marathon");
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => /run frequency|long run|quality session/i.test(metric.label)));
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid/i);
});

test("half-marathon goals keep a specific event summary instead of generic running wording", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "I want to run a half marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "I want to run a half marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon");
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid|aerobic base/i);
});

test("pure running goals do not become hybrid even if provider interpretation drifts", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" }),
    aiInterpretationProposal: {
      interpretedGoalType: "hybrid",
      measurabilityTier: "exploratory_fuzzy",
      coachSummary: "Build aerobic base for hybrid training",
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid/i);
});

test("measurable event goals infer a usable horizon from season language", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon this fall",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 1:45 half marathon this fall",
      timingConstraints: ["fall"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "half_marathon_time");
  assert.ok(Number.isFinite(result.resolvedGoals[0].targetHorizonWeeks));
  assert.ok(result.resolvedGoals[0].targetHorizonWeeks >= 1);
  assert.ok(!result.unresolvedGaps.some((gap) => /target race date or horizon/i.test(gap)));
});

test("resolves a fully measurable strength goal into logged-lift planning input", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench 225",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench 225" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "strength");
  assert.equal(result.resolvedGoals[0].planningCategory, "strength");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.fullyMeasurable);
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "bench_press_weight");
  assert.equal(result.planningGoals[0].tracking.mode, "logged_lifts");
  assert.match(result.planningGoals[0].measurableTarget, /225 lb/i);
});

test("strength goal parsing preserves four-digit lift targets for downstream realism checks", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench press 2200 lbs",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench press 2200 lbs" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].primaryMetric.key, "bench_press_weight");
  assert.equal(result.resolvedGoals[0].primaryMetric.targetValue, "2200");
  assert.match(result.planningGoals[0].measurableTarget, /2200 lb/i);
});

test("appearance goals stay proxy-measurable and use a time horizon when timing is approximate", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "have six pack by August",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "have six pack by August",
      timingConstraints: ["August"],
      appearanceConstraints: ["six pack"],
    }),
    aiInterpretationProposal: {
      interpretedGoalType: "appearance",
      measurabilityTier: "proxy_measurable",
      suggestedMetrics: [
        { key: "waist", label: "Waist circumference", unit: "in", kind: "proxy" },
      ],
      timelineRealism: { status: "aggressive", summary: "Possible if the deficit is controlled.", suggestedHorizonWeeks: 16 },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals[0].goalFamily, "appearance");
  assert.equal(result.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(result.resolvedGoals[0].targetDate, "");
  assert.equal(result.resolvedGoals[0].targetHorizonWeeks, 16);
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => metric.key === "waist"));
  assert.ok(result.unresolvedGaps.some((gap) => /approximate/i.test(gap)));
});

test("lean-for-summer goals preserve raw intent and resolve into proxy-tracked body-comp planning input", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "get lean for summer",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "get lean for summer",
      timingConstraints: ["summer"],
      appearanceConstraints: ["leaner"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  assert.equal(result.rawIntent, "get lean for summer");
  assert.equal(result.resolvedGoals[0].rawIntent.text, "get lean for summer");
  assert.equal(result.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(result.resolvedGoals[0].summary, "Get leaner within the current time window");
  assert.equal(result.resolvedGoals[0].targetDate, "");
  assert.ok(Number.isFinite(result.resolvedGoals[0].targetHorizonWeeks));
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => metric.key === "waist_circumference"));
});

test("hybrid athlete goals become two exploratory planning goals with a first 30-day success definition", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "be a hybrid athlete",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "be a hybrid athlete" }),
    aiInterpretationProposal: {
      interpretedGoalType: "hybrid",
      measurabilityTier: "exploratory_fuzzy",
      suggestedMetrics: [
        { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
        { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions", kind: "proxy" },
      ],
      timelineRealism: { status: "unclear", summary: "Start with a 30-day structure first.", suggestedHorizonWeeks: 4 },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.deepEqual(result.planningGoals.map((goal) => goal.category), ["running", "strength"]);
  assert.ok(result.resolvedGoals.every((goal) => goal.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy));
  assert.match(result.resolvedGoals[0].first30DaySuccessDefinition, /8 aerobic sessions/i);
  assert.ok(result.unresolvedGaps.some((gap) => /balance between endurance and strength/i.test(gap)));
});

test("re-entry goals stay exploratory and become 30-day success definitions instead of fake precise targets", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "get back in shape",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "get back in shape" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "re_entry");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.exploratoryFuzzy);
  assert.equal(result.resolvedGoals[0].primaryMetric, null);
  assert.equal(result.resolvedGoals[0].confidence, "low");
  assert.match(result.resolvedGoals[0].first30DaySuccessDefinition, /30 days/i);
  assert.equal(result.planningGoals[0].measurableTarget, result.resolvedGoals[0].first30DaySuccessDefinition);
  assert.ok(result.unresolvedGaps.some((gap) => /stronger metrics/i.test(gap)));
});

test("mixed lose-fat-but-keep-strength intent resolves into body-comp plus strength-maintenance goals with tradeoffs", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat but keep strength",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "lose fat but keep strength" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.deepEqual(result.planningGoals.map((goal) => goal.category), ["body_comp", "strength"]);
  assert.equal(result.resolvedGoals[0].summary, "Lose fat while keeping strength");
  assert.equal(result.resolvedGoals[1].summary, "Keep strength while the primary goal leads");
  assert.ok(result.tradeoffs.some((item) => /fat loss may limit strength/i.test(item)));
  assert.equal(result.planningGoals[1].tracking.mode, "logged_lifts");
});

test("running plus maintained strength stays run-led and event-specific when explicitly expressed", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon but keep strength",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon but keep strength" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.equal(result.resolvedGoals[1].goalFamily, "strength");
  assert.equal(result.resolvedGoals[1].summary, "Keep strength while the primary goal leads");
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid/i);
});

test("resolved goals populate canonical goal slots so planner-facing normalization reads resolved objects", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "look athletic again",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "look athletic again",
      appearanceConstraints: ["look athletic again"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  const slottedGoals = applyResolvedGoalsToGoalSlots({
    resolvedGoals: resolution.resolvedGoals,
    goalSlots: DEFAULT_GOAL_SLOTS,
  });
  const normalized = normalizeGoals(slottedGoals);

  assert.equal(normalized[0].category, "body_comp");
  assert.equal(normalized[0].resolvedGoal.summary, resolution.resolvedGoals[0].summary);
  assert.match(normalized[0].measurableTarget, /Waist circumference|30 days/i);
  assert.equal(normalized[3].category, "injury_prevention");
  assert.equal(normalized[3].active, true);
});
