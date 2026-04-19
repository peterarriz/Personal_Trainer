import { extractAdaptiveLearningEvents } from "./adaptive-learning-analysis/extraction.js";
import { buildAdaptiveLearningAnalysisRows } from "./adaptive-learning-analysis/feature-engineering.js";
import {
  buildCandidatePolicySuggestions,
  buildCohortSummaries,
  buildCommonTraitSummaries,
  buildFailureClusters,
  buildQuestionFamilyInsights,
  buildRecommendationSuccessRates,
} from "./adaptive-learning-analysis/insight-mining.js";
import { buildAdaptiveLearningAnalysisArtifacts } from "./adaptive-learning-analysis/reporting.js";
import { average, toArray } from "./adaptive-learning-analysis/shared.js";

export const DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS = Object.freeze({
  shortWindowDays: 14,
  mediumWindowDays: 56,
  baselineWindowDays: 28,
  minSampleSize: 4,
  minPolicySampleSize: 6,
  analysisLabel: "offline_adaptive_learning_analysis",
});

export const runAdaptiveLearningAnalysis = ({
  sources = [],
  shortWindowDays = DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS.shortWindowDays,
  mediumWindowDays = DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS.mediumWindowDays,
  baselineWindowDays = DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS.baselineWindowDays,
  minSampleSize = DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS.minSampleSize,
  minPolicySampleSize = DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS.minPolicySampleSize,
  analysisLabel = DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS.analysisLabel,
} = {}) => {
  const extracted = extractAdaptiveLearningEvents({ sources });
  const analysisRows = buildAdaptiveLearningAnalysisRows({
    events: extracted.events,
    shortWindowDays,
    mediumWindowDays,
    baselineWindowDays,
  });
  const cohortSummaries = buildCohortSummaries({
    rows: analysisRows,
    minSampleSize,
  });
  const recommendationSuccessRates = buildRecommendationSuccessRates({
    rows: analysisRows,
    minSampleSize,
  });
  const questionFamilyInsights = buildQuestionFamilyInsights({
    rows: analysisRows,
    minSampleSize,
  });
  const commonTraits = buildCommonTraitSummaries({
    rows: analysisRows,
    minSampleSize,
  });
  const failureClusters = buildFailureClusters({
    rows: analysisRows,
    minSampleSize,
  });
  const candidatePolicySuggestions = buildCandidatePolicySuggestions({
    questionFamilyInsights,
    minSampleSize: minPolicySampleSize,
  });

  const summary = {
    analysisLabel,
    sourceCount: extracted.summary.sourceCount,
    actorCount: extracted.summary.actorCount,
    eventCount: extracted.summary.eventCount,
    recommendationRowCount: analysisRows.length,
    immediateCoverage: average(analysisRows.map((row) => row?.immediateOutcome?.hasOutcome ? 1 : 0)) || 0,
    shortCoverage: average(analysisRows.map((row) => (row?.shortTermOutcome?.count || 0) > 0 ? 1 : 0)) || 0,
    mediumCoverage: average(analysisRows.map((row) => (row?.mediumTermOutcome?.count || 0) > 0 ? 1 : 0)) || 0,
    averageCompositeSuccess: average(analysisRows.map((row) => row?.compositeSuccessScore)) || 0,
    discardedEventCount: extracted.summary.discardedCount,
    recommendationKinds: [...new Set(analysisRows.map((row) => row?.recommendationKind).filter(Boolean))].sort(),
    highConfidenceRuleCount: toArray(candidatePolicySuggestions?.highConfidence).length,
    mediumConfidenceRuleCount: toArray(candidatePolicySuggestions?.mediumConfidence).length,
    lowConfidenceRuleCount: toArray(candidatePolicySuggestions?.lowConfidence).length,
  };

  const results = {
    summary,
    normalizedEvents: extracted.events,
    discardedEvents: extracted.discarded,
    analysisRows,
    cohortSummaries,
    recommendationSuccessRates,
    questionFamilyInsights,
    commonTraits,
    failureClusters,
    candidatePolicySuggestions,
  };

  return {
    ...results,
    artifacts: buildAdaptiveLearningAnalysisArtifacts({ results }),
  };
};

export { buildAdaptiveLearningAnalysisArtifacts };
