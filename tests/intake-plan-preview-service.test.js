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

const buildTypedIntakePacket = (rawGoalText = "run a half marathon") => ({
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

const buildResolvedGoals = () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a half marathon",
    typedIntakePacket: buildTypedIntakePacket(),
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

test("preview model builds a two-week draft arc for a resolved running goal", () => {
  const preview = buildIntakePlanPreviewModel({
    orderedResolvedGoals: buildResolvedGoals(),
    answers: {
      goal_intent: "run a half marathon",
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
  assert.equal(preview.weeks.length, 2);
  assert.ok(preview.weeks[0].summary.length > 0);
  assert.ok(preview.weeks[0].cells.length >= 4);
  assert.ok(preview.weeks[1].headline.length > 0);
});
