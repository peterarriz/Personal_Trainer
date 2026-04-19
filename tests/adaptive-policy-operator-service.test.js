import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdaptiveDiagnosticsPanelModel,
  buildAdaptiveLaunchReadinessArtifacts,
  buildAdaptiveLaunchReadinessCheck,
  buildAdaptivePolicyPromotionBundle,
  buildAdaptivePromotionArtifacts,
} from "../src/services/adaptive-policy-operator-service.js";

test("adaptive diagnostics panel stays hidden unless trusted local debug and the adaptive diagnostics flag are both on", () => {
  const hidden = buildAdaptiveDiagnosticsPanelModel({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: true,
          mode: "shadow",
          internalDiagnostics: false,
        },
      },
    },
    trustedLocalDebug: true,
  });
  const hiddenWithoutTrustedLocal = buildAdaptiveDiagnosticsPanelModel({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: true,
          mode: "shadow",
          internalDiagnostics: true,
        },
      },
    },
    trustedLocalDebug: false,
  });
  const visible = buildAdaptiveDiagnosticsPanelModel({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: true,
          mode: "shadow",
          internalDiagnostics: true,
        },
      },
    },
    adaptiveLearningSnapshot: {
      events: [{ eventId: "one" }, { eventId: "two" }],
      pendingEventIds: ["two"],
    },
    planComposer: {
      adaptivePolicyTraces: [
        {
          decisionPointId: "time_crunched_session_format_choice",
          fallbackReason: "shadow_mode",
          shadowTopActionId: "short_separate_sessions",
        },
      ],
    },
    trustedLocalDebug: true,
  });

  assert.equal(hidden.visible, false);
  assert.equal(hiddenWithoutTrustedLocal.visible, false);
  assert.equal(visible.visible, true);
  assert.equal(visible.cards.some((card) => card.id === "event_buffer"), true);
  assert.equal(visible.registryRows.length > 0, true);
  assert.equal(visible.commandHints.some((entry) => /launch-readiness/i.test(entry.command)), true);
});

test("adaptive policy promotion bundle only promotes decision points that pass the shadow gate and have evidence", () => {
  const bundle = buildAdaptivePolicyPromotionBundle({
    analysisResults: {
      candidatePolicySuggestions: {
        highConfidence: [
          {
            id: "travel_rule",
            family: "travelSubstitutions",
            betterLabel: "Minimal-equipment substitutions",
            summary: "Travel-heavy users adhered better with minimal-equipment substitutions.",
            sampleSize: 18,
            confidenceScore: 84,
            effectSize: 0.08,
          },
        ],
        mediumConfidence: [],
      },
    },
    shadowEvaluationResults: {
      promotionChecklist: [
        {
          decisionPointId: "travel_substitution_set",
          status: "eligible_for_active_rollout",
        },
        {
          decisionPointId: "progression_aggressiveness_band",
          status: "keep_in_shadow",
        },
      ],
    },
    decisionPointIds: ["travel_substitution_set", "progression_aggressiveness_band"],
  });

  assert.deepEqual(bundle.promotedDecisionPointIds, ["travel_substitution_set"]);
  assert.equal(bundle.evidenceSnapshot.rules.length, 1);
  assert.equal(bundle.shadowConfig.globalEnable, true);
  assert.equal(bundle.shadowConfig.decisionPoints.travel_substitution_set.rolloutMode, "shadow");
  assert.equal(bundle.activeConfig.decisionPoints.travel_substitution_set.rolloutMode, "active");
  assert.equal(bundle.blocked.some((entry) => entry.decisionPointId === "progression_aggressiveness_band"), true);
});

test("adaptive launch readiness check keeps activation blocked when harmful cohorts or missing coverage remain", () => {
  const results = buildAdaptiveLaunchReadinessCheck({
    shadowEvaluationResults: {
      summary: {
        decisionRowCount: 18,
        holdoutRowCount: 4,
        averageConfidence: 62,
        divergenceRate: 0.22,
        estimatedBenefitAverage: 0.03,
        potentialHarmAverage: 0.014,
      },
      harmfulCohorts: [{ id: "progression_aggressiveness_band__running__beginner__variable" }],
      underpoweredCohorts: [{ id: "hybrid_run_lift_balance_template__hybrid__advanced__steady" }],
      promotionChecklist: [
        { decisionPointId: "time_crunched_session_format_choice", status: "keep_in_shadow" },
      ],
    },
    minShadowRows: 20,
    minHoldoutRows: 8,
  });

  assert.equal(results.summary.overallStatus, "fail");
  assert.equal(results.summary.activationRecommendation, "keep_in_shadow");
  assert.equal(results.checks.find((check) => check.id === "shadow_coverage")?.status, "fail");
  assert.equal(results.checks.find((check) => check.id === "harmful_cohorts")?.status, "fail");
  assert.equal(results.checks.find((check) => check.id === "promotion_readiness")?.status, "at_risk");
});

test("adaptive operator artifacts stay deterministic for the same input", () => {
  const bundle = buildAdaptivePolicyPromotionBundle({
    analysisResults: {
      candidatePolicySuggestions: {
        highConfidence: [],
        mediumConfidence: [],
      },
    },
    shadowEvaluationResults: {
      promotionChecklist: [],
    },
  });
  const launchReadiness = buildAdaptiveLaunchReadinessCheck({
    shadowEvaluationResults: {
      summary: {
        decisionRowCount: 0,
        holdoutRowCount: 0,
        averageConfidence: 0,
        divergenceRate: 0,
        estimatedBenefitAverage: 0,
        potentialHarmAverage: 0,
      },
      harmfulCohorts: [],
      underpoweredCohorts: [],
      promotionChecklist: [],
    },
  });

  const firstPromotionArtifacts = buildAdaptivePromotionArtifacts({ bundle });
  const secondPromotionArtifacts = buildAdaptivePromotionArtifacts({ bundle });
  const firstLaunchArtifacts = buildAdaptiveLaunchReadinessArtifacts({ results: launchReadiness });
  const secondLaunchArtifacts = buildAdaptiveLaunchReadinessArtifacts({ results: launchReadiness });

  assert.equal(firstPromotionArtifacts.promotionResultsJson, secondPromotionArtifacts.promotionResultsJson);
  assert.equal(firstPromotionArtifacts.promotionReportMarkdown, secondPromotionArtifacts.promotionReportMarkdown);
  assert.equal(firstLaunchArtifacts.resultsJson, secondLaunchArtifacts.resultsJson);
  assert.equal(firstLaunchArtifacts.launchReadinessReportMarkdown, secondLaunchArtifacts.launchReadinessReportMarkdown);
  assert.match(firstLaunchArtifacts.launchReadinessReportMarkdown, /Adaptive Launch Readiness/);
});
