import { normalizeActualNutritionLogCollection } from "../modules-nutrition.js";

export const PERSISTED_TRAINER_DATA_VERSION = 6;
export const PERSISTENCE_CONTRACT_VERSION = "runtime_storage_v1";

export const DEFAULT_COACH_PLAN_ADJUSTMENTS = {
  dayOverrides: {},
  nutritionOverrides: {},
  weekVolumePct: {},
  extra: {},
};

export const DEFAULT_NUTRITION_FAVORITES = {
  restaurants: [],
  groceries: [],
  safeMeals: [],
  travelMeals: [],
  defaultMeals: [],
};

const clonePersistenceValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const decodeBase64Json = (encoded = "") => JSON.parse(decodeURIComponent(escape(atob(String(encoded || "").trim()))));

const encodeBase64Json = (value = {}) => btoa(unescape(encodeURIComponent(JSON.stringify(value))));

export const buildCanonicalRuntimeState = ({
  logs = {},
  bodyweights = [],
  paceOverrides = {},
  weekNotes = {},
  planAlerts = [],
  personalization = {},
  goals = [],
  coachActions = [],
  coachPlanAdjustments = DEFAULT_COACH_PLAN_ADJUSTMENTS,
  dailyCheckins = {},
  plannedDayRecords = {},
  weeklyCheckins = {},
  nutritionFavorites = DEFAULT_NUTRITION_FAVORITES,
  nutritionActualLogs = {},
} = {}) => ({
  logs: clonePersistenceValue(logs || {}),
  bodyweights: clonePersistenceValue(bodyweights || []),
  paceOverrides: clonePersistenceValue(paceOverrides || {}),
  weekNotes: clonePersistenceValue(weekNotes || {}),
  planAlerts: clonePersistenceValue(planAlerts || []),
  personalization: clonePersistenceValue(personalization || {}),
  goals: clonePersistenceValue(goals || []),
  coachActions: clonePersistenceValue(coachActions || []),
  coachPlanAdjustments: clonePersistenceValue(coachPlanAdjustments || DEFAULT_COACH_PLAN_ADJUSTMENTS),
  dailyCheckins: clonePersistenceValue(dailyCheckins || {}),
  plannedDayRecords: clonePersistenceValue(plannedDayRecords || {}),
  weeklyCheckins: clonePersistenceValue(weeklyCheckins || {}),
  nutritionFavorites: clonePersistenceValue(nutritionFavorites || DEFAULT_NUTRITION_FAVORITES),
  nutritionActualLogs: clonePersistenceValue(nutritionActualLogs || {}),
});

export const buildPersistedTrainerPayload = ({
  runtimeState = {},
  transformPersonalization = null,
  timestamp = Date.now(),
} = {}) => {
  // This is the anti-drift boundary: runtime state in, storage blob out.
  const state = buildCanonicalRuntimeState(runtimeState);
  const safePersonalization = typeof transformPersonalization === "function"
    ? transformPersonalization(state.personalization)
    : state.personalization;

  return {
    logs: state.logs,
    bw: state.bodyweights,
    paceOverrides: state.paceOverrides,
    weekNotes: state.weekNotes,
    planAlerts: state.planAlerts,
    personalization: clonePersistenceValue(safePersonalization || {}),
    goals: state.goals,
    coachActions: state.coachActions,
    coachPlanAdjustments: state.coachPlanAdjustments,
    dailyCheckins: state.dailyCheckins,
    plannedDayRecords: state.plannedDayRecords,
    weeklyCheckins: state.weeklyCheckins,
    nutritionFavorites: state.nutritionFavorites,
    nutritionActualLogs: state.nutritionActualLogs,
    v: PERSISTED_TRAINER_DATA_VERSION,
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    ts: Number(timestamp) || Date.now(),
  };
};

export const buildCanonicalRuntimeStateFromStorage = ({
  storedPayload = {},
  mergePersonalization,
  DEFAULT_PERSONALIZATION = {},
  normalizeGoals,
  DEFAULT_MULTI_GOALS = [],
} = {}) => {
  const payload = storedPayload?.data && typeof storedPayload.data === "object"
    ? storedPayload.data
    : storedPayload;
  const safeGoals = typeof normalizeGoals === "function"
    ? normalizeGoals(payload?.goals || DEFAULT_MULTI_GOALS)
    : clonePersistenceValue(payload?.goals || DEFAULT_MULTI_GOALS || []);
  const safePersonalization = typeof mergePersonalization === "function"
    ? mergePersonalization(DEFAULT_PERSONALIZATION, payload?.personalization || {})
    : clonePersistenceValue(payload?.personalization || DEFAULT_PERSONALIZATION || {});
  const hasNormalizedNutritionActualStore = Boolean(
    payload
    && typeof payload === "object"
    && Object.prototype.hasOwnProperty.call(payload, "nutritionActualLogs")
  );
  const normalizedNutritionActualLogs = hasNormalizedNutritionActualStore
    ? clonePersistenceValue(payload?.nutritionActualLogs || {})
    : normalizeActualNutritionLogCollection(payload?.nutritionFeedback || {});

  return buildCanonicalRuntimeState({
    logs: payload?.logs || {},
    bodyweights: payload?.bw || payload?.bodyweights || [],
    paceOverrides: payload?.paceOverrides || {},
    weekNotes: payload?.weekNotes || {},
    planAlerts: payload?.planAlerts || [],
    personalization: safePersonalization,
    goals: safeGoals,
    coachActions: payload?.coachActions || [],
    coachPlanAdjustments: payload?.coachPlanAdjustments || DEFAULT_COACH_PLAN_ADJUSTMENTS,
    dailyCheckins: payload?.dailyCheckins || {},
    plannedDayRecords: payload?.plannedDayRecords || {},
    weeklyCheckins: payload?.weeklyCheckins || {},
    nutritionFavorites: payload?.nutritionFavorites || DEFAULT_NUTRITION_FAVORITES,
    nutritionActualLogs: normalizedNutritionActualLogs,
  });
};

export const applyCanonicalRuntimeStateSetters = ({
  runtimeState = {},
  setters = {},
} = {}) => {
  if (!runtimeState || typeof runtimeState !== "object") return;
  if (typeof setters.setLogs === "function") setters.setLogs(runtimeState.logs || {});
  if (typeof setters.setBodyweights === "function") setters.setBodyweights(runtimeState.bodyweights || []);
  if (typeof setters.setPaceOverrides === "function") setters.setPaceOverrides(runtimeState.paceOverrides || {});
  if (typeof setters.setWeekNotes === "function") setters.setWeekNotes(runtimeState.weekNotes || {});
  if (typeof setters.setPlanAlerts === "function") setters.setPlanAlerts(runtimeState.planAlerts || []);
  if (typeof setters.setPersonalization === "function") setters.setPersonalization(runtimeState.personalization || {});
  if (typeof setters.setGoals === "function") setters.setGoals(runtimeState.goals || []);
  if (typeof setters.setCoachActions === "function") setters.setCoachActions(runtimeState.coachActions || []);
  if (typeof setters.setCoachPlanAdjustments === "function") setters.setCoachPlanAdjustments(runtimeState.coachPlanAdjustments || DEFAULT_COACH_PLAN_ADJUSTMENTS);
  if (typeof setters.setDailyCheckins === "function") setters.setDailyCheckins(runtimeState.dailyCheckins || {});
  if (typeof setters.setPlannedDayRecords === "function") setters.setPlannedDayRecords(runtimeState.plannedDayRecords || {});
  if (typeof setters.setWeeklyCheckins === "function") setters.setWeeklyCheckins(runtimeState.weeklyCheckins || {});
  if (typeof setters.setNutritionFavorites === "function") setters.setNutritionFavorites(runtimeState.nutritionFavorites || DEFAULT_NUTRITION_FAVORITES);
  if (typeof setters.setNutritionActualLogs === "function") setters.setNutritionActualLogs(runtimeState.nutritionActualLogs || {});
};

export const exportRuntimeStateAsBase64 = ({
  runtimeState = {},
  transformPersonalization = null,
} = {}) => encodeBase64Json(
  buildPersistedTrainerPayload({
    runtimeState,
    transformPersonalization,
  })
);

export const importRuntimeStateFromBase64 = ({
  encoded = "",
  mergePersonalization,
  DEFAULT_PERSONALIZATION = {},
  normalizeGoals,
  DEFAULT_MULTI_GOALS = [],
} = {}) => buildCanonicalRuntimeStateFromStorage({
  storedPayload: decodeBase64Json(encoded),
  mergePersonalization,
  DEFAULT_PERSONALIZATION,
  normalizeGoals,
  DEFAULT_MULTI_GOALS,
});
