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

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

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

export const SECONDARY_GOAL_RESPONSE_KEYS = {
  primaryOnly: "primary_only",
  addGoal: "add_goal",
  done: "done",
  keepInferred: "keep_inferred",
  custom: "custom",
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
  aggressive: "Aggressive but possible",
  exploratory: "Needs a little more detail",
  unrealistic: "Too aggressive for this timeline",
};

const FEASIBILITY_ACTION_LABELS = {
  proceed: "Ready to build",
  warn: "Aggressive but possible",
  block: "Too aggressive for this timeline",
};

const REVIEW_GATE_LABELS = {
  incomplete: "Need one more detail",
  blocked: "Too aggressive for this timeline",
  warn: "Aggressive but possible",
  ready: "Ready to build",
};

export const INTAKE_CONFIRMATION_STATUSES = {
  incomplete: "incomplete",
  warn: "warn",
  block: "block",
  proceed: "proceed",
};

const ROLE_LABELS = {
  [GOAL_STACK_ROLES.primary]: "Lead goal",
  [GOAL_STACK_ROLES.maintained]: "Also keep",
  [GOAL_STACK_ROLES.background]: "Not the focus right now",
  [GOAL_STACK_ROLES.deferred]: "Later",
};

export const GOAL_REVIEW_LANE_KEYS = {
  leadGoal: "lead_goal",
  maintainedGoals: "maintained_goals",
  supportGoals: "support_goals",
  deferredGoals: "deferred_goals",
};

const GOAL_REVIEW_LANE_META = {
  [GOAL_REVIEW_LANE_KEYS.leadGoal]: {
    title: "Leading now",
    emptyState: "No lead goal is selected yet.",
  },
  [GOAL_REVIEW_LANE_KEYS.maintainedGoals]: {
    title: "We will maintain",
    emptyState: "Nothing else needs active maintenance right now.",
  },
  [GOAL_REVIEW_LANE_KEYS.supportGoals]: {
    title: "We will support in the background",
    emptyState: "No support-only goals are sitting in the background right now.",
  },
  [GOAL_REVIEW_LANE_KEYS.deferredGoals]: {
    title: "We are deferring",
    emptyState: "Nothing is being deferred right now.",
  },
};

const GOAL_REVIEW_ACTIONS = {
  confirm: {
    key: "confirm_and_build",
    label: "Confirm and build my plan",
  },
  changePriority: {
    key: "change_priority",
    label: "Change priority",
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
    blockingIssues.push("Pick the goal that should lead right now.");
  }
  if (maintainedGoals.length > 0 && !maintainedGoalsConfirmed) {
    blockingIssues.push("Confirm which extra goal should stay in maintenance.");
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
    .map((item) => sanitizeText(item, 180))
    .find(Boolean)
    || ""
);

const buildGoalReviewEntry = ({ goal = {}, role = GOAL_STACK_ROLES.deferred } = {}) => {
  const trackingLabels = buildPerGoalTrackingLabels(goal);
  const tradeoff = sanitizeText(goal?.tradeoffs?.[0] || "", 180);
  const reason = sanitizeText(goal?.goalArbitrationReason || "", 220);
  const fallbackRationale = role === GOAL_STACK_ROLES.primary
    ? "This sets the direction for the current block."
    : role === GOAL_STACK_ROLES.maintained
    ? "This stays in maintenance range while the lead goal gets the clearest push."
    : role === GOAL_STACK_ROLES.background
    ? "This stays present in the background without competing with the lead goal."
    : "This is intentionally parked for a later block so the current plan can stay coherent.";
  return {
    id: goal?.id,
    summary: sanitizeText(goal?.summary || "", 160),
    role,
    roleLabel: ROLE_LABELS[role] || "Goal",
    planningPriority: Number(goal?.planningPriority || 0) || null,
    targetDate: sanitizeText(goal?.targetDate || "", 24),
    targetHorizonWeeks: Number.isFinite(Number(goal?.targetHorizonWeeks)) ? Number(goal.targetHorizonWeeks) : null,
    primaryMetric: goal?.primaryMetric || null,
    arbitrationConfirmedPrimary: Boolean(goal?.arbitrationConfirmedPrimary),
    measurabilityLabel: MEASURABILITY_LABELS[goal?.measurabilityTier] || "Goal",
    trackingLabels,
    tradeoff,
    reason,
    rationale: reason || tradeoff || fallbackRationale,
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
    parts.push("it came through the feasibility gate as the cleanest lead");
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
  leadGoal = null,
  maintainedGoals = [],
  supportGoals = [],
  deferredGoals = [],
  goalFeasibility = null,
  primaryTradeoff = "",
} = {}) => {
  if (!leadGoal?.summary) return "";
  const firstSentence = `${leadGoal.summary} leads now because ${buildLeadPriorityBasis({ leadGoal, goalFeasibility })}.`;
  const clauses = [];
  const maintainedSummary = formatGoalSummaryList(maintainedGoals);
  const supportSummary = formatGoalSummaryList(supportGoals);
  const deferredSummary = formatGoalSummaryList(deferredGoals);
  if (maintainedSummary) clauses.push(`${maintainedSummary} ${maintainedGoals.length === 1 ? "stays" : "stay"} maintained`);
  if (supportSummary) clauses.push(`${supportSummary} ${supportGoals.length === 1 ? "stays" : "stay"} in the background`);
  if (deferredSummary) clauses.push(`${deferredSummary} ${deferredGoals.length === 1 ? "is" : "are"} deferred until a later block`);
  if (clauses.length > 0) {
    return `${firstSentence} ${sentenceCase(clauses.join(", "))} so the plan does not try to push every lane at once.`;
  }
  if (primaryTradeoff) {
    return `${firstSentence} ${sentenceCase(primaryTradeoff).replace(/[.]+$/g, "")}.`;
  }
  return firstSentence;
};

const buildGoalReviewContract = ({
  leadGoal = null,
  maintainedGoals = [],
  supportGoals = [],
  deferredGoals = [],
  goalFeasibility = null,
  primaryTradeoff = "",
} = {}) => {
  const laneSections = [
    {
      lane_key: GOAL_REVIEW_LANE_KEYS.leadGoal,
      title: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.leadGoal].title,
      empty_state: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.leadGoal].emptyState,
      goals: leadGoal ? [leadGoal] : [],
    },
    {
      lane_key: GOAL_REVIEW_LANE_KEYS.maintainedGoals,
      title: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.maintainedGoals].title,
      empty_state: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.maintainedGoals].emptyState,
      goals: maintainedGoals,
    },
    {
      lane_key: GOAL_REVIEW_LANE_KEYS.supportGoals,
      title: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.supportGoals].title,
      empty_state: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.supportGoals].emptyState,
      goals: supportGoals,
    },
    {
      lane_key: GOAL_REVIEW_LANE_KEYS.deferredGoals,
      title: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.deferredGoals].title,
      empty_state: GOAL_REVIEW_LANE_META[GOAL_REVIEW_LANE_KEYS.deferredGoals].emptyState,
      goals: deferredGoals,
    },
  ];
  return {
    lead_goal: leadGoal,
    maintained_goals: maintainedGoals,
    support_goals: supportGoals,
    deferred_goals: deferredGoals,
    tradeoff_statement: buildReviewTradeoffStatement({
      leadGoal,
      maintainedGoals,
      supportGoals,
      deferredGoals,
      goalFeasibility,
      primaryTradeoff,
    }),
    lane_sections: laneSections,
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
  const removedGoalIds = dedupeStrings([
    ...toArray(goalStackConfirmation?.removedGoalIds || []),
    ...Object.entries(requestedRolesByGoalId)
      .filter(([, role]) => role === GOAL_STACK_ROLES.deferred)
      .map(([goalId]) => goalId),
  ]).filter((id) => availableIds.has(id));
  const activeGoals = orderedGoals.filter((goal) => !removedGoalIds.includes(goal.id));
  const rolePrimaryId = orderedGoals.find((goal) => requestedRolesByGoalId[goal?.id] === GOAL_STACK_ROLES.primary)?.id;
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
    removedGoalIds,
    rolesByGoalId,
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
  const orderedGoals = sortGoalsByPriority(resolvedGoals);
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
  const confirmation = buildIntakeGoalStackConfirmation({
    resolvedGoals,
    goalStackConfirmation,
    goalFeasibility,
  });
  const orderedGoals = sortGoalsByPriority(resolvedGoals);
  const roleForGoal = (goal = {}, index = 0) => {
    if (!goal?.id) return index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained;
    return confirmation.rolesByGoalId?.[goal.id]
      || sanitizeText(goal?.goalArbitrationRole || "", 40).toLowerCase()
      || (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained);
  };
  const requestedPrimaryId = sanitizeText(confirmation.primaryGoalId || "", 120);
  const defaultPrimaryId = sanitizeText(
    requestedPrimaryId
      || orderedGoals.find((goal, index) => roleForGoal(goal, index) === GOAL_STACK_ROLES.primary)?.id
      || orderedGoals.find((goal, index) => roleForGoal(goal, index) !== GOAL_STACK_ROLES.deferred)?.id
      || orderedGoals[0]?.id
      || "",
    120
  );
  const classifiedGoals = orderedGoals.map((goal, index) => {
    const requestedRole = roleForGoal(goal, index);
    const normalizedRole = goal?.id === defaultPrimaryId
      ? GOAL_STACK_ROLES.primary
      : requestedRole === GOAL_STACK_ROLES.primary
      ? GOAL_STACK_ROLES.maintained
      : requestedRole;
    return {
      goal,
      role: normalizedRole,
    };
  });
  const seenGoalIds = new Set();
  const seenFingerprints = new Set();
  const dedupedGoals = [];
  const pushUniqueGoal = (entry = null) => {
    if (!entry?.goal) return;
    const goalId = sanitizeText(entry.goal?.id || "", 120);
    const fingerprint = buildGoalStackFingerprint(entry.goal);
    if ((goalId && seenGoalIds.has(goalId)) || (fingerprint && seenFingerprints.has(fingerprint))) return;
    if (goalId) seenGoalIds.add(goalId);
    if (fingerprint) seenFingerprints.add(fingerprint);
    dedupedGoals.push(entry);
  };
  pushUniqueGoal(classifiedGoals.find((entry) => entry?.goal?.id === defaultPrimaryId) || null);
  classifiedGoals
    .filter((entry) => entry?.goal?.id !== defaultPrimaryId && entry?.role === GOAL_STACK_ROLES.maintained)
    .forEach(pushUniqueGoal);
  classifiedGoals
    .filter((entry) => entry?.role === GOAL_STACK_ROLES.background)
    .forEach(pushUniqueGoal);
  classifiedGoals
    .filter((entry) => entry?.role === GOAL_STACK_ROLES.deferred)
    .forEach(pushUniqueGoal);
  if (!dedupedGoals.length && classifiedGoals[0]) {
    pushUniqueGoal({
      goal: classifiedGoals[0].goal,
      role: GOAL_STACK_ROLES.primary,
    });
  }
  const confirmedGoals = dedupedGoals.filter((entry) => (
    entry.role === GOAL_STACK_ROLES.primary || entry.role === GOAL_STACK_ROLES.maintained
  ));
  const backgroundGoals = dedupedGoals.filter((entry) => entry.role === GOAL_STACK_ROLES.background);
  const deferredGoals = dedupedGoals.filter((entry) => entry.role === GOAL_STACK_ROLES.deferred);
  const primaryTradeoff = dedupeStrings([
    ...confirmedGoals.flatMap((entry) => entry?.goal?.tradeoffs || []),
    ...(goalResolution?.tradeoffs || []),
  ])[0] || "";
  const backgroundPriority = isResiliencePriorityRelevant({ resolvedGoals: orderedGoals, goalFeasibility })
    ? {
        enabled: confirmation.keepResiliencePriority !== false,
        label: "Recovery stays protected",
        summary: confirmedGoals.length >= 2
          ? "We’ll still protect recovery so you can push the main goal without the week falling apart."
          : "We’ll keep recovery in a good place while the lead goal gets most of the attention.",
        trackingLabels: ["Session completion", "Readiness", "Recovery drift"],
      }
    : null;
  const leadGoal = confirmedGoals.find((entry) => entry.role === GOAL_STACK_ROLES.primary)?.goal || null;
  const leadGoalReview = leadGoal ? buildGoalReviewEntry({ goal: leadGoal, role: GOAL_STACK_ROLES.primary }) : null;
  const maintainedGoalReviews = confirmedGoals
    .filter((entry) => entry.role === GOAL_STACK_ROLES.maintained)
    .map((entry) => buildGoalReviewEntry({ goal: entry.goal, role: GOAL_STACK_ROLES.maintained }));
  const supportGoalReviews = backgroundGoals
    .map((entry) => buildGoalReviewEntry({ goal: entry.goal, role: GOAL_STACK_ROLES.background }));
  const deferredGoalReviews = deferredGoals
    .map((entry) => buildGoalReviewEntry({ goal: entry.goal, role: GOAL_STACK_ROLES.deferred }));
  const reviewContract = buildGoalReviewContract({
    leadGoal: leadGoalReview,
    maintainedGoals: maintainedGoalReviews,
    supportGoals: supportGoalReviews,
    deferredGoals: deferredGoalReviews,
    goalFeasibility,
    primaryTradeoff,
  });

  return {
    confirmation,
    primaryGoalId: defaultPrimaryId,
    activeGoalIds: confirmedGoals.map((entry) => entry?.goal?.id).filter(Boolean),
    backgroundGoalIds: backgroundGoals.map((entry) => entry?.goal?.id).filter(Boolean),
    deferredGoalIds: deferredGoals.map((entry) => entry?.goal?.id).filter(Boolean),
    activeGoals: [leadGoalReview, ...maintainedGoalReviews].filter(Boolean),
    leadGoal: leadGoalReview,
    maintainedGoals: maintainedGoalReviews,
    supportGoals: supportGoalReviews,
    backgroundGoals: supportGoalReviews,
    deferredGoals: deferredGoalReviews,
    removedGoals: deferredGoalReviews,
    primaryTradeoff,
    tradeoffStatement: reviewContract.tradeoff_statement,
    backgroundPriority,
    reviewContract,
  };
};

export const buildIntakeSecondaryGoalPrompt = ({
  reviewModel = null,
  answers = {},
} = {}) => {
  if (answers?.secondary_goal_prompt_answered) return null;
  if (!reviewModel?.completeness?.isComplete) return null;
  const primaryGoal = toArray(reviewModel?.orderedResolvedGoals)[0] || null;
  if (!primaryGoal) return null;
  const inferredGoals = toArray(reviewModel?.goalStackReview?.activeGoals)
    .slice(1)
    .map((goal) => sanitizeText(goal?.summary || "", 160))
    .filter(Boolean);
  return {
    prompt: "Anything else you want to improve or maintain while chasing this?",
    helperText: inferredGoals.length
      ? `Optional. I already picked up ${inferredGoals.join(" and ")} from what you said. Add anything else one at a time in your own words, or skip this if the current stack is enough.`
      : "Optional. Add extra goals one at a time in your own words, or skip this if the primary goal stands on its own.",
    placeholder: "Example: get a six pack, bench 225, or keep upper body",
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
  const nextGoalText = normalizeAdditionalGoalText(customText || response?.value || "");
  const existingGoals = readAdditionalGoalEntries({ answers });

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.primaryOnly) {
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
  const resolvedGoalById = new Map(
    candidateResolvedGoals
      .filter((goal) => goal?.id)
      .map((goal) => [goal.id, goal])
  );
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
  const resolvedGoals = activeResolvedGoals.length ? activeResolvedGoals : candidateResolvedGoals;
  const primaryGoal = resolvedGoalById.get(goalStackReview?.primaryGoalId || "") || activeResolvedGoals[0] || candidateResolvedGoals[0] || null;
  const completeness = deriveIntakeCompletenessState({
    resolvedGoals: activeResolvedGoals.length ? activeResolvedGoals : resolvedGoals,
    answers,
  });
  const gateReasonLines = sanitizeText(goalFeasibility?.primary_reason_code || "", 80).toLowerCase() === "missing_required_context"
    ? []
    : toArray(goalFeasibility?.reasons).map((item) => sanitizeText(item?.summary || item, 220)).filter(Boolean).slice(0, 2);
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
    ...completeness.missingRequired.map((item) => item.label),
    ...gateReasonLines,
    ...(goalFeasibility?.suggested_revision?.summary ? [goalFeasibility.suggested_revision.summary] : []),
    ...(goalResolution?.unresolvedGaps || []),
    ...resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []),
  ]).slice(0, 5);
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
  const clarifyingQuestions = nextQuestions.map((item) => item.prompt);
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

  return {
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
    orderedResolvedGoals: candidateResolvedGoals,
    activeResolvedGoals,
    goalStackReview,
    reviewContract: goalStackReview?.reviewContract || null,
    tradeoffStatement: sanitizeText(goalStackReview?.tradeoffStatement || goalStackReview?.reviewContract?.tradeoff_statement || "", 320),
    isPlannerReady: Boolean(primaryGoal) && (gateStatus === "ready" || gateStatus === "warn"),
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
      reason: "Pick the goal that should lead right now.",
      next_required_field: null,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (missingRequired.length > 0) {
    const incompleteReason = sanitizeText(missingRequired[0]?.label || "", 140);
    return {
      status: INTAKE_CONFIRMATION_STATUSES.incomplete,
      reason: incompleteReason ? `I still need ${incompleteReason.toLowerCase()}.` : "I still need one more detail before I build this.",
      next_required_field: nextRequiredFieldId,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (arbitrationBlockingIssues.length > 0) {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.block,
      reason: buildShortConfirmationReason(arbitrationBlockingIssues) || "I need to clean up the goal order before I build this.",
      next_required_field: nextRequiredFieldId,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (confirmationAction === "block") {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.block,
      reason: buildShortConfirmationReason([
        gateReasons[0],
        gateExplanationText,
        recommendedRevisionSummary,
      ]) || "This goal needs a safer first step before I build it.",
      next_required_field: nextRequiredFieldId,
      canConfirm: false,
      requiresAcknowledgement: false,
    };
  }

  if (confirmationAction === "warn") {
    return {
      status: INTAKE_CONFIRMATION_STATUSES.warn,
      reason: buildShortConfirmationReason([
        warningReasons[0],
        gateReasons[0],
        gateExplanationText,
        tradeoffSummary,
        reviewModel?.gateLabel,
      ]) || "This is aggressive for the timeline you picked.",
      next_required_field: null,
      canConfirm: true,
      requiresAcknowledgement: true,
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
  const cleanStatus = sanitizeText(statusText || "", 320);
  if (prompt) messages.push(`One quick thing before I lock this in: ${prompt}`);
  if (cleanStatus) messages.push(cleanStatus);
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
