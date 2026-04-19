import {
  humanizeEnum,
  roundTo,
  stableStringify,
  toArray,
} from "./adaptive-learning-analysis/shared.js";

const formatPercent = (value = null, digits = 0) => {
  if (value == null) return "n/a";
  const scaled = Number(value || 0) * 100;
  return `${scaled.toFixed(digits)}%`;
};

const formatScore = (value = null, digits = 4) => (
  value == null ? "n/a" : roundTo(value, digits)
);

const renderDecisionPointLine = (entry = {}) => (
  `- ${entry.label}: sample ${entry.rowCount}, agreement ${formatPercent(entry.agreementRate)}, divergence ${formatPercent(entry.divergenceRate)}, estimated benefit ${formatScore(entry.estimatedBenefitAverage)}, potential harm ${formatScore(entry.potentialHarmAverage)}.`
);

const renderCohortLine = (entry = {}) => (
  `- ${entry.label}: sample ${entry.rowCount}, confidence ${roundTo(entry.averageConfidence || 0, 1)}, divergence ${formatPercent(entry.divergenceRate)}, estimated benefit ${formatScore(entry.estimatedBenefitAverage)}, potential harm ${formatScore(entry.potentialHarmAverage)}.`
);

const renderChecklistLine = (entry = {}) => (
  `- ${entry.label}: ${humanizeEnum(entry.status || "keep_in_shadow")}. Checks passed ${toArray(entry.checks).filter((check) => check?.passed).length}/${toArray(entry.checks).length}. Harmful cohorts ${entry.harmfulCohortCount || 0}. Underpowered cohorts ${entry.underpoweredCohortCount || 0}.`
);

const buildMarkdown = (results = {}) => {
  const harmfulCohorts = toArray(results?.harmfulCohorts).slice(0, 10);
  const underpoweredCohorts = toArray(results?.underpoweredCohorts).slice(0, 10);
  const hybridDecisionPointSummaries = toArray(results?.hybridDecisionPointSummaries).slice(0, 10);
  const hybridCohortSummaries = toArray(results?.hybridCohortSummaries).slice(0, 10);
  const hybridOutcomeLabelSummaries = toArray(results?.hybridOutcomeLabelSummaries).slice(0, 10);
  const decisionPointSummaries = toArray(results?.decisionPointSummaries).slice(0, 10);
  const promotionChecklist = toArray(results?.promotionChecklist).slice(0, 10);
  const confidenceBandSummaries = toArray(results?.confidenceBandSummaries).slice(0, 6);

  return [
    "# Adaptive Policy Shadow Evaluation",
    "",
    "## Overview",
    "",
    `- Evaluation label: ${results?.summary?.evaluationLabel || results?.evaluationLabel || "adaptive_policy_shadow_evaluation"}`,
    `- Replay mode: ${humanizeEnum(results?.replayMode || "logged_shadow_policy")}`,
    `- Source count: ${results?.extractionSummary?.sourceCount || 0}`,
    `- Recommendation rows: ${results?.analysisRowCount || 0}`,
    `- Shadow decision rows: ${results?.summary?.decisionRowCount || 0}`,
    `- Holdout rows: ${results?.summary?.holdoutRowCount || 0}`,
    "",
    "## Core Metrics",
    "",
    `- Action agreement rate: ${formatPercent(results?.summary?.agreementRate)}`,
    `- Divergence rate: ${formatPercent(results?.summary?.divergenceRate)}`,
    `- Average confidence: ${roundTo(results?.summary?.averageConfidence || 0, 1)}`,
    `- Estimated benefit: ${formatScore(results?.summary?.estimatedBenefitAverage)}`,
    `- Potential harm: ${formatScore(results?.summary?.potentialHarmAverage)}`,
    `- Uncertainty: ${formatPercent(results?.summary?.uncertaintyAverage)}`,
    `- Actual composite success: ${formatPercent(results?.summary?.actualCompositeSuccessAverage)}`,
    `- Actual pain rate: ${formatPercent(results?.summary?.actualPainRate)}`,
    `- Actual frustration rate: ${formatPercent(results?.summary?.actualFrustrationRate)}`,
    "",
    "## Hybrid Vertical Slice",
    "",
    `- Hybrid decision rows: ${results?.hybridSummary?.rowCount || 0}`,
    `- Hybrid agreement rate: ${formatPercent(results?.hybridSummary?.agreementRate)}`,
    `- Hybrid divergence rate: ${formatPercent(results?.hybridSummary?.divergenceRate)}`,
    `- Hybrid estimated benefit: ${formatScore(results?.hybridSummary?.estimatedBenefitAverage)}`,
    `- Hybrid potential harm: ${formatScore(results?.hybridSummary?.potentialHarmAverage)}`,
    "",
    "### Hybrid Decision Points",
    "",
    ...(hybridDecisionPointSummaries.length
      ? hybridDecisionPointSummaries.map(renderDecisionPointLine)
      : ["- No hybrid-specific shadow decisions were available yet."]),
    "",
    "### Hybrid Cohorts",
    "",
    ...(hybridCohortSummaries.length
      ? hybridCohortSummaries.map(renderCohortLine)
      : ["- No hybrid cohort summary crossed the current sample threshold."]),
    "",
    "### Hybrid Outcome Signals",
    "",
    ...(hybridOutcomeLabelSummaries.length
      ? hybridOutcomeLabelSummaries.map((entry) => `- ${entry.label}: sample ${entry.rowCount}, estimated benefit ${formatScore(entry.estimatedBenefitAverage)}, potential harm ${formatScore(entry.potentialHarmAverage)}.`)
      : ["- No hybrid outcome labels were available."]),
    "",
    "## Decision Points",
    "",
    ...(decisionPointSummaries.length
      ? decisionPointSummaries.map(renderDecisionPointLine)
      : ["- No adaptive shadow decisions were available for evaluation."]),
    "",
    "## Confidence Bands",
    "",
    ...(confidenceBandSummaries.length
      ? confidenceBandSummaries.map((entry) => `- ${entry.label}: sample ${entry.rowCount}, divergence ${formatPercent(entry.divergenceRate)}, estimated benefit ${formatScore(entry.estimatedBenefitAverage)}.`)
      : ["- No confidence-band summaries were produced."]),
    "",
    "## Harmful Cohorts",
    "",
    ...(harmfulCohorts.length
      ? harmfulCohorts.map(renderCohortLine)
      : ["- No harmful cohorts crossed the current thresholds."]),
    "",
    "## Underpowered Cohorts",
    "",
    ...(underpoweredCohorts.length
      ? underpoweredCohorts.map(renderCohortLine)
      : ["- No underpowered cohorts were flagged."]),
    "",
    "## Promotion Checklist",
    "",
    ...(promotionChecklist.length
      ? promotionChecklist.map(renderChecklistLine)
      : ["- No decision points were eligible for review."]),
    "",
    "## Operator Notes",
    "",
    "- Shadow mode keeps the deterministic planner in control while still logging what the adaptive layer would have preferred.",
    "- Promotion should stay blocked when harmful cohorts appear, holdout coverage is too small, or confidence stays weak.",
    "- This evaluation is associative and conservative. It is meant to screen policies before activation, not to prove causality.",
    "",
  ].join("\n");
};

export const buildAdaptivePolicyShadowEvaluationArtifacts = ({
  results = {},
} = {}) => ({
  resultsJson: stableStringify({
    evaluationLabel: results?.evaluationLabel || results?.summary?.evaluationLabel || "",
    replayMode: results?.replayMode || "",
    extractionSummary: results?.extractionSummary || {},
    summary: results?.summary || {},
    holdoutSummary: results?.holdoutSummary || {},
    analysisBucketSummary: results?.analysisBucketSummary || {},
    promotionThresholds: results?.promotionThresholds || {},
  }),
  decisionRowsJson: stableStringify(results?.decisionRows || []),
  decisionPointSummariesJson: stableStringify(results?.decisionPointSummaries || []),
  cohortSummariesJson: stableStringify(results?.cohortSummaries || []),
  hybridDecisionPointSummariesJson: stableStringify(results?.hybridDecisionPointSummaries || []),
  hybridCohortSummariesJson: stableStringify(results?.hybridCohortSummaries || []),
  hybridOutcomeLabelSummariesJson: stableStringify(results?.hybridOutcomeLabelSummaries || []),
  harmfulCohortsJson: stableStringify(results?.harmfulCohorts || []),
  underpoweredCohortsJson: stableStringify(results?.underpoweredCohorts || []),
  confidenceBandSummariesJson: stableStringify(results?.confidenceBandSummaries || []),
  promotionChecklistJson: stableStringify(results?.promotionChecklist || []),
  shadowEvaluationReportMarkdown: buildMarkdown(results),
});
