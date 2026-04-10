import { normalizePerformanceLogsCollection } from "./performance-record-service.js";
import { normalizePersistedPlanWeekRecordMap } from "./plan-week-persistence-service.js";
import {
  getCurrentPrescribedDayRecord,
  normalizePrescribedDayHistoryEntry,
} from "./prescribed-day-history-service.js";

const clonePersistenceContractValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toFiniteInteger = (value, fallback = null) => {
  const parsed = toFiniteNumber(value, fallback);
  return parsed === null ? fallback : Math.round(parsed);
};

const shouldEmitPersistenceWarnings = () => {
  try {
    if (typeof window !== "undefined") {
      const host = String(window?.location?.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return true;
      if (window?.localStorage?.getItem?.("trainer_debug") === "1") return true;
      return false;
    }
    if (typeof process !== "undefined") {
      return process?.env?.NODE_ENV === "development";
    }
  } catch {}
  return false;
};

const emitPersistenceWarning = ({ sink = null, code = "", message = "", details = {} } = {}) => {
  if (!shouldEmitPersistenceWarnings()) return;
  const line = `[persistence-contract:${code || "warn"}] ${message}`;
  if (typeof sink === "function") {
    sink(line, details);
    return;
  }
  try {
    console.warn(line, details);
  } catch {}
};

const countNestedPerformanceRecords = (logs = {}) => Object.values(logs || {})
  .reduce((sum, entry) => sum + (Array.isArray(entry?.performanceRecords) ? entry.performanceRecords.length : 0), 0);

const sanitizeMetric = (metric = null) => {
  if (!metric || typeof metric !== "object") return null;
  const key = sanitizeText(metric?.key || "", 60).toLowerCase();
  const label = sanitizeText(metric?.label || metric?.key || "", 80);
  if (!key && !label) return null;
  return {
    ...(key ? { key } : {}),
    ...(label ? { label } : {}),
    ...(sanitizeText(metric?.unit || "", 24) ? { unit: sanitizeText(metric.unit, 24) } : {}),
    ...(sanitizeText(metric?.kind || "", 20) ? { kind: sanitizeText(metric.kind, 20).toLowerCase() } : {}),
    ...(sanitizeText(metric?.targetValue || metric?.value || "", 40) ? { targetValue: sanitizeText(metric?.targetValue || metric?.value || "", 40) } : {}),
  };
};

const sanitizeResolvedGoal = (resolvedGoal = null) => {
  if (!resolvedGoal || typeof resolvedGoal !== "object") return null;
  return {
    ...(sanitizeText(resolvedGoal?.id || "", 80) ? { id: sanitizeText(resolvedGoal.id, 80) } : {}),
    ...(sanitizeText(resolvedGoal?.summary || "", 160) ? { summary: sanitizeText(resolvedGoal.summary, 160) } : {}),
    ...(sanitizeText(resolvedGoal?.goalFamily || "", 40) ? { goalFamily: sanitizeText(resolvedGoal.goalFamily, 40).toLowerCase() } : {}),
    ...(sanitizeText(resolvedGoal?.planningCategory || "", 40) ? { planningCategory: sanitizeText(resolvedGoal.planningCategory, 40).toLowerCase() } : {}),
    ...(Number.isFinite(Number(resolvedGoal?.planningPriority)) ? { planningPriority: Math.max(1, Math.round(Number(resolvedGoal.planningPriority))) } : {}),
    ...(sanitizeText(resolvedGoal?.measurabilityTier || "", 40) ? { measurabilityTier: sanitizeText(resolvedGoal.measurabilityTier, 40).toLowerCase() } : {}),
    ...(sanitizeMetric(resolvedGoal?.primaryMetric) ? { primaryMetric: sanitizeMetric(resolvedGoal.primaryMetric) } : {}),
    proxyMetrics: toArray(resolvedGoal?.proxyMetrics).map(sanitizeMetric).filter(Boolean).slice(0, 6),
    ...(sanitizeText(resolvedGoal?.targetDate || "", 24) ? { targetDate: sanitizeText(resolvedGoal.targetDate, 24) } : {}),
    ...(Number.isFinite(Number(resolvedGoal?.targetHorizonWeeks)) ? { targetHorizonWeeks: Math.max(1, Math.round(Number(resolvedGoal.targetHorizonWeeks))) } : {}),
    ...(sanitizeText(resolvedGoal?.confidence || "", 20) ? { confidence: sanitizeText(resolvedGoal.confidence, 20).toLowerCase() } : {}),
    unresolvedGaps: toArray(resolvedGoal?.unresolvedGaps).map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 6),
    tradeoffs: toArray(resolvedGoal?.tradeoffs).map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 6),
    ...(sanitizeText(resolvedGoal?.first30DaySuccessDefinition || "", 220) ? { first30DaySuccessDefinition: sanitizeText(resolvedGoal.first30DaySuccessDefinition, 220) } : {}),
    ...(sanitizeText(resolvedGoal?.reviewCadence || "", 40) ? { reviewCadence: sanitizeText(resolvedGoal.reviewCadence, 40).toLowerCase() } : {}),
    ...(sanitizeText(resolvedGoal?.refinementTrigger || "", 60) ? { refinementTrigger: sanitizeText(resolvedGoal.refinementTrigger, 60) } : {}),
  };
};

export const sanitizePersistedGoal = (goal = {}, index = 0) => {
  const next = {
    ...(sanitizeText(goal?.id || "", 80) ? { id: sanitizeText(goal.id, 80) } : {}),
    ...(sanitizeText(goal?.name || goal?.title || `Goal ${index + 1}`, 160) ? { name: sanitizeText(goal?.name || goal?.title || `Goal ${index + 1}`, 160) } : {}),
    ...(sanitizeText(goal?.type || "", 40) ? { type: sanitizeText(goal.type, 40).toLowerCase() } : {}),
    ...(sanitizeText(goal?.category || "", 40) ? { category: sanitizeText(goal.category, 40).toLowerCase() } : {}),
    ...(Number.isFinite(Number(goal?.priority)) ? { priority: Math.max(1, Math.round(Number(goal.priority))) } : {}),
    ...(sanitizeText(goal?.targetDate || "", 24) ? { targetDate: sanitizeText(goal.targetDate, 24) } : {}),
    ...(sanitizeText(goal?.measurableTarget || "", 160) ? { measurableTarget: sanitizeText(goal.measurableTarget, 160) } : {}),
    ...(goal?.active === false ? { active: false } : { active: true }),
    ...(sanitizeText(goal?.status || "", 40) ? { status: sanitizeText(goal.status, 40).toLowerCase() } : {}),
    ...(goal?.tracking && typeof goal.tracking === "object" ? { tracking: clonePersistenceContractValue(goal.tracking) } : {}),
    ...(sanitizeText(goal?.confidenceLevel || "", 20) ? { confidenceLevel: sanitizeText(goal.confidenceLevel, 20).toLowerCase() } : {}),
    unresolvedGaps: toArray(goal?.unresolvedGaps).map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 6),
    tradeoffs: toArray(goal?.tradeoffs).map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 6),
    ...(sanitizeText(goal?.goalFamily || "", 40) ? { goalFamily: sanitizeText(goal.goalFamily, 40).toLowerCase() } : {}),
    ...(sanitizeText(goal?.measurabilityTier || "", 40) ? { measurabilityTier: sanitizeText(goal.measurabilityTier, 40).toLowerCase() } : {}),
    ...(sanitizeMetric(goal?.primaryMetric) ? { primaryMetric: sanitizeMetric(goal.primaryMetric) } : {}),
    proxyMetrics: toArray(goal?.proxyMetrics).map(sanitizeMetric).filter(Boolean).slice(0, 6),
    ...(sanitizeText(goal?.first30DaySuccessDefinition || "", 220) ? { first30DaySuccessDefinition: sanitizeText(goal.first30DaySuccessDefinition, 220) } : {}),
    ...(sanitizeText(goal?.reviewCadence || "", 40) ? { reviewCadence: sanitizeText(goal.reviewCadence, 40).toLowerCase() } : {}),
    ...(sanitizeText(goal?.refinementTrigger || "", 60) ? { refinementTrigger: sanitizeText(goal.refinementTrigger, 60) } : {}),
  };
  const resolvedGoal = sanitizeResolvedGoal(goal?.resolvedGoal);
  if (resolvedGoal) next.resolvedGoal = resolvedGoal;
  return next;
};

export const sanitizePersistedGoalsCollection = ({ goals = [], warningSink = null } = {}) => {
  const safeGoals = (Array.isArray(goals) ? goals : [])
    .map((goal, index) => sanitizePersistedGoal(goal, index))
    .filter((goal) => sanitizeText(goal?.name || "", 160));
  if (safeGoals.length !== (Array.isArray(goals) ? goals.length : 0)) {
    emitPersistenceWarning({
      sink: warningSink,
      code: "goals_sanitized",
      message: "Dropped one or more persistable goals because the payload did not survive serialization cleanly.",
      details: { before: (Array.isArray(goals) ? goals.length : 0), after: safeGoals.length },
    });
  }
  return safeGoals;
};

export const sanitizePersistedPlannedDayRecords = ({ plannedDayRecords = {}, warningSink = null } = {}) => {
  const next = Object.fromEntries(
    Object.entries(plannedDayRecords || {})
      .map(([dateKey, entry]) => {
        const normalized = normalizePrescribedDayHistoryEntry(dateKey, clonePersistenceContractValue(entry));
        const currentRecord = getCurrentPrescribedDayRecord(normalized);
        const looksPersistable = Boolean(
          normalized
          && currentRecord?.dateKey
          && (
            currentRecord?.base
            || currentRecord?.resolved
            || currentRecord?.decision
          )
        );
        return looksPersistable ? [dateKey, normalized] : null;
      })
      .filter(Boolean)
  );
  if (Object.keys(next).length !== Object.keys(plannedDayRecords || {}).length) {
    emitPersistenceWarning({
      sink: warningSink,
      code: "planned_day_history_sanitized",
      message: "Dropped one or more prescribed-day history entries before persistence.",
      details: { before: Object.keys(plannedDayRecords || {}).length, after: Object.keys(next).length },
    });
  }
  return next;
};

export const sanitizePersistedPlanWeekRecords = ({ planWeekRecords = {}, warningSink = null } = {}) => {
  const next = normalizePersistedPlanWeekRecordMap(clonePersistenceContractValue(planWeekRecords || {}));
  if (Object.keys(next).length !== Object.keys(planWeekRecords || {}).length) {
    emitPersistenceWarning({
      sink: warningSink,
      code: "plan_week_records_sanitized",
      message: "Dropped one or more PlanWeek history entries before persistence.",
      details: { before: Object.keys(planWeekRecords || {}).length, after: Object.keys(next).length },
    });
  }
  return next;
};

export const sanitizePersistedLogsCollection = ({ logs = {}, warningSink = null } = {}) => {
  const beforePerformanceRecords = countNestedPerformanceRecords(logs || {});
  const next = normalizePerformanceLogsCollection(clonePersistenceContractValue(logs || {}));
  const afterPerformanceRecords = countNestedPerformanceRecords(next || {});
  if (afterPerformanceRecords < beforePerformanceRecords) {
    emitPersistenceWarning({
      sink: warningSink,
      code: "performance_records_sanitized",
      message: "One or more performance records were normalized away before persistence.",
      details: { beforePerformanceRecords, afterPerformanceRecords },
    });
  }
  return next;
};

export const sanitizeTrainerDataPayloadForRest = ({ payload = {}, warningSink = null } = {}) => {
  const safePayload = clonePersistenceContractValue(payload || {});
  return {
    ...safePayload,
    logs: sanitizePersistedLogsCollection({ logs: safePayload?.logs || {}, warningSink }),
    goals: sanitizePersistedGoalsCollection({ goals: safePayload?.goals || [], warningSink }),
    plannedDayRecords: sanitizePersistedPlannedDayRecords({ plannedDayRecords: safePayload?.plannedDayRecords || {}, warningSink }),
    planWeekRecords: sanitizePersistedPlanWeekRecords({ planWeekRecords: safePayload?.planWeekRecords || {}, warningSink }),
  };
};

const isUuid = (value = "") => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
const toJsonDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
};

export const sanitizeGoalRowsForRest = ({ goals = [], userId = "", warningSink = null } = {}) => {
  const safeRows = (Array.isArray(goals) ? goals : []).map((goal, idx) => {
    const title = sanitizeText(goal?.title || goal?.name || "", 160);
    const row = {
      user_id: String(userId || "").trim(),
      ...(isUuid(goal?.id) ? { id: String(goal.id).trim() } : {}),
      type: sanitizeText(goal?.type || ((goal?.targetDate || goal?.target_date) ? "time_bound" : "ongoing"), 40).toLowerCase() || "ongoing",
      category: sanitizeText(goal?.category || "running", 40).toLowerCase() || "running",
      title,
      target_value: toFiniteNumber(goal?.targetValue ?? goal?.currentMetricTarget, null),
      current_value: toFiniteNumber(goal?.currentValue, null),
      target_date: toJsonDate(goal?.targetDate || goal?.target_date),
      priority: toFiniteInteger(goal?.priority, idx + 1) || (idx + 1),
      status: goal?.active === false ? "archived" : sanitizeText(goal?.status || "active", 40).toLowerCase() || "active",
    };
    return title ? row : null;
  }).filter(Boolean);
  if (safeRows.length !== (Array.isArray(goals) ? goals.length : 0)) {
    emitPersistenceWarning({
      sink: warningSink,
      code: "goal_rows_sanitized",
      message: "Dropped one or more goal rows before Supabase write.",
      details: { before: (Array.isArray(goals) ? goals.length : 0), after: safeRows.length },
    });
  }
  return safeRows;
};

export const sanitizeExercisePerformanceRowsForRest = ({ rows = [], userId = "", dateKey = "", warningSink = null } = {}) => {
  const safeDateKey = toJsonDate(dateKey);
  const safeRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const exerciseName = sanitizeText(row?.exercise_name || row?.exercise || "", 120);
    if (!exerciseName || !safeDateKey || !String(userId || "").trim()) return null;
    return {
      user_id: String(userId || "").trim(),
      exercise_name: exerciseName,
      date: safeDateKey,
      prescribed_weight: toFiniteNumber(row?.prescribed_weight ?? row?.prescribedWeight, null),
      actual_weight: toFiniteNumber(row?.actual_weight ?? row?.actualWeight, null),
      prescribed_reps: toFiniteInteger(row?.prescribed_reps ?? row?.prescribedReps, null),
      actual_reps: toFiniteInteger(row?.actual_reps ?? row?.actualReps, null),
      prescribed_sets: toFiniteInteger(row?.prescribed_sets ?? row?.prescribedSets, null),
      actual_sets: toFiniteInteger(row?.actual_sets ?? row?.actualSets, null),
      band_tension: sanitizeText(row?.band_tension ?? row?.bandTension ?? "", 40) || null,
      bodyweight_only: Boolean(row?.bodyweight_only ?? row?.bodyweightOnly),
      feel_this_session: toFiniteInteger(row?.feel_this_session ?? row?.feelThisSession, null),
    };
  }).filter(Boolean);
  if (safeRows.length !== (Array.isArray(rows) ? rows.length : 0)) {
    emitPersistenceWarning({
      sink: warningSink,
      code: "exercise_rows_sanitized",
      message: "Dropped one or more exercise-performance rows before Supabase write.",
      details: { before: (Array.isArray(rows) ? rows.length : 0), after: safeRows.length },
    });
  }
  return safeRows;
};
