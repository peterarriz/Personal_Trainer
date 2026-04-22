const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveAdaptiveNutrition,
  deriveRealWorldNutritionEngine,
} = require("../src/modules-nutrition.js");

const buildAdaptiveArgs = (goals) => ({
  todayWorkout: {
    type: "hard-run",
    label: "Tempo Run",
    week: { phase: "BUILDING", cutback: false },
  },
  goals,
  momentum: {
    inconsistencyRisk: "low",
    momentumState: "steady",
  },
  personalization: {
    environmentConfig: { schedule: [] },
    travelState: {
      environmentMode: "home",
      isTravelWeek: false,
    },
  },
  bodyweights: [{ w: 190 }, { w: 189.8 }],
  learningLayer: { stats: {} },
  nutritionActualLogs: {},
  legacyNutritionFeedback: {},
  coachPlanAdjustments: {},
  salvageLayer: { active: false },
  failureMode: { hardeningMode: false },
});

const buildGoalContext = (goals) => {
  const active = goals.filter((goal) => goal.active);
  const primary = [...active].sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0] || null;
  return {
    primary,
    secondary: active.filter((goal) => goal !== primary),
    active,
  };
};

test("adaptive nutrition changes targets when goal priority changes and still preserves secondary support", () => {
  const runningFirst = deriveAdaptiveNutrition(buildAdaptiveArgs([
    { name: "10k PR", category: "running", active: true, priority: 1 },
    { name: "Summer cut", category: "body_comp", active: true, priority: 2 },
  ]));
  const bodyCompFirst = deriveAdaptiveNutrition(buildAdaptiveArgs([
    { name: "Summer cut", category: "body_comp", active: true, priority: 1 },
    { name: "10k PR", category: "running", active: true, priority: 2 },
  ]));

  assert.ok(runningFirst.targets.c > bodyCompFirst.targets.c);
  assert.ok(bodyCompFirst.targets.cal < runningFirst.targets.cal);
  assert.ok(runningFirst.adjustmentReasons.includes("running priority protects carbs on harder sessions"));
  assert.ok(bodyCompFirst.adjustmentReasons.includes("fat-loss bias keeps protein high"));
  assert.notEqual(runningFirst.targetChangeSummary, bodyCompFirst.targetChangeSummary);
});

test("real-world nutrition engine surfaces saved anchors, travel swaps, and goal-biased meal notes", () => {
  const baseArgs = {
    location: "Chicago",
    dateKey: "2026-04-20",
    dayType: "run_quality",
    nutritionLayer: {
      dayType: "run_quality",
      workoutType: "tempo",
      workoutLabel: "Track repeats",
      simplified: false,
    },
    momentum: { logGapDays: 0 },
    favorites: {
      mealAnchors: {
        breakfast: "Overnight oats + whey",
        lunch: "Chicken rice bowl",
        travelFallback: "Airport eggs + fruit + protein shake",
        emergencyOrder: "Chipotle double chicken bowl",
      },
      safeMeals: [{ name: "Chicken bowl", meal: "Chicken rice bowl" }],
      restaurants: [],
      groceries: [],
    },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "morning",
    loggedIntake: {
      status: "off_track",
      issue: "hunger",
      note: "missed protein at breakfast",
      hydrationOz: 20,
    },
  };
  const runningEngine = deriveRealWorldNutritionEngine({
    ...baseArgs,
    goalContext: {
      primary: { name: "10k PR", category: "running" },
      secondary: [],
      active: [{ name: "10k PR", category: "running" }],
    },
  });
  const bodyCompEngine = deriveRealWorldNutritionEngine({
    ...baseArgs,
    goalContext: {
      primary: { name: "Summer cut", category: "body_comp" },
      secondary: [],
      active: [{ name: "Summer cut", category: "body_comp" }],
    },
  });

  const breakfastSlot = runningEngine.mealSlots.find((slot) => slot.key === "breakfast");
  const lunchSlot = runningEngine.mealSlots.find((slot) => slot.key === "lunch");
  const runningBreakfastNote = runningEngine.mealSlots.find((slot) => slot.key === "breakfast")?.note;
  const bodyCompBreakfastNote = bodyCompEngine.mealSlots.find((slot) => slot.key === "breakfast")?.note;

  assert.equal(runningEngine.mealSlots.length, 4);
  assert.equal(runningEngine.executionPlan.sections.length, 4);
  assert.equal(breakfastSlot.savedAnchor, true);
  assert.match(breakfastSlot.primary, /Overnight oats \+ whey/i);
  assert.match(lunchSlot.primary, /Chicken rice bowl/i);
  assert.match(lunchSlot.travelSwap, /Airport eggs \+ fruit \+ protein shake/i);
  assert.equal(runningEngine.emergencyOrder, "Chipotle double chicken bowl");
  assert.notEqual(runningBreakfastNote, bodyCompBreakfastNote);
  assert.match(runningEngine.dailyRecommendations.join(" "), /carbs|protein|hydration/i);
  assert.match(runningEngine.executionPlan.title, /Monday/i);
  assert.ok(runningEngine.executionPlan.catalogStats.uniqueIngredientCount >= 250);
  assert.ok(runningEngine.executionPlan.catalogStats.estimatedMealVariants >= 5000000);
});

test("quality-run nutrition exposes explicit fueling, hydration, sodium, and phase context", () => {
  const goals = [
    { name: "Half marathon PR", category: "running", active: true, priority: 1 },
    { name: "Stay lean", category: "body_comp", active: true, priority: 2 },
  ];
  const nutritionLayer = deriveAdaptiveNutrition(buildAdaptiveArgs(goals));
  const engine = deriveRealWorldNutritionEngine({
    location: "Chicago",
    dayType: nutritionLayer.dayType,
    goalContext: buildGoalContext(goals),
    nutritionLayer,
    momentum: { logGapDays: 0 },
    favorites: { mealAnchors: {}, safeMeals: [], restaurants: [], groceries: [] },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "morning",
    loggedIntake: {},
  });

  assert.equal(nutritionLayer.targets.hydrationTargetOz, 119);
  assert.equal(nutritionLayer.targets.sodiumTargetMg, 3000);
  assert.match(nutritionLayer.sessionFuelingPlan.priorityLine, /protect carbs close to the session/i);
  assert.match(engine.performanceGuidance.dayBefore, /40-60g extra carbs/i);
  assert.match(engine.performanceGuidance.dayOf, /30-60g easy carbs/i);
  assert.match(engine.performanceGuidance.recovery, /25-35g protein plus 60-90g carbs/i);
  assert.match(engine.performanceGuidance.hydration, /119 oz/i);
  assert.match(engine.performanceGuidance.sodium, /3000 mg/i);
  assert.match(engine.adaptiveContext.phase.line, /performance support/i);
});

test("fast bodyweight drop softens hard-run targets and keeps the trend explicit", () => {
  const goals = [
    { name: "Half marathon PR", category: "running", active: true, priority: 1 },
    { name: "Cut slowly", category: "body_comp", active: true, priority: 2 },
  ];
  const steadyLayer = deriveAdaptiveNutrition({
    ...buildAdaptiveArgs(goals),
    bodyweights: [{ w: 190 }, { w: 190 }, { w: 189.9 }, { w: 190 }],
  });
  const droppingFastLayer = deriveAdaptiveNutrition({
    ...buildAdaptiveArgs(goals),
    bodyweights: [{ w: 190 }, { w: 189.5 }, { w: 189 }, { w: 188.4 }, { w: 187.9 }, { w: 187.5 }],
  });
  const engine = deriveRealWorldNutritionEngine({
    location: "Chicago",
    dayType: droppingFastLayer.dayType,
    goalContext: buildGoalContext(goals),
    nutritionLayer: droppingFastLayer,
    momentum: { logGapDays: 0 },
    favorites: { mealAnchors: {}, safeMeals: [], restaurants: [], groceries: [] },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "morning",
    loggedIntake: {},
  });

  assert.equal(droppingFastLayer.bodyweightTrend.state, "dropping_fast");
  assert.ok(droppingFastLayer.targets.cal > steadyLayer.targets.cal);
  assert.ok(droppingFastLayer.targets.c > steadyLayer.targets.c);
  assert.ok(droppingFastLayer.adjustmentReasons.includes("performance guardrail softened the drop while bodyweight is falling quickly"));
  assert.match(engine.adaptiveContext.trend.line, /falling about/i);
  assert.match(engine.adaptiveContext.adjustment.line, /performance guardrail softened the drop/i);
});

test("hybrid nutrition keeps both run and strength support visible instead of collapsing to generic meals", () => {
  const goals = [
    { name: "Half marathon PR", category: "running", active: true, priority: 1 },
    { name: "Bench 225", category: "strength", active: true, priority: 2 },
  ];
  const nutritionLayer = deriveAdaptiveNutrition({
    ...buildAdaptiveArgs(goals),
    todayWorkout: {
      type: "run+strength",
      label: "Hybrid support",
      week: { phase: "PEAKBUILD", cutback: false },
    },
    bodyweights: [{ w: 190 }, { w: 189.8 }, { w: 189.6 }, { w: 189.5 }],
  });
  const engine = deriveRealWorldNutritionEngine({
    location: "Chicago",
    dayType: nutritionLayer.dayType,
    goalContext: buildGoalContext(goals),
    nutritionLayer,
    momentum: { logGapDays: 0 },
    favorites: { mealAnchors: {}, safeMeals: [], restaurants: [], groceries: [] },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "evening",
    loggedIntake: {},
  });

  assert.equal(nutritionLayer.dayType, "hybrid_support");
  assert.equal(nutritionLayer.targets.hydrationTargetOz, 117);
  assert.equal(nutritionLayer.targets.sodiumTargetMg, 3000);
  assert.match(nutritionLayer.phaseGuidance.line, /Peak weeks push fueling toward performance and recovery|Mixed running and strength demand/i);
  assert.match(engine.performanceGuidance.dayBefore, /Do not choose only a run bias or only a lift bias/i);
  assert.match(engine.performanceGuidance.dayOf, /protein plus steady carbs/i);
  assert.match(engine.performanceGuidance.during, /fluids plus carbs during/i);
  assert.match(engine.performanceGuidance.recovery, /Recover both systems/i);
  assert.match(engine.whyToday, /hybrid days need enough carbs/i);
});

test("explicit maintenance and weekly deficit preferences become first-class guardrails on hard days", () => {
  const goals = [
    { name: "Half marathon PR", category: "running", active: true, priority: 1 },
    { name: "Cut slowly", category: "body_comp", active: true, priority: 2 },
  ];
  const nutritionLayer = deriveAdaptiveNutrition({
    ...buildAdaptiveArgs(goals),
    personalization: {
      environmentConfig: { schedule: [] },
      travelState: {
        environmentMode: "home",
        isTravelWeek: false,
      },
      nutritionPreferenceState: {
        maintenanceEstimateCalories: "3000",
        weeklyDeficitTargetCalories: "900",
      },
    },
  });

  assert.equal(nutritionLayer.energyModel.explicitModelActive, true);
  assert.equal(nutritionLayer.energyModel.maintenanceEstimateCalories, 3000);
  assert.equal(nutritionLayer.energyModel.maintenanceEstimateSource, "manual");
  assert.equal(nutritionLayer.energyModel.weeklyDeficitTargetCalories, 900);
  assert.equal(nutritionLayer.energyModel.weeklyDeficitSource, "manual");
  assert.equal(nutritionLayer.energyModel.dailyDeficitTargetCalories, 45);
  assert.equal(nutritionLayer.energyModel.minimumAllowedCalories, 2955);
  assert.ok(nutritionLayer.energyModel.guardrailApplied);
  assert.equal(nutritionLayer.targets.cal, 2955);
  assert.ok(nutritionLayer.targets.c >= 345);
  assert.match(nutritionLayer.energyModel.line, /saved maintenance estimate of about 3000 kcal\/day/i);
  assert.match(nutritionLayer.energyModel.line, /saved weekly cut target of about 900 kcal\/week/i);
  assert.ok(nutritionLayer.adjustmentReasons.includes("explicit maintenance and weekly deficit model protected this day"));
});

test("preferred cuisines steer meal suggestions without changing the training demand logic", () => {
  const goals = [
    { name: "Half marathon PR", category: "running", active: true, priority: 1 },
  ];
  const nutritionLayer = deriveAdaptiveNutrition({
    ...buildAdaptiveArgs(goals),
    personalization: {
      environmentConfig: { schedule: [] },
      travelState: {
        environmentMode: "home",
        isTravelWeek: false,
      },
      nutritionPreferenceState: {
        preferredCuisines: ["mexican"],
      },
    },
  });
  const engine = deriveRealWorldNutritionEngine({
    location: "Chicago",
    dayType: nutritionLayer.dayType,
    goalContext: buildGoalContext(goals),
    nutritionLayer,
    momentum: { logGapDays: 0 },
    favorites: { mealAnchors: {}, safeMeals: [], restaurants: [], groceries: [] },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "morning",
    loggedIntake: {},
  });
  const breakfastSlot = engine.mealSlots.find((slot) => slot.key === "breakfast");
  const lunchSlot = engine.mealSlots.find((slot) => slot.key === "lunch");

  assert.match(breakfastSlot?.primary || "", /egg and bean tacos \+ fruit/i);
  assert.match(lunchSlot?.primary || "", /chicken rice bowl \+ beans \+ salsa/i);
  assert.match(engine.cuisinePreferenceLine || "", /mexican-leaning meal suggestions/i);
  assert.match(breakfastSlot?.note || "", /mexican-leaning meal suggestions/i);
  assert.match(engine.whyToday || "", /cuisine preference: mexican-leaning meal suggestions/i);
  assert.equal(nutritionLayer.dayType, "run_quality");
  assert.equal(nutritionLayer.targets.hydrationTargetOz, 119);
});

test("favorite store and meal signals quietly bias nutrition plans toward value-sensitive or premium-open proteins", () => {
  const goals = [
    { name: "Bench 225", category: "strength", active: true, priority: 1 },
  ];
  const nutritionLayer = deriveAdaptiveNutrition({
    ...buildAdaptiveArgs(goals),
    todayWorkout: {
      type: "strength",
      label: "Upper strength",
      week: { phase: "BUILDING", cutback: false },
    },
    personalization: {
      environmentConfig: { schedule: [] },
      travelState: {
        environmentMode: "home",
        isTravelWeek: false,
      },
      nutritionPreferenceState: {
        preferredCuisines: ["mediterranean"],
      },
    },
  });
  const valueEngine = deriveRealWorldNutritionEngine({
    location: "Chicago",
    dateKey: "2026-04-21",
    dayType: nutritionLayer.dayType,
    goalContext: buildGoalContext(goals),
    nutritionLayer,
    momentum: { logGapDays: 0 },
    favorites: {
      mealAnchors: {},
      safeMeals: [{ name: "Ground turkey rice bowl" }],
      restaurants: [{ name: "Costco food court" }],
      groceries: [{ name: "Aldi" }],
    },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "evening",
    loggedIntake: {},
  });
  const premiumEngine = deriveRealWorldNutritionEngine({
    location: "Chicago",
    dateKey: "2026-04-21",
    dayType: nutritionLayer.dayType,
    goalContext: buildGoalContext(goals),
    nutritionLayer,
    momentum: { logGapDays: 0 },
    favorites: {
      mealAnchors: {},
      safeMeals: [{ name: "Salmon rice bowl" }],
      restaurants: [{ name: "Whole Foods hot bar" }],
      groceries: [{ name: "Whole Foods" }],
    },
    travelMode: false,
    learningLayer: { stats: {} },
    timeOfDay: "evening",
    loggedIntake: {},
  });

  const valueProteinLine = [
    valueEngine.executionPlan.sections[1]?.buildItems?.[0] || "",
    valueEngine.executionPlan.sections[2]?.buildItems?.[0] || "",
  ].join(" | ");
  const premiumProteinLine = [
    premiumEngine.executionPlan.sections[1]?.buildItems?.[0] || "",
    premiumEngine.executionPlan.sections[2]?.buildItems?.[0] || "",
  ].join(" | ");

  assert.equal(valueEngine.executionPlan.affordabilityProfileKey, "value_sensitive");
  assert.equal(premiumEngine.executionPlan.affordabilityProfileKey, "premium_open");
  assert.doesNotMatch(valueProteinLine, /salmon|shrimp|steak|sirloin|bison|mahi/i);
  assert.match(premiumProteinLine, /salmon|shrimp|sirloin|steak|cod|tilapia|mahi|trout|pork tenderloin|lean ground beef/i);
});
