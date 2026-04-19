export const ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION = "2026-04-v1";

export const ADAPTIVE_LEARNING_EVENT_NAMES = Object.freeze({
  recommendationGenerated: "adaptive_learning.recommendation_generated",
  recommendationOutcomeRecorded: "adaptive_learning.recommendation_outcome_recorded",
  cohortSnapshotCaptured: "adaptive_learning.cohort_snapshot_captured",
  userStateSnapshotCaptured: "adaptive_learning.user_state_snapshot_captured",
  goalChanged: "adaptive_learning.goal_changed",
  weeklyEvaluationCompleted: "adaptive_learning.weekly_evaluation_completed",
  authLifecycleChanged: "adaptive_learning.auth_lifecycle_changed",
  syncLifecycleChanged: "adaptive_learning.sync_lifecycle_changed",
});

export const ADAPTIVE_LEARNING_EVENT_VERSIONS = Object.freeze({
  [ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.cohortSnapshotCaptured]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.userStateSnapshotCaptured]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.goalChanged]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.weeklyEvaluationCompleted]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.authLifecycleChanged]: 1,
  [ADAPTIVE_LEARNING_EVENT_NAMES.syncLifecycleChanged]: 1,
});

export const ADAPTIVE_RECOMMENDATION_KINDS = Object.freeze({
  intakeCompletion: "intake_completion",
  planGeneration: "plan_generation",
  weeklyPlanRefresh: "weekly_plan_refresh",
  dayPrescription: "day_prescription",
  workoutAdjustment: "workout_adjustment",
  nutritionRecommendation: "nutrition_recommendation",
  coachSuggestion: "coach_suggestion",
});

export const ADAPTIVE_OUTCOME_KINDS = Object.freeze({
  workoutLog: "workout_log",
  missedWorkout: "missed_workout",
  nutritionLog: "nutrition_log",
  coachAccepted: "coach_accepted",
  coachIgnored: "coach_ignored",
  weeklyEvaluation: "weekly_evaluation",
});

export const ADAPTIVE_ADHERENCE_OUTCOMES = Object.freeze({
  asPrescribed: "as_prescribed",
  modified: "modified",
  skipped: "skipped",
  customSession: "custom_session",
  recoveryDay: "recovery_day",
  pending: "pending",
  unknown: "unknown",
});

const ALLOWED_EVENT_NAMES = new Set(Object.values(ADAPTIVE_LEARNING_EVENT_NAMES));
const ALLOWED_RECOMMENDATION_KINDS = new Set(Object.values(ADAPTIVE_RECOMMENDATION_KINDS));
const ALLOWED_OUTCOME_KINDS = new Set(Object.values(ADAPTIVE_OUTCOME_KINDS));
const ALLOWED_ADHERENCE_OUTCOMES = new Set(Object.values(ADAPTIVE_ADHERENCE_OUTCOMES));

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toFiniteInteger = (value, fallback = null) => {
  const parsed = toFiniteNumber(value, fallback);
  return parsed === null ? fallback : Math.round(parsed);
};
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const clone = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const hashString = (value = "") => {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const stableSort = (value) => {
  if (Array.isArray(value)) return value.map((item) => stableSort(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableSort(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const stableFingerprint = (value = null) => {
  try {
    return hashString(JSON.stringify(stableSort(value)));
  } catch {
    return hashString(String(value ?? ""));
  }
};

const sanitizeStringArray = (items = [], maxItems = 12, maxLength = 180) => (
  toArray(items)
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
);

const sanitizePlainObject = (value = null, maxEntries = 24) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value)
    .slice(0, maxEntries)
    .reduce((acc, [key, entryValue]) => {
      const safeKey = sanitizeSlug(key, 60);
      if (!safeKey) return acc;
      if (entryValue == null) return acc;
      if (typeof entryValue === "string") {
        acc[safeKey] = sanitizeText(entryValue, 220);
        return acc;
      }
      if (typeof entryValue === "number" || typeof entryValue === "boolean") {
        acc[safeKey] = entryValue;
        return acc;
      }
      if (Array.isArray(entryValue)) {
        acc[safeKey] = sanitizeStringArray(entryValue, 8, 120);
        return acc;
      }
      if (typeof entryValue === "object") {
        acc[safeKey] = sanitizePlainObject(entryValue, 12);
      }
      return acc;
    }, {});
};

const sanitizeGoalStackEntry = (goal = {}, index = 0) => {
  const goalId = sanitizeText(
    goal?.id
    || goal?.resolvedGoal?.id
    || `goal_${index + 1}`,
    120
  );
  const summary = sanitizeText(
    goal?.resolvedGoal?.summary
    || goal?.summary
    || goal?.name
    || goal?.title
    || goalId,
    180
  );
  if (!goalId || !summary) return null;
  return {
    id: goalId,
    summary,
    category: sanitizeSlug(goal?.category || goal?.resolvedGoal?.planningCategory || goal?.resolvedGoal?.goalFamily || "general", 60) || "general",
    priority: Math.max(1, toFiniteInteger(goal?.priority ?? goal?.resolvedGoal?.planningPriority, index + 1) || (index + 1)),
    active: goal?.active !== false,
  };
};

const sanitizeGoalStack = (goals = []) => (
  toArray(goals)
    .map((goal, index) => sanitizeGoalStackEntry(goal, index))
    .filter(Boolean)
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
    .slice(0, 8)
);

const sanitizeCandidateOption = (option = {}, index = 0) => {
  const optionKey = sanitizeSlug(option?.optionKey || option?.key || option?.id || `option_${index + 1}`, 120);
  const label = sanitizeText(option?.label || option?.summary || option?.name || optionKey, 160);
  if (!optionKey || !label) return null;
  return {
    optionKey,
    label,
    source: sanitizeSlug(option?.source || option?.kind || "deterministic_engine", 80) || "deterministic_engine",
    accepted: Boolean(option?.accepted),
    details: sanitizePlainObject(option?.details || {}, 12),
  };
};

const sanitizeCandidateOptions = (items = []) => (
  toArray(items)
    .map((item, index) => sanitizeCandidateOption(item, index))
    .filter(Boolean)
    .slice(0, 12)
);

const sanitizeChosenOption = (option = {}) => {
  const normalized = sanitizeCandidateOption(option, 0);
  if (!normalized) return null;
  return {
    ...normalized,
    details: sanitizePlainObject({
      ...(normalized?.details || {}),
      ...(option?.details || {}),
    }, 16),
  };
};

const sanitizeAdaptivePolicyShadowCandidate = (candidate = {}, index = 0) => {
  const actionId = sanitizeSlug(candidate?.actionId || candidate?.optionKey || `action_${index + 1}`, 120);
  const label = sanitizeText(candidate?.label || actionId, 160);
  if (!actionId || !label) return null;
  return {
    actionId,
    label,
    excluded: Boolean(candidate?.excluded),
    exclusionReason: sanitizeText(candidate?.exclusionReason || "", 160),
    score: toFiniteNumber(candidate?.score, null),
    confidenceScore: Math.max(0, Math.min(100, toFiniteInteger(candidate?.confidenceScore, 0) || 0)),
    sampleSize: Math.max(0, toFiniteInteger(candidate?.sampleSize, 0) || 0),
    evidenceEffectSize: toFiniteNumber(candidate?.evidenceEffectSize, null),
    matchedRuleIds: sanitizeStringArray(candidate?.matchedRuleIds || [], 12, 120),
    matchedEvidenceSummaries: sanitizeStringArray(candidate?.matchedEvidenceSummaries || [], 6, 180),
  };
};

const ADAPTIVE_POLICY_SHADOW_CONTEXT_KEYS = Object.freeze([
  "primaryGoalCategory",
  "architecture",
  "planArchetypeId",
  "experienceLevel",
  "scheduleReliability",
  "environmentMode",
  "equipmentAccess",
  "sessionDuration",
  "trainingDaysPerWeek",
  "hybridAthlete",
  "hybridMeaningful",
  "hybridCohort",
  "hybridHardDayBand",
  "hybridMixedSessionBand",
  "hybridRunBuildPhase",
  "hybridRecoveryRisk",
  "hybridLowerBodyGuardNeeded",
  "travelHeavy",
  "timeCrunched",
  "painSensitive",
  "runningGoalActive",
  "strengthGoalActive",
  "physiqueGoalActive",
  "strengthOrPhysiqueGoalActive",
  "strengthPriority",
  "outdoorPreferred",
  "weeklyStressState",
  "reEntry",
  "cutbackWeek",
]);

const sanitizeAdaptivePolicyShadowContextSnapshot = (value = {}) => ADAPTIVE_POLICY_SHADOW_CONTEXT_KEYS.reduce((acc, key) => {
  const entryValue = value?.[key];
  if (entryValue == null || entryValue === "") return acc;
  if (typeof entryValue === "string") {
    acc[key] = sanitizeText(entryValue, 120);
    return acc;
  }
  if (typeof entryValue === "number") {
    acc[key] = toFiniteNumber(entryValue, null);
    return acc;
  }
  if (typeof entryValue === "boolean") {
    acc[key] = entryValue;
    return acc;
  }
  return acc;
}, {});

const sanitizeAdaptivePolicyShadowDecision = (decision = {}, index = 0) => {
  const decisionPointId = sanitizeSlug(decision?.decisionPointId || `decision_point_${index + 1}`, 80);
  if (!decisionPointId) return null;
  return {
    decisionPointId,
    mode: sanitizeSlug(decision?.mode || "", 40),
    decisionMode: sanitizeSlug(decision?.decisionMode || "", 40),
    defaultActionId: sanitizeSlug(decision?.defaultActionId || "", 120),
    chosenActionId: sanitizeSlug(decision?.chosenActionId || "", 120),
    shadowTopActionId: sanitizeSlug(decision?.shadowTopActionId || "", 120),
    usedAdaptiveChoice: Boolean(decision?.usedAdaptiveChoice),
    fallbackReason: sanitizeSlug(decision?.fallbackReason || "", 80),
    contextSnapshot: sanitizeAdaptivePolicyShadowContextSnapshot(decision?.contextSnapshot || {}),
    candidateScores: toArray(decision?.candidateScores).map((candidate, candidateIndex) => sanitizeAdaptivePolicyShadowCandidate(candidate, candidateIndex)).filter(Boolean).slice(0, 12),
    explanation: sanitizeText(decision?.explanation || "", 240),
  };
};

const sanitizeAdaptivePolicyShadow = (value = {}) => {
  const decisions = toArray(value?.decisions).map((decision, index) => sanitizeAdaptivePolicyShadowDecision(decision, index)).filter(Boolean).slice(0, 8);
  if (!decisions.length) return null;
  return {
    runtimeMode: sanitizeSlug(value?.runtimeMode || value?.mode || "", 40),
    decisionCount: decisions.length,
    decisions,
  };
};

const sanitizePlanStage = (planStage = {}) => {
  const currentPhase = sanitizeSlug(planStage?.currentPhase || planStage?.phase || "", 40);
  const currentWeek = Math.max(1, toFiniteInteger(planStage?.currentWeek ?? planStage?.week, 1) || 1);
  const currentDay = Math.max(0, Math.min(6, toFiniteInteger(planStage?.currentDay ?? planStage?.day, 0) || 0));
  return {
    currentPhase,
    currentWeek,
    currentDay,
    dateKey: sanitizeText(planStage?.dateKey || "", 24),
    planWeekId: sanitizeText(planStage?.planWeekId || "", 120),
    planDayId: sanitizeText(planStage?.planDayId || "", 120),
  };
};

const sanitizeProvenance = (provenance = {}) => ({
  source: sanitizeSlug(provenance?.source || provenance?.actor || provenance?.summary || "deterministic_engine", 80) || "deterministic_engine",
  actor: sanitizeSlug(provenance?.actor || "", 80),
  summary: sanitizeText(provenance?.summary || provenance?.reason || "", 220),
  keyDrivers: sanitizeStringArray(provenance?.keyDrivers || provenance?.drivers || [], 8, 120),
});

const sanitizeShortHorizonWindow = (window = {}) => {
  const windowDays = Math.max(0, Math.min(30, toFiniteInteger(window?.windowDays, 0) || 0));
  return {
    windowDays,
    reviewDateKey: sanitizeText(window?.reviewDateKey || "", 24),
    observedSignals: sanitizeStringArray(window?.observedSignals || [], 8, 120),
    summary: sanitizeText(window?.summary || "", 220),
  };
};

export const sanitizeAdaptiveLearningIdentity = ({
  actorId = "",
  userId = "",
  localActorId = "",
} = {}) => {
  const safeUserId = sanitizeText(userId || "", 120);
  const safeLocalActorId = sanitizeText(localActorId || "", 120);
  const safeActorId = sanitizeText(actorId || safeUserId || safeLocalActorId, 120);
  if (!safeActorId) {
    throw new Error("Adaptive learning events require a stable actor id.");
  }
  return {
    actorId: safeActorId,
    userId: safeUserId,
    localActorId: safeLocalActorId || safeActorId,
  };
};

export const buildAdaptiveDecisionId = ({
  recommendationKind = "",
  recommendationJoinKey = "",
  actorId = "",
  occurredAt = Date.now(),
  fallbackSeed = "",
} = {}) => {
  const seed = [
    sanitizeSlug(recommendationKind, 80),
    sanitizeText(recommendationJoinKey, 160),
    sanitizeText(actorId, 120),
    sanitizeText(fallbackSeed, 220),
    toFiniteInteger(occurredAt, Date.now()),
  ].join("|");
  return `decision_${hashString(seed)}`;
};

export const buildRecommendationJoinKey = ({
  recommendationKind = "",
  planWeekId = "",
  planDayId = "",
  dateKey = "",
  weekNumber = "",
  chosenOption = null,
  fallbackSeed = "",
} = {}) => {
  const normalizedKind = sanitizeSlug(recommendationKind, 80);
  const optionKey = sanitizeSlug(chosenOption?.optionKey || chosenOption?.label || "", 120);
  const seed = [
    normalizedKind,
    sanitizeText(planWeekId, 120),
    sanitizeText(planDayId, 120),
    sanitizeText(dateKey, 24),
    sanitizeText(String(weekNumber || ""), 20),
    optionKey,
    sanitizeText(fallbackSeed, 220),
  ].filter(Boolean).join("|");
  return seed ? `${normalizedKind || "recommendation"}_${hashString(seed)}` : `recommendation_${hashString(Date.now())}`;
};

export const buildAdaptiveLearningEventId = ({
  eventName = "",
  actorId = "",
  dedupeKey = "",
  occurredAt = Date.now(),
  sequence = 0,
} = {}) => {
  const normalizedName = sanitizeSlug(eventName, 120) || "adaptive_learning_event";
  if (dedupeKey) {
    return `${normalizedName}_${hashString(`${actorId}|${dedupeKey}`)}`;
  }
  return `${normalizedName}_${hashString(`${actorId}|${occurredAt}|${sequence}`)}`;
};

export const sanitizeRecommendationEventPayload = (payload = {}) => {
  const recommendationKind = sanitizeSlug(payload?.recommendationKind, 80);
  if (!ALLOWED_RECOMMENDATION_KINDS.has(recommendationKind)) {
    throw new Error(`Unsupported recommendation kind: ${payload?.recommendationKind || "unknown"}`);
  }
  const chosenOption = sanitizeChosenOption(payload?.chosenOption || null);
  if (!chosenOption) throw new Error("Recommendation events require a chosen option.");
  const planStage = sanitizePlanStage(payload?.planStage || {});
  const recommendationJoinKey = sanitizeText(
    payload?.recommendationJoinKey
    || buildRecommendationJoinKey({
      recommendationKind,
      planWeekId: planStage.planWeekId,
      planDayId: planStage.planDayId,
      dateKey: planStage.dateKey,
      weekNumber: planStage.currentWeek,
      chosenOption,
      fallbackSeed: payload?.whyChosen || payload?.why || "",
    }),
    160
  );
  const decisionId = sanitizeText(
    payload?.decisionId
    || buildAdaptiveDecisionId({
      recommendationKind,
      recommendationJoinKey,
      actorId: payload?.actorId || "",
      fallbackSeed: chosenOption.optionKey,
    }),
    120
  );
  return {
    recommendationKind,
    decisionId,
    recommendationJoinKey,
    goalStack: sanitizeGoalStack(payload?.goalStack || []),
    planStage,
    contextualInputs: sanitizePlainObject(payload?.contextualInputs || {}, 32),
    candidateOptionsConsidered: sanitizeCandidateOptions(payload?.candidateOptionsConsidered || []),
    chosenOption,
    whyChosen: sanitizeStringArray(payload?.whyChosen || payload?.why || [], 8, 160),
    confidence: sanitizeText(payload?.confidence || "", 40),
    provenance: sanitizeProvenance(payload?.provenance || {}),
    adaptivePolicyShadow: sanitizeAdaptivePolicyShadow(payload?.adaptivePolicyShadow || {}),
    sourceSurface: sanitizeSlug(payload?.sourceSurface || payload?.surface || "app", 80) || "app",
    owner: sanitizeSlug(payload?.owner || "adaptive_learning", 80) || "adaptive_learning",
  };
};

export const sanitizeRecommendationOutcomeEventPayload = (payload = {}) => {
  const outcomeKind = sanitizeSlug(payload?.outcomeKind, 80);
  if (!ALLOWED_OUTCOME_KINDS.has(outcomeKind)) {
    throw new Error(`Unsupported recommendation outcome kind: ${payload?.outcomeKind || "unknown"}`);
  }
  const adherenceOutcome = sanitizeSlug(payload?.adherenceOutcome || ADAPTIVE_ADHERENCE_OUTCOMES.unknown, 80);
  if (!ALLOWED_ADHERENCE_OUTCOMES.has(adherenceOutcome)) {
    throw new Error(`Unsupported adherence outcome: ${payload?.adherenceOutcome || "unknown"}`);
  }
  const recommendationJoinKey = sanitizeText(payload?.recommendationJoinKey || "", 160);
  if (!recommendationJoinKey) throw new Error("Outcome events require a recommendation join key.");
  const decisionId = sanitizeText(payload?.decisionId || "", 120);
  return {
    outcomeKind,
    recommendationJoinKey,
    decisionId,
    adherenceOutcome,
    completionPercentage: clamp(toFiniteNumber(payload?.completionPercentage, 0) ?? 0, 0, 1),
    userModifications: sanitizeStringArray(payload?.userModifications || payload?.modifications || [], 10, 140),
    perceivedDifficulty: sanitizeText(payload?.perceivedDifficulty || "", 80),
    painFlag: Boolean(payload?.painFlag),
    painArea: sanitizeText(payload?.painArea || "", 80),
    satisfactionSignal: sanitizeText(payload?.satisfactionSignal || "", 80),
    frustrationSignal: sanitizeText(payload?.frustrationSignal || "", 80),
    shortHorizonResultWindow: sanitizeShortHorizonWindow(payload?.shortHorizonResultWindow || {}),
    actualSummary: sanitizeText(payload?.actualSummary || "", 220),
    sourceSurface: sanitizeSlug(payload?.sourceSurface || payload?.surface || "app", 80) || "app",
    owner: sanitizeSlug(payload?.owner || "adaptive_learning", 80) || "adaptive_learning",
  };
};

export const sanitizeCohortSnapshotEventPayload = (payload = {}) => ({
  cohortKey: sanitizeSlug(payload?.cohortKey || stableFingerprint(payload), 120),
  planArchetypeId: sanitizeSlug(payload?.planArchetypeId || "", 80),
  primaryGoalCategory: sanitizeSlug(payload?.primaryGoalCategory || "", 60),
  secondaryGoalCategories: sanitizeStringArray(payload?.secondaryGoalCategories || [], 6, 60).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
  experienceLevel: sanitizeSlug(payload?.experienceLevel || "", 40),
  trainingDaysPerWeek: Math.max(0, Math.min(7, toFiniteInteger(payload?.trainingDaysPerWeek, 0) || 0)),
  environmentMode: sanitizeSlug(payload?.environmentMode || "", 60),
  equipmentAccess: sanitizeStringArray(payload?.equipmentAccess || [], 12, 60),
  nutritionBias: sanitizeText(payload?.nutritionBias || "", 120),
  coachTone: sanitizeText(payload?.coachTone || "", 120),
  mobility: sanitizePlainObject(payload?.mobility || {}, 12),
});

export const sanitizeUserStateSnapshotEventPayload = (payload = {}) => ({
  snapshotKind: sanitizeSlug(payload?.snapshotKind || "snapshot", 80) || "snapshot",
  goalStack: sanitizeGoalStack(payload?.goalStack || []),
  planArchetypeId: sanitizeSlug(payload?.planArchetypeId || "", 80),
  planStage: sanitizePlanStage(payload?.planStage || {}),
  onboardingComplete: Boolean(payload?.onboardingComplete),
  syncMode: sanitizeSlug(payload?.syncMode || "", 40),
  pendingLocalWrites: Boolean(payload?.pendingLocalWrites),
  currentMomentumState: sanitizeSlug(payload?.currentMomentumState || "", 40),
  recentPainState: sanitizeSlug(payload?.recentPainState || "", 40),
  environmentMode: sanitizeSlug(payload?.environmentMode || "", 60),
  latestCompletionRate: clamp(toFiniteNumber(payload?.latestCompletionRate, 0) ?? 0, 0, 1),
  details: sanitizePlainObject(payload?.details || {}, 20),
});

export const sanitizeGoalChangeEventPayload = (payload = {}) => ({
  changeKind: sanitizeSlug(payload?.changeKind || "edit", 80) || "edit",
  changeMode: sanitizeSlug(payload?.changeMode || "", 80),
  effectiveDate: sanitizeText(payload?.effectiveDate || "", 24),
  rawGoalIntent: sanitizeText(payload?.rawGoalIntent || "", 420),
  previousGoals: sanitizeStringArray(payload?.previousGoals || [], 10, 180),
  nextGoals: sanitizeStringArray(payload?.nextGoals || [], 10, 180),
  abandonedGoals: sanitizeStringArray(payload?.abandonedGoals || [], 10, 180),
  archivedPlanId: sanitizeText(payload?.archivedPlanId || "", 120),
  rationale: sanitizeText(payload?.rationale || "", 220),
});

export const sanitizeWeeklyEvaluationEventPayload = (payload = {}) => ({
  evaluationWeekNumber: Math.max(1, toFiniteInteger(payload?.evaluationWeekNumber, 1) || 1),
  phase: sanitizeSlug(payload?.phase || "", 40),
  adherenceRate: clamp(toFiniteNumber(payload?.adherenceRate, 0) ?? 0, 0, 1),
  completedSessions: Math.max(0, toFiniteInteger(payload?.completedSessions, 0) || 0),
  modifiedSessions: Math.max(0, toFiniteInteger(payload?.modifiedSessions, 0) || 0),
  skippedSessions: Math.max(0, toFiniteInteger(payload?.skippedSessions, 0) || 0),
  missedSessions: Math.max(0, toFiniteInteger(payload?.missedSessions, 0) || 0),
  painFlags: Math.max(0, toFiniteInteger(payload?.painFlags, 0) || 0),
  nutritionCompliance: sanitizeText(payload?.nutritionCompliance || "", 120),
  coachChangesAccepted: Math.max(0, toFiniteInteger(payload?.coachChangesAccepted, 0) || 0),
  goalProgressSignal: sanitizeText(payload?.goalProgressSignal || "", 180),
  verdict: sanitizeText(payload?.verdict || "", 120),
  linkedRecommendationJoinKeys: sanitizeStringArray(payload?.linkedRecommendationJoinKeys || [], 16, 160),
});

export const sanitizeAuthLifecycleEventPayload = (payload = {}) => ({
  authEvent: sanitizeSlug(payload?.authEvent || "", 80),
  status: sanitizeSlug(payload?.status || "", 40),
  source: sanitizeSlug(payload?.source || "", 80),
  hadCloudSession: Boolean(payload?.hadCloudSession),
  mergedLocalCache: Boolean(payload?.mergedLocalCache),
  detail: sanitizeText(payload?.detail || "", 220),
});

export const sanitizeSyncLifecycleEventPayload = (payload = {}) => ({
  syncEvent: sanitizeSlug(payload?.syncEvent || "", 80),
  status: sanitizeSlug(payload?.status || "", 40),
  reason: sanitizeSlug(payload?.reason || "", 80),
  endpoint: sanitizeText(payload?.endpoint || "", 160),
  httpStatus: toFiniteInteger(payload?.httpStatus, null),
  pendingLocalWrites: Boolean(payload?.pendingLocalWrites),
  retryEligible: Boolean(payload?.retryEligible),
  mergedLocalCache: Boolean(payload?.mergedLocalCache),
  detail: sanitizeText(payload?.detail || "", 220),
});

export const sanitizeAdaptiveLearningEventPayload = ({
  eventName = "",
  payload = {},
} = {}) => {
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated) {
    return sanitizeRecommendationEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded) {
    return sanitizeRecommendationOutcomeEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.cohortSnapshotCaptured) {
    return sanitizeCohortSnapshotEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.userStateSnapshotCaptured) {
    return sanitizeUserStateSnapshotEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.goalChanged) {
    return sanitizeGoalChangeEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.weeklyEvaluationCompleted) {
    return sanitizeWeeklyEvaluationEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.authLifecycleChanged) {
    return sanitizeAuthLifecycleEventPayload(payload);
  }
  if (eventName === ADAPTIVE_LEARNING_EVENT_NAMES.syncLifecycleChanged) {
    return sanitizeSyncLifecycleEventPayload(payload);
  }
  throw new Error(`Unsupported adaptive learning event name: ${eventName || "unknown"}`);
};

export const createAdaptiveLearningEvent = ({
  eventName = "",
  actorId = "",
  userId = "",
  localActorId = "",
  occurredAt = Date.now(),
  payload = {},
  dedupeKey = "",
  sequence = 0,
} = {}) => {
  const normalizedEventName = sanitizeText(eventName, 120);
  if (!ALLOWED_EVENT_NAMES.has(normalizedEventName)) {
    throw new Error(`Unknown adaptive learning event name: ${eventName || "unknown"}`);
  }
  const identity = sanitizeAdaptiveLearningIdentity({
    actorId,
    userId,
    localActorId,
  });
  const safeOccurredAt = toFiniteInteger(occurredAt, Date.now()) || Date.now();
  const sanitizedPayload = sanitizeAdaptiveLearningEventPayload({
    eventName: normalizedEventName,
    payload: {
      ...clone(payload || {}),
      actorId: identity.actorId,
    },
  });
  const version = ADAPTIVE_LEARNING_EVENT_VERSIONS[normalizedEventName] || 1;
  const normalizedDedupeKey = sanitizeText(dedupeKey || "", 220);
  const eventId = buildAdaptiveLearningEventId({
    eventName: normalizedEventName,
    actorId: identity.actorId,
    dedupeKey: normalizedDedupeKey,
    occurredAt: safeOccurredAt,
    sequence,
  });
  return {
    eventId,
    eventName: normalizedEventName,
    version,
    schemaVersion: ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
    actorId: identity.actorId,
    userId: identity.userId,
    localActorId: identity.localActorId,
    occurredAt: safeOccurredAt,
    dedupeKey: normalizedDedupeKey,
    payload: sanitizedPayload,
  };
};

export const validateAdaptiveLearningEvent = (event = null) => {
  if (!event || typeof event !== "object") throw new Error("Adaptive learning event must be an object.");
  return createAdaptiveLearningEvent({
    eventName: event.eventName,
    actorId: event.actorId,
    userId: event.userId,
    localActorId: event.localActorId,
    occurredAt: event.occurredAt,
    payload: event.payload,
    dedupeKey: event.dedupeKey,
    sequence: 0,
  });
};
