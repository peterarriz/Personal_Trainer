import {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
} from "./adaptive-learning-event-service.js";
import {
  ADAPTIVE_LEARNING_STORAGE_KEY,
  ADAPTIVE_LEARNING_STORE_MODEL,
} from "./adaptive-learning-store-service.js";
import { DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS } from "./adaptive-learning-analysis-service.js";
import {
  ADAPTIVE_POLICY_DECISION_POINTS,
  ADAPTIVE_POLICY_MODES,
  resolveAdaptivePolicyRuntime,
} from "./adaptive-policy-service.js";
import {
  DEFAULT_ADAPTIVE_POLICY_SHADOW_HOLDOUT_PERCENTAGE,
  DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE,
  DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS,
} from "./adaptive-policy-shadow-evaluation-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const ADAPTIVE_LEARNING_LAUNCH_STAGE = "scaffold_only";

export const ADAPTIVE_DIAGNOSTICS_GATES = Object.freeze({
  trustedLocalDebugOnly: "trusted_local_debug_only",
});

export const ADAPTIVE_LEARNING_FLAG_DEFAULTS = Object.freeze({
  globalEnable: false,
  mode: ADAPTIVE_POLICY_MODES.deterministicOnly,
  shadowMode: false,
  activeMode: false,
  internalDiagnostics: false,
});

export const ADAPTIVE_POLICY_DECISION_POINT_STAGES = Object.freeze({
  approvedSafeLever: "approved_safe_lever",
  shadowReady: "shadow_ready",
  activeReadyWithEvidence: "active_ready_with_evidence",
});

const DECISION_POINT_METADATA = Object.freeze({
  progression_aggressiveness_band: Object.freeze({
    safeLeverType: "weekly_progression_bias",
    category: "low_risk_progression",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "freeform_plan_rewrite",
      "injury_prescription",
      "domain_swap",
    ]),
  }),
  deload_timing_window: Object.freeze({
    safeLeverType: "recovery_window",
    category: "low_risk_recovery",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "postpone_safety_cutback",
      "remove_existing_recovery_guardrail",
      "injury_prescription",
    ]),
  }),
  time_crunched_session_format_choice: Object.freeze({
    safeLeverType: "session_packaging",
    category: "adherence_formatting",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "invent_new_session_family",
      "change_plan_archetype",
      "increase_total_load_outside_candidate_set",
    ]),
  }),
  travel_substitution_set: Object.freeze({
    safeLeverType: "environment_substitution",
    category: "travel_fallbacks",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "generate_arbitrary_workout",
      "override_safety_exclusions",
      "medical_guidance",
    ]),
  }),
  hybrid_run_lift_balance_template: Object.freeze({
    safeLeverType: "hybrid_emphasis_template",
    category: "hybrid_tradeoff_management",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "convert_non_hybrid_plan",
      "erase_required_domain_support",
      "freeform_week_rewrite",
    ]),
  }),
  hybrid_session_format_choice: Object.freeze({
    safeLeverType: "hybrid_session_packaging",
    category: "hybrid_adherence_formatting",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "freeform_plan_rewrite",
      "unsupported_sport_logic",
      "injury_prescription",
    ]),
  }),
  hybrid_deload_timing_window: Object.freeze({
    safeLeverType: "hybrid_recovery_window",
    category: "hybrid_load_management",
    promotionWorkflow: "shadow_then_operator_review",
    forbiddenMoves: Object.freeze([
      "remove_safety_cutback",
      "force_harder_week_under_recovery_risk",
      "medical_guidance",
    ]),
  }),
});

const normalizeMode = (value = "") => {
  const normalized = sanitizeSlug(value, 40);
  return Object.values(ADAPTIVE_POLICY_MODES).includes(normalized)
    ? normalized
    : ADAPTIVE_POLICY_MODES.deterministicOnly;
};

const normalizeBoolean = (value, fallback = false) => (
  typeof value === "boolean" ? value : fallback
);

const normalizeDecisionPointRolloutMode = (value = "") => {
  const normalized = sanitizeSlug(value, 40);
  if (normalized === "inherit") return "inherit";
  return normalizeMode(normalized);
};

const sanitizeDecisionPointFlags = (value = {}) => Object.values(ADAPTIVE_POLICY_DECISION_POINTS).reduce((acc, entry) => {
  const raw = value?.[entry.id];
  if (raw === false) {
    acc[entry.id] = {
      enabled: false,
      rolloutMode: ADAPTIVE_POLICY_MODES.deterministicOnly,
      stage: ADAPTIVE_POLICY_DECISION_POINT_STAGES.approvedSafeLever,
    };
    return acc;
  }
  if (raw === true) {
    acc[entry.id] = {
      enabled: true,
      rolloutMode: "inherit",
      stage: ADAPTIVE_POLICY_DECISION_POINT_STAGES.approvedSafeLever,
    };
    return acc;
  }
  acc[entry.id] = {
    enabled: normalizeBoolean(raw?.enabled, true),
    rolloutMode: normalizeDecisionPointRolloutMode(raw?.rolloutMode || raw?.mode || "inherit"),
    stage: sanitizeSlug(raw?.stage || ADAPTIVE_POLICY_DECISION_POINT_STAGES.approvedSafeLever, 60) || ADAPTIVE_POLICY_DECISION_POINT_STAGES.approvedSafeLever,
  };
  return acc;
}, {});

const resolveShadowMode = ({ globalEnable = false, mode = ADAPTIVE_POLICY_MODES.deterministicOnly } = {}) => (
  Boolean(globalEnable) && mode === ADAPTIVE_POLICY_MODES.shadow
);

const resolveActiveMode = ({ globalEnable = false, mode = ADAPTIVE_POLICY_MODES.deterministicOnly } = {}) => (
  Boolean(globalEnable) && mode === ADAPTIVE_POLICY_MODES.active
);

const resolveGlobalFlagBlock = (config = {}) => {
  const globalEnable = normalizeBoolean(
    config?.globalEnable ?? config?.enabled,
    ADAPTIVE_LEARNING_FLAG_DEFAULTS.globalEnable
  );
  const mode = globalEnable
    ? normalizeMode(config?.mode || ADAPTIVE_LEARNING_FLAG_DEFAULTS.mode)
    : ADAPTIVE_POLICY_MODES.deterministicOnly;
  return {
    globalEnable,
    mode,
    shadowMode: resolveShadowMode({ globalEnable, mode }),
    activeMode: resolveActiveMode({ globalEnable, mode }),
    internalDiagnostics: normalizeBoolean(
      config?.internalDiagnostics,
      ADAPTIVE_LEARNING_FLAG_DEFAULTS.internalDiagnostics
    ),
  };
};

const buildDecisionPointPolicySettings = ({ flags = {}, globalFlags = {} } = {}) => (
  Object.entries(flags || {}).reduce((acc, [decisionPointId, entry]) => {
    if (!entry?.enabled || !globalFlags.globalEnable) {
      acc[decisionPointId] = { enabled: false, mode: ADAPTIVE_POLICY_MODES.deterministicOnly };
      return acc;
    }
    acc[decisionPointId] = {
      enabled: true,
      mode: entry.rolloutMode === "inherit"
        ? globalFlags.mode
        : normalizeMode(entry.rolloutMode || globalFlags.mode),
    };
    return acc;
  }, {})
);

const buildDecisionPointRegistry = ({ decisionPointFlags = {} } = {}) => Object.values(ADAPTIVE_POLICY_DECISION_POINTS).map((entry) => {
  const metadata = DECISION_POINT_METADATA[entry.id] || {};
  const flags = decisionPointFlags?.[entry.id] || {
    enabled: true,
    rolloutMode: "inherit",
    stage: ADAPTIVE_POLICY_DECISION_POINT_STAGES.approvedSafeLever,
  };
  return {
    id: entry.id,
    label: entry.label,
    owner: entry.owner,
    stage: flags.stage || ADAPTIVE_POLICY_DECISION_POINT_STAGES.approvedSafeLever,
    enabledByDefault: false,
    allowedActionIds: Object.keys(entry.actions || {}),
    fallbackActionId: entry.fallbackActionId,
    requiredContextInputs: toArray(entry.requiredContextInputs),
    safeLeverType: metadata.safeLeverType || "bounded_rerank",
    category: metadata.category || "adaptive_scaffold",
    promotionWorkflow: metadata.promotionWorkflow || "shadow_then_operator_review",
    forbiddenMoves: toArray(metadata.forbiddenMoves),
    rolloutMode: flags.rolloutMode || "inherit",
  };
});

export const ADAPTIVE_EVALUATION_PIPELINE_REGISTRY = Object.freeze({
  offlineAnalysis: Object.freeze({
    id: "offline_adaptive_learning_analysis",
    script: "npm run qa:adaptive-learning:analyze",
    fixtureScript: "npm run qa:adaptive-learning:analyze:fixture",
    outputDir: "artifacts/adaptive-learning-analysis",
    purpose: "Convert logged recommendation and outcome history into interpretable cohort and policy insights.",
  }),
  shadowEvaluation: Object.freeze({
    id: "adaptive_policy_shadow_evaluation",
    script: "npm run qa:adaptive-policy:shadow-eval",
    fixtureScript: "npm run qa:adaptive-policy:shadow-eval:fixture",
    outputDir: "artifacts/adaptive-policy-shadow-evaluation",
    purpose: "Compare deterministic baseline actions against logged or replayed adaptive shadow choices before activation.",
  }),
});

export const ADAPTIVE_EVENT_CONTRACT_MANIFEST = Object.freeze({
  schemaVersion: ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
  eventNames: Object.values(ADAPTIVE_LEARNING_EVENT_NAMES),
});

export const ADAPTIVE_STORAGE_MANIFEST = Object.freeze({
  storeModel: ADAPTIVE_LEARNING_STORE_MODEL,
  storageKey: ADAPTIVE_LEARNING_STORAGE_KEY,
  replayStrategy: "local_first_buffer_then_cloud_replay_and_optional_server_ingest",
});

export const ADAPTIVE_ANALYSIS_MANIFEST = Object.freeze({
  defaultOptions: DEFAULT_ADAPTIVE_LEARNING_ANALYSIS_OPTIONS,
  shadowHoldoutPercentage: DEFAULT_ADAPTIVE_POLICY_SHADOW_HOLDOUT_PERCENTAGE,
  shadowMinCohortSample: DEFAULT_ADAPTIVE_POLICY_SHADOW_MIN_COHORT_SAMPLE,
  shadowPromotionThresholds: DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS,
});

export const ADAPTIVE_FOLLOW_UP_BACKLOG = Object.freeze([
  "Live-verify the dedicated adaptive event sink against a real Supabase environment, then reduce long-term dependence on the main trainer payload for adaptive history.",
  "Run the real staging adaptive evaluation workflow on exported non-fixture data and archive the first operator-reviewed launch-readiness report.",
  "Add rollout metrics to launch dashboards once a real shadow dataset exists in staging or production.",
  "Expand the trusted-local adaptive diagnostics panel once real staging shadow data exists, so it shows rollout evidence instead of fixture-only readiness.",
]);

export const resolveAdaptiveLearningScaffolding = ({
  personalization = {},
  adaptiveLearningConfig = null,
  adaptivePolicyConfig = null,
  adaptivePolicyEvidence = null,
} = {}) => {
  const settingsRoot = personalization?.settings?.adaptiveLearning || personalization?.adaptiveLearning || {};
  const legacyPolicySettings = personalization?.settings?.adaptivePolicy || personalization?.adaptivePolicy || {};
  const resolvedAdaptiveLearningConfig = adaptiveLearningConfig && typeof adaptiveLearningConfig === "object"
    ? adaptiveLearningConfig
    : settingsRoot;
  const explicitPolicyOverride = adaptivePolicyConfig && typeof adaptivePolicyConfig === "object"
    ? adaptivePolicyConfig
    : null;
  const usingAdaptiveLearningFlags = Boolean(
    resolvedAdaptiveLearningConfig && Object.keys(resolvedAdaptiveLearningConfig).length
  );
  const globalFlags = resolveGlobalFlagBlock(resolvedAdaptiveLearningConfig || {});
  const decisionPointFlags = sanitizeDecisionPointFlags(resolvedAdaptiveLearningConfig?.decisionPoints || {});
  const policyConfigFromScaffolding = {
    mode: globalFlags.mode,
    thresholds: resolvedAdaptiveLearningConfig?.thresholds || {},
    decisionPoints: buildDecisionPointPolicySettings({
      flags: decisionPointFlags,
      globalFlags,
    }),
  };
  const effectivePolicyConfig = explicitPolicyOverride
    ? explicitPolicyOverride
    : usingAdaptiveLearningFlags
    ? policyConfigFromScaffolding
    : legacyPolicySettings;
  const policyRuntime = resolveAdaptivePolicyRuntime({
    personalization,
    adaptivePolicyConfig: effectivePolicyConfig,
    adaptivePolicyEvidence,
  });
  const decisionPointRegistry = buildDecisionPointRegistry({ decisionPointFlags });
  return {
    launchStage: ADAPTIVE_LEARNING_LAUNCH_STAGE,
    activationSource: explicitPolicyOverride
      ? "explicit_override"
      : usingAdaptiveLearningFlags
      ? "adaptive_learning_flags"
      : "legacy_policy_settings",
    flags: {
      ...globalFlags,
      decisionPoints: decisionPointFlags,
      effectivePolicyMode: policyRuntime.mode,
      diagnosticsGate: ADAPTIVE_DIAGNOSTICS_GATES.trustedLocalDebugOnly,
    },
    policyConfig: effectivePolicyConfig,
    policyRuntime,
    decisionPointRegistry,
    eventContracts: ADAPTIVE_EVENT_CONTRACT_MANIFEST,
    storage: ADAPTIVE_STORAGE_MANIFEST,
    analysis: ADAPTIVE_ANALYSIS_MANIFEST,
    evaluationPipelines: ADAPTIVE_EVALUATION_PIPELINE_REGISTRY,
  };
};

export const shouldExposeAdaptiveDiagnostics = ({
  scaffolding = null,
  trustedLocalDebug = false,
} = {}) => Boolean(scaffolding?.flags?.internalDiagnostics) && Boolean(trustedLocalDebug);

export const buildAdaptivePolicyProposalTemplate = ({
  id = "",
  label = "",
  owner = "weekly_intent",
} = {}) => ({
  id: sanitizeSlug(id || "new_adaptive_decision_point", 80) || "new_adaptive_decision_point",
  label: sanitizeText(label || "New adaptive decision point", 120) || "New adaptive decision point",
  owner: sanitizeSlug(owner, 40) || "weekly_intent",
  safeLeverType: "",
  allowedActionIds: [],
  requiredContextInputs: [],
  safetyExclusions: [],
  fallbackActionId: "",
  evidencePlan: {
    shadowEvaluationScript: ADAPTIVE_EVALUATION_PIPELINE_REGISTRY.shadowEvaluation.script,
    minimumSampleSize: DEFAULT_ADAPTIVE_POLICY_SHADOW_PROMOTION_THRESHOLDS.minRows,
    harmfulCohortsMustBeZero: true,
  },
  testsRequired: [
    "out_of_bounds_protection",
    "safety_exclusion_priority",
    "shadow_mode_logging",
    "active_mode_fallback",
    "cross_surface_explanation_consistency",
  ],
});

export const buildAdaptiveScaffoldingManifest = ({
  personalization = {},
  adaptiveLearningConfig = null,
  adaptivePolicyConfig = null,
  adaptivePolicyEvidence = null,
} = {}) => {
  const scaffolding = resolveAdaptiveLearningScaffolding({
    personalization,
    adaptiveLearningConfig,
    adaptivePolicyConfig,
    adaptivePolicyEvidence,
  });
  return {
    launchStage: scaffolding.launchStage,
    activationSource: scaffolding.activationSource,
    flags: scaffolding.flags,
    eventContracts: scaffolding.eventContracts,
    storage: scaffolding.storage,
    analysis: scaffolding.analysis,
    evaluationPipelines: scaffolding.evaluationPipelines,
    decisionPointRegistry: scaffolding.decisionPointRegistry,
  };
};
