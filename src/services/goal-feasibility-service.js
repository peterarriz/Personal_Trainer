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

export const GOAL_FEASIBILITY_GATE_STATUSES = {
  ok: "OK",
  needsRevision: "NEEDS_REVISION",
  impossible: "IMPOSSIBLE",
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

const formatList = (items = []) => {
  const values = dedupeStrings(toArray(items).map((item) => sanitizeText(item, 160)).filter(Boolean));
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
};

const buildFeasibilityReason = ({
  code = "",
  summary = "",
  severity = "warning",
  priority = 50,
  goalId = "",
} = {}) => ({
  code: sanitizeText(code, 80).toLowerCase() || "unspecified_reason",
  summary: sanitizeText(summary, 220),
  severity: sanitizeText(severity, 20).toLowerCase() === "block" ? "block" : "warning",
  priority: Number.isFinite(Number(priority)) ? Number(priority) : 50,
  goalId: sanitizeText(goalId, 120),
});

const dedupeFeasibilityReasons = (items = []) => {
  const seen = new Set();
  return toArray(items)
    .filter((item) => item && typeof item === "object")
    .filter((item) => item.summary)
    .filter((item) => {
      const key = `${sanitizeText(item.code, 80).toLowerCase()}::${sanitizeText(item.summary, 220).toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const sortFeasibilityReasons = (items = []) => (
  dedupeFeasibilityReasons(items).sort((a, b) => {
    const severityDiff = (a.severity === "block" ? 0 : 1) - (b.severity === "block" ? 0 : 1);
    if (severityDiff !== 0) return severityDiff;
    const priorityDiff = Number(a.priority || 50) - Number(b.priority || 50);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a.summary || "").localeCompare(String(b.summary || ""));
  })
);

const buildSuggestedRevision = ({
  kind = "",
  summary = "",
  firstBlockTarget = "",
  requestedData = [],
  suggestedTargetHorizonWeeks = null,
  goalId = "",
} = {}) => ({
  kind: sanitizeText(kind, 80).toLowerCase() || "proceed",
  summary: sanitizeText(summary, 240),
  first_block_target: sanitizeText(firstBlockTarget, 260),
  requested_data: dedupeStrings(toArray(requestedData).map((item) => sanitizeText(item, 180)).filter(Boolean)).slice(0, 4),
  ...(Number.isFinite(Number(suggestedTargetHorizonWeeks))
    ? { suggested_target_horizon_weeks: Math.max(1, Math.round(Number(suggestedTargetHorizonWeeks))) }
    : {}),
  ...(sanitizeText(goalId, 120) ? { goal_id: sanitizeText(goalId, 120) } : {}),
});

const buildDefaultFirstBlockTarget = ({ goal = {}, demand = {} } = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (planningCategory === "running") {
    return "Build repeatable weekly running volume and a long run you can recover from before you push the full pace target.";
  }
  if (planningCategory === "strength") {
    return "Use the first block to build repeatable top-set quality before you chase the full number.";
  }
  if (planningCategory === "body_comp") {
    return "Use the first block to land a steady weekly rate you can repeat and track clearly.";
  }
  if (sanitizeText(goal?.goalFamily || "", 40).toLowerCase() === "athletic_power") {
    return "Use the first block to build power output and re-test the jump benchmark before you lock the full target.";
  }
  return `Use the first block to chase ${sanitizeText(demand?.realisticByDate || "a realistic first win", 180).toLowerCase()}.`;
};

const buildGateExplanationText = ({
  reasons = [],
  suggestedRevision = null,
  status = GOAL_FEASIBILITY_GATE_STATUSES.ok,
} = {}) => {
  const orderedReasons = sortFeasibilityReasons(reasons);
  const primaryReason = orderedReasons[0]?.summary || (
    status === GOAL_FEASIBILITY_GATE_STATUSES.ok
      ? "The current target fits your baseline and schedule."
      : "The current target needs a cleaner first step."
  );
  const supportingLine = orderedReasons.slice(1, 3).length
    ? `Supporting reasons: ${orderedReasons.slice(1, 3).map((item) => item.summary).join(" ")}`
    : "";
  const revisionLine = suggestedRevision?.first_block_target
    ? `Realistic first block: ${suggestedRevision.first_block_target}`
    : suggestedRevision?.summary
    ? `Revision path: ${suggestedRevision.summary}`
    : "";
  const dataLine = toArray(suggestedRevision?.requested_data).length
    ? `What would change this: ${formatList(suggestedRevision.requested_data)}.`
    : "";
  return sanitizeText([primaryReason, supportingLine, revisionLine, dataLine].filter(Boolean).join(" "), 680);
};

const ensureSentence = (value = "", maxLength = 320) => {
  const text = sanitizeText(value, maxLength);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const buildDeterministicFirstBlockAlternatives = ({
  suggestedRevision = null,
  realismStatus = GOAL_REALISM_STATUSES.realistic,
  clarificationRequired = false,
} = {}) => {
  const firstBlockTarget = ensureSentence(suggestedRevision?.first_block_target || "", 280);
  const summary = ensureSentence(suggestedRevision?.summary || "", 280);
  const suggestedTargetHorizonWeeks = Number(suggestedRevision?.suggested_target_horizon_weeks);
  if (
    realismStatus !== GOAL_REALISM_STATUSES.unrealistic
    || clarificationRequired
    || (!firstBlockTarget && !summary)
  ) {
    return [];
  }

  const conservativeSummary = sanitizeText([
    firstBlockTarget || summary,
    "Reassess the bigger target after that block.",
  ].filter(Boolean).join(" "), 320);
  const standardSummary = sanitizeText([
    summary || firstBlockTarget,
    Number.isFinite(suggestedTargetHorizonWeeks)
      ? `A better fit for the full target looks closer to ${Math.max(1, Math.round(suggestedTargetHorizonWeeks))} weeks.`
      : "",
  ].filter(Boolean).join(" "), 320);

  return [
    {
      key: "conservative",
      label: "Conservative",
      summary: conservativeSummary,
      suggested_target_horizon_weeks: null,
    },
    {
      key: "standard",
      label: "Standard",
      summary: standardSummary,
      ...(Number.isFinite(suggestedTargetHorizonWeeks)
        ? { suggested_target_horizon_weeks: Math.max(1, Math.round(suggestedTargetHorizonWeeks)) }
        : {}),
    },
  ]
    .filter((item) => item.summary)
    .map((item) => ({
      key: sanitizeText(item.key, 40).toLowerCase() || "option",
      label: sanitizeText(item.label, 40) || "Option",
      summary: sanitizeText(item.summary, 320),
      ...(Number.isFinite(Number(item.suggested_target_horizon_weeks))
        ? { suggested_target_horizon_weeks: Math.max(1, Math.round(Number(item.suggested_target_horizon_weeks))) }
        : {}),
    }));
};

const isImpossibleReasonCode = (code = "") => (
  ["target_beyond_credible_range"].includes(sanitizeText(code, 80).toLowerCase())
);

const parseSessionLengthMinutes = (value = "") => {
  const text = String(value || "").trim();
  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return 30;
  return Math.max(15, Math.min(180, Math.round(numeric)));
};

const getGoalTextCorpus = (goal = {}) => dedupeStrings([
  goal?.summary,
  goal?.rawIntent?.text,
  goal?.sourceText,
]).join(". ").toLowerCase();

const isMaintenanceIntent = (goal = {}) => (
  /\b(keep|maintain|hold|protect|without losing|without giving up)\b/i.test(getGoalTextCorpus(goal))
);

const isAppearanceGoal = (goal = {}) => (
  sanitizeText(goal?.goalFamily || "", 40).toLowerCase() === "appearance"
  || /\b(abs|six pack|physique|leaner|toned|defined|bigger shoulders|bigger arms|arm muscle|look athletic)\b/i.test(getGoalTextCorpus(goal))
);

const hasExplicitTarget = (goal = {}) => Boolean(
  sanitizeText(goal?.primaryMetric?.targetValue || "", 40)
  || sanitizeText(goal?.targetDate || "", 24)
  || Number(goal?.targetHorizonWeeks || 0) > 0
);

const isHardOutcomeGoal = (goal = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (planningCategory === "running") return true;
  if (planningCategory === "strength") return hasExplicitTarget(goal) && !isMaintenanceIntent(goal);
  if (planningCategory === "body_comp") return hasExplicitTarget(goal) && !isAppearanceGoal(goal);
  return false;
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
  const warningItems = [];
  const blockItems = [];
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
  const pushBlock = (code, summary, priority = 20) => {
    blockItems.push(buildFeasibilityReason({ code, summary, severity: "block", priority }));
  };
  const pushWarning = (code, summary, priority = 40) => {
    warningItems.push(buildFeasibilityReason({ code, summary, severity: "warning", priority }));
  };

  if (isMarathon && targetSeconds && targetSeconds <= 9000) {
    pushBlock("target_beyond_credible_range", "The marathon time target is beyond a credible deterministic planning range for a first block.", 4);
  }
  if (isHalfMarathon && targetSeconds && targetSeconds <= 4500) {
    pushBlock("target_beyond_credible_range", "The half-marathon time target is beyond a credible first-block target unless the current baseline is already elite.", 5);
  }
  if (metricKey.includes("10k") && targetSeconds && targetSeconds <= 2100) {
    pushBlock("target_beyond_credible_range", "The 10K time target is beyond a credible deterministic first-block target.", 6);
  }
  if (metricKey.includes("5k") && targetSeconds && targetSeconds <= 1020) {
    pushBlock("target_beyond_credible_range", "The 5K time target is beyond a credible deterministic first-block target.", 7);
  }

  if (Number.isFinite(runFrequency) && Number.isFinite(targetHorizonWeeks)) {
    if (isHalfMarathon && runFrequency <= 1 && targetHorizonWeeks <= 12) {
      pushBlock("weekly_run_volume_too_low_for_target_date", "Weekly running volume is too low for a half-marathon target on this date.", 10);
    } else if ((isHalfMarathon || isMarathon) && runFrequency <= 2 && targetHorizonWeeks <= 14) {
      pushWarning("weekly_run_volume_too_low_for_target_date", "Weekly running volume is light for this race target, so the first block needs to ramp volume before it chases pace.", 28);
    }
  }

  if (Number.isFinite(longestRunMiles) && Number.isFinite(targetHorizonWeeks)) {
    if (isHalfMarathon && longestRunMiles < 5 && targetHorizonWeeks <= 10) {
      pushBlock("long_run_baseline_too_low_for_target_date", "Your current long run is too short for this half-marathon target on the requested date.", 12);
    } else if (isHalfMarathon && longestRunMiles < 8 && targetHorizonWeeks <= 14) {
      pushWarning("long_run_baseline_too_low_for_target_date", "Your current long run suggests the full half-marathon target may need a longer runway.", 30);
    }
    if (isMarathon && longestRunMiles < 10 && targetHorizonWeeks <= 16) {
      pushBlock("long_run_baseline_too_low_for_target_date", "Your current long run is too short for a marathon target on the requested date.", 11);
    }
  }

  if (Number.isFinite(recentPaceSeconds) && Number.isFinite(targetPaceSeconds) && recentPaceSeconds > 0) {
    const improvementRatio = (recentPaceSeconds - targetPaceSeconds) / recentPaceSeconds;
    if (improvementRatio > 0.22) {
      pushBlock("pace_gap_too_large_for_first_block", "The goal pace is too far ahead of the current running baseline for this first block.", 13);
    } else if (improvementRatio > 0.12) {
      pushWarning("pace_gap_too_large_for_first_block", "The goal pace is ambitious relative to the current running baseline.", 32);
    }
  }

  const targetRunFrequency = Number.isFinite(runFrequency)
    ? Math.max(runFrequency + (runFrequency < 3 ? 1 : 0), isMarathon ? 4 : 3)
    : (isMarathon ? 4 : 3);
  const targetLongRunMiles = Number.isFinite(longestRunMiles)
    ? Math.max(Math.round(longestRunMiles + (isMarathon ? 2 : 1)), isMarathon ? 12 : isHalfMarathon ? 8 : 5)
    : (isMarathon ? 10 : isHalfMarathon ? 7 : 5);
  const suggestedRevision = buildSuggestedRevision({
    kind: "build_running_base",
    summary: blockItems.length
      ? `Use the first block to build weekly running volume and long-run support before you reassess ${sanitizeText(goal?.summary || "the full race target", 160).toLowerCase()}.`
      : warningItems.length
      ? `Keep the race goal, but let the first block raise weekly running volume and long-run support before you judge the full target.`
      : `Proceed with a first block that keeps building race-specific support toward ${sanitizeText(goal?.summary || "the current target", 160).toLowerCase()}.`,
    firstBlockTarget: `Build to about ${targetRunFrequency} runs per week with a repeatable long run around ${targetLongRunMiles} miles before you reassess the full pace target.`,
    requestedData: dedupeStrings([
      !Number.isFinite(targetHorizonWeeks) ? "A confirmed race date or target month" : "",
      "Current runs per week",
      "Either your longest recent run or a recent race or pace result",
    ]),
    suggestedTargetHorizonWeeks: Number(minHorizon) || null,
  });

  return {
    warningItems,
    blockItems,
    warnings: warningItems.map((item) => item.summary),
    blocks: blockItems.map((item) => item.summary),
    suggestedRevision,
    recommendedRevisionSummary: suggestedRevision.summary,
  };
};

const buildStrengthBaselineSignals = ({
  goal = {},
  facts = {},
  targetHorizonWeeks = null,
} = {}) => {
  const warningItems = [];
  const blockItems = [];
  const baselineWeight = Number(facts?.currentStrengthBaseline?.weight);
  const targetWeight = Number(goal?.primaryMetric?.targetValue);
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const liftLabel = sanitizeText(goal?.primaryMetric?.label || "strength target", 80).toLowerCase();
  const impossibleCeiling = STRENGTH_IMPOSSIBLE_CEILINGS[metricKey] || 1000;
  const extremeWarningCeiling = STRENGTH_EXTREME_WARNING_CEILINGS[metricKey] || 700;
  const pushBlock = (code, summary, priority = 20) => {
    blockItems.push(buildFeasibilityReason({ code, summary, severity: "block", priority }));
  };
  const pushWarning = (code, summary, priority = 40) => {
    warningItems.push(buildFeasibilityReason({ code, summary, severity: "warning", priority }));
  };

  if (Number.isFinite(targetWeight) && targetWeight >= impossibleCeiling) {
    pushBlock("target_beyond_credible_range", `The ${liftLabel} target is beyond a credible human range for a deterministic plan.`, 4);
  } else if (Number.isFinite(targetWeight) && targetWeight >= extremeWarningCeiling) {
    pushWarning("target_far_beyond_normal_progression", `The ${liftLabel} target is exceptionally aggressive and needs a very long runway.`, 20);
  }

  if (!Number.isFinite(baselineWeight) || !Number.isFinite(targetWeight) || baselineWeight <= 0) {
    const suggestedRevision = buildSuggestedRevision({
      kind: "anchor_strength_baseline",
      summary: blockItems.length
        ? `Anchor a current ${liftLabel} baseline and pick a credible milestone before treating ${Number.isFinite(targetWeight) ? targetWeight : "the full target"} as real.`
        : warningItems.length
        ? `Keep the long-term ${liftLabel} goal if it matters, but anchor a current baseline and use a smaller first-block milestone before you reassess it.`
        : "",
      firstBlockTarget: Number.isFinite(targetWeight)
        ? `Start with a smaller milestone than ${targetWeight} and lock it to a real current top set before you chase the full number.`
        : `Anchor a current ${liftLabel} top set before you choose the next block target.`,
      requestedData: ["A current top set or recent best for the main lift"],
    });
    return {
      warningItems,
      blockItems,
      warnings: warningItems.map((item) => item.summary),
      blocks: blockItems.map((item) => item.summary),
      suggestedRevision,
      recommendedRevisionSummary: suggestedRevision.summary,
    };
  }

  const absoluteJump = targetWeight - baselineWeight;
  const improvementRatio = targetWeight / baselineWeight;

  if (Number.isFinite(targetHorizonWeeks)) {
    if ((targetHorizonWeeks <= 6 && absoluteJump >= 50) || (targetHorizonWeeks <= 8 && improvementRatio >= 1.35)) {
      pushBlock("strength_jump_too_large_for_timeline", "The jump from the current lift baseline to the target is too large for this timeline.", 10);
    } else if ((targetHorizonWeeks <= 10 && absoluteJump >= 35) || (targetHorizonWeeks <= 12 && improvementRatio >= 1.2)) {
      pushWarning("strength_jump_too_large_for_timeline", "The strength target is ambitious relative to the current lift baseline.", 24);
    }
  }

  const suggestedWeight = roundToNearestFive(Math.min(targetWeight, baselineWeight + Math.max(10, Math.min(30, absoluteJump * 0.5))));
  const suggestedRevision = buildSuggestedRevision({
    kind: "scaled_strength_block",
    summary: blockItems.length
      ? `Use the first block to move from about ${baselineWeight} toward ${suggestedWeight} before you reassess the full ${targetWeight} target.`
      : warningItems.length
      ? `Keep the lift target, but treat the first block as a smaller jump from about ${baselineWeight} before you reassess ${targetWeight}.`
      : `Proceed with the current strength target and use the first block to move the top set upward steadily.`,
    firstBlockTarget: `Move the main lift from about ${baselineWeight} toward ${suggestedWeight} before you treat ${targetWeight} as the next locked milestone.`,
    requestedData: dedupeStrings([
      "A current top set or recent best for the main lift",
      !Number.isFinite(targetHorizonWeeks) ? "A target date or time horizon" : "",
    ]),
  });

  return {
    warningItems,
    blockItems,
    warnings: warningItems.map((item) => item.summary),
    blocks: blockItems.map((item) => item.summary),
    suggestedRevision,
    recommendedRevisionSummary: suggestedRevision.summary,
  };
};

const buildBodyCompBaselineSignals = ({
  goal = {},
  facts = {},
  targetHorizonWeeks = null,
} = {}) => {
  const warningItems = [];
  const blockItems = [];
  const currentBodyweight = Number(facts?.currentBodyweight);
  const targetWeightChange = Number(facts?.targetWeightChange);
  const weeklyChange = Number.isFinite(targetWeightChange) && Number.isFinite(targetHorizonWeeks) && targetHorizonWeeks > 0
    ? Math.abs(targetWeightChange) / targetHorizonWeeks
    : null;
  const weeklyPercent = Number.isFinite(weeklyChange) && Number.isFinite(currentBodyweight) && currentBodyweight > 0
    ? (weeklyChange / currentBodyweight) * 100
    : null;
  const sixPackGoal = /\bsix pack\b|\babs\b/.test(String(goal?.summary || "").toLowerCase());
  const pushBlock = (code, summary, priority = 20) => {
    blockItems.push(buildFeasibilityReason({ code, summary, severity: "block", priority }));
  };
  const pushWarning = (code, summary, priority = 40) => {
    warningItems.push(buildFeasibilityReason({ code, summary, severity: "warning", priority }));
  };

  if (Number.isFinite(weeklyPercent)) {
    if (weeklyPercent > 1.4) {
      pushBlock("body_comp_rate_too_aggressive", "The required weekly rate of change is too aggressive for a credible first block.", 10);
    } else if (weeklyPercent > 1.0) {
      pushWarning("body_comp_rate_too_aggressive", "The body-composition timeline is ambitious relative to a repeatable weekly rate.", 24);
    }
  }

  if (sixPackGoal && Number.isFinite(targetHorizonWeeks)) {
    if (targetHorizonWeeks < 10) {
      pushBlock("appearance_timeline_too_short", "A visible-abs target on this timeline is too compressed for a deterministic first plan.", 12);
    } else if (targetHorizonWeeks < 14) {
      pushWarning("appearance_timeline_too_short", "A visible-abs target on this timeline is ambitious and may need a phased cut.", 28);
    }
  }

  const weeklyPercentSummary = Number.isFinite(currentBodyweight)
    ? "about 0.5-1.0% of bodyweight per week"
    : "a steadier weekly rate";
  const suggestedRevision = buildSuggestedRevision({
    kind: "steady_body_comp_block",
    summary: blockItems.length
      ? `Use a smaller first block at ${weeklyPercentSummary} instead of forcing the full physique target immediately.`
      : warningItems.length
      ? `Keep the physique goal, but plan for a steadier cut pace and reassess after the first block.`
      : `Proceed with a steady first block and track bodyweight or waist so the physique goal stays grounded.`,
    firstBlockTarget: `Aim for about ${weeklyPercentSummary} while tracking bodyweight and waist trend each week.`,
    requestedData: dedupeStrings([
      !Number.isFinite(currentBodyweight) ? "Current bodyweight" : "",
      !Number.isFinite(targetHorizonWeeks) ? "Target timeline" : "",
      "A weekly bodyweight or waist trend after the first block",
    ]),
  });

  return {
    warningItems,
    blockItems,
    warnings: warningItems.map((item) => item.summary),
    blocks: blockItems.map((item) => item.summary),
    suggestedRevision,
    recommendedRevisionSummary: suggestedRevision.summary,
  };
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
  const warningItems = [];
  const blockItems = [];
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 60).toLowerCase();
  const targetValue = Number(goal?.primaryMetric?.targetValue);
  const pushBlock = (code, summary, priority = 20) => {
    blockItems.push(buildFeasibilityReason({ code, summary, severity: "block", priority }));
  };
  const pushWarning = (code, summary, priority = 40) => {
    warningItems.push(buildFeasibilityReason({ code, summary, severity: "warning", priority }));
  };

  if (metricKey === "vertical_jump_height" && Number.isFinite(targetValue)) {
    if (targetValue >= 60) {
      pushBlock("target_beyond_credible_range", "That vertical-jump target is beyond a credible deterministic planning range.", 4);
    } else if (targetValue >= 44) {
      pushWarning("jump_target_needs_long_runway", "That vertical-jump target is exceptionally aggressive and needs a long runway.", 20);
    }
    if (Number.isFinite(targetHorizonWeeks) && targetHorizonWeeks <= 6 && targetValue >= 36) {
      pushWarning("jump_target_tight_for_timeline", "That jump-performance target is tight for the current timeline.", 24);
    }
  }

  const suggestedRevision = buildSuggestedRevision({
    kind: "power_retest_block",
    summary: blockItems.length
      ? "Use the first block to raise power output and retest your jump benchmark before you lock in the full target."
      : warningItems.length
      ? "Keep the jump-performance goal, but treat the first block as power development before you judge the full outcome."
      : "Proceed with a first block that builds power output and retests the jump benchmark on schedule.",
    firstBlockTarget: "Use the first block to build lower-body power and then retest the jump benchmark before you escalate the goal.",
    requestedData: ["A fresh jump benchmark after the first block"],
  });

  return {
    warningItems,
    blockItems,
    warnings: warningItems.map((item) => item.summary),
    blocks: blockItems.map((item) => item.summary),
    suggestedRevision,
    recommendedRevisionSummary: suggestedRevision.summary,
  };
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
  return {
    warningItems: [],
    blockItems: [],
    warnings: [],
    blocks: [],
    suggestedRevision: buildSuggestedRevision({
      kind: "proceed",
      summary: "",
      firstBlockTarget: "",
      requestedData: [],
    }),
    recommendedRevisionSummary: "",
  };
};

const buildFallbackGoalSuggestedRevision = ({
  goal = {},
  demand = {},
  goalId = "",
  targetHorizonWeeks = null,
  scheduleReality = {},
  hasConstraintPenalty = false,
  compressedHorizon = false,
  severelyCompressedHorizon = false,
} = {}) => {
  const minimumDays = Number(demand?.minimumTrainingDays || 0) || 0;
  const requestedData = dedupeStrings([
    !Number.isFinite(Number(targetHorizonWeeks)) ? "A confirmed target date or target month" : "",
    scheduleReality?.trainingDaysPerWeek < minimumDays && minimumDays > 0 ? `More weekly training availability than ${scheduleReality.trainingDaysPerWeek || 0} day${Number(scheduleReality?.trainingDaysPerWeek || 0) === 1 ? "" : "s"} per week` : "",
    hasConstraintPenalty ? "An updated injury or movement-tolerance check-in" : "",
    "A fresh baseline after the first block",
  ]).slice(0, 4);
  const summary = severelyCompressedHorizon
    ? `Use the first block to chase ${sanitizeText(demand?.realisticByDate || "the realistic first win", 180).toLowerCase()} and revisit the full target on a longer horizon.`
    : scheduleReality?.trainingDaysPerWeek < minimumDays && minimumDays > 0
    ? `Either raise weekly training support or scale the first block to ${sanitizeText(demand?.realisticByDate || "the realistic first win", 180).toLowerCase()}.`
    : hasConstraintPenalty
    ? "Use the first block to protect tolerance and movement quality before you push progression."
    : compressedHorizon
    ? `Treat the first block as ${sanitizeText(demand?.realisticByDate || "a realistic first win", 180).toLowerCase()} before you judge the full outcome.`
    : "";
  return buildSuggestedRevision({
    kind: "scaled_first_block",
    summary,
    firstBlockTarget: buildDefaultFirstBlockTarget({ goal, demand }),
    requestedData,
    suggestedTargetHorizonWeeks: Number(demand?.minimumRealisticHorizonWeeks || 0) || null,
    goalId,
  });
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
  const maintenanceIntent = isMaintenanceIntent(goal);
  const appearanceGoal = isAppearanceGoal(goal);
  const hardOutcome = isHardOutcomeGoal(goal);
  const baselineSignals = buildBaselineSignals({
    goal: { ...goal, minimumRealisticHorizonWeeks: demand.minimumRealisticHorizonWeeks },
    facts: intakeCompleteness?.facts || {},
    targetHorizonWeeks,
  });
  const validationBlockItems = validationIssues
    .filter((issue) => issue.severity === "block")
    .map((issue, index) => buildFeasibilityReason({
      code: issue.key || `validation_block_${index}`,
      summary: issue.summary,
      severity: "block",
      priority: 2 + index,
      goalId: goal?.id || "",
    }));
  const validationWarningItems = validationIssues
    .filter((issue) => issue.severity !== "block")
    .map((issue, index) => buildFeasibilityReason({
      code: issue.key || `validation_warning_${index}`,
      summary: issue.summary,
      severity: "warning",
      priority: 26 + index,
      goalId: goal?.id || "",
    }));
  const targetValidation = classifyTargetValidation({
    validationIssues,
    baselineSignalBlocks: baselineSignals.blocks || [],
    baselineSignalWarnings: baselineSignals.warnings || [],
    intakeCompleteness,
    goal,
  });
  const blockingItems = sortFeasibilityReasons([
    ...validationBlockItems,
    ...(baselineSignals.blockItems || []).map((item) => ({ ...item, goalId: item.goalId || goal?.id || "" })),
    ...(severelyCompressedHorizon ? [buildFeasibilityReason({
      code: "timeline_too_compressed_for_goal_demand",
      summary: "The target date is shorter than the runway this goal usually needs.",
      severity: "block",
      priority: 18,
      goalId: goal?.id || "",
    })] : []),
    ...(severeScheduleShortfall ? [buildFeasibilityReason({
      code: "weekly_schedule_support_too_low",
      summary: "Weekly training availability is too low for this goal on the requested date.",
      severity: "block",
      priority: 16,
      goalId: goal?.id || "",
    })] : []),
  ]);
  const warningItems = sortFeasibilityReasons([
    ...validationWarningItems,
    ...(baselineSignals.warningItems || []).map((item) => ({ ...item, goalId: item.goalId || goal?.id || "" })),
    ...(compressedHorizon && !severelyCompressedHorizon ? [buildFeasibilityReason({
      code: "target_window_tight_for_full_outcome",
      summary: "The current target window is tight for the full outcome.",
      severity: "warning",
      priority: 36,
      goalId: goal?.id || "",
    })] : []),
    ...(scheduleShortfall && !severeScheduleShortfall ? [buildFeasibilityReason({
      code: "weekly_schedule_support_light",
      summary: "Weekly training availability is light for the full goal.",
      severity: "warning",
      priority: 34,
      goalId: goal?.id || "",
    })] : []),
    ...(shortSessions ? [buildFeasibilityReason({
      code: "session_length_tight_for_goal",
      summary: "Session length is tight for the work this goal needs.",
      severity: "warning",
      priority: 38,
      goalId: goal?.id || "",
    })] : []),
    ...(hasConstraintPenalty ? [buildFeasibilityReason({
      code: "current_constraints_limit_progression",
      summary: "Current injury or movement constraints mean the first block has to protect tolerance before it pushes progression.",
      severity: "warning",
      priority: 22,
      goalId: goal?.id || "",
    })] : []),
  ]);
  const blockingReasons = blockingItems.map((item) => item.summary);
  const warningReasons = warningItems.map((item) => item.summary);

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
  if (goal?.planningPriority) priorityScore += Math.max(0, 14 - (Number(goal.planningPriority) * 2));
  if (hasTargetWindow) priorityScore += Math.max(0, 28 - Math.min(targetHorizonWeeks, 28));
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable) priorityScore += 18;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.proxyMeasurable) priorityScore += 8;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy) priorityScore -= 8;
  if (hardOutcome) priorityScore += 18;
  if (maintenanceIntent) priorityScore -= 22;
  if (appearanceGoal) priorityScore -= 14;
  if (realismStatus === GOAL_REALISM_STATUSES.realistic) priorityScore += 12;
  if (realismStatus === GOAL_REALISM_STATUSES.aggressive) priorityScore += 2;
  if (realismStatus === GOAL_REALISM_STATUSES.unrealistic) priorityScore -= 18;
  if (severeScheduleShortfall) priorityScore -= 22;
  else if (scheduleShortfall || shortSessions) priorityScore -= 8;
  else priorityScore += 10;
  if (compressedHorizon) priorityScore -= 8;
  if (severelyCompressedHorizon) priorityScore -= 12;
  const suggestedRevision = (
    baselineSignals?.suggestedRevision?.summary
    || baselineSignals?.suggestedRevision?.first_block_target
  )
    ? baselineSignals.suggestedRevision
    : buildFallbackGoalSuggestedRevision({
        goal,
        demand,
        goalId: goal?.id || "",
        targetHorizonWeeks,
        scheduleReality,
        hasConstraintPenalty,
        compressedHorizon,
        severelyCompressedHorizon,
      });
  const firstBlockAlternatives = buildDeterministicFirstBlockAlternatives({
    suggestedRevision,
    realismStatus,
    clarificationRequired: Boolean(targetValidation?.clarificationRequired),
  });
  const revisionWithAlternatives = firstBlockAlternatives.length
    ? {
        ...suggestedRevision,
        first_block_alternatives: firstBlockAlternatives,
      }
    : suggestedRevision;
  const gateStatus = blockingItems.length || warningItems.length || targetValidation.clarificationRequired
    ? blockingItems.some((item) => isImpossibleReasonCode(item.code))
      ? GOAL_FEASIBILITY_GATE_STATUSES.impossible
      : GOAL_FEASIBILITY_GATE_STATUSES.needsRevision
    : GOAL_FEASIBILITY_GATE_STATUSES.ok;
  const gateReasons = sortFeasibilityReasons([
    ...blockingItems,
    ...warningItems,
  ]).slice(0, 3);
  if (!gateReasons.length) {
    gateReasons.push(buildFeasibilityReason({
      code: "aligned_with_current_capacity",
      summary: "The current target fits the available schedule and baseline cleanly enough to plan from.",
      severity: "warning",
      priority: 90,
      goalId: goal?.id || "",
    }));
  }
  const explanationText = buildGateExplanationText({
    reasons: gateReasons,
    suggestedRevision: revisionWithAlternatives,
    status: gateStatus,
  });

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
    maintenanceIntent,
    appearanceGoal,
    hardOutcome,
    realisticByTargetDate,
    longerHorizonNeed,
    blockingReasons: dedupeStrings(blockingReasons),
    warningReasons: dedupeStrings(warningReasons),
    recommendedRevisionSummary: sanitizeText(
      validationIssues[0]?.prompt
      || suggestedRevision?.summary
      || baselineSignals.recommendedRevisionSummary
      || "",
      220
    ),
    status: gateStatus,
    primaryReasonCode: sanitizeText(gateReasons[0]?.code || "", 80).toLowerCase(),
    reasons: gateReasons,
    suggested_revision: revisionWithAlternatives,
    explanation_text: explanationText,
    priorityScore,
  };
};

const buildConflictFlags = ({ resolvedGoals = [], goalAssessments = [], scheduleReality = {}, currentContext = {} } = {}) => {
  const assessmentMap = new Map(toArray(goalAssessments).map((assessment) => [assessment.goalId, assessment]));
  const shapedGoals = toArray(resolvedGoals).map((goal) => {
    const assessment = assessmentMap.get(goal?.id || "") || {};
    return {
      goal,
      assessment,
      planningCategory: sanitizeText(goal?.planningCategory || "", 40).toLowerCase(),
      goalFamily: sanitizeText(goal?.goalFamily || "", 40).toLowerCase(),
      maintenanceIntent: Boolean(assessment?.maintenanceIntent ?? isMaintenanceIntent(goal)),
      appearanceGoal: Boolean(assessment?.appearanceGoal ?? isAppearanceGoal(goal)),
      hardOutcome: Boolean(assessment?.hardOutcome ?? isHardOutcomeGoal(goal)),
    };
  });
  const categories = new Set((resolvedGoals || []).map((goal) => sanitizeText(goal?.planningCategory || "", 40).toLowerCase()).filter(Boolean));
  const flags = [];
  const scheduleTight = scheduleReality.trainingDaysPerWeek <= 3 || scheduleReality.sessionLengthMinutes < 35;
  const scheduleSupported = scheduleReality.trainingDaysPerWeek >= 5 && scheduleReality.sessionLengthMinutes >= 45;
  const scheduleModerate = scheduleReality.trainingDaysPerWeek >= 4 && scheduleReality.sessionLengthMinutes >= 40;
  const hasRunning = categories.has("running");
  const hasStrength = categories.has("strength");
  const hasBodyComp = categories.has("body_comp");
  const hardOutcomeGoals = shapedGoals.filter((item) => item.hardOutcome);
  const compressedHardOutcomes = shapedGoals.filter((item) => (
    item.hardOutcome
    && ["aggressive", "unrealistic"].includes(sanitizeText(item.assessment?.realismStatus || "", 20).toLowerCase())
  ));
  const performanceBodyCompPush = shapedGoals.some((item) => (
    item.planningCategory === "body_comp"
    && item.hardOutcome
    && !item.appearanceGoal
  ));
  const sameLaneBenchmarkCategory = ["running", "strength"].find((planningCategory) => (
    hardOutcomeGoals.filter((item) => item.planningCategory === planningCategory).length >= 2
  )) || "";

  if (hasRunning && hasStrength) {
    flags.push({
      key: "hybrid_interference",
      severity: scheduleSupported && !performanceBodyCompPush
        ? GOAL_CONFLICT_SEVERITIES.low
        : scheduleTight || performanceBodyCompPush
        ? GOAL_CONFLICT_SEVERITIES.high
        : scheduleModerate
        ? GOAL_CONFLICT_SEVERITIES.medium
        : GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: (resolvedGoals || []).filter((goal) => ["running", "strength"].includes(goal?.planningCategory)).map((goal) => goal.id),
      summary: scheduleSupported && !performanceBodyCompPush
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

  if (hasRunning && hasStrength && performanceBodyCompPush) {
    flags.push({
      key: "recovery_budget_overdrawn",
      severity: scheduleSupported ? GOAL_CONFLICT_SEVERITIES.medium : GOAL_CONFLICT_SEVERITIES.high,
      goalIds: shapedGoals
        .filter((item) => ["running", "strength", "body_comp"].includes(item.planningCategory))
        .map((item) => item.goal?.id)
        .filter(Boolean),
      summary: "Trying to push running, strength, and an aggressive cut together will overdraw recovery unless one lane clearly leads.",
    });
  }

  if (sameLaneBenchmarkCategory) {
    flags.push({
      key: "same_lane_benchmark_stack",
      severity: scheduleTight ? GOAL_CONFLICT_SEVERITIES.high : GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: hardOutcomeGoals
        .filter((item) => item.planningCategory === sameLaneBenchmarkCategory)
        .map((item) => item.goal?.id)
        .filter(Boolean),
      summary: sameLaneBenchmarkCategory === "running"
        ? "Multiple running benchmarks are sharing one lane, so one race target should lead and the other should ride as support."
        : "Multiple strength benchmarks are sharing one lane, so one lift target should lead and the other should ride as support.",
    });
  }

  if (
    hardOutcomeGoals.length >= 3
    || (hardOutcomeGoals.length >= 2 && performanceBodyCompPush && !scheduleSupported)
  ) {
    flags.push({
      key: "parallel_outcome_overload",
      severity: scheduleTight || hardOutcomeGoals.length >= 3
        ? GOAL_CONFLICT_SEVERITIES.high
        : GOAL_CONFLICT_SEVERITIES.medium,
      goalIds: hardOutcomeGoals.map((item) => item.goal?.id).filter(Boolean),
      summary: "There are too many hard outcomes to push in parallel here, so one lane has to lead, one can be maintained, and the rest should sequence.",
    });
  }

  if (compressedHardOutcomes.length >= 2) {
    flags.push({
      key: "compressed_parallel_targets",
      severity: GOAL_CONFLICT_SEVERITIES.high,
      goalIds: compressedHardOutcomes.map((item) => item.goal?.id).filter(Boolean),
      summary: "More than one major target is already tight for the current runway, so lower-priority target windows need to move or phase later.",
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
      summary: "Current injury or movement constraints mean the first block has to protect tolerance before it pushes progression.",
    });
  }

  return flags.slice(0, 7);
};

const buildSuggestedSequencing = ({ resolvedGoals = [], goalAssessments = [], conflictFlags = [] } = {}) => {
  const sequencing = [];
  const getFlag = (key) => conflictFlags.find((flag) => flag.key === key) || null;
  const primaryConflict = conflictFlags.find((flag) => flag.severity === GOAL_CONFLICT_SEVERITIES.high) || conflictFlags[0] || null;
  const compressedGoal = goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.unrealistic)
    || goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.aggressive)
    || null;
  const fatLossVsStrength = getFlag("fat_loss_vs_strength");
  const fatLossVsEndurance = getFlag("fat_loss_vs_endurance");
  const sameLaneBenchmarkStack = getFlag("same_lane_benchmark_stack");
  const recoveryBudgetOverdrawn = getFlag("recovery_budget_overdrawn");
  const parallelOutcomeOverload = getFlag("parallel_outcome_overload");
  const compressedParallelTargets = getFlag("compressed_parallel_targets");
  const hybridInterference = getFlag("hybrid_interference");
  const limitedScheduleStack = getFlag("limited_schedule_multi_goal_stack");

  if (sameLaneBenchmarkStack) {
    sequencing.push({
      phase: "now",
      goalIds: sameLaneBenchmarkStack.goalIds,
      summary: "Pick one benchmark as the headline target and let the second ride the same lane instead of forcing two co-primary outcomes.",
    });
  }

  if (recoveryBudgetOverdrawn) {
    sequencing.push({
      phase: "now",
      goalIds: recoveryBudgetOverdrawn.goalIds,
      summary: "Use one performance lane as the lead, keep the cut moderate, and let support work ride in the background until recovery stabilizes.",
    });
  }

  if (parallelOutcomeOverload) {
    sequencing.push({
      phase: "now",
      goalIds: parallelOutcomeOverload.goalIds,
      summary: "Use this block for one primary outcome and one maintained lane, then sequence the rest into the next block instead of asking everything to peak together.",
    });
  }

  if (compressedParallelTargets) {
    sequencing.push({
      phase: "next_block",
      goalIds: compressedParallelTargets.goalIds,
      summary: "Move the lower-priority target date or delay that lane until the first block lands, because the current stack is too compressed to judge honestly.",
    });
  }

  if (fatLossVsStrength) {
    sequencing.push({
      phase: "now",
      goalIds: fatLossVsStrength.goalIds,
      summary: "Lead with body composition now and treat strength as maintenance until the physique push settles.",
    });
  }

  if (fatLossVsEndurance) {
    sequencing.push({
      phase: "now",
      goalIds: fatLossVsEndurance.goalIds,
      summary: "Keep the cut moderate while run quality matters, then press harder on body composition after the race-specific block settles.",
    });
  }

  if (hybridInterference) {
    sequencing.push({
      phase: "now",
      goalIds: hybridInterference.goalIds,
      summary: hybridInterference.severity === GOAL_CONFLICT_SEVERITIES.low
        ? "Use a clear weekly split so both lanes stay alive without competing every session."
        : "Start with one lead emphasis per block and hold the other lane at maintenance volume.",
    });
  }

  if (limitedScheduleStack) {
    sequencing.push({
      phase: "now",
      goalIds: limitedScheduleStack.goalIds,
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

  return dedupeFeasibilityReasons(sequencing.map((item, index) => ({
    code: `${item.phase}_${index}`,
    summary: item.summary,
    severity: "warning",
    priority: index + 1,
    goalId: toArray(item.goalIds || [])[0] || "",
    item,
  }))).map((entry) => entry.item).slice(0, 5);
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

const buildMissingContextRevision = ({
  intakeCompleteness = null,
  primaryGoal = null,
  primaryAssessment = null,
} = {}) => buildSuggestedRevision({
  kind: "collect_missing_anchors",
  summary: `Lock ${formatList(toArray(intakeCompleteness?.missingRequired || []).slice(0, 3)).toLowerCase()} before the first block is finalized.`,
  firstBlockTarget: primaryAssessment?.suggested_revision?.first_block_target
    || buildDefaultFirstBlockTarget({
      goal: primaryGoal,
      demand: {
        realisticByDate: primaryAssessment?.realisticByTargetDate || "",
      },
    }),
  requestedData: toArray(intakeCompleteness?.missingRequired || []).slice(0, 4),
  goalId: primaryGoal?.id || primaryAssessment?.goalId || "",
});

const toLegacyRecommendedRevisionKind = ({
  gateStatus = GOAL_FEASIBILITY_GATE_STATUSES.ok,
  suggestedRevision = null,
  primaryReasonCode = "",
} = {}) => {
  const reasonCode = sanitizeText(primaryReasonCode || "", 80).toLowerCase();
  const kind = sanitizeText(suggestedRevision?.kind || "", 80).toLowerCase();
  if (reasonCode === "missing_required_context") return "missing_context";
  if (reasonCode === "clarification_required") return "clarification_required";
  if (kind === "collect_missing_anchors") return "missing_context";
  if (kind === "clarification_required") return "clarification_required";
  if (gateStatus === GOAL_FEASIBILITY_GATE_STATUSES.ok) return "proceed";
  return kind || "scaled_first_block";
};

const buildFeasibilityGateResult = ({
  goalAssessments = [],
  intakeCompleteness = null,
  conflictFlags = [],
  confirmationAction = GOAL_FEASIBILITY_ACTIONS.proceed,
  recommendedPriorityOrdering = [],
} = {}) => {
  const primaryGoalId = sanitizeText(toArray(recommendedPriorityOrdering)[0]?.goalId || goalAssessments[0]?.goalId || "", 120);
  const primaryAssessment = goalAssessments.find((assessment) => assessment.goalId === primaryGoalId)
    || goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.unrealistic)
    || goalAssessments.find((assessment) => assessment.realismStatus === GOAL_REALISM_STATUSES.aggressive)
    || goalAssessments[0]
    || null;
  const missingRequired = toArray(intakeCompleteness?.missingRequired || []).slice(0, 4);

  if (missingRequired.length) {
    const reasons = missingRequired.map((item, index) => buildFeasibilityReason({
      code: index === 0 ? "missing_required_context" : "missing_supporting_context",
      summary: index === 0
        ? `${sanitizeText(item, 160)} is still missing, so the gate cannot judge the target cleanly yet.`
        : `Need ${sanitizeText(item, 160).toLowerCase()} before the recommendation can tighten.`,
      severity: "block",
      priority: 1 + index,
      goalId: primaryAssessment?.goalId || "",
    }));
    const suggestedRevision = buildMissingContextRevision({
      intakeCompleteness,
      primaryGoal: { id: primaryGoalId, summary: primaryAssessment?.goalSummary || "" },
      primaryAssessment,
    });
    return {
      status: GOAL_FEASIBILITY_GATE_STATUSES.needsRevision,
      primary_reason_code: "missing_required_context",
      primaryReasonCode: "missing_required_context",
      reasons,
      suggested_revision: suggestedRevision,
      explanation_text: buildGateExplanationText({
        reasons,
        suggestedRevision,
        status: GOAL_FEASIBILITY_GATE_STATUSES.needsRevision,
      }),
    };
  }

  const malformedAssessment = goalAssessments.find((assessment) => assessment.targetValidationStatus === GOAL_TARGET_VALIDATION_STATUSES.malformedMetric) || null;
  if (malformedAssessment) {
    const reasons = sortFeasibilityReasons(toArray(malformedAssessment.reasons).length ? malformedAssessment.reasons : [buildFeasibilityReason({
      code: malformedAssessment.primaryReasonCode || "clarification_required",
      summary: malformedAssessment.targetValidationReason || malformedAssessment.blockingReasons?.[0] || "The target needs clarification before it can be judged cleanly.",
      severity: "block",
      priority: 1,
      goalId: malformedAssessment.goalId || "",
    })]).slice(0, 3);
    const suggestedRevision = buildSuggestedRevision({
      kind: "clarification_required",
      summary: malformedAssessment.targetValidationReason || malformedAssessment.blockingReasons?.[0] || "Clarify the target phrasing before the gate can proceed.",
      firstBlockTarget: buildDefaultFirstBlockTarget({
        goal: { planningCategory: malformedAssessment.planningCategory || "" },
        demand: { realisticByDate: malformedAssessment.realisticByTargetDate || "" },
      }),
      requestedData: ["A clearer version of the target metric"],
      goalId: malformedAssessment.goalId || "",
    });
    return {
      status: GOAL_FEASIBILITY_GATE_STATUSES.needsRevision,
      primary_reason_code: sanitizeText(reasons[0]?.code || "clarification_required", 80).toLowerCase(),
      primaryReasonCode: sanitizeText(reasons[0]?.code || "clarification_required", 80).toLowerCase(),
      reasons,
      suggested_revision: suggestedRevision,
      explanation_text: buildGateExplanationText({
        reasons,
        suggestedRevision,
        status: GOAL_FEASIBILITY_GATE_STATUSES.needsRevision,
      }),
    };
  }

  const selectedAssessment = primaryAssessment || null;
  const selectedReasons = sortFeasibilityReasons([
    ...toArray(selectedAssessment?.reasons || []),
    ...(confirmationAction === GOAL_FEASIBILITY_ACTIONS.warn && conflictFlags[0]?.summary ? [buildFeasibilityReason({
      code: sanitizeText(conflictFlags[0]?.key || "goal_tradeoff", 80).toLowerCase(),
      summary: conflictFlags[0].summary,
      severity: "warning",
      priority: 60,
      goalId: primaryGoalId,
    })] : []),
  ]).slice(0, 3);
  const gateStatus = selectedAssessment?.status === GOAL_FEASIBILITY_GATE_STATUSES.impossible
    ? GOAL_FEASIBILITY_GATE_STATUSES.impossible
    : confirmationAction === GOAL_FEASIBILITY_ACTIONS.proceed
    ? GOAL_FEASIBILITY_GATE_STATUSES.ok
    : GOAL_FEASIBILITY_GATE_STATUSES.needsRevision;
  const reasons = selectedReasons.length
    ? selectedReasons
    : [buildFeasibilityReason({
        code: "aligned_with_current_capacity",
        summary: "The current target fits the available schedule and baseline cleanly enough to plan from.",
        severity: "warning",
        priority: 90,
        goalId: primaryGoalId,
      })];
  const suggestedRevision = selectedAssessment?.suggested_revision || buildSuggestedRevision({
    kind: gateStatus === GOAL_FEASIBILITY_GATE_STATUSES.ok ? "proceed" : "scaled_first_block",
    summary: gateStatus === GOAL_FEASIBILITY_GATE_STATUSES.ok
      ? `The first block can build directly toward ${sanitizeText(selectedAssessment?.goalSummary || "the current target", 160).toLowerCase()}.`
      : `Use the first block to chase ${sanitizeText(selectedAssessment?.realisticByTargetDate || "the realistic first win", 180).toLowerCase()}.`,
    firstBlockTarget: buildDefaultFirstBlockTarget({
      goal: {
        planningCategory: selectedAssessment?.planningCategory || "",
        goalFamily: "",
      },
      demand: {
        realisticByDate: selectedAssessment?.realisticByTargetDate || "",
      },
    }),
    requestedData: ["A fresh baseline after the first block"],
    suggestedTargetHorizonWeeks: selectedAssessment?.minimumRealisticHorizonWeeks || null,
    goalId: selectedAssessment?.goalId || "",
  });
  return {
    status: gateStatus,
    primary_reason_code: sanitizeText(reasons[0]?.code || "aligned_with_current_capacity", 80).toLowerCase(),
    primaryReasonCode: sanitizeText(reasons[0]?.code || "aligned_with_current_capacity", 80).toLowerCase(),
    reasons,
    suggested_revision: suggestedRevision,
    explanation_text: buildGateExplanationText({
      reasons,
      suggestedRevision,
      status: gateStatus,
    }),
  };
};

const buildRecommendedRevision = ({
  intakeCompleteness = null,
  goalAssessments = [],
  conflictFlags = [],
  realismStatus = GOAL_REALISM_STATUSES.exploratory,
} = {}) => {
  const gate = buildFeasibilityGateResult({
    goalAssessments,
    intakeCompleteness,
    conflictFlags,
    confirmationAction: buildConfirmationAction({
      realismStatus,
      intakeCompleteness,
      conflictFlags,
      goalAssessments,
    }),
    recommendedPriorityOrdering: [],
  });
  if (!gate?.suggested_revision) return null;
  return {
    kind: toLegacyRecommendedRevisionKind({
      gateStatus: gate.status,
      suggestedRevision: gate.suggested_revision,
      primaryReasonCode: gate.primary_reason_code || gate.primaryReasonCode,
    }),
    goalId: gate.suggested_revision.goal_id || "",
    summary: gate.suggested_revision.summary,
    suggestedTargetHorizonWeeks: gate.suggested_revision.suggested_target_horizon_weeks || null,
  };
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
  const confirmationAction = buildConfirmationAction({
    realismStatus,
    intakeCompleteness: normalizedCompleteness,
    conflictFlags,
    goalAssessments,
  });
  const gate = buildFeasibilityGateResult({
    goalAssessments,
    intakeCompleteness: normalizedCompleteness,
    conflictFlags,
    confirmationAction,
    recommendedPriorityOrdering,
  });
  const recommendedRevision = gate?.suggested_revision
    ? {
        kind: toLegacyRecommendedRevisionKind({
          gateStatus: gate.status,
          suggestedRevision: gate.suggested_revision,
          primaryReasonCode: gate.primary_reason_code || gate.primaryReasonCode,
        }),
        goalId: gate.suggested_revision.goal_id || "",
        summary: gate.suggested_revision.summary,
        suggestedTargetHorizonWeeks: gate.suggested_revision.suggested_target_horizon_weeks || null,
      }
    : buildRecommendedRevision({
        intakeCompleteness: normalizedCompleteness,
        goalAssessments,
        conflictFlags,
        realismStatus,
      });
  const blockingReasons = confirmationAction === GOAL_FEASIBILITY_ACTIONS.block
    ? dedupeStrings([
        ...toArray(gate?.reasons).map((item) => sanitizeText(item?.summary || "", 220)).filter(Boolean),
        ...goalAssessments.flatMap((assessment) => assessment.blockingReasons || []),
      ]).slice(0, 4)
    : [];
  const warningReasons = confirmationAction === GOAL_FEASIBILITY_ACTIONS.warn
    ? dedupeStrings([
        ...toArray(gate?.reasons).map((item) => sanitizeText(item?.summary || "", 220)).filter(Boolean),
        ...conflictFlags.filter((flag) => flag.severity === GOAL_CONFLICT_SEVERITIES.high).map((flag) => flag.summary),
      ]).slice(0, 4)
    : [];
  const tradeoffSummary = dedupeStrings(conflictFlags.map((flag) => flag.summary)).join(" ");
  const malformedGoalAssessment = goalAssessments.find((assessment) => assessment.targetValidationStatus === GOAL_TARGET_VALIDATION_STATUSES.malformedMetric) || null;

  return {
    status: gate?.status || GOAL_FEASIBILITY_GATE_STATUSES.ok,
    primary_reason_code: sanitizeText(gate?.primary_reason_code || "", 80).toLowerCase(),
    primaryReasonCode: sanitizeText(gate?.primaryReasonCode || gate?.primary_reason_code || "", 80).toLowerCase(),
    reasons: toArray(gate?.reasons).map((item) => ({
      code: sanitizeText(item?.code || "", 80).toLowerCase(),
      summary: sanitizeText(item?.summary || "", 220),
      severity: sanitizeText(item?.severity || "warning", 20).toLowerCase(),
      goalId: sanitizeText(item?.goalId || "", 120),
    })).filter((item) => item.summary),
    suggested_revision: gate?.suggested_revision || null,
    first_block_alternatives: toArray(gate?.suggested_revision?.first_block_alternatives).map((item) => ({
      key: sanitizeText(item?.key || "", 40).toLowerCase(),
      label: sanitizeText(item?.label || "", 40),
      summary: sanitizeText(item?.summary || "", 320),
      suggested_target_horizon_weeks: Number.isFinite(Number(item?.suggested_target_horizon_weeks))
        ? Math.max(1, Math.round(Number(item.suggested_target_horizon_weeks)))
        : null,
    })).filter((item) => item.summary),
    explanation_text: sanitizeText(gate?.explanation_text || "", 680),
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
