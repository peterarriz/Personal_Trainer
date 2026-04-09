import { dedupeStrings } from "../utils/collection-utils.js";

export const GOAL_MEASURABILITY_TIERS = {
  fullyMeasurable: "fully_measurable",
  proxyMeasurable: "proxy_measurable",
  exploratoryFuzzy: "exploratory_fuzzy",
};

export const GOAL_CONFIDENCE_LEVELS = {
  low: "low",
  medium: "medium",
  high: "high",
};

export const GOAL_FAMILIES = {
  performance: "performance",
  strength: "strength",
  bodyComp: "body_comp",
  appearance: "appearance",
  hybrid: "hybrid",
  generalFitness: "general_fitness",
  reEntry: "re_entry",
};

export const GOAL_CONFIDENCE_SCORES = {
  low: 35,
  medium: 65,
  high: 85,
};

const GOAL_FAMILY_TO_PLANNING_CATEGORY = {
  [GOAL_FAMILIES.performance]: "running",
  [GOAL_FAMILIES.strength]: "strength",
  [GOAL_FAMILIES.bodyComp]: "body_comp",
  [GOAL_FAMILIES.appearance]: "body_comp",
  [GOAL_FAMILIES.hybrid]: "running",
  [GOAL_FAMILIES.generalFitness]: "general_fitness",
  [GOAL_FAMILIES.reEntry]: "general_fitness",
};

const REVIEW_CADENCE_BY_TIER = {
  [GOAL_MEASURABILITY_TIERS.fullyMeasurable]: "biweekly",
  [GOAL_MEASURABILITY_TIERS.proxyMeasurable]: "weekly",
  [GOAL_MEASURABILITY_TIERS.exploratoryFuzzy]: "weekly",
};

const REFINE_TRIGGER_BY_TIER = {
  [GOAL_MEASURABILITY_TIERS.fullyMeasurable]: "block_start_or_metric_stall",
  [GOAL_MEASURABILITY_TIERS.proxyMeasurable]: "missing_metric_data",
  [GOAL_MEASURABILITY_TIERS.exploratoryFuzzy]: "30_day_resolution_review",
};

const MONTH_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const SEASON_MONTH_INDEX = {
  spring: 2,
  summer: 5,
  fall: 8,
  autumn: 8,
  winter: 11,
};

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const slugify = (value = "", fallback = "goal") => {
  const slug = sanitizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || fallback;
};

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const uniqMetrics = (metrics = []) => {
  const seen = new Set();
  return (Array.isArray(metrics) ? metrics : [])
    .map((metric) => {
      const key = slugify(metric?.key || metric?.label || "", "");
      const label = sanitizeText(metric?.label || "", 80);
      const unit = sanitizeText(metric?.unit || "", 20);
      const kind = sanitizeText(metric?.kind || "", 20).toLowerCase();
      const targetValue = sanitizeText(metric?.targetValue || metric?.value || "", 40);
      if (!key || !label) return null;
      const dedupeKey = `${key}:${kind}:${unit}:${targetValue}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      return {
        key,
        label,
        unit,
        kind: kind === "primary" ? "primary" : "proxy",
        ...(targetValue ? { targetValue } : {}),
      };
    })
    .filter(Boolean);
};

const normalizeAiInterpretationProposal = (proposal = null) => {
  if (!proposal || typeof proposal !== "object") {
    return {
      interpretedGoalType: "",
      measurabilityTier: "",
      suggestedMetrics: [],
      timelineRealism: {
        status: "",
        summary: "",
        suggestedHorizonWeeks: null,
      },
      detectedConflicts: [],
      missingClarifyingQuestions: [],
      coachSummary: "",
    };
  }

  const suggestedHorizonWeeksRaw = Number(proposal?.timelineRealism?.suggestedHorizonWeeks ?? proposal?.targetHorizonWeeks);
  return {
    interpretedGoalType: sanitizeText(proposal?.interpretedGoalType || proposal?.goalFamily || "", 40).toLowerCase(),
    measurabilityTier: sanitizeText(proposal?.measurabilityTier || "", 40).toLowerCase(),
    suggestedMetrics: uniqMetrics(proposal?.suggestedMetrics || proposal?.metrics || []),
    timelineRealism: {
      status: sanitizeText(proposal?.timelineRealism?.status || "", 24).toLowerCase(),
      summary: sanitizeText(proposal?.timelineRealism?.summary || "", 220),
      suggestedHorizonWeeks: Number.isFinite(suggestedHorizonWeeksRaw) ? Math.max(1, Math.min(104, Math.round(suggestedHorizonWeeksRaw))) : null,
    },
    detectedConflicts: dedupeStrings((proposal?.detectedConflicts || proposal?.tradeoffs || []).map((item) => sanitizeText(item, 140))).slice(0, 4),
    missingClarifyingQuestions: dedupeStrings((proposal?.missingClarifyingQuestions || proposal?.missingInformation || []).map((item) => sanitizeText(item, 180))).slice(0, 4),
    coachSummary: sanitizeText(proposal?.coachSummary || proposal?.summary || "", 420),
  };
};

const normalizeUserConfirmation = (confirmation = {}) => ({
  confirmed: confirmation?.confirmed !== false,
  acceptedProposal: confirmation?.acceptedProposal !== false,
  source: sanitizeText(confirmation?.source || "user_confirmation", 40) || "user_confirmation",
  edits: {
    summary: sanitizeText(confirmation?.edits?.summary || confirmation?.summary || "", 160),
    goalFamily: sanitizeText(confirmation?.edits?.goalFamily || confirmation?.goalFamily || "", 40).toLowerCase(),
    measurableTier: sanitizeText(confirmation?.edits?.measurableTier || confirmation?.measurableTier || "", 40).toLowerCase(),
    planningCategory: sanitizeText(confirmation?.edits?.planningCategory || "", 40).toLowerCase(),
    targetDate: sanitizeText(confirmation?.edits?.targetDate || confirmation?.targetDate || "", 24),
    targetHorizonWeeks: Number.isFinite(Number(confirmation?.edits?.targetHorizonWeeks ?? confirmation?.targetHorizonWeeks))
      ? Math.max(1, Math.min(104, Math.round(Number(confirmation.edits?.targetHorizonWeeks ?? confirmation.targetHorizonWeeks))))
      : null,
    confidence: sanitizeText(confirmation?.edits?.confidence || confirmation?.confidence || "", 20).toLowerCase(),
    tradeoffs: dedupeStrings(toArray(confirmation?.edits?.tradeoffs || confirmation?.tradeoffs).map((item) => sanitizeText(item, 140))).slice(0, 4),
    unresolvedGaps: dedupeStrings(toArray(confirmation?.edits?.unresolvedGaps || confirmation?.unresolvedGaps).map((item) => sanitizeText(item, 180))).slice(0, 4),
    primaryMetric: confirmation?.edits?.primaryMetric || confirmation?.primaryMetric || null,
    proxyMetrics: confirmation?.edits?.proxyMetrics || confirmation?.proxyMetrics || [],
  },
});

const resolveIntakeContext = (typedIntakePacket = {}) => (
  typedIntakePacket?.intake || typedIntakePacket?.intakeContext || typedIntakePacket || {}
);

const getCorpusText = ({ rawUserGoalIntent = "", intakeContext = {} } = {}) => dedupeStrings([
  sanitizeText(typeof rawUserGoalIntent === "string" ? rawUserGoalIntent : rawUserGoalIntent?.text || "", 420),
  sanitizeText(intakeContext?.rawGoalText || "", 420),
  sanitizeText(intakeContext?.baselineContext?.primaryGoalLabel || "", 80),
  sanitizeText(intakeContext?.baselineContext?.currentBaseline || "", 180),
  sanitizeText(intakeContext?.userProvidedConstraints?.additionalContext || "", 180),
  ...toArray(intakeContext?.userProvidedConstraints?.timingConstraints).map((item) => sanitizeText(item, 120)),
  ...toArray(intakeContext?.userProvidedConstraints?.appearanceConstraints).map((item) => sanitizeText(item, 120)),
]).join(". ");

const detectSignals = (text = "") => {
  const corpus = sanitizeText(text, 1200).toLowerCase();
  return {
    hasRunning: /(run|marathon|half marathon|10k|5k|race|pace|endurance|aerobic)/i.test(corpus),
    hasHalfMarathon: /\bhalf marathon\b/i.test(corpus),
    hasMarathon: /(^|\s)marathon(\s|$)/i.test(corpus) && !/\bhalf marathon\b/i.test(corpus),
    has10k: /\b10k\b/i.test(corpus),
    has5k: /\b5k\b/i.test(corpus),
    hasStrength: /(bench|squat|deadlift|overhead press|ohp|strength|lift|lifting)/i.test(corpus),
    hasBench: /\bbench(?: press)?\b/i.test(corpus),
    hasSquat: /\bsquat\b/i.test(corpus),
    hasDeadlift: /\bdeadlift\b/i.test(corpus),
    hasFatLoss: /(lose fat|fat loss|cut|lean|leaner|drop weight|lose weight)/i.test(corpus),
    hasAppearance: /(abs|six pack|look athletic|appearance|physique|toned|defined|lean for)/i.test(corpus),
    hasHybrid: /\bhybrid athlete\b|\bhybrid\b/i.test(corpus),
    hasKeepStrength: /(keep strength|maintain strength|keep my strength|hold strength)/i.test(corpus),
    hasReEntry: /(back in shape|get back in shape|again|feel like myself again|return to form)/i.test(corpus),
    raw: corpus,
  };
};

const extractTimeToken = (text = "") => {
  const match = String(text || "").match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (!match?.[1]) return "";
  return match[1].split(":").length === 2 ? `${match[1]}:00` : match[1];
};

const extractRunningPrimaryMetric = (text = "") => {
  const raceTime = extractTimeToken(text);
  if (!raceTime) return null;
  if (/\bhalf marathon\b/i.test(text)) {
    return { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  if (/\bmarathon\b/i.test(text) && !/\bhalf marathon\b/i.test(text)) {
    return { key: "marathon_time", label: "Marathon time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  if (/\b10k\b/i.test(text)) {
    return { key: "run_10k_time", label: "10k time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  if (/\b5k\b/i.test(text)) {
    return { key: "run_5k_time", label: "5k time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  return { key: "race_time", label: "Race time", unit: "time", kind: "primary", targetValue: raceTime };
};

const extractStrengthPrimaryMetric = (text = "") => {
  const liftMap = [
    { pattern: /\bbench(?: press)?\b/i, key: "bench_press_weight", label: "Bench press", unit: "lb" },
    { pattern: /\bsquat\b/i, key: "squat_weight", label: "Squat", unit: "lb" },
    { pattern: /\bdeadlift\b/i, key: "deadlift_weight", label: "Deadlift", unit: "lb" },
    { pattern: /\boverhead press\b|\bohp\b/i, key: "overhead_press_weight", label: "Overhead press", unit: "lb" },
  ];
  const lift = liftMap.find((item) => item.pattern.test(text));
  if (!lift) return null;
  const weightMatch = String(text || "").match(/\b(\d{2,3})\b/);
  const targetValue = weightMatch?.[1] || "";
  return {
    key: lift.key,
    label: lift.label,
    unit: lift.unit,
    kind: "primary",
    ...(targetValue ? { targetValue } : {}),
  };
};

const extractWeightLossPrimaryMetric = (text = "") => {
  const match = String(text || "").match(/\blose\s+(\d{1,3})\s*(?:lb|lbs|pounds?)\b/i);
  if (!match?.[1]) return null;
  return {
    key: "bodyweight_change",
    label: "Bodyweight change",
    unit: "lb",
    kind: "primary",
    targetValue: `-${match[1]}`,
  };
};

const defaultProxyMetricsForCategory = (planningCategory = "general_fitness") => {
  if (planningCategory === "running") {
    return uniqMetrics([
      { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
      { key: "long_run_duration", label: "Long run duration", unit: "min", kind: "proxy" },
      { key: "quality_session_completion", label: "Quality session completion", unit: "sessions", kind: "proxy" },
    ]);
  }
  if (planningCategory === "strength") {
    return uniqMetrics([
      { key: "compound_lift_consistency", label: "Compound lift consistency", unit: "sessions", kind: "proxy" },
      { key: "top_set_load", label: "Top set load", unit: "lb", kind: "proxy" },
      { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions", kind: "proxy" },
    ]);
  }
  if (planningCategory === "body_comp") {
    return uniqMetrics([
      { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
      { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", kind: "proxy" },
      { key: "progress_photos", label: "Progress photos", unit: "checkins", kind: "proxy" },
    ]);
  }
  return uniqMetrics([
    { key: "weekly_training_frequency", label: "Weekly training frequency", unit: "sessions", kind: "proxy" },
    { key: "checkin_consistency", label: "Check-in consistency", unit: "checkins", kind: "proxy" },
    { key: "thirty_day_adherence", label: "30-day adherence", unit: "sessions", kind: "proxy" },
  ]);
};

const resolveMetricSet = ({
  rawText = "",
  planningCategory = "general_fitness",
  goalFamily = GOAL_FAMILIES.generalFitness,
  proposal = {},
  confirmation = {},
} = {}) => {
  const confirmationPrimary = confirmation?.edits?.primaryMetric ? uniqMetrics([{ ...(confirmation.edits.primaryMetric || {}), kind: "primary" }])[0] || null : null;
  const confirmationProxy = uniqMetrics((confirmation?.edits?.proxyMetrics || []).map((metric) => ({ ...metric, kind: "proxy" })));
  const proposalPrimary = (proposal?.suggestedMetrics || []).find((metric) => metric.kind === "primary") || null;
  const proposalProxy = (proposal?.suggestedMetrics || []).filter((metric) => metric.kind !== "primary");

  let heuristicPrimary = null;
  if (planningCategory === "running") heuristicPrimary = extractRunningPrimaryMetric(rawText);
  if (!heuristicPrimary && planningCategory === "strength") heuristicPrimary = extractStrengthPrimaryMetric(rawText);
  if (!heuristicPrimary && planningCategory === "body_comp") heuristicPrimary = extractWeightLossPrimaryMetric(rawText);

  const primaryMetric = confirmationPrimary || heuristicPrimary || (confirmation?.acceptedProposal !== false ? proposalPrimary : null) || null;
  const proxyMetrics = uniqMetrics([
    ...confirmationProxy,
    ...(confirmation?.acceptedProposal !== false ? proposalProxy : []),
    ...defaultProxyMetricsForCategory(planningCategory),
  ]).filter((metric) => !primaryMetric || metric.key !== primaryMetric.key);

  if (goalFamily === GOAL_FAMILIES.hybrid && planningCategory === "running") {
    return {
      primaryMetric,
      proxyMetrics: uniqMetrics([
        { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
        { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions", kind: "proxy" },
        ...proxyMetrics,
      ]),
    };
  }

  if (goalFamily === GOAL_FAMILIES.hybrid && planningCategory === "strength") {
    return {
      primaryMetric,
      proxyMetrics: uniqMetrics([
        { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions", kind: "proxy" },
        { key: "easy_run_consistency", label: "Easy run consistency", unit: "sessions", kind: "proxy" },
        ...proxyMetrics,
      ]),
    };
  }

  return { primaryMetric, proxyMetrics };
};

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toDateKey = (date = null) => {
  const safeDate = asDate(date);
  const year = safeDate.getFullYear();
  const month = `${safeDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${safeDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const calculateWeeksFromNow = ({ now = new Date(), targetDate = null } = {}) => {
  if (!targetDate) return null;
  const safeNow = asDate(now);
  const safeTarget = asDate(targetDate);
  const diffMs = safeTarget.getTime() - safeNow.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 1;
  return Math.max(1, Math.round(diffMs / (7 * 86400000)));
};

const resolveTargetWindow = ({
  rawText = "",
  intakeContext = {},
  proposal = {},
  confirmation = {},
  now = new Date(),
} = {}) => {
  const explicitDate = sanitizeText(confirmation?.edits?.targetDate || "", 24);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return { targetDate: explicitDate, targetHorizonWeeks: confirmation?.edits?.targetHorizonWeeks || null, isApproximate: false };
  }
  if (Number.isFinite(confirmation?.edits?.targetHorizonWeeks)) {
    return { targetDate: "", targetHorizonWeeks: confirmation.edits.targetHorizonWeeks, isApproximate: true };
  }

  const corpus = dedupeStrings([
    rawText,
    ...toArray(intakeContext?.userProvidedConstraints?.timingConstraints),
  ]).join(" ").toLowerCase();

  const monthMatch = Object.keys(MONTH_INDEX).find((month) => new RegExp(`\\b${month}\\b`, "i").test(corpus));
  if (monthMatch) {
    const safeNow = asDate(now);
    let year = safeNow.getFullYear();
    const monthIndex = MONTH_INDEX[monthMatch];
    if (monthIndex < safeNow.getMonth()) year += 1;
    const targetDate = new Date(year, monthIndex, 1);
    return {
      targetDate: "",
      targetHorizonWeeks: calculateWeeksFromNow({ now: safeNow, targetDate }),
      isApproximate: true,
    };
  }

  const seasonMatch = Object.keys(SEASON_MONTH_INDEX).find((season) => new RegExp(`\\b${season}\\b`, "i").test(corpus));
  if (seasonMatch) {
    const safeNow = asDate(now);
    let year = safeNow.getFullYear();
    const monthIndex = SEASON_MONTH_INDEX[seasonMatch];
    if (monthIndex < safeNow.getMonth()) year += 1;
    const targetDate = new Date(year, monthIndex, 1);
    return {
      targetDate: "",
      targetHorizonWeeks: calculateWeeksFromNow({ now: safeNow, targetDate }),
      isApproximate: true,
    };
  }

  if (Number.isFinite(proposal?.timelineRealism?.suggestedHorizonWeeks)) {
    return {
      targetDate: "",
      targetHorizonWeeks: proposal.timelineRealism.suggestedHorizonWeeks,
      isApproximate: true,
    };
  }

  return { targetDate: "", targetHorizonWeeks: null, isApproximate: false };
};

const inferGoalFamily = ({
  proposal = {},
  confirmation = {},
  signals = {},
} = {}) => {
  if (confirmation?.edits?.goalFamily && Object.values(GOAL_FAMILIES).includes(confirmation.edits.goalFamily)) {
    return confirmation.edits.goalFamily;
  }
  if (confirmation?.acceptedProposal !== false && Object.values(GOAL_FAMILIES).includes(proposal?.interpretedGoalType)) {
    return proposal.interpretedGoalType;
  }
  if (signals.hasHybrid || (signals.hasFatLoss && signals.hasKeepStrength) || (signals.hasRunning && signals.hasStrength)) return GOAL_FAMILIES.hybrid;
  if (signals.hasAppearance) return GOAL_FAMILIES.appearance;
  if (signals.hasFatLoss) return GOAL_FAMILIES.bodyComp;
  if (signals.hasStrength) return GOAL_FAMILIES.strength;
  if (signals.hasRunning) return GOAL_FAMILIES.performance;
  if (signals.hasReEntry) return GOAL_FAMILIES.reEntry;
  return GOAL_FAMILIES.generalFitness;
};

const inferMeasurabilityTier = ({
  goalFamily = GOAL_FAMILIES.generalFitness,
  planningCategory = "general_fitness",
  rawText = "",
  proposal = {},
  confirmation = {},
  primaryMetric = null,
} = {}) => {
  if (confirmation?.edits?.measurableTier && Object.values(GOAL_MEASURABILITY_TIERS).includes(confirmation.edits.measurableTier)) {
    return confirmation.edits.measurableTier;
  }
  if (confirmation?.acceptedProposal !== false && Object.values(GOAL_MEASURABILITY_TIERS).includes(proposal?.measurabilityTier)) {
    return proposal.measurabilityTier;
  }
  if (primaryMetric && (planningCategory === "running" || planningCategory === "strength")) return GOAL_MEASURABILITY_TIERS.fullyMeasurable;
  if (planningCategory === "body_comp" && extractWeightLossPrimaryMetric(rawText)) return GOAL_MEASURABILITY_TIERS.fullyMeasurable;
  if (goalFamily === GOAL_FAMILIES.appearance || goalFamily === GOAL_FAMILIES.bodyComp) return GOAL_MEASURABILITY_TIERS.proxyMeasurable;
  if (goalFamily === GOAL_FAMILIES.hybrid || goalFamily === GOAL_FAMILIES.reEntry || goalFamily === GOAL_FAMILIES.generalFitness) {
    return GOAL_MEASURABILITY_TIERS.exploratoryFuzzy;
  }
  return GOAL_MEASURABILITY_TIERS.proxyMeasurable;
};

const inferConfidenceLevel = ({
  measurabilityTier = GOAL_MEASURABILITY_TIERS.exploratoryFuzzy,
  targetWindow = {},
  proposal = {},
  confirmation = {},
  unresolvedGaps = [],
  primaryMetric = null,
} = {}) => {
  if (confirmation?.edits?.confidence && Object.values(GOAL_CONFIDENCE_LEVELS).includes(confirmation.edits.confidence)) {
    return confirmation.edits.confidence;
  }
  if (measurabilityTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable && primaryMetric && (targetWindow?.targetDate || targetWindow?.targetHorizonWeeks)) {
    return GOAL_CONFIDENCE_LEVELS.high;
  }
  if (measurabilityTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable && primaryMetric) {
    return GOAL_CONFIDENCE_LEVELS.medium;
  }
  if (measurabilityTier === GOAL_MEASURABILITY_TIERS.proxyMeasurable && unresolvedGaps.length <= 1) {
    return GOAL_CONFIDENCE_LEVELS.medium;
  }
  if (proposal?.timelineRealism?.status === "unclear" || unresolvedGaps.length >= 2) {
    return GOAL_CONFIDENCE_LEVELS.low;
  }
  return GOAL_CONFIDENCE_LEVELS.low;
};

const buildThirtyDaySuccessDefinition = ({ goalFamily = GOAL_FAMILIES.generalFitness, planningCategory = "general_fitness", variant = "", measurableTier = GOAL_MEASURABILITY_TIERS.exploratoryFuzzy } = {}) => {
  if (goalFamily === GOAL_FAMILIES.hybrid && variant === "hybrid_endurance") {
    return "Complete 8 aerobic sessions and 8 strength sessions over the next 30 days so hybrid structure becomes real.";
  }
  if (goalFamily === GOAL_FAMILIES.hybrid && variant === "hybrid_strength") {
    return "Log at least 8 strength sessions over the next 30 days while keeping aerobic work in the week.";
  }
  if (variant === "strength_maintenance") {
    return "Keep two logged strength sessions each week over the next 30 days while the primary goal leads.";
  }
  if (planningCategory === "running") {
    return measurableTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable
      ? "Complete four weeks of structured run frequency and land one longer aerobic session each week."
      : "Complete 10 planned aerobic sessions over the next 30 days and keep the weekly run rhythm intact.";
  }
  if (planningCategory === "strength") {
    return measurableTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable
      ? "Log two to three strength sessions each week and record one key lift top set weekly for the next 30 days."
      : "Keep two logged strength sessions each week over the next 30 days so strength stays part of the week.";
  }
  if (planningCategory === "body_comp") {
    return "Complete 12 planned sessions and log 4 weekly body-composition check-ins over the next 30 days.";
  }
  return "Complete 12 planned sessions in 30 days and log 4 weekly check-ins so consistency becomes measurable.";
};

const buildSummary = ({
  rawText = "",
  goalFamily = GOAL_FAMILIES.generalFitness,
  planningCategory = "general_fitness",
  variant = "",
  primaryMetric = null,
  targetWindow = {},
  confirmation = {},
} = {}) => {
  if (confirmation?.edits?.summary) return confirmation.edits.summary;
  if (variant === "hybrid_endurance") return "Build aerobic base for hybrid training";
  if (variant === "hybrid_strength") return "Build baseline strength for hybrid training";
  if (variant === "strength_maintenance") return "Keep strength while the primary goal leads";
  if (variant === "body_comp_primary_with_strength_retention") return "Lose fat while keeping strength";
  if (goalFamily === GOAL_FAMILIES.appearance && /\bsix pack\b/i.test(rawText)) {
    return targetWindow?.targetHorizonWeeks ? "Improve midsection definition by the target window" : "Improve midsection definition";
  }
  if (goalFamily === GOAL_FAMILIES.appearance && /\blook athletic again\b/i.test(rawText)) {
    return "Look athletic again with repeatable training";
  }
  if (goalFamily === GOAL_FAMILIES.bodyComp && /\bget lean\b/i.test(rawText)) {
    return "Get leaner within the current time window";
  }
  if (planningCategory === "running" && primaryMetric?.targetValue && /half marathon/i.test(primaryMetric?.label || "")) {
    return `Run a half marathon in ${primaryMetric.targetValue}`;
  }
  if (planningCategory === "running" && primaryMetric?.targetValue) {
    return `${primaryMetric.label} ${primaryMetric.targetValue}`;
  }
  if (planningCategory === "strength" && primaryMetric?.targetValue) {
    return `${primaryMetric.label} ${primaryMetric.targetValue} ${primaryMetric.unit}`.trim();
  }
  if (goalFamily === GOAL_FAMILIES.reEntry) return "Get back into consistent training shape";
  if (goalFamily === GOAL_FAMILIES.generalFitness) return "Rebuild general fitness and consistency";
  return sanitizeText(rawText, 160) || "Resolved goal";
};

const buildTradeoffs = ({ goalFamily = GOAL_FAMILIES.generalFitness, variant = "", proposal = {}, confirmation = {}, signals = {} } = {}) => {
  const heuristicTradeoffs = [];
  if (goalFamily === GOAL_FAMILIES.hybrid && variant === "hybrid_endurance") {
    heuristicTradeoffs.push("Endurance volume can slow maximal strength progress if recovery is not protected.");
  }
  if (goalFamily === GOAL_FAMILIES.hybrid && variant === "hybrid_strength") {
    heuristicTradeoffs.push("Strength progression must stay compatible with the aerobic workload in the same week.");
  }
  if (variant === "body_comp_primary_with_strength_retention" || (signals.hasFatLoss && signals.hasKeepStrength)) {
    heuristicTradeoffs.push("Aggressive fat loss may limit strength progression and recovery quality.");
  }
  if (goalFamily === GOAL_FAMILIES.appearance) {
    heuristicTradeoffs.push("Appearance-focused leanness pushes can reduce training quality if recovery and fueling drift.");
  }
  return dedupeStrings([
    ...(confirmation?.edits?.tradeoffs || []),
    ...(confirmation?.acceptedProposal !== false ? (proposal?.detectedConflicts || []) : []),
    ...heuristicTradeoffs,
  ]).slice(0, 4);
};

const buildUnresolvedGaps = ({
  goalFamily = GOAL_FAMILIES.generalFitness,
  planningCategory = "general_fitness",
  measurableTier = GOAL_MEASURABILITY_TIERS.exploratoryFuzzy,
  targetWindow = {},
  proposal = {},
  confirmation = {},
  signals = {},
  primaryMetric = null,
} = {}) => {
  const gaps = [];
  if (!targetWindow?.targetDate && !targetWindow?.targetHorizonWeeks && planningCategory === "running") {
    gaps.push("Need a target race date or horizon to time the block structure precisely.");
  }
  if (targetWindow?.isApproximate && !targetWindow?.targetDate) {
    gaps.push("Exact target date is still approximate.");
  }
  if (goalFamily === GOAL_FAMILIES.hybrid) {
    gaps.push("Need the preferred balance between endurance and strength if one lane should lead.");
  }
  if (goalFamily === GOAL_FAMILIES.appearance && !signals.hasFatLoss) {
    gaps.push("Need a clearer appearance marker if physique precision matters.");
  }
  if (measurableTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy && !primaryMetric) {
    gaps.push("Need stronger metrics if the goal should progress beyond a first 30-day success definition.");
  }
  return dedupeStrings([
    ...(confirmation?.edits?.unresolvedGaps || []),
    ...(confirmation?.acceptedProposal !== false ? (proposal?.missingClarifyingQuestions || []) : []),
    ...gaps,
  ]).slice(0, 4);
};

const buildPlanningTargetText = (resolvedGoal = {}) => {
  const primaryMetric = resolvedGoal?.primaryMetric || null;
  if (primaryMetric?.targetValue) {
    return `${primaryMetric.label} ${primaryMetric.targetValue}${primaryMetric.unit && primaryMetric.unit !== "time" ? ` ${primaryMetric.unit}` : ""}`.trim();
  }
  if (resolvedGoal?.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy) {
    return sanitizeText(resolvedGoal?.first30DaySuccessDefinition || "", 180);
  }
  if (Array.isArray(resolvedGoal?.proxyMetrics) && resolvedGoal.proxyMetrics.length) {
    return `Track ${resolvedGoal.proxyMetrics.slice(0, 2).map((metric) => metric.label).join(" + ")} over the next 30 days.`;
  }
  return sanitizeText(resolvedGoal?.summary || "", 180);
};

const buildTrackingFromResolvedGoal = (resolvedGoal = {}) => {
  if (resolvedGoal?.targetDate) return { mode: "deadline" };
  if (resolvedGoal?.planningCategory === "strength") {
    return { mode: "logged_lifts", unit: resolvedGoal?.primaryMetric?.unit || "lb", metricKey: resolvedGoal?.primaryMetric?.key || "" };
  }
  if (resolvedGoal?.planningCategory === "body_comp") {
    return { mode: "weekly_checkin", unit: resolvedGoal?.proxyMetrics?.[0]?.unit || resolvedGoal?.primaryMetric?.unit || "lb", metricKey: resolvedGoal?.proxyMetrics?.[0]?.key || resolvedGoal?.primaryMetric?.key || "" };
  }
  return { mode: "progress_tracker", unit: resolvedGoal?.primaryMetric?.unit || resolvedGoal?.proxyMetrics?.[0]?.unit || "", metricKey: resolvedGoal?.primaryMetric?.key || resolvedGoal?.proxyMetrics?.[0]?.key || "" };
};

const createResolvedGoal = ({
  rawText = "",
  goalFamily = GOAL_FAMILIES.generalFitness,
  planningCategory = "general_fitness",
  priority = 1,
  variant = "",
  targetWindow = {},
  proposal = {},
  confirmation = {},
  signals = {},
} = {}) => {
  const metricSet = resolveMetricSet({
    rawText,
    planningCategory,
    goalFamily,
    proposal,
    confirmation,
  });
  const measurableTier = inferMeasurabilityTier({
    goalFamily,
    planningCategory,
    rawText,
    proposal,
    confirmation,
    primaryMetric: metricSet.primaryMetric,
  });
  const unresolvedGaps = buildUnresolvedGaps({
    goalFamily,
    planningCategory,
    measurableTier,
    targetWindow,
    proposal,
    confirmation,
    signals,
    primaryMetric: metricSet.primaryMetric,
  });
  const confidence = inferConfidenceLevel({
    measurabilityTier: measurableTier,
    targetWindow,
    proposal,
    confirmation,
    unresolvedGaps,
    primaryMetric: metricSet.primaryMetric,
  });
  const summary = buildSummary({
    rawText,
    goalFamily,
    planningCategory,
    variant,
    primaryMetric: metricSet.primaryMetric,
    targetWindow,
    confirmation,
  });
  const tradeoffs = buildTradeoffs({
    goalFamily,
    variant,
    proposal,
    confirmation,
    signals,
  });
  const first30DaySuccessDefinition = buildThirtyDaySuccessDefinition({
    goalFamily,
    planningCategory,
    variant,
    measurableTier,
  });

  return {
    id: `goal_resolution_${priority}_${slugify(summary, `goal_${priority}`)}`,
    status: unresolvedGaps.length ? "resolved_with_gaps" : "resolved",
    confirmedByUser: Boolean(confirmation?.confirmed),
    confirmationSource: confirmation?.source || "user_confirmation",
    planningPriority: priority,
    goalFamily,
    planningCategory: confirmation?.edits?.planningCategory || planningCategory,
    summary,
    rawIntent: {
      text: rawText,
    },
    measurabilityTier: measurableTier,
    primaryMetric: metricSet.primaryMetric,
    proxyMetrics: metricSet.proxyMetrics,
    targetDate: targetWindow?.targetDate || "",
    targetHorizonWeeks: targetWindow?.targetHorizonWeeks || null,
    confidence,
    unresolvedGaps,
    tradeoffs,
    first30DaySuccessDefinition,
    reviewCadence: REVIEW_CADENCE_BY_TIER[measurableTier] || "weekly",
    refinementTrigger: REFINE_TRIGGER_BY_TIER[measurableTier] || "30_day_resolution_review",
    proposalReference: {
      interpretedGoalType: proposal?.interpretedGoalType || "",
      measurabilityTier: proposal?.measurabilityTier || "",
      coachSummary: proposal?.coachSummary || "",
    },
  };
};

const buildGoalBlueprints = ({
  goalFamily = GOAL_FAMILIES.generalFitness,
  signals = {},
} = {}) => {
  if ((signals.hasFatLoss && signals.hasKeepStrength) || (goalFamily === GOAL_FAMILIES.hybrid && signals.hasFatLoss && signals.hasStrength)) {
    return [
      { goalFamily: GOAL_FAMILIES.bodyComp, planningCategory: "body_comp", priority: 1, variant: "body_comp_primary_with_strength_retention" },
      { goalFamily: GOAL_FAMILIES.strength, planningCategory: "strength", priority: 2, variant: "strength_maintenance" },
    ];
  }
  if (goalFamily === GOAL_FAMILIES.hybrid) {
    return [
      { goalFamily: GOAL_FAMILIES.hybrid, planningCategory: "running", priority: 1, variant: "hybrid_endurance" },
      { goalFamily: GOAL_FAMILIES.hybrid, planningCategory: "strength", priority: 2, variant: "hybrid_strength" },
    ];
  }
  return [{
    goalFamily,
    planningCategory: GOAL_FAMILY_TO_PLANNING_CATEGORY[goalFamily] || "general_fitness",
    priority: 1,
    variant: "",
  }];
};

export const projectResolvedGoalToPlanningGoal = (resolvedGoal = {}, index = 0) => {
  const planningPriority = Number(resolvedGoal?.planningPriority || index + 1) || (index + 1);
  const targetDate = sanitizeText(resolvedGoal?.targetDate || "", 24);
  const type = targetDate ? "time_bound" : "ongoing";
  const tracking = buildTrackingFromResolvedGoal(resolvedGoal);

  return {
    id: `goal_${planningPriority}_${slugify(resolvedGoal?.summary || "", `goal_${planningPriority}`)}`,
    name: sanitizeText(resolvedGoal?.summary || "Resolved goal", 120),
    category: sanitizeText(resolvedGoal?.planningCategory || "general_fitness", 40) || "general_fitness",
    priority: planningPriority,
    targetDate,
    targetHorizonWeeks: Number.isFinite(Number(resolvedGoal?.targetHorizonWeeks)) ? Math.max(1, Math.round(Number(resolvedGoal.targetHorizonWeeks))) : null,
    measurableTarget: buildPlanningTargetText(resolvedGoal),
    active: true,
    type,
    tracking,
    confidenceLevel: sanitizeText(resolvedGoal?.confidence || GOAL_CONFIDENCE_LEVELS.low, 20).toLowerCase() || GOAL_CONFIDENCE_LEVELS.low,
    unresolvedGaps: [...(resolvedGoal?.unresolvedGaps || [])],
    tradeoffs: [...(resolvedGoal?.tradeoffs || [])],
    goalFamily: sanitizeText(resolvedGoal?.goalFamily || "", 40).toLowerCase(),
    measurabilityTier: sanitizeText(resolvedGoal?.measurabilityTier || "", 40).toLowerCase(),
    primaryMetric: resolvedGoal?.primaryMetric || null,
    proxyMetrics: [...(resolvedGoal?.proxyMetrics || [])],
    first30DaySuccessDefinition: sanitizeText(resolvedGoal?.first30DaySuccessDefinition || "", 220),
    reviewCadence: sanitizeText(resolvedGoal?.reviewCadence || "weekly", 40),
    refinementTrigger: sanitizeText(resolvedGoal?.refinementTrigger || "30_day_resolution_review", 60),
    resolvedGoal: {
      ...resolvedGoal,
    },
  };
};

export const buildPlanningGoalsFromResolvedGoals = ({ resolvedGoals = [] } = {}) => (
  (Array.isArray(resolvedGoals) ? resolvedGoals : []).map((resolvedGoal, index) => projectResolvedGoalToPlanningGoal(resolvedGoal, index))
);

export const applyResolvedGoalsToGoalSlots = ({
  resolvedGoals = [],
  goalSlots = [],
} = {}) => {
  const planningGoals = buildPlanningGoalsFromResolvedGoals({ resolvedGoals });
  let planningIndex = 0;
  return (Array.isArray(goalSlots) ? goalSlots : []).map((slot) => {
    if (slot?.category === "injury_prevention" || slot?.id === "g_resilience") {
      return {
        ...slot,
        active: true,
      };
    }
    const nextGoal = planningGoals[planningIndex];
    planningIndex += 1;
    if (!nextGoal) {
      return {
        ...slot,
        active: false,
        targetDate: "",
        measurableTarget: "",
        resolvedGoal: null,
      };
    }
    return {
      ...slot,
      ...nextGoal,
      id: slot?.id || nextGoal.id,
      priority: slot?.priority || nextGoal.priority,
      active: true,
    };
  });
};

export const buildGoalStateFromResolvedGoals = ({
  resolvedGoals = [],
  planStartDate = "",
} = {}) => {
  const primary = (Array.isArray(resolvedGoals) ? resolvedGoals : [])[0] || null;
  const priorityOrder = (Array.isArray(resolvedGoals) ? resolvedGoals : [])
    .map((goal) => sanitizeText(goal?.summary || "", 120))
    .filter(Boolean)
    .join(" > ");
  return {
    primaryGoal: primary?.summary || "",
    priority: primary?.planningCategory || "undecided",
    priorityOrder,
    deadline: primary?.targetDate || "",
    planStartDate: sanitizeText(planStartDate || toDateKey(new Date()), 24),
    milestones: {
      day30: primary?.first30DaySuccessDefinition || "Complete a truthful first 30-day success definition.",
      day60: "Refine the goal based on actual metrics, consistency, and recovery.",
      day90: "Push the confirmed goal structure with clearer tradeoffs and targets.",
    },
    confidence: GOAL_CONFIDENCE_SCORES[primary?.confidence || GOAL_CONFIDENCE_LEVELS.low] || GOAL_CONFIDENCE_SCORES.low,
  };
};

export const resolveGoalTranslation = ({
  rawUserGoalIntent = "",
  typedIntakePacket = {},
  aiInterpretationProposal = null,
  explicitUserConfirmation = {},
  now = new Date(),
} = {}) => {
  const intakeContext = resolveIntakeContext(typedIntakePacket);
  const rawText = getCorpusText({ rawUserGoalIntent, intakeContext });
  const proposal = normalizeAiInterpretationProposal(aiInterpretationProposal);
  const confirmation = normalizeUserConfirmation(explicitUserConfirmation);
  const signals = detectSignals(rawText);
  const goalFamily = inferGoalFamily({
    proposal,
    confirmation,
    signals,
  });
  const targetWindow = resolveTargetWindow({
    rawText,
    intakeContext,
    proposal,
    confirmation,
    now,
  });
  const goalBlueprints = buildGoalBlueprints({
    goalFamily,
    signals,
  });
  const resolvedGoals = goalBlueprints.map((blueprint, index) => createResolvedGoal({
    rawText,
    goalFamily: blueprint.goalFamily,
    planningCategory: blueprint.planningCategory,
    priority: blueprint.priority || index + 1,
    variant: blueprint.variant || "",
    targetWindow,
    proposal,
    confirmation,
    signals,
  }));
  const planningGoals = buildPlanningGoalsFromResolvedGoals({ resolvedGoals });
  const unresolvedGaps = dedupeStrings(resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []));
  const tradeoffs = dedupeStrings(resolvedGoals.flatMap((goal) => goal?.tradeoffs || []));
  const primaryConfidence = resolvedGoals[0]?.confidence || GOAL_CONFIDENCE_LEVELS.low;

  return {
    rawIntent: rawText,
    resolvedGoals,
    planningGoals,
    confidenceLevel: primaryConfidence,
    confidenceScore: GOAL_CONFIDENCE_SCORES[primaryConfidence] || GOAL_CONFIDENCE_SCORES.low,
    unresolvedGaps,
    tradeoffs,
    intakePacketVersion: sanitizeText(typedIntakePacket?.version || "", 40),
  };
};
