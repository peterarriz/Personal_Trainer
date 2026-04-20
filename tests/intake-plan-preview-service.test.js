const test = require("node:test");
const assert = require("node:assert/strict");

const { buildIntakePlanPreviewModel } = require("../src/services/intake-plan-preview-service.js");
const { resolveGoalTranslation } = require("../src/services/goal-resolution-service.js");

const TEST_NOW = new Date("2026-04-19T12:00:00.000Z");

const WEEK_TEMPLATES = [
  {
    phase: "Base",
    mon: { t: "Easy run", d: "30 min" },
    thu: { t: "Tempo run", d: "20 min" },
    sat: { t: "Long run", d: "6 miles" },
    str: "Upper",
  },
  {
    phase: "Build",
    mon: { t: "Easy run", d: "35 min" },
    thu: { t: "Threshold run", d: "25 min" },
    sat: { t: "Long run", d: "7 miles" },
    str: "Upper",
  },
];

const buildTypedIntakePacket = (rawGoalText = "run a 1:45 half marathon") => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "Half marathon",
      currentBaseline: "Intermediate training background; 4 training days per week available",
      experienceLevel: "intermediate",
    },
    scheduleReality: {
      trainingDaysPerWeek: 4,
      sessionLength: "45 min",
      trainingLocation: "Gym",
    },
    equipmentAccessContext: {
      trainingLocation: "Gym",
      equipment: ["Dumbbells"],
    },
    injuryConstraintContext: {
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints: ["October"],
      appearanceConstraints: [],
      additionalContext: "Balanced coaching",
    },
    goalCompletenessContext: {},
  },
});

const buildResolvedGoals = (rawGoalText = "run a 1:45 half marathon") => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildTypedIntakePacket(rawGoalText),
    explicitUserConfirmation: {
      confirmed: false,
      acceptedProposal: true,
      source: "test_preview",
    },
    now: TEST_NOW,
  });
  return Array.isArray(result?.resolvedGoals) ? result.resolvedGoals : [];
};

test("preview model returns a placeholder before any resolved goal exists", () => {
  const preview = buildIntakePlanPreviewModel({
    orderedResolvedGoals: [],
    answers: {},
    weekTemplates: WEEK_TEMPLATES,
    baseWeek: WEEK_TEMPLATES[0],
    profileDefaults: {
      age: 32,
      weight: 180,
      startDate: "2026-04-19",
    },
    todayKey: "2026-04-19",
  });

  assert.equal(preview.isReady, false);
  assert.match(preview.placeholderLine, /goal path|plan shape/i);
});

test("preview model builds a week-one draft preview for a resolved running goal", () => {
  const preview = buildIntakePlanPreviewModel({
    orderedResolvedGoals: buildResolvedGoals(),
    answers: {
      goal_intent: "run a 1:45 half marathon",
      experience_level: "intermediate",
      training_days: "4",
      session_length: "45",
      training_location: "Gym",
      coaching_style: "Balanced coaching",
    },
    personalization: {},
    goalSlots: [],
    weekTemplates: WEEK_TEMPLATES,
    baseWeek: WEEK_TEMPLATES[0],
    profileDefaults: {
      age: 32,
      weight: 180,
      startDate: "2026-04-19",
    },
    todayKey: "2026-04-19",
    dayOfWeek: 1,
  });

  assert.equal(preview.isReady, true);
  assert.ok(preview.heading.length > 0);
  assert.ok(preview.trajectoryLine.length > 0);
  assert.equal(preview.weeks.length, 1);
  assert.equal(preview.arcDisclosure?.isReady, true);
  assert.equal(preview.arcDisclosure?.defaultExpanded, false);
  assert.equal(preview.arcDisclosure?.userMode, "exact_metric");
  assert.ok((preview.arcDisclosure?.phaseBlocks || []).length > 0);
  assert.ok(preview.weeks[0].summary.length > 0);
  assert.ok(preview.weeks[0].cells.length >= 4);
  assert.match(preview.weeks[0].label, /week 1/i);
});

test("preview arc shifts into direction-first language for fuzzy-goal users", () => {
  const fuzzyGoals = buildResolvedGoals("look leaner and move better").map((goal) => ({
    ...goal,
    resolvedGoal: {
      ...(goal?.resolvedGoal || {}),
      measurabilityTier: "exploratory_fuzzy",
    },
  }));

  const preview = buildIntakePlanPreviewModel({
    orderedResolvedGoals: fuzzyGoals,
    answers: {
      goal_intent: "look leaner and move better",
      experience_level: "intermediate",
      training_days: "4",
      session_length: "45",
      training_location: "Gym",
      coaching_style: "Balanced coaching",
    },
    personalization: {},
    goalSlots: [],
    weekTemplates: WEEK_TEMPLATES,
    baseWeek: WEEK_TEMPLATES[0],
    profileDefaults: {
      age: 32,
      weight: 180,
      startDate: "2026-04-19",
    },
    todayKey: "2026-04-19",
    dayOfWeek: 1,
  });

  assert.equal(preview.isReady, true);
  assert.equal(preview.arcDisclosure?.userMode, "fuzzy_goal");
  assert.match(preview.arcDisclosure?.supporting || "", /direction/i);
  assert.match(preview.arcDisclosure?.gateLine || "", /repeatable weeks|clearer anchor|proxy/i);
});
