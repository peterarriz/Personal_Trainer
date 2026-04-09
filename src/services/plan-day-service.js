import { buildCanonicalPlanDay } from "../modules-planning.js";
import {
  getGoalContext,
  deriveAdaptiveNutrition,
  deriveRealWorldNutritionEngine,
  compareNutritionPrescriptionToActual,
} from "../modules-nutrition.js";
import { resolveEffectiveStatus } from "../modules-checkins.js";

export const resolvePlanDayTimeOfDay = ({ hours = 0 } = {}) => (
  hours < 12 ? "morning" : hours < 18 ? "afternoon" : "evening"
);

export const resolvePlanDayStateInputs = ({
  dateKey = "",
  logs = {},
  dailyCheckins = {},
  nutritionActualLogs = {},
  coachPlanAdjustments = {},
} = {}) => {
  const dailyCheckin = dailyCheckins?.[dateKey] || logs?.[dateKey]?.checkin || {};

  return {
    dailyCheckin,
    sessionStatus: resolveEffectiveStatus(dailyCheckin, dateKey),
    nutritionActualLog: nutritionActualLogs?.[dateKey] || null,
    readinessPromptSignal: coachPlanAdjustments?.extra?.readinessSignals?.[dateKey] || null,
  };
};

const resolvePlanDayLocation = (personalization = {}) => (
  personalization?.localFoodContext?.city
  || personalization?.localFoodContext?.locationLabel
  || (personalization?.connectedDevices?.location?.status === "granted" ? "Nearby area" : "")
);

export const assembleCanonicalPlanDay = ({
  dateKey = "",
  dayOfWeek = 0,
  currentWeek = 1,
  baseWeek = {},
  basePlannedDay = null,
  resolvedTrainingCandidate = null,
  todayPlan = null,
  readinessInfluence = null,
  goals = [],
  momentum = {},
  personalization = {},
  bodyweights = [],
  learningLayer = {},
  nutritionActualLogs = {},
  coachPlanAdjustments = {},
  salvageLayer = {},
  failureMode = {},
  nutritionFavorites = {},
  currentPlanWeek = null,
  dayOverride = null,
  nutritionOverride = null,
  environmentSelection = null,
  injuryRule = null,
  garminReadiness = null,
  deviceSyncAudit = null,
  logs = {},
  dailyCheckins = {},
  stateInputs = null,
  timeOfDay = "morning",
} = {}) => {
  const resolvedStateInputs = stateInputs || resolvePlanDayStateInputs({
    dateKey,
    logs,
    dailyCheckins,
    nutritionActualLogs,
    coachPlanAdjustments,
  });
  const dailyCheckin = resolvedStateInputs?.dailyCheckin || {};
  const sessionStatus = resolvedStateInputs?.sessionStatus || "not_logged";
  const actualNutritionLog = resolvedStateInputs?.nutritionActualLog || null;
  const effectiveTraining = readinessInfluence?.adjustedWorkout || resolvedTrainingCandidate || basePlannedDay || null;

  const nutritionLayer = deriveAdaptiveNutrition({
    todayWorkout: effectiveTraining,
    goals,
    momentum,
    personalization,
    bodyweights,
    learningLayer,
    nutritionActualLogs,
    coachPlanAdjustments,
    salvageLayer,
    failureMode,
  });
  const realWorldNutrition = deriveRealWorldNutritionEngine({
    location: resolvePlanDayLocation(personalization),
    dayType: nutritionLayer?.dayType,
    goalContext: getGoalContext(goals),
    nutritionLayer,
    momentum,
    favorites: nutritionFavorites,
    travelMode: personalization?.travelState?.isTravelWeek || String(personalization?.travelState?.environmentMode || "").includes("travel"),
    learningLayer,
    timeOfDay,
    loggedIntake: actualNutritionLog,
  });
  const nutritionComparison = compareNutritionPrescriptionToActual({
    nutritionPrescription: nutritionLayer,
    actualNutritionLog,
  });

  const planDay = buildCanonicalPlanDay({
    dateKey,
    dayOfWeek,
    currentWeek,
    baseWeek,
    basePlannedDay,
    resolvedDay: effectiveTraining,
    todayPlan,
    readiness: readinessInfluence,
    nutrition: {
      prescription: nutritionLayer,
      reality: realWorldNutrition,
      actual: actualNutritionLog,
      comparison: nutritionComparison,
    },
    adjustments: {
      dayOverride,
      nutritionOverride,
      environmentSelection,
      injuryRule,
      failureMode,
      garminReadiness,
      deviceSyncAudit,
    },
    context: {
      architecture: currentPlanWeek?.architecture || "",
      blockIntent: currentPlanWeek?.blockIntent || null,
      weeklyIntent: currentPlanWeek?.weeklyIntent || null,
      planWeek: currentPlanWeek,
      supplementPlan: nutritionFavorites?.supplementStack || [],
    },
    logging: {
      dailyCheckin,
      sessionLog: logs?.[dateKey] || null,
      nutritionLog: actualNutritionLog,
      supplementLog: actualNutritionLog?.supplements?.takenMap || null,
      sessionStatus,
    },
  });

  return {
    planDay,
    effectiveTraining,
    nutritionLayer,
    actualNutritionLog,
    realWorldNutrition,
    nutritionComparison,
    dailyCheckin,
    sessionStatus,
  };
};
