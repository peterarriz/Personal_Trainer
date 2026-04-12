import { GOAL_MEASURABILITY_TIERS, resolveGoalTranslation } from "./goal-resolution-service.js";

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

const dedupeObjectsByKey = (items = [], keyBuilder = (item) => item?.key || item?.summary || "") => {
  const seen = new Set();
  return toArray(items).filter((item) => {
    const key = sanitizeText(keyBuilder(item), 220).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const GOAL_ROLES = {
  primary: "primary",
  maintained: "maintained",
  background: "background",
  deferred: "deferred",
};

export const GOAL_ARBITRATION_LIMITS = {
  lead: 1,
  maintained: 1,
  support: 1,
};

const ROLE_ORDER = {
  [GOAL_ROLES.primary]: 1,
  [GOAL_ROLES.maintained]: 2,
  [GOAL_ROLES.background]: 3,
  [GOAL_ROLES.deferred]: 4,
};

const buildMinimalIntakePacket = ({ rawGoalText = "", typedIntakePacket = null } = {}) => {
  const intake = typedIntakePacket?.intake || typedIntakePacket?.intakeContext || {};
  const baselineContext = intake?.baselineContext || {};
  const scheduleReality = intake?.scheduleReality || {};
  const equipmentAccessContext = intake?.equipmentAccessContext || {};
  const injuryConstraintContext = intake?.injuryConstraintContext || {};
  const userProvidedConstraints = intake?.userProvidedConstraints || {};

  return {
    version: sanitizeText(typedIntakePacket?.version || "2026-04-v1", 40) || "2026-04-v1",
    intent: "intake_interpretation",
    intake: {
      rawGoalText,
      baselineContext: {
        primaryGoalLabel: sanitizeText(baselineContext?.primaryGoalLabel || "General Fitness", 80) || "General Fitness",
        currentBaseline: sanitizeText(baselineContext?.currentBaseline || "", 180),
      },
      scheduleReality: {
        trainingDaysPerWeek: Number.isFinite(Number(scheduleReality?.trainingDaysPerWeek)) ? Number(scheduleReality.trainingDaysPerWeek) : null,
        sessionLength: sanitizeText(scheduleReality?.sessionLength || "", 40),
        trainingLocation: sanitizeText(scheduleReality?.trainingLocation || "Unknown", 80) || "Unknown",
      },
      equipmentAccessContext: {
        trainingLocation: sanitizeText(
          equipmentAccessContext?.trainingLocation || scheduleReality?.trainingLocation || "Unknown",
          80
        ) || "Unknown",
        equipment: toArray(equipmentAccessContext?.equipment).map((item) => sanitizeText(item, 80)).filter(Boolean).slice(0, 8),
      },
      injuryConstraintContext: {
        injuryText: sanitizeText(injuryConstraintContext?.injuryText || "", 180),
        constraints: toArray(injuryConstraintContext?.constraints).map((item) => sanitizeText(item, 120)).filter(Boolean).slice(0, 4),
      },
      userProvidedConstraints: {
        timingConstraints: [],
        appearanceConstraints: [],
        additionalContext: sanitizeText(userProvidedConstraints?.additionalContext || "", 180),
      },
    },
  };
};

const normalizeValidationIssues = (issues = []) => dedupeObjectsByKey(
  toArray(issues)
    .filter((issue) => issue && typeof issue === "object")
    .map((issue) => ({
      key: sanitizeText(issue?.key || "", 80).toLowerCase(),
      severity: sanitizeText(issue?.severity || "block", 20).toLowerCase() || "block",
      summary: sanitizeText(issue?.summary || "", 220),
      prompt: sanitizeText(issue?.prompt || "", 220),
    }))
    .filter((issue) => issue.summary),
  (issue) => `${issue.key}:${issue.summary}`
);

const normalizeGoalCandidate = ({
  goal = {},
  index = 0,
  source = "resolved",
  sourceText = "",
  explicitPrimaryId = "",
  feasibilityPriorityMap = new Map(),
} = {}) => ({
  ...goal,
  planningPriority: Number(goal?.planningPriority || index + 1) || (index + 1),
  arbitrationSource: source,
  arbitrationSourceText: sanitizeText(sourceText || goal?.rawIntent?.text || "", 220),
  arbitrationConfirmedPrimary: Boolean(
    (explicitPrimaryId && goal?.id === explicitPrimaryId)
    || source === "confirmed_primary"
  ),
  feasibilityPriority: feasibilityPriorityMap.get(goal?.id || "") || null,
  validationIssues: normalizeValidationIssues(goal?.validationIssues || []),
});

const preserveSpecificAdditionalGoalSummary = (goal = {}, sourceText = "") => {
  const cleanSourceText = sanitizeText(sourceText, 160);
  const cleanSummary = sanitizeText(goal?.summary || "", 160);
  const goalFamily = sanitizeText(goal?.goalFamily || "", 40).toLowerCase();
  const genericSummary = cleanSummary.toLowerCase();
  if (!cleanSourceText) return goal;
  if (
    goalFamily === "general_fitness"
    && (
      genericSummary === "rebuild general fitness and consistency"
      || genericSummary === "resolved goal"
    )
  ) {
    return {
      ...goal,
      summary: cleanSourceText,
    };
  }
  return goal;
};

const buildGoalCandidateKey = (goal = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const goalFamily = sanitizeText(goal?.goalFamily || "", 40).toLowerCase();
  const metricKey = sanitizeText(goal?.primaryMetric?.key || "", 80).toLowerCase();
  const metricValue = sanitizeText(goal?.primaryMetric?.targetValue || "", 40).toLowerCase();
  const summary = sanitizeText(goal?.summary || "", 180)
    .toLowerCase()
    .replace(/\bwhile the primary goal leads\b/g, "")
    .replace(/\bwith repeatable training\b/g, "")
    .trim();
  const sourceText = sanitizeText(goal?.arbitrationSourceText || goal?.rawIntent?.text || "", 180).toLowerCase();
  return `${planningCategory}:${goalFamily}:${metricKey}:${metricValue}:${summary || sourceText}`;
};

const dedupeGoalCandidates = (goals = []) => {
  const seen = new Set();
  const seenIds = new Set();
  return toArray(goals).filter((goal) => {
    const goalId = sanitizeText(goal?.id || "", 120);
    if (goalId && seenIds.has(goalId)) return false;
    const key = buildGoalCandidateKey(goal);
    if (!key || seen.has(key)) return false;
    if (goalId) seenIds.add(goalId);
    seen.add(key);
    return true;
  });
};

const resolveAdditionalGoalCandidates = ({
  additionalGoalTexts = [],
  typedIntakePacket = null,
  now = new Date(),
  feasibilityPriorityMap = new Map(),
} = {}) => (
  dedupeStrings(additionalGoalTexts).flatMap((goalText, textIndex) => {
    const packet = buildMinimalIntakePacket({
      rawGoalText: goalText,
      typedIntakePacket,
    });
    const resolution = resolveGoalTranslation({
      rawUserGoalIntent: goalText,
      typedIntakePacket: packet,
      explicitUserConfirmation: {
        confirmed: true,
        acceptedProposal: true,
        source: "goal_arbitration",
      },
      now,
    });
    return toArray(resolution?.resolvedGoals).map((goal, goalIndex) => normalizeGoalCandidate({
      goal: preserveSpecificAdditionalGoalSummary(goal, goalText),
      index: (textIndex * 10) + goalIndex,
      source: "additional_text",
      sourceText: goalText,
      feasibilityPriorityMap,
    }));
  })
);

const parseSessionLengthMinutes = (value = "") => {
  const clean = sanitizeText(value, 40).toLowerCase();
  if (!clean) return null;
  const plusMatch = clean.match(/(\d{2,3})\s*\+/);
  if (plusMatch?.[1]) return Number(plusMatch[1]);
  const rangeMatch = clean.match(/(\d{2,3})\s*-\s*(\d{2,3})/);
  if (rangeMatch?.[1] && rangeMatch?.[2]) return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  const numericMatch = clean.match(/(\d{2,3})/);
  return numericMatch?.[1] ? Number(numericMatch[1]) : null;
};

const getGoalTextCorpus = (goal = {}) => dedupeStrings([
  goal?.summary,
  goal?.rawIntent?.text,
  goal?.arbitrationSourceText,
]).join(". ").toLowerCase();

const getGoalIntentText = (goal = {}) => dedupeStrings([
  goal?.rawIntent?.text,
  goal?.arbitrationSourceText,
]).join(". ").toLowerCase();

const isMaintenanceIntent = (goal = {}) => (
  /\b(keep|maintain|hold|protect|avoid slowing down|avoid getting slower|without losing|without giving up)\b/i.test(getGoalTextCorpus(goal))
);

const isAppearanceGoal = (goal = {}) => (
  sanitizeText(goal?.goalFamily || "", 40).toLowerCase() === "appearance"
  || /\b(abs|six pack|look athletic|physique|defined|leaner|toned|bigger shoulders|shoulders|upper body size)\b/i.test(getGoalTextCorpus(goal))
);

const isAthleticPowerGoal = (goal = {}) => (
  sanitizeText(goal?.goalFamily || "", 40).toLowerCase() === "athletic_power"
  || /\b(dunk|vertical|jump higher|jumping higher|explosive)\b/i.test(getGoalTextCorpus(goal))
);

const isConditioningSupportGoal = (goal = {}) => (
  /\b(conditioning|cardio|aerobic|engine|maintain conditioning|improve conditioning|maintain cardio)\b/i.test(getGoalIntentText(goal))
  && sanitizeText(goal?.planningCategory || "", 40).toLowerCase() !== "running"
);

const hasExplicitTarget = (goal = {}) => Boolean(
  sanitizeText(goal?.primaryMetric?.targetValue || "", 40)
  || sanitizeText(goal?.targetDate || "", 24)
  || Number(goal?.targetHorizonWeeks || 0) > 0
);

const hasBlockingClarification = (goal = {}) => normalizeValidationIssues(goal?.validationIssues || [])
  .some((issue) => issue.severity === "block");

const isHardOutcomeGoal = (goal = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (planningCategory === "running") return true;
  if (planningCategory === "strength" && isAthleticPowerGoal(goal)) return true;
  if (planningCategory === "strength") return hasExplicitTarget(goal);
  if (planningCategory === "body_comp") return hasExplicitTarget(goal) && !isAppearanceGoal(goal);
  return false;
};

const buildLeadPriorityScore = (goal = {}) => {
  let score = 0;
  if (goal?.arbitrationConfirmedPrimary) score += 1000;
  if (Number.isFinite(goal?.feasibilityPriority)) score += Math.max(0, 260 - (Number(goal.feasibilityPriority) * 40));
  score += Math.max(0, 140 - (Number(goal?.planningPriority || 99) * 12));
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable) score += 35;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.proxyMeasurable) score += 18;
  if (goal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy) score -= 8;
  if (hasExplicitTarget(goal)) score += 15;
  if (isHardOutcomeGoal(goal)) score += 40;
  if (isMaintenanceIntent(goal)) score -= 140;
  if (isAppearanceGoal(goal)) score -= 35;
  if (isConditioningSupportGoal(goal)) score -= 20;
  if (hasBlockingClarification(goal)) score -= 80;
  return score;
};

const buildCandidateGroupRank = ({ goal = {}, leadGoal = null } = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const leadCategory = sanitizeText(leadGoal?.planningCategory || "", 40).toLowerCase();
  if (hasBlockingClarification(goal)) return 99;
  if (isMaintenanceIntent(goal) && planningCategory && planningCategory !== leadCategory) return 1;
  if (isHardOutcomeGoal(goal) && planningCategory && planningCategory !== leadCategory) return 2;
  if (isConditioningSupportGoal(goal) && planningCategory && planningCategory !== leadCategory) return 3;
  if (isAppearanceGoal(goal) && planningCategory && planningCategory !== leadCategory) return 4;
  if (planningCategory && planningCategory === leadCategory) return 5;
  return 6;
};

const chooseRoleForCandidate = ({
  goal = {},
  leadGoal = null,
  maintainedCount = 0,
  backgroundCount = 0,
  highConflict = false,
  intakeBlocked = false,
} = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const leadCategory = sanitizeText(leadGoal?.planningCategory || "", 40).toLowerCase();
  const canMaintain = maintainedCount < GOAL_ARBITRATION_LIMITS.maintained;
  const canSupport = backgroundCount < GOAL_ARBITRATION_LIMITS.support && !highConflict;

  if (hasBlockingClarification(goal)) return GOAL_ROLES.deferred;
  if (intakeBlocked && !isMaintenanceIntent(goal)) {
    return canSupport ? GOAL_ROLES.background : GOAL_ROLES.deferred;
  }
  if (isMaintenanceIntent(goal) && planningCategory && planningCategory !== leadCategory) {
    return canMaintain ? GOAL_ROLES.maintained : (canSupport ? GOAL_ROLES.background : GOAL_ROLES.deferred);
  }
  if (isHardOutcomeGoal(goal) && planningCategory && planningCategory !== leadCategory) {
    return (!highConflict && canMaintain) ? GOAL_ROLES.maintained : GOAL_ROLES.deferred;
  }
  if (isConditioningSupportGoal(goal) && planningCategory && planningCategory !== leadCategory) {
    return canMaintain ? GOAL_ROLES.maintained : (canSupport ? GOAL_ROLES.background : GOAL_ROLES.deferred);
  }
  if (isAppearanceGoal(goal)) {
    return canSupport ? GOAL_ROLES.background : GOAL_ROLES.deferred;
  }
  if (planningCategory && planningCategory === leadCategory) {
    return canSupport ? GOAL_ROLES.background : GOAL_ROLES.deferred;
  }
  return canSupport ? GOAL_ROLES.background : GOAL_ROLES.deferred;
};

const buildRoleDecision = ({
  goal = {},
  role = GOAL_ROLES.deferred,
  leadGoal = null,
  highConflict = false,
  intakeBlocked = false,
  tradeoffSummary = "",
} = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const leadCategory = sanitizeText(leadGoal?.planningCategory || "", 40).toLowerCase();
  const validationIssueKeys = normalizeValidationIssues(goal?.validationIssues || []).map((issue) => issue.key);

  if (role === GOAL_ROLES.primary) {
    return {
      reasonCode: goal?.arbitrationConfirmedPrimary ? "confirmed_primary" : "highest_priority_signal",
      summary: hasBlockingClarification(goal)
        ? "This stays the lead intent, but it still needs clarification before planning can lock."
        : "This sets the block direction and gets the cleanest planning focus.",
      validationIssueKeys,
    };
  }

  if (role === GOAL_ROLES.maintained) {
    if (isMaintenanceIntent(goal)) {
      return {
        reasonCode: "maintenance_intent",
        summary: "This stays alive in the week, but it does not set the block structure.",
        validationIssueKeys,
      };
    }
    if (isHardOutcomeGoal(goal)) {
      return {
        reasonCode: "kept_alive_as_secondary",
        summary: "This matters enough to keep progressing slowly while the lead goal still takes first claim on recovery.",
        validationIssueKeys,
      };
    }
    return {
      reasonCode: "secondary_lane_maintained",
      summary: "This stays in maintenance range while the lead goal gets the cleanest push.",
      validationIssueKeys,
    };
  }

  if (role === GOAL_ROLES.background) {
    if (intakeBlocked && !isMaintenanceIntent(goal)) {
      return {
        reasonCode: "background_until_primary_clarifies",
        summary: "This stays acknowledged, but it cannot claim planning priority until the primary lane is better anchored.",
        validationIssueKeys,
      };
    }
    if (isAppearanceGoal(goal)) {
      return {
        reasonCode: "appearance_support_background",
        summary: "We will watch this through check-ins, but the block will not optimize it directly.",
        validationIssueKeys,
      };
    }
    if (planningCategory && planningCategory === leadCategory) {
      return {
        reasonCode: "same_lane_not_co_primary",
        summary: "This overlaps with the lead lane, so it stays supportive instead of becoming co-primary.",
        validationIssueKeys,
      };
    }
    return {
      reasonCode: highConflict ? "support_only_due_to_conflict" : "background_support",
      summary: "This matters, but it sits in the background while the lead and maintained lanes get the real planning focus.",
      validationIssueKeys,
    };
  }

  if (hasBlockingClarification(goal)) {
    return {
      reasonCode: "clarification_required",
      summary: normalizeValidationIssues(goal?.validationIssues || [])[0]?.prompt
        || "This needs clarification before it can be placed into the active stack.",
      validationIssueKeys,
    };
  }
  if (highConflict && tradeoffSummary) {
    return {
      reasonCode: "deferred_due_to_conflict",
      summary: tradeoffSummary,
      validationIssueKeys,
    };
  }
  if (planningCategory && planningCategory === leadCategory) {
    return {
      reasonCode: "deferred_same_lane",
      summary: "This overlaps too much with the lead lane to earn its own slot in the active stack.",
      validationIssueKeys,
    };
  }
  return {
    reasonCode: "deferred_due_to_stack_cap",
    summary: "This matters, but it fits better after the current block gets a cleaner focus.",
    validationIssueKeys,
  };
};

const buildConflictSummary = ({
  orderedGoals = [],
  deferredGoals = [],
  goalFeasibility = null,
  intakeCompleteness = null,
  scheduleTight = false,
} = {}) => {
  const completenessItems = toArray(intakeCompleteness?.missingRequired || []).map((item, index) => ({
    key: `missing_required_${index}`,
    severity: "high",
    source: "completeness",
    goalIds: [],
    summary: `Need ${sanitizeText(item?.label || item, 160).toLowerCase()} before arbitration can finalize.`,
  }));
  const validationItems = orderedGoals.flatMap((goal) => normalizeValidationIssues(goal?.validationIssues || []).map((issue) => ({
    key: issue.key || `validation_${goal?.id || "goal"}`,
    severity: issue.severity === "block" ? "high" : "medium",
    source: "clarification",
    goalIds: goal?.id ? [goal.id] : [],
    summary: issue.summary,
  })));
  const feasibilityItems = toArray(goalFeasibility?.conflictFlags || []).map((flag, index) => ({
    key: sanitizeText(flag?.key || `feasibility_${index}`, 80).toLowerCase() || `feasibility_${index}`,
    severity: sanitizeText(flag?.severity || "medium", 20).toLowerCase() || "medium",
    source: "feasibility",
    goalIds: toArray(flag?.goalIds || []).map((goalId) => sanitizeText(goalId, 120)).filter(Boolean),
    summary: sanitizeText(flag?.summary || "", 220),
  })).filter((item) => item.summary);
  const capItem = deferredGoals.length
    ? [{
        key: "stack_cap",
        severity: scheduleTight || deferredGoals.length > 1 ? "medium" : "low",
        source: "stack_cap",
        goalIds: deferredGoals.map((goal) => goal?.id).filter(Boolean),
        summary: `Deferred ${deferredGoals.length} goal${deferredGoals.length === 1 ? "" : "s"} so the planner does not try to optimize too many lanes at once.`,
      }]
    : [];
  const scheduleItem = scheduleTight && orderedGoals.length >= 2
    ? [{
        key: "tight_schedule",
        severity: "medium",
        source: "schedule",
        goalIds: orderedGoals.map((goal) => goal?.id).filter(Boolean),
        summary: "The current schedule is tight enough that the stack needs a clear lead and strict caps on active lanes.",
      }]
    : [];
  const items = dedupeObjectsByKey([
    ...completenessItems,
    ...validationItems,
    ...feasibilityItems,
    ...capItem,
    ...scheduleItem,
  ], (item) => `${item.key}:${item.summary}`);
  const blocked = items.some((item) => item.severity === "high")
    || sanitizeText(goalFeasibility?.confirmationAction || "", 20).toLowerCase() === "block";
  const warned = !blocked && (
    items.length > 0
    || sanitizeText(goalFeasibility?.confirmationAction || "", 20).toLowerCase() === "warn"
  );

  return {
    status: blocked ? "blocked" : warned ? "warn" : "clear",
    hasConflicts: items.length > 0,
    items,
    blockingItems: items.filter((item) => item.severity === "high"),
    warningItems: items.filter((item) => item.severity !== "high"),
    summaryLine: items.slice(0, 2).map((item) => item.summary).join(" "),
  };
};

const buildArbitrationReasoning = ({
  orderedGoals = [],
  leadGoal = null,
  maintainedGoals = [],
  supportGoals = [],
  deferredGoals = [],
  goalFeasibility = null,
  intakeCompleteness = null,
  scheduleTight = false,
  highConflict = false,
} = {}) => ({
  activeGoalCap: { ...GOAL_ARBITRATION_LIMITS },
  leadGoalId: leadGoal?.id || "",
  maintainedGoalIds: maintainedGoals.map((goal) => goal?.id).filter(Boolean),
  supportGoalIds: supportGoals.map((goal) => goal?.id).filter(Boolean),
  deferredGoalIds: deferredGoals.map((goal) => goal?.id).filter(Boolean),
  inputs: {
    realismStatus: sanitizeText(goalFeasibility?.realismStatus || "", 40).toLowerCase(),
    feasibilityAction: sanitizeText(goalFeasibility?.confirmationAction || "", 20).toLowerCase() || "proceed",
    missingRequiredCount: toArray(intakeCompleteness?.missingRequired || []).length,
    scheduleTight,
    highConflict,
  },
  decisions: orderedGoals.map((goal) => ({
    goalId: goal?.id || "",
    role: goal?.goalArbitrationRole || GOAL_ROLES.deferred,
    reasonCode: sanitizeText(goal?.goalArbitrationReasonCode || "", 80).toLowerCase(),
    source: sanitizeText(goal?.arbitrationSource || "", 40).toLowerCase(),
    planningCategory: sanitizeText(goal?.planningCategory || "", 40).toLowerCase(),
    goalFamily: sanitizeText(goal?.goalFamily || "", 40).toLowerCase(),
    measurabilityTier: sanitizeText(goal?.measurabilityTier || "", 40).toLowerCase(),
    targetHorizonWeeks: Number.isFinite(Number(goal?.targetHorizonWeeks)) ? Number(goal.targetHorizonWeeks) : null,
    hasPrimaryMetric: Boolean(goal?.primaryMetric?.key || goal?.primaryMetric?.targetValue),
    maintenanceIntent: isMaintenanceIntent(goal),
    hardOutcome: isHardOutcomeGoal(goal),
    appearanceGoal: isAppearanceGoal(goal),
    conditioningSupportGoal: isConditioningSupportGoal(goal),
    validationIssueKeys: normalizeValidationIssues(goal?.validationIssues || []).map((issue) => issue.key),
    feasibilityPriority: Number.isFinite(goal?.feasibilityPriority) ? Number(goal.feasibilityPriority) : null,
  })),
});

const buildFinalizationState = ({
  orderedGoals = [],
  conflictSummary = null,
  intakeCompleteness = null,
} = {}) => {
  const validationIssues = orderedGoals.flatMap((goal) => normalizeValidationIssues(goal?.validationIssues || []));
  const clarificationPrompts = dedupeStrings([
    ...validationIssues.map((issue) => issue.prompt || issue.summary),
    ...toArray(intakeCompleteness?.missingRequired || []).map((item) => `Confirm ${sanitizeText(item?.label || item, 160).toLowerCase()}.`),
  ]);
  const requiresClarification = clarificationPrompts.length > 0;
  const blocked = requiresClarification || conflictSummary?.status === "blocked";
  return {
    ready: !blocked,
    blocked,
    requiresClarification,
    clarificationPrompts,
    blockingIssues: dedupeStrings([
      ...toArray(conflictSummary?.blockingItems || []).map((item) => item.summary),
      ...validationIssues.map((issue) => issue.summary),
    ]),
  };
};

export const buildGoalArbitrationStack = ({
  resolvedGoals = [],
  confirmedPrimaryGoal = null,
  confirmedAdditionalGoals = [],
  additionalGoalTexts = [],
  goalFeasibility = null,
  intakeCompleteness = null,
  typedIntakePacket = null,
  now = new Date(),
} = {}) => {
  const feasibilityPriorityMap = new Map(
    toArray(goalFeasibility?.recommendedPriorityOrdering || [])
      .map((item) => [sanitizeText(item?.goalId || "", 120), Number(item?.recommendedPriority || 0) || null])
      .filter(([goalId, priority]) => goalId && Number.isFinite(priority))
  );
  const explicitPrimaryId = sanitizeText(confirmedPrimaryGoal?.id || "", 120);
  const primaryCandidate = confirmedPrimaryGoal
    ? [normalizeGoalCandidate({
        goal: confirmedPrimaryGoal,
        index: 0,
        source: "confirmed_primary",
        sourceText: confirmedPrimaryGoal?.rawIntent?.text || confirmedPrimaryGoal?.summary || "",
        explicitPrimaryId,
        feasibilityPriorityMap,
      })]
    : [];
  const confirmedAdditionalCandidates = toArray(confirmedAdditionalGoals).map((goal, index) => normalizeGoalCandidate({
    goal,
    index,
    source: "confirmed_additional",
    sourceText: goal?.rawIntent?.text || goal?.summary || "",
    explicitPrimaryId,
    feasibilityPriorityMap,
  }));
  const resolvedCandidates = toArray(resolvedGoals)
    .filter(Boolean)
    .map((goal, index) => normalizeGoalCandidate({
      goal,
      index,
      source: "resolved",
      explicitPrimaryId,
      feasibilityPriorityMap,
    }));
  const additionalCandidates = resolveAdditionalGoalCandidates({
    additionalGoalTexts,
    typedIntakePacket,
    now,
    feasibilityPriorityMap,
  });
  const candidates = dedupeGoalCandidates([
    ...primaryCandidate,
    ...confirmedAdditionalCandidates,
    ...resolvedCandidates,
    ...additionalCandidates,
  ]);

  if (!candidates.length) {
    return {
      goals: [],
      primaryGoalId: "",
      rolesByGoalId: {},
      backgroundGoalIds: [],
      deferredGoalIds: [],
      removedGoalIds: [],
      leadGoal: null,
      maintainedGoals: [],
      supportGoals: [],
      deferredGoals: [],
      goalStack: {
        leadGoal: null,
        maintainedGoals: [],
        supportGoals: [],
        deferredGoals: [],
      },
      conflictSummary: {
        status: "clear",
        hasConflicts: false,
        items: [],
        blockingItems: [],
        warningItems: [],
        summaryLine: "",
      },
      arbitrationReasoning: {
        activeGoalCap: { ...GOAL_ARBITRATION_LIMITS },
        leadGoalId: "",
        maintainedGoalIds: [],
        supportGoalIds: [],
        deferredGoalIds: [],
        inputs: {
          realismStatus: "",
          feasibilityAction: "proceed",
          missingRequiredCount: 0,
          scheduleTight: false,
          highConflict: false,
        },
        decisions: [],
      },
      finalization: {
        ready: true,
        blocked: false,
        requiresClarification: false,
        clarificationPrompts: [],
        blockingIssues: [],
      },
    };
  }

  const scheduleReality = typedIntakePacket?.intake?.scheduleReality || typedIntakePacket?.intakeContext?.scheduleReality || {};
  const trainingDaysPerWeek = Number(scheduleReality?.trainingDaysPerWeek || 0) || 0;
  const sessionLengthMinutes = parseSessionLengthMinutes(scheduleReality?.sessionLength || "");
  const scheduleTight = (trainingDaysPerWeek > 0 && trainingDaysPerWeek <= 3)
    || (Number.isFinite(sessionLengthMinutes) && sessionLengthMinutes > 0 && sessionLengthMinutes < 35);
  const highConflict = Boolean(
    scheduleTight
    || toArray(goalFeasibility?.conflictFlags).some((flag) => sanitizeText(flag?.severity || "", 20).toLowerCase() === "high")
  );
  const intakeBlocked = Boolean(toArray(intakeCompleteness?.missingRequired).length);
  const tradeoffSummary = sanitizeText(goalFeasibility?.tradeoffSummary || "", 220);

  const leadGoal = [...candidates]
    .sort((a, b) => {
      const scoreDiff = buildLeadPriorityScore(b) - buildLeadPriorityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a?.planningPriority || 99) - Number(b?.planningPriority || 99);
    })[0] || null;

  let maintainedCount = 0;
  let backgroundCount = 0;
  const rolesByGoalId = {
    [leadGoal.id]: GOAL_ROLES.primary,
  };
  const roleDecisionByGoalId = {};
  const leadDecision = buildRoleDecision({
    goal: leadGoal,
    role: GOAL_ROLES.primary,
    leadGoal,
    highConflict,
    intakeBlocked,
    tradeoffSummary,
  });
  roleDecisionByGoalId[leadGoal.id] = leadDecision;

  const secondaryCandidates = candidates
    .filter((goal) => goal?.id !== leadGoal?.id)
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => {
      const rankDiff = buildCandidateGroupRank({ goal: a.goal, leadGoal }) - buildCandidateGroupRank({ goal: b.goal, leadGoal });
      if (rankDiff !== 0) return rankDiff;
      const scoreDiff = buildLeadPriorityScore(b.goal) - buildLeadPriorityScore(a.goal);
      if (scoreDiff !== 0) return scoreDiff;
      return a.index - b.index;
    });

  secondaryCandidates.forEach(({ goal }) => {
    const role = chooseRoleForCandidate({
      goal,
      leadGoal,
      maintainedCount,
      backgroundCount,
      highConflict,
      intakeBlocked,
    });
    rolesByGoalId[goal.id] = role;
    roleDecisionByGoalId[goal.id] = buildRoleDecision({
      goal,
      role,
      leadGoal,
      highConflict,
      intakeBlocked,
      tradeoffSummary,
    });
    if (role === GOAL_ROLES.maintained) maintainedCount += 1;
    if (role === GOAL_ROLES.background) backgroundCount += 1;
  });

  const orderedGoals = candidates
    .map((goal) => ({
      ...goal,
      goalArbitrationRole: rolesByGoalId[goal.id] || GOAL_ROLES.deferred,
      goalArbitrationReason: roleDecisionByGoalId[goal.id]?.summary || "",
      goalArbitrationReasonCode: roleDecisionByGoalId[goal.id]?.reasonCode || "",
    }))
    .sort((a, b) => {
      const roleDiff = (ROLE_ORDER[a.goalArbitrationRole] || 99) - (ROLE_ORDER[b.goalArbitrationRole] || 99);
      if (roleDiff !== 0) return roleDiff;
      const priorityDiff = Number(a?.planningPriority || 99) - Number(b?.planningPriority || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return buildLeadPriorityScore(b) - buildLeadPriorityScore(a);
    })
    .map((goal, index) => ({
      ...goal,
      planningPriority: index + 1,
    }));

  const normalizedLeadGoal = orderedGoals.find((goal) => goal.goalArbitrationRole === GOAL_ROLES.primary) || null;
  const maintainedGoals = orderedGoals.filter((goal) => goal.goalArbitrationRole === GOAL_ROLES.maintained);
  const supportGoals = orderedGoals.filter((goal) => goal.goalArbitrationRole === GOAL_ROLES.background);
  const deferredGoals = orderedGoals.filter((goal) => goal.goalArbitrationRole === GOAL_ROLES.deferred);
  const conflictSummary = buildConflictSummary({
    orderedGoals,
    deferredGoals,
    goalFeasibility,
    intakeCompleteness,
    scheduleTight,
  });
  const arbitrationReasoning = buildArbitrationReasoning({
    orderedGoals,
    leadGoal: normalizedLeadGoal,
    maintainedGoals,
    supportGoals,
    deferredGoals,
    goalFeasibility,
    intakeCompleteness,
    scheduleTight,
    highConflict,
  });
  const finalization = buildFinalizationState({
    orderedGoals,
    conflictSummary,
    intakeCompleteness,
  });
  const backgroundGoalIds = supportGoals.map((goal) => goal.id);
  const deferredGoalIds = deferredGoals.map((goal) => goal.id);

  return {
    goals: orderedGoals,
    primaryGoalId: normalizedLeadGoal?.id || "",
    rolesByGoalId,
    backgroundGoalIds,
    deferredGoalIds,
    removedGoalIds: [...deferredGoalIds],
    leadGoal: normalizedLeadGoal,
    maintainedGoals,
    supportGoals,
    deferredGoals,
    goalStack: {
      leadGoal: normalizedLeadGoal,
      maintainedGoals,
      supportGoals,
      deferredGoals,
    },
    conflictSummary,
    arbitrationReasoning,
    finalization,
  };
};
