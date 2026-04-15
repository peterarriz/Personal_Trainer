import { dedupeStrings } from "../utils/collection-utils.js";
import { projectResolvedGoalToPlanningGoal } from "./goal-resolution-service.js";
import { deriveTrainingContextFromPersonalization } from "./training-context-service.js";

export const CANONICAL_ATHLETE_VERSION = "2026-04-athlete-v1";

export const LEGACY_GOAL_PROFILE_PATHS = [
  "goals",
  "personalization.userGoalProfile",
  "personalization.goalState",
];

const CATEGORY_TO_PRIMARY_GOAL = {
  body_comp: "fat_loss",
  strength: "muscle_gain",
  running: "endurance",
  injury_prevention: "general_fitness",
  general_fitness: "general_fitness",
};

const DEFAULT_CANONICAL_USER_PROFILE = {
  name: "Athlete",
  timezone: "",
  birthYear: "",
  age: "",
  height: "",
  weight: "",
  units: {
    weight: "lbs",
    height: "ft_in",
    distance: "miles",
  },
  trainingAgeYears: 0,
  primaryGoalKey: "general_fitness",
  experienceLevel: "beginner",
  fitnessLevel: "unknown",
  daysPerWeek: 3,
  sessionLength: "30",
  equipmentAccess: [],
  constraints: [],
  scheduleConstraints: [],
  trainingContext: null,
  preferences: {
    coachingTone: "adaptive",
    trainingStyle: "",
    goalMix: "",
    preferredEnvironments: [],
    defaultEnvironment: "Home",
    intensityPreference: "Standard",
    nutritionStyle: "",
    preferredMeals: [],
  },
};

const DEFAULT_CANONICAL_GOAL_STATE = {
  primaryGoal: "",
  primaryGoalCategory: "undecided",
  priority: "undecided",
  priorityOrder: "",
  deadline: "",
  planStartDate: "",
  milestones: null,
  confidence: 0,
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const clampMinInt = (value, fallback = 3, min = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.round(numeric));
};

export const inferGoalType = (goal = {}) => {
  if (goal?.type === "time_bound" || goal?.type === "ongoing") return goal.type;
  return goal?.targetDate ? "time_bound" : "ongoing";
};

const normalizePriorityNumber = (value, fallback = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.round(numeric));
};

export const inferNormalizedGoalPriority = (goal = {}, idx = 0) => {
  const explicitPriority = normalizePriorityNumber(
    goal?.priority
      ?? goal?.resolvedGoal?.planningPriority
      ?? goal?.planningPriority,
    null
  );
  if (explicitPriority) return explicitPriority;

  const normalizedRole = pickFirstNonEmpty(
    goal?.intakeConfirmedRole,
    goal?.goalArbitrationRole,
    goal?.goalRole,
    goal?.resolvedGoal?.intakeConfirmedRole
  ).toLowerCase();

  if (normalizedRole === "primary") return 1;
  if (normalizedRole === "maintained") return Math.max(2, idx + 1);
  if (normalizedRole === "background") return Math.max(3, idx + 1);
  if (normalizedRole === "deferred") return Math.max(4, idx + 1);
  return idx + 1;
};

export const normalizeGoalObject = (goal = {}, idx = 0) => {
  const projectedFromResolved = goal?.resolvedGoal
    ? projectResolvedGoalToPlanningGoal(goal.resolvedGoal, idx)
    : null;
  const mergedGoal = {
    ...(goal || {}),
    ...(projectedFromResolved || {}),
    resolvedGoal: goal?.resolvedGoal || null,
  };
  const type = inferGoalType(mergedGoal);
  const tracking = mergedGoal?.tracking || (type === "ongoing"
    ? {
        mode: mergedGoal?.category === "body_comp" ? "weekly_checkin" : mergedGoal?.category === "strength" ? "logged_lifts" : "progress_tracker",
        unit: mergedGoal?.category === "body_comp" ? "lb" : mergedGoal?.category === "strength" ? "lb" : "",
      }
    : { mode: "deadline" });

  return {
    id: mergedGoal?.id || `goal_${idx + 1}`,
    name: mergedGoal?.name || "Goal",
    category: mergedGoal?.category || "running",
    priority: inferNormalizedGoalPriority(mergedGoal, idx),
    targetDate: mergedGoal?.targetDate || "",
    measurableTarget: mergedGoal?.measurableTarget || "",
    active: mergedGoal?.active !== false,
    ...mergedGoal,
    type,
    tracking,
  };
};

export const normalizeGoals = (goals = []) => (goals || []).map((goal, idx) => normalizeGoalObject(goal, idx));

export const daysUntil = (dateStr) => {
  if (!dateStr) return 9999;
  const target = new Date(`${dateStr}T12:00:00`).getTime();
  if (Number.isNaN(target)) return 9999;
  return Math.floor((target - Date.now()) / 86400000);
};

export const getGoalBuckets = (goals = []) => {
  const normalized = normalizeGoals(goals);
  const active = normalized.filter((goal) => goal.active).sort((a, b) => a.priority - b.priority);
  const timeBound = active.filter((goal) => goal.type === "time_bound");
  const ongoing = active.filter((goal) => goal.type === "ongoing");
  return { normalized, active, timeBound, ongoing };
};

export const getActiveTimeBoundGoal = (goals = []) => {
  const { timeBound } = getGoalBuckets(goals);
  return (timeBound || [])
    .map((goal) => ({ ...goal, days: daysUntil(goal.targetDate) }))
    .filter((goal) => Number.isFinite(goal.days))
    .sort((a, b) => a.days - b.days)[0] || null;
};

const buildCanonicalUserProfile = ({
  primaryGoal,
  personalization = {},
  legacyUserProfile = {},
  profileDefaults = {},
} = {}) => {
  const profile = personalization?.profile || {};
  const settings = personalization?.settings || {};
  const trainingPreferences = settings?.trainingPreferences || {};
  const nutritionPreferenceState = personalization?.nutritionPreferenceState || {};
  const environmentConfig = personalization?.environmentConfig || {};
  const coachMemory = personalization?.coachMemory || {};
  const trainingContext = deriveTrainingContextFromPersonalization({ personalization });

  return {
    ...DEFAULT_CANONICAL_USER_PROFILE,
    name: pickFirstNonEmpty(profile?.name, profileDefaults?.name, DEFAULT_CANONICAL_USER_PROFILE.name),
    timezone: pickFirstNonEmpty(profile?.timezone, DEFAULT_CANONICAL_USER_PROFILE.timezone),
    birthYear: pickFirstNonEmpty(profile?.birthYear, DEFAULT_CANONICAL_USER_PROFILE.birthYear),
    age: pickFirstNonEmpty(profile?.age, profileDefaults?.age, DEFAULT_CANONICAL_USER_PROFILE.age),
    height: pickFirstNonEmpty(profile?.height, profileDefaults?.height, DEFAULT_CANONICAL_USER_PROFILE.height),
    weight: pickFirstNonEmpty(profile?.weight, profileDefaults?.weight, DEFAULT_CANONICAL_USER_PROFILE.weight),
    units: {
      ...DEFAULT_CANONICAL_USER_PROFILE.units,
      ...(settings?.units || {}),
    },
    trainingAgeYears: Math.max(0, Number(profile?.trainingAgeYears || 0) || 0),
    primaryGoalKey: legacyUserProfile?.primary_goal
      || CATEGORY_TO_PRIMARY_GOAL[primaryGoal?.category]
      || DEFAULT_CANONICAL_USER_PROFILE.primaryGoalKey,
    experienceLevel: pickFirstNonEmpty(
      legacyUserProfile?.experience_level,
      profile?.estimatedFitnessLevel,
      DEFAULT_CANONICAL_USER_PROFILE.experienceLevel
    ),
    fitnessLevel: pickFirstNonEmpty(
      personalization?.fitnessSignals?.fitnessLevel,
      profile?.fitnessLevel,
      profile?.estimatedFitnessLevel,
      DEFAULT_CANONICAL_USER_PROFILE.fitnessLevel
    ),
    daysPerWeek: clampMinInt(legacyUserProfile?.days_per_week, DEFAULT_CANONICAL_USER_PROFILE.daysPerWeek),
    sessionLength: pickFirstNonEmpty(
      legacyUserProfile?.session_length,
      environmentConfig?.base?.time,
      DEFAULT_CANONICAL_USER_PROFILE.sessionLength
    ),
    equipmentAccess: dedupeStrings(
      trainingContext?.equipmentAccess?.confirmed
        ? (trainingContext?.equipmentAccess?.items || [])
        : (legacyUserProfile?.equipment_access || [])
    ),
    constraints: dedupeStrings(legacyUserProfile?.constraints || []),
    scheduleConstraints: dedupeStrings(coachMemory?.scheduleConstraints || []),
    trainingContext,
    preferences: {
      coachingTone: pickFirstNonEmpty(profile?.preferredCoachingTone, DEFAULT_CANONICAL_USER_PROFILE.preferences.coachingTone),
      trainingStyle: pickFirstNonEmpty(profile?.preferredTrainingStyle, DEFAULT_CANONICAL_USER_PROFILE.preferences.trainingStyle),
      goalMix: pickFirstNonEmpty(profile?.goalMix, DEFAULT_CANONICAL_USER_PROFILE.preferences.goalMix),
      preferredEnvironments: dedupeStrings(profile?.preferredEnvironments || []),
      defaultEnvironment: pickFirstNonEmpty(
        trainingPreferences?.defaultEnvironment,
        environmentConfig?.defaultMode,
        DEFAULT_CANONICAL_USER_PROFILE.preferences.defaultEnvironment
      ),
      intensityPreference: pickFirstNonEmpty(
        trainingPreferences?.intensityPreference,
        DEFAULT_CANONICAL_USER_PROFILE.preferences.intensityPreference
      ),
      nutritionStyle: pickFirstNonEmpty(
        nutritionPreferenceState?.style,
        DEFAULT_CANONICAL_USER_PROFILE.preferences.nutritionStyle
      ),
      preferredMeals: dedupeStrings(nutritionPreferenceState?.preferredMeals || []),
    },
  };
};

const buildCanonicalGoalState = ({
  primaryGoal = null,
  activeTimeBoundGoal = null,
  goalBuckets = {},
  personalization = {},
} = {}) => {
  const storedGoalState = personalization?.goalState || {};
  const priorityOrder = (goalBuckets?.active || []).map((goal) => goal?.name).filter(Boolean);

  return {
    ...DEFAULT_CANONICAL_GOAL_STATE,
    ...storedGoalState,
    primaryGoal: primaryGoal?.name || storedGoalState?.primaryGoal || DEFAULT_CANONICAL_GOAL_STATE.primaryGoal,
    primaryGoalCategory: primaryGoal?.category || storedGoalState?.priority || DEFAULT_CANONICAL_GOAL_STATE.primaryGoalCategory,
    priority: primaryGoal?.category || storedGoalState?.priority || DEFAULT_CANONICAL_GOAL_STATE.priority,
    priorityOrder: priorityOrder.length ? priorityOrder.join(" > ") : (storedGoalState?.priorityOrder || DEFAULT_CANONICAL_GOAL_STATE.priorityOrder),
    deadline: activeTimeBoundGoal?.targetDate || storedGoalState?.deadline || DEFAULT_CANONICAL_GOAL_STATE.deadline,
    planStartDate: storedGoalState?.planStartDate || DEFAULT_CANONICAL_GOAL_STATE.planStartDate,
    milestones: storedGoalState?.milestones || DEFAULT_CANONICAL_GOAL_STATE.milestones,
    confidence: Number.isFinite(Number(storedGoalState?.confidence))
      ? Number(storedGoalState.confidence)
      : DEFAULT_CANONICAL_GOAL_STATE.confidence,
  };
};

export const deriveCanonicalAthleteState = ({
  goals = [],
  personalization = {},
  profileDefaults = {},
} = {}) => {
  const normalizedGoals = normalizeGoals(goals);
  const goalBuckets = getGoalBuckets(normalizedGoals);
  const activeTimeBoundGoal = getActiveTimeBoundGoal(goalBuckets.active);
  const primaryGoal = goalBuckets.active[0] || null;
  const legacyUserProfile = personalization?.userGoalProfile || {};
  const userProfile = buildCanonicalUserProfile({
    primaryGoal,
    personalization,
    legacyUserProfile,
    profileDefaults,
  });
  const goalState = buildCanonicalGoalState({
    primaryGoal,
    activeTimeBoundGoal,
    goalBuckets,
    personalization,
  });

  return {
    version: CANONICAL_ATHLETE_VERSION,
    goals: normalizedGoals,
    goalBuckets,
    activeTimeBoundGoal,
    primaryGoal,
    userProfile,
    trainingContext: userProfile.trainingContext || null,
    goalState,
    legacyCompatibility: {
      deprecatedInputPaths: [...LEGACY_GOAL_PROFILE_PATHS],
    },
  };
};

export const buildLegacyGoalProfileCompatibilityFields = ({
  canonicalAthlete = null,
  personalization = {},
  userProfileOverrides = {},
  goalStateOverrides = {},
} = {}) => {
  const canonicalUserProfile = canonicalAthlete?.userProfile || DEFAULT_CANONICAL_USER_PROFILE;
  const canonicalGoalState = canonicalAthlete?.goalState || DEFAULT_CANONICAL_GOAL_STATE;
  const existingUserGoalProfile = personalization?.userGoalProfile || {};
  const existingGoalState = personalization?.goalState || {};

  return {
    userGoalProfile: {
      ...existingUserGoalProfile,
      primary_goal: canonicalUserProfile?.primaryGoalKey || existingUserGoalProfile?.primary_goal || "",
      experience_level: canonicalUserProfile?.experienceLevel || existingUserGoalProfile?.experience_level || DEFAULT_CANONICAL_USER_PROFILE.experienceLevel,
      days_per_week: clampMinInt(
        canonicalUserProfile?.daysPerWeek,
        existingUserGoalProfile?.days_per_week || DEFAULT_CANONICAL_USER_PROFILE.daysPerWeek
      ),
      session_length: canonicalUserProfile?.sessionLength || existingUserGoalProfile?.session_length || DEFAULT_CANONICAL_USER_PROFILE.sessionLength,
      equipment_access: dedupeStrings(canonicalUserProfile?.equipmentAccess || existingUserGoalProfile?.equipment_access || []),
      constraints: dedupeStrings(canonicalUserProfile?.constraints || existingUserGoalProfile?.constraints || []),
      ...userProfileOverrides,
    },
    goalState: {
      ...existingGoalState,
      primaryGoal: canonicalGoalState?.primaryGoal || existingGoalState?.primaryGoal || "",
      priority: canonicalGoalState?.priority || existingGoalState?.priority || DEFAULT_CANONICAL_GOAL_STATE.priority,
      priorityOrder: canonicalGoalState?.priorityOrder || existingGoalState?.priorityOrder || DEFAULT_CANONICAL_GOAL_STATE.priorityOrder,
      deadline: canonicalGoalState?.deadline || existingGoalState?.deadline || DEFAULT_CANONICAL_GOAL_STATE.deadline,
      planStartDate: canonicalGoalState?.planStartDate || existingGoalState?.planStartDate || DEFAULT_CANONICAL_GOAL_STATE.planStartDate,
      milestones: canonicalGoalState?.milestones || existingGoalState?.milestones || DEFAULT_CANONICAL_GOAL_STATE.milestones,
      confidence: Number.isFinite(Number(canonicalGoalState?.confidence))
        ? Number(canonicalGoalState.confidence)
        : (Number.isFinite(Number(existingGoalState?.confidence)) ? Number(existingGoalState.confidence) : DEFAULT_CANONICAL_GOAL_STATE.confidence),
      ...goalStateOverrides,
    },
  };
};

export const withLegacyGoalProfileCompatibility = ({
  personalization = {},
  canonicalAthlete = null,
  userProfileOverrides = {},
  goalStateOverrides = {},
} = {}) => {
  const compatibilityFields = buildLegacyGoalProfileCompatibilityFields({
    canonicalAthlete,
    personalization,
    userProfileOverrides,
    goalStateOverrides,
  });

  return {
    ...personalization,
    ...compatibilityFields,
  };
};
