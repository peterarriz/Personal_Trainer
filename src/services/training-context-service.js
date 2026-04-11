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

export const buildTrainingContextFromAnswers = ({ answers = {} } = {}) => {
  const environmentValue = normalizeTrainingEnvironment(answers.training_location || "");
  const equipmentItems = dedupeStrings([
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
      source: "onboarding_answers",
    }),
    equipmentAccess: {
      ...makeField({
        value: equipmentValue,
        confirmed: equipmentItems.length > 0,
        source: "onboarding_answers",
      }),
      items: equipmentItems,
    },
    sessionDuration: makeField({
      value: sessionDurationValue,
      confirmed: sessionDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown,
      source: "onboarding_answers",
    }),
    intensityPosture: makeField({
      value: intensityValue,
      confirmed: intensityValue !== TRAINING_INTENSITY_VALUES.unknown,
      source: "onboarding_answers",
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

  const legacyEnvironmentValue = normalizeTrainingEnvironment(
    trainingPreferences?.defaultEnvironment
    || environmentConfig?.defaultMode
    || (/full gym|limited gym|gym/.test(travelEnvironmentText) ? "Gym" : /travel/.test(travelEnvironmentText) ? "Varies" : /home/.test(travelEnvironmentText) ? "Home" : "")
    || ""
  );
  const legacyDurationValue = normalizeTrainingSessionDuration(
    legacyProfile?.session_length
    || environmentConfig?.base?.time
    || ""
  );
  const legacyIntensityValue = normalizeTrainingIntensity(trainingPreferences?.intensityPreference || "");
  const legacyEquipmentItems = dedupeStrings(
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

  const environmentValue = normalizeTrainingEnvironment(stored?.environment?.value || "");
  const sessionDurationValue = normalizeTrainingSessionDuration(stored?.sessionDuration?.value || "");
  const intensityValue = normalizeTrainingIntensity(stored?.intensityPosture?.value || "");
  const storedEquipmentItems = dedupeStrings(Array.isArray(stored?.equipmentAccess?.items) ? stored.equipmentAccess.items : []);
  const equipmentValue = stored?.equipmentAccess?.value || deriveEquipmentAccessValue({
    items: storedEquipmentItems,
    environmentValue,
  });

  return {
    environment: makeField({
      value: environmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown ? environmentValue : legacyEnvironmentValue,
      confirmed: typeof stored?.environment?.confirmed === "boolean"
        ? stored.environment.confirmed
        : Boolean((legacyReady || /gym|travel/.test(travelEnvironmentText)) && legacyEnvironmentValue !== TRAINING_ENVIRONMENT_VALUES.unknown),
      source: stored?.environment?.source || (legacyReady ? "legacy_personalization" : "unknown"),
    }),
    equipmentAccess: {
      ...makeField({
        value: equipmentValue !== TRAINING_EQUIPMENT_VALUES.unknown ? equipmentValue : legacyEquipmentValue,
      confirmed: typeof stored?.equipmentAccess?.confirmed === "boolean"
        ? stored.equipmentAccess.confirmed
        : Boolean((legacyReady && legacyEquipmentItems.length > 0) || legacyEquipmentValue !== TRAINING_EQUIPMENT_VALUES.unknown),
      source: stored?.equipmentAccess?.source || (legacyReady ? "legacy_personalization" : "unknown"),
      }),
      items: storedEquipmentItems.length ? storedEquipmentItems : legacyEquipmentItems,
    },
    sessionDuration: makeField({
      value: sessionDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown ? sessionDurationValue : legacyDurationValue,
      confirmed: typeof stored?.sessionDuration?.confirmed === "boolean"
        ? stored.sessionDuration.confirmed
        : Boolean(legacyReady && legacyDurationValue !== TRAINING_SESSION_DURATION_VALUES.unknown),
      source: stored?.sessionDuration?.source || (legacyReady ? "legacy_personalization" : "unknown"),
    }),
    intensityPosture: makeField({
      value: intensityValue !== TRAINING_INTENSITY_VALUES.unknown ? intensityValue : legacyIntensityValue,
      confirmed: typeof stored?.intensityPosture?.confirmed === "boolean"
        ? stored.intensityPosture.confirmed
        : Boolean(legacyReady && legacyIntensityValue !== TRAINING_INTENSITY_VALUES.unknown),
      source: stored?.intensityPosture?.source || (legacyReady ? "legacy_personalization" : "unknown"),
    }),
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
