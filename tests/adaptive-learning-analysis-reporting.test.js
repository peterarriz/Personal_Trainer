import test from "node:test";
import assert from "node:assert/strict";

import { buildAdaptiveLearningAnalysisFixtureDataset } from "../src/services/adaptive-learning-analysis-fixture-service.js";
import { runAdaptiveLearningAnalysis } from "../src/services/adaptive-learning-analysis-service.js";

test("adaptive learning analysis artifacts stay deterministic for the same fixture input", () => {
  const fixture = buildAdaptiveLearningAnalysisFixtureDataset();
  const first = runAdaptiveLearningAnalysis({
    sources: fixture.sources,
    analysisLabel: "deterministic_fixture",
  });
  const second = runAdaptiveLearningAnalysis({
    sources: fixture.sources,
    analysisLabel: "deterministic_fixture",
  });

  assert.equal(first.artifacts.resultsJson, second.artifacts.resultsJson);
  assert.equal(first.artifacts.candidatePolicySuggestionsJson, second.artifacts.candidatePolicySuggestionsJson);
  assert.equal(first.artifacts.failureClustersJson, second.artifacts.failureClustersJson);
  assert.match(first.artifacts.analysisReportMarkdown, /# Adaptive Learning Analysis Report/);
  assert.match(first.artifacts.analysisReportMarkdown, /## High-Confidence Candidate Policies/);
  assert.match(first.artifacts.analysisReportMarkdown, /## Failure Clusters/);
});
