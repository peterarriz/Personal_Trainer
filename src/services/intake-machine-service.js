import { buildGoalArbitrationStack } from "./goal-arbitration-service.js";
import { applyFeasibilityPriorityOrdering, assessGoalFeasibility } from "./goal-feasibility-service.js";
import {
  deriveIntakeCompletenessState,
  INTAKE_COMPLETENESS_FIELDS,
  INTAKE_COMPLETENESS_QUESTION_KEYS,
  INTAKE_COMPLETENESS_VALUE_TYPES,
} from "./intake-completeness-service.js";
import {
  buildIntakeGoalReviewModel,
  deriveIntakeConfirmationState,
  readAdditionalGoalEntries,
} from "./intake-goal-flow-service.js";
import { resolveGoalTranslation } from "./goal-resolution-service.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clonePlainValue = (value = null) => {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const buildCounterId = (prefix = "id", value = 1) => `${prefix}_${String(Math.max(1, Number(value) || 1)).padStart(6, "0")}`;
const normalizeTimestamp = (value = null) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeGoalText = (value = "") => sanitizeText(value, 180).toLowerCase();
const hasOwn = (value, key) => Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));

const parseFirstWeightLikeNumber = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const generic = normalized.match(/\b(\d{2,3}(?:\.\d+)?)\b/);
  return generic?.[1] ? Number(generic[1]) : null;
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

const parseRunFrequency = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d+)\s*(?:runs?|days?)\s*(?:per|\/)?\s*(?:week|wk)/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const weeklyTimes = normalized.match(/(\d+)\s*(?:x|times?)\s*(?:a|per|\/)?\s*(?:week|wk)/i);
  if (weeklyTimes?.[1]) return Number(weeklyTimes[1]);
  const bareRunCount = normalized.match(/\b(\d+)\s*runs?\b/i);
  if (bareRunCount?.[1]) return Number(bareRunCount[1]);
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
  return minuteMatch?.[1] ? Number(minuteMatch[1]) : null;
};

const parsePaceLikeText = (text = "") => {
  const normalized = sanitizeText(text, 120);
  if (!normalized) return "";
  const pace = normalized.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  if (pace?.[0]) return pace[0];
  if (/\bpace\b|\b5k\b|\b10k\b|\bhalf\b|\bmarathon\b/i.test(normalized)) return normalized;
  return "";
};

const parseStrengthTopSet = (text = "") => {
  const normalized = sanitizeText(text, 160).replace(/[×x]/gi, "x");
  if (!normalized) return { raw: "", weight: null, reps: null };
  const topSetMatch = normalized.match(/(\d{2,4}(?:\.\d+)?)\s*x\s*(\d{1,2})\b/i);
  if (topSetMatch?.[1]) {
    const normalizedWeight = Number(topSetMatch[1]);
    const normalizedReps = Number(topSetMatch[2]);
    return {
      raw: `${normalizedWeight}x${normalizedReps}`,
      weight: normalizedWeight,
      reps: normalizedReps,
    };
  }
  const singleMatch = normalized.match(/(\d{2,4}(?:\.\d+)?)(?:\s*(?:single|1rm|max))?\b/i);
  if (singleMatch?.[1]) {
    const normalizedWeight = Number(singleMatch[1]);
    const isSingle = /single|1rm|max/i.test(normalized);
    return {
      raw: isSingle ? `${normalizedWeight} single` : `${normalizedWeight}`,
      weight: normalizedWeight,
      reps: isSingle ? 1 : null,
    };
  }
  return {
    raw: normalized,
    weight: null,
    reps: null,
  };
};

const parseWaistMeasurement = (text = "") => {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*(?:in|inch|inches)\b/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const withWaist = normalized.match(/waist[^0-9]{0,12}(\d{1,2}(?:\.\d+)?)/i);
  return withWaist?.[1] ? Number(withWaist[1]) : null;
};

const hasTimingSignal = (text = "") => /\b(by|before|over the next|within|in)\b|\bweek(?:s)?\b|\bmonth(?:s)?\b|\byear(?:s)?\b|\bspring\b|\bsummer\b|\bfall\b|\bautumn\b|\bwinter\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\bmay\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/i.test(String(text || ""));

const validateTimelineValue = (value = "") => {
  const clean = sanitizeText(value, 120);
  if (!clean) return "";
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(clean) || hasTimingSignal(clean)) return clean;
  return "";
};

const readStoredField = (answers = {}, fieldKey = "") => {
  const stored = answers?.intake_completeness?.fields?.[fieldKey];
  return stored && typeof stored === "object" ? stored : null;
};

const buildAnchorBindingTarget = (anchor = null) => ({
  anchor_id: sanitizeText(anchor?.anchor_id || "", 120),
  field_id: sanitizeText(anchor?.field_id || "", 80),
});

const readEventBindingTarget = (payload = {}) => {
  const explicitTarget = payload?.binding_target && typeof payload.binding_target === "object"
    ? payload.binding_target
    : {};
  return {
    anchor_id: sanitizeText(explicitTarget?.anchor_id || payload?.anchor_id || "", 120),
    field_id: sanitizeText(explicitTarget?.field_id || payload?.field_id || "", 80),
  };
};

const matchesBindingTarget = (expected = {}, received = {}) => (
  sanitizeText(expected?.anchor_id || "", 120)
  && sanitizeText(expected?.field_id || "", 80)
  && sanitizeText(expected?.anchor_id || "", 120) === sanitizeText(received?.anchor_id || "", 120)
  && sanitizeText(expected?.field_id || "", 80) === sanitizeText(received?.field_id || "", 80)
);

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

const buildGoalFeasibilityContextFromIntake = (intakeContext = {}) => ({
  userBaseline: intakeContext?.baselineContext || {},
  scheduleReality: intakeContext?.scheduleReality || {},
  currentExperienceContext: {
    injuryConstraintContext: intakeContext?.injuryConstraintContext || {},
    equipmentAccessContext: intakeContext?.equipmentAccessContext || {},
    trainingLocation: intakeContext?.scheduleReality?.trainingLocation || intakeContext?.equipmentAccessContext?.trainingLocation || "",
    startingFresh: Boolean(intakeContext?.baselineContext?.startingFresh),
  },
});

const buildArbitrationIntakePacket = ({ typedIntakePacket = null, rawGoalText = "" } = {}) => {
  const packet = typedIntakePacket && typeof typedIntakePacket === "object"
    ? typedIntakePacket
    : { version: "2026-04-v1", intent: "intake_interpretation" };
  const intake = packet?.intake || packet?.intakeContext || {};
  return {
    ...packet,
    intake: {
      ...intake,
      rawGoalText,
    },
  };
};

const buildConfirmedArbitrationInputs = ({
  answers = {},
  typedIntakePacket = null,
  now = new Date(),
} = {}) => {
  const primaryGoalText = sanitizeText(answers?.goal_intent || "", 320);
  const additionalGoalTexts = readAdditionalGoalEntries({ answers });
  const confirmedPrimaryGoal = primaryGoalText
    ? resolveGoalTranslation({
        rawUserGoalIntent: primaryGoalText,
        typedIntakePacket: buildArbitrationIntakePacket({
          typedIntakePacket,
          rawGoalText: primaryGoalText,
        }),
        explicitUserConfirmation: {
          confirmed: true,
          acceptedProposal: true,
          source: "confirmed_primary_goal",
        },
        now,
      })?.resolvedGoals?.[0] || null
    : null;
  const confirmedAdditionalGoals = additionalGoalTexts.flatMap((goalText) => {
    const resolution = resolveGoalTranslation({
      rawUserGoalIntent: goalText,
      typedIntakePacket: buildArbitrationIntakePacket({
        typedIntakePacket,
        rawGoalText: goalText,
      }),
      explicitUserConfirmation: {
        confirmed: true,
        acceptedProposal: true,
        source: "confirmed_additional_goal",
      },
      now,
    });
    return Array.isArray(resolution?.resolvedGoals) ? resolution.resolvedGoals : [];
  });
  return {
    confirmedPrimaryGoal,
    confirmedAdditionalGoals,
    additionalGoalTexts,
  };
};

const buildGoalIdsForRequirement = ({ requirement = {}, resolvedGoals = [] } = {}) => {
  const normalizedRole = sanitizeText(requirement?.goalRole || "", 40).toLowerCase();
  const goals = toArray(resolvedGoals).filter(Boolean);
  if (normalizedRole === "primary") {
    return goals.slice(0, 1).map((goal) => goal?.id).filter(Boolean);
  }
  if (normalizedRole === "maintained") {
    const maintained = goals
      .filter((goal, index) => (
        sanitizeText(goal?.intakeConfirmedRole || goal?.goalArbitrationRole || "", 40).toLowerCase() === "maintained"
        || index > 0
      ))
      .map((goal) => goal?.id)
      .filter(Boolean);
    return maintained.length ? maintained : goals.slice(1, 2).map((goal) => goal?.id).filter(Boolean);
  }
  return goals.map((goal) => goal?.id).filter(Boolean);
};

const extractExamples = (placeholder = "", fallbacks = []) => {
  const cleanPlaceholder = sanitizeText(placeholder, 160);
  const fromPlaceholder = cleanPlaceholder
    ? cleanPlaceholder.replace(/^example:\s*/i, "").split(/\s+or\s+|,\s*/i).map((item) => sanitizeText(item, 120)).filter(Boolean)
    : [];
  return [...fromPlaceholder, ...toArray(fallbacks).map((item) => sanitizeText(item, 120)).filter(Boolean)]
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 3);
};

const buildMissingAnchor = ({
  field_id = "",
  requirement = null,
  question = {},
  label = "",
  input_type = "text",
  expected_value_type = "text",
  placeholder = "",
  helper_text = "",
  validation = {},
  examples = [],
  priority = 1,
  applies_to_goal_ids = [],
  draftValue = "",
  canonical_field_ids = [],
  why_it_matters = "",
  coach_voice_line = "",
  unit = "",
  unit_options = [],
  options = [],
} = {}) => ({
  anchor_id: `${sanitizeText(requirement?.key || question?.key || "anchor", 80)}:${sanitizeText(field_id, 80)}`,
  requirement_key: sanitizeText(requirement?.key || question?.key || "", 80),
  field_id: sanitizeText(field_id, 80),
  question: sanitizeText(question?.prompt || label || "", 220),
  label: sanitizeText(label || question?.label || "", 160),
  input_type: sanitizeText(input_type, 30) || "text",
  expected_value_type: sanitizeText(expected_value_type, 80) || "text",
  placeholder: sanitizeText(placeholder, 120),
  helper_text: sanitizeText(helper_text, 180),
  validation: {
    kind: sanitizeText(validation?.kind || "", 80),
    message: sanitizeText(validation?.message || "", 220),
    ...(Number.isFinite(validation?.min) ? { min: validation.min } : {}),
    ...(Number.isFinite(validation?.max) ? { max: validation.max } : {}),
    ...(validation?.direction ? { direction: sanitizeText(validation.direction, 20).toLowerCase() } : {}),
  },
  examples: extractExamples(placeholder, examples),
  priority: Math.max(1, Number(priority) || 1),
  applies_to_goal_ids: toArray(applies_to_goal_ids).map((item) => sanitizeText(item, 120)).filter(Boolean),
  draftValue: sanitizeText(draftValue, 160),
  canonical_field_ids: toArray(canonical_field_ids).map((item) => sanitizeText(item, 80)).filter(Boolean),
  why_it_matters: sanitizeText(why_it_matters, 220),
  coach_voice_line: sanitizeText(coach_voice_line, 220),
  unit: sanitizeText(unit, 20),
  unit_options: toArray(unit_options)
    .map((item) => ({
      value: sanitizeText(item?.value || item, 40),
      label: sanitizeText(item?.label || item, 60),
    }))
    .filter((item) => item.value),
  options: toArray(options)
    .map((item) => ({
      value: sanitizeText(item?.value || "", 80),
      label: sanitizeText(item?.label || item?.value || "", 120),
      description: sanitizeText(item?.description || "", 180),
    }))
    .filter((item) => item.value && item.label),
});

const buildRunningEnduranceChoiceAnchor = ({ requirement = null, question = {}, priority = 1, applies_to_goal_ids = [], selectedValue = "" } = {}) => (
  buildMissingAnchor({
    field_id: "running_endurance_anchor_kind",
    requirement,
    question: {
      ...question,
      prompt: "Which is easier right now: longest recent run or a recent race/pace?",
    },
    label: "Choose your running anchor",
    input_type: "choice_chips",
    expected_value_type: "running_anchor_choice",
    placeholder: "",
    helper_text: "Pick the version you can answer fastest. One clean anchor is enough.",
    validation: {
      kind: "running_anchor_choice",
      message: "Choose the running anchor that's easier to answer right now.",
    },
    options: [
      {
        value: INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
        label: "Longest recent run",
        description: "I know my long run better right now.",
      },
      {
        value: INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
        label: "Recent race or pace",
        description: "I remember a result or pace better.",
      },
    ],
    priority,
    applies_to_goal_ids,
    draftValue: sanitizeText(selectedValue, 80),
    canonical_field_ids: [],
    why_it_matters: "One endurance anchor is enough to set the first running block without guessing.",
    coach_voice_line: "Coach note: whichever one is easier to answer is enough to keep moving.",
  })
);

const buildRunningLongestRunAnchor = ({ requirement = null, question = {}, priority = 1, applies_to_goal_ids = [], answers = {} } = {}) => {
  const storedLongestRun = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.longestRecentRun);
  const storedUnit = Number.isFinite(storedLongestRun?.miles)
    ? "miles"
    : Number.isFinite(storedLongestRun?.minutes)
    ? "minutes"
    : "miles";
  return buildMissingAnchor({
    field_id: INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
    requirement,
    question: {
      ...question,
      prompt: "What's your longest recent run?",
    },
    label: "Longest recent run",
    input_type: "number_with_unit",
    expected_value_type: "distance_or_duration",
    placeholder: "Example: 6",
    helper_text: "Distance or duration both work.",
    validation: {
      kind: "longest_recent_run",
      message: "Add the longest recent run you can remember in miles or minutes.",
      min: 1,
      max: 1000,
    },
    unit_options: [
      { value: "miles", label: "Miles" },
      { value: "minutes", label: "Minutes" },
    ],
    priority,
    applies_to_goal_ids,
    draftValue: Number.isFinite(storedLongestRun?.miles)
      ? String(storedLongestRun.miles)
      : Number.isFinite(storedLongestRun?.minutes)
      ? String(storedLongestRun.minutes)
      : "",
    canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.longestRecentRun],
    why_it_matters: "Your longest run tells me how much endurance is already in the tank.",
    coach_voice_line: "Coach note: close enough is fine here. I just need the shape of your current engine.",
    unit: storedUnit,
  });
};

const buildRunningPaceAnchor = ({ requirement = null, question = {}, priority = 1, applies_to_goal_ids = [], answers = {} } = {}) => {
  const storedPace = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline);
  return buildMissingAnchor({
    field_id: INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
    requirement,
    question: {
      ...question,
      prompt: "What's a recent race result or pace you can use as a baseline?",
    },
    label: "Recent race result or pace",
    input_type: "text",
    expected_value_type: "pace_or_result",
    placeholder: "Example: 29:30 5K or 9:15 easy pace",
    helper_text: "A race result, steady pace, or workout pace all work.",
    validation: {
      kind: "recent_pace_baseline",
      message: "Add a recent pace or race result so I have one clean running anchor.",
    },
    examples: ["29:30 5K", "9:15 easy pace"],
    priority,
    applies_to_goal_ids,
    draftValue: sanitizeText(storedPace?.raw || "", 160),
    canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline],
    why_it_matters: "A recent pace or result helps set effort ranges without pretending we know more than we do.",
    coach_voice_line: "Coach note: one honest pace anchor is plenty. It does not need to be perfect.",
  });
};

const buildAppearanceProxyChoiceAnchor = ({ requirement = null, question = {}, priority = 1, applies_to_goal_ids = [], selectedValue = "" } = {}) => (
  buildMissingAnchor({
    field_id: "appearance_proxy_anchor_kind",
    requirement,
    question: {
      ...question,
      prompt: "For your appearance goal, which proxy is easier to use right now: bodyweight or waist?",
    },
    label: "Choose your appearance proxy",
    input_type: "choice_chips",
    expected_value_type: "appearance_proxy_choice",
    placeholder: "",
    helper_text: "Pick the one you can check consistently without friction.",
    validation: {
      kind: "appearance_proxy_choice",
      message: "Choose the appearance proxy that's easier for you to track right now.",
    },
    options: [
      {
        value: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
        label: "Bodyweight",
        description: "Use scale weight if that's the easiest thing to check consistently.",
      },
      {
        value: INTAKE_COMPLETENESS_FIELDS.currentWaist,
        label: "Waist",
        description: "Use waist if that tracks the visual change better for you.",
      },
    ],
    priority,
    applies_to_goal_ids,
    draftValue: sanitizeText(selectedValue, 80),
    canonical_field_ids: [],
    why_it_matters: "We only need one clean proxy so this goal stays trackable instead of fuzzy.",
    coach_voice_line: "Coach note: pick the one you'll actually measure, not the one that sounds more impressive.",
  })
);

const buildAppearanceProxyBodyweightAnchor = ({ requirement = null, question = {}, priority = 1, applies_to_goal_ids = [], answers = {} } = {}) => {
  const storedBodyweight = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight);
  return buildMissingAnchor({
    field_id: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
    requirement,
    question: {
      ...question,
      prompt: "For your appearance goal, what's your current bodyweight or closest recent scale weight?",
    },
    label: "Current bodyweight",
    input_type: "number_with_unit",
    expected_value_type: "number",
    placeholder: "198",
    helper_text: "Closest recent scale weight is fine.",
    validation: {
      kind: "current_bodyweight",
      message: "Enter your current bodyweight.",
      min: 1,
      max: 1000,
    },
    priority,
    applies_to_goal_ids,
    draftValue: Number.isFinite(storedBodyweight?.value) ? String(storedBodyweight.value) : "",
    canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.currentBodyweight],
    why_it_matters: "Bodyweight gives us one clean number to track while the appearance goal is still broad.",
    coach_voice_line: "Coach note: closest recent scale weight is plenty. I don't need a perfect weigh-in.",
    unit: "lb",
    unit_options: [{ value: "lb", label: "lb" }],
  });
};

const buildAppearanceProxyWaistAnchor = ({ requirement = null, question = {}, priority = 1, applies_to_goal_ids = [], answers = {} } = {}) => {
  const storedWaist = readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentWaist);
  return buildMissingAnchor({
    field_id: INTAKE_COMPLETENESS_FIELDS.currentWaist,
    requirement,
    question: {
      ...question,
      prompt: "For your appearance goal, what's your current waist measurement?",
    },
    label: "Current waist",
    input_type: "number_with_unit",
    expected_value_type: "number",
    placeholder: "35",
    helper_text: "A rough tape measurement is enough.",
    validation: {
      kind: "current_waist",
      message: "Enter your current waist measurement.",
      min: 1,
      max: 100,
    },
    priority,
    applies_to_goal_ids,
    draftValue: Number.isFinite(storedWaist?.value) ? String(storedWaist.value) : "",
    canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.currentWaist],
    why_it_matters: "Waist gives us a simple visual-change proxy when bodyweight is noisy.",
    coach_voice_line: "Coach note: a rough tape check is fine here. I just want a repeatable starting point.",
    unit: "in",
    unit_options: [{ value: "in", label: "in" }],
  });
};

const expandRequirementToAnchors = ({
  requirement = null,
  completenessState = null,
  answers = {},
  resolvedGoals = [],
  bindingsByFieldId = {},
  startPriority = 1,
} = {}) => {
  if (!requirement?.question) return [];
  const question = requirement.question;
  const facts = completenessState?.facts || {};
  const appliesToGoalIds = buildGoalIdsForRequirement({ requirement, resolvedGoals });
  const anchors = [];
  let priority = startPriority;
  const selectedRunningAnchor = sanitizeText(
    bindingsByFieldId?.running_endurance_anchor_kind?.parsed_value
      || bindingsByFieldId?.running_endurance_anchor_kind?.raw_text
      || "",
    80
  );
  const selectedAppearanceProxy = sanitizeText(
    bindingsByFieldId?.appearance_proxy_anchor_kind?.parsed_value
      || bindingsByFieldId?.appearance_proxy_anchor_kind?.raw_text
      || "",
    80
  );

  switch (requirement.key) {
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceTimeline:
      anchors.push(buildMissingAnchor({
        field_id: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
        requirement,
        question,
        label: question?.inputFields?.[0]?.label || question.label,
        input_type: "date_or_month",
        expected_value_type: question?.inputFields?.[0]?.expectedValueType || question.expectedValueType,
        placeholder: question?.inputFields?.[0]?.placeholder || question.placeholder,
        helper_text: question?.inputFields?.[0]?.helperText || "",
        validation: {
          ...(question?.validation || {}),
          min: question?.inputFields?.[0]?.min,
          max: question?.inputFields?.[0]?.max,
        },
        priority,
        applies_to_goal_ids: appliesToGoalIds,
        draftValue: sanitizeText(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.targetTimeline)?.raw || "", 160),
        canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
        why_it_matters: "This sets the runway so the first block matches the calendar you actually care about.",
        coach_voice_line: "Coach note: a rough month is enough if you do not know the exact date yet.",
      }));
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline:
    case INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline:
      if (question?.expectedValueType === INTAKE_COMPLETENESS_VALUE_TYPES.athleticPowerBaseline) {
        anchors.push(buildMissingAnchor({
          field_id: INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline,
          requirement,
          question,
          label: question?.inputFields?.[0]?.label || question.label,
          input_type: question?.inputFields?.[0]?.inputType || "text",
          expected_value_type: question?.inputFields?.[0]?.expectedValueType || question.expectedValueType,
          placeholder: question?.inputFields?.[0]?.placeholder || question.placeholder,
          helper_text: question?.inputFields?.[0]?.helperText || "",
          validation: question?.validation || {},
          priority,
          applies_to_goal_ids: appliesToGoalIds,
          draftValue: sanitizeText(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline)?.raw || "", 160),
          canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline],
          why_it_matters: "A real jump or dunk baseline keeps the power block grounded instead of aspirational.",
          coach_voice_line: "Coach note: a simple rim-touch or jump note is enough to get the plan right.",
        }));
        break;
      }
      anchors.push(buildMissingAnchor({
        field_id: INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline,
        requirement,
        question: {
          ...question,
          prompt: "What's a recent top set, best single, or estimated max for this lift?",
        },
        label: question?.label || "Current strength baseline",
        input_type: "strength_top_set",
        expected_value_type: "strength_top_set",
        placeholder: "Example: 185x5 or 205 single",
        helper_text: "Top set, best single, or estimated max all work.",
        validation: {
          kind: "strength_top_set",
          message: "Add a recent top set, best single, or estimated max for this lift.",
        },
        priority,
        applies_to_goal_ids: appliesToGoalIds,
        draftValue: sanitizeText(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline)?.raw || "", 160),
        canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline],
        why_it_matters: "A real strength baseline tells me how aggressive the first block can be.",
        coach_voice_line: "Coach note: even an estimate is better than pretending the starting point is unknown.",
      }));
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline:
      if (!Number.isFinite(facts?.currentRunFrequency)) {
        anchors.push(buildMissingAnchor({
          field_id: INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
          requirement,
          question: {
            ...question,
            prompt: "How many times are you running in a normal week?",
          },
          label: "Runs per week",
          input_type: "number",
          expected_value_type: "integer",
          placeholder: "3",
          helper_text: "Use your normal week, not your best week.",
          validation: {
            kind: "current_run_frequency",
            message: "Enter how many runs you do in a normal week.",
            min: 1,
            max: 14,
          },
        priority,
        applies_to_goal_ids: appliesToGoalIds,
        draftValue: Number.isFinite(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentRunFrequency)?.value)
          ? String(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentRunFrequency)?.value)
          : "",
          canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.currentRunFrequency],
          why_it_matters: "Run frequency is the fastest way to size how much running fits right now.",
          coach_voice_line: "Coach note: give me your normal week, not your best one.",
        }));
        priority += 1;
      }
      if (!facts?.longestRecentRun?.text && !facts?.recentPaceBaseline?.text) {
        if (!selectedRunningAnchor) {
          anchors.push(buildRunningEnduranceChoiceAnchor({
            requirement,
            question,
            priority,
            applies_to_goal_ids: appliesToGoalIds,
            selectedValue: selectedRunningAnchor,
          }));
        } else if (selectedRunningAnchor === INTAKE_COMPLETENESS_FIELDS.longestRecentRun) {
          anchors.push(buildRunningLongestRunAnchor({
            requirement,
            question,
            priority,
            applies_to_goal_ids: appliesToGoalIds,
            answers,
          }));
        } else if (selectedRunningAnchor === INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline) {
          anchors.push(buildRunningPaceAnchor({
            requirement,
            question,
            priority,
            applies_to_goal_ids: appliesToGoalIds,
            answers,
          }));
        }
      }
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor:
      if (!facts?.currentBodyweight) {
        anchors.push(buildMissingAnchor({
          field_id: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
          requirement,
          question: {
            ...question,
            prompt: "What's your current bodyweight or closest recent scale weight?",
          },
          label: "Current bodyweight",
          input_type: "number_with_unit",
          expected_value_type: "number",
          placeholder: "205",
          helper_text: "Closest recent scale weight is fine.",
          validation: {
            kind: "current_bodyweight",
            message: "Enter your current bodyweight.",
            min: 1,
            max: 1000,
          },
          priority,
          applies_to_goal_ids: appliesToGoalIds,
          draftValue: Number.isFinite(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight)?.value)
            ? String(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.currentBodyweight)?.value)
            : "",
          canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.currentBodyweight],
          why_it_matters: "Current bodyweight helps size a realistic rate of change and recovery cost.",
          coach_voice_line: "Coach note: closest recent scale weight is plenty here.",
          unit: "lb",
          unit_options: [{ value: "lb", label: "lb" }],
        }));
        priority += 1;
      }
      if (!Number.isFinite(facts?.targetWeightChange)) {
        anchors.push(buildMissingAnchor({
          field_id: INTAKE_COMPLETENESS_FIELDS.targetWeightChange,
          requirement,
          question: {
            ...question,
            prompt: "Roughly how much weight are you trying to lose?",
          },
          label: "Target loss",
          input_type: "number_with_unit",
          expected_value_type: "number",
          placeholder: "20",
          helper_text: "Enter pounds to lose. Keep it simple.",
          validation: {
            kind: "target_weight_change",
            message: "Enter how many pounds you want to lose.",
            min: 1,
            max: 300,
            direction: "loss",
          },
          priority,
          applies_to_goal_ids: appliesToGoalIds,
          draftValue: Number.isFinite(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.targetWeightChange)?.value)
            ? String(Math.abs(readStoredField(answers, INTAKE_COMPLETENESS_FIELDS.targetWeightChange)?.value))
            : "",
          canonical_field_ids: [INTAKE_COMPLETENESS_FIELDS.targetWeightChange],
          why_it_matters: "The size of the change affects how aggressive the first block can be.",
          coach_voice_line: "Coach note: rough is fine. I only need the ballpark.",
          unit: "lb",
          unit_options: [{ value: "lb", label: "lb" }],
        }));
      }
      break;
    case INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor:
      if (!facts?.currentBodyweight && !facts?.currentWaist && facts?.progressPhotos !== true) {
        if (!selectedAppearanceProxy) {
          anchors.push(buildAppearanceProxyChoiceAnchor({
            requirement,
            question,
            priority,
            applies_to_goal_ids: appliesToGoalIds,
            selectedValue: selectedAppearanceProxy,
          }));
        } else if (selectedAppearanceProxy === INTAKE_COMPLETENESS_FIELDS.currentBodyweight) {
          anchors.push(buildAppearanceProxyBodyweightAnchor({
            requirement,
            question,
            priority,
            applies_to_goal_ids: appliesToGoalIds,
            answers,
          }));
        } else if (selectedAppearanceProxy === INTAKE_COMPLETENESS_FIELDS.currentWaist) {
          anchors.push(buildAppearanceProxyWaistAnchor({
            requirement,
            question,
            priority,
            applies_to_goal_ids: appliesToGoalIds,
            answers,
          }));
        }
      }
      break;
    default: {
      const field = toArray(question?.inputFields)[0] || {};
      anchors.push(buildMissingAnchor({
        field_id: field?.key || requirement?.key || `field_${priority}`,
        requirement,
        question,
        label: field?.label || question.label,
        input_type: field?.inputType || "text",
        expected_value_type: field?.expectedValueType || question.expectedValueType,
        placeholder: field?.placeholder || question.placeholder,
        helper_text: field?.helperText || "",
        validation: {
          ...(question?.validation || {}),
          min: field?.min,
          max: field?.max,
        },
        priority,
        applies_to_goal_ids: appliesToGoalIds,
        canonical_field_ids: [field?.key || requirement?.key],
      }));
      break;
    }
  }

  return anchors;
};

export const buildMissingAnchorsEngine = ({
  resolvedGoals = [],
  answers = {},
  userContext = {},
  completenessState = null,
  bindingsByFieldId = {},
} = {}) => {
  const safeCompletenessState = completenessState || deriveIntakeCompletenessState({ resolvedGoals, answers, userContext });
  const missingRequirements = toArray(safeCompletenessState?.missingRequired).filter(Boolean);
  const missingAnchors = [];
  let priority = 1;
  missingRequirements.forEach((requirement) => {
    const anchorsForRequirement = expandRequirementToAnchors({
      requirement,
      completenessState: safeCompletenessState,
      answers,
      resolvedGoals,
      bindingsByFieldId,
      startPriority: priority,
    });
    anchorsForRequirement.forEach((anchor) => {
      missingAnchors.push(anchor);
      priority += 1;
    });
  });

  return {
    version: "2026-04-v1",
    missingAnchors,
    orderedFieldIds: missingAnchors.map((anchor) => anchor.field_id),
    currentAnchor: missingAnchors[0] || null,
    completenessState: safeCompletenessState,
  };
};

const buildCurrentStrengthRecord = ({ weight = null, rawText = "", reps = null } = {}) => {
  const normalizedWeight = Number.isFinite(weight) ? Number(weight) : null;
  const normalizedReps = Number.isFinite(reps) ? Math.round(reps) : null;
  return {
    raw: sanitizeText(rawText || (normalizedWeight ? `${normalizedWeight}` : ""), 160),
    value: normalizedWeight,
    weight: normalizedWeight,
    reps: normalizedReps,
  };
};

const buildBindingWrite = ({
  fieldKey = "",
  record = null,
} = {}) => ({
  fieldKey: sanitizeText(fieldKey, 80),
  record,
});

export const validateMissingAnchorAnswer = ({
  anchor = null,
  raw_text = "",
  answer_value = null,
  multi_bind_mode = false,
} = {}) => {
  const answerObject = answer_value && typeof answer_value === "object" && !Array.isArray(answer_value)
    ? answer_value
    : null;
  const cleanRaw = sanitizeText(
    answerObject
      ? String(answerObject?.raw || answerObject?.value || "")
      : answer_value !== null && answer_value !== undefined && answer_value !== ""
      ? String(answer_value)
      : raw_text,
    220
  );
  const fieldId = sanitizeText(anchor?.field_id || "", 80);
  const validationMessage = sanitizeText(anchor?.validation?.message || "", 220) || "Add the detail I asked for before continuing.";

  if (!fieldId) {
    return {
      isValid: false,
      formError: "That intake field is missing a binding target.",
      parsed_value: null,
      parse_confidence: 0,
      canonicalWrites: [],
      summaryText: "",
      parseErrorCode: "missing_field_id",
    };
  }

  if (!cleanRaw) {
    return {
      isValid: false,
      formError: validationMessage,
      parsed_value: null,
      parse_confidence: 0,
      canonicalWrites: [],
      summaryText: "",
      parseErrorCode: "empty_answer",
    };
  }

  switch (fieldId) {
    case INTAKE_COMPLETENESS_FIELDS.targetTimeline: {
      const timelineValue = sanitizeText(answerObject?.value || cleanRaw, 120);
      const timeline = /^\d{4}-\d{2}$/.test(timelineValue) ? timelineValue : validateTimelineValue(timelineValue);
      const timelineDisplay = sanitizeText(answerObject?.raw || timeline, 120) || timeline;
      if (!timeline) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_timeline",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: timeline,
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
            record: {
              raw: timelineDisplay,
              value: timeline,
            },
          }),
        ],
        summaryText: timelineDisplay,
        parseErrorCode: "",
      };
    }
    case "running_endurance_anchor_kind": {
      const chosenValue = sanitizeText(answerObject?.value || cleanRaw, 80);
      const allowedValues = new Set([
        INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
        INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
      ]);
      if (!allowedValues.has(chosenValue)) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_choice",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: chosenValue,
        parse_confidence: 1,
        canonicalWrites: [],
        summaryText: chosenValue === INTAKE_COMPLETENESS_FIELDS.longestRecentRun
          ? "Longest recent run"
          : "Recent race or pace",
        parseErrorCode: "",
      };
    }
    case "appearance_proxy_anchor_kind": {
      const chosenValue = sanitizeText(answerObject?.value || cleanRaw, 80);
      const allowedValues = new Set([
        INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
        INTAKE_COMPLETENESS_FIELDS.currentWaist,
      ]);
      if (!allowedValues.has(chosenValue)) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_choice",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: chosenValue,
        parse_confidence: 1,
        canonicalWrites: [],
        summaryText: chosenValue === INTAKE_COMPLETENESS_FIELDS.currentWaist
          ? "Waist"
          : "Bodyweight",
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.currentRunFrequency: {
      const runFrequency = toFiniteNumber(answerObject?.value ?? answer_value ?? cleanRaw, null) ?? parseRunFrequency(cleanRaw);
      if (!Number.isFinite(runFrequency) || runFrequency <= 0) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_run_frequency",
        };
      }
      const normalizedFrequency = Math.round(runFrequency);
      return {
        isValid: true,
        formError: "",
        parsed_value: normalizedFrequency,
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
            record: {
              raw: `${normalizedFrequency}`,
              value: normalizedFrequency,
            },
          }),
        ],
        summaryText: `${normalizedFrequency} runs/week`,
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.longestRecentRun: {
      const numericValue = toFiniteNumber(answerObject?.value ?? cleanRaw, null) ?? parseDistanceMiles(cleanRaw) ?? parseDurationMinutes(cleanRaw);
      const selectedUnit = sanitizeText(answerObject?.unit || anchor?.unit || "", 20).toLowerCase() || "miles";
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_longest_run",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: {
          canonical_field_id: INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
          value: numericValue,
          miles: selectedUnit === "miles" ? numericValue : null,
          minutes: selectedUnit === "minutes" ? numericValue : null,
        },
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
            record: {
              raw: `${numericValue} ${selectedUnit}`,
              value: numericValue,
              miles: selectedUnit === "miles" ? numericValue : null,
              minutes: selectedUnit === "minutes" ? numericValue : null,
            },
          }),
        ],
        summaryText: `${numericValue} ${selectedUnit}`,
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline: {
      const paceText = parsePaceLikeText(cleanRaw);
      if (!paceText) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_pace_anchor",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: {
          canonical_field_id: INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
          value: paceText,
          paceText,
        },
        parse_confidence: 0.95,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
            record: {
              raw: paceText,
              value: paceText,
              paceText,
            },
          }),
        ],
        summaryText: paceText,
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline: {
      const explicitMode = sanitizeText(answerObject?.mode || "", 40).toLowerCase();
      const explicitWeight = toFiniteNumber(answerObject?.weight ?? answerObject?.value, null);
      const explicitReps = toFiniteNumber(answerObject?.reps, null);
      const parsedTopSet = Number.isFinite(explicitWeight) && explicitWeight > 0
        ? {
            raw: explicitMode === "estimated_max"
              ? `${explicitWeight} estimated max`
              : Number.isFinite(explicitReps) && explicitReps > 0
              ? `${explicitWeight}x${Math.round(explicitReps)}`
              : `${explicitWeight}`,
            weight: explicitWeight,
            reps: explicitMode === "estimated_max"
              ? 1
              : Number.isFinite(explicitReps) && explicitReps > 0
              ? Math.round(explicitReps)
              : null,
          }
        : parseStrengthTopSet(cleanRaw);
      if (!Number.isFinite(parsedTopSet.weight) || parsedTopSet.weight <= 0) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_strength_baseline",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: {
          canonical_field_id: INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline,
          weight: parsedTopSet.weight,
          reps: parsedTopSet.reps,
        },
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline,
            record: buildCurrentStrengthRecord({
              weight: parsedTopSet.weight,
              rawText: parsedTopSet.raw,
              reps: parsedTopSet.reps,
            }),
          }),
        ],
        summaryText: parsedTopSet.raw,
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.currentWaist: {
      const waist = toFiniteNumber(answerObject?.value ?? answer_value ?? cleanRaw, null) ?? parseWaistMeasurement(cleanRaw);
      if (!Number.isFinite(waist) || waist <= 0) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_waist",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: waist,
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.currentWaist,
            record: {
              raw: `${waist} in`,
              value: waist,
              unit: "in",
            },
          }),
        ],
        summaryText: `${waist} in`,
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.currentBodyweight: {
      const bodyweight = toFiniteNumber(answerObject?.value ?? answer_value ?? cleanRaw, null) ?? parseFirstWeightLikeNumber(cleanRaw);
      if (!Number.isFinite(bodyweight) || bodyweight <= 0) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_bodyweight",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: bodyweight,
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
            record: {
              raw: `${bodyweight} lb`,
              value: bodyweight,
              unit: "lb",
            },
          }),
        ],
        summaryText: `${bodyweight} lb`,
        parseErrorCode: "",
      };
    }
    case INTAKE_COMPLETENESS_FIELDS.targetWeightChange: {
      const rawNumber = toFiniteNumber(answerObject?.value ?? answer_value ?? cleanRaw, null);
      let targetChange = Number.isFinite(rawNumber) ? rawNumber : parseTargetWeightChange(cleanRaw);
      if (!Number.isFinite(targetChange) || targetChange === 0) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_weight_change",
        };
      }
      if ((anchor?.validation?.direction || "").toLowerCase() === "loss") {
        targetChange = -Math.abs(targetChange);
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: targetChange,
        parse_confidence: 1,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.targetWeightChange,
            record: {
              raw: `${Math.abs(targetChange)} lb`,
              value: targetChange,
              unit: "lb",
            },
          }),
        ],
        summaryText: `${targetChange < 0 ? "lose" : "change"} ${Math.abs(targetChange)} lb`,
        parseErrorCode: "",
      };
    }
    case "appearance_proxy_anchor": {
      const bodyweight = toFiniteNumber(answer_value ?? cleanRaw, null) ?? parseFirstWeightLikeNumber(cleanRaw);
      const waist = parseWaistMeasurement(cleanRaw);
      const matchedKinds = [
        Number.isFinite(bodyweight) ? "bodyweight" : "",
        Number.isFinite(waist) ? "waist" : "",
      ].filter(Boolean);
      if (!matchedKinds.length) {
        return {
          isValid: false,
          formError: validationMessage,
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "invalid_appearance_proxy",
        };
      }
      if (!multi_bind_mode && matchedKinds.length > 1) {
        return {
          isValid: false,
          formError: "Use either bodyweight or waist here so the answer stays clean.",
          parsed_value: null,
          parse_confidence: 0,
          canonicalWrites: [],
          summaryText: "",
          parseErrorCode: "multi_bind_detected",
        };
      }
      if (matchedKinds[0] === "waist") {
        return {
          isValid: true,
          formError: "",
          parsed_value: {
            canonical_field_id: INTAKE_COMPLETENESS_FIELDS.currentWaist,
            value: waist,
          },
          parse_confidence: 0.95,
          canonicalWrites: [
            buildBindingWrite({
              fieldKey: INTAKE_COMPLETENESS_FIELDS.currentWaist,
              record: {
                raw: `${waist} in`,
                value: waist,
                unit: "in",
              },
            }),
          ],
          summaryText: `${waist} in waist`,
          parseErrorCode: "",
        };
      }
      return {
        isValid: true,
        formError: "",
        parsed_value: {
          canonical_field_id: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
          value: bodyweight,
        },
        parse_confidence: 0.95,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
            record: {
              raw: `${bodyweight} lb`,
              value: bodyweight,
              unit: "lb",
            },
          }),
        ],
        summaryText: `${bodyweight} lb`,
        parseErrorCode: "",
      };
    }
    default:
      return {
        isValid: true,
        formError: "",
        parsed_value: cleanRaw,
        parse_confidence: 0.75,
        canonicalWrites: [
          buildBindingWrite({
            fieldKey: fieldId,
            record: {
              raw: cleanRaw,
              value: cleanRaw,
            },
          }),
        ],
        summaryText: cleanRaw,
        parseErrorCode: "",
      };
  }
};

export const applyMissingAnchorAnswer = ({
  answers = {},
  anchor = null,
  raw_text = "",
  answer_value = null,
  timestamp = null,
  source = "user",
  multi_bind_mode = false,
} = {}) => {
  const validation = validateMissingAnchorAnswer({
    anchor,
    raw_text,
    answer_value,
    multi_bind_mode,
  });
  if (!validation.isValid) {
    return {
      answers,
      validation,
      binding: null,
    };
  }

  let nextAnswers = answers;
  validation.canonicalWrites.forEach((item) => {
    if (!item?.fieldKey || !item?.record) return;
    nextAnswers = upsertCompletenessField(nextAnswers, item.fieldKey, item.record);
  });

  return {
    answers: nextAnswers,
    validation,
    binding: {
      anchor_id: sanitizeText(anchor?.anchor_id || "", 120),
      field_id: sanitizeText(anchor?.field_id || "", 80),
      raw_text: sanitizeText(raw_text || (answer_value ?? ""), 220),
      parsed_value: clonePlainValue(validation.parsed_value),
      parse_confidence: Number(validation.parse_confidence || 0),
      timestamp: normalizeTimestamp(timestamp),
      source: sanitizeText(source || "user", 20).toLowerCase() || "user",
    },
  };
};

export const INTAKE_MACHINE_STATES = {
  FREEFORM_GOALS: "FREEFORM_GOALS",
  GOAL_INTERPRETATION: "GOAL_INTERPRETATION",
  ANCHOR_COLLECTION: "ANCHOR_COLLECTION",
  REALISM_GATE: "REALISM_GATE",
  GOAL_ARBITRATION: "GOAL_ARBITRATION",
  REVIEW_CONFIRM: "REVIEW_CONFIRM",
  COMMIT: "COMMIT",
};

export const INTAKE_MACHINE_EVENTS = {
  GOALS_SUBMITTED: "GOALS_SUBMITTED",
  INTERPRETATION_READY: "INTERPRETATION_READY",
  ANCHOR_ANSWERED: "ANCHOR_ANSWERED",
  ANCHOR_PARSE_FAILED: "ANCHOR_PARSE_FAILED",
  REALISM_RESULT: "REALISM_RESULT",
  ARBITRATION_RESULT: "ARBITRATION_RESULT",
  USER_CONFIRMED: "USER_CONFIRMED",
  USER_EDITED: "USER_EDITED",
  USER_BACK: "USER_BACK",
};

const buildDeterministicIntakeDraft = ({
  answers = {},
  typedIntakePacket = null,
  aiInterpretationProposal = null,
  goalStackConfirmation = null,
  anchorBindingsByFieldId = {},
  now = new Date(),
} = {}) => {
  const normalizedPacket = typedIntakePacket && typeof typedIntakePacket === "object"
    ? typedIntakePacket
    : { version: "2026-04-v1", intent: "intake_interpretation", intake: {} };
  const intakeContext = normalizedPacket?.intake || normalizedPacket?.intakeContext || {};
  const rawGoalText = sanitizeText(intakeContext?.rawGoalText || answers?.goal_intent || "", 320);
  const typedPacket = {
    ...normalizedPacket,
    intake: {
      ...intakeContext,
      rawGoalText,
    },
  };
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: typedPacket,
    aiInterpretationProposal,
    explicitUserConfirmation: {
      confirmed: false,
      acceptedProposal: true,
      source: "intake_machine",
    },
    now,
  });
  const previewCompleteness = deriveIntakeCompletenessState({
    resolvedGoals: goalResolution?.resolvedGoals || [],
    answers,
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution?.resolvedGoals || [],
    ...buildGoalFeasibilityContextFromIntake(intakeContext),
    intakeCompleteness: previewCompleteness,
    now,
  });
  const feasibleResolvedGoals = applyFeasibilityPriorityOrdering({
    resolvedGoals: goalResolution?.resolvedGoals || [],
    feasibility: goalFeasibility,
  });
  const arbitrationInputs = buildConfirmedArbitrationInputs({
    answers,
    typedIntakePacket: typedPacket,
    now,
  });
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: feasibleResolvedGoals,
    confirmedPrimaryGoal: arbitrationInputs.confirmedPrimaryGoal,
    confirmedAdditionalGoals: arbitrationInputs.confirmedAdditionalGoals,
    additionalGoalTexts: arbitrationInputs.additionalGoalTexts,
    goalFeasibility,
    intakeCompleteness: previewCompleteness,
    typedIntakePacket: typedPacket,
    now,
  });
  const orderedResolvedGoals = arbitration?.goals?.length ? arbitration.goals : feasibleResolvedGoals;
  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals,
    goalFeasibility,
    arbitration,
    aiInterpretationProposal,
    answers,
    goalStackConfirmation,
  });
  const confirmationState = deriveIntakeConfirmationState({ reviewModel });
  const activeGoals = toArray(reviewModel?.activeResolvedGoals).length ? reviewModel.activeResolvedGoals : orderedResolvedGoals;
  const missingAnchorsEngine = buildMissingAnchorsEngine({
    resolvedGoals: activeGoals,
    answers,
    completenessState: reviewModel?.completeness || previewCompleteness,
    bindingsByFieldId: anchorBindingsByFieldId,
  });

  return {
    answers: clonePlainValue(answers),
    typedIntakePacket: typedPacket,
    aiInterpretationProposal: clonePlainValue(aiInterpretationProposal),
    goalResolution: clonePlainValue(goalResolution),
    goalFeasibility: clonePlainValue(goalFeasibility),
    arbitration: clonePlainValue(arbitration),
    orderedResolvedGoals: clonePlainValue(orderedResolvedGoals),
    reviewModel: clonePlainValue(reviewModel),
    confirmationState: clonePlainValue(confirmationState),
    intakeCompleteness: clonePlainValue(reviewModel?.completeness || previewCompleteness),
    missingAnchorsEngine: clonePlainValue(missingAnchorsEngine),
    goalStackConfirmation: clonePlainValue(goalStackConfirmation),
    rawGoalText,
  };
};

const summarizeEvent = (event = {}) => ({
  event_id: sanitizeText(event?.event_id || "", 120),
  type: sanitizeText(event?.type || "", 80),
  timestamp: normalizeTimestamp(event?.timestamp || event?.created_at || null),
  anchor_id: sanitizeText(event?.payload?.anchor_id || event?.payload?.binding_target?.anchor_id || event?.payload?.anchor?.anchor_id || "", 120),
  field_id: sanitizeText(event?.payload?.field_id || event?.payload?.anchor?.field_id || "", 80),
  goal_intent: sanitizeText(event?.payload?.answers?.goal_intent || event?.payload?.typedIntakePacket?.intake?.rawGoalText || "", 120),
});

const appendMessages = (state = {}, messages = []) => {
  const emitted = { ...(state.emittedMessageKeys || {}) };
  const outbox = [...toArray(state.outbox)];
  let messageCount = Number(state.messageCount || 0);
  toArray(messages).forEach((message) => {
    const key = sanitizeText(message?.idempotency_key || message?.key || "", 220);
    const text = sanitizeText(message?.text || "", 320);
    if (!key || !text || emitted[key]) return;
    emitted[key] = true;
    messageCount += 1;
    outbox.push({
      message_id: buildCounterId("message", messageCount),
      key: sanitizeText(message?.key || key, 220),
      idempotency_key: key,
      anchor_id: sanitizeText(message?.anchor_id || "", 120),
      message_kind: sanitizeText(message?.message_kind || "", 40).toLowerCase(),
      text,
      created_at: normalizeTimestamp(message?.created_at || null),
    });
  });
  return {
    ...state,
    emittedMessageKeys: emitted,
    outbox,
    messageCount,
  };
};

const commitTransition = ({
  state = {},
  event = {},
  nextStage = "",
  patch = {},
  messages = [],
} = {}) => {
  const transitionCount = Number(state.transitionCount || 0) + 1;
  const transition_id = buildCounterId("transition", transitionCount);
  const preparedMessages = toArray(messages).map((message, index) => {
    const anchorId = sanitizeText(message?.anchor_id || "", 120);
    const messageKind = sanitizeText(message?.message_kind || "", 40).toLowerCase();
    const anchorQuestionIdempotencyKey = messageKind === "anchor_question" && anchorId
      ? sanitizeText(`${nextStage}:${anchorId}:${transition_id}`, 220)
      : "";
    const fallbackKey = sanitizeText(`${messageKind || "message"}:${transition_id}:${index + 1}`, 220);
    return {
      ...clonePlainValue(message),
      key: sanitizeText(message?.key || anchorQuestionIdempotencyKey || fallbackKey, 220),
      ...(anchorQuestionIdempotencyKey
        ? { idempotency_key: sanitizeText(message?.idempotency_key || anchorQuestionIdempotencyKey, 220) }
        : (sanitizeText(message?.idempotency_key || "", 220)
          ? { idempotency_key: sanitizeText(message?.idempotency_key || "", 220) }
          : {})),
      ...(anchorId ? { anchor_id: anchorId } : {}),
      ...(messageKind ? { message_kind: messageKind } : {}),
    };
  });
  const nextEventLog = [
    ...toArray(state.eventLog),
    {
      transition_id,
      stage_before: state.stage,
      stage_after: nextStage,
      ...summarizeEvent(event),
      payload: clonePlainValue(event?.payload || {}),
    },
  ];
  const nextState = appendMessages({
    ...state,
    ...patch,
    stage: nextStage,
    transitionCount,
    transition_id,
    eventLog: nextEventLog,
    seenEventIds: [...toArray(state.seenEventIds), sanitizeText(event?.event_id || "", 120)],
    stageHistory: [...toArray(state.stageHistory), nextStage],
    ui: {
      ...(state.ui || {}),
      ...((patch && patch.ui) || {}),
    },
  }, preparedMessages);
  return nextState;
};

export const createIntakeMachineState = ({
  answers = {},
  now = null,
} = {}) => ({
  version: "2026-04-v1",
  stage: INTAKE_MACHINE_STATES.FREEFORM_GOALS,
  transitionCount: 0,
  transition_id: "",
  messageCount: 0,
  eventLog: [],
  seenEventIds: [],
  stageHistory: [INTAKE_MACHINE_STATES.FREEFORM_GOALS],
  emittedMessageKeys: {},
  outbox: [],
  anchorBindingsByFieldId: {},
  anchorBindingLog: [],
  anchorFailureCounts: {},
  draft: {
    answers: clonePlainValue(answers),
    typedIntakePacket: null,
    aiInterpretationProposal: null,
    goalResolution: null,
    goalFeasibility: null,
    arbitration: null,
    orderedResolvedGoals: [],
    reviewModel: null,
    confirmationState: null,
    intakeCompleteness: null,
    missingAnchorsEngine: {
      missingAnchors: [],
      orderedFieldIds: [],
      currentAnchor: null,
      completenessState: null,
    },
    goalStackConfirmation: null,
    rawGoalText: "",
  },
  ui: {
    clearReason: "",
    lastParseError: "",
    currentBindingTarget: null,
  },
  clock: {
    now: now ? normalizeTimestamp(now) : "",
  },
});

const resolveEventNow = (state = {}, event = {}) => (
  event?.payload?.now
  || event?.timestamp
  || state?.clock?.now
  || new Date().toISOString()
);

const buildGoalAddedMessages = ({ previousAnswers = {}, nextAnswers = {} } = {}) => {
  const previous = new Set(readAdditionalGoalEntries({ answers: previousAnswers }).map((item) => normalizeGoalText(item)));
  const nextItems = readAdditionalGoalEntries({ answers: nextAnswers });
  return nextItems
    .filter((item) => !previous.has(normalizeGoalText(item)))
    .map((item) => ({
      key: `goal_added:${normalizeGoalText(item)}`,
      text: `Added: ${sanitizeText(item, 160)}.`,
    }));
};

export const intakeReducer = (state = createIntakeMachineState(), event = {}) => {
  const eventId = sanitizeText(event?.event_id || "", 120);
  const eventType = sanitizeText(event?.type || "", 80);
  if (!eventId || !eventType) return state;
  if (toArray(state.seenEventIds).includes(eventId)) return state;

  const now = resolveEventNow(state, event);
  const currentDraft = state?.draft || {};

  switch (eventType) {
    case INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED: {
      const nextAnswers = clonePlainValue(event?.payload?.answers || currentDraft.answers || {});
      const nextMessages = buildGoalAddedMessages({
        previousAnswers: currentDraft.answers || {},
        nextAnswers,
      });
      return commitTransition({
        state,
        event,
        nextStage: INTAKE_MACHINE_STATES.GOAL_INTERPRETATION,
        patch: {
          draft: {
            ...currentDraft,
            answers: nextAnswers,
          },
          ui: {
            ...(state.ui || {}),
            clearReason: "",
            lastParseError: "",
          },
          clock: {
            now,
          },
        },
        messages: nextMessages,
      });
    }
    case INTAKE_MACHINE_EVENTS.INTERPRETATION_READY: {
      const payload = event?.payload || {};
      const typedIntakePacket = payload?.assessment?.typedIntakePacket || payload?.typedIntakePacket || currentDraft.typedIntakePacket;
      if (!typedIntakePacket) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.GOAL_INTERPRETATION,
          patch: {
            ui: {
              ...(state.ui || {}),
              clearReason: "The interpretation result did not include a typed intake packet.",
            },
          },
        });
      }
      const nextDraft = buildDeterministicIntakeDraft({
        answers: payload?.answers || currentDraft.answers || {},
        typedIntakePacket,
        aiInterpretationProposal: payload?.assessment?.aiInterpretationProposal || payload?.aiInterpretationProposal || currentDraft.aiInterpretationProposal,
        goalStackConfirmation: payload?.goalStackConfirmation || currentDraft.goalStackConfirmation || null,
        anchorBindingsByFieldId: state.anchorBindingsByFieldId || {},
        now,
      });
      const nextAnchor = nextDraft?.missingAnchorsEngine?.currentAnchor || null;
      const nextStage = nextAnchor
        ? INTAKE_MACHINE_STATES.ANCHOR_COLLECTION
        : INTAKE_MACHINE_STATES.REALISM_GATE;
      const nextMessages = [];
      if (nextStage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION && nextAnchor?.question) {
        nextMessages.push({
          message_kind: "anchor_question",
          anchor_id: nextAnchor.anchor_id,
          text: `One quick thing before I lock this in: ${nextAnchor.question}`,
        });
        const assessmentText = sanitizeText(payload?.assessment?.text || "", 320);
        if (assessmentText) {
          nextMessages.push({
            key: `anchor_status:${sanitizeText(nextAnchor.anchor_id || nextAnchor.field_id || "", 120)}:${sanitizeText(assessmentText, 80).toLowerCase()}`,
            text: assessmentText,
          });
        }
      }
      return commitTransition({
        state,
        event,
        nextStage,
        patch: {
          draft: nextDraft,
          ui: {
            ...(state.ui || {}),
            clearReason: nextDraft?.confirmationState?.reason || "",
            lastParseError: "",
            currentBindingTarget: nextAnchor ? buildAnchorBindingTarget(nextAnchor) : null,
          },
          clock: {
            now,
          },
        },
        messages: nextMessages,
      });
    }
    case INTAKE_MACHINE_EVENTS.ANCHOR_PARSE_FAILED: {
      const fieldId = sanitizeText(event?.payload?.field_id || currentDraft?.missingAnchorsEngine?.currentAnchor?.field_id || "", 80);
      const nextFailureCounts = {
        ...(state.anchorFailureCounts || {}),
        [fieldId]: Number(state?.anchorFailureCounts?.[fieldId] || 0) + 1,
      };
      return commitTransition({
        state,
        event,
        nextStage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
        patch: {
          anchorFailureCounts: nextFailureCounts,
          ui: {
            ...(state.ui || {}),
            lastParseError: sanitizeText(event?.payload?.formError || "", 220),
            clearReason: sanitizeText(event?.payload?.formError || "", 220),
            currentBindingTarget: buildAnchorBindingTarget(currentDraft?.missingAnchorsEngine?.currentAnchor || null),
          },
          clock: {
            now,
          },
        },
      });
    }
    case INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED: {
      const anchor = currentDraft?.missingAnchorsEngine?.currentAnchor || null;
      const bindingTarget = readEventBindingTarget(event?.payload || {});
      if (!bindingTarget?.anchor_id || !bindingTarget?.field_id) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
          patch: {
            ui: {
              ...(state.ui || {}),
              lastParseError: "That answer is missing its field binding target.",
              clearReason: "That answer is missing its field binding target.",
              currentBindingTarget: buildAnchorBindingTarget(currentDraft?.missingAnchorsEngine?.currentAnchor || null),
            },
          },
        });
      }
      if (!anchor?.field_id || !anchor?.anchor_id) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
          patch: {
            ui: {
              ...(state.ui || {}),
              lastParseError: "No active intake field is waiting for an answer.",
              clearReason: "No active intake field is waiting for an answer.",
              currentBindingTarget: null,
            },
          },
        });
      }
      if (!Boolean(event?.payload?.multi_bind_mode) && !matchesBindingTarget(buildAnchorBindingTarget(anchor), bindingTarget)) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
          patch: {
            ui: {
              ...(state.ui || {}),
              lastParseError: "That answer was bound to a different intake field than the one currently on screen.",
              clearReason: "That answer was bound to a different intake field than the one currently on screen.",
              currentBindingTarget: buildAnchorBindingTarget(anchor),
            },
          },
        });
      }
      const applied = applyMissingAnchorAnswer({
        answers: currentDraft.answers || {},
        anchor,
        raw_text: event?.payload?.raw_text || "",
        answer_value: event?.payload?.answer_value,
        timestamp: event?.payload?.timestamp || now,
        source: event?.payload?.source || "user",
        multi_bind_mode: Boolean(event?.payload?.multi_bind_mode),
      });
      if (!applied.validation?.isValid) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
          patch: {
            anchorFailureCounts: {
              ...(state.anchorFailureCounts || {}),
              [anchor.field_id]: Number(state?.anchorFailureCounts?.[anchor.field_id] || 0) + 1,
            },
            ui: {
              ...(state.ui || {}),
              lastParseError: sanitizeText(applied.validation?.formError || "", 220),
              clearReason: sanitizeText(applied.validation?.formError || "", 220),
              currentBindingTarget: buildAnchorBindingTarget(anchor),
            },
          },
        });
      }
      const binding = applied.binding;
      const nextBindingsByFieldId = {
        ...(state.anchorBindingsByFieldId || {}),
        ...(binding?.field_id ? { [binding.field_id]: binding } : {}),
      };
      const nextDraft = buildDeterministicIntakeDraft({
        answers: applied.answers,
        typedIntakePacket: currentDraft.typedIntakePacket,
        aiInterpretationProposal: currentDraft.aiInterpretationProposal,
        goalStackConfirmation: currentDraft.goalStackConfirmation || null,
        anchorBindingsByFieldId: nextBindingsByFieldId,
        now,
      });
      const nextAnchor = nextDraft?.missingAnchorsEngine?.currentAnchor || null;
      const nextStage = nextAnchor
        ? INTAKE_MACHINE_STATES.ANCHOR_COLLECTION
        : INTAKE_MACHINE_STATES.REALISM_GATE;
      const messages = [];
      if (binding?.field_id) {
        const captureLabel = sanitizeText(event?.payload?.capture_label || "", 220);
        const defaultCaptureText = `Got it. ${sanitizeText(applied.validation?.summaryText || binding.raw_text || "", 180)}.`;
        messages.push({
          key: `anchor_saved:${binding.anchor_id || binding.field_id}:${sanitizeText(applied.validation?.summaryText || binding.raw_text || "", 120).toLowerCase()}`,
          text: captureLabel || defaultCaptureText,
        });
        if (nextAnchor?.question) {
          messages.push({
            message_kind: "anchor_question",
            anchor_id: nextAnchor.anchor_id,
            text: `One quick thing before I lock this in: ${nextAnchor.question}`,
          });
        }
      }
      return commitTransition({
        state,
        event,
        nextStage,
        patch: {
          draft: nextDraft,
          anchorBindingsByFieldId: nextBindingsByFieldId,
          anchorBindingLog: [
            ...toArray(state.anchorBindingLog),
            clonePlainValue(binding),
          ].filter(Boolean),
          ui: {
            ...(state.ui || {}),
            lastParseError: "",
            clearReason: nextDraft?.confirmationState?.reason || "",
            currentBindingTarget: nextAnchor ? buildAnchorBindingTarget(nextAnchor) : null,
          },
          clock: {
            now,
          },
        },
        messages,
      });
    }
    case INTAKE_MACHINE_EVENTS.REALISM_RESULT: {
      const hasMissingAnchors = Boolean(currentDraft?.missingAnchorsEngine?.currentAnchor);
      if (hasMissingAnchors || !currentDraft?.goalFeasibility) {
        return commitTransition({
          state,
          event,
          nextStage: hasMissingAnchors ? INTAKE_MACHINE_STATES.ANCHOR_COLLECTION : INTAKE_MACHINE_STATES.GOAL_INTERPRETATION,
          patch: {
            ui: {
              ...(state.ui || {}),
              clearReason: hasMissingAnchors
                ? "A required anchor is still missing."
                : "The realism gate is not ready yet.",
              currentBindingTarget: hasMissingAnchors
                ? buildAnchorBindingTarget(currentDraft?.missingAnchorsEngine?.currentAnchor || null)
                : null,
            },
          },
        });
      }
      return commitTransition({
        state,
        event,
        nextStage: INTAKE_MACHINE_STATES.GOAL_ARBITRATION,
        patch: {
          ui: {
            ...(state.ui || {}),
            clearReason: currentDraft?.confirmationState?.reason || "",
            currentBindingTarget: null,
          },
          clock: {
            now,
          },
        },
      });
    }
    case INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT: {
      if (!currentDraft?.arbitration || !currentDraft?.reviewModel) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.GOAL_INTERPRETATION,
          patch: {
            ui: {
              ...(state.ui || {}),
              clearReason: "Goal arbitration is not ready yet.",
            },
          },
        });
      }
      return commitTransition({
        state,
        event,
        nextStage: INTAKE_MACHINE_STATES.REVIEW_CONFIRM,
        patch: {
          ui: {
            ...(state.ui || {}),
            clearReason: currentDraft?.confirmationState?.reason || "",
            currentBindingTarget: null,
          },
          clock: {
            now,
          },
        },
      });
    }
    case INTAKE_MACHINE_EVENTS.USER_CONFIRMED: {
      if (currentDraft?.confirmationState?.requiresAcknowledgement && !Boolean(event?.payload?.acknowledged_warning)) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.REVIEW_CONFIRM,
          patch: {
            ui: {
              ...(state.ui || {}),
              clearReason: "Please confirm that you understand this timeline is aggressive.",
              currentBindingTarget: null,
            },
          },
        });
      }
      if (!currentDraft?.confirmationState?.canConfirm) {
        return commitTransition({
          state,
          event,
          nextStage: INTAKE_MACHINE_STATES.REVIEW_CONFIRM,
          patch: {
            ui: {
              ...(state.ui || {}),
              clearReason: currentDraft?.confirmationState?.reason || "The intake draft is not ready to confirm yet.",
              currentBindingTarget: null,
            },
          },
        });
      }
      return commitTransition({
        state,
        event,
        nextStage: INTAKE_MACHINE_STATES.COMMIT,
        patch: {
          draft: {
            ...currentDraft,
            commitRequested: true,
          },
          ui: {
            ...(state.ui || {}),
            currentBindingTarget: null,
          },
          clock: {
            now,
          },
        },
      });
    }
    case INTAKE_MACHINE_EVENTS.USER_EDITED: {
      const nextAnswers = event?.payload?.answers
        ? clonePlainValue(event.payload.answers)
        : hasOwn(event?.payload || {}, "patch")
        ? {
            ...(currentDraft.answers || {}),
            ...(clonePlainValue(event.payload.patch) || {}),
          }
        : clonePlainValue(currentDraft.answers || {});
      return commitTransition({
        state,
        event,
        nextStage: INTAKE_MACHINE_STATES.FREEFORM_GOALS,
        patch: {
          anchorBindingsByFieldId: {},
          anchorBindingLog: [],
          anchorFailureCounts: {},
          draft: {
            ...currentDraft,
            answers: nextAnswers,
          },
          ui: {
            ...(state.ui || {}),
            clearReason: "",
            lastParseError: "",
            currentBindingTarget: null,
          },
          clock: {
            now,
          },
        },
      });
    }
    case INTAKE_MACHINE_EVENTS.USER_BACK: {
      const explicitTarget = sanitizeText(event?.payload?.target_stage || "", 80);
      const stageHistory = toArray(state.stageHistory);
      const fallbackStage = stageHistory.length > 1 ? stageHistory[stageHistory.length - 2] : INTAKE_MACHINE_STATES.FREEFORM_GOALS;
      const nextStage = explicitTarget && Object.values(INTAKE_MACHINE_STATES).includes(explicitTarget)
        ? explicitTarget
        : fallbackStage;
      return commitTransition({
        state,
        event,
        nextStage,
        patch: {
          ui: {
            ...(state.ui || {}),
            currentBindingTarget: nextStage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION
              ? buildAnchorBindingTarget(currentDraft?.missingAnchorsEngine?.currentAnchor || null)
              : null,
          },
          clock: {
            now,
          },
        },
      });
    }
    default:
      return state;
  }
};

export const replayIntakeMachineEvents = ({
  initialState = createIntakeMachineState(),
  events = [],
} = {}) => toArray(events).reduce((nextState, event) => intakeReducer(nextState, event), initialState);

export const buildIntakeMachineDebugView = (state = {}) => ({
  state: sanitizeText(state?.stage || "", 80),
  transition_id: sanitizeText(state?.transition_id || "", 120),
  current_binding_target: {
    anchor_id: sanitizeText(state?.ui?.currentBindingTarget?.anchor_id || state?.draft?.missingAnchorsEngine?.currentAnchor?.anchor_id || "", 120),
    field_id: sanitizeText(state?.ui?.currentBindingTarget?.field_id || state?.draft?.missingAnchorsEngine?.currentAnchor?.field_id || "", 80),
  },
  missing_anchors: toArray(state?.draft?.missingAnchorsEngine?.missingAnchors).map((anchor) => ({
    anchor_id: sanitizeText(anchor?.anchor_id || "", 120),
    field_id: sanitizeText(anchor?.field_id || "", 80),
    label: sanitizeText(anchor?.label || "", 160),
    question: sanitizeText(anchor?.question || "", 220),
  })),
  last_events: toArray(state?.eventLog).slice(-10).map((entry) => ({
    transition_id: sanitizeText(entry?.transition_id || "", 120),
    event_id: sanitizeText(entry?.event_id || "", 120),
    type: sanitizeText(entry?.type || "", 80),
    stage_before: sanitizeText(entry?.stage_before || "", 80),
    stage_after: sanitizeText(entry?.stage_after || "", 80),
    anchor_id: sanitizeText(entry?.anchor_id || "", 120),
    field_id: sanitizeText(entry?.field_id || "", 80),
    goal_intent: sanitizeText(entry?.goal_intent || "", 120),
    timestamp: normalizeTimestamp(entry?.timestamp || null),
  })),
});
