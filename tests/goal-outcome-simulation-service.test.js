const test = require("node:test");
const assert = require("node:assert/strict");

const { composeGoalNativePlan } = require("../src/modules-planning.js");
const { resolveGoalTranslation } = require("../src/services/goal-resolution-service.js");
const { buildTrainingContextFromEditor } = require("../src/services/training-context-service.js");
const { runGoalOutcomeSimulation } = require("../src/services/goal-outcome-simulation-service.js");

const buildIntakePacket = ({
  rawGoalText,
} = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: rawGoalText,
      currentBaseline: "Intermediate hybrid trainee with 5 training days and gym access.",
    },
    scheduleReality: {
      trainingDaysPerWeek: 5,
      sessionLength: "45",
      trainingLocation: "Gym",
    },
    equipmentAccessContext: {
      trainingLocation: "Gym",
      equipment: ["Full gym"],
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints: [],
      appearanceConstraints: [],
      additionalContext: "Find the balance",
    },
  },
});

test("goal outcome simulation returns a stable artifact for the hybrid cut-plus-race-plus-bench stack", () => {
  const result = runGoalOutcomeSimulation();

  assert.equal(result.durationWeeks, 30);
  assert.equal(result.weeklySnapshots.length, 30);
  assert.match(result.intakeDiagnostics.resolvedGoals[0].summary, /half marathon|bench/i);
  assert.ok(result.issuesFound.some((issue) => /running benchmark/i.test(issue)));
  assert.ok(result.scoreCard.totalScore >= 0 && result.scoreCard.totalScore <= 100);
  assert.ok(result.finalState.armGrowthIndex >= 0 && result.finalState.armGrowthIndex <= 10);
});

test("composeGoalNativePlan no longer crashes when baseWeek is omitted", () => {
  const goals = [
    resolveGoalTranslation({
      rawUserGoalIntent: "Bench 225 x 3 x 6",
      typedIntakePacket: buildIntakePacket({ rawGoalText: "Bench 225 x 3 x 6" }),
      explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
      now: "2026-04-22",
    }).planningGoals[0],
    resolveGoalTranslation({
      rawUserGoalIntent: "Run a 1:45 half marathon",
      typedIntakePacket: buildIntakePacket({ rawGoalText: "Run a 1:45 half marathon" }),
      explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
      now: "2026-04-22",
    }).planningGoals[0],
  ];

  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    availableDays: ["mon", "tue", "thu", "fri", "sun"],
    time: "45",
    intensity: "Adaptive",
  });

  const result = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 5 },
      trainingContext,
      settings: { trainingPreferences: {} },
      canonicalAthlete: { userProfile: { daysPerWeek: 5 } },
    },
    currentWeek: 1,
    todayKey: "2026-04-22",
    currentDayOfWeek: 3,
    logs: {},
    dailyCheckins: {},
    plannedDayRecords: {},
    planWeekRecords: {},
  });

  assert.ok(result);
  assert.ok(result.dayTemplates);
  assert.ok(result.dayTemplates[1]);
  assert.ok(result.dayTemplates[4] || result.dayTemplates[5]);
});
