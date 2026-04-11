import { sanitizeDisplayCopy } from "./text-format-service.js";
import {
  getExercisePerformanceRecordsForLog,
  getSessionPerformanceRecordsForLog,
  inferPerformanceExerciseBucket,
  inferPerformanceExerciseMode,
  normalizePerformanceExerciseKey,
} from "./performance-record-service.js";

export const WORKOUT_LOG_FAMILIES = {
  run: "run",
  strength: "strength",
  mixed: "mixed",
  generic: "generic",
};

const sanitizeText = (value = "") => sanitizeDisplayCopy(String(value || "")).trim();

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseSetPrescription = (setsText = "") => {
  const normalized = sanitizeText(setsText).replace(/[x×]/gi, "x");
  const matched = normalized.match(/^(\d+)\s*x\s*(.+)$/i);
  if (matched) {
    return { setsText: matched[1], repsText: sanitizeText(matched[2]) || "As prescribed" };
  }
  return { setsText: normalizeNumericText(normalized) || "As prescribed", repsText: "As prescribed" };
};

const parseRepTarget = (repsText = "") => {
  const text = sanitizeText(repsText).toLowerCase();
  const range = text.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (range) return Number(range[2]);
  const simple = text.match(/(\d+)/);
  return simple ? Number(simple[1]) : 8;
};

const parseSetCount = (setsText = "") => {
  const text = sanitizeText(setsText);
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 3;
};

const normalizeNumericText = (value = "") => {
  if (value === "" || value === null || value === undefined) return "";
  return String(value).trim();
};

const inferFallbackFamily = ({ training = null, logEntry = {}, exerciseRecords = [], sessionRecord = null } = {}) => {
  const typeText = String(training?.type || logEntry?.actualSession?.sessionType || logEntry?.type || "").toLowerCase();
  const labelText = String(training?.label || logEntry?.actualSession?.sessionLabel || logEntry?.label || "").toLowerCase();
  const raw = `${typeText} ${labelText} ${training?.run?.t || ""}`.trim();
  const hasRunData = Boolean(
    training?.run
    || sessionRecord?.sessionFamily === WORKOUT_LOG_FAMILIES.run
    || sessionRecord?.actual?.distanceMiles !== null
    || sessionRecord?.actual?.durationMinutes !== null
    || String(logEntry?.pace || "").trim()
    || String(logEntry?.miles || "").trim()
    || String(logEntry?.runTime || "").trim()
    || /run|tempo|interval|easy|long|aerobic|cardio|stride/.test(raw)
  );
  const hasStrengthData = Boolean(
    exerciseRecords.length > 0
    || /strength|push|pull|bench|squat|deadlift|press|row|lift|prehab/.test(raw)
  );
  if (hasRunData && hasStrengthData) return WORKOUT_LOG_FAMILIES.mixed;
  if (hasRunData) return WORKOUT_LOG_FAMILIES.run;
  if (hasStrengthData) return WORKOUT_LOG_FAMILIES.strength;
  return WORKOUT_LOG_FAMILIES.generic;
};

const buildRunPurpose = (training = null) => {
  const focus = sanitizeText(training?.run?.t || training?.label || "");
  if (!focus) return "";
  if (/interval/i.test(focus)) return "Quality run";
  if (/tempo/i.test(focus)) return "Threshold work";
  if (/long/i.test(focus)) return "Aerobic endurance";
  if (/easy/i.test(focus)) return "Easy aerobic work";
  return focus;
};

const buildRunStructure = (training = null) => {
  const run = training?.run || null;
  if (!run) return "";
  return sanitizeText(run?.d || training?.fallback || "");
};

const normalizeRunField = (value = "") => {
  if (value === "" || value === null || value === undefined) return "";
  return String(value).trim();
};

const buildRunDraft = ({ training = null, logEntry = {}, sessionRecord = null } = {}) => ({
  enabled: Boolean(training?.run)
    || sessionRecord?.sessionFamily === WORKOUT_LOG_FAMILIES.run
    || Boolean(String(logEntry?.miles || "").trim() || String(logEntry?.pace || "").trim() || String(logEntry?.runTime || "").trim()),
  distance: normalizeRunField(sessionRecord?.actual?.distanceMiles ?? logEntry?.miles ?? ""),
  duration: normalizeRunField(sessionRecord?.actual?.durationMinutes ?? logEntry?.runTime ?? ""),
  pace: sanitizeText(sessionRecord?.actual?.paceText || logEntry?.pace || ""),
  purpose: buildRunPurpose(training),
  structure: buildRunStructure(training),
});

const normalizePrescribedExercise = (entry = {}) => {
  const exercise = sanitizeText(entry?.ex || entry?.exercise || entry?.exercise_name || "Exercise");
  const parsedSet = parseSetPrescription(entry?.sets || "");
  const repsText = sanitizeText(entry?.reps || parsedSet.repsText || "");
  const mode = inferPerformanceExerciseMode(exercise, entry?.mode || "");
  return {
    key: normalizePerformanceExerciseKey(exercise),
    prescribedExercise: exercise,
    exercise,
    prescribedSetsText: sanitizeText(parsedSet.setsText),
    prescribedRepsText: repsText || "As prescribed",
    prescribedSets: Math.max(1, parseSetCount(parsedSet.setsText)),
    prescribedReps: Math.max(1, parseRepTarget(repsText || parsedSet.repsText)),
    prescribedWeight: toFiniteNumber(entry?.prescribedWeight ?? entry?.weight ?? entry?.weightUsed, null),
    actualWeight: toFiniteNumber(entry?.actualWeight ?? entry?.weightUsed, null),
    actualSets: "",
    actualReps: "",
    bandTension: sanitizeText(entry?.bandTension || ""),
    bodyweightOnly: mode === "bodyweight",
    mode,
    bucket: inferPerformanceExerciseBucket(exercise),
    isSubstituted: false,
  };
};

const toStrengthRowFromRecord = (record = {}) => {
  const exercise = sanitizeText(record?.exercise || "Exercise");
  const mode = inferPerformanceExerciseMode(exercise, record?.mode || "");
  return {
    key: normalizePerformanceExerciseKey(exercise),
    prescribedExercise: exercise,
    exercise,
    prescribedSetsText: normalizeNumericText(record?.prescribed?.sets ?? record?.prescribedSets ?? ""),
    prescribedRepsText: normalizeNumericText(record?.prescribed?.reps ?? record?.prescribedReps ?? ""),
    prescribedSets: Math.max(1, Number(record?.prescribed?.sets ?? record?.prescribedSets ?? 1) || 1),
    prescribedReps: Math.max(1, Number(record?.prescribed?.reps ?? record?.prescribedReps ?? 1) || 1),
    prescribedWeight: toFiniteNumber(record?.prescribed?.weight ?? record?.prescribedWeight, null),
    actualWeight: normalizeNumericText(record?.actual?.weight ?? record?.actualWeight ?? ""),
    actualSets: normalizeNumericText(record?.actual?.sets ?? record?.actualSets ?? ""),
    actualReps: normalizeNumericText(record?.actual?.reps ?? record?.actualReps ?? ""),
    bandTension: sanitizeText(record?.prescribed?.bandTension || record?.bandTension || ""),
    bodyweightOnly: Boolean(record?.prescribed?.bodyweightOnly ?? record?.bodyweightOnly ?? mode === "bodyweight"),
    mode,
    bucket: record?.bucket || inferPerformanceExerciseBucket(exercise),
    isSubstituted: false,
  };
};

const buildStrengthRows = ({ prescribedExercises = [], logEntry = {}, dateKey = "" } = {}) => {
  const actualRecords = getExercisePerformanceRecordsForLog(logEntry || {}, { dateKey });
  const prescribedRows = (prescribedExercises || []).map((entry) => normalizePrescribedExercise(entry));
  if (!prescribedRows.length && actualRecords.length > 0) {
    return {
      rows: actualRecords.map((record) => toStrengthRowFromRecord(record)),
      hasPrescribedStructure: false,
    };
  }
  const actualByKey = new Map(actualRecords.map((record) => [normalizePerformanceExerciseKey(record?.exercise || ""), record]));
  const usedActualKeys = new Set();
  const unmatchedActual = [...actualRecords];
  const rows = prescribedRows.map((row, index) => {
    const exactMatch = actualByKey.get(row.key) || null;
    let record = exactMatch;
    if (exactMatch) {
      usedActualKeys.add(normalizePerformanceExerciseKey(exactMatch?.exercise || ""));
    } else if (unmatchedActual[index]) {
      record = unmatchedActual[index];
      if (record?.exercise) usedActualKeys.add(normalizePerformanceExerciseKey(record.exercise));
    }
    if (!record) return row;
    return {
      ...row,
      exercise: sanitizeText(record?.exercise || row.exercise),
      actualSets: normalizeNumericText(record?.actual?.sets ?? record?.actualSets ?? ""),
      actualReps: normalizeNumericText(record?.actual?.reps ?? record?.actualReps ?? ""),
      actualWeight: normalizeNumericText(record?.actual?.weight ?? record?.actualWeight ?? ""),
      bandTension: sanitizeText(record?.prescribed?.bandTension || record?.bandTension || row.bandTension || ""),
      bodyweightOnly: Boolean(record?.prescribed?.bodyweightOnly ?? row.bodyweightOnly),
      mode: inferPerformanceExerciseMode(record?.exercise || row.exercise, record?.mode || row.mode),
      isSubstituted: normalizePerformanceExerciseKey(record?.exercise || "") !== row.key && Boolean(record?.exercise),
    };
  });
  const leftoverActualRows = actualRecords
    .filter((record) => !usedActualKeys.has(normalizePerformanceExerciseKey(record?.exercise || "")))
    .map((record) => ({
      ...toStrengthRowFromRecord(record),
      isSubstituted: true,
    }));
  return {
    rows: [...rows, ...leftoverActualRows],
    hasPrescribedStructure: prescribedRows.length > 0,
  };
};

const buildStrengthDraft = ({ family = WORKOUT_LOG_FAMILIES.generic, prescribedExercises = [], logEntry = {}, dateKey = "" } = {}) => {
  const { rows, hasPrescribedStructure } = buildStrengthRows({ prescribedExercises, logEntry, dateKey });
  const strengthEnabled = family === WORKOUT_LOG_FAMILIES.strength || family === WORKOUT_LOG_FAMILIES.mixed || rows.length > 0;
  return {
    enabled: strengthEnabled,
    hasPrescribedStructure,
    rows,
  };
};

export const buildWorkoutLogDraft = ({
  dateKey = "",
  plannedDayRecord = null,
  logEntry = {},
  fallbackTraining = null,
  prescribedExercises = [],
} = {}) => {
  const safeDateKey = String(dateKey || logEntry?.date || new Date().toISOString().split("T")[0]);
  const training = plannedDayRecord?.resolved?.training
    || plannedDayRecord?.plan?.resolved?.training
    || plannedDayRecord?.training
    || plannedDayRecord?.base?.training
    || fallbackTraining
    || null;
  const sessionRecord = getSessionPerformanceRecordsForLog(logEntry || {}, { dateKey: safeDateKey })[0] || null;
  const previewStrength = buildStrengthRows({ prescribedExercises, logEntry, dateKey: safeDateKey });
  const family = inferFallbackFamily({
    training,
    logEntry,
    exerciseRecords: previewStrength.rows,
    sessionRecord,
  });
  const strength = buildStrengthDraft({
    family,
    prescribedExercises,
    logEntry,
    dateKey: safeDateKey,
  });
  const run = buildRunDraft({ training, logEntry, sessionRecord });
  const firstStrengthRow = strength.rows[0] || null;
  return {
    date: safeDateKey,
    family,
    sessionType: sanitizeText(training?.type || logEntry?.actualSession?.sessionType || family || "session"),
    sessionLabel: sanitizeText(
      logEntry?.actualSession?.sessionLabel
      || logEntry?.type
      || training?.label
      || plannedDayRecord?.resolved?.training?.label
      || "Session"
    ),
    prescribedLabel: sanitizeText(training?.label || ""),
    feel: String(logEntry?.feel || "3"),
    location: sanitizeText(logEntry?.location || "home") || "home",
    notes: sanitizeText(logEntry?.notes || ""),
    run,
    strength,
    generic: {
      visible: family === WORKOUT_LOG_FAMILIES.generic || (family === WORKOUT_LOG_FAMILIES.strength && !strength.hasPrescribedStructure && strength.rows.length === 0),
      reps: normalizeNumericText(logEntry?.reps ?? logEntry?.pushups ?? firstStrengthRow?.actualReps ?? ""),
      weight: normalizeNumericText(logEntry?.weight ?? firstStrengthRow?.actualWeight ?? ""),
    },
  };
};

const buildStrengthPerformanceFromRows = (rows = [], feel = "3") => (
  (rows || [])
    .map((row = {}) => {
      const exercise = sanitizeText(row?.exercise || "");
      const mode = inferPerformanceExerciseMode(exercise, row?.mode || "");
      const actualSets = Math.max(0, Number(row?.actualSets || 0) || 0);
      const actualReps = Math.max(0, Number(row?.actualReps || 0) || 0);
      if (!exercise || actualSets <= 0 || actualReps <= 0) return null;
      const prescribedSets = Math.max(1, Number(row?.prescribedSets || parseSetCount(row?.prescribedSetsText || "") || actualSets) || actualSets);
      const prescribedReps = Math.max(1, Number(row?.prescribedReps || parseRepTarget(row?.prescribedRepsText || "") || actualReps) || actualReps);
      const actualWeight = mode === "bodyweight" || row?.bandTension
        ? null
        : toFiniteNumber(row?.actualWeight, null);
      const prescribedWeight = mode === "bodyweight" || row?.bandTension
        ? null
        : toFiniteNumber(row?.prescribedWeight ?? row?.actualWeight, null);
      return {
        exercise,
        weightUsed: actualWeight,
        actualWeight,
        prescribedWeight,
        repsCompleted: actualReps,
        actualReps,
        prescribedReps,
        actualSets,
        prescribedSets,
        bandTension: sanitizeText(row?.bandTension || "") || null,
        bodyweightOnly: mode === "bodyweight",
        mode,
        bucket: row?.bucket || inferPerformanceExerciseBucket(exercise),
        completionRatio: Number(((actualSets * actualReps) / Math.max(1, prescribedSets * prescribedReps)).toFixed(2)),
        feelThisSession: Math.max(1, Math.min(5, Number(feel || 3) || 3)),
        sessionFeelScore: Math.max(1, Math.min(5, Number(feel || 3) || 3)),
      };
    })
    .filter(Boolean)
);

export const buildWorkoutLogEntryFromDraft = ({
  draft = {},
  baseEntry = {},
  todayKey = "",
} = {}) => {
  const strengthPerformance = buildStrengthPerformanceFromRows(draft?.strength?.rows || [], draft?.feel || "3");
  const firstStrengthRow = strengthPerformance[0] || null;
  const hasRunSection = Boolean(draft?.run?.enabled);
  const type = sanitizeText(draft?.sessionLabel || baseEntry?.type || "Session") || "Session";
  const sessionType = sanitizeText(draft?.sessionType || baseEntry?.actualSession?.sessionType || draft?.family || "session");
  return {
    ...baseEntry,
    date: draft?.date || baseEntry?.date || todayKey,
    type,
    miles: hasRunSection ? normalizeNumericText(draft?.run?.distance || "") : "",
    pace: hasRunSection ? sanitizeText(draft?.run?.pace || "") : "",
    runTime: hasRunSection ? normalizeNumericText(draft?.run?.duration || "") : "",
    notes: sanitizeText(draft?.notes || ""),
    feel: String(draft?.feel || "3"),
    location: sanitizeText(draft?.location || "home") || "home",
    reps: draft?.generic?.visible ? normalizeNumericText(draft?.generic?.reps || "") : normalizeNumericText(firstStrengthRow?.actualReps || ""),
    pushups: draft?.generic?.visible ? normalizeNumericText(draft?.generic?.reps || "") : normalizeNumericText(firstStrengthRow?.actualReps || ""),
    weight: draft?.generic?.visible ? normalizeNumericText(draft?.generic?.weight || "") : normalizeNumericText(firstStrengthRow?.actualWeight || ""),
    strengthPerformance,
    actualSession: {
      ...(baseEntry?.actualSession || {}),
      sessionType,
      sessionLabel: type,
      sessionFamily: draft?.family || baseEntry?.actualSession?.sessionFamily || "",
    },
    editedAt: Date.now(),
    retroEdited: Boolean(draft?.date && todayKey && draft.date < todayKey),
    ts: Date.now(),
  };
};
