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

const buildResolvedGoal = ({
  summary,
  planningCategory,
  goalFamily = "",
  measurabilityTier = "fully_measurable",
  primaryMetric = null,
  proxyMetrics = [],
  targetDate = "",
  targetHorizonWeeks = null,
  tradeoffs = [],
  first30DaySuccessDefinition = "",
} = {}) => ({
  id: `resolved_${String(summary || planningCategory || "goal").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
  summary,
  goalFamily,
  planningCategory,
  measurabilityTier,
  primaryMetric,
  proxyMetrics,
  targetDate,
  targetHorizonWeeks,
  tradeoffs,
  first30DaySuccessDefinition,
  confidence: "medium",
  unresolvedGaps: [],
  reviewCadence: "weekly",
  refinementTrigger: "block_start_or_metric_stall",
});

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
  tradeoffs: goal.tradeoffs || [],
  resolvedGoal: goal.resolvedGoal || null,
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

const RUN_SESSION_TYPES = new Set(["run+strength", "easy-run", "hard-run", "long-run"]);

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
      {
        label: "event-prep + upper-body maintenance",
        goals: buildGoals([
          {
            name: "Half marathon in 1:45",
            category: "running",
            priority: 1,
            targetDate: "2026-05-10",
            resolvedGoal: buildResolvedGoal({
              summary: "Run a half marathon in 1:45:00",
              planningCategory: "running",
              goalFamily: "performance",
              measurabilityTier: "fully_measurable",
              primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: "1:45:00" },
              targetDate: "2026-05-10",
              targetHorizonWeeks: 5,
            }),
          },
          {
            name: "Maintain bench 225",
            category: "strength",
            priority: 2,
            resolvedGoal: buildResolvedGoal({
              summary: "Maintain bench 225",
              planningCategory: "strength",
              goalFamily: "strength",
              measurabilityTier: "fully_measurable",
              primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", kind: "primary", targetValue: "225" },
              targetHorizonWeeks: 5,
              tradeoffs: ["Lower-body lifting must stay subordinate to race prep."],
            }),
          },
        ]),
        personalization: {
          travelState: { access: "full gym" },
          userGoalProfile: { days_per_week: 5, session_length: "45" },
          profile: { estimatedFitnessLevel: "intermediate" },
        },
        momentum: { inconsistencyRisk: "low" },
        learningLayer: {},
        expectedArchitecture: "event_prep_upper_body_maintenance",
        expectedDominant: "running",
        expectedSecondary: "strength",
        expectedNutritionMode: "performance_support",
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

test("concurrent race, bench, and fat-loss goals expose an explicit no-max-everything contract", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Run a 1:45 half marathon",
        category: "running",
        priority: 1,
        targetDate: "2026-10-10",
      },
      {
        name: "Bench 225",
        category: "strength",
        priority: 2,
      },
      {
        name: "Lose 15 lb",
        category: "body_comp",
        priority: 3,
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: {
        travelState: { access: "full gym" },
        userGoalProfile: { days_per_week: 5, session_length: "45" },
        profile: { estimatedFitnessLevel: "intermediate" },
      },
      momentum: { inconsistencyRisk: "low" },
      learningLayer: {},
    });

    assert.equal(composer.architecture, "event_prep_upper_body_maintenance");
    assert.equal(
      composer.programBlock?.goalAllocation?.why,
      "Why: the app cannot honestly promise maximal bench progress, maximal race improvement, and maximal fat loss in the same block."
    );
    assert.deepEqual(composer.programBlock?.goalAllocation?.heldBack, [
      "Bench 225 stays in maintenance territory, not a maximal bench-progression push.",
      "Lose 15 lb stays moderate and recovery-compatible, not an aggressive cut.",
    ]);
    assert.match(
      composer.programBlock?.summary || "",
      /Held back: Bench 225 stays in maintenance territory, not a maximal bench-progression push\./i
    );
    assert.match(
      composer.programBlock?.summary || "",
      /Why: the app cannot honestly promise maximal bench progress, maximal race improvement, and maximal fat loss in the same block\./i
    );
    assert.equal(composer.blockIntent?.why, composer.programBlock?.goalAllocation?.why);
    assert.deepEqual(composer.blockIntent?.heldBack, composer.programBlock?.goalAllocation?.heldBack);
  });
});

test("ProgramBlock uses resolved goal structure to express horizon, proxies, and conflict-aware posture", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Lean out for summer",
        category: "body_comp",
        priority: 1,
        resolvedGoal: buildResolvedGoal({
          summary: "Get leaner within the current time window",
          planningCategory: "body_comp",
          goalFamily: "appearance",
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [
            { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
          ],
          targetHorizonWeeks: 8,
          tradeoffs: ["Aggressive fat loss may limit strength progression and recovery quality."],
        }),
        tradeoffs: ["Aggressive fat loss may limit strength progression and recovery quality."],
      },
      {
        name: "Keep strength numbers",
        category: "strength",
        priority: 2,
        resolvedGoal: buildResolvedGoal({
          summary: "Keep strength in the plan while another priority leads",
          planningCategory: "strength",
          goalFamily: "strength",
          measurabilityTier: "exploratory_fuzzy",
          proxyMetrics: [
            { key: "top_set_load", label: "Top set load", unit: "lb", kind: "proxy" },
          ],
          tradeoffs: ["Aggressive fat loss may limit strength progression and recovery quality."],
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: {
        travelState: { access: "full gym" },
        userGoalProfile: { days_per_week: 3, session_length: "30" },
        profile: { estimatedFitnessLevel: "intermediate" },
      },
      momentum: { inconsistencyRisk: "medium" },
      learningLayer: {},
    });

    assert.equal(composer.programBlock.goalStack.measurabilityTier, "proxy_measurable");
    assert.equal(composer.programBlock.goalStack.targetHorizonWeeks, 8);
    assert.ok(composer.programBlock.goalStack.proxyMetricLabels.includes("Waist circumference"));
    assert.ok(composer.programBlock.tradeoffs.some((item) => /fat loss may limit strength/i.test(item)));
    assert.equal(composer.programBlock.recoveryPosture.level, "protective");
    assert.equal(composer.programBlock.goalAllocation.prioritized, "Fat-loss momentum");
    assert.ok(composer.programBlock.goalAllocation.maintained.includes("Keep strength in the plan while another priority leads"));
    assert.equal(composer.programBlock.minimizedEmphasis.role, "minimized");
    assert.ok(composer.programBlock.successCriteria.some((item) => /Waist circumference/i.test(item)));
    assert.match(composer.programBlock.dominantEmphasis.objective, /8 week target horizon/i);
  });
});

test("WeeklyIntent carries maintained, minimized, and tradeoff posture for hybrid archetypes", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Half marathon in 1:45",
        category: "running",
        priority: 1,
        targetDate: "2026-05-10",
        resolvedGoal: buildResolvedGoal({
          summary: "Run a half marathon in 1:45:00",
          planningCategory: "running",
          goalFamily: "performance",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: "1:45:00" },
          targetDate: "2026-05-10",
          targetHorizonWeeks: 5,
        }),
      },
      {
        name: "Maintain bench 225",
        category: "strength",
        priority: 2,
        resolvedGoal: buildResolvedGoal({
          summary: "Maintain bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", kind: "primary", targetValue: "225" },
          targetHorizonWeeks: 5,
          tradeoffs: ["Lower-body lifting must stay subordinate to race prep."],
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: {
        travelState: { access: "full gym" },
        userGoalProfile: { days_per_week: 5, session_length: "45" },
        profile: { estimatedFitnessLevel: "intermediate" },
      },
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
      weeklyCheckin: { energy: 4, stress: 2, confidence: 4 },
      coachPlanAdjustments: {},
      failureMode: {},
      constraints: composer.constraints,
    });

    assert.equal(composer.architecture, "event_prep_upper_body_maintenance");
    assert.equal(planWeek.weeklyIntent.maintainedFocus, "Strength maintenance");
    assert.equal(planWeek.weeklyIntent.minimizedFocus, "non-primary volume");
    assert.match(planWeek.weeklyIntent.tradeoffFocus, /lower-body|race prep/i);
    assert.match(planWeek.weeklyIntent.successDefinition, /upper-body maintenance|maintenance exposures/i);
    assert.match(planWeek.weeklyIntent.rationale, /stays active with less emphasis/i);
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

test("pure strength goal maps to a strength-dominant block, week, and today plan", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Bench 225",
        category: "strength",
        priority: 1,
        resolvedGoal: buildResolvedGoal({
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", kind: "primary", targetValue: "225" },
          targetHorizonWeeks: 12,
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: { trainingContext: { environment: { value: "unknown", confirmed: false }, equipmentAccess: { value: "unknown", confirmed: false } } },
      momentum: { inconsistencyRisk: "low" },
      learningLayer: {},
      currentWeek: 1,
      baseWeek: WEEK_TEMPLATES[0],
    });
    const planWeek = buildPlanWeek({
      weekNumber: 1,
      template: WEEK_TEMPLATES[0],
      weekTemplates: WEEK_TEMPLATES,
      referenceTemplate: WEEK_TEMPLATES[0],
      goals,
      architecture: composer.architecture,
      programBlock: composer.programBlock,
      programContext: composer.programContext,
      blockIntent: composer.blockIntent,
      split: composer.split,
      sessionsByDay: composer.dayTemplates,
      weeklyCheckin: { energy: 4, stress: 2, confidence: 4 },
      coachPlanAdjustments: {},
      failureMode: {},
      constraints: composer.constraints,
    });
    const todayPlan = generateTodayPlan(
      {
        primaryGoalKey: "muscle_gain",
        experienceLevel: "intermediate",
        daysPerWeek: 4,
        sessionLength: "45",
        constraints: [],
      },
      { logs: {}, todayKey: "2026-04-09" },
      { fatigueScore: 2, trend: "stable", momentum: "stable", injuryLevel: "none" },
      {
        planWeek,
        programBlock: planWeek.programBlock,
        weeklyIntent: planWeek.weeklyIntent,
        plannedSession: planWeek.sessionsByDay[1],
      }
    );

    assert.equal(composer.architecture, "strength_dominant");
    assert.equal(composer.programBlock.dominantEmphasis.category, "strength");
    assert.equal(planWeek.weeklyIntent.focus, "Build pressing strength with repeatable full-body work");
    assert.doesNotMatch(planWeek.weeklyIntent.focus, /getting legs back/i);
    assert.match(planWeek.sessionsByDay[1].label, /full-body strength|bench focus/i);
    assert.ok(Object.values(planWeek.sessionsByDay).filter(Boolean).every((session) => !RUN_SESSION_TYPES.has(session.type)));
    assert.equal(todayPlan.label, planWeek.sessionsByDay[1].label);
  });
});

test("athletic-power goals stay usable inside ProgramBlock and WeeklyIntent generation", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Dunk a basketball",
        category: "strength",
        priority: 1,
        resolvedGoal: buildResolvedGoal({
          summary: "Dunk a basketball",
          planningCategory: "strength",
          goalFamily: "athletic_power",
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [
            { key: "vertical_jump_touchpoint", label: "Jump touch point", unit: "checkins", kind: "proxy" },
            { key: "lower_body_power_sessions", label: "Lower-body power sessions", unit: "sessions", kind: "proxy" },
          ],
          first30DaySuccessDefinition: "Complete 8 lower-body power sessions over the next 30 days and log one jump or rim-touch check each week.",
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: { trainingContext: { environment: { value: "gym", confirmed: true }, equipmentAccess: { value: "full_gym", confirmed: true } } },
      momentum: { inconsistencyRisk: "low" },
      learningLayer: {},
      currentWeek: 1,
      baseWeek: WEEK_TEMPLATES[0],
    });
    const planWeek = buildPlanWeek({
      weekNumber: 1,
      template: WEEK_TEMPLATES[0],
      weekTemplates: WEEK_TEMPLATES,
      referenceTemplate: WEEK_TEMPLATES[0],
      goals,
      architecture: composer.architecture,
      programBlock: composer.programBlock,
      programContext: composer.programContext,
      blockIntent: composer.blockIntent,
      split: composer.split,
      sessionsByDay: composer.dayTemplates,
      weeklyCheckin: { energy: 4, stress: 2, confidence: 4 },
      coachPlanAdjustments: {},
      failureMode: {},
      constraints: composer.constraints,
    });

    assert.equal(composer.architecture, "strength_dominant");
    assert.equal(composer.programBlock.dominantEmphasis.label, "Athletic-power progression");
    assert.match(planWeek.weeklyIntent.focus, /athletic power/i);
  });
});

test("pure race goal maps to a running-dominant block, week, and today plan", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Run a 1:45 half marathon",
        category: "running",
        priority: 1,
        targetDate: "2026-05-31",
        resolvedGoal: buildResolvedGoal({
          summary: "Run a half marathon in 1:45:00",
          planningCategory: "running",
          goalFamily: "performance",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: "1:45:00" },
          targetDate: "2026-05-31",
          targetHorizonWeeks: 8,
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: { travelState: { access: "full gym" } },
      momentum: { inconsistencyRisk: "low" },
      learningLayer: {},
      currentWeek: 1,
      baseWeek: WEEK_TEMPLATES[0],
    });
    const planWeek = buildPlanWeek({
      weekNumber: 1,
      template: WEEK_TEMPLATES[0],
      weekTemplates: WEEK_TEMPLATES,
      referenceTemplate: WEEK_TEMPLATES[0],
      goals,
      architecture: composer.architecture,
      programBlock: composer.programBlock,
      programContext: composer.programContext,
      blockIntent: composer.blockIntent,
      split: composer.split,
      sessionsByDay: composer.dayTemplates,
      weeklyCheckin: { energy: 4, stress: 2, confidence: 4 },
      coachPlanAdjustments: {},
      failureMode: {},
      constraints: composer.constraints,
    });
    const todayPlan = generateTodayPlan(
      {
        primaryGoalKey: "endurance",
        experienceLevel: "intermediate",
        daysPerWeek: 4,
        sessionLength: "45",
        constraints: [],
      },
      { logs: {}, todayKey: "2026-04-09" },
      { fatigueScore: 2, trend: "stable", momentum: "stable", injuryLevel: "none" },
      {
        planWeek,
        programBlock: planWeek.programBlock,
        weeklyIntent: planWeek.weeklyIntent,
        plannedSession: planWeek.sessionsByDay[1],
      }
    );

    assert.equal(composer.architecture, "race_prep_dominant");
    assert.equal(composer.programBlock.dominantEmphasis.category, "running");
    assert.equal(planWeek.weeklyIntent.focus, "Build half-marathon pace and endurance");
    assert.ok(Object.values(planWeek.sessionsByDay).filter(Boolean).some((session) => RUN_SESSION_TYPES.has(session.type)));
    assert.equal(todayPlan.label, planWeek.sessionsByDay[1].label);
  });
});

test("body-comp plus maintained strength maps to a non-race block and week", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Lose fat while keeping strength",
        category: "body_comp",
        priority: 1,
        resolvedGoal: buildResolvedGoal({
          summary: "Lose fat while keeping strength",
          planningCategory: "body_comp",
          goalFamily: "body_comp",
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [
            { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
          ],
          targetHorizonWeeks: 10,
        }),
      },
      {
        name: "Keep strength in the plan while another priority leads",
        category: "strength",
        priority: 2,
        resolvedGoal: buildResolvedGoal({
          summary: "Keep strength in the plan while another priority leads",
          planningCategory: "strength",
          goalFamily: "strength",
          measurabilityTier: "exploratory_fuzzy",
          proxyMetrics: [{ key: "top_set_load", label: "Top set load", unit: "lb", kind: "proxy" }],
          targetHorizonWeeks: 10,
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: { travelState: { access: "full gym" } },
      momentum: { inconsistencyRisk: "medium" },
      learningLayer: {},
      currentWeek: 1,
      baseWeek: WEEK_TEMPLATES[0],
    });
    const planWeek = buildPlanWeek({
      weekNumber: 1,
      template: WEEK_TEMPLATES[0],
      weekTemplates: WEEK_TEMPLATES,
      referenceTemplate: WEEK_TEMPLATES[0],
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

    assert.equal(composer.architecture, "body_comp_conditioning");
    assert.equal(composer.programBlock.dominantEmphasis.category, "body_comp");
    assert.equal(planWeek.weeklyIntent.focus, "Drive fat-loss momentum while protecting strength");
    assert.doesNotMatch(planWeek.weeklyIntent.focus, /getting legs back/i);
    assert.match(planWeek.sessionsByDay[1].label, /strength circuit|full-body|strength retention/i);
    assert.ok(Object.values(planWeek.sessionsByDay).filter(Boolean).every((session) => !RUN_SESSION_TYPES.has(session.type)));
  });
});

test("no-running-goal path does not inject default run sessions", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const goals = buildGoals([
      {
        name: "Bench 225",
        category: "strength",
        priority: 1,
        resolvedGoal: buildResolvedGoal({
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", kind: "primary", targetValue: "225" },
        }),
      },
      {
        name: "Keep abs visible",
        category: "body_comp",
        priority: 2,
        resolvedGoal: buildResolvedGoal({
          summary: "Keep abs visible",
          planningCategory: "body_comp",
          goalFamily: "appearance",
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [{ key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" }],
        }),
      },
    ]);

    const composer = buildComposer({
      goals,
      personalization: {},
      momentum: { inconsistencyRisk: "low" },
      learningLayer: {},
      currentWeek: 1,
      baseWeek: WEEK_TEMPLATES[0],
    });

    assert.ok(Object.values(composer.dayTemplates).filter(Boolean).every((session) => !RUN_SESSION_TYPES.has(session.type)));
    assert.equal(composer.split.run, 0);
  });
});
