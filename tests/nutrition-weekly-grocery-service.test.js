const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWeeklyNutritionGroceryModel,
} = require("../src/services/nutrition-weekly-grocery-service.js");

test("weekly nutrition grocery model aggregates the generated week into grouped grocery buckets", () => {
  const model = buildWeeklyNutritionGroceryModel({
    planWeek: {
      startDate: "2026-04-20",
      endDate: "2026-04-26",
      sessionsByDay: {
        0: { type: "rest", label: "Active Recovery", nutri: "recovery" },
        1: { type: "easy-run", label: "Easy Run", nutri: "run_easy" },
        3: { type: "strength+prehab", label: "Strength A", nutri: "strength_support" },
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
        breakfast: "",
        lunch: "",
        travelFallback: "",
        emergencyOrder: "",
      },
      safeMeals: [],
      restaurants: [],
      groceries: [],
    },
    momentum: { logGapDays: 0 },
    learningLayer: { stats: {} },
    location: "Chicago",
  });

  assert.equal(model.title, "This week's grocery list");
  assert.match(model.weekLabel, /Apr/i);
  assert.equal(model.dailyPlans.length, 7);
  assert.ok(model.groups.length >= 3);
  assert.ok(model.groups.some((group) => group.label === "Protein" && group.items.length >= 2));
  assert.ok(model.groups.some((group) => group.label === "Carbs" && group.items.length >= 2));
  assert.ok(model.prepNotes.length >= 1);
  assert.ok(model.totalUniqueItems >= 10);
  assert.ok(Array.isArray(model.allItems) && model.allItems.length >= model.totalUniqueItems);
  assert.ok(model.dailyPlans.every((day) => Array.isArray(day.meals) && day.meals.length >= 2));
  const dayLevelIngredients = new Set(model.dailyPlans.flatMap((day) => day.groceryItems || []));
  for (const ingredient of dayLevelIngredients) {
    assert.ok(model.allItems.includes(ingredient), `${ingredient} should be present in the grouped grocery list`);
  }
  assert.ok(model.allItems.includes("Rice"));
  assert.ok(model.allItems.includes("Greek yogurt"));
  assert.ok(model.allItems.includes("Chicken") || model.allItems.includes("Ground turkey") || model.allItems.includes("Salmon"));
});
