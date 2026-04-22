import {
  buildExerciseTransferProfile,
  normalizeExerciseTransferProfile,
} from "./exercise-transfer-profile-service.js";

export const PERFORMANCE_RECORD_MODEL_VERSION = "2026-04-performance-record-v1";

export const PERFORMANCE_RECORD_SCOPES = {
  exercise: "exercise",
  session: "session",
};

const clonePerformanceValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFiniteInteger = (value, fallback = null) => {
  const parsed = toFiniteNumber(value, fallback);
  return parsed === null ? fallback : Math.round(parsed);
};

export const toPerformanceDateKey = (value = "") => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split("T")[0];
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split("T")[0];
};

export const normalizePerformanceExerciseKey = (exerciseName = "") => String(exerciseName || "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

const parseSetCount = (value = "") => {
  const text = String(value || "");
  const match = text.match(/(\d+)\s*[x×]/i);
  return match ? Number(match[1]) : null;
};

const parseRepTarget = (value = "") => {
  const text = String(value || "");
  const match = text.match(/[x×]\s*(\d+)/i);
  return match ? Number(match[1]) : null;
};

const parsePaceTextToSeconds = (value = "") => {
  const match = String(value || "").trim().match(/(\d+):(\d+)/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const parseSessionDurationMinutes = (entry = {}) => {
  const raw = String(
    entry?.actual?.durationMinutes
    ?? entry?.outputs?.durationMinutes
    ?? entry?.durationMinutes
    ?? entry?.runTime
    ?? entry?.duration_min
    ?? ""
  ).trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (/^\d+:\d{2}$/.test(raw)) {
    const [minutes, seconds] = raw.split(":").map(Number);
    return minutes + Math.round((seconds || 0) / 60);
  }
  const textMatch = raw.match(/(\d+(?:\.\d+)?)\s*min/i);
  return textMatch ? Number(textMatch[1]) : null;
};

export const inferPerformanceExerciseMode = (exerciseName = "", explicitMode = "") => {
  const forced = String(explicitMode || "").toLowerCase().trim();
  if (["weighted", "band", "bodyweight"].includes(forced)) return forced;
  const ex = normalizePerformanceExerciseKey(exerciseName);
  if (/band/.test(ex)) return "band";
  if (/push[-\s]?up|pull[-\s]?up|chin[-\s]?up|plank|dead bug|bird dog|leg raise|crunch|heel drop|stretch|alphabet|bridge|dip/.test(ex)) return "bodyweight";
  return "weighted";
};

export const inferPerformanceExerciseBucket = (exerciseName = "") => {
  const ex = normalizePerformanceExerciseKey(exerciseName);
  if (/squat|deadlift|hinge|split squat|lunge|rdl|calf/.test(ex)) return "lower_body";
  if (/curl|tricep|raise|fly|extension|lateral|rear delt/.test(ex)) return "upper_isolation";
  if (/plank|dead bug|bird dog|leg raise|crunch|heel drop|hollow|carry/.test(ex)) return "core";
  return "compound";
};

export const inferPerformanceLiftKey = (exerciseName = "") => {
  const ex = normalizePerformanceExerciseKey(exerciseName);
  if (/bench/.test(ex)) return "bench";
  if (/squat/.test(ex)) return "squat";
  if (/deadlift|hinge/.test(ex)) return "deadlift";
  if (/overhead press|shoulder press|\bohp\b/.test(ex)) return "ohp";
  return "";
};

const inferSessionFamily = ({ type = "", label = "", exerciseRecords = [] } = {}) => {
  const raw = `${type} ${label}`.toLowerCase();
  if (!raw.trim() && Array.isArray(exerciseRecords) && exerciseRecords.length > 0) return "strength";
  if (/rest|recovery|mobility|walk/.test(raw)) return "recovery";
  if (/run|tempo|interval|easy|long|aerobic|cardio|stride/.test(raw)) return "run";
  if (/strength|push|pull|bench|squat|deadlift|press|row|lift|prehab/.test(raw) || (Array.isArray(exerciseRecords) && exerciseRecords.length > 0)) return "strength";
  if (/condition|otf|hybrid/.test(raw)) return "hybrid";
  return raw ? "custom" : "unknown";
};

const buildLegacyStrengthPerformanceFallback = (logEntry = {}) => {
  if (Array.isArray(logEntry?.strengthPerformance) && logEntry.strengthPerformance.length > 0) {
    return clonePerformanceValue(logEntry.strengthPerformance);
  }
  const exercise = String(logEntry?.type || logEntry?.label || "").trim();
  const repsCompleted = toFiniteInteger(logEntry?.reps ?? logEntry?.pushups, 0) || 0;
  const weightUsed = toFiniteNumber(logEntry?.weight, null);
  const sets = Math.max(1, toFiniteInteger(logEntry?.sets, 3) || 3);
  const looksLikeStrength = /strength|bench|squat|deadlift|press|pull|row|lift|push/.test(exercise.toLowerCase());
  const mode = inferPerformanceExerciseMode(exercise);
  if (!looksLikeStrength || !(repsCompleted > 0) || (mode === "weighted" && !(weightUsed > 0))) return [];
  return [{
    exercise,
    weightUsed: mode === "weighted" ? weightUsed : null,
    actualWeight: mode === "weighted" ? weightUsed : null,
    prescribedWeight: mode === "weighted" ? weightUsed : null,
    repsCompleted,
    actualReps: repsCompleted,
    actualSets: sets,
    prescribedSets: sets,
    prescribedReps: repsCompleted,
    bodyweightOnly: mode === "bodyweight",
    bandTension: mode === "band" ? (logEntry?.bandTension || "Light") : null,
    completionRatio: 1,
    feelThisSession: toFiniteInteger(logEntry?.feel, 3) || 3,
    sessionFeelScore: toFiniteInteger(logEntry?.feel, 3) || 3,
  }];
};

const normalizeExercisePerformanceRecord = ({ record = {}, dateKey = "", logEntry = {}, source = "" } = {}) => {
  const exercise = String(record?.exercise || record?.exercise_name || "").trim();
  if (!exercise) return null;
  const safeDateKey = toPerformanceDateKey(dateKey || record?.date || logEntry?.date || Date.now());
  const mode = inferPerformanceExerciseMode(exercise, record?.mode || record?.exerciseMode);
  const bodyweightOnly = Boolean(
    record?.bodyweightOnly
    ?? record?.bodyweight_only
    ?? record?.prescribed?.bodyweightOnly
    ?? record?.actual?.bodyweightOnly
    ?? mode === "bodyweight"
  );
  const bandTension = String(
    record?.bandTension
    || record?.band_tension
    || record?.prescribed?.bandTension
    || record?.actual?.bandTension
    || ""
  ).trim() || null;
  const prescribedSets = Math.max(1, toFiniteInteger(
    record?.prescribedSets
    ?? record?.prescribed_sets
    ?? record?.prescribed?.sets
    ?? parseSetCount(record?.prescribedSetsText)
    ?? parseSetCount(record?.sets)
    ?? 1,
    1
  ) || 1);
  const actualSets = Math.max(1, toFiniteInteger(
    record?.actualSets
    ?? record?.actual_sets
    ?? record?.actual?.sets
    ?? prescribedSets,
    prescribedSets
  ) || prescribedSets);
  const prescribedReps = Math.max(1, toFiniteInteger(
    record?.prescribedReps
    ?? record?.prescribed_reps
    ?? record?.prescribed?.reps
    ?? parseRepTarget(record?.prescribedRepsText)
    ?? parseRepTarget(record?.sets)
    ?? 1,
    1
  ) || 1);
  const actualReps = Math.max(0, toFiniteInteger(
    record?.actualReps
    ?? record?.actual_reps
    ?? record?.actual?.reps
    ?? record?.repsCompleted
    ?? 0,
    0
  ) || 0);
  const prescribedWeight = bodyweightOnly || bandTension
    ? null
    : toFiniteNumber(
      record?.prescribedWeight
      ?? record?.prescribed_weight
      ?? record?.prescribed?.weight
      ?? record?.weightPrescription
      ?? record?.weightUsed,
      null
    );
  const actualWeight = bodyweightOnly || bandTension
    ? null
    : toFiniteNumber(
      record?.actualWeight
      ?? record?.actual_weight
      ?? record?.actual?.weight
      ?? record?.weightUsed,
      null
    );
  const feelScore = Math.max(1, Math.min(5, toFiniteInteger(
    record?.feelThisSession
    ?? record?.feel_this_session
    ?? record?.sessionFeelScore
    ?? record?.metrics?.feelScore
    ?? logEntry?.feel
    ?? logEntry?.checkin?.feelRating
    ?? 3,
    3
  ) || 3));
  const completionRatio = Number((
    (actualReps * actualSets)
    / Math.max(1, prescribedReps * prescribedSets)
  ).toFixed(2));
  const exerciseKey = normalizePerformanceExerciseKey(exercise);
  const estimatedVolume = actualWeight !== null
    ? Number((actualWeight * actualReps * actualSets).toFixed(2))
    : null;
  const sessionType = String(logEntry?.actualSession?.sessionType || logEntry?.type || "").trim();
  const sessionLabel = String(logEntry?.actualSession?.sessionLabel || logEntry?.type || logEntry?.label || sessionType || "Session").trim();
  const sessionStatus = String(logEntry?.actualSession?.status || logEntry?.checkin?.status || "").trim();
  const sessionFamily = inferSessionFamily({ type: sessionType, label: sessionLabel, exerciseRecords: [record] });
  const transferProfile = normalizeExerciseTransferProfile(record?.transferProfile)
    || buildExerciseTransferProfile({ exerciseName: exercise, note: String(record?.note || "") });

  return {
    id: `perf_${safeDateKey}_exercise_${exerciseKey}`,
    version: PERFORMANCE_RECORD_MODEL_VERSION,
    date: safeDateKey,
    scope: PERFORMANCE_RECORD_SCOPES.exercise,
    domain: "strength",
    source: source || record?.source || (record?.version === PERFORMANCE_RECORD_MODEL_VERSION ? "canonical_performance_record" : "legacy_strength_performance"),
    sessionType,
    sessionLabel,
    sessionFamily,
    sessionStatus,
    exercise,
    exerciseKey,
    liftKey: record?.liftKey || inferPerformanceLiftKey(exercise),
    bucket: record?.bucket || inferPerformanceExerciseBucket(exercise),
    mode: bodyweightOnly ? "bodyweight" : bandTension ? "band" : mode,
    transferProfile,
    prescribed: {
      weight: prescribedWeight,
      reps: prescribedReps,
      sets: prescribedSets,
      bandTension,
      bodyweightOnly,
    },
    actual: {
      weight: actualWeight,
      reps: actualReps,
      sets: actualSets,
    },
    metrics: {
      completionRatio,
      feelScore,
      resistanceValue: actualWeight ?? prescribedWeight ?? null,
      estimatedVolume,
    },
  };
};

const normalizeSessionPerformanceRecord = ({ record = {}, dateKey = "", logEntry = {}, exerciseRecords = [], source = "" } = {}) => {
  const safeDateKey = toPerformanceDateKey(dateKey || record?.date || logEntry?.date || Date.now());
  const sessionType = String(
    record?.sessionType
    || logEntry?.actualSession?.sessionType
    || logEntry?.type
    || ""
  ).trim();
  const sessionLabel = String(
    record?.sessionLabel
    || logEntry?.actualSession?.sessionLabel
    || logEntry?.type
    || logEntry?.label
    || sessionType
    || "Session"
  ).trim();
  const sessionStatus = String(
    record?.sessionStatus
    || logEntry?.actualSession?.status
    || logEntry?.checkin?.status
    || ""
  ).trim();
  const sessionFamily = record?.sessionFamily || inferSessionFamily({
    type: sessionType,
    label: sessionLabel,
    exerciseRecords,
  });
  const durationMinutes = toFiniteNumber(
    record?.actual?.durationMinutes
    ?? record?.outputs?.durationMinutes
    ?? record?.durationMinutes
    ?? parseSessionDurationMinutes(logEntry),
    null
  );
  const distanceMiles = toFiniteNumber(
    record?.actual?.distanceMiles
    ?? record?.outputs?.distanceMiles
    ?? record?.distanceMiles
    ?? logEntry?.miles
    ?? logEntry?.distance_mi,
    null
  );
  const paceText = String(
    record?.actual?.paceText
    || record?.outputs?.paceText
    || record?.paceText
    || logEntry?.pace
    || ""
  ).trim() || null;
  const avgHr = toFiniteNumber(
    record?.actual?.avgHr
    ?? record?.outputs?.avgHr
    ?? record?.avgHr
    ?? logEntry?.healthMetrics?.avgHr
    ?? logEntry?.avg_hr,
    null
  );
  const maxHr = toFiniteNumber(
    record?.actual?.maxHr
    ?? record?.outputs?.maxHr
    ?? record?.maxHr
    ?? logEntry?.healthMetrics?.maxHr,
    null
  );
  const calories = toFiniteNumber(
    record?.actual?.calories
    ?? record?.outputs?.calories
    ?? record?.calories
    ?? logEntry?.healthMetrics?.calories,
    null
  );
  const hrPaceRatio = toFiniteNumber(
    record?.metrics?.hrPaceRatio
    ?? record?.actual?.hrPaceRatio
    ?? record?.outputs?.hrPaceRatio
    ?? logEntry?.healthMetrics?.hrPaceRatio,
    null
  );
  const hrDrift = toFiniteNumber(
    record?.metrics?.hrDrift
    ?? record?.actual?.hrDrift
    ?? record?.outputs?.hrDrift
    ?? logEntry?.healthMetrics?.hrDrift,
    null
  );
  const recoveryHr = toFiniteNumber(
    record?.metrics?.recoveryHr
    ?? record?.actual?.recoveryHr
    ?? record?.outputs?.recoveryHr
    ?? logEntry?.healthMetrics?.recoveryHr,
    null
  );
  const feelScore = Math.max(1, Math.min(5, toFiniteInteger(
    record?.metrics?.feelScore
    ?? record?.actual?.feelScore
    ?? record?.outputs?.feelScore
    ?? logEntry?.feel
    ?? logEntry?.checkin?.feelRating
    ?? 3,
    3
  ) || 3));
  const paceSeconds = toFiniteNumber(
    record?.metrics?.paceSeconds
    ?? record?.actual?.paceSeconds
    ?? record?.outputs?.paceSeconds
    ?? logEntry?.healthMetrics?.paceSeconds
    ?? parsePaceTextToSeconds(paceText),
    null
  );
  const exerciseCount = Array.isArray(exerciseRecords) ? exerciseRecords.length : 0;
  const completionRatio = exerciseCount > 0
    ? Number((
      exerciseRecords.reduce((sum, item) => sum + Number(item?.metrics?.completionRatio || 0), 0)
      / Math.max(1, exerciseCount)
    ).toFixed(2))
    : null;
  const note = String(record?.note || logEntry?.notes || "").trim() || null;
  const hasStructuredData = Boolean(
    sessionType
    || sessionLabel
    || sessionStatus
    || distanceMiles !== null
    || durationMinutes !== null
    || avgHr !== null
    || maxHr !== null
    || calories !== null
    || paceText
    || exerciseCount > 0
    || note
  );
  if (!hasStructuredData) return null;
  const domain = sessionFamily === "run"
    ? "endurance"
    : sessionFamily === "strength"
    ? "strength"
    : sessionFamily === "hybrid"
    ? "mixed"
    : "general";

  return {
    id: `perf_${safeDateKey}_session_${sessionFamily || "session"}`,
    version: PERFORMANCE_RECORD_MODEL_VERSION,
    date: safeDateKey,
    scope: PERFORMANCE_RECORD_SCOPES.session,
    domain,
    source: source || record?.source || (record?.version === PERFORMANCE_RECORD_MODEL_VERSION ? "canonical_performance_record" : "actual_session_log"),
    sessionType,
    sessionLabel,
    sessionFamily,
    sessionStatus,
    exercise: "",
    exerciseKey: "",
    liftKey: "",
    bucket: "",
    mode: "",
    prescribed: null,
    actual: {
      distanceMiles,
      durationMinutes,
      paceText,
      avgHr,
      maxHr,
      calories,
      hrPaceRatio,
      hrDrift,
      recoveryHr,
      exerciseCount,
      note,
    },
    metrics: {
      feelScore,
      paceSeconds,
      distanceMiles,
      durationMinutes,
      avgHr,
      maxHr,
      calories,
      hrPaceRatio,
      hrDrift,
      recoveryHr,
      completionRatio,
    },
  };
};

const dedupePerformanceRecords = (records = []) => {
  const deduped = new Map();
  (records || []).forEach((record) => {
    if (!record?.id) return;
    deduped.set(record.id, record);
  });
  return Array.from(deduped.values());
};

export const buildCanonicalPerformanceRecordsForLog = ({ dateKey = "", logEntry = {} } = {}) => {
  const safeDateKey = toPerformanceDateKey(dateKey || logEntry?.date || Date.now());
  const canonicalPool = Array.isArray(logEntry?.performanceRecords) ? logEntry.performanceRecords : [];
  const exerciseFromCanonical = canonicalPool
    .filter((record) => record?.scope === PERFORMANCE_RECORD_SCOPES.exercise || (record?.scope !== PERFORMANCE_RECORD_SCOPES.session && (record?.exercise || record?.exercise_name)))
    .map((record) => normalizeExercisePerformanceRecord({ record, dateKey: safeDateKey, logEntry, source: record?.source || "canonical_performance_record" }))
    .filter(Boolean);
  const legacyExercisePool = buildLegacyStrengthPerformanceFallback(logEntry);
  const exerciseFromLegacy = legacyExercisePool
    .map((record) => normalizeExercisePerformanceRecord({ record, dateKey: safeDateKey, logEntry }))
    .filter(Boolean);
  const exerciseRecords = dedupePerformanceRecords([...exerciseFromCanonical, ...exerciseFromLegacy]);

  const sessionFromCanonical = canonicalPool
    .filter((record) => record?.scope === PERFORMANCE_RECORD_SCOPES.session)
    .map((record) => normalizeSessionPerformanceRecord({ record, dateKey: safeDateKey, logEntry, exerciseRecords, source: record?.source || "canonical_performance_record" }))
    .filter(Boolean);
  const fallbackSessionRecord = normalizeSessionPerformanceRecord({
    record: {},
    dateKey: safeDateKey,
    logEntry,
    exerciseRecords,
  });
  const sessionRecords = sessionFromCanonical.length > 0
    ? dedupePerformanceRecords(sessionFromCanonical)
    : (fallbackSessionRecord ? [fallbackSessionRecord] : []);

  return dedupePerformanceRecords([
    ...exerciseRecords,
    ...sessionRecords,
  ]);
};

export const getPerformanceRecordsForLog = (logEntry = {}, options = {}) => {
  const records = buildCanonicalPerformanceRecordsForLog({
    dateKey: options?.dateKey || logEntry?.date || "",
    logEntry,
  });
  return records.filter((record) => {
    if (options?.scope && record?.scope !== options.scope) return false;
    if (options?.domain && record?.domain !== options.domain) return false;
    return true;
  });
};

export const getExercisePerformanceRecordsForLog = (logEntry = {}, options = {}) => getPerformanceRecordsForLog(logEntry, {
  ...options,
  scope: PERFORMANCE_RECORD_SCOPES.exercise,
});

export const getSessionPerformanceRecordsForLog = (logEntry = {}, options = {}) => getPerformanceRecordsForLog(logEntry, {
  ...options,
  scope: PERFORMANCE_RECORD_SCOPES.session,
});

export const normalizeLogPerformanceState = ({ dateKey = "", logEntry = {} } = {}) => {
  const safeEntry = clonePerformanceValue(logEntry || {});
  const performanceRecords = buildCanonicalPerformanceRecordsForLog({
    dateKey: dateKey || safeEntry?.date || "",
    logEntry: safeEntry,
  });
  const exerciseRecords = performanceRecords.filter((record) => record?.scope === PERFORMANCE_RECORD_SCOPES.exercise);
  return {
    ...safeEntry,
    date: toPerformanceDateKey(dateKey || safeEntry?.date || Date.now()),
    performanceRecords,
    strengthPerformance: buildLegacyStrengthPerformanceFromRecords(exerciseRecords),
  };
};

export const normalizePerformanceLogsCollection = (logs = {}) => Object.fromEntries(
  Object.entries(logs || {}).map(([dateKey, entry]) => [
    dateKey,
    normalizeLogPerformanceState({ dateKey, logEntry: entry || {} }),
  ])
);

export const buildLegacyStrengthPerformanceFromRecords = (records = []) => (
  (records || [])
    .filter((record) => record?.scope === PERFORMANCE_RECORD_SCOPES.exercise)
    .map((record) => ({
      exercise: record?.exercise || "",
      exercise_name: record?.exercise || "",
      date: record?.date || "",
      weightUsed: record?.actual?.weight ?? record?.prescribed?.weight ?? null,
      actualWeight: record?.actual?.weight ?? null,
      prescribedWeight: record?.prescribed?.weight ?? null,
      repsCompleted: record?.actual?.reps ?? 0,
      actualReps: record?.actual?.reps ?? 0,
      prescribedReps: record?.prescribed?.reps ?? 1,
      actualSets: record?.actual?.sets ?? 0,
      prescribedSets: record?.prescribed?.sets ?? 1,
      bandTension: record?.prescribed?.bandTension || null,
      bodyweightOnly: Boolean(record?.prescribed?.bodyweightOnly),
      feelThisSession: record?.metrics?.feelScore ?? 3,
      sessionFeelScore: record?.metrics?.feelScore ?? 3,
      completionRatio: record?.metrics?.completionRatio ?? 0,
      mode: record?.mode || "",
      bucket: record?.bucket || "",
      liftKey: record?.liftKey || "",
    }))
);

export const buildExercisePerformanceRowsFromRecords = (records = []) => (
  (records || [])
    .filter((record) => record?.scope === PERFORMANCE_RECORD_SCOPES.exercise)
    .map((record) => ({
      exercise_name: record?.exercise || "",
      date: record?.date || "",
      prescribed_weight: record?.prescribed?.weight ?? null,
      actual_weight: record?.actual?.weight ?? null,
      prescribed_reps: record?.prescribed?.reps ?? null,
      actual_reps: record?.actual?.reps ?? null,
      prescribed_sets: record?.prescribed?.sets ?? null,
      actual_sets: record?.actual?.sets ?? null,
      band_tension: record?.prescribed?.bandTension || null,
      bodyweight_only: Boolean(record?.prescribed?.bodyweightOnly),
      feel_this_session: record?.metrics?.feelScore ?? null,
    }))
    .filter((row) => row.exercise_name)
);
