import test from "node:test";
import assert from "node:assert/strict";

import { buildAdaptiveLearningAnalysisFixtureDataset } from "../src/services/adaptive-learning-analysis-fixture-service.js";
import { runAdaptiveLearningAnalysis } from "../src/services/adaptive-learning-analysis-service.js";

test("adaptive learning analysis pipeline produces cohort summaries, failure clusters, and candidate policy suggestions from the fixture matrix", () => {
  const fixture = buildAdaptiveLearningAnalysisFixtureDataset();
  const results = runAdaptiveLearningAnalysis({
    sources: fixture.sources,
    analysisLabel: "fixture_regression",
  });

  assert.equal(results.summary.actorCount, fixture.actorCount);
  assert.equal(results.summary.recommendationRowCount, fixture.actorCount * 3);
  assert.ok(results.questionFamilyInsights.runRampTolerance.length >= 2);
  assert.ok(results.questionFamilyInsights.travelSubstitutions.length >= 2);
  assert.ok(results.questionFamilyInsights.deloadTiming.length >= 2);
  assert.ok(results.recommendationSuccessRates.byKind.length >= 3);
  assert.ok(results.failureClusters.length > 0);
  assert.ok(results.commonTraits.failedPlanTraits.length > 0);
  assert.ok(results.commonTraits.successfulPlanTraits.length > 0);
  const allCandidateSummaries = [
    ...results.candidatePolicySuggestions.highConfidence,
    ...results.candidatePolicySuggestions.mediumConfidence,
    ...results.candidatePolicySuggestions.lowConfidence,
  ].map((rule) => rule.summary);
  assert.ok(results.candidatePolicySuggestions.highConfidence.length > 0);
  assert.ok(allCandidateSummaries.some((summary) => /travel-heavy users|deload|nutrition|coach|hybrid/i.test(summary)));
});

test("adaptive learning analysis suppresses strong policy claims when the sample is too small", () => {
  const fixture = buildAdaptiveLearningAnalysisFixtureDataset();
  const tinySources = fixture.sources.slice(0, 4);
  const results = runAdaptiveLearningAnalysis({
    sources: tinySources,
    analysisLabel: "tiny_sample",
    minSampleSize: 2,
    minPolicySampleSize: 6,
  });

  assert.equal(results.summary.actorCount, 4);
  assert.equal(results.candidatePolicySuggestions.highConfidence.length, 0);
});
