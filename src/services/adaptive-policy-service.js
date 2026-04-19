const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const roundTo = (value, precision = 4) => {
  const scale = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * scale) / scale;
};

export const ADAPTIVE_POLICY_MODES = Object.freeze({
  deterministicOnly: "deterministic_only",
  shadow: "shadow",
  active: "active",
});

export const ADAPTIVE_POLICY_DECISION_POINTS = Object.freeze({
  progressionAggressivenessBand: Object.freeze({
    id: "progression_aggressiveness_band",
    label: "Progression aggressiveness band",
    owner: "weekly_intent",
    fallbackActionId: "default_band",
    actions: Object.freeze({
      default_band: Object.freeze({ id: "default_band", label: "Default band" }),
      conservative_band: Object.freeze({ id: "conservative_band", label: "Conservative band" }),
      progressive_band: Object.freeze({ id: "progressive_band", label: "Progressive band" }),
    }),
    requiredContextInputs: Object.freeze([
      "primaryGoalCategory",
      "experienceLevel",
      "scheduleReliability",
      "weeklyStressState",
      "reEntry",
      "cutbackWeek",
      "timeCrunched",
    ]),
  }),
  deloadTimingWindow: Object.freeze({
    id: "deload_timing_window",
    label: "Deload timing window",
    owner: "weekly_intent",
    fallbackActionId: "keep_current_window",
    actions: Object.freeze({
      keep_current_window: Object.freeze({ id: "keep_current_window", label: "Keep current window" }),
      pull_forward_deload: Object.freeze({ id: "pull_forward_deload", label: "Pull deload forward" }),
    }),
    requiredContextInputs: Object.freeze([
      "primaryGoalCategory",
      "experienceLevel",
      "scheduleReliability",
      "weeklyStressState",
      "travelHeavy",
      "painSensitive",
    ]),
  }),
  timeCrunchedSessionFormatChoice: Object.freeze({
    id: "time_crunched_session_format_choice",
    label: "Time-crunched session format choice",
    owner: "day_templates",
    fallbackActionId: "default_structure",
    actions: Object.freeze({
      default_structure: Object.freeze({ id: "default_structure", label: "Default structure" }),
      stacked_mixed_sessions: Object.freeze({ id: "stacked_mixed_sessions", label: "Stacked mixed sessions" }),
      short_separate_sessions: Object.freeze({ id: "short_separate_sessions", label: "Short separate sessions" }),
    }),
    requiredContextInputs: Object.freeze([
      "timeCrunched",
      "trainingDaysPerWeek",
      "sessionDuration",
      "hybridAthlete",
      "runningGoalActive",
      "strengthGoalActive",
    ]),
  }),
  travelSubstitutionSet: Object.freeze({
    id: "travel_substitution_set",
    label: "Travel substitution set",
    owner: "day_templates",
    fallbackActionId: "default_substitutions",
    actions: Object.freeze({
      default_substitutions: Object.freeze({ id: "default_substitutions", label: "Default substitutions" }),
      hotel_gym_substitutions: Object.freeze({ id: "hotel_gym_substitutions", label: "Hotel gym substitutions" }),
      outdoor_endurance_substitutions: Object.freeze({ id: "outdoor_endurance_substitutions", label: "Outdoor endurance substitutions" }),
      minimal_equipment_substitutions: Object.freeze({ id: "minimal_equipment_substitutions", label: "Minimal-equipment substitutions" }),
    }),
    requiredContextInputs: Object.freeze([
      "travelHeavy",
      "environmentMode",
      "equipmentAccess",
      "outdoorPreferred",
      "painSensitive",
    ]),
  }),
  hybridRunLiftBalanceTemplate: Object.freeze({
    id: "hybrid_run_lift_balance_template",
    label: "Hybrid run-lift balance template",
    owner: "day_templates",
    fallbackActionId: "balanced_hybrid",
    actions: Object.freeze({
      balanced_hybrid: Object.freeze({ id: "balanced_hybrid", label: "Balanced hybrid" }),
      run_supportive_hybrid: Object.freeze({ id: "run_supportive_hybrid", label: "Run-supportive hybrid" }),
      strength_supportive_hybrid: Object.freeze({ id: "strength_supportive_hybrid", label: "Strength-supportive hybrid" }),
    }),
    requiredContextInputs: Object.freeze([
      "hybridAthlete",
      "hybridMeaningful",
      "hybridCohort",
      "hybridHardDayBand",
      "hybridRunBuildPhase",
      "runningGoalActive",
      "strengthGoalActive",
      "scheduleReliability",
      "timeCrunched",
      "painSensitive",
    ]),
  }),
  hybridSessionFormatChoice: Object.freeze({
    id: "hybrid_session_format_choice",
    label: "Hybrid session format choice",
    owner: "day_templates",
    fallbackActionId: "keep_current_structure",
    actions: Object.freeze({
      keep_current_structure: Object.freeze({ id: "keep_current_structure", label: "Keep current structure" }),
      favor_mixed_sessions: Object.freeze({ id: "favor_mixed_sessions", label: "Favor mixed sessions" }),
      favor_short_split_sessions: Object.freeze({ id: "favor_short_split_sessions", label: "Favor short split sessions" }),
    }),
    requiredContextInputs: Object.freeze([
      "hybridMeaningful",
      "hybridCohort",
      "hybridHardDayBand",
      "hybridMixedSessionBand",
      "timeCrunched",
      "scheduleReliability",
      "trainingDaysPerWeek",
    ]),
  }),
  hybridDeloadTimingWindow: Object.freeze({
    id: "hybrid_deload_timing_window",
    label: "Hybrid deload timing window",
    owner: "weekly_intent",
    fallbackActionId: "keep_current_window",
    actions: Object.freeze({
      keep_current_window: Object.freeze({ id: "keep_current_window", label: "Keep current window" }),
      pull_forward_hybrid_deload: Object.freeze({ id: "pull_forward_hybrid_deload", label: "Pull the hybrid deload forward" }),
    }),
    requiredContextInputs: Object.freeze([
      "hybridMeaningful",
      "hybridCohort",
      "hybridHardDayBand",
      "hybridRunBuildPhase",
      "hybridRecoveryRisk",
      "weeklyStressState",
      "painSensitive",
    ]),
  }),
});

const DEFAULT_MODE = ADAPTIVE_POLICY_MODES.deterministicOnly;
const DEFAULT_THRESHOLDS = Object.freeze({
  minConfidenceScore: 65,
  minScoreLift: 0.035,
  minSampleSize: 6,
});

const DECISION_POINT_LIST = Object.values(ADAPTIVE_POLICY_DECISION_POINTS);
const DECISION_POINT_MAP = Object.freeze(
  DECISION_POINT_LIST.reduce((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  }, {})
);

const sanitizeThresholds = (value = {}) => ({
  minConfidenceScore: Math.max(0, Math.min(100, Math.round(toFiniteNumber(value?.minConfidenceScore, DEFAULT_THRESHOLDS.minConfidenceScore)))),
  minScoreLift: Math.max(0, toFiniteNumber(value?.minScoreLift, DEFAULT_THRESHOLDS.minScoreLift)),
  minSampleSize: Math.max(1, Math.round(toFiniteNumber(value?.minSampleSize, DEFAULT_THRESHOLDS.minSampleSize))),
});

const normalizeMode = (value = "") => {
  const normalized = sanitizeSlug(value, 40);
  if (Object.values(ADAPTIVE_POLICY_MODES).includes(normalized)) return normalized;
  return DEFAULT_MODE;
};

const sanitizeDecisionPointSettings = (value = {}) => DECISION_POINT_LIST.reduce((acc, entry) => {
  const raw = value?.[entry.id];
  if (raw === false) {
    acc[entry.id] = { enabled: false, mode: DEFAULT_MODE };
    return acc;
  }
  if (raw && typeof raw === "object") {
    acc[entry.id] = {
      enabled: raw.enabled !== false,
      mode: normalizeMode(raw.mode || DEFAULT_MODE),
    };
    return acc;
  }
  acc[entry.id] = {
    enabled: true,
    mode: "",
  };
  return acc;
}, {});

const sanitizeRuleMatcher = (value = {}) => ({
  primaryGoalCategories: toArray(value?.primaryGoalCategories).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
  architectures: toArray(value?.architectures).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
  planArchetypeIds: toArray(value?.planArchetypeIds).map((item) => sanitizeSlug(item, 80)).filter(Boolean),
  experienceLevels: toArray(value?.experienceLevels).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  scheduleReliabilities: toArray(value?.scheduleReliabilities).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  environmentModes: toArray(value?.environmentModes).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
  equipmentAccessModes: toArray(value?.equipmentAccessModes).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
  sessionDurations: toArray(value?.sessionDurations).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  minTrainingDaysPerWeek: Math.max(0, Math.round(toFiniteNumber(value?.minTrainingDaysPerWeek, 0))),
  maxTrainingDaysPerWeek: Math.max(0, Math.round(toFiniteNumber(value?.maxTrainingDaysPerWeek, 7))),
  hybridAthlete: typeof value?.hybridAthlete === "boolean" ? value.hybridAthlete : null,
  hybridMeaningful: typeof value?.hybridMeaningful === "boolean" ? value.hybridMeaningful : null,
  hybridCohorts: toArray(value?.hybridCohorts || value?.hybridCohort).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
  hybridHardDayBands: toArray(value?.hybridHardDayBands || value?.hybridHardDayBand).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  hybridMixedSessionBands: toArray(value?.hybridMixedSessionBands || value?.hybridMixedSessionBand).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  hybridRunBuildPhases: toArray(value?.hybridRunBuildPhases || value?.hybridRunBuildPhase).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  hybridRecoveryRisks: toArray(value?.hybridRecoveryRisks || value?.hybridRecoveryRisk).map((item) => sanitizeSlug(item, 40)).filter(Boolean),
  hybridLowerBodyGuardNeeded: typeof value?.hybridLowerBodyGuardNeeded === "boolean" ? value.hybridLowerBodyGuardNeeded : null,
  travelHeavy: typeof value?.travelHeavy === "boolean" ? value.travelHeavy : null,
  timeCrunched: typeof value?.timeCrunched === "boolean" ? value.timeCrunched : null,
  painSensitive: typeof value?.painSensitive === "boolean" ? value.painSensitive : null,
  runningGoalActive: typeof value?.runningGoalActive === "boolean" ? value.runningGoalActive : null,
  strengthGoalActive: typeof value?.strengthGoalActive === "boolean" ? value.strengthGoalActive : null,
  physiqueGoalActive: typeof value?.physiqueGoalActive === "boolean" ? value.physiqueGoalActive : null,
  strengthOrPhysiqueGoalActive: typeof value?.strengthOrPhysiqueGoalActive === "boolean" ? value.strengthOrPhysiqueGoalActive : null,
  strengthPriority: typeof value?.strengthPriority === "boolean" ? value.strengthPriority : null,
  outdoorPreferred: typeof value?.outdoorPreferred === "boolean" ? value.outdoorPreferred : null,
});

const sanitizeEvidenceRule = (rule = {}, index = 0) => ({
  id: sanitizeSlug(rule?.id || `adaptive_policy_rule_${index + 1}`, 120) || `adaptive_policy_rule_${index + 1}`,
  decisionPointId: sanitizeSlug(rule?.decisionPointId || "", 80),
  actionId: sanitizeSlug(rule?.actionId || "", 80),
  summary: sanitizeText(rule?.summary || rule?.rationale || "", 220),
  source: sanitizeSlug(rule?.source || "operator_reviewed", 80) || "operator_reviewed",
  sampleSize: Math.max(0, Math.round(toFiniteNumber(rule?.sampleSize, 0))),
  confidenceScore: Math.max(0, Math.min(100, Math.round(toFiniteNumber(rule?.confidenceScore, 0)))),
  effectSize: roundTo(toFiniteNumber(rule?.effectSize, 0), 4),
  matchers: sanitizeRuleMatcher(rule?.matchers || {}),
});

const sanitizeEvidenceSnapshot = (value = {}) => ({
  version: Math.max(1, Math.round(toFiniteNumber(value?.version, 1))),
  generatedAt: sanitizeText(value?.generatedAt || "", 48),
  sourceLabel: sanitizeText(value?.sourceLabel || "", 160),
  rules: toArray(value?.rules).map(sanitizeEvidenceRule).filter((rule) => rule.decisionPointId && rule.actionId),
});

export const resolveAdaptivePolicyRuntime = ({
  personalization = {},
  adaptivePolicyConfig = null,
  adaptivePolicyEvidence = null,
} = {}) => {
  const settingsConfig = personalization?.settings?.adaptivePolicy || personalization?.adaptivePolicy || {};
  const resolvedConfig = adaptivePolicyConfig && typeof adaptivePolicyConfig === "object"
    ? adaptivePolicyConfig
    : settingsConfig;
  const mode = normalizeMode(resolvedConfig?.mode || settingsConfig?.mode || DEFAULT_MODE);
  return {
    mode,
    enabled: mode !== ADAPTIVE_POLICY_MODES.deterministicOnly,
    decisionPointSettings: sanitizeDecisionPointSettings({
      ...(settingsConfig?.decisionPoints || {}),
      ...(resolvedConfig?.decisionPoints || {}),
    }),
    thresholds: sanitizeThresholds({
      ...(settingsConfig?.thresholds || {}),
      ...(resolvedConfig?.thresholds || {}),
    }),
    evidenceSnapshot: sanitizeEvidenceSnapshot(
      adaptivePolicyEvidence && typeof adaptivePolicyEvidence === "object"
        ? adaptivePolicyEvidence
        : resolvedConfig?.evidenceSnapshot || settingsConfig?.evidenceSnapshot || {}
    ),
  };
};

const buildContextSnapshot = (context = {}) => ({
  primaryGoalCategory: sanitizeSlug(context?.primaryGoalCategory || "", 60),
  architecture: sanitizeSlug(context?.architecture || "", 60),
  planArchetypeId: sanitizeSlug(context?.planArchetypeId || "", 80),
  experienceLevel: sanitizeSlug(context?.experienceLevel || "", 40),
  scheduleReliability: sanitizeSlug(context?.scheduleReliability || "", 40),
  environmentMode: sanitizeSlug(context?.environmentMode || "", 60),
  equipmentAccess: sanitizeSlug(context?.equipmentAccess || "", 60),
  sessionDuration: sanitizeSlug(context?.sessionDuration || "", 40),
  trainingDaysPerWeek: Math.max(0, Math.min(7, Math.round(toFiniteNumber(context?.trainingDaysPerWeek, 0)))),
  hybridAthlete: Boolean(context?.hybridAthlete),
  hybridMeaningful: Boolean(context?.hybridMeaningful),
  hybridCohort: sanitizeSlug(context?.hybridCohort || "", 60),
  hybridHardDayBand: sanitizeSlug(context?.hybridHardDayBand || "", 40),
  hybridMixedSessionBand: sanitizeSlug(context?.hybridMixedSessionBand || "", 40),
  hybridRunBuildPhase: sanitizeSlug(context?.hybridRunBuildPhase || "", 40),
  hybridRecoveryRisk: sanitizeSlug(context?.hybridRecoveryRisk || "", 40),
  hybridLowerBodyGuardNeeded: Boolean(context?.hybridLowerBodyGuardNeeded),
  travelHeavy: Boolean(context?.travelHeavy),
  timeCrunched: Boolean(context?.timeCrunched),
  painSensitive: Boolean(context?.painSensitive),
  runningGoalActive: Boolean(context?.runningGoalActive),
  strengthGoalActive: Boolean(context?.strengthGoalActive),
  physiqueGoalActive: Boolean(context?.physiqueGoalActive),
  strengthOrPhysiqueGoalActive: Boolean(context?.strengthOrPhysiqueGoalActive),
  strengthPriority: Boolean(context?.strengthPriority),
  outdoorPreferred: Boolean(context?.outdoorPreferred),
  weeklyStressState: sanitizeSlug(context?.weeklyStressState || "", 40),
  reEntry: Boolean(context?.reEntry),
  cutbackWeek: Boolean(context?.cutbackWeek),
});

const matchesList = (candidate, expected = []) => {
  const safeExpected = toArray(expected).filter(Boolean);
  if (!safeExpected.length) return true;
  return safeExpected.includes(candidate);
};

const matchesRuleContext = (rule = {}, context = {}) => {
  const matcher = rule?.matchers || {};
  const matchedFields = [];
  const checks = [
    ["primaryGoalCategory", matchesList(context?.primaryGoalCategory, matcher.primaryGoalCategories)],
    ["architecture", matchesList(context?.architecture, matcher.architectures)],
    ["planArchetypeId", matchesList(context?.planArchetypeId, matcher.planArchetypeIds)],
    ["experienceLevel", matchesList(context?.experienceLevel, matcher.experienceLevels)],
    ["scheduleReliability", matchesList(context?.scheduleReliability, matcher.scheduleReliabilities)],
    ["environmentMode", matchesList(context?.environmentMode, matcher.environmentModes)],
    ["equipmentAccess", matchesList(context?.equipmentAccess, matcher.equipmentAccessModes)],
    ["sessionDuration", matchesList(context?.sessionDuration, matcher.sessionDurations)],
    ["trainingDaysPerWeek", context?.trainingDaysPerWeek >= matcher.minTrainingDaysPerWeek && context?.trainingDaysPerWeek <= matcher.maxTrainingDaysPerWeek],
    ["hybridAthlete", matcher.hybridAthlete == null || context?.hybridAthlete === matcher.hybridAthlete],
    ["hybridMeaningful", matcher.hybridMeaningful == null || context?.hybridMeaningful === matcher.hybridMeaningful],
    ["hybridCohort", matchesList(context?.hybridCohort, matcher.hybridCohorts)],
    ["hybridHardDayBand", matchesList(context?.hybridHardDayBand, matcher.hybridHardDayBands)],
    ["hybridMixedSessionBand", matchesList(context?.hybridMixedSessionBand, matcher.hybridMixedSessionBands)],
    ["hybridRunBuildPhase", matchesList(context?.hybridRunBuildPhase, matcher.hybridRunBuildPhases)],
    ["hybridRecoveryRisk", matchesList(context?.hybridRecoveryRisk, matcher.hybridRecoveryRisks)],
    ["hybridLowerBodyGuardNeeded", matcher.hybridLowerBodyGuardNeeded == null || context?.hybridLowerBodyGuardNeeded === matcher.hybridLowerBodyGuardNeeded],
    ["travelHeavy", matcher.travelHeavy == null || context?.travelHeavy === matcher.travelHeavy],
    ["timeCrunched", matcher.timeCrunched == null || context?.timeCrunched === matcher.timeCrunched],
    ["painSensitive", matcher.painSensitive == null || context?.painSensitive === matcher.painSensitive],
    ["runningGoalActive", matcher.runningGoalActive == null || context?.runningGoalActive === matcher.runningGoalActive],
    ["strengthGoalActive", matcher.strengthGoalActive == null || context?.strengthGoalActive === matcher.strengthGoalActive],
    ["physiqueGoalActive", matcher.physiqueGoalActive == null || context?.physiqueGoalActive === matcher.physiqueGoalActive],
    ["strengthOrPhysiqueGoalActive", matcher.strengthOrPhysiqueGoalActive == null || context?.strengthOrPhysiqueGoalActive === matcher.strengthOrPhysiqueGoalActive],
    ["strengthPriority", matcher.strengthPriority == null || context?.strengthPriority === matcher.strengthPriority],
    ["outdoorPreferred", matcher.outdoorPreferred == null || context?.outdoorPreferred === matcher.outdoorPreferred],
  ];
  for (const [field, matched] of checks) {
    if (!matched) {
      return { matched: false, matchedFields };
    }
    matchedFields.push(field);
  }
  return { matched: true, matchedFields };
};

const buildRuleContributionScore = (rule = {}) => {
  const confidenceFactor = Math.max(0, Math.min(1, toFiniteNumber(rule?.confidenceScore, 0) / 100));
  const sampleFactor = Math.max(0.35, Math.min(2, toFiniteNumber(rule?.sampleSize, 0) / 12));
  return roundTo(toFiniteNumber(rule?.effectSize, 0) * confidenceFactor * sampleFactor, 4);
};

const buildDecisionExplanation = ({
  mode = DEFAULT_MODE,
  point = null,
  chosenAction = null,
  defaultAction = null,
  fallbackReason = "",
  matchedRules = [],
  contextSnapshot = {},
} = {}) => {
  const chosenLabel = chosenAction?.label || chosenAction?.id || "default";
  const defaultLabel = defaultAction?.label || defaultAction?.id || "default";
  const evidenceLine = matchedRules.length
    ? matchedRules.slice(0, 2).map((rule) => rule.summary || rule.id).filter(Boolean).join(" ")
    : "No reviewed evidence matched this context strongly enough to override the deterministic default.";
  if (mode === ADAPTIVE_POLICY_MODES.shadow) {
    return `Shadow mode scored ${chosenLabel.toLowerCase()}, but the planner kept ${defaultLabel.toLowerCase()}. ${evidenceLine}`.trim();
  }
  if (fallbackReason) {
    return `${point?.label || "Adaptive decision"} kept ${defaultLabel.toLowerCase()} because ${fallbackReason.replace(/_/g, " ")}. ${evidenceLine}`.trim();
  }
  return `${point?.label || "Adaptive decision"} used ${chosenLabel.toLowerCase()} for ${contextSnapshot?.primaryGoalCategory || "this plan"} based on reviewed evidence. ${evidenceLine}`.trim();
};

export const scoreAdaptiveDecision = ({
  decisionPointId = "",
  defaultActionId = "",
  candidateActionIds = [],
  context = {},
  runtime = null,
  excludedCandidates = {},
} = {}) => {
  const point = DECISION_POINT_MAP[decisionPointId];
  if (!point) {
    throw new Error(`Unknown adaptive policy decision point: ${decisionPointId || "unknown"}`);
  }
  const safeRuntime = runtime || resolveAdaptivePolicyRuntime();
  const thresholds = sanitizeThresholds(safeRuntime?.thresholds || {});
  const pointSettings = safeRuntime?.decisionPointSettings?.[decisionPointId] || { enabled: true, mode: "" };
  const pointEnabled = pointSettings.enabled !== false;
  const effectiveMode = normalizeMode(pointSettings.mode || safeRuntime?.mode || DEFAULT_MODE);
  const safeContext = buildContextSnapshot(context);
  const actionMap = point.actions || {};
  const safeCandidateIds = toArray(candidateActionIds)
    .map((item) => sanitizeSlug(item, 80))
    .filter((item) => item && actionMap[item]);
  const resolvedDefaultActionId = sanitizeSlug(defaultActionId || point.fallbackActionId, 80) || point.fallbackActionId;
  const finalCandidateIds = safeCandidateIds.includes(resolvedDefaultActionId)
    ? safeCandidateIds
    : [resolvedDefaultActionId, ...safeCandidateIds].filter((value, index, array) => array.indexOf(value) === index && actionMap[value]);
  const relevantRules = toArray(safeRuntime?.evidenceSnapshot?.rules).filter((rule) => rule?.decisionPointId === point.id);
  const candidateScores = finalCandidateIds.map((actionId) => {
    const exclusionReason = sanitizeText(excludedCandidates?.[actionId] || "", 160);
    const matchingRules = exclusionReason
      ? []
      : relevantRules
        .filter((rule) => rule?.actionId === actionId)
        .map((rule) => ({ rule, match: matchesRuleContext(rule, safeContext) }))
        .filter((entry) => entry.match.matched)
        .map((entry) => entry.rule);
    const score = exclusionReason
      ? Number.NEGATIVE_INFINITY
      : roundTo(matchingRules.reduce((sum, rule) => sum + buildRuleContributionScore(rule), 0), 4);
    const confidenceScore = matchingRules.length
      ? Math.max(...matchingRules.map((rule) => Math.max(0, Math.min(100, Number(rule?.confidenceScore || 0)))))
      : 0;
    const sampleSize = matchingRules.reduce((sum, rule) => sum + Math.max(0, Number(rule?.sampleSize || 0)), 0);
    const evidenceEffectSize = roundTo(matchingRules.reduce((sum, rule) => sum + toFiniteNumber(rule?.effectSize, 0), 0), 4);
    return {
      actionId,
      label: actionMap[actionId]?.label || actionId,
      excluded: Boolean(exclusionReason),
      exclusionReason,
      score,
      confidenceScore,
      sampleSize,
      evidenceEffectSize,
      matchedRuleIds: matchingRules.map((rule) => rule.id),
      matchedEvidenceSummaries: matchingRules.map((rule) => rule.summary).filter(Boolean).slice(0, 3),
    };
  });
  const defaultCandidate = candidateScores.find((candidate) => candidate.actionId === resolvedDefaultActionId) || {
    actionId: resolvedDefaultActionId,
    label: actionMap[resolvedDefaultActionId]?.label || resolvedDefaultActionId,
    excluded: false,
    exclusionReason: "",
    score: 0,
    confidenceScore: 0,
    sampleSize: 0,
    evidenceEffectSize: 0,
    matchedRuleIds: [],
    matchedEvidenceSummaries: [],
  };
  const adaptiveCandidates = candidateScores
    .filter((candidate) => candidate.actionId !== resolvedDefaultActionId && !candidate.excluded)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.confidenceScore !== left.confidenceScore) return right.confidenceScore - left.confidenceScore;
      return right.sampleSize - left.sampleSize;
    });
  const topAdaptiveCandidate = adaptiveCandidates[0] || null;
  let chosenActionId = resolvedDefaultActionId;
  let fallbackReason = "";
  let shadowTopActionId = topAdaptiveCandidate?.actionId || "";

  if (!pointEnabled) {
    fallbackReason = "decision_point_disabled";
  } else if (effectiveMode === ADAPTIVE_POLICY_MODES.deterministicOnly) {
    fallbackReason = "adaptive_layer_disabled";
  } else if (!topAdaptiveCandidate) {
    fallbackReason = "insufficient_evidence";
  } else if (
    topAdaptiveCandidate.confidenceScore < thresholds.minConfidenceScore
    || topAdaptiveCandidate.sampleSize < thresholds.minSampleSize
    || (topAdaptiveCandidate.score - defaultCandidate.score) < thresholds.minScoreLift
  ) {
    fallbackReason = "insufficient_confidence";
  } else if (effectiveMode === ADAPTIVE_POLICY_MODES.shadow) {
    fallbackReason = "shadow_mode";
  } else {
    chosenActionId = topAdaptiveCandidate.actionId;
  }

  const chosenAction = actionMap[chosenActionId] || actionMap[resolvedDefaultActionId] || null;
  const matchedRules = relevantRules.filter((rule) => toArray(candidateScores.find((candidate) => candidate.actionId === chosenActionId)?.matchedRuleIds).includes(rule.id));

  return {
    decisionPointId: point.id,
    mode: safeRuntime?.mode || DEFAULT_MODE,
    decisionMode: effectiveMode,
    usedAdaptiveChoice: chosenActionId !== resolvedDefaultActionId,
    defaultActionId: resolvedDefaultActionId,
    chosenActionId,
    shadowTopActionId,
    fallbackReason,
    contextSnapshot: safeContext,
    candidateScores: candidateScores.map((candidate) => ({
      ...candidate,
      score: Number.isFinite(candidate.score) ? candidate.score : null,
    })),
    explanation: buildDecisionExplanation({
      mode: effectiveMode,
      point,
      chosenAction,
      defaultAction: actionMap[resolvedDefaultActionId] || null,
      fallbackReason,
      matchedRules,
      contextSnapshot: safeContext,
    }),
  };
};

const containsAny = (text = "", patterns = []) => toArray(patterns).some((pattern) => String(text || "").toLowerCase().includes(String(pattern || "").toLowerCase()));

const mapCandidateToRule = (candidate = {}) => {
  const family = sanitizeSlug(candidate?.family || "", 80);
  const betterLabel = sanitizeText(candidate?.betterLabel || "", 160).toLowerCase();
  if (family === "runramptolerance") {
    if (containsAny(betterLabel, ["low", "controlled", "conservative", "reduced"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id, actionId: "conservative_band" };
    }
    if (containsAny(betterLabel, ["high", "expanded", "progressive", "aggressive"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id, actionId: "progressive_band" };
    }
  }
  if (family === "deloadtiming") {
    if (containsAny(betterLabel, ["early", "earlier", "pull", "sooner"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow.id, actionId: "pull_forward_deload" };
    }
  }
  if (family === "travelsubstitutions") {
    if (containsAny(betterLabel, ["hotel", "gym"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id, actionId: "hotel_gym_substitutions" };
    }
    if (containsAny(betterLabel, ["outdoor", "walk", "run"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id, actionId: "outdoor_endurance_substitutions" };
    }
    if (containsAny(betterLabel, ["minimal", "band", "bodyweight", "circuit"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id, actionId: "minimal_equipment_substitutions" };
    }
  }
  if (family === "hybridloadcombos") {
    if (containsAny(betterLabel, ["run"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridRunLiftBalanceTemplate.id, actionId: "run_supportive_hybrid" };
    }
    if (containsAny(betterLabel, ["strength", "lift"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridRunLiftBalanceTemplate.id, actionId: "strength_supportive_hybrid" };
    }
  }
  if (family === "hybridsessionformats") {
    if (containsAny(betterLabel, ["mixed", "stacked", "combined"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id, actionId: "favor_mixed_sessions" };
    }
    if (containsAny(betterLabel, ["split", "separate", "concise"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id, actionId: "favor_short_split_sessions" };
    }
  }
  if (family === "hybriddeloadtiming") {
    if (containsAny(betterLabel, ["early", "earlier", "pull", "sooner"])) {
      return { decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridDeloadTimingWindow.id, actionId: "pull_forward_hybrid_deload" };
    }
  }
  return null;
};

export const buildAdaptivePolicyEvidenceSnapshotFromAnalysisResults = ({
  analysisResults = {},
  reviewedRules = [],
} = {}) => {
  const suggestionGroups = [
    ...(toArray(analysisResults?.candidatePolicySuggestions?.highConfidence)),
    ...(toArray(analysisResults?.candidatePolicySuggestions?.mediumConfidence)),
  ];
  const derivedRules = suggestionGroups.map((candidate, index) => {
    const mapping = mapCandidateToRule(candidate);
    if (!mapping) return null;
    return sanitizeEvidenceRule({
      id: candidate?.id || `analysis_rule_${index + 1}`,
      decisionPointId: mapping.decisionPointId,
      actionId: mapping.actionId,
      summary: candidate?.summary || "",
      source: "analysis_pipeline",
      sampleSize: candidate?.sampleSize || 0,
      confidenceScore: candidate?.confidenceScore || 0,
      effectSize: candidate?.effectSize || 0,
      matchers: {},
    }, index);
  }).filter(Boolean);
  return sanitizeEvidenceSnapshot({
    version: 1,
    sourceLabel: "adaptive_learning_analysis",
    rules: [...derivedRules, ...toArray(reviewedRules)],
  });
};
