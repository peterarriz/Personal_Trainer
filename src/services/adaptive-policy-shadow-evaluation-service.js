import { extractAdaptiveLearningEvents } from "./adaptive-learning-analysis/extraction.js";
import { buildAdaptiveLearningAnalysisRows } from "./adaptive-learning-analysis/feature-engineering.js";
import {
  average,
  hashString,
  humanizeEnum,
  roundTo,
  sanitizeSlug,
  sanitizeText,
  sortByScoreThenSample,
  toArray,
} from "./adaptive-learning-analysis/shared.js";
import { ADAPTIVE_LEARNING_EVENT_NAMES } from "./adaptive-learning-event-service.js";
import {
  ADAPTIVE_POLICY_DECISION_POINTS,
  resolveAdaptivePolicyRuntime,
  scoreAdaptiveDecision,
} from "./adaptive-policy-service.js";

export const DEFAULT_ADAPTIVE_POLICY_SHADOW_HOLDOUT_PERCENTAGE = 20;
export const DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE = 5;
export const DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS = Object.freeze({
  minRows: 20,
  minHoldoutRows: 8,
  minAverageConfidence: 55,
  minEstimatedBenefit: 0.01,
  maxPotentialHarm: 0.005,
  maxDivergenceRate: 0.45,
});

const HYBRID_VERTICAL_SLICE_DECISION_IDS = new Set([
  ADAPTIVE_POLICY_DECISION_POINTS.hybridRunLiftBalanceTemplate.id,
  ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id,
  ADAPTIVE_POLICY_DECISION_POINTS.hybridDeloadTimingWindow.id,
]);

const buildHoldoutBucket = ({
  analysisActorId = "",
  recommendationJoinKey = "",
  decisionPointId = "",
  holdoutPercentage = DEFAULT_ADAPTIVE_POLICY_SHADOW_HOLDOUT_PERCENTAGE,
} = {}) => {
  const raw = parseInt(hashString(`${analysisActorId}|${recommendationJoinKey}|${decisionPointId}`), 36);
  const bucket = Number.isFinite(raw) ? Math.abs(raw % 100) : 0;
  return bucket < Math.max(0, Math.min(95, Math.round(Number(holdoutPercentage) || 0))) ? "holdout" : "analysis";
};

const sanitizePromotionThresholds = (value = {}) => ({
  minRows: Math.max(1, Math.round(Number(value?.minRows || DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.minRows))),
  minHoldoutRows: Math.max(1, Math.round(Number(value?.minHoldoutRows || DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.minHoldoutRows))),
  minAverageConfidence: Math.max(0, Math.min(100, Math.round(Number(value?.minAverageConfidence || DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.minAverageConfidence)))),
  minEstimatedBenefit: Math.max(0, Number(value?.minEstimatedBenefit || DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.minEstimatedBenefit)),
  maxPotentialHarm: Math.max(0, Number(value?.maxPotentialHarm || DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.maxPotentialHarm)),
  maxDivergenceRate: Math.max(0, Math.min(1, Number(value?.maxDivergenceRate || DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.maxDivergenceRate))),
});

const resolveShadowActionId = (decision = {}) => (
  sanitizeSlug(
    decision?.shadowTopActionId
    || ((decision?.usedAdaptiveChoice && decision?.chosenActionId !== decision?.defaultActionId) ? decision?.chosenActionId : ""),
    120
  )
);

const resolveConfidenceBand = (value = 0) => (
  Number(value || 0) >= 70 ? "high" : Number(value || 0) >= 45 ? "medium" : "low"
);

const extractShadowDecisions = (payload = {}) => {
  const runtimeMode = sanitizeSlug(payload?.adaptivePolicyShadow?.runtimeMode || "", 40);
  return toArray(payload?.adaptivePolicyShadow?.decisions).map((decision) => ({
    ...decision,
    runtimeMode,
  })).filter((decision) => decision?.decisionPointId && decision?.defaultActionId);
};

const replayShadowDecision = ({
  trace = null,
  runtime = null,
} = {}) => {
  if (!trace?.decisionPointId || !trace?.defaultActionId) return null;
  const candidateScores = toArray(trace?.candidateScores);
  const candidateActionIds = candidateScores.map((candidate) => sanitizeSlug(candidate?.actionId || "", 120)).filter(Boolean);
  const excludedCandidates = candidateScores.reduce((acc, candidate) => {
    const actionId = sanitizeSlug(candidate?.actionId || "", 120);
    if (!actionId || !candidate?.excluded) return acc;
    acc[actionId] = sanitizeText(candidate?.exclusionReason || "", 160);
    return acc;
  }, {});
  try {
    return scoreAdaptiveDecision({
      decisionPointId: trace.decisionPointId,
      defaultActionId: trace.defaultActionId,
      candidateActionIds,
      context: trace?.contextSnapshot || {},
      runtime,
      excludedCandidates,
    });
  } catch {
    return null;
  }
};

const buildDecisionRow = ({
  recommendationEvent = null,
  analysisRow = null,
  decision = null,
  policyRuntime = null,
  holdoutPercentage = DEFAULT_ADAPTIVE_POLICY_SHADOW_HOLDOUT_PERCENTAGE,
} = {}) => {
  if (!recommendationEvent?.payload || !analysisRow || !decision?.decisionPointId) return null;
  const evaluatedDecision = policyRuntime ? replayShadowDecision({ trace: decision, runtime: policyRuntime }) || decision : decision;
  const baselineActionId = sanitizeSlug(evaluatedDecision?.defaultActionId || "", 120);
  const shadowActionId = resolveShadowActionId(evaluatedDecision);
  const candidateScores = toArray(evaluatedDecision?.candidateScores);
  const baselineCandidate = candidateScores.find((candidate) => sanitizeSlug(candidate?.actionId || "", 120) === baselineActionId) || null;
  const shadowCandidate = candidateScores.find((candidate) => sanitizeSlug(candidate?.actionId || "", 120) === shadowActionId) || null;
  const confidenceScore = Number(shadowCandidate?.confidenceScore || 0);
  const effectLift = roundTo(Number(shadowCandidate?.evidenceEffectSize || 0) - Number(baselineCandidate?.evidenceEffectSize || 0), 4);
  const confidenceWeightedLift = roundTo(effectLift * (confidenceScore / 100), 4);
  const scoreLift = roundTo(Number(shadowCandidate?.score || 0) - Number(baselineCandidate?.score || 0), 4);
  const agreement = !shadowActionId || shadowActionId === baselineActionId;
  const divergence = Boolean(shadowActionId) && shadowActionId !== baselineActionId;
  return {
    rowId: `${sanitizeText(analysisRow?.recommendationJoinKey || "", 160)}__${sanitizeSlug(evaluatedDecision?.decisionPointId || "", 80)}`,
    analysisActorId: sanitizeText(analysisRow?.analysisActorId || "", 120),
    recommendationJoinKey: sanitizeText(analysisRow?.recommendationJoinKey || "", 160),
    decisionPointId: sanitizeSlug(evaluatedDecision?.decisionPointId || "", 80),
    evaluationSource: policyRuntime ? "replay" : "logged_shadow",
    runtimeMode: sanitizeSlug(evaluatedDecision?.runtimeMode || evaluatedDecision?.mode || "", 40),
    decisionMode: sanitizeSlug(evaluatedDecision?.decisionMode || evaluatedDecision?.mode || "", 40),
    baselineActionId,
    shadowActionId,
    agreement,
    divergence,
    fallbackReason: sanitizeSlug(evaluatedDecision?.fallbackReason || "", 80),
    confidenceScore,
    confidenceBand: resolveConfidenceBand(confidenceScore),
    sampleSize: Number(shadowCandidate?.sampleSize || 0),
    estimatedEffectLift: effectLift,
    estimatedBenefit: Math.max(0, confidenceWeightedLift),
    potentialHarm: Math.max(0, -confidenceWeightedLift),
    scoreLift,
    actualCompositeSuccess: analysisRow?.compositeSuccessScore ?? null,
    actualImmediateSuccess: analysisRow?.immediateOutcome?.score ?? null,
    actualPainRate: analysisRow?.immediateOutcome?.painRate ?? 0,
    actualFrustrationRate: toArray(analysisRow?.immediateOutcome?.frustrationSignals).length > 0 ? 1 : 0,
    successBucket: sanitizeSlug(analysisRow?.successBucket || "", 40),
    primaryGoalCategory: sanitizeSlug(analysisRow?.primaryGoalCategory || "", 60),
    experienceLevel: sanitizeSlug(analysisRow?.experienceLevel || "", 40),
    planArchetypeId: sanitizeSlug(analysisRow?.planArchetypeId || "", 80),
    scheduleReliability: sanitizeSlug(analysisRow?.scheduleReliability || "", 40),
    travelHeavy: Boolean(analysisRow?.travelHeavy),
    hybridAthlete: Boolean(analysisRow?.hybridAthlete),
    hybridMeaningful: Boolean(analysisRow?.hybridMeaningful),
    hybridCohort: sanitizeSlug(analysisRow?.hybridCohort || "", 60),
    hybridHardDayBand: sanitizeSlug(analysisRow?.hybridHardDayBand || "", 40),
    hybridRunBuildPhase: sanitizeSlug(analysisRow?.hybridRunBuildPhase || "", 40),
    hybridSuccessLabel: sanitizeSlug(analysisRow?.hybridSuccessLabel || "", 80),
    hybridFailureLabel: sanitizeSlug(analysisRow?.hybridFailureLabel || "", 80),
    recommendationKind: sanitizeSlug(analysisRow?.recommendationKind || "", 80),
    sourceSurface: sanitizeSlug(analysisRow?.sourceSurface || "", 60),
    holdoutBucket: buildHoldoutBucket({
      analysisActorId: analysisRow?.analysisActorId || "",
      recommendationJoinKey: analysisRow?.recommendationJoinKey || "",
      decisionPointId: evaluatedDecision?.decisionPointId || "",
      holdoutPercentage,
    }),
    explanation: sanitizeText(evaluatedDecision?.explanation || "", 240),
  };
};

const buildMetrics = (rows = []) => {
  const safeRows = toArray(rows);
  return {
    rowCount: safeRows.length,
    agreementRate: average(safeRows.map((row) => row.agreement ? 1 : 0)) ?? 0,
    divergenceRate: average(safeRows.map((row) => row.divergence ? 1 : 0)) ?? 0,
    averageConfidence: average(safeRows.map((row) => row.confidenceScore)) ?? 0,
    highConfidenceRate: average(safeRows.map((row) => row.confidenceBand === "high" ? 1 : 0)) ?? 0,
    lowConfidenceRate: average(safeRows.map((row) => row.confidenceBand === "low" ? 1 : 0)) ?? 0,
    actualCompositeSuccessAverage: average(safeRows.map((row) => row.actualCompositeSuccess)) ?? 0,
    actualImmediateSuccessAverage: average(safeRows.map((row) => row.actualImmediateSuccess)) ?? 0,
    actualPainRate: average(safeRows.map((row) => row.actualPainRate)) ?? 0,
    actualFrustrationRate: average(safeRows.map((row) => row.actualFrustrationRate)) ?? 0,
    estimatedBenefitAverage: average(safeRows.map((row) => row.estimatedBenefit)) ?? 0,
    potentialHarmAverage: average(safeRows.map((row) => row.potentialHarm)) ?? 0,
    uncertaintyAverage: average(safeRows.map((row) => 1 - (Number(row.confidenceScore || 0) / 100))) ?? 0,
  };
};

const groupRows = (rows = [], keyFn = () => "", labelFn = (key) => key) => (
  [...toArray(rows).reduce((map, row) => {
    const key = String(keyFn(row) || "").trim();
    if (!key) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map()).entries()].map(([key, groupedRows]) => ({
    id: key,
    label: labelFn(key, groupedRows),
    rows: groupedRows,
    ...buildMetrics(groupedRows),
  }))
);

const buildDecisionPointSummary = (rows = []) => sortByScoreThenSample(
  groupRows(
    rows,
    (row) => row?.decisionPointId,
    (key) => humanizeEnum(key)
  ).map((entry) => ({
    ...entry,
    score: roundTo(entry.estimatedBenefitAverage - entry.potentialHarmAverage, 4),
  })),
  { scoreKey: "score", sampleKey: "rowCount" }
);

const buildCohortSummaries = (rows = [], minSampleSize = DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE) => sortByScoreThenSample(
  groupRows(
    rows,
    (row) => [row?.decisionPointId, row?.primaryGoalCategory, row?.experienceLevel, row?.scheduleReliability || "general"].join("__"),
    (key) => {
      const [decisionPointId, primaryGoalCategory, experienceLevel, scheduleReliability] = String(key || "").split("__");
      return `${humanizeEnum(decisionPointId)} for ${humanizeEnum(experienceLevel)} ${humanizeEnum(primaryGoalCategory)} users with ${humanizeEnum(scheduleReliability)} schedules`;
    }
  )
    .filter((entry) => entry.rowCount >= minSampleSize)
    .map((entry) => ({
      ...entry,
      score: roundTo(entry.estimatedBenefitAverage - entry.potentialHarmAverage, 4),
    })),
  { scoreKey: "score", sampleKey: "rowCount" }
);

const buildHybridDecisionPointSummaries = (rows = []) => buildDecisionPointSummary(
  toArray(rows).filter((row) => row?.hybridMeaningful && HYBRID_VERTICAL_SLICE_DECISION_IDS.has(String(row?.decisionPointId || "")))
);

const buildHybridCohortSummaries = (rows = [], minSampleSize = DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE) => sortByScoreThenSample(
  groupRows(
    toArray(rows).filter((row) => row?.hybridMeaningful && HYBRID_VERTICAL_SLICE_DECISION_IDS.has(String(row?.decisionPointId || ""))),
    (row) => row?.hybridCohort || "",
    (key) => `${humanizeEnum(key)}`
  )
    .filter((entry) => entry.rowCount >= minSampleSize)
    .map((entry) => ({
      ...entry,
      score: roundTo(entry.estimatedBenefitAverage - entry.potentialHarmAverage, 4),
    })),
  { scoreKey: "score", sampleKey: "rowCount" }
);

const buildHybridOutcomeLabelSummaries = (rows = [], minSampleSize = 1) => sortByScoreThenSample(
  groupRows(
    toArray(rows).filter((row) => row?.hybridMeaningful && HYBRID_VERTICAL_SLICE_DECISION_IDS.has(String(row?.decisionPointId || ""))),
    (row) => row?.hybridFailureLabel || row?.hybridSuccessLabel || "",
    (key) => humanizeEnum(key)
  )
    .filter((entry) => entry.rowCount >= minSampleSize)
    .map((entry) => ({
      ...entry,
      score: roundTo(entry.estimatedBenefitAverage - entry.potentialHarmAverage, 4),
    })),
  { scoreKey: "score", sampleKey: "rowCount" }
);

const buildFlaggedCohorts = ({ cohortSummaries = [] } = {}) => ({
  harmful: cohortSummaries.filter((entry) => entry.potentialHarmAverage > 0.01 || (entry.divergenceRate > 0.2 && entry.actualCompositeSuccessAverage >= 0.72 && entry.averageConfidence < 55)),
  underpowered: cohortSummaries.filter((entry) => entry.averageConfidence < 45 || entry.rowCount < DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE || Math.abs((entry.estimatedBenefitAverage || 0) - (entry.potentialHarmAverage || 0)) < 0.005),
});

const buildPromotionChecklist = ({
  decisionPointSummaries = [],
  cohortFlags = { harmful: [], underpowered: [] },
  holdoutRows = [],
  promotionThresholds = DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS,
} = {}) => decisionPointSummaries.map((entry) => {
  const pointHoldoutRows = holdoutRows.filter((row) => row.decisionPointId === entry.id);
  const evaluationRows = pointHoldoutRows.length ? pointHoldoutRows : [];
  const evaluationMetrics = buildMetrics(evaluationRows.length ? evaluationRows : []);
  const effectiveMetrics = pointHoldoutRows.length ? evaluationMetrics : entry;
  const harmfulCohortCount = cohortFlags.harmful.filter((cohort) => String(cohort.id || "").startsWith(`${entry.id}__`)).length;
  const underpoweredCohortCount = cohortFlags.underpowered.filter((cohort) => String(cohort.id || "").startsWith(`${entry.id}__`)).length;
  const checks = [
    {
      id: "sample_size",
      label: "Enough evaluation rows",
      passed: entry.rowCount >= promotionThresholds.minRows,
      detail: `${entry.rowCount} rows`,
    },
    {
      id: "holdout_size",
      label: "Enough holdout rows",
      passed: pointHoldoutRows.length >= promotionThresholds.minHoldoutRows || pointHoldoutRows.length === 0,
      detail: `${pointHoldoutRows.length} holdout rows`,
    },
    {
      id: "benefit_signal",
      label: "Estimated benefit clears threshold",
      passed: Number(effectiveMetrics.estimatedBenefitAverage || 0) >= promotionThresholds.minEstimatedBenefit,
      detail: `estimated benefit ${roundTo(effectiveMetrics.estimatedBenefitAverage || 0, 4)}`,
    },
    {
      id: "harm_guardrail",
      label: "Potential harm stays below threshold",
      passed: Number(effectiveMetrics.potentialHarmAverage || 0) <= promotionThresholds.maxPotentialHarm,
      detail: `potential harm ${roundTo(effectiveMetrics.potentialHarmAverage || 0, 4)}`,
    },
    {
      id: "confidence",
      label: "Average confidence is high enough",
      passed: Number(effectiveMetrics.averageConfidence || 0) >= promotionThresholds.minAverageConfidence,
      detail: `avg confidence ${roundTo(effectiveMetrics.averageConfidence || 0, 2)}`,
    },
    {
      id: "divergence_guardrail",
      label: "Divergence stays bounded",
      passed: Number(effectiveMetrics.divergenceRate || 0) <= promotionThresholds.maxDivergenceRate,
      detail: `divergence ${roundTo(effectiveMetrics.divergenceRate || 0, 4)}`,
    },
    {
      id: "harmful_cohorts",
      label: "No flagged harmful cohorts",
      passed: harmfulCohortCount === 0,
      detail: `${harmfulCohortCount} harmful cohorts`,
    },
  ];
  return {
    decisionPointId: entry.id,
    label: entry.label,
    status: checks.every((check) => check.passed) && underpoweredCohortCount === 0 ? "eligible_for_active_rollout" : "keep_in_shadow",
    checks,
    harmfulCohortCount,
    underpoweredCohortCount,
  };
});

export const buildAdaptivePolicyShadowEvaluation = ({
  sources = [],
  adaptivePolicyConfig = null,
  adaptivePolicyEvidence = null,
  holdoutPercentage = DEFAULT_ADAPTIVE_POLICY_SHADOW_HOLDOUT_PERCENTAGE,
  minCohortSampleSize = DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE,
  promotionThresholds = DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS,
  evaluationLabel = "adaptive_policy_shadow_evaluation",
} = {}) => {
  const extraction = extractAdaptiveLearningEvents({ sources });
  const analysisRows = buildAdaptiveLearningAnalysisRows({ events: extraction.events });
  const policyRuntime = adaptivePolicyConfig || adaptivePolicyEvidence
    ? resolveAdaptivePolicyRuntime({
      adaptivePolicyConfig,
      adaptivePolicyEvidence,
    })
    : null;
  const analysisRowByJoinKey = new Map(analysisRows.map((row) => [row.recommendationJoinKey, row]));
  const decisionRows = extraction.events
    .filter((event) => event?.eventName === ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated)
    .flatMap((event) => {
      const recommendationJoinKey = sanitizeText(event?.payload?.recommendationJoinKey || "", 160);
      const analysisRow = analysisRowByJoinKey.get(recommendationJoinKey);
      if (!analysisRow) return [];
      return extractShadowDecisions(event?.payload || {}).map((decision) => buildDecisionRow({
        recommendationEvent: event,
        analysisRow,
        decision,
        policyRuntime,
        holdoutPercentage,
      })).filter(Boolean);
    });
  const holdoutRows = decisionRows.filter((row) => row.holdoutBucket === "holdout");
  const analysisBucketRows = decisionRows.filter((row) => row.holdoutBucket === "analysis");
  const decisionPointSummaries = buildDecisionPointSummary(decisionRows);
  const cohortSummaries = buildCohortSummaries(decisionRows, minCohortSampleSize);
  const cohortFlags = buildFlaggedCohorts({ cohortSummaries });
  const hybridDecisionPointSummaries = buildHybridDecisionPointSummaries(decisionRows);
  const hybridCohortSummaries = buildHybridCohortSummaries(decisionRows, minCohortSampleSize);
  const hybridOutcomeLabelSummaries = buildHybridOutcomeLabelSummaries(decisionRows);
  const hybridCohortFlags = buildFlaggedCohorts({ cohortSummaries: hybridCohortSummaries });
  const thresholds = sanitizePromotionThresholds(promotionThresholds);
  const promotionChecklist = buildPromotionChecklist({
    decisionPointSummaries,
    cohortFlags,
    holdoutRows,
    promotionThresholds: thresholds,
  });
  return {
    evaluationLabel: sanitizeText(evaluationLabel, 160) || "adaptive_policy_shadow_evaluation",
    extractionSummary: extraction.summary,
    discarded: extraction.discarded,
    analysisRowCount: analysisRows.length,
    promotionThresholds: thresholds,
    decisionRows,
    summary: {
      evaluationLabel: sanitizeText(evaluationLabel, 160) || "adaptive_policy_shadow_evaluation",
      decisionRowCount: decisionRows.length,
      holdoutRowCount: holdoutRows.length,
      analysisBucketRowCount: analysisBucketRows.length,
      ...buildMetrics(decisionRows),
    },
    holdoutSummary: buildMetrics(holdoutRows),
    analysisBucketSummary: buildMetrics(analysisBucketRows),
    decisionPointSummaries,
    cohortSummaries,
    hybridSummary: {
      rowCount: decisionRows.filter((row) => row?.hybridMeaningful && HYBRID_VERTICAL_SLICE_DECISION_IDS.has(String(row?.decisionPointId || ""))).length,
      ...buildMetrics(decisionRows.filter((row) => row?.hybridMeaningful && HYBRID_VERTICAL_SLICE_DECISION_IDS.has(String(row?.decisionPointId || "")))),
    },
    hybridDecisionPointSummaries,
    hybridCohortSummaries,
    hybridOutcomeLabelSummaries,
    hybridHarmfulCohorts: hybridCohortFlags.harmful,
    hybridUnderpoweredCohorts: hybridCohortFlags.underpowered,
    harmfulCohorts: cohortFlags.harmful,
    underpoweredCohorts: cohortFlags.underpowered,
    confidenceBandSummaries: groupRows(
      decisionRows,
      (row) => row?.confidenceBand,
      (key) => `${humanizeEnum(key)} confidence`
    ),
    promotionChecklist,
    replayMode: policyRuntime ? "replay_candidate_policy" : "logged_shadow_policy",
  };
};
