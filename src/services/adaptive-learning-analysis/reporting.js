import {
  humanizeEnum,
  roundTo,
  stableStringify,
  toArray,
} from "./shared.js";

const formatPercent = (value = null) => value == null ? "n/a" : `${Math.round(Number(value || 0) * 100)}%`;
const formatScore = (value = null) => value == null ? "n/a" : `${Math.round(Number(value || 0) * 100)} / 100`;

const buildTopList = (items = [], {
  max = 6,
  render = () => "",
} = {}) => toArray(items).slice(0, max).map(render).filter(Boolean);

const buildSummaryMarkdown = (results = {}) => {
  const topRules = toArray(results?.candidatePolicySuggestions?.highConfidence || []).slice(0, 8);
  const failureClusters = toArray(results?.failureClusters || []).slice(0, 8);
  const cohortSummaries = toArray(results?.cohortSummaries || []).slice(0, 8);
  const successfulTraits = toArray(results?.commonTraits?.successfulPlanTraits || []).slice(0, 6);
  const failedTraits = toArray(results?.commonTraits?.failedPlanTraits || []).slice(0, 6);

  return [
    "# Adaptive Learning Analysis Report",
    "",
    "## Overview",
    "",
    `- Analysis label: ${results?.summary?.analysisLabel || "offline_run"}`,
    `- Input sources: ${results?.summary?.sourceCount || 0}`,
    `- Normalized events: ${results?.summary?.eventCount || 0}`,
    `- Recommendation rows: ${results?.summary?.recommendationRowCount || 0}`,
    `- Actors analyzed: ${results?.summary?.actorCount || 0}`,
    `- Distinct recommendation kinds: ${(results?.summary?.recommendationKinds || []).join(", ") || "none"}`,
    "",
    "## Coverage",
    "",
    `- Immediate outcome coverage: ${formatPercent(results?.summary?.immediateCoverage)}`,
    `- Short-term window coverage: ${formatPercent(results?.summary?.shortCoverage)}`,
    `- Medium-term window coverage: ${formatPercent(results?.summary?.mediumCoverage)}`,
    `- Average composite success: ${formatScore(results?.summary?.averageCompositeSuccess)}`,
    "",
    "## High-Confidence Candidate Policies",
    "",
    ...(topRules.length
      ? topRules.map((rule, index) => `${index + 1}. ${rule.summary} Sample: ${rule.sampleSize}. Confidence: ${rule.confidenceScore}.`)
      : ["- No high-confidence candidate policies met the current thresholds."]),
    "",
    "## Failure Clusters",
    "",
    ...(failureClusters.length
      ? failureClusters.map((cluster) => `- ${cluster.humanSummary} Confidence: ${cluster.confidenceScore}.`)
      : ["- No failure clusters met the current thresholds."]),
    "",
    "## Cohort Summaries",
    "",
    ...(cohortSummaries.length
      ? cohortSummaries.map((cohort) => `- ${cohort.label}: sample ${cohort.sampleSize}, composite success ${formatPercent(cohort.compositeSuccessAverage)}, failure rate ${formatPercent(cohort.failureRate)}.`)
      : ["- No cohort summaries met the current thresholds."]),
    "",
    "## Common Traits In Successful Plans",
    "",
    ...(successfulTraits.length
      ? successfulTraits.map((trait) => `- ${humanizeEnum(trait.token.split(":")[1] || trait.token)} appears more often in successful rows. Sample: ${trait.sampleSize}.`)
      : ["- No stable positive traits met the minimum sample size."]),
    "",
    "## Common Traits In Failed Plans",
    "",
    ...(failedTraits.length
      ? failedTraits.map((trait) => `- ${humanizeEnum(trait.token.split(":")[1] || trait.token)} appears more often in failed rows. Sample: ${trait.sampleSize}.`)
      : ["- No stable failure traits met the minimum sample size."]),
    "",
    "## Low-Confidence Findings",
    "",
    ...(toArray(results?.candidatePolicySuggestions?.lowConfidence || []).length
      ? buildTopList(results.candidatePolicySuggestions.lowConfidence, {
        max: 8,
        render: (rule) => `- ${rule.summary} Sample: ${rule.sampleSize}. Confidence: ${rule.confidenceScore}.`,
      })
      : ["- No low-confidence findings were retained."]),
    "",
    "## Method Notes",
    "",
    "- This is an offline analysis only. Nothing here changes live prescriptions.",
    "- Recommendation rows link deterministic prescriptions to direct outcomes and later weekly evaluations.",
    "- Confidence is constrained by sample size, effect size, and horizon coverage so tiny cohorts do not overstate certainty.",
    "- Missing fields stay missing. The pipeline only promotes signals that were present in the input events.",
    "",
  ].join("\n");
};

export const buildAdaptiveLearningAnalysisArtifacts = ({
  results = {},
} = {}) => ({
  normalizedEventsJson: stableStringify(results?.normalizedEvents || []),
  analysisRowsJson: stableStringify(results?.analysisRows || []),
  resultsJson: stableStringify({
    summary: results?.summary || {},
    recommendationSuccessRates: results?.recommendationSuccessRates || {},
    questionFamilyInsights: results?.questionFamilyInsights || {},
    commonTraits: results?.commonTraits || {},
    candidatePolicySuggestions: results?.candidatePolicySuggestions || {},
  }),
  candidatePolicySuggestionsJson: stableStringify(results?.candidatePolicySuggestions || {}),
  failureClustersJson: stableStringify(results?.failureClusters || []),
  cohortSummariesJson: stableStringify(results?.cohortSummaries || []),
  analysisReportMarkdown: buildSummaryMarkdown(results),
});
