const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  generateTodayPlan,
  normalizeGoals,
} = require("../src/modules-planning.js");
const {
  createEmptyTrainingContext,
  deriveTrainingContextFromPersonalization,
  buildTrainingContextFromAnswers,
} = require("../src/services/training-context-service.js");

const BASE_WEEK = {
  phase: "BASE",
  label: "Foundation",
  mon: { t: "Easy", d: "30 min" },
  thu: { t: "Tempo", d: "20 min" },
  fri: { t: "Easy", d: "25 min" },
  sat: { t: "Long", d: "40 min" },
  str: "A",
  nutri: "easyRun",
};

test("empty training context stays unknown instead of defaulting to a concrete setup", () => {
  const context = deriveTrainingContextFromPersonalization({ personalization: {} });

  assert.equal(context.environment.value, "unknown");
  assert.equal(context.environment.confirmed, false);
  assert.equal(context.equipmentAccess.value, "unknown");
  assert.equal(context.equipmentAccess.confirmed, false);
  assert.equal(context.sessionDuration.value, "unknown");
  assert.equal(context.sessionDuration.confirmed, false);
  assert.equal(context.intensityPosture.value, "unknown");
  assert.equal(context.intensityPosture.confirmed, false);
});

test("legacy onboarding preferences still derive a confirmed typed training context", () => {
  const context = deriveTrainingContextFromPersonalization({
    personalization: {
      profile: { onboardingComplete: true },
      userGoalProfile: {
        primary_goal: "fat_loss",
        experience_level: "intermediate",
        session_length: "45",
        equipment_access: ["Dumbbells", "Pull-up bar"],
      },
      settings: {
        trainingPreferences: {
          defaultEnvironment: "Home",
          intensityPreference: "Aggressive",
        },
      },
    },
  });

  assert.equal(context.environment.value, "home");
  assert.equal(context.environment.confirmed, true);
  assert.equal(context.equipmentAccess.confirmed, true);
  assert.equal(context.sessionDuration.value, "45");
  assert.equal(context.sessionDuration.confirmed, true);
  assert.equal(context.intensityPosture.value, "aggressive");
  assert.equal(context.intensityPosture.confirmed, true);
});

test("composeGoalNativePlan keeps unknown context neutral instead of adding home-equipment constraints", () => {
  const goals = normalizeGoals([
    { id: "goal_1", name: "Build strength", category: "strength", active: true, priority: 1 },
  ]);

  const composer = composeGoalNativePlan({
    goals,
    personalization: {
      trainingContext: createEmptyTrainingContext(),
    },
    momentum: { inconsistencyRisk: "low" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    weekTemplates: [BASE_WEEK],
  });

  assert.equal(composer.programContext.environmentKnown, false);
  assert.equal(composer.programContext.trainingContext.environment.value, "unknown");
  assert.ok(!composer.constraints.some((line) => /confirmed equipment setup|bench-specific progression constrained/i.test(line)));
});

test("generateTodayPlan uses confirmed training context and calls out unknown duration neutrally when missing", () => {
  const aggressiveContext = buildTrainingContextFromAnswers({
    answers: {
      training_location: "Home",
      home_equipment: ["Dumbbells"],
      session_length: "45",
      coaching_style: "Push me hard",
    },
  });

  const aggressivePlan = generateTodayPlan(
    {
      primaryGoalKey: "general_fitness",
      experienceLevel: "intermediate",
      daysPerWeek: 4,
      constraints: [],
      trainingContext: aggressiveContext,
    },
    {
      todayKey: "2026-04-09",
      logs: {
        "2026-04-06": { type: "easy run" },
      },
    },
    {
      fatigueScore: 2,
      trend: "stable",
      momentum: "stable",
      injuryLevel: "none",
    },
    {
      weeklyIntent: { aggressionLevel: "steady", recoveryBias: "moderate" },
    }
  );

  assert.equal(aggressivePlan.duration, 45);
  assert.equal(aggressivePlan.intensity, "high");
  assert.match(aggressivePlan.reason, /push when recovery supports it/i);

  const neutralPlan = generateTodayPlan(
    {
      primaryGoalKey: "general_fitness",
      experienceLevel: "intermediate",
      daysPerWeek: 4,
      constraints: [],
      trainingContext: createEmptyTrainingContext(),
    },
    {
      todayKey: "2026-04-09",
      logs: {
        "2026-04-06": { type: "easy run" },
      },
    },
    {
      fatigueScore: 2,
      trend: "stable",
      momentum: "stable",
      injuryLevel: "none",
    },
    {
      weeklyIntent: { aggressionLevel: "steady", recoveryBias: "moderate" },
    }
  );

  assert.match(neutralPlan.reason, /session duration is still unconfirmed/i);
});
