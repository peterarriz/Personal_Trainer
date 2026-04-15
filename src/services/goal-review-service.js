import { GOAL_PROGRESS_STATUSES } from "./goal-progress-service.js";

export const GOAL_REVIEW_DUE_STATES = {
  dueNow: "due_now",
  dueSoon: "due_soon",
  notDue: "not_due",
};

export const GOAL_REVIEW_RECOMMENDATIONS = {
  keepCurrentGoal: "keep_current_goal",
  refineCurrentGoal: "refine_current_goal",
  reprioritizeGoalStack: "reprioritize_goal_stack",
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toDateKey = (value = null) => {
  const date = asDate(value);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().split("T")[0];
};

const getCadenceDays = (cadence = "weekly") => {
  const normalized = sanitizeText(cadence, 24).toLowerCase();
  if (normalized === "biweekly") return 14;
  if (normalized === "monthly") return 28;
  return 7;
};

const getDaysSince = ({ timestamp = 0, now = new Date() } = {}) => {
  const numeric = Number(timestamp || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(0, Math.floor((asDate(now).getTime() - numeric) / ONE_DAY_MS));
};

const sortByPriority = (items = []) => (
  (Array.isArray(items) ? items : []).sort((a, b) => Number(a?.planningPriority || a?.priority || 99) - Number(b?.planningPriority || b?.priority || 99))
);

const buildActiveGoals = (goals = []) => sortByPriority(
  (Array.isArray(goals) ? goals : [])
    .filter((goal) => goal?.active !== false)
    .filter((goal) => goal?.category !== "injury_prevention" && goal?.id !== "g_resilience")
    .map((goal) => ({
      id: sanitizeText(goal?.resolvedGoal?.id || goal?.id || "", 80),
      summary: sanitizeText(goal?.resolvedGoal?.summary || goal?.name || "", 160),
      category: sanitizeText(goal?.resolvedGoal?.planningCategory || goal?.category || "general_fitness", 40).toLowerCase(),
      reviewCadence: sanitizeText(goal?.resolvedGoal?.reviewCadence || goal?.reviewCadence || "weekly", 40).toLowerCase() || "weekly",
      unresolvedGaps: toArray(goal?.resolvedGoal?.unresolvedGaps || goal?.unresolvedGaps).map((item) => sanitizeText(item, 180)).filter(Boolean),
      tradeoffs: toArray(goal?.resolvedGoal?.tradeoffs || goal?.tradeoffs).map((item) => sanitizeText(item, 180)).filter(Boolean),
      confidence: sanitizeText(goal?.resolvedGoal?.confidence || goal?.confidenceLevel || "low", 20).toLowerCase() || "low",
    }))
    .filter((goal) => goal.summary)
);

const buildProgressCards = (goalProgressTracking = {}) => sortByPriority(
  (goalProgressTracking?.goalCards || []).map((card) => ({
    goalId: sanitizeText(card?.goalId || "", 80),
    summary: sanitizeText(card?.summary || "", 160),
    planningPriority: Number(card?.planningPriority || 99) || 99,
    status: sanitizeText(card?.status || "", 40).toLowerCase(),
    trackingMode: sanitizeText(card?.trackingMode || "", 40).toLowerCase(),
    reviewCadence: sanitizeText(card?.reviewCadence || "weekly", 40).toLowerCase() || "weekly",
    unresolvedGaps: toArray(card?.unresolvedGaps).map((item) => sanitizeText(item, 180)).filter(Boolean),
    tradeoffs: toArray(card?.tradeoffs).map((item) => sanitizeText(item, 180)).filter(Boolean),
    whatIsTracked: toArray(card?.whatIsTracked).map((item) => sanitizeText(item, 120)).filter(Boolean),
    nextReviewFocus: sanitizeText(card?.nextReviewFocus || "", 220),
    statusSummary: sanitizeText(card?.statusSummary || "", 220),
  }))
);

const matchPrimaryProgressCard = ({ primaryGoal = null, progressCards = [] } = {}) => (
  (progressCards || []).find((card) => card.goalId && card.goalId === primaryGoal?.id)
  || (progressCards || []).find((card) => card.summary && card.summary === primaryGoal?.summary)
  || progressCards?.[0]
  || null
);

const buildDueState = ({ cadence = "weekly", goalReviewHistory = [], goalChangeHistory = [], now = new Date() } = {}) => {
  const cadenceDays = getCadenceDays(cadence);
  const lastReviewTs = Math.max(
    0,
    ...toArray(goalReviewHistory).map((entry) => Number(entry?.reviewedAtTs || 0) || 0),
    ...toArray(goalChangeHistory).map((entry) => new Date(entry?.changedAt || 0).getTime() || 0)
  );
  if (!lastReviewTs) {
    return {
      dueState: GOAL_REVIEW_DUE_STATES.dueNow,
      cadenceDays,
      daysSinceLastReview: null,
      summary: `No goal review has been logged yet, so a ${cadence} check-in is due now.`,
    };
  }
  const daysSinceLastReview = getDaysSince({ timestamp: lastReviewTs, now });
  if (daysSinceLastReview >= cadenceDays) {
    return {
      dueState: GOAL_REVIEW_DUE_STATES.dueNow,
      cadenceDays,
      daysSinceLastReview,
      summary: `Your ${cadence} goal review is due now.`,
    };
  }
  if (daysSinceLastReview >= Math.max(0, cadenceDays - 2)) {
    return {
      dueState: GOAL_REVIEW_DUE_STATES.dueSoon,
      cadenceDays,
      daysSinceLastReview,
      summary: `Your next ${cadence} goal review is coming up soon.`,
    };
  }
  return {
    dueState: GOAL_REVIEW_DUE_STATES.notDue,
    cadenceDays,
    daysSinceLastReview,
    summary: `Your current goal review cadence is ${cadence}.`,
  };
};

const buildProgressAssessment = ({ primaryGoal = null, primaryCard = null } = {}) => {
  if (!primaryGoal || !primaryCard) {
    return {
      key: "are_we_progressing",
      verdict: "review",
      answer: "Progress is still too thin to judge honestly.",
      detail: "Log a bit more actual training before changing the goal for the wrong reason.",
    };
  }
  if (primaryCard.status === GOAL_PROGRESS_STATUSES.onTrack) {
    return {
      key: "are_we_progressing",
      verdict: "yes",
      answer: "Yes, current actuals support the goal.",
      detail: primaryCard.statusSummary || "The tracked metrics are moving in the right direction.",
    };
  }
  if (primaryCard.status === GOAL_PROGRESS_STATUSES.reviewBased) {
    return {
      key: "are_we_progressing",
      verdict: "mixed",
      answer: "Partly. This goal is progressing through proxies and review cadence rather than one exact metric.",
      detail: primaryCard.statusSummary || "Review-based goals need cadence and proxy consistency more than one hard number.",
    };
  }
  if (primaryCard.status === GOAL_PROGRESS_STATUSES.needsData) {
    return {
      key: "are_we_progressing",
      verdict: "review",
      answer: "We do not have enough actual data yet.",
      detail: primaryCard.nextReviewFocus || "Add the missing tracked inputs before changing course.",
    };
  }
  return {
    key: "are_we_progressing",
    verdict: "mixed",
    answer: "Progress is building, but it is not clean enough to call fully on-track yet.",
    detail: primaryCard.statusSummary || "Stay honest about the gap between plan intent and actual trend.",
  };
};

const buildGoalFitAssessment = ({ primaryGoal = null, progressAssessment = null } = {}) => {
  const unresolved = toArray(primaryGoal?.unresolvedGaps);
  if (!primaryGoal) {
    return {
      key: "is_goal_still_right",
      verdict: "review",
      answer: "The active priority order needs a clearer Priority 1 goal.",
      detail: "No strong primary goal is available to review yet.",
    };
  }
  if (unresolved.length > 0 || primaryGoal?.confidence === "low") {
    return {
      key: "is_goal_still_right",
      verdict: "review",
      answer: "Maybe, but the goal still needs refinement.",
      detail: unresolved[0] || "The goal is still low-confidence, so tighten the definition before pushing harder.",
    };
  }
  if (progressAssessment?.verdict === "review") {
    return {
      key: "is_goal_still_right",
      verdict: "review",
      answer: "Maybe, but the current evidence is not strong enough yet.",
      detail: "Check whether the issue is the goal itself or just missing/weak actual data.",
    };
  }
  return {
    key: "is_goal_still_right",
    verdict: "yes",
    answer: "Yes, the current goal still looks directionally right.",
    detail: "The resolved goal is specific enough to keep planning against it for now.",
  };
};

const buildMetricsAssessment = ({ primaryCard = null } = {}) => {
  if (!primaryCard) {
    return {
      key: "are_metrics_still_useful",
      verdict: "review",
      answer: "Tracked metrics are not clear enough yet.",
      detail: "A usable review needs at least one meaningful metric or proxy.",
    };
  }
  if (primaryCard.status === GOAL_PROGRESS_STATUSES.needsData) {
    return {
      key: "are_metrics_still_useful",
      verdict: "review",
      answer: "Not yet. The current proxies are fine, but they still need real inputs.",
      detail: primaryCard.nextReviewFocus || "Log the missing metrics before changing them.",
    };
  }
  if (primaryCard.trackingMode === "exploratory" || primaryCard.trackingMode === "proxy") {
    return {
      key: "are_metrics_still_useful",
      verdict: "mixed",
      answer: "Yes, as proxies. They should guide the block, not pretend to be exact truth.",
      detail: `Tracking: ${(primaryCard.whatIsTracked || []).slice(0, 3).join(", ") || "proxy review cadence"}.`,
    };
  }
  return {
    key: "are_metrics_still_useful",
    verdict: "yes",
    answer: "Yes. The current metric set is still useful for honest planning.",
    detail: `Tracking: ${(primaryCard.whatIsTracked || []).slice(0, 3).join(", ") || "primary metric"}.`,
  };
};

const buildPlanEmphasisAssessment = ({ primaryGoal = null, currentProgramBlock = null } = {}) => {
  const prioritized = sanitizeText(currentProgramBlock?.goalAllocation?.prioritized || currentProgramBlock?.dominantEmphasis?.label || "", 160).toLowerCase();
  const maintained = toArray(currentProgramBlock?.goalAllocation?.maintained).map((item) => sanitizeText(item, 120).toLowerCase());
  if (!primaryGoal || !currentProgramBlock) {
    return {
      key: "should_we_refine_or_reprioritize",
      verdict: "review",
      answer: "The current block emphasis is not clear enough to review yet.",
      detail: "Wait for a clearer block summary before changing the priority order.",
    };
  }
  const category = sanitizeText(primaryGoal?.category || "", 40).toLowerCase();
  const summary = sanitizeText(primaryGoal?.summary || "", 160).toLowerCase();
  const dominantMatches = [prioritized, sanitizeText(currentProgramBlock?.dominantEmphasis?.category || "", 40).toLowerCase()]
    .some((value) => value && (value.includes(category) || value.includes(summary)));
  if (dominantMatches) {
    return {
      key: "should_we_refine_or_reprioritize",
      verdict: "no",
      answer: "The current plan emphasis still matches Priority 1.",
      detail: `Top emphasis right now: ${currentProgramBlock?.goalAllocation?.prioritized || currentProgramBlock?.dominantEmphasis?.label || "current block"}.`,
    };
  }
  if (maintained.some((value) => value.includes(summary) || value.includes(category))) {
    return {
      key: "should_we_refine_or_reprioritize",
      verdict: "reprioritize",
      answer: "The current goal may fit better as a lower priority right now.",
      detail: "The block is still carrying this goal, but something else has more planning weight.",
    };
  }
  return {
    key: "should_we_refine_or_reprioritize",
    verdict: "review",
    answer: "The current block emphasis may no longer match the priority order cleanly.",
    detail: `Current top emphasis: ${currentProgramBlock?.goalAllocation?.prioritized || currentProgramBlock?.dominantEmphasis?.label || "unknown"}.`,
  };
};

const buildRecommendation = ({
  progressAssessment = null,
  goalFitAssessment = null,
  metricsAssessment = null,
  planAssessment = null,
  activeGoals = [],
} = {}) => {
  if (planAssessment?.verdict === "reprioritize" || (planAssessment?.verdict === "review" && activeGoals.length > 1 && progressAssessment?.verdict !== "yes")) {
    return {
      recommendation: GOAL_REVIEW_RECOMMENDATIONS.reprioritizeGoalStack,
      label: "Re-prioritize goals",
      reason: planAssessment?.detail || "The current block emphasis and priority order are drifting apart.",
    };
  }
  if (goalFitAssessment?.verdict === "review" || metricsAssessment?.verdict === "review") {
    return {
      recommendation: GOAL_REVIEW_RECOMMENDATIONS.refineCurrentGoal,
      label: "Refine current goal",
      reason: goalFitAssessment?.detail || metricsAssessment?.detail || "The goal needs a clearer definition or better proxies.",
    };
  }
  return {
    recommendation: GOAL_REVIEW_RECOMMENDATIONS.keepCurrentGoal,
    label: "Keep current goal",
    reason: "Progress, metrics, and plan emphasis are aligned well enough to stay the course.",
  };
};

export const buildGoalReview = ({
  goals = [],
  goalProgressTracking = {},
  currentProgramBlock = null,
  goalChangeHistory = [],
  goalReviewHistory = [],
  now = new Date(),
} = {}) => {
  const safeNow = asDate(now);
  const activeGoals = buildActiveGoals(goals);
  const progressCards = buildProgressCards(goalProgressTracking);
  const primaryGoal = activeGoals[0] || null;
  const primaryCard = matchPrimaryProgressCard({ primaryGoal, progressCards });
  const due = buildDueState({
    cadence: primaryCard?.reviewCadence || primaryGoal?.reviewCadence || "weekly",
    goalReviewHistory,
    goalChangeHistory,
    now: safeNow,
  });
  const progressAssessment = buildProgressAssessment({ primaryGoal, primaryCard });
  const goalFitAssessment = buildGoalFitAssessment({ primaryGoal, progressAssessment });
  const metricsAssessment = buildMetricsAssessment({ primaryCard });
  const planAssessment = buildPlanEmphasisAssessment({ primaryGoal, currentProgramBlock });
  const recommendation = buildRecommendation({
    progressAssessment,
    goalFitAssessment,
    metricsAssessment,
    planAssessment,
    activeGoals,
  });

  return {
    generatedAt: toDateKey(safeNow),
    due,
    primaryGoalSummary: primaryGoal?.summary || "",
    headline: due.dueState === GOAL_REVIEW_DUE_STATES.dueNow
      ? "Quick goal review due"
      : due.dueState === GOAL_REVIEW_DUE_STATES.dueSoon
      ? "Goal review coming up"
      : "Goal review snapshot",
    summary: due.dueState === GOAL_REVIEW_DUE_STATES.notDue
      ? "The current priority order looks coherent enough to keep the review lightweight."
      : "Use this check-in to confirm the goal, proxies, and block emphasis still match reality.",
    reviewItems: [
      progressAssessment,
      goalFitAssessment,
      metricsAssessment,
      planAssessment,
    ],
    recommendation,
  };
};

export const buildGoalReviewHistoryEntry = ({
  goalReview = null,
  action = GOAL_REVIEW_RECOMMENDATIONS.keepCurrentGoal,
  note = "",
  now = new Date(),
} = {}) => {
  const safeNow = asDate(now);
  return {
    id: `goal_review_${safeNow.getTime()}`,
    reviewedAt: safeNow.toISOString(),
    reviewedAtTs: safeNow.getTime(),
    effectiveDate: toDateKey(safeNow),
    recommendation: sanitizeText(action, 40).toLowerCase(),
    note: sanitizeText(note, 220),
    primaryGoalSummary: sanitizeText(goalReview?.primaryGoalSummary || "", 160),
    dueState: sanitizeText(goalReview?.due?.dueState || "", 40),
    reviewCadenceDays: Number(goalReview?.due?.cadenceDays || 0) || 0,
  };
};
