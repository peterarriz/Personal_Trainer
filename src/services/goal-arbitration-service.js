import { resolveGoalTranslation } from "./goal-resolution-service.js";

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

const GOAL_ROLES = {
  primary: "primary",
  maintained: "maintained",
  background: "background",
  deferred: "deferred",
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

const normalizeGoalCandidate = (goal = {}, index = 0, source = "base", sourceText = "") => ({
  ...goal,
  planningPriority: Number(goal?.planningPriority || index + 1) || (index + 1),
  arbitrationSource: source,
  arbitrationSourceText: sanitizeText(sourceText || goal?.rawIntent?.text || "", 220),
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
  return toArray(goals).filter((goal) => {
    const key = buildGoalCandidateKey(goal);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveAdditionalGoalCandidates = ({
  additionalGoalTexts = [],
  typedIntakePacket = null,
  now = new Date(),
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
    return toArray(resolution?.resolvedGoals).map((goal, goalIndex) => normalizeGoalCandidate(
      preserveSpecificAdditionalGoalSummary(goal, goalText),
      (textIndex * 10) + goalIndex,
      "additional",
      goalText
    ));
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

const isConditioningSupportGoal = (goal = {}) => (
  /\b(conditioning|cardio|aerobic|engine|maintain conditioning|improve conditioning|maintain cardio)\b/i.test(getGoalIntentText(goal))
  && sanitizeText(goal?.planningCategory || "", 40).toLowerCase() !== "running"
);

const hasExplicitTarget = (goal = {}) => Boolean(
  sanitizeText(goal?.primaryMetric?.targetValue || "", 40)
  || sanitizeText(goal?.targetDate || "", 24)
  || Number(goal?.targetHorizonWeeks || 0) > 0
);

const isHardOutcomeGoal = (goal = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (planningCategory === "running") return true;
  if (planningCategory === "strength") return hasExplicitTarget(goal);
  if (planningCategory === "body_comp") return hasExplicitTarget(goal) && !isAppearanceGoal(goal);
  return false;
};

const buildRoleReason = ({
  role = GOAL_ROLES.deferred,
  goal = {},
  highConflict = false,
  tradeoffSummary = "",
} = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  if (role === GOAL_ROLES.maintained) {
    if (isMaintenanceIntent(goal)) return "This stays in the week, but it will not drive the block.";
    if (planningCategory === "strength") return "Strength stays alive, but the lead goal still sets the weekly structure.";
    if (planningCategory === "running") return "Run fitness stays alive, but the lead goal still sets the weekly structure.";
    return "This stays in maintenance range while the lead goal gets the cleanest push.";
  }
  if (role === GOAL_ROLES.background) {
    if (isAppearanceGoal(goal)) return "We will keep an eye on this through check-ins, but this block will not optimize it directly.";
    if (isConditioningSupportGoal(goal)) return "This supports the block in the background, without taking over session structure.";
    return "This matters, but it sits in the background while the lead and maintained lanes get the real planning focus.";
  }
  if (role === GOAL_ROLES.deferred) {
    if (highConflict && tradeoffSummary) return tradeoffSummary;
    return "This matters, but it fits better after the current block gets a cleaner focus.";
  }
  return "";
};

const buildCandidateGroupRank = ({ goal = {}, leadGoal = null } = {}) => {
  const planningCategory = sanitizeText(goal?.planningCategory || "", 40).toLowerCase();
  const leadCategory = sanitizeText(leadGoal?.planningCategory || "", 40).toLowerCase();
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
  const canMaintain = maintainedCount === 0;
  const canBackground = backgroundCount === 0 && !highConflict;

  if (intakeBlocked && !isMaintenanceIntent(goal)) {
    return canBackground ? GOAL_ROLES.background : GOAL_ROLES.deferred;
  }
  if (isMaintenanceIntent(goal) && planningCategory && planningCategory !== leadCategory) {
    return canMaintain ? GOAL_ROLES.maintained : (canBackground ? GOAL_ROLES.background : GOAL_ROLES.deferred);
  }
  if (isHardOutcomeGoal(goal) && planningCategory && planningCategory !== leadCategory) {
    return (!highConflict && canMaintain) ? GOAL_ROLES.maintained : GOAL_ROLES.deferred;
  }
  if (isConditioningSupportGoal(goal) && planningCategory && planningCategory !== leadCategory) {
    return canMaintain ? GOAL_ROLES.maintained : (canBackground ? GOAL_ROLES.background : GOAL_ROLES.deferred);
  }
  if (isAppearanceGoal(goal)) {
    return canBackground ? GOAL_ROLES.background : GOAL_ROLES.deferred;
  }
  if (planningCategory && planningCategory === leadCategory) {
    return canBackground ? GOAL_ROLES.background : GOAL_ROLES.deferred;
  }
  return canBackground ? GOAL_ROLES.background : GOAL_ROLES.deferred;
};

export const buildGoalArbitrationStack = ({
  resolvedGoals = [],
  additionalGoalTexts = [],
  goalFeasibility = null,
  intakeCompleteness = null,
  typedIntakePacket = null,
  now = new Date(),
} = {}) => {
  const baseGoals = toArray(resolvedGoals)
    .filter(Boolean)
    .map((goal, index) => normalizeGoalCandidate(goal, index, "base"));
  const additionalGoals = resolveAdditionalGoalCandidates({
    additionalGoalTexts,
    typedIntakePacket,
    now,
  });
  const candidates = dedupeGoalCandidates([...baseGoals, ...additionalGoals]);
  const leadGoal = candidates[0] || null;
  if (!leadGoal) {
    return {
      goals: [],
      primaryGoalId: "",
      rolesByGoalId: {},
      backgroundGoalIds: [],
      deferredGoalIds: [],
      removedGoalIds: [],
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

  const secondaryCandidates = candidates
    .slice(1)
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => {
      const rankDiff = buildCandidateGroupRank({ goal: a.goal, leadGoal }) - buildCandidateGroupRank({ goal: b.goal, leadGoal });
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    });

  let maintainedCount = 0;
  let backgroundCount = 0;
  const rolesByGoalId = {
    [leadGoal.id]: GOAL_ROLES.primary,
  };
  const roleReasonsByGoalId = {
    [leadGoal.id]: "",
  };

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
    roleReasonsByGoalId[goal.id] = buildRoleReason({
      role,
      goal,
      highConflict,
      tradeoffSummary,
    });
    if (role === GOAL_ROLES.maintained) maintainedCount += 1;
    if (role === GOAL_ROLES.background) backgroundCount += 1;
  });

  const orderedGoals = candidates
    .map((goal) => ({
      ...goal,
      goalArbitrationRole: rolesByGoalId[goal.id] || GOAL_ROLES.deferred,
      goalArbitrationReason: roleReasonsByGoalId[goal.id] || "",
    }))
    .sort((a, b) => {
      const roleOrder = {
        [GOAL_ROLES.primary]: 1,
        [GOAL_ROLES.maintained]: 2,
        [GOAL_ROLES.background]: 3,
        [GOAL_ROLES.deferred]: 4,
      };
      const diff = (roleOrder[a.goalArbitrationRole] || 99) - (roleOrder[b.goalArbitrationRole] || 99);
      if (diff !== 0) return diff;
      return Number(a?.planningPriority || 99) - Number(b?.planningPriority || 99);
    })
    .map((goal, index) => ({
      ...goal,
      planningPriority: index + 1,
    }));

  const backgroundGoalIds = orderedGoals.filter((goal) => goal.goalArbitrationRole === GOAL_ROLES.background).map((goal) => goal.id);
  const deferredGoalIds = orderedGoals.filter((goal) => goal.goalArbitrationRole === GOAL_ROLES.deferred).map((goal) => goal.id);

  return {
    goals: orderedGoals,
    primaryGoalId: leadGoal.id,
    rolesByGoalId,
    backgroundGoalIds,
    deferredGoalIds,
    removedGoalIds: [...deferredGoalIds],
  };
};
