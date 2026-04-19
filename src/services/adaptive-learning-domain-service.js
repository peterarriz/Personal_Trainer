import {
  ADAPTIVE_ADHERENCE_OUTCOMES,
  ADAPTIVE_OUTCOME_KINDS,
  ADAPTIVE_RECOMMENDATION_KINDS,
  buildRecommendationJoinKey,
} from "./adaptive-learning-event-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength).toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toFiniteInteger = (value, fallback = 0) => {
  const parsed = toFiniteNumber(value, fallback);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const buildGoalStack = (goals = []) => (
  toArray(goals)
    .filter((goal) => goal?.active !== false)
    .map((goal, index) => ({
      id: sanitizeText(goal?.id || goal?.resolvedGoal?.id || `goal_${index + 1}`, 120),
      summary: sanitizeText(goal?.resolvedGoal?.summary || goal?.summary || goal?.name || goal?.title || `Goal ${index + 1}`, 180),
      category: sanitizeSlug(goal?.category || goal?.resolvedGoal?.planningCategory || goal?.resolvedGoal?.goalFamily || "general", 60) || "general",
      priority: Math.max(1, toFiniteInteger(goal?.priority ?? goal?.resolvedGoal?.planningPriority, index + 1) || (index + 1)),
      active: goal?.active !== false,
    }))
    .slice(0, 8)
);

const buildCommonPlanStage = ({
  currentPhase = "",
  currentWeek = 1,
  currentDay = 0,
  dateKey = "",
  planWeekId = "",
  planDayId = "",
} = {}) => ({
  currentPhase: sanitizeText(currentPhase, 40),
  currentWeek: Math.max(1, toFiniteInteger(currentWeek, 1) || 1),
  currentDay: Math.max(0, Math.min(6, toFiniteInteger(currentDay, 0) || 0)),
  dateKey: sanitizeText(dateKey, 24),
  planWeekId: sanitizeText(planWeekId, 120),
  planDayId: sanitizeText(planDayId, 120),
});

const buildProvenanceSummary = ({
  source = "",
  actor = "",
  summary = "",
  keyDrivers = [],
} = {}) => ({
  source: sanitizeSlug(source || actor || "deterministic_engine", 80) || "deterministic_engine",
  actor: sanitizeSlug(actor || "", 80),
  summary: sanitizeText(summary || "", 220),
  keyDrivers: toArray(keyDrivers).map((item) => sanitizeText(item, 120)).filter(Boolean).slice(0, 8),
});

const buildContextualInputs = (value = {}) => {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value)
    .slice(0, 32)
    .reduce((acc, [key, entryValue]) => {
      const safeKey = sanitizeSlug(key, 60);
      if (!safeKey) return acc;
      if (entryValue == null) return acc;
      if (typeof entryValue === "string") {
        acc[safeKey] = sanitizeText(entryValue, 160);
        return acc;
      }
      if (typeof entryValue === "number" || typeof entryValue === "boolean") {
        acc[safeKey] = entryValue;
        return acc;
      }
      if (Array.isArray(entryValue)) {
        acc[safeKey] = entryValue.map((item) => sanitizeText(item, 80)).filter(Boolean).slice(0, 8);
      }
      return acc;
    }, {});
};

const buildCandidateOption = ({
  optionKey = "",
  label = "",
  source = "deterministic_engine",
  accepted = false,
  details = {},
} = {}) => ({
  optionKey: sanitizeSlug(optionKey || label, 120) || "option",
  label: sanitizeText(label || optionKey || "Option", 160),
  source: sanitizeSlug(source, 80) || "deterministic_engine",
  accepted: Boolean(accepted),
  details: buildContextualInputs(details || {}),
});

const ADAPTIVE_POLICY_SHADOW_CONTEXT_KEYS = Object.freeze([
  "primaryGoalCategory",
  "architecture",
  "planArchetypeId",
  "experienceLevel",
  "scheduleReliability",
  "environmentMode",
  "equipmentAccess",
  "sessionDuration",
  "trainingDaysPerWeek",
  "hybridAthlete",
  "hybridMeaningful",
  "hybridCohort",
  "hybridHardDayBand",
  "hybridMixedSessionBand",
  "hybridRunBuildPhase",
  "hybridRecoveryRisk",
  "hybridLowerBodyGuardNeeded",
  "travelHeavy",
  "timeCrunched",
  "painSensitive",
  "runningGoalActive",
  "strengthGoalActive",
  "physiqueGoalActive",
  "strengthOrPhysiqueGoalActive",
  "strengthPriority",
  "outdoorPreferred",
  "weeklyStressState",
  "reEntry",
  "cutbackWeek",
]);

const buildHybridAdaptiveContextualInputs = (adaptivePolicyShadow = null) => {
  const decisions = toArray(adaptivePolicyShadow?.decisions);
  if (!decisions.length) return {};
  const contextKeyMap = {
    hybridMeaningful: "hybrid_meaningful",
    hybridCohort: "hybrid_cohort",
    hybridHardDayBand: "hybrid_hard_day_band",
    hybridMixedSessionBand: "hybrid_mixed_session_band",
    hybridRunBuildPhase: "hybrid_run_build_phase",
    hybridRecoveryRisk: "hybrid_recovery_risk",
    hybridLowerBodyGuardNeeded: "hybrid_lower_body_guard_needed",
    physiqueGoalActive: "physique_goal_active",
    strengthOrPhysiqueGoalActive: "strength_or_physique_goal_active",
  };
  const contextFields = [
    "hybridMeaningful",
    "hybridCohort",
    "hybridHardDayBand",
    "hybridMixedSessionBand",
    "hybridRunBuildPhase",
    "hybridRecoveryRisk",
    "hybridLowerBodyGuardNeeded",
    "physiqueGoalActive",
    "strengthOrPhysiqueGoalActive",
  ].reduce((acc, key) => {
    const sourceDecision = decisions.find((decision) => decision?.contextSnapshot?.[key] !== undefined && decision?.contextSnapshot?.[key] !== "");
    if (!sourceDecision) return acc;
    acc[contextKeyMap[key] || key] = sourceDecision.contextSnapshot[key];
    return acc;
  }, {});
  const findDecisionAction = (decisionPointId = "") => {
    const decision = decisions.find((entry) => sanitizeSlug(entry?.decisionPointId || "", 80) === sanitizeSlug(decisionPointId, 80));
    if (!decision) return "";
    return sanitizeSlug(
      decision?.usedAdaptiveChoice
        ? decision?.chosenActionId
        : decision?.shadowTopActionId || decision?.chosenActionId || "",
      120
    );
  };
  return buildContextualInputs({
    ...contextFields,
    hybrid_session_format_action: findDecisionAction("hybrid_session_format_choice"),
    hybrid_balance_action: findDecisionAction("hybrid_run_lift_balance_template"),
    hybrid_deload_action: findDecisionAction("hybrid_deload_timing_window"),
  });
};

const buildAdaptivePolicyShadowContextSnapshot = (value = {}) => ADAPTIVE_POLICY_SHADOW_CONTEXT_KEYS.reduce((acc, key) => {
  const entryValue = value?.[key];
  if (entryValue == null || entryValue === "") return acc;
  if (typeof entryValue === "string") {
    acc[key] = sanitizeText(entryValue, 120);
    return acc;
  }
  if (typeof entryValue === "number") {
    acc[key] = toFiniteNumber(entryValue, null);
    return acc;
  }
  if (typeof entryValue === "boolean") {
    acc[key] = entryValue;
    return acc;
  }
  return acc;
}, {});

const buildAdaptivePolicyShadowPayload = (traces = [], runtimeMode = "") => {
  const safeDecisions = toArray(traces)
    .filter((trace) => trace?.decisionPointId && trace?.defaultActionId)
    .map((trace) => ({
      decisionPointId: sanitizeSlug(trace?.decisionPointId || "", 80),
      mode: sanitizeSlug(trace?.mode || runtimeMode || "", 40),
      decisionMode: sanitizeSlug(trace?.decisionMode || trace?.mode || runtimeMode || "", 40),
      defaultActionId: sanitizeSlug(trace?.defaultActionId || "", 120),
      chosenActionId: sanitizeSlug(trace?.chosenActionId || "", 120),
      shadowTopActionId: sanitizeSlug(trace?.shadowTopActionId || "", 120),
      usedAdaptiveChoice: Boolean(trace?.usedAdaptiveChoice),
      fallbackReason: sanitizeSlug(trace?.fallbackReason || "", 80),
      contextSnapshot: buildAdaptivePolicyShadowContextSnapshot(trace?.contextSnapshot || {}),
      candidateScores: toArray(trace?.candidateScores).map((candidate) => ({
        actionId: sanitizeSlug(candidate?.actionId || "", 120),
        label: sanitizeText(candidate?.label || candidate?.actionId || "", 160),
        excluded: Boolean(candidate?.excluded),
        exclusionReason: sanitizeText(candidate?.exclusionReason || "", 160),
        score: typeof candidate?.score === "number" ? candidate.score : toFiniteNumber(candidate?.score, null),
        confidenceScore: Math.max(0, Math.min(100, toFiniteInteger(candidate?.confidenceScore, 0) || 0)),
        sampleSize: Math.max(0, toFiniteInteger(candidate?.sampleSize, 0) || 0),
        evidenceEffectSize: toFiniteNumber(candidate?.evidenceEffectSize, null),
        matchedRuleIds: toArray(candidate?.matchedRuleIds).map((item) => sanitizeText(item, 120)).filter(Boolean).slice(0, 12),
        matchedEvidenceSummaries: toArray(candidate?.matchedEvidenceSummaries).map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 6),
      })).filter((candidate) => candidate.actionId).slice(0, 12),
      explanation: sanitizeText(trace?.explanation || "", 240),
    }))
    .slice(0, 8);
  if (!safeDecisions.length) return null;
  return {
    runtimeMode: sanitizeSlug(runtimeMode || safeDecisions[0]?.mode || "", 40),
    decisions: safeDecisions,
  };
};

const resolveAdaptivePolicyShadowFromSources = (...sources) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const payload = buildAdaptivePolicyShadowPayload(
      source?.adaptivePolicyTraces || [],
      source?.adaptivePolicyRuntime?.mode || ""
    );
    if (payload) return payload;
  }
  return null;
};

const mapCompletionKindToAdherenceOutcome = (completionKind = "") => {
  const normalized = sanitizeSlug(completionKind, 80);
  if (normalized === "as_prescribed") return ADAPTIVE_ADHERENCE_OUTCOMES.asPrescribed;
  if (normalized === "modified" || normalized === "partial_completed") return ADAPTIVE_ADHERENCE_OUTCOMES.modified;
  if (normalized === "skipped") return ADAPTIVE_ADHERENCE_OUTCOMES.skipped;
  if (normalized === "custom_session") return ADAPTIVE_ADHERENCE_OUTCOMES.customSession;
  if (normalized === "recovery_day") return ADAPTIVE_ADHERENCE_OUTCOMES.recoveryDay;
  if (normalized === "pending") return ADAPTIVE_ADHERENCE_OUTCOMES.pending;
  return ADAPTIVE_ADHERENCE_OUTCOMES.unknown;
};

const resolveCompletionPercentage = (comparison = {}, checkin = {}) => {
  const completionKind = sanitizeSlug(comparison?.completionKind || checkin?.status || "", 80);
  if (completionKind === "as_prescribed" || completionKind === "completed_as_planned") return 1;
  if (completionKind === "modified" || completionKind === "partial_completed" || completionKind === "completed_modified") return 0.65;
  if (completionKind === "custom_session") return 0.45;
  if (completionKind === "recovery_day") return 1;
  if (completionKind === "pending") return 0;
  if (completionKind === "skipped") return 0;
  return 0;
};

const resolveSatisfactionSignal = (checkin = {}) => {
  const feel = sanitizeSlug(checkin?.sessionFeel || "", 80);
  if (feel === "easier_than_expected") return "positive";
  if (feel === "harder_than_expected") return "negative";
  if (feel === "about_right") return "neutral";
  return "";
};

const resolveFrustrationSignal = (checkin = {}) => {
  const blocker = sanitizeSlug(checkin?.blocker || "", 80);
  if (!blocker) return "";
  if (blocker === "pain_injury") return "pain";
  if (blocker === "time" || blocker === "schedule_travel") return "time";
  return blocker;
};

export const buildAdaptiveLearningIdentityFromSession = ({
  authSession = null,
  localActorId = "",
} = {}) => {
  const userId = sanitizeText(authSession?.user?.id || "", 120);
  return {
    actorId: userId || sanitizeText(localActorId || "", 120),
    userId,
    localActorId: sanitizeText(localActorId || userId, 120),
  };
};

export const buildPlanGenerationRecommendationEventInput = ({
  goals = [],
  planComposer = {},
  currentPlanWeek = null,
  currentWeek = 1,
  sourceSurface = "intake",
} = {}) => {
  if (!currentPlanWeek?.id && !planComposer?.architecture) return null;
  const adaptivePolicyShadow = resolveAdaptivePolicyShadowFromSources(currentPlanWeek, planComposer?.programContext, planComposer);
  const hybridAdaptiveInputs = buildHybridAdaptiveContextualInputs(adaptivePolicyShadow);
  const chosenOption = buildCandidateOption({
    optionKey: currentPlanWeek?.id || planComposer?.architecture || "plan_generation",
    label: currentPlanWeek?.label || planComposer?.programBlock?.label || "Generated plan",
    source: "deterministic_planner",
    accepted: true,
    details: {
      architecture: planComposer?.architecture || "",
      dominant_emphasis: currentPlanWeek?.programBlock?.dominantEmphasis?.label || planComposer?.programBlock?.dominantEmphasis?.label || "",
    },
  });
  return {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.planGeneration,
    recommendationJoinKey: buildRecommendationJoinKey({
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.planGeneration,
      planWeekId: currentPlanWeek?.id || "",
      weekNumber: currentPlanWeek?.weekNumber || currentWeek,
      chosenOption,
      fallbackSeed: planComposer?.architecture || currentPlanWeek?.label || "",
    }),
    goalStack: buildGoalStack(goals),
    planStage: buildCommonPlanStage({
      currentPhase: currentPlanWeek?.phase || "",
      currentWeek: currentPlanWeek?.weekNumber || currentWeek,
      planWeekId: currentPlanWeek?.id || "",
    }),
    contextualInputs: buildContextualInputs({
      architecture: planComposer?.architecture || "",
      program_block: currentPlanWeek?.programBlock?.label || planComposer?.programBlock?.label || "",
      support_tier: planComposer?.supportTier || "",
      fidelity_mode: planComposer?.planningBasis?.fidelityMode || "",
      onboarding_complete: true,
      ...hybridAdaptiveInputs,
    }),
    candidateOptionsConsidered: [
      buildCandidateOption({
        optionKey: planComposer?.architecture || "deterministic_planner",
        label: currentPlanWeek?.programBlock?.label || "Deterministic planning track",
        source: "deterministic_planner",
        details: {
          constraints: Array.isArray(currentPlanWeek?.constraints) ? currentPlanWeek.constraints.slice(0, 4) : [],
        },
      }),
    ],
    chosenOption,
    whyChosen: [
      currentPlanWeek?.summary || "",
      currentPlanWeek?.weeklyIntent?.focus || "",
      planComposer?.planningBasis?.planBasisExplanation?.todayLine || "",
    ].filter(Boolean),
    confidence: sanitizeText(currentPlanWeek?.planningBasis?.confidence || "", 40),
    provenance: buildProvenanceSummary({
      source: "deterministic_planner",
      summary: currentPlanWeek?.summary || planComposer?.changeSummary?.headline || "Generated the initial plan from the active goals and constraints.",
      keyDrivers: currentPlanWeek?.constraints || planComposer?.constraints || [],
    }),
    adaptivePolicyShadow,
    sourceSurface,
    owner: "planning",
  };
};

export const buildIntakeCompletionRecommendationEventInput = ({
  goals = [],
  personalization = {},
  sourceSurface = "intake",
} = {}) => {
  const goalStack = buildGoalStack(goals);
  const primaryGoal = goalStack[0] || null;
  if (!primaryGoal) return null;
  const chosenOption = buildCandidateOption({
    optionKey: primaryGoal.id || "intake_goal",
    label: primaryGoal.summary || "Intake goal confirmed",
    source: "intake_confirmation",
    accepted: true,
    details: {
      category: primaryGoal.category || "",
      training_days_per_week: personalization?.profile?.daysPerWeek || personalization?.userGoalProfile?.days_per_week || null,
    },
  });
  return {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.intakeCompletion,
    recommendationJoinKey: buildRecommendationJoinKey({
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.intakeCompletion,
      dateKey: new Date().toISOString().split("T")[0],
      chosenOption,
      fallbackSeed: primaryGoal.summary || primaryGoal.category || "",
    }),
    goalStack,
    planStage: buildCommonPlanStage({
      currentPhase: "",
      currentWeek: 1,
      currentDay: 0,
      dateKey: new Date().toISOString().split("T")[0],
    }),
    contextualInputs: buildContextualInputs({
      experience_level: personalization?.profile?.estimatedFitnessLevel || personalization?.profile?.fitnessLevel || "",
      environment_mode: personalization?.trainingContext?.environment?.value || personalization?.environmentConfig?.defaultMode || "",
      coaching_style: personalization?.profile?.coachingStyle || "",
      onboarding_complete: Boolean(personalization?.profile?.onboardingComplete),
    }),
    candidateOptionsConsidered: [
      buildCandidateOption({
        optionKey: primaryGoal.category || "goal_category",
        label: primaryGoal.summary || primaryGoal.category || "Primary goal",
        source: "intake_confirmation",
      }),
    ],
    chosenOption,
    whyChosen: [
      `Primary goal confirmed as ${primaryGoal.summary}.`,
      personalization?.profile?.onboardingComplete ? "Onboarding is complete." : "",
    ].filter(Boolean),
    confidence: "",
    provenance: buildProvenanceSummary({
      source: "intake_confirmation",
      summary: `Intake committed with ${primaryGoal.summary}.`,
      keyDrivers: [primaryGoal.category || ""],
    }),
    sourceSurface,
    owner: "intake",
  };
};

export const buildWeeklyPlanRefreshRecommendationEventInput = ({
  goals = [],
  currentPlanWeek = null,
  currentWeek = 1,
  dayOfWeek = 0,
  sourceSurface = "program",
} = {}) => {
  if (!currentPlanWeek?.id) return null;
  const adaptivePolicyShadow = resolveAdaptivePolicyShadowFromSources(currentPlanWeek, currentPlanWeek?.planWeek, currentPlanWeek?.programContext);
  const hybridAdaptiveInputs = buildHybridAdaptiveContextualInputs(adaptivePolicyShadow);
  const chosenOption = buildCandidateOption({
    optionKey: currentPlanWeek.id,
    label: currentPlanWeek.label || `Week ${currentWeek}`,
    source: "plan_week_runtime",
    accepted: true,
    details: {
      status: currentPlanWeek?.status || "planned",
      adjusted: Boolean(currentPlanWeek?.adjusted),
    },
  });
  return {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.weeklyPlanRefresh,
    recommendationJoinKey: buildRecommendationJoinKey({
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.weeklyPlanRefresh,
      planWeekId: currentPlanWeek.id,
      weekNumber: currentPlanWeek?.weekNumber || currentWeek,
      chosenOption,
      fallbackSeed: currentPlanWeek?.summary || "",
    }),
    goalStack: buildGoalStack(goals),
    planStage: buildCommonPlanStage({
      currentPhase: currentPlanWeek?.phase || "",
      currentWeek: currentPlanWeek?.weekNumber || currentWeek,
      currentDay: dayOfWeek,
      planWeekId: currentPlanWeek?.id || "",
    }),
    contextualInputs: buildContextualInputs({
      weekly_focus: currentPlanWeek?.weeklyIntent?.focus || "",
      weekly_summary: currentPlanWeek?.summary || "",
      adjusted: Boolean(currentPlanWeek?.adjusted),
      constraint_count: Array.isArray(currentPlanWeek?.constraints) ? currentPlanWeek.constraints.length : 0,
      ...hybridAdaptiveInputs,
    }),
    candidateOptionsConsidered: [
      buildCandidateOption({
        optionKey: currentPlanWeek?.programBlock?.dominantEmphasis?.category || currentPlanWeek?.phase || "current_week",
        label: currentPlanWeek?.programBlock?.dominantEmphasis?.label || currentPlanWeek?.summary || currentPlanWeek?.label || "Current week",
        source: "plan_week_runtime",
      }),
    ],
    chosenOption,
    whyChosen: [
      currentPlanWeek?.weeklyIntent?.rationale || "",
      currentPlanWeek?.summary || "",
      currentPlanWeek?.changeSummary?.headline || "",
    ].filter(Boolean),
    confidence: "",
    provenance: buildProvenanceSummary({
      source: "plan_week_runtime",
      summary: currentPlanWeek?.summary || "Refreshed the current week from the deterministic plan runtime.",
      keyDrivers: currentPlanWeek?.constraints || [],
    }),
    adaptivePolicyShadow,
    sourceSurface,
    owner: "planning",
  };
};

export const buildDayPrescriptionRecommendationEventInput = ({
  goals = [],
  planDay = null,
  currentWeek = 1,
  dayOfWeek = 0,
  sourceSurface = "today",
} = {}) => {
  if (!planDay?.dateKey) return null;
  const adaptivePolicyShadow = resolveAdaptivePolicyShadowFromSources(
    planDay,
    planDay?.week?.planWeek,
    planDay?.week?.planWeek?.planWeek,
    planDay?.week,
  );
  const hybridAdaptiveInputs = buildHybridAdaptiveContextualInputs(adaptivePolicyShadow);
  const resolvedTraining = planDay?.resolved?.training || {};
  const baseTraining = planDay?.base?.training || {};
  const chosenOption = buildCandidateOption({
    optionKey: planDay?.id || resolvedTraining?.label || resolvedTraining?.type || planDay?.dateKey,
    label: resolvedTraining?.label || resolvedTraining?.type || "Daily session",
    source: planDay?.decision?.source || "plan_day_resolution",
    accepted: true,
    details: {
      training_type: resolvedTraining?.type || "",
      run_type: resolvedTraining?.run?.t || "",
      nutrition_day: planDay?.resolved?.nutrition?.dayType || "",
      modified_from_base: Boolean(planDay?.decision?.modifiedFromBase),
    },
  });
  const comparisonLabel = baseTraining?.label && baseTraining?.label !== resolvedTraining?.label
    ? `${baseTraining?.label} -> ${resolvedTraining?.label}`
    : baseTraining?.label || resolvedTraining?.label || "";
  return {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
    recommendationJoinKey: buildRecommendationJoinKey({
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
      planWeekId: planDay?.week?.planWeekId || "",
      planDayId: planDay?.id || "",
      dateKey: planDay?.dateKey || "",
      weekNumber: planDay?.week?.currentWeek || currentWeek,
      chosenOption,
      fallbackSeed: comparisonLabel,
    }),
    goalStack: buildGoalStack(goals),
    planStage: buildCommonPlanStage({
      currentPhase: planDay?.week?.phase || "",
      currentWeek: planDay?.week?.currentWeek || currentWeek,
      currentDay: dayOfWeek,
      dateKey: planDay?.dateKey || "",
      planWeekId: planDay?.week?.planWeekId || "",
      planDayId: planDay?.id || "",
    }),
    contextualInputs: buildContextualInputs({
      decision_mode: planDay?.decision?.mode || "",
      readiness_state: planDay?.resolved?.recovery?.state || "",
      environment_note: resolvedTraining?.environmentNote || "",
      injury_modified: Boolean(planDay?.flags?.injuryModified),
      readiness_modified: Boolean(planDay?.flags?.readinessModified),
      nutrition_day: planDay?.resolved?.nutrition?.dayType || "",
      ...hybridAdaptiveInputs,
    }),
    candidateOptionsConsidered: [
      buildCandidateOption({
        optionKey: baseTraining?.label || baseTraining?.type || "base_plan",
        label: baseTraining?.label || baseTraining?.type || "Base plan",
        source: "base_plan",
        details: {
          training_type: baseTraining?.type || "",
        },
      }),
      buildCandidateOption({
        optionKey: resolvedTraining?.label || resolvedTraining?.type || "resolved_plan",
        label: resolvedTraining?.label || resolvedTraining?.type || "Resolved plan",
        source: planDay?.decision?.source || "plan_day_resolution",
        accepted: true,
        details: {
          training_type: resolvedTraining?.type || "",
        },
      }),
    ].filter(Boolean),
    chosenOption,
    whyChosen: [
      planDay?.provenance?.summary || "",
      ...(Array.isArray(planDay?.provenance?.keyDrivers) ? planDay.provenance.keyDrivers : []),
    ].filter(Boolean).slice(0, 8),
    confidence: sanitizeText(planDay?.decision?.confidence || "", 40),
    provenance: buildProvenanceSummary({
      source: planDay?.decision?.source || "plan_day_resolution",
      actor: planDay?.provenance?.events?.[0]?.actor || "",
      summary: planDay?.provenance?.summary || "",
      keyDrivers: planDay?.provenance?.keyDrivers || [],
    }),
    adaptivePolicyShadow,
    sourceSurface,
    owner: "planning",
  };
};

export const buildWorkoutAdjustmentRecommendationEventInput = ({
  goals = [],
  planDay = null,
  currentWeek = 1,
  dayOfWeek = 0,
  sourceSurface = "today",
} = {}) => {
  if (!planDay?.dateKey || !planDay?.decision?.modifiedFromBase) return null;
  return {
    ...buildDayPrescriptionRecommendationEventInput({
      goals,
      planDay,
      currentWeek,
      dayOfWeek,
      sourceSurface,
    }),
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.workoutAdjustment,
  };
};

export const buildNutritionRecommendationEventInput = ({
  goals = [],
  planDay = null,
  sourceSurface = "nutrition",
} = {}) => {
  const prescription = planDay?.resolved?.nutrition?.prescription || null;
  if (!planDay?.dateKey || !prescription) return null;
  const adaptivePolicyShadow = resolveAdaptivePolicyShadowFromSources(
    planDay,
    planDay?.week?.planWeek,
    planDay?.week,
  );
  const hybridAdaptiveInputs = buildHybridAdaptiveContextualInputs(adaptivePolicyShadow);
  const chosenOption = buildCandidateOption({
    optionKey: prescription?.dayType || "nutrition_day",
    label: prescription?.headline || prescription?.dayType || "Nutrition recommendation",
    source: "nutrition_engine",
    accepted: true,
    details: {
      calories: prescription?.targets?.cal || prescription?.targets?.calories || null,
      protein: prescription?.targets?.p || prescription?.targets?.protein || null,
      carbs: prescription?.targets?.c || prescription?.targets?.carbs || null,
      fat: prescription?.targets?.f || prescription?.targets?.fat || null,
    },
  });
  return {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.nutritionRecommendation,
    recommendationJoinKey: buildRecommendationJoinKey({
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.nutritionRecommendation,
      planWeekId: planDay?.week?.planWeekId || "",
      planDayId: planDay?.id || "",
      dateKey: planDay?.dateKey || "",
      weekNumber: planDay?.week?.currentWeek || 1,
      chosenOption,
      fallbackSeed: prescription?.dayType || "",
    }),
    goalStack: buildGoalStack(goals),
    planStage: buildCommonPlanStage({
      currentPhase: planDay?.week?.phase || "",
      currentWeek: planDay?.week?.currentWeek || 1,
      dateKey: planDay?.dateKey || "",
      planWeekId: planDay?.week?.planWeekId || "",
      planDayId: planDay?.id || "",
    }),
    contextualInputs: buildContextualInputs({
      training_type: planDay?.resolved?.training?.type || "",
      day_type: prescription?.dayType || "",
      hydration_target_oz: prescription?.targets?.hydrationTargetOz || null,
      ...hybridAdaptiveInputs,
    }),
    candidateOptionsConsidered: [
      buildCandidateOption({
        optionKey: prescription?.dayType || "nutrition_day",
        label: prescription?.headline || prescription?.dayType || "Nutrition prescription",
        source: "nutrition_engine",
      }),
    ],
    chosenOption,
    whyChosen: [
      prescription?.headline || "",
      prescription?.focus || "",
      planDay?.resolved?.nutrition?.comparison?.summary || "",
    ].filter(Boolean),
    confidence: "",
    provenance: buildProvenanceSummary({
      source: "nutrition_engine",
      summary: prescription?.headline || `Built a ${prescription?.dayType || "matched"} fueling day from the training demand.`,
      keyDrivers: [
        prescription?.dayType || "",
        planDay?.resolved?.training?.type || "",
      ],
    }),
    adaptivePolicyShadow,
    sourceSurface,
    owner: "nutrition",
  };
};

export const buildCoachSuggestionRecommendationEventInput = ({
  goals = [],
  action = null,
  planDay = null,
  displaySource = "coach",
  recommendation = "",
  why = "",
  likelyEffect = "",
} = {}) => {
  if (!action?.type) return null;
  const chosenOption = buildCandidateOption({
    optionKey: action?.type || "coach_action",
    label: recommendation || action?.type || "Coach suggestion",
    source: action?.proposalSource || action?.source || "coach",
    accepted: false,
    details: {
      display_source: displaySource,
      likely_effect: likelyEffect,
    },
  });
  return {
    recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.coachSuggestion,
    recommendationJoinKey: buildRecommendationJoinKey({
      recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.coachSuggestion,
      planWeekId: planDay?.week?.planWeekId || "",
      planDayId: planDay?.id || "",
      dateKey: planDay?.dateKey || "",
      weekNumber: planDay?.week?.currentWeek || 1,
      chosenOption,
      fallbackSeed: `${displaySource}|${why}|${likelyEffect}`,
    }),
    goalStack: buildGoalStack(goals),
    planStage: buildCommonPlanStage({
      currentPhase: planDay?.week?.phase || "",
      currentWeek: planDay?.week?.currentWeek || 1,
      dateKey: planDay?.dateKey || "",
      planWeekId: planDay?.week?.planWeekId || "",
      planDayId: planDay?.id || "",
    }),
    contextualInputs: buildContextualInputs({
      display_source: displaySource,
      action_type: action?.type || "",
      proposal_source: action?.proposalSource || action?.source || "",
    }),
    candidateOptionsConsidered: [
      buildCandidateOption({
        optionKey: action?.type || "coach_action",
        label: recommendation || action?.type || "Coach suggestion",
        source: action?.proposalSource || action?.source || "coach",
      }),
    ],
    chosenOption,
    whyChosen: [why, likelyEffect].filter(Boolean),
    confidence: "",
    provenance: buildProvenanceSummary({
      source: action?.proposalSource || action?.source || "coach",
      summary: why || recommendation || "Coach surfaced a deterministic adjustment option.",
      keyDrivers: [displaySource, action?.type || ""],
    }),
    sourceSurface: "coach",
    owner: "coach",
  };
};

export const buildWorkoutOutcomeEventInput = ({
  recommendationJoinKey = "",
  decisionId = "",
  dateKey = "",
  comparison = null,
  checkin = {},
  planDay = null,
  plannedDayRecord = null,
  actualLog = null,
  sourceSurface = "log",
} = {}) => {
  const effectiveComparison = comparison || {};
  const adherenceOutcome = mapCompletionKindToAdherenceOutcome(
    effectiveComparison?.completionKind || checkin?.status || ""
  );
  const actualSummary = sanitizeText(
    effectiveComparison?.summary
    || actualLog?.actualSession?.sessionLabel
    || actualLog?.type
    || "",
    220
  );
  const modifications = [];
  if (effectiveComparison?.differenceKind && effectiveComparison?.differenceKind !== "none" && effectiveComparison?.differenceKind !== "pending") {
    modifications.push(String(effectiveComparison.differenceKind).replace(/_/g, " "));
  }
  if (actualLog?.actualSession?.modifiedFromPlan) {
    modifications.push("modified from plan");
  }
  return {
    outcomeKind: adherenceOutcome === ADAPTIVE_ADHERENCE_OUTCOMES.skipped
      ? ADAPTIVE_OUTCOME_KINDS.missedWorkout
      : ADAPTIVE_OUTCOME_KINDS.workoutLog,
    recommendationJoinKey,
    decisionId,
    adherenceOutcome,
    completionPercentage: resolveCompletionPercentage(effectiveComparison, checkin),
    userModifications: modifications,
    perceivedDifficulty: sanitizeText(checkin?.sessionFeel || "", 80),
    painFlag: sanitizeSlug(checkin?.blocker || "", 80) === "pain_injury" || sanitizeSlug(planDay?.resolved?.recovery?.state || "", 80) === "recovery",
    painArea: sanitizeText(planDay?.resolved?.recovery?.actual?.painArea || "", 80),
    satisfactionSignal: resolveSatisfactionSignal(checkin),
    frustrationSignal: resolveFrustrationSignal(checkin),
    shortHorizonResultWindow: {
      windowDays: 3,
      reviewDateKey: sanitizeText(dateKey, 24),
      observedSignals: [
        sanitizeText(effectiveComparison?.severity || "", 80),
        sanitizeText(checkin?.sessionFeel || "", 80),
      ].filter(Boolean),
      summary: actualSummary,
    },
    actualSummary,
    sourceSurface,
    owner: "logging",
  };
};

export const buildNutritionOutcomeEventInput = ({
  recommendationJoinKey = "",
  decisionId = "",
  dateKey = "",
  actualNutritionLog = null,
  sourceSurface = "nutrition",
} = {}) => ({
  outcomeKind: ADAPTIVE_OUTCOME_KINDS.nutritionLog,
  recommendationJoinKey,
  decisionId,
  adherenceOutcome: actualNutritionLog?.deviationKind === "under_fueled"
    ? ADAPTIVE_ADHERENCE_OUTCOMES.modified
    : ADAPTIVE_ADHERENCE_OUTCOMES.asPrescribed,
  completionPercentage: actualNutritionLog?.deviationKind && actualNutritionLog?.deviationKind !== "matched" ? 0.65 : 1,
  userModifications: [
    actualNutritionLog?.deviationKind ? String(actualNutritionLog.deviationKind).replace(/_/g, " ") : "",
    actualNutritionLog?.issue || "",
  ].filter(Boolean),
  perceivedDifficulty: sanitizeText(actualNutritionLog?.difficulty || "", 80),
  painFlag: false,
  painArea: "",
  satisfactionSignal: sanitizeText(actualNutritionLog?.satisfaction || "", 80),
  frustrationSignal: sanitizeText(actualNutritionLog?.issue || "", 80),
  shortHorizonResultWindow: {
    windowDays: 2,
    reviewDateKey: sanitizeText(dateKey, 24),
    observedSignals: [
      actualNutritionLog?.deviationKind || "",
      actualNutritionLog?.issue || "",
    ].filter(Boolean),
    summary: sanitizeText(actualNutritionLog?.note || actualNutritionLog?.summary || "", 220),
  },
  actualSummary: sanitizeText(actualNutritionLog?.note || actualNutritionLog?.summary || "", 220),
  sourceSurface,
  owner: "nutrition",
});

export const buildCoachOutcomeEventInput = ({
  recommendationJoinKey = "",
  decisionId = "",
  outcomeKind = ADAPTIVE_OUTCOME_KINDS.coachAccepted,
  action = null,
  status = "accepted",
  detail = "",
  sourceSurface = "coach",
} = {}) => ({
  outcomeKind,
  recommendationJoinKey,
  decisionId,
  adherenceOutcome: status === "ignored" ? ADAPTIVE_ADHERENCE_OUTCOMES.skipped : ADAPTIVE_ADHERENCE_OUTCOMES.modified,
  completionPercentage: status === "ignored" ? 0 : 1,
  userModifications: [action?.type || "", detail].filter(Boolean).map((item) => String(item).replace(/_/g, " ")),
  perceivedDifficulty: "",
  painFlag: false,
  painArea: "",
  satisfactionSignal: status === "accepted" ? "accepted" : "",
  frustrationSignal: status === "ignored" ? "ignored" : "",
  shortHorizonResultWindow: {
    windowDays: 7,
    reviewDateKey: "",
    observedSignals: [status, action?.type || ""].filter(Boolean),
    summary: sanitizeText(detail || action?.type || "", 220),
  },
  actualSummary: sanitizeText(detail || action?.type || "", 220),
  sourceSurface,
  owner: "coach",
});

export const buildGoalChangeEventInput = ({
  changeKind = "edit",
  changeMode = "",
  historyEvent = null,
  previousGoals = [],
  nextGoals = [],
  abandonedGoals = [],
  rationale = "",
} = {}) => ({
  changeKind,
  changeMode: changeMode || historyEvent?.mode || "",
  effectiveDate: historyEvent?.effectiveDate || "",
  rawGoalIntent: historyEvent?.rawGoalIntent || "",
  previousGoals: previousGoals.length ? previousGoals : (historyEvent?.previousGoals || []),
  nextGoals: nextGoals.length ? nextGoals : (historyEvent?.nextGoals || []),
  abandonedGoals,
  archivedPlanId: historyEvent?.archivedPlanId || "",
  rationale: rationale || historyEvent?.label || "",
});

export const buildWeeklyEvaluationEventInput = ({
  currentPlanWeek = null,
  weeklyCheckin = {},
  recentComparisons = [],
  nutritionSummary = "",
  acceptedCoachActions = 0,
  goalProgressSignal = "",
} = {}) => {
  const comparisons = toArray(recentComparisons);
  const completedSessions = comparisons.filter((item) => sanitizeSlug(item?.completionKind, 80) === "as_prescribed").length;
  const modifiedSessions = comparisons.filter((item) => sanitizeSlug(item?.completionKind, 80) === "modified").length;
  const skippedSessions = comparisons.filter((item) => sanitizeSlug(item?.completionKind, 80) === "skipped").length;
  const missedSessions = comparisons.filter((item) => sanitizeSlug(item?.differenceKind, 80) === "not_logged_over_48h").length;
  const countable = completedSessions + modifiedSessions + skippedSessions + missedSessions;
  return {
    evaluationWeekNumber: currentPlanWeek?.weekNumber || 1,
    phase: currentPlanWeek?.phase || "",
    adherenceRate: countable ? (completedSessions + modifiedSessions * 0.6) / countable : 0,
    completedSessions,
    modifiedSessions,
    skippedSessions,
    missedSessions,
    painFlags: sanitizeSlug(weeklyCheckin?.blocker || "", 80) === "pain_injury" ? 1 : 0,
    nutritionCompliance: nutritionSummary || sanitizeText(weeklyCheckin?.nutrition || "", 120),
    coachChangesAccepted: Math.max(0, toFiniteInteger(acceptedCoachActions, 0) || 0),
    goalProgressSignal: sanitizeText(goalProgressSignal || weeklyCheckin?.note || "", 180),
    verdict: sanitizeText(weeklyCheckin?.summary || currentPlanWeek?.summary || "Weekly review captured.", 120),
    linkedRecommendationJoinKeys: comparisons.map((item) => sanitizeText(item?.recommendationJoinKey || "", 160)).filter(Boolean).slice(0, 16),
  };
};

export const buildCohortSnapshotEventInput = ({
  goals = [],
  personalization = {},
  planComposer = {},
} = {}) => {
  const goalStack = buildGoalStack(goals);
  return {
    cohortKey: [
      goalStack[0]?.category || "general",
      sanitizeSlug(planComposer?.architecture || "", 60),
      sanitizeSlug(personalization?.profile?.estimatedFitnessLevel || personalization?.profile?.fitnessLevel || "", 40),
      sanitizeSlug(personalization?.trainingContext?.environment?.value || personalization?.environmentConfig?.defaultMode || "", 60),
    ].filter(Boolean).join("__"),
    planArchetypeId: sanitizeSlug(goalStack[0]?.category || planComposer?.architecture || "", 80),
    primaryGoalCategory: goalStack[0]?.category || "",
    secondaryGoalCategories: goalStack.slice(1).map((goal) => goal.category),
    experienceLevel: sanitizeSlug(personalization?.profile?.estimatedFitnessLevel || personalization?.profile?.fitnessLevel || "", 40),
    trainingDaysPerWeek: toFiniteInteger(personalization?.profile?.daysPerWeek || personalization?.userGoalProfile?.days_per_week || 0, 0),
    environmentMode: sanitizeSlug(personalization?.trainingContext?.environment?.value || personalization?.environmentConfig?.defaultMode || "", 60),
    equipmentAccess: toArray(personalization?.trainingContext?.equipmentAccess?.items || personalization?.userGoalProfile?.equipment_access || []).map((item) => sanitizeText(item, 60)).filter(Boolean),
    nutritionBias: sanitizeText(personalization?.nutritionPreferenceState?.style || "", 120),
    coachTone: sanitizeText(personalization?.profile?.coachingStyle || "", 120),
    mobility: {
      injury_state: sanitizeSlug(personalization?.injuryPainState?.level || "", 40),
      pain_area: sanitizeText(personalization?.injuryPainState?.area || "", 60),
    },
  };
};

export const buildUserStateSnapshotEventInput = ({
  snapshotKind = "snapshot",
  goals = [],
  currentPlanWeek = null,
  planDay = null,
  personalization = {},
  syncMode = "",
  pendingLocalWrites = false,
  latestCompletionRate = 0,
} = {}) => ({
  snapshotKind,
  goalStack: buildGoalStack(goals),
  planArchetypeId: sanitizeSlug(goals?.[0]?.category || currentPlanWeek?.architecture || "", 80),
  planStage: buildCommonPlanStage({
    currentPhase: planDay?.week?.phase || currentPlanWeek?.phase || "",
    currentWeek: planDay?.week?.currentWeek || currentPlanWeek?.weekNumber || 1,
    currentDay: toFiniteInteger(planDay?.dayOfWeek, 0),
    dateKey: planDay?.dateKey || "",
    planWeekId: planDay?.week?.planWeekId || currentPlanWeek?.id || "",
    planDayId: planDay?.id || "",
  }),
  onboardingComplete: Boolean(personalization?.profile?.onboardingComplete),
  syncMode,
  pendingLocalWrites,
  currentMomentumState: sanitizeSlug(personalization?.profile?.currentMomentumState || "", 40),
  recentPainState: sanitizeSlug(personalization?.injuryPainState?.level || "", 40),
  environmentMode: sanitizeSlug(personalization?.trainingContext?.environment?.value || personalization?.environmentConfig?.defaultMode || "", 60),
  latestCompletionRate: toFiniteNumber(latestCompletionRate, 0),
  details: {
    profile_setup_complete: Boolean(personalization?.profile?.profileSetupComplete),
  },
});

export const buildAuthLifecycleEventInput = ({
  authEvent = "",
  status = "",
  source = "",
  hadCloudSession = false,
  mergedLocalCache = false,
  detail = "",
} = {}) => ({
  authEvent,
  status,
  source,
  hadCloudSession,
  mergedLocalCache,
  detail,
});

export const buildSyncLifecycleEventInput = ({
  syncEvent = "",
  status = "",
  reason = "",
  endpoint = "",
  httpStatus = null,
  pendingLocalWrites = false,
  retryEligible = false,
  mergedLocalCache = false,
  detail = "",
} = {}) => ({
  syncEvent,
  status,
  reason,
  endpoint,
  httpStatus,
  pendingLocalWrites,
  retryEligible,
  mergedLocalCache,
  detail,
});
