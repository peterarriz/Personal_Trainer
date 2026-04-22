import { comparePlannedDayToActual } from "../modules-checkins.js";
import { dedupeStrings } from "../utils/collection-utils.js";
import { buildExerciseTransferProfile } from "./exercise-transfer-profile-service.js";
import {
  getExercisePerformanceRecordsForLog,
  normalizePerformanceExerciseKey,
} from "./performance-record-service.js";
import { getCurrentPrescribedDayRecord } from "./prescribed-day-history-service.js";

export const HABIT_ADAPTATION_MODEL_VERSION = "2026-04-habit-adaptation-v2";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ACCESSORY_PRIMARY_PATTERNS = new Set([
  "upper_pull",
  "upper_press_support",
  "shoulder_isolation",
  "scap_support",
  "triceps_support",
  "trunk",
  "lower_leg_support",
  "single_leg",
  "posterior_chain_support",
  "swim_dryland",
  "shoulder_tolerance",
]);
const DAY_LABELS = Object.freeze({
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  0: "Sunday",
});
const LOW_IMPACT_CARDIO_MODES = new Set(["bike", "elliptical", "incline_walk", "rower", "swim"]);
const RUN_STYLE_CARDIO_MODES = new Set(["outdoor_run", "treadmill", "run_walk"]);

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const toDateKey = (value = "") => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};
const getDayKeyForDate = (dateKey = "") => {
  const parsed = new Date(`${sanitizeText(dateKey, 24)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getDay();
};
const resolveWeekdayLabel = (dayKey = null) => DAY_LABELS?.[Number(dayKey)] || "that day";

const getPlannedTraining = (plannedDayRecord = null) => (
  plannedDayRecord?.resolved?.training
  || plannedDayRecord?.plan?.resolved?.training
  || plannedDayRecord?.training
  || plannedDayRecord?.base?.training
  || null
);

const resolveCompletionKind = ({ comparison = null, logEntry = null } = {}) => {
  const completionKind = sanitizeText(
    comparison?.completionKind
    || comparison?.status
    || logEntry?.actualSession?.completionKind
    || logEntry?.actualSession?.status
    || logEntry?.checkin?.status
    || logEntry?.status
    || "",
    40
  ).toLowerCase();
  if (["completed_as_planned", "as_prescribed"].includes(completionKind)) return "as_prescribed";
  if (["completed_modified", "partial_completed", "modified"].includes(completionKind)) return "modified";
  if (["custom_session"].includes(completionKind)) return "custom_session";
  if (["skipped"].includes(completionKind)) return "skipped";
  return completionKind || "pending";
};

const isCompletedHabitOutcome = (completionKind = "") => ["as_prescribed", "modified", "custom_session"].includes(String(completionKind || "").toLowerCase());

const buildLogHabitText = ({ plannedTraining = null, logEntry = null } = {}) => sanitizeText([
  plannedTraining?.type || "",
  plannedTraining?.label || "",
  plannedTraining?.run?.t || "",
  plannedTraining?.run?.d || "",
  logEntry?.actualSession?.sessionLabel || "",
  logEntry?.actualSession?.sessionType || "",
  logEntry?.actualSession?.modality || "",
  logEntry?.actualSession?.swapLabel || "",
  logEntry?.label || "",
  logEntry?.type || "",
  logEntry?.notes || "",
], 400).toLowerCase();

const resolveCardioMode = (text = "") => {
  const safeText = sanitizeText(text, 320).toLowerCase();
  if (!safeText) return "";
  if (/incline walk|incline treadmill walk/.test(safeText)) return "incline_walk";
  if (/elliptical/.test(safeText)) return "elliptical";
  if (/\bbike\b|\bcycle\b|\bcycling\b|\bspin\b|\btrainer\b/.test(safeText)) return "bike";
  if (/\brower\b|\browing\b|\berg\b/.test(safeText)) return "rower";
  if (/\bswim\b|\bpool\b|\bopen water\b/.test(safeText)) return "swim";
  if (/run\/walk|run-walk|walk\/run|walk-run/.test(safeText)) return "run_walk";
  if (/\btreadmill\b/.test(safeText)) return "treadmill";
  if (/\btrail\b|\broad\b|\boutdoor\b|\boutside\b|\bpark\b/.test(safeText)) return "outdoor_run";
  if (/\bwalk\b/.test(safeText)) return "incline_walk";
  if (/\brun\b|\bjog\b/.test(safeText)) return "outdoor_run";
  if (/\bconditioning\b|\bcardio\b|\baerobic\b/.test(safeText)) return "general_cardio";
  return "";
};

const resolveCardioModeLabel = (mode = "") => {
  switch (sanitizeText(mode, 40).toLowerCase()) {
    case "bike": return "bike";
    case "elliptical": return "elliptical";
    case "incline_walk": return "incline walk";
    case "rower": return "rower";
    case "swim": return "swim";
    case "run_walk": return "run-walk";
    case "treadmill": return "treadmill";
    case "outdoor_run": return "outdoor run";
    default: return sanitizeText(mode.replace(/_/g, " "), 60).toLowerCase();
  }
};

const resolveCardioBucket = ({
  plannedTraining = null,
  logEntry = null,
  text = "",
} = {}) => {
  const safeText = sanitizeText(text, 320).toLowerCase();
  const plannedType = sanitizeText(plannedTraining?.type || "", 60).toLowerCase();
  if (/long-run/.test(plannedType) || /\blong run|long aerobic|long ride|endurance build\b/.test(safeText)) return "long_session";
  if (plannedType === "conditioning" || /\bconditioning|interval|otf|hiit|mixed modality\b/.test(safeText)) return "conditioning";
  if (["easy-run", "run+strength", "hard-run"].includes(plannedType) || /\brun|jog|treadmill|bike|elliptical|rower|walk\b/.test(safeText)) return "easy_aerobic";
  return "";
};

const isAccessoryPattern = (pattern = "") => ACCESSORY_PRIMARY_PATTERNS.has(String(pattern || "").trim().toLowerCase());

const isStrengthLikeSession = (training = null) => {
  const type = String(training?.type || "").toLowerCase();
  return ["strength+prehab", "run+strength"].includes(type);
};

const isExpectedSession = (training = null) => {
  const type = String(training?.type || "").toLowerCase();
  return Boolean(training) && !["", "rest", "recovery"].includes(type);
};

const createDayStats = (dayKey) => ({
  dayKey,
  expectedCount: 0,
  completedCount: 0,
  skippedCount: 0,
  modifiedCount: 0,
  pendingCount: 0,
  completionRate: 0,
  skipRate: 0,
});

const finalizeDayStats = (stats = {}) => ({
  ...stats,
  completionRate: stats.expectedCount > 0 ? Number((stats.completedCount / stats.expectedCount).toFixed(3)) : 0,
  skipRate: stats.expectedCount > 0 ? Number((stats.skippedCount / stats.expectedCount).toFixed(3)) : 0,
});

const buildWeekdayStats = ({
  logs = {},
  plannedDayRecords = {},
  todayKey = "",
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || new Date()) || "9999-12-31";
  const dayStats = Object.fromEntries(DAY_ORDER.map((dayKey) => [dayKey, createDayStats(dayKey)]));

  Object.entries(plannedDayRecords || {})
    .filter(([dateKey]) => sanitizeText(dateKey, 24) < safeTodayKey)
    .forEach(([dateKey, historyEntry]) => {
      const plannedDayRecord = getCurrentPrescribedDayRecord(historyEntry) || historyEntry || null;
      const training = getPlannedTraining(plannedDayRecord);
      if (!isExpectedSession(training)) return;
      const dayKey = getDayKeyForDate(dateKey);
      if (!Number.isInteger(dayKey)) return;
      const comparison = comparePlannedDayToActual({
        plannedDayRecord,
        actualLog: logs?.[dateKey] || {},
        dailyCheckin: logs?.[dateKey]?.checkin || {},
        dateKey,
      });
      dayStats[dayKey].expectedCount += 1;
      if (comparison?.completionKind === "as_prescribed") dayStats[dayKey].completedCount += 1;
      else if (comparison?.completionKind === "modified" || comparison?.completionKind === "custom_session") {
        dayStats[dayKey].completedCount += 1;
        dayStats[dayKey].modifiedCount += 1;
      } else if (comparison?.completionKind === "skipped" || comparison?.differenceKind === "not_logged_over_48h") {
        dayStats[dayKey].skippedCount += 1;
      } else {
        dayStats[dayKey].pendingCount += 1;
      }
    });

  return Object.fromEntries(
    Object.entries(dayStats).map(([dayKey, stats]) => [dayKey, finalizeDayStats(stats)])
  );
};

const resolveChronicMissDayKey = (weekdayStats = {}) => {
  const candidates = Object.values(weekdayStats || {})
    .filter((stats) => stats.expectedCount >= 3 && stats.skippedCount >= 2 && stats.skipRate >= 0.67)
    .sort((left, right) => (
      right.skipRate - left.skipRate
      || right.skippedCount - left.skippedCount
      || right.expectedCount - left.expectedCount
    ));
  return Number.isInteger(candidates?.[0]?.dayKey) ? candidates[0].dayKey : null;
};

const incrementCounter = (pool = {}, key = "", amount = 1) => {
  const safeKey = sanitizeText(key, 160);
  if (!safeKey) return;
  pool[safeKey] = (pool[safeKey] || 0) + amount;
};

const buildCardioModalityPreferences = ({
  logs = {},
  plannedDayRecords = {},
  todayKey = "",
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || new Date()) || "9999-12-31";
  const bucketModes = {
    easy_aerobic: { total: 0, modeCounts: {}, dayCounts: {} },
    conditioning: { total: 0, modeCounts: {}, dayCounts: {} },
    long_session: { total: 0, modeCounts: {}, dayCounts: {} },
  };

  const candidateDateKeys = dedupeStrings([
    ...Object.keys(plannedDayRecords || {}),
    ...Object.keys(logs || {}),
  ].filter((dateKey) => sanitizeText(dateKey, 24) < safeTodayKey)).sort();

  candidateDateKeys.forEach((dateKey) => {
    const logEntry = logs?.[dateKey] || null;
    if (!logEntry) return;
    const historyEntry = plannedDayRecords?.[dateKey] || null;
    const plannedDayRecord = getCurrentPrescribedDayRecord(historyEntry) || historyEntry || null;
    const plannedTraining = getPlannedTraining(plannedDayRecord);
    const comparison = plannedDayRecord
      ? comparePlannedDayToActual({
          plannedDayRecord,
          actualLog: logEntry,
          dailyCheckin: logEntry?.checkin || {},
          dateKey,
        })
      : null;
    const completionKind = resolveCompletionKind({ comparison, logEntry });
    if (!isCompletedHabitOutcome(completionKind)) return;

    const text = buildLogHabitText({ plannedTraining, logEntry });
    const mode = resolveCardioMode(text);
    if (!mode) return;
    const bucket = resolveCardioBucket({ plannedTraining, logEntry, text });
    if (!bucketModes[bucket]) return;
    const dayKey = getDayKeyForDate(dateKey);
    bucketModes[bucket].total += 1;
    incrementCounter(bucketModes[bucket].modeCounts, mode, 1);
    if (Number.isInteger(dayKey)) incrementCounter(bucketModes[bucket].dayCounts, String(dayKey), 1);
  });

  const pickDominantPreference = (bucketKey = "") => {
    const bucket = bucketModes[bucketKey];
    if (!bucket) return null;
    const rankedModes = Object.entries(bucket.modeCounts || {}).sort((left, right) => right[1] - left[1]);
    const [mode = "", evidenceCount = 0] = rankedModes[0] || [];
    const secondCount = Number(rankedModes?.[1]?.[1] || 0);
    if (!mode || evidenceCount < 2 || evidenceCount < secondCount + 1) return null;
    return {
      bucket: bucketKey,
      mode,
      label: resolveCardioModeLabel(mode),
      evidenceCount,
      lowImpact: LOW_IMPACT_CARDIO_MODES.has(mode),
      runStyle: RUN_STYLE_CARDIO_MODES.has(mode),
    };
  };

  const easyAerobic = pickDominantPreference("easy_aerobic");
  const conditioning = pickDominantPreference("conditioning");
  const longSession = pickDominantPreference("long_session");
  const preferredLongSessionDayKey = (() => {
    const dayCounts = bucketModes.long_session.dayCounts || {};
    const ranked = Object.entries(dayCounts).sort((left, right) => right[1] - left[1]);
    const [dayKey = "", count = 0] = ranked[0] || [];
    return count >= 2 && Number.isInteger(Number(dayKey)) ? Number(dayKey) : null;
  })();

  return {
    easyAerobic,
    conditioning,
    longSession,
    preferredLongSessionDayKey,
    lowImpactBias: Boolean(
      (easyAerobic?.lowImpact && easyAerobic?.evidenceCount >= 2)
      || (conditioning?.lowImpact && conditioning?.evidenceCount >= 2)
    ),
  };
};

const buildExercisePatternPreferences = ({
  logs = {},
  plannedDayRecords = {},
  todayKey = "",
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || new Date()) || "9999-12-31";
  const addedByPattern = {};
  const omittedByPattern = {};
  const omittedByExercise = {};

  Object.entries(plannedDayRecords || {})
    .filter(([dateKey]) => sanitizeText(dateKey, 24) < safeTodayKey)
    .forEach(([dateKey, historyEntry]) => {
      const plannedDayRecord = getCurrentPrescribedDayRecord(historyEntry) || historyEntry || null;
      const training = getPlannedTraining(plannedDayRecord);
      if (!isStrengthLikeSession(training)) return;
      const plannedRows = Array.isArray(training?.prescribedExercises) ? training.prescribedExercises : [];
      if (!plannedRows.length) return;
      const actualRecords = getExercisePerformanceRecordsForLog(logs?.[dateKey] || {}, { dateKey });
      if (!actualRecords.length) return;

      const actualKeys = new Set(actualRecords.map((record) => normalizePerformanceExerciseKey(record?.exercise || "")).filter(Boolean));

      plannedRows.forEach((row) => {
        const plannedProfile = buildExerciseTransferProfile({ exerciseName: row?.ex || "", note: row?.note || "" });
        if (!plannedProfile?.primaryPattern || !isAccessoryPattern(plannedProfile.primaryPattern)) return;
        const exactMatch = actualKeys.has(normalizePerformanceExerciseKey(row?.ex || ""));
        if (!exactMatch) {
          incrementCounter(omittedByPattern, plannedProfile.primaryPattern, 1);
          incrementCounter(omittedByExercise, row?.ex || "", 1);
        }
      });

      actualRecords.forEach((record) => {
        const actualKey = normalizePerformanceExerciseKey(record?.exercise || "");
        if (!actualKey || actualKeys.size === 0) return;
        const actualProfile = record?.transferProfile || buildExerciseTransferProfile({ exerciseName: record?.exercise || "", note: record?.note || "" });
        if (!actualProfile?.primaryPattern || !isAccessoryPattern(actualProfile.primaryPattern)) return;
        if (plannedRows.some((row) => normalizePerformanceExerciseKey(row?.ex || "") === actualKey)) return;
        if (!addedByPattern[actualProfile.primaryPattern]) addedByPattern[actualProfile.primaryPattern] = {};
        incrementCounter(addedByPattern[actualProfile.primaryPattern], record?.exercise || "", 1);
      });
    });

  return Object.entries(addedByPattern).map(([pattern, exerciseCounts]) => {
    const ranked = Object.entries(exerciseCounts || {}).sort((left, right) => right[1] - left[1]);
    const [preferredExercise = "", evidenceCount = 0] = ranked[0] || [];
    const omittedPatternCount = omittedByPattern[pattern] || 0;
    return {
      pattern,
      preferredExercise: sanitizeText(preferredExercise, 120),
      evidenceCount,
      omittedPatternCount,
      dominant: evidenceCount >= 2 && omittedPatternCount >= 2,
      alternatives: ranked.slice(1, 3).map(([exerciseName]) => sanitizeText(exerciseName, 120)).filter(Boolean),
    };
  }).filter((entry) => entry.dominant && entry.preferredExercise);
};

const buildAccessoryAddOnPreferences = ({
  logs = {},
  plannedDayRecords = {},
  todayKey = "",
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || new Date()) || "9999-12-31";
  const addedByPattern = {};

  Object.entries(plannedDayRecords || {})
    .filter(([dateKey]) => sanitizeText(dateKey, 24) < safeTodayKey)
    .forEach(([dateKey, historyEntry]) => {
      const plannedDayRecord = getCurrentPrescribedDayRecord(historyEntry) || historyEntry || null;
      const training = getPlannedTraining(plannedDayRecord);
      if (!isStrengthLikeSession(training)) return;
      const plannedRows = Array.isArray(training?.prescribedExercises) ? training.prescribedExercises : [];
      const actualRecords = getExercisePerformanceRecordsForLog(logs?.[dateKey] || {}, { dateKey });
      if (!actualRecords.length) return;

      const plannedKeys = new Set(plannedRows.map((row) => normalizePerformanceExerciseKey(row?.ex || "")).filter(Boolean));
      const plannedPatterns = new Set(
        plannedRows
          .map((row) => buildExerciseTransferProfile({ exerciseName: row?.ex || "", note: row?.note || "" })?.primaryPattern || "")
          .map((pattern) => sanitizeText(pattern, 80).toLowerCase())
          .filter(Boolean)
      );

      actualRecords.forEach((record) => {
        const actualKey = normalizePerformanceExerciseKey(record?.exercise || "");
        if (!actualKey || plannedKeys.has(actualKey)) return;
        const profile = record?.transferProfile || buildExerciseTransferProfile({ exerciseName: record?.exercise || "", note: record?.note || "" });
        const primaryPattern = sanitizeText(profile?.primaryPattern || "", 80).toLowerCase();
        if (!primaryPattern || !isAccessoryPattern(primaryPattern)) return;
        if ((profile?.directDriverIds || []).length > 0) return;
        if (plannedPatterns.has(primaryPattern)) return;
        if (!addedByPattern[primaryPattern]) addedByPattern[primaryPattern] = {};
        incrementCounter(addedByPattern[primaryPattern], record?.exercise || "", 1);
      });
    });

  return Object.entries(addedByPattern).map(([pattern, exerciseCounts]) => {
    const ranked = Object.entries(exerciseCounts || {}).sort((left, right) => right[1] - left[1]);
    const [preferredExercise = "", evidenceCount = 0] = ranked[0] || [];
    return {
      pattern,
      preferredExercise: sanitizeText(preferredExercise, 120),
      evidenceCount,
      dominant: evidenceCount >= 2,
    };
  }).filter((entry) => entry.dominant && entry.preferredExercise);
};

const buildAccessoryAvoidPatterns = ({
  logs = {},
  plannedDayRecords = {},
  todayKey = "",
  exercisePreferences = [],
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || new Date()) || "9999-12-31";
  const omittedByPattern = {};
  const replacementPatterns = new Set((exercisePreferences || []).map((entry) => sanitizeText(entry?.pattern || "", 80).toLowerCase()).filter(Boolean));

  Object.entries(plannedDayRecords || {})
    .filter(([dateKey]) => sanitizeText(dateKey, 24) < safeTodayKey)
    .forEach(([dateKey, historyEntry]) => {
      const plannedDayRecord = getCurrentPrescribedDayRecord(historyEntry) || historyEntry || null;
      const training = getPlannedTraining(plannedDayRecord);
      if (!isStrengthLikeSession(training)) return;
      const plannedRows = Array.isArray(training?.prescribedExercises) ? training.prescribedExercises : [];
      if (!plannedRows.length) return;
      const actualRecords = getExercisePerformanceRecordsForLog(logs?.[dateKey] || {}, { dateKey });
      if (!actualRecords.length) return;

      const actualKeys = new Set(actualRecords.map((record) => normalizePerformanceExerciseKey(record?.exercise || "")).filter(Boolean));
      const actualPatterns = new Set(
        actualRecords
          .map((record) => sanitizeText((record?.transferProfile || buildExerciseTransferProfile({ exerciseName: record?.exercise || "", note: record?.note || "" }))?.primaryPattern || "", 80).toLowerCase())
          .filter(Boolean)
      );

      plannedRows.forEach((row) => {
        const profile = buildExerciseTransferProfile({ exerciseName: row?.ex || "", note: row?.note || "" });
        const primaryPattern = sanitizeText(profile?.primaryPattern || "", 80).toLowerCase();
        if (!primaryPattern || !isAccessoryPattern(primaryPattern)) return;
        if ((profile?.directDriverIds || []).length > 0) return;
        const exactMatch = actualKeys.has(normalizePerformanceExerciseKey(row?.ex || ""));
        const samePatternLogged = actualPatterns.has(primaryPattern);
        if (!exactMatch && !samePatternLogged) incrementCounter(omittedByPattern, primaryPattern, 1);
      });
    });

  return Object.entries(omittedByPattern)
    .map(([pattern, omittedCount]) => ({
      pattern,
      omittedCount: Number(omittedCount || 0),
    }))
    .filter((entry) => entry.omittedCount >= 3 && !replacementPatterns.has(entry.pattern));
};

const buildExercisePreferenceMap = (exercisePreferences = []) => new Map(
  (Array.isArray(exercisePreferences) ? exercisePreferences : [])
    .filter((entry) => entry?.pattern && entry?.preferredExercise)
    .map((entry) => [sanitizeText(entry.pattern, 80).toLowerCase(), {
      ...entry,
      pattern: sanitizeText(entry.pattern, 80).toLowerCase(),
      preferredExercise: sanitizeText(entry.preferredExercise, 120),
    }])
);

export const applyExercisePreferenceRows = ({
  rows = [],
  exercisePreferences = [],
} = {}) => {
  const preferenceMap = buildExercisePreferenceMap(exercisePreferences);
  if (!preferenceMap.size) {
    return {
      rows: Array.isArray(rows) ? rows : [],
      changed: false,
      replacements: [],
    };
  }

  const replacements = [];
  const nextRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const exerciseName = sanitizeText(row?.ex || "", 120);
    if (!exerciseName) return row;
    const transferProfile = row?.transferProfile || buildExerciseTransferProfile({
      exerciseName,
      note: row?.note || "",
    });
    const primaryPattern = sanitizeText(transferProfile?.primaryPattern || "", 80).toLowerCase();
    if (!primaryPattern || !isAccessoryPattern(primaryPattern)) return row;
    if (Array.isArray(transferProfile?.directDriverIds) && transferProfile.directDriverIds.length > 0) return row;

    const preference = preferenceMap.get(primaryPattern);
    if (!preference?.preferredExercise) return row;

    const preferredExercise = sanitizeText(preference.preferredExercise, 120);
    const preferredKey = normalizePerformanceExerciseKey(preferredExercise);
    const currentKey = normalizePerformanceExerciseKey(exerciseName);
    const currentText = normalizePerformanceExerciseKey(exerciseName.replace(/\bor\b/g, " "));
    if (!preferredKey || currentKey === preferredKey || currentText.includes(preferredKey)) return row;

    replacements.push({
      pattern: primaryPattern,
      from: exerciseName,
      to: preferredExercise,
      evidenceCount: Number(preference?.evidenceCount || 0),
    });
    return {
      ...row,
      ex: preferredExercise,
      transferProfile: buildExerciseTransferProfile({
        exerciseName: preferredExercise,
        note: row?.note || "",
      }),
      habitPreferenceApplied: true,
    };
  });

  return {
    rows: nextRows,
    changed: replacements.length > 0,
    replacements,
  };
};

export const buildHabitAdaptationContext = ({
  logs = {},
  plannedDayRecords = {},
  todayKey = "",
} = {}) => {
  const weekdayStats = buildWeekdayStats({ logs, plannedDayRecords, todayKey });
  const chronicMissDayKey = resolveChronicMissDayKey(weekdayStats);
  const exercisePreferences = buildExercisePatternPreferences({ logs, plannedDayRecords, todayKey });
  const cardioPreferences = buildCardioModalityPreferences({ logs, plannedDayRecords, todayKey });
  const accessoryAddOnPreferences = buildAccessoryAddOnPreferences({ logs, plannedDayRecords, todayKey });
  const avoidAccessoryPatterns = buildAccessoryAvoidPatterns({
    logs,
    plannedDayRecords,
    todayKey,
    exercisePreferences,
  });
  return {
    version: HABIT_ADAPTATION_MODEL_VERSION,
    weekdayStats,
    chronicMissDayKey,
    preferredLongSessionDayKey: cardioPreferences?.preferredLongSessionDayKey ?? null,
    reliableDayOrder: DAY_ORDER
      .map((dayKey) => weekdayStats?.[dayKey] || createDayStats(dayKey))
      .sort((left, right) => (
        right.completionRate - left.completionRate
        || left.skipRate - right.skipRate
        || right.completedCount - left.completedCount
      ))
      .map((entry) => entry.dayKey),
    exercisePreferences,
    cardioPreferences,
    lowImpactBias: Boolean(cardioPreferences?.lowImpactBias),
    accessoryAddOnPreferences,
    avoidAccessoryPatterns,
    preferencePatterns: exercisePreferences.map((entry) => entry.pattern),
    summaryLines: dedupeStrings([
      chronicMissDayKey != null
        ? `Repeated misses cluster on day ${chronicMissDayKey}, so the planner can stop putting key work there by default.`
        : "",
      cardioPreferences?.preferredLongSessionDayKey != null
        ? `Long sessions most often land on ${resolveWeekdayLabel(cardioPreferences.preferredLongSessionDayKey)}.`
        : "",
      cardioPreferences?.easyAerobic?.label
        ? `Easy aerobic work keeps drifting toward ${cardioPreferences.easyAerobic.label}.`
        : "",
      cardioPreferences?.conditioning?.label
        ? `Conditioning work keeps drifting toward ${cardioPreferences.conditioning.label}.`
        : "",
      cardioPreferences?.lowImpactBias
        ? "Low-impact cardio keeps showing up in the logs, so support work can bias that way."
        : "",
      exercisePreferences.length
        ? `Logged accessory choices show consistent preferences in ${exercisePreferences.map((entry) => entry.pattern.replace(/_/g, " ")).join(", ")}.`
        : "",
      accessoryAddOnPreferences.length
        ? `You keep adding ${accessoryAddOnPreferences.map((entry) => entry.preferredExercise).slice(0, 2).join(" and ")} even when they were not prescribed.`
        : "",
      avoidAccessoryPatterns.length
        ? `Some accessory patterns keep getting skipped, so they can stop being treated as mandatory.`
        : "",
    ]),
  };
};
