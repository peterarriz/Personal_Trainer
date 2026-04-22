const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWeeklyNutritionCalendarModel,
} = require("../src/services/nutrition-weekly-calendar-service.js");

test("weekly nutrition calendar model exposes an editable week and carries slot overrides through to the day rows", () => {
  const baselineModel = buildWeeklyNutritionCalendarModel({
    planWeek: {
      startDate: "2026-04-20",
      endDate: "2026-04-26",
      sessionsByDay: {
        0: { type: "rest", label: "Active Recovery", nutri: "recovery" },
        1: { type: "easy-run", label: "Easy Run", nutri: "run_easy" },
        2: { type: "strength+prehab", label: "Strength A", nutri: "strength_support" },
        4: { type: "hard-run", label: "Tempo Run", nutri: "run_quality" },
        6: { type: "long-run", label: "Long Run", nutri: "run_long" },
      },
    },
    nutritionLayer: {
      phaseMode: "maintain",
      preferenceProfile: {
        preferredCuisines: ["mediterranean"],
      },
      targets: {
        hydrationTargetOz: 110,
        sodiumTargetMg: 3000,
      },
    },
    goalContext: {
      primary: { name: "Half marathon", category: "running" },
      secondary: [{ name: "Visible abs", category: "body_comp" }],
      active: [
        { name: "Half marathon", category: "running" },
        { name: "Visible abs", category: "body_comp" },
      ],
    },
    favorites: {
      mealAnchors: {
        breakfast: "Greek yogurt + berries + granola",
        lunch: "",
        travelFallback: "",
        emergencyOrder: "",
      },
      safeMeals: [],
      restaurants: [],
      groceries: [],
      likedMealPatterns: {},
      dislikedMealPatterns: {},
      mealPatternFeedback: {},
      mealCalendarOverrides: {},
    },
    momentum: { logGapDays: 0 },
    learningLayer: { stats: {} },
    location: "Chicago",
    todayKey: "2026-04-22",
  });

  const rotatedModel = buildWeeklyNutritionCalendarModel({
    planWeek: {
      startDate: "2026-04-20",
      endDate: "2026-04-26",
      sessionsByDay: {
        0: { type: "rest", label: "Active Recovery", nutri: "recovery" },
        1: { type: "easy-run", label: "Easy Run", nutri: "run_easy" },
        2: { type: "strength+prehab", label: "Strength A", nutri: "strength_support" },
        4: { type: "hard-run", label: "Tempo Run", nutri: "run_quality" },
        6: { type: "long-run", label: "Long Run", nutri: "run_long" },
      },
    },
    nutritionLayer: {
      phaseMode: "maintain",
      preferenceProfile: {
        preferredCuisines: ["mediterranean"],
      },
      targets: {
        hydrationTargetOz: 110,
        sodiumTargetMg: 3000,
      },
    },
    goalContext: {
      primary: { name: "Half marathon", category: "running" },
      secondary: [{ name: "Visible abs", category: "body_comp" }],
      active: [
        { name: "Half marathon", category: "running" },
        { name: "Visible abs", category: "body_comp" },
      ],
    },
    favorites: {
      mealAnchors: {
        breakfast: "Greek yogurt + berries + granola",
        lunch: "",
        travelFallback: "",
        emergencyOrder: "",
      },
      safeMeals: [],
      restaurants: [],
      groceries: [],
      likedMealPatterns: {},
      dislikedMealPatterns: {},
      mealPatternFeedback: {},
      mealCalendarOverrides: {
        "2026-04-20": {
          breakfast: { mode: "pattern", seedOffset: 1 },
        },
      },
    },
    momentum: { logGapDays: 0 },
    learningLayer: { stats: {} },
    location: "Chicago",
    todayKey: "2026-04-22",
  });

  assert.equal(baselineModel.days.length, 7);
  assert.ok(baselineModel.days.every((day) => Array.isArray(day.meals) && day.meals.length >= 4));
  const baselineBreakfast = baselineModel.days.find((day) => day.dateKey === "2026-04-20")?.meals?.find((meal) => meal.slotKey === "breakfast");
  const rotatedBreakfast = rotatedModel.days.find((day) => day.dateKey === "2026-04-20")?.meals?.find((meal) => meal.slotKey === "breakfast");

  assert.ok(baselineBreakfast);
  assert.ok(rotatedBreakfast);
  assert.equal(baselineBreakfast.sourceType, "anchor");
  assert.equal(rotatedBreakfast.hasOverride, true);
  assert.equal(rotatedBreakfast.sourceType, "pattern");
  assert.notEqual(rotatedBreakfast.title, baselineBreakfast.title);
  assert.ok(rotatedModel.overrideCount >= 1);
});
