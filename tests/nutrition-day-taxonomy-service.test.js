const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getNutritionDayTypeLabel,
  isHardNutritionDayType,
  LEGACY_NUTRITION_DAY_TYPE_ALIASES,
  normalizeNutritionDayType,
  NUTRITION_DAY_TYPES,
  resolveWorkoutNutritionDayType,
} = require("../src/services/nutrition-day-taxonomy-service.js");

test("legacy nutrition aliases normalize onto canonical sport-specific day types", () => {
  assert.equal(normalizeNutritionDayType("easyRun"), NUTRITION_DAY_TYPES.runEasy);
  assert.equal(normalizeNutritionDayType("hardRun"), NUTRITION_DAY_TYPES.runQuality);
  assert.equal(normalizeNutritionDayType("longRun"), NUTRITION_DAY_TYPES.runLong);
  assert.equal(normalizeNutritionDayType("travelRun"), NUTRITION_DAY_TYPES.travelEndurance);
  assert.equal(LEGACY_NUTRITION_DAY_TYPE_ALIASES.rest, NUTRITION_DAY_TYPES.recovery);
});

test("swim workout resolution never falls back to running labels", () => {
  const thresholdSwimDay = resolveWorkoutNutritionDayType({
    todayWorkout: {
      type: "swim-threshold",
      swim: {
        focus: "Threshold pacing",
      },
    },
    environmentMode: "home",
  });
  const longSwimDay = resolveWorkoutNutritionDayType({
    todayWorkout: {
      type: "swim-endurance",
      swim: {
        focus: "Endurance",
      },
    },
    environmentMode: "home",
  });

  assert.equal(thresholdSwimDay, NUTRITION_DAY_TYPES.swimQuality);
  assert.equal(longSwimDay, NUTRITION_DAY_TYPES.swimEndurance);
  assert.equal(getNutritionDayTypeLabel(thresholdSwimDay), "Threshold Swim Day");
  assert.equal(getNutritionDayTypeLabel(longSwimDay), "Endurance Swim Day");
  assert.equal(isHardNutritionDayType(thresholdSwimDay), true);
  assert.equal(isHardNutritionDayType(longSwimDay), true);
});
