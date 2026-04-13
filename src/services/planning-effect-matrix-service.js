const normalizeText = (value = "") => String(value || "").trim().toLowerCase();

export const TRAINING_PREFERENCE_POLICIES = {
  conservative: {
    id: "conservative",
    label: "Conservative",
    volumeCapPct: 90,
    progressionStep: "small",
    fatigueCeiling: "lower",
    deloadSensitivity: "high",
    catchUpPolicy: "preserve_then_defer",
    sessionDensity: "trim_supportive_work",
    loadJumpTolerance: "low",
    explanation: "Protect recovery first, trim supportive work early, and avoid aggressive catch-up.",
  },
  standard: {
    id: "standard",
    label: "Standard",
    volumeCapPct: 100,
    progressionStep: "moderate",
    fatigueCeiling: "normal",
    deloadSensitivity: "normal",
    catchUpPolicy: "preserve_key_work",
    sessionDensity: "baseline",
    loadJumpTolerance: "moderate",
    explanation: "Keep the baseline progression model and only adapt when real signals justify it.",
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    volumeCapPct: 110,
    progressionStep: "large",
    fatigueCeiling: "higher",
    deloadSensitivity: "lower",
    catchUpPolicy: "preserve_then_reschedule",
    sessionDensity: "expand_supportive_work",
    loadJumpTolerance: "high",
    explanation: "Preserve more work, unlock progression faster, and tolerate a higher loading ceiling when recovery supports it.",
  },
};

export const PLANNING_EFFECT_MATRIX = {
  trainingPreference: {
    changes: [
      "volume cap",
      "progression step size",
      "fatigue ceiling",
      "missed-session catch-up policy",
      "same-week density",
      "load-jump tolerance",
    ],
    mustNotChange: ["confirmed goals", "historical actuals"],
    horizon: "medium",
    visibleSurfaces: ["Today", "Program", "Coach"],
    explanationPattern: "Preference changes the week shape and progression tolerance, not just the copy.",
  },
  workoutOutcome: {
    changes: [
      "same-week carry-forward",
      "next-session difficulty",
      "weekly aggression posture",
      "next-week progression readiness",
    ],
    mustNotChange: ["committed history", "goal semantics"],
    horizon: "immediate_to_short",
    visibleSurfaces: ["Today", "Program", "Log", "Coach"],
    explanationPattern: "Logs can preserve, simplify, reschedule, or hold progression depending on the outcome.",
  },
  performanceRecords: {
    changes: [
      "lift progression posture",
      "quality-session hold/progress decisions",
      "domain-specific readiness flags",
    ],
    mustNotChange: ["actual performance records", "confirmed program compatibility"],
    horizon: "short_to_medium",
    visibleSurfaces: ["Today", "Program", "Coach"],
    explanationPattern: "Performance records tune progression and intensity, not the goal itself.",
  },
  nutritionActuals: {
    changes: [
      "same-day nutrition support",
      "next-day fueling posture",
      "training caps only when under-fueling or hydration issues repeat",
    ],
    mustNotChange: ["the whole week from one miss", "actual workout history"],
    horizon: "same_day_to_medium",
    visibleSurfaces: ["Nutrition", "Today", "Program", "Coach"],
    explanationPattern: "One miss changes nutrition support first; repeated misses can cap training intensity later.",
  },
  readinessAndPain: {
    changes: [
      "same-day intensity",
      "session substitution",
      "protective recovery posture",
    ],
    mustNotChange: ["goal stack", "committed historical sessions"],
    horizon: "immediate",
    visibleSurfaces: ["Today", "Program", "Coach"],
    explanationPattern: "Immediate context changes today first, then the nearby week if the signal persists.",
  },
  programAndStyle: {
    changes: [
      "week skeleton when a Program is compatible",
      "session feel and emphasis when a Style is active",
    ],
    mustNotChange: ["goal ownership", "hard safety rules"],
    horizon: "immediate",
    visibleSurfaces: ["Program", "Today", "Coach", "Settings"],
    explanationPattern: "Programs are backbones; Styles are overlays.",
  },
};

export const resolveTrainingPreferencePolicy = ({
  trainingContext = null,
  personalization = null,
  fallback = "standard",
} = {}) => {
  const explicitValue = normalizeText(trainingContext?.intensityPosture?.value || "");
  const legacyValue = normalizeText(personalization?.settings?.trainingPreferences?.intensityPreference || "");
  const resolved = explicitValue && explicitValue !== "unknown"
    ? explicitValue
    : legacyValue && legacyValue !== "unknown"
    ? legacyValue
    : normalizeText(fallback || "standard");
  return TRAINING_PREFERENCE_POLICIES[resolved] || TRAINING_PREFERENCE_POLICIES.standard;
};

export const resolveInputEffectHorizon = ({
  inputType = "",
  weeklyNutritionReview = null,
} = {}) => {
  const normalized = normalizeText(inputType);
  if (normalized === "workout_log") return "immediate_to_short";
  if (normalized === "training_preference") return "medium";
  if (normalized === "program_activation" || normalized === "style_activation") return "immediate";
  if (normalized === "nutrition_log") {
    return weeklyNutritionReview?.adaptation?.shouldAdapt ? "same_day_to_medium" : "same_day";
  }
  if (normalized === "readiness" || normalized === "pain" || normalized === "travel") return "immediate";
  return "short";
};

export const buildPreferenceEffectLine = (policy = TRAINING_PREFERENCE_POLICIES.standard) => {
  if (policy?.id === "conservative") {
    return "Conservative preference trims supportive work sooner and caps progression earlier.";
  }
  if (policy?.id === "aggressive") {
    return "Aggressive preference preserves more work and unlocks progression faster when recovery supports it.";
  }
  return "Standard preference keeps the baseline progression and recovery tradeoff.";
};
