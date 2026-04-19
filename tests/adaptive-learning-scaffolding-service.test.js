const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADAPTIVE_EVALUATION_PIPELINE_REGISTRY,
  ADAPTIVE_LEARNING_FLAG_DEFAULTS,
  ADAPTIVE_POLICY_DECISION_POINT_STAGES,
  buildAdaptivePolicyProposalTemplate,
  resolveAdaptiveLearningScaffolding,
  shouldExposeAdaptiveDiagnostics,
} = require("../src/services/adaptive-learning-scaffolding-service.js");
const {
  ADAPTIVE_POLICY_DECISION_POINTS,
  ADAPTIVE_POLICY_MODES,
} = require("../src/services/adaptive-policy-service.js");
const {
  composeGoalNativePlan,
  normalizeGoals,
} = require("../src/modules-planning.js");

const BASE_WEEK = {
  phase: "BUILD",
  label: "Sharpen",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "25 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "55 min" },
  str: "A",
  nutri: "hardRun",
};

const WEEK_TEMPLATES = [BASE_WEEK];

const buildGoals = (goalDefs = []) => normalizeGoals(goalDefs.map((goal, index) => ({
  id: goal.id || `goal_${index + 1}`,
  name: goal.name,
  category: goal.category || "general_fitness",
  active: goal.active !== false,
  priority: goal.priority || index + 1,
  targetDate: goal.targetDate || "",
  measurableTarget: goal.measurableTarget || "",
  resolvedGoal: goal.resolvedGoal || null,
})));

test("adaptive learning scaffolding defaults to launch-safe deterministic mode", () => {
  const scaffolding = resolveAdaptiveLearningScaffolding();

  assert.equal(scaffolding.flags.globalEnable, ADAPTIVE_LEARNING_FLAG_DEFAULTS.globalEnable);
  assert.equal(scaffolding.flags.effectivePolicyMode, ADAPTIVE_POLICY_MODES.deterministicOnly);
  assert.equal(scaffolding.flags.internalDiagnostics, false);
  assert.equal(Array.isArray(scaffolding.decisionPointRegistry), true);
  assert.equal(
    scaffolding.decisionPointRegistry.some((entry) => entry.id === ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id),
    true
  );
});

test("adaptive learning scaffolding resolves the new shadow-mode flag path without changing defaults elsewhere", () => {
  const scaffolding = resolveAdaptiveLearningScaffolding({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: true,
          mode: ADAPTIVE_POLICY_MODES.shadow,
          internalDiagnostics: true,
          decisionPoints: {
            [ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id]: {
              enabled: true,
              rolloutMode: "inherit",
              stage: ADAPTIVE_POLICY_DECISION_POINT_STAGES.shadowReady,
            },
          },
        },
      },
    },
  });

  assert.equal(scaffolding.activationSource, "adaptive_learning_flags");
  assert.equal(scaffolding.flags.globalEnable, true);
  assert.equal(scaffolding.flags.shadowMode, true);
  assert.equal(scaffolding.flags.effectivePolicyMode, ADAPTIVE_POLICY_MODES.shadow);
  assert.equal(scaffolding.flags.internalDiagnostics, true);
  assert.equal(
    scaffolding.decisionPointRegistry.find((entry) => entry.id === ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id)?.stage,
    ADAPTIVE_POLICY_DECISION_POINT_STAGES.shadowReady
  );
});

test("adaptive learning scaffolding keeps the policy off when global enable is false", () => {
  const scaffolding = resolveAdaptiveLearningScaffolding({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: false,
          mode: ADAPTIVE_POLICY_MODES.active,
          decisionPoints: {
            [ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id]: {
              enabled: true,
              rolloutMode: ADAPTIVE_POLICY_MODES.active,
            },
          },
        },
      },
    },
  });

  assert.equal(scaffolding.flags.globalEnable, false);
  assert.equal(scaffolding.flags.activeMode, false);
  assert.equal(scaffolding.flags.effectivePolicyMode, ADAPTIVE_POLICY_MODES.deterministicOnly);
});

test("explicit adaptive policy overrides still work for evaluation and tests", () => {
  const scaffolding = resolveAdaptiveLearningScaffolding({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: false,
        },
      },
    },
    adaptivePolicyConfig: {
      mode: ADAPTIVE_POLICY_MODES.active,
    },
  });

  assert.equal(scaffolding.activationSource, "explicit_override");
  assert.equal(scaffolding.flags.effectivePolicyMode, ADAPTIVE_POLICY_MODES.active);
});

test("adaptive internal diagnostics stay gated behind trusted local debug", () => {
  const scaffolding = resolveAdaptiveLearningScaffolding({
    personalization: {
      settings: {
        adaptiveLearning: {
          globalEnable: true,
          mode: ADAPTIVE_POLICY_MODES.shadow,
          internalDiagnostics: true,
        },
      },
    },
  });

  assert.equal(shouldExposeAdaptiveDiagnostics({ scaffolding, trustedLocalDebug: false }), false);
  assert.equal(shouldExposeAdaptiveDiagnostics({ scaffolding, trustedLocalDebug: true }), true);
});

test("adaptive policy proposal template stays bounded and points at the shadow evaluator", () => {
  const proposal = buildAdaptivePolicyProposalTemplate({
    id: "simple_session_packaging",
    label: "Simple session packaging",
  });

  assert.equal(proposal.id, "simple_session_packaging");
  assert.equal(proposal.label, "Simple session packaging");
  assert.equal(proposal.evidencePlan.shadowEvaluationScript, ADAPTIVE_EVALUATION_PIPELINE_REGISTRY.shadowEvaluation.script);
  assert.equal(proposal.testsRequired.includes("shadow_mode_logging"), true);
});

test("composeGoalNativePlan can activate shadow mode through the new adaptiveLearning settings path", () => {
  const goals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
    { name: "Get stronger", category: "strength", priority: 2 },
  ]);

  const composer = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
      settings: {
        adaptiveLearning: {
          globalEnable: true,
          mode: ADAPTIVE_POLICY_MODES.shadow,
          decisionPoints: {
            [ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id]: {
              enabled: true,
              rolloutMode: "inherit",
            },
          },
        },
      },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id,
          actionId: "short_separate_sessions",
          confidenceScore: 91,
          effectSize: 0.18,
          sampleSize: 20,
          summary: "Busy athletes finish more when the session stays concise.",
          matchers: {
            timeCrunched: true,
          },
        },
      ],
    },
  });

  const trace = composer.adaptivePolicyTraces.find((entry) => entry.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id);
  assert.equal(trace?.decisionMode, ADAPTIVE_POLICY_MODES.shadow);
  assert.equal(trace?.fallbackReason, "shadow_mode");
  assert.equal(trace?.shadowTopActionId, "short_separate_sessions");
});
