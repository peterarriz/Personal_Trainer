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
  currentStrengthBaseline: "current_strength_baseline",
  targetTimeline: "target_timeline",
  currentRunFrequency: "current_run_frequency",
  longestRecentRun: "longest_recent_run",
  recentPaceBaseline: "recent_pace_baseline",
  currentBodyweight: "current_bodyweight",
  targetWeightChange: "target_weight_change",
  currentWaist: "current_waist",
  progressPhotos: "progress_photos",
};

export const INTAKE_COMPLETENESS_QUESTION_KEYS = {
  strengthBaseline: "strength_baseline",
  runningTiming: "running_timing",
  runningBaseline: "running_baseline",
  bodyCompAnchor: "body_comp_anchor",
  bodyCompTimeline: "body_comp_timeline",
  appearanceProxyAnchor: "appearance_proxy_anchor",
  appearanceTimeline: "appearance_timeline",
  maintainedStrengthBaseline: "maintained_strength_baseline",
};

const COMPLETENESS_SOURCE = "completeness";

const COMPLETENESS_FIELD_FALLBACK_PATTERNS = {
  [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline]: [/bench|strength baseline|current lift|upper body/i],
  [INTAKE_COMPLETENESS_FIELDS.currentRunFrequency]: [/running baseline|runs per week|run frequency/i],
  [INTAKE_COMPLETENESS_FIELDS.longestRecentRun]: [/running baseline|longest recent run|long run/i],
  [INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline]: [/running baseline|recent pace|race result|pace baseline/i],
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

const parseFirstWeightLikeNumber = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const generic = normalized.match(/\b(\d{2,3}(?:\.\d+)?)\b/);
  return generic?.[1] ? Number(generic[1]) : null;
};

const parseRunFrequency = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d+)\s*(?:runs?|days?)\s*(?:per|\/)?\s*(?:week|wk)/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const weeklyTimes = normalized.match(/(\d+)\s*(?:x|times?)\s*(?:a|per|\/)?\s*(?:week|wk)/i);
  if (weeklyTimes?.[1]) return Number(weeklyTimes[1]);
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

const parseExplicitDateText = (text = "") => {
  const normalized = sanitizeText(text, 120);
  if (!normalized) return "";
  const isoMatch = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch?.[0]) return isoMatch[0];
  return normalized;
};

const hasTimingSignal = (text = "") => /\b(by|before|over the next|within|in)\b|\bspring\b|\bsummer\b|\bfall\b|\bautumn\b|\bwinter\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\bmay\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/i.test(String(text || ""));

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
});

const buildStrengthBaselinePrompt = (resolvedGoal = {}, goalRole = "primary") => {
  const liftLabel = sanitizeText(resolvedGoal?.primaryMetric?.label || "", 60).toLowerCase();
  const rolePrefix = goalRole === "maintained" ? "To protect the maintained strength goal, " : "";
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
    };
  }
  if (needsWeight) {
    return {
      label: "Current bodyweight",
      prompt: "What's your current bodyweight or closest recent scale weight?",
      placeholder: "Example: 205 lb",
    };
  }
  return {
    label: "Desired weight change",
    prompt: "Roughly how much weight are you trying to lose?",
    placeholder: "Example: 15-20 lb",
  };
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

  if (planningCategory === "running") {
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
    optionalFields.push(buildRequirement({
      key: "body_comp_photos_optional",
      label: "Manual photo review (future)",
      required: false,
      filled: facts?.progressPhotos === true,
      fieldKeys: [INTAKE_COMPLETENESS_FIELDS.progressPhotos],
      goalRole,
    }));
  }

  if (goalFamily === "appearance" && goalRole === "primary") {
    const appearanceHasExplicitTimingSignal = /\b(by|before|for)\b|\bspring\b|\bsummer\b|\bfall\b|\bautumn\b|\bwinter\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\bmay\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/i.test(String(goal?.rawIntent?.text || ""));
    const proxyAnchorReady = Boolean(facts?.currentBodyweight || facts?.currentWaist || facts?.progressPhotos === true);
    requiredFields.push(buildRequirement({
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
      label: "Appearance tracking proxy",
      filled: proxyAnchorReady,
      fieldKeys: [
        INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
        INTAKE_COMPLETENESS_FIELDS.currentWaist,
      ],
      goalRole,
      question: buildQuestion({
        key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
        prompt: "What's one proxy we can track for this right now: current bodyweight or waist?",
        placeholder: "Example: 198 lb or 35-inch waist",
        fieldKeys: [
          INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
          INTAKE_COMPLETENESS_FIELDS.currentWaist,
        ],
        label: "Appearance tracking proxy",
        goalRole,
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
} = {}) => {
  const cleanAnswer = sanitizeText(answerText, 220);
  if (!cleanAnswer || question?.source !== COMPLETENESS_SOURCE) {
    return { answers, storedFieldKeys: [] };
  }

  let nextAnswers = answers;
  const storedFieldKeys = [];

  const storeField = (fieldKey, parsedValue, extra = {}) => {
    if (parsedValue === null || parsedValue === "" || parsedValue === undefined || parsedValue === false) return;
    nextAnswers = applyStructuredField(nextAnswers, fieldKey, cleanAnswer, { value: parsedValue, extra });
    storedFieldKeys.push(fieldKey);
  };

  switch (question?.key) {
    case INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline: {
      const parsed = parseStrengthBaseline(cleanAnswer);
      if (parsed?.raw) {
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
      storeField(INTAKE_COMPLETENESS_FIELDS.targetTimeline, parseExplicitDateText(cleanAnswer));
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
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor: {
      const weight = parseFirstWeightLikeNumber(cleanAnswer);
      const targetChange = parseTargetWeightChange(cleanAnswer);
      if (Number.isFinite(weight)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight, {
          raw: cleanAnswer,
          value: weight,
          unit: "lb",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
      }
      if (Number.isFinite(targetChange)) {
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
      if (Number.isFinite(weight) && !/waist/i.test(cleanAnswer)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight, {
          raw: cleanAnswer,
          value: weight,
          unit: "lb",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
      }
      if (Number.isFinite(waist)) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.currentWaist, {
          raw: cleanAnswer,
          value: waist,
          unit: "in",
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.currentWaist);
      }
      if (photos === true) {
        nextAnswers = upsertCompletenessField(nextAnswers, INTAKE_COMPLETENESS_FIELDS.progressPhotos, {
          raw: cleanAnswer,
          value: true,
        });
        storedFieldKeys.push(INTAKE_COMPLETENESS_FIELDS.progressPhotos);
      }
      break;
    }
    default:
      break;
  }

  return {
    answers: nextAnswers,
    storedFieldKeys,
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
    Number.isFinite(facts?.currentBodyweight) ? `Current bodyweight: ${facts.currentBodyweight} lb` : "",
    Number.isFinite(facts?.targetWeightChange) ? `Desired bodyweight change: ${facts.targetWeightChange > 0 ? "+" : ""}${facts.targetWeightChange} lb` : "",
    Number.isFinite(facts?.currentWaist) ? `Current waist: ${facts.currentWaist} in` : "",
    facts?.progressPhotos === true ? "Manual photo review is available as a future proxy." : "",
  ]);

  const timingHints = dedupeStrings([
    facts?.targetTimelineText || "",
  ]);

  const appearanceHints = dedupeStrings([
    Number.isFinite(facts?.currentWaist) ? `${facts.currentWaist} in waist` : "",
    facts?.progressPhotos === true ? "manual photo review later" : "",
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
