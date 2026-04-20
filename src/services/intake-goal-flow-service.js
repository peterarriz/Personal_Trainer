import { GOAL_MEASURABILITY_TIERS, resolveGoalTranslation } from "./goal-resolution-service.js";
import { buildGoalArbitrationStack } from "./goal-arbitration-service.js";
import {
  applyIntakeCompletenessAnswer as applyStructuredIntakeCompletenessAnswer,
  buildIntakeCompletenessContext,
  deriveIntakeCompletenessState,
  INTAKE_COMPLETENESS_FIELDS,
  INTAKE_COMPLETENESS_QUESTION_KEYS,
  isCompletenessClarificationNote,
} from "./intake-completeness-service.js";
import { buildGoalTimingPresentation } from "./goal-timing-service.js";
import { sanitizeDisplayCopy } from "./text-format-service.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sanitizeDisplayLine = (value = "", maxLength = 240) => sanitizeDisplayCopy(sanitizeText(value, maxLength));
const sanitizeDisplayList = (items = [], maxLength = 220) => (
  toArray(items).map((item) => sanitizeDisplayLine(item, maxLength)).filter(Boolean)
);

const dedupeStrings = (items = []) => {
  const seen = new Set();
  return toArray(items)
    .map((item) => sanitizeText(item, 220))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const hasFiniteNumericValue = (value) => Number.isFinite(Number(value));
const roundToNearestFive = (value) => Math.round(Number(value || 0) / 5) * 5;
const clampPositiveInteger = (value, fallback = null) => (
  hasFiniteNumericValue(value)
    ? Math.max(1, Math.round(Number(value)))
    : fallback
);

const cloneMetric = (metric = null) => (
  metric && typeof metric === "object"
    ? { ...metric }
    : null
);

const cloneMetricList = (metrics = []) => (
  toArray(metrics)
    .filter(Boolean)
    .map((metric) => (metric && typeof metric === "object" ? { ...metric } : metric))
);

const normalizeMetricKey = (label = "") => (
  sanitizeText(label, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
);

const buildMilestoneTargetLine = ({
  prefix = "",
  detail = "",
  suffix = "",
} = {}) => sanitizeText([prefix, detail, suffix].filter(Boolean).join(" ").replace(/\s+/g, " "), 220);

export const INTAKE_MILESTONE_PATHS = {
  keepTarget: "keep_full_target",
  milestoneFirst: "milestone_first",
};

const INTAKE_MILESTONE_PATH_VALUES = new Set(Object.values(INTAKE_MILESTONE_PATHS));

const parseRunningMilestoneTargets = (text = "") => {
  const cleanText = sanitizeText(text, 320);
  const runsMatch = cleanText.match(/(\d+)\s+runs?\s+per\s+week/i);
  const milesMatch = cleanText.match(/around\s+(\d+)\s+miles?/i);
  return {
    runsPerWeek: runsMatch ? Number(runsMatch[1]) : null,
    longRunMiles: milesMatch ? Number(milesMatch[1]) : null,
  };
};

const parseStrengthMilestoneTargets = (text = "") => {
  const cleanText = sanitizeText(text, 320);
  const rangeMatch = cleanText.match(/from\s+about\s+(\d{2,4})\s+toward\s+(\d{2,4})/i);
  if (rangeMatch) {
    return {
      baselineWeight: Number(rangeMatch[1]),
      towardWeight: Number(rangeMatch[2]),
    };
  }
  const towardMatch = cleanText.match(/toward\s+(\d{2,4})/i);
  const smallerThanMatch = cleanText.match(/smaller\s+milestone\s+than\s+(\d{2,4})/i);
  return {
    baselineWeight: null,
    towardWeight: towardMatch ? Number(towardMatch[1]) : smallerThanMatch ? Number(smallerThanMatch[1]) : null,
  };
};

const buildRunningMilestoneShape = ({
  goal = null,
  suggestedRevision = null,
  goalAssessment = null,
} = {}) => {
  const firstBlockTarget = sanitizeText(suggestedRevision?.first_block_target || "", 260);
  const { runsPerWeek, longRunMiles } = parseRunningMilestoneTargets(firstBlockTarget);
  const metric = longRunMiles
    ? {
        key: "long_run_distance",
        label: "Long run distance",
        unit: "miles",
        kind: "primary",
        targetValue: String(longRunMiles),
      }
    : cloneMetric(goal?.primaryMetric);
  const proxyMetrics = dedupeStrings([
    runsPerWeek ? "Weekly run frequency" : "",
    ...cloneMetricList(goal?.proxyMetrics).map((item) => item?.label || ""),
  ]).map((label) => ({
    key: normalizeMetricKey(label),
    label,
    unit: /frequency/i.test(label) ? "sessions" : "",
    kind: "proxy",
  }));
  return {
    summary: runsPerWeek && longRunMiles
      ? `Build to ${runsPerWeek} runs/week and a repeatable ${longRunMiles}-mile long run`
      : longRunMiles
      ? `Build to a repeatable ${longRunMiles}-mile long run`
      : "Build a stronger running base first",
    planningCategory: "running",
    goalFamily: sanitizeText(goal?.goalFamily || "performance", 40).toLowerCase() || "performance",
    primaryMetric: metric,
    proxyMetrics,
    targetHorizonWeeks: clampPositiveInteger(suggestedRevision?.suggested_target_horizon_weeks, 6),
    first30DaySuccessDefinition: firstBlockTarget || "Build repeatable weekly running rhythm before you push the full race target again.",
    reviewCadence: "biweekly",
    refinementTrigger: "milestone_reached_or_base_block_complete",
  };
};

const buildStrengthMilestoneShape = ({
  goal = null,
  suggestedRevision = null,
  goalAssessment = null,
} = {}) => {
  const firstBlockTarget = sanitizeText(suggestedRevision?.first_block_target || "", 260);
  const { baselineWeight, towardWeight } = parseStrengthMilestoneTargets(firstBlockTarget);
  const originalTarget = Number(goal?.primaryMetric?.targetValue);
  let milestoneWeight = towardWeight;
  if (!hasFiniteNumericValue(milestoneWeight) && hasFiniteNumericValue(originalTarget)) {
    milestoneWeight = Math.max(5, Number(originalTarget) - 20);
  }
  if (hasFiniteNumericValue(baselineWeight) && hasFiniteNumericValue(milestoneWeight)) {
    let safeWeight = Number(milestoneWeight);
    while (safeWeight > Number(baselineWeight) && (safeWeight / Number(baselineWeight)) >= 1.2) {
      safeWeight -= 5;
    }
    if ((safeWeight - Number(baselineWeight)) >= 35) {
      safeWeight = Number(baselineWeight) + 30;
    }
    milestoneWeight = roundToNearestFive(Math.max(Number(baselineWeight) + 10, safeWeight));
  }
  const metricLabel = sanitizeText(goal?.primaryMetric?.label || "Main lift", 80) || "Main lift";
  const unit = sanitizeText(goal?.primaryMetric?.unit || "lb", 16) || "lb";
  let targetHorizonWeeks = clampPositiveInteger(
    goalAssessment?.minimumRealisticHorizonWeeks || suggestedRevision?.suggested_target_horizon_weeks,
    10
  );
  if (hasFiniteNumericValue(baselineWeight) && hasFiniteNumericValue(milestoneWeight) && targetHorizonWeeks <= 12 && (Number(milestoneWeight) / Number(baselineWeight)) >= 1.2) {
    targetHorizonWeeks = 14;
  }
  return {
    summary: hasFiniteNumericValue(milestoneWeight)
      ? `Build ${metricLabel} toward ${milestoneWeight} ${unit}`
      : `Build ${metricLabel} with repeatable top sets`,
    planningCategory: "strength",
    goalFamily: sanitizeText(goal?.goalFamily || "strength", 40).toLowerCase() || "strength",
    primaryMetric: hasFiniteNumericValue(milestoneWeight)
      ? {
          ...(cloneMetric(goal?.primaryMetric) || {}),
          key: sanitizeText(goal?.primaryMetric?.key || normalizeMetricKey(metricLabel), 80),
          label: metricLabel,
          unit,
          kind: "primary",
          targetValue: String(milestoneWeight),
        }
      : cloneMetric(goal?.primaryMetric),
    proxyMetrics: cloneMetricList(goal?.proxyMetrics),
    targetHorizonWeeks,
    first30DaySuccessDefinition: firstBlockTarget || "Build repeatable top-set quality before you push the full number again.",
    reviewCadence: "biweekly",
    refinementTrigger: "milestone_reached_or_top_set_stall",
  };
};

const buildBodyCompMilestoneShape = ({
  goal = null,
  suggestedRevision = null,
} = {}) => ({
  summary: "Lock in a steady cut pace and a truthful weekly trend",
  planningCategory: "general_fitness",
  goalFamily: sanitizeText(goal?.goalFamily || "body_comp", 40).toLowerCase() || "body_comp",
  primaryMetric: null,
  proxyMetrics: dedupeStrings([
    ...cloneMetricList(goal?.proxyMetrics).map((item) => item?.label || ""),
    "Bodyweight trend",
    "Waist trend",
  ]).map((label) => ({
    key: normalizeMetricKey(label),
    label,
    unit: /waist/i.test(label) ? "in" : /bodyweight/i.test(label) ? "lb" : "",
    kind: "proxy",
  })),
  targetHorizonWeeks: clampPositiveInteger(suggestedRevision?.suggested_target_horizon_weeks, 6),
  first30DaySuccessDefinition: sanitizeText(
    suggestedRevision?.first_block_target || "Track a weekly bodyweight and waist trend while you establish a steadier cut pace.",
    220
  ),
  reviewCadence: "weekly",
  refinementTrigger: "four_week_trend_review",
});

const buildPowerMilestoneShape = ({
  goal = null,
  suggestedRevision = null,
} = {}) => ({
  summary: "Build lower-body power and retest the jump benchmark",
  planningCategory: sanitizeText(goal?.planningCategory || "strength", 40).toLowerCase() || "strength",
  goalFamily: sanitizeText(goal?.goalFamily || "athletic_power", 40).toLowerCase() || "athletic_power",
  primaryMetric: {
    key: "jump_retest",
    label: "Jump retest",
    unit: "",
    kind: "primary",
    targetValue: "retest",
  },
  proxyMetrics: cloneMetricList(goal?.proxyMetrics),
  targetHorizonWeeks: clampPositiveInteger(suggestedRevision?.suggested_target_horizon_weeks, 6),
  first30DaySuccessDefinition: sanitizeText(
    suggestedRevision?.first_block_target || "Use the first block to build power and then retest the jump benchmark.",
    220
  ),
  reviewCadence: "biweekly",
  refinementTrigger: "power_retest_due",
});

const buildGenericMilestoneShape = ({
  goal = null,
  suggestedRevision = null,
} = {}) => ({
  summary: sanitizeText(
    suggestedRevision?.first_block_target
    || suggestedRevision?.summary
    || `Build a smaller first milestone before you push ${goal?.summary || "the full target"} again.`,
    120
  ),
  planningCategory: sanitizeText(goal?.planningCategory || "general_fitness", 40).toLowerCase() || "general_fitness",
  goalFamily: sanitizeText(goal?.goalFamily || "general_fitness", 40).toLowerCase() || "general_fitness",
  primaryMetric: cloneMetric(goal?.primaryMetric),
  proxyMetrics: cloneMetricList(goal?.proxyMetrics),
  targetHorizonWeeks: clampPositiveInteger(suggestedRevision?.suggested_target_horizon_weeks, goal?.targetHorizonWeeks || 6),
  first30DaySuccessDefinition: sanitizeText(
    suggestedRevision?.first_block_target || suggestedRevision?.summary || goal?.first30DaySuccessDefinition || "",
    220
  ),
  reviewCadence: sanitizeText(goal?.reviewCadence || "weekly", 40),
  refinementTrigger: "milestone_reached_or_review_due",
});

const buildMilestoneGoalShape = ({
  goal = null,
  goalAssessment = null,
} = {}) => {
  const suggestedRevision = goalAssessment?.suggested_revision || {};
  const revisionKind = sanitizeText(suggestedRevision?.kind || "", 80).toLowerCase();
  if (revisionKind === "build_running_base") {
    return buildRunningMilestoneShape({ goal, suggestedRevision, goalAssessment });
  }
  if (revisionKind === "scaled_strength_block" || revisionKind === "anchor_strength_baseline") {
    return buildStrengthMilestoneShape({ goal, suggestedRevision, goalAssessment });
  }
  if (revisionKind === "steady_body_comp_block") {
    return buildBodyCompMilestoneShape({ goal, suggestedRevision, goalAssessment });
  }
  if (revisionKind === "power_retest_block") {
    return buildPowerMilestoneShape({ goal, suggestedRevision, goalAssessment });
  }
  return buildGenericMilestoneShape({ goal, suggestedRevision, goalAssessment });
};

const sanitizeMilestoneSelectionRecord = (record = null, goalId = "") => {
  if (!record || typeof record !== "object") return null;
  const strategy = sanitizeText(record?.strategy || "", 40).toLowerCase();
  if (!INTAKE_MILESTONE_PATH_VALUES.has(strategy)) return null;
  const normalizedGoalId = sanitizeText(goalId || record?.goalId || "", 120);
  if (!normalizedGoalId) return null;
  return {
    strategy,
    goalId: normalizedGoalId,
    sourceStatus: sanitizeText(record?.sourceStatus || "", 40).toLowerCase(),
    sourceReason: sanitizeText(record?.sourceReason || "", 220),
    longTermTargetSummary: sanitizeText(record?.longTermTargetSummary || "", 160),
    firstBlockTarget: sanitizeText(record?.firstBlockTarget || "", 260),
    recommendedRevisionSummary: sanitizeText(record?.recommendedRevisionSummary || "", 240),
    milestoneSummary: sanitizeText(record?.milestoneSummary || "", 160),
    milestonePlanningCategory: sanitizeText(record?.milestonePlanningCategory || "", 40).toLowerCase(),
    milestoneGoalFamily: sanitizeText(record?.milestoneGoalFamily || "", 40).toLowerCase(),
    milestonePrimaryMetric: cloneMetric(record?.milestonePrimaryMetric),
    milestoneProxyMetrics: cloneMetricList(record?.milestoneProxyMetrics),
    milestoneTargetHorizonWeeks: clampPositiveInteger(record?.milestoneTargetHorizonWeeks, null),
    milestoneFirst30DaySuccessDefinition: sanitizeText(record?.milestoneFirst30DaySuccessDefinition || "", 220),
    milestoneReviewCadence: sanitizeText(record?.milestoneReviewCadence || "", 40),
    milestoneRefinementTrigger: sanitizeText(record?.milestoneRefinementTrigger || "", 80),
  };
};

export const createIntakeMilestoneSelectionRecord = ({
  goal = null,
  goalAssessment = null,
} = {}) => {
  const cleanGoalId = sanitizeText(goal?.id || goalAssessment?.goalId || "", 120);
  if (!cleanGoalId || !goalAssessment?.suggested_revision) return null;
  const milestoneShape = buildMilestoneGoalShape({ goal, goalAssessment });
  return sanitizeMilestoneSelectionRecord({
    strategy: INTAKE_MILESTONE_PATHS.milestoneFirst,
    goalId: cleanGoalId,
    sourceStatus: goalAssessment?.realismStatus || goalAssessment?.status || "",
    sourceReason: goalAssessment?.targetValidationReason || goalAssessment?.warningReasons?.[0] || goalAssessment?.blockingReasons?.[0] || "",
    longTermTargetSummary: goal?.summary || goalAssessment?.goalSummary || "",
    firstBlockTarget: goalAssessment?.suggested_revision?.first_block_target || "",
    recommendedRevisionSummary: goalAssessment?.recommendedRevisionSummary || goalAssessment?.suggested_revision?.summary || "",
    milestoneSummary: milestoneShape.summary,
    milestonePlanningCategory: milestoneShape.planningCategory,
    milestoneGoalFamily: milestoneShape.goalFamily,
    milestonePrimaryMetric: milestoneShape.primaryMetric,
    milestoneProxyMetrics: milestoneShape.proxyMetrics,
    milestoneTargetHorizonWeeks: milestoneShape.targetHorizonWeeks,
    milestoneFirst30DaySuccessDefinition: milestoneShape.first30DaySuccessDefinition,
    milestoneReviewCadence: milestoneShape.reviewCadence,
    milestoneRefinementTrigger: milestoneShape.refinementTrigger,
  }, cleanGoalId);
};

const resolveMilestoneSelectionByGoalId = ({
  goalStackConfirmation = null,
  availableGoalIds = [],
} = {}) => {
  const availableIds = new Set(toArray(availableGoalIds).map((item) => sanitizeText(item, 120)).filter(Boolean));
  return Object.fromEntries(
    Object.entries(goalStackConfirmation?.milestonePlanByGoalId || {})
      .map(([goalId, record]) => [sanitizeText(goalId, 120), sanitizeMilestoneSelectionRecord(record, goalId)])
      .filter(([goalId, record]) => goalId && record && availableIds.has(goalId) && record.strategy === INTAKE_MILESTONE_PATHS.milestoneFirst)
  );
};

const applyMilestoneSelectionToGoal = ({
  goal = null,
  selection = null,
} = {}) => {
  if (!goal || selection?.strategy !== INTAKE_MILESTONE_PATHS.milestoneFirst) return goal;
  return {
    ...goal,
    summary: selection.milestoneSummary || goal.summary,
    planningCategory: selection.milestonePlanningCategory || goal.planningCategory,
    goalFamily: selection.milestoneGoalFamily || goal.goalFamily,
    primaryMetric: cloneMetric(selection.milestonePrimaryMetric) || null,
    proxyMetrics: cloneMetricList(selection.milestoneProxyMetrics),
    targetDate: "",
    targetHorizonWeeks: clampPositiveInteger(selection.milestoneTargetHorizonWeeks, goal?.targetHorizonWeeks || null),
    first30DaySuccessDefinition: selection.milestoneFirst30DaySuccessDefinition || goal.first30DaySuccessDefinition,
    reviewCadence: selection.milestoneReviewCadence || goal.reviewCadence,
    refinementTrigger: selection.milestoneRefinementTrigger || goal.refinementTrigger,
    milestonePath: {
      strategy: selection.strategy,
      longTermTargetSummary: selection.longTermTargetSummary,
      firstBlockTarget: selection.firstBlockTarget,
      recommendedRevisionSummary: selection.recommendedRevisionSummary,
      sourceStatus: selection.sourceStatus,
      sourceReason: selection.sourceReason,
    },
  };
};

export const applyIntakeMilestoneSelections = ({
  resolvedGoals = [],
  goalStackConfirmation = null,
} = {}) => {
  const safeGoals = Array.isArray(resolvedGoals) ? resolvedGoals.filter(Boolean) : [];
  const milestoneSelectionsByGoalId = resolveMilestoneSelectionByGoalId({
    goalStackConfirmation,
    availableGoalIds: safeGoals.map((goal) => goal?.id),
  });
  return safeGoals.map((goal) => applyMilestoneSelectionToGoal({
    goal,
    selection: milestoneSelectionsByGoalId[sanitizeText(goal?.id || "", 120)] || null,
  }));
};

export const buildIntakeMilestoneDecisionModel = ({
  reviewModel = null,
  goalFeasibility = null,
  goalStackConfirmation = null,
} = {}) => {
  const activeGoals = toArray(reviewModel?.activeResolvedGoals);
  const orderedGoals = toArray(reviewModel?.orderedResolvedGoals);
  const focusGoal = activeGoals[0] || orderedGoals[0] || null;
  const goalId = sanitizeText(focusGoal?.id || "", 120);
  if (!goalId) return null;
  const selectedPlan = sanitizeMilestoneSelectionRecord(
    goalStackConfirmation?.milestonePlanByGoalId?.[goalId] || null,
    goalId
  );
  const goalAssessment = toArray(goalFeasibility?.goalAssessments).find((item) => sanitizeText(item?.goalId || "", 120) === goalId) || null;
  const confirmationAction = sanitizeText(reviewModel?.confirmationAction || goalFeasibility?.confirmationAction || "", 20).toLowerCase();
  const sourceReason = sanitizeText(
    goalAssessment?.targetValidationReason
    || reviewModel?.warningReasons?.[0]
    || reviewModel?.blockingReasons?.[0]
    || reviewModel?.gateReasons?.[0]?.summary
    || "",
    220
  );
  const keepTargetChoice = {
    key: INTAKE_MILESTONE_PATHS.keepTarget,
    label: "Keep the full target and progress conservatively",
    summary: sanitizeDisplayLine(
      selectedPlan?.longTermTargetSummary
        ? `Keep ${selectedPlan.longTermTargetSummary} as the long-term target and build it conservatively.`
        : focusGoal?.summary
        ? `Keep ${focusGoal.summary} as the long-term target and build it conservatively.`
        : "Keep the full target and build it conservatively from here.",
      220
    ),
  };
  const milestoneChoice = {
    key: INTAKE_MILESTONE_PATHS.milestoneFirst,
    label: "Start with a smaller milestone",
    summary: sanitizeDisplayLine(
      selectedPlan?.firstBlockTarget
      || goalAssessment?.suggested_revision?.first_block_target
      || reviewModel?.gateSuggestedRevision?.first_block_target
      || reviewModel?.recommendedRevisionSummary
      || "Use the first block to lock in a smaller milestone before you push the full target again.",
      240
    ),
  };

  if (selectedPlan?.strategy === INTAKE_MILESTONE_PATHS.milestoneFirst) {
    return {
      state: "selected",
      goalId,
      headline: "Start with a smaller milestone",
      supportingText: sanitizeDisplayLine(
        selectedPlan.recommendedRevisionSummary || selectedPlan.firstBlockTarget || "The first block now locks in a smaller milestone before you push the long-term target again.",
        220
      ),
      longTermTargetSummary: sanitizeDisplayLine(selectedPlan.longTermTargetSummary || "", 160),
      selectedKey: INTAKE_MILESTONE_PATHS.milestoneFirst,
      choices: [keepTargetChoice, milestoneChoice],
    };
  }

  if (confirmationAction === "warn") {
    return {
      state: "warn",
      goalId,
      headline: "Target is ambitious",
      supportingText: sanitizeDisplayLine(
        sourceReason || "You can keep the full target, or start with a smaller milestone and tighten the first block.",
        220
      ),
      longTermTargetSummary: "",
      selectedKey: INTAKE_MILESTONE_PATHS.keepTarget,
      choices: [keepTargetChoice, milestoneChoice],
    };
  }

  if (confirmationAction === "block") {
    return {
      state: "block",
      goalId,
      headline: "Start with a smaller milestone",
      supportingText: sanitizeDisplayLine(
        sourceReason || milestoneChoice.summary || "This target needs a safer first step before I build it.",
        220
      ),
      longTermTargetSummary: sanitizeDisplayLine(focusGoal?.summary || "", 160),
      selectedKey: "",
      choices: [milestoneChoice],
    };
  }

  return null;
};

const PRIMARY_GOAL_KEY_BY_CATEGORY = {
  body_comp: "fat_loss",
  strength: "muscle_gain",
  running: "endurance",
  injury_prevention: "general_fitness",
  general_fitness: "general_fitness",
};

const PRIMARY_GOAL_CATEGORY_BY_KEY = {
  fat_loss: "body_comp",
  muscle_gain: "strength",
  endurance: "running",
  general_fitness: "general_fitness",
};

export const GOAL_STACK_ROLES = {
  primary: "primary",
  maintained: "maintained",
  background: "background",
  deferred: "deferred",
};

const ANCHOR_PROMPT_PREFIX_BY_FIELD_ID = {
  [INTAKE_COMPLETENESS_FIELDS.targetTimeline]: "So I don't guess",
  [INTAKE_COMPLETENESS_FIELDS.currentRunFrequency]: "Quick baseline check",
  running_endurance_anchor_kind: "So I don't guess",
  [INTAKE_COMPLETENESS_FIELDS.longestRecentRun]: "Last anchor for this",
  [INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline]: "Last anchor for this",
  [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline]: "Quick baseline check",
  appearance_proxy_anchor_kind: "So I don't guess",
  [INTAKE_COMPLETENESS_FIELDS.currentBodyweight]: "Quick baseline check",
  [INTAKE_COMPLETENESS_FIELDS.currentWaist]: "Last anchor for this",
  [INTAKE_COMPLETENESS_FIELDS.targetWeightChange]: "So I don't guess",
};

export const SECONDARY_GOAL_RESPONSE_KEYS = {
  skip: "skip",
  maintainStrength: "maintain_strength",
  maintainMobility: "maintain_mobility",
  primaryOnly: "primary_only",
  addGoal: "add_goal",
  done: "done",
  keepInferred: "keep_inferred",
  custom: "custom",
};

const SECONDARY_GOAL_PRESET_TEXT = {
  [SECONDARY_GOAL_RESPONSE_KEYS.maintainStrength]: "maintain strength",
  [SECONDARY_GOAL_RESPONSE_KEYS.maintainMobility]: "maintain mobility",
};

const GOAL_SIGNAL_PATTERN = /(run|race|marathon|half marathon|10k|5k|bench|squat|deadlift|strength|lift|fat loss|lose fat|lean|athletic|abs|physique|toned|hybrid|performance|muscle|back in shape|get in shape)/i;
const GOAL_TARGET_PATTERN = /(?:\b(?:bench|squat|deadlift|overhead press|ohp)\b[\s\S]{0,24}\b\d{2,4}\s*(?:lb|lbs|pounds?)\b)|(?:\b(?:lose|drop|gain|add)\b[\s\S]{0,24}\b\d{1,3}\s*(?:lb|lbs|pounds?)\b)|(?:\b\d{1,2}:\d{2}(?::\d{2})?\b[\s\S]{0,24}\b(?:marathon|half marathon|10k|5k|race)\b)|(?:\b(?:marathon|half marathon|10k|5k|race)\b[\s\S]{0,24}\b\d{1,2}:\d{2}(?::\d{2})?\b)/i;
const GOAL_REPLACEMENT_PATTERN = /\b(actually|instead|switch|change(?: the goal)?|pivot|goal(?: is| should be)|rather)\b/i;
const GOAL_ADDITIVE_PATTERN = /\b(also|too|as well|plus|while|without losing|without giving up|keep|maintain)\b/i;

const MEASURABILITY_LABELS = {
  [GOAL_MEASURABILITY_TIERS.fullyMeasurable]: "Fully measurable",
  [GOAL_MEASURABILITY_TIERS.proxyMeasurable]: "Proxy measurable",
  [GOAL_MEASURABILITY_TIERS.exploratoryFuzzy]: "Exploratory",
};

const CONFIDENCE_LABELS = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const GOAL_TYPE_LABELS = {
  performance: "Event goal",
  strength: "Strength goal",
  body_comp: "Fat-loss goal",
  appearance: "Appearance goal",
  hybrid: "Hybrid goal",
  general_fitness: "General fitness goal",
  re_entry: "Back-to-fitness goal",
};

const REALISM_LABELS = {
  realistic: "Realistic",
  aggressive: "Ambitious but workable",
  exploratory: "Needs a little more detail",
  unrealistic: "Needs a safer first step",
};

const FEASIBILITY_ACTION_LABELS = {
  proceed: "Ready to build",
  warn: "Ambitious but workable",
  block: "Needs a safer first step",
};

const REVIEW_GATE_LABELS = {
  incomplete: "Need one more detail",
  blocked: "Needs a safer first step",
  warn: "Ambitious but workable",
  ready: "Ready to build",
};

export const INTAKE_CONFIRMATION_STATUSES = {
  incomplete: "incomplete",
  warn: "warn",
  block: "block",
  proceed: "proceed",
};

export const GOAL_STACK_ROLE_LABELS = {
  [GOAL_STACK_ROLES.primary]: "Priority 1",
  [GOAL_STACK_ROLES.maintained]: "Priority 2",
  [GOAL_STACK_ROLES.background]: "Priority 3",
  [GOAL_STACK_ROLES.deferred]: "Later priority",
};

export const GOAL_REVIEW_LANE_KEYS = {
  leadGoal: "lead_goal",
  maintainedGoals: "maintained_goals",
  supportGoals: "support_goals",
  deferredGoals: "deferred_goals",
};

const GOAL_REVIEW_LANE_META = {
  [GOAL_REVIEW_LANE_KEYS.leadGoal]: {
    title: "Priority 1",
    emptyState: "No Priority 1 goal is selected yet.",
  },
  [GOAL_REVIEW_LANE_KEYS.maintainedGoals]: {
    title: "Priority 2",
    emptyState: "No Priority 2 goal is selected yet.",
  },
  [GOAL_REVIEW_LANE_KEYS.supportGoals]: {
    title: "Priority 3",
    emptyState: "No Priority 3 goal is selected yet.",
  },
  [GOAL_REVIEW_LANE_KEYS.deferredGoals]: {
    title: "Priorities 4+",
    emptyState: "No goals are stacked below Priority 3 right now.",
  },
};

const GOAL_REVIEW_ACTIONS = {
  confirm: {
    key: "confirm_and_build",
    label: "Build my plan",
  },
  changePriority: {
    key: "change_priority",
    label: "Reorder goals",
  },
  editGoal: {
    key: "edit_goal",
    label: "Edit a goal",
  },
  dropGoal: {
    key: "drop_goal",
    label: "Drop a goal",
  },
};

const ORDERED_GOAL_STACK_VISIBLE_PRIORITY_COUNT = 3;
const ORDERED_GOAL_STACK_ADDITIONAL_LABEL = "Priorities 4+";

const buildPriorityNumber = (priorityIndex = null) => (
  Number.isFinite(Number(priorityIndex)) && Number(priorityIndex) >= 0
    ? Math.max(1, Math.round(Number(priorityIndex)) + 1)
    : null
);

const buildOrderedGoalPriorityLabel = (priorityIndex = null) => (
  buildPriorityNumber(priorityIndex)
    ? `Priority ${buildPriorityNumber(priorityIndex)}`
    : "Goal"
);

const buildOrderedGoalPrioritySectionLabel = (priorityIndex = null) => (
  buildPriorityNumber(priorityIndex) && Number(priorityIndex) < ORDERED_GOAL_STACK_VISIBLE_PRIORITY_COUNT
    ? buildOrderedGoalPriorityLabel(priorityIndex)
    : ORDERED_GOAL_STACK_ADDITIONAL_LABEL
);

const buildOrderedGoalPriorityRangeLabel = ({
  startIndex = null,
  endIndex = null,
} = {}) => (
  buildPriorityNumber(startIndex) && buildPriorityNumber(endIndex)
    ? buildPriorityNumber(startIndex) === buildPriorityNumber(endIndex)
      ? buildOrderedGoalPriorityLabel(startIndex)
      : `Priorities ${buildPriorityNumber(startIndex)}-${buildPriorityNumber(endIndex)}`
    : ORDERED_GOAL_STACK_ADDITIONAL_LABEL
);

const buildOrderedGoalPriorityHelper = (priorityIndex = null) => {
  if (Number(priorityIndex) === 0) return "Gets the most planning weight right now.";
  if (Number(priorityIndex) === 1) return "Still shapes the block, with slightly less weight than Priority 1.";
  if (Number(priorityIndex) === 2) return "Balanced into the week after the first two priorities.";
  return "Stays visible in the stack and can still shape exercise selection, sequencing, and tracking when it fits cleanly.";
};

const normalizeGoalAdjustmentText = (value = "") => {
  let text = sanitizeText(value, 320);
  if (!text) return "";
  const prefixes = [
    /^actually[:,]?\s*/i,
    /^instead[:,]?\s*/i,
    /^switch(?: the goal)? to\s*/i,
    /^change(?: the goal)? to\s*/i,
    /^pivot to\s*/i,
    /^goal(?: is| should be)\s*/i,
    /^i(?:'d| would)? rather\s*/i,
    /^i just want to\s*/i,
    /^i (?:want to|want|would like to|would like|need to|need)\s*/i,
  ];
  prefixes.forEach((pattern) => {
    text = text.replace(pattern, "");
  });
  return sanitizeText(text.replace(/^[\s:,-]+|[\s.]+$/g, ""), 320);
};

const hasGoalReplacementSignal = (text = "") => (
  GOAL_SIGNAL_PATTERN.test(text)
  || GOAL_TARGET_PATTERN.test(text)
);

const buildMinimalIntakePacket = (rawGoalText = "") => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "",
    },
    scheduleReality: {
      trainingDaysPerWeek: null,
      sessionLength: "",
      trainingLocation: "Unknown",
    },
    equipmentAccessContext: {
      trainingLocation: "Unknown",
      equipment: [],
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints: [],
      appearanceConstraints: [],
      additionalContext: "",
    },
  },
});

const buildDeterministicClarifyingQuestions = (resolvedGoals = []) => {
  const primaryGoal = (Array.isArray(resolvedGoals) ? resolvedGoals : [])[0] || null;
  const questions = [];
  if (primaryGoal?.planningCategory === "running" && primaryGoal?.primaryMetric && !primaryGoal?.targetDate && !primaryGoal?.targetHorizonWeeks) {
    questions.push("What's the race date or target month?");
  }
  return dedupeStrings(questions);
};

const buildPerGoalTrackingLabels = (goal = {}) => dedupeStrings([
  goal?.primaryMetric?.label || "",
  ...(Array.isArray(goal?.proxyMetrics) ? goal.proxyMetrics.map((metric) => metric?.label || "") : []),
  !goal?.primaryMetric && (!Array.isArray(goal?.proxyMetrics) || goal.proxyMetrics.length === 0)
    ? goal?.first30DaySuccessDefinition || ""
    : "",
]).slice(0, 4);

const buildGoalStackFingerprint = (goal = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const goalFamily = sanitizeText(goal?.goalFamily || "", 40).toLowerCase();
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 80).toLowerCase();
  const metricValue = sanitizeText(goal?.primaryMetric?.targetValue || "", 40).toLowerCase();
  const summary = sanitizeText(goal?.summary || goal?.rawIntent?.text || "", 180)
    .toLowerCase()
    .replace(/\bwhile the primary goal leads\b/g, "")
    .replace(/\bwhile the lead goal leads\b/g, "")
    .replace(/\bwith repeatable training\b/g, "")
    .trim();
  return `${planningCategory}:${goalFamily}:${metricKey}:${metricValue}:${summary}`;
};

const sortGoalsByPriority = (resolvedGoals = []) => (
  (Array.isArray(resolvedGoals) ? resolvedGoals : [])
    .filter(Boolean)
    .sort((a, b) => {
      const aPriority = Number(a?.planningPriority || 99) || 99;
      const bPriority = Number(b?.planningPriority || 99) || 99;
      return aPriority - bPriority;
    })
);

const isResiliencePriorityRelevant = ({ resolvedGoals = [], goalFeasibility = null } = {}) => (
  (Array.isArray(resolvedGoals) ? resolvedGoals : []).length >= 2
  || Boolean(goalFeasibility?.conflictFlags?.length)
);

const buildMaintainedGoalValueFromGoal = (goal = {}) => {
  const summary = sanitizeText(goal?.summary || "", 120);
  const category = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (/upper body/i.test(summary)) return "keep upper body";
  if (/conditioning|endurance|aerobic/i.test(summary)) return "maintain conditioning";
  if (/slower|speed/i.test(summary)) return "avoid getting slower";
  if (/strength|bench|squat|deadlift|press/i.test(summary) || category === "strength") return "keep strength";
  if (category === "running") return "avoid getting slower";
  return summary || "keep this goal in maintenance";
};

const buildMaintainedGoalLabelFromGoal = (goal = {}) => {
  const maintainedValue = buildMaintainedGoalValueFromGoal(goal);
  if (!maintainedValue) return "Keep it maintained";
  return maintainedValue.charAt(0).toUpperCase() + maintainedValue.slice(1);
};

const sentenceCase = (value = "") => {
  const text = sanitizeText(value, 260);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const formatGoalSummaryList = (items = []) => {
  const labels = dedupeStrings(
    toArray(items)
      .map((item) => sanitizeText(item?.summary || item, 160))
      .filter(Boolean)
  );
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

const orderGoalsByGoalIds = ({
  goals = [],
  orderedGoalIds = [],
} = {}) => {
  const cleanGoals = toArray(goals).filter(Boolean);
  const goalsById = cleanGoals.reduce((map, goal) => {
    const goalId = sanitizeText(goal?.id || "", 120);
    if (!goalId || map.has(goalId)) return map;
    map.set(goalId, goal);
    return map;
  }, new Map());
  const ordered = [];
  const seen = new Set();
  toArray(orderedGoalIds).forEach((goalId) => {
    const cleanGoalId = sanitizeText(goalId, 120);
    const goal = cleanGoalId ? goalsById.get(cleanGoalId) : null;
    if (!goal || seen.has(cleanGoalId)) return;
    seen.add(cleanGoalId);
    ordered.push(goal);
  });
  cleanGoals.forEach((goal) => {
    const cleanGoalId = sanitizeText(goal?.id || "", 120);
    if (cleanGoalId && seen.has(cleanGoalId)) return;
    if (cleanGoalId) seen.add(cleanGoalId);
    ordered.push(goal);
  });
  return ordered;
};

const buildFirstGoalByIdMap = (goals = []) => toArray(goals)
  .filter(Boolean)
  .reduce((map, goal) => {
    const goalId = sanitizeText(goal?.id || "", 120);
    if (!goalId || map.has(goalId)) return map;
    map.set(goalId, goal);
    return map;
  }, new Map());

const buildLegacyPriorityOrderIds = ({
  orderedGoals = [],
  goalStackConfirmation = null,
} = {}) => {
  const explicitPrimaryId = sanitizeText(goalStackConfirmation?.primaryGoalId || "", 120);
  const explicitRolesByGoalId = Object.fromEntries(
    Object.entries(goalStackConfirmation?.rolesByGoalId || {})
      .map(([goalId, role]) => [sanitizeText(goalId, 120), sanitizeText(role, 40).toLowerCase()])
      .filter(([goalId, role]) => goalId && Object.values(GOAL_STACK_ROLES).includes(role))
  );
  const pickIdsByRole = (targetRole = "") => (
    toArray(orderedGoals)
      .map((goal) => sanitizeText(goal?.id || "", 120))
      .filter((goalId) => goalId && explicitRolesByGoalId[goalId] === targetRole)
  );
  return dedupeStrings([
    explicitPrimaryId,
    ...pickIdsByRole(GOAL_STACK_ROLES.primary),
    ...pickIdsByRole(GOAL_STACK_ROLES.maintained),
    ...pickIdsByRole(GOAL_STACK_ROLES.background),
    ...pickIdsByRole(GOAL_STACK_ROLES.deferred),
    ...toArray(orderedGoals).map((goal) => sanitizeText(goal?.id || "", 120)),
  ]);
};

export const buildDeterministicAnchorPromptText = ({
  fieldId = "",
  prompt = "",
} = {}) => {
  const cleanPrompt = sanitizeText(prompt, 220);
  const normalizedFieldId = sanitizeText(fieldId, 80);
  if (!cleanPrompt) return "";
  const leadIn = ANCHOR_PROMPT_PREFIX_BY_FIELD_ID[normalizedFieldId] || "Quick baseline check";
  return sanitizeDisplayLine(`${leadIn}: ${cleanPrompt}`, 240);
};

const buildGoalConfirmationReadiness = ({
  goalStackReview = null,
  goalStackConfirmation = null,
} = {}) => {
  const leadGoalId = sanitizeText(
    goalStackReview?.leadGoal?.id
    || goalStackReview?.primaryGoalId
    || goalStackConfirmation?.primaryGoalId
    || "",
    120
  );
  const maintainedGoals = toArray(goalStackReview?.maintainedGoals);
  const rolesByGoalId = goalStackReview?.confirmation?.rolesByGoalId || goalStackConfirmation?.rolesByGoalId || {};
  const leadGoalConfirmed = Boolean(leadGoalId);
  const maintainedGoalsConfirmed = maintainedGoals.every((goal) => (
    sanitizeText(rolesByGoalId?.[goal?.id] || "", 40).toLowerCase() === GOAL_STACK_ROLES.maintained
  ));
  const blockingIssues = [];
  if (!leadGoalConfirmed) {
    blockingIssues.push("Set the order so Priority 1 is clear.");
  }
  if (maintainedGoals.length > 0 && !maintainedGoalsConfirmed) {
    blockingIssues.push("Set the order of your top goals before building.");
  }
  return {
    leadGoalConfirmed,
    maintainedGoalsConfirmed,
    blockingIssues,
  };
};

const resolveNextRequiredFieldId = ({
  completeness = {},
} = {}) => {
  const facts = completeness?.facts || {};
  const firstMissing = toArray(completeness?.missingRequired)[0] || null;
  if (!firstMissing) return null;
  const fieldKeys = toArray(firstMissing?.fieldKeys)
    .map((item) => sanitizeText(item, 80))
    .filter(Boolean);
  if (fieldKeys.length === 0) return null;

  if (firstMissing?.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline) {
    if (!Number.isFinite(facts?.currentRunFrequency)) return INTAKE_COMPLETENESS_FIELDS.currentRunFrequency;
    if (!facts?.longestRecentRun?.text && !facts?.recentPaceBaseline?.text) return "running_endurance_anchor_kind";
  }

  if (firstMissing?.key === INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor) {
    if (!facts?.currentBodyweight && !facts?.currentWaist) return "appearance_proxy_anchor_kind";
  }

  if (firstMissing?.key === INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor) {
    if (!facts?.currentBodyweight) return INTAKE_COMPLETENESS_FIELDS.currentBodyweight;
    if (!Number.isFinite(facts?.targetWeightChange)) return INTAKE_COMPLETENESS_FIELDS.targetWeightChange;
  }

  return fieldKeys[0] || null;
};

const buildShortConfirmationReason = (items = []) => (
  dedupeStrings(items)
    .map((item) => sanitizeDisplayLine(item, 180))
    .find(Boolean)
    || ""
);

const normalizeClarityItem = (value = "") => {
  const cleanValue = sanitizeDisplayLine(value, 220);
  if (!cleanValue) return "";
  if (/fits the available schedule and baseline cleanly enough to plan from|proceed with a steady first block/i.test(cleanValue)) {
    return "";
  }
  if (/^appearance tracking proxy$/i.test(cleanValue)) {
    return "Pick one proxy we can track right now: bodyweight or waist.";
  }
  return cleanValue;
};

const buildPlainNeedItem = ({
  label = "",
  question = "",
} = {}) => {
  const cleanLabel = normalizeClarityItem(sanitizeDisplayLine(label, 160));
  const cleanQuestion = normalizeClarityItem(sanitizeDisplayLine(question, 220));
  if (cleanQuestion) return cleanQuestion;
  if (!cleanLabel) return "";
  return sanitizeDisplayLine(`Need: ${cleanLabel.toLowerCase()}.`, 220);
};

const buildGoalReviewEntry = ({
  goal = {},
  role = GOAL_STACK_ROLES.deferred,
  priorityIndex = null,
} = {}) => {
  const trackingLabels = buildPerGoalTrackingLabels(goal);
  const tradeoff = sanitizeText(goal?.tradeoffs?.[0] || "", 180);
  const reason = sanitizeText(goal?.goalArbitrationReason || "", 220);
  const normalizedPriorityIndex = Number.isFinite(Number(priorityIndex))
    ? Math.max(0, Math.round(Number(priorityIndex)))
    : null;
  const timing = buildGoalTimingPresentation(goal);
  const fallbackRationale = buildOrderedGoalPriorityHelper(normalizedPriorityIndex);
  return {
    id: goal?.id,
    summary: sanitizeDisplayLine(goal?.summary || "", 160),
    role,
    roleLabel: sanitizeDisplayLine(
      buildOrderedGoalPriorityLabel(normalizedPriorityIndex) || GOAL_STACK_ROLE_LABELS[role] || "Goal",
      80
    ),
    priorityIndex: normalizedPriorityIndex,
    priorityLabel: sanitizeDisplayLine(buildOrderedGoalPriorityLabel(normalizedPriorityIndex), 80),
    prioritySectionLabel: sanitizeDisplayLine(buildOrderedGoalPrioritySectionLabel(normalizedPriorityIndex), 120),
    priorityHelper: sanitizeDisplayLine(buildOrderedGoalPriorityHelper(normalizedPriorityIndex), 220),
    planningPriority: Number(goal?.planningPriority || 0) || null,
    targetDate: sanitizeText(goal?.targetDate || "", 24),
    targetHorizonWeeks: Number.isFinite(Number(goal?.targetHorizonWeeks)) ? Number(goal.targetHorizonWeeks) : null,
    timingLabel: sanitizeDisplayLine(timing.label, 120),
    timingDetail: sanitizeDisplayLine(timing.detail, 220),
    primaryMetric: goal?.primaryMetric || null,
    arbitrationConfirmedPrimary: Boolean(goal?.arbitrationConfirmedPrimary),
    measurabilityLabel: sanitizeDisplayLine(MEASURABILITY_LABELS[goal?.measurabilityTier] || "Goal", 80),
    trackingLabels: sanitizeDisplayList(trackingLabels, 160),
    tradeoff: sanitizeDisplayLine(tradeoff, 180),
    reason: sanitizeDisplayLine(reason, 220),
    rationale: sanitizeDisplayLine(reason || tradeoff || fallbackRationale, 220),
    actions: {
      canChangePriority: role !== GOAL_STACK_ROLES.primary,
      canEdit: true,
      canDrop: role !== GOAL_STACK_ROLES.primary,
    },
  };
};

const buildLeadPriorityBasis = ({ leadGoal = null, goalFeasibility = null } = {}) => {
  if (!leadGoal) return "it gives the block the clearest direction";
  const goalId = sanitizeText(leadGoal?.id || "", 120);
  const recommendedLeadId = sanitizeText(toArray(goalFeasibility?.recommendedPriorityOrdering)[0]?.goalId || "", 120);
  const conflictKeys = new Set(
    toArray(goalFeasibility?.conflictFlags)
      .map((flag) => sanitizeText(flag?.key || "", 80).toLowerCase())
      .filter(Boolean)
  );
  const parts = [];
  if (leadGoal?.targetDate || Number(leadGoal?.targetHorizonWeeks || 0) > 0 || sanitizeText(leadGoal?.primaryMetric?.targetValue || "", 40)) {
    parts.push("it is the most specific target");
  }
  if (goalId && recommendedLeadId && goalId === recommendedLeadId) {
    parts.push("it came through the feasibility gate as the clearest Priority 1 fit");
  }
  if (leadGoal?.arbitrationConfirmedPrimary || Number(leadGoal?.planningPriority || 99) === 1) {
    parts.push("it carries the strongest user priority signal");
  }
  if (conflictKeys.has("limited_schedule_multi_goal_stack") || conflictKeys.has("constraint_ceiling")) {
    parts.push("it best fits the current schedule and recovery constraints");
  }
  return parts.slice(0, 2).join(" and ") || "it gives the block the clearest direction";
};

const buildReviewTradeoffStatement = ({
  orderedGoals = [],
  goalFeasibility = null,
  primaryTradeoff = "",
} = {}) => {
  const visibleGoals = toArray(orderedGoals).filter(Boolean);
  const priorityOneGoal = visibleGoals[0] || null;
  if (!priorityOneGoal?.summary) return "";
  const lines = [
    `Priority 1 is ${priorityOneGoal.summary}. It gets the most planning weight because ${buildLeadPriorityBasis({ leadGoal: priorityOneGoal, goalFeasibility })}.`,
  ];
  if (visibleGoals[1]?.summary) {
    lines.push(`Priority 2 is ${visibleGoals[1].summary}. It still shapes the block, with slightly less planning weight than Priority 1.`);
  }
  if (visibleGoals[2]?.summary) {
    lines.push(`Priority 3 is ${visibleGoals[2].summary}. It stays in the weekly balance when it fits cleanly.`);
  }
  const additionalGoals = visibleGoals.slice(3);
  const additionalSummary = formatGoalSummaryList(additionalGoals);
  if (additionalSummary) {
    lines.push(`${buildOrderedGoalPriorityRangeLabel({
      startIndex: 3,
      endIndex: visibleGoals.length - 1,
    })} include ${additionalSummary}. ${additionalGoals.length === 1 ? "It stays" : "They stay"} visible in the stack and can still shape exercise selection, sequencing, and tracking when it fits cleanly.`);
  }
  if (primaryTradeoff) {
    lines.push(`${sentenceCase(primaryTradeoff).replace(/[.]+$/g, "")}.`);
  }
  return sanitizeDisplayLine(lines.join(" "), 360);
};

const buildOrderedGoalStackContract = ({
  orderedGoals = [],
} = {}) => {
  const items = toArray(orderedGoals).map((goal, index) => ({
    ...goal,
    priorityIndex: index,
    priorityLabel: sanitizeDisplayLine(goal?.priorityLabel || buildOrderedGoalPriorityLabel(index), 80),
    prioritySectionLabel: sanitizeDisplayLine(goal?.prioritySectionLabel || buildOrderedGoalPrioritySectionLabel(index), 120),
    priorityHelper: sanitizeDisplayLine(goal?.priorityHelper || buildOrderedGoalPriorityHelper(index), 220),
  }));
  return {
    items,
    top_priorities: items.slice(0, 3),
    additional_goals: items.slice(3),
    sections: [
      {
        key: "priority_1",
        title: "Priority 1",
        empty_state: "Choose what should be Priority 1.",
        goals: items[0] ? [items[0]] : [],
      },
      {
        key: "priority_2",
        title: "Priority 2",
        empty_state: "Priority 2 stays visible without taking over the block.",
        goals: items[1] ? [items[1]] : [],
      },
      {
        key: "priority_3",
        title: "Priority 3",
        empty_state: "Priority 3 can still shape the plan when it fits cleanly.",
        goals: items[2] ? [items[2]] : [],
      },
      {
        key: "additional_goals",
        title: ORDERED_GOAL_STACK_ADDITIONAL_LABEL,
        empty_state: "No goals are stacked below Priority 3 right now.",
        goals: items.slice(3),
      },
    ],
  };
};

const buildGoalReviewContract = ({
  leadGoal = null,
  maintainedGoals = [],
  supportGoals = [],
  deferredGoals = [],
  orderedGoals = [],
  goalFeasibility = null,
  primaryTradeoff = "",
} = {}) => {
  const orderedGoalStack = buildOrderedGoalStackContract({ orderedGoals });
  return {
    lead_goal: leadGoal,
    maintained_goals: maintainedGoals,
    support_goals: supportGoals,
    deferred_goals: deferredGoals,
    ordered_goal_stack: orderedGoalStack,
    tradeoff_statement: buildReviewTradeoffStatement({
      orderedGoals: orderedGoalStack.items,
      goalFeasibility,
      primaryTradeoff,
    }),
    lane_sections: orderedGoalStack.sections,
    actions: {
      confirm: { ...GOAL_REVIEW_ACTIONS.confirm },
      changePriority: { ...GOAL_REVIEW_ACTIONS.changePriority },
      editGoal: { ...GOAL_REVIEW_ACTIONS.editGoal },
      dropGoal: { ...GOAL_REVIEW_ACTIONS.dropGoal },
    },
  };
};

const normalizeAdditionalGoalText = (value = "") => sanitizeText(value, 180);

export const readAdditionalGoalEntries = ({ answers = {} } = {}) => {
  const listedGoals = toArray(answers?.additional_goals_list)
    .map((item) => normalizeAdditionalGoalText(item))
    .filter(Boolean);
  if (listedGoals.length > 0) return dedupeStrings(listedGoals);
  const legacyOtherGoals = normalizeAdditionalGoalText(answers?.other_goals || "");
  return legacyOtherGoals ? [legacyOtherGoals] : [];
};

const writeAdditionalGoalEntries = ({ answers = {}, entries = [] } = {}) => {
  const normalizedEntries = dedupeStrings(
    toArray(entries)
      .map((item) => normalizeAdditionalGoalText(item))
      .filter(Boolean)
  );
  return {
    ...answers,
    additional_goals_list: normalizedEntries,
    other_goals: normalizedEntries.join(". "),
  };
};

const finalizeAdditionalGoalAnswers = ({
  answers = {},
  entries = [],
  answered = true,
} = {}) => writeAdditionalGoalEntries({
  answers: {
    ...answers,
    secondary_goal_prompt_answered: answered,
  },
  entries,
});

const buildPlainGoalTypeLabel = (goal = null, fallbackFamily = "") => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const goalFamily = sanitizeText(goal?.goalFamily || fallbackFamily || "", 40).toLowerCase();
  if (planningCategory === "running" && goalFamily !== "hybrid") return "Event goal";
  if (goalFamily && GOAL_TYPE_LABELS[goalFamily]) return GOAL_TYPE_LABELS[goalFamily];
  if (planningCategory === "body_comp") return "Fat-loss goal";
  if (planningCategory === "strength") return "Strength goal";
  if (planningCategory === "running") return "Running goal";
  return "Goal";
};

export const buildIntakeGoalStackConfirmation = ({
  resolvedGoals = [],
  goalStackConfirmation = null,
  goalFeasibility = null,
} = {}) => {
  const orderedGoals = sortGoalsByPriority(resolvedGoals);
  const availableIds = new Set(orderedGoals.map((goal) => sanitizeText(goal?.id || "", 120)).filter(Boolean));
  const removedGoalIds = dedupeStrings(toArray(goalStackConfirmation?.removedGoalIds || []))
    .filter((id) => availableIds.has(id));
  const milestonePlanByGoalId = resolveMilestoneSelectionByGoalId({
    goalStackConfirmation,
    availableGoalIds: [...availableIds],
  });
  const explicitOrderedGoalIds = dedupeStrings(toArray(goalStackConfirmation?.orderedGoalIds || []))
    .filter((id) => availableIds.has(id) && !removedGoalIds.includes(id));
  if (explicitOrderedGoalIds.length === 0) {
    const defaultRolesByGoalId = {};
    orderedGoals.forEach((goal, index) => {
      if (!goal?.id) return;
      const defaultRole = sanitizeText(goal?.goalArbitrationRole || (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained), 40).toLowerCase();
      defaultRolesByGoalId[goal.id] = Object.values(GOAL_STACK_ROLES).includes(defaultRole)
        ? defaultRole
        : (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained);
    });
    const explicitRolesByGoalId = Object.fromEntries(
      Object.entries(goalStackConfirmation?.rolesByGoalId || {})
        .map(([goalId, role]) => [sanitizeText(goalId, 120), sanitizeText(role, 40).toLowerCase()])
        .filter(([goalId, role]) => goalId && availableIds.has(goalId) && Object.values(GOAL_STACK_ROLES).includes(role))
    );
    const requestedRolesByGoalId = {
      ...defaultRolesByGoalId,
      ...explicitRolesByGoalId,
    };
    const activeGoals = orderedGoals.filter((goal) => !removedGoalIds.includes(goal.id));
    const rolePrimaryId = activeGoals.find((goal) => requestedRolesByGoalId[goal?.id] === GOAL_STACK_ROLES.primary)?.id;
    const fallbackPrimaryId = sanitizeText(rolePrimaryId || activeGoals[0]?.id || orderedGoals[0]?.id || "", 120);
    const explicitPrimaryId = sanitizeText(goalStackConfirmation?.primaryGoalId || "", 120);
    const primaryGoalId = activeGoals.some((goal) => goal.id === explicitPrimaryId)
      ? explicitPrimaryId
      : fallbackPrimaryId;
    const rolesByGoalId = {};
    orderedGoals.forEach((goal, index) => {
      if (!goal?.id) return;
      if (removedGoalIds.includes(goal.id)) {
        rolesByGoalId[goal.id] = GOAL_STACK_ROLES.deferred;
        return;
      }
      const requestedRole = requestedRolesByGoalId[goal.id] || defaultRolesByGoalId[goal.id] || GOAL_STACK_ROLES.maintained;
      const isPrimary = goal.id === primaryGoalId || (!primaryGoalId && index === 0);
      rolesByGoalId[goal.id] = isPrimary
        ? GOAL_STACK_ROLES.primary
        : requestedRole === GOAL_STACK_ROLES.background
        ? GOAL_STACK_ROLES.background
        : requestedRole === GOAL_STACK_ROLES.deferred
        ? GOAL_STACK_ROLES.deferred
        : GOAL_STACK_ROLES.maintained;
    });
    const relevantBackgroundPriority = isResiliencePriorityRelevant({ resolvedGoals: orderedGoals, goalFeasibility });
    return {
      primaryGoalId,
      orderedGoalIds: buildLegacyPriorityOrderIds({
        orderedGoals,
        goalStackConfirmation: {
          primaryGoalId,
          rolesByGoalId,
        },
      }).filter((id) => availableIds.has(id) && !removedGoalIds.includes(id)),
      removedGoalIds,
      rolesByGoalId,
      milestonePlanByGoalId,
      keepResiliencePriority: relevantBackgroundPriority
        ? goalStackConfirmation?.keepResiliencePriority !== false
        : false,
    };
  }
  const fallbackOrderedGoalIds = buildLegacyPriorityOrderIds({
    orderedGoals,
    goalStackConfirmation,
  }).filter((id) => availableIds.has(id) && !removedGoalIds.includes(id));
  const orderedGoalIds = dedupeStrings([
    ...(explicitOrderedGoalIds.length ? explicitOrderedGoalIds : fallbackOrderedGoalIds),
    ...orderedGoals.map((goal) => sanitizeText(goal?.id || "", 120)),
  ]).filter((id) => availableIds.has(id) && !removedGoalIds.includes(id));
  const primaryGoalId = orderedGoalIds[0] || sanitizeText(
    orderedGoals.find((goal) => !removedGoalIds.includes(goal?.id))?.id || "",
    120
  );
  const normalizedOrderedGoalIds = orderedGoalIds;
  const rolesByGoalId = {};
  orderedGoals.forEach((goal) => {
    if (!goal?.id) return;
    const goalId = sanitizeText(goal.id, 120);
    if (removedGoalIds.includes(goalId)) {
      rolesByGoalId[goalId] = GOAL_STACK_ROLES.deferred;
      return;
    }
    const priorityIndex = normalizedOrderedGoalIds.indexOf(goalId);
    rolesByGoalId[goalId] = priorityIndex === 0
      ? GOAL_STACK_ROLES.primary
      : priorityIndex === 1
      ? GOAL_STACK_ROLES.maintained
      : priorityIndex === 2
      ? GOAL_STACK_ROLES.background
      : GOAL_STACK_ROLES.deferred;
  });
  const relevantBackgroundPriority = isResiliencePriorityRelevant({ resolvedGoals: orderedGoals, goalFeasibility });

  return {
    primaryGoalId,
    orderedGoalIds: normalizedOrderedGoalIds,
    removedGoalIds,
    rolesByGoalId,
    milestonePlanByGoalId,
    keepResiliencePriority: relevantBackgroundPriority
      ? goalStackConfirmation?.keepResiliencePriority !== false
      : false,
  };
};

export const applyIntakeGoalStackConfirmation = ({
  resolvedGoals = [],
  goalStackConfirmation = null,
  goalFeasibility = null,
} = {}) => {
  const milestoneAdjustedGoals = applyIntakeMilestoneSelections({
    resolvedGoals: sortGoalsByPriority(resolvedGoals),
    goalStackConfirmation,
  });
  const orderedGoals = orderGoalsByGoalIds({
    goals: milestoneAdjustedGoals,
    orderedGoalIds: toArray(goalStackConfirmation?.orderedGoalIds || []),
  });
  const confirmation = buildIntakeGoalStackConfirmation({
    resolvedGoals: orderedGoals,
    goalStackConfirmation,
    goalFeasibility,
  });
  const primaryGoal = orderedGoals.find((goal) => goal?.id === confirmation.primaryGoalId) || null;
  const secondaryGoals = orderedGoals.filter((goal) => (
    goal?.id
    && goal.id !== confirmation.primaryGoalId
    && !confirmation.removedGoalIds.includes(goal.id)
    && confirmation.rolesByGoalId?.[goal.id] === GOAL_STACK_ROLES.maintained
  ));
  const nextOrderedGoals = [primaryGoal, ...secondaryGoals].filter(Boolean);

  return nextOrderedGoals.map((goal, index) => ({
    ...goal,
    planningPriority: index + 1,
    intakeConfirmedRole: index === 0
      ? GOAL_STACK_ROLES.primary
      : (confirmation.rolesByGoalId?.[goal.id] || GOAL_STACK_ROLES.maintained),
  }));
};

export const buildIntakeGoalStackReviewModel = ({
  resolvedGoals = [],
  goalResolution = null,
  goalFeasibility = null,
  goalStackConfirmation = null,
} = {}) => {
  const milestoneAdjustedGoals = applyIntakeMilestoneSelections({
    resolvedGoals: sortGoalsByPriority(resolvedGoals),
    goalStackConfirmation,
  });
  const confirmation = buildIntakeGoalStackConfirmation({
    resolvedGoals: milestoneAdjustedGoals,
    goalStackConfirmation,
    goalFeasibility,
  });
  const orderedGoals = orderGoalsByGoalIds({
    goals: milestoneAdjustedGoals,
    orderedGoalIds: confirmation?.orderedGoalIds || [],
  });
  const seenGoalIds = new Set();
  const seenFingerprints = new Set();
  const dedupedGoals = [];
  orderedGoals.forEach((goal, index) => {
    if (!goal) return;
    const goalId = sanitizeText(goal?.id || "", 120);
    if (goalId && confirmation.removedGoalIds.includes(goalId)) return;
    const fingerprint = buildGoalStackFingerprint(goal);
    if ((goalId && seenGoalIds.has(goalId)) || (fingerprint && seenFingerprints.has(fingerprint))) return;
    if (goalId) seenGoalIds.add(goalId);
    if (fingerprint) seenFingerprints.add(fingerprint);
    dedupedGoals.push({
      goal,
      role: confirmation.rolesByGoalId?.[goalId]
        || sanitizeText(goal?.goalArbitrationRole || "", 40).toLowerCase()
        || (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained),
    });
  });
  const prioritizedGoalReviews = dedupedGoals.map((entry, index) => buildGoalReviewEntry({
    goal: entry.goal,
    role: entry.role,
    priorityIndex: index,
  }));
  const confirmedGoals = prioritizedGoalReviews.filter((entry) => (
    entry.role === GOAL_STACK_ROLES.primary || entry.role === GOAL_STACK_ROLES.maintained
  ));
  const primaryTradeoff = dedupeStrings([
    ...dedupedGoals
      .filter((entry) => entry?.role === GOAL_STACK_ROLES.primary || entry?.role === GOAL_STACK_ROLES.maintained)
      .flatMap((entry) => entry?.goal?.tradeoffs || []),
    ...(goalResolution?.tradeoffs || []),
  ])[0] || "";
  const backgroundPriority = isResiliencePriorityRelevant({ resolvedGoals: orderedGoals, goalFeasibility })
    ? {
        enabled: confirmation.keepResiliencePriority !== false,
        label: "Recovery stays protected",
        summary: confirmedGoals.length >= 2
          ? "We'll still protect recovery so the highest priorities can push without the week falling apart."
          : "We'll keep recovery in a good place while Priority 1 gets most of the planning weight.",
        trackingLabels: ["Session completion", "Readiness", "Recovery drift"],
      }
    : null;
  const leadGoalReview = confirmedGoals.find((entry) => entry.role === GOAL_STACK_ROLES.primary)
    || prioritizedGoalReviews[0]
    || null;
  const maintainedGoalReviews = confirmedGoals
    .filter((entry) => entry.role === GOAL_STACK_ROLES.maintained);
  const supportGoalReviews = prioritizedGoalReviews
    .filter((entry) => entry.role === GOAL_STACK_ROLES.background);
  const deferredGoalReviews = prioritizedGoalReviews
    .filter((entry) => entry.role === GOAL_STACK_ROLES.deferred);
  const removedGoalReviews = orderGoalsByGoalIds({
    goals: milestoneAdjustedGoals,
    orderedGoalIds: toArray(goalStackConfirmation?.orderedGoalIds || confirmation?.orderedGoalIds || []),
  })
    .filter((goal) => confirmation.removedGoalIds.includes(sanitizeText(goal?.id || "", 120)))
    .map((goal) => buildGoalReviewEntry({
      goal,
      role: GOAL_STACK_ROLES.deferred,
    }));
  const orderedGoalStack = buildOrderedGoalStackContract({
    orderedGoals: prioritizedGoalReviews,
  });
  const reviewContract = buildGoalReviewContract({
    leadGoal: leadGoalReview,
    maintainedGoals: maintainedGoalReviews,
    supportGoals: supportGoalReviews,
    deferredGoals: deferredGoalReviews,
    orderedGoals: orderedGoalStack.items,
    goalFeasibility,
    primaryTradeoff,
  });

  return {
    confirmation,
    primaryGoalId: leadGoalReview?.id || confirmation.primaryGoalId || "",
    orderedGoalIds: orderedGoalStack.items.map((entry) => entry?.id).filter(Boolean),
    orderedGoalStack,
    activeGoalIds: confirmedGoals.map((entry) => entry?.id).filter(Boolean),
    backgroundGoalIds: supportGoalReviews.map((entry) => entry?.id).filter(Boolean),
    deferredGoalIds: deferredGoalReviews.map((entry) => entry?.id).filter(Boolean),
    activeGoals: [leadGoalReview, ...maintainedGoalReviews].filter(Boolean),
    leadGoal: leadGoalReview,
    maintainedGoals: maintainedGoalReviews,
    supportGoals: supportGoalReviews,
    backgroundGoals: supportGoalReviews,
    deferredGoals: deferredGoalReviews,
    removedGoals: removedGoalReviews,
    primaryTradeoff,
    tradeoffStatement: reviewContract.tradeoff_statement,
    backgroundPriority,
    reviewContract,
  };
};

export const canAskSecondaryGoal = (state = {}) => {
  const reviewModel = state?.reviewModel || state?.draft?.reviewModel || null;
  const confirmationState = state?.confirmationState || state?.draft?.confirmationState || null;
  const answers = state?.answers || state?.draft?.answers || {};
  const stage = sanitizeText(state?.stage || "", 80);
  const currentStatus = sanitizeText(
    confirmationState?.status
    || (reviewModel?.gateStatus === "ready" ? INTAKE_CONFIRMATION_STATUSES.proceed : reviewModel?.gateStatus)
    || "",
    20
  ).toLowerCase();
  const hasFeasibilityState = Boolean(
    sanitizeText(reviewModel?.realismStatus || reviewModel?.gateStructuredStatus || "", 40)
  );
  const primaryGoal = toArray(reviewModel?.activeResolvedGoals)[0] || toArray(reviewModel?.orderedResolvedGoals)[0] || null;
  const missingRequired = toArray(reviewModel?.completeness?.missingRequired);

  if (answers?.secondary_goal_prompt_answered) return false;
  if (stage && stage !== "REVIEW_CONFIRM") return false;
  if (!primaryGoal) return false;
  if (!reviewModel?.completeness?.isComplete || missingRequired.length > 0) return false;
  if (!hasFeasibilityState) return false;
  return currentStatus === INTAKE_CONFIRMATION_STATUSES.proceed || currentStatus === INTAKE_CONFIRMATION_STATUSES.warn;
};

export const buildIntakeSecondaryGoalPrompt = ({
  reviewModel = null,
  answers = {},
} = {}) => {
  if (!canAskSecondaryGoal({ reviewModel, answers })) return null;
  const inferredGoals = toArray(reviewModel?.goalStackReview?.activeGoals)
    .slice(1)
    .map((goal) => sanitizeDisplayLine(goal?.summary || "", 160))
    .filter(Boolean);
  return {
    prompt: sanitizeDisplayLine("Anything else you want to improve or maintain while chasing this?", 180),
    helperText: sanitizeDisplayLine(inferredGoals.length
      ? `Optional. I already picked up ${inferredGoals.join(" and ")} from what you said. Pick one of the quick options below, or add your own if needed.`
      : "Optional. Pick one of the quick options below, or add your own if you want another goal to stay visible in the priority order.", 320),
    placeholder: sanitizeDisplayLine("Example: get a six pack, bench 225, or keep upper body", 120),
    quickOptions: [
      { key: SECONDARY_GOAL_RESPONSE_KEYS.skip, label: "Skip" },
      { key: SECONDARY_GOAL_RESPONSE_KEYS.maintainStrength, label: "Maintain strength", value: SECONDARY_GOAL_PRESET_TEXT[SECONDARY_GOAL_RESPONSE_KEYS.maintainStrength] },
      { key: SECONDARY_GOAL_RESPONSE_KEYS.maintainMobility, label: "Maintain mobility", value: SECONDARY_GOAL_PRESET_TEXT[SECONDARY_GOAL_RESPONSE_KEYS.maintainMobility] },
      { key: SECONDARY_GOAL_RESPONSE_KEYS.custom, label: "Custom..." },
    ],
    existingGoals: readAdditionalGoalEntries({ answers }),
    inferredGoals,
  };
};

export const applyIntakeSecondaryGoalResponse = ({
  answers = {},
  response = null,
  customText = "",
  resolvedGoals = [],
  goalStackConfirmation = null,
  goalFeasibility = null,
} = {}) => {
  const responseKey = sanitizeText(response?.key || "", 80).toLowerCase();
  const presetGoalText = SECONDARY_GOAL_PRESET_TEXT[responseKey] || "";
  const nextGoalText = normalizeAdditionalGoalText(customText || response?.value || presetGoalText || "");
  const existingGoals = readAdditionalGoalEntries({ answers });

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.skip || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.primaryOnly) {
    return {
      answers: finalizeAdditionalGoalAnswers({
        answers,
        entries: [],
      }),
      goalStackConfirmation,
      rerunAssessment: false,
      keepCollecting: false,
    };
  }

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.maintainStrength || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.maintainMobility) {
    if (!nextGoalText) {
      return {
        answers: finalizeAdditionalGoalAnswers({
          answers,
          entries: existingGoals,
          answered: false,
        }),
        goalStackConfirmation,
        rerunAssessment: false,
        keepCollecting: true,
      };
    }
    const updatedEntries = dedupeStrings([...existingGoals, nextGoalText]);
    return {
      answers: finalizeAdditionalGoalAnswers({
        answers,
        entries: updatedEntries,
        answered: false,
      }),
      goalStackConfirmation,
      rerunAssessment: false,
      keepCollecting: true,
    };
  }

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.addGoal || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.custom) {
    if (!nextGoalText) {
      return {
        answers: finalizeAdditionalGoalAnswers({
          answers,
          entries: existingGoals,
          answered: false,
        }),
        goalStackConfirmation,
        rerunAssessment: false,
        keepCollecting: true,
      };
    }
    const updatedEntries = dedupeStrings([...existingGoals, nextGoalText]);
    return {
      answers: finalizeAdditionalGoalAnswers({
        answers,
        entries: updatedEntries,
        answered: false,
      }),
      goalStackConfirmation,
      rerunAssessment: false,
      keepCollecting: true,
    };
  }

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.done || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.keepInferred) {
    return {
      answers: finalizeAdditionalGoalAnswers({
        answers,
        entries: existingGoals,
      }),
      goalStackConfirmation: null,
      rerunAssessment: existingGoals.length > 0,
      keepCollecting: false,
    };
  }

  return {
    answers: finalizeAdditionalGoalAnswers({
      answers,
      entries: existingGoals,
    }),
    goalStackConfirmation,
    rerunAssessment: false,
    keepCollecting: false,
  };
};

export const buildRawGoalIntentFromAnswers = ({ answers = {}, fallbackLabel = "" } = {}) => {
  const clarificationNotes = toArray(answers?.goal_clarification_notes)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      if (isCompletenessClarificationNote(entry)) return "";
      const question = sanitizeText(entry?.question || "", 160);
      const answer = sanitizeText(entry?.answer || "", 220);
      if (!answer) return "";
      return question ? `${question} ${answer}` : answer;
    })
    .filter(Boolean);

  return dedupeStrings([
    sanitizeText(answers?.goal_intent || "", 320),
    sanitizeText(answers?.primary_goal_detail || "", 220),
    ...readAdditionalGoalEntries({ answers }),
    ...clarificationNotes,
    sanitizeText(answers?.timeline_adjustment || "", 180),
    sanitizeText(answers?.timeline_feedback || "", 180),
    sanitizeText(fallbackLabel || "", 80),
  ]).join(". ");
};

export const resolveCompatibilityPrimaryGoalKey = ({
  explicitPrimaryGoalKey = "",
  resolvedGoal = null,
} = {}) => {
  const cleanExplicit = sanitizeText(explicitPrimaryGoalKey, 40).toLowerCase();
  const category = sanitizeText(resolvedGoal?.planningCategory || "", 40).toLowerCase();
  if (cleanExplicit) {
    const explicitCategory = PRIMARY_GOAL_CATEGORY_BY_KEY[cleanExplicit] || "";
    if (!category || !explicitCategory || explicitCategory === category) return cleanExplicit;
  }
  return PRIMARY_GOAL_KEY_BY_CATEGORY[category] || "general_fitness";
};

export const applyIntakeGoalAdjustment = ({
  answers = {},
  adjustmentText = "",
  currentResolvedGoal = null,
  currentPrimaryGoalKey = "",
  now = new Date(),
  allowImplicitGoalReplacement = true,
} = {}) => {
  const normalizedText = normalizeGoalAdjustmentText(adjustmentText);
  if (!normalizedText) {
    return {
      kind: "empty",
      normalizedText: "",
      answers,
    };
  }

  const currentCategory = sanitizeText(
    currentResolvedGoal?.planningCategory || PRIMARY_GOAL_CATEGORY_BY_KEY[sanitizeText(currentPrimaryGoalKey, 40).toLowerCase()] || "",
    40
  ).toLowerCase();
  const currentSummary = sanitizeText(currentResolvedGoal?.summary || answers?.goal_intent || "", 160).toLowerCase();
  const preview = resolveGoalTranslation({
    rawUserGoalIntent: normalizedText,
    typedIntakePacket: buildMinimalIntakePacket(normalizedText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: false, source: "intake_goal_adjustment_probe" },
    now,
  });
  const nextPrimary = preview?.resolvedGoals?.[0] || null;
  const nextCategory = sanitizeText(nextPrimary?.planningCategory || "", 40).toLowerCase();
  const nextSummary = sanitizeText(nextPrimary?.summary || "", 160).toLowerCase();
  const explicitReplacement = GOAL_REPLACEMENT_PATTERN.test(adjustmentText);
  const additiveRefinement = GOAL_ADDITIVE_PATTERN.test(adjustmentText);
  const hasGoalSignal = hasGoalReplacementSignal(normalizedText);
  const explicitGoalReplacement = explicitReplacement && hasGoalSignal;
  const categoryChanged = Boolean(currentCategory && nextCategory && currentCategory !== nextCategory);
  const materiallyDifferent = Boolean(nextSummary && currentSummary && nextSummary !== currentSummary);
  const shouldReplaceGoalIntent = explicitGoalReplacement || (
    allowImplicitGoalReplacement
    && !additiveRefinement
    && hasGoalSignal
    && (categoryChanged || materiallyDifferent)
  );

  if (!shouldReplaceGoalIntent) {
    return {
      kind: "refinement",
      normalizedText,
      answers: {
        ...answers,
        timeline_adjustment: normalizedText,
      },
      preview,
    };
  }

  return {
    kind: "goal_replacement",
    normalizedText,
    answers: {
      ...answers,
      goal_intent: normalizedText,
      primary_goal: "",
      primary_goal_detail: "",
      other_goals: "",
      additional_goals_list: [],
      secondary_goal_prompt_answered: false,
      goal_stack_confirmation: null,
      timeline_adjustment: "",
      timeline_feedback: "",
      goal_clarification_notes: [],
      intake_completeness: {
        version: "2026-04-v1",
        fields: {},
      },
    },
    preview,
  };
};

const sanitizeIntakeReviewModelDisplayCopy = (reviewModel = null) => {
  if (!reviewModel || typeof reviewModel !== "object") return reviewModel;
  const sanitizeQuestionObject = (item = null) => (
    item && typeof item === "object"
      ? {
          ...item,
          prompt: sanitizeDisplayLine(item?.prompt || "", 220),
          label: sanitizeDisplayLine(item?.label || "", 160),
        }
      : item
  );
  const sanitizeReviewEntry = (item = null) => (
    item && typeof item === "object"
      ? {
          ...item,
          summary: sanitizeDisplayLine(item?.summary || "", 160),
          roleLabel: sanitizeDisplayLine(item?.roleLabel || "", 80),
          priorityLabel: sanitizeDisplayLine(item?.priorityLabel || "", 80),
          prioritySectionLabel: sanitizeDisplayLine(item?.prioritySectionLabel || "", 120),
          priorityHelper: sanitizeDisplayLine(item?.priorityHelper || "", 220),
          measurabilityLabel: sanitizeDisplayLine(item?.measurabilityLabel || "", 80),
          trackingLabels: sanitizeDisplayList(item?.trackingLabels, 160),
          tradeoff: sanitizeDisplayLine(item?.tradeoff || "", 180),
          reason: sanitizeDisplayLine(item?.reason || "", 220),
          rationale: sanitizeDisplayLine(item?.rationale || "", 220),
        }
      : item
  );
  const sanitizeLaneSection = (item = null) => (
    item && typeof item === "object"
      ? {
          ...item,
          title: sanitizeDisplayLine(item?.title || "", 120),
          empty_state: sanitizeDisplayLine(item?.empty_state || "", 180),
          goals: toArray(item?.goals).map(sanitizeReviewEntry),
        }
      : item
  );
  const sanitizeReviewContract = (reviewContract = null) => (
    reviewContract && typeof reviewContract === "object"
      ? {
          ...reviewContract,
          lead_goal: sanitizeReviewEntry(reviewContract?.lead_goal),
          maintained_goals: toArray(reviewContract?.maintained_goals).map(sanitizeReviewEntry),
          support_goals: toArray(reviewContract?.support_goals).map(sanitizeReviewEntry),
          deferred_goals: toArray(reviewContract?.deferred_goals).map(sanitizeReviewEntry),
          ordered_goal_stack: reviewContract?.ordered_goal_stack
            ? {
                ...(reviewContract.ordered_goal_stack || {}),
                items: toArray(reviewContract?.ordered_goal_stack?.items).map(sanitizeReviewEntry),
                top_priorities: toArray(reviewContract?.ordered_goal_stack?.top_priorities).map(sanitizeReviewEntry),
                additional_goals: toArray(reviewContract?.ordered_goal_stack?.additional_goals).map(sanitizeReviewEntry),
                sections: toArray(reviewContract?.ordered_goal_stack?.sections).map(sanitizeLaneSection),
              }
            : reviewContract?.ordered_goal_stack,
          tradeoff_statement: sanitizeDisplayLine(reviewContract?.tradeoff_statement || "", 320),
          lane_sections: toArray(reviewContract?.lane_sections).map(sanitizeLaneSection),
        }
      : reviewContract
  );

  return {
    ...reviewModel,
    primarySummary: sanitizeDisplayLine(reviewModel?.primarySummary || "", 160),
    goalFamilyLabel: sanitizeDisplayLine(reviewModel?.goalFamilyLabel || "", 80),
    goalTypeLabel: sanitizeDisplayLine(reviewModel?.goalTypeLabel || "", 80),
    measurabilityLabel: sanitizeDisplayLine(reviewModel?.measurabilityLabel || "", 80),
    realismLabel: sanitizeDisplayLine(reviewModel?.realismLabel || "", 80),
    confirmationLabel: sanitizeDisplayLine(reviewModel?.confirmationLabel || "", 80),
    gateLabel: sanitizeDisplayLine(reviewModel?.gateLabel || "", 80),
    missingConfidenceReasons: sanitizeDisplayList(reviewModel?.missingConfidenceReasons, 160),
    gateReasons: toArray(reviewModel?.gateReasons).map((item) => ({
      ...item,
      summary: sanitizeDisplayLine(item?.summary || "", 220),
    })).filter((item) => item.summary),
    gateSuggestedRevision: reviewModel?.gateSuggestedRevision
      ? {
          ...(reviewModel.gateSuggestedRevision || {}),
          summary: sanitizeDisplayLine(reviewModel?.gateSuggestedRevision?.summary || "", 220),
          first_block_target: sanitizeDisplayLine(reviewModel?.gateSuggestedRevision?.first_block_target || "", 220),
          requested_data: sanitizeDisplayList(reviewModel?.gateSuggestedRevision?.requested_data, 160),
        }
      : null,
    gateFirstBlockAlternatives: toArray(reviewModel?.gateFirstBlockAlternatives).map((item) => ({
      ...item,
      label: sanitizeDisplayLine(item?.label || "", 60),
      summary: sanitizeDisplayLine(item?.summary || "", 320),
    })).filter((item) => item.summary),
    gateExplanationText: sanitizeDisplayLine(reviewModel?.gateExplanationText || "", 680),
    recommendedRevisionSummary: sanitizeDisplayLine(reviewModel?.recommendedRevisionSummary || "", 220),
    tradeoffSummary: sanitizeDisplayLine(reviewModel?.tradeoffSummary || "", 220),
    blockingReasons: sanitizeDisplayList(reviewModel?.blockingReasons, 180),
    warningReasons: sanitizeDisplayList(reviewModel?.warningReasons, 180),
    arbitrationBlockingIssues: sanitizeDisplayList(reviewModel?.arbitrationBlockingIssues, 180),
    trackingLabels: sanitizeDisplayList(reviewModel?.trackingLabels, 160),
    unresolvedItems: sanitizeDisplayList(reviewModel?.unresolvedItems, 180),
    clarifyingQuestions: sanitizeDisplayList(reviewModel?.clarifyingQuestions, 220),
    nextQuestions: toArray(reviewModel?.nextQuestions).map(sanitizeQuestionObject),
    tradeoffStatement: sanitizeDisplayLine(reviewModel?.tradeoffStatement || "", 320),
    goalStackReview: reviewModel?.goalStackReview
      ? {
          ...(reviewModel.goalStackReview || {}),
          orderedGoalIds: sanitizeDisplayList(reviewModel?.goalStackReview?.orderedGoalIds, 120),
          orderedGoalStack: reviewModel?.goalStackReview?.orderedGoalStack
            ? {
                ...(reviewModel.goalStackReview.orderedGoalStack || {}),
                items: toArray(reviewModel?.goalStackReview?.orderedGoalStack?.items).map(sanitizeReviewEntry),
                top_priorities: toArray(reviewModel?.goalStackReview?.orderedGoalStack?.top_priorities).map(sanitizeReviewEntry),
                additional_goals: toArray(reviewModel?.goalStackReview?.orderedGoalStack?.additional_goals).map(sanitizeReviewEntry),
                sections: toArray(reviewModel?.goalStackReview?.orderedGoalStack?.sections).map(sanitizeLaneSection),
              }
            : reviewModel?.goalStackReview?.orderedGoalStack,
          activeGoals: toArray(reviewModel?.goalStackReview?.activeGoals).map(sanitizeReviewEntry),
          leadGoal: sanitizeReviewEntry(reviewModel?.goalStackReview?.leadGoal),
          maintainedGoals: toArray(reviewModel?.goalStackReview?.maintainedGoals).map(sanitizeReviewEntry),
          supportGoals: toArray(reviewModel?.goalStackReview?.supportGoals).map(sanitizeReviewEntry),
          backgroundGoals: toArray(reviewModel?.goalStackReview?.backgroundGoals).map(sanitizeReviewEntry),
          deferredGoals: toArray(reviewModel?.goalStackReview?.deferredGoals).map(sanitizeReviewEntry),
          removedGoals: toArray(reviewModel?.goalStackReview?.removedGoals).map(sanitizeReviewEntry),
          primaryTradeoff: sanitizeDisplayLine(reviewModel?.goalStackReview?.primaryTradeoff || "", 220),
          tradeoffStatement: sanitizeDisplayLine(reviewModel?.goalStackReview?.tradeoffStatement || "", 320),
          backgroundPriority: reviewModel?.goalStackReview?.backgroundPriority
            ? {
                ...(reviewModel.goalStackReview.backgroundPriority || {}),
                label: sanitizeDisplayLine(reviewModel?.goalStackReview?.backgroundPriority?.label || "", 120),
                summary: sanitizeDisplayLine(reviewModel?.goalStackReview?.backgroundPriority?.summary || "", 220),
                trackingLabels: sanitizeDisplayList(reviewModel?.goalStackReview?.backgroundPriority?.trackingLabels, 120),
              }
            : reviewModel?.goalStackReview?.backgroundPriority,
          reviewContract: sanitizeReviewContract(reviewModel?.goalStackReview?.reviewContract),
        }
      : reviewModel?.goalStackReview,
    reviewContract: sanitizeReviewContract(reviewModel?.reviewContract),
  };
};

const buildStageRoleLabel = ({
  role = "",
  priorityIndex = null,
} = {}) => {
  if (Number.isFinite(Number(priorityIndex))) return buildOrderedGoalPriorityLabel(priorityIndex);
  const normalizedRole = sanitizeText(role, 40).toLowerCase();
  if (normalizedRole === GOAL_STACK_ROLES.primary) return "Priority 1";
  if (normalizedRole === GOAL_STACK_ROLES.maintained) return "Priority 2";
  if (normalizedRole === GOAL_STACK_ROLES.background) return "Priority 3";
  if (normalizedRole === GOAL_STACK_ROLES.deferred) return "Priority 4+";
  return "Goal stack";
};

const buildSummaryRailGoalRows = (reviewModel = null) => {
  const orderedResolvedGoals = toArray(reviewModel?.orderedResolvedGoals);
  const goalById = buildFirstGoalByIdMap(orderedResolvedGoals);
  const rows = [];
  const seen = new Set();
  const pushGoal = ({
    goal = null,
    role = "",
    summary = "",
    reason = "",
    tradeoff = "",
    trackingLabels = [],
    priorityIndex = null,
    priorityLabel = "",
  } = {}) => {
    const goalId = sanitizeText(goal?.id || "", 120);
    const cleanSummary = sanitizeText(summary || goal?.summary || "", 160);
    const dedupeKey = goalId || cleanSummary.toLowerCase();
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const sourceGoal = goalId ? (goalById.get(goalId) || goal) : goal;
    const normalizedPriorityIndex = Number.isFinite(Number(priorityIndex))
      ? Math.max(0, Math.round(Number(priorityIndex)))
      : null;
    rows.push({
      id: goalId,
      summary: sanitizeDisplayLine(cleanSummary, 160),
      role: sanitizeText(role || goal?.intakeConfirmedRole || goal?.goalArbitrationRole || "", 40).toLowerCase(),
      roleLabel: sanitizeDisplayLine(
        priorityLabel || buildStageRoleLabel({
          role: role || goal?.intakeConfirmedRole || goal?.goalArbitrationRole || "",
          priorityIndex: normalizedPriorityIndex,
        }),
        80
      ),
      priorityIndex: normalizedPriorityIndex,
      priorityLabel: sanitizeDisplayLine(priorityLabel || buildOrderedGoalPriorityLabel(normalizedPriorityIndex), 80),
      goalTypeLabel: sanitizeDisplayLine(buildPlainGoalTypeLabel(sourceGoal, sourceGoal?.goalFamily || ""), 80),
      timingLabel: sanitizeDisplayLine(buildGoalTimingPresentation(sourceGoal).label, 120),
      timingDetail: sanitizeDisplayLine(buildGoalTimingPresentation(sourceGoal).detail, 220),
      trackingLabels: sanitizeDisplayList([
        ...toArray(trackingLabels),
        sourceGoal?.primaryMetric?.label || "",
        ...toArray(sourceGoal?.proxyMetrics).map((metric) => metric?.label || ""),
      ], 160),
      firstThirtyDayWin: sanitizeDisplayLine(sourceGoal?.first30DaySuccessDefinition || "", 220),
      rationale: sanitizeDisplayLine(reason || goal?.goalArbitrationReason || "", 220),
      tradeoff: sanitizeDisplayLine(tradeoff || sourceGoal?.tradeoffs?.[0] || "", 220),
    });
  };

  const orderedStackItems = toArray(reviewModel?.goalStackReview?.orderedGoalStack?.items);
  if (orderedStackItems.length > 0) {
    orderedStackItems.forEach((goal, index) => {
      pushGoal({
        goal,
        role: goal?.role || "",
        summary: goal?.summary || "",
        reason: goal?.rationale || goal?.reason || "",
        tradeoff: goal?.tradeoff || "",
        trackingLabels: goal?.trackingLabels || [],
        priorityIndex: goal?.priorityIndex ?? index,
        priorityLabel: goal?.priorityLabel || "",
      });
    });
    return rows;
  }

  [
    ...toArray(reviewModel?.goalStackReview?.activeGoals).map((goal, index) => ({ goal, role: goal?.role, priorityIndex: index })),
    ...toArray(reviewModel?.goalStackReview?.backgroundGoals).map((goal, index) => ({ goal, role: goal?.role, priorityIndex: index + 2 })),
    ...toArray(reviewModel?.goalStackReview?.deferredGoals).map((goal, index) => ({ goal, role: goal?.role, priorityIndex: index + 3 })),
  ].forEach((entry) => {
    pushGoal({
      goal: entry?.goal || null,
      role: entry?.role || entry?.goal?.role || "",
      summary: entry?.goal?.summary || "",
      reason: entry?.goal?.rationale || entry?.goal?.reason || "",
      tradeoff: entry?.goal?.tradeoff || "",
      trackingLabels: entry?.goal?.trackingLabels || [],
      priorityIndex: entry?.priorityIndex ?? null,
    });
  });

  orderedResolvedGoals.forEach((goal, index) => {
    pushGoal({
      goal,
      role: goal?.intakeConfirmedRole || goal?.goalArbitrationRole || (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained),
      priorityIndex: index,
    });
  });

  return rows;
};

export const buildIntakeGoalReviewModel = ({
  goalResolution = null,
  orderedResolvedGoals = [],
  goalFeasibility = null,
  arbitration = null,
  aiInterpretationProposal = null,
  answers = {},
  goalStackConfirmation = null,
} = {}) => {
  const candidateResolvedGoals = Array.isArray(orderedResolvedGoals) && orderedResolvedGoals.length
    ? orderedResolvedGoals
    : (Array.isArray(goalResolution?.resolvedGoals) ? goalResolution.resolvedGoals : []);
  const milestoneAdjustedCandidateGoals = applyIntakeMilestoneSelections({
    resolvedGoals: candidateResolvedGoals,
    goalStackConfirmation,
  });
  const goalStackReview = buildIntakeGoalStackReviewModel({
    resolvedGoals: candidateResolvedGoals,
    goalResolution,
    goalFeasibility,
    goalStackConfirmation,
  });
  const explicitGoalConfirmations = buildGoalConfirmationReadiness({
    goalStackReview,
    goalStackConfirmation,
  });
  const resolvedGoalById = buildFirstGoalByIdMap(milestoneAdjustedCandidateGoals);
  const stackActiveResolvedGoals = toArray(goalStackReview?.activeGoalIds)
    .map((goalId) => resolvedGoalById.get(goalId))
    .filter(Boolean);
  const fallbackActiveResolvedGoals = goalStackConfirmation
    ? applyIntakeGoalStackConfirmation({
        resolvedGoals: candidateResolvedGoals,
        goalStackConfirmation,
        goalFeasibility,
      })
    : candidateResolvedGoals.filter((goal, index) => {
        const role = sanitizeText(goal?.goalArbitrationRole || (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained), 40).toLowerCase();
        return role === GOAL_STACK_ROLES.primary || role === GOAL_STACK_ROLES.maintained;
      });
  const activeResolvedGoals = stackActiveResolvedGoals.length ? stackActiveResolvedGoals : fallbackActiveResolvedGoals;
  const resolvedGoals = activeResolvedGoals.length ? activeResolvedGoals : milestoneAdjustedCandidateGoals;
  const primaryGoal = resolvedGoalById.get(goalStackReview?.primaryGoalId || "") || activeResolvedGoals[0] || milestoneAdjustedCandidateGoals[0] || null;
  const completeness = deriveIntakeCompletenessState({
    resolvedGoals: activeResolvedGoals.length ? activeResolvedGoals : resolvedGoals,
    answers,
  });
  const trackingLabels = dedupeStrings(
    (activeResolvedGoals.length ? activeResolvedGoals : resolvedGoals).flatMap((goal) => [
      goal?.primaryMetric?.label || "",
      ...(Array.isArray(goal?.proxyMetrics) ? goal.proxyMetrics.map((metric) => metric?.label || "") : []),
      !goal?.primaryMetric && (!Array.isArray(goal?.proxyMetrics) || goal.proxyMetrics.length === 0)
        ? goal?.first30DaySuccessDefinition || ""
        : "",
    ])
  ).slice(0, 6);
  const unresolvedItems = dedupeStrings([
    ...completeness.missingRequired.map((item) => buildPlainNeedItem({
      label: item?.label,
      question: item?.question?.prompt || item?.question || "",
    })),
    ...(goalResolution?.unresolvedGaps || []),
    ...resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []),
  ].map((item) => normalizeClarityItem(item)).filter(Boolean)).slice(0, 5);
  const dedupeQuestionObjects = (questions = []) => {
    const seen = new Set();
    return toArray(questions)
      .filter(Boolean)
      .filter((item) => {
        const prompt = sanitizeText(typeof item === "string" ? item : item?.prompt || "", 220).toLowerCase();
        const key = sanitizeText(typeof item === "string" ? "" : item?.key || "", 80).toLowerCase();
        const dedupeKey = `${key}::${prompt}`;
        if (!prompt || seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      })
      .map((item, index) => (
        typeof item === "string"
          ? {
              key: `generic_clarify_${index}`,
              prompt: sanitizeText(item, 220),
              required: false,
              source: "review",
              label: sanitizeText(item, 160),
            }
          : item
      ));
  };
  const nextQuestions = dedupeQuestionObjects([
    ...completeness.nextQuestions,
    ...buildDeterministicClarifyingQuestions(resolvedGoals),
    ...(aiInterpretationProposal?.missingClarifyingQuestions || []),
  ]);
  const clarifyingQuestions = nextQuestions
    .map((item) => normalizeClarityItem(item.prompt))
    .filter(Boolean);
  const confirmationAction = sanitizeText(goalFeasibility?.confirmationAction || "proceed", 20).toLowerCase() || "proceed";
  const arbitrationBlockingIssues = dedupeStrings([
    ...toArray(arbitration?.finalization?.blockingIssues),
    ...toArray(arbitration?.conflictSummary?.blockingItems).map((item) => sanitizeText(item?.summary || item, 220)),
    ...toArray(explicitGoalConfirmations?.blockingIssues),
  ]).slice(0, 4);
  const gateStatus = !completeness.isComplete
    ? "incomplete"
    : arbitrationBlockingIssues.length > 0
    ? "blocked"
    : confirmationAction === "block"
    ? "blocked"
    : confirmationAction === "warn"
    ? "warn"
    : "ready";

  return sanitizeIntakeReviewModelDisplayCopy({
    primarySummary: sanitizeText(primaryGoal?.summary || "", 160),
    goalFamily: sanitizeText(primaryGoal?.goalFamily || aiInterpretationProposal?.interpretedGoalType || "", 40).toLowerCase(),
    goalFamilyLabel: sanitizeText(primaryGoal?.goalFamily || aiInterpretationProposal?.interpretedGoalType || "", 40).replaceAll("_", " "),
    goalTypeLabel: buildPlainGoalTypeLabel(primaryGoal, aiInterpretationProposal?.interpretedGoalType || ""),
    measurabilityTier: sanitizeText(primaryGoal?.measurabilityTier || "", 40).toLowerCase(),
    measurabilityLabel: MEASURABILITY_LABELS[primaryGoal?.measurabilityTier] || "Pending",
    realismStatus: sanitizeText(goalFeasibility?.realismStatus || "", 40).toLowerCase(),
    realismLabel: REALISM_LABELS[goalFeasibility?.realismStatus] || "Pending",
    confirmationAction,
    confirmationLabel: FEASIBILITY_ACTION_LABELS[goalFeasibility?.confirmationAction] || FEASIBILITY_ACTION_LABELS.proceed,
    gateStatus,
    gateLabel: REVIEW_GATE_LABELS[gateStatus] || REVIEW_GATE_LABELS.ready,
    confidence: sanitizeText(primaryGoal?.confidence || goalResolution?.confidenceLevel || "", 20).toLowerCase(),
    confidenceLabel: CONFIDENCE_LABELS[primaryGoal?.confidence || goalResolution?.confidenceLevel] || "Pending confidence",
    missingConfidenceLevel: sanitizeText(goalFeasibility?.missingConfidence?.level || "low", 20).toLowerCase() || "low",
    missingConfidenceReasons: toArray(goalFeasibility?.missingConfidence?.reasons).slice(0, 3),
    gateStructuredStatus: sanitizeText(goalFeasibility?.status || "", 40).toUpperCase(),
    gatePrimaryReasonCode: sanitizeText(goalFeasibility?.primary_reason_code || goalFeasibility?.primaryReasonCode || "", 80).toLowerCase(),
    gateReasons: toArray(goalFeasibility?.reasons).map((item) => ({
      code: sanitizeText(item?.code || "", 80).toLowerCase(),
      summary: sanitizeText(item?.summary || "", 220),
      severity: sanitizeText(item?.severity || "warning", 20).toLowerCase(),
    })).filter((item) => item.summary),
    gateSuggestedRevision: goalFeasibility?.suggested_revision ? { ...(goalFeasibility.suggested_revision || {}) } : null,
    gateFirstBlockAlternatives: toArray(
      goalFeasibility?.first_block_alternatives
      || goalFeasibility?.suggested_revision?.first_block_alternatives
    ).map((item, index) => ({
      key: sanitizeText(item?.key || `option_${index + 1}`, 40).toLowerCase(),
      label: sanitizeText(item?.label || `Option ${index + 1}`, 40),
      summary: sanitizeText(item?.summary || "", 320),
      suggestedTargetHorizonWeeks: Number.isFinite(Number(item?.suggested_target_horizon_weeks))
        ? Math.max(1, Math.round(Number(item.suggested_target_horizon_weeks)))
        : null,
    })).filter((item) => item.summary),
    gateExplanationText: sanitizeText(goalFeasibility?.explanation_text || "", 680),
    recommendedRevisionSummary: sanitizeText(goalFeasibility?.suggested_revision?.summary || goalFeasibility?.recommendedRevision?.summary || "", 220),
    tradeoffSummary: sanitizeText(goalFeasibility?.tradeoffSummary || "", 220),
    blockingReasons: toArray(goalFeasibility?.blockingReasons).slice(0, 3),
    warningReasons: toArray(goalFeasibility?.warningReasons).slice(0, 3),
    arbitrationBlockingIssues,
    explicitGoalConfirmations,
    nextRequiredFieldId: resolveNextRequiredFieldId({
      completeness,
    }),
    trackingLabels,
    unresolvedItems,
    clarifyingQuestions,
    nextQuestions,
    completeness,
    orderedResolvedGoals: milestoneAdjustedCandidateGoals,
    activeResolvedGoals,
    goalStackReview,
    reviewContract: goalStackReview?.reviewContract || null,
    tradeoffStatement: sanitizeText(goalStackReview?.tradeoffStatement || goalStackReview?.reviewContract?.tradeoff_statement || "", 320),
    isPlannerReady: Boolean(primaryGoal) && (gateStatus === "ready" || gateStatus === "warn"),
  });
};

export const buildIntakeSummaryRailModel = ({
  answers = {},
  reviewModel = null,
  draftPrimaryGoal = "",
  draftAdditionalGoals = [],
} = {}) => {
  const yourWords = dedupeStrings([
    sanitizeText(draftPrimaryGoal || answers?.goal_intent || "", 220),
    ...toArray(draftAdditionalGoals).map((item) => sanitizeText(item, 180)),
    ...readAdditionalGoalEntries({ answers }),
  ]).slice(0, 6);
  const interpretedGoals = buildSummaryRailGoalRows(reviewModel);
  const resolvedGoalById = buildFirstGoalByIdMap(reviewModel?.orderedResolvedGoals);
  const trackingItems = dedupeStrings([
    ...toArray(reviewModel?.trackingLabels),
    ...interpretedGoals.flatMap((goal) => {
      const sourceGoal = goal?.id ? resolvedGoalById.get(sanitizeText(goal.id, 120)) : null;
      return [
        ...toArray(goal?.trackingLabels),
        sourceGoal?.first30DaySuccessDefinition || "",
      ];
    }),
  ]).slice(0, 6);
  const fuzzyItems = dedupeStrings([
    ...toArray(reviewModel?.completeness?.missingRequired).map((item) => buildPlainNeedItem({
      label: item?.label,
      question: item?.question?.prompt || item?.question || "",
    })),
    ...toArray(reviewModel?.unresolvedItems),
    ...toArray(reviewModel?.clarifyingQuestions),
  ].map((item) => normalizeClarityItem(item)).filter(Boolean)).slice(0, 5);
  const tradeoffItems = dedupeStrings([
    sanitizeText(reviewModel?.goalStackReview?.tradeoffStatement || reviewModel?.tradeoffStatement || "", 320),
    sanitizeText(reviewModel?.tradeoffSummary || "", 220),
    ...interpretedGoals.map((goal) => sanitizeText(goal?.tradeoff || "", 180)),
  ]).slice(0, 4);

  return {
    yourWords: sanitizeDisplayList(
      yourWords.length ? yourWords : ["Add at least one goal."],
      180
    ),
    interpretedGoals,
    trackingItems: sanitizeDisplayList(
      trackingItems.length ? trackingItems : ["First tracking markers appear with the draft."],
      180
    ),
    fuzzyItems: sanitizeDisplayList(
      fuzzyItems.length ? fuzzyItems : ["Nothing else needs clarification yet."],
      180
    ),
    tradeoffItems: sanitizeDisplayList(
      tradeoffItems.length ? tradeoffItems : ["Balancing notes appear before you confirm."],
      220
    ),
    sections: [
      {
        key: "your_words",
        label: "Goal request",
        items: sanitizeDisplayList(
          yourWords.length ? yourWords : ["Add at least one goal."],
          180
        ),
      },
      {
        key: "interpreted_goals",
        label: "Priority draft",
        items: sanitizeDisplayList(
          interpretedGoals.length
            ? interpretedGoals.map((goal) => (
                `${goal.priorityLabel || goal.roleLabel ? `${goal.priorityLabel || goal.roleLabel}: ` : ""}${goal.summary}${goal.goalTypeLabel ? ` - ${goal.goalTypeLabel}` : ""}${goal.timingLabel ? ` - ${goal.timingLabel}` : ""}`
              ))
            : (yourWords.length
              ? ["Priority order resolves after you continue."]
              : ["Resolved goals appear here."]),
          220
        ),
      },
      {
        key: "what_we_track",
        label: "Tracking focus",
        items: sanitizeDisplayList(
          trackingItems.length ? trackingItems : ["First tracking markers appear with the draft."],
          180
        ),
      },
      {
        key: "what_is_fuzzy",
        label: "What still needs clarity",
        items: sanitizeDisplayList(
          fuzzyItems.length ? fuzzyItems : ["Nothing else needs clarification yet."],
          180
        ),
      },
      {
        key: "tradeoffs",
        label: "Balancing notes",
        items: sanitizeDisplayList(
          tradeoffItems.length ? tradeoffItems : ["Balancing notes appear before you confirm."],
          220
        ),
      },
    ],
  };
};

export const deriveIntakeConfirmationState = ({
  reviewModel = null,
  askedQuestions = [],
  maxQuestions = 2,
} = {}) => {
  const confirmationAction = sanitizeText(reviewModel?.confirmationAction || "", 20).toLowerCase();
  const primaryGoal = toArray(reviewModel?.activeResolvedGoals)[0] || toArray(reviewModel?.orderedResolvedGoals)[0] || null;
  const missingRequired = toArray(reviewModel?.completeness?.missingRequired);
  const arbitrationBlockingIssues = toArray(reviewModel?.arbitrationBlockingIssues);
  const warningReasons = toArray(reviewModel?.warningReasons);
  const gateReasons = toArray(reviewModel?.gateReasons).map((item) => sanitizeText(item?.summary || "", 220)).filter(Boolean);
  const gateExplanationText = sanitizeText(reviewModel?.gateExplanationText || "", 220);
  const gateSuggestedRevisionSummary = sanitizeText(
    reviewModel?.gateSuggestedRevision?.summary
    || reviewModel?.gateSuggestedRevision?.first_block_target
    || "",
    220
  );
  const recommendedRevisionSummary = sanitizeText(reviewModel?.recommendedRevisionSummary || "", 220);
  const tradeoffSummary = sanitizeText(reviewModel?.tradeoffSummary || "", 220);
  const nextRequiredFieldId = sanitizeText(
    reviewModel?.nextRequiredFieldId
    || resolveNextRequiredFieldId({ completeness: reviewModel?.completeness || {} })
    || "",
    80
  ) || null;

  if (!primaryGoal) {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.block,
      reason: sanitizeDisplayLine("Set the goal order so Priority 1 is clear.", 140),
      next_required_field: null,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (missingRequired.length > 0) {
    const incompleteReason = sanitizeText(missingRequired[0]?.label || "", 140);
    return {
      status: INTAKE_CONFIRMATION_STATUSES.incomplete,
      reason: sanitizeDisplayLine(incompleteReason ? `I still need ${incompleteReason.toLowerCase()}.` : "I still need one more detail before I build this.", 180),
      next_required_field: nextRequiredFieldId,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (arbitrationBlockingIssues.length > 0) {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.block,
      reason: sanitizeDisplayLine(buildShortConfirmationReason(arbitrationBlockingIssues) || "I need to clean up the goal order before I build this.", 180),
      next_required_field: nextRequiredFieldId,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (confirmationAction === "block") {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.block,
      reason: sanitizeDisplayLine(buildShortConfirmationReason([
        gateSuggestedRevisionSummary,
        recommendedRevisionSummary,
        gateReasons[0],
        gateExplanationText,
      ]) || "Start with a smaller milestone before I build this.", 220),
      next_required_field: nextRequiredFieldId,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (confirmationAction === "warn") {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.warn,
      reason: sanitizeDisplayLine(buildShortConfirmationReason([
        warningReasons[0],
        gateReasons[0],
        gateExplanationText,
        tradeoffSummary,
        reviewModel?.gateLabel,
      ]) || "Target is ambitious, but still workable from here.", 220),
      next_required_field: null,
      canConfirm: true,
      requiresAcknowledgement: false,
    };
  }

  return {
    status: INTAKE_CONFIRMATION_STATUSES.proceed,
    reason: "",
    next_required_field: null,
    canConfirm: true,
    requiresAcknowledgement: false,
  };
};

export const buildIntakeConfirmationNeedsList = ({
  reviewModel = null,
  machineState = null,
  confirmationState = null,
  maxItems = 3,
} = {}) => {
  const status = sanitizeText(
    confirmationState?.status
    || reviewModel?.confirmationState?.status
    || "",
    20
  ).toLowerCase();
  if (status !== INTAKE_CONFIRMATION_STATUSES.incomplete && status !== INTAKE_CONFIRMATION_STATUSES.block) {
    return [];
  }

  const boundedMaxItems = Math.max(1, Math.min(3, Number(maxItems) || 3));
  const currentAnchor = machineState?.draft?.missingAnchorsEngine?.currentAnchor || null;
  const missingAnchors = toArray(machineState?.draft?.missingAnchorsEngine?.missingAnchors);
  const anchorNeeds = dedupeStrings([
    buildPlainNeedItem({
      label: currentAnchor?.label,
      question: currentAnchor?.question,
    }),
    ...missingAnchors.map((anchor) => buildPlainNeedItem({
      label: anchor?.label,
      question: anchor?.question,
    })),
  ]);
  const fallbackNeeds = dedupeStrings([
    ...toArray(reviewModel?.gateSuggestedRevision?.requested_data).map((item) => sanitizeText(item, 160)),
    ...toArray(reviewModel?.arbitrationBlockingIssues).map((item) => sanitizeText(item, 180)),
    ...toArray(reviewModel?.completeness?.missingRequired).map((item) => buildPlainNeedItem({
      label: item?.label,
      question: item?.question?.prompt || item?.question || "",
    })),
    ...toArray(reviewModel?.nextQuestions).map((item) => buildPlainNeedItem({
      label: item?.label,
      question: item?.prompt || item,
    })),
  ]);

  return sanitizeDisplayList(dedupeStrings([
    ...anchorNeeds,
    ...fallbackNeeds,
  ]), 180).slice(0, boundedMaxItems);
};

export const getNextIntakeClarifyingQuestion = ({
  reviewModel = null,
  askedQuestions = [],
  maxQuestions = 2,
} = {}) => {
  const normalizedAsked = new Set(
    toArray(askedQuestions)
      .map((item) => sanitizeText(item, 180).toLowerCase())
      .filter(Boolean)
  );
  const nextQuestions = toArray(reviewModel?.nextQuestions).length
    ? toArray(reviewModel?.nextQuestions)
    : toArray(reviewModel?.clarifyingQuestions).map((item, index) => ({
        key: `clarifying_${index}`,
        prompt: sanitizeText(item, 220),
        required: false,
        source: "review",
      }));
  const findUnaskedQuestion = (items = []) => items.find((item) => {
    const normalizedKey = sanitizeText(item?.key || "", 180).toLowerCase();
    const normalizedPrompt = sanitizeText(item?.prompt || "", 180).toLowerCase();
    return item?.prompt && !normalizedAsked.has(normalizedKey) && !normalizedAsked.has(normalizedPrompt);
  }) || null;
  const requiredQuestions = nextQuestions.filter((item) => item?.required && item?.prompt);
  const unaskedRequiredQuestion = findUnaskedQuestion(requiredQuestions);
  if (unaskedRequiredQuestion?.prompt) return unaskedRequiredQuestion;
  if (requiredQuestions[0]?.prompt) return requiredQuestions[0];
  if (normalizedAsked.size >= Math.max(0, maxQuestions)) return null;
  return findUnaskedQuestion(nextQuestions) || null;
};

export const buildIntakeClarificationCoachMessages = ({
  statusText = "",
  nextQuestion = null,
} = {}) => {
  const messages = [];
  const prompt = sanitizeText(nextQuestion?.prompt || "", 220);
  const fieldId = sanitizeText(
    nextQuestion?.field_id
    || toArray(nextQuestion?.fieldKeys)[0]
    || "",
    80
  );
  const cleanStatus = sanitizeText(statusText || "", 320);
  if (prompt) messages.push(buildDeterministicAnchorPromptText({ fieldId, prompt }));
  if (cleanStatus) messages.push(sanitizeDisplayLine(cleanStatus, 320));
  return messages;
};

export const applyIntakeCompletenessAnswer = ({
  answers = {},
  question = null,
  answerText = "",
} = {}) => applyStructuredIntakeCompletenessAnswer({
  answers,
  question,
  answerText,
});

export const buildIntakeCompletenessPacketContext = ({
  resolvedGoals = [],
  answers = {},
} = {}) => buildIntakeCompletenessContext({
  resolvedGoals,
  answers,
});
