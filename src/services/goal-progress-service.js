import { dedupeStrings } from "../utils/collection-utils.js";
import {
  getExercisePerformanceRecordsForLog,
  getSessionPerformanceRecordsForLog,
  inferPerformanceLiftKey,
} from "./performance-record-service.js";
import { GOAL_MEASURABILITY_TIERS } from "./goal-resolution-service.js";
import { normalizeGoalDriverProfile } from "./goal-driver-graph-service.js";
import { buildGoalSupportContributionItem } from "./goal-contribution-scoring-service.js";

export const GOAL_PROGRESS_TRACKING_MODES = {
  measurable: "measurable",
  proxy: "proxy",
  exploratory: "exploratory",
};

export const GOAL_PROGRESS_STATUSES = {
  onTrack: "on_track",
  building: "building",
  reviewBased: "review_based",
  needsData: "needs_data",
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;
const COMPLETED_STATUSES = new Set(["completed_as_planned", "completed_modified", "partial_completed"]);

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toDateKey = (value = null) => {
  const date = asDate(value);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().split("T")[0];
};

const getDateTimestamp = (dateKey = "") => {
  if (!dateKey) return null;
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const getAgeDays = ({ dateKey = "", now = new Date() } = {}) => {
  const dateTs = getDateTimestamp(dateKey);
  if (!Number.isFinite(dateTs)) return null;
  return Math.max(0, Math.floor((asDate(now).getTime() - dateTs) / ONE_DAY_MS));
};

const isWithinAgeWindow = ({ dateKey = "", now = new Date(), minDays = 0, maxDays = 14 } = {}) => {
  const ageDays = getAgeDays({ dateKey, now });
  return Number.isFinite(ageDays) && ageDays >= minDays && ageDays <= maxDays;
};

const average = (values = []) => {
  const safe = (values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!safe.length) return null;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
};

const round1 = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
};

const formatNumber = (value, digits = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "";
};

const clamp01 = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
};

const formatSignedDelta = (value, digits = 1, unit = "") => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return `0${unit ? ` ${unit}` : ""}`;
  const magnitude = Math.abs(parsed).toFixed(digits);
  return `${parsed > 0 ? "+" : "-"}${magnitude}${unit ? ` ${unit}` : ""}`;
};

const formatPace = (paceSeconds = null) => {
  const parsed = Number(paceSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  const minutes = Math.floor(parsed / 60);
  const seconds = Math.round(parsed % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
};

const parseDurationTextToSeconds = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return null;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return null;
};

const parsePrimaryMetricTargetNumber = (metric = null) => {
  const text = String(metric?.targetValue || "").trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const resolveTrackingMode = (goal = {}) => {
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable) return GOAL_PROGRESS_TRACKING_MODES.measurable;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.proxyMeasurable) return GOAL_PROGRESS_TRACKING_MODES.proxy;
  return GOAL_PROGRESS_TRACKING_MODES.exploratory;
};

const inferMeasurabilityTier = (goal = {}) => {
  if (goal?.measurabilityTier) return goal.measurabilityTier;
  if (goal?.primaryMetric) return GOAL_MEASURABILITY_TIERS.fullyMeasurable;
  if (Array.isArray(goal?.proxyMetrics) && goal.proxyMetrics.length > 0) return GOAL_MEASURABILITY_TIERS.proxyMeasurable;
  return GOAL_MEASURABILITY_TIERS.exploratoryFuzzy;
};

const normalizeResolvedGoal = (goal = {}, index = 0) => {
  const proxyMetrics = (Array.isArray(goal?.proxyMetrics) ? goal.proxyMetrics : []).map((metric) => ({
    key: sanitizeText(metric?.key || "", 60).toLowerCase(),
    label: sanitizeText(metric?.label || metric?.key || "", 80),
    unit: sanitizeText(metric?.unit || "", 24),
    kind: sanitizeText(metric?.kind || "proxy", 20).toLowerCase() || "proxy",
  })).filter((metric) => metric.key && metric.label);

  const primaryMetric = goal?.primaryMetric && (goal?.primaryMetric?.key || goal?.primaryMetric?.label)
    ? {
        key: sanitizeText(goal.primaryMetric.key || "", 60).toLowerCase(),
        label: sanitizeText(goal.primaryMetric.label || goal.primaryMetric.key || "", 80),
        unit: sanitizeText(goal.primaryMetric.unit || "", 24),
        kind: "primary",
        targetValue: sanitizeText(goal.primaryMetric.targetValue || "", 40),
      }
    : null;

  return {
    id: sanitizeText(goal?.id || `resolved_goal_${index + 1}`, 80) || `resolved_goal_${index + 1}`,
    planningPriority: Math.max(1, Math.round(Number(goal?.planningPriority || index + 1) || (index + 1))),
    summary: sanitizeText(goal?.summary || goal?.name || "Resolved goal", 160),
    planningCategory: sanitizeText(goal?.planningCategory || goal?.category || "general_fitness", 40).toLowerCase() || "general_fitness",
    goalFamily: sanitizeText(goal?.goalFamily || "", 40).toLowerCase(),
    primaryDomain: sanitizeText(goal?.primaryDomain || goal?.resolvedGoal?.primaryDomain || "", 80).toLowerCase(),
    measurabilityTier: inferMeasurabilityTier(goal),
    primaryMetric,
    proxyMetrics,
    driverProfile: normalizeGoalDriverProfile(goal?.driverProfile || null),
    targetDate: sanitizeText(goal?.targetDate || "", 24),
    targetHorizonWeeks: Number.isFinite(Number(goal?.targetHorizonWeeks)) ? Math.max(1, Math.round(Number(goal.targetHorizonWeeks))) : null,
    confidence: sanitizeText(goal?.confidence || goal?.confidenceLevel || "low", 20).toLowerCase() || "low",
    unresolvedGaps: dedupeStrings(toArray(goal?.unresolvedGaps).map((item) => sanitizeText(item, 180))).slice(0, 4),
    tradeoffs: dedupeStrings(toArray(goal?.tradeoffs).map((item) => sanitizeText(item, 180))).slice(0, 4),
    reviewCadence: sanitizeText(goal?.reviewCadence || "weekly", 40) || "weekly",
    refinementTrigger: sanitizeText(goal?.refinementTrigger || "", 60),
    first30DaySuccessDefinition: sanitizeText(goal?.first30DaySuccessDefinition || "", 220),
  };
};

const hasResolvedGoalShape = (goal = {}) => Boolean(
  goal?.resolvedGoal
  || goal?.measurabilityTier
  || goal?.primaryMetric
  || (Array.isArray(goal?.proxyMetrics) && goal.proxyMetrics.length > 0)
  || goal?.first30DaySuccessDefinition
);

const buildResolvedGoalFallback = (goal = {}, index = 0) => normalizeResolvedGoal({
  id: goal?.id || `goal_${index + 1}`,
  planningPriority: goal?.priority || index + 1,
  summary: goal?.name || "Goal",
  planningCategory: goal?.category || "general_fitness",
  measurabilityTier: goal?.measurabilityTier || "",
  primaryMetric: goal?.primaryMetric || null,
  proxyMetrics: goal?.proxyMetrics || [],
  targetDate: goal?.targetDate || "",
  targetHorizonWeeks: goal?.targetHorizonWeeks || null,
  confidence: goal?.confidenceLevel || "low",
  unresolvedGaps: goal?.unresolvedGaps || [],
  tradeoffs: goal?.tradeoffs || [],
  reviewCadence: goal?.reviewCadence || "weekly",
  refinementTrigger: goal?.refinementTrigger || "",
  first30DaySuccessDefinition: goal?.first30DaySuccessDefinition || goal?.measurableTarget || "",
}, index);

const extractResolvedGoalsFromGoals = (goals = []) => (
  (Array.isArray(goals) ? goals : [])
    .filter((goal) => goal?.active !== false)
    .filter((goal) => hasResolvedGoalShape(goal))
    .map((goal, index) => normalizeResolvedGoal(goal?.resolvedGoal || buildResolvedGoalFallback(goal, index), index))
    .sort((a, b) => a.planningPriority - b.planningPriority)
);

const normalizeBodyweightSeries = (bodyweights = []) => (Array.isArray(bodyweights) ? bodyweights : [])
  .map((row) => ({
    date: sanitizeText(row?.date || row?.d || "", 24),
    value: toFiniteNumber(row?.w ?? row?.weight, null),
  }))
  .filter((row) => row.date && Number.isFinite(row.value))
  .sort((a, b) => a.date.localeCompare(b.date));

const normalizeManualSeries = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((row) => ({
    date: sanitizeText(row?.date || row?.dateKey || row?.d || "", 24),
    value: toFiniteNumber(row?.value ?? row?.measurement ?? row?.w ?? row?.weight ?? row?.count, null),
    count: toFiniteNumber(row?.count, null),
    note: sanitizeText(row?.note || "", 160),
  }))
  .filter((row) => row.date && (Number.isFinite(row.value) || Number.isFinite(row.count) || row.note))
  .sort((a, b) => a.date.localeCompare(b.date));

const getManualMetricSeries = ({ manualProgressInputs = {}, key = "" } = {}) => {
  const measurementPool = manualProgressInputs?.measurements || manualProgressInputs?.metrics || {};
  const aliases = {
    waist_circumference: ["waist_circumference", "waist"],
    progress_photos: ["progress_photos", "photos", "photoCheckins"],
  };
  const candidateKeys = aliases[key] || [key];
  const pool = candidateKeys.flatMap((candidateKey) => [
    ...(toArray(measurementPool?.[candidateKey])),
    ...(toArray(manualProgressInputs?.[candidateKey])),
  ]);
  return normalizeManualSeries(pool);
};

const parseDurationToMinutes = (value = "") => {
  const numeric = toFiniteNumber(value, null);
  if (numeric !== null) return numeric;
  const seconds = parseDurationTextToSeconds(value);
  return Number.isFinite(seconds) ? round1(seconds / 60) : null;
};

const normalizeManualRunBenchmarkSeries = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((row) => {
    const date = sanitizeText(row?.date || row?.dateKey || row?.d || "", 24);
    const distanceMiles = toFiniteNumber(row?.distanceMiles ?? row?.distance ?? row?.miles, null);
    const durationMinutes = parseDurationToMinutes(row?.durationMinutes ?? row?.duration ?? row?.runTime ?? "");
    const paceText = sanitizeText(row?.paceText || row?.pace || "", 24);
    const paceSeconds = toFiniteNumber(row?.paceSeconds, null) ?? parseDurationTextToSeconds(paceText);
    const note = sanitizeText(row?.note || "", 160);
    return {
      date,
      distanceMiles,
      durationMinutes,
      paceText,
      paceSeconds,
      note,
    };
  })
  .filter((row) => row.date && (Number.isFinite(row.distanceMiles) || Number.isFinite(row.durationMinutes) || Number.isFinite(row.paceSeconds) || row.paceText))
  .sort((a, b) => a.date.localeCompare(b.date));

const getManualRunBenchmarkSeries = ({ manualProgressInputs = {} } = {}) => {
  const benchmarkPool = manualProgressInputs?.benchmarks || {};
  return normalizeManualRunBenchmarkSeries([
    ...toArray(benchmarkPool?.run_results),
    ...toArray(manualProgressInputs?.run_results),
    ...toArray(manualProgressInputs?.runBenchmarks),
  ]);
};

const normalizeManualSwimBenchmarkSeries = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((row) => {
    const date = sanitizeText(row?.date || row?.dateKey || row?.d || "", 24);
    const rawValue = sanitizeText(row?.value || row?.benchmark || row?.text || "", 120);
    const parsedValueMatch = rawValue.match(/(\d+(?:\.\d+)?)\s*(yd|yard|yards|m|meter|meters|metre|metres)\s*(?:in\s*)?(\d+:\d{2}(?::\d{2})?)/i);
    const distance = toFiniteNumber(
      row?.distance
      ?? row?.yards
      ?? row?.meters
      ?? parsedValueMatch?.[1],
      null
    );
    const distanceUnit = sanitizeText(
      row?.distanceUnit
      || row?.unit
      || parsedValueMatch?.[2]
      || "yd",
      12
    ).toLowerCase() || "yd";
    const duration = sanitizeText(row?.duration || row?.swimTime || parsedValueMatch?.[3] || "", 24);
    const durationSeconds = parseDurationTextToSeconds(duration);
    const note = sanitizeText(row?.note || rawValue || "", 160);
    return {
      date,
      distance,
      distanceUnit,
      duration,
      durationSeconds,
      note,
    };
  })
  .filter((row) => row.date && (Number.isFinite(row.distance) || Number.isFinite(row.durationSeconds) || row.duration))
  .sort((a, b) => a.date.localeCompare(b.date));

const getManualSwimBenchmarkSeries = ({ manualProgressInputs = {} } = {}) => {
  const benchmarkPool = manualProgressInputs?.benchmarks || {};
  const metricPool = manualProgressInputs?.metrics || {};
  return normalizeManualSwimBenchmarkSeries([
    ...toArray(benchmarkPool?.swim_benchmark),
    ...toArray(metricPool?.swim_benchmark),
    ...toArray(manualProgressInputs?.swim_benchmark),
    ...toArray(manualProgressInputs?.swimBenchmarks),
  ]);
};

const normalizeManualLiftBenchmarkSeries = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((row) => {
    const exercise = sanitizeText(row?.exercise || row?.exercise_name || "", 120);
    const date = sanitizeText(row?.date || row?.dateKey || row?.d || "", 24);
    const weight = toFiniteNumber(row?.weight ?? row?.actualWeight ?? row?.weightUsed, null);
    const reps = toFiniteNumber(row?.reps ?? row?.actualReps ?? row?.repsCompleted, null);
    const sets = toFiniteNumber(row?.sets ?? row?.actualSets, null);
    const note = sanitizeText(row?.note || "", 160);
    return {
      date,
      exercise,
      exerciseKey: sanitizeText(exercise, 120).toLowerCase(),
      liftKey: inferPerformanceLiftKey(exercise),
      actual: {
        weight,
        reps,
        sets,
      },
      prescribed: {
        weight,
        reps,
        sets,
      },
      note,
      source: "manual_lift_benchmark",
    };
  })
  .filter((row) => row.date && row.exercise && Number.isFinite(row.actual.weight))
  .sort((a, b) => a.date.localeCompare(b.date));

const getManualLiftBenchmarkSeries = ({ manualProgressInputs = {} } = {}) => {
  const benchmarkPool = manualProgressInputs?.benchmarks || {};
  return normalizeManualLiftBenchmarkSeries([
    ...toArray(benchmarkPool?.lift_results),
    ...toArray(manualProgressInputs?.lift_results),
    ...toArray(manualProgressInputs?.liftBenchmarks),
  ]);
};

const normalizeWeeklyCheckins = (weeklyCheckins = {}) => Object.values(weeklyCheckins || {})
  .map((checkin) => ({
    ts: Number(checkin?.ts || 0) || 0,
    energy: toFiniteNumber(checkin?.energy, null),
    stress: toFiniteNumber(checkin?.stress, null),
    confidence: toFiniteNumber(checkin?.confidence, null),
  }))
  .filter((checkin) => Number.isFinite(checkin.ts) && checkin.ts > 0)
  .sort((a, b) => a.ts - b.ts);

const collectSessionRecords = (logs = {}) => Object.entries(logs || {})
  .flatMap(([dateKey, logEntry]) => getSessionPerformanceRecordsForLog(logEntry || {}, { dateKey }))
  .filter((record) => record?.date)
  .sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));

const collectExerciseRecords = (logs = {}) => Object.entries(logs || {})
  .flatMap(([dateKey, logEntry]) => getExercisePerformanceRecordsForLog(logEntry || {}, { dateKey }))
  .filter((record) => record?.date)
  .sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));

const hasStructuredLog = (logEntry = {}, sessionRecords = [], exerciseRecords = []) => Boolean(
  sanitizeText(logEntry?.actualSession?.sessionType || logEntry?.type || logEntry?.label || "", 80)
  || toFiniteNumber(logEntry?.miles, null) > 0
  || toFiniteNumber(logEntry?.runTime, null) > 0
  || sessionRecords.length > 0
  || exerciseRecords.length > 0
);

const resolveProgressWindowStatus = ({
  dateKey = "",
  logEntry = {},
  dailyCheckin = {},
  now = new Date(),
  sessionRecords = [],
  exerciseRecords = [],
} = {}) => {
  const explicitStatus = sanitizeText(
    logEntry?.actualSession?.status
    || logEntry?.checkin?.status
    || dailyCheckin?.status
    || "",
    40
  ).toLowerCase();
  if (explicitStatus) return explicitStatus;
  if (hasStructuredLog(logEntry, sessionRecords, exerciseRecords)) return "completed_as_planned";
  const safeNow = asDate(now).getTime();
  const dateTs = getDateTimestamp(dateKey);
  if (Number.isFinite(dateTs) && (safeNow - dateTs) >= GRACE_PERIOD_MS) return "not_logged_expired";
  return "not_logged_grace";
};

const buildTrainingWindow = ({
  logs = {},
  dailyCheckins = {},
  sessionRecords = [],
  exerciseRecords = [],
  now = new Date(),
  minDays = 0,
  maxDays = 14,
} = {}) => {
  const dateKeys = Array.from(new Set([
    ...Object.keys(logs || {}),
    ...Object.keys(dailyCheckins || {}),
    ...(sessionRecords || []).map((record) => record?.date || ""),
    ...(exerciseRecords || []).map((record) => record?.date || ""),
  ])).filter((dateKey) => isWithinAgeWindow({ dateKey, now, minDays, maxDays }));

  const metrics = {
    completedCount: 0,
    countableCount: 0,
    loggedCount: 0,
    sessionCount: 0,
    distanceMiles: 0,
    durationMinutes: 0,
    dates: dateKeys.sort(),
  };

  const sessionDates = new Set((sessionRecords || [])
    .filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays, maxDays }))
    .map((record) => record.date));

  dateKeys.forEach((dateKey) => {
    const daySessionRecords = (sessionRecords || []).filter((record) => record?.date === dateKey);
    const dayExerciseRecords = (exerciseRecords || []).filter((record) => record?.date === dateKey);
    const status = resolveProgressWindowStatus({
      dateKey,
      logEntry: logs?.[dateKey] || {},
      dailyCheckin: dailyCheckins?.[dateKey] || {},
      now,
      sessionRecords: daySessionRecords,
      exerciseRecords: dayExerciseRecords,
    });
    if (!["not_logged_grace"].includes(status)) metrics.countableCount += 1;
    if (COMPLETED_STATUSES.has(status)) metrics.completedCount += 1;
    if (hasStructuredLog(logs?.[dateKey] || {}, daySessionRecords, dayExerciseRecords)) metrics.loggedCount += 1;
    if (sessionDates.has(dateKey)) metrics.sessionCount += 1;
  });

  const relevantSessions = (sessionRecords || []).filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays, maxDays }));
  metrics.distanceMiles = round1(relevantSessions.reduce((sum, record) => sum + Number(record?.metrics?.distanceMiles || 0), 0)) || 0;
  metrics.durationMinutes = Math.round(relevantSessions.reduce((sum, record) => sum + Number(record?.metrics?.durationMinutes || 0), 0));
  metrics.consistencyRatio = metrics.countableCount > 0
    ? Number((metrics.completedCount / metrics.countableCount).toFixed(2))
    : 0;

  return metrics;
};

const createTrackedItem = ({
  key = "",
  label = "",
  kind = "proxy",
  metricRefs = [],
  status = GOAL_PROGRESS_STATUSES.building,
  currentDisplay = "",
  targetDisplay = "",
  trendDisplay = "",
  why = "",
  metricMeta = null,
} = {}) => ({
  key: sanitizeText(key, 60).toLowerCase(),
  label: sanitizeText(label, 80),
  kind: sanitizeText(kind, 20).toLowerCase() || "proxy",
  metricRefs: dedupeStrings(metricRefs.map((metricRef) => sanitizeText(metricRef, 60))).filter(Boolean),
  status,
  currentDisplay: sanitizeText(currentDisplay, 160),
  targetDisplay: sanitizeText(targetDisplay, 120),
  trendDisplay: sanitizeText(trendDisplay, 160),
  why: sanitizeText(why, 220),
  metricMeta: metricMeta && typeof metricMeta === "object"
    ? {
        valueFormat: sanitizeText(metricMeta?.valueFormat || "", 24).toLowerCase() || "",
        unit: sanitizeText(metricMeta?.unit || "", 24),
        direction: sanitizeText(metricMeta?.direction || "", 12).toLowerCase() || "",
        currentValue: toFiniteNumber(metricMeta?.currentValue, null),
        baselineValue: toFiniteNumber(metricMeta?.baselineValue, null),
        targetValue: toFiniteNumber(metricMeta?.targetValue, null),
        distanceValue: toFiniteNumber(metricMeta?.distanceValue, null),
        currentDate: sanitizeText(metricMeta?.currentDate || "", 24),
        baselineDate: sanitizeText(metricMeta?.baselineDate || "", 24),
      }
    : null,
});

const formatMetricValue = ({ value = null, valueFormat = "", unit = "" } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  if (valueFormat === "pace") return formatPace(parsed);
  if (valueFormat === "duration") {
    const totalSeconds = Math.max(0, Math.round(parsed));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  const digits = Math.abs(parsed % 1) > 0 ? 1 : 0;
  return `${formatNumber(parsed, digits)}${unit ? ` ${unit}` : ""}`;
};

const formatGoalDistanceLabel = ({
  currentValue = null,
  targetValue = null,
  unit = "",
  direction = "",
  valueFormat = "",
} = {}) => {
  const current = Number(currentValue);
  const target = Number(targetValue);
  if (!Number.isFinite(target)) return "Target still needs a clear anchor.";
  if (!Number.isFinite(current)) return "First current anchor still needs to be logged.";
  if (direction === "lower") {
    const remaining = Math.max(0, Math.round(current - target));
    if (remaining === 0) return valueFormat === "pace" ? "At or ahead of target pace." : "At or ahead of target.";
    return valueFormat === "pace" ? `${remaining} sec/mi to target pace` : `${remaining}${unit ? ` ${unit}` : ""} to goal`;
  }
  const remaining = Math.max(0, round1(target - current));
  if (remaining === 0) return "At or ahead of target.";
  return `${formatMetricValue({ value: remaining, unit, valueFormat: "" })} to goal`;
};

const computeProgressRatio = ({
  baselineValue = null,
  currentValue = null,
  targetValue = null,
  direction = "higher",
} = {}) => {
  const baseline = Number(baselineValue);
  const current = Number(currentValue);
  const target = Number(targetValue);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return null;
  if (!Number.isFinite(baseline) || baseline === target) {
    if (direction === "lower") return current <= target ? 1 : 0;
    return current >= target ? 1 : 0;
  }
  if (direction === "lower") {
    if (baseline <= target) return current <= target ? 1 : 0;
    return clamp01((baseline - current) / (baseline - target));
  }
  if (baseline >= target) return current >= target ? 1 : 0;
  return clamp01((current - baseline) / (target - baseline));
};

const buildExactProgressAnchor = ({
  goal = {},
  metricLabel = "",
  valueFormat = "",
  unit = "",
  direction = "higher",
  baselineValue = null,
  currentValue = null,
  targetValue = null,
  currentDate = "",
  baselineDate = "",
  status = GOAL_PROGRESS_STATUSES.building,
  emptyStateLine = "First anchor still needs to be logged.",
} = {}) => ({
  kind: "exact_metric",
  summary: sanitizeText(goal?.summary || "Goal", 120),
  metricLabel: sanitizeText(metricLabel || goal?.primaryMetric?.label || "Primary metric", 80),
  status,
  valueFormat: sanitizeText(valueFormat || "", 24).toLowerCase(),
  unit: sanitizeText(unit || "", 24),
  direction: sanitizeText(direction || "higher", 12).toLowerCase() || "higher",
  baselineValue: toFiniteNumber(baselineValue, null),
  currentValue: toFiniteNumber(currentValue, null),
  targetValue: toFiniteNumber(targetValue, null),
  baselineDate: sanitizeText(baselineDate || "", 24),
  currentDate: sanitizeText(currentDate || "", 24),
  baselineLabel: Number.isFinite(Number(baselineValue))
    ? `${formatMetricValue({ value: baselineValue, valueFormat, unit })} start`
    : "Start anchor pending",
  currentLabel: Number.isFinite(Number(currentValue))
    ? `${formatMetricValue({ value: currentValue, valueFormat, unit })} current`
    : "Current anchor pending",
  targetLabel: Number.isFinite(Number(targetValue))
    ? `${formatMetricValue({ value: targetValue, valueFormat, unit })} target`
    : "Target pending",
  distanceLabel: formatGoalDistanceLabel({ currentValue, targetValue, unit, direction, valueFormat }),
  progressRatio: computeProgressRatio({ baselineValue, currentValue, targetValue, direction }),
  emptyStateLine: sanitizeText(emptyStateLine, 140),
});

const buildStatusProgressAnchor = ({
  goal = {},
  trackingMode = GOAL_PROGRESS_TRACKING_MODES.proxy,
  status = GOAL_PROGRESS_STATUSES.building,
  statusSummary = "",
  honestyNote = "",
  nextReviewFocus = "",
} = {}) => ({
  kind: "status",
  summary: sanitizeText(goal?.summary || "Goal", 120),
  metricLabel: trackingMode === GOAL_PROGRESS_TRACKING_MODES.exploratory ? "Review anchor" : "Proxy tracking",
  status,
  headline: sanitizeText(
    status === GOAL_PROGRESS_STATUSES.reviewBased
      ? "Building through proxies"
      : status === GOAL_PROGRESS_STATUSES.needsData
      ? "Needs a fresh check-in"
      : "Building from real signals",
    80
  ),
  detailLine: sanitizeText(statusSummary || honestyNote || "This goal is better tracked through review anchors than a fake exact percentage.", 180),
  noteLine: sanitizeText(nextReviewFocus || honestyNote || "", 180),
});

const getTargetPaceSeconds = (primaryMetric = null) => {
  const targetSeconds = parseDurationTextToSeconds(primaryMetric?.targetValue || "");
  if (!Number.isFinite(targetSeconds)) return null;
  const metricKey = sanitizeText(primaryMetric?.key || "", 60).toLowerCase();
  const raceDistanceMiles = metricKey.includes("half_marathon")
    ? 13.1
    : metricKey.includes("marathon")
    ? 26.2
    : metricKey.includes("10k")
    ? 6.2137
    : metricKey.includes("5k")
    ? 3.1069
    : null;
  return raceDistanceMiles ? Math.round(targetSeconds / raceDistanceMiles) : null;
};

const getLiftKeyFromMetric = (metricKey = "") => {
  const safeKey = sanitizeText(metricKey, 60).toLowerCase();
  if (safeKey.includes("bench")) return "bench";
  if (safeKey.includes("squat")) return "squat";
  if (safeKey.includes("deadlift")) return "deadlift";
  if (safeKey.includes("overhead") || safeKey.includes("ohp")) return "ohp";
  return "";
};

const buildRunTrackedItems = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const runSessions = (dataIndex?.sessionRecords || []).filter((record) => record?.sessionFamily === "run");
  const orderedRunSessions = [...runSessions].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
  const recentRunSessions = runSessions.filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 }));
  const priorRunSessions = runSessions.filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 22, maxDays: 42 }));
  const manualBenchmarks = getManualRunBenchmarkSeries({ manualProgressInputs });
  const recentManualBenchmarks = manualBenchmarks
    .filter((entry) => isWithinAgeWindow({ dateKey: entry?.date || "", now, minDays: 0, maxDays: 21 }));
  const latestManualBenchmark = recentManualBenchmarks[recentManualBenchmarks.length - 1] || null;
  const orderedManualBenchmarks = [...manualBenchmarks].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
  const recentPaces = recentRunSessions.map((record) => Number(record?.metrics?.paceSeconds || 0)).filter((value) => Number.isFinite(value) && value > 0);
  const benchmarkPaces = recentManualBenchmarks.map((entry) => Number(entry?.paceSeconds || 0)).filter((value) => Number.isFinite(value) && value > 0);
  const recentAveragePace = average(recentPaces.slice(-5));
  const benchmarkAveragePace = average(benchmarkPaces.slice(-5));
  const effectiveRecentPace = recentAveragePace ?? benchmarkAveragePace;
  const targetPaceSeconds = getTargetPaceSeconds(goal?.primaryMetric);
  const firstManualBenchmarkWithPace = orderedManualBenchmarks.find((entry) => Number.isFinite(entry?.paceSeconds) && entry.paceSeconds > 0) || null;
  const firstRunSessionWithPace = orderedRunSessions.find((record) => Number.isFinite(record?.metrics?.paceSeconds) && record.metrics.paceSeconds > 0) || null;
  const baselinePace = Number.isFinite(firstManualBenchmarkWithPace?.paceSeconds)
    ? firstManualBenchmarkWithPace.paceSeconds
    : Number.isFinite(firstRunSessionWithPace?.metrics?.paceSeconds)
    ? firstRunSessionWithPace.metrics.paceSeconds
    : null;
  const currentPaceDate = latestManualBenchmark?.date || recentRunSessions.slice().sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || ""))).slice(-1)[0]?.date || "";
  const baselinePaceDate = firstManualBenchmarkWithPace?.date || firstRunSessionWithPace?.date || "";
  const recentVolume = buildTrainingWindow({
    logs: dataIndex?.logs,
    dailyCheckins: dataIndex?.dailyCheckins,
    sessionRecords: runSessions,
    exerciseRecords: [],
    now,
    minDays: 0,
    maxDays: 14,
  });
  const priorVolume = buildTrainingWindow({
    logs: dataIndex?.logs,
    dailyCheckins: dataIndex?.dailyCheckins,
    sessionRecords: runSessions,
    exerciseRecords: [],
    now,
    minDays: 15,
    maxDays: 28,
  });
  const longestRecentRun = [...recentRunSessions].sort((a, b) => {
    const aValue = Number(a?.metrics?.distanceMiles || a?.metrics?.durationMinutes || 0);
    const bValue = Number(b?.metrics?.distanceMiles || b?.metrics?.durationMinutes || 0);
    return aValue - bValue;
  }).slice(-1)[0] || null;
  const longestPriorRun = [...priorRunSessions].sort((a, b) => {
    const aValue = Number(a?.metrics?.distanceMiles || a?.metrics?.durationMinutes || 0);
    const bValue = Number(b?.metrics?.distanceMiles || b?.metrics?.durationMinutes || 0);
    return aValue - bValue;
  }).slice(-1)[0] || null;
  const qualityCount = recentRunSessions.filter((record) => /tempo|interval|race/i.test(`${record?.sessionType || ""} ${record?.sessionLabel || ""}`)).length;

  const paceItem = createTrackedItem({
    key: "goal_pace_anchor",
    label: "Goal pace anchor",
    kind: "primary",
    metricRefs: [goal?.primaryMetric?.key || ""],
    status: !targetPaceSeconds || !effectiveRecentPace
      ? GOAL_PROGRESS_STATUSES.needsData
      : effectiveRecentPace <= targetPaceSeconds + 10
      ? GOAL_PROGRESS_STATUSES.onTrack
      : GOAL_PROGRESS_STATUSES.building,
    currentDisplay: recentAveragePace
      ? `Recent pace ${formatPace(recentAveragePace)}`
      : latestManualBenchmark?.paceSeconds
      ? `Recent benchmark pace ${formatPace(latestManualBenchmark.paceSeconds)} on ${latestManualBenchmark.date}`
      : "No paced runs logged yet",
    targetDisplay: targetPaceSeconds ? `Goal pace ${formatPace(targetPaceSeconds)}` : "",
    trendDisplay: (Number.isFinite(effectiveRecentPace) && Number.isFinite(targetPaceSeconds))
      ? `${Math.abs(Math.round(effectiveRecentPace - targetPaceSeconds))} sec/mi ${effectiveRecentPace > targetPaceSeconds ? "slower" : effectiveRecentPace < targetPaceSeconds ? "faster" : "from"} than target`
      : "",
    why: "Event goals move first through repeatable training pace, not just race-day guesses.",
    metricMeta: {
      valueFormat: "pace",
      unit: "sec/mi",
      direction: "lower",
      currentValue: effectiveRecentPace,
      baselineValue: baselinePace,
      targetValue: targetPaceSeconds,
      currentDate: currentPaceDate,
      baselineDate: baselinePaceDate,
    },
  });

  const volumeItem = createTrackedItem({
    key: "weekly_run_frequency",
    label: "Run volume",
    kind: "proxy",
    metricRefs: ["weekly_run_frequency"],
    status: recentVolume.sessionCount >= 2 ? GOAL_PROGRESS_STATUSES.onTrack : recentVolume.sessionCount >= 1 ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: recentVolume.sessionCount > 0
      ? `${recentVolume.sessionCount} runs, ${formatNumber(recentVolume.distanceMiles, 1)} mi, ${recentVolume.durationMinutes} min in the last 14 days`
      : "No recent run volume logged",
    trendDisplay: priorVolume.sessionCount > 0
      ? `${formatSignedDelta(recentVolume.distanceMiles - priorVolume.distanceMiles, 1, "mi")} vs the prior 14 days`
      : "",
    why: "Run frequency and recent volume show whether the event goal has enough weekly support.",
  });

  const progressionTargetLabel = longestRecentRun?.metrics?.distanceMiles
    ? `${formatNumber(longestRecentRun.metrics.distanceMiles, 1)} mi longest run`
    : longestRecentRun?.metrics?.durationMinutes
    ? `${longestRecentRun.metrics.durationMinutes} min longest run`
    : "No long run logged yet";
  const priorProgressionValue = Number(longestPriorRun?.metrics?.distanceMiles || longestPriorRun?.metrics?.durationMinutes || 0);
  const recentProgressionValue = Number(longestRecentRun?.metrics?.distanceMiles || longestRecentRun?.metrics?.durationMinutes || 0);
  const progressionUnit = Number(longestRecentRun?.metrics?.distanceMiles || 0) > 0 ? "mi" : "min";
  const progressionItem = createTrackedItem({
    key: "long_run_duration",
    label: "Workout progression",
    kind: "proxy",
    metricRefs: ["long_run_duration", "quality_session_completion"],
    status: longestRecentRun ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: `${progressionTargetLabel}${qualityCount > 0 ? ` and ${qualityCount} quality sessions in the last 21 days` : ""}`,
    trendDisplay: longestPriorRun
      ? `${formatSignedDelta(recentProgressionValue - priorProgressionValue, 1, progressionUnit)} vs the prior progression window`
      : "",
    why: "Long-run depth and quality-session repetition show whether race readiness is actually building.",
  });
  const supportItem = buildGoalSupportContributionItem({
    goal,
    exerciseRecords: dataIndex?.exerciseRecords || [],
    now,
  });

  return {
    trackedItems: [paceItem, volumeItem, progressionItem, ...(supportItem ? [supportItem] : [])],
    progressAnchor: targetPaceSeconds
      ? buildExactProgressAnchor({
          goal,
          metricLabel: goal?.primaryMetric?.label || "Goal pace",
          valueFormat: "pace",
          unit: "sec/mi",
          direction: "lower",
          baselineValue: baselinePace,
          currentValue: effectiveRecentPace,
          targetValue: targetPaceSeconds,
          currentDate: currentPaceDate,
          baselineDate: baselinePaceDate,
          status: paceItem.status,
          emptyStateLine: "First paced run or benchmark still needs to be logged.",
        })
      : null,
  };
};

const formatSwimBenchmarkLabel = (benchmark = null) => {
  if (!benchmark) return "No swim benchmark logged yet";
  const distanceLabel = Number.isFinite(benchmark?.distance)
    ? `${formatNumber(benchmark.distance, 0)} ${benchmark.distanceUnit || "yd"}`
    : "";
  const durationLabel = sanitizeText(benchmark?.duration || "", 24);
  return [distanceLabel, durationLabel ? `in ${durationLabel}` : "", benchmark?.date ? `on ${benchmark.date}` : ""]
    .filter(Boolean)
    .join(" ");
};

const isSwimGoal = (goal = {}) => (
  goal?.primaryDomain === "swimming_endurance_technique"
  || (goal?.proxyMetrics || []).some((metric) => /swim/.test(String(metric?.key || "")))
  || /\bswim\b/i.test(String(goal?.summary || ""))
);

const buildSwimTrackedItems = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const swimBenchmarks = getManualSwimBenchmarkSeries({ manualProgressInputs });
  const recentBenchmarks = swimBenchmarks.filter((entry) => isWithinAgeWindow({ dateKey: entry?.date || "", now, minDays: 0, maxDays: 42 }));
  const latestBenchmark = recentBenchmarks[recentBenchmarks.length - 1] || swimBenchmarks[swimBenchmarks.length - 1] || null;
  const comparableBenchmarks = swimBenchmarks.filter((entry) => (
    Number.isFinite(entry?.durationSeconds)
    && Number.isFinite(latestBenchmark?.distance)
    && entry?.distance === latestBenchmark?.distance
    && String(entry?.distanceUnit || "") === String(latestBenchmark?.distanceUnit || "")
  ));
  const firstComparable = comparableBenchmarks[0] || null;
  const latestComparable = comparableBenchmarks[comparableBenchmarks.length - 1] || latestBenchmark || null;
  const improvementSeconds = Number.isFinite(firstComparable?.durationSeconds) && Number.isFinite(latestComparable?.durationSeconds)
    ? Math.round(firstComparable.durationSeconds - latestComparable.durationSeconds)
    : null;
  const swimRealitySeries = toArray(manualProgressInputs?.metrics?.swim_access_reality || manualProgressInputs?.swim_access_reality)
    .map((row) => ({
      date: sanitizeText(row?.date || row?.dateKey || "", 24),
      value: sanitizeText(row?.label || row?.value || row?.note || "", 80),
      note: sanitizeText(row?.note || row?.label || row?.value || "", 120),
    }))
    .filter((row) => row.date && row.value)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestReality = swimRealitySeries[swimRealitySeries.length - 1] || null;

  const benchmarkItem = createTrackedItem({
    key: "swim_benchmark_retest",
    label: "Swim benchmark",
    kind: goal?.primaryMetric?.targetValue ? "primary" : "proxy",
    metricRefs: ["swim_benchmark_retest", goal?.primaryMetric?.key || ""],
    status: latestBenchmark
      ? GOAL_PROGRESS_STATUSES.building
      : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: latestBenchmark
      ? `Latest benchmark ${formatSwimBenchmarkLabel(latestBenchmark)}`
      : "First swim benchmark still needs to be logged",
    targetDisplay: goal?.primaryMetric?.targetValue
      ? `${goal.primaryMetric.label} ${goal.primaryMetric.targetValue}`
      : "Retest the same benchmark every 2 to 4 weeks",
    trendDisplay: improvementSeconds === null
      ? ""
      : improvementSeconds > 0
      ? `${Math.abs(improvementSeconds)} sec faster than your first matched benchmark`
      : improvementSeconds < 0
      ? `${Math.abs(improvementSeconds)} sec slower than your first matched benchmark`
      : "No change from the first matched benchmark yet",
    why: "Swim speed needs a repeatable benchmark, not a vague promise to swim harder.",
    metricMeta: {
      valueFormat: "duration",
      unit: "sec",
      direction: "lower",
      currentValue: latestComparable?.durationSeconds,
      baselineValue: firstComparable?.durationSeconds,
      currentDate: latestComparable?.date || latestBenchmark?.date || "",
      baselineDate: firstComparable?.date || "",
    },
  });

  const realityItem = createTrackedItem({
    key: "swim_access_reality",
    label: "Swim reality",
    kind: "proxy",
    metricRefs: ["swim_access_reality"],
    status: latestReality?.note || latestReality?.value ? GOAL_PROGRESS_STATUSES.onTrack : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: latestReality?.note
      ? latestReality.note
      : latestReality?.value
      ? `Current swim reality: ${latestReality.value}`
      : "Pool or open-water reality still needs to be captured",
    why: "Pool access versus open water changes the whole early swim block, so the app keeps that visible.",
  });

  const consistencyItem = buildConsistencyItem({
    key: "weekly_swim_frequency",
    label: "Swim consistency",
    why: "Swim goals stay honest when the week includes repeatable swim exposures, even before split-level logging is polished.",
    dataIndex,
    now,
  });
  const supportItem = buildGoalSupportContributionItem({
    goal,
    exerciseRecords: dataIndex?.exerciseRecords || [],
    now,
  });

  return {
    trackedItems: [benchmarkItem, realityItem, consistencyItem, ...(supportItem ? [supportItem] : [])],
    progressAnchor: null,
  };
};

const buildStrengthTrackedItems = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const exerciseRecords = dataIndex?.exerciseRecords || [];
  const manualBenchmarks = getManualLiftBenchmarkSeries({ manualProgressInputs });
  const liftKey = getLiftKeyFromMetric(goal?.primaryMetric?.key || "");
  const primaryLabel = sanitizeText(goal?.primaryMetric?.label || "", 80).toLowerCase();
  const targetedRecords = [
    ...exerciseRecords.filter((record) => (
      (liftKey && record?.liftKey === liftKey)
      || (primaryLabel && String(record?.exercise || "").toLowerCase().includes(primaryLabel.split(" ")[0]))
    )),
    ...manualBenchmarks.filter((record) => (
      (liftKey && record?.liftKey === liftKey)
      || (primaryLabel && String(record?.exercise || "").toLowerCase().includes(primaryLabel.split(" ")[0]))
    )),
  ].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
  const recentTargetedRecords = targetedRecords.filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 }));
  const firstTargetedRecord = targetedRecords[0] || null;
  const latestTargetedRecord = targetedRecords[targetedRecords.length - 1] || null;
  const bestTargetedRecord = [...targetedRecords].sort((a, b) => {
    const aValue = Number(a?.actual?.weight ?? a?.prescribed?.weight ?? 0);
    const bValue = Number(b?.actual?.weight ?? b?.prescribed?.weight ?? 0);
    return aValue - bValue;
  }).slice(-1)[0] || null;
  const latestWeight = Number(latestTargetedRecord?.actual?.weight ?? latestTargetedRecord?.prescribed?.weight ?? 0) || null;
  const firstWeight = Number(firstTargetedRecord?.actual?.weight ?? firstTargetedRecord?.prescribed?.weight ?? 0) || null;
  const bestWeight = Number(bestTargetedRecord?.actual?.weight ?? bestTargetedRecord?.prescribed?.weight ?? 0) || null;
  const targetWeight = parsePrimaryMetricTargetNumber(goal?.primaryMetric);

  const topSetItem = createTrackedItem({
    key: "top_set_load",
    label: "Working sets",
    kind: "proxy",
    metricRefs: [goal?.primaryMetric?.key || "", "top_set_load"],
    status: latestTargetedRecord ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: latestTargetedRecord
      ? `${latestWeight || 0} lb x ${latestTargetedRecord?.actual?.reps || latestTargetedRecord?.prescribed?.reps || 0} x ${latestTargetedRecord?.actual?.sets || latestTargetedRecord?.prescribed?.sets || 0} on ${latestTargetedRecord.date}`
      : "No targeted lift sets logged yet",
    targetDisplay: targetWeight ? `${targetWeight} lb target` : "",
    trendDisplay: (Number.isFinite(latestWeight) && Number.isFinite(firstWeight))
      ? `${formatSignedDelta(latestWeight - firstWeight, 0, "lb")} vs first logged exposure`
      : "",
    why: "The latest working sets show whether the goal lift is actually moving under current training fatigue.",
    metricMeta: {
      valueFormat: "load",
      unit: "lb",
      direction: "higher",
      currentValue: latestWeight,
      baselineValue: firstWeight,
      targetValue: targetWeight,
      currentDate: latestTargetedRecord?.date || "",
      baselineDate: firstTargetedRecord?.date || "",
    },
  });

  const recordItem = createTrackedItem({
    key: "performance_record",
    label: "Performance record",
    kind: "primary",
    metricRefs: [goal?.primaryMetric?.key || ""],
    status: bestTargetedRecord ? GOAL_PROGRESS_STATUSES.onTrack : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: bestTargetedRecord
      ? `Best logged top set ${bestWeight || 0} lb on ${bestTargetedRecord.date}`
      : "No strength record logged yet",
    trendDisplay: (Number.isFinite(bestWeight) && Number.isFinite(firstWeight))
      ? `${formatSignedDelta(bestWeight - firstWeight, 0, "lb")} from first logged exposure`
      : "",
    why: "A strength goal needs a hard anchor in real logged performance, not only planned percentages.",
    metricMeta: {
      valueFormat: "load",
      unit: "lb",
      direction: "higher",
      currentValue: bestWeight,
      baselineValue: firstWeight,
      targetValue: targetWeight,
      currentDate: bestTargetedRecord?.date || latestTargetedRecord?.date || "",
      baselineDate: firstTargetedRecord?.date || "",
    },
  });
  const supportItem = buildGoalSupportContributionItem({
    goal,
    exerciseRecords,
    now,
  });

  if (Number.isFinite(targetWeight) && targetWeight > 0) {
    const remaining = Number.isFinite(bestWeight) ? Math.max(0, targetWeight - bestWeight) : null;
    const incrementStep = targetWeight >= 225 ? 2.5 : 5;
    const projectedItem = createTrackedItem({
      key: "projected_goal_progress",
      label: "Projected goal progress",
      kind: "primary",
      metricRefs: [goal?.primaryMetric?.key || ""],
      status: remaining === null
        ? GOAL_PROGRESS_STATUSES.needsData
        : remaining === 0
        ? GOAL_PROGRESS_STATUSES.onTrack
        : GOAL_PROGRESS_STATUSES.building,
      currentDisplay: remaining === null
        ? `First ${targetWeight} lb exposure still needs to be logged`
        : remaining === 0
        ? `${targetWeight} lb has been touched or exceeded`
        : `${remaining} lb remaining to ${targetWeight} lb`,
      trendDisplay: remaining > 0
        ? `Roughly ${Math.max(1, Math.ceil(remaining / incrementStep))} more ${incrementStep} lb jumps at current progression`
        : "Hold the load for repeatable quality work",
      why: "Projected gap-to-target keeps the strength goal honest without creating a fake certainty date.",
      metricMeta: {
        valueFormat: "load",
        unit: "lb",
        direction: "higher",
        currentValue: bestWeight ?? latestWeight,
        baselineValue: firstWeight,
        targetValue: targetWeight,
        distanceValue: remaining,
        currentDate: bestTargetedRecord?.date || latestTargetedRecord?.date || "",
        baselineDate: firstTargetedRecord?.date || "",
      },
    });
    return {
      trackedItems: [topSetItem, recordItem, ...(supportItem ? [supportItem] : []), projectedItem],
      progressAnchor: buildExactProgressAnchor({
        goal,
        metricLabel: goal?.primaryMetric?.label || "Strength goal",
        valueFormat: "load",
        unit: "lb",
        direction: "higher",
        baselineValue: firstWeight,
        currentValue: bestWeight ?? latestWeight,
        targetValue: targetWeight,
        currentDate: bestTargetedRecord?.date || latestTargetedRecord?.date || "",
        baselineDate: firstTargetedRecord?.date || "",
        status: projectedItem.status,
        emptyStateLine: `First ${targetWeight} lb exposure still needs to be logged.`,
      }),
    };
  }

  const consistencyItem = createTrackedItem({
    key: "compound_lift_consistency",
    label: "Lift consistency",
    kind: "proxy",
    metricRefs: ["compound_lift_consistency", "weekly_strength_frequency"],
    status: recentTargetedRecords.length >= 2 ? GOAL_PROGRESS_STATUSES.onTrack : recentTargetedRecords.length >= 1 ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: recentTargetedRecords.length > 0
      ? `${recentTargetedRecords.length} targeted lift exposures in the last 21 days`
      : "No recent targeted lift exposures logged",
    why: "Maintenance and non-deadline strength goals still need repeatable exposures to stay real.",
  });

  return {
    trackedItems: [topSetItem, recordItem, ...(supportItem ? [supportItem] : []), consistencyItem],
    progressAnchor: null,
  };
};

const buildHybridDomainWindow = ({
  dataIndex = {},
  now = new Date(),
  minDays = 0,
  maxDays = 14,
  domain = "strength",
} = {}) => {
  const safeDomain = sanitizeText(domain, 24).toLowerCase();
  const dateKeys = new Set();
  const logs = dataIndex?.logs || {};
  const sessionRecords = dataIndex?.sessionRecords || [];
  const exerciseRecords = dataIndex?.exerciseRecords || [];

  Object.entries(logs).forEach(([dateKey, logEntry]) => {
    if (!isWithinAgeWindow({ dateKey, now, minDays, maxDays })) return;
    const rawText = `${logEntry?.type || ""} ${logEntry?.label || ""} ${logEntry?.actualSession?.sessionType || ""}`.toLowerCase();
    const hasStrengthSignal = Array.isArray(logEntry?.performanceRecords) && logEntry.performanceRecords.length > 0;
    const matchesStrength = hasStrengthSignal || /strength|bench|squat|deadlift|press|row|lift|prehab/.test(rawText);
    const matchesEndurance = /run|tempo|interval|easy|long|swim|bike|ride|conditioning|cardio|otf|aerobic/.test(rawText);
    if (safeDomain === "strength" && matchesStrength) dateKeys.add(dateKey);
    if (safeDomain === "endurance" && matchesEndurance) dateKeys.add(dateKey);
  });

  sessionRecords.forEach((record) => {
    if (!isWithinAgeWindow({ dateKey: record?.date || "", now, minDays, maxDays })) return;
    const family = sanitizeText(record?.sessionFamily || "", 24).toLowerCase();
    const typeText = `${record?.sessionType || ""} ${record?.sessionLabel || ""}`.toLowerCase();
    if (safeDomain === "strength" && (family === "strength" || family === "hybrid" || /strength|lift|bench|squat|deadlift|press/.test(typeText))) {
      dateKeys.add(record.date);
    }
    if (safeDomain === "endurance" && (family === "run" || family === "hybrid" || /run|swim|bike|ride|conditioning|cardio|tempo|interval|long|aerobic/.test(typeText))) {
      dateKeys.add(record.date);
    }
  });

  if (safeDomain === "strength") {
    exerciseRecords.forEach((record) => {
      if (!isWithinAgeWindow({ dateKey: record?.date || "", now, minDays, maxDays })) return;
      dateKeys.add(record.date);
    });
  }

  return [...dateKeys].sort();
};

const buildHybridFrequencyItem = ({
  key = "",
  label = "",
  currentCount = 0,
  priorCount = 0,
  why = "",
} = {}) => createTrackedItem({
  key,
  label,
  kind: "proxy",
  metricRefs: [key],
  status: currentCount >= 2 ? GOAL_PROGRESS_STATUSES.onTrack : currentCount >= 1 ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
  currentDisplay: currentCount > 0
    ? `${currentCount} ${label.toLowerCase()} in the last 14 days`
    : `No recent ${label.toLowerCase()} logged`,
  trendDisplay: priorCount > 0
    ? `${formatSignedDelta(currentCount - priorCount, 0, "days")} vs the prior 14 days`
    : "",
  why,
});

const buildHybridTrackedItems = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const proxyMetricKeys = new Set((goal?.proxyMetrics || []).map((metric) => sanitizeText(metric?.key || metric, 60).toLowerCase()));
  const primaryMetricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const hybridMetricKey = primaryMetricKey || "hybrid_consistency";
  const hybridMetricLabel = sanitizeText(goal?.primaryMetric?.label || "Hybrid consistency", 80) || "Hybrid consistency";
  const recentStrengthDates = buildHybridDomainWindow({ dataIndex, now, minDays: 0, maxDays: 14, domain: "strength" });
  const priorStrengthDates = buildHybridDomainWindow({ dataIndex, now, minDays: 15, maxDays: 28, domain: "strength" });
  const recentEnduranceDates = buildHybridDomainWindow({ dataIndex, now, minDays: 0, maxDays: 14, domain: "endurance" });
  const priorEnduranceDates = buildHybridDomainWindow({ dataIndex, now, minDays: 15, maxDays: 28, domain: "endurance" });
  const recentCombinedDays = new Set([...recentStrengthDates, ...recentEnduranceDates]).size;
  const priorCombinedDays = new Set([...priorStrengthDates, ...priorEnduranceDates]).size;

  const hybridItem = createTrackedItem({
    key: hybridMetricKey,
    label: hybridMetricLabel,
    kind: "primary",
    metricRefs: [hybridMetricKey, "weekly_strength_frequency", "weekly_run_frequency", "conditioning_consistency"],
    status: recentStrengthDates.length >= 1 && recentEnduranceDates.length >= 1
      ? GOAL_PROGRESS_STATUSES.onTrack
      : recentCombinedDays > 0
      ? GOAL_PROGRESS_STATUSES.building
      : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: recentCombinedDays > 0
      ? `${recentStrengthDates.length} strength days and ${recentEnduranceDates.length} endurance days in the last 14 days`
      : "Both lanes still need recent logs",
    trendDisplay: priorCombinedDays > 0
      ? `${formatSignedDelta(recentCombinedDays - priorCombinedDays, 0, "days")} vs the prior 14 days`
      : "",
    why: "Hybrid plans only stay honest when both domains keep showing up in the real training week.",
  });

  const strengthItem = buildHybridFrequencyItem({
    key: "weekly_strength_frequency",
    label: "Strength days",
    currentCount: recentStrengthDates.length,
    priorCount: priorStrengthDates.length,
    why: "The strength lane has to stay visible or the plan is no longer a real hybrid.",
  });

  const enduranceKey = proxyMetricKeys.has("weekly_run_frequency")
    ? "weekly_run_frequency"
    : proxyMetricKeys.has("conditioning_consistency")
    ? "conditioning_consistency"
    : proxyMetricKeys.has("work_capacity_check")
    ? "work_capacity_check"
    : "weekly_run_frequency";
  const enduranceLabel = enduranceKey === "weekly_run_frequency"
    ? "Endurance days"
    : enduranceKey === "conditioning_consistency"
    ? "Conditioning days"
    : "Work-capacity days";
  const enduranceItem = buildHybridFrequencyItem({
    key: enduranceKey,
    label: enduranceLabel,
    currentCount: recentEnduranceDates.length,
    priorCount: priorEnduranceDates.length,
    why: "The endurance lane has to stay visible or the plan drifts back to a single-domain week.",
  });

  const items = [hybridItem, strengthItem, enduranceItem];
  if (proxyMetricKeys.has("bodyweight_trend")) {
    items.push(buildBodyweightTrendItem({ goal, dataIndex, now }));
  }
  if (proxyMetricKeys.has("waist_circumference")) {
    items.push(buildWaistTrendItem({ now, manualProgressInputs }));
  }
  const supportItem = buildGoalSupportContributionItem({
    goal,
    exerciseRecords: dataIndex?.exerciseRecords || [],
    now,
  });
  if (supportItem) items.push(supportItem);
  return {
    trackedItems: items,
    progressAnchor: null,
  };
};

const buildBodyweightTrendItem = ({ goal = {}, dataIndex = {}, now = new Date() } = {}) => {
  const recentBodyweights = (dataIndex?.bodyweightSeries || []).filter((entry) => isWithinAgeWindow({ dateKey: entry?.date || "", now, minDays: 0, maxDays: 21 }));
  const latest = recentBodyweights[recentBodyweights.length - 1] || null;
  const first = recentBodyweights[0] || null;
  const delta = latest && first ? round1(latest.value - first.value) : null;
  const targetValue = parsePrimaryMetricTargetNumber(goal?.primaryMetric);
  const direction = Number.isFinite(targetValue) && Number.isFinite(first?.value) && targetValue > first.value ? "higher" : "lower";
  return createTrackedItem({
    key: "bodyweight_trend",
    label: "Bodyweight trend",
    kind: "proxy",
    metricRefs: ["bodyweight_trend", goal?.primaryMetric?.key || ""],
    status: recentBodyweights.length >= 2 ? GOAL_PROGRESS_STATUSES.building : recentBodyweights.length === 1 ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: latest ? `${formatNumber(latest.value, 1)} lb latest` : "No bodyweight entries logged yet",
    trendDisplay: delta !== null ? `${formatSignedDelta(delta, 1, "lb")} over the last 21 days` : "",
    why: "Body-composition goals stay honest through repeatable trend data instead of day-to-day scale noise.",
    metricMeta: {
      valueFormat: "load",
      unit: "lb",
      direction,
      currentValue: latest?.value,
      baselineValue: first?.value,
      targetValue,
      currentDate: latest?.date || "",
      baselineDate: first?.date || "",
    },
  });
};

const buildWaistTrendItem = ({ now = new Date(), manualProgressInputs = {} } = {}) => {
  const waistSeries = getManualMetricSeries({ manualProgressInputs, key: "waist_circumference" })
    .filter((entry) => isWithinAgeWindow({ dateKey: entry?.date || "", now, minDays: 0, maxDays: 35 }));
  const latest = waistSeries[waistSeries.length - 1] || null;
  const first = waistSeries[0] || null;
  const delta = latest && first && Number.isFinite(latest.value) && Number.isFinite(first.value)
    ? round1(latest.value - first.value)
    : null;
  return createTrackedItem({
    key: "waist_circumference",
    label: "Waist circumference",
    kind: "proxy",
    metricRefs: ["waist_circumference"],
    status: latest ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: latest ? `${formatNumber(latest.value, 1)} in latest` : "First waist check still needed",
    trendDisplay: delta !== null ? `${formatSignedDelta(delta, 1, "in")} across the current review window` : "",
    why: "Waist change is a stronger physique proxy than trying to guess visual progress from memory.",
  });
};

const buildPhotoReviewItem = ({ now = new Date(), manualProgressInputs = {} } = {}) => {
  const photoSeries = getManualMetricSeries({ manualProgressInputs, key: "progress_photos" })
    .filter((entry) => isWithinAgeWindow({ dateKey: entry?.date || "", now, minDays: 0, maxDays: 35 }));
  const latest = photoSeries[photoSeries.length - 1] || null;
  const countThisWindow = photoSeries.reduce((sum, entry) => sum + (Number.isFinite(entry?.count) ? Number(entry.count) : 1), 0);
  return createTrackedItem({
    key: "progress_photos",
    label: "Manual photo review (future)",
    kind: "proxy",
    metricRefs: ["progress_photos"],
    status: latest ? GOAL_PROGRESS_STATUSES.reviewBased : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: latest
      ? `${countThisWindow} manual photo review${countThisWindow === 1 ? "" : "s"} logged in the current review window`
      : "Manual photo review is not active in the app yet",
    trendDisplay: latest ? `Latest manual photo review ${latest.date}` : "",
    why: "Photo-based appearance review is deferred for now, so treat this as a manual/future checkpoint rather than a live upload feature.",
  });
};

const buildConsistencyItem = ({ key = "weekly_training_frequency", label = "Consistency", why = "", dataIndex = {}, now = new Date() } = {}) => {
  const recentWindow = buildTrainingWindow({
    logs: dataIndex?.logs,
    dailyCheckins: dataIndex?.dailyCheckins,
    sessionRecords: dataIndex?.sessionRecords,
    exerciseRecords: dataIndex?.exerciseRecords,
    now,
    minDays: 0,
    maxDays: 14,
  });
  const priorWindow = buildTrainingWindow({
    logs: dataIndex?.logs,
    dailyCheckins: dataIndex?.dailyCheckins,
    sessionRecords: dataIndex?.sessionRecords,
    exerciseRecords: dataIndex?.exerciseRecords,
    now,
    minDays: 15,
    maxDays: 28,
  });
  return createTrackedItem({
    key,
    label,
    kind: "proxy",
    metricRefs: [key, "checkin_consistency", "thirty_day_adherence"],
    status: recentWindow.completedCount >= 3 ? GOAL_PROGRESS_STATUSES.onTrack : recentWindow.completedCount >= 1 ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: recentWindow.countableCount > 0
      ? `${recentWindow.completedCount}/${recentWindow.countableCount} completed or modified training days in the last 14 days`
      : "No recent consistency data logged yet",
    trendDisplay: priorWindow.countableCount > 0
      ? `${formatSignedDelta(recentWindow.completedCount - priorWindow.completedCount, 0, "days")} vs the prior 14 days`
      : "",
    why,
  });
};

const buildReadinessItem = ({ dataIndex = {}, now = new Date() } = {}) => {
  const weeklyCheckins = (dataIndex?.weeklyCheckins || []).filter((entry) => (asDate(now).getTime() - Number(entry?.ts || 0)) <= (28 * ONE_DAY_MS));
  const latestWindow = weeklyCheckins.slice(-3);
  const earlierWindow = weeklyCheckins.slice(-6, -3);
  const latestScore = average(latestWindow.map((entry) => average([
    entry?.energy,
    entry?.confidence,
    Number.isFinite(entry?.stress) ? (6 - entry.stress) : null,
  ])));
  const priorScore = average(earlierWindow.map((entry) => average([
    entry?.energy,
    entry?.confidence,
    Number.isFinite(entry?.stress) ? (6 - entry.stress) : null,
  ])));
  const recentFeel = average(
    (dataIndex?.sessionRecords || [])
      .filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 14 }))
      .map((record) => record?.metrics?.feelScore)
  );
  const useWeekly = Number.isFinite(latestScore);
  return createTrackedItem({
    key: "readiness_anchor",
    label: "Readiness trend",
    kind: "review",
    metricRefs: ["checkin_consistency"],
    status: useWeekly || Number.isFinite(recentFeel) ? GOAL_PROGRESS_STATUSES.reviewBased : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: useWeekly
      ? `Weekly readiness ${latestScore.toFixed(1)}/5 from recent check-ins`
      : Number.isFinite(recentFeel)
      ? `Session feel ${recentFeel.toFixed(1)}/5 across the last 14 days`
      : "Readiness trend still needs check-ins",
    trendDisplay: useWeekly && Number.isFinite(priorScore)
      ? `${formatSignedDelta(latestScore - priorScore, 1, "/5")} vs the prior readiness window`
      : "",
    why: "General rebuild goals need a recovery/readiness signal so consistency does not get mistaken for resilience.",
  });
};

const buildBaselineImprovementItem = ({ dataIndex = {}, now = new Date() } = {}) => {
  const recentWindow = buildTrainingWindow({
    logs: dataIndex?.logs,
    dailyCheckins: dataIndex?.dailyCheckins,
    sessionRecords: dataIndex?.sessionRecords,
    exerciseRecords: dataIndex?.exerciseRecords,
    now,
    minDays: 0,
    maxDays: 14,
  });
  const priorWindow = buildTrainingWindow({
    logs: dataIndex?.logs,
    dailyCheckins: dataIndex?.dailyCheckins,
    sessionRecords: dataIndex?.sessionRecords,
    exerciseRecords: dataIndex?.exerciseRecords,
    now,
    minDays: 15,
    maxDays: 28,
  });
  return createTrackedItem({
    key: "baseline_improvement",
    label: "Baseline improvement",
    kind: "review",
    metricRefs: ["weekly_training_frequency", "thirty_day_adherence"],
    status: recentWindow.sessionCount > 0 ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: recentWindow.sessionCount > 0
      ? `${recentWindow.sessionCount} sessions, ${recentWindow.durationMinutes} min in the last 14 days`
      : "First baseline block still needs data",
    trendDisplay: priorWindow.sessionCount > 0
      ? `${formatSignedDelta(recentWindow.sessionCount - priorWindow.sessionCount, 0, "sessions")} and ${formatSignedDelta(recentWindow.durationMinutes - priorWindow.durationMinutes, 0, "min")} vs the prior 14 days`
      : "",
    why: "Exploratory goals become real when the current baseline is clearly better than the recent baseline.",
  });
};

const buildBenchmarkAnchorItem = ({ dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const recentSession = [...(dataIndex?.sessionRecords || [])]
    .filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 }))
    .slice(-1)[0] || null;
  const recentExercise = [...(dataIndex?.exerciseRecords || [])]
    .filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 }))
    .slice(-1)[0] || null;
  const recentManualRun = getManualRunBenchmarkSeries({ manualProgressInputs })
    .filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 }))
    .slice(-1)[0] || null;
  const recentManualLift = getManualLiftBenchmarkSeries({ manualProgressInputs })
    .filter((record) => isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 }))
    .slice(-1)[0] || null;

  let currentDisplay = "First benchmark anchor still pending";
  if (recentSession?.sessionFamily === "run" && (Number(recentSession?.metrics?.distanceMiles || 0) > 0 || Number(recentSession?.metrics?.durationMinutes || 0) > 0)) {
    const runBits = [
      Number(recentSession?.metrics?.distanceMiles || 0) > 0 ? `${formatNumber(recentSession.metrics.distanceMiles, 1)} mi` : "",
      Number(recentSession?.metrics?.durationMinutes || 0) > 0 ? `${recentSession.metrics.durationMinutes} min` : "",
      recentSession?.metrics?.paceSeconds ? formatPace(recentSession.metrics.paceSeconds) : "",
    ].filter(Boolean);
    currentDisplay = `Recent benchmark run: ${runBits.join(" / ")} on ${recentSession.date}`;
  } else if (recentManualRun && (Number(recentManualRun?.distanceMiles || 0) > 0 || Number(recentManualRun?.durationMinutes || 0) > 0 || Number(recentManualRun?.paceSeconds || 0) > 0)) {
    const runBits = [
      Number(recentManualRun?.distanceMiles || 0) > 0 ? `${formatNumber(recentManualRun.distanceMiles, 1)} mi` : "",
      Number(recentManualRun?.durationMinutes || 0) > 0 ? `${recentManualRun.durationMinutes} min` : "",
      recentManualRun?.paceSeconds ? formatPace(recentManualRun.paceSeconds) : sanitizeText(recentManualRun?.paceText || ""),
    ].filter(Boolean);
    currentDisplay = `Recent benchmark run: ${runBits.join(" / ")} on ${recentManualRun.date}`;
  } else if (recentExercise) {
    const load = Number(recentExercise?.actual?.weight ?? recentExercise?.prescribed?.weight ?? 0) || null;
    currentDisplay = load
      ? `Recent benchmark lift: ${recentExercise.exercise} ${load} lb x ${recentExercise?.actual?.reps || recentExercise?.prescribed?.reps || 0}`
      : `Recent benchmark lift: ${recentExercise.exercise}`;
  } else if (recentManualLift) {
    const load = Number(recentManualLift?.actual?.weight ?? recentManualLift?.prescribed?.weight ?? 0) || null;
    currentDisplay = load
      ? `Recent benchmark lift: ${recentManualLift.exercise} ${load} lb x ${recentManualLift?.actual?.reps || recentManualLift?.prescribed?.reps || 0}`
      : `Recent benchmark lift: ${recentManualLift.exercise}`;
  }

  return createTrackedItem({
    key: "baseline_benchmark",
    label: "Benchmark anchor",
    kind: "review",
    metricRefs: ["weekly_training_frequency"],
    status: recentSession || recentExercise || recentManualRun || recentManualLift ? GOAL_PROGRESS_STATUSES.building : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay,
    why: "A simple benchmark anchor turns vague 'back in shape' goals into something repeatable enough to plan around.",
  });
};

const buildBodyCompTrackedItems = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const bodyweightItem = buildBodyweightTrendItem({ goal, dataIndex, now });
  const waistItem = buildWaistTrendItem({ now, manualProgressInputs });
  const consistencyItem = buildConsistencyItem({
    key: "checkin_consistency",
    label: "Consistency",
    why: "Body-composition change only compounds when training and check-ins stay repeatable enough to trust the trend.",
    dataIndex,
    now,
  });
  const primaryMetricKey = sanitizeText(goal?.primaryMetric?.key || "", 80).toLowerCase();
  const primaryAnchorItem = /waist/.test(primaryMetricKey) ? waistItem : bodyweightItem;
  const primaryMeta = primaryAnchorItem?.metricMeta || null;
  return {
    trackedItems: [bodyweightItem, waistItem, consistencyItem],
    progressAnchor: Number.isFinite(primaryMeta?.targetValue)
      ? buildExactProgressAnchor({
          goal,
          metricLabel: goal?.primaryMetric?.label || primaryAnchorItem?.label || "Body-composition goal",
          valueFormat: primaryMeta?.valueFormat || "load",
          unit: primaryMeta?.unit || sanitizeText(goal?.primaryMetric?.unit || "", 24),
          direction: primaryMeta?.direction || "lower",
          baselineValue: primaryMeta?.baselineValue,
          currentValue: primaryMeta?.currentValue,
          targetValue: primaryMeta?.targetValue,
          currentDate: primaryMeta?.currentDate || "",
          baselineDate: primaryMeta?.baselineDate || "",
          status: primaryAnchorItem?.status || GOAL_PROGRESS_STATUSES.building,
          emptyStateLine: "First body-composition anchor still needs to be logged.",
        })
      : null,
  };
};

const buildAppearanceTrackedItems = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const bodyweightItem = buildBodyweightTrendItem({ goal, dataIndex, now });
  const waistItem = buildWaistTrendItem({ now, manualProgressInputs });
  const consistencyItem = buildConsistencyItem({
    key: "checkin_consistency",
    label: "Training consistency",
    why: "Appearance goals still need reliable training behavior behind them, even when the outcome is visual.",
    dataIndex,
    now,
  });
  const checklistAnchors = [
    { label: "training consistency logged", hit: consistencyItem.status !== GOAL_PROGRESS_STATUSES.needsData },
    { label: "bodyweight trend updated", hit: bodyweightItem.status !== GOAL_PROGRESS_STATUSES.needsData },
    { label: "waist check logged", hit: waistItem.status !== GOAL_PROGRESS_STATUSES.needsData },
  ];
  const hits = checklistAnchors.filter((item) => item.hit).length;
  const missing = checklistAnchors.filter((item) => !item.hit).map((item) => item.label);
  const checklistItem = createTrackedItem({
    key: "appearance_review_checklist",
    label: "Appearance review checklist",
    kind: "review",
    metricRefs: ["waist_circumference", "bodyweight_trend", "checkin_consistency"],
    status: hits >= 2 ? GOAL_PROGRESS_STATUSES.reviewBased : GOAL_PROGRESS_STATUSES.needsData,
    currentDisplay: `${hits}/${checklistAnchors.length} review anchors updated this cycle`,
    targetDisplay: `${goal?.reviewCadence || "weekly"} review cadence`,
    trendDisplay: missing.length ? `Still missing: ${missing.slice(0, 2).join(", ")}` : "All review anchors are current",
    why: "Appearance goals stay honest through repeatable review anchors and cadence, not a fake exact percentage.",
  });
  return {
    trackedItems: [checklistItem, waistItem, bodyweightItem],
    progressAnchor: null,
  };
};

const buildExploratoryTrackedItems = ({ dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => ({
  trackedItems: [
    buildConsistencyItem({
      key: "weekly_training_frequency",
      label: "30-day consistency",
      why: "The first honest win for exploratory goals is showing up consistently enough to trust the baseline again.",
      dataIndex,
      now,
    }),
    buildReadinessItem({ dataIndex, now }),
    buildBaselineImprovementItem({ dataIndex, now }),
    buildBenchmarkAnchorItem({ dataIndex, manualProgressInputs, now }),
  ],
  progressAnchor: null,
});

const buildTrackedItemsForGoal = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  if (goal?.goalFamily === "hybrid") {
    return buildHybridTrackedItems({ goal, dataIndex, manualProgressInputs, now });
  }
  if (goal?.goalFamily === "appearance") {
    return buildAppearanceTrackedItems({ goal, dataIndex, manualProgressInputs, now });
  }
  if (isSwimGoal(goal)) {
    return buildSwimTrackedItems({ goal, dataIndex, manualProgressInputs, now });
  }
  if (goal?.planningCategory === "running") {
    return buildRunTrackedItems({ goal, dataIndex, manualProgressInputs, now });
  }
  if (goal?.planningCategory === "strength") {
    return buildStrengthTrackedItems({ goal, dataIndex, manualProgressInputs, now });
  }
  if (goal?.planningCategory === "body_comp") {
    return buildBodyCompTrackedItems({ goal, dataIndex, manualProgressInputs, now });
  }
  return buildExploratoryTrackedItems({ dataIndex, manualProgressInputs, now });
};

const buildStatusSummary = ({ goal = {}, trackingMode = GOAL_PROGRESS_TRACKING_MODES.proxy } = {}) => {
  if (goal?.goalFamily === "hybrid") {
    return "This hybrid goal is tracked through both lanes staying visible, not through a fake single-domain score.";
  }
  if (goal?.goalFamily === "appearance") {
    return "This stays review-based: the app tracks appearance proxies on a cadence instead of pretending the mirror is a metric.";
  }
  if (trackingMode === GOAL_PROGRESS_TRACKING_MODES.exploratory) {
    return goal?.first30DaySuccessDefinition
      ? `This goal is still exploratory, so the first 30-day success definition leads: ${goal.first30DaySuccessDefinition}`
      : "This goal is still exploratory, so consistency, readiness, and baseline improvement lead the first block.";
  }
  if (isSwimGoal(goal)) {
    return "This swim goal is tracked through a repeatable benchmark, your current swim reality, and consistency instead of vague category labels.";
  }
  if (goal?.planningCategory === "running") {
    return "This event goal is tracked through pace, run volume, and workout progression rather than broad category labels.";
  }
  if (goal?.planningCategory === "strength") {
    return "This strength goal is tracked through logged working sets, best top-set performance, and the remaining gap to target.";
  }
  if (goal?.planningCategory === "body_comp") {
    return "This body-composition goal is tracked through trend measures and repeatable proxies instead of pretending physique change is perfectly linear.";
  }
  return "This goal is tracked through a small set of practical metrics tied to the resolved goal structure.";
};

const buildHonestyNote = ({ goal = {}, trackingMode = GOAL_PROGRESS_TRACKING_MODES.proxy, trackedItems = [] } = {}) => {
  if (goal?.goalFamily === "hybrid") {
    return "Hybrid goals stay honest only when the strength and endurance lanes both keep showing up in the logs.";
  }
  if (goal?.goalFamily === "appearance") {
    return "Subjective look-based goals never get a fake exact completion score here.";
  }
  if (trackingMode === GOAL_PROGRESS_TRACKING_MODES.exploratory) {
    return "Exploratory goals stay honest by using a first 30-day win, not invented precision.";
  }
  if (trackedItems.every((item) => item?.status === GOAL_PROGRESS_STATUSES.needsData)) {
    return "The goal structure is resolved, but the first relevant check-ins still need to be logged.";
  }
  if (isSwimGoal(goal)) {
    return "Swim progress stays provisional until you keep logging repeatable benchmarks; the app does not invent split data it does not have.";
  }
  if (trackingMode === GOAL_PROGRESS_TRACKING_MODES.proxy) {
    return "Proxy-tracked goals stay grounded in visible markers rather than one forced universal metric.";
  }
  return "Measurable goals can use tighter anchors, but the app still shows the supporting proxies that make the metric believable.";
};

const buildGoalProgressCard = ({ goal = {}, dataIndex = {}, manualProgressInputs = {}, now = new Date() } = {}) => {
  const trackingMode = resolveTrackingMode(goal);
  const trackingModel = buildTrackedItemsForGoal({ goal, dataIndex, manualProgressInputs, now });
  const trackedItems = Array.isArray(trackingModel?.trackedItems) ? trackingModel.trackedItems : [];
  const status = goal?.goalFamily === "appearance"
    ? GOAL_PROGRESS_STATUSES.reviewBased
    : trackingMode === GOAL_PROGRESS_TRACKING_MODES.exploratory
    ? GOAL_PROGRESS_STATUSES.reviewBased
    : trackedItems.every((item) => item?.status === GOAL_PROGRESS_STATUSES.needsData)
    ? GOAL_PROGRESS_STATUSES.needsData
    : trackedItems.some((item) => item?.status === GOAL_PROGRESS_STATUSES.onTrack)
    ? GOAL_PROGRESS_STATUSES.onTrack
    : GOAL_PROGRESS_STATUSES.building;

  const missingDataLabels = trackedItems
    .filter((item) => item?.status === GOAL_PROGRESS_STATUSES.needsData)
    .map((item) => item?.label)
    .filter(Boolean);
  const statusSummary = buildStatusSummary({ goal, trackingMode });
  const honestyNote = buildHonestyNote({ goal, trackingMode, trackedItems });
  const nextReviewFocus = missingDataLabels.length
    ? `Add ${missingDataLabels.slice(0, 2).join(" and ")} before the next ${goal?.reviewCadence || "weekly"} review.`
    : goal?.first30DaySuccessDefinition
    ? goal.first30DaySuccessDefinition
    : `Review the current goal stack on the next ${goal?.reviewCadence || "weekly"} cadence.`;

  return {
    goalId: goal?.id || "",
    summary: goal?.summary || "Goal",
    planningCategory: goal?.planningCategory || "general_fitness",
    goalFamily: goal?.goalFamily || "",
    planningPriority: goal?.planningPriority || 1,
    measurabilityTier: goal?.measurabilityTier || GOAL_MEASURABILITY_TIERS.exploratoryFuzzy,
    trackingMode,
    reviewCadence: goal?.reviewCadence || "weekly",
    confidence: goal?.confidence || "low",
    primaryMetric: goal?.primaryMetric || null,
    proxyMetrics: [...(goal?.proxyMetrics || [])],
    first30DaySuccessDefinition: goal?.first30DaySuccessDefinition || "",
    status,
    statusSummary,
    honestyNote,
    whatIsTracked: trackedItems.map((item) => item?.label).filter(Boolean),
    trackedItems,
    progressAnchor: trackingModel?.progressAnchor || buildStatusProgressAnchor({
      goal,
      trackingMode,
      status,
      statusSummary,
      honestyNote,
      nextReviewFocus,
    }),
    unresolvedGaps: [...(goal?.unresolvedGaps || [])],
    tradeoffs: [...(goal?.tradeoffs || [])],
    nextReviewFocus,
  };
};

export const buildGoalProgressTracking = ({
  resolvedGoals = [],
  logs = {},
  bodyweights = [],
  dailyCheckins = {},
  weeklyCheckins = {},
  manualProgressInputs = {},
  now = new Date(),
} = {}) => {
  const safeNow = asDate(now);
  const safeGoals = (Array.isArray(resolvedGoals) ? resolvedGoals : [])
    .map((goal, index) => normalizeResolvedGoal(goal, index))
    .sort((a, b) => a.planningPriority - b.planningPriority);
  const dataIndex = {
    logs: logs || {},
    dailyCheckins: dailyCheckins || {},
    weeklyCheckins: normalizeWeeklyCheckins(weeklyCheckins),
    sessionRecords: collectSessionRecords(logs),
    exerciseRecords: collectExerciseRecords(logs),
    bodyweightSeries: normalizeBodyweightSeries(bodyweights),
  };

  const goalCards = safeGoals.map((goal) => buildGoalProgressCard({
    goal,
    dataIndex,
    manualProgressInputs,
    now: safeNow,
  }));

  return {
    generatedAt: toDateKey(safeNow),
    summary: goalCards.length
      ? "Resolved goals now map to goal-native progress tracking instead of one generic progress score."
      : "No resolved goals are available for deterministic progress tracking yet.",
    goalCards,
  };
};

export const buildGoalProgressTrackingFromGoals = ({
  goals = [],
  logs = {},
  bodyweights = [],
  dailyCheckins = {},
  weeklyCheckins = {},
  manualProgressInputs = {},
  now = new Date(),
} = {}) => buildGoalProgressTracking({
  resolvedGoals: extractResolvedGoalsFromGoals(goals),
  logs,
  bodyweights,
  dailyCheckins,
  weeklyCheckins,
  manualProgressInputs,
  now,
});
