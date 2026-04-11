import { GOAL_MEASURABILITY_TIERS } from "./goal-resolution-service.js";

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

const REALISM_LABELS = {
  realistic: "Realistic",
  aggressive: "Aggressive",
  exploratory: "Exploratory",
  unrealistic: "Needs a smaller first block",
};

export const buildRawGoalIntentFromAnswers = ({ answers = {}, fallbackLabel = "" } = {}) => {
  const clarificationNotes = toArray(answers?.goal_clarification_notes)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const question = sanitizeText(entry?.question || "", 160);
      const answer = sanitizeText(entry?.answer || "", 220);
      if (!answer) return "";
      return question ? `${question} ${answer}` : answer;
    })
    .filter(Boolean);

  return dedupeStrings([
    sanitizeText(answers?.goal_intent || "", 320),
    sanitizeText(answers?.primary_goal_detail || "", 220),
    sanitizeText(answers?.other_goals || "", 180),
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
  if (cleanExplicit) return cleanExplicit;
  const category = sanitizeText(resolvedGoal?.planningCategory || "", 40).toLowerCase();
  return PRIMARY_GOAL_KEY_BY_CATEGORY[category] || "general_fitness";
};

export const buildIntakeGoalReviewModel = ({
  goalResolution = null,
  orderedResolvedGoals = [],
  goalFeasibility = null,
  aiInterpretationProposal = null,
} = {}) => {
  const resolvedGoals = Array.isArray(orderedResolvedGoals) && orderedResolvedGoals.length
    ? orderedResolvedGoals
    : (Array.isArray(goalResolution?.resolvedGoals) ? goalResolution.resolvedGoals : []);
  const primaryGoal = resolvedGoals[0] || null;
  const trackingLabels = dedupeStrings(
    resolvedGoals.flatMap((goal) => [
      goal?.primaryMetric?.label || "",
      ...(Array.isArray(goal?.proxyMetrics) ? goal.proxyMetrics.map((metric) => metric?.label || "") : []),
      !goal?.primaryMetric && (!Array.isArray(goal?.proxyMetrics) || goal.proxyMetrics.length === 0)
        ? goal?.first30DaySuccessDefinition || ""
        : "",
    ])
  ).slice(0, 6);
  const unresolvedItems = dedupeStrings([
    ...(goalResolution?.unresolvedGaps || []),
    ...resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []),
  ]).slice(0, 4);
  const clarifyingQuestions = dedupeStrings([
    ...(aiInterpretationProposal?.missingClarifyingQuestions || []),
    ...unresolvedItems,
  ]).slice(0, 2);

  return {
    primarySummary: sanitizeText(primaryGoal?.summary || "", 160),
    goalFamily: sanitizeText(primaryGoal?.goalFamily || aiInterpretationProposal?.interpretedGoalType || "", 40).toLowerCase(),
    goalFamilyLabel: sanitizeText(primaryGoal?.goalFamily || aiInterpretationProposal?.interpretedGoalType || "", 40).replaceAll("_", " "),
    measurabilityTier: sanitizeText(primaryGoal?.measurabilityTier || "", 40).toLowerCase(),
    measurabilityLabel: MEASURABILITY_LABELS[primaryGoal?.measurabilityTier] || "Pending",
    realismStatus: sanitizeText(goalFeasibility?.realismStatus || "", 40).toLowerCase(),
    realismLabel: REALISM_LABELS[goalFeasibility?.realismStatus] || "Pending",
    confidence: sanitizeText(primaryGoal?.confidence || goalResolution?.confidenceLevel || "", 20).toLowerCase(),
    confidenceLabel: CONFIDENCE_LABELS[primaryGoal?.confidence || goalResolution?.confidenceLevel] || "Pending confidence",
    trackingLabels,
    unresolvedItems,
    clarifyingQuestions,
    orderedResolvedGoals: resolvedGoals,
    isPlannerReady: Boolean(primaryGoal),
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
  if (normalizedAsked.size >= Math.max(0, maxQuestions)) return "";
  return toArray(reviewModel?.clarifyingQuestions)
    .map((item) => sanitizeText(item, 180))
    .find((item) => item && !normalizedAsked.has(item.toLowerCase()))
    || "";
};
