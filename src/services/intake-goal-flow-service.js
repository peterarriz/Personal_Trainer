import { GOAL_MEASURABILITY_TIERS, resolveGoalTranslation } from "./goal-resolution-service.js";
import { buildGoalArbitrationStack } from "./goal-arbitration-service.js";
import {
  applyIntakeCompletenessAnswer as applyStructuredIntakeCompletenessAnswer,
  buildIntakeCompletenessContext,
  deriveIntakeCompletenessState,
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
  aggressive: "Aggressive",
  exploratory: "Exploratory",
  unrealistic: "Needs a smaller first block",
};

const FEASIBILITY_ACTION_LABELS = {
  proceed: "Looks buildable",
  warn: "Possible, but tight",
  block: "Needs a more realistic first target",
};

const REVIEW_GATE_LABELS = {
  incomplete: "Still need one more anchor",
  blocked: "Needs a more realistic first target",
  warn: "Possible, but tight",
  ready: "Looks buildable",
};

const ROLE_LABELS = {
  [GOAL_STACK_ROLES.primary]: "Primary",
  [GOAL_STACK_ROLES.maintained]: "Maintained",
  [GOAL_STACK_ROLES.background]: "Background support",
  [GOAL_STACK_ROLES.deferred]: "Later",
};

const SECONDARY_GOAL_COMMON_OPTIONS_BY_CATEGORY = {
  running: [
    { key: "keep_strength", label: "Keep strength", value: "keep strength" },
    { key: "keep_upper_body", label: "Keep upper body", value: "keep upper body" },
    { key: "avoid_getting_slower", label: "Avoid slowing down", value: "avoid getting slower" },
  ],
  strength: [
    { key: "maintain_conditioning", label: "Maintain conditioning", value: "maintain conditioning" },
    { key: "avoid_getting_slower", label: "Avoid slowing down", value: "avoid getting slower" },
    { key: "keep_upper_body", label: "Keep upper body", value: "keep upper body" },
  ],
  body_comp: [
    { key: "keep_strength", label: "Keep strength", value: "keep strength" },
    { key: "maintain_conditioning", label: "Maintain conditioning", value: "maintain conditioning" },
    { key: "avoid_getting_slower", label: "Avoid slowing down", value: "avoid getting slower" },
  ],
  general_fitness: [
    { key: "keep_strength", label: "Keep strength", value: "keep strength" },
    { key: "maintain_conditioning", label: "Maintain conditioning", value: "maintain conditioning" },
    { key: "avoid_getting_slower", label: "Avoid slowing down", value: "avoid getting slower" },
  ],
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
  const fallbackPrimaryId = sanitizeText(activeGoals[0]?.id || orderedGoals[0]?.id || "", 120);
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
  const confirmedGoals = orderedGoals.filter((goal, index) => {
    const role = roleForGoal(goal, index);
    return role === GOAL_STACK_ROLES.primary || role === GOAL_STACK_ROLES.maintained;
  });
  const backgroundGoals = orderedGoals.filter((goal, index) => roleForGoal(goal, index) === GOAL_STACK_ROLES.background);
  const deferredGoals = orderedGoals.filter((goal, index) => roleForGoal(goal, index) === GOAL_STACK_ROLES.deferred);
  const primaryTradeoff = dedupeStrings([
    ...confirmedGoals.flatMap((goal) => goal?.tradeoffs || []),
    ...(goalResolution?.tradeoffs || []),
  ])[0] || "";
  const backgroundPriority = isResiliencePriorityRelevant({ resolvedGoals: orderedGoals, goalFeasibility })
    ? {
        enabled: confirmation.keepResiliencePriority !== false,
        label: "Resilience",
        summary: confirmedGoals.length >= 2
          ? "Recovery and durability stay protected so the stack can progress without breaking the week."
          : "Durability stays protected in the background while the lead goal takes the planning focus.",
        trackingLabels: ["Session completion", "Readiness", "Recovery drift"],
      }
    : null;

  return {
    confirmation,
    activeGoals: confirmedGoals.map((goal, index) => ({
      id: goal.id,
      summary: sanitizeText(goal?.summary || "", 160),
      role: index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained,
      roleLabel: ROLE_LABELS[index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained] || "Goal",
      measurabilityLabel: MEASURABILITY_LABELS[goal?.measurabilityTier] || "Planner goal",
      trackingLabels: buildPerGoalTrackingLabels(goal),
      tradeoff: sanitizeText(goal?.tradeoffs?.[0] || "", 180),
      reason: sanitizeText(goal?.goalArbitrationReason || "", 220),
    })),
    backgroundGoals: backgroundGoals.map((goal) => ({
      id: goal.id,
      summary: sanitizeText(goal?.summary || "", 160),
      role: GOAL_STACK_ROLES.background,
      roleLabel: ROLE_LABELS[GOAL_STACK_ROLES.background] || "Background support",
      trackingLabels: buildPerGoalTrackingLabels(goal),
      reason: sanitizeText(goal?.goalArbitrationReason || "", 220),
    })),
    deferredGoals: deferredGoals.map((goal) => ({
      id: goal.id,
      summary: sanitizeText(goal?.summary || "", 160),
      role: GOAL_STACK_ROLES.deferred,
      roleLabel: ROLE_LABELS[GOAL_STACK_ROLES.deferred] || "Later",
      trackingLabels: buildPerGoalTrackingLabels(goal),
      reason: sanitizeText(goal?.goalArbitrationReason || "", 220),
    })),
    removedGoals: deferredGoals.map((goal) => ({
      id: goal.id,
      summary: sanitizeText(goal?.summary || "", 160),
      role: GOAL_STACK_ROLES.deferred,
      roleLabel: ROLE_LABELS[GOAL_STACK_ROLES.deferred] || "Later",
      trackingLabels: buildPerGoalTrackingLabels(goal),
      reason: sanitizeText(goal?.goalArbitrationReason || "", 220),
    })),
    primaryTradeoff,
    backgroundPriority,
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
      ? `Optional. I already picked up ${inferredGoals.join(" and ")} from what you said. Add anything else one at a time, or skip this if the current stack is enough.`
      : "Optional. Add extra goals one at a time, or skip this if the primary goal stands on its own.",
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
      answers: writeAdditionalGoalEntries({
        answers: {
          ...answers,
          secondary_goal_prompt_answered: true,
        },
        entries: [],
      }),
      goalStackConfirmation,
      rerunAssessment: false,
      keepCollecting: false,
    };
  }

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.addGoal || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.custom) {
    const updatedEntries = dedupeStrings([...existingGoals, nextGoalText]);
    return {
      answers: writeAdditionalGoalEntries({
        answers: {
          ...answers,
          secondary_goal_prompt_answered: false,
        },
        entries: updatedEntries,
      }),
      goalStackConfirmation,
      rerunAssessment: false,
      keepCollecting: true,
    };
  }

  if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.done || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.keepInferred) {
    return {
      answers: writeAdditionalGoalEntries({
        answers: {
          ...answers,
          secondary_goal_prompt_answered: true,
        },
        entries: existingGoals,
      }),
      goalStackConfirmation: null,
      rerunAssessment: existingGoals.length > 0,
      keepCollecting: false,
    };
  }

  return {
    answers: writeAdditionalGoalEntries({
      answers: {
        ...answers,
        secondary_goal_prompt_answered: true,
      },
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
  aiInterpretationProposal = null,
  answers = {},
  goalStackConfirmation = null,
} = {}) => {
  const candidateResolvedGoals = Array.isArray(orderedResolvedGoals) && orderedResolvedGoals.length
    ? orderedResolvedGoals
    : (Array.isArray(goalResolution?.resolvedGoals) ? goalResolution.resolvedGoals : []);
  const activeResolvedGoals = goalStackConfirmation
    ? applyIntakeGoalStackConfirmation({
        resolvedGoals: candidateResolvedGoals,
        goalStackConfirmation,
        goalFeasibility,
      })
    : candidateResolvedGoals.filter((goal, index) => {
        const role = sanitizeText(goal?.goalArbitrationRole || (index === 0 ? GOAL_STACK_ROLES.primary : GOAL_STACK_ROLES.maintained), 40).toLowerCase();
        return role === GOAL_STACK_ROLES.primary || role === GOAL_STACK_ROLES.maintained;
      });
  const resolvedGoals = activeResolvedGoals.length ? activeResolvedGoals : candidateResolvedGoals;
  const primaryGoal = activeResolvedGoals[0] || candidateResolvedGoals[0] || null;
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
    ...completeness.missingRequired.map((item) => item.label),
    ...toArray(goalFeasibility?.blockingReasons),
    ...(goalFeasibility?.recommendedRevision?.summary ? [goalFeasibility.recommendedRevision.summary] : []),
    ...(goalFeasibility?.tradeoffSummary ? [goalFeasibility.tradeoffSummary] : []),
    ...toArray(goalFeasibility?.warningReasons).slice(0, 2),
    ...(goalResolution?.unresolvedGaps || []),
    ...resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []),
  ]).slice(0, 6);
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
  const goalStackReview = buildIntakeGoalStackReviewModel({
    resolvedGoals: candidateResolvedGoals,
    goalResolution,
    goalFeasibility,
    goalStackConfirmation,
  });
  const confirmationAction = sanitizeText(goalFeasibility?.confirmationAction || "proceed", 20).toLowerCase() || "proceed";
  const gateStatus = !completeness.isComplete
    ? "incomplete"
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
    recommendedRevisionSummary: sanitizeText(goalFeasibility?.recommendedRevision?.summary || "", 220),
    tradeoffSummary: sanitizeText(goalFeasibility?.tradeoffSummary || "", 220),
    blockingReasons: toArray(goalFeasibility?.blockingReasons).slice(0, 3),
    warningReasons: toArray(goalFeasibility?.warningReasons).slice(0, 3),
    trackingLabels,
    unresolvedItems,
    clarifyingQuestions,
    nextQuestions,
    completeness,
    orderedResolvedGoals: candidateResolvedGoals,
    activeResolvedGoals,
    goalStackReview,
    isPlannerReady: Boolean(primaryGoal) && (gateStatus === "ready" || gateStatus === "warn"),
  };
};

export const deriveIntakeConfirmationState = ({
  reviewModel = null,
  askedQuestions = [],
  maxQuestions = 2,
} = {}) => {
  const nextQuestion = getNextIntakeClarifyingQuestion({
    reviewModel,
    askedQuestions,
    maxQuestions,
  });
  const gateStatus = sanitizeText(reviewModel?.gateStatus || "", 20).toLowerCase();
  const confirmationAction = sanitizeText(reviewModel?.confirmationAction || "", 20).toLowerCase();
  const primaryGoal = toArray(reviewModel?.activeResolvedGoals)[0] || toArray(reviewModel?.orderedResolvedGoals)[0] || null;
  const unresolvedItems = toArray(reviewModel?.unresolvedItems);
  const missingRequired = toArray(reviewModel?.completeness?.missingRequired);
  const blockingReasons = toArray(reviewModel?.blockingReasons);
  const warningReasons = toArray(reviewModel?.warningReasons);
  const recommendedRevisionSummary = sanitizeText(reviewModel?.recommendedRevisionSummary || "", 220);
  const tradeoffSummary = sanitizeText(reviewModel?.tradeoffSummary || "", 220);
  const canonicalGateState = gateStatus || (
    confirmationAction === "block"
      ? "blocked"
      : confirmationAction === "warn"
      ? "warn"
      : reviewModel?.isPlannerReady
      ? "ready"
      : "incomplete"
  );

  if (!primaryGoal) {
    return {
      state: "blocked",
      statusLabel: REVIEW_GATE_LABELS.blocked,
      headline: "I still need a clear primary goal before I can build the plan.",
      canConfirm: false,
      ctaEnabled: false,
      ctaLabel: "Confirm and build my plan",
      nextQuestion: null,
      reason: "I still need a clear primary goal before I can build the plan.",
    };
  }

  if (canonicalGateState === "incomplete") {
    if (nextQuestion?.prompt) {
      return {
        state: "incomplete",
        statusLabel: REVIEW_GATE_LABELS.incomplete,
        headline: "I still need one more anchor before I can build this credibly.",
        canConfirm: false,
        ctaEnabled: false,
        ctaLabel: "Confirm and build my plan",
        nextQuestion,
        reason: `I still need one critical detail first: ${nextQuestion.prompt}`,
      };
    }
    const incompleteReason = missingRequired[0]?.label || unresolvedItems[0] || "I still need one or two critical details before I can build the plan credibly.";
    return {
      state: "incomplete",
      statusLabel: REVIEW_GATE_LABELS.incomplete,
      headline: "I still need one more anchor before I can build this credibly.",
      canConfirm: false,
      ctaEnabled: false,
      ctaLabel: "Confirm and build my plan",
      nextQuestion: null,
      reason: incompleteReason,
    };
  }

  if (canonicalGateState === "blocked") {
    const blockedReason = recommendedRevisionSummary || blockingReasons[0] || unresolvedItems[0] || "The current target needs a smaller or better-specified first block before I can build credibly.";
    return {
      state: "blocked",
      statusLabel: REVIEW_GATE_LABELS.blocked,
      headline: "This target needs a more realistic first step before I build the plan.",
      canConfirm: false,
      ctaEnabled: false,
      ctaLabel: "Confirm and build my plan",
      nextQuestion: null,
      reason: blockedReason,
    };
  }

  if (canonicalGateState === "warn") {
    const warningReason = warningReasons[0] || tradeoffSummary || reviewModel?.gateLabel || "";
    return {
      state: "warn",
      statusLabel: REVIEW_GATE_LABELS.warn,
      headline: "This is possible, but the near-term path is tight.",
      canConfirm: true,
      ctaEnabled: true,
      ctaLabel: "Build my plan with this warning",
      nextQuestion: null,
      reason: warningReason,
    };
  }

  return {
    state: "ready",
    statusLabel: REVIEW_GATE_LABELS.ready,
    headline: "This looks buildable from where you are now.",
    canConfirm: true,
    ctaEnabled: true,
    ctaLabel: "Confirm and build my plan",
    nextQuestion: null,
    reason: "",
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
