const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const GOAL_SUPPORT_LEVELS = Object.freeze({
  firstClass: "first_class_supported",
  partial: "partially_supported",
  loose: "loosely_approximated",
});

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const normalizeGoal = (goal = {}) => ({
  summary: sanitizeText(goal?.summary || goal?.name || goal?.resolvedGoal?.summary || "", 180),
  goalFamily: sanitizeText(goal?.goalFamily || goal?.resolvedGoal?.goalFamily || "", 40).toLowerCase(),
  planningCategory: sanitizeText(goal?.planningCategory || goal?.category || goal?.resolvedGoal?.planningCategory || "", 40).toLowerCase(),
  primaryMetric: goal?.primaryMetric || goal?.resolvedGoal?.primaryMetric || null,
  proxyMetrics: toArray(goal?.proxyMetrics || goal?.resolvedGoal?.proxyMetrics || []),
  first30DaySuccessDefinition: sanitizeText(goal?.first30DaySuccessDefinition || goal?.resolvedGoal?.first30DaySuccessDefinition || "", 220),
});

const isAppearancePrecisionGoal = (normalizedGoal = {}) => (
  /\b(visible abs|six pack|body fat\s*(?:under|below|around|at|to)?\s*\d{1,2}(?:\.\d+)?\s*%|\d{1,2}(?:\.\d+)?\s*%\s*body fat|midsection definition)\b/i.test(normalizedGoal?.summary || "")
  || /body[_ ]fat/i.test(String(normalizedGoal?.primaryMetric?.key || ""))
);

export const classifyGoalSupportLevel = (goal = {}) => {
  const normalizedGoal = normalizeGoal(goal);
  const hasPrimaryMetric = Boolean(normalizedGoal.primaryMetric?.key && normalizedGoal.primaryMetric?.targetValue);
  const hasProxyMetrics = normalizedGoal.proxyMetrics.length > 0;

  if (normalizedGoal.goalFamily === "appearance" || isAppearancePrecisionGoal(normalizedGoal)) {
    return {
      level: GOAL_SUPPORT_LEVELS.loose,
      headline: "Loosely approximated",
      reason: /body fat/i.test(normalizedGoal.summary)
        ? "Body-fat percentage and exact look outcomes are still proxy-tracked through bodyweight, waist, and review cadence rather than a direct verifier."
        : "Exact look outcomes are still proxy-tracked through bodyweight, waist, and review cadence rather than a direct physique verifier.",
      limitingFactor: "Appearance-specific proof stays indirect.",
    };
  }

  if (["performance", "strength"].includes(normalizedGoal.goalFamily) && hasPrimaryMetric) {
    return {
      level: GOAL_SUPPORT_LEVELS.firstClass,
      headline: "First-class supported",
      reason: "This goal has a direct primary metric, a dedicated planning lane, and deterministic adaptation rules in the repo.",
      limitingFactor: "Concurrent-goal interference still matters, but the goal family itself is first-class.",
    };
  }

  if (normalizedGoal.goalFamily === "body_comp" && hasPrimaryMetric) {
    return {
      level: GOAL_SUPPORT_LEVELS.firstClass,
      headline: "First-class supported",
      reason: "The weight-loss target is directly measurable and the app already threads bodyweight, waist, nutrition, and adaptation into the planning model.",
      limitingFactor: "Recovery and adherence still limit how aggressive the cut can be.",
    };
  }

  if (hasProxyMetrics || normalizedGoal.planningCategory === "body_comp") {
    return {
      level: GOAL_SUPPORT_LEVELS.partial,
      headline: "Partially supported",
      reason: "The app can guide this through shared planning rules and proxy metrics, but it cannot prove the outcome with the same precision as an exact performance or lift target.",
      limitingFactor: "Proxy tracking is useful but not definitive.",
    };
  }

  return {
    level: GOAL_SUPPORT_LEVELS.loose,
    headline: "Loosely approximated",
    reason: normalizedGoal.first30DaySuccessDefinition
      ? `The app can only ground this through a first-block success definition: ${normalizedGoal.first30DaySuccessDefinition}`
      : "The app falls back to broader shared planning rules instead of a goal-specific deterministic model.",
    limitingFactor: "Goal-specific proof is still weak.",
  };
};

export const buildGoalSupportHonestyAudit = ({ goals = [] } = {}) => (
  toArray(goals)
    .filter(Boolean)
    .map((goal, index) => {
      const normalizedGoal = normalizeGoal(goal);
      const support = classifyGoalSupportLevel(goal);
      return {
        goalId: sanitizeText(goal?.id || `goal_${index + 1}`, 120),
        summary: normalizedGoal.summary || `Goal ${index + 1}`,
        goalFamily: normalizedGoal.goalFamily || normalizedGoal.planningCategory || "unknown",
        planningCategory: normalizedGoal.planningCategory || "unknown",
        supportLevel: support.level,
        headline: support.headline,
        reason: support.reason,
        limitingFactor: support.limitingFactor,
        primaryMetricKey: sanitizeText(normalizedGoal.primaryMetric?.key || "", 80),
        proxyMetricKeys: normalizedGoal.proxyMetrics.map((metric) => sanitizeText(metric?.key || "", 80)).filter(Boolean),
      };
    })
);
