const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNutritionSurfaceModel,
  classifyNutritionSurfaceLane,
  NUTRITION_SURFACE_LANES,
} = require("../src/services/nutrition-surface-service.js");

test("classifyNutritionSurfaceLane distinguishes strength, endurance, hybrid, and rest days", () => {
  assert.equal(
    classifyNutritionSurfaceLane({ dayType: "strength_support", todayWorkout: { type: "strength" } }),
    NUTRITION_SURFACE_LANES.strengthOnly
  );
  assert.equal(
    classifyNutritionSurfaceLane({ dayType: "run_quality", todayWorkout: { type: "run" } }),
    NUTRITION_SURFACE_LANES.endurance
  );
  assert.equal(
    classifyNutritionSurfaceLane({ dayType: "hybrid_support", todayWorkout: { type: "run+strength" } }),
    NUTRITION_SURFACE_LANES.hybrid
  );
  assert.equal(
    classifyNutritionSurfaceLane({ dayType: "recovery", todayWorkout: { type: "rest" } }),
    NUTRITION_SURFACE_LANES.rest
  );
});

test("buildNutritionSurfaceModel gives strength days a protein-and-lift biased strategy", () => {
  const model = buildNutritionSurfaceModel({
    dayType: "strength_support",
    todayWorkout: { type: "strength", label: "Lower body strength" },
    nutritionLayer: {
      targets: { p: 205, c: 220 },
    },
    realWorldNutrition: {
      executionPlan: {
        title: "Monday - Execution Plan",
        focusLine: "High protein, steady carbs, and a real recovery dinner.",
        whyLine: "The lift is the money work today, so protein stays high and carbs stay close to the lift.",
        macroTargets: [
          { label: "Calories", value: "~2,250-2,450" },
          { label: "Protein", value: "195-215g", suffix: " (must hit)" },
        ],
        sections: [
          {
            key: "breakfast",
            label: "Breakfast",
            title: "Egg Bowl",
            buildItems: ["2 whole eggs", "1 cup egg whites", "Spinach + onions"],
          },
        ],
      },
      performanceGuidance: {
        dayOf: "Land a mixed meal 2-4 hours before the lift with protein and steady carbs.",
        recovery: "Get 30-40g protein plus carbs in the first recovery meal after the lift.",
      },
      mealSlots: [
        { key: "breakfast", primary: "Eggs, toast, fruit, and Greek yogurt." },
        { key: "lunch", primary: "Chicken rice bowl with fruit and water." },
      ],
    },
    hydrationOz: 36,
    hydrationTargetOz: 96,
    fallbackMeal: "Protein shake plus fruit and a bagel.",
  });

  assert.equal(model.laneKey, NUTRITION_SURFACE_LANES.strengthOnly);
  assert.equal(model.executionPlan.sections[0].title, "Egg Bowl");
  assert.match(model.heroTitle, /lift/i);
  assert.match(model.targetBiasLine, /205g protein/i);
  assert.equal(model.strategyRows[1].label, "Before lift");
  assert.match(model.strategyRows[2].line, /recovery meal after the lift/i);
  assert.equal(model.adjustments[0].label, "Hydration");
});

test("buildNutritionSurfaceModel gives endurance days a carb-forward strategy and fallback", () => {
  const model = buildNutritionSurfaceModel({
    dayType: "run_quality",
    todayWorkout: { type: "run", label: "Tempo run" },
    nutritionLayer: {
      targets: { p: 190, c: 285 },
    },
    realWorldNutrition: {
      performanceGuidance: {
        priorityLine: "Protect carbs close to the session so the quality work stays quality work.",
        dayOf: "Build lunch around easy carbs and moderate protein, then top off with easy carbs before the run.",
        during: "Use fuel and fluids during the session if duration or heat climbs.",
        recovery: "Get carbs plus protein into the first meal after the session.",
      },
      mealSlots: [
        { key: "breakfast", primary: "Oats, fruit, and yogurt." },
        { key: "snack", primary: "Banana and sports drink." },
      ],
    },
    fallbackMeal: "Bagel, whey shake, fruit, and water.",
  });

  assert.equal(model.laneKey, NUTRITION_SURFACE_LANES.endurance);
  assert.match(model.targetBiasLine, /285g carbs/i);
  assert.equal(model.strategyRows[1].label, "During session");
  assert.equal(model.adjustments[0].label, "Performance focus");
  assert.equal(model.adjustments[1].label, "Backup");
});

test("buildNutritionSurfaceModel keeps hybrid and rest guidance visibly different", () => {
  const hybridModel = buildNutritionSurfaceModel({
    dayType: "hybrid_support",
    todayWorkout: { type: "run+strength", label: "Run plus strength" },
    nutritionLayer: { targets: { p: 195, c: 255 } },
    realWorldNutrition: {
      performanceGuidance: {
        dayOf: "Use easy carbs plus lighter protein so the run starts fueled and the lift still has support.",
        recovery: "Make the post-session meal the biggest recovery meal of the day.",
      },
    },
    weeklyNutritionReview: {
      adaptation: {
        shouldAdapt: true,
        actions: ["Anchor one pre-session carb and one post-session protein default on mixed days."],
      },
    },
    fallbackMeal: "Rice bowl plus fruit and water.",
  });

  const restModel = buildNutritionSurfaceModel({
    dayType: "recovery",
    todayWorkout: { type: "rest", label: "Recovery day" },
    nutritionLayer: { targets: { p: 190, c: 190 } },
    realWorldNutrition: {
      mealSlots: [
        { key: "breakfast", primary: "Greek yogurt, berries, and toast." },
        { key: "dinner", primary: "Salmon, potatoes, and vegetables." },
      ],
      performanceGuidance: {
        priorityLine: "Recovery days are where consistency and appetite control should feel easiest.",
      },
    },
    fallbackMeal: "Greek yogurt, fruit, and nuts.",
  });

  assert.equal(hybridModel.laneKey, NUTRITION_SURFACE_LANES.hybrid);
  assert.equal(hybridModel.strategyRows[1].label, "Between efforts");
  assert.equal(hybridModel.adjustments[0].label, "This week");

  assert.equal(restModel.laneKey, NUTRITION_SURFACE_LANES.rest);
  assert.equal(restModel.strategyRows[1].label, "Main meals");
  assert.match(restModel.heroTitle, /recover/i);
});
