import test from "node:test";
import assert from "node:assert/strict";

import { buildAdaptivePolicyShadowEvaluationFixtureDataset } from "../src/services/adaptive-policy-shadow-evaluation-fixture-service.js";
import { buildAdaptivePolicyShadowEvaluation } from "../src/services/adaptive-policy-shadow-evaluation-service.js";
import { ADAPTIVE_POLICY_DECISION_POINTS } from "../src/services/adaptive-policy-service.js";

test("adaptive policy shadow evaluation summarizes logged shadow decisions by decision point and cohort", () => {
  const fixture = buildAdaptivePolicyShadowEvaluationFixtureDataset();
  const results = buildAdaptivePolicyShadowEvaluation({
    sources: fixture.sources,
    evaluationLabel: "shadow_fixture_regression",
  });

  assert.equal(results.summary.decisionRowCount, fixture.actorCount);
  assert.equal(results.replayMode, "logged_shadow_policy");
  assert.ok(results.summary.averageConfidence > 60);
  assert.ok(results.decisionPointSummaries.some((entry) => entry.id === ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id));
  assert.ok(results.decisionPointSummaries.some((entry) => entry.id === ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id && entry.estimatedBenefitAverage > 0.05));
  assert.ok(results.harmfulCohorts.some((entry) => entry.id.startsWith(ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id)));
  assert.ok(results.hybridSummary.rowCount > 0);
  assert.ok(results.hybridDecisionPointSummaries.some((entry) => entry.id === ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id));
  assert.ok(results.hybridDecisionPointSummaries.some((entry) => entry.id === ADAPTIVE_POLICY_DECISION_POINTS.hybridDeloadTimingWindow.id));
  assert.ok(results.hybridOutcomeLabelSummaries.some((entry) => entry.id === "hybrid_split_session_success"));
  assert.ok(results.hybridCohortSummaries.some((entry) => entry.id === "beginner_hybrid"));
  assert.ok(results.hybridCohortSummaries.some((entry) => entry.id === "fat_loss_hybrid"));
  assert.ok(results.hybridCohortSummaries.some((entry) => entry.id === "performance_hybrid"));
  assert.ok(results.hybridCohortSummaries.some((entry) => entry.id === "travel_heavy_hybrid"));
  assert.ok(results.hybridCohortSummaries.some((entry) => entry.id === "inconsistent_schedule_hybrid"));
  assert.ok(results.promotionChecklist.length >= 3);
});

test("adaptive policy shadow evaluation can replay a candidate policy without crashing on missing data", () => {
  const fixture = buildAdaptivePolicyShadowEvaluationFixtureDataset();
  const results = buildAdaptivePolicyShadowEvaluation({
    sources: [
      ...fixture.sources,
      {
        sourceId: "invalid_bundle",
        sourceType: "fixture_noise",
        events: [{ eventName: "broken.event", payload: {} }],
      },
    ],
    adaptivePolicyConfig: fixture.adaptivePolicyConfig,
    adaptivePolicyEvidence: fixture.adaptivePolicyEvidence,
    evaluationLabel: "shadow_fixture_replay",
  });

  assert.equal(results.replayMode, "replay_candidate_policy");
  assert.ok(results.discarded.length >= 1);
  assert.equal(results.summary.decisionRowCount, fixture.actorCount);
  assert.ok(results.summary.averageConfidence > 60);
  const replayRow = results.decisionRows.find((row) => row.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id);
  assert.equal(replayRow?.evaluationSource, "replay");
  assert.equal(replayRow?.baselineActionId, "default_substitutions");
  assert.equal(replayRow?.shadowActionId, "minimal_equipment_substitutions");
});
