import { dedupeStrings } from "../utils/collection-utils.js";
import { GOAL_MEASURABILITY_TIERS } from "./goal-resolution-service.js";

export const GOAL_REALISM_STATUSES = {
  realistic: "realistic",
  aggressive: "aggressive",
  unrealistic: "unrealistic",
  exploratory: "exploratory",
};

export const GOAL_FEASIBILITY_ACTIONS = {
  proceed: "proceed",
  warn: "warn",
  block: "block",
};

export const GOAL_TARGET_VALIDATION_STATUSES = {
  valid: "valid",
  aggressiveButValid: "aggressive_but_valid",
  unrealisticButValid: "unrealistic_but_valid",
  underconstrainedPlausible: "underconstrained_plausible",
  malformedMetric: "malformed_metric",
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

const parseTimeLikeSeconds = (value = "") => {
  const match = String(value || "").match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (!match?.[1]) return null;
  const parts = match[1].split(":").map((item) => Number(item));
  if (parts.some((item) => !Number.isFinite(item))) return null;
  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }
  return null;
};

const roundToNearestFive = (value = 0) => Math.max(0, Math.round(Number(value || 0) / 5) * 5);

const STRENGTH_IMPOSSIBLE_CEILINGS = {
  bench_press_weight: 800,
  squat_weight: 1200,
  deadlift_weight: 1300,
  overhead_press_weight: 500,
};

const STRENGTH_EXTREME_WARNING_CEILINGS = {
  bench_press_weight: 600,
  squat_weight: 900,
  deadlift_weight: 1000,
  overhead_press_weight: 365,
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

const normalizeIntakeCompleteness = (intakeCompleteness = null) => {
  const safe = intakeCompleteness && typeof intakeCompleteness === "object" ? intakeCompleteness : {};
  const facts = safe?.facts && typeof safe.facts === "object" ? safe.facts : {};
  return {
    facts,
    missingRequired: toArray(safe?.missingRequired)
      .map((item) => sanitizeText(item?.label || item, 160))
      .filter(Boolean),
    missingOptional: toArray(safe?.missingOptional)
      .map((item) => sanitizeText(item?.label || item, 160))
      .filter(Boolean),
  };
};

const readGoalValidationIssues = (goal = {}) => toArray(goal?.validationIssues)
  .filter((issue) => issue && typeof issue === "object")
  .map((issue) => ({
    key: sanitizeText(issue?.key || "", 80).toLowerCase(),
    severity: sanitizeText(issue?.severity || "block", 20).toLowerCase() || "block",
    summary: sanitizeText(issue?.summary || "", 220),
    prompt: sanitizeText(issue?.prompt || "", 220),
  }))
  .filter((issue) => issue.summary);

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

  if (goalFamily === "athletic_power") {
    return {
      minimumTrainingDays: (isAdvanced(baseline) ? 2 : isIntermediate(baseline) ? 3 : 3) + sessionModifier,
      minimumSessionLengthMinutes: 30,
      minimumRealisticHorizonWeeks: isAdvanced(baseline) ? 6 : isIntermediate(baseline) ? 8 : 10,
      realisticByDate: "better jump rhythm, lower-body power, and cleaner explosive exposure",
      longerHorizon: "the full dunk or jump-performance outcome",
    };
  }

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

const buildRunningBaselineSignals = ({
  goal = {},
  facts = {},
  targetHorizonWeeks = null,
} = {}) => {
  const warnings = [];
  const blocks = [];
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const isHalfMarathon = metricKey.includes("half_marathon");
  const isMarathon = metricKey.includes("marathon") && !isHalfMarathon;
  const targetSeconds = parseTimeLikeSeconds(goal?.primaryMetric?.targetValue || "");
  const recentPaceSeconds = parseTimeLikeSeconds(facts?.recentPaceBaseline?.paceText || facts?.recentPaceBaseline?.text || "");
  const runFrequency = Number(facts?.currentRunFrequency);
  const longestRunMiles = Number(facts?.longestRecentRun?.miles);
  const minHorizon = Number(goal?.minimumRealisticHorizonWeeks || 0);

  const distanceMiles = metricKey.includes("marathon")
    ? (isHalfMarathon ? 13.1 : 26.2)
    : metricKey.includes("10k")
    ? 6.2
    : metricKey.includes("5k")
    ? 3.1
    : null;
  const targetPaceSeconds = targetSeconds && distanceMiles ? targetSeconds / distanceMiles : null;

  if (isMarathon && targetSeconds && targetSeconds <= 9000) {
    blocks.push("That marathon time target is beyond a credible planning range here and needs a slower first target.");
  }
  if (isHalfMarathon && targetSeconds && targetSeconds <= 4500) {
    blocks.push("That half-marathon time is too aggressive for a deterministic first plan unless the current baseline is already elite.");
  }
  if (metricKey.includes("10k") && targetSeconds && targetSeconds <= 2100) {
    blocks.push("That 10k time target is too aggressive for a deterministic first plan.");
  }
  if (metricKey.includes("5k") && targetSeconds && targetSeconds <= 1020) {
    blocks.push("That 5k time target is too aggressive for a deterministic first plan.");
  }

  if (Number.isFinite(runFrequency) && Number.isFinite(targetHorizonWeeks)) {
    if (isHalfMarathon && runFrequency <= 1 && targetHorizonWeeks <= 12) {
      blocks.push("A half-marathon target on one run per week and this timeline is too compressed.");
    } else if ((isHalfMarathon || isMarathon) && runFrequency <= 2 && targetHorizonWeeks <= 14) {
      warnings.push("The current running frequency is light for this race target, so the block needs a gradual ramp.");
    }
  }

  if (Number.isFinite(longestRunMiles) && Number.isFinite(targetHorizonWeeks)) {
    if (isHalfMarathon && longestRunMiles < 5 && targetHorizonWeeks <= 10) {
      blocks.push("The current long-run baseline is too short for this half-marathon target on the current timeline.");
    } else if (isHalfMarathon && longestRunMiles < 8 && targetHorizonWeeks <= 14) {
      warnings.push("The current long-run baseline suggests the full half-marathon target may need a longer runway.");
    }
    if (isMarathon && longestRunMiles < 10 && targetHorizonWeeks <= 16) {
      blocks.push("The current long-run baseline is too short for a marathon target on the current timeline.");
    }
  }

  if (Number.isFinite(recentPaceSeconds) && Number.isFinite(targetPaceSeconds) && recentPaceSeconds > 0) {
    const improvementRatio = (recentPaceSeconds - targetPaceSeconds) / recentPaceSeconds;
    if (improvementRatio > 0.22) {
      blocks.push("The target pace is too far ahead of the current running baseline for this first planning block.");
    } else if (improvementRatio > 0.12) {
      warnings.push("The target pace is ambitious relative to the current running baseline.");
    }
  }

  const recommendedRevisionSummary = blocks.length
    ? `Scale the first block toward ${goal?.summary?.toLowerCase() || "this race goal"} by building run frequency and long-run support first, then revisit the full target on a longer horizon.`
    : warnings.length
    ? `Keep the race goal, but use the first block to raise run frequency and long-run tolerance before judging the full time target.`
    : "";

  return { warnings, blocks, recommendedRevisionSummary };
};

const buildStrengthBaselineSignals = ({
  goal = {},
  facts = {},
  targetHorizonWeeks = null,
} = {}) => {
  const warnings = [];
  const blocks = [];
  const baselineWeight = Number(facts?.currentStrengthBaseline?.weight);
  const targetWeight = Number(goal?.primaryMetric?.targetValue);
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const liftLabel = sanitizeText(goal?.primaryMetric?.label || "strength target", 80).toLowerCase();
  const impossibleCeiling = STRENGTH_IMPOSSIBLE_CEILINGS[metricKey] || 1000;
  const extremeWarningCeiling = STRENGTH_EXTREME_WARNING_CEILINGS[metricKey] || 700;

  if (Number.isFinite(targetWeight) && targetWeight >= impossibleCeiling) {
    blocks.push(`That ${liftLabel} target is beyond a credible human range for a deterministic plan.`);
  } else if (Number.isFinite(targetWeight) && targetWeight >= extremeWarningCeiling) {
    warnings.push(`That ${liftLabel} target is exceptionally aggressive and needs a very long runway.`);
  }

  if (!Number.isFinite(baselineWeight) || !Number.isFinite(targetWeight) || baselineWeight <= 0) {
    const impossibleRevisionSummary = blocks.length
      ? `Scale the first block toward a credible ${liftLabel} milestone before treating ${Number.isFinite(targetWeight) ? targetWeight : "the full"} lb as real.`
      : warnings.length
      ? `Keep the long-term ${liftLabel} goal if it matters, but use a much smaller first-block milestone before reassessing it.`
      : "";
    return { warnings, blocks, recommendedRevisionSummary: impossibleRevisionSummary };
  }

  const absoluteJump = targetWeight - baselineWeight;
  const improvementRatio = targetWeight / baselineWeight;

  if (Number.isFinite(targetHorizonWeeks)) {
    if ((targetHorizonWeeks <= 6 && absoluteJump >= 50) || (targetHorizonWeeks <= 8 && improvementRatio >= 1.35)) {
      blocks.push("That strength jump is too compressed for the current lift baseline.");
    } else if ((targetHorizonWeeks <= 10 && absoluteJump >= 35) || (targetHorizonWeeks <= 12 && improvementRatio >= 1.2)) {
      warnings.push("That strength target is ambitious relative to the current lift baseline.");
    }
  }

  const suggestedWeight = roundToNearestFive(Math.min(targetWeight, baselineWeight + Math.max(10, Math.min(30, absoluteJump * 0.5))));
  const recommendedRevisionSummary = blocks.length
    ? `A more credible first block is moving from about ${baselineWeight} toward ${suggestedWeight} before chasing the full ${targetWeight} target.`
    : warnings.length
    ? `Keep the lift target, but treat the first block as a smaller jump from about ${baselineWeight} before reassessing ${targetWeight}.`
    : "";

  return { warnings, blocks, recommendedRevisionSummary };
};

const buildBodyCompBaselineSignals = ({
  goal = {},
  facts = {},
  targetHorizonWeeks = null,
} = {}) => {
  const warnings = [];
  const blocks = [];
  const currentBodyweight = Number(facts?.currentBodyweight);
  const targetWeightChange = Number(facts?.targetWeightChange);
  const weeklyChange = Number.isFinite(targetWeightChange) && Number.isFinite(targetHorizonWeeks) && targetHorizonWeeks > 0
    ? Math.abs(targetWeightChange) / targetHorizonWeeks
    : null;
  const weeklyPercent = Number.isFinite(weeklyChange) && Number.isFinite(currentBodyweight) && currentBodyweight > 0
    ? (weeklyChange / currentBodyweight) * 100
    : null;
  const sixPackGoal = /\bsix pack\b|\babs\b/.test(String(goal?.summary || "").toLowerCase());

  if (Number.isFinite(weeklyPercent)) {
    if (weeklyPercent > 1.4) {
      blocks.push("That body-composition rate is too aggressive for a credible first plan.");
    } else if (weeklyPercent > 1.0) {
      warnings.push("That body-composition timeline is ambitious and will need conservative execution.");
    }
  }

  if (sixPackGoal && Number.isFinite(targetHorizonWeeks)) {
    if (targetHorizonWeeks < 10) {
      blocks.push("A six-pack style target on this timeline is too compressed for a deterministic first plan.");
    } else if (targetHorizonWeeks < 14) {
      warnings.push("A visible-abs target on this timeline is ambitious and may need a phased cut.");
    }
  }

  const weeklyPercentSummary = Number.isFinite(currentBodyweight)
    ? "about 0.5-1.0% of bodyweight per week"
    : "a steadier weekly rate";
  const recommendedRevisionSummary = blocks.length
    ? `Use a smaller first block with ${weeklyPercentSummary} instead of forcing the full physique target immediately.`
    : warnings.length
    ? `Keep the physique goal, but plan for a steadier cut pace and reassess after the first block.`
    : "";

  return { warnings, blocks, recommendedRevisionSummary };
};

const classifyTargetValidation = ({
  validationIssues = [],
  baselineSignalBlocks = [],
  baselineSignalWarnings = [],
  intakeCompleteness = null,
  goal = {},
} = {}) => {
  const malformedIssues = toArray(validationIssues).filter((issue) => issue?.severity === "block");
  if (malformedIssues.length) {
    return {
      status: GOAL_TARGET_VALIDATION_STATUSES.malformedMetric,
      clarificationRequired: true,
      reason: sanitizeText(malformedIssues[0]?.prompt || malformedIssues[0]?.summary || "", 220),
      issueKeys: malformedIssues.map((issue) => sanitizeText(issue?.key || "", 80).toLowerCase()).filter(Boolean),
    };
  }

  if (toArray(intakeCompleteness?.missingRequired).length) {
    return {
      status: GOAL_TARGET_VALIDATION_STATUSES.underconstrainedPlausible,
      clarificationRequired: true,
      reason: `Need ${sanitizeText(toArray(intakeCompleteness.missingRequired)[0] || "", 160).toLowerCase()} before this target can be judged cleanly.`,
      issueKeys: [],
    };
  }

  if (toArray(baselineSignalBlocks).length) {
    return {
      status: GOAL_TARGET_VALIDATION_STATUSES.unrealisticButValid,
      clarificationRequired: false,
      reason: sanitizeText(toArray(baselineSignalBlocks)[0] || "", 220),
      issueKeys: [],
    };
  }

  if (toArray(baselineSignalWarnings).length) {
    return {
      status: GOAL_TARGET_VALIDATION_STATUSES.aggressiveButValid,
      clarificationRequired: false,
      reason: sanitizeText(toArray(baselineSignalWarnings)[0] || "", 220),
      issueKeys: [],
    };
  }

  return {
    status: GOAL_TARGET_VALIDATION_STATUSES.valid,
    clarificationRequired: false,
    reason: "",
    issueKeys: [],
  };
};

const buildAthleticPowerBaselineSignals = ({
  goal = {},
  targetHorizonWeeks = null,
} = {}) => {
  const warnings = [];
  const blocks = [];
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const targetValue = Number(goal?.primaryMetric?.targetValue);

  if (metricKey === "vertical_jump_height" && Number.isFinite(targetValue)) {
    if (targetValue >= 60) {
      blocks.push("That vertical-jump target is beyond a credible deterministic planning range.");
    } else if (targetValue >= 44) {
      warnings.push("That vertical-jump target is exceptionally aggressive and needs a long runway.");
    }
    if (Number.isFinite(targetHorizonWeeks) && targetHorizonWeeks <= 6 && targetValue >= 36) {
      warnings.push("That jump-performance target is tight for the current timeline.");
    }
  }

  const recommendedRevisionSummary = blocks.length
    ? "Use the first block to raise power output and retest your jump benchmark before locking in the full target."
    : warnings.length
    ? "Keep the jump-performance goal, but treat the first block as power development before judging the full outcome."
    : "";

  return { warnings, blocks, recommendedRevisionSummary };
};

const buildBaselineSignals = ({
  goal = {},
  facts = {},
  targetHorizonWeeks = null,
} = {}) => {
  const goalFamily = sanitizeText(goal?.goalFamily || "", 40).toLowerCase();
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (goalFamily === "athletic_power") {
    return buildAthleticPowerBaselineSignals({ goal, targetHorizonWeeks });
  }
  if (planningCategory === "running") {
    return buildRunningBaselineSignals({ goal, facts, targetHorizonWeeks });
  }
  if (planningCategory === "strength") {
    return buildStrengthBaselineSignals({ goal, facts, targetHorizonWeeks });
  }
  if (planningCategory === "body_comp") {
    return buildBodyCompBaselineSignals({ goal, facts, targetHorizonWeeks });
  }
  return { warnings: [], blocks: [], recommendedRevisionSummary: "" };
};

const assessSingleGoalFeasibility = ({
  goal = {},
  userBaseline = {},
  scheduleReality = {},
  currentContext = {},
  intakeCompleteness = null,
  now = new Date(),
} = {}) => {
  const demand = buildDemandProfile({ goal, baseline: userBaseline, schedule: scheduleReality });
  const validationIssues = readGoalValidationIssues(goal);
  const targetHorizonWeeks = resolveGoalTargetWindow(goal, now);
  const hasTargetWindow = Boolean(targetHorizonWeeks);
  const scheduleShortfall = scheduleReality.trainingDaysPerWeek < demand.minimumTrainingDays;
  const severeScheduleShortfall = scheduleReality.trainingDaysPerWeek + 1 < demand.minimumTrainingDays;
  const shortSessions = scheduleReality.sessionLengthMinutes < demand.minimumSessionLengthMinutes;
  const hasConstraintPenalty = Boolean((currentContext?.injuryConstraints || []).length) && ["running", "strength"].includes(goal?.planningCategory);
  const compressedHorizon = hasTargetWindow && targetHorizonWeeks < demand.minimumRealisticHorizonWeeks;
  const severelyCompressedHorizon = hasTargetWindow && targetHorizonWeeks < Math.max(4, Math.round(demand.minimumRealisticHorizonWeeks * 0.55));
  const baselineSignals = buildBaselineSignals({
    goal: { ...goal, minimumRealisticHorizonWeeks: demand.minimumRealisticHorizonWeeks },
    facts: intakeCompleteness?.facts || {},
    targetHorizonWeeks,
  });
  const validationBlocks = validationIssues
    .filter((issue) => issue.severity === "block")
    .map((issue) => issue.summary);
  const validationWarnings = validationIssues
    .filter((issue) => issue.severity !== "block")
    .map((issue) => issue.summary);
  const targetValidation = classifyTargetValidation({
    validationIssues,
    baselineSignalBlocks: baselineSignals.blocks || [],
    baselineSignalWarnings: baselineSignals.warnings || [],
    intakeCompleteness,
    goal,
  });
  const blockingReasons = [
    ...validationBlocks,
    ...(baselineSignals.blocks || []),
    ...(severelyCompressedHorizon ? ["The target timeline is too compressed for the goal demand."] : []),
    ...(severeScheduleShortfall ? ["The current schedule support is too low for this goal on the stated timeline."] : []),
  ];
  const warningReasons = [
    ...validationWarnings,
    ...(baselineSignals.warnings || []),
    ...(compressedHorizon && !severelyCompressedHorizon ? ["The current target window is tight for the full outcome."] : []),
    ...(scheduleShortfall && !severeScheduleShortfall ? ["The current weekly training frequency is light for the full goal."] : []),
    ...(shortSessions ? ["Session length is tight for the full goal expression."] : []),
    ...(hasConstraintPenalty ? ["Current constraints lower the safe ceiling for this goal right now."] : []),
  ];

  let realismStatus = GOAL_REALISM_STATUSES.realistic;
  if (!hasTargetWindow && goal?.measurabilityTier !== GOAL_MEASURABILITY_TIERS.fullyMeasurable) {
    realismStatus = GOAL_REALISM_STATUSES.exploratory;
  } else if (blockingReasons.length) {
    realismStatus = GOAL_REALISM_STATUSES.unrealistic;
  } else if (warningReasons.length) {
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
    targetValidationStatus: targetValidation.status,
    clarificationRequired: targetValidation.clarificationRequired,
    targetValidationReason: targetValidation.reason,
    targetValidationIssueKeys: targetValidation.issueKeys,
    targetHorizonWeeks,
    minimumRealisticHorizonWeeks: demand.minimumRealisticHorizonWeeks,
    scheduleFit: severeScheduleShortfall ? "under_supported" : scheduleShortfall || shortSessions ? "tight" : "supported",
    realisticByTargetDate,
    longerHorizonNeed,
    blockingReasons: dedupeStrings(blockingReasons),
    warningReasons: dedupeStrings(warningReasons),
    recommendedRevisionSummary: sanitizeText(validationIssues[0]?.prompt || baselineSignals.recommendedRevisionSummary || "", 220),
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

const buildMissingConfidence = ({ intakeCompleteness = null, goalAssessments = [] } = {}) => {
  const reasons = dedupeStrings([
    ...toArray(intakeCompleteness?.missingRequired),
    ...toArray(intakeCompleteness?.missingOptional).slice(0, 2),
    ...goalAssessments
      .filter((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.exploratory)
      .map((assessment) => `Need a sharper anchor for ${assessment.goalSummary.toLowerCase()}.`),
  ]);
  const level = intakeCompleteness?.missingRequired?.length
    ? "high"
    : reasons.length
    ? "medium"
    : "low";
  return {
    level,
    reasons,
  };
};

const buildRecommendedRevision = ({
  intakeCompleteness = null,
  goalAssessments = [],
  conflictFlags = [],
  realismStatus = GOAL_REALISM_STATUSES.exploratory,
} = {}) => {
  if (intakeCompleteness?.missingRequired?.length) {
    return {
      kind: "missing_context",
      summary: `Before planning, confirm ${intakeCompleteness.missingRequired.join(", ").toLowerCase()}.`,
    };
  }

  const malformedGoal = goalAssessments.find((assessment) => assessment.targetValidationStatus === GOAL_TARGET_VALIDATION_STATUSES.malformedMetric) || null;
  if (malformedGoal) {
    return {
      kind: "clarification_required",
      goalId: malformedGoal.goalId,
      summary: malformedGoal.recommendedRevisionSummary || malformedGoal.targetValidationReason || malformedGoal.blockingReasons?.[0] || "",
    };
  }

  const blockedGoal = goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.unrealistic) || null;
  if (blockedGoal) {
    return {
      kind: "scaled_first_block",
      goalId: blockedGoal.goalId,
      summary: blockedGoal.recommendedRevisionSummary || blockedGoal.longerHorizonNeed || blockedGoal.realisticByTargetDate,
      suggestedTargetHorizonWeeks: blockedGoal.minimumRealisticHorizonWeeks || null,
    };
  }

  if (realismStatus === GOAL_REALISM_STATUSES.aggressive && conflictFlags[0]?.summary) {
    return {
      kind: "sequencing",
      summary: conflictFlags[0].summary,
    };
  }

  return null;
};

const buildConfirmationAction = ({
  realismStatus = GOAL_REALISM_STATUSES.exploratory,
  intakeCompleteness = null,
  conflictFlags = [],
  goalAssessments = [],
} = {}) => {
  if (
    intakeCompleteness?.missingRequired?.length
    || realismStatus === GOAL_REALISM_STATUSES.unrealistic
    || toArray(goalAssessments).some((assessment) => assessment?.targetValidationStatus === GOAL_TARGET_VALIDATION_STATUSES.malformedMetric)
  ) {
    return GOAL_FEASIBILITY_ACTIONS.block;
  }
  if (realismStatus === GOAL_REALISM_STATUSES.aggressive || conflictFlags.some((flag) => flag.severity === GOAL_CONFLICT_SEVERITIES.high)) {
    return GOAL_FEASIBILITY_ACTIONS.warn;
  }
  return GOAL_FEASIBILITY_ACTIONS.proceed;
};

export const assessGoalFeasibility = ({
  resolvedGoals = [],
  userBaseline = {},
  scheduleReality = {},
  currentExperienceContext = {},
  intakeCompleteness = null,
  now = new Date(),
} = {}) => {
  const safeGoals = Array.isArray(resolvedGoals) ? resolvedGoals.filter(Boolean) : [];
  const normalizedBaseline = normalizeUserBaseline(userBaseline);
  const normalizedSchedule = normalizeScheduleReality(scheduleReality);
  const normalizedContext = normalizeCurrentContext(currentExperienceContext);
  const normalizedCompleteness = normalizeIntakeCompleteness(intakeCompleteness);
  const goalAssessments = safeGoals.map((goal) => assessSingleGoalFeasibility({
    goal,
    userBaseline: normalizedBaseline,
    scheduleReality: normalizedSchedule,
    currentContext: normalizedContext,
    intakeCompleteness: normalizedCompleteness,
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
  const missingConfidence = buildMissingConfidence({
    intakeCompleteness: normalizedCompleteness,
    goalAssessments,
  });
  const recommendedRevision = buildRecommendedRevision({
    intakeCompleteness: normalizedCompleteness,
    goalAssessments,
    conflictFlags,
    realismStatus,
  });
  const confirmationAction = buildConfirmationAction({
    realismStatus,
    intakeCompleteness: normalizedCompleteness,
    conflictFlags,
    goalAssessments,
  });
  const blockingReasons = dedupeStrings([
    ...normalizedCompleteness.missingRequired.map((item) => `Need ${item.toLowerCase()} before the plan can lock.`),
    ...goalAssessments.flatMap((assessment) => assessment.blockingReasons || []),
  ]);
  const warningReasons = dedupeStrings([
    ...goalAssessments.flatMap((assessment) => assessment.warningReasons || []),
    ...conflictFlags.filter((flag) => flag.severity === GOAL_CONFLICT_SEVERITIES.high).map((flag) => flag.summary),
  ]);
  const tradeoffSummary = dedupeStrings(conflictFlags.map((flag) => flag.summary)).join(" ");
  const malformedGoalAssessment = goalAssessments.find((assessment) => assessment.targetValidationStatus === GOAL_TARGET_VALIDATION_STATUSES.malformedMetric) || null;

  return {
    realismStatus,
    confirmationAction,
    canProceed: confirmationAction !== GOAL_FEASIBILITY_ACTIONS.block,
    targetValidation: {
      status: malformedGoalAssessment?.targetValidationStatus
        || (normalizedCompleteness.missingRequired.length ? GOAL_TARGET_VALIDATION_STATUSES.underconstrainedPlausible : GOAL_TARGET_VALIDATION_STATUSES.valid),
      clarificationRequired: Boolean(
        malformedGoalAssessment?.clarificationRequired
        || normalizedCompleteness.missingRequired.length
      ),
      reason: malformedGoalAssessment?.targetValidationReason
        || (normalizedCompleteness.missingRequired.length
          ? `Need ${sanitizeText(normalizedCompleteness.missingRequired[0] || "", 160).toLowerCase()} before the target can lock.`
          : ""),
      issueKeys: malformedGoalAssessment?.targetValidationIssueKeys || [],
    },
    missingConfidence,
    recommendedRevision,
    tradeoffSummary,
    blockingReasons,
    warningReasons,
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
