const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGoals,
  composeGoalNativePlan,
  buildPlanWeek,
  buildCanonicalPlanDay,
  generateTodayPlan,
} = require("../src/modules-planning.js");

const withMockedNow = async (isoString, run) => {
  const originalNow = Date.now;
  Date.now = () => new Date(isoString).getTime();
  try {
    await run();
  } finally {
    Date.now = originalNow;
  }
};

const WEEK_TEMPLATES = [
  {
    phase: "BASE",
    label: "Foundation",
    mon: { t: "Easy", d: "30 min" },
    thu: { t: "Tempo", d: "20 min" },
    fri: { t: "Easy", d: "25 min" },
    sat: { t: "Long", d: "40 min" },
    str: "A",
    nutri: "easyRun",
  },
  {
    phase: "BASE",
    label: "Foundation 2",
    mon: { t: "Easy", d: "35 min" },
    thu: { t: "Tempo", d: "24 min" },
    fri: { t: "Easy", d: "30 min" },
    sat: { t: "Long", d: "45 min" },
    str: "B",
    nutri: "easyRun",
  },
  {
    phase: "BUILDING",
    label: "Sharpen 1",
    mon: { t: "Easy", d: "35 min" },
    thu: { t: "Intervals", d: "5 x 3 min" },
    fri: { t: "Easy", d: "30 min" },
    sat: { t: "Long", d: "55 min" },
    str: "A",
    nutri: "hardRun",
  },
  {
    phase: "BUILDING",
    label: "Sharpen 2",
    mon: { t: "Easy", d: "40 min" },
    thu: { t: "Tempo", d: "30 min" },
    fri: { t: "Easy", d: "35 min" },
    sat: { t: "Long", d: "60 min" },
    str: "B",
    nutri: "hardRun",
  },
  {
    phase: "PEAK",
    label: "Peak 1",
    mon: { t: "Easy", d: "35 min" },
    thu: { t: "Tempo", d: "35 min" },
    fri: { t: "Easy", d: "30 min" },
    sat: { t: "Long", d: "65 min" },
    str: "A",
    nutri: "hardRun",
  },
];

const buildGoals = (goalDefs = []) => normalizeGoals(goalDefs.map((goal, index) => ({
  id: goal.id || `goal_${index + 1}`,
  name: goal.name,
  category: goal.category,
  active: goal.active !== false,
  priority: goal.priority || index + 1,
  horizon: goal.horizon || "season",
  targetDate: goal.targetDate || "",
  measurableTarget: goal.measurableTarget || goal.target || "",
  status: goal.status || "active",
})));

const buildComposer = ({
  goals,
  personalization = {},
  momentum = {},
  learningLayer = {},
  currentWeek = 4,
  baseWeek = WEEK_TEMPLATES[currentWeek - 1],
} = {}) => composeGoalNativePlan({
  goals,
  personalization,
  momentum,
  learningLayer,
  currentWeek,
  baseWeek,
  weekTemplates: WEEK_TEMPLATES,
});

test("ProgramBlock captures the main hybrid planning modes without creating separate planners", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const scenarios = [
      {
        label: "run-dominant + strength-maintenance",
        goals: buildGoals([
          { name: "Sub-1:50 half marathon", category: "running", priority: 1, targetDate: "2026-05-31" },
          { name: "Keep two strength touches", category: "strength", priority: 2 },
        ]),
        personalization: { travelState: { access: "full gym" } },
        momentum: { inconsistencyRisk: "low" },
        learningLayer: {},
        expectedArchitecture: "race_prep_dominant",
        expectedDominant: "running",
        expectedSecondary: "strength",
        expectedNutritionMode: "performance_support",
      },
      {
        label: "body-comp + strength-retention",
        goals: buildGoals([
          { name: "Cut to 12% body fat", category: "body_comp", priority: 1 },
          { name: "Keep strength numbers", category: "strength", priority: 2 },
        ]),
        personalization: { travelState: { access: "full gym" } },
        momentum: { inconsistencyRisk: "medium" },
        learningLayer: {},
        expectedArchitecture: "body_comp_conditioning",
        expectedDominant: "body_comp",
        expectedSecondary: "strength",
        expectedNutritionMode: "deficit_support",
      },
      {
        label: "strength-dominant + conditioning-maintenance",
        goals: buildGoals([
          { name: "Push press progression", category: "strength", priority: 1 },
          { name: "Keep aerobic base", category: "running", priority: 2 },
        ]),
        personalization: { travelState: { access: "full gym" } },
        momentum: { inconsistencyRisk: "low" },
        learningLayer: {},
        expectedArchitecture: "strength_dominant",
        expectedDominant: "strength",
        expectedSecondary: "running",
        expectedNutritionMode: "strength_support",
      },
      {
        label: "balanced hybrid rebuild",
        goals: buildGoals([
          { name: "Return to regular training", category: "running", priority: 1 },
          { name: "Keep lifting habit alive", category: "strength", priority: 2 },
        ]),
        personalization: { travelState: { access: "home" } },
        momentum: { inconsistencyRisk: "high" },
        learningLayer: { adjustmentBias: "simplify" },
        expectedArchitecture: "maintenance_rebuild",
        expectedDominant: "hybrid",
        expectedSecondary: "running",
        expectedNutritionMode: "consistency_support",
      },
    ];

    scenarios.forEach((scenario) => {
      const composer = buildComposer({
        goals: scenario.goals,
        personalization: scenario.personalization,
        momentum: scenario.momentum,
        learningLayer: scenario.learningLayer,
      });

      assert.equal(composer.architecture, scenario.expectedArchitecture, scenario.label);
      assert.ok(composer.programBlock, `${scenario.label} should define a program block`);
      assert.equal(composer.programBlock.dominantEmphasis.category, scenario.expectedDominant, scenario.label);
      assert.equal(composer.programBlock.secondaryEmphasis.category, scenario.expectedSecondary, scenario.label);
      assert.equal(composer.programBlock.nutritionPosture.mode, scenario.expectedNutritionMode, scenario.label);
      assert.ok(Array.isArray(composer.programBlock.successCriteria) && composer.programBlock.successCriteria.length > 0, `${scenario.label} should define success criteria`);
      assert.ok(Array.isArray(composer.programBlock.tradeoffs) && composer.programBlock.tradeoffs.length > 0, `${scenario.label} should define tradeoffs`);
      assert.equal(composer.blockIntent.prioritized, composer.programBlock.goalAllocation.prioritized, `${scenario.label} compatibility intent should come from ProgramBlock`);
    });
  });
});

test("ProgramBlock flows through WeeklyIntent, PlanWeek, and PlanDay as one hierarchy", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      { name: "Sub-1:50 half marathon", category: "running", priority: 1, targetDate: "2026-05-31" },
      { name: "Keep two strength touches", category: "strength", priority: 2 },
    ]);
    const composer = buildComposer({
      goals,
      personalization: { travelState: { access: "full gym" } },
      momentum: { inconsistencyRisk: "low" },
      learningLayer: {},
    });

    const planWeek = buildPlanWeek({
      weekNumber: 4,
      template: WEEK_TEMPLATES[3],
      weekTemplates: WEEK_TEMPLATES,
      referenceTemplate: WEEK_TEMPLATES[3],
      goals,
      architecture: composer.architecture,
      programBlock: composer.programBlock,
      programContext: composer.programContext,
      blockIntent: composer.blockIntent,
      split: composer.split,
      sessionsByDay: composer.dayTemplates,
      weeklyCheckin: { energy: 3, stress: 2, confidence: 4 },
      coachPlanAdjustments: {},
      failureMode: {},
      constraints: composer.constraints,
    });

    assert.equal(planWeek.programBlock.id, composer.programBlock.id);
    assert.equal(planWeek.weeklyIntent.programBlockId, composer.programBlock.id);
    assert.equal(planWeek.programBlock.window.startWeek, 3);
    assert.equal(planWeek.programBlock.window.endWeek, 4);
    assert.equal(planWeek.blockIntent.prioritized, composer.programBlock.goalAllocation.prioritized);

    const planDay = buildCanonicalPlanDay({
      dateKey: "2026-04-09",
      dayOfWeek: 4,
      currentWeek: 4,
      baseWeek: WEEK_TEMPLATES[3],
      basePlannedDay: planWeek.sessionsByDay[4],
      resolvedDay: planWeek.sessionsByDay[4],
      todayPlan: {
        type: "cardio",
        label: planWeek.sessionsByDay[4].label,
        duration: 40,
        intensity: "moderate",
        reason: "Program block test",
      },
      context: {
        architecture: planWeek.architecture,
        programBlock: planWeek.programBlock,
        blockIntent: planWeek.blockIntent,
        weeklyIntent: planWeek.weeklyIntent,
        planWeek,
      },
      adjustments: {},
      nutrition: {},
      logging: {},
    });

    assert.equal(planDay.week.programBlock.id, planWeek.programBlock.id);
    assert.equal(planDay.week.blockIntent.prioritized, planWeek.blockIntent.prioritized);
    assert.equal(planDay.week.successDefinition, planWeek.weeklyIntent.successDefinition);
  });
});

test("Today planning respects a protective ProgramBlock posture through the existing planning hierarchy", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      { name: "Return to regular training", category: "running", priority: 1 },
      { name: "Keep lifting habit alive", category: "strength", priority: 2 },
    ]);
    const composer = buildComposer({
      goals,
      personalization: { travelState: { access: "home" } },
      momentum: { inconsistencyRisk: "high" },
      learningLayer: { adjustmentBias: "simplify" },
    });

    const planWeek = buildPlanWeek({
      weekNumber: 4,
      template: WEEK_TEMPLATES[3],
      weekTemplates: WEEK_TEMPLATES,
      referenceTemplate: WEEK_TEMPLATES[3],
      goals,
      architecture: composer.architecture,
      programBlock: composer.programBlock,
      programContext: composer.programContext,
      blockIntent: composer.blockIntent,
      split: composer.split,
      sessionsByDay: composer.dayTemplates,
      weeklyCheckin: { energy: 3, stress: 2, confidence: 3 },
      coachPlanAdjustments: {},
      failureMode: {},
      constraints: composer.constraints,
    });

    assert.equal(planWeek.programBlock.recoveryPosture.level, "protective");

    const todayPlan = generateTodayPlan(
      {
        primaryGoalKey: "endurance",
        experienceLevel: "intermediate",
        daysPerWeek: 4,
        sessionLength: "45",
        constraints: [],
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
        planWeek,
        programBlock: planWeek.programBlock,
        weeklyIntent: planWeek.weeklyIntent,
        plannedSession: planWeek.sessionsByDay[3],
      }
    );

    assert.equal(todayPlan.intensity, "low");
    assert.equal(todayPlan.label, planWeek.sessionsByDay[3].label);
  });
});
