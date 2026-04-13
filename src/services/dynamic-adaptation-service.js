import { comparePlannedDayToActual } from "../modules-checkins.js";
import { dedupeStrings } from "../utils/collection-utils.js";
import { DOMAIN_ADAPTER_IDS } from "./goal-capability-resolution-service.js";
import { getPerformanceRecordsForLog } from "./performance-record-service.js";
import { resolveInputEffectHorizon } from "./planning-effect-matrix-service.js";
import { getCurrentPrescribedDayRecord } from "./prescribed-day-history-service.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const toDateKey = (value = new Date()) => {
  if (typeof value === "string" && value) return value;
  const next = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(next.getTime()) ? new Date().toISOString().split("T")[0] : next.toISOString().split("T")[0];
};

const getWeekDateKeys = (todayKey = "") => {
  const safeTodayKey = toDateKey(todayKey || new Date());
  const anchor = new Date(`${safeTodayKey}T12:00:00`);
  const todayDay = anchor.getDay();
  const mondayShift = todayDay === 0 ? -6 : 1 - todayDay;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayShift);
  return DAY_ORDER.map((dayKey, index) => {
    const nextDate = new Date(monday);
    nextDate.setDate(monday.getDate() + index);
    return {
      dayKey,
      dateKey: nextDate.toISOString().split("T")[0],
    };
  });
};

const getDaySequenceIndex = (dayKey) => {
  const idx = DAY_ORDER.indexOf(Number(dayKey));
  return idx >= 0 ? idx : 0;
};

const isCompletedStatus = (status = "") => ["completed_as_planned", "completed_modified", "partial_completed"].includes(String(status || "").trim().toLowerCase());
const isModifiedStatus = (status = "") => ["completed_modified", "partial_completed"].includes(String(status || "").trim().toLowerCase());

const isQualitySession = (session = null) => {
  const type = String(session?.type || "").toLowerCase();
  const label = String(session?.label || "").toLowerCase();
  return [
    "hard-run",
    "long-run",
    "swim-threshold",
    "swim-endurance",
    "power-skill",
    "reactive-plyo",
    "sprint-support",
  ].includes(type) || /quality|tempo|long|threshold|power|reactive|sprint/i.test(label);
};

const isSupportiveSession = (session = null) => {
  const type = String(session?.type || "").toLowerCase();
  return [
    "conditioning",
    "easy-run",
    "swim-technique",
    "swim-aerobic",
  ].includes(type);
};

const isKeySession = (session = null, adapterId = "") => {
  if (!session || typeof session !== "object") return false;
  if (session?.keySession) return true;
  if (isQualitySession(session)) return true;
  const type = String(session?.type || "").toLowerCase();
  if (adapterId === DOMAIN_ADAPTER_IDS.strength || adapterId === DOMAIN_ADAPTER_IDS.power) {
    return type === "strength+prehab";
  }
  if (adapterId === DOMAIN_ADAPTER_IDS.swimming) {
    return ["swim-threshold", "swim-endurance"].includes(type);
  }
  return false;
};

const buildRestReplacement = (label = "Recovery / mobility only") => ({
  type: "rest",
  label,
  nutri: "rest",
  isRecoverySlot: true,
  adaptationTag: "adaptive_recovery",
});

const findFutureSlot = ({ dayTemplates = {}, currentDayOfWeek = 0, predicate = () => false } = {}) => {
  const currentSequenceIndex = getDaySequenceIndex(currentDayOfWeek);
  return DAY_ORDER
    .slice(currentSequenceIndex + 1)
    .find((dayKey) => predicate(dayTemplates?.[dayKey] || null, dayKey));
};

const normalizeSessionFeel = (logEntry = {}) => String(
  logEntry?.actualSession?.sessionFeel
  || logEntry?.checkin?.sessionFeel
  || logEntry?.sessionFeel
  || ""
).trim().toLowerCase();

const buildRecentLogSignals = ({ logs = {} } = {}) => {
  const recentEntries = Object.entries(logs || {})
    .sort((a, b) => String(a?.[0] || "").localeCompare(String(b?.[0] || "")))
    .slice(-10);
  let completedCount = 0;
  let skippedCount = 0;
  let modifiedCount = 0;
  let harderCount = 0;
  let easierCount = 0;
  let performanceShortfallCount = 0;

  recentEntries.forEach(([dateKey, entry]) => {
    const status = String(entry?.actualSession?.status || entry?.checkin?.status || "").trim().toLowerCase();
    const feel = normalizeSessionFeel(entry);
    if (isCompletedStatus(status)) completedCount += 1;
    if (status === "skipped") skippedCount += 1;
    if (isModifiedStatus(status)) modifiedCount += 1;
    if (feel === "harder_than_expected") harderCount += 1;
    if (feel === "easier_than_expected") easierCount += 1;
    const performanceRecords = getPerformanceRecordsForLog(entry || {}, { dateKey });
    const lowCompletionSet = performanceRecords.some((record) => Number(record?.metrics?.completionRatio || 1) < 0.85);
    if (lowCompletionSet) performanceShortfallCount += 1;
  });

  return {
    completedCount,
    skippedCount,
    modifiedCount,
    harderCount,
    easierCount,
    performanceShortfallCount,
  };
};

const buildCurrentWeekOutcomeSignals = ({
  todayKey = "",
  logs = {},
  plannedDayRecords = {},
  dailyCheckins = {},
  adapterId = "",
} = {}) => {
  const weekDateKeys = getWeekDateKeys(todayKey);
  const safeTodayKey = toDateKey(todayKey || new Date());
  const comparisons = weekDateKeys
    .filter((row) => row.dateKey < safeTodayKey)
    .map(({ dayKey, dateKey }) => {
      const plannedHistory = plannedDayRecords?.[dateKey] || null;
      const plannedDayRecord = getCurrentPrescribedDayRecord(plannedHistory) || plannedHistory || null;
      const comparison = comparePlannedDayToActual({
        plannedDayRecord,
        actualLog: logs?.[dateKey] || {},
        dailyCheckin: dailyCheckins?.[dateKey] || {},
        dateKey,
      });
      const plannedTraining = plannedDayRecord?.resolved?.training || plannedDayRecord?.base?.training || plannedDayRecord?.training || null;
      return {
        dayKey,
        dateKey,
        plannedDayRecord,
        plannedTraining,
        comparison,
        keySession: isKeySession(plannedTraining, adapterId),
      };
    });

  const skippedKeySession = [...comparisons]
    .reverse()
    .find((row) => row.keySession && ["skipped", "not_logged_over_48h"].includes(String(row?.comparison?.differenceKind || "")));

  return {
    comparisons,
    skippedKeySession: skippedKeySession || null,
    skippedCount: comparisons.filter((row) => row?.comparison?.completionKind === "skipped").length,
    modifiedCount: comparisons.filter((row) => row?.comparison?.completionKind === "modified").length,
  };
};

const softenFutureSession = (session = null, reasonTag = "") => {
  if (!session || typeof session !== "object") return session;
  const type = String(session?.type || "").toLowerCase();
  const nextSession = clonePlainValue(session);
  if (type === "hard-run") {
    nextSession.type = "easy-run";
    nextSession.label = "Steady Run (capped)";
    nextSession.run = {
      ...(nextSession.run || {}),
      t: "Steady",
    };
    nextSession.intensityGuidance = "Hold intensity below threshold until recovery stabilizes.";
  } else if (type === "swim-threshold") {
    nextSession.type = "swim-aerobic";
    nextSession.label = "Steady Swim (capped)";
    nextSession.swim = {
      ...(nextSession.swim || {}),
      focus: "Aerobic technique",
      setLine: "Steady aerobic repeats with clean technique only.",
    };
    nextSession.intensityGuidance = "Stay below threshold until fueling and recovery stabilize.";
  } else if (type === "conditioning") {
    nextSession.label = "Conditioning (controlled)";
    nextSession.intensityGuidance = "Stay in a controlled aerobic range.";
  } else if (type === "strength+prehab") {
    nextSession.label = sanitizeText(`${nextSession.label || "Strength"} (controlled)`, 120);
    nextSession.strengthDose = "20-30 min maintenance strength";
    nextSession.strengthDuration = "20-30 min";
    nextSession.intensityGuidance = "Hold loading submaximal and leave a rep or two in reserve.";
  } else if (["power-skill", "reactive-plyo", "sprint-support"].includes(type)) {
    nextSession.label = sanitizeText(`${nextSession.label || "Power"} (controlled)`, 120);
    nextSession.power = {
      ...(nextSession.power || {}),
      dose: "15-20 min",
      support: "Low-dose contacts only. Stop before jump quality slips.",
    };
    nextSession.intensityGuidance = "Keep power intent high while sharply capping fatigue.";
  }
  nextSession.adaptationTag = reasonTag || "adaptive_cap";
  return nextSession;
};

const extendFutureStrengthSession = (session = null) => {
  if (!session || typeof session !== "object") return session;
  const type = String(session?.type || "").toLowerCase();
  if (type !== "strength+prehab") return session;
  const nextSession = clonePlainValue(session);
  nextSession.strengthDose = nextSession.strengthDose === "20-35 min maintenance strength"
    ? "30-45 min progression strength"
    : nextSession.strengthDose || "30-45 min progression strength";
  nextSession.strengthDuration = nextSession.strengthDuration || "30-45 min";
  nextSession.optionalSecondary = sanitizeText(nextSession.optionalSecondary || "Optional: add one progression finisher while recovery is still good.", 140);
  nextSession.adaptationTag = "progression_unlocked";
  return nextSession;
};

const applySkippedKeyCarryForward = ({
  dayTemplates = {},
  currentDayOfWeek = 0,
  adapterId = "",
  skippedKeySession = null,
} = {}) => {
  if (!skippedKeySession?.plannedTraining) return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
  const targetDay = findFutureSlot({
    dayTemplates,
    currentDayOfWeek,
    predicate: (session) => isSupportiveSession(session) || String(session?.type || "").toLowerCase() === "rest",
  });
  if (targetDay == null) {
    return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
  }
  const nextTemplates = clonePlainValue(dayTemplates || {});
  const originalSkippedDay = skippedKeySession.dayKey;
  const targetSession = nextTemplates?.[targetDay] || null;
  nextTemplates[targetDay] = {
    ...clonePlainValue(skippedKeySession.plannedTraining),
    adaptationTag: "carry_forward",
    label: sanitizeText(skippedKeySession.plannedTraining?.label || "Carry-forward key session", 120),
  };
  if (nextTemplates?.[originalSkippedDay]) {
    nextTemplates[originalSkippedDay] = buildRestReplacement("Recovery after missed key session");
  }
  const sourceLabel = sanitizeText(skippedKeySession.plannedTraining?.label || "key session", 80);
  return {
    changed: true,
    dayTemplates: nextTemplates,
    summary: {
      inputType: "workout_log",
      headline: `${sourceLabel} was carried forward after the earlier skip.`,
      detail: `The next lower-priority slot was replaced so the week's backbone stays intact.`,
      preserved: adapterId === DOMAIN_ADAPTER_IDS.running || adapterId === DOMAIN_ADAPTER_IDS.swimming
        ? "The longer endurance backbone stays preserved."
        : "The main weekly backbone stays preserved.",
    },
    sessionChanges: [
      {
        kind: "carry_forward",
        fromDay: originalSkippedDay,
        toDay: targetDay,
        before: targetSession?.label || "",
        after: sourceLabel,
      },
    ],
  };
};

const applyStrainProtection = ({
  dayTemplates = {},
  currentDayOfWeek = 0,
} = {}) => {
  const targetDay = findFutureSlot({
    dayTemplates,
    currentDayOfWeek,
    predicate: (session) => isSupportiveSession(session) || isQualitySession(session),
  });
  if (targetDay == null) {
    return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
  }
  const nextTemplates = clonePlainValue(dayTemplates || {});
  const before = nextTemplates?.[targetDay] || null;
  nextTemplates[targetDay] = isSupportiveSession(before)
    ? buildRestReplacement("Recovery / reduced load")
    : softenFutureSession(before, "strain_cap");
  return {
    changed: true,
    dayTemplates: nextTemplates,
    summary: {
      inputType: "workout_log",
      headline: "Volume was capped after recent harder-than-expected training.",
      detail: "The next lower-value exposure was reduced so recovery can catch back up before progression resumes.",
      preserved: "The main goal lane stays intact.",
    },
    sessionChanges: [
      {
        kind: "strain_protection",
        day: targetDay,
        before: before?.label || "",
        after: nextTemplates?.[targetDay]?.label || "",
      },
    ],
  };
};

const applyNutritionProtection = ({
  dayTemplates = {},
  currentDayOfWeek = 0,
  weeklyNutritionReview = null,
} = {}) => {
  const mode = String(weeklyNutritionReview?.adaptation?.mode || "").toLowerCase();
  if (mode !== "protect_key_session_fueling") {
    return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
  }
  const targetDay = findFutureSlot({
    dayTemplates,
    currentDayOfWeek,
    predicate: (session) => isQualitySession(session),
  });
  if (targetDay == null) {
    return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
  }
  const nextTemplates = clonePlainValue(dayTemplates || {});
  const before = nextTemplates?.[targetDay] || null;
  nextTemplates[targetDay] = softenFutureSession(before, "fuel_protection");
  return {
    changed: true,
    dayTemplates: nextTemplates,
    summary: {
      inputType: "nutrition_log",
      headline: "Intensity was capped until fueling stabilizes.",
      detail: weeklyNutritionReview?.adaptation?.support || "Recent under-fueling hit performance-relevant days, so intensity was reduced instead of pretending recovery is normal.",
      preserved: "The weekly structure stays intact while the quality dose is controlled.",
    },
    sessionChanges: [
      {
        kind: "fuel_protection",
        day: targetDay,
        before: before?.label || "",
        after: nextTemplates?.[targetDay]?.label || "",
      },
    ],
  };
};

const applyCoachActionInfluence = ({
  dayTemplates = {},
  currentDayOfWeek = 0,
  coachActions = [],
  adapterId = "",
} = {}) => {
  const recentAction = [...(Array.isArray(coachActions) ? coachActions : [])]
    .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))
    .find((action) => ["REDUCE_WEEKLY_VOLUME", "PROGRESS_STRENGTH_EMPHASIS"].includes(String(action?.type || "")));
  if (!recentAction) {
    return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
  }

  if (recentAction.type === "REDUCE_WEEKLY_VOLUME") {
    return applyStrainProtection({ dayTemplates, currentDayOfWeek });
  }

  if (recentAction.type === "PROGRESS_STRENGTH_EMPHASIS") {
    const targetDay = findFutureSlot({
      dayTemplates,
      currentDayOfWeek,
      predicate: (session) => String(session?.type || "").toLowerCase() === "strength+prehab",
    });
    if (targetDay == null) {
      return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
    }
    const nextTemplates = clonePlainValue(dayTemplates || {});
    const before = nextTemplates?.[targetDay] || null;
    nextTemplates[targetDay] = extendFutureStrengthSession(before);
    return {
      changed: true,
      dayTemplates: nextTemplates,
      summary: {
        inputType: "coach_action",
        headline: "Strength emphasis was nudged up for the next exposure.",
        detail: adapterId === DOMAIN_ADAPTER_IDS.power
          ? "The next strength touchpoint keeps force production visible without replacing the power backbone."
          : "The next strength touchpoint got a small progression bump without rewriting the whole week.",
        preserved: "The main weekly backbone stays intact.",
      },
      sessionChanges: [
        {
          kind: "coach_progression",
          day: targetDay,
          before: before?.label || "",
          after: nextTemplates?.[targetDay]?.label || "",
        },
      ],
    };
  }

  return { changed: false, dayTemplates, summary: null, sessionChanges: [] };
};

const buildSummaryPayload = ({
  summary = null,
  fallbackHeadline = "Today stays as planned.",
  fallbackDetail = "Recent logs do not justify a structural change right now.",
  defaultInputType = "workout_log",
} = {}) => {
  const inputType = summary?.inputType || defaultInputType;
  return {
    didChange: Boolean(summary?.headline),
    inputType,
    horizon: resolveInputEffectHorizon({ inputType }),
    headline: sanitizeText(summary?.headline || fallbackHeadline, 180),
    detail: sanitizeText(summary?.detail || fallbackDetail, 220),
    preserved: sanitizeText(summary?.preserved || "", 180),
    surfaceLine: sanitizeText([
      summary?.headline || fallbackHeadline,
      summary?.preserved || "",
    ].filter(Boolean).join(" "), 220),
  };
};

export const buildDynamicAdaptationState = ({
  dayTemplates = {},
  todayKey = "",
  currentDayOfWeek = 0,
  logs = {},
  plannedDayRecords = {},
  dailyCheckins = {},
  weeklyNutritionReview = null,
  preferencePolicy = null,
  preferenceEffects = [],
  preferenceChanged = false,
  adapter = null,
  coachActions = [],
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || new Date());
  const adapterId = String(adapter?.id || "");
  let adaptedTemplates = clonePlainValue(dayTemplates || {});
  const recentSignals = buildRecentLogSignals({ logs });
  const currentWeekSignals = buildCurrentWeekOutcomeSignals({
    todayKey: safeTodayKey,
    logs,
    plannedDayRecords,
    dailyCheckins,
    adapterId,
  });
  const sessionChanges = [];
  const weeklyConstraints = [];
  let primarySummary = null;

  const skipCarryForward = applySkippedKeyCarryForward({
    dayTemplates: adaptedTemplates,
    currentDayOfWeek,
    adapterId,
    skippedKeySession: currentWeekSignals.skippedKeySession,
  });
  if (skipCarryForward.changed) {
    adaptedTemplates = skipCarryForward.dayTemplates;
    sessionChanges.push(...skipCarryForward.sessionChanges);
    weeklyConstraints.push("A missed key session was carried forward instead of being ignored.");
    primarySummary = skipCarryForward.summary;
  }

  const nutritionProtection = applyNutritionProtection({
    dayTemplates: adaptedTemplates,
    currentDayOfWeek,
    weeklyNutritionReview,
  });
  if (nutritionProtection.changed) {
    adaptedTemplates = nutritionProtection.dayTemplates;
    sessionChanges.push(...nutritionProtection.sessionChanges);
    weeklyConstraints.push("Training intensity is capped until fueling stabilizes.");
    if (!primarySummary) primarySummary = nutritionProtection.summary;
  } else if (weeklyNutritionReview?.adaptation?.mode === "reinforce_hydration") {
    weeklyConstraints.push("Hydration consistency is being reinforced before any bigger nutrition rewrite.");
  } else if (weeklyNutritionReview?.adaptation?.mode === "simplify_defaults") {
    weeklyConstraints.push("Nutrition defaults are simplified this week so execution is easier to repeat.");
  }

  const strainDetected = recentSignals.performanceShortfallCount >= 2
    || recentSignals.harderCount >= 2
    || recentSignals.modifiedCount >= 2
    || currentWeekSignals.modifiedCount >= 2;
  if (!skipCarryForward.changed && strainDetected) {
    const strainProtection = applyStrainProtection({
      dayTemplates: adaptedTemplates,
      currentDayOfWeek,
    });
    if (strainProtection.changed) {
      adaptedTemplates = strainProtection.dayTemplates;
      sessionChanges.push(...strainProtection.sessionChanges);
      weeklyConstraints.push("Recent strain pulled the next exposure back to a more repeatable dose.");
      if (!primarySummary) primarySummary = strainProtection.summary;
    }
  }

  const coachInfluence = applyCoachActionInfluence({
    dayTemplates: adaptedTemplates,
    currentDayOfWeek,
    coachActions,
    adapterId,
  });
  if (coachInfluence.changed) {
    adaptedTemplates = coachInfluence.dayTemplates;
    sessionChanges.push(...coachInfluence.sessionChanges);
    weeklyConstraints.push("A recent accepted coach action is shaping the next exposure.");
    if (!primarySummary) primarySummary = coachInfluence.summary;
  }

  const positiveTrend = recentSignals.completedCount >= 2
    && recentSignals.skippedCount === 0
    && recentSignals.modifiedCount === 0
    && recentSignals.harderCount === 0
    && recentSignals.easierCount >= 1;
  const preferenceSummary = !primarySummary && preferenceChanged
    ? {
      inputType: "training_preference",
      headline: `${sanitizeText(preferencePolicy?.label || "Preference", 40)} preference changed the week shape.`,
      detail: dedupeStrings(preferenceEffects).join(" ") || "The selected preference changes progression tolerance and weekly density.",
      preserved: "The main weekly backbone stays intact.",
    }
    : null;
  const nutritionOnlyAdjustment = !primarySummary && weeklyNutritionReview?.adaptation?.shouldAdapt;
  const noChangeSummary = nutritionOnlyAdjustment
    ? buildSummaryPayload({
      summary: {
        inputType: "nutrition_log",
        headline: weeklyNutritionReview?.adaptation?.mode === "reinforce_hydration"
          ? "Training stays as planned while hydration gets reinforced."
          : "Training stays as planned while nutrition defaults get simpler.",
        detail: weeklyNutritionReview?.adaptation?.summary || "The weekly nutrition signal changed, but it does not justify a structural training rewrite yet.",
        preserved: "The current training backbone stays intact.",
      },
      defaultInputType: "nutrition_log",
    })
    : buildSummaryPayload({
      summary: preferenceSummary,
      fallbackHeadline: positiveTrend
        ? "Today stays as planned. Recent logs support progression."
        : "Today stays as planned.",
      fallbackDetail: preferenceChanged
        ? dedupeStrings(preferenceEffects).join(" ") || "The selected preference changes progression tolerance and weekly density."
        : positiveTrend
        ? "Recent execution supports holding the current progression path instead of forcing a rewrite."
        : "Recent logs do not justify a structural change right now.",
      defaultInputType: preferenceChanged ? "training_preference" : "workout_log",
    });

  const changeSummary = primarySummary
    ? buildSummaryPayload({ summary: primarySummary, defaultInputType: primarySummary?.inputType || "workout_log" })
    : noChangeSummary;

  const volumeBiasHint = dedupeStrings([
    ...weeklyConstraints,
    ...(preferenceChanged ? preferenceEffects : []),
  ]);
  const recoveryHint = primarySummary?.inputType === "nutrition_log" || strainDetected ? "high" : "";
  const aggressionHint = primarySummary?.inputType === "workout_log" || primarySummary?.inputType === "nutrition_log"
    ? "controlled"
    : "";

  return {
    adaptedDayTemplates: adaptedTemplates,
    sessionChanges,
    recentSignals,
    currentWeekSignals,
    weeklyIntentHints: {
      adjusted: Boolean(primarySummary || preferenceChanged || weeklyNutritionReview?.adaptation?.shouldAdapt),
      recoveryHint,
      aggressionHint,
      volumeBiasHint: primarySummary || preferenceChanged ? (preferencePolicy?.id === "aggressive" && !strainDetected ? "expanded" : "reduced") : "",
      weeklyConstraints: volumeBiasHint,
      nutritionEmphasis: weeklyNutritionReview?.adaptation?.shouldAdapt
        ? sanitizeText(weeklyNutritionReview?.adaptation?.summary || "", 180)
        : "",
    },
    changeSummary,
  };
};
