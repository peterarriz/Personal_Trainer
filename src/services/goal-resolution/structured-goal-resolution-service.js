import {
  findStructuredGoalIntentById,
  inferStructuredGoalIntentFromText,
  resolveStructuredGoalIntentId,
} from "../../data/goal-intents/index.js";
import {
  listPlanArchetypes,
} from "../../data/plan-archetypes/index.js";

const GOAL_MEASURABILITY_TIERS = {
  fullyMeasurable: "fully_measurable",
  proxyMeasurable: "proxy_measurable",
  exploratoryFuzzy: "exploratory_fuzzy",
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

const snakeToCamel = (value = "") => String(value || "").replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const CONTEXT_FIELD_ALIASES = Object.freeze({
  longest_recent_run: ["longest_recent_endurance_session"],
  longest_recent_ride: ["longest_recent_endurance_session"],
  target_timeline: ["timeline"],
});
const fieldKeyToContextCandidates = (key = "") => dedupeStrings([
  sanitizeText(key, 80),
  snakeToCamel(key),
  sanitizeText(key, 80).replace(/_/g, ""),
  ...(CONTEXT_FIELD_ALIASES[sanitizeText(key, 80)] || []),
]);

const METRIC_LABELS = Object.freeze({
  bench_press_weight: { label: "Bench press", unit: "lb" },
  squat_weight: { label: "Squat", unit: "lb" },
  deadlift_weight: { label: "Deadlift", unit: "lb" },
  overhead_press_weight: { label: "Overhead press", unit: "lb" },
  pull_up_weight: { label: "Pull-up load", unit: "lb" },
  half_marathon_time: { label: "Half marathon time", unit: "time" },
  marathon_time: { label: "Marathon time", unit: "time" },
  "10k_time": { label: "10K time", unit: "time" },
  "5k_time": { label: "5K time", unit: "time" },
  bodyweight_trend: { label: "Bodyweight trend", unit: "lb" },
  waist_circumference: { label: "Waist circumference", unit: "in" },
});

const EQUIPMENT_PROFILE_ALIASES = Object.freeze({
  full_gym: "full_gym",
  barbell: "full_gym",
  rack: "full_gym",
  bench: "basic_gym",
  dumbbells_only: "dumbbells_only",
  dumbbells: "dumbbells_only",
  bodyweight: "bands_bodyweight",
  bands: "bands_bodyweight",
  limited_home: "limited_home",
  hotel: "travel",
  travel: "travel",
});

const normalizeChoice = (value = "") => sanitizeText(value, 80).toLowerCase().replace(/\s+/g, "_");

const readFieldRecord = (fields = {}, fieldKey = "") => {
  const record = fields?.[fieldKey];
  return record && typeof record === "object" ? record : null;
};

const readFieldValue = (fields = {}, fieldKey = "") => (
  sanitizeText(readFieldRecord(fields, fieldKey)?.value || readFieldRecord(fields, fieldKey)?.raw || "", 160)
);

const parseDaysPerWeek = (value = null) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.max(1, Math.min(7, Math.round(numeric)));
  const match = sanitizeText(value, 60).match(/(\d+)/);
  return match?.[1] ? Math.max(1, Math.min(7, Math.round(Number(match[1])))) : 3;
};

const normalizeSessionLength = (value = "") => {
  const text = sanitizeText(value, 80).toLowerCase();
  const numeric = Number(text.match(/(\d+)/)?.[1] || 0);
  if (numeric >= 70) return "long_75";
  if (numeric >= 55) return "extended_60";
  if (numeric >= 40) return "standard_45";
  return "short_30";
};

const normalizeEnvironment = (value = "") => {
  const text = sanitizeText(value, 80).toLowerCase();
  if (/travel/.test(text)) return "travel";
  if (/home/.test(text)) return "home";
  if (/gym/.test(text)) return "gym";
  if (/pool/.test(text)) return "pool";
  if (/road|trail|outside|outdoor/.test(text)) return "outdoor";
  if (/both|varies|mixed/.test(text)) return "mixed";
  return "mixed";
};

const normalizeEquipmentProfile = ({ fields = {}, equipment = [], trainingLocation = "" } = {}) => {
  const explicit = normalizeChoice(readFieldValue(fields, "equipment_profile"));
  if (explicit && EQUIPMENT_PROFILE_ALIASES[explicit]) return EQUIPMENT_PROFILE_ALIASES[explicit];
  const joined = `${toArray(equipment).join(" ")} ${trainingLocation}`.toLowerCase();
  if (/barbell|rack|leg press|cable|smith/.test(joined)) return "full_gym";
  if (/bench|machine|gym/.test(joined)) return "basic_gym";
  if (/dumbbell/.test(joined)) return "dumbbells_only";
  if (/band|bodyweight/.test(joined)) return "bands_bodyweight";
  if (/travel|hotel/.test(joined)) return "travel";
  if (/home/.test(joined)) return "limited_home";
  return "mixed";
};

const normalizeExperienceLevel = ({ fields = {}, intakeContext = {}, rawText = "" } = {}) => {
  const explicitTrainingAge = normalizeChoice(readFieldValue(fields, "training_age"));
  if (explicitTrainingAge === "advanced") return "advanced";
  if (explicitTrainingAge === "intermediate") return "intermediate";
  if (explicitTrainingAge === "returning") return "returning";
  if (explicitTrainingAge === "new_to_it" || explicitTrainingAge === "beginner") return "beginner";
  const corpus = `${sanitizeText(intakeContext?.baselineContext?.currentBaseline || "", 180)} ${sanitizeText(rawText, 220)}`.toLowerCase();
  if (/advanced|experienced|competitive/.test(corpus)) return "advanced";
  if (/intermediate/.test(corpus)) return "intermediate";
  if (/return|coming back|time off|restart/.test(corpus)) return "returning";
  if (/beginner|new to|newbie|start lifting/.test(corpus)) return "beginner";
  return "unknown";
};

const normalizeRiskPosture = ({ intent = null, fields = {}, rawText = "" } = {}) => {
  const explicit = normalizeChoice(readFieldValue(fields, "progression_posture"));
  if (["protective", "standard", "progressive"].includes(explicit)) return explicit;
  const corpus = sanitizeText(rawText, 240).toLowerCase();
  if (intent?.familyId === "re_entry" || /safe|conservative|ease back|protected|careful/.test(corpus)) return "protective";
  if (/aggressive|push hard|fast as possible/.test(corpus)) return "progressive";
  return "standard";
};

const resolveTimeline = ({ fields = {}, rawText = "", intakeContext = {}, now = new Date() } = {}) => {
  const explicit = sanitizeText(readFieldValue(fields, "target_timeline") || "", 120);
  const corpus = dedupeStrings([
    explicit,
    sanitizeText(rawText, 180),
    ...(intakeContext?.userProvidedConstraints?.timingConstraints || []),
  ]).join(" ").toLowerCase();
  const relativeWeeks = corpus.match(/\b(\d{1,2})\s*(?:week|weeks|wk|wks)\b/);
  if (relativeWeeks?.[1]) return { targetDate: "", targetHorizonWeeks: Math.max(1, Math.min(52, Number(relativeWeeks[1]))) };
  const relativeMonths = corpus.match(/\b(\d{1,2})\s*(?:month|months|mo)\b/);
  if (relativeMonths?.[1]) return { targetDate: "", targetHorizonWeeks: Math.max(4, Math.min(104, Math.round(Number(relativeMonths[1]) * 4.35))) };
  const isoDate = corpus.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDate?.[1]) {
    const targetDate = isoDate[1];
    const diffWeeks = Math.max(1, Math.round((new Date(`${targetDate}T12:00:00`) - new Date(now)) / (7 * 86400000)));
    return { targetDate, targetHorizonWeeks: diffWeeks };
  }
  const monthMatch = Object.keys(MONTH_INDEX).find((month) => new RegExp(`\\b${month}\\b`, "i").test(corpus));
  if (monthMatch) {
    const safeNow = new Date(now);
    let year = safeNow.getFullYear();
    const monthIndex = MONTH_INDEX[monthMatch];
    if (monthIndex < safeNow.getMonth()) year += 1;
    const targetDate = new Date(year, monthIndex, 1);
    const diffWeeks = Math.max(1, Math.round((targetDate - safeNow) / (7 * 86400000)));
    return { targetDate: "", targetHorizonWeeks: diffWeeks };
  }
  const seasonMatch = Object.keys(SEASON_MONTH_INDEX).find((season) => new RegExp(`\\b${season}\\b`, "i").test(corpus));
  if (seasonMatch) {
    const safeNow = new Date(now);
    let year = safeNow.getFullYear();
    const monthIndex = SEASON_MONTH_INDEX[seasonMatch];
    if (monthIndex < safeNow.getMonth()) year += 1;
    const targetDate = new Date(year, monthIndex, 1);
    const diffWeeks = Math.max(1, Math.round((targetDate - safeNow) / (7 * 86400000)));
    return { targetDate: "", targetHorizonWeeks: diffWeeks };
  }
  return { targetDate: "", targetHorizonWeeks: null };
};

const detectEventDistance = ({ fields = {}, rawText = "", templateSelection = null } = {}) => {
  const explicit = normalizeChoice(readFieldValue(fields, "event_distance") || templateSelection?.specificityDefaults?.event_distance || "");
  if (explicit) return explicit;
  const text = sanitizeText(rawText, 200).toLowerCase();
  if (/marathon/.test(text) && !/half marathon/.test(text)) return "marathon";
  if (/half marathon/.test(text)) return "half_marathon";
  if (/\b10k\b/.test(text)) return "10k";
  if (/\b5k\b/.test(text)) return "5k";
  if (/triathlon|sprint tri/.test(text)) return "sprint_triathlon";
  return "";
};

const resolvePrimaryModality = ({ intent = null, fields = {}, rawText = "" } = {}) => {
  const explicit = normalizeChoice(readFieldValue(fields, "primary_modality"));
  if (explicit) return explicit;
  const text = sanitizeText(rawText, 200).toLowerCase();
  if (intent?.id === "swim_better" || /swim|pool|open water/.test(text)) return "swimming";
  if (intent?.id === "ride_stronger" || /cycling|bike|ride/.test(text)) return "cycling";
  if (intent?.id === "triathlon_multisport" || /triathlon|multisport/.test(text)) return "triathlon";
  if (intent?.familyId === "endurance" || /run|marathon|5k|10k/.test(text)) return "running";
  return "general";
};

const resolveHybridPriority = ({ fields = {}, rawText = "" } = {}) => {
  const explicit = normalizeChoice(readFieldValue(fields, "hybrid_priority"));
  if (explicit) return explicit;
  const text = sanitizeText(rawText, 220).toLowerCase();
  if (/running priority|run first|lift while training for (?:a )?(5k|10k|half marathon|marathon)|while training for (?:a )?(5k|10k|half marathon|marathon)/.test(text)) return "running";
  if (/strength priority|lift first|stronger first|keep running but get stronger/.test(text)) return "strength";
  return "balanced";
};

const resolveRunGoalPosture = (rawText = "") => {
  const text = sanitizeText(rawText, 220).toLowerCase();
  if (/\b(improve|faster|better|quicker|time|pr|personal best|race stronger|stronger marathon|better marathon)\b/.test(text)) return "improvement";
  if (/\b(first|finish|complete|completion)\b/.test(text)) return "completion";
  return "completion";
};

const parseStrengthTarget = (text = "") => {
  const clean = sanitizeText(text, 180).toLowerCase();
  const match = clean.match(/\b(\d{2,4})\s*(?:lb|lbs|pounds?)?\b/);
  return match?.[1] ? `${match[1]}` : "";
};

const normalizeDurationValue = (value = "") => {
  const trimmed = sanitizeText(value, 24);
  if (!trimmed) return "";
  if (/^\d+:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed.split(":").length === 2 ? `${trimmed}:00` : trimmed;
  }
  const minuteMatch = trimmed.match(/(\d{1,3})\s*(?:minute|min)/i);
  if (minuteMatch?.[1]) return `0:${String(minuteMatch[1]).padStart(2, "0")}:00`;
  return "";
};

const extractTimeToken = (text = "") => {
  const normalized = sanitizeText(text, 220);
  const clockMatch = normalized.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  if (clockMatch?.[1]) return normalizeDurationValue(clockMatch[1]);
  const hourMinuteMatch = normalized.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\b(?:\s*(?:and)?\s*(\d{1,2})\s*(?:minute|minutes|min|mins)\b)?/i);
  if (hourMinuteMatch?.[1]) {
    const totalMinutes = (Number(hourMinuteMatch[1]) * 60) + Number(hourMinuteMatch[2] || 0);
    return totalMinutes > 0 ? normalizeDurationValue(`${Math.round(totalMinutes)} min`) : "";
  }
  const minuteMatch = normalized.match(/\b(\d{1,3})\s*(?:minute|minutes|min|mins)\b/i);
  return minuteMatch?.[1] ? normalizeDurationValue(`${minuteMatch[1]} min`) : "";
};

const extractWeightChangeTarget = (text = "") => {
  const normalized = sanitizeText(text, 220).toLowerCase();
  const loseMatch = normalized.match(/\blose\s+(\d{1,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i);
  if (loseMatch?.[1]) return `-${loseMatch[1]}`;
  const gainMatch = normalized.match(/\b(?:gain|add)\s+(\d{1,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i);
  if (gainMatch?.[1]) return gainMatch[1];
  return "";
};

const hasAppearanceTimingCue = (rawText = "", timeline = {}) => {
  if (timeline?.targetDate || timeline?.targetHorizonWeeks) return true;
  return /\b(by|before|for)\b|\bspring\b|\bsummer\b|\bfall\b|\bautumn\b|\bwinter\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\bmay\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/i.test(
    sanitizeText(rawText, 220)
  );
};

const LIFT_FOCUS_METRIC_MAP = Object.freeze({
  bench: { key: "bench_press_weight", label: "Bench press", unit: "lb" },
  squat: { key: "squat_weight", label: "Squat", unit: "lb" },
  deadlift: { key: "deadlift_weight", label: "Deadlift", unit: "lb" },
  ohp: { key: "overhead_press_weight", label: "Overhead press", unit: "lb" },
  pull_up: { key: "pull_up_weight", label: "Pull-up load", unit: "lb" },
});

const buildStructuredLiftTargetMetric = ({
  fields = {},
  templateSelection = null,
  rawText = "",
} = {}) => {
  const liftFocus = normalizeChoice(readFieldValue(fields, "lift_focus") || templateSelection?.specificityDefaults?.lift_focus || "");
  const liftMetric = LIFT_FOCUS_METRIC_MAP[liftFocus] || null;
  if (!liftMetric) return null;
  const targetValue = sanitizeText(
    readFieldValue(fields, "lift_target_weight")
    || parseStrengthTarget(rawText)
    || templateSelection?.specificityDefaults?.metric_target
    || "",
    40
  );
  if (!targetValue) return null;
  const targetRepsRaw = sanitizeText(readFieldValue(fields, "lift_target_reps") || "", 20);
  const targetReps = targetRepsRaw ? Number(targetRepsRaw) : null;
  return {
    ...liftMetric,
    targetValue,
    kind: "primary",
    ...(Number.isFinite(targetReps) && targetReps > 0 ? { targetReps: Math.round(targetReps) } : {}),
  };
};

const buildPrimaryMetric = ({
  archetype = null,
  intent = null,
  rawText = "",
  eventDistance = "",
  templateSelection = null,
  fields = {},
} = {}) => {
  const structuredLiftMetric = buildStructuredLiftTargetMetric({
    fields,
    templateSelection,
    rawText,
  });
  if (structuredLiftMetric && intent?.id === "improve_big_lifts") return structuredLiftMetric;
  const templateMetric = templateSelection?.primaryMetric || null;
  if (templateMetric?.key) return templateMetric;
  if (!archetype) return null;
  if (archetype.id === "lift_focus_bench") {
    const targetValue = structuredLiftMetric?.targetValue || parseStrengthTarget(rawText) || templateSelection?.specificityDefaults?.metric_target || "";
    return targetValue
      ? { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue, kind: "primary" }
      : null;
  }
  if (intent?.id === "lose_body_fat") {
    const targetValue = extractWeightChangeTarget(rawText);
    return targetValue
      ? { key: "bodyweight_change", label: "Bodyweight change", unit: "lb", targetValue, kind: "primary" }
      : null;
  }
  const targetDuration = extractTimeToken(rawText);
  if (eventDistance === "half_marathon") {
    return targetDuration
      ? { key: "half_marathon_time", label: "Half marathon time", unit: "time", targetValue: targetDuration, kind: "primary" }
      : null;
  }
  if (eventDistance === "marathon") {
    return targetDuration
      ? { key: "marathon_time", label: "Marathon time", unit: "time", targetValue: targetDuration, kind: "primary" }
      : null;
  }
  if (eventDistance === "10k") {
    return targetDuration
      ? { key: "10k_time", label: "10K time", unit: "time", targetValue: targetDuration, kind: "primary" }
      : null;
  }
  if (eventDistance === "5k") {
    return targetDuration
      ? { key: "5k_time", label: "5K time", unit: "time", targetValue: targetDuration, kind: "primary" }
      : null;
  }
  if (intent?.id === "swim_better" && targetDuration) {
    if (/\bmile\b/i.test(rawText)) {
      return { key: "swim_mile_time", label: "Swim mile time", unit: "time", targetValue: targetDuration, kind: "primary" };
    }
    return { key: "swim_time", label: "Swim time", unit: "time", targetValue: targetDuration, kind: "primary" };
  }
  return null;
};

const formatPrimaryMetricTarget = (primaryMetric = null) => {
  const targetValue = sanitizeText(primaryMetric?.targetValue || "", 40);
  if (!targetValue) return "";
  const unit = sanitizeText(primaryMetric?.unit || "", 20);
  const targetReps = Number(primaryMetric?.targetReps);
  const valueWithUnit = `${targetValue}${unit ? ` ${unit}` : ""}`.trim();
  if (Number.isFinite(targetReps) && targetReps > 0) {
    return `${valueWithUnit} for ${targetReps} reps`;
  }
  return valueWithUnit;
};

const buildProxyMetrics = ({ archetype = null, intent = null }) => {
  const keys = dedupeStrings([...(archetype?.proxyMetrics || []), ...((intent?.proxyMetrics || []).map((metric) => metric?.key || ""))]).slice(0, 6);
  return keys.map((key) => ({
    key,
    label: METRIC_LABELS[key]?.label || String(key || "").replace(/_/g, " "),
    unit: METRIC_LABELS[key]?.unit || "",
    kind: "proxy",
  }));
};

const buildSummary = ({
  intent = null,
  archetype = null,
  eventDistance = "",
  hybridPriority = "",
  rawText = "",
  primaryMetric = null,
  timeline = {},
  templateSelection = null,
}) => {
  const legacySummary = sanitizeText(templateSelection?.summary || "", 160);
  if (legacySummary && templateSelection?.legacyTemplateId) return legacySummary;
  if (intent?.id === "train_for_run_race" && eventDistance) {
    if (primaryMetric?.targetValue) {
      if (eventDistance === "half_marathon") return `Run a half marathon in ${primaryMetric.targetValue}`;
      if (eventDistance === "marathon") return `Run a marathon in ${primaryMetric.targetValue}`;
      if (eventDistance === "10k") return `Run a 10K in ${primaryMetric.targetValue}`;
      if (eventDistance === "5k") return `Run a 5K in ${primaryMetric.targetValue}`;
    }
    if (eventDistance === "half_marathon") return "Run a half marathon";
    if (eventDistance === "marathon") return "Run a marathon";
    if (eventDistance === "10k") return "Run a 10K";
    if (eventDistance === "5k") return "Run a 5K";
  }
  if (intent?.id === "run_and_lift") {
    if (hybridPriority === "running") return "Run and lift with running priority";
    if (hybridPriority === "strength") return "Run and lift with strength priority";
    return "Run and lift with a balanced split";
  }
  if (intent?.id === "swim_better") {
    if (primaryMetric?.targetValue && /mile/i.test(primaryMetric?.label || rawText)) {
      return `Swim a mile in ${primaryMetric.targetValue}`;
    }
    if (/\bmile\b/i.test(rawText)) return "Swim a faster mile";
    return "Swim faster with repeatable technique";
  }
  if (intent?.id === "build_muscle") {
    return /\b(gain|add|put on)\s+muscle\b/i.test(rawText)
      ? "Gain muscle with repeatable training"
      : "Build muscle";
  }
  if (intent?.id === "improve_big_lifts" && primaryMetric?.targetValue) {
    return `${primaryMetric.label} ${formatPrimaryMetricTarget(primaryMetric)}`.trim();
  }
  if (intent?.id === "get_stronger") return "Get stronger with repeatable training";
  if (intent?.id === "get_leaner") {
    if (/\b(visible abs|six pack)\b/i.test(rawText)) {
      return hasAppearanceTimingCue(rawText, timeline) ? "Improve midsection definition by the target window" : "Improve midsection definition";
    }
    if (/(?:\bbody[- ]?fat\b|\bbodyfat\b|\bbf\b)[\s\S]{0,18}\d{1,2}(?:\.\d+)?\s*%|\b\d{1,2}(?:\.\d+)?\s*%\s*(?:body[- ]?fat|bodyfat|bf)\b/i.test(rawText)) {
      return hasAppearanceTimingCue(rawText, timeline) ? "Lean out toward the target body-fat range by the target window" : "Lean out toward the target body-fat range";
    }
    if (/\blook athletic again\b/i.test(rawText)) return "Look athletic again with repeatable training";
    return hasAppearanceTimingCue(rawText, timeline) ? "Get leaner within the current time window" : "Get leaner";
  }
  if (intent?.id === "lose_body_fat" && primaryMetric?.targetValue) {
    return `Lose ${String(primaryMetric.targetValue).replace(/^-/, "")} lb`;
  }
  if (intent?.id === "triathlon_multisport") return "Train for triathlon or multisport";
  return sanitizeText(intent?.summary || archetype?.displayName || rawText || "Structured goal", 160);
};

const inferStructuredMeasurabilityTier = ({ intent = null, archetype = null, primaryMetric = null } = {}) => {
  const goalFamily = sanitizeText(archetype?.goalFamily || intent?.goalFamily || "", 40).toLowerCase();
  const planningCategory = sanitizeText(archetype?.planningCategory || intent?.planningCategory || "", 40).toLowerCase();
  if (primaryMetric?.targetValue) return GOAL_MEASURABILITY_TIERS.fullyMeasurable;
  if (goalFamily === "appearance" || goalFamily === "body_comp") return GOAL_MEASURABILITY_TIERS.proxyMeasurable;
  if (goalFamily === "hybrid" || goalFamily === "re_entry" || goalFamily === "general_fitness") return GOAL_MEASURABILITY_TIERS.exploratoryFuzzy;
  if (planningCategory === "running" || planningCategory === "strength" || goalFamily === "performance") {
    return GOAL_MEASURABILITY_TIERS.proxyMeasurable;
  }
  return primaryMetric?.key ? GOAL_MEASURABILITY_TIERS.proxyMeasurable : GOAL_MEASURABILITY_TIERS.exploratoryFuzzy;
};

const hasBodyFatPercentageLanguage = (text = "") => (
  /(?:\bbody[- ]?fat\b|\bbodyfat\b|\bbf\b)[\s\S]{0,18}\d{1,2}(?:\.\d+)?\s*%|\b\d{1,2}(?:\.\d+)?\s*%\s*(?:body[- ]?fat|bodyfat|bf)\b/i.test(
    sanitizeText(text, 240)
  )
);

const hasAppearanceProxyAnchor = (context = {}) => (
  Boolean(sanitizeText(context?.current_bodyweight || "", 80) || sanitizeText(context?.current_waist || "", 80))
);

const resolveMissingAnchors = ({ archetype = null, fields = {}, context = {} } = {}) => {
  const missing = [];
  (archetype?.requiredAnchors || []).forEach((anchor) => {
    const hasField = Boolean(readFieldValue(fields, anchor));
    const hasContext = fieldKeyToContextCandidates(anchor).some((candidate) => {
      const value = context?.[candidate];
      if (value == null) return false;
      if (typeof value === "object") return Object.values(value).some(Boolean);
      return Boolean(value);
    });
    if (!hasField && !hasContext) missing.push(anchor);
  });
  return missing;
};

const buildResolverContext = ({
  rawIntentText = "",
  intakeContext = {},
  templateSelection = null,
  intent = null,
  now = new Date(),
} = {}) => {
  const fields = intakeContext?.goalCompletenessContext?.fields || {};
  const trainingLocation = sanitizeText(intakeContext?.scheduleReality?.trainingLocation || intakeContext?.equipmentAccessContext?.trainingLocation || "", 80);
  const equipment = toArray(intakeContext?.equipmentAccessContext?.equipment || []);
  const primaryModality = resolvePrimaryModality({ intent, fields, rawText: rawIntentText });
  const hybridPriority = resolveHybridPriority({ fields, rawText: rawIntentText });
  const eventDistance = detectEventDistance({ fields, rawText: rawIntentText, templateSelection });
  return {
    fields,
    rawText: rawIntentText,
    daysPerWeek: parseDaysPerWeek(intakeContext?.scheduleReality?.trainingDaysPerWeek),
    sessionLength: normalizeSessionLength(intakeContext?.scheduleReality?.sessionLength || ""),
    environment: normalizeEnvironment(trainingLocation),
    trainingLocation,
    equipmentProfile: normalizeEquipmentProfile({ fields, equipment, trainingLocation }),
    experienceLevel: normalizeExperienceLevel({ fields, intakeContext, rawText: rawIntentText }),
    riskPosture: normalizeRiskPosture({ intent, fields, rawText: rawIntentText }),
    primaryModality,
    hybridPriority,
    bodyCompMode: normalizeChoice(readFieldValue(fields, "body_comp_tempo")),
    liftFocus: normalizeChoice(readFieldValue(fields, "lift_focus") || templateSelection?.specificityDefaults?.lift_focus || ""),
    eventDistance,
    runGoalPosture: resolveRunGoalPosture(rawIntentText),
    timeline: resolveTimeline({ fields, rawText: rawIntentText, intakeContext, now }),
    current_run_frequency: readFieldValue(fields, "current_run_frequency"),
    starting_capacity_anchor: normalizeChoice(readFieldValue(fields, "starting_capacity_anchor")),
    recent_swim_anchor: readFieldValue(fields, "recent_swim_anchor"),
    swim_access_reality: normalizeChoice(readFieldValue(fields, "swim_access_reality")),
    current_strength_baseline: readFieldValue(fields, "current_strength_baseline"),
    current_bodyweight: readFieldValue(fields, "current_bodyweight"),
    current_waist: readFieldValue(fields, "current_waist"),
    current_endurance_anchor: readFieldValue(fields, "current_endurance_anchor"),
    longest_recent_endurance_session: readFieldValue(fields, "longest_recent_endurance_session"),
    busyFriendly: parseDaysPerWeek(intakeContext?.scheduleReality?.trainingDaysPerWeek) <= 3 || normalizeChoice(readFieldValue(fields, "body_comp_tempo")) === "busy_life",
  };
};

const scoreArchetype = ({ archetype = null, intent = null, context = {} } = {}) => {
  let score = 0;
  const reasons = [];
  if (!archetype || !intent) return { score: -999, reasons };
  if (archetype.supportedGoalIntents.includes(intent.id)) {
    score += 40;
    reasons.push(`intent:${intent.id}`);
  }
  if (archetype.supportedExperienceLevels.includes(context.experienceLevel) || archetype.supportedExperienceLevels.includes("unknown")) {
    score += 6;
    reasons.push(`experience:${context.experienceLevel}`);
  } else score -= 4;
  if (archetype.supportedFrequencies.includes(`${context.daysPerWeek}`)) {
    score += 8;
    reasons.push(`days:${context.daysPerWeek}`);
  }
  if (archetype.supportedSessionLengths.includes(context.sessionLength)) score += 5;
  if (archetype.supportedEquipmentProfiles.includes(context.equipmentProfile) || archetype.supportedEquipmentProfiles.includes("mixed")) {
    score += 7;
    reasons.push(`equipment:${context.equipmentProfile}`);
  }
  if (archetype.supportedEnvironments.includes(context.environment) || archetype.supportedEnvironments.includes("mixed")) score += 4;
  if (archetype.supportedRiskPostures.includes(context.riskPosture)) score += 6;
  if (context.eventDistance && archetype.resolverHints?.eventDistance === context.eventDistance) score += 10;
  else if (context.eventDistance && archetype.resolverHints?.eventDistance && archetype.resolverHints.eventDistance !== context.eventDistance) score -= 14;
  if (context.primaryModality && archetype.resolverHints?.preferredModality === context.primaryModality) score += 10;
  else if (context.primaryModality && archetype.resolverHints?.preferredModality && archetype.resolverHints.preferredModality !== context.primaryModality) score -= 10;
  if (context.liftFocus && archetype.resolverHints?.liftFocus === context.liftFocus) score += 12;
  else if (context.liftFocus && archetype.resolverHints?.liftFocus && archetype.resolverHints.liftFocus !== context.liftFocus) score -= 12;
  if (context.hybridPriority && archetype.resolverHints?.hybridPriority === context.hybridPriority) score += 10;
  else if (context.hybridPriority && archetype.resolverHints?.hybridPriority && archetype.resolverHints.hybridPriority !== context.hybridPriority) score -= 12;
  if (context.bodyCompMode && archetype.resolverHints?.bodyCompMode === context.bodyCompMode) score += 8;
  else if (context.bodyCompMode && archetype.resolverHints?.bodyCompMode && archetype.resolverHints.bodyCompMode !== context.bodyCompMode) score -= 8;
  if (context.busyFriendly && archetype.resolverHints?.busyFriendly) score += 5;
  if (context.riskPosture === "protective" && archetype.resolverHints?.protectedBias) score += 8;
  if (intent?.id === "train_for_run_race") {
    const improvementArchetype = /improvement/.test(archetype.id) || /two_quality_sessions|benchmark_driven/.test(`${archetype.weeklyStructureTemplate?.intensityProfile || ""} ${archetype.progressionStrategy?.model || ""}`);
    if (context.runGoalPosture === "improvement" && improvementArchetype) {
      score += 10;
      reasons.push("run_goal_posture:improvement");
    }
    if (context.runGoalPosture === "completion" && !improvementArchetype) {
      score += 8;
      reasons.push("run_goal_posture:completion");
    }
    if (context.runGoalPosture === "completion" && improvementArchetype && !readFieldValue(context.fields, "recent_pace_baseline")) {
      score -= 6;
    }
  }
  if (intent?.id === "swim_better") {
    const improvementArchetype = archetype.id === "swim_endurance_improvement";
    const swimImprovementSignal = /\b(faster|endurance|mile|longer swims?|long swim|threshold)\b/.test(context.rawText || "");
    const hasSwimAnchor = Boolean(context.recent_swim_anchor);
    if (swimImprovementSignal && hasSwimAnchor && context.riskPosture !== "protective" && improvementArchetype) {
      score += 12;
      reasons.push("swim_goal_posture:improvement");
    }
    if ((!swimImprovementSignal || !hasSwimAnchor || context.riskPosture === "protective") && !improvementArchetype) {
      score += 6;
      reasons.push("swim_goal_posture:base");
    }
    if (swimImprovementSignal && context.daysPerWeek >= 4 && improvementArchetype) score += 4;
    if ((context.riskPosture === "protective" || !hasSwimAnchor) && improvementArchetype) score -= 8;
  }
  if (intent?.id === "low_impact_restart") {
    const lowImpactSignal = /\b(low[- ]impact|joint[- ]friendly|lower-impact|bike|pool)\b/.test(context.rawText || "");
    if (archetype.id === "low_impact_restart") {
      score += 12;
      reasons.push("low_impact_fit");
      if (lowImpactSignal) score += 8;
    }
    if (lowImpactSignal && archetype.id === "protected_restart_low_capacity") score -= 6;
  }
  const requiredAnchors = Array.isArray(archetype.requiredAnchors) ? archetype.requiredAnchors : [];
  const missingAnchors = resolveMissingAnchors({ archetype, fields: context.fields, context });
  const satisfiedRequiredAnchors = requiredAnchors.length - missingAnchors.length;
  if (satisfiedRequiredAnchors > 0) score += satisfiedRequiredAnchors;
  const hasPaceAnchor = Boolean(readFieldValue(context.fields, "recent_pace_baseline"));
  const hasStructuredRunBaseline = hasPaceAnchor && Number(context.daysPerWeek || 0) >= 4 && ["intermediate", "advanced"].includes(context.experienceLevel);
  if (hasStructuredRunBaseline && /improvement|two_quality_sessions|benchmark_driven/.test(`${archetype.id} ${archetype.weeklyStructureTemplate?.intensityProfile || ""} ${archetype.progressionStrategy?.model || ""}`)) {
    score += 8;
    reasons.push("improvement_readiness");
  }
  if ((!hasPaceAnchor || context.riskPosture === "protective") && /completion|conservative/.test(archetype.id)) {
    score += 3;
    reasons.push("conservative_fit");
  }
  score -= missingAnchors.length * 2;
  score += Math.max(1, Math.round(Number(archetype.fallbackPriority || 0) / 10));
  return { score, reasons, missingAnchors };
};

const resolveIntent = ({ rawIntentText = "", intakeContext = {}, templateSelection = null } = {}) => {
  const canonicalId = resolveStructuredGoalIntentId(templateSelection?.intentId || templateSelection?.templateId || "");
  if (canonicalId) return findStructuredGoalIntentById(canonicalId);
  const inferenceCorpus = dedupeStrings([
    rawIntentText,
    ...(intakeContext?.userProvidedConstraints?.appearanceConstraints || []),
    ...(intakeContext?.userProvidedConstraints?.timingConstraints || []),
  ]).join(". ");
  return inferStructuredGoalIntentFromText(inferenceCorpus || rawIntentText);
};

const buildScienceLines = ({ archetype = null }) => dedupeStrings([
  archetype?.rationale?.frequencyWhy,
  archetype?.rationale?.progressionWhy,
  archetype?.rationale?.recoveryWhy,
  archetype?.rationale?.fallbackWhy,
]);

export const resolveStructuredGoalPath = ({
  rawIntentText = "",
  intakeContext = {},
  templateSelection = null,
  now = new Date(),
} = {}) => {
  const intent = resolveIntent({ rawIntentText, intakeContext, templateSelection });
  if (!intent) return null;
  const context = buildResolverContext({
    rawIntentText,
    intakeContext,
    templateSelection,
    intent,
    now,
  });
  const candidates = listPlanArchetypes()
    .map((archetype) => ({
      archetype,
      ...scoreArchetype({ archetype, intent, context }),
    }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0] || null;
  if (!best || best.score < 20) return null;
  const primaryMetric = buildPrimaryMetric({
    archetype: best.archetype,
    intent,
    rawText: rawIntentText,
    eventDistance: context.eventDistance,
    templateSelection,
    fields: context.fields,
  });
  const unresolvedGaps = dedupeStrings([
    ...resolveMissingAnchors({ archetype: best.archetype, fields: context.fields, context }).map((anchor) => `Need ${anchor.replace(/_/g, " ")} for a tighter first plan.`),
    intent?.id === "get_leaner" && !hasAppearanceProxyAnchor(context)
      ? hasBodyFatPercentageLanguage(rawIntentText)
        ? "Need a waist or bodyweight proxy, or a reliable body-fat measurement method, if the percentage target should guide planning."
        : "Need a repeatable body-composition proxy like current bodyweight or waist if the appearance goal should guide planning."
      : "",
  ]);
  const measurabilityTier = inferStructuredMeasurabilityTier({
    intent,
    archetype: best.archetype,
    primaryMetric,
  });
  const confidence = unresolvedGaps.length === 0 ? "high" : unresolvedGaps.length <= 2 ? "medium" : "low";
  const summary = buildSummary({
    intent,
    archetype: best.archetype,
    eventDistance: context.eventDistance,
    hybridPriority: context.hybridPriority,
    rawText: rawIntentText,
    primaryMetric,
    timeline: context.timeline,
    templateSelection,
  });
  const tradeoffs = dedupeStrings([
    best.archetype?.hybridCompatibility?.notes || "",
    best.archetype?.bodyCompCompatibility?.notes || "",
    best.archetype?.fatigueManagementStrategy?.summary || "",
  ]).slice(0, 4);
  const first30DaySuccessDefinition = best.archetype?.weeklyStructureTemplate?.keySessionLabels?.length
    ? `Complete the planned ${best.archetype.weeklyStructureTemplate.keySessionLabels.slice(0, 2).join(" and ")} rhythm for the next 30 days.`
    : "Complete the planned weekly rhythm for the next 30 days.";
  return {
    intent,
    archetype: best.archetype,
    context,
    resolvedGoal: {
      id: `goal_resolution_1_${summary.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "structured_goal"}`,
      status: unresolvedGaps.length ? "resolved_with_gaps" : "resolved",
      confirmedByUser: true,
      confirmationSource: "structured_intake",
      planningPriority: 1,
      goalFamily: best.archetype.goalFamily,
      planningCategory: best.archetype.planningCategory,
      summary,
      rawIntent: { text: rawIntentText },
      measurabilityTier,
      primaryMetric,
      proxyMetrics: buildProxyMetrics({ archetype: best.archetype, intent }),
      targetDate: context.timeline.targetDate,
      targetHorizonWeeks: context.timeline.targetHorizonWeeks,
      confidence,
      unresolvedGaps,
      validationIssues: [],
      tradeoffs,
      first30DaySuccessDefinition,
      reviewCadence: "weekly",
      refinementTrigger: unresolvedGaps.length ? "missing_metric_data" : "block_start_or_metric_stall",
      goalTemplateId: sanitizeText(templateSelection?.legacyTemplateId || templateSelection?.templateId || intent.id, 80),
      structuredIntentId: intent.id,
      goalDiscoveryFamilyId: intent.familyId,
      planArchetypeId: best.archetype.id,
      planArchetypeVersion: best.archetype.version,
      planArchetypeLabel: best.archetype.displayName,
      planArchetypeFamily: best.archetype.family,
      resolverReasoning: dedupeStrings([`intent ${intent.id}`, ...best.reasons]).slice(0, 6),
      scienceRationale: buildScienceLines({ archetype: best.archetype }),
      specificityInputs: {
        eventDistance: context.eventDistance,
        hybridPriority: context.hybridPriority,
        liftFocus: context.liftFocus,
        bodyCompMode: context.bodyCompMode,
        primaryModality: context.primaryModality,
      },
      primaryDomain: best.archetype.primaryDomain,
      secondaryDomains: [],
      candidateDomainAdapters: dedupeStrings([best.archetype.primaryDomain, "general_foundation"]).slice(0, 4),
      fallbackPlanningMode: best.archetype.weeklyStructureTemplate?.patternId || "",
      missingAnchors: resolveMissingAnchors({ archetype: best.archetype, fields: context.fields, context }),
      architectureHint: best.archetype.architecture,
      weeklyStructureTemplate: best.archetype.weeklyStructureTemplate,
      progressionStrategy: best.archetype.progressionStrategy,
      fatigueManagementStrategy: best.archetype.fatigueManagementStrategy,
      deloadStrategy: best.archetype.deloadStrategy,
    },
  };
};
