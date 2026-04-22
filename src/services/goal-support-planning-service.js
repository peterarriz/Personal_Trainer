import { dedupeStrings } from "../utils/collection-utils.js";
import { buildGoalDriverProfile, normalizeGoalDriverProfile } from "./goal-driver-graph-service.js";
import { getExercisePerformanceRecordsForLog } from "./performance-record-service.js";

export const GOAL_SUPPORT_PLANNING_MODEL_VERSION = "2026-04-goal-support-planning-v1";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const uniqueStrings = (items = []) => dedupeStrings(toArray(items).map((item) => sanitizeText(item, 80).toLowerCase()).filter(Boolean));

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const isWithinAgeWindow = ({ dateKey = "", now = new Date(), minDays = 0, maxDays = 21 } = {}) => {
  const parsed = new Date(`${sanitizeText(dateKey, 24)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageDays = Math.max(0, Math.floor((asDate(now).getTime() - parsed.getTime()) / ONE_DAY_MS));
  return ageDays >= minDays && ageDays <= maxDays;
};

const ACTIVE_SORTER = (left = {}, right = {}) => {
  const leftPriority = Number(left?.priority ?? left?.planningPriority ?? left?.resolvedGoal?.planningPriority ?? 999) || 999;
  const rightPriority = Number(right?.priority ?? right?.planningPriority ?? right?.resolvedGoal?.planningPriority ?? 999) || 999;
  return leftPriority - rightPriority;
};

const flattenRecentExerciseRecords = ({ logs = {} } = {}) => (
  Object.entries(logs || {}).flatMap(([dateKey, logEntry]) => (
    getExercisePerformanceRecordsForLog(logEntry || {}, { dateKey })
  ))
);

const countTouchedDriverIds = (records = []) => {
  const counts = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const driverIds = [
      ...(record?.transferProfile?.supportDriverIds || []),
      ...(record?.transferProfile?.protectiveDriverIds || []),
    ];
    uniqueStrings(driverIds).forEach((driverId) => {
      counts.set(driverId, (counts.get(driverId) || 0) + 1);
    });
  });
  return counts;
};

const scoreDriverGap = ({ driver = {}, type = "support", recentCount = 0, priorCount = 0 } = {}) => {
  const untouchedBonus = recentCount > 0 ? 0 : 0.7;
  const staleBonus = priorCount > 0 ? 0 : 0.18;
  const protectiveBonus = type === "protective" ? 0.08 : 0;
  return Number((untouchedBonus + staleBonus + Number(driver?.weight || 0) + protectiveBonus).toFixed(4));
};

const summarizeGoalSupportCoverage = ({
  goal = {},
  exerciseRecords = [],
  now = new Date(),
} = {}) => {
  const resolvedGoal = goal?.resolvedGoal || goal || {};
  const profile = normalizeGoalDriverProfile(resolvedGoal?.driverProfile || goal?.driverProfile || null)
    || buildGoalDriverProfile({ goal });
  if (!profile) return null;

  const recentRecords = (Array.isArray(exerciseRecords) ? exerciseRecords : []).filter((record) => (
    isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 })
  ));
  const priorRecords = (Array.isArray(exerciseRecords) ? exerciseRecords : []).filter((record) => (
    isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 22, maxDays: 42 })
  ));
  const recentCounts = countTouchedDriverIds(recentRecords);
  const priorCounts = countTouchedDriverIds(priorRecords);
  const candidates = [
    ...(profile?.supportDrivers || []).map((driver) => ({
      ...driver,
      driverType: "support",
      recentCount: recentCounts.get(driver.id) || 0,
      priorCount: priorCounts.get(driver.id) || 0,
    })),
    ...(profile?.protectiveDrivers || []).map((driver) => ({
      ...driver,
      driverType: "protective",
      recentCount: recentCounts.get(driver.id) || 0,
      priorCount: priorCounts.get(driver.id) || 0,
    })),
  ].map((driver) => ({
    ...driver,
    gapScore: scoreDriverGap({
      driver,
      type: driver.driverType,
      recentCount: driver.recentCount,
      priorCount: driver.priorCount,
    }),
  })).sort((left, right) => right.gapScore - left.gapScore);

  return {
    goalId: sanitizeText(goal?.id || resolvedGoal?.id || "", 80),
    goalName: sanitizeText(goal?.name || resolvedGoal?.summary || "", 160),
    primaryDomain: sanitizeText(profile?.primaryDomain || "", 80).toLowerCase(),
    primaryOutcomeId: sanitizeText(profile?.primaryOutcomeId || "", 80).toLowerCase(),
    topGapDriverIds: candidates.map((driver) => driver.id).slice(0, 5),
    gapDrivers: candidates.slice(0, 5).map((driver) => ({
      id: driver.id,
      label: driver.label,
      driverType: driver.driverType,
      recentCount: driver.recentCount,
      priorCount: driver.priorCount,
      gapScore: driver.gapScore,
    })),
    coveredDriverIds: uniqueStrings(candidates.filter((driver) => driver.recentCount > 0).map((driver) => driver.id)),
    profile,
  };
};

const filterFocusIds = ({ candidateIds = [], allowedIds = [], fallbackIds = [] } = {}) => {
  const allowed = new Set(uniqueStrings(allowedIds));
  const next = [
    ...uniqueStrings(candidateIds).filter((id) => allowed.has(id)),
    ...uniqueStrings(fallbackIds).filter((id) => allowed.has(id)),
  ];
  return uniqueStrings(next).slice(0, 4);
};

const STRENGTH_UPPER_DRIVER_IDS = [
  "upper_back_stability",
  "scapular_control",
  "anterior_delt_strength",
  "triceps_strength",
  "pressing_hypertrophy",
  "trunk_bracing",
  "shoulder_tolerance",
  "elbow_tolerance",
  "lat_strength",
];

const LOWER_DURABILITY_DRIVER_IDS = [
  "calf_soleus_capacity",
  "ankle_stiffness",
  "single_leg_control",
  "hip_stability",
  "trunk_stiffness",
  "trunk_bracing",
  "hamstring_durability",
  "lower_leg_tolerance",
  "tendon_tolerance",
  "impact_tolerance",
  "posterior_chain_strength",
];

const SWIM_DRYLAND_DRIVER_IDS = [
  "lat_strength",
  "triceps_strength",
  "scapular_control",
  "trunk_stiffness",
  "shoulder_rotation_endurance",
  "hip_extension_support",
  "shoulder_tolerance",
  "neck_upper_back_tolerance",
];

const resolveStrengthFallbackIds = (summary = null) => {
  if (summary?.primaryOutcomeId === "bench_press_strength") {
    return ["upper_back_stability", "anterior_delt_strength", "triceps_strength", "scapular_control"];
  }
  if (summary?.primaryOutcomeId === "overhead_press_strength") {
    return ["scapular_control", "anterior_delt_strength", "triceps_strength", "trunk_bracing"];
  }
  return ["upper_back_stability", "trunk_bracing", "posterior_chain_strength", "single_leg_control"];
};

export const buildGoalSupportPlanningContext = ({
  goals = [],
  logs = {},
  now = new Date(),
} = {}) => {
  const activeGoals = (Array.isArray(goals) ? goals : [])
    .filter((goal) => goal?.active !== false)
    .sort(ACTIVE_SORTER);
  const exerciseRecords = flattenRecentExerciseRecords({ logs });
  const summaries = activeGoals
    .map((goal) => summarizeGoalSupportCoverage({ goal, exerciseRecords, now }))
    .filter(Boolean);

  const strengthSummary = summaries.find((summary) => summary.primaryDomain === "strength_hypertrophy") || null;
  const runningSummary = summaries.find((summary) => summary.primaryDomain === "running_endurance") || null;
  const swimmingSummary = summaries.find((summary) => summary.primaryDomain === "swimming_endurance_technique") || null;
  const hybridSummary = summaries.find((summary) => summary.primaryDomain === "hybrid_multi_domain") || null;

  return {
    version: GOAL_SUPPORT_PLANNING_MODEL_VERSION,
    summaries,
    leadDomain: sanitizeText(summaries?.[0]?.primaryDomain || "", 80).toLowerCase(),
    strengthFocusDriverIds: filterFocusIds({
      candidateIds: [
        ...(strengthSummary?.topGapDriverIds || []),
        ...(hybridSummary?.topGapDriverIds || []),
      ],
      allowedIds: STRENGTH_UPPER_DRIVER_IDS,
      fallbackIds: resolveStrengthFallbackIds(strengthSummary || hybridSummary),
    }),
    durabilityFocusDriverIds: filterFocusIds({
      candidateIds: [
        ...(runningSummary?.topGapDriverIds || []),
        ...(hybridSummary?.topGapDriverIds || []),
        ...(strengthSummary?.topGapDriverIds || []),
      ],
      allowedIds: LOWER_DURABILITY_DRIVER_IDS,
      fallbackIds: ["calf_soleus_capacity", "single_leg_control", "trunk_stiffness", "ankle_stiffness"],
    }),
    swimDrylandFocusDriverIds: filterFocusIds({
      candidateIds: [
        ...(swimmingSummary?.topGapDriverIds || []),
        ...(hybridSummary?.topGapDriverIds || []),
      ],
      allowedIds: SWIM_DRYLAND_DRIVER_IDS,
      fallbackIds: ["lat_strength", "scapular_control", "triceps_strength", "trunk_stiffness"],
    }),
  };
};
