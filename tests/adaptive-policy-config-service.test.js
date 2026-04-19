import test from "node:test";
import assert from "node:assert/strict";

import {
  ADAPTIVE_POLICY_CONFIG_FILENAMES,
  buildAdaptivePolicyBundleApplicationArtifacts,
  buildDefaultAdaptiveLearningConfig,
} from "../src/services/adaptive-policy-config-service.js";

test("adaptive policy bundle application artifacts select the shadow config by default", () => {
  const artifacts = buildAdaptivePolicyBundleApplicationArtifacts({
    bundle: {
      summary: {
        promotedDecisionPointCount: 1,
        promotedRuleCount: 2,
        recommendation: "bundle_ready_for_operator_review",
      },
      promotedDecisionPointIds: ["travel_substitution_set"],
      evidenceSnapshot: {
        version: 1,
        sourceLabel: "reviewed_bundle",
        rules: [{ id: "travel_rule" }],
      },
      shadowConfig: {
        globalEnable: true,
        mode: "shadow",
        internalDiagnostics: false,
        decisionPoints: {
          travel_substitution_set: {
            enabled: true,
            rolloutMode: "shadow",
          },
        },
      },
      activeConfig: {
        globalEnable: true,
        mode: "active",
        internalDiagnostics: false,
        decisionPoints: {
          travel_substitution_set: {
            enabled: true,
            rolloutMode: "active",
          },
        },
      },
    },
    sourceDir: "artifacts/adaptive-policy-promotion/example",
    applyMode: "shadow",
    appliedAt: 123456789,
  });

  const appliedConfig = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.appliedConfig]);
  const manifest = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.manifest]);

  assert.equal(appliedConfig.mode, "shadow");
  assert.equal(manifest.applyMode, "shadow");
  assert.deepEqual(manifest.promotedDecisionPointIds, ["travel_substitution_set"]);
  assert.match(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.report], /Applied Adaptive Policy Bundle/);
});

test("adaptive policy bundle application artifacts can promote the active config intentionally", () => {
  const artifacts = buildAdaptivePolicyBundleApplicationArtifacts({
    bundle: {
      shadowConfig: {
        globalEnable: true,
        mode: "shadow",
        internalDiagnostics: false,
        decisionPoints: {},
      },
      activeConfig: {
        globalEnable: true,
        mode: "active",
        internalDiagnostics: false,
        decisionPoints: {},
      },
    },
    applyMode: "active",
  });

  const appliedConfig = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.appliedConfig]);
  const manifest = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.manifest]);

  assert.equal(appliedConfig.mode, "active");
  assert.equal(manifest.applyMode, "active");
});

test("adaptive policy bundle application artifacts fall back to launch-safe defaults", () => {
  const artifacts = buildAdaptivePolicyBundleApplicationArtifacts({});
  const evidence = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.evidence]);
  const shadowConfig = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.shadowConfig]);
  const appliedConfig = JSON.parse(artifacts.files[ADAPTIVE_POLICY_CONFIG_FILENAMES.appliedConfig]);

  assert.deepEqual(evidence.rules, []);
  assert.deepEqual(shadowConfig, buildDefaultAdaptiveLearningConfig());
  assert.deepEqual(appliedConfig, buildDefaultAdaptiveLearningConfig());
});
