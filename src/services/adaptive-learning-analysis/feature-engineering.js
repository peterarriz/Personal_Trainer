import { ADAPTIVE_LEARNING_EVENT_NAMES } from "../adaptive-learning-event-service.js";
import {
  buildHybridAdaptiveOutcomeLabels,
  deriveHybridAdaptiveCohort,
  isMeaningfulHybridAdaptiveUser,
} from "../hybrid-adaptive-service.js";
import {
  average,
  bandNumber,
  clamp,
  daysToMs,
  pickFirstDefined,
  sanitizeSlug,
  sanitizeText,
  toArray,
  toFiniteInteger,
  toFiniteNumber,
} from "./shared.js";

const POSITIVE_PROGRESS_TOKENS = ["better", "stronger", "steady", "consistent", "improved", "trending", "right way", "on plan", "moving well"];
const NEGATIVE_PROGRESS_TOKENS = ["worse", "stalled", "missed", "pain", "regression", "backslide", "fatigue", "drifted", "stacked up"];

const OUTCOME_LABELS = Object.freeze({
  success: "success",
  mixed: "mixed",
  failure: "failure",
  unknown: "unknown",
});

const RULE_TOKEN_PREFIXES = Object.freeze([
  "goal",
  "experience",
  "archetype",
  "kind",
  "schedule",
  "travel",
  "environment",
  "run_ramp",
  "run_volume",
  "strength_intensity",
  "hybrid_combo",
  "substitution",
  "deload",
  "nutrition_style",
  "coach_prompt",
  "coach_action",
  "cutback",
  "phase",
]);

const scoreProgressSignal = (value = "") => {
  const text = sanitizeText(value, 220).toLowerCase();
  if (!text) return 0;
  const positiveHits = POSITIVE_PROGRESS_TOKENS.filter((token) => text.includes(token)).length;
  const negativeHits = NEGATIVE_PROGRESS_TOKENS.filter((token) => text.includes(token)).length;
  if (positiveHits === negativeHits) return 0;
  return positiveHits > negativeHits ? 1 : -1;
};

const resolveWindowLabel = (delta = null, rawScore = null) => {
  if (delta === null && rawScore === null) return OUTCOME_LABELS.unknown;
  if ((delta ?? 0) >= 0.08 || (delta === null && (rawScore ?? 0) >= 0.75)) return OUTCOME_LABELS.success;
  if ((delta ?? 0) <= -0.08 || (delta === null && (rawScore ?? 0) <= 0.45)) return OUTCOME_LABELS.failure;
  return OUTCOME_LABELS.mixed;
};

const scoreImmediateOutcome = (payload = {}) => {
  const outcomeKind = sanitizeSlug(payload?.outcomeKind || "", 80);
  const adherenceOutcome = sanitizeSlug(payload?.adherenceOutcome || "", 80);
  const completionPercentage = clamp(toFiniteNumber(payload?.completionPercentage, 0) ?? 0, 0, 1);
  if (outcomeKind === "coach_accepted") return 1;
  if (outcomeKind === "coach_ignored") return 0;
  if (adherenceOutcome === "as_prescribed" || completionPercentage >= 0.9) return 1;
  if (adherenceOutcome === "modified" || adherenceOutcome === "custom_session" || completionPercentage >= 0.5) return 0.55;
  if (adherenceOutcome === "recovery_day") return 0.85;
  if (adherenceOutcome === "skipped") return 0;
  return completionPercentage > 0 ? completionPercentage : null;
};

const summarizeImmediateOutcomeWindow = (outcomeEvents = []) => {
  const safeOutcomes = [...toArray(outcomeEvents)].sort((left, right) => Number(left?.occurredAt || 0) - Number(right?.occurredAt || 0));
  if (!safeOutcomes.length) {
    return {
      hasOutcome: false,
      score: null,
      label: OUTCOME_LABELS.unknown,
      completionAverage: null,
      adherenceOutcome: "",
      frustrationSignals: [],
      painRate: 0,
    };
  }
  const latestOutcome = safeOutcomes[safeOutcomes.length - 1];
  const score = scoreImmediateOutcome(latestOutcome.payload || {});
  return {
    hasOutcome: true,
    score,
    label: resolveWindowLabel(null, score),
    completionAverage: average(safeOutcomes.map((event) => toFiniteNumber(event?.payload?.completionPercentage, null))),
    adherenceOutcome: sanitizeSlug(latestOutcome?.payload?.adherenceOutcome || "", 80),
    frustrationSignals: [...new Set(safeOutcomes.map((event) => sanitizeSlug(event?.payload?.frustrationSignal || "", 80)).filter(Boolean))],
    painRate: average(safeOutcomes.map((event) => event?.payload?.painFlag ? 1 : 0)) || 0,
  };
};

const buildWeeklyEvaluationSummary = (evaluationEvents = [], {
  baselineScore = null,
} = {}) => {
  const evaluations = toArray(evaluationEvents);
  if (!evaluations.length) {
    return {
      count: 0,
      adherenceAverage: null,
      painAverage: null,
      progressAverage: null,
      rawScore: null,
      deltaFromBaseline: null,
      label: OUTCOME_LABELS.unknown,
    };
  }
  const adherenceAverage = average(evaluations.map((event) => toFiniteNumber(event?.payload?.adherenceRate, null)));
  const painAverage = average(evaluations.map((event) => toFiniteNumber(event?.payload?.painFlags, null)));
  const progressAverage = average(evaluations.map((event) => scoreProgressSignal(event?.payload?.goalProgressSignal || event?.payload?.verdict || "")));
  const rawScore = clamp((adherenceAverage ?? 0.5) + ((progressAverage ?? 0) * 0.08) - ((painAverage ?? 0) * 0.05), 0, 1);
  const referenceScore = baselineScore ?? 0.65;
  const deltaFromBaseline = baselineScore === null
    ? rawScore - referenceScore
    : rawScore - baselineScore;
  return {
    count: evaluations.length,
    adherenceAverage,
    painAverage,
    progressAverage,
    rawScore,
    deltaFromBaseline,
    label: resolveWindowLabel(deltaFromBaseline, rawScore),
  };
};

const getLatestPriorEvent = (events = [], occurredAt = 0) => {
  let latest = null;
  toArray(events).forEach((event) => {
    if (Number(event?.occurredAt || 0) > Number(occurredAt || 0)) return;
    if (!latest || Number(event.occurredAt || 0) >= Number(latest.occurredAt || 0)) {
      latest = event;
    }
  });
  return latest;
};

const getEventsInWindow = (events = [], {
  minOccurredAt = Number.NEGATIVE_INFINITY,
  maxOccurredAt = Number.POSITIVE_INFINITY,
  includeMin = true,
  includeMax = true,
} = {}) => (
  toArray(events).filter((event) => {
    const occurredAt = Number(event?.occurredAt || 0);
    if (includeMin ? occurredAt < minOccurredAt : occurredAt <= minOccurredAt) return false;
    if (includeMax ? occurredAt > maxOccurredAt : occurredAt >= maxOccurredAt) return false;
    return true;
  })
);

const readFlatFeature = (sources = [], ...keys) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return source[key];
      }
    }
  }
  return null;
};

const resolveAdaptiveShadowDecision = (recommendationPayload = {}, decisionPointId = "") => (
  toArray(recommendationPayload?.adaptivePolicyShadow?.decisions).find((decision) => (
    sanitizeSlug(decision?.decisionPointId || "", 80) === sanitizeSlug(decisionPointId, 80)
  )) || null
);

const resolveAdaptiveShadowAction = (recommendationPayload = {}, decisionPointId = "") => {
  const decision = resolveAdaptiveShadowDecision(recommendationPayload, decisionPointId);
  if (!decision) return "";
  return sanitizeSlug(
    decision?.usedAdaptiveChoice
      ? decision?.chosenActionId
      : decision?.shadowTopActionId || decision?.chosenActionId || "",
    120,
  );
};

const resolveRunVolumeBand = ({ weeklyRunVolume = null, weeklyRunVolumeUnit = "" } = {}) => {
  const unit = sanitizeSlug(weeklyRunVolumeUnit || "", 20);
  if (unit === "min" || unit === "minutes") {
    return bandNumber(weeklyRunVolume, [
      { max: 90, label: "low" },
      { min: 90, max: 180, label: "moderate" },
      { min: 180, label: "high" },
    ]);
  }
  return bandNumber(weeklyRunVolume, [
    { max: 15, label: "low" },
    { min: 15, max: 30, label: "moderate" },
    { min: 30, label: "high" },
  ]);
};

const resolveStrengthIntensityBand = (value = "") => {
  const normalized = sanitizeSlug(value || "", 40);
  if (["low", "recovery", "easy"].includes(normalized)) return "low";
  if (["controlled", "conservative", "steady"].includes(normalized)) return "controlled";
  if (["planned", "moderate", "standard", "progressive"].includes(normalized)) return "progressive";
  if (["high", "aggressive", "hard"].includes(normalized)) return "high";
  return normalized;
};

const buildRuleTokens = (row = {}) => {
  const tokens = [
    row.primaryGoalCategory ? `goal:${row.primaryGoalCategory}` : "",
    row.experienceLevel ? `experience:${row.experienceLevel}` : "",
    row.planArchetypeId ? `archetype:${row.planArchetypeId}` : "",
    row.recommendationKind ? `kind:${row.recommendationKind}` : "",
    row.scheduleReliability ? `schedule:${row.scheduleReliability}` : "",
    row.travelHeavy ? "travel:yes" : "",
    row.environmentMode ? `environment:${row.environmentMode}` : "",
    row.weeklyRunRampBand ? `run_ramp:${row.weeklyRunRampBand}` : "",
    row.runVolumeBand ? `run_volume:${row.runVolumeBand}` : "",
    row.strengthIntensityBand ? `strength_intensity:${row.strengthIntensityBand}` : "",
    row.hybridLoadCombo ? `hybrid_combo:${row.hybridLoadCombo}` : "",
    row.substitutionStyle ? `substitution:${row.substitutionStyle}` : "",
    row.deloadTiming ? `deload:${row.deloadTiming}` : "",
    row.nutritionStyle ? `nutrition_style:${row.nutritionStyle}` : "",
    row.coachPromptType ? `coach_prompt:${row.coachPromptType}` : "",
    row.actionType ? `coach_action:${row.actionType}` : "",
    typeof row.cutback === "boolean" ? `cutback:${row.cutback ? "yes" : "no"}` : "",
    row.phase ? `phase:${row.phase}` : "",
  ].filter(Boolean);
  return [...new Set(tokens)];
};

const buildOutcomeSignals = (row = {}) => ({
  immediate: row.immediateOutcome?.score,
  short: row.shortTermOutcome?.rawScore,
  medium: row.mediumTermOutcome?.rawScore,
});

const buildCompositeSuccessScore = (row = {}) => {
  const signals = buildOutcomeSignals(row);
  const weightedSignals = [
    signals.immediate == null ? null : { weight: 0.35, value: signals.immediate },
    signals.short == null ? null : { weight: 0.25, value: signals.short },
    signals.medium == null ? null : { weight: 0.4, value: signals.medium },
  ].filter(Boolean);
  if (!weightedSignals.length) return null;
  const totalWeight = weightedSignals.reduce((sum, entry) => sum + entry.weight, 0);
  return weightedSignals.reduce((sum, entry) => sum + (entry.value * entry.weight), 0) / totalWeight;
};

const buildSuccessBucket = (value = null) => {
  if (value == null) return OUTCOME_LABELS.unknown;
  if (value >= 0.72) return OUTCOME_LABELS.success;
  if (value <= 0.42) return OUTCOME_LABELS.failure;
  return OUTCOME_LABELS.mixed;
};

export const buildAdaptiveLearningAnalysisRows = ({
  events = [],
  shortWindowDays = 14,
  mediumWindowDays = 56,
  baselineWindowDays = 28,
} = {}) => {
  const actorGroups = new Map();
  toArray(events).forEach((event) => {
    const actorId = sanitizeText(event?.analysisActorId || "", 120) || "actor_unknown";
    if (!actorGroups.has(actorId)) actorGroups.set(actorId, []);
    actorGroups.get(actorId).push(event);
  });

  const rows = [];

  actorGroups.forEach((actorEvents, analysisActorId) => {
    const timeline = [...actorEvents].sort((left, right) => Number(left?.occurredAt || 0) - Number(right?.occurredAt || 0));
    const cohortSnapshots = timeline.filter((event) => event.eventName === ADAPTIVE_LEARNING_EVENT_NAMES.cohortSnapshotCaptured);
    const userSnapshots = timeline.filter((event) => event.eventName === ADAPTIVE_LEARNING_EVENT_NAMES.userStateSnapshotCaptured);
    const evaluationEvents = timeline.filter((event) => event.eventName === ADAPTIVE_LEARNING_EVENT_NAMES.weeklyEvaluationCompleted);
    const outcomeEvents = timeline.filter((event) => event.eventName === ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded);
    const recommendationEvents = timeline.filter((event) => event.eventName === ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated);

    recommendationEvents.forEach((recommendationEvent) => {
      const occurredAt = Number(recommendationEvent?.occurredAt || 0);
      const recommendationPayload = recommendationEvent?.payload || {};
      const recommendationJoinKey = sanitizeText(recommendationPayload?.recommendationJoinKey || "", 160);
      const decisionId = sanitizeText(recommendationPayload?.decisionId || "", 120);
      const relevantOutcomes = outcomeEvents.filter((event) => {
        const payload = event?.payload || {};
        if (sanitizeText(payload?.recommendationJoinKey || "", 160) !== recommendationJoinKey) return false;
        const outcomeOccurredAt = Number(event?.occurredAt || 0);
        return outcomeOccurredAt >= occurredAt && outcomeOccurredAt <= occurredAt + daysToMs(shortWindowDays);
      });
      const priorCohortSnapshot = getLatestPriorEvent(cohortSnapshots, occurredAt);
      const priorUserStateSnapshot = getLatestPriorEvent(userSnapshots, occurredAt);
      const baselineEvaluations = getEventsInWindow(evaluationEvents, {
        minOccurredAt: occurredAt - daysToMs(baselineWindowDays),
        maxOccurredAt: occurredAt,
        includeMax: false,
      });
      const baselineSummary = buildWeeklyEvaluationSummary(baselineEvaluations, { baselineScore: null });
      const shortTermEvaluations = getEventsInWindow(evaluationEvents, {
        minOccurredAt: occurredAt,
        maxOccurredAt: occurredAt + daysToMs(shortWindowDays),
        includeMin: false,
      });
      const mediumTermEvaluations = getEventsInWindow(evaluationEvents, {
        minOccurredAt: occurredAt + daysToMs(shortWindowDays),
        maxOccurredAt: occurredAt + daysToMs(mediumWindowDays),
        includeMin: false,
      });
      const immediateOutcome = summarizeImmediateOutcomeWindow(relevantOutcomes);
      const shortTermOutcome = buildWeeklyEvaluationSummary(shortTermEvaluations, { baselineScore: baselineSummary.rawScore });
      const mediumTermOutcome = buildWeeklyEvaluationSummary(mediumTermEvaluations, { baselineScore: baselineSummary.rawScore });

      const cohortPayload = priorCohortSnapshot?.payload || {};
      const statePayload = priorUserStateSnapshot?.payload || {};
      const contextInputs = recommendationPayload?.contextualInputs || {};
      const chosenDetails = recommendationPayload?.chosenOption?.details || {};

      const primaryGoalCategory = sanitizeSlug(
        pickFirstDefined(
          cohortPayload?.primaryGoalCategory,
          recommendationPayload?.goalStack?.[0]?.category,
          ""
        ),
        60,
      );
      const experienceLevel = sanitizeSlug(
        pickFirstDefined(
          cohortPayload?.experienceLevel,
          contextInputs?.experience_level,
          ""
        ),
        40,
      );
      const planArchetypeId = sanitizeSlug(
        pickFirstDefined(
          cohortPayload?.planArchetypeId,
          statePayload?.planArchetypeId,
          recommendationPayload?.contextualInputs?.architecture,
          ""
        ),
        80,
      );
      const environmentMode = sanitizeSlug(
        pickFirstDefined(
          cohortPayload?.environmentMode,
          statePayload?.environmentMode,
          contextInputs?.environment_mode,
          ""
        ),
        60,
      );
      const trainingDaysPerWeek = toFiniteInteger(
        pickFirstDefined(
          cohortPayload?.trainingDaysPerWeek,
          chosenDetails?.training_days_per_week,
          contextInputs?.training_days_per_week,
          null
        ),
        null,
      );
      const weeklyRunVolume = toFiniteNumber(readFlatFeature([contextInputs, chosenDetails], "weekly_run_volume"), null);
      const weeklyRunVolumeUnit = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "weekly_run_volume_unit", "run_volume_unit"), 20);
      const weeklyRunRampPct = toFiniteNumber(readFlatFeature([contextInputs, chosenDetails], "weekly_run_ramp_pct", "run_ramp_pct"), null);
      const runCount = toFiniteInteger(readFlatFeature([contextInputs, chosenDetails], "run_count", "run_days"), null);
      const strengthCount = toFiniteInteger(readFlatFeature([contextInputs, chosenDetails], "strength_count", "strength_days"), null);
      const strengthIntensityBand = resolveStrengthIntensityBand(readFlatFeature([contextInputs, chosenDetails], "strength_intensity_band", "intensity_guidance", "strength_intensity"));
      const scheduleReliability = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "schedule_reliability", "schedule_consistency", "schedule_reality"), 40);
      const substitutionStyle = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "substitution_style"), 60);
      const deloadTiming = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "deload_timing"), 40);
      const nutritionStyle = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "nutrition_style", "macro_bias"), 60)
        || (sanitizeSlug(recommendationPayload?.recommendationKind, 80) === "nutrition_recommendation"
          ? sanitizeSlug(recommendationPayload?.chosenOption?.optionKey || "", 60)
          : "");
      const coachPromptType = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "coach_prompt_type", "prompt_type"), 60);
      const actionType = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "action_type"), 60);
      const travelHeavy = Boolean(
        readFlatFeature([contextInputs, chosenDetails], "travel_heavy") === true
        || environmentMode === "travel"
        || scheduleReliability === "travel_heavy"
      );
      const cutbackSignal = readFlatFeature([contextInputs, chosenDetails], "cutback");
      const cutback = cutbackSignal === null ? null : Boolean(cutbackSignal);
      const phase = sanitizeSlug(recommendationPayload?.planStage?.currentPhase || "", 40);
      const runVolumeBand = resolveRunVolumeBand({
        weeklyRunVolume,
        weeklyRunVolumeUnit,
      });
      const weeklyRunRampBand = bandNumber(weeklyRunRampPct, [
        { max: 8, label: "low" },
        { min: 8, max: 16, label: "moderate" },
        { min: 16, label: "high" },
      ]);
      const hybridMeaningful = Boolean(
        readFlatFeature([contextInputs, chosenDetails], "hybrid_meaningful") === true
        || isMeaningfulHybridAdaptiveUser({
          primaryGoalCategory,
          secondaryGoalCategories: toArray(cohortPayload?.secondaryGoalCategories || recommendationPayload?.goalStack?.slice(1).map((goal) => goal?.category)),
          planArchetypeId,
          runningGoalActive: readFlatFeature([contextInputs, chosenDetails], "running_goal_active") === true || (runCount || 0) > 0,
          strengthGoalActive: readFlatFeature([contextInputs, chosenDetails], "strength_goal_active") === true || (strengthCount || 0) > 0,
          physiqueGoalActive: readFlatFeature([contextInputs, chosenDetails], "physique_goal_active") === true,
          runCount,
          strengthCount,
        })
      );
      const hybridAthlete = primaryGoalCategory === "hybrid" || hybridMeaningful || ((runCount || 0) > 0 && (strengthCount || 0) > 0);
      const hybridCohort = sanitizeSlug(
        readFlatFeature([contextInputs, chosenDetails], "hybrid_cohort")
        || deriveHybridAdaptiveCohort({
          primaryGoalCategory,
          secondaryGoalCategories: toArray(cohortPayload?.secondaryGoalCategories || recommendationPayload?.goalStack?.slice(1).map((goal) => goal?.category)),
          planArchetypeId,
          experienceLevel,
          scheduleReliability,
          travelHeavy,
          runningGoalActive: (runCount || 0) > 0,
          strengthGoalActive: (strengthCount || 0) > 0,
          physiqueGoalActive: readFlatFeature([contextInputs, chosenDetails], "physique_goal_active") === true,
          runCount,
          strengthCount,
        }),
        60,
      );
      const hybridLoadCombo = hybridAthlete && (runVolumeBand || strengthIntensityBand)
        ? `${runVolumeBand || "unknown"}_run__${strengthIntensityBand || "unknown"}_strength`
        : "";
      const hybridHardDayBand = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "hybrid_hard_day_band"), 40);
      const hybridMixedSessionBand = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "hybrid_mixed_session_band"), 40);
      const hybridRunBuildPhase = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "hybrid_run_build_phase"), 40);
      const hybridRecoveryRisk = sanitizeSlug(readFlatFeature([contextInputs, chosenDetails], "hybrid_recovery_risk"), 40);
      const hybridLowerBodyGuardNeeded = readFlatFeature([contextInputs, chosenDetails], "hybrid_lower_body_guard_needed") === true;
      const hybridSessionFormatAction = sanitizeSlug(
        readFlatFeature([contextInputs, chosenDetails], "hybrid_session_format_action")
        || resolveAdaptiveShadowAction(recommendationPayload, "hybrid_session_format_choice"),
        80,
      );
      const hybridBalanceAction = sanitizeSlug(
        readFlatFeature([contextInputs, chosenDetails], "hybrid_balance_action")
        || resolveAdaptiveShadowAction(recommendationPayload, "hybrid_run_lift_balance_template"),
        80,
      );
      const hybridDeloadAction = sanitizeSlug(
        readFlatFeature([contextInputs, chosenDetails], "hybrid_deload_action")
        || resolveAdaptiveShadowAction(recommendationPayload, "hybrid_deload_timing_window"),
        80,
      );

      const row = {
        rowId: recommendationEvent.eventId,
        analysisActorId,
        occurredAt,
        occurredDate: recommendationEvent.occurredDate,
        recommendationEventId: recommendationEvent.eventId,
        recommendationJoinKey,
        decisionId,
        recommendationKind: sanitizeSlug(recommendationPayload?.recommendationKind || "", 80),
        sourceSurface: sanitizeSlug(recommendationPayload?.sourceSurface || "", 60),
        owner: sanitizeSlug(recommendationPayload?.owner || "", 60),
        recommendationSource: sanitizeSlug(recommendationPayload?.provenance?.source || recommendationPayload?.chosenOption?.source || "", 80),
        chosenOptionKey: sanitizeSlug(recommendationPayload?.chosenOption?.optionKey || "", 120),
        chosenOptionLabel: sanitizeText(recommendationPayload?.chosenOption?.label || "", 180),
        candidateOptionCount: toArray(recommendationPayload?.candidateOptionsConsidered).length,
        primaryGoalCategory,
        secondaryGoalCategories: toArray(cohortPayload?.secondaryGoalCategories || recommendationPayload?.goalStack?.slice(1).map((goal) => goal?.category)).map((item) => sanitizeSlug(item, 60)).filter(Boolean),
        planArchetypeId,
        experienceLevel,
        trainingDaysPerWeek,
        environmentMode,
        nutritionBias: sanitizeSlug(cohortPayload?.nutritionBias || "", 80),
        coachTone: sanitizeText(cohortPayload?.coachTone || "", 120),
        phase,
        currentWeek: toFiniteInteger(recommendationPayload?.planStage?.currentWeek, null),
        currentDay: toFiniteInteger(recommendationPayload?.planStage?.currentDay, null),
        planWeekId: sanitizeText(recommendationPayload?.planStage?.planWeekId || "", 120),
        planDayId: sanitizeText(recommendationPayload?.planStage?.planDayId || "", 120),
        weeklyRunVolume,
        weeklyRunVolumeUnit,
        weeklyRunRampPct,
        weeklyRunRampBand,
        runCount,
        strengthCount,
        runVolumeBand,
        strengthIntensityBand,
        scheduleReliability,
        substitutionStyle,
        deloadTiming,
        nutritionStyle,
        coachPromptType,
        actionType,
        travelHeavy,
        cutback,
        hybridAthlete,
        hybridMeaningful,
        hybridCohort,
        hybridLoadCombo,
        hybridHardDayBand,
        hybridMixedSessionBand,
        hybridRunBuildPhase,
        hybridRecoveryRisk,
        hybridLowerBodyGuardNeeded,
        hybridSessionFormatAction,
        hybridBalanceAction,
        hybridDeloadAction,
        immediateOutcome,
        baselineSummary,
        shortTermOutcome,
        mediumTermOutcome,
      };
      row.compositeSuccessScore = buildCompositeSuccessScore(row);
      row.successBucket = buildSuccessBucket(row.compositeSuccessScore);
      const hybridOutcomeLabels = buildHybridAdaptiveOutcomeLabels({ row });
      row.hybridSuccessLabel = hybridOutcomeLabels.successLabel;
      row.hybridFailureLabel = hybridOutcomeLabels.failureLabel;
      row.hybridOutcomeSummaryLabel = hybridOutcomeLabels.summaryLabel;
      row.ruleTokens = buildRuleTokens(row).filter((token) => RULE_TOKEN_PREFIXES.includes(String(token || "").split(":")[0]));
      rows.push(row);
    });
  });

  return rows.sort((left, right) => Number(left?.occurredAt || 0) - Number(right?.occurredAt || 0) || String(left?.rowId || "").localeCompare(String(right?.rowId || "")));
};
