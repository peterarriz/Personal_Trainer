import {
  humanizeEnum,
  sanitizeSlug,
  sanitizeText,
  stableStringify,
  toArray,
} from "./adaptive-learning-analysis/shared.js";
import { ADAPTIVE_POLICY_MODES } from "./adaptive-policy-service.js";

export const ADAPTIVE_POLICY_CONFIG_DIR = "config/adaptive-learning";

export const ADAPTIVE_POLICY_CONFIG_FILENAMES = Object.freeze({
  evidence: "adaptive-policy-evidence.json",
  shadowConfig: "adaptive-learning-config.shadow.json",
  activeConfig: "adaptive-learning-config.active.json",
  appliedConfig: "adaptive-learning-config.applied.json",
  manifest: "applied-bundle-manifest.json",
  report: "applied-bundle-report.md",
});

export const ADAPTIVE_POLICY_CONFIG_MANIFEST_VERSION = 1;

const normalizeApplyMode = (value = "") => (
  sanitizeSlug(value, 40) === ADAPTIVE_POLICY_MODES.active
    ? ADAPTIVE_POLICY_MODES.active
    : ADAPTIVE_POLICY_MODES.shadow
);

export const buildDefaultAdaptivePolicyEvidenceSnapshot = () => ({
  version: 1,
  sourceLabel: "not_applied",
  rules: [],
});

export const buildDefaultAdaptiveLearningConfig = () => ({
  globalEnable: false,
  mode: ADAPTIVE_POLICY_MODES.deterministicOnly,
  internalDiagnostics: false,
  decisionPoints: {},
});

export const buildDefaultAdaptivePolicyBundleManifest = () => ({
  version: ADAPTIVE_POLICY_CONFIG_MANIFEST_VERSION,
  appliedAt: 0,
  applyMode: ADAPTIVE_POLICY_MODES.shadow,
  sourceLabel: "not_applied",
  sourceDir: "",
  promotedDecisionPointIds: [],
  promotedRuleCount: 0,
  recommendation: "keep_in_shadow",
  eligibleDecisionPointCount: 0,
  blockedDecisionPointCount: 0,
});

const sanitizeBundleSummary = (summary = {}) => ({
  eligibleDecisionPointCount: Math.max(0, Math.round(Number(summary?.eligibleDecisionPointCount || 0))),
  requestedDecisionPointCount: Math.max(0, Math.round(Number(summary?.requestedDecisionPointCount || 0))),
  promotedDecisionPointCount: Math.max(0, Math.round(Number(summary?.promotedDecisionPointCount || 0))),
  blockedDecisionPointCount: Math.max(0, Math.round(Number(summary?.blockedDecisionPointCount || 0))),
  promotedRuleCount: Math.max(0, Math.round(Number(summary?.promotedRuleCount || 0))),
  recommendation: sanitizeSlug(summary?.recommendation || "keep_in_shadow", 80) || "keep_in_shadow",
});

export const buildAdaptivePolicyBundleManifest = ({
  bundle = {},
  sourceDir = "",
  sourceLabel = "",
  applyMode = ADAPTIVE_POLICY_MODES.shadow,
  appliedAt = Date.now(),
} = {}) => {
  const summary = sanitizeBundleSummary(bundle?.summary || {});
  return {
    version: ADAPTIVE_POLICY_CONFIG_MANIFEST_VERSION,
    appliedAt: Math.max(0, Math.round(Number(appliedAt || 0))),
    applyMode: normalizeApplyMode(applyMode),
    sourceLabel: sanitizeText(
      sourceLabel
      || bundle?.evidenceSnapshot?.sourceLabel
      || bundle?.summary?.recommendation
      || "adaptive_policy_bundle",
      160
    ),
    sourceDir: sanitizeText(sourceDir, 260),
    promotedDecisionPointIds: toArray(bundle?.promotedDecisionPointIds)
      .map((entry) => sanitizeSlug(entry, 80))
      .filter(Boolean),
    promotedRuleCount: summary.promotedRuleCount,
    recommendation: summary.recommendation,
    eligibleDecisionPointCount: summary.eligibleDecisionPointCount,
    blockedDecisionPointCount: summary.blockedDecisionPointCount,
  };
};

const buildAppliedBundleReport = ({
  manifest = {},
  bundle = {},
  appliedConfig = {},
} = {}) => [
  "# Applied Adaptive Policy Bundle",
  "",
  `- Applied at: ${manifest?.appliedAt || 0}`,
  `- Apply mode: ${humanizeEnum(manifest?.applyMode || ADAPTIVE_POLICY_MODES.shadow)}`,
  `- Source label: ${manifest?.sourceLabel || "not_applied"}`,
  `- Source dir: ${manifest?.sourceDir || "n/a"}`,
  `- Promoted decision points: ${toArray(manifest?.promotedDecisionPointIds).length}`,
  `- Promoted rules: ${manifest?.promotedRuleCount || 0}`,
  `- Recommendation: ${humanizeEnum(manifest?.recommendation || "keep_in_shadow")}`,
  `- Applied config mode: ${humanizeEnum(appliedConfig?.mode || ADAPTIVE_POLICY_MODES.deterministicOnly)}`,
  "",
  "## Decision Points",
  "",
  ...(toArray(manifest?.promotedDecisionPointIds).length
    ? toArray(manifest.promotedDecisionPointIds).map((entry) => `- ${humanizeEnum(entry)}`)
    : ["- No decision points are currently promoted in the applied bundle."]),
  "",
  "## Notes",
  "",
  "- This config path is operator-managed and separate from consumer-facing settings.",
  "- Applying a bundle updates the canonical reviewed evidence and the applied adaptive config without manual file copying.",
  "- The live product still remains deterministic unless the applied config is explicitly consumed in a trusted rollout path.",
  "",
].join("\n");

export const buildAdaptivePolicyBundleApplicationArtifacts = ({
  bundle = {},
  sourceDir = "",
  sourceLabel = "",
  applyMode = ADAPTIVE_POLICY_MODES.shadow,
  appliedAt = Date.now(),
} = {}) => {
  const evidenceSnapshot = bundle?.evidenceSnapshot && typeof bundle.evidenceSnapshot === "object"
    ? bundle.evidenceSnapshot
    : buildDefaultAdaptivePolicyEvidenceSnapshot();
  const shadowConfig = bundle?.shadowConfig && typeof bundle.shadowConfig === "object"
    ? bundle.shadowConfig
    : buildDefaultAdaptiveLearningConfig();
  const activeConfig = bundle?.activeConfig && typeof bundle.activeConfig === "object"
    ? bundle.activeConfig
    : buildDefaultAdaptiveLearningConfig();
  const normalizedApplyMode = normalizeApplyMode(applyMode);
  const appliedConfig = normalizedApplyMode === ADAPTIVE_POLICY_MODES.active
    ? activeConfig
    : shadowConfig;
  const manifest = buildAdaptivePolicyBundleManifest({
    bundle,
    sourceDir,
    sourceLabel,
    applyMode: normalizedApplyMode,
    appliedAt,
  });

  return {
    manifest,
    appliedConfig,
    files: {
      [ADAPTIVE_POLICY_CONFIG_FILENAMES.evidence]: stableStringify(evidenceSnapshot),
      [ADAPTIVE_POLICY_CONFIG_FILENAMES.shadowConfig]: stableStringify(shadowConfig),
      [ADAPTIVE_POLICY_CONFIG_FILENAMES.activeConfig]: stableStringify(activeConfig),
      [ADAPTIVE_POLICY_CONFIG_FILENAMES.appliedConfig]: stableStringify(appliedConfig),
      [ADAPTIVE_POLICY_CONFIG_FILENAMES.manifest]: stableStringify(manifest),
      [ADAPTIVE_POLICY_CONFIG_FILENAMES.report]: buildAppliedBundleReport({
        manifest,
        bundle,
        appliedConfig,
      }),
    },
  };
};
