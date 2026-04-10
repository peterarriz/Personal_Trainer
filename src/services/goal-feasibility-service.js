import { dedupeStrings } from "../utils/collection-utils.js";
import { GOAL_MEASURABILITY_TIERS } from "./goal-resolution-service.js";

export const GOAL_REALISM_STATUSES = {
  realistic: "realistic",
  aggressive: "aggressive",
  unrealistic: "unrealistic",
  exploratory: "exploratory",
};

export const GOAL_CONFLICT_SEVERITIES = {
  low: "low",
  medium: "medium",
  high: "high",
};

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const hasFiniteNumericValue = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

const parseSessionLengthMinutes = (value = "") => {
  const text = String(value || "").trim();
  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 30;
  return Math.max(15, Math.min(180, Math.round(numeric)));
};

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const calculateWeeksUntil = ({ now = new Date(), targetDate = "" } = {}) => {
  if (!targetDate) return null;
  const safeNow = asDate(now);
  const safeTarget = asDate(targetDate);
  const diffMs = safeTarget.getTime() - safeNow.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 1;
  return Math.max(1, Math.round(diffMs / (7 * 86400000)));
};

const normalizeScheduleReality = (scheduleReality = {}) => ({
  trainingDaysPerWeek: Math.max(0, Math.min(14, Math.round(Number(scheduleReality?.trainingDaysPerWeek) || 0))),
  sessionLength: sanitizeText(scheduleReality?.sessionLength || "", 40),
  sessionLengthMinutes: parseSessionLengthMinutes(scheduleReality?.sessionLength || ""),
  trainingLocation: sanitizeText(scheduleReality?.trainingLocation || "", 40),
  scheduleNotes: sanitizeText(scheduleReality?.scheduleNotes || "", 180),
});

const normalizeUserBaseline = (userBaseline = {}) => ({
  experienceLevel: sanitizeText(userBaseline?.experienceLevel || userBaseline?.fitnessLevel || "", 40).toLowerCase() || "beginner",
  fitnessLevel: sanitizeText(userBaseline?.fitnessLevel || "", 40).toLowerCase(),
  currentBaseline: sanitizeText(userBaseline?.currentBaseline || "", 220),
  primaryGoalLabel: sanitizeText(userBaseline?.primaryGoalLabel || "", 80),
});

const normalizeCurrentContext = (currentContext = {}) => ({
  injuryConstraints: dedupeStrings([
    ...toArray(currentContext?.injuryConstraints),
    ...toArray(currentContext?.injuryConstraintContext?.constraints),
  ].map((item) => sanitizeText(item, 140))),
  injuryText: sanitizeText(currentContext?.injuryText || currentContext?.injuryConstraintContext?.injuryText || "", 180),
  equipment: dedupeStrings([
    ...toArray(currentContext?.equipment),
    ...toArray(currentContext?.equipmentAccessContext?.equipment),
  ].map((item) => sanitizeText(item, 80))),
  trainingLocation: sanitizeText(currentContext?.trainingLocation || currentContext?.equipmentAccessContext?.trainingLocation || "", 40),
  startingFresh: Boolean(currentContext?.startingFresh),
});

const isAdvanced = (baseline = {}) => baseline?.experienceLevel === "advanced";
const isIntermediate = (baseline = {}) => baseline?.experienceLevel === "intermediate";

const resolveGoalTargetWindow = (goal = {}, now = new Date()) => (
  hasFiniteNumericValue(goal?.targetHorizonWeeks)
    ? Math.max(1, Math.round(Number(goal.targetHorizonWeeks)))
    : calculateWeeksUntil({ now, targetDate: goal?.targetDate || "" })
);

const buildDemandProfile = ({ goal = {}, baseline = {}, schedule = {} } = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const goalFamily = sanitizeText(goal?.goalFamily || "", 40).toLowerCase();
  const summary = sanitizeText(goal?.summary || "", 180).toLowerCase();
  const primaryMetricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const hybridModifier = goalFamily === "hybrid" ? 1 : 0;
  const sessionModifier = schedule?.sessionLengthMinutes >= 45 ? 0 : 1;

  if (planningCategory === "running") {
    if (primaryMetricKey.includes("half_marathon")) {
      return {
        minimumTrainingDays: (isAdvanced(baseline) ? 3 : isIntermediate(baseline) ? 3 : 4) + hybridModifier,
        minimumSessionLengthMinutes: 40,
        minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 10 : isIntermediate(baseline) ? 12 : 16,
        realisticByDate: "a stronger aerobic base, repeatable long runs, and credible race readiness",
        longerHorizon: "the full half-marathon time target",
      };
    }
    if (primaryMetricKey.includes("run_10k")) {
      return {
        minimumTrainingDays: (isAdvanced(baseline) ? 3 : 3) + hybridModifier,
        minimumSessionLengthMinutes: 35,
        minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 6 : isIntermediate(baseline) ? 8 : 10,
        realisticByDate: "a better aerobic base and sharper 10k-specific pace tolerance",
        longerHorizon: "the full 10k time target",
      };
    }
    if (primaryMetricKey.includes("run_5k")) {
      return {
        minimumTrainingDays: (isAdvanced(baseline) ? 2 : 3) + hybridModifier,
        minimumSessionLengthMinutes: 30,
        minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 4 : isIntermediate(baseline) ? 6 : 8,
        realisticByDate: "better run frequency and sharper aerobic speed support",
        longerHorizon: "the full 5k time target",
      };
    }
    return {
      minimumTrainingDays: (isAdvanced(baseline) ? 3 : 3) + hybridModifier,
      minimumSessionLengthMinutes: 35,
      minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 8 : isIntermediate(baseline) ? 10 : 12,
      realisticByDate: "more consistent aerobic work and better endurance capacity",
      longerHorizon: "the full performance target",
    };
  }

  if (planningCategory === "strength") {
    const maintenanceGoal = /\bkeep\b|\bmaintain\b/.test(summary);
    if (maintenanceGoal) {
      return {
        minimumTrainingDays: 2,
        minimumSessionLengthMinutes: 30,
        minimumRealisticHorizonWeeks: 4,
        realisticByDate: "strength retention and stable lifting rhythm",
        longerHorizon: "meaningful strength progression beyond maintenance",
      };
    }
    return {
      minimumTrainingDays: (isAdvanced(baseline) ? 2 : isIntermediate(baseline) ? 2 : 3) + hybridModifier + sessionModifier,
      minimumSessionLengthMinutes: 35,
      minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 8 : isIntermediate(baseline) ? 10 : 12,
      realisticByDate: "better barbell exposure and more stable top-set performance",
      longerHorizon: "the full strength target",
    };
  }

  if (planningCategory === "body_comp") {
    const sixPackGoal = /\bsix pack\b|\babs\b/.test(summary);
    if (sixPackGoal) {
      return {
        minimumTrainingDays: 3,
        minimumSessionLengthMinutes: 30,
        minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 12 : isIntermediate(baseline) ? 14 : 16,
        realisticByDate: "noticeable waist reduction, tighter nutrition rhythm, and improved midsection definition",
        longerHorizon: "full six-pack-level leanness",
      };
    }
    return {
      minimumTrainingDays: 3,
      minimumSessionLengthMinutes: 30,
      minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 8 : isIntermediate(baseline) ? 10 : 12,
      realisticByDate: "visible leaning out, better check-in consistency, and steady waist progress",
      longerHorizon: "a more dramatic physique change",
    };
  }

  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy || goalFamily === "re_entry" || planningCategory === "general_fitness") {
    return {
      minimumTrainingDays: 2,
      minimumSessionLengthMinutes: 20,
      minimumRealisticHorizonWeeks: 4,
      realisticByDate: "a real training rhythm, better adherence, and a clearer baseline",
      longerHorizon: "a more specialized physique or performance outcome",
    };
  }

  return {
    minimumTrainingDays: 3,
    minimumSessionLengthMinutes: 30,
    minimumRealisticHorizonWeeks: 8,
    realisticByDate: "steady progress if consistency holds",
    longerHorizon: "the full goal expression",
  };
};

const rankRealismStatus = (status = GOAL_REALISM_STATUSES.exploratory) => {
  if (status === GOAL_REALISM_STATUSES.unrealistic) return 4;
  if (status === GOAL_REALISM_STATUSES.aggressive) return 3;
  if (status === GOAL_REALISM_STATUSES.exploratory) return 2;
  return 1;
};

const buildRealisticByDateSummary = ({ goal = {}, status = GOAL_REALISM_STATUSES.exploratory, demand = {} } = {}) => {
  if (status === GOAL_REALISM_STATUSES.realistic) {
    return `By the current target window, ${demand.realisticByDate} is realistic for ${goal.summary.toLowerCase()}.`;
  }
  if (status === GOAL_REALISM_STATUSES.aggressive) {
    return `By the current target window, ${demand.realisticByDate} is realistic, but the full ${goal.summary.toLowerCase()} outcome is compressed.`;
  }
  if (status === GOAL_REALISM_STATUSES.unrealistic) {
    return `By the current target window, foundation progress is realistic, but the full ${goal.summary.toLowerCase()} target is too compressed.`;
  }
  return `Over the next 30 days, ${demand.realisticByDate} is the realistic first win for ${goal.summary.toLowerCase()}.`;
};

const buildLongerHorizonSummary = ({ goal = {}, status = GOAL_REALISM_STATUSES.exploratory, demand = {}, minimumRealisticHorizonWeeks = null } = {}) => {
  if (status === GOAL_REALISM_STATUSES.realistic) return "";
  const horizon = Number.isFinite(minimumRealisticHorizonWeeks) ? `${minimumRealisticHorizonWeeks}+ weeks` : "a longer block";
  return `${sanitizeText(demand.longerHorizon || goal.summary || "The full outcome", 180)} likely needs closer to ${horizon}.`;
};

const assessSingleGoalFeasibility = ({
  goal = {},
  userBaseline = {},
  scheduleReality = {},
  currentContext = {},
  now = new Date(),
} = {}) => {
  const demand = buildDemandProfile({ goal, baseline: userBaseline, schedule: scheduleReality });
  const targetHorizonWeeks = resolveGoalTargetWindow(goal, now);
  const hasTargetWindow = Boolean(targetHorizonWeeks);
  const scheduleShortfall = scheduleReality.trainingDaysPerWeek < demand.minimumTrainingDays;
  const severeScheduleShortfall = scheduleReality.trainingDaysPerWeek + 1 < demand.minimumTrainingDays;
  const shortSessions = scheduleReality.sessionLengthMinutes < demand.minimumSessionLengthMinutes;
  const hasConstraintPenalty = Boolean((currentContext?.injuryConstraints || []).length) && ["running", "strength"].includes(goal?.planningCategory);
  const compressedHorizon = hasTargetWindow && targetHorizonWeeks < demand.minimumRealisticHorizonWeeks;
  const severelyCompressedHorizon = hasTargetWindow && targetHorizonWeeks < Math.max(4, Math.round(demand.minimumRealisticHorizonWeeks * 0.55));

  let realismStatus = GOAL_REALISM_STATUSES.realistic;
  if (!hasTargetWindow && goal?.measurabilityTier !== GOAL_MEASURABILITY_TIERS.fullyMeasurable) {
    realismStatus = GOAL_REALISM_STATUSES.exploratory;
  } else if (severelyCompressedHorizon || severeScheduleShortfall) {
    realismStatus = GOAL_REALISM_STATUSES.unrealistic;
  } else if (compressedHorizon || scheduleShortfall || shortSessions || hasConstraintPenalty) {
    realismStatus = GOAL_REALISM_STATUSES.aggressive;
  }

  const realisticByTargetDate = buildRealisticByDateSummary({
    goal,
    status: realismStatus,
    demand,
  });
  const longerHorizonNeed = buildLongerHorizonSummary({
    goal,
    status: realismStatus,
    demand,
    minimumRealisticHorizonWeeks: demand.minimumRealisticHorizonWeeks,
  });

  let priorityScore = 100;
  if (hasTargetWindow) priorityScore += Math.max(0, 40 - targetHorizonWeeks);
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable) priorityScore += 18;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.proxyMeasurable) priorityScore += 8;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy) priorityScore -= 8;
  if (/\bkeep\b|\bmaintain\b/.test(String(goal?.summary || "").toLowerCase())) priorityScore -= 18;
  if (realismStatus === GOAL_REALISM_STATUSES.unrealistic) priorityScore += 6;
  if (goal?.planningPriority) priorityScore += Math.max(0, 8 - Number(goal.planningPriority));

  return {
    goalId: goal?.id || "",
    goalSummary: sanitizeText(goal?.summary || "", 180),
    planningCategory: sanitizeText(goal?.planningCategory || "", 40).toLowerCase(),
    realismStatus,
    targetHorizonWeeks,
    minimumRealisticHorizonWeeks: demand.minimumRealisticHorizonWeeks,
    scheduleFit: severeScheduleShortfall ? "under_supported" : scheduleShortfall || shortSessions ? "tight" : "supported",
    realisticByTargetDate,
    longerHorizonNeed,
    priorityScore,
  };
};

const buildConflictFlags = ({ resolvedGoals = [], goalAssessments = [], scheduleReality = {}, currentContext = {} } = {}) => {
  const categories = new Set((resolvedGoals || []).map((goal) => sanitizeText(goal?.planningCategory || "", 40).toLowerCase()).filter(Boolean));
  const flags = [];
  const scheduleTight = scheduleReality.trainingDaysPerWeek <= 3 || scheduleReality.sessionLengthMinutes < 35;
  const hasRunning = categories.has("running");
  const hasStrength = categories.has("strength");
  const hasBodyComp = categories.has("body_comp");

  if (hasRunning && hasStrength) {
    flags.push({
      key: "hybrid_interference",
      severity: scheduleReality.trainingDaysPerWeek >= 5 && scheduleReality.sessionLengthMinutes >= 45
        ? GOAL_CONFLICT_SEVERITIES.low
        : scheduleTight
        ? GOAL_CONFLICT_SEVERITIES.high
        : GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: (resolvedGoals || []).filter((goal) => ["running", "strength"].includes(goal?.planningCategory)).map((goal) => goal.id),
      summary: scheduleReality.trainingDaysPerWeek >= 5 && scheduleReality.sessionLengthMinutes >= 45
        ? "Running and strength can coexist here, but they still need an explicit weekly split."
        : "Running and strength are competing for the same recovery budget, so one lane needs to lead each block.",
    });
  }

  if (hasBodyComp && hasStrength) {
    flags.push({
      key: "fat_loss_vs_strength",
      severity: scheduleTight ? GOAL_CONFLICT_SEVERITIES.high : GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: (resolvedGoals || []).filter((goal) => ["body_comp", "strength"].includes(goal?.planningCategory)).map((goal) => goal.id),
      summary: "Aggressive body-composition pushes can blunt strength progress unless strength is treated as maintenance first.",
    });
  }

  if (hasBodyComp && hasRunning) {
    flags.push({
      key: "fat_loss_vs_endurance",
      severity: scheduleTight ? GOAL_CONFLICT_SEVERITIES.high : GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: (resolvedGoals || []).filter((goal) => ["body_comp", "running"].includes(goal?.planningCategory)).map((goal) => goal.id),
      summary: "Pushing fat loss too hard can flatten run quality and recovery.",
    });
  }

  if ((resolvedGoals || []).length >= 2 && scheduleReality.trainingDaysPerWeek <= 3) {
    flags.push({
      key: "limited_schedule_multi_goal_stack",
      severity: GOAL_CONFLICT_SEVERITIES.high,
      goalIds: (resolvedGoals || []).map((goal) => goal.id),
      summary: "The current schedule is tight for multiple active goals at once, so sequencing matters more than parallel progress.",
    });
  }

  if ((currentContext?.injuryConstraints || []).length && goalAssessments.some((assessment) => assessment.realismStatus !== GOAL_REALISM_STATUSES.exploratory)) {
    flags.push({
      key: "constraint_ceiling",
      severity: GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: (resolvedGoals || []).map((goal) => goal.id),
      summary: "Current constraints lower the safe ceiling, so progression needs to stay conservative.",
    });
  }

  return flags.slice(0, 5);
};

const buildSuggestedSequencing = ({ resolvedGoals = [], goalAssessments = [], conflictFlags = [] } = {}) => {
  const sequencing = [];
  const primaryConflict = conflictFlags.find((flag) => flag.severity === GOAL_CONFLICT_SEVERITIES.high) || conflictFlags[0] || null;
  const compressedGoal = goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.unrealistic)
    || goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.aggressive)
    || null;

  if (primaryConflict?.key === "fat_loss_vs_strength") {
    sequencing.push({
      phase: "now",
      goalIds: primaryConflict.goalIds,
      summary: "Lead with body composition now and treat strength as maintenance until the physique push settles.",
    });
  }

  if (primaryConflict?.key === "hybrid_interference") {
    sequencing.push({
      phase: "now",
      goalIds: primaryConflict.goalIds,
      summary: primaryConflict.severity === GOAL_CONFLICT_SEVERITIES.low
        ? "Use a clear weekly split so both lanes stay alive without competing every session."
        : "Start with one lead emphasis per block and hold the other lane at maintenance volume.",
    });
  }

  if (primaryConflict?.key === "limited_schedule_multi_goal_stack") {
    sequencing.push({
      phase: "now",
      goalIds: primaryConflict.goalIds,
      summary: "Use the first block to establish one primary goal and keep the rest in maintenance mode.",
    });
  }

  if (compressedGoal) {
    sequencing.push({
      phase: "next_block",
      goalIds: [compressedGoal.goalId],
      summary: `Extend ${compressedGoal.goalSummary.toLowerCase()} into a longer block if the full outcome still matters after the first target window.`,
    });
  }

  if (!sequencing.length && goalAssessments.every((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.exploratory)) {
    sequencing.push({
      phase: "now",
      goalIds: (resolvedGoals || []).map((goal) => goal.id),
      summary: "Use the first 30 days to define the goal more sharply before pushing a specialized block.",
    });
  }

  return sequencing.slice(0, 4);
};

const buildPriorityOrdering = ({ resolvedGoals = [], goalAssessments = [] } = {}) => {
  const scoreMap = new Map(goalAssessments.map((assessment) => [assessment.goalId, assessment.priorityScore]));
  return [...(resolvedGoals || [])]
    .sort((a, b) => {
      const scoreDiff = (scoreMap.get(b?.id || "") || 0) - (scoreMap.get(a?.id || "") || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a?.planningPriority || 99) - Number(b?.planningPriority || 99);
    })
    .map((goal, index) => ({
      goalId: goal?.id || "",
      goalSummary: sanitizeText(goal?.summary || "", 180),
      recommendedPriority: index + 1,
      planningCategory: sanitizeText(goal?.planningCategory || "", 40).toLowerCase(),
    }));
};

const aggregateRealismStatus = ({ goalAssessments = [], conflictFlags = [] } = {}) => {
  if (!goalAssessments.length) return GOAL_REALISM_STATUSES.exploratory;
  const topStatus = [...goalAssessments].sort((a, b) => rankRealismStatus(b.realismStatus) - rankRealismStatus(a.realismStatus))[0]?.realismStatus;
  if (
    [GOAL_REALISM_STATUSES.realistic, GOAL_REALISM_STATUSES.exploratory].includes(topStatus)
    && conflictFlags.some((flag) => flag.severity === GOAL_CONFLICT_SEVERITIES.high)
  ) {
    return GOAL_REALISM_STATUSES.aggressive;
  }
  return topStatus || GOAL_REALISM_STATUSES.exploratory;
};

export const assessGoalFeasibility = ({
  resolvedGoals = [],
  userBaseline = {},
  scheduleReality = {},
  currentExperienceContext = {},
  now = new Date(),
} = {}) => {
  const safeGoals = Array.isArray(resolvedGoals) ? resolvedGoals.filter(Boolean) : [];
  const normalizedBaseline = normalizeUserBaseline(userBaseline);
  const normalizedSchedule = normalizeScheduleReality(scheduleReality);
  const normalizedContext = normalizeCurrentContext(currentExperienceContext);
  const goalAssessments = safeGoals.map((goal) => assessSingleGoalFeasibility({
    goal,
    userBaseline: normalizedBaseline,
    scheduleReality: normalizedSchedule,
    currentContext: normalizedContext,
    now,
  }));
  const conflictFlags = buildConflictFlags({
    resolvedGoals: safeGoals,
    goalAssessments,
    scheduleReality: normalizedSchedule,
    currentContext: normalizedContext,
  });
  const recommendedPriorityOrdering = buildPriorityOrdering({
    resolvedGoals: safeGoals,
    goalAssessments,
  });
  const suggestedSequencing = buildSuggestedSequencing({
    resolvedGoals: safeGoals,
    goalAssessments,
    conflictFlags,
  });
  const realismStatus = aggregateRealismStatus({
    goalAssessments,
    conflictFlags,
  });

  return {
    realismStatus,
    recommendedPriorityOrdering,
    conflictFlags,
    suggestedSequencing,
    realisticByTargetDate: goalAssessments.map((assessment) => ({
      goalId: assessment.goalId,
      summary: assessment.realisticByTargetDate,
    })).filter((item) => item.summary),
    longerHorizonNeeds: goalAssessments.map((assessment) => ({
      goalId: assessment.goalId,
      summary: assessment.longerHorizonNeed,
    })).filter((item) => item.summary),
    goalAssessments,
  };
};

export const applyFeasibilityPriorityOrdering = ({
  resolvedGoals = [],
  feasibility = null,
} = {}) => {
  const safeGoals = Array.isArray(resolvedGoals) ? resolvedGoals.filter(Boolean) : [];
  const orderMap = new Map((feasibility?.recommendedPriorityOrdering || []).map((item) => [item.goalId, item.recommendedPriority]));
  return [...safeGoals]
    .sort((a, b) => {
      const orderDiff = (orderMap.get(a?.id || "") || Number(a?.planningPriority || 99)) - (orderMap.get(b?.id || "") || Number(b?.planningPriority || 99));
      if (orderDiff !== 0) return orderDiff;
      return Number(a?.planningPriority || 99) - Number(b?.planningPriority || 99);
    })
    .map((goal, index) => ({
      ...goal,
      planningPriority: index + 1,
    }));
};
