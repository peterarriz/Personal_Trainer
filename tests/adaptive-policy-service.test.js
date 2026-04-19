const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADAPTIVE_POLICY_DECISION_POINTS,
  ADAPTIVE_POLICY_MODES,
  resolveAdaptivePolicyRuntime,
  scoreAdaptiveDecision,
} = require("../src/services/adaptive-policy-service.js");
const {
  buildPlanWeek,
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

const buildRuntime = ({
  mode = ADAPTIVE_POLICY_MODES.active,
  rules = [],
  decisionPoints = {},
} = {}) => resolveAdaptivePolicyRuntime({
  adaptivePolicyConfig: { mode, decisionPoints },
  adaptivePolicyEvidence: { version: 1, rules },
});

test("scoreAdaptiveDecision never chooses an out-of-bounds action", () => {
  const runtime = buildRuntime({
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id,
        actionId: "imaginary_action",
        confidenceScore: 95,
        effectSize: 0.22,
        sampleSize: 18,
        summary: "Should never be picked.",
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id,
    defaultActionId: "default_structure",
    candidateActionIds: ["default_structure", "short_separate_sessions"],
    context: { timeCrunched: true },
    runtime,
  });

  assert.equal(decision.chosenActionId, "default_structure");
  assert.equal(decision.candidateScores.every((candidate) => candidate.actionId !== "imaginary_action"), true);
});

test("scoreAdaptiveDecision lets safety exclusions win over stronger evidence", () => {
  const runtime = buildRuntime({
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id,
        actionId: "progressive_band",
        confidenceScore: 92,
        effectSize: 0.19,
        sampleSize: 20,
        summary: "Progressive weeks outperformed for this cohort.",
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id,
    defaultActionId: "default_band",
    candidateActionIds: ["default_band", "progressive_band"],
    context: { primaryGoalCategory: "running" },
    runtime,
    excludedCandidates: { progressive_band: "safety_constraints_active" },
  });

  assert.equal(decision.chosenActionId, "default_band");
  assert.equal(decision.candidateScores.find((candidate) => candidate.actionId === "progressive_band")?.excluded, true);
});

test("scoreAdaptiveDecision keeps the default in shadow mode while logging the top action", () => {
  const runtime = buildRuntime({
    mode: ADAPTIVE_POLICY_MODES.shadow,
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id,
        actionId: "conservative_band",
        confidenceScore: 88,
        effectSize: 0.16,
        sampleSize: 14,
        summary: "Controlled progression improved adherence.",
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id,
    defaultActionId: "default_band",
    candidateActionIds: ["default_band", "conservative_band"],
    context: { primaryGoalCategory: "running" },
    runtime,
  });

  assert.equal(decision.chosenActionId, "default_band");
  assert.equal(decision.shadowTopActionId, "conservative_band");
  assert.equal(decision.fallbackReason, "shadow_mode");
  assert.match(decision.explanation, /Shadow mode/i);
});

test("scoreAdaptiveDecision falls back cleanly on low confidence", () => {
  const runtime = buildRuntime({
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow.id,
        actionId: "pull_forward_deload",
        confidenceScore: 34,
        effectSize: 0.05,
        sampleSize: 3,
        summary: "Tiny sample should not move the plan.",
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow.id,
    defaultActionId: "keep_current_window",
    candidateActionIds: ["keep_current_window", "pull_forward_deload"],
    context: { travelHeavy: true, painSensitive: true },
    runtime,
  });

  assert.equal(decision.chosenActionId, "keep_current_window");
  assert.equal(decision.fallbackReason, "insufficient_confidence");
});

test("scoreAdaptiveDecision explanations stay aligned with the actual chosen action", () => {
  const runtime = buildRuntime({
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id,
        actionId: "outdoor_endurance_substitutions",
        confidenceScore: 90,
        effectSize: 0.2,
        sampleSize: 16,
        summary: "Outdoor substitutions preserved follow-through during travel.",
        matchers: { travelHeavy: true, outdoorPreferred: true },
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id,
    defaultActionId: "default_substitutions",
    candidateActionIds: ["default_substitutions", "outdoor_endurance_substitutions"],
    context: { travelHeavy: true, outdoorPreferred: true, primaryGoalCategory: "running" },
    runtime,
  });

  assert.equal(decision.chosenActionId, "outdoor_endurance_substitutions");
  assert.match(decision.explanation, /outdoor endurance substitutions/i);
});

test("scoreAdaptiveDecision supports per-decision-point shadow overrides", () => {
  const runtime = buildRuntime({
    mode: ADAPTIVE_POLICY_MODES.active,
    decisionPoints: {
      [ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow.id]: {
        mode: ADAPTIVE_POLICY_MODES.shadow,
      },
    },
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow.id,
        actionId: "pull_forward_deload",
        confidenceScore: 87,
        effectSize: 0.13,
        sampleSize: 16,
        summary: "Earlier deloads reduced drop-off for this cohort.",
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow.id,
    defaultActionId: "keep_current_window",
    candidateActionIds: ["keep_current_window", "pull_forward_deload"],
    context: { travelHeavy: true, painSensitive: true },
    runtime,
  });

  assert.equal(decision.mode, ADAPTIVE_POLICY_MODES.active);
  assert.equal(decision.decisionMode, ADAPTIVE_POLICY_MODES.shadow);
  assert.equal(decision.chosenActionId, "keep_current_window");
  assert.equal(decision.shadowTopActionId, "pull_forward_deload");
  assert.equal(decision.fallbackReason, "shadow_mode");
});

test("scoreAdaptiveDecision supports per-decision-point disable flags", () => {
  const runtime = buildRuntime({
    mode: ADAPTIVE_POLICY_MODES.active,
    decisionPoints: {
      [ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id]: false,
    },
    rules: [
      {
        decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id,
        actionId: "minimal_equipment_substitutions",
        confidenceScore: 91,
        effectSize: 0.16,
        sampleSize: 18,
        summary: "Minimal-equipment swaps helped travel-heavy users finish more sessions.",
      },
    ],
  });

  const decision = scoreAdaptiveDecision({
    decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet.id,
    defaultActionId: "default_substitutions",
    candidateActionIds: ["default_substitutions", "minimal_equipment_substitutions"],
    context: { travelHeavy: true, environmentMode: "travel" },
    runtime,
  });

  assert.equal(decision.chosenActionId, "default_substitutions");
  assert.equal(decision.fallbackReason, "decision_point_disabled");
  assert.equal(decision.decisionMode, ADAPTIVE_POLICY_MODES.deterministicOnly);
});

test("composeGoalNativePlan stays deterministic when the adaptive layer is disabled", () => {
  const goals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
    { name: "Keep lifting", category: "strength", priority: 2 },
  ]);

  const baseline = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
  });

  const deterministic = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.deterministicOnly },
  });

  assert.deepEqual(deterministic.dayTemplates, baseline.dayTemplates);
});

test("composeGoalNativePlan applies only the approved time-crunched rerank in active mode", () => {
  const goals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
    { name: "Get stronger", category: "strength", priority: 2 },
  ]);

  const composer = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.active },
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id,
          actionId: "short_separate_sessions",
          confidenceScore: 91,
          effectSize: 0.17,
          sampleSize: 18,
          summary: "Time-crunched athletes finish more weeks when strength and conditioning stay concise instead of sprawling.",
          matchers: {
            timeCrunched: true,
          },
        },
      ],
    },
  });

  const formatTrace = composer.adaptivePolicyTraces.find((trace) => trace.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id);
  assert.equal(formatTrace?.chosenActionId, "short_separate_sessions");
  const strengthDoses = Object.values(composer.dayTemplates || {}).map((session) => String(session?.strengthDose || ""));
  assert.equal(strengthDoses.some((value) => /20-30 min concise strength/i.test(value)), true);
});

test("composeGoalNativePlan keeps user-facing prescriptions unchanged in shadow mode while still logging the adaptive preference", () => {
  const goals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
    { name: "Get stronger", category: "strength", priority: 2 },
  ]);

  const baseline = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
  });

  const shadow = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.shadow },
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id,
          actionId: "short_separate_sessions",
          confidenceScore: 92,
          effectSize: 0.18,
          sampleSize: 22,
          summary: "Busy hybrid users finish more often when session pieces stay concise.",
          matchers: {
            timeCrunched: true,
          },
        },
      ],
    },
  });

  assert.deepEqual(shadow.dayTemplates, baseline.dayTemplates);
  const trace = shadow.adaptivePolicyTraces.find((entry) => entry.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice.id);
  assert.equal(trace?.fallbackReason, "shadow_mode");
  assert.equal(trace?.shadowTopActionId, "short_separate_sessions");
});

test("buildPlanWeek carries adaptive policy traces into the weekly intent", () => {
  const goals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
  ]);

  const composer = composeGoalNativePlan({
    goals,
    personalization: {
      userGoalProfile: { days_per_week: 4, session_length: "45" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.active },
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id,
          actionId: "conservative_band",
          confidenceScore: 90,
          effectSize: 0.18,
          sampleSize: 20,
          summary: "Controlled progression improved four-week adherence for this cohort.",
          matchers: {
            primaryGoalCategories: ["running"],
            scheduleReliabilities: ["variable"],
          },
        },
      ],
    },
  });

  const planWeek = buildPlanWeek({
    weekNumber: 1,
    template: BASE_WEEK,
    weekTemplates: WEEK_TEMPLATES,
    goals,
    architecture: composer.architecture,
    programBlock: composer.programBlock,
    programContext: composer.programContext,
    sessionsByDay: composer.dayTemplates,
  });

  const progressionTrace = planWeek.adaptivePolicyTraces.find((trace) => trace.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand.id);
  assert.equal(progressionTrace?.chosenActionId, "conservative_band");
  assert.equal(planWeek.aggressionLevel, "controlled");
  assert.match(planWeek.adaptivePolicySummary || "", /controlled progression/i);
});

test("composeGoalNativePlan applies hybrid session format reranks only for meaningful hybrid users", () => {
  const hybridGoals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
    { name: "Get stronger", category: "strength", priority: 2 },
  ]);
  const runOnlyGoals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
  ]);

  const hybridComposer = composeGoalNativePlan({
    goals: hybridGoals,
    personalization: {
      userGoalProfile: { days_per_week: 4, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "high" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.active },
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id,
          actionId: "favor_short_split_sessions",
          confidenceScore: 90,
          effectSize: 0.16,
          sampleSize: 18,
          summary: "Busy hybrid users finished more when the run and lift work stayed in shorter separate blocks.",
          matchers: {
            hybridMeaningful: true,
            hybridCohort: "inconsistent_schedule_hybrid",
          },
        },
      ],
    },
  });
  const runOnlyComposer = composeGoalNativePlan({
    goals: runOnlyGoals,
    personalization: {
      userGoalProfile: { days_per_week: 4, session_length: "30" },
    },
    momentum: { inconsistencyRisk: "high" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.active },
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id,
          actionId: "favor_short_split_sessions",
          confidenceScore: 90,
          effectSize: 0.16,
          sampleSize: 18,
          summary: "Should never affect run-only plans.",
          matchers: {
            hybridMeaningful: true,
          },
        },
      ],
    },
  });

  const hybridTrace = hybridComposer.adaptivePolicyTraces.find((trace) => trace.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id);
  const runOnlyTrace = runOnlyComposer.adaptivePolicyTraces.find((trace) => trace.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice.id);

  assert.equal(hybridTrace?.chosenActionId, "favor_short_split_sessions");
  assert.equal(runOnlyTrace?.chosenActionId, "keep_current_structure");
  assert.equal(runOnlyTrace?.fallbackReason, "insufficient_evidence");
});

test("buildPlanWeek can pull the hybrid deload forward without affecting non-hybrid weeks", () => {
  const hybridGoals = buildGoals([
    { name: "Run a strong 10K", category: "running", priority: 1 },
    { name: "Get stronger", category: "strength", priority: 2 },
  ]);
  const hybridComposer = composeGoalNativePlan({
    goals: hybridGoals,
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    momentum: { inconsistencyRisk: "medium" },
    learningLayer: {},
    baseWeek: BASE_WEEK,
    currentWeek: 1,
    weekTemplates: WEEK_TEMPLATES,
    adaptivePolicyConfig: { mode: ADAPTIVE_POLICY_MODES.active },
    adaptivePolicyEvidence: {
      version: 1,
      rules: [
        {
          decisionPointId: ADAPTIVE_POLICY_DECISION_POINTS.hybridDeloadTimingWindow.id,
          actionId: "pull_forward_hybrid_deload",
          confidenceScore: 87,
          effectSize: 0.14,
          sampleSize: 16,
          summary: "Hybrid users with stacked run and lift peaks recovered better when the easier week arrived sooner.",
          matchers: {
            hybridMeaningful: true,
            hybridRunBuildPhase: "build_phase",
          },
        },
      ],
    },
  });

  const hybridWeek = buildPlanWeek({
    weekNumber: 1,
    template: BASE_WEEK,
    weekTemplates: WEEK_TEMPLATES,
    goals: hybridGoals,
    architecture: hybridComposer.architecture,
    programBlock: hybridComposer.programBlock,
    programContext: hybridComposer.programContext,
    sessionsByDay: hybridComposer.dayTemplates,
  });

  const hybridDeloadTrace = hybridWeek.adaptivePolicyTraces.find((trace) => trace.decisionPointId === ADAPTIVE_POLICY_DECISION_POINTS.hybridDeloadTimingWindow.id);
  assert.equal(hybridDeloadTrace?.chosenActionId, "pull_forward_hybrid_deload");
  assert.equal(hybridWeek.recoveryBias, "high");
  assert.match(hybridWeek.adaptivePolicySummary || "", /hybrid deload timing window|easier week arrived sooner/i);
});
