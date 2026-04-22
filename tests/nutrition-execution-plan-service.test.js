const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNutritionExecutionPlan,
  NUTRITION_EXECUTION_CATALOG_STATS,
} = require("../src/services/nutrition-execution-plan-service.js");

test("nutrition execution plan exposes a large rotating catalog and structured coach-style sections", () => {
  const plan = buildNutritionExecutionPlan({
    dateKey: "2026-04-20",
    dayType: "strength_support",
    mealFamily: "strength_support",
    goalBias: "strength",
    workoutLabel: "Lower body strength",
    preferredCuisines: ["mediterranean"],
    targets: { cal: 2350, p: 195, c: 225, f: 72 },
  });

  assert.equal(plan.sections.length, 4);
  assert.match(plan.title, /Monday/i);
  assert.match(plan.focusLine, /protein|carbs/i);
  assert.ok(Array.isArray(plan.objectiveItems) && plan.objectiveItems.length >= 3);
  assert.ok(Array.isArray(plan.executionRules) && plan.executionRules.length >= 2);
  assert.match(plan.sections[0].title, /Egg|Yogurt|Oats|Tacos|Hotel|Cottage|Smoothie|Sandwich|Skyr/i);
  assert.ok(plan.sections.every((section) => Array.isArray(section.buildItems) && section.buildItems.length >= 3));
  assert.ok(plan.sections.every((section) => typeof section.targetLine === "string" && section.targetLine.length > 0));
  assert.ok(plan.sections.every((section) => typeof section.coachLine === "string" && section.coachLine.length > 0));
  assert.ok(plan.sections.every((section) => typeof section.prepLine === "string" && section.prepLine.length > 0));
  assert.ok(plan.sections.every((section) => typeof section.backupLine === "string" && section.backupLine.length > 0));
  assert.ok(plan.sections.every((section) => typeof section.preferenceKey === "string" && section.preferenceKey.length > 0));
  assert.ok(plan.sections.every((section) => Array.isArray(section.recipeSteps) && section.recipeSteps.length >= 2));
  assert.ok(plan.sections.every((section) => Array.isArray(section.improvementTips) && section.improvementTips.length >= 2));
  assert.ok(plan.sections.every((section) => Array.isArray(section.groceryItems) && section.groceryItems.length >= 2));
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.uniqueIngredientCount >= 250);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.estimatedMealVariants >= 5000000);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.recipeCountBySlot.breakfast >= 500);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.recipeCountBySlot.lunch >= 500);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.recipeCountBySlot.dinner >= 500);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.recipeCountBySlot.snack >= 150);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.patternCountBySlot.breakfast >= 10);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.patternCountBySlot.lunch >= 10);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.patternCountBySlot.dinner >= 10);
  assert.ok(NUTRITION_EXECUTION_CATALOG_STATS.patternCountBySlot.snack >= 35);
});

test("nutrition execution plan rotates meals across different dates instead of repeating the same stack", () => {
  const args = {
    dayType: "run_quality",
    mealFamily: "quality_endurance",
    goalBias: "running",
    workoutLabel: "Tempo run",
    preferredCuisines: ["mexican"],
    targets: { cal: 2550, p: 190, c: 310, f: 68 },
  };
  const dayOne = buildNutritionExecutionPlan({ ...args, dateKey: "2026-04-20" });
  const dayTwo = buildNutritionExecutionPlan({ ...args, dateKey: "2026-04-22" });

  const dayOneSignature = dayOne.sections.map((section) => `${section.title}|${section.buildItems[0] || ""}`).join(" / ");
  const dayTwoSignature = dayTwo.sections.map((section) => `${section.title}|${section.buildItems[0] || ""}`).join(" / ");

  assert.notEqual(dayOne.rotationKey, dayTwo.rotationKey);
  assert.notEqual(dayOneSignature, dayTwoSignature);
});

test("liked meal patterns get ranked higher without collapsing the catalog into one fixed day", () => {
  const neutralPlan = buildNutritionExecutionPlan({
    dateKey: "2026-04-21",
    dayType: "strength_support",
    mealFamily: "strength_support",
    goalBias: "strength",
    workoutLabel: "Bench focus",
    preferredCuisines: ["mediterranean"],
    targets: { cal: 2350, p: 195, c: 225, f: 72 },
  });
  const preferredPlan = buildNutritionExecutionPlan({
    dateKey: "2026-04-21",
    dayType: "strength_support",
    mealFamily: "strength_support",
    goalBias: "strength",
    workoutLabel: "Bench focus",
    preferredCuisines: ["mediterranean"],
    targets: { cal: 2350, p: 195, c: 225, f: 72 },
    likedMealPatterns: { shawarma_plate: true },
  });

  assert.notEqual(neutralPlan.sections[1].preferenceKey, "");
  assert.equal(preferredPlan.sections[1].preferenceKey, "shawarma_plate");
  assert.match(preferredPlan.sections[1].title, /Shawarma/i);
});

test("meal feedback can push meals down and slot overrides can rotate anchored meals into edited weekly picks", () => {
  const dislikedPlan = buildNutritionExecutionPlan({
    dateKey: "2026-04-21",
    dayType: "strength_support",
    mealFamily: "strength_support",
    goalBias: "strength",
    workoutLabel: "Bench focus",
    preferredCuisines: ["mediterranean"],
    targets: { cal: 2350, p: 195, c: 225, f: 72 },
    likedMealPatterns: { shawarma_plate: true },
    mealPatternFeedback: { shawarma_plate: "disliked" },
  });
  const anchoredPlan = buildNutritionExecutionPlan({
    dateKey: "2026-04-21",
    dayType: "strength_support",
    mealFamily: "strength_support",
    goalBias: "strength",
    workoutLabel: "Bench focus",
    preferredCuisines: ["mediterranean"],
    savedMealAnchors: { breakfast: "Greek yogurt + berries + granola" },
    targets: { cal: 2350, p: 195, c: 225, f: 72 },
  });
  const rotatedPlan = buildNutritionExecutionPlan({
    dateKey: "2026-04-21",
    dayType: "strength_support",
    mealFamily: "strength_support",
    goalBias: "strength",
    workoutLabel: "Bench focus",
    preferredCuisines: ["mediterranean"],
    savedMealAnchors: { breakfast: "Greek yogurt + berries + granola" },
    targets: { cal: 2350, p: 195, c: 225, f: 72 },
    slotOverrides: {
      breakfast: { mode: "pattern", seedOffset: 1 },
    },
  });

  assert.notEqual(dislikedPlan.sections[1].preferenceKey, "shawarma_plate");
  assert.equal(anchoredPlan.sections[0].sourceType, "anchor");
  assert.equal(rotatedPlan.sections[0].sourceType, "pattern");
  assert.equal(rotatedPlan.sections[0].overrideApplied, true);
  assert.ok(rotatedPlan.sections[0].seedOffset >= 1);
});
