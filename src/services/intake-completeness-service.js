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

export const INTAKE_COMPLETENESS_FIELDS = {
  appearanceProxyPlan: "appearance_proxy_plan",
  currentStrengthBaseline: "current_strength_baseline",
  targetTimeline: "target_timeline",
  currentRunFrequency: "current_run_frequency",
  longestRecentRun: "longest_recent_run",
  recentPaceBaseline: "recent_pace_baseline",
  recentSwimAnchor: "recent_swim_anchor",
  swimAccessReality: "swim_access_reality",
  startingCapacityAnchor: "starting_capacity_anchor",
  currentBodyweight: "current_bodyweight",
  targetWeightChange: "target_weight_change",
  currentWaist: "current_waist",
  progressPhotos: "progress_photos",
};

export const INTAKE_COMPLETENESS_QUESTION_KEYS = {
  strengthBaseline: "strength_baseline",
  runningTiming: "running_timing",
  runningBaseline: "running_baseline",
  swimBaseline: "swim_baseline",
  bodyCompAnchor: "body_comp_anchor",
  bodyCompTimeline: "body_comp_timeline",
  appearanceProxyAnchor: "appearance_proxy_anchor",
  appearanceTimeline: "appearance_timeline",
  startingCapacity: "starting_capacity",
  maintainedStrengthBaseline: "maintained_strength_baseline",
};

export const INTAKE_COMPLETENESS_VALUE_TYPES = {
  strengthBaseline: "strength_baseline",
  athleticPowerBaseline: "athletic_power_baseline",
  targetTimeline: "target_timeline",
  runningBaseline: "running_baseline",
  swimBaseline: "swim_baseline",
  bodyCompAnchor: "body_comp_anchor",
  appearanceProxyAnchor: "appearance_proxy_anchor",
  startingCapacity: "starting_capacity",
};

const COMPLETENESS_SOURCE = "completeness";

const COMPLETENESS_FIELD_FALLBACK_PATTERNS = {
  [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline]: [/bench|strength baseline|current lift|upper body/i],
  [INTAKE_COMPLETENESS_FIELDS.currentRunFrequency]: [/running baseline|runs per week|run frequency/i],
  [INTAKE_COMPLETENESS_FIELDS.longestRecentRun]: [/running baseline|longest recent run|long run/i],
  [INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline]: [/running baseline|recent pace|race result|pace baseline/i],
  [INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor]: [/swim anchor|swim benchmark|recent swim|swim baseline/i],
  [INTAKE_COMPLETENESS_FIELDS.swimAccessReality]: [/pool|open water|swim access|water reality/i],
  [INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor]: [/starting capacity|safe starting|repeatable right now|tolerance/i],
  [INTAKE_COMPLETENESS_FIELDS.currentBodyweight]: [/current bodyweight|current weight|scale weight|proxy we can track/i],
  [INTAKE_COMPLETENESS_FIELDS.targetWeightChange]: [/how much.*lose|target weight change|trying to lose/i],
  [INTAKE_COMPLETENESS_FIELDS.currentWaist]: [/waist/i],
  [INTAKE_COMPLETENESS_FIELDS.progressPhotos]: [/progress photos|photos/i],
  [INTAKE_COMPLETENESS_FIELDS.targetTimeline]: [/race date|target month|timeline|horizon|by when/i],
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  const text = sanitizeText(value, 60).toLowerCase();
  if (!text) return null;
  if (/^(yes|y|true|sure|okay|ok|fine|willing|works|i can|will do)/.test(text)) return true;
  if (/^(no|n|false|skip|not willing|rather not|prefer not)/.test(text)) return false;
  return null;
};

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeNumberText = (value = "") => {
  if (value === "" || value === null || value === undefined) return "";
  return String(value).trim();
};

const readFiniteNumber = (value = "") => {
  const normalized = normalizeNumberText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseFirstWeightLikeNumber = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const topSet = normalized.match(/(\d{2,4}(?:\.\d+)?)\s*[x×]\s*\d{1,2}\b/i);
  if (topSet?.[1]) return Number(topSet[1]);
  const explicit = normalized.match(/(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const generic = normalized.match(/\b(\d{2,4}(?:\.\d+)?)\b/);
  return generic?.[1] ? Number(generic[1]) : null;
};

const parseRunFrequency = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d+)\s*(?:runs?|days?)\s*(?:per|\/)?\s*(?:week|wk)/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const weeklyTimes = normalized.match(/(\d+)\s*(?:x|times?)\s*(?:a|per|\/)?\s*(?:week|wk)/i);
  if (weeklyTimes?.[1]) return Number(weeklyTimes[1]);
  const bareRunCount = normalized.match(/\b(\d+)\s*runs?\b/i);
  if (bareRunCount?.[1]) return Number(bareRunCount[1]);
  const runVerbCount = normalized.match(/\brun(?:ning)?\s*(\d+)\s*(?:x|times?)?\b/i);
  if (runVerbCount?.[1]) return Number(runVerbCount[1]);
  const daysCount = normalized.match(/\b(\d+)\s*days?\b/i);
  if (daysCount?.[1] && /(?:\brun\b|\brunning\b)/i.test(normalized)) return Number(daysCount[1]);
  if (/^\d+$/.test(normalized.trim())) return Number(normalized.trim());
  return null;
};

const parseDistanceMiles = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i);
  return match?.[1] ? Number(match[1]) : null;
};

const parseDurationMinutes = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const minuteMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\b/i);
  if (minuteMatch?.[1]) return Number(minuteMatch[1]);
  return null;
};

const parsePaceLikeText = (text = "") => {
  const normalized = sanitizeText(text, 120);
  if (!normalized) return "";
  const pace = normalized.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  if (pace?.[0]) return pace[0];
  if (/\bpace\b|\b5k\b|\b10k\b|\bhalf\b|\bmarathon\b/i.test(normalized)) return normalized;
  return "";
};

const parseSwimDistance = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const match = normalized.match(/\b(\d+(?:\.\d+)?)\s*(yd|yard|yards|m|meter|meters|metre|metres)\b/i);
  if (!match?.[1]) return null;
  const unitRaw = String(match?.[2] || "").toLowerCase();
  const unit = /yd|yard/.test(unitRaw) ? "yd" : /m|meter|metre/.test(unitRaw) ? "m" : "";
  return {
    value: Number(match[1]),
    unit,
  };
};

const parseSwimDuration = (text = "") => {
  const normalized = sanitizeText(text, 120);
  if (!normalized) return "";
  const hhmmss = normalized.match(/\b(\d+:\d{2}(?::\d{2})?)\b/);
  if (hhmmss?.[1]) return hhmmss[1];
  const minuteMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  if (minuteMatch?.[1]) return `${minuteMatch[1]} min`;
  return "";
};

const parseSwimAccessReality = (text = "") => {
  const normalized = sanitizeText(text, 80).toLowerCase();
  if (!normalized) return "";
  if (normalized === "both" || /\bboth\b/.test(normalized)) return "both";
  if (normalized === "open_water" || /open[_ -]?water|lake|ocean/.test(normalized)) return "open_water";
  if (normalized === "pool" || /\bpool\b/.test(normalized)) return "pool";
  return "";
};

const parseStartingCapacityChoice = (text = "") => {
  const normalized = sanitizeText(text, 80).toLowerCase();
  if (!normalized) return "";
  if (normalized === "walk_only" || /\bwalk\b/.test(normalized)) return "walk_only";
  if (normalized === "10_easy_minutes" || /\b10\b|\bshort\b/.test(normalized)) return "10_easy_minutes";
  if (normalized === "20_to_30_minutes" || /\b20\b|\b30\b|\bsteady\b/.test(normalized)) return "20_to_30_minutes";
  if (normalized === "30_plus_minutes" || /\b30\+\b|\b30 plus\b|\brepeatable\b/.test(normalized)) return "30_plus_minutes";
  return "";
};

const parseSwimAnchor = (text = "") => {
  const normalized = sanitizeText(text, 160);
  const swimDistance = parseSwimDistance(normalized);
  const swimDuration = parseSwimDuration(normalized);
  return {
    raw: normalized,
    distance: Number.isFinite(swimDistance?.value) ? swimDistance.value : null,
    distanceUnit: swimDistance?.unit || "",
    duration: swimDuration,
  };
};

const parseStrengthBaseline = (text = "") => {
  const normalized = sanitizeText(text, 160);
  const weight = parseFirstWeightLikeNumber(normalized);
  const reps = normalized.match(/[x×]\s*(\d{1,2})\b/i)?.[1]
    || normalized.match(/\b(\d{1,2})\s*reps?\b/i)?.[1]
    || "";
  return {
    raw: normalized,
    weight: weight ?? null,
    reps: reps ? Number(reps) : null,
  };
};

const parseTargetWeightChange = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const loseMatch = normalized.match(/\blose\s+(\d{1,3}(?:\.\d+)?)\b/i);
  if (loseMatch?.[1]) return Number(`-${loseMatch[1]}`);
  const gainMatch = normalized.match(/\b(?:gain|add)\s+(\d{1,3}(?:\.\d+)?)\b/i);
  if (gainMatch?.[1]) return Number(gainMatch[1]);
  const generic = normalized.match(/([+-]?\d{1,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i);
  return generic?.[1] ? Number(generic[1]) : null;
};

const parseWaistMeasurement = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*(?:in|inch|inches)\b/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const withWaist = normalized.match(/waist[^0-9]{0,12}(\d{1,2}(?:\.\d+)?)/i);
  return withWaist?.[1] ? Number(withWaist[1]) : null;
};

const MONTH_NAME_TO_NUMBER = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

const MONTH_TOKEN_PATTERN = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/i;
const SEASON_PATTERN = /\b(?:early|mid|late)?\s*(?:spring|summer|fall|autumn|winter)\b/i;
const RELATIVE_TIMELINE_PATTERN = /\b(?:in|within|over the next)\s+\d{1,3}\s+(?:week|weeks|month|months|year|years)\b/i;
const BOUNDED_TIMELINE_PATTERN = /\b(?:by|before)\s+(?:next year|this year|\d{4}-\d{2}(?:-\d{2})?|(?:early|mid|late)\s+(?:spring|summer|fall|autumn|winter)|spring|summer|fall|autumn|winter|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:\s+\d{4})?\b/i;
const NEXT_YEAR_PATTERN = /\b(?:next|this)\s+year\b/i;

export const normalizeTimelineMonthValue = (value = "") => {
  const clean = sanitizeText(value, 120);
  if (!clean) return "";

  const isoMonthMatch = clean.match(/\b(\d{4})-(\d{2})(?:-\d{2})?\b/);
  if (isoMonthMatch?.[1] && isoMonthMatch?.[2]) return `${isoMonthMatch[1]}-${isoMonthMatch[2]}`;

  const yearMatch = clean.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
  const monthMatch = clean.match(MONTH_TOKEN_PATTERN);
  const monthNumber = monthMatch?.[1]
    ? MONTH_NAME_TO_NUMBER[String(monthMatch[1]).toLowerCase()]
    : "";
  if (yearMatch?.[1] && monthNumber) return `${yearMatch[1]}-${monthNumber}`;

  return "";
};

const parseExplicitDateText = (text = "") => {
  const normalized = sanitizeText(text, 120);
  if (!normalized) return "";
  const normalizedMonth = normalizeTimelineMonthValue(normalized);
  if (normalizedMonth) return normalizedMonth;
  const isoMatch = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch?.[0]) return isoMatch[0];
  return normalized;
};

const hasTimingSignal = (text = "") => {
  const clean = sanitizeText(text, 120);
  if (!clean) return false;
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(clean)) return true;
  if (normalizeTimelineMonthValue(clean)) return true;
  if (RELATIVE_TIMELINE_PATTERN.test(clean)) return true;
  if (BOUNDED_TIMELINE_PATTERN.test(clean)) return true;
  if (NEXT_YEAR_PATTERN.test(clean)) return true;
  if (SEASON_PATTERN.test(clean)) return true;
  if (MONTH_TOKEN_PATTERN.test(clean)) return true;
  if (/\bweek(?:s)?\b|\bmonth(?:s)?\b|\byear(?:s)?\b/i.test(clean)) return true;
  return false;
};

export const resolveTimelineFieldRecord = ({
  rawText = "",
  candidateValue = "",
} = {}) => {
  const preferredRaw = sanitizeText(rawText || candidateValue, 120);
  const cleanCandidate = sanitizeText(candidateValue || rawText, 120);
  const acceptedRaw = preferredRaw || cleanCandidate;
  const validatedRaw = validateTimelineValue(acceptedRaw);
  const normalizedMonth = normalizeTimelineMonthValue(cleanCandidate) || normalizeTimelineMonthValue(preferredRaw);
  if (!validatedRaw && !normalizedMonth) return null;
  return {
    raw: validatedRaw || preferredRaw || cleanCandidate,
    value: normalizedMonth || validatedRaw || preferredRaw || cleanCandidate,
  };
};

const buildQuestionField = ({
  key = "",
  label = "",
  inputType = "text",
  expectedValueType = "text",
  placeholder = "",
  helperText = "",
  required = false,
  min = null,
  max = null,
  unit = "",
  direction = "",
} = {}) => ({
  key: sanitizeText(key, 80),
  label: sanitizeText(label, 120),
  inputType: sanitizeText(inputType, 20) || "text",
  expectedValueType: sanitizeText(expectedValueType, 80) || "text",
  placeholder: sanitizeText(placeholder, 120),
  helperText: sanitizeText(helperText, 180),
  required: Boolean(required),
  ...(Number.isFinite(min) ? { min } : {}),
  ...(Number.isFinite(max) ? { max } : {}),
  ...(unit ? { unit: sanitizeText(unit, 20) } : {}),
  ...(direction ? { direction: sanitizeText(direction, 20).toLowerCase() } : {}),
});

const readStoredField = (answers = {}, fieldKey = "") => {
  const stored = answers?.intake_completeness?.fields?.[fieldKey];
  return stored && typeof stored === "object" ? stored : null;
};

const buildFieldRecord = ({ fieldKey = "", raw = "", value = null, extra = {} } = {}) => {
  const cleanRaw = sanitizeText(raw, 160);
  return {
    raw: cleanRaw,
    ...(cleanRaw ? { value: value ?? cleanRaw } : {}),
    ...extra,
  };
};

export const isCompletenessClarificationNote = (note = {}) => {
  if (!note || typeof note !== "object") return false;
  const source = sanitizeText(note?.source || "", 40).toLowerCase();
  if (source === COMPLETENESS_SOURCE) return true;
  const questionKey = sanitizeText(note?.questionKey || "", 80).toLowerCase();
  if (questionKey && Object.values(INTAKE_COMPLETENESS_QUESTION_KEYS).includes(questionKey)) return true;
  const fieldKeys = toArray(note?.fieldKeys).map((item) => sanitizeText(item, 80)).filter(Boolean);
  if (fieldKeys.length > 0) return true;
  const question = sanitizeText(note?.question || "", 180).toLowerCase();
  return Object.values(COMPLETENESS_FIELD_FALLBACK_PATTERNS).some((patterns = []) => patterns.some((pattern) => pattern.test(question)));
};

const getClarificationAnswerForField = (answers = {}, fieldKey = "") => {
  const patterns = COMPLETENESS_FIELD_FALLBACK_PATTERNS[fieldKey] || [];
  const notes = toArray(answers?.goal_clarification_notes)
    .filter((note) => isCompletenessClarificationNote(note))
    .map((note) => ({
      fieldKeys: toArray(note?.fieldKeys).map((item) => sanitizeText(item, 80).toLowerCase()).filter(Boolean),
      question: sanitizeText(note?.question || "", 180).toLowerCase(),
      answer: sanitizeText(note?.answer || "", 220),
    }))
    .filter((note) => note.answer);
  const normalizedFieldKey = sanitizeText(fieldKey, 80).toLowerCase();
  const scopedMatch = notes.find((note) => note.fieldKeys.includes(normalizedFieldKey));
  if (scopedMatch?.answer) return scopedMatch.answer;
  for (const pattern of patterns) {
    const matched = notes.find((note) => pattern.test(note.question));
    if (matched?.answer) return matched.answer;
  }
  return "";
};

const readTextField = (answers = {}, fieldKey = "") => (
  sanitizeText(readStoredField(answers, fieldKey)?.raw || "", 160)
  || getClarificationAnswerForField(answers, fieldKey)
  || ""
);

const resolveKnownFacts = ({ resolvedGoals = [], answers = {} } = {}) => {
  const primaryGoal = (resolvedGoals || [])[0] || null;
  const currentStrengthBaselineText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline);
  const currentRunFrequencyText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.currentRunFrequency);
  const longestRecentRunText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.longestRecentRun);
  const recentPaceBaselineText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline);
  const recentSwimAnchorText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor);
  const swimAccessRealityText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.swimAccessReality);
  const startingCapacityText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor);
  const appearanceProxyPlan = sanitizeText(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan)?.value || "", 80);
  const currentBodyweightText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
  const targetWeightChangeText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.targetWeightChange);
  const currentWaistText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.currentWaist);
  const timelineText = readTextField(answers, INTAKE_COMPLETENESS_FIELDS.targetTimeline) || sanitizeText(answers?.timeline_feedback || "", 160);
  const progressPhotosRaw = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.progressPhotos)?.raw
    || getClarificationAnswerForField(answers, INTAKE_COMPLETENESS_FIELDS.progressPhotos);

  const targetMetric = primaryGoal?.primaryMetric?.key === "bodyweight_change"
    ? toFiniteNumber(primaryGoal?.primaryMetric?.targetValue, parseTargetWeightChange(primaryGoal?.primaryMetric?.targetValue || ""))
    : null;
  const targetWindowKnown = Boolean(primaryGoal?.targetDate || primaryGoal?.targetHorizonWeeks || timelineText);

  return {
    currentStrengthBaseline: currentStrengthBaselineText
      ? { ...parseStrengthBaseline(currentStrengthBaselineText), text: currentStrengthBaselineText }
      : null,
    currentRunFrequency: parseRunFrequency(currentRunFrequencyText),
    currentRunFrequencyText,
    longestRecentRun: longestRecentRunText
      ? {
          text: longestRecentRunText,
          miles: parseDistanceMiles(longestRecentRunText),
          minutes: parseDurationMinutes(longestRecentRunText),
        }
      : null,
    recentPaceBaseline: recentPaceBaselineText
      ? {
          text: recentPaceBaselineText,
          paceText: parsePaceLikeText(recentPaceBaselineText) || recentPaceBaselineText,
        }
      : null,
    recentSwimAnchor: recentSwimAnchorText
      ? {
          ...parseSwimAnchor(recentSwimAnchorText),
          text: recentSwimAnchorText,
        }
      : null,
    swimAccessReality: parseSwimAccessReality(swimAccessRealityText),
    swimAccessRealityText,
    startingCapacityAnchor: parseStartingCapacityChoice(startingCapacityText),
    startingCapacityText,
    appearanceProxyPlan,
    currentBodyweight: parseFirstWeightLikeNumber(currentBodyweightText),
    currentBodyweightText,
    targetWeightChange: targetMetric ?? parseTargetWeightChange(targetWeightChangeText),
    targetWeightChangeText,
    currentWaist: parseWaistMeasurement(currentWaistText),
    currentWaistText,
    progressPhotos: normalizeBoolean(progressPhotosRaw),
    progressPhotosRaw: sanitizeText(progressPhotosRaw, 80),
    targetTimeline: parseExplicitDateText(timelineText),
    targetTimelineText: timelineText,
    targetWindowKnown,
  };
};

const buildRequirement = ({
  key = "",
  label = "",
  required = true,
  filled = false,
  question = null,
  fieldKeys = [],
  goalRole = "primary",
} = {}) => ({
  key,
  label,
  required,
  filled: Boolean(filled),
  fieldKeys: [...fieldKeys],
  goalRole,
  question,
});

const buildQuestion = ({
  key = "",
  prompt = "",
  placeholder = "",
  required = true,
  fieldKeys = [],
  label = "",
  goalRole = "primary",
  affectsTimeline = false,
  expectedValueType = "",
  inputFields = [],
  validation = null,
} = {}) => ({
  key,
  prompt: sanitizeText(prompt, 220),
  placeholder: sanitizeText(placeholder, 120),
  label: sanitizeText(label || prompt, 160),
  required,
  source: COMPLETENESS_SOURCE,
  fieldKeys: [...fieldKeys],
  goalRole,
  affectsTimeline,
  expectedValueType: sanitizeText(expectedValueType, 80),
  inputFields: toArray(inputFields)
    .filter(Boolean)
    .map((field) => buildQuestionField(field)),
  validation: validation && typeof validation === "object"
    ? {
        kind: sanitizeText(validation.kind || "", 80).toLowerCase(),
        message: sanitizeText(validation.message || "", 220),
      }
    : null,
});

const buildStrengthBaselinePrompt = (resolvedGoal = {}, goalRole = "primary") => {
  const goalFamily = sanitizeText(resolvedGoal?.goalFamily || "", 40).toLowerCase();
  const liftLabel = sanitizeText(resolvedGoal?.primaryMetric?.label || "", 60).toLowerCase();
  const rolePrefix = goalRole === "maintained" ? "To protect the maintained strength goal, " : "";
  if (goalFamily === "athletic_power") {
    return {
      label: goalRole === "maintained" ? "Current jump or dunk baseline for the maintained goal" : "Current jump or dunk baseline",
      prompt: `${rolePrefix}what's your current jump baseline right now? A recent vertical estimate, rim-touch point, or how close you are to dunking is fine.`,
      placeholder: "Example: 28-inch vertical, can grab rim, or close on one-foot jumps",
    };
  }
  const exerciseLabel = liftLabel || "that lift";
  return {
    label: goalRole === "maintained" ? "Current strength baseline for the maintained goal" : `Current ${exerciseLabel} baseline`,
    prompt: `${rolePrefix}what's your current ${exerciseLabel} baseline right now? A recent top set, best single, or estimated max is fine.`,
    placeholder: "Example: 185 x 3, 205 single, or around 175",
  };
};

const buildBodyCompAnchorPrompt = (facts = {}) => {
  const needsWeight = !facts?.currentBodyweight;
  const needsTarget = !Number.isFinite(facts?.targetWeightChange);
  if (needsWeight && needsTarget) {
    return {
      label: "Current bodyweight and desired weight change",
      prompt: "What's your current bodyweight, and roughly how much are you trying to lose?",
      placeholder: "Example: 205 lb, trying to lose 20",
      needsWeight,
      needsTarget,
    };
  }
  if (needsWeight) {
    return {
      label: "Current bodyweight",
      prompt: "What's your current bodyweight or closest recent scale weight?",
      placeholder: "Example: 205 lb",
      needsWeight,
      needsTarget,
    };
  }
  return {
    label: "Desired weight change",
    prompt: "Roughly how much weight are you trying to lose?",
    placeholder: "Example: 15-20 lb",
    needsWeight,
    needsTarget,
  };
};

const isSwimGoal = (goal = {}) => {
  const corpus = [
    goal?.summary,
    goal?.rawIntent?.text,
    goal?.primaryMetric?.label,
    goal?.primaryDomain,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(swim|swimming|pool|open water|laps?)\b/.test(corpus) || /swimming_endurance_technique/.test(corpus);
};

const needsSafeStartCapacity = (goal = {}) => {
  const goalFamily = String(goal?.goalFamily || "").toLowerCase();
  const planningCategory = String(goal?.planningCategory || "").toLowerCase();
  const primaryDomain = String(goal?.primaryDomain || "").toLowerCase();
  return goalFamily === "re_entry"
    || (planningCategory === "general_fitness" && /durability|foundation/.test(primaryDomain))
    || primaryDomain === "durability_rebuild"
    || primaryDomain === "general_foundation";
};

const buildRequirementsForGoal = ({ goal = null, index = 0, facts = {} } = {}) => {
  if (!goal) return { requiredFields: [], optionalFields: [] };
  const goalRole = goal?.intakeConfirmedRole || (index === 0 ? "primary" : "maintained");
  const planningCategory = String(goal?.planningCategory || "").toLowerCase();
  const goalFamily = String(goal?.goalFamily || "").toLowerCase();
  const requiredFields = [];
  const optionalFields = [];

  if (planningCategory === "strength") {
    const strengthPrompt = buildStrengthBaselinePrompt(goal, goalRole);
    requiredFields.push(buildRequirement({
      key: goalRole === "maintained" ? INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline : INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline,
      label: strengthPrompt.label,
      filled: Boolean(facts?.currentStrengthBaseline?.text),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline],
      goalRole,
      question: buildQuestion({
        key: goalRole === "maintained" ? INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline : INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline,
        prompt: strengthPrompt.prompt,
        placeholder: strengthPrompt.placeholder,
        fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline],
        label: strengthPrompt.label,
        goalRole,
        expectedValueType: goalFamily === "athletic_power"
          ? INTAKE_COMPLETENESS_VALUE_TYPES.athleticPowerBaseline
          : INTAKE_COMPLETENESS_VALUE_TYPES.strengthBaseline,
        inputFields: goalFamily === "athletic_power"
          ? [
              {
                key: INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline,
                label: "Current jump or dunk baseline",
                inputType: "text",
                expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.athleticPowerBaseline,
                placeholder: "Example: 28-inch vertical, can grab rim, or close on one-foot jumps",
                helperText: "A quick note about your current jump, rim touch, or dunk status is enough.",
                required: true,
              },
            ]
          : [
              {
                key: "current_strength_baseline_weight",
                label: "Current weight",
                inputType: "number",
                expectedValueType: "number",
                placeholder: "185",
                helperText: "Use a recent top set, best single, or estimated max.",
                required: true,
                min: 1,
                max: 2000,
                unit: "lb",
              },
              {
                key: "current_strength_baseline_reps",
                label: "Reps",
                inputType: "number",
                expectedValueType: "integer",
                placeholder: "3",
                helperText: "Optional if you entered a top set instead of a single.",
                required: false,
                min: 1,
                max: 30,
              },
            ],
        validation: {
          kind: goalFamily === "athletic_power" ? "athletic_power_baseline" : "strength_baseline",
          message: goalFamily === "athletic_power"
            ? "Add a quick jump or dunk baseline so I can size this progression correctly."
            : "Add a recent weight for this lift. Reps are optional if you only know the load.",
        },
      }),
    }));
    optionalFields.push(buildRequirement({
      key: "strength_timeline_optional",
      label: "Timeline for the lift target",
      required: false,
      filled: Boolean(facts?.targetWindowKnown),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
      goalRole,
    }));
  }

  if (isSwimGoal(goal) && goalRole === "primary") {
    const swimAnchorReady = Boolean(facts?.recentSwimAnchor?.text);
    const swimRealityReady = Boolean(facts?.swimAccessReality);
    requiredFields.push(buildRequirement({
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.swimBaseline,
      label: "Recent swim anchor",
      filled: swimAnchorReady && swimRealityReady,
      fieldKeys: [
        INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor,
        INTAKE_COMPLETENESS_FIELDS.swimAccessReality,
      ],
      goalRole,
      question: buildQuestion({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.swimBaseline,
        prompt: "What's one recent swim anchor, and is this mostly pool, open water, or both right now?",
        placeholder: "Example: 1000 yd in 22:30, pool only",
        fieldKeys: [
          INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor,
          INTAKE_COMPLETENESS_FIELDS.swimAccessReality,
        ],
        label: "Recent swim anchor",
        goalRole,
        expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.swimBaseline,
        inputFields: [
          {
            key: INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor,
            label: "Recent swim anchor",
            inputType: "text",
            expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.swimBaseline,
            placeholder: "Example: 1000 yd in 22:30",
            helperText: "One recent distance or time anchor is enough.",
            required: true,
          },
          {
            key: INTAKE_COMPLETENESS_FIELDS.swimAccessReality,
            label: "Water reality",
            inputType: "text",
            expectedValueType: "choice",
            placeholder: "pool, open water, or both",
            helperText: "This keeps the first block honest about where you can actually swim.",
            required: true,
          },
        ],
        validation: {
          kind: "swim_baseline",
          message: "Add one recent swim anchor and whether you're mostly swimming in the pool, open water, or both.",
        },
      }),
    }));
  } else if (planningCategory === "running") {
    if (goalRole === "primary" && !facts?.targetWindowKnown) {
      requiredFields.push(buildRequirement({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming,
        label: "Race date or target month",
        filled: false,
        fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
        goalRole,
        question: buildQuestion({
          key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming,
          prompt: "What's the race date or target month?",
          placeholder: "Example: October 12 or early October",
          fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
          label: "Race date or target month",
          goalRole,
          affectsTimeline: true,
          expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
          inputFields: [{
            key: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
            label: "Race date or target month",
            inputType: "text",
            expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
            placeholder: "Example: October 12 or early October",
            helperText: "A specific date is ideal, but a target month is enough to keep moving.",
            required: true,
          }],
          validation: {
            kind: "target_timeline",
            message: "Enter the race date, target month, or rough time window for this goal.",
          },
        }),
      }));
    }

    const runningBaselineReady = Number.isFinite(facts?.currentRunFrequency) && Boolean(facts?.longestRecentRun?.text || facts?.recentPaceBaseline?.text);
    const runningBaselineLabel = goalRole === "maintained" ? "Current running baseline for the maintained goal" : "Current running baseline";
    requiredFields.push(buildRequirement({
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline,
      label: runningBaselineLabel,
      filled: runningBaselineReady,
      fieldKeys: [
        INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
        INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
        INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
      ],
      goalRole,
      question: buildQuestion({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline,
        prompt: "What's your current running baseline: runs per week, plus either your longest recent run or a recent pace/race result?",
        placeholder: "Example: 3 runs/week, longest 6 miles, around 9:15 easy pace",
        fieldKeys: [
          INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
          INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
          INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
        ],
        label: runningBaselineLabel,
        goalRole,
        expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.runningBaseline,
        inputFields: [
          {
            key: INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
            label: "Runs per week",
            inputType: "number",
            expectedValueType: "integer",
            placeholder: "3",
            helperText: "How many times are you currently running in a normal week?",
            required: true,
            min: 1,
            max: 14,
          },
          {
            key: INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
            label: "Longest recent run",
            inputType: "text",
            expectedValueType: "distance_or_duration",
            placeholder: "Example: 6 miles or 90 minutes",
            helperText: "Add either distance or duration if you know it.",
            required: false,
          },
          {
            key: INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
            label: "Recent pace or race result",
            inputType: "text",
            expectedValueType: "pace_or_result",
            placeholder: "Example: 9:15 easy pace or 29:30 5K",
            helperText: "Optional if the long-run field already tells the story.",
            required: false,
          },
        ],
        validation: {
          kind: "running_baseline",
          message: "Add runs per week plus either a longest recent run or a recent pace/race result.",
        },
      }),
    }));
    optionalFields.push(buildRequirement({
      key: "running_secondary_baseline_detail",
      label: "Extra pace detail",
      required: false,
      filled: Boolean(facts?.recentPaceBaseline?.text || facts?.longestRecentRun?.text),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline, INTAKE_COMPLETENESS_FIELDS.longestRecentRun],
      goalRole,
    }));
  }

  if (planningCategory === "body_comp" && goalRole === "primary" && goalFamily !== "appearance") {
    const anchorPrompt = buildBodyCompAnchorPrompt(facts);
    requiredFields.push(buildRequirement({
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor,
      label: anchorPrompt.label,
      filled: Boolean(facts?.currentBodyweight) && (Number.isFinite(facts?.targetWeightChange) || Boolean(goal?.primaryMetric?.targetValue)),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentBodyweight, INTAKE_COMPLETENESS_FIELDS.targetWeightChange],
      goalRole,
      question: buildQuestion({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor,
        prompt: anchorPrompt.prompt,
        placeholder: anchorPrompt.placeholder,
        fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentBodyweight, INTAKE_COMPLETENESS_FIELDS.targetWeightChange],
        label: anchorPrompt.label,
        goalRole,
        expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.bodyCompAnchor,
        inputFields: [
          {
            key: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
            label: "Current bodyweight",
            inputType: "number",
            expectedValueType: "number",
            placeholder: "205",
            helperText: "Closest recent scale weight is fine.",
            required: anchorPrompt.needsWeight,
            min: 1,
            max: 1000,
            unit: "lb",
          },
          {
            key: INTAKE_COMPLETENESS_FIELDS.targetWeightChange,
            label: "Target loss",
            inputType: "number",
            expectedValueType: "number",
            placeholder: "20",
            helperText: "Enter the pounds you want to lose.",
            required: anchorPrompt.needsTarget,
            min: 1,
            max: 300,
            unit: "lb",
            direction: "loss",
          },
        ],
        validation: {
          kind: "body_comp_anchor",
          message: "Add the current bodyweight and target change I need to size this goal realistically.",
        },
      }),
    }));
    if (!facts?.targetWindowKnown) {
      requiredFields.push(buildRequirement({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline,
        label: "Target timeline",
        filled: false,
        fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
        goalRole,
        question: buildQuestion({
          key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline,
          prompt: "What's the rough timeline for this weight-loss goal?",
          placeholder: "Example: by August or over the next 16 weeks",
          fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
          label: "Target timeline",
          goalRole,
          affectsTimeline: true,
          expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
          inputFields: [{
            key: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
            label: "Target timeline",
            inputType: "text",
            expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
            placeholder: "Example: by August or over the next 16 weeks",
            helperText: "A rough window is enough. It does not need to be exact.",
            required: true,
          }],
          validation: {
            kind: "target_timeline",
            message: "Enter a date, month, or rough time window for this goal.",
          },
        }),
      }));
    }
    optionalFields.push(buildRequirement({
      key: "body_comp_waist_optional",
      label: "Current waist measurement",
      required: false,
      filled: Boolean(facts?.currentWaist),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentWaist],
      goalRole,
    }));
  }

  if (goalFamily === "appearance" && goalRole === "primary") {
    const appearanceHasExplicitTimingSignal = /\b(by|before|for)\b|\bspring\b|\bsummer\b|\bfall\b|\bautumn\b|\bwinter\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\bmay\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/i.test(String(goal?.rawIntent?.text || ""));
    const proxyAnchorReady = Boolean(
      facts?.currentBodyweight
      || facts?.currentWaist
      || facts?.appearanceProxyPlan === "skip_for_now"
    );
    requiredFields.push(buildRequirement({
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
      label: "Appearance tracking proxy",
      filled: proxyAnchorReady,
      fieldKeys: [
        INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
        INTAKE_COMPLETENESS_FIELDS.currentWaist,
        INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan,
      ],
      goalRole,
      question: buildQuestion({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
        prompt: "For your appearance goal, what's one proxy we can track right now: current bodyweight or waist?",
        placeholder: "Example: 198 lb or 35-inch waist",
        fieldKeys: [
          INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
          INTAKE_COMPLETENESS_FIELDS.currentWaist,
          INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan,
        ],
        label: "Appearance tracking proxy",
        goalRole,
        expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.appearanceProxyAnchor,
        inputFields: [
          {
            key: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
            label: "Current bodyweight",
            inputType: "number",
            expectedValueType: "number",
            placeholder: "198",
            helperText: "Optional if waist is the better proxy for you.",
            required: false,
            min: 1,
            max: 1000,
            unit: "lb",
          },
          {
            key: INTAKE_COMPLETENESS_FIELDS.currentWaist,
            label: "Current waist",
            inputType: "number",
            expectedValueType: "number",
            placeholder: "35",
            helperText: "Optional if bodyweight is the better proxy for you.",
            required: false,
            min: 1,
            max: 100,
            unit: "in",
          },
        ],
        validation: {
          kind: "appearance_proxy_anchor",
          message: "Add one clean proxy we can track right away, or skip it for now and let the first block stay more conservative.",
        },
      }),
    }));
    if (!facts?.targetWindowKnown && appearanceHasExplicitTimingSignal) {
      requiredFields.push(buildRequirement({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceTimeline,
        label: "Appearance goal timeline",
        filled: false,
        fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
        goalRole,
        question: buildQuestion({
          key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceTimeline,
          prompt: "What's the rough time window for this appearance goal?",
          placeholder: "Example: by late summer",
          fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
          label: "Appearance goal timeline",
          goalRole,
          affectsTimeline: true,
          expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
          inputFields: [{
            key: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
            label: "Appearance goal timeline",
            inputType: "text",
            expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
            placeholder: "Example: by late summer",
            helperText: "A rough target month or season is enough.",
            required: true,
          }],
          validation: {
            kind: "target_timeline",
            message: "Enter the rough time window for this appearance goal.",
          },
        }),
      }));
    }
    optionalFields.push(buildRequirement({
      key: "appearance_optional_bodyweight",
      label: "Current bodyweight",
      required: false,
      filled: Boolean(facts?.currentBodyweight),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentBodyweight],
      goalRole,
    }));
    optionalFields.push(buildRequirement({
      key: "appearance_optional_waist",
      label: "Current waist measurement",
      required: false,
      filled: Boolean(facts?.currentWaist),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentWaist],
      goalRole,
    }));
  }

  if (goalRole === "primary" && needsSafeStartCapacity(goal)) {
    requiredFields.push(buildRequirement({
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.startingCapacity,
      label: "Safe starting capacity",
      filled: Boolean(facts?.startingCapacityAnchor),
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor],
      goalRole,
      question: buildQuestion({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.startingCapacity,
        prompt: "What feels repeatable right now: a short walk, about 10 easy minutes, about 20 to 30 minutes, or 30+ minutes?",
        placeholder: "Example: about 20 to 30 minutes",
        fieldKeys: [INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor],
        label: "Safe starting capacity",
        goalRole,
        expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.startingCapacity,
        inputFields: [
          {
            key: INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor,
            label: "Safe starting capacity",
            inputType: "text",
            expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.startingCapacity,
            placeholder: "Example: about 20 to 30 minutes",
            helperText: "This keeps the first week honest about what you can repeat safely.",
            required: true,
          },
        ],
        validation: {
          kind: "starting_capacity",
          message: "Choose the starting capacity that feels most repeatable right now.",
        },
      }),
    }));
  }

  return { requiredFields, optionalFields };
};

const dedupeRequirements = (requirements = []) => {
  const seen = new Set();
  return (requirements || []).filter((item) => {
    if (!item?.key) return false;
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

const dedupeQuestions = (questions = []) => {
  const seen = new Set();
  return (questions || [])
    .filter(Boolean)
    .filter((item) => {
      const key = `${sanitizeText(item?.key || "", 80).toLowerCase()}::${sanitizeText(item?.prompt || "", 220).toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const normalizeStructuredAnswerValues = (answerValues = {}) => Object.fromEntries(
  Object.entries(answerValues && typeof answerValues === "object" ? answerValues : {})
    .map(([key, value]) => [sanitizeText(key, 80), normalizeNumberText(value)])
    .filter(([key]) => key)
);

export function validateTimelineValue(value = "") {
  const clean = sanitizeText(value, 120);
  if (!clean) return "";
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(clean) || hasTimingSignal(clean)) return clean;
  return "";
}

export const isStructuredIntakeCompletenessQuestion = (question = {}) => (
  sanitizeText(question?.source || "", 40).toLowerCase() === COMPLETENESS_SOURCE
  && Array.isArray(question?.inputFields)
  && question.inputFields.length > 0
);

export const buildIntakeCompletenessDraft = ({
  question = null,
  answers = {},
} = {}) => {
  if (!isStructuredIntakeCompletenessQuestion(question)) return {};
  const storedStrength = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline);
  const storedTimeline = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.targetTimeline);
  const storedRunFrequency = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentRunFrequency);
  const storedLongestRun = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.longestRecentRun);
  const storedRecentPace = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline);
  const storedSwimAnchor = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor);
  const storedSwimAccessReality = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.swimAccessReality);
  const storedStartingCapacity = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor);
  const storedBodyweight = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
  const storedTargetChange = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.targetWeightChange);
  const storedWaist = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentWaist);
  const values = {};

  switch (question?.key) {
    case INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline:
      if (question?.expectedValueType === INTAKE_COMPLETENESS_VALUE_TYPES.athleticPowerBaseline) {
        values[INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline] = sanitizeText(storedStrength?.raw || "", 160);
      } else {
        values.current_strength_baseline_weight = Number.isFinite(storedStrength?.weight) ? String(storedStrength.weight) : "";
        values.current_strength_baseline_reps = Number.isFinite(storedStrength?.reps) ? String(storedStrength.reps) : "";
      }
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceTimeline:
      values[INTAKE_COMPLETENESS_FIELDS.targetTimeline] = sanitizeText(storedTimeline?.raw || storedTimeline?.value || "", 120);
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline:
      values[INTAKE_COMPLETENESS_FIELDS.currentRunFrequency] = Number.isFinite(storedRunFrequency?.value) ? String(storedRunFrequency.value) : "";
      values[INTAKE_COMPLETENESS_FIELDS.longestRecentRun] = sanitizeText(storedLongestRun?.raw || "", 160);
      values[INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline] = sanitizeText(storedRecentPace?.raw || "", 160);
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.swimBaseline:
      values[INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor] = sanitizeText(storedSwimAnchor?.raw || "", 160);
      values[INTAKE_COMPLETENESS_FIELDS.swimAccessReality] = sanitizeText(storedSwimAccessReality?.value || storedSwimAccessReality?.raw || "", 80);
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor: {
      const targetField = toArray(question?.inputFields).find((field) => field?.key === INTAKE_COMPLETENESS_FIELDS.targetWeightChange);
      const direction = sanitizeText(targetField?.direction || "", 20).toLowerCase();
      values[INTAKE_COMPLETENESS_FIELDS.currentBodyweight] = Number.isFinite(storedBodyweight?.value) ? String(storedBodyweight.value) : "";
      values[INTAKE_COMPLETENESS_FIELDS.targetWeightChange] = Number.isFinite(storedTargetChange?.value)
        ? String(direction === "loss" ? Math.abs(storedTargetChange.value) : storedTargetChange.value)
        : "";
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor:
      values[INTAKE_COMPLETENESS_FIELDS.currentBodyweight] = Number.isFinite(storedBodyweight?.value) ? String(storedBodyweight.value) : "";
      values[INTAKE_COMPLETENESS_FIELDS.currentWaist] = Number.isFinite(storedWaist?.value) ? String(storedWaist.value) : "";
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.startingCapacity:
      values[INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor] = sanitizeText(storedStartingCapacity?.value || storedStartingCapacity?.raw || "", 80);
      break;
    default:
      break;
  }

  return values;
};

export const validateIntakeCompletenessAnswer = ({
  question = null,
  answerText = "",
  answerValues = null,
} = {}) => {
  const fieldErrors = {};
  const cleanText = sanitizeText(answerText, 220);
  const values = normalizeStructuredAnswerValues(answerValues);

  if (!isStructuredIntakeCompletenessQuestion(question)) {
    return {
      isStructured: false,
      isValid: Boolean(cleanText),
      fieldErrors,
      formError: cleanText ? "" : "Add the detail I asked for before continuing.",
      summaryText: cleanText,
      normalizedValues: {},
    };
  }

  const setFieldError = (fieldKey, message) => {
    const cleanKey = sanitizeText(fieldKey, 80);
    const cleanMessage = sanitizeText(message, 180);
    if (cleanKey && cleanMessage) fieldErrors[cleanKey] = cleanMessage;
  };
  const inputFieldByKey = Object.fromEntries(
    toArray(question?.inputFields).map((field) => [sanitizeText(field?.key, 80), field]).filter(([key]) => key)
  );

  let summaryText = "";
  let formError = "";
  let normalizedValues = {};

  switch (question?.key) {
    case INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline: {
      if (question?.expectedValueType === INTAKE_COMPLETENESS_VALUE_TYPES.athleticPowerBaseline) {
        const baselineText = sanitizeText(values[INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline] || "", 160);
        if (!baselineText) {
          setFieldError(INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline, "Add your current jump or dunk baseline.");
          break;
        }
        summaryText = baselineText;
        normalizedValues = {
          [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline]: {
            raw: baselineText,
            value: baselineText,
          },
        };
        break;
      }
      const weight = readFiniteNumber(values.current_strength_baseline_weight);
      const repsValue = sanitizeText(values.current_strength_baseline_reps || "", 40);
      const reps = repsValue ? readFiniteNumber(repsValue) : null;
      if (!Number.isFinite(weight) || weight <= 0) {
        setFieldError("current_strength_baseline_weight", "Enter a recent weight for this lift.");
      }
      if (repsValue && (!Number.isFinite(reps) || reps <= 0)) {
        setFieldError("current_strength_baseline_reps", "Enter reps as a whole number or leave it blank.");
      }
      if (Object.keys(fieldErrors).length > 0) break;
      summaryText = Number.isFinite(reps) ? `${weight} x ${Math.round(reps)}` : `${weight}`;
      normalizedValues = {
        [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline]: {
          raw: summaryText,
          value: weight,
          weight,
          reps: Number.isFinite(reps) ? Math.round(reps) : null,
        },
      };
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceTimeline: {
      const timelineRecord = resolveTimelineFieldRecord({
        rawText: values[INTAKE_COMPLETENESS_FIELDS.targetTimeline] || cleanText,
        candidateValue: values[INTAKE_COMPLETENESS_FIELDS.targetTimeline] || cleanText,
      });
      if (!timelineRecord) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.targetTimeline, "Enter a date, target month, or rough time window.");
        break;
      }
      summaryText = timelineRecord.raw;
      normalizedValues = {
        [INTAKE_COMPLETENESS_FIELDS.targetTimeline]: {
          raw: timelineRecord.raw,
          value: timelineRecord.value,
        },
      };
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline: {
      const frequency = readFiniteNumber(values[INTAKE_COMPLETENESS_FIELDS.currentRunFrequency]);
      const longestRunText = sanitizeText(values[INTAKE_COMPLETENESS_FIELDS.longestRecentRun] || "", 160);
      const recentPaceText = sanitizeText(values[INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline] || "", 160);
      const longestMiles = parseDistanceMiles(longestRunText);
      const longestMinutes = parseDurationMinutes(longestRunText);
      const paceText = parsePaceLikeText(recentPaceText);
      if (!Number.isFinite(frequency) || frequency <= 0) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.currentRunFrequency, "Enter how many runs you do in a normal week.");
      }
      if (!longestRunText && !recentPaceText) {
        formError = "Add either your longest recent run or a recent pace/race result.";
      } else if (!Number.isFinite(longestMiles) && !Number.isFinite(longestMinutes) && !paceText) {
        formError = "Add either a longest run like 6 miles / 90 minutes, or a recent pace / race result.";
      }
      if (Object.keys(fieldErrors).length > 0 || formError) break;
      summaryText = [
        `${Math.round(frequency)} runs/week`,
        longestRunText ? `longest ${longestRunText}` : "",
        paceText ? paceText : "",
      ].filter(Boolean).join(", ");
      normalizedValues = {
        [INTAKE_COMPLETENESS_FIELDS.currentRunFrequency]: {
          raw: `${Math.round(frequency)}`,
          value: Math.round(frequency),
        },
        ...(longestRunText
          ? {
              [INTAKE_COMPLETENESS_FIELDS.longestRecentRun]: {
                raw: longestRunText,
                value: Number.isFinite(longestMiles) ? longestMiles : longestMinutes,
                miles: Number.isFinite(longestMiles) ? longestMiles : null,
                minutes: Number.isFinite(longestMinutes) ? longestMinutes : null,
              },
            }
          : {}),
        ...(paceText
          ? {
              [INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline]: {
                raw: recentPaceText,
                value: paceText,
                paceText,
              },
            }
          : {}),
      };
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.swimBaseline: {
      const swimAnchorText = sanitizeText(values[INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor] || "", 160);
      const swimAnchor = parseSwimAnchor(swimAnchorText);
      const swimAccessReality = parseSwimAccessReality(values[INTAKE_COMPLETENESS_FIELDS.swimAccessReality] || "");
      if (!swimAnchorText || (!Number.isFinite(swimAnchor?.distance) && !swimAnchor?.duration)) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor, "Add one recent swim distance or time anchor.");
      }
      if (!swimAccessReality) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.swimAccessReality, "Choose whether this is mostly pool, open water, or both.");
      }
      if (Object.keys(fieldErrors).length > 0) break;
      const swimRealityLabel = swimAccessReality === "open_water"
        ? "open water"
        : swimAccessReality === "both"
        ? "pool + open water"
        : "pool";
      summaryText = [swimAnchorText, swimRealityLabel].filter(Boolean).join(", ");
      normalizedValues = {
        [INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor]: {
          raw: swimAnchor.raw,
          value: swimAnchor.raw,
          distance: swimAnchor.distance,
          distanceUnit: swimAnchor.distanceUnit,
          duration: swimAnchor.duration,
        },
        [INTAKE_COMPLETENESS_FIELDS.swimAccessReality]: {
          raw: swimRealityLabel,
          value: swimAccessReality,
        },
      };
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor: {
      const currentBodyweight = readFiniteNumber(values[INTAKE_COMPLETENESS_FIELDS.currentBodyweight]);
      const targetChange = readFiniteNumber(values[INTAKE_COMPLETENESS_FIELDS.targetWeightChange]);
      const targetField = inputFieldByKey[INTAKE_COMPLETENESS_FIELDS.targetWeightChange] || {};
      const weightField = inputFieldByKey[INTAKE_COMPLETENESS_FIELDS.currentBodyweight] || {};
      if (weightField.required && (!Number.isFinite(currentBodyweight) || currentBodyweight <= 0)) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.currentBodyweight, "Enter your current bodyweight.");
      }
      if (targetField.required && (!Number.isFinite(targetChange) || targetChange <= 0)) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.targetWeightChange, "Enter how many pounds you want to lose.");
      }
      if (Object.keys(fieldErrors).length > 0) break;
      const normalizedTargetChange = Number.isFinite(targetChange)
        ? (sanitizeText(targetField.direction || "", 20).toLowerCase() === "loss" ? -Math.abs(targetChange) : targetChange)
        : null;
      summaryText = [
        Number.isFinite(currentBodyweight) ? `${currentBodyweight} lb` : "",
        Number.isFinite(normalizedTargetChange)
          ? `${normalizedTargetChange < 0 ? "lose" : "change"} ${Math.abs(normalizedTargetChange)} lb`
          : "",
      ].filter(Boolean).join(", ");
      normalizedValues = {
        ...(Number.isFinite(currentBodyweight)
          ? {
              [INTAKE_COMPLETENESS_FIELDS.currentBodyweight]: {
                raw: `${currentBodyweight} lb`,
                value: currentBodyweight,
                unit: "lb",
              },
            }
          : {}),
        ...(Number.isFinite(normalizedTargetChange)
          ? {
              [INTAKE_COMPLETENESS_FIELDS.targetWeightChange]: {
                raw: `${Math.abs(normalizedTargetChange)} lb`,
                value: normalizedTargetChange,
                unit: "lb",
              },
            }
          : {}),
      };
      if (weightField.required && !normalizedValues[INTAKE_COMPLETENESS_FIELDS.currentBodyweight]) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.currentBodyweight, "Enter your current bodyweight.");
      }
      if (targetField.required && !normalizedValues[INTAKE_COMPLETENESS_FIELDS.targetWeightChange]) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.targetWeightChange, "Enter how many pounds you want to lose.");
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor: {
      const appearanceProxyPlan = sanitizeText(values[INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan] || "", 80).toLowerCase();
      const currentBodyweight = readFiniteNumber(values[INTAKE_COMPLETENESS_FIELDS.currentBodyweight]);
      const currentWaist = readFiniteNumber(values[INTAKE_COMPLETENESS_FIELDS.currentWaist]);
      if (appearanceProxyPlan === "skip_for_now") {
        summaryText = "Skip proxy for now";
        normalizedValues = {
          [INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan]: {
            raw: "skip for now",
            value: "skip_for_now",
          },
        };
        break;
      }
      if ((!Number.isFinite(currentBodyweight) || currentBodyweight <= 0) && (!Number.isFinite(currentWaist) || currentWaist <= 0)) {
        formError = "Add either your current bodyweight or your waist, or skip it for now.";
        break;
      }
      summaryText = [
        Number.isFinite(currentBodyweight) && currentBodyweight > 0 ? `${currentBodyweight} lb` : "",
        Number.isFinite(currentWaist) && currentWaist > 0 ? `${currentWaist} in waist` : "",
      ].filter(Boolean).join(", ");
      normalizedValues = {
        ...(Number.isFinite(currentBodyweight) && currentBodyweight > 0
          ? {
              [INTAKE_COMPLETENESS_FIELDS.currentBodyweight]: {
                raw: `${currentBodyweight} lb`,
                value: currentBodyweight,
                unit: "lb",
              },
            }
          : {}),
        ...(Number.isFinite(currentWaist) && currentWaist > 0
          ? {
              [INTAKE_COMPLETENESS_FIELDS.currentWaist]: {
                raw: `${currentWaist} in`,
                value: currentWaist,
                unit: "in",
              },
            }
          : {}),
      };
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.startingCapacity: {
      const startingCapacity = parseStartingCapacityChoice(values[INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor] || cleanText);
      const startingCapacityRaw = sanitizeText(values[INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor] || cleanText, 80);
      if (!startingCapacity) {
        setFieldError(INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor, "Choose what feels repeatable right now.");
        break;
      }
      summaryText = startingCapacityRaw || startingCapacity.replaceAll("_", " ");
      normalizedValues = {
        [INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor]: {
          raw: summaryText,
          value: startingCapacity,
        },
      };
      break;
    }
    default:
      formError = sanitizeText(question?.validation?.message || "", 220) || "Add the detail I asked for before continuing.";
      break;
  }

  return {
    isStructured: true,
    isValid: Object.keys(fieldErrors).length === 0 && !formError && Object.keys(normalizedValues).length > 0,
    fieldErrors,
    formError,
    summaryText,
    normalizedValues,
  };
};

export const deriveIntakeCompletenessState = ({
  resolvedGoals = [],
  answers = {},
} = {}) => {
  const goals = (Array.isArray(resolvedGoals) ? resolvedGoals : []).filter(Boolean);
  const facts = resolveKnownFacts({ resolvedGoals: goals, answers });
  const requirementBuckets = goals.map((goal, index) => buildRequirementsForGoal({ goal, index, facts }));
  const requiredFields = dedupeRequirements(requirementBuckets.flatMap((bucket) => bucket.requiredFields || []));
  const optionalFields = dedupeRequirements(requirementBuckets.flatMap((bucket) => bucket.optionalFields || []));
  const missingRequired = requiredFields.filter((item) => !item?.filled);
  const missingOptional = optionalFields.filter((item) => !item?.filled);
  const nextQuestions = dedupeQuestions(missingRequired.map((item) => item?.question).filter(Boolean));

  return {
    facts,
    requiredFields,
    optionalFields,
    missingRequired,
    missingOptional,
    nextQuestions,
    isComplete: missingRequired.length === 0,
  };
};

const upsertCompletenessField = (answers = {}, fieldKey = "", fieldRecord = null) => {
  if (!fieldKey || !fieldRecord) return answers;
  return {
    ...answers,
    intake_completeness: {
      version: "2026-04-v1",
      ...(answers?.intake_completeness || {}),
      fields: {
        ...(answers?.intake_completeness?.fields || {}),
        [fieldKey]: fieldRecord,
      },
    },
  };
};

const applyStructuredField = (answers = {}, fieldKey = "", rawText = "", parsed = {}) => {
  const nextRecord = buildFieldRecord({
    fieldKey,
    raw: rawText,
    value: parsed?.value ?? rawText,
    extra: parsed?.extra || {},
  });
  if (!nextRecord.raw) return answers;
  return upsertCompletenessField(answers, fieldKey, nextRecord);
};

export const applyIntakeCompletenessAnswer = ({
  answers = {},
  question = null,
  answerText = "",
  answerValues = null,
} = {}) => {
  const cleanAnswer = sanitizeText(answerText, 220);
  const structuredValidation = validateIntakeCompletenessAnswer({
    question,
    answerText,
    answerValues,
  });
  const hasStructuredPayload = structuredValidation.isStructured;

  if (((!cleanAnswer && !hasStructuredPayload) || question?.source !== COMPLETENESS_SOURCE)) {
    return { answers, storedFieldKeys: [], validation: structuredValidation };
  }

  let nextAnswers = answers;
  const storedFieldKeys = [];
  const allowedFieldKeys = new Set(
    toArray(question?.fieldKeys)
      .map((item) => sanitizeText(item, 80))
      .filter(Boolean)
  );
  const canStoreField = (fieldKey = "") => allowedFieldKeys.size === 0 || allowedFieldKeys.has(fieldKey);

  const storeField = (fieldKey, parsedValue, extra = {}) => {
    if (!canStoreField(fieldKey)) return;
    if (parsedValue === null || parsedValue === "" || parsedValue === undefined || parsedValue === false) return;
    nextAnswers = applyStructuredField(nextAnswers, fieldKey, cleanAnswer, { value: parsedValue, extra });
    storedFieldKeys.push(fieldKey);
  };

  if (hasStructuredPayload) {
    if (!structuredValidation.isValid) {
      return {
        answers,
        storedFieldKeys: [],
        validation: structuredValidation,
      };
    }
    Object.entries(structuredValidation.normalizedValues || {}).forEach(([fieldKey, record]) => {
      if (!canStoreField(fieldKey) || !record) return;
      nextAnswers = upsertCompletenessField(nextAnswers, fieldKey, record);
      storedFieldKeys.push(fieldKey);
    });
    return {
      answers: nextAnswers,
      storedFieldKeys,
      validation: structuredValidation,
    };
  }

  switch (question?.key) {
    case INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline: {
      const parsed = parseStrengthBaseline(cleanAnswer);
      if (parsed?.raw && canStoreField(INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline, {
          raw: parsed.raw,
          value: parsed.weight ?? parsed.raw,
          weight: parsed.weight ?? null,
          reps: parsed.reps ?? null,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline);
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceTimeline: {
      const timelineRecord = resolveTimelineFieldRecord({
        rawText: cleanAnswer,
        candidateValue: cleanAnswer,
      });
      if (timelineRecord && canStoreField(INTAKE_COMPLETENESS_FIELDS.targetTimeline)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.targetTimeline, timelineRecord);
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.targetTimeline);
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline: {
      const frequency = parseRunFrequency(cleanAnswer);
      const longestMiles = parseDistanceMiles(cleanAnswer);
      const longestMinutes = parseDurationMinutes(cleanAnswer);
      const paceText = parsePaceLikeText(cleanAnswer);
      if (Number.isFinite(frequency)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentRunFrequency, {
          raw: cleanAnswer,
          value: frequency,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentRunFrequency);
      }
      if (Number.isFinite(longestMiles) || Number.isFinite(longestMinutes)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.longestRecentRun, {
          raw: cleanAnswer,
          value: Number.isFinite(longestMiles) ? longestMiles : longestMinutes,
          miles: Number.isFinite(longestMiles) ? longestMiles : null,
          minutes: Number.isFinite(longestMinutes) ? longestMinutes : null,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.longestRecentRun);
      }
      if (paceText) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline, {
          raw: cleanAnswer,
          value: paceText,
          paceText,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline);
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.swimBaseline: {
      const swimAnchor = parseSwimAnchor(cleanAnswer);
      const swimAccessReality = parseSwimAccessReality(cleanAnswer);
      if ((Number.isFinite(swimAnchor?.distance) || swimAnchor?.duration) && canStoreField(INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor, {
          raw: swimAnchor.raw,
          value: swimAnchor.raw,
          distance: swimAnchor.distance,
          distanceUnit: swimAnchor.distanceUnit,
          duration: swimAnchor.duration,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor);
      }
      if (swimAccessReality && canStoreField(INTAKE_COMPLETENESS_FIELDS.swimAccessReality)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.swimAccessReality, {
          raw: swimAccessReality === "open_water" ? "open water" : swimAccessReality === "both" ? "pool + open water" : "pool",
          value: swimAccessReality,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.swimAccessReality);
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor: {
      const weight = parseFirstWeightLikeNumber(cleanAnswer);
      const targetChange = parseTargetWeightChange(cleanAnswer);
      if (Number.isFinite(weight) && canStoreField(INTAKE_COMPLETENESS_FIELDS.currentBodyweight)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight, {
          raw: cleanAnswer,
          value: weight,
          unit: "lb",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
      }
      if (Number.isFinite(targetChange) && canStoreField(INTAKE_COMPLETENESS_FIELDS.targetWeightChange)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.targetWeightChange, {
          raw: cleanAnswer,
          value: targetChange,
          unit: "lb",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.targetWeightChange);
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor: {
      const weight = parseFirstWeightLikeNumber(cleanAnswer);
      const waist = parseWaistMeasurement(cleanAnswer);
      const photos = /photo/i.test(cleanAnswer) ? normalizeBoolean(cleanAnswer) ?? true : normalizeBoolean(cleanAnswer);
      const wantsToSkipProxy = /\b(skip|later|not right now|for now|without a proxy)\b/i.test(cleanAnswer);
      if (Number.isFinite(weight) && !/waist/i.test(cleanAnswer) && canStoreField(INTAKE_COMPLETENESS_FIELDS.currentBodyweight)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight, {
          raw: cleanAnswer,
          value: weight,
          unit: "lb",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
      }
      if (Number.isFinite(waist) && canStoreField(INTAKE_COMPLETENESS_FIELDS.currentWaist)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentWaist, {
          raw: cleanAnswer,
          value: waist,
          unit: "in",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentWaist);
      }
      if (!Number.isFinite(weight) && !Number.isFinite(waist) && wantsToSkipProxy && canStoreField(INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan, {
          raw: "skip for now",
          value: "skip_for_now",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan);
      }
      if (photos === true && canStoreField(INTAKE_COMPLETENESS_FIELDS.progressPhotos)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.progressPhotos, {
          raw: cleanAnswer,
          value: true,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.progressPhotos);
      }
      break;
    }
    case INTAKE_COMPLETENESS_QUESTION_KEYS.startingCapacity: {
      const startingCapacity = parseStartingCapacityChoice(cleanAnswer);
      if (startingCapacity && canStoreField(INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor, {
          raw: cleanAnswer,
          value: startingCapacity,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor);
      }
      break;
    }
    default:
      break;
  }

  return {
    answers: nextAnswers,
    storedFieldKeys,
    validation: structuredValidation,
  };
};

export const buildIntakeCompletenessContext = ({
  resolvedGoals = [],
  answers = {},
} = {}) => {
  const state = deriveIntakeCompletenessState({ resolvedGoals, answers });
  const facts = state?.facts || {};
  const summaryLines = dedupeStrings([
    facts?.currentStrengthBaseline?.text ? `Current strength baseline: ${facts.currentStrengthBaseline.text}` : "",
    Number.isFinite(facts?.currentRunFrequency) ? `Current running frequency: ${facts.currentRunFrequency} runs per week` : "",
    facts?.longestRecentRun?.text ? `Longest recent run: ${facts.longestRecentRun.text}` : "",
    facts?.recentPaceBaseline?.text ? `Recent running pace baseline: ${facts.recentPaceBaseline.text}` : "",
    facts?.recentSwimAnchor?.text ? `Recent swim anchor: ${facts.recentSwimAnchor.text}` : "",
    facts?.swimAccessRealityText ? `Swim reality: ${facts.swimAccessRealityText}` : "",
    Number.isFinite(facts?.currentBodyweight) ? `Current bodyweight: ${facts.currentBodyweight} lb` : "",
    Number.isFinite(facts?.targetWeightChange) ? `Desired bodyweight change: ${facts.targetWeightChange > 0 ? "+" : ""}${facts.targetWeightChange} lb` : "",
    Number.isFinite(facts?.currentWaist) ? `Current waist: ${facts.currentWaist} in` : "",
    facts?.startingCapacityText ? `Safe starting capacity: ${facts.startingCapacityText}` : "",
    facts?.appearanceProxyPlan === "skip_for_now" ? "Appearance proxy is intentionally deferred for now." : "",
  ]);

  const timingHints = dedupeStrings([
    facts?.targetTimelineText || "",
  ]);

  const appearanceHints = dedupeStrings([
    Number.isFinite(facts?.currentWaist) ? `${facts.currentWaist} in waist` : "",
  ]);

  return {
    version: "2026-04-v1",
    fields: {
      ...(answers?.intake_completeness?.fields || {}),
    },
    summaryLines,
    timingHints,
    appearanceHints,
    missingRequired: state.missingRequired.map((item) => item.label),
    missingOptional: state.missingOptional.map((item) => item.label),
  };
};
