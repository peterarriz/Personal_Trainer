import test from "node:test";
import assert from "node:assert/strict";

import { buildAdaptivePolicyShadowEvaluationFixtureDataset } from "../src/services/adaptive-policy-shadow-evaluation-fixture-service.js";
import { buildAdaptivePolicyShadowEvaluation } from "../src/services/adaptive-policy-shadow-evaluation-service.js";
import { buildAdaptivePolicyShadowEvaluationArtifacts } from "../src/services/adaptive-policy-shadow-evaluation-reporting.js";

test("adaptive policy shadow evaluation artifacts stay deterministic for the same fixture input", () => {
  const fixture = buildAdaptivePolicyShadowEvaluationFixtureDataset();
  const first = buildAdaptivePolicyShadowEvaluation({
    sources: fixture.sources,
    evaluationLabel: "shadow_artifact_fixture",
  });
  const second = buildAdaptivePolicyShadowEvaluation({
    sources: fixture.sources,
    evaluationLabel: "shadow_artifact_fixture",
  });

  const firstArtifacts = buildAdaptivePolicyShadowEvaluationArtifacts({ results: first });
  const secondArtifacts = buildAdaptivePolicyShadowEvaluationArtifacts({ results: second });

  assert.equal(firstArtifacts.resultsJson, secondArtifacts.resultsJson);
  assert.equal(firstArtifacts.decisionPointSummariesJson, secondArtifacts.decisionPointSummariesJson);
  assert.equal(firstArtifacts.promotionChecklistJson, secondArtifacts.promotionChecklistJson);
  assert.equal(firstArtifacts.hybridCohortSummariesJson, secondArtifacts.hybridCohortSummariesJson);
  assert.match(firstArtifacts.shadowEvaluationReportMarkdown, /# Adaptive Policy Shadow Evaluation/);
  assert.match(firstArtifacts.shadowEvaluationReportMarkdown, /## Core Metrics/);
  assert.match(firstArtifacts.shadowEvaluationReportMarkdown, /## Hybrid Vertical Slice/);
  assert.match(firstArtifacts.shadowEvaluationReportMarkdown, /### Hybrid Cohorts/);
  assert.match(firstArtifacts.shadowEvaluationReportMarkdown, /## Promotion Checklist/);
});
