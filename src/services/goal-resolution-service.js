import { dedupeStrings } from "../utils/collection-utils.js";
import { buildGoalCapabilityPacket } from "./goal-capability-resolution-service.js";
import { isOpenEndedTimingValue } from "./goal-timing-service.js";
import { normalizeGoalTemplateSelection } from "./goal-template-catalog-service.js";
import { resolveStructuredGoalPath } from "./goal-resolution/structured-goal-resolution-service.js";

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
  athleticPower: "athletic_power",
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
  [GOAL_FAMILIES.athleticPower]: "strength",
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
const SWIM_KEYWORD_PATTERN = /\b(swim|swimming|pool|open water|lap|laps|freestyle|backstroke|breaststroke|butterfly)\b/i;

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
const hasFiniteNumericValue = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

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
      primaryMetric: null,
      proxyMetrics: [],
      suggestedMetrics: [],
      confidence: "",
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
  const suggestedMetrics = uniqMetrics([
    proposal?.primaryMetric || null,
    ...(proposal?.proxyMetrics || []),
    ...(proposal?.suggestedMetrics || proposal?.metrics || []),
  ]);
  return {
    interpretedGoalType: sanitizeText(proposal?.interpretedGoalType || proposal?.goalFamily || "", 40).toLowerCase(),
    measurabilityTier: sanitizeText(proposal?.measurabilityTier || "", 40).toLowerCase(),
    primaryMetric: suggestedMetrics.find((metric) => metric.kind === "primary") || null,
    proxyMetrics: suggestedMetrics.filter((metric) => metric.kind !== "primary"),
    suggestedMetrics,
    confidence: sanitizeText(proposal?.confidence || proposal?.confidenceLevel || "", 20).toLowerCase(),
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
    targetHorizonWeeks: hasFiniteNumericValue(confirmation?.edits?.targetHorizonWeeks ?? confirmation?.targetHorizonWeeks)
      ? Math.max(1, Math.min(104, Math.round(Number(confirmation.edits?.targetHorizonWeeks ?? confirmation?.targetHorizonWeeks))))
      : null,
    openEnded: Boolean(confirmation?.edits?.openEnded || isOpenEndedTimingValue(confirmation?.edits?.targetDate || "") || isOpenEndedTimingValue(confirmation?.targetDate || "")),
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

const getRawGoalIntentText = ({ rawUserGoalIntent = "", intakeContext = {} } = {}) => sanitizeText(
  typeof rawUserGoalIntent === "string"
    ? rawUserGoalIntent
    : rawUserGoalIntent?.text || intakeContext?.rawGoalText || "",
  420
);

const getCorpusText = ({ rawUserGoalIntent = "", intakeContext = {} } = {}) => dedupeStrings([
  getRawGoalIntentText({ rawUserGoalIntent, intakeContext }),
  sanitizeText(intakeContext?.rawGoalText || "", 420),
  sanitizeText(intakeContext?.baselineContext?.primaryGoalLabel || "", 80),
  sanitizeText(intakeContext?.baselineContext?.currentBaseline || "", 180),
  sanitizeText(intakeContext?.userProvidedConstraints?.additionalContext || "", 180),
  ...toArray(intakeContext?.userProvidedConstraints?.timingConstraints).map((item) => sanitizeText(item, 120)),
  ...toArray(intakeContext?.userProvidedConstraints?.appearanceConstraints).map((item) => sanitizeText(item, 120)),
  ...toArray(intakeContext?.goalCompletenessContext?.summaryLines).map((item) => sanitizeText(item, 140)),
  ...toArray(intakeContext?.goalCompletenessContext?.timingHints).map((item) => sanitizeText(item, 120)),
]).join(". ");

const countGoalDomainSignals = (signals = {}) => {
  let count = 0;
  if (signals?.hasRunning || signals?.hasSwimming) count += 1;
  if (signals?.hasStrength) count += 1;
  if (signals?.hasFatLoss || signals?.hasAppearance) count += 1;
  if (signals?.hasAthleticPower) count += 1;
  return count;
};

const detectSignals = (text = "") => {
  const corpus = sanitizeText(text, 1200).toLowerCase();
  const runningTokens = "(run|marathon|half marathon|10k|5k|race|pace|endurance|aerobic)";
  const strengthTokens = "(bench|squat|deadlift|overhead press|ohp|strength|stronger|lift|lifting|upper body|gain muscle|build muscle|add muscle|put on muscle|muscle gain|hypertrophy|arm muscle|arm size|bicep|biceps|tricep|triceps|bigger arms)";
  const bodyCompTokens = "(lose fat|fat loss|body fat|bodyfat|cut|lean|leaner|get lean|get leaner|drop weight|lose weight|visible abs|six pack|look athletic|physique|appearance|aesthetic(?:s)?|defined|definition)";
  const mixedConnector = "(and|plus|while|but|without losing|without giving up|while keeping|while maintaining)";
  const explicitRunningStrengthMixPattern = new RegExp(
    `(?:${runningTokens}[\\s\\S]{0,80}${mixedConnector}[\\s\\S]{0,80}${strengthTokens})|(?:${strengthTokens}[\\s\\S]{0,80}${mixedConnector}[\\s\\S]{0,80}${runningTokens})`,
    "i"
  );
  const explicitStrengthBodyCompMixPattern = new RegExp(
    `(?:${strengthTokens}[\\s\\S]{0,80}${mixedConnector}[\\s\\S]{0,80}${bodyCompTokens})|(?:${bodyCompTokens}[\\s\\S]{0,80}${mixedConnector}[\\s\\S]{0,80}${strengthTokens})`,
    "i"
  );
  const explicitRunningBodyCompMixPattern = new RegExp(
    `(?:${runningTokens}[\\s\\S]{0,80}${mixedConnector}[\\s\\S]{0,80}${bodyCompTokens})|(?:${bodyCompTokens}[\\s\\S]{0,80}${mixedConnector}[\\s\\S]{0,80}${runningTokens})`,
    "i"
  );
  const runningMentionIndex = corpus.search(/\b(run|marathon|half marathon|10k|5k|race|pace|endurance|aerobic)\b/i);
  const strengthMentionIndex = corpus.search(/\b(bench|squat|deadlift|overhead press|ohp|strength|lift|lifting)\b/i);
  const bodyCompMentionIndex = corpus.search(/\b(lose fat|fat loss|body fat|bodyfat|cut|lean|leaner|get lean|get leaner|drop weight|lose weight|visible abs|six pack|look athletic|physique|appearance)\b/i);
  const hasBodyFatPercentageTarget = /(?:\bbody[- ]?fat\b|\bbodyfat\b|\bbf\b)[\s\S]{0,18}\b(?:under|below|around|at|to)?\s*\d{1,2}(?:\.\d+)?\s*%|\b\d{1,2}(?:\.\d+)?\s*%\s*(?:body[- ]?fat|bodyfat|bf)\b/i.test(corpus);
  return {
    hasRunning: /(run|marathon|half marathon|10k|5k|race|pace|endurance|aerobic)/i.test(corpus),
    hasSwimming: SWIM_KEYWORD_PATTERN.test(corpus),
    hasHalfMarathon: /\bhalf marathon\b/i.test(corpus),
    hasMarathon: /(^|\s)marathon(\s|$)/i.test(corpus) && !/\bhalf marathon\b/i.test(corpus),
    has10k: /\b10k\b/i.test(corpus),
    has5k: /\b5k\b/i.test(corpus),
    hasStrength: /(bench|squat|deadlift|overhead press|ohp|strength|stronger|lift|lifting|gain[\s\S]{0,20}muscle|build[\s\S]{0,20}muscle|add[\s\S]{0,20}muscle|put on[\s\S]{0,20}muscle|muscle gain|hypertrophy|arm muscle|arm size|bicep|biceps|tricep|triceps|bigger arms)/i.test(corpus),
    hasBench: /\bbench(?: press)?\b/i.test(corpus),
    hasSquat: /\bsquat\b/i.test(corpus),
    hasDeadlift: /\bdeadlift\b/i.test(corpus),
    hasFatLoss: /(lose fat|fat loss|body fat|bodyfat|cut|lean|leaner|drop weight|lose weight|lose\s+\d{1,3}\s*(?:lb|lbs|pounds?))/i.test(corpus),
    hasAppearance: /(visible abs|abs|six pack|look athletic|appearance|physique|aesthetic(?:s)?|toned|defined|definition|lean for)/i.test(corpus) || hasBodyFatPercentageTarget,
    hasAthleticPower: /(dunk|vertical jump|vertical|jump higher|jumping higher|increase vertical|explosive power|athletic power|more explosive|jump performance)/i.test(corpus),
    hasSwimBenchmark: /\b(100|200|400|500|800|1000|1500|1650|mile|2\.4)\b/i.test(corpus),
    hasHybrid: /\bhybrid athlete\b|\bhybrid\b/i.test(corpus),
    hasKeepStrength: /(keep strength|maintain strength|keep my strength|hold strength)/i.test(corpus),
    hasExplicitRunningStrengthMix: explicitRunningStrengthMixPattern.test(corpus),
    hasExplicitStrengthBodyCompMix: explicitStrengthBodyCompMixPattern.test(corpus),
    hasExplicitRunningBodyCompMix: explicitRunningBodyCompMixPattern.test(corpus),
    runningMentionIndex,
    strengthMentionIndex,
    bodyCompMentionIndex,
    hasBodyFatPercentageTarget,
    hasMalformedBmiPercent: /(?:\bbmi\b[\s\S]{0,18}\b\d{1,2}(?:\.\d+)?\s*%)|(?:\b\d{1,2}(?:\.\d+)?\s*%\b[\s\S]{0,18}\bbmi\b)/i.test(corpus),
    hasReEntry: /(back in shape|get back in shape|get back into shape|feel like myself again|return to form|return to training|start training again|train again|work out again|re-entry|re entry)/i.test(corpus),
    hasSafeRebuild: /(postpartum|after having a baby|after baby|pelvic floor|rebuild[\s\S]{0,24}safely|safe rebuild|without getting hurt|stop hurting|without making .* worse|recover(?:ing)? from|recovery after|after injury|after surgery)/i.test(corpus),
    raw: corpus,
  };
};

const selectGoalInferenceSignals = ({
  rawIntentText = "",
  analysisText = "",
} = {}) => {
  const rawSignals = detectSignals(rawIntentText);
  const analysisSignals = detectSignals(analysisText || rawIntentText);
  const rawExplicitMixed = Boolean(
    rawSignals.hasHybrid
    || rawSignals.hasExplicitRunningStrengthMix
    || rawSignals.hasExplicitStrengthBodyCompMix
    || rawSignals.hasExplicitRunningBodyCompMix
    || (rawSignals.hasFatLoss && rawSignals.hasKeepStrength)
  );
  const rawDomainCount = countGoalDomainSignals(rawSignals);
  const rawHasDirectFamilySignal = Boolean(
    rawSignals.hasRunning
    || rawSignals.hasSwimming
    || rawSignals.hasStrength
    || rawSignals.hasFatLoss
    || rawSignals.hasAppearance
    || rawSignals.hasAthleticPower
  );
  if (!rawExplicitMixed && rawDomainCount <= 1 && rawHasDirectFamilySignal) {
    return {
      ...analysisSignals,
      hasRunning: rawSignals.hasRunning,
      hasSwimming: rawSignals.hasSwimming,
      hasHalfMarathon: rawSignals.hasHalfMarathon,
      hasMarathon: rawSignals.hasMarathon,
      has10k: rawSignals.has10k,
      has5k: rawSignals.has5k,
      hasStrength: rawSignals.hasStrength,
      hasBench: rawSignals.hasBench,
      hasSquat: rawSignals.hasSquat,
      hasDeadlift: rawSignals.hasDeadlift,
      hasFatLoss: rawSignals.hasFatLoss,
      hasAppearance: rawSignals.hasAppearance,
      hasAthleticPower: rawSignals.hasAthleticPower,
      hasBodyFatPercentageTarget: rawSignals.hasBodyFatPercentageTarget,
      hasHybrid: false,
      hasKeepStrength: rawSignals.hasKeepStrength,
      hasExplicitRunningStrengthMix: false,
      hasExplicitStrengthBodyCompMix: false,
      hasExplicitRunningBodyCompMix: false,
      runningMentionIndex: rawSignals.runningMentionIndex,
      strengthMentionIndex: rawSignals.strengthMentionIndex,
      bodyCompMentionIndex: rawSignals.bodyCompMentionIndex,
      raw: rawSignals.raw,
    };
  }
  return analysisSignals;
};

const normalizeClockToken = (value = "") => {
  const token = String(value || "").trim();
  if (!token) return "";
  return token.split(":").length === 2 ? `${token}:00` : token;
};

const minutesToClockToken = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "";
  const wholeMinutes = Math.round(totalMinutes);
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:00`;
};

const extractTimeToken = (text = "") => {
  const normalized = String(text || "");
  const clockMatch = normalized.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (clockMatch?.[1]) return normalizeClockToken(clockMatch[1]);

  const hourMatch = normalized.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\b/i);
  const minuteMatch = normalized.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:minute|minutes|min|mins)\b/i);
  if (hourMatch?.[1] || minuteMatch?.[1]) {
    const totalMinutes = (Number(hourMatch?.[1] || 0) * 60) + Number(minuteMatch?.[1] || 0);
    return minutesToClockToken(totalMinutes);
  }
  return "";
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
  const cleanedText = String(text || "")
    .replace(/(?:\bbody[- ]?fat\b|\bbodyfat\b|\bbf\b)[\s\S]{0,18}\b(?:under|below|around|at|to)?\s*\d{1,2}(?:\.\d+)?\s*%/ig, " ")
    .replace(/\b\d{1,2}(?:\.\d+)?\s*%\s*(?:body[- ]?fat|bodyfat|bf)\b/ig, " ");
  const liftMap = [
    { pattern: /\bbench(?: press)?\b/i, key: "bench_press_weight", label: "Bench press", unit: "lb" },
    { pattern: /\bsquat\b/i, key: "squat_weight", label: "Squat", unit: "lb" },
    { pattern: /\bdeadlift\b/i, key: "deadlift_weight", label: "Deadlift", unit: "lb" },
    { pattern: /\boverhead press\b|\bohp\b/i, key: "overhead_press_weight", label: "Overhead press", unit: "lb" },
  ];
  const lift = liftMap.find((item) => item.pattern.test(cleanedText));
  if (!lift) return null;
  const localLiftMatch = cleanedText.match(new RegExp(`${lift.pattern.source}[\\s:,-]{0,8}(\\d{2,4}(?:\\.\\d+)?)`, "i"));
  const reverseLiftMatch = cleanedText.match(new RegExp(`(\\d{2,4}(?:\\.\\d+)?)\\s*(?:lb|lbs|pounds?)?[\\s:,-]{0,8}${lift.pattern.source}`, "i"));
  const localTargetValue = localLiftMatch?.[1] || reverseLiftMatch?.[1] || "";
  const explicitWeightMatches = Array.from(cleanedText.matchAll(/\b(\d{2,4}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/ig))
    .map((match) => Number(match?.[1] || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const topSetMatches = Array.from(String(text || "").matchAll(/\b(\d{2,4}(?:\.\d+)?)\s*[x×]\s*\d{1,2}\b/ig))
    .map((match) => Number(match?.[1] || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const genericWeightMatches = Array.from(cleanedText.matchAll(/\b(\d{2,4}(?:\.\d+)?)\b/g))
    .map((match) => Number(match?.[1] || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const protocolMatch = String(text || "").match(/\b(\d{2,4}(?:\.\d+)?)\s*[x×]\s*(\d{1,2})\s*[x×]\s*(\d{1,2})\b/i);
  const candidateWeights = explicitWeightMatches.length
    ? explicitWeightMatches
    : topSetMatches.length
    ? topSetMatches
    : genericWeightMatches;
  const targetValue = localTargetValue || (candidateWeights.length ? String(Math.max(...candidateWeights)) : "");
  return {
    key: lift.key,
    label: lift.label,
    unit: lift.unit,
    kind: "primary",
    ...(targetValue ? { targetValue } : {}),
    ...(protocolMatch?.[2] ? { targetSets: Math.max(1, Math.round(Number(protocolMatch[2]))) } : {}),
    ...(protocolMatch?.[3] ? { targetReps: Math.max(1, Math.round(Number(protocolMatch[3]))) } : {}),
  };
};

const resolveAppearanceBodyCompFamily = (signals = {}) => (
  signals?.hasBodyFatPercentageTarget || (signals?.hasAppearance && !signals?.hasFatLoss)
    ? GOAL_FAMILIES.appearance
    : GOAL_FAMILIES.bodyComp
);

const extractWeightLossPrimaryMetric = (text = "") => {
  const normalized = String(text || "");
  const weightLossMatch = normalized.match(/\blose\s+(\d{1,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i);
  if (weightLossMatch?.[1]) {
    return {
      key: "bodyweight_change",
      label: "Bodyweight change",
      unit: "lb",
      kind: "primary",
      targetValue: `-${weightLossMatch[1]}`,
    };
  }
  const targetWeightMatch = normalized.match(/\b(?:cut|get|drop|lean|weigh|reach|down)\s+(?:down\s+)?(?:to|under)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i);
  if (!targetWeightMatch?.[1]) return null;
  return {
    key: "bodyweight_target",
    label: "Bodyweight",
    unit: "lb",
    kind: "primary",
    targetValue: targetWeightMatch[1],
  };
};

const extractAthleticPowerPrimaryMetric = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const verticalMatch = normalized.match(/(?:\b(\d{1,2}(?:\.\d+)?)\s*(?:in|inch|inches)\b[\s\S]{0,16}\bvertical\b)|(?:\bvertical\b[\s\S]{0,16}\b(\d{1,2}(?:\.\d+)?)\s*(?:in|inch|inches)\b)/i);
  const targetValue = verticalMatch?.[1] || verticalMatch?.[2] || "";
  if (!targetValue) return null;
  return {
    key: "vertical_jump_height",
    label: "Vertical jump",
    unit: "in",
    kind: "primary",
    targetValue,
  };
};

const extractSwimmingPrimaryMetric = (text = "") => {
  const raceTime = extractTimeToken(text);
  if (!raceTime || !SWIM_KEYWORD_PATTERN.test(text)) return null;
  if (/\bmile\b/i.test(text)) {
    return { key: "swim_mile_time", label: "Swim mile time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  if (/\b1500\b/i.test(text)) {
    return { key: "swim_1500m_time", label: "1500m swim time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  if (/\b500\b/i.test(text)) {
    return { key: "swim_500_time", label: "500 swim time", unit: "time", kind: "primary", targetValue: raceTime };
  }
  return { key: "swim_time", label: "Swim time", unit: "time", kind: "primary", targetValue: raceTime };
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
    ]);
  }
  return uniqMetrics([
    { key: "weekly_training_frequency", label: "Weekly training frequency", unit: "sessions", kind: "proxy" },
    { key: "checkin_consistency", label: "Check-in consistency", unit: "checkins", kind: "proxy" },
    { key: "thirty_day_adherence", label: "30-day adherence", unit: "sessions", kind: "proxy" },
  ]);
};

const defaultProxyMetricsForGoal = ({
  planningCategory = "general_fitness",
  goalFamily = GOAL_FAMILIES.generalFitness,
  signals = {},
} = {}) => {
  if (signals?.hasSwimming) {
    return uniqMetrics([
      { key: "weekly_swim_frequency", label: "Weekly swim frequency", unit: "sessions", kind: "proxy" },
      { key: "aerobic_swim_duration", label: "Aerobic swim duration", unit: "min", kind: "proxy" },
      { key: "technique_consistency", label: "Technique consistency", unit: "sessions", kind: "proxy" },
    ]);
  }
  if (goalFamily === GOAL_FAMILIES.athleticPower) {
    return uniqMetrics([
      { key: "vertical_jump_touchpoint", label: "Jump touch point", unit: "checkins", kind: "proxy" },
      { key: "lower_body_power_sessions", label: "Lower-body power sessions", unit: "sessions", kind: "proxy" },
      { key: "approach_jump_quality", label: "Approach jump quality", unit: "checkins", kind: "proxy" },
    ]);
  }
  return defaultProxyMetricsForCategory(planningCategory);
};

const buildValidationIssues = ({
  signals = {},
} = {}) => {
  const issues = [];
  if (signals.hasMalformedBmiPercent) {
    issues.push({
      key: "bmi_percent_mismatch",
      severity: "block",
      summary: "BMI is not a percentage target. Clarify whether you mean body fat under 10% or a BMI under a non-percent number.",
      prompt: "Did you mean body fat under 10%, or a BMI under a non-percent number like 25?",
    });
  }
  return issues;
};

const resolveMetricSet = ({
  rawText = "",
  planningCategory = "general_fitness",
  goalFamily = GOAL_FAMILIES.generalFitness,
  signals = {},
  proposal = {},
  confirmation = {},
  templateSelection = null,
} = {}) => {
  const confirmationPrimary = confirmation?.edits?.primaryMetric ? uniqMetrics([{ ...(confirmation.edits.primaryMetric || {}), kind: "primary" }])[0] || null : null;
  const confirmationProxy = uniqMetrics((confirmation?.edits?.proxyMetrics || []).map((metric) => ({ ...metric, kind: "proxy" })));
  const proposalPrimary = (proposal?.suggestedMetrics || []).find((metric) => metric.kind === "primary") || null;
  const proposalPrimaryMetric = proposal?.primaryMetric || proposalPrimary || null;
  const proposalProxy = (proposal?.proxyMetrics || []).length ? proposal.proxyMetrics : (proposal?.suggestedMetrics || []).filter((metric) => metric.kind !== "primary");
  const templatePrimary = templateSelection?.primaryMetric ? uniqMetrics([{ ...(templateSelection.primaryMetric || {}), kind: "primary" }])[0] || null : null;
  const templateProxy = uniqMetrics((templateSelection?.proxyMetrics || []).map((metric) => ({ ...metric, kind: "proxy" })));

  let heuristicPrimary = null;
  if (planningCategory === "running") heuristicPrimary = extractRunningPrimaryMetric(rawText);
  if (!heuristicPrimary && signals?.hasSwimming) heuristicPrimary = extractSwimmingPrimaryMetric(rawText);
  if (!heuristicPrimary && planningCategory === "strength") heuristicPrimary = extractStrengthPrimaryMetric(rawText);
  if (!heuristicPrimary && goalFamily === GOAL_FAMILIES.athleticPower) heuristicPrimary = extractAthleticPowerPrimaryMetric(rawText);
  if (!heuristicPrimary && planningCategory === "body_comp" && goalFamily !== GOAL_FAMILIES.appearance) heuristicPrimary = extractWeightLossPrimaryMetric(rawText);

  const primaryMetric = confirmationPrimary || templatePrimary || heuristicPrimary || (confirmation?.acceptedProposal !== false ? proposalPrimaryMetric : null) || null;
  const proxyMetrics = uniqMetrics([
    ...confirmationProxy,
    ...templateProxy,
    ...(confirmation?.acceptedProposal !== false ? proposalProxy : []),
    ...defaultProxyMetricsForGoal({ planningCategory, goalFamily, signals }),
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
  if (confirmation?.edits?.openEnded) {
    return { targetDate: "", targetHorizonWeeks: null, isApproximate: false };
  }
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
    ...toArray(intakeContext?.goalCompletenessContext?.timingHints),
  ]).join(" ").toLowerCase();

  const isoDateMatch = corpus.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDateMatch?.[1]) {
    return {
      targetDate: isoDateMatch[1],
      targetHorizonWeeks: calculateWeeksFromNow({ now, targetDate: isoDateMatch[1] }),
      isApproximate: false,
    };
  }

  const relativeWeeksMatch = corpus.match(/\b(?:in\s+)?(\d{1,2})\s*(?:week|weeks|wk|wks)\b/i);
  if (relativeWeeksMatch?.[1]) {
    return {
      targetDate: "",
      targetHorizonWeeks: Math.max(1, Math.min(104, Math.round(Number(relativeWeeksMatch[1])))),
      isApproximate: true,
    };
  }

  const relativeMonthsMatch = corpus.match(/\b(?:in\s+)?(\d{1,2})\s*(?:month|months|mo)\b/i);
  if (relativeMonthsMatch?.[1]) {
    return {
      targetDate: "",
      targetHorizonWeeks: Math.max(1, Math.min(104, Math.round(Number(relativeMonthsMatch[1]) * 4.35))),
      isApproximate: true,
    };
  }

  const relativeYearsMatch = corpus.match(/\b(?:in\s+)?(\d{1,2})\s*(?:year|years|yr|yrs)\b/i);
  if (relativeYearsMatch?.[1]) {
    return {
      targetDate: "",
      targetHorizonWeeks: Math.max(1, Math.min(104, Math.round(Number(relativeYearsMatch[1]) * 52))),
      isApproximate: true,
    };
  }

  if (/\bnext year\b/i.test(corpus)) {
    return {
      targetDate: "",
      targetHorizonWeeks: 52,
      isApproximate: true,
    };
  }

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
  templateSelection = null,
} = {}) => {
  const explicitMixedGoal = Boolean(
    signals.hasHybrid
    || (signals.hasFatLoss && signals.hasKeepStrength)
    || signals.hasExplicitRunningStrengthMix
    || signals.hasExplicitStrengthBodyCompMix
    || signals.hasExplicitRunningBodyCompMix
  );
  if (confirmation?.edits?.goalFamily && Object.values(GOAL_FAMILIES).includes(confirmation.edits.goalFamily)) {
    return confirmation.edits.goalFamily;
  }
  if (Object.values(GOAL_FAMILIES).includes(templateSelection?.goalFamily)) {
    return templateSelection.goalFamily;
  }
  if (
    confirmation?.acceptedProposal !== false
    && Object.values(GOAL_FAMILIES).includes(proposal?.interpretedGoalType)
    && (proposal?.interpretedGoalType !== GOAL_FAMILIES.hybrid || explicitMixedGoal)
  ) {
    return proposal.interpretedGoalType;
  }
  if (explicitMixedGoal) return GOAL_FAMILIES.hybrid;
  if (signals.hasAthleticPower) return GOAL_FAMILIES.athleticPower;
  if (signals.hasBodyFatPercentageTarget) return GOAL_FAMILIES.appearance;
  if (signals.hasAppearance) return GOAL_FAMILIES.appearance;
  if (signals.hasFatLoss) return GOAL_FAMILIES.bodyComp;
  if (
    (signals.hasSafeRebuild || signals.hasReEntry)
    && !signals.hasFatLoss
    && !signals.hasAppearance
    && !signals.hasBench
    && !signals.hasSquat
    && !signals.hasDeadlift
    && !signals.hasRunning
    && !signals.hasSwimming
    && !signals.hasAthleticPower
  ) {
    return GOAL_FAMILIES.reEntry;
  }
  if (signals.hasStrength) return GOAL_FAMILIES.strength;
  if (signals.hasSwimming) return GOAL_FAMILIES.performance;
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
  if (goalFamily === GOAL_FAMILIES.athleticPower && primaryMetric) return GOAL_MEASURABILITY_TIERS.fullyMeasurable;
  if (goalFamily === GOAL_FAMILIES.athleticPower) return GOAL_MEASURABILITY_TIERS.proxyMeasurable;
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
  if (confirmation?.acceptedProposal !== false && Object.values(GOAL_CONFIDENCE_LEVELS).includes(proposal?.confidence)) {
    return proposal.confidence;
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
  if (goalFamily === GOAL_FAMILIES.athleticPower) {
    return measurableTier === GOAL_MEASURABILITY_TIERS.fullyMeasurable
      ? "Complete 8 lower-body power sessions over the next 30 days and recheck your jump benchmark weekly."
      : "Complete 8 lower-body power sessions over the next 30 days and log one jump or rim-touch check each week.";
  }
  if (variant === "strength_maintenance") {
    return "Keep two logged strength sessions each week over the next 30 days while another priority leads.";
  }
  if (goalFamily === GOAL_FAMILIES.performance && planningCategory === "general_fitness") {
    return "Complete 8 swim-specific sessions over the next 30 days and log one benchmark or technique check each week.";
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
  if (goalFamily === GOAL_FAMILIES.appearance && planningCategory === "body_comp") {
    return "Complete 12 planned sessions and log 4 weekly waist or bodyweight proxy check-ins over the next 30 days.";
  }
  if (planningCategory === "body_comp") {
    return "Complete 12 planned sessions and log 4 weekly body-composition check-ins over the next 30 days.";
  }
  return "Complete 12 planned sessions in 30 days and log 4 weekly check-ins so consistency becomes measurable.";
};

const buildRunningEventLabel = (rawText = "") => {
  if (/\bhalf marathon\b/i.test(rawText)) return "half marathon";
  if (/\bmarathon\b/i.test(rawText) && !/\bhalf marathon\b/i.test(rawText)) return "marathon";
  if (/\b10k\b/i.test(rawText)) return "10k";
  if (/\b5k\b/i.test(rawText)) return "5k";
  if (/\brace\b/i.test(rawText)) return "race";
  return "event";
};

const buildSummary = ({
  rawText = "",
  goalFamily = GOAL_FAMILIES.generalFitness,
  planningCategory = "general_fitness",
  variant = "",
  primaryMetric = null,
  targetWindow = {},
  confirmation = {},
  templateSelection = null,
} = {}) => {
  if (confirmation?.edits?.summary) return confirmation.edits.summary;
  if (variant === "hybrid_endurance") {
    return "Build running endurance while strength stays supportive";
  }
  if (variant === "hybrid_strength") {
    return "Build strength while endurance stays in the week";
  }
  if (goalFamily === GOAL_FAMILIES.athleticPower && /\bdunk\b/i.test(rawText)) {
    return "Dunk a basketball";
  }
  if (goalFamily === GOAL_FAMILIES.athleticPower && /(?:\bvertical\b|\bjump higher\b|\bjumping higher\b)/i.test(rawText)) {
    return primaryMetric?.targetValue
      ? `Raise your vertical jump to ${primaryMetric.targetValue} ${primaryMetric.unit}`.trim()
      : "Improve jump power and vertical pop";
  }
  if (variant === "strength_maintenance") return "Keep strength in the plan while another priority leads";
  if (variant === "body_comp_primary_with_strength_retention") return "Lose fat while keeping strength";
  if (
    planningCategory === "body_comp"
    && (primaryMetric?.key === "bodyweight_change" || primaryMetric?.key === "bodyweight_target")
    && primaryMetric?.targetValue
  ) {
    return primaryMetric?.key === "bodyweight_target"
      ? `Cut to ${primaryMetric.targetValue} lb`
      : `Lose ${String(primaryMetric.targetValue).replace(/^-/, "")} lb`;
  }
  if (goalFamily === GOAL_FAMILIES.appearance && /\b(visible abs|six pack)\b/i.test(rawText)) {
    return targetWindow?.targetHorizonWeeks ? "Improve midsection definition by the target window" : "Improve midsection definition";
  }
  if (
    goalFamily === GOAL_FAMILIES.appearance
    && /(?:\bbody[- ]?fat\b|\bbodyfat\b|\bbf\b)[\s\S]{0,18}\d{1,2}(?:\.\d+)?\s*%|\b\d{1,2}(?:\.\d+)?\s*%\s*(?:body[- ]?fat|bodyfat|bf)\b/i.test(rawText)
  ) {
    return targetWindow?.targetHorizonWeeks ? "Lean out toward the target body-fat range by the target window" : "Lean out toward the target body-fat range";
  }
  if ((goalFamily === GOAL_FAMILIES.appearance || goalFamily === GOAL_FAMILIES.bodyComp) && /\bget lean(?:er)?\b/i.test(rawText)) {
    return targetWindow?.targetHorizonWeeks ? "Get leaner within the current time window" : "Get leaner";
  }
  if (goalFamily === GOAL_FAMILIES.appearance && /\blook athletic again\b/i.test(rawText)) {
    return "Look athletic again with repeatable training";
  }
  if (goalFamily === GOAL_FAMILIES.appearance && /\bupper[- ]body\b/i.test(rawText) && /\b(aesthetic(?:s)?|defined|definition|visible)\b/i.test(rawText)) {
    return "Improve upper-body aesthetics";
  }
  if (planningCategory === "strength" && !primaryMetric?.targetValue && /\b(arm|arms|bicep|biceps|tricep|triceps)\b/i.test(rawText) && /\b(gain|build|add|put on)\b[\s\S]{0,20}\bmuscle\b/i.test(rawText)) {
    return "Build arm muscle";
  }
  if (planningCategory === "strength" && !primaryMetric?.targetValue && /\b(gain|build|add|put on)\b[\s\S]{0,20}\bmuscle\b/i.test(rawText)) {
    return "Gain muscle with repeatable training";
  }
  if (planningCategory === "strength" && !primaryMetric?.targetValue && /(?:\bget stronger\b|\bstronger\b)/i.test(rawText)) {
    return "Get stronger with repeatable training";
  }
  if (goalFamily === GOAL_FAMILIES.performance && /\b(swim|swimming|pool|open water|laps?)\b/i.test(rawText)) {
    if (primaryMetric?.targetValue && /mile/i.test(primaryMetric?.label || rawText)) {
      return `Swim a mile in ${primaryMetric.targetValue}`;
    }
    if (/\bmile\b/i.test(rawText)) return "Swim a faster mile";
    return "Swim faster with repeatable technique";
  }
  if (planningCategory === "running" && !primaryMetric?.targetValue && /\bhalf marathon\b/i.test(rawText)) {
    return "Run a half marathon";
  }
  if (planningCategory === "running" && !primaryMetric?.targetValue && /\bmarathon\b/i.test(rawText) && !/\bhalf marathon\b/i.test(rawText)) {
    return "Run a marathon";
  }
  if (planningCategory === "running" && !primaryMetric?.targetValue && /\b10k\b/i.test(rawText)) {
    return "Run a 10k";
  }
  if (planningCategory === "running" && !primaryMetric?.targetValue && /\b5k\b/i.test(rawText)) {
    return "Run a 5k";
  }
  if (planningCategory === "running" && primaryMetric?.targetValue && /half marathon/i.test(primaryMetric?.label || "")) {
    return `Run a half marathon in ${primaryMetric.targetValue}`;
  }
  if (planningCategory === "running" && primaryMetric?.targetValue && /marathon/i.test(primaryMetric?.label || "") && !/half marathon/i.test(primaryMetric?.label || "")) {
    return `Run a marathon in ${primaryMetric.targetValue}`;
  }
  if (planningCategory === "running" && primaryMetric?.targetValue) {
    return `Run your ${buildRunningEventLabel(rawText)} in ${primaryMetric.targetValue}`;
  }
  if (planningCategory === "strength" && primaryMetric?.targetValue) {
    const targetSets = Number(primaryMetric?.targetSets);
    const targetReps = Number(primaryMetric?.targetReps);
    const baseTarget = `${primaryMetric.label} ${primaryMetric.targetValue} ${primaryMetric.unit}`.trim();
    if (Number.isFinite(targetSets) && targetSets > 0 && Number.isFinite(targetReps) && targetReps > 0) {
      return `${baseTarget} for ${targetSets} x ${targetReps}`;
    }
    if (Number.isFinite(targetReps) && targetReps > 0) {
      return `${baseTarget} for ${targetReps} reps`;
    }
    return baseTarget;
  }
  if (templateSelection?.summary) return templateSelection.summary;
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
  if (variant === "body_comp_primary_with_strength_retention" || (signals.hasFatLoss && signals.hasStrength)) {
    heuristicTradeoffs.push("Aggressive fat loss may limit strength progression and recovery quality.");
  }
  if (goalFamily === GOAL_FAMILIES.athleticPower) {
    heuristicTradeoffs.push("Jump-performance work competes with heavy lower-body fatigue and aggressive cutting.");
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
  validationIssues = [],
} = {}) => {
  const gaps = [];
  if (validationIssues.length) {
    gaps.push(...validationIssues.map((issue) => issue.summary));
  }
  if (!targetWindow?.targetDate && !targetWindow?.targetHorizonWeeks && planningCategory === "running") {
    gaps.push("Need a target race date or horizon to time the block structure precisely.");
  }
  if (targetWindow?.isApproximate && !targetWindow?.targetDate) {
    gaps.push("Exact target date is still approximate.");
  }
  if (goalFamily === GOAL_FAMILIES.hybrid) {
    gaps.push("Need the preferred balance between endurance and strength if one lane should lead.");
  }
  if (signals.hasSwimming && !signals.hasSwimBenchmark && !primaryMetric) {
    gaps.push("Need recent swim distance or time context if you want tighter swim progression than a first 30-day block.");
  }
  if (signals.hasSwimming && !/\b(pool|open water|lake|ocean)\b/i.test(String(signals.raw || ""))) {
    gaps.push("Need pool or open-water access reality if swim structure should be more precise.");
  }
  if (signals.hasBodyFatPercentageTarget) {
    gaps.push("Need a waist or bodyweight proxy, or a reliable body-fat measurement method, if the percentage target should guide planning.");
  }
  if (goalFamily === GOAL_FAMILIES.appearance && !signals.hasFatLoss) {
    gaps.push("Need a clearer appearance marker if physique precision matters.");
  }
  if (goalFamily === GOAL_FAMILIES.athleticPower && !primaryMetric) {
    gaps.push("Need a cleaner jump or dunk benchmark if you want tighter progression than a first 30-day block.");
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
    const targetSets = Number(primaryMetric?.targetSets);
    const targetReps = Number(primaryMetric?.targetReps);
    const baseTarget = `${primaryMetric.label} ${primaryMetric.targetValue}${primaryMetric.unit && primaryMetric.unit !== "time" ? ` ${primaryMetric.unit}` : ""}`.trim();
    if (Number.isFinite(targetSets) && targetSets > 0 && Number.isFinite(targetReps) && targetReps > 0) {
      return `${baseTarget} for ${targetSets} x ${targetReps}`;
    }
    if (Number.isFinite(targetReps) && targetReps > 0) {
      return `${baseTarget} for ${targetReps} reps`;
    }
    return baseTarget;
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
  if (resolvedGoal?.goalFamily === GOAL_FAMILIES.athleticPower) {
    return {
      mode: "progress_tracker",
      unit: resolvedGoal?.primaryMetric?.unit || resolvedGoal?.proxyMetrics?.[0]?.unit || "",
      metricKey: resolvedGoal?.primaryMetric?.key || resolvedGoal?.proxyMetrics?.[0]?.key || "",
    };
  }
  if (resolvedGoal?.planningCategory === "strength") {
    return { mode: "logged_lifts", unit: resolvedGoal?.primaryMetric?.unit || "lb", metricKey: resolvedGoal?.primaryMetric?.key || "" };
  }
  if (resolvedGoal?.planningCategory === "body_comp") {
    return { mode: "weekly_checkin", unit: resolvedGoal?.proxyMetrics?.[0]?.unit || resolvedGoal?.primaryMetric?.unit || "lb", metricKey: resolvedGoal?.proxyMetrics?.[0]?.key || resolvedGoal?.primaryMetric?.key || "" };
  }
  return { mode: "progress_tracker", unit: resolvedGoal?.primaryMetric?.unit || resolvedGoal?.proxyMetrics?.[0]?.unit || "", metricKey: resolvedGoal?.primaryMetric?.key || resolvedGoal?.proxyMetrics?.[0]?.key || "" };
};

const enrichResolvedGoalWithCapabilityPacket = (resolvedGoal = {}) => {
  if (!resolvedGoal || typeof resolvedGoal !== "object") return resolvedGoal;
  const capabilityPacket = buildGoalCapabilityPacket({
    goal: {
      id: resolvedGoal.id,
      name: resolvedGoal.summary,
      category: resolvedGoal.planningCategory,
      goalFamily: resolvedGoal.goalFamily,
      targetHorizonWeeks: resolvedGoal.targetHorizonWeeks,
      tradeoffs: resolvedGoal.tradeoffs,
      resolvedGoal,
    },
  });
  return {
    ...resolvedGoal,
    primaryDomain: capabilityPacket?.primaryDomain || resolvedGoal?.primaryDomain || "",
    secondaryDomains: capabilityPacket?.secondaryDomains || resolvedGoal?.secondaryDomains || [],
    candidateDomainAdapters: capabilityPacket?.candidateDomainAdapters || resolvedGoal?.candidateDomainAdapters || [],
    fallbackPlanningMode: capabilityPacket?.fallbackPlanningMode || resolvedGoal?.fallbackPlanningMode || "",
    missingAnchors: capabilityPacket?.missingAnchors || resolvedGoal?.missingAnchors || [],
    driverProfile: capabilityPacket?.driverProfile || resolvedGoal?.driverProfile || null,
  };
};

const createResolvedGoal = ({
  rawIntentText = "",
  analysisText = "",
  goalFamily = GOAL_FAMILIES.generalFitness,
  planningCategory = "general_fitness",
  priority = 1,
  variant = "",
  targetWindow = {},
  proposal = {},
  confirmation = {},
  signals = {},
  templateSelection = null,
} = {}) => {
  const metricText = rawIntentText || analysisText;
  const validationIssues = buildValidationIssues({ signals });
  const metricSet = resolveMetricSet({
    rawText: metricText,
    planningCategory,
    goalFamily,
    signals,
    proposal,
    confirmation,
    templateSelection,
  });
  const measurableTier = inferMeasurabilityTier({
    goalFamily,
    planningCategory,
    rawText: metricText,
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
    validationIssues,
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
    rawText: rawIntentText || analysisText,
    goalFamily,
    planningCategory,
    variant,
    primaryMetric: metricSet.primaryMetric,
    targetWindow,
    confirmation,
    templateSelection,
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

  const resolvedGoal = {
    id: `goal_resolution_${priority}_${slugify(summary, `goal_${priority}`)}`,
    status: validationIssues.some((issue) => issue.severity === "block")
      ? "needs_clarification"
      : unresolvedGaps.length
      ? "resolved_with_gaps"
      : "resolved",
    confirmedByUser: Boolean(confirmation?.confirmed),
    confirmationSource: confirmation?.source || "user_confirmation",
    planningPriority: priority,
    goalFamily,
    planningCategory: confirmation?.edits?.planningCategory || planningCategory,
    summary,
    rawIntent: {
      text: rawIntentText || analysisText,
    },
    measurabilityTier: measurableTier,
    primaryMetric: metricSet.primaryMetric,
    proxyMetrics: metricSet.proxyMetrics,
    targetDate: targetWindow?.targetDate || "",
    targetHorizonWeeks: targetWindow?.targetHorizonWeeks || null,
    confidence,
    unresolvedGaps,
    validationIssues,
    tradeoffs,
    first30DaySuccessDefinition,
    reviewCadence: REVIEW_CADENCE_BY_TIER[measurableTier] || "weekly",
    refinementTrigger: REFINE_TRIGGER_BY_TIER[measurableTier] || "30_day_resolution_review",
    proposalReference: {
      interpretedGoalType: proposal?.interpretedGoalType || "",
      measurabilityTier: proposal?.measurabilityTier || "",
      coachSummary: proposal?.coachSummary || "",
    },
    goalTemplateId: sanitizeText(templateSelection?.templateId || "", 80),
  };
  return enrichResolvedGoalWithCapabilityPacket(resolvedGoal);
};

const buildGoalBlueprints = ({
  goalFamily = GOAL_FAMILIES.generalFitness,
  signals = {},
} = {}) => {
  const hasRunningBodyCompStack = Boolean(
    signals.hasRunning
    && (signals.hasFatLoss || signals.hasAppearance)
  );
  if (signals.hasRunning && signals.hasStrength && (signals.hasFatLoss || signals.hasAppearance)) {
    return [
      { goalFamily: GOAL_FAMILIES.performance, planningCategory: "running", priority: 1, variant: "running_primary" },
      { goalFamily: GOAL_FAMILIES.strength, planningCategory: "strength", priority: 2, variant: "strength_secondary" },
      ...(signals.hasFatLoss
        ? [{ goalFamily: GOAL_FAMILIES.bodyComp, planningCategory: "body_comp", priority: 3, variant: "body_comp_secondary" }]
        : []),
      ...(signals.hasAppearance
        ? [{ goalFamily: GOAL_FAMILIES.appearance, planningCategory: "body_comp", priority: 4, variant: "appearance_secondary" }]
        : []),
    ];
  }
  if (hasRunningBodyCompStack) {
    const secondaryBodyCompFamily = resolveAppearanceBodyCompFamily(signals);
    return [
      { goalFamily: GOAL_FAMILIES.performance, planningCategory: "running", priority: 1, variant: "running_primary" },
      { goalFamily: secondaryBodyCompFamily, planningCategory: "body_comp", priority: 2, variant: "body_comp_secondary" },
      ...(signals.hasFatLoss && signals.hasAppearance
        ? [{ goalFamily: GOAL_FAMILIES.appearance, planningCategory: "body_comp", priority: 3, variant: "appearance_secondary" }]
        : []),
    ];
  }
  if (signals.hasExplicitStrengthBodyCompMix) {
    const secondaryBodyCompFamily = resolveAppearanceBodyCompFamily(signals);
    const strengthLeads = Number.isFinite(signals.strengthMentionIndex)
      && signals.strengthMentionIndex >= 0
      && (!Number.isFinite(signals.bodyCompMentionIndex) || signals.bodyCompMentionIndex < 0 || signals.strengthMentionIndex <= signals.bodyCompMentionIndex);
    return strengthLeads
      ? [
          { goalFamily: GOAL_FAMILIES.strength, planningCategory: "strength", priority: 1, variant: "strength_primary" },
          { goalFamily: secondaryBodyCompFamily, planningCategory: "body_comp", priority: 2, variant: "body_comp_secondary" },
        ]
      : [
          { goalFamily: secondaryBodyCompFamily, planningCategory: "body_comp", priority: 1, variant: "body_comp_primary_with_strength_retention" },
          { goalFamily: GOAL_FAMILIES.strength, planningCategory: "strength", priority: 2, variant: "strength_maintenance" },
        ];
  }
  if (signals.hasExplicitRunningBodyCompMix) {
    const secondaryBodyCompFamily = resolveAppearanceBodyCompFamily(signals);
    const runningLeads = Number.isFinite(signals.runningMentionIndex)
      && signals.runningMentionIndex >= 0
      && (!Number.isFinite(signals.bodyCompMentionIndex) || signals.bodyCompMentionIndex < 0 || signals.runningMentionIndex <= signals.bodyCompMentionIndex);
    return runningLeads
      ? [
          { goalFamily: GOAL_FAMILIES.performance, planningCategory: "running", priority: 1, variant: "running_primary" },
          { goalFamily: secondaryBodyCompFamily, planningCategory: "body_comp", priority: 2, variant: "body_comp_secondary" },
        ]
      : [
          { goalFamily: secondaryBodyCompFamily, planningCategory: "body_comp", priority: 1, variant: "body_comp_primary" },
          { goalFamily: GOAL_FAMILIES.performance, planningCategory: "running", priority: 2, variant: "running_secondary" },
        ];
  }
  if ((signals.hasFatLoss && signals.hasKeepStrength) || (goalFamily === GOAL_FAMILIES.hybrid && signals.hasFatLoss && signals.hasStrength)) {
    return [
      { goalFamily: GOAL_FAMILIES.bodyComp, planningCategory: "body_comp", priority: 1, variant: "body_comp_primary_with_strength_retention" },
      { goalFamily: GOAL_FAMILIES.strength, planningCategory: "strength", priority: 2, variant: "strength_maintenance" },
    ];
  }
  if (goalFamily === GOAL_FAMILIES.athleticPower) {
    return [
      { goalFamily: GOAL_FAMILIES.athleticPower, planningCategory: "strength", priority: 1, variant: "athletic_power_primary" },
    ];
  }
  if (signals.hasSwimming && !signals.hasRunning) {
    return [
      { goalFamily: GOAL_FAMILIES.performance, planningCategory: "general_fitness", priority: 1, variant: "swim_primary" },
    ];
  }
  if (signals.hasRunning && (signals.hasKeepStrength || signals.hasExplicitRunningStrengthMix)) {
    return [
      { goalFamily: GOAL_FAMILIES.performance, planningCategory: "running", priority: 1, variant: "running_primary" },
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
  const goalRole = sanitizeText(resolvedGoal?.intakeConfirmedRole || (planningPriority === 1 ? "primary" : "maintained"), 40).toLowerCase() || (planningPriority === 1 ? "primary" : "maintained");

  return {
    id: `goal_${planningPriority}_${slugify(resolvedGoal?.summary || "", `goal_${planningPriority}`)}`,
    name: sanitizeText(resolvedGoal?.summary || "Resolved goal", 120),
    category: sanitizeText(resolvedGoal?.planningCategory || "general_fitness", 40) || "general_fitness",
    priority: planningPriority,
    targetDate,
    targetHorizonWeeks: hasFiniteNumericValue(resolvedGoal?.targetHorizonWeeks) ? Math.max(1, Math.round(Number(resolvedGoal.targetHorizonWeeks))) : null,
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
    goalRole,
    resolvedGoal: {
      ...resolvedGoal,
      intakeConfirmedRole: goalRole,
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
  const slots = Array.isArray(goalSlots) ? goalSlots : [];
  const resilienceSlot = slots.find((slot) => slot?.category === "injury_prevention" || slot?.id === "g_resilience") || null;
  const planningSlots = slots.filter((slot) => !(slot?.category === "injury_prevention" || slot?.id === "g_resilience"));
  const assignedGoals = planningSlots.map((slot, index) => {
    const nextGoal = planningGoals[index];
    if (!nextGoal) {
      return {
        ...slot,
        active: false,
        targetDate: "",
        targetHorizonWeeks: null,
        measurableTarget: "",
        resolvedGoal: null,
      };
    }
    return {
      ...slot,
      ...nextGoal,
      id: slot?.id || nextGoal.id,
      priority: index + 1,
      active: true,
    };
  });
  const overflowGoals = planningGoals.slice(planningSlots.length).map((goal, overflowIndex) => ({
    ...goal,
    id: `g_additional_${planningSlots.length + overflowIndex + 1}`,
    priority: planningSlots.length + overflowIndex + 1,
    active: true,
  }));
  const nextGoals = [
    ...assignedGoals,
    ...overflowGoals,
  ];
  if (!resilienceSlot) return nextGoals;
  return [
    ...nextGoals,
    {
      ...resilienceSlot,
      active: true,
      priority: nextGoals.length + 1,
    },
  ];
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

const countCrossDomainSignals = (signals = {}) => {
  let count = 0;
  if (signals.hasRunning || signals.hasSwimming) count += 1;
  if (signals.hasStrength) count += 1;
  if (signals.hasFatLoss || signals.hasAppearance) count += 1;
  if (signals.hasAthleticPower) count += 1;
  return count;
};

const shouldPreferLegacyMixedGoalResolution = ({
  rawIntentText = "",
  signals = {},
  structuredResolution = null,
} = {}) => {
  const normalizedText = sanitizeText(rawIntentText, 420).toLowerCase();
  const rawSignals = detectSignals(rawIntentText);
  const canonicalRunLiftPhrase = /\b(run and lift|running and strength|keep running but get stronger|stronger first,? but i still want (?:a bit of )?running|lift while training for (?:a )?(5k|10k|half marathon|marathon))\b/i.test(normalizedText);
  const canonicalBalancedHybridPhrase = /\b(stronger and fitter|strength and conditioning together|aesthetic plus endurance|look athletic and keep my endurance|lose fat while preserving my running)\b/i.test(normalizedText);
  const canonicalStrengthCutPhrase = /\b(keep strength while cutting|maintain strength while losing fat)\b/i.test(normalizedText);
  const canonicalRecompPhrase = /\b(recomp|recomposition|lose fat and gain muscle|lose fat while gaining muscle)\b/i.test(normalizedText);
  const canonicalSwimTechniquePhrase = /\b(swim (?:better|faster)|improve my swim|swim endurance and technique)\b/i.test(normalizedText);
  const canonicalStructuredHybridPhrase = canonicalRunLiftPhrase || canonicalBalancedHybridPhrase || canonicalStrengthCutPhrase;
  const explicitReEntryCue = /\b(back in shape|get back in shape|get back into shape|feel like myself again|return to form|return to training|start training again|train again|work out again|re-entry|re entry)\b/i.test(normalizedText);
  const explicitSafeRebuildCue = /\b(postpartum|after having a baby|after baby|pelvic floor|rebuild[\s\S]{0,24}safely|safe rebuild|without getting hurt|stop hurting|without making .* worse|recover(?:ing)? from|recovery after|after injury|after surgery)\b/i.test(normalizedText);
  const structuredDiscoveryFamily = sanitizeText(structuredResolution?.resolvedGoal?.goalDiscoveryFamilyId || "", 40).toLowerCase();
  const structuredIntentId = sanitizeText(structuredResolution?.resolvedGoal?.structuredIntentId || "", 80).toLowerCase();
  const hasSeparatedGoalPhrases = /[.;\n]/.test(String(rawIntentText || ""));
  const hasMixedConnector = /\b(and|plus|while|but|also|with|maybe)\b/i.test(normalizedText);
  const crossDomainSignalCount = countCrossDomainSignals(rawSignals);
  const explicitIndependentGoalDraft = hasSeparatedGoalPhrases || (crossDomainSignalCount >= 2 && hasMixedConnector);
  const strongReEntrySignal = Boolean(
    explicitSafeRebuildCue
    || (
      explicitReEntryCue
      && !rawSignals.hasRunning
      && !rawSignals.hasSwimming
      && !rawSignals.hasBench
      && !rawSignals.hasSquat
      && !rawSignals.hasDeadlift
      && !rawSignals.hasAthleticPower
    )
  );
  const structuredMixedIntent = [
    "run_and_lift",
    "stronger_and_fitter",
    "aesthetic_plus_endurance",
    "sport_support",
    "seasonal_sport_support",
    "tactical_fitness",
    "triathlon_multisport",
  ].includes(structuredIntentId);
  const protectedStructuredIntent = [
    "swim_better",
    "recomp",
    "keep_strength_while_cutting",
    "get_back_in_shape",
    "rebuild_routine",
    "run_and_lift",
    "stronger_and_fitter",
    "aesthetic_plus_endurance",
    "sport_support",
    "seasonal_sport_support",
    "tactical_fitness",
  ].includes(structuredIntentId);
  const explicitMixedGoalDraft = Boolean(
    (rawSignals.hasExplicitRunningStrengthMix && !canonicalRunLiftPhrase)
    || (rawSignals.hasExplicitStrengthBodyCompMix && !canonicalStrengthCutPhrase && !canonicalRecompPhrase)
    || (rawSignals.hasExplicitRunningBodyCompMix && !canonicalBalancedHybridPhrase)
    || (rawSignals.hasFatLoss && rawSignals.hasKeepStrength && !canonicalStrengthCutPhrase && !canonicalRecompPhrase)
    || /\bhybrid athlete\b/i.test(normalizedText)
  );
  const shouldForceStructuredIntent = protectedStructuredIntent
    && !explicitMixedGoalDraft
    && !explicitIndependentGoalDraft
    && !rawSignals.hasAthleticPower;

  if (shouldForceStructuredIntent) {
    return false;
  }

  if ((canonicalStructuredHybridPhrase || canonicalRecompPhrase || canonicalSwimTechniquePhrase) && !explicitMixedGoalDraft && !hasSeparatedGoalPhrases) {
    return false;
  }
  if (
    (structuredDiscoveryFamily === "hybrid" || structuredMixedIntent)
    && !explicitMixedGoalDraft
    && !strongReEntrySignal
    && !rawSignals.hasAthleticPower
    && !hasSeparatedGoalPhrases
  ) {
    return false;
  }
  return Boolean(
    rawSignals.hasHybrid
    || rawSignals.hasAthleticPower
    || strongReEntrySignal
    || rawSignals.hasExplicitRunningStrengthMix
    || rawSignals.hasExplicitStrengthBodyCompMix
    || rawSignals.hasExplicitRunningBodyCompMix
    || (rawSignals.hasFatLoss && rawSignals.hasKeepStrength)
    || explicitIndependentGoalDraft
  );
};

export const resolveGoalTranslation = ({
  rawUserGoalIntent = "",
  typedIntakePacket = {},
  aiInterpretationProposal = null,
  explicitUserConfirmation = {},
  now = new Date(),
} = {}) => {
  const intakeContext = resolveIntakeContext(typedIntakePacket);
  const templateSelection = normalizeGoalTemplateSelection(intakeContext?.goalTemplateSelection || null);
  const rawIntentText = getRawGoalIntentText({ rawUserGoalIntent, intakeContext });
  const analysisText = getCorpusText({ rawUserGoalIntent: rawIntentText, intakeContext });
  const proposal = normalizeAiInterpretationProposal(aiInterpretationProposal);
  const confirmation = normalizeUserConfirmation(explicitUserConfirmation);
  const signals = selectGoalInferenceSignals({
    rawIntentText,
    analysisText,
  });
  const structuredResolution = resolveStructuredGoalPath({
    rawIntentText,
    intakeContext,
    templateSelection,
    now,
  });
  const preferLegacyMixedResolution = !templateSelection && shouldPreferLegacyMixedGoalResolution({
    rawIntentText,
    signals,
    structuredResolution,
  });
  if (structuredResolution?.resolvedGoal && !preferLegacyMixedResolution) {
    const resolvedGoals = [enrichResolvedGoalWithCapabilityPacket({
      ...structuredResolution.resolvedGoal,
      confirmedByUser: Boolean(confirmation?.confirmed),
      confirmationSource: confirmation?.source || structuredResolution.resolvedGoal?.confirmationSource || "structured_intake",
      summary: confirmation?.edits?.summary || structuredResolution.resolvedGoal?.summary || "",
      planningCategory: confirmation?.edits?.planningCategory || structuredResolution.resolvedGoal?.planningCategory || "general_fitness",
      goalFamily: confirmation?.edits?.goalFamily || structuredResolution.resolvedGoal?.goalFamily || GOAL_FAMILIES.generalFitness,
      targetDate: confirmation?.edits?.openEnded
        ? ""
        : confirmation?.edits?.targetDate || structuredResolution.resolvedGoal?.targetDate || "",
      targetHorizonWeeks: confirmation?.edits?.openEnded
        ? null
        : confirmation?.edits?.targetHorizonWeeks ?? structuredResolution.resolvedGoal?.targetHorizonWeeks ?? null,
      tradeoffs: dedupeStrings([
        ...(structuredResolution.resolvedGoal?.tradeoffs || []),
        ...(confirmation?.edits?.tradeoffs || []),
      ]).slice(0, 4),
      unresolvedGaps: dedupeStrings([
        ...(structuredResolution.resolvedGoal?.unresolvedGaps || []),
        ...(confirmation?.edits?.unresolvedGaps || []),
      ]).slice(0, 4),
    })];
    const planningGoals = buildPlanningGoalsFromResolvedGoals({ resolvedGoals });
    const primaryConfidence = resolvedGoals[0]?.confidence || GOAL_CONFIDENCE_LEVELS.low;
    return {
      rawIntent: rawIntentText,
      resolvedGoals,
      planningGoals,
      confidenceLevel: primaryConfidence,
      confidenceScore: GOAL_CONFIDENCE_SCORES[primaryConfidence] || GOAL_CONFIDENCE_SCORES.low,
      unresolvedGaps: dedupeStrings(resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || [])),
      tradeoffs: dedupeStrings(resolvedGoals.flatMap((goal) => goal?.tradeoffs || [])),
      intakePacketVersion: sanitizeText(typedIntakePacket?.version || "", 40),
    };
  }
  const goalFamily = inferGoalFamily({
    proposal,
    confirmation,
    signals,
    templateSelection,
  });
  const targetWindow = resolveTargetWindow({
    rawText: rawIntentText,
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
    rawIntentText,
    analysisText,
    goalFamily: blueprint.goalFamily,
    planningCategory: blueprint.planningCategory,
    priority: blueprint.priority || index + 1,
    variant: blueprint.variant || "",
    targetWindow,
    proposal,
    confirmation,
    signals,
    templateSelection,
  }));
  const planningGoals = buildPlanningGoalsFromResolvedGoals({ resolvedGoals });
  const unresolvedGaps = dedupeStrings(resolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []));
  const tradeoffs = dedupeStrings(resolvedGoals.flatMap((goal) => goal?.tradeoffs || []));
  const primaryConfidence = resolvedGoals[0]?.confidence || GOAL_CONFIDENCE_LEVELS.low;

  return {
    rawIntent: rawIntentText,
    resolvedGoals,
    planningGoals,
    confidenceLevel: primaryConfidence,
    confidenceScore: GOAL_CONFIDENCE_SCORES[primaryConfidence] || GOAL_CONFIDENCE_SCORES.low,
    unresolvedGaps,
    tradeoffs,
    intakePacketVersion: sanitizeText(typedIntakePacket?.version || "", 40),
  };
};
