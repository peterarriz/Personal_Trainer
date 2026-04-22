import {
  isHardNutritionDayType,
  isHybridNutritionDayType,
  isRecoveryNutritionDayType,
  isStrengthNutritionDayType,
  normalizeNutritionDayType,
} from "./nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const compactLine = (value = "", maxLength = 110) => {
  const normalized = sanitizeText(value, maxLength * 2);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
};

const clampNumber = (value = 0) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const NUTRITION_SURFACE_LANES = Object.freeze({
  strengthOnly: "strength_only",
  endurance: "endurance",
  hybrid: "hybrid",
  rest: "rest",
});

const LANE_COPY = Object.freeze({
  [NUTRITION_SURFACE_LANES.strengthOnly]: {
    label: "Strength day",
    heroTitle: "Fuel the lift",
    heroLine: "Protein leads the day and carbs stay close to the lift.",
    strategySummary: "Eat like the lift matters: protein early, steady carbs before training, and a real recovery meal after.",
  },
  [NUTRITION_SURFACE_LANES.endurance]: {
    label: "Endurance day",
    heroTitle: "Fuel the session",
    heroLine: "Carbs need to be visible so the session starts and finishes well.",
    strategySummary: "Put easy carbs near the workout, keep fuel accessible during longer work, and finish with a real recovery meal.",
  },
  [NUTRITION_SURFACE_LANES.hybrid]: {
    label: "Hybrid day",
    heroTitle: "Fuel both sessions",
    heroLine: "Carbs protect the endurance work and protein keeps the strength work productive.",
    strategySummary: "Start carb-ready, keep fuel available between efforts, and finish with your biggest recovery meal of the day.",
  },
  [NUTRITION_SURFACE_LANES.rest]: {
    label: "Recovery day",
    heroTitle: "Recover and reset",
    heroLine: "Keep meals steady, protein-forward, and easy to repeat.",
    strategySummary: "Make the day low-decision: normal meals, high protein, and no need to force workout-style fueling.",
  },
});

const pickSlotLine = (slotsByKey = {}, key = "", fallback = "") => compactLine(
  slotsByKey?.[key]?.primary
  || slotsByKey?.[key]?.fastSwap
  || fallback,
  96
);

const buildTargetsLine = ({ laneKey = "", targets = {} } = {}) => {
  const protein = Math.round(clampNumber(targets?.p));
  const carbs = Math.round(clampNumber(targets?.c));
  if (!protein && !carbs) return "";
  if (laneKey === NUTRITION_SURFACE_LANES.strengthOnly) {
    return `${protein}g protein target with steady carbs around the lift.`;
  }
  if (laneKey === NUTRITION_SURFACE_LANES.hybrid) {
    return `${carbs}g carbs to cover the mixed workload, with ${protein}g protein to finish the day strong.`;
  }
  if (laneKey === NUTRITION_SURFACE_LANES.rest) {
    return `${protein}g protein target with steadier carbs and simpler meals.`;
  }
  return `${carbs}g carbs lead the day, with ${protein}g protein to recover from the work.`;
};

const buildStrategyRows = ({
  laneKey = "",
  mealSlots = [],
  performanceGuidance = null,
  fallbackMeal = "",
} = {}) => {
  const slotsByKey = Object.fromEntries((mealSlots || []).map((slot) => [slot.key, slot]));
  const breakfastLine = pickSlotLine(slotsByKey, "breakfast", "Protein plus carbs in the first meal.");
  const lunchLine = pickSlotLine(slotsByKey, "lunch", "Build lunch around protein, carbs, and produce.");
  const dinnerLine = pickSlotLine(slotsByKey, "dinner", "Finish with a real meal, not just a snack.");
  const snackLine = pickSlotLine(slotsByKey, "snack", fallbackMeal || "Use a simple protein plus carb backup.");
  const dayOfLine = compactLine(performanceGuidance?.dayOf || "", 110);
  const duringLine = compactLine(performanceGuidance?.during || "", 110);
  const recoveryLine = compactLine(performanceGuidance?.recovery || "", 110);

  if (laneKey === NUTRITION_SURFACE_LANES.strengthOnly) {
    return [
      { key: "first_meal", label: "First meal", line: breakfastLine || lunchLine },
      { key: "before_lift", label: "Before lift", line: dayOfLine || lunchLine },
      { key: "after_lift", label: "After lift", line: recoveryLine || dinnerLine || snackLine },
    ].filter((entry) => entry.line);
  }
  if (laneKey === NUTRITION_SURFACE_LANES.hybrid) {
    return [
      { key: "before_session", label: "Before session", line: dayOfLine || breakfastLine },
      { key: "between_efforts", label: "Between efforts", line: duringLine || "Keep easy carbs and fluids available between the endurance work and the lift." },
      { key: "after_session", label: "After session", line: recoveryLine || dinnerLine || snackLine },
    ].filter((entry) => entry.line);
  }
  if (laneKey === NUTRITION_SURFACE_LANES.rest) {
    return [
      { key: "first_meal", label: "First meal", line: breakfastLine || lunchLine },
      { key: "main_meals", label: "Main meals", line: lunchLine || dinnerLine },
      { key: "evening", label: "Evening", line: dinnerLine || snackLine },
    ].filter((entry) => entry.line);
  }
  return [
    { key: "before_session", label: "Before session", line: dayOfLine || breakfastLine },
    { key: "during_session", label: "During session", line: duringLine || snackLine },
    { key: "after_session", label: "After session", line: recoveryLine || dinnerLine || snackLine },
  ].filter((entry) => entry.line);
};

const buildAdjustmentRows = ({
  laneKey = "",
  nutritionComparison = null,
  weeklyNutritionReview = null,
  performanceGuidance = null,
  hydrationOz = 0,
  hydrationTargetOz = 0,
  fallbackMeal = "",
} = {}) => {
  const rows = [];
  const deviationKind = String(nutritionComparison?.deviationKind || "");
  if (nutritionComparison?.hasActual && deviationKind === "under_fueled") {
    rows.push({
      key: "reset_under_fueled",
      label: "Reset today",
      line: "Land the next meal with protein and carbs. Do not wait until late evening to try to catch up.",
    });
  } else if (nutritionComparison?.hasActual && deviationKind === "over_indulged") {
    rows.push({
      key: "reset_over",
      label: "Reset today",
      line: "Return to the next planned meal. Skip the compensation spiral.",
    });
  } else if (nutritionComparison?.hasActual && deviationKind === "deviated") {
    rows.push({
      key: "reset_drift",
      label: "Reset today",
      line: "Use the next planned meal as written and let the day settle.",
    });
  }

  if (weeklyNutritionReview?.adaptation?.shouldAdapt) {
    rows.push({
      key: "weekly_adaptation",
      label: "This week",
      line: compactLine(
        weeklyNutritionReview?.adaptation?.actions?.[0]
        || weeklyNutritionReview?.adaptation?.summary
        || "",
        112
      ),
    });
  }

  const hydrationTarget = clampNumber(hydrationTargetOz);
  const hydrationLogged = clampNumber(hydrationOz);
  const hydrationRemaining = Math.max(0, Math.round(hydrationTarget - hydrationLogged));
  if (hydrationTarget > 0 && hydrationLogged > 0 && hydrationLogged < hydrationTarget * 0.65) {
    rows.push({
      key: "hydration",
      label: "Hydration",
      line: hydrationRemaining > 0
        ? `${hydrationRemaining} oz left. Knock out two easy refills before evening.`
        : "Finish the day with one more easy refill.",
    });
  }

  if (!rows.length && performanceGuidance?.priorityLine) {
    rows.push({
      key: "performance_focus",
      label: laneKey === NUTRITION_SURFACE_LANES.rest ? "Consistency" : "Performance focus",
      line: compactLine(performanceGuidance.priorityLine, 112),
    });
  }

  if (rows.length < 2 && fallbackMeal) {
    rows.push({
      key: "fallback",
      label: "Backup",
      line: compactLine(fallbackMeal, 112),
    });
  }

  return rows
    .filter((entry) => entry.line)
    .slice(0, 2);
};

export const classifyNutritionSurfaceLane = ({
  dayType = "",
  todayWorkout = null,
} = {}) => {
  const normalizedDayType = normalizeNutritionDayType(dayType || todayWorkout?.nutri || "");
  const workoutType = sanitizeText(todayWorkout?.type || "", 80).toLowerCase();
  if (isRecoveryNutritionDayType(normalizedDayType) || workoutType === "rest" || workoutType === "recovery") {
    return NUTRITION_SURFACE_LANES.rest;
  }
  if (isHybridNutritionDayType(normalizedDayType) || workoutType === "run+strength" || workoutType === "conditioning" || workoutType === "otf") {
    return NUTRITION_SURFACE_LANES.hybrid;
  }
  if (isStrengthNutritionDayType(normalizedDayType) || workoutType === "strength" || workoutType === "strength+prehab") {
    return NUTRITION_SURFACE_LANES.strengthOnly;
  }
  return NUTRITION_SURFACE_LANES.endurance;
};

export const buildNutritionSurfaceModel = ({
  dayType = "",
  todayWorkout = null,
  nutritionLayer = null,
  realWorldNutrition = null,
  weeklyNutritionReview = null,
  nutritionComparison = null,
  hydrationOz = 0,
  hydrationTargetOz = 0,
  fallbackMeal = "",
} = {}) => {
  const normalizedDayType = normalizeNutritionDayType(dayType || nutritionLayer?.dayType || todayWorkout?.nutri || "");
  const laneKey = classifyNutritionSurfaceLane({ dayType: normalizedDayType, todayWorkout });
  const laneCopy = LANE_COPY[laneKey] || LANE_COPY[NUTRITION_SURFACE_LANES.endurance];
  const hardDay = isHardNutritionDayType(normalizedDayType);
  const mealSlots = Array.isArray(realWorldNutrition?.mealSlots) ? realWorldNutrition.mealSlots : [];
  const performanceGuidance = realWorldNutrition?.performanceGuidance || null;
  const executionPlan = realWorldNutrition?.executionPlan || null;
  const targets = nutritionLayer?.targets || {};

  const heroLine = laneKey === NUTRITION_SURFACE_LANES.endurance && hardDay
    ? "This is a harder endurance day, so carbs should be obvious before the session and present again after it."
    : laneKey === NUTRITION_SURFACE_LANES.hybrid
    ? "Do not let the endurance work steal fuel from the lift, or the lift crowd out recovery."
    : laneCopy.heroLine;

  return {
    laneKey,
    laneLabel: laneCopy.label,
    heroTitle: laneCopy.heroTitle,
    heroLine: compactLine(heroLine, 112),
    targetBiasLine: buildTargetsLine({ laneKey, targets }),
    strategySummary: compactLine(laneCopy.strategySummary, 118),
    executionPlan,
    strategyRows: buildStrategyRows({
      laneKey,
      mealSlots,
      performanceGuidance,
      fallbackMeal,
    }),
    adjustments: buildAdjustmentRows({
      laneKey,
      nutritionComparison,
      weeklyNutritionReview,
      performanceGuidance,
      hydrationOz,
      hydrationTargetOz,
      fallbackMeal,
    }),
  };
};
