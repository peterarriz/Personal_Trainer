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
  assert.equal(breakfastSlot.savedAnchor, true);
  assert.match(breakfastSlot.primary, /Overnight oats \+ whey/i);
  assert.match(lunchSlot.primary, /Chicken rice bowl/i);
  assert.match(lunchSlot.travelSwap, /Airport eggs \+ fruit \+ protein shake/i);
  assert.equal(runningEngine.emergencyOrder, "Chipotle double chicken bowl");
  assert.notEqual(runningBreakfastNote, bodyCompBreakfastNote);
  assert.match(runningEngine.dailyRecommendations.join(" "), /carbs|protein|hydration/i);
});
