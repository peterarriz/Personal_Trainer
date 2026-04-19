const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const HYBRID_ADAPTIVE_COHORTS = Object.freeze({
  beginner: "beginner_hybrid",
  fatLoss: "fat_loss_hybrid",
  performance: "performance_hybrid",
  travelHeavy: "travel_heavy_hybrid",
  inconsistentSchedule: "inconsistent_schedule_hybrid",
  general: "general_hybrid",
});

const STRENGTH_OR_PHYSIQUE_CATEGORIES = new Set(["strength", "body_comp", "fat_loss", "physique", "appearance"]);
const RUN_CATEGORIES = new Set(["running", "hybrid"]);
const BUSY_SCHEDULE_KEYS = new Set(["busy", "variable", "fragile", "chaotic", "travel_heavy"]);
const BEGINNER_LEVEL_KEYS = new Set(["beginner", "novice", "new"]);

const normalizeSessionType = (session = null) => String(session?.type || "").trim().toLowerCase();

const isRunSession = (session = null) => {
  const type = normalizeSessionType(session);
  return ["easy-run", "hard-run", "long-run", "run+strength"].includes(type);
};

const isMixedSession = (session = null) => normalizeSessionType(session) === "run+strength";

const isKeyRunSession = (session = null) => {
  const type = normalizeSessionType(session);
  return type === "hard-run" || type === "long-run";
};

const isHardSession = (session = null) => {
  const type = normalizeSessionType(session);
  const text = sanitizeText([
    session?.label || "",
    session?.fallback || "",
    session?.run?.t || "",
    session?.run?.d || "",
    session?.strengthDose || "",
  ].join(" "), 220).toLowerCase();
  return [
    "hard-run",
    "long-run",
    "run+strength",
  ].includes(type)
    || (/strength/.test(type) && /\bfocus|primary|heavy|full-body|bench|squat|deadlift|hypertrophy\b/.test(text));
};

const countDayTemplates = (dayTemplates = {}, predicate = () => false) => (
  Object.values(dayTemplates || {}).filter((session) => predicate(session)).length
);

const resolveBand = (count = 0, { lowMax = 1, moderateMax = 2 } = {}) => (
  count <= lowMax ? "low" : count <= moderateMax ? "moderate" : "high"
);

const resolveMixedSessionBand = (count = 0) => (
  count <= 0 ? "none" : count === 1 ? "single" : "stacked"
);

const resolveHybridFocusType = ({
  primaryGoalCategory = "",
  secondaryGoalCategories = [],
  experienceLevel = "",
} = {}) => {
  const primary = sanitizeSlug(primaryGoalCategory, 60);
  const secondary = toArray(secondaryGoalCategories).map((item) => sanitizeSlug(item, 60));
  const experience = sanitizeSlug(experienceLevel, 40);
  if (BEGINNER_LEVEL_KEYS.has(experience)) return "beginner";
  if (STRENGTH_OR_PHYSIQUE_CATEGORIES.has(primary) || secondary.some((item) => STRENGTH_OR_PHYSIQUE_CATEGORIES.has(item))) {
    if (["body_comp", "fat_loss", "physique", "appearance"].includes(primary) || secondary.some((item) => ["body_comp", "fat_loss", "physique", "appearance"].includes(item))) {
      return "fat_loss";
    }
  }
  return "performance";
};

const extractGoalCategories = ({ goals = [], goalStack = [] } = {}) => (
  [...toArray(goalStack), ...toArray(goals)]
    .map((goal) => sanitizeSlug(goal?.category || goal?.resolvedGoal?.planningCategory || goal?.resolvedGoal?.goalFamily || "", 60))
    .filter(Boolean)
);

export const isMeaningfulHybridAdaptiveUser = ({
  goals = [],
  goalStack = [],
  primaryGoalCategory = "",
  secondaryGoalCategories = [],
  architecture = "",
  planArchetypeId = "",
  runningGoalActive = false,
  strengthGoalActive = false,
  physiqueGoalActive = false,
  runCount = null,
  strengthCount = null,
} = {}) => {
  const primary = sanitizeSlug(primaryGoalCategory, 60);
  const secondary = toArray(secondaryGoalCategories).map((item) => sanitizeSlug(item, 60));
  const goalCategories = extractGoalCategories({ goals, goalStack });
  const hasRunLane = Boolean(
    runningGoalActive
      || RUN_CATEGORIES.has(primary)
      || secondary.some((item) => RUN_CATEGORIES.has(item))
      || goalCategories.some((item) => RUN_CATEGORIES.has(item))
      || Number(runCount || 0) > 0
  );
  const hasStrengthOrPhysiqueLane = Boolean(
    strengthGoalActive
      || physiqueGoalActive
      || STRENGTH_OR_PHYSIQUE_CATEGORIES.has(primary)
      || secondary.some((item) => STRENGTH_OR_PHYSIQUE_CATEGORIES.has(item))
      || goalCategories.some((item) => STRENGTH_OR_PHYSIQUE_CATEGORIES.has(item))
      || Number(strengthCount || 0) > 0
  );
  const hybridFamily = sanitizeSlug(architecture || planArchetypeId, 80);
  return hasRunLane && hasStrengthOrPhysiqueLane && (
    hybridFamily === "hybrid_performance"
      || hybridFamily.includes("hybrid")
      || ["race_prep_dominant", "strength_dominant", "body_comp_conditioning"].includes(hybridFamily)
      || primary === "hybrid"
      || secondary.includes("hybrid")
      || goalCategories.includes("hybrid")
      || hasRunLane && hasStrengthOrPhysiqueLane
  );
};

export const deriveHybridAdaptiveCohort = ({
  goals = [],
  goalStack = [],
  primaryGoalCategory = "",
  secondaryGoalCategories = [],
  architecture = "",
  planArchetypeId = "",
  experienceLevel = "",
  scheduleReliability = "",
  travelHeavy = false,
  runningGoalActive = false,
  strengthGoalActive = false,
  physiqueGoalActive = false,
  runCount = null,
  strengthCount = null,
} = {}) => {
  const meaningfulHybrid = isMeaningfulHybridAdaptiveUser({
    goals,
    goalStack,
    primaryGoalCategory,
    secondaryGoalCategories,
    architecture,
    planArchetypeId,
    experienceLevel,
    scheduleReliability,
    travelHeavy,
    runningGoalActive,
    strengthGoalActive,
    physiqueGoalActive,
    runCount,
    strengthCount,
  });
  if (!meaningfulHybrid) return "";
  const schedule = sanitizeSlug(scheduleReliability, 40);
  if (travelHeavy || schedule === "travel_heavy") return HYBRID_ADAPTIVE_COHORTS.travelHeavy;
  if (BUSY_SCHEDULE_KEYS.has(schedule)) return HYBRID_ADAPTIVE_COHORTS.inconsistentSchedule;
  if (resolveHybridFocusType({ primaryGoalCategory, secondaryGoalCategories, experienceLevel }) === "beginner") {
    return HYBRID_ADAPTIVE_COHORTS.beginner;
  }
  if (resolveHybridFocusType({ primaryGoalCategory, secondaryGoalCategories, experienceLevel }) === "fat_loss") {
    return HYBRID_ADAPTIVE_COHORTS.fatLoss;
  }
  return HYBRID_ADAPTIVE_COHORTS.performance;
};

export const buildHybridAdaptiveContext = ({
  goals = [],
  goalStack = [],
  primaryGoalCategory = "",
  secondaryGoalCategories = [],
  architecture = "",
  planArchetypeId = "",
  experienceLevel = "",
  scheduleReliability = "",
  runningGoalActive = false,
  strengthGoalActive = false,
  physiqueGoalActive = false,
  runCount = null,
  strengthCount = null,
  travelHeavy = false,
  timeCrunched = false,
  painSensitive = false,
  weeklyStressState = "",
  currentPhase = "",
  dayTemplates = {},
} = {}) => {
  const hybridMeaningful = isMeaningfulHybridAdaptiveUser({
    goals,
    goalStack,
    primaryGoalCategory,
    secondaryGoalCategories,
    architecture,
    planArchetypeId,
    runningGoalActive,
    strengthGoalActive,
    physiqueGoalActive,
    runCount,
    strengthCount,
  });
  const hybridCohort = deriveHybridAdaptiveCohort({
    goals,
    goalStack,
    primaryGoalCategory,
    secondaryGoalCategories,
    architecture,
    planArchetypeId,
    experienceLevel,
    scheduleReliability,
    travelHeavy,
    runningGoalActive,
    strengthGoalActive,
    physiqueGoalActive,
    runCount,
    strengthCount,
  });
  const computedRunCount = Number(runCount || countDayTemplates(dayTemplates, isRunSession) || 0);
  const computedStrengthCount = Number(strengthCount || countDayTemplates(dayTemplates, (session) => /strength/.test(sanitizeSlug(session?.type || "", 80))) || 0);
  const hardDayCount = countDayTemplates(dayTemplates, isHardSession);
  const mixedSessionCount = countDayTemplates(dayTemplates, isMixedSession);
  const keyRunCount = countDayTemplates(dayTemplates, isKeyRunSession);
  const hybridFocusType = resolveHybridFocusType({ primaryGoalCategory, secondaryGoalCategories, experienceLevel });
  const weeklyStress = sanitizeSlug(weeklyStressState, 40);
  const runBuildPhase = hybridMeaningful && ["build", "peak", "specificity"].includes(sanitizeSlug(currentPhase, 40)) && keyRunCount > 0;
  const hybridRecoveryRisk = painSensitive || ["strained", "protective", "reduced"].includes(weeklyStress)
    ? "high"
    : BUSY_SCHEDULE_KEYS.has(sanitizeSlug(scheduleReliability, 40)) && hardDayCount >= 3
    ? "moderate"
    : "low";

  return {
    hybridMeaningful,
    hybridCohort,
    hybridFocusType,
    hybridHardDayCount: hardDayCount,
    hybridHardDayBand: hybridMeaningful ? resolveBand(hardDayCount, { lowMax: 2, moderateMax: 3 }) : "",
    hybridMixedSessionCount: mixedSessionCount,
    hybridMixedSessionBand: hybridMeaningful ? resolveMixedSessionBand(mixedSessionCount) : "",
    hybridKeyRunCount: keyRunCount,
    hybridRunBuildPhase: runBuildPhase ? "build_phase" : "steady_phase",
    hybridRecoveryRisk,
    hybridLowerBodyGuardNeeded: hybridMeaningful && keyRunCount > 0 && (strengthGoalActive || physiqueGoalActive || computedStrengthCount > 0),
    hybridInconsistentSchedule: hybridCohort === HYBRID_ADAPTIVE_COHORTS.inconsistentSchedule,
    hybridTravelHeavy: hybridCohort === HYBRID_ADAPTIVE_COHORTS.travelHeavy,
    hybridTimeCrunched: hybridMeaningful && Boolean(timeCrunched),
    strengthOrPhysiqueGoalActive: Boolean(strengthGoalActive || physiqueGoalActive),
    physiqueGoalActive: Boolean(physiqueGoalActive),
    runCount: computedRunCount,
    strengthCount: computedStrengthCount,
  };
};

export const buildHybridAdaptiveOutcomeLabels = ({ row = {} } = {}) => {
  if (!row?.hybridMeaningful) {
    return {
      successLabel: "",
      failureLabel: "",
      summaryLabel: "",
    };
  }
  const successScore = Number(row?.compositeSuccessScore ?? NaN);
  const frustrationSignals = toArray(row?.immediateOutcome?.frustrationSignals).map((item) => sanitizeSlug(item, 60));
  const painRate = Number(row?.immediateOutcome?.painRate || 0);
  const hybridSessionFormatAction = sanitizeSlug(row?.hybridSessionFormatAction || "", 80);
  const hybridBalanceAction = sanitizeSlug(row?.hybridBalanceAction || "", 80);
  const hybridDeloadAction = sanitizeSlug(row?.hybridDeloadAction || "", 80);
  const hardDayBand = sanitizeSlug(row?.hybridHardDayBand || "", 40);
  const runBuildPhase = sanitizeSlug(row?.hybridRunBuildPhase || "", 40);
  const overloadPattern = sanitizeSlug(row?.hybridLoadCombo || "", 80) === "high_run__high_strength"
    || (sanitizeSlug(row?.weeklyRunRampBand || "", 40) === "high" && sanitizeSlug(row?.strengthIntensityBand || "", 40) === "high");

  let successLabel = "";
  let failureLabel = "";

  if (Number.isFinite(successScore) && successScore >= 0.72) {
    if (hybridDeloadAction === "pull_forward_hybrid_deload") successLabel = "hybrid_early_deload_success";
    else if (hybridSessionFormatAction === "favor_mixed_sessions") successLabel = "hybrid_mixed_session_success";
    else if (hybridSessionFormatAction === "favor_short_split_sessions") successLabel = "hybrid_split_session_success";
    else if (sanitizeSlug(row?.hybridCohort || "", 60) === HYBRID_ADAPTIVE_COHORTS.travelHeavy) successLabel = "hybrid_travel_preserved";
    else successLabel = "hybrid_consistency_preserved";
  } else if (Number.isFinite(successScore) && successScore <= 0.42) {
    if (painRate > 0 || (row?.hybridLowerBodyGuardNeeded && hardDayBand === "high" && hybridBalanceAction === "balanced_hybrid")) {
      failureLabel = "hybrid_lower_body_run_conflict";
    } else if (overloadPattern || (hardDayBand === "high" && runBuildPhase === "build_phase")) {
      failureLabel = "hybrid_overload_failure";
    } else if (frustrationSignals.includes("time") || sanitizeSlug(row?.hybridCohort || "", 60) === HYBRID_ADAPTIVE_COHORTS.inconsistentSchedule) {
      failureLabel = "hybrid_schedule_overflow_failure";
    } else {
      failureLabel = "hybrid_adherence_drop";
    }
  }

  return {
    successLabel,
    failureLabel,
    summaryLabel: failureLabel || successLabel || "hybrid_mixed_signal",
  };
};
