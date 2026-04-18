const test = require("node:test");
const assert = require("node:assert/strict");

const { deriveGroceryExecutionSupport } = require("../src/modules-nutrition.js");

test("grocery execution support builds a hard-day protein plus carb basket from deterministic inputs", () => {
  const support = deriveGroceryExecutionSupport({
    nutritionLayer: {
      dayType: "hardRun",
      travelMode: false,
    },
    realWorldNutrition: {
      mealStructure: {
        breakfast: "Greek yogurt + oats + fruit",
        lunch: "Chicken rice bowl",
      },
      groceryHooks: {
        priorityItems: ["rice", "lean protein", "fruit"],
        carryForwardMeals: ["Chicken rice bowl"],
      },
    },
    weeklyNutritionReview: {
      friction: {
        dominantCause: "",
        summary: "Adherence stayed mostly stable this week.",
      },
      adaptation: {
        mode: "hold",
      },
    },
    favorites: {
      safeMeals: [{ name: "Greek yogurt bowl", meal: "Greek yogurt + granola + berries" }],
      defaultMeals: [{ name: "Chicken bowl", meal: "Chicken + rice + vegetables" }],
    },
    localFoodContext: {
      city: "Chicago",
      groceryOptions: ["Trader Joe's"],
      locationPermissionGranted: false,
    },
    savedLocation: { status: "denied" },
    dayType: "hardRun",
    travelMode: false,
    recoveryDay: false,
    hardDay: true,
    strengthDay: false,
  });

  assert.equal(support.basketType, "fast_protein_carb_basket");
  assert.equal(support.preferredStore, "Trader Joe's");
  assert.ok(support.basket.items.includes("rice"));
  assert.ok(support.mealAnchors.includes("Chicken + rice + vegetables"));
  assert.match(support.honestyLine, /simple planning list/i);
});

test("grocery execution support switches to travel basket without claiming live availability", () => {
  const support = deriveGroceryExecutionSupport({
    nutritionLayer: {
      dayType: "travelRun",
      travelMode: true,
    },
    realWorldNutrition: {
      mealStructure: {
        breakfast: "Eggs + fruit",
        lunch: "Protein wrap",
      },
    },
    weeklyNutritionReview: {
      friction: {
        dominantCause: "travel",
        summary: "Travel is the main source of nutrition drift.",
      },
      adaptation: {
        mode: "simplify_defaults",
      },
    },
    favorites: {
      travelMeals: [{ name: "Airport fallback", meal: "Greek yogurt + banana + protein shake" }],
    },
    localFoodContext: {
      city: "Dallas",
      groceryOptions: ["Hotel market"],
      locationPermissionGranted: true,
    },
    savedLocation: { status: "granted" },
    dayType: "travelRun",
    travelMode: true,
    recoveryDay: false,
    hardDay: true,
    strengthDay: false,
  });

  assert.equal(support.basketType, "travel_hotel_mini_fridge_basket");
  assert.ok(support.basket.items.includes("Greek yogurt cups"));
  assert.ok(support.mealAnchors.includes("Greek yogurt + banana + protein shake"));
  assert.match(support.honestyLine, /does not assume exact hotel, airport, or store inventory/i);
  assert.match(support.locationContextLine, /examples only/i);
});

test("grocery execution support falls back to weekly top friction cause when dominantCause is not stored", () => {
  const support = deriveGroceryExecutionSupport({
    nutritionLayer: {
      dayType: "run_quality",
      travelMode: false,
    },
    realWorldNutrition: {
      mealStructure: {
        breakfast: "Overnight oats + whey",
        lunch: "Chicken rice bowl",
      },
    },
    weeklyNutritionReview: {
      friction: {
        topCauses: [{ key: "travel", label: "Travel", count: 2 }],
        summary: "Travel keeps showing up as the main source of drift.",
      },
      adaptation: {
        mode: "simplify_defaults",
      },
    },
    favorites: {
      mealAnchors: {
        breakfast: "Overnight oats + whey",
        lunch: "Chicken rice bowl",
        travelFallback: "Airport eggs + fruit + protein shake",
      },
    },
    localFoodContext: {
      city: "Denver",
      groceryOptions: ["Hotel market"],
      locationPermissionGranted: true,
    },
    savedLocation: { status: "granted" },
    dayType: "run_quality",
    travelMode: false,
    recoveryDay: false,
    hardDay: true,
    strengthDay: false,
  });

  assert.equal(support.basketType, "travel_hotel_mini_fridge_basket");
  assert.ok(support.mealAnchors.includes("Airport eggs + fruit + protein shake"));
  assert.match(support.weeklyExecutionLine, /travel/i);
});

test("grocery execution support ties recovery baskets to weekly simplification needs", () => {
  const support = deriveGroceryExecutionSupport({
    nutritionLayer: {
      dayType: "rest",
      travelMode: false,
    },
    realWorldNutrition: {
      mealStructure: {
        breakfast: "Eggs + toast",
        lunch: "Rotisserie chicken + salad",
      },
    },
    weeklyNutritionReview: {
      friction: {
        dominantCause: "convenience",
        summary: "Convenience friction keeps showing up late in the week.",
      },
      adaptation: {
        mode: "simplify_defaults",
      },
    },
    favorites: {},
    localFoodContext: {
      city: "Austin",
      groceryOptions: ["Whole Foods"],
      locationPermissionGranted: false,
    },
    savedLocation: { status: "unknown" },
    dayType: "rest",
    travelMode: false,
    recoveryDay: true,
    hardDay: false,
    strengthDay: false,
  });

  assert.equal(support.basketType, "two_day_recovery_basket");
  assert.match(support.anchorPrompt, /breakfast anchor/i);
  assert.match(support.weeklyExecutionLine, /convenience friction/i);
});

test("grocery execution support keeps placeholders generic when location permission is off", () => {
  const support = deriveGroceryExecutionSupport({
    nutritionLayer: {
      dayType: "strength",
      travelMode: false,
    },
    realWorldNutrition: {
      mealStructure: {
        breakfast: "Eggs + oats",
        lunch: "Chicken + potatoes",
      },
    },
    weeklyNutritionReview: null,
    favorites: {},
    localFoodContext: {
      locationPermissionGranted: false,
    },
    savedLocation: { status: "denied" },
    dayType: "strength",
    travelMode: false,
    recoveryDay: false,
    hardDay: false,
    strengthDay: true,
  });

  assert.equal(support.city, "your area");
  assert.equal(support.preferredStore, "your usual grocery stop");
  assert.match(support.locationContextLine, /placeholders, not live availability/i);
});
