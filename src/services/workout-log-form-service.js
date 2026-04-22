import { sanitizeDisplayCopy } from "./text-format-service.js";
import { buildCanonicalPlanSurfaceModel } from "./plan-day-surface-service.js";
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
  recovery: "recovery",
  generic: "generic",
};

export const WORKOUT_LOG_MODES = {
  running: WORKOUT_LOG_FAMILIES.run,
  strength: WORKOUT_LOG_FAMILIES.strength,
  mixed: WORKOUT_LOG_FAMILIES.mixed,
  recovery: WORKOUT_LOG_FAMILIES.recovery,
  generic: WORKOUT_LOG_FAMILIES.generic,
};

export const WORKOUT_LOG_COMPLETION_SELECTIONS = Object.freeze([
  { key: "completed", label: "Completed" },
  { key: "partial", label: "Partial" },
  { key: "skipped", label: "Skipped" },
  { key: "swapped", label: "Swapped" },
]);

export const WORKOUT_LOG_MODALITY_OPTIONS = Object.freeze([
  { key: "run", label: "Run" },
  { key: "treadmill", label: "Treadmill" },
  { key: "bike", label: "Bike" },
  { key: "elliptical", label: "Elliptical" },
  { key: "walk", label: "Walk" },
  { key: "rower", label: "Rower" },
  { key: "swim", label: "Swim" },
  { key: "mobility", label: "Mobility" },
  { key: "strength", label: "Strength" },
  { key: "other", label: "Other" },
]);

export const WORKOUT_LOG_BODY_STATUS_OPTIONS = Object.freeze([
  { key: "fresh", label: "Fresh" },
  { key: "normal", label: "Normal" },
  { key: "legs_sore", label: "Legs sore" },
  { key: "upper_sore", label: "Upper sore" },
  { key: "beat_up", label: "Beat up" },
]);

export const WORKOUT_LOG_RECOVERY_STATE_OPTIONS = Object.freeze([
  { key: "low", label: "Low" },
  { key: "okay", label: "Okay" },
  { key: "good", label: "Good" },
]);

export const WORKOUT_LOG_BLOCKER_OPTIONS = Object.freeze([
  { key: "", label: "None" },
  { key: "time", label: "Time" },
  { key: "fatigue", label: "Fatigue" },
  { key: "pain", label: "Pain" },
  { key: "equipment", label: "Equipment" },
  { key: "travel", label: "Travel" },
  { key: "other", label: "Other" },
]);

const sanitizeText = (value = "") => sanitizeDisplayCopy(String(value || "")).trim();

const collectPatternNumbers = (text = "", regex = /$^/) => {
  const values = [];
  String(text || "").replace(regex, (_, numeric) => {
    const parsed = Number(numeric);
    if (Number.isFinite(parsed)) values.push(parsed);
    return _;
  });
  return values;
};

const sumPatternNumbers = (text = "", regex = /$^/) => (
  collectPatternNumbers(text, regex).reduce((sum, value) => sum + value, 0)
);

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DASH_RANGE_PATTERN = /(\d+)\s*[-\u2013\u2014]\s*(\d+)/;

const parseSetPrescription = (setsText = "") => {
  const normalized = sanitizeText(setsText).replace(/[x\u00d7]/gi, "x");
  const matched = normalized.match(/^(\d+)\s*x\s*(.+)$/i);
  if (matched) {
    return { setsText: matched[1], repsText: sanitizeText(matched[2]) || "As prescribed" };
  }
  return { setsText: normalizeNumericText(normalized) || "As prescribed", repsText: "As prescribed" };
};

const parseRepTarget = (repsText = "") => {
  const text = sanitizeText(repsText).toLowerCase();
  const range = text.match(DASH_RANGE_PATTERN);
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

const normalizeEnumKey = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const joinQuickParts = (parts = []) => parts.filter(Boolean).join(" - ");

const findOptionLabel = (options = [], key = "", fallback = "") => (
  options.find((option) => option.key === key)?.label || fallback || key
);

const CARDIO_MODALITY_KEYS = new Set(["run", "treadmill", "bike", "elliptical", "walk", "rower", "swim"]);
const RUN_EQUIVALENT_MODALITY_KEYS = new Set(["run", "treadmill"]);
const STRENGTH_MODALITY_KEYS = new Set(["strength"]);

const isCardioModality = (value = "") => CARDIO_MODALITY_KEYS.has(normalizeEnumKey(value));
const isStrengthModality = (value = "") => STRENGTH_MODALITY_KEYS.has(normalizeEnumKey(value));
const isRunEquivalentModality = (value = "") => RUN_EQUIVALENT_MODALITY_KEYS.has(normalizeEnumKey(value));

const resolvePlannedSessionModality = ({ training = null, family = WORKOUT_LOG_FAMILIES.generic } = {}) => {
  const raw = `${training?.type || ""} ${training?.label || ""} ${training?.run?.t || ""}`.toLowerCase();
  if (/treadmill/.test(raw)) return "treadmill";
  if (/bike|cycle|spin/.test(raw)) return "bike";
  if (/elliptical/.test(raw)) return "elliptical";
  if (/row|erg/.test(raw)) return "rower";
  if (/swim/.test(raw)) return "swim";
  if (/mobility|stretch|reset|activation/.test(raw)) return "mobility";
  if (/walk|hike/.test(raw)) return "walk";
  if (family === WORKOUT_LOG_FAMILIES.strength || family === WORKOUT_LOG_FAMILIES.mixed) return "strength";
  if (family === WORKOUT_LOG_FAMILIES.recovery) return "mobility";
  if (training?.run || family === WORKOUT_LOG_FAMILIES.run) return "run";
  return "other";
};

const buildGenericSessionDraft = ({ family = WORKOUT_LOG_FAMILIES.generic, training = null, logEntry = {}, sessionRecord = null } = {}) => {
  const plannedModality = resolvePlannedSessionModality({ training, family });
  const actualModality = normalizeEnumKey(
    sessionRecord?.actual?.modality
    || logEntry?.actualSession?.modality
    || plannedModality
    || (family === WORKOUT_LOG_FAMILIES.recovery ? "mobility" : "other")
  ) || (family === WORKOUT_LOG_FAMILIES.recovery ? "mobility" : "other");
  return {
    visible: family === WORKOUT_LOG_FAMILIES.generic || family === WORKOUT_LOG_FAMILIES.recovery,
    reps: normalizeNumericText(logEntry?.reps ?? logEntry?.pushups ?? ""),
    weight: normalizeNumericText(logEntry?.weight ?? ""),
    duration: normalizeRunField(sessionRecord?.actual?.durationMinutes ?? logEntry?.runTime ?? ""),
    distance: normalizeRunField(sessionRecord?.actual?.distanceMiles ?? logEntry?.miles ?? ""),
    modality: actualModality,
    plannedModality,
    purpose: sanitizeText(training?.label || training?.type || ""),
    structure: sanitizeText(training?.fallback || training?.success || training?.recoveryRecommendation || ""),
  };
};

const resolveCompletionSelection = (logEntry = {}) => {
  const status = normalizeEnumKey(logEntry?.actualSession?.status || logEntry?.checkin?.status || "");
  if (status === "skipped") return "skipped";
  if (status === "partial_completed") return "partial";
  if (Boolean(logEntry?.actualSession?.swapFromPlan) || normalizeEnumKey(logEntry?.actualSession?.userSelection || "") === "swapped") return "swapped";
  return "completed";
};

const mapFeelToSessionFeel = (feelValue = "3") => {
  const feel = Math.max(1, Math.min(5, Number(feelValue || 3) || 3));
  if (feel <= 2) return "harder_than_expected";
  if (feel >= 4) return "easier_than_expected";
  return "about_right";
};

const mapBodyStatusToSorenessScore = (bodyStatus = "") => {
  switch (normalizeEnumKey(bodyStatus)) {
    case "fresh": return "1";
    case "normal": return "2";
    case "legs_sore":
    case "upper_sore": return "3";
    case "beat_up": return "5";
    default: return "";
  }
};

const mapRecoveryStateToReadiness = (recoveryState = "") => {
  switch (normalizeEnumKey(recoveryState)) {
    case "good":
      return { sleep: "4", stress: "2" };
    case "low":
      return { sleep: "2", stress: "4" };
    case "okay":
      return { sleep: "3", stress: "3" };
    default:
      return { sleep: "", stress: "" };
  }
};

const mapBlockerSelectionToCheckinBlocker = (blocker = "") => {
  switch (normalizeEnumKey(blocker)) {
    case "time": return "time";
    case "fatigue": return "soreness_fatigue";
    case "pain": return "pain_injury";
    case "equipment": return "no_equipment";
    case "travel": return "schedule_travel";
    case "other": return "other";
    default: return "";
  }
};

const mapCheckinBlockerToSelection = (blocker = "") => {
  switch (normalizeEnumKey(blocker)) {
    case "time": return "time";
    case "soreness_fatigue": return "fatigue";
    case "pain_injury": return "pain";
    case "no_equipment": return "equipment";
    case "schedule_travel": return "travel";
    case "other": return "other";
    default: return "";
  }
};

const buildDraftSignals = (logEntry = {}) => ({
  bodyStatus: normalizeEnumKey(logEntry?.actualSession?.bodyStatus || ""),
  recoveryState: normalizeEnumKey(logEntry?.actualSession?.recoveryState || ""),
  blocker: mapCheckinBlockerToSelection(logEntry?.checkin?.blocker || ""),
});

const buildStrengthSubstitutionMeta = ({ exercise = "", prescribedExercise = "" } = {}) => {
  const actualKey = normalizePerformanceExerciseKey(exercise || "");
  const prescribedKey = normalizePerformanceExerciseKey(prescribedExercise || "");
  const hasPrescription = Boolean(prescribedKey);
  const isSubstituted = Boolean(hasPrescription && actualKey && actualKey !== prescribedKey);
  return {
    isSubstituted,
    substitutionState: isSubstituted ? "substituted" : hasPrescription ? "prescribed" : "unplanned",
    canResetToPrescribed: isSubstituted && hasPrescription,
  };
};

const buildFieldDefinition = ({
  id = "",
  label = "",
  inputType = "text",
  section = "generic",
  fastPath = false,
  prefilledValue = "",
  visible = true,
} = {}) => ({
  id,
  label,
  inputType,
  section,
  fastPath: Boolean(fastPath),
  prefilledValue: typeof prefilledValue === "string" ? prefilledValue : normalizeNumericText(prefilledValue),
  visible: Boolean(visible),
});

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
  if (!hasRunData && !hasStrengthData && /rest|recovery|mobility|walk|stretch/.test(raw)) return WORKOUT_LOG_FAMILIES.recovery;
  if (hasRunData) return WORKOUT_LOG_FAMILIES.run;
  if (hasStrengthData) return WORKOUT_LOG_FAMILIES.strength;
  return WORKOUT_LOG_FAMILIES.generic;
};

const inferPlannedFamily = ({ training = null, prescribedExercises = [] } = {}) => {
  const typeText = String(training?.type || "").toLowerCase();
  const labelText = String(training?.label || "").toLowerCase();
  const raw = `${typeText} ${labelText} ${training?.run?.t || ""}`.trim();
  const hasRunPlan = Boolean(
    training?.run
    || /run|tempo|interval|easy|long|aerobic|cardio|stride/.test(raw)
  );
  const hasStrengthPlan = Boolean(
    Array.isArray(prescribedExercises) && prescribedExercises.length > 0
    || training?.strSess
    || /strength|push|pull|bench|squat|deadlift|press|row|lift|prehab/.test(raw)
  );
  if (hasRunPlan && hasStrengthPlan) return WORKOUT_LOG_FAMILIES.mixed;
  if (!hasRunPlan && !hasStrengthPlan && /rest|recovery|mobility|walk|stretch/.test(raw)) return WORKOUT_LOG_FAMILIES.recovery;
  if (hasRunPlan) return WORKOUT_LOG_FAMILIES.run;
  if (hasStrengthPlan) return WORKOUT_LOG_FAMILIES.strength;
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

const formatNumericToken = (value = 0, unit = "") => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "";
  const numeric = Number(value);
  const normalized = Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(2)));
  return `${normalized} ${unit}`.trim();
};

const formatNumericValue = (value = 0) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(2)));
};

const estimateStructuredRunMinutes = (detail = "") => {
  const normalized = sanitizeText(detail).toLowerCase();
  if (!normalized) return 0;
  let total = 0;
  let remaining = normalized.replace(
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*min\s*\/\s*(\d+(?:\.\d+)?)\s*min/gi,
    (_, repeats, workMinutes, recoveryMinutes) => {
      total += Number(repeats) * (Number(workMinutes) + Number(recoveryMinutes));
      return " ";
    }
  );
  remaining = remaining.replace(
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*min\b/gi,
    (_, repeats, minutes) => {
      total += Number(repeats) * Number(minutes);
      return " ";
    }
  );
  total += sumPatternNumbers(remaining, /(\d+(?:\.\d+)?)\s*min\b/gi);
  return total;
};

const buildRunPrescriptionHints = (training = null) => {
  const detail = buildRunStructure(training);
  if (!detail) return { durationHint: "", distanceHint: "", paceHint: "", durationValue: "", distanceValue: "", paceValue: "" };
  const minuteTotal = estimateStructuredRunMinutes(detail);
  const mileTotal = sumPatternNumbers(detail, /(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/gi);
  const durationValue = formatNumericValue(minuteTotal);
  const distanceValue = formatNumericValue(Number(mileTotal.toFixed(2)));
  const paceMatch = detail.match(/(?:@|\bpace\b[: ]?)\s*(\d{1,2}:\d{2})/i)
    || detail.match(/\b(\d{1,2}:\d{2})\s*(?:\/\s*(?:mi|mile)|pace)\b/i);
  const paceValue = paceMatch?.[1] || "";
  return {
    durationHint: durationValue ? formatNumericToken(durationValue, "min") : "",
    distanceHint: distanceValue ? formatNumericToken(distanceValue, "mi") : "",
    paceHint: paceValue ? `${paceValue} /mi` : "",
    durationValue,
    distanceValue,
    paceValue,
  };
};

const normalizeRunField = (value = "") => {
  if (value === "" || value === null || value === undefined) return "";
  return String(value).trim();
};

const buildRunDraft = ({ training = null, logEntry = {}, sessionRecord = null } = {}) => ({
  ...(() => {
    const hints = buildRunPrescriptionHints(training);
    const plannedModality = resolvePlannedSessionModality({
      training,
      family: training?.run ? WORKOUT_LOG_FAMILIES.run : inferPlannedFamily({ training }),
    });
    const actualModality = normalizeEnumKey(
      sessionRecord?.actual?.modality
      || logEntry?.actualSession?.modality
      || plannedModality
      || "run"
    ) || "run";
    const distance = normalizeRunField(sessionRecord?.actual?.distanceMiles ?? logEntry?.miles ?? hints.distanceValue ?? "");
    const duration = normalizeRunField(sessionRecord?.actual?.durationMinutes ?? logEntry?.runTime ?? hints.durationValue ?? "");
    const pace = sanitizeText(sessionRecord?.actual?.paceText || logEntry?.pace || hints.paceValue || "");
    return {
      enabled: Boolean(training?.run)
        || sessionRecord?.sessionFamily === WORKOUT_LOG_FAMILIES.run
        || isCardioModality(actualModality)
        || Boolean(String(logEntry?.miles || "").trim() || String(logEntry?.pace || "").trim() || String(logEntry?.runTime || "").trim()),
      distance,
      duration,
      pace,
      modality: actualModality,
      plannedModality,
      rpe: normalizeNumericText(sessionRecord?.actual?.rpe ?? logEntry?.actualSession?.rpe ?? ""),
      purpose: buildRunPurpose(training),
      structure: buildRunStructure(training),
      plannedDistanceHint: hints.distanceHint,
      plannedDurationHint: hints.durationHint,
      plannedPaceHint: hints.paceHint,
      plannedDistanceValue: hints.distanceValue,
      plannedDurationValue: hints.durationValue,
      plannedPaceValue: hints.paceValue,
    };
  })(),
});

const resolvePrescribedExercises = ({ training = null, prescribedExercises = [] } = {}) => {
  const directRows = Array.isArray(prescribedExercises) ? prescribedExercises : [];
  if (directRows.length > 0) return directRows;
  const canonicalRows = [
    ...(Array.isArray(training?.prescribedExercises) ? training.prescribedExercises : []),
    ...(Array.isArray(training?.exerciseRows) ? training.exerciseRows : []),
    ...(Array.isArray(training?.strengthExercises) ? training.strengthExercises : []),
    ...(Array.isArray(training?.exercises) ? training.exercises : []),
    ...(Array.isArray(training?.strength?.rows) ? training.strength.rows : []),
  ];
  return canonicalRows.filter(Boolean);
};

const normalizePrescribedExercise = (entry = {}) => {
  const exercise = sanitizeText(entry?.ex || entry?.exercise || entry?.exercise_name || "Exercise");
  const parsedSet = parseSetPrescription(entry?.sets || "");
  const repsText = sanitizeText(entry?.reps || parsedSet.repsText || "");
  const mode = inferPerformanceExerciseMode(exercise, entry?.mode || "");
  const prescribedSets = Math.max(1, parseSetCount(parsedSet.setsText));
  const prescribedReps = Math.max(1, parseRepTarget(repsText || parsedSet.repsText));
  const prescribedWeight = toFiniteNumber(entry?.prescribedWeight ?? entry?.weight ?? entry?.weightUsed, null);
  const substitutionMeta = buildStrengthSubstitutionMeta({
    exercise,
    prescribedExercise: exercise,
  });
  return {
    key: normalizePerformanceExerciseKey(exercise),
    prescribedExercise: exercise,
    exercise,
    prescribedSetsText: sanitizeText(parsedSet.setsText),
    prescribedRepsText: repsText || "As prescribed",
    prescribedSets,
    prescribedReps,
    prescribedWeight,
    actualWeight: mode === "bodyweight" || mode === "band" ? "" : normalizeNumericText(entry?.actualWeight ?? entry?.weightUsed ?? prescribedWeight ?? ""),
    actualSets: normalizeNumericText(prescribedSets),
    actualReps: normalizeNumericText(prescribedReps),
    bandTension: sanitizeText(entry?.bandTension || ""),
    bodyweightOnly: mode === "bodyweight",
    mode,
    bucket: inferPerformanceExerciseBucket(exercise),
    isSubstituted: substitutionMeta.isSubstituted,
    substitutionState: substitutionMeta.substitutionState,
    canResetToPrescribed: substitutionMeta.canResetToPrescribed,
    substitutionAllowed: true,
    prefilledFromPrescription: true,
  };
};

const toStrengthRowFromRecord = (record = {}) => {
  const exercise = sanitizeText(record?.exercise || "Exercise");
  const mode = inferPerformanceExerciseMode(exercise, record?.mode || "");
  const substitutionMeta = buildStrengthSubstitutionMeta({
    exercise,
    prescribedExercise: exercise,
  });
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
    isSubstituted: substitutionMeta.isSubstituted,
    substitutionState: substitutionMeta.substitutionState,
    canResetToPrescribed: substitutionMeta.canResetToPrescribed,
    substitutionAllowed: true,
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
    const nextExercise = sanitizeText(record?.exercise || row.exercise);
    const substitutionMeta = buildStrengthSubstitutionMeta({
      exercise: nextExercise,
      prescribedExercise: row.prescribedExercise,
    });
    return {
      ...row,
      exercise: nextExercise,
      actualSets: normalizeNumericText(record?.actual?.sets ?? record?.actualSets ?? ""),
      actualReps: normalizeNumericText(record?.actual?.reps ?? record?.actualReps ?? ""),
      actualWeight: normalizeNumericText(record?.actual?.weight ?? record?.actualWeight ?? ""),
      bandTension: sanitizeText(record?.prescribed?.bandTension || record?.bandTension || row.bandTension || ""),
      bodyweightOnly: Boolean(record?.prescribed?.bodyweightOnly ?? row.bodyweightOnly),
      mode: inferPerformanceExerciseMode(record?.exercise || row.exercise, record?.mode || row.mode),
      isSubstituted: substitutionMeta.isSubstituted,
      substitutionState: substitutionMeta.substitutionState,
      canResetToPrescribed: substitutionMeta.canResetToPrescribed,
      substitutionAllowed: true,
    };
  });
  const leftoverActualRows = actualRecords
    .filter((record) => !usedActualKeys.has(normalizePerformanceExerciseKey(record?.exercise || "")))
    .map((record) => {
      const row = toStrengthRowFromRecord(record);
      return {
        ...row,
        isSubstituted: true,
        substitutionState: "unplanned",
        canResetToPrescribed: false,
      };
    });
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

const buildRunFieldDefinitions = (run = {}) => ([
  buildFieldDefinition({ id: "modality", label: "Modality", inputType: "select", section: "run", prefilledValue: run?.modality || "" }),
  buildFieldDefinition({ id: "distance", label: "Distance", inputType: "number", section: "run", prefilledValue: run?.distance || "" }),
  buildFieldDefinition({ id: "duration", label: "Time", inputType: "duration", section: "run", prefilledValue: run?.duration || "" }),
  buildFieldDefinition({ id: "pace", label: "Pace", inputType: "pace", section: "run", prefilledValue: run?.pace || "" }),
  buildFieldDefinition({ id: "rpe", label: "RPE", inputType: "number", section: "run", prefilledValue: run?.rpe || "" }),
  buildFieldDefinition({ id: "feel", label: "Effort", inputType: "rating", section: "run" }),
  buildFieldDefinition({ id: "notes", label: "Note", inputType: "textarea", section: "run" }),
]);

const buildStrengthFieldDefinitions = () => ([
  buildFieldDefinition({ id: "exercise", label: "Exercise", inputType: "text", section: "strength" }),
  buildFieldDefinition({ id: "actualSets", label: "Sets", inputType: "number", section: "strength", fastPath: true }),
  buildFieldDefinition({ id: "actualReps", label: "Reps", inputType: "number", section: "strength", fastPath: true }),
  buildFieldDefinition({ id: "actualWeight", label: "Weight", inputType: "number", section: "strength", fastPath: true }),
  buildFieldDefinition({ id: "feel", label: "Effort", inputType: "rating", section: "strength" }),
  buildFieldDefinition({ id: "notes", label: "Note", inputType: "textarea", section: "strength" }),
]);

const buildGenericFieldDefinitions = (generic = {}) => ([
  buildFieldDefinition({ id: "modality", label: "Modality", inputType: "select", section: "generic", prefilledValue: generic?.modality || "" }),
  buildFieldDefinition({ id: "duration", label: "Time", inputType: "duration", section: "generic", prefilledValue: generic?.duration || "" }),
  buildFieldDefinition({ id: "distance", label: "Distance", inputType: "number", section: "generic", prefilledValue: generic?.distance || "" }),
  buildFieldDefinition({ id: "reps", label: "Reps", inputType: "number", section: "generic", prefilledValue: generic?.reps || "" }),
  buildFieldDefinition({ id: "weight", label: "Weight", inputType: "number", section: "generic", prefilledValue: generic?.weight || "" }),
  buildFieldDefinition({ id: "feel", label: "Effort", inputType: "rating", section: "generic" }),
  buildFieldDefinition({ id: "notes", label: "Note", inputType: "textarea", section: "generic" }),
]);

export const buildWorkoutLogFormRecommendation = ({
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
  const resolvedPrescribedExercises = resolvePrescribedExercises({ training, prescribedExercises });
  const plannedFamily = inferPlannedFamily({
    training,
    prescribedExercises: resolvedPrescribedExercises,
  });
  const sessionRecord = getSessionPerformanceRecordsForLog(logEntry || {}, { dateKey: safeDateKey })[0] || null;
  const strengthSourceLogEntry = plannedFamily === WORKOUT_LOG_FAMILIES.run ? {} : logEntry;
  const previewStrength = buildStrengthRows({ prescribedExercises: resolvedPrescribedExercises, logEntry: strengthSourceLogEntry, dateKey: safeDateKey });
  const fallbackFamily = inferFallbackFamily({
    training,
    logEntry,
    exerciseRecords: previewStrength.rows,
    sessionRecord,
  });
  const family = plannedFamily !== WORKOUT_LOG_FAMILIES.generic ? plannedFamily : fallbackFamily;
  const strength = buildStrengthDraft({
    family,
    prescribedExercises: resolvedPrescribedExercises,
    logEntry: strengthSourceLogEntry,
    dateKey: safeDateKey,
  });
  const run = buildRunDraft({ training, logEntry, sessionRecord });
  const firstStrengthRow = strength.rows[0] || null;
  const genericVisible = family === WORKOUT_LOG_FAMILIES.generic
    || family === WORKOUT_LOG_FAMILIES.recovery
    || (family === WORKOUT_LOG_FAMILIES.strength && !strength.hasPrescribedStructure && strength.rows.length === 0);
  const genericBase = buildGenericSessionDraft({ family, training, logEntry, sessionRecord });
  const generic = {
    ...genericBase,
    visible: genericVisible,
    reps: genericVisible ? normalizeNumericText(logEntry?.reps ?? logEntry?.pushups ?? firstStrengthRow?.actualReps ?? genericBase.reps ?? "") : "",
    weight: genericVisible ? normalizeNumericText(logEntry?.weight ?? firstStrengthRow?.actualWeight ?? genericBase.weight ?? "") : "",
  };
  const plannedSummary = buildCanonicalPlanSurfaceModel({
    surface: "log",
    plannedDayRecord,
    training,
    prescribedExercises: resolvedPrescribedExercises,
    includeWhy: false,
  }).display;
  const sections = {
    run: {
      enabled: family === WORKOUT_LOG_FAMILIES.run || family === WORKOUT_LOG_FAMILIES.mixed,
      fields: buildRunFieldDefinitions(run),
      purpose: run.purpose,
      structure: run.structure,
    },
    strength: {
      enabled: family === WORKOUT_LOG_FAMILIES.strength || family === WORKOUT_LOG_FAMILIES.mixed,
      fields: buildStrengthFieldDefinitions(),
      prefilledRows: strength.rows,
      hasPrescribedStructure: strength.hasPrescribedStructure,
      substitutionAllowed: family === WORKOUT_LOG_FAMILIES.strength || family === WORKOUT_LOG_FAMILIES.mixed,
    },
    generic: {
      enabled: generic.visible,
      fields: buildGenericFieldDefinitions(generic),
    },
  };
  const recommendedFields = Object.values(sections)
    .filter((section) => section?.enabled)
    .flatMap((section) => section.fields || []);
  return {
    date: safeDateKey,
    recommendedMode: family,
    family,
    plannedFamily,
    sessionType: sanitizeText(training?.type || logEntry?.actualSession?.sessionType || family || "session"),
    sessionLabel: sanitizeText(
      logEntry?.actualSession?.sessionLabel
      || logEntry?.type
      || training?.label
      || plannedDayRecord?.resolved?.training?.label
      || "Session"
    ),
    prescribedLabel: sanitizeText(training?.label || ""),
    plannedSummary,
    recommendedFields,
    sections,
    prefilledExerciseRows: strength.rows,
    substitutionSupport: {
      allowed: family === WORKOUT_LOG_FAMILIES.strength || family === WORKOUT_LOG_FAMILIES.mixed,
      markers: [
        "exercise_can_be_overridden",
        "isSubstituted_row_flag",
      ],
      hasPrefilledRows: strength.rows.length > 0,
      hasPrescribedStructure: strength.hasPrescribedStructure,
    },
    run,
    strength,
    generic,
  };
};

export const buildWorkoutLogDraft = ({
  dateKey = "",
  plannedDayRecord = null,
  logEntry = {},
  fallbackTraining = null,
  prescribedExercises = [],
} = {}) => {
  const recommendation = buildWorkoutLogFormRecommendation({
    dateKey,
    plannedDayRecord,
    logEntry,
    fallbackTraining,
    prescribedExercises,
  });
  return {
    ...recommendation,
    logMode: recommendation.recommendedMode,
    completion: {
      selection: resolveCompletionSelection(logEntry),
    },
    session: {
      actualModality: normalizeEnumKey(logEntry?.actualSession?.modality || recommendation?.run?.modality || recommendation?.generic?.modality || resolvePlannedSessionModality({
        training: plannedDayRecord?.resolved?.training || fallbackTraining || null,
        family: recommendation.family,
      })),
      swapLabel: sanitizeText(logEntry?.actualSession?.swapLabel || ""),
    },
    signals: buildDraftSignals(logEntry),
    feel: String(logEntry?.feel || "3"),
    location: sanitizeText(logEntry?.location || "home") || "home",
    notes: sanitizeText(logEntry?.notes || ""),
  };
};

const QUICK_CAPTURE_STRENGTH_ROW_LIMIT = 3;

const buildQuickStrengthRowSummary = (row = {}) => joinQuickParts([
  row?.prescribedSetsText ? `${sanitizeText(row.prescribedSetsText)} sets` : "",
  sanitizeText(row?.prescribedRepsText || ""),
  row?.prescribedWeight !== null && row?.prescribedWeight !== undefined ? `${row.prescribedWeight} lb` : "",
  row?.bodyweightOnly ? "BW" : "",
  sanitizeText(row?.bandTension || ""),
]);

const hasValidStrengthQuickRow = (row = {}) => (
  Math.max(0, Number(row?.actualSets || 0) || 0) > 0
  && Math.max(0, Number(row?.actualReps || 0) || 0) > 0
);

const hasRunQuickChange = (draft = {}) => {
  if (!draft?.sections?.run?.enabled) return false;
  const actualModality = normalizeEnumKey(draft?.session?.actualModality || draft?.run?.modality || "");
  const plannedModality = normalizeEnumKey(draft?.run?.plannedModality || "");
  return (
    (actualModality && plannedModality && actualModality !== plannedModality)
    || normalizeNumericText(draft?.run?.rpe || "") !== ""
    || normalizeRunField(draft?.run?.duration || "") !== normalizeRunField(draft?.run?.plannedDurationValue || "")
    || normalizeRunField(draft?.run?.distance || "") !== normalizeRunField(draft?.run?.plannedDistanceValue || "")
    || sanitizeText(draft?.run?.pace || "") !== sanitizeText(draft?.run?.plannedPaceValue || "")
  );
};

const hasStrengthRowQuickChange = (row = {}) => {
  const actualExercise = sanitizeText(row?.exercise || "");
  const prescribedExercise = sanitizeText(row?.prescribedExercise || "");
  const actualSets = normalizeNumericText(row?.actualSets || "");
  const actualReps = normalizeNumericText(row?.actualReps || "");
  const actualWeight = normalizeNumericText(row?.actualWeight || "");
  const actualBandTension = sanitizeText(row?.bandTension || "");
  if (!prescribedExercise) {
    return Boolean(actualExercise || actualSets || actualReps || actualWeight || actualBandTension);
  }
  const prescribedSets = normalizeNumericText(row?.prescribedSets ?? parseSetCount(row?.prescribedSetsText || ""));
  const prescribedReps = normalizeNumericText(row?.prescribedReps ?? parseRepTarget(row?.prescribedRepsText || ""));
  const prescribedWeight = row?.bodyweightOnly || row?.mode === "band"
    ? ""
    : normalizeNumericText(row?.prescribedWeight ?? "");
  const prescribedBandTension = sanitizeText(row?.bandTension || "");
  return (
    actualExercise !== prescribedExercise
    || actualSets !== prescribedSets
    || actualReps !== prescribedReps
    || actualWeight !== prescribedWeight
    || actualBandTension !== prescribedBandTension
  );
};

export const hasWorkoutQuickCaptureValues = ({ draft = {} } = {}) => {
  const hasRunValue = hasRunQuickChange(draft);
  const hasStrengthValue = (draft?.strength?.rows || []).some((row) => hasStrengthRowQuickChange(row));
  const hasGenericValue = Boolean(
    normalizeEnumKey(draft?.generic?.modality || "") !== normalizeEnumKey(draft?.generic?.plannedModality || "")
    || normalizeRunField(draft?.generic?.duration || "")
    || normalizeRunField(draft?.generic?.distance || "")
    || normalizeNumericText(draft?.generic?.reps || "")
    || normalizeNumericText(draft?.generic?.weight || "")
  );
  return hasRunValue || hasStrengthValue || hasGenericValue;
};

export const buildWorkoutQuickCaptureModel = ({ draft = {} } = {}) => {
  const family = draft?.family || WORKOUT_LOG_FAMILIES.generic;
  const prescribedLabel = sanitizeText(draft?.prescribedLabel || "");
  const sessionLabel = sanitizeText(draft?.sessionLabel || "Session") || "Session";
  const allStrengthRows = Array.isArray(draft?.strength?.rows) ? draft.strength.rows : [];
  const quickStrengthRows = allStrengthRows
    .slice(0, QUICK_CAPTURE_STRENGTH_ROW_LIMIT)
    .map((row, index) => {
      const exercise = sanitizeText(row?.exercise || row?.prescribedExercise || `Exercise ${index + 1}`) || `Exercise ${index + 1}`;
      const mode = row?.mode || inferPerformanceExerciseMode(exercise, row?.mode || "");
      return {
        rowIndex: index,
        exercise,
        prescribedExercise: sanitizeText(row?.prescribedExercise || ""),
        prescribedSummary: buildQuickStrengthRowSummary(row),
        actualSets: normalizeNumericText(row?.actualSets || ""),
        actualReps: normalizeNumericText(row?.actualReps || ""),
        actualWeight: normalizeNumericText(row?.actualWeight || ""),
        bandTension: sanitizeText(row?.bandTension || ""),
        bodyweightOnly: Boolean(row?.bodyweightOnly || mode === "bodyweight"),
        mode,
      };
    });
  return {
    family,
    completeActionLabel: prescribedLabel ? "Quick complete" : "Mark complete",
    detailToggleLabel: family === WORKOUT_LOG_FAMILIES.run
      ? "Add quick run details"
      : family === WORKOUT_LOG_FAMILIES.strength
        ? "Add quick sets and reps"
        : family === WORKOUT_LOG_FAMILIES.mixed
          ? "Add quick details"
          : "Add quick details",
    saveActionLabel: family === WORKOUT_LOG_FAMILIES.run
      ? "Save run"
      : family === WORKOUT_LOG_FAMILIES.strength
        ? "Save strength"
        : family === WORKOUT_LOG_FAMILIES.mixed
          ? "Save workout"
          : "Save log",
    helperLine: prescribedLabel
      ? `Planned today: ${prescribedLabel}.`
      : `Logging: ${sessionLabel}.`,
    supportLine: "Full details are optional.",
    run: {
      enabled: Boolean(draft?.sections?.run?.enabled),
      fields: [
        { id: "duration", label: "Time", inputType: "duration", placeholder: "Time", value: normalizeRunField(draft?.run?.duration || "") },
        { id: "distance", label: "Distance", inputType: "number", placeholder: "Miles", value: normalizeRunField(draft?.run?.distance || "") },
        { id: "pace", label: "Pace", inputType: "pace", placeholder: "Pace", value: sanitizeText(draft?.run?.pace || "") },
      ],
      summary: joinQuickParts([
        sanitizeText(draft?.run?.purpose || ""),
        sanitizeText(draft?.run?.structure || ""),
      ]),
    },
    strength: {
      enabled: Boolean(draft?.sections?.strength?.enabled),
      rows: quickStrengthRows,
      hiddenRowCount: Math.max(0, allStrengthRows.length - quickStrengthRows.length),
      hasPrescribedStructure: Boolean(draft?.strength?.hasPrescribedStructure),
    },
    generic: {
      enabled: Boolean(draft?.sections?.generic?.enabled),
      fields: [
        { id: "reps", label: "Reps", inputType: "number", placeholder: "Reps", value: normalizeNumericText(draft?.generic?.reps || "") },
        { id: "weight", label: "Weight", inputType: "number", placeholder: "Weight", value: normalizeNumericText(draft?.generic?.weight || "") },
      ],
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

const buildResolvedSessionFamily = ({ draft = {}, actualModality = "" } = {}) => {
  if (isStrengthModality(actualModality)) return WORKOUT_LOG_FAMILIES.strength;
  if (normalizeEnumKey(actualModality) === "mobility") return WORKOUT_LOG_FAMILIES.recovery;
  if (isCardioModality(actualModality)) {
    return draft?.family === WORKOUT_LOG_FAMILIES.mixed ? WORKOUT_LOG_FAMILIES.mixed : WORKOUT_LOG_FAMILIES.run;
  }
  return draft?.family || WORKOUT_LOG_FAMILIES.generic;
};

const buildCompletionOutcome = ({ draft = {} } = {}) => {
  const selection = normalizeEnumKey(draft?.completion?.selection || "completed") || "completed";
  const actualModality = normalizeEnumKey(
    draft?.session?.actualModality
    || draft?.run?.modality
    || draft?.generic?.modality
    || resolvePlannedSessionModality({ family: draft?.family || WORKOUT_LOG_FAMILIES.generic })
  ) || "other";
  const plannedModality = normalizeEnumKey(
    draft?.run?.plannedModality
    || draft?.generic?.plannedModality
    || resolvePlannedSessionModality({ family: draft?.family || WORKOUT_LOG_FAMILIES.generic })
  ) || "other";
  const hasSwap = selection === "swapped"
    || (draft?.family === WORKOUT_LOG_FAMILIES.run && actualModality && plannedModality && !isRunEquivalentModality(actualModality) && actualModality !== plannedModality)
    || (draft?.family === WORKOUT_LOG_FAMILIES.strength && selection === "swapped");
  if (selection === "skipped") {
    return {
      selection,
      status: "skipped",
      completionKind: "skipped",
      differenceKind: "skipped",
      modifiedFromPlan: false,
      swapFromPlan: false,
      actualModality,
      actualFamily: buildResolvedSessionFamily({ draft, actualModality }),
    };
  }
  if (selection === "partial") {
    return {
      selection,
      status: "partial_completed",
      completionKind: "modified",
      differenceKind: "modified",
      modifiedFromPlan: true,
      swapFromPlan: false,
      actualModality,
      actualFamily: buildResolvedSessionFamily({ draft, actualModality }),
    };
  }
  if (hasSwap) {
    return {
      selection,
      status: "completed_modified",
      completionKind: "custom_session",
      differenceKind: "custom_session",
      modifiedFromPlan: true,
      swapFromPlan: true,
      actualModality,
      actualFamily: buildResolvedSessionFamily({ draft, actualModality }),
    };
  }
  if (hasWorkoutQuickCaptureValues({ draft })) {
    return {
      selection,
      status: "completed_modified",
      completionKind: "modified",
      differenceKind: "modified",
      modifiedFromPlan: true,
      swapFromPlan: false,
      actualModality,
      actualFamily: buildResolvedSessionFamily({ draft, actualModality }),
    };
  }
  return {
    selection,
    status: "completed_as_planned",
    completionKind: "as_prescribed",
    differenceKind: "none",
    modifiedFromPlan: false,
    swapFromPlan: false,
    actualModality,
    actualFamily: buildResolvedSessionFamily({ draft, actualModality }),
  };
};

export const buildWorkoutDailyCheckinFromDraft = ({
  draft = {},
  todayKey = "",
} = {}) => {
  const completion = buildCompletionOutcome({ draft });
  const readinessHints = mapRecoveryStateToReadiness(draft?.signals?.recoveryState || "");
  const soreness = mapBodyStatusToSorenessScore(draft?.signals?.bodyStatus || "");
  const note = sanitizeText(draft?.notes || "");
  return {
    status: completion.status,
    sessionFeel: mapFeelToSessionFeel(draft?.feel || "3"),
    blocker: mapBlockerSelectionToCheckinBlocker(draft?.signals?.blocker || ""),
    note,
    readiness: {
      sleep: readinessHints.sleep,
      stress: readinessHints.stress,
      soreness,
    },
    actualRecovery: {
      status: completion.status,
      sessionFeel: mapFeelToSessionFeel(draft?.feel || "3"),
      blocker: mapBlockerSelectionToCheckinBlocker(draft?.signals?.blocker || ""),
      note,
      readiness: {
        sleep: readinessHints.sleep,
        stress: readinessHints.stress,
        soreness,
      },
      loggedAt: Date.now(),
    },
    ts: Date.now(),
    dateKey: draft?.date || todayKey || "",
  };
};

export const buildWorkoutLogEntryFromDraft = ({
  draft = {},
  baseEntry = {},
  todayKey = "",
} = {}) => {
  const strengthPerformance = buildStrengthPerformanceFromRows(draft?.strength?.rows || [], draft?.feel || "3");
  const firstStrengthRow = strengthPerformance[0] || null;
  const completion = buildCompletionOutcome({ draft });
  const hasRunSection = Boolean(draft?.run?.enabled || isCardioModality(completion.actualModality));
  const hasGenericSession = Boolean(
    draft?.generic?.visible
    || (!hasRunSection && completion.actualFamily !== WORKOUT_LOG_FAMILIES.strength)
  );
  const plannedLabel = sanitizeText(draft?.sessionLabel || baseEntry?.type || "Session") || "Session";
  const swapLabel = sanitizeText(draft?.session?.swapLabel || "");
  const modalityLabel = findOptionLabel(WORKOUT_LOG_MODALITY_OPTIONS, completion.actualModality, sanitizeText(completion.actualModality || ""));
  const type = completion.swapFromPlan
    ? (swapLabel || (modalityLabel ? `${modalityLabel} substitute` : plannedLabel))
    : plannedLabel;
  const sessionType = completion.swapFromPlan
    ? (completion.actualModality || sanitizeText(draft?.sessionType || baseEntry?.actualSession?.sessionType || draft?.family || "session"))
    : sanitizeText(draft?.sessionType || baseEntry?.actualSession?.sessionType || draft?.family || "session");
  const dailyCheckin = buildWorkoutDailyCheckinFromDraft({ draft, todayKey });
  return {
    ...baseEntry,
    date: draft?.date || baseEntry?.date || todayKey,
    type,
    miles: hasRunSection
      ? normalizeNumericText(draft?.run?.distance || "")
      : hasGenericSession
        ? normalizeNumericText(draft?.generic?.distance || "")
        : "",
    pace: hasRunSection ? sanitizeText(draft?.run?.pace || "") : "",
    runTime: hasRunSection
      ? normalizeNumericText(draft?.run?.duration || "")
      : hasGenericSession
        ? normalizeNumericText(draft?.generic?.duration || "")
        : "",
    notes: sanitizeText(draft?.notes || ""),
    feel: String(draft?.feel || "3"),
    location: sanitizeText(draft?.location || "home") || "home",
    reps: hasGenericSession ? normalizeNumericText(draft?.generic?.reps || "") : normalizeNumericText(firstStrengthRow?.actualReps || ""),
    pushups: hasGenericSession ? normalizeNumericText(draft?.generic?.reps || "") : normalizeNumericText(firstStrengthRow?.actualReps || ""),
    weight: hasGenericSession ? normalizeNumericText(draft?.generic?.weight || "") : normalizeNumericText(firstStrengthRow?.actualWeight || ""),
    strengthPerformance,
    checkin: {
      ...(baseEntry?.checkin || {}),
      status: completion.status,
      sessionFeel: dailyCheckin.sessionFeel,
      blocker: dailyCheckin.blocker,
      readiness: dailyCheckin.readiness,
      feelRating: String(draft?.feel || "3"),
      note: dailyCheckin.note,
      ts: Date.now(),
    },
    actualSession: {
      ...(baseEntry?.actualSession || {}),
      status: completion.status,
      completionKind: completion.completionKind,
      sessionType,
      sessionLabel: type,
      sessionFamily: completion.actualFamily || draft?.family || baseEntry?.actualSession?.sessionFamily || "",
      modifiedFromPlan: completion.modifiedFromPlan,
      swapFromPlan: completion.swapFromPlan,
      userSelection: completion.selection,
      modality: completion.actualModality || "",
      rpe: normalizeNumericText(draft?.run?.rpe || ""),
      bodyStatus: normalizeEnumKey(draft?.signals?.bodyStatus || ""),
      recoveryState: normalizeEnumKey(draft?.signals?.recoveryState || ""),
      swapLabel,
      loggedAt: Date.now(),
    },
    editedAt: Date.now(),
    retroEdited: Boolean(draft?.date && todayKey && draft.date < todayKey),
    ts: Date.now(),
  };
};
