import {
  buildAdaptivePolicyEvidenceSnapshotFromAnalysisResults,
} from "./adaptive-policy-service.js";
import {
  ADAPTIVE_POLICY_DECISION_POINT_STAGES,
  buildAdaptiveScaffoldingManifest,
  resolveAdaptiveLearningScaffolding,
  shouldExposeAdaptiveDiagnostics,
} from "./adaptive-learning-scaffolding-service.js";
import {
  humanizeEnum,
  roundTo,
  stableStringify,
  toArray,
} from "./adaptive-learning-analysis/shared.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPercent = (value = null, digits = 0) => (
  value == null ? "n/a" : `${(Number(value || 0) * 100).toFixed(digits)}%`
);

const buildTraceSummary = (traces = []) => {
  const safeTraces = toArray(traces).filter(Boolean);
  const usedAdaptiveChoiceCount = safeTraces.filter((trace) => trace?.usedAdaptiveChoice).length;
  const shadowOnlyCount = safeTraces.filter((trace) => trace?.fallbackReason === "shadow_mode").length;
  const latestInterestingTrace = safeTraces.find((trace) => trace?.usedAdaptiveChoice)
    || safeTraces.find((trace) => trace?.fallbackReason === "shadow_mode")
    || safeTraces[0]
    || null;
  return {
    traceCount: safeTraces.length,
    usedAdaptiveChoiceCount,
    shadowOnlyCount,
    latestInterestingTrace,
  };
};

export const buildAdaptiveDiagnosticsPanelModel = ({
  personalization = {},
  adaptiveLearningSnapshot = null,
  planComposer = null,
  trustedLocalDebug = false,
} = {}) => {
  const scaffolding = resolveAdaptiveLearningScaffolding({ personalization });
  if (!shouldExposeAdaptiveDiagnostics({ scaffolding, trustedLocalDebug })) {
    return { visible: false };
  }

  const snapshot = adaptiveLearningSnapshot || {};
  const events = toArray(snapshot?.events);
  const pendingEventIds = toArray(snapshot?.pendingEventIds);
  const pendingServerEventIds = toArray(snapshot?.pendingServerEventIds);
  const traceSummary = buildTraceSummary(planComposer?.adaptivePolicyTraces || []);
  const evidenceSnapshot = scaffolding?.policyRuntime?.evidenceSnapshot || {};
  const decisionPointSettings = scaffolding?.policyRuntime?.decisionPointSettings || {};
  const registryRows = toArray(scaffolding?.decisionPointRegistry).map((entry) => {
    const runtimeSetting = decisionPointSettings?.[entry.id] || {};
    const matchingRules = toArray(evidenceSnapshot?.rules).filter((rule) => rule?.decisionPointId === entry.id);
    const matchingTrace = toArray(planComposer?.adaptivePolicyTraces).find((trace) => trace?.decisionPointId === entry.id) || null;
    return {
      id: entry.id,
      label: entry.label,
      owner: entry.owner,
      stage: entry.stage,
      enabled: runtimeSetting?.enabled !== false,
      effectiveMode: sanitizeSlug(runtimeSetting?.mode || scaffolding?.flags?.effectivePolicyMode || "deterministic_only", 40) || "deterministic_only",
      ruleCount: matchingRules.length,
      latestActionId: sanitizeText(matchingTrace?.chosenActionId || matchingTrace?.shadowTopActionId || "", 80),
      latestFallbackReason: sanitizeText(matchingTrace?.fallbackReason || "", 80),
    };
  });

  return {
    visible: true,
    title: "Adaptive readiness",
    cards: [
      {
        id: "runtime",
        title: "Runtime",
        headline: scaffolding?.flags?.globalEnable
          ? `Adaptive ${humanizeEnum(scaffolding?.flags?.effectivePolicyMode || "deterministic_only")}`
          : "Adaptive layer off by default",
        detail: scaffolding?.flags?.globalEnable
          ? `Global enable is on, but bounded decision points still follow their rollout modes.`
          : "Launch-safe default keeps the live planner deterministic until an operator explicitly enables shadow or active mode.",
      },
      {
        id: "evidence",
        title: "Evidence",
        headline: `${toArray(evidenceSnapshot?.rules).length} reviewed rules loaded`,
        detail: evidenceSnapshot?.sourceLabel
          ? `Evidence source: ${evidenceSnapshot.sourceLabel}.`
          : "No reviewed evidence snapshot is loaded right now.",
      },
      {
        id: "event_buffer",
        title: "Event buffer",
        headline: `${events.length} adaptive events stored`,
        detail: pendingEventIds.length || pendingServerEventIds.length
          ? `${pendingEventIds.length} pending payload replay, ${pendingServerEventIds.length} pending dedicated sink replay.`
          : "No adaptive events are waiting on replay.",
      },
      {
        id: "current_plan",
        title: "Current plan",
        headline: traceSummary.traceCount
          ? `${traceSummary.traceCount} bounded adaptive decision${traceSummary.traceCount === 1 ? "" : "s"} attached`
          : "No adaptive decision traces on the current plan",
        detail: traceSummary.latestInterestingTrace
          ? `Latest trace: ${humanizeEnum(traceSummary.latestInterestingTrace.decisionPointId || "unknown")} with ${traceSummary.latestInterestingTrace.usedAdaptiveChoice ? "a live adaptive choice" : traceSummary.latestInterestingTrace.fallbackReason === "shadow_mode" ? "a shadow-only suggestion" : "a deterministic fallback"}.`
          : "The current plan does not include adaptive trace data yet.",
      },
    ],
    registryRows,
    commandHints: [
      {
        id: "analysis",
        label: "Offline analysis",
        command: scaffolding?.evaluationPipelines?.offlineAnalysis?.script || "npm run qa:adaptive-learning:analyze",
      },
      {
        id: "shadow_eval",
        label: "Shadow evaluation",
        command: scaffolding?.evaluationPipelines?.shadowEvaluation?.script || "npm run qa:adaptive-policy:shadow-eval",
      },
      {
        id: "launch_gate",
        label: "Launch gate",
        command: "npm run qa:adaptive-policy:launch-readiness",
      },
      {
        id: "promotion_bundle",
        label: "Promotion bundle",
        command: "npm run qa:adaptive-policy:promote",
      },
    ],
    notes: [
      "This panel is trusted-local only and should never appear in consumer mode.",
      "Shadow traces can be inspected here, but they should not change user-facing copy unless the policy is actually active.",
    ],
  };
};

const buildDecisionPointSuggestionMap = ({
  analysisResults = {},
  includeMediumConfidence = false,
} = {}) => {
  const filteredAnalysisResults = {
    ...analysisResults,
    candidatePolicySuggestions: {
      ...(analysisResults?.candidatePolicySuggestions || {}),
      mediumConfidence: includeMediumConfidence
        ? toArray(analysisResults?.candidatePolicySuggestions?.mediumConfidence)
        : [],
    },
  };
  const snapshot = buildAdaptivePolicyEvidenceSnapshotFromAnalysisResults({
    analysisResults: filteredAnalysisResults,
  });
  return new Map(
    toArray(snapshot?.rules).reduce((acc, rule) => {
      const key = sanitizeSlug(rule?.decisionPointId || "", 80);
      if (!key) return acc;
      if (!acc.some((entry) => entry[0] === key)) {
        acc.push([key, []]);
      }
      const bucket = acc.find((entry) => entry[0] === key);
      bucket[1].push(rule);
      return acc;
    }, [])
  );
};

export const buildAdaptivePolicyPromotionBundle = ({
  analysisResults = {},
  shadowEvaluationResults = {},
  decisionPointIds = [],
  includeMediumConfidence = false,
} = {}) => {
  const eligibleIds = new Set(
    toArray(shadowEvaluationResults?.promotionChecklist)
      .filter((entry) => entry?.status === "eligible_for_active_rollout")
      .map((entry) => sanitizeSlug(entry?.decisionPointId || "", 80))
      .filter(Boolean)
  );
  const requestedIds = toArray(decisionPointIds)
    .map((entry) => sanitizeSlug(entry, 80))
    .filter(Boolean);
  const targetIds = requestedIds.length
    ? requestedIds
    : [...eligibleIds];
  const ruleMap = buildDecisionPointSuggestionMap({
    analysisResults,
    includeMediumConfidence,
  });

  const blocked = [];
  const promotedDecisionPointIds = [];
  const promotedRules = [];

  targetIds.forEach((decisionPointId) => {
    if (!eligibleIds.has(decisionPointId)) {
      blocked.push({
        decisionPointId,
        reason: "shadow_gate_not_eligible",
      });
      return;
    }
    const rules = toArray(ruleMap.get(decisionPointId));
    if (!rules.length) {
      blocked.push({
        decisionPointId,
        reason: "no_reviewable_analysis_rules",
      });
      return;
    }
    promotedDecisionPointIds.push(decisionPointId);
    promotedRules.push(...rules);
  });

  const evidenceSnapshot = {
    version: 1,
    sourceLabel: includeMediumConfidence
      ? "reviewed_adaptive_promotion_bundle_high_medium_confidence"
      : "reviewed_adaptive_promotion_bundle_high_confidence",
    rules: promotedRules,
  };

  const shadowConfig = {
    globalEnable: promotedDecisionPointIds.length > 0,
    mode: "shadow",
    internalDiagnostics: false,
    decisionPoints: Object.fromEntries(
      promotedDecisionPointIds.map((decisionPointId) => [
        decisionPointId,
        {
          enabled: true,
          rolloutMode: "shadow",
          stage: ADAPTIVE_POLICY_DECISION_POINT_STAGES.activeReadyWithEvidence,
        },
      ])
    ),
  };

  const activeConfig = {
    globalEnable: promotedDecisionPointIds.length > 0,
    mode: "active",
    internalDiagnostics: false,
    decisionPoints: Object.fromEntries(
      promotedDecisionPointIds.map((decisionPointId) => [
        decisionPointId,
        {
          enabled: true,
          rolloutMode: "active",
          stage: ADAPTIVE_POLICY_DECISION_POINT_STAGES.activeReadyWithEvidence,
        },
      ])
    ),
  };

  return {
    summary: {
      eligibleDecisionPointCount: eligibleIds.size,
      requestedDecisionPointCount: targetIds.length,
      promotedDecisionPointCount: promotedDecisionPointIds.length,
      blockedDecisionPointCount: blocked.length,
      promotedRuleCount: promotedRules.length,
      includeMediumConfidence,
      recommendation: promotedDecisionPointIds.length
        ? "bundle_ready_for_operator_review"
        : "keep_in_shadow",
    },
    eligibleDecisionPointIds: [...eligibleIds].sort(),
    requestedDecisionPointIds: targetIds,
    promotedDecisionPointIds,
    blocked,
    evidenceSnapshot,
    shadowConfig,
    activeConfig,
  };
};

export const buildAdaptiveLaunchReadinessCheck = ({
  shadowEvaluationResults = {},
  minShadowRows = 40,
  minHoldoutRows = 12,
} = {}) => {
  const decisionRowCount = Number(shadowEvaluationResults?.summary?.decisionRowCount || 0);
  const holdoutRowCount = Number(shadowEvaluationResults?.summary?.holdoutRowCount || 0);
  const harmfulCohortCount = toArray(shadowEvaluationResults?.harmfulCohorts).length;
  const underpoweredCohortCount = toArray(shadowEvaluationResults?.underpoweredCohorts).length;
  const eligibleDecisionPointCount = toArray(shadowEvaluationResults?.promotionChecklist)
    .filter((entry) => entry?.status === "eligible_for_active_rollout")
    .length;
  const checks = [
    {
      id: "shadow_coverage",
      label: "Shadow coverage",
      status: decisionRowCount >= minShadowRows && holdoutRowCount >= minHoldoutRows ? "pass" : "fail",
      detail: `${decisionRowCount} decision rows and ${holdoutRowCount} holdout rows.`,
    },
    {
      id: "harmful_cohorts",
      label: "Harmful cohort guardrail",
      status: harmfulCohortCount === 0 ? "pass" : "fail",
      detail: harmfulCohortCount === 0
        ? "No harmful cohorts were flagged."
        : `${harmfulCohortCount} harmful cohort${harmfulCohortCount === 1 ? "" : "s"} are still flagged.`,
    },
    {
      id: "promotion_readiness",
      label: "Promotion readiness",
      status: eligibleDecisionPointCount > 0 ? "pass" : "at_risk",
      detail: eligibleDecisionPointCount > 0
        ? `${eligibleDecisionPointCount} decision point${eligibleDecisionPointCount === 1 ? "" : "s"} are eligible for limited active rollout.`
        : "No decision point is eligible for activation yet, so the adaptive layer should remain in shadow.",
    },
  ];
  const overallStatus = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "at_risk")
    ? "at_risk"
    : "pass";
  return {
    summary: {
      overallStatus,
      activationRecommendation: overallStatus === "pass"
        ? "eligible_for_limited_active_rollout"
        : "keep_in_shadow",
      decisionRowCount,
      holdoutRowCount,
      harmfulCohortCount,
      underpoweredCohortCount,
      eligibleDecisionPointCount,
      averageConfidence: roundTo(shadowEvaluationResults?.summary?.averageConfidence || 0, 1),
      divergenceRate: roundTo(shadowEvaluationResults?.summary?.divergenceRate || 0, 4),
      estimatedBenefitAverage: roundTo(shadowEvaluationResults?.summary?.estimatedBenefitAverage || 0, 4),
      potentialHarmAverage: roundTo(shadowEvaluationResults?.summary?.potentialHarmAverage || 0, 4),
    },
    checks,
  };
};

const buildPromotionMarkdown = (bundle = {}) => [
  "# Adaptive Policy Promotion Bundle",
  "",
  `- Eligible decision points: ${bundle?.summary?.eligibleDecisionPointCount || 0}`,
  `- Requested decision points: ${bundle?.summary?.requestedDecisionPointCount || 0}`,
  `- Promoted decision points: ${bundle?.summary?.promotedDecisionPointCount || 0}`,
  `- Promoted rules: ${bundle?.summary?.promotedRuleCount || 0}`,
  `- Recommendation: ${humanizeEnum(bundle?.summary?.recommendation || "keep_in_shadow")}`,
  "",
  "## Promoted Decision Points",
  "",
  ...(toArray(bundle?.promotedDecisionPointIds).length
    ? toArray(bundle.promotedDecisionPointIds).map((id) => `- ${humanizeEnum(id)}`)
    : ["- No decision points were promoted."]),
  "",
  "## Blocked Requests",
  "",
  ...(toArray(bundle?.blocked).length
    ? toArray(bundle.blocked).map((entry) => `- ${humanizeEnum(entry?.decisionPointId || "unknown")}: ${humanizeEnum(entry?.reason || "blocked")}.`)
    : ["- No requests were blocked."]),
  "",
  "## Operator Notes",
  "",
  "- This bundle is a candidate artifact only. It does not change live app behavior by itself.",
  "- Keep rollout in shadow until the launch-readiness gate and harmful-cohort checks are green on real data.",
  "",
].join("\n");

export const buildAdaptivePromotionArtifacts = ({
  bundle = {},
} = {}) => ({
  promotionResultsJson: stableStringify(bundle),
  adaptivePolicyEvidenceJson: stableStringify(bundle?.evidenceSnapshot || {}),
  adaptiveLearningShadowConfigJson: stableStringify(bundle?.shadowConfig || {}),
  adaptiveLearningActiveConfigJson: stableStringify(bundle?.activeConfig || {}),
  promotionReportMarkdown: buildPromotionMarkdown(bundle),
});

const buildLaunchReadinessMarkdown = (results = {}) => [
  "# Adaptive Launch Readiness",
  "",
  `- Overall status: ${humanizeEnum(results?.summary?.overallStatus || "at_risk")}`,
  `- Activation recommendation: ${humanizeEnum(results?.summary?.activationRecommendation || "keep_in_shadow")}`,
  `- Shadow rows: ${results?.summary?.decisionRowCount || 0}`,
  `- Holdout rows: ${results?.summary?.holdoutRowCount || 0}`,
  `- Harmful cohorts: ${results?.summary?.harmfulCohortCount || 0}`,
  `- Underpowered cohorts: ${results?.summary?.underpoweredCohortCount || 0}`,
  `- Eligible decision points: ${results?.summary?.eligibleDecisionPointCount || 0}`,
  `- Average confidence: ${results?.summary?.averageConfidence || 0}`,
  `- Divergence rate: ${formatPercent(results?.summary?.divergenceRate, 1)}`,
  `- Estimated benefit: ${results?.summary?.estimatedBenefitAverage || 0}`,
  `- Potential harm: ${results?.summary?.potentialHarmAverage || 0}`,
  "",
  "## Checks",
  "",
  ...toArray(results?.checks).map((check) => `- ${check.label}: ${humanizeEnum(check.status || "at_risk")}. ${check.detail}`),
  "",
  "## Notes",
  "",
  "- This gate is about adaptive rollout safety. It does not require the adaptive layer to be on for the consumer launch.",
  "- If any harmful cohorts remain, or no decision point is eligible, the adaptive layer should stay shadow-only.",
  "",
].join("\n");

export const buildAdaptiveLaunchReadinessArtifacts = ({
  results = {},
} = {}) => ({
  resultsJson: stableStringify(results),
  launchReadinessReportMarkdown: buildLaunchReadinessMarkdown(results),
});

export const buildAdaptiveOperatorManifest = ({
  personalization = {},
} = {}) => ({
  scaffolding: buildAdaptiveScaffoldingManifest({ personalization }),
  commands: [
    "npm run qa:adaptive-learning:analyze",
    "npm run qa:adaptive-policy:shadow-eval",
    "npm run qa:adaptive-policy:launch-readiness",
    "npm run qa:adaptive-policy:promote",
  ],
});
