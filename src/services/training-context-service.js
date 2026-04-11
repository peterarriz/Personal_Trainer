import { dedupeStrings } from "../utils/collection-utils.js";

export const TRAINING_ENVIRONMENT_VALUES = Object.freeze({
  home: "home",
  gym: "gym",
  mixed: "mixed",
  variable: "variable",
  unknown: "unknown",
});

export const TRAINING_EQUIPMENT_VALUES = Object.freeze({
  none: "none",
  dumbbells: "dumbbells",
  basicGym: "basic_gym",
  fullGym: "full_gym",
  mixed: "mixed",
  unknown: "unknown",
});

export const TRAINING_SESSION_DURATION_VALUES = Object.freeze({
  min20: "20",
  min30: "30",
  min45: "45",
  min60Plus: "60+",
  unknown: "unknown",
});

export const TRAINING_INTENSITY_VALUES = Object.freeze({
  conservative: "conservative",
  standard: "standard",
  aggressive: "aggressive",
  adaptive: "adaptive",
  unknown: "unknown",
});

export const TRAINING_CONTEXT_SOURCES = Object.freeze({
  onboardingAnswers: "onboarding_answers",
  environmentEditor: "environment_editor",
  legacyPersonalization: "legacy_personalization",
  inferredContext: "inferred_context",
  staleCarryover: "stale_carryover",
  defaultPlaceholder: "default_placeholder",
  unknown: "unknown",
});

const makeField = ({ value, confirmed = false, source = "unknown" } = {}) => ({
  value,
  confirmed: Boolean(confirmed),
  source: source || "unknown",
});

export const createEmptyTrainingContext = () => ({
  environment: makeField({ value: TRAINING_ENVIRONMENT_VALUES.unknown }),
  equipmentAccess: {
    ...makeField({ value: TRAINING_EQUIPMENT_VALUES.unknown }),
    items: [],
  },
  sessionDuration: makeField({ value: TRAINING_SESSION_DURATION_VALUES.unknown }),
  intensityPosture: makeField({ value: TRAINING_INTENSITY_VALUES.unknown }),
});

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const normalizeTrainingEnvironment = (value = "") => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return TRAINING_ENVIRONMENT_VALUES.unknown;
  if (["home"].includes(text)) return TRAINING_ENVIRONMENT_VALUES.home;
  if (["gym", "full gym", "limited gym"].includes(text)) return TRAINING_ENVIRONMENT_VALUES.gym;
  if (["both", "mixed"].includes(text)) return TRAINING_ENVIRONMENT_VALUES.mixed;
  if (["varies", "varies a lot", "variable", "travel"].includes(text)) return TRAINING_ENVIRONMENT_VALUES.variable;
  return TRAINING_ENVIRONMENT_VALUES.unknown;
};

export const normalizeTrainingSessionDuration = (value = "") => {
  const text = String(value || "").trim();
  if (["20", "30", "45", "60+"].includes(text)) return text;
  return TRAINING_SESSION_DURATION_VALUES.unknown;
};

export const normalizeTrainingIntensity = (value = "") => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return TRAINING_INTENSITY_VALUES.unknown;
  if (["conservative", "keep it simple"].includes(text)) return TRAINING_INTENSITY_VALUES.conservative;
  if (["standard", "find the balance"].includes(text)) return TRAINING_INTENSITY_VALUES.standard;
  if (["aggressive", "push me hard"].includes(text)) return TRAINING_INTENSITY_VALUES.aggressive;
  if (["adaptive", "let the data decide"].includes(text)) return TRAINING_INTENSITY_VALUES.adaptive;
  return TRAINING_INTENSITY_VALUES.unknown;
};

export const deriveEquipmentAccessValue = ({
  items = [],
  environmentValue = TRAINING_ENVIRONMENT_VALUES.unknown,
} = {}) => {
  const normalizedItems = dedupeStrings((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean));
  if (!normalizedItems.length) return TRAINING_EQUIPMENT_VALUES.unknown;
  const text = normalizedItems.join(" ").toLowerCase();
  if (/full rack|barbell|cable|machine|full gym/.test(text)) return TRAINING_EQUIPMENT_VALUES.fullGym;
  if (/basic gym|hotel gym/.test(text)) return TRAINING_EQUIPMENT_VALUES.basicGym;
  if (/bodyweight only|no equipment|outdoors only/.test(text)) return TRAINING_EQUIPMENT_VALUES.none;
  if (/dumbbell/.test(text) && normalizedItems.length === 1) return TRAINING_EQUIPMENT_VALUES.dumbbells;
  if (environmentValue === TRAINING_ENVIRONMENT_VALUES.home && normalizedItems.length > 0) return TRAINING_EQUIPMENT_VALUES.mixed;
  return TRAINING_EQUIPMENT_VALUES.mixed;
};

export const describeTrainingContextSource = (source = TRAINING_CONTEXT_SOURCES.unknown) => (
  source === TRAINING_CONTEXT_SOURCES.onboardingAnswers ? "Confirmed in intake"
  : source === TRAINING_CONTEXT_SOURCES.environmentEditor ? "Edited by user"
  : source === TRAINING_CONTEXT_SOURCES.legacyPersonalization ? "Recovered from older settings"
  : source === TRAINING_CONTEXT_SOURCES.inferredContext ? "Inferred from older profile"
  : source === TRAINING_CONTEXT_SOURCES.staleCarryover ? "Historical carry-over"
  : source === TRAINING_CONTEXT_SOURCES.defaultPlaceholder ? "Default placeholder"
  : "Unknown"
);

const normalizeEquipmentItems = (items = []) => dedupeStrings(
  (Array.isArray(items) ? items : [items])
    .flatMap((item) => String(item || "").split(/[,/]/))
    .map((item) => item.trim())
    .filter(Boolean)
);

export const buildTrainingContextFromAnswers = ({ answers = {} } = {}) => {
  const environmentValue = normalizeTrainingEnvironment(answers.training_location || "");
  const equipmentItems = normalizeEquipmentItems([
    ...(Array.isArray(answers.home_equipment) ? answers.home_equipment : []),
    ...String(answers.home_equipment_other || answers.equipment_text || "")
      .split(/[,/]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ].filter((item) => item && item !== "Other"));
  const sessionDurationValue = normalizeTrainingSessionDuration(answers.session_length || "");
  const intensityValue = normalizeTrainingIntensity(answers.coaching_style || "");
  const equipmentValue = deriveEquipmentAccessValue({
    items: equipmentItems,
    environmentValue,
  });

  return {
    environment: makeField({
      value: environmentValue,
      confirmed: environmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown,
      source: TRAINING_CONTEXT_SOURCES.onboardingAnswers,
    }),
    equipmentAccess: {
      ...makeField({
        value: equipmentValue,
        confirmed: equipmentItems.length > 0,
        source: TRAINING_CONTEXT_SOURCES.onboardingAnswers,
      }),
      items: equipmentItems,
    },
    sessionDuration: makeField({
      value: sessionDurationValue,
      confirmed: sessionDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown,
      source: TRAINING_CONTEXT_SOURCES.onboardingAnswers,
    }),
    intensityPosture: makeField({
      value: intensityValue,
      confirmed: intensityValue !== TRAINING_INTENSITY_VALUES.unknown,
      source: TRAINING_CONTEXT_SOURCES.onboardingAnswers,
    }),
  };
};

export const buildTrainingContextFromEditor = ({
  mode = "",
  equipment = "",
  equipmentItems = [],
  time = "",
  intensity = "",
} = {}) => {
  const environmentValue = normalizeTrainingEnvironment(mode);
  const normalizedEquipmentItems = normalizeEquipmentItems(equipmentItems);
  const sessionDurationValue = normalizeTrainingSessionDuration(time);
  const intensityValue = normalizeTrainingIntensity(intensity);
  const normalizedEquipmentValue = equipment === TRAINING_EQUIPMENT_VALUES.fullGym
    ? TRAINING_EQUIPMENT_VALUES.fullGym
    : equipment === TRAINING_EQUIPMENT_VALUES.basicGym
    ? TRAINING_EQUIPMENT_VALUES.basicGym
    : equipment === TRAINING_EQUIPMENT_VALUES.dumbbells
    ? TRAINING_EQUIPMENT_VALUES.dumbbells
    : equipment === TRAINING_EQUIPMENT_VALUES.none
    ? TRAINING_EQUIPMENT_VALUES.none
    : equipment === TRAINING_EQUIPMENT_VALUES.mixed
    ? TRAINING_EQUIPMENT_VALUES.mixed
    : deriveEquipmentAccessValue({
        items: normalizedEquipmentItems,
        environmentValue,
      });

  return {
    environment: makeField({
      value: environmentValue,
      confirmed: environmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown,
      source: TRAINING_CONTEXT_SOURCES.environmentEditor,
    }),
    equipmentAccess: {
      ...makeField({
        value: normalizedEquipmentValue,
        confirmed: normalizedEquipmentValue !== TRAINING_EQUIPMENT_VALUES.unknown || normalizedEquipmentItems.length > 0,
        source: TRAINING_CONTEXT_SOURCES.environmentEditor,
      }),
      items: normalizedEquipmentItems,
    },
    sessionDuration: makeField({
      value: sessionDurationValue,
      confirmed: sessionDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown,
      source: TRAINING_CONTEXT_SOURCES.environmentEditor,
    }),
    intensityPosture: makeField({
      value: intensityValue || TRAINING_INTENSITY_VALUES.unknown,
      confirmed: intensityValue !== TRAINING_INTENSITY_VALUES.unknown,
      source: TRAINING_CONTEXT_SOURCES.environmentEditor,
    }),
  };
};

const isMeaningfulLegacyProfile = (personalization = {}) => (
  Boolean(personalization?.profile?.onboardingComplete)
  || Boolean(String(personalization?.userGoalProfile?.primary_goal || "").trim())
  || Boolean(String(personalization?.userGoalProfile?.experience_level || "").trim())
);

export const deriveTrainingContextFromPersonalization = ({ personalization = {} } = {}) => {
  const stored = personalization?.trainingContext || {};
  const legacyProfile = personalization?.userGoalProfile || {};
  const trainingPreferences = personalization?.settings?.trainingPreferences || {};
  const environmentConfig = personalization?.environmentConfig || {};
  const travelState = personalization?.travelState || {};
  const legacyReady = isMeaningfulLegacyProfile(personalization);
  const travelEnvironmentText = String(travelState?.environmentMode || travelState?.access || "").trim().toLowerCase();
  const storedEnvironmentValue = normalizeTrainingEnvironment(stored?.environment?.value || "");
  const storedSessionDurationValue = normalizeTrainingSessionDuration(stored?.sessionDuration?.value || "");
  const storedIntensityValue = normalizeTrainingIntensity(stored?.intensityPosture?.value || "");
  const storedEquipmentItems = normalizeEquipmentItems(Array.isArray(stored?.equipmentAccess?.items) ? stored.equipmentAccess.items : []);
  const storedEquipmentValue = stored?.equipmentAccess?.value || deriveEquipmentAccessValue({
    items: storedEquipmentItems,
    environmentValue: storedEnvironmentValue,
  });

  const legacyEnvironmentValue = normalizeTrainingEnvironment(
    trainingPreferences?.defaultEnvironment
    || environmentConfig?.defaultMode
    || (/full gym|limited gym|gym/.test(travelEnvironmentText) ? "Gym" : /travel/.test(travelEnvironmentText) ? "Varies" : /home/.test(travelEnvironmentText) ? "Home" : "")
    || ""
  );
  const legacyDurationValue = normalizeTrainingSessionDuration(legacyProfile?.session_length || "");
  const placeholderDurationValue = normalizeTrainingSessionDuration(environmentConfig?.base?.time || "");
  const legacyIntensityValue = normalizeTrainingIntensity(trainingPreferences?.intensityPreference || "");
  const legacyEquipmentItems = normalizeEquipmentItems(
    Array.isArray(legacyProfile?.equipment_access) && legacyProfile.equipment_access.length
      ? legacyProfile.equipment_access
      : []
  );
  const legacyEquipmentValue = legacyEquipmentItems.length
    ? deriveEquipmentAccessValue({
        items: legacyEquipmentItems,
        environmentValue: legacyEnvironmentValue,
      })
    : /full gym/.test(travelEnvironmentText)
    ? TRAINING_EQUIPMENT_VALUES.fullGym
    : /limited gym|hotel/.test(travelEnvironmentText)
    ? TRAINING_EQUIPMENT_VALUES.basicGym
    : TRAINING_EQUIPMENT_VALUES.unknown;
  const environmentValue = storedEnvironmentValue || TRAINING_ENVIRONMENT_VALUES.unknown;
  const sessionDurationValue = storedSessionDurationValue || TRAINING_SESSION_DURATION_VALUES.unknown;
  const intensityValue = storedIntensityValue || TRAINING_INTENSITY_VALUES.unknown;
  const equipmentValue = storedEquipmentValue || TRAINING_EQUIPMENT_VALUES.unknown;
  const hasTravelEvidence = Boolean(travelState?.isTravelWeek) || /gym|travel|hotel|home/.test(travelEnvironmentText);
  const hasLegacyEnvironmentEvidence = legacyEquipmentItems.length > 0 || hasTravelEvidence;
  const legacyEnvironmentSource = legacyEnvironmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown
    ? (hasLegacyEnvironmentEvidence ? TRAINING_CONTEXT_SOURCES.legacyPersonalization : TRAINING_CONTEXT_SOURCES.defaultPlaceholder)
    : TRAINING_CONTEXT_SOURCES.unknown;
  const placeholderEquipmentSource = legacyEquipmentValue !== TRAINING_EQUIPMENT_VALUES.unknown && !legacyEquipmentItems.length
    ? TRAINING_CONTEXT_SOURCES.inferredContext
    : TRAINING_CONTEXT_SOURCES.unknown;
  const durationSource = legacyDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown
    ? TRAINING_CONTEXT_SOURCES.legacyPersonalization
    : placeholderDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown
    ? TRAINING_CONTEXT_SOURCES.defaultPlaceholder
    : TRAINING_CONTEXT_SOURCES.unknown;

  return {
    environment: makeField({
      value: environmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown ? environmentValue : legacyEnvironmentValue,
      confirmed: typeof stored?.environment?.confirmed === "boolean"
        ? stored.environment.confirmed
        : Boolean(hasLegacyEnvironmentEvidence && legacyEnvironmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown),
      source: stored?.environment?.source || (legacyReady ? legacyEnvironmentSource : TRAINING_CONTEXT_SOURCES.unknown),
    }),
    equipmentAccess: {
      ...makeField({
        value: equipmentValue !== TRAINING_EQUIPMENT_VALUES.unknown ? equipmentValue : legacyEquipmentValue,
      confirmed: typeof stored?.equipmentAccess?.confirmed === "boolean"
        ? stored.equipmentAccess.confirmed
        : Boolean((legacyReady && legacyEquipmentItems.length > 0) || (hasTravelEvidence && legacyEquipmentValue !== TRAINING_EQUIPMENT_VALUES.unknown)),
      source: stored?.equipmentAccess?.source || (legacyReady ? (legacyEquipmentItems.length ? TRAINING_CONTEXT_SOURCES.legacyPersonalization : placeholderEquipmentSource) : TRAINING_CONTEXT_SOURCES.unknown),
      }),
      items: storedEquipmentItems.length ? storedEquipmentItems : legacyEquipmentItems,
    },
    sessionDuration: makeField({
      value: sessionDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown
        ? sessionDurationValue
        : legacyDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown
        ? legacyDurationValue
        : placeholderDurationValue,
      confirmed: typeof stored?.sessionDuration?.confirmed === "boolean"
        ? stored.sessionDuration.confirmed
        : Boolean(legacyReady && legacyDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown),
      source: stored?.sessionDuration?.source || (legacyReady ? durationSource : TRAINING_CONTEXT_SOURCES.unknown),
    }),
    intensityPosture: makeField({
      value: intensityValue !== TRAINING_INTENSITY_VALUES.unknown ? intensityValue : legacyIntensityValue,
      confirmed: typeof stored?.intensityPosture?.confirmed === "boolean"
        ? stored.intensityPosture.confirmed
        : Boolean(legacyReady && legacyIntensityValue !== TRAINING_INTENSITY_VALUES.unknown),
      source: stored?.intensityPosture?.source || (legacyReady ? TRAINING_CONTEXT_SOURCES.legacyPersonalization : TRAINING_CONTEXT_SOURCES.unknown),
    }),
  };
};

export const deriveActiveIssueContextFromPersonalization = ({ personalization = {} } = {}) => {
  const injuryState = personalization?.injuryPainState || {};
  const level = sanitizeText(injuryState?.level || "none", 40).toLowerCase() || "none";
  const area = sanitizeText(injuryState?.area || "", 80);
  const notes = sanitizeText(injuryState?.notes || "", 220);
  const explicitlyPreserved = Boolean(injuryState?.preserveForPlanning);
  const active = level !== "none" || explicitlyPreserved;
  return {
    active,
    level: active ? level : "none",
    area: active ? (area || "Current issue") : "",
    notes: active ? notes : "",
    preserved: explicitlyPreserved,
    source: active
      ? level !== "none"
        ? "active_issue"
        : "preserved_issue"
      : notes
      ? TRAINING_CONTEXT_SOURCES.staleCarryover
      : TRAINING_CONTEXT_SOURCES.unknown,
    activeConstraints: active && notes ? [notes] : [],
    historicalNotes: !active && notes ? notes : "",
  };
};

export const summarizeTrainingContext = (trainingContext = null) => {
  const context = trainingContext || createEmptyTrainingContext();
  const environmentLabel = trainingEnvironmentToDisplayMode(context?.environment?.value || TRAINING_ENVIRONMENT_VALUES.unknown);
  const equipmentItems = normalizeEquipmentItems(context?.equipmentAccess?.items || []);
  const equipmentLabel = equipmentItems.length
    ? equipmentItems.join(", ")
    : context?.equipmentAccess?.value === TRAINING_EQUIPMENT_VALUES.none
    ? "Bodyweight only"
    : context?.equipmentAccess?.value === TRAINING_EQUIPMENT_VALUES.dumbbells
    ? "Dumbbells"
    : context?.equipmentAccess?.value === TRAINING_EQUIPMENT_VALUES.basicGym
    ? "Basic gym"
    : context?.equipmentAccess?.value === TRAINING_EQUIPMENT_VALUES.fullGym
    ? "Full gym"
    : context?.equipmentAccess?.value === TRAINING_EQUIPMENT_VALUES.mixed
    ? "Mixed equipment"
    : "Unknown";
  const sessionLabel = context?.sessionDuration?.value && context.sessionDuration.value !== TRAINING_SESSION_DURATION_VALUES.unknown
    ? `${context.sessionDuration.value} min`
    : "Unknown";
  const intensityLabel = context?.intensityPosture?.value && context.intensityPosture.value !== TRAINING_INTENSITY_VALUES.unknown
    ? context.intensityPosture.value.replaceAll("_", " ")
    : "Unknown";
  return {
    environmentLabel,
    equipmentLabel,
    equipmentItems,
    sessionLabel,
    intensityLabel,
  };
};

export const trainingEnvironmentToDisplayMode = (value = TRAINING_ENVIRONMENT_VALUES.unknown) => (
  value === TRAINING_ENVIRONMENT_VALUES.home ? "Home"
  : value === TRAINING_ENVIRONMENT_VALUES.gym ? "Gym"
  : value === TRAINING_ENVIRONMENT_VALUES.mixed ? "Both"
  : value === TRAINING_ENVIRONMENT_VALUES.variable ? "Varies"
  : "Unknown"
);

export const trainingEquipmentToEnvironmentCode = (value = TRAINING_EQUIPMENT_VALUES.unknown) => (
  value === TRAINING_EQUIPMENT_VALUES.none ? "none"
  : value === TRAINING_EQUIPMENT_VALUES.dumbbells ? "dumbbells"
  : value === TRAINING_EQUIPMENT_VALUES.basicGym ? "basic_gym"
  : value === TRAINING_EQUIPMENT_VALUES.fullGym ? "full_gym"
  : value === TRAINING_EQUIPMENT_VALUES.mixed ? "mixed"
  : "unknown"
);
