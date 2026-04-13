import { sanitizeDisplayCopy } from "./text-format-service.js";
import { buildDayPrescriptionDisplay } from "./day-prescription-display-service.js";
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

export const WORKOUT_LOG_MODES = {
  running: WORKOUT_LOG_FAMILIES.run,
  strength: WORKOUT_LOG_FAMILIES.strength,
  mixed: WORKOUT_LOG_FAMILIES.mixed,
  generic: WORKOUT_LOG_FAMILIES.generic,
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

const joinQuickParts = (parts = []) => parts.filter(Boolean).join(" · ");

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
    isSubstituted: substitutionMeta.isSubstituted,
    substitutionState: substitutionMeta.substitutionState,
    canResetToPrescribed: substitutionMeta.canResetToPrescribed,
    substitutionAllowed: true,
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
  buildFieldDefinition({ id: "distance", label: "Distance", inputType: "number", section: "run", prefilledValue: run?.distance || "" }),
  buildFieldDefinition({ id: "duration", label: "Time", inputType: "duration", section: "run", prefilledValue: run?.duration || "" }),
  buildFieldDefinition({ id: "pace", label: "Pace", inputType: "pace", section: "run", prefilledValue: run?.pace || "" }),
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
  const genericVisible = family === WORKOUT_LOG_FAMILIES.generic || (family === WORKOUT_LOG_FAMILIES.strength && !strength.hasPrescribedStructure && strength.rows.length === 0);
  const generic = {
    visible: genericVisible,
    reps: genericVisible ? normalizeNumericText(logEntry?.reps ?? logEntry?.pushups ?? firstStrengthRow?.actualReps ?? "") : "",
    weight: genericVisible ? normalizeNumericText(logEntry?.weight ?? firstStrengthRow?.actualWeight ?? "") : "",
  };
  const plannedSummary = buildDayPrescriptionDisplay({
    training,
    includeWhy: false,
    prescribedExercises: resolvedPrescribedExercises,
  });
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

export const hasWorkoutQuickCaptureValues = ({ draft = {} } = {}) => {
  const hasRunValue = Boolean(
    normalizeRunField(draft?.run?.duration || "")
    || normalizeRunField(draft?.run?.distance || "")
    || sanitizeText(draft?.run?.pace || "")
  );
  const hasStrengthValue = (draft?.strength?.rows || []).some((row) => hasValidStrengthQuickRow(row));
  const hasGenericValue = Boolean(
    normalizeNumericText(draft?.generic?.reps || "")
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
          ? "Add quick actual details"
          : "Add quick details",
    saveActionLabel: family === WORKOUT_LOG_FAMILIES.run
      ? "Save quick run log"
      : family === WORKOUT_LOG_FAMILIES.strength
        ? "Save quick strength log"
        : family === WORKOUT_LOG_FAMILIES.mixed
          ? "Save quick workout log"
          : "Save quick log",
    helperLine: prescribedLabel
      ? `Planned today: ${prescribedLabel}.`
      : `Logging: ${sessionLabel}.`,
    supportLine: "Actual details stay separate from what was prescribed.",
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
