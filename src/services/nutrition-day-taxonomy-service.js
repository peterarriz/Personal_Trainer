const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const NUTRITION_DAY_TYPES = Object.freeze({
  runEasy: "run_easy",
  runQuality: "run_quality",
  runLong: "run_long",
  swimTechnique: "swim_technique",
  swimAerobic: "swim_aerobic",
  swimQuality: "swim_quality",
  swimEndurance: "swim_endurance",
  strengthSupport: "strength_support",
  hybridSupport: "hybrid_support",
  conditioningMixed: "conditioning_mixed",
  recovery: "recovery",
  travelEndurance: "travel_endurance",
  travelRecovery: "travel_recovery",
});

export const NUTRITION_DEMAND_PROFILES = Object.freeze({
  enduranceBase: "endurance_base",
  enduranceQuality: "endurance_quality",
  enduranceLong: "endurance_long",
  strengthSupport: "strength_support",
  hybridSupport: "hybrid_support",
  conditioningMixed: "conditioning_mixed",
  recovery: "recovery",
  travelEndurance: "travel_endurance",
  travelRecovery: "travel_recovery",
});

const NUTRITION_DEMAND_TARGETS = Object.freeze({
  [NUTRITION_DEMAND_PROFILES.enduranceBase]: { cal: 2600, p: 190, c: 255, f: 68, label: "Base Endurance Day" },
  [NUTRITION_DEMAND_PROFILES.enduranceQuality]: { cal: 2700, p: 190, c: 280, f: 68, label: "Quality Endurance Day" },
  [NUTRITION_DEMAND_PROFILES.enduranceLong]: { cal: 2900, p: 190, c: 320, f: 70, label: "Long Endurance Day" },
  [NUTRITION_DEMAND_PROFILES.strengthSupport]: { cal: 2500, p: 190, c: 220, f: 72, label: "Strength Support Day" },
  [NUTRITION_DEMAND_PROFILES.hybridSupport]: { cal: 2650, p: 190, c: 250, f: 70, label: "Hybrid Support Day" },
  [NUTRITION_DEMAND_PROFILES.conditioningMixed]: { cal: 2650, p: 190, c: 265, f: 68, label: "Mixed Conditioning Day" },
  [NUTRITION_DEMAND_PROFILES.recovery]: { cal: 2350, p: 185, c: 195, f: 72, label: "Recovery Day" },
  [NUTRITION_DEMAND_PROFILES.travelEndurance]: { cal: 2650, p: 185, c: 270, f: 68, label: "Travel Endurance Day" },
  [NUTRITION_DEMAND_PROFILES.travelRecovery]: { cal: 2300, p: 180, c: 190, f: 70, label: "Travel Recovery Day" },
});

export const NUTRITION_DAY_TYPE_META = Object.freeze({
  [NUTRITION_DAY_TYPES.runEasy]: {
    label: "Easy Run Day",
    domain: "running",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceBase,
    tags: ["run", "aerobic", "base"],
  },
  [NUTRITION_DAY_TYPES.runQuality]: {
    label: "Quality Run Day",
    domain: "running",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceQuality,
    tags: ["run", "quality"],
  },
  [NUTRITION_DAY_TYPES.runLong]: {
    label: "Long Run Day",
    domain: "running",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceLong,
    tags: ["run", "long"],
  },
  [NUTRITION_DAY_TYPES.swimTechnique]: {
    label: "Technique Swim Day",
    domain: "swimming",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceBase,
    tags: ["swim", "technique"],
  },
  [NUTRITION_DAY_TYPES.swimAerobic]: {
    label: "Aerobic Swim Day",
    domain: "swimming",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceBase,
    tags: ["swim", "aerobic"],
  },
  [NUTRITION_DAY_TYPES.swimQuality]: {
    label: "Threshold Swim Day",
    domain: "swimming",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceQuality,
    tags: ["swim", "quality"],
  },
  [NUTRITION_DAY_TYPES.swimEndurance]: {
    label: "Endurance Swim Day",
    domain: "swimming",
    demandProfile: NUTRITION_DEMAND_PROFILES.enduranceLong,
    tags: ["swim", "endurance"],
  },
  [NUTRITION_DAY_TYPES.strengthSupport]: {
    label: "Strength Support Day",
    domain: "strength",
    demandProfile: NUTRITION_DEMAND_PROFILES.strengthSupport,
    tags: ["strength", "support"],
  },
  [NUTRITION_DAY_TYPES.hybridSupport]: {
    label: "Hybrid Support Day",
    domain: "hybrid",
    demandProfile: NUTRITION_DEMAND_PROFILES.hybridSupport,
    tags: ["hybrid", "support"],
  },
  [NUTRITION_DAY_TYPES.conditioningMixed]: {
    label: "Mixed Conditioning Day",
    domain: "conditioning",
    demandProfile: NUTRITION_DEMAND_PROFILES.conditioningMixed,
    tags: ["conditioning", "mixed"],
  },
  [NUTRITION_DAY_TYPES.recovery]: {
    label: "Recovery Day",
    domain: "recovery",
    demandProfile: NUTRITION_DEMAND_PROFILES.recovery,
    tags: ["recovery"],
  },
  [NUTRITION_DAY_TYPES.travelEndurance]: {
    label: "Travel Endurance Day",
    domain: "travel",
    demandProfile: NUTRITION_DEMAND_PROFILES.travelEndurance,
    tags: ["travel", "endurance"],
  },
  [NUTRITION_DAY_TYPES.travelRecovery]: {
    label: "Travel Recovery Day",
    domain: "travel",
    demandProfile: NUTRITION_DEMAND_PROFILES.travelRecovery,
    tags: ["travel", "recovery"],
  },
});

export const LEGACY_NUTRITION_DAY_TYPE_ALIASES = Object.freeze({
  easyRun: NUTRITION_DAY_TYPES.runEasy,
  hardRun: NUTRITION_DAY_TYPES.runQuality,
  longRun: NUTRITION_DAY_TYPES.runLong,
  strength: NUTRITION_DAY_TYPES.strengthSupport,
  otf: NUTRITION_DAY_TYPES.conditioningMixed,
  rest: NUTRITION_DAY_TYPES.recovery,
  travelRun: NUTRITION_DAY_TYPES.travelEndurance,
  travelRest: NUTRITION_DAY_TYPES.travelRecovery,
});

const DAY_TYPE_LOOKUP = Object.freeze({
  ...Object.fromEntries(Object.keys(NUTRITION_DAY_TYPE_META).map((key) => [key, key])),
  ...LEGACY_NUTRITION_DAY_TYPE_ALIASES,
});

export const normalizeNutritionDayType = (value = "", fallback = NUTRITION_DAY_TYPES.runEasy) => {
  const key = sanitizeText(value, 80);
  return DAY_TYPE_LOOKUP[key] || fallback;
};

export const getNutritionDayTypeMeta = (value = "", fallback = NUTRITION_DAY_TYPES.runEasy) => (
  NUTRITION_DAY_TYPE_META[normalizeNutritionDayType(value, fallback)]
  || NUTRITION_DAY_TYPE_META[fallback]
  || null
);

export const getNutritionDayTypeLabel = (value = "", fallback = NUTRITION_DAY_TYPES.runEasy) => (
  sanitizeText(getNutritionDayTypeMeta(value, fallback)?.label || "", 120)
);

export const getNutritionDemandProfile = (value = "", fallback = NUTRITION_DAY_TYPES.runEasy) => (
  getNutritionDayTypeMeta(value, fallback)?.demandProfile || NUTRITION_DEMAND_PROFILES.enduranceBase
);

export const getNutritionTargetsForDayType = (value = "", fallback = NUTRITION_DAY_TYPES.runEasy) => {
  const normalizedDayType = normalizeNutritionDayType(value, fallback);
  const meta = getNutritionDayTypeMeta(normalizedDayType, fallback);
  const targets = NUTRITION_DEMAND_TARGETS[meta?.demandProfile] || NUTRITION_DEMAND_TARGETS[NUTRITION_DEMAND_PROFILES.enduranceBase];
  return {
    ...targets,
    dayType: normalizedDayType,
    dayTypeLabel: meta?.label || targets.label || "",
    demandProfile: meta?.demandProfile || NUTRITION_DEMAND_PROFILES.enduranceBase,
    domain: meta?.domain || "",
    tags: Array.isArray(meta?.tags) ? [...meta.tags] : [],
  };
};

export const buildNutritionDayTargetsMap = () => (
  Object.fromEntries(
    Object.keys(NUTRITION_DAY_TYPE_META).map((dayType) => [dayType, getNutritionTargetsForDayType(dayType)])
  )
);

export const isRecoveryNutritionDayType = (value = "") => (
  [NUTRITION_DAY_TYPES.recovery, NUTRITION_DAY_TYPES.travelRecovery].includes(normalizeNutritionDayType(value))
);

export const isTravelNutritionDayType = (value = "") => (
  [NUTRITION_DAY_TYPES.travelEndurance, NUTRITION_DAY_TYPES.travelRecovery].includes(normalizeNutritionDayType(value))
);

export const isStrengthNutritionDayType = (value = "") => (
  normalizeNutritionDayType(value) === NUTRITION_DAY_TYPES.strengthSupport
);

export const isHybridNutritionDayType = (value = "") => (
  normalizeNutritionDayType(value) === NUTRITION_DAY_TYPES.hybridSupport
);

export const isConditioningNutritionDayType = (value = "") => (
  normalizeNutritionDayType(value) === NUTRITION_DAY_TYPES.conditioningMixed
);

export const isLongEnduranceNutritionDayType = (value = "") => {
  const normalized = normalizeNutritionDayType(value);
  return [
    NUTRITION_DAY_TYPES.runLong,
    NUTRITION_DAY_TYPES.swimEndurance,
    NUTRITION_DAY_TYPES.travelEndurance,
  ].includes(normalized);
};

export const isQualityEnduranceNutritionDayType = (value = "") => {
  const normalized = normalizeNutritionDayType(value);
  return [
    NUTRITION_DAY_TYPES.runQuality,
    NUTRITION_DAY_TYPES.swimQuality,
    NUTRITION_DAY_TYPES.conditioningMixed,
  ].includes(normalized);
};

export const isBaseEnduranceNutritionDayType = (value = "") => {
  const normalized = normalizeNutritionDayType(value);
  return [
    NUTRITION_DAY_TYPES.runEasy,
    NUTRITION_DAY_TYPES.swimTechnique,
    NUTRITION_DAY_TYPES.swimAerobic,
  ].includes(normalized);
};

export const isEnduranceNutritionDayType = (value = "") => {
  const normalized = normalizeNutritionDayType(value);
  return (
    isBaseEnduranceNutritionDayType(normalized)
    || isQualityEnduranceNutritionDayType(normalized)
    || isLongEnduranceNutritionDayType(normalized)
    || isHybridNutritionDayType(normalized)
  );
};

export const isHardNutritionDayType = (value = "") => (
  isQualityEnduranceNutritionDayType(value)
  || isLongEnduranceNutritionDayType(value)
  || normalizeNutritionDayType(value) === NUTRITION_DAY_TYPES.travelEndurance
);

export const resolveWorkoutNutritionDayType = ({
  todayWorkout = null,
  environmentMode = "home",
} = {}) => {
  const explicitDayType = normalizeNutritionDayType(String(todayWorkout?.nutri || "").trim(), "");
  if (explicitDayType) {
    if (String(environmentMode || "").includes("travel") && isRecoveryNutritionDayType(explicitDayType)) {
      return NUTRITION_DAY_TYPES.travelRecovery;
    }
    return explicitDayType;
  }
  const workoutType = sanitizeText(todayWorkout?.type || "", 80).toLowerCase();
  const runType = sanitizeText(todayWorkout?.run?.t || "", 80).toLowerCase();
  const swimFocus = sanitizeText(todayWorkout?.swim?.focus || "", 80).toLowerCase();
  const travelMode = String(environmentMode || "").includes("travel");

  if (workoutType === "rest" || workoutType === "recovery") return travelMode ? NUTRITION_DAY_TYPES.travelRecovery : NUTRITION_DAY_TYPES.recovery;
  if (workoutType === "run+strength") return NUTRITION_DAY_TYPES.hybridSupport;
  if (workoutType === "conditioning" || workoutType === "otf") return NUTRITION_DAY_TYPES.conditioningMixed;
  if (workoutType === "strength" || workoutType === "strength+prehab") return NUTRITION_DAY_TYPES.strengthSupport;
  if (workoutType === "swim-technique") return NUTRITION_DAY_TYPES.swimTechnique;
  if (workoutType === "swim-aerobic") return NUTRITION_DAY_TYPES.swimAerobic;
  if (workoutType === "swim-threshold") return NUTRITION_DAY_TYPES.swimQuality;
  if (workoutType === "swim-endurance") return NUTRITION_DAY_TYPES.swimEndurance;
  if (todayWorkout?.swim) {
    if (/threshold|pace|quality/.test(swimFocus)) return NUTRITION_DAY_TYPES.swimQuality;
    if (/technique|drill/.test(swimFocus)) return NUTRITION_DAY_TYPES.swimTechnique;
    if (/endurance|long/.test(swimFocus)) return NUTRITION_DAY_TYPES.swimEndurance;
    return NUTRITION_DAY_TYPES.swimAerobic;
  }
  if (workoutType === "long" || workoutType === "long-run" || /long/.test(runType)) return travelMode ? NUTRITION_DAY_TYPES.travelEndurance : NUTRITION_DAY_TYPES.runLong;
  if (workoutType === "hard" || workoutType === "hard-run" || /tempo|interval|quality/.test(runType)) return travelMode ? NUTRITION_DAY_TYPES.travelEndurance : NUTRITION_DAY_TYPES.runQuality;
  if (workoutType === "easy" || workoutType === "easy-run" || todayWorkout?.run || /easy/.test(runType)) return travelMode ? NUTRITION_DAY_TYPES.travelEndurance : NUTRITION_DAY_TYPES.runEasy;
  return travelMode ? NUTRITION_DAY_TYPES.travelRecovery : NUTRITION_DAY_TYPES.runEasy;
};

