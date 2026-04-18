import { dedupeStrings } from "../utils/collection-utils.js";
import { deriveTrainingContextFromPersonalization } from "./training-context-service.js";
import {
  createDefaultProgramSelectionState,
  getProgramDefinitionById,
  getStyleDefinitionById,
  normalizeProgramsSelectionState,
  PROGRAM_FIDELITY_MODES,
  PROGRAM_SOURCE_BASIS_LABELS,
  SOURCE_CONFIDENCE_LABELS,
} from "./program-catalog-service.ts";
import {
  assessProgramCompatibility,
  assessStyleCompatibility,
  COMPATIBILITY_OUTCOMES,
} from "./program-compatibility-service.ts";
import { resolveStyleOverlayImpact } from "./style-overlay-service.ts";
import { buildPlanBasisExplanation } from "./program-explanation-service.ts";
import { listCommittedPlanWeekRecords } from "./plan-week-persistence-service.js";
import { getCurrentPrescribedDayRecord } from "./prescribed-day-history-service.js";
import { NUTRITION_DAY_TYPES } from "./nutrition-day-taxonomy-service.js";

export const PLANNING_PRECEDENCE_STACK = Object.freeze([
  "hard safety, injury, and contraindications",
  "hard equipment constraints",
  "hard schedule reality",
  "active program hard rules",
  "explicit goal stack",
  "active program soft rules",
  "active style biases",
  "default house planning logic",
  "low-importance preferences",
]);

export const PROGRAM_RUNTIME_FIDELITY = Object.freeze({
  strict: "strict",
  adapted: "adapted",
  styleOnly: "style_only",
});

export const PROGRAM_FIDELITY_STATUS = Object.freeze({
  asRequested: "as_requested",
  downgradedForConstraints: "downgraded_for_constraints",
  downgradedForDrift: "downgraded_for_drift",
  suspended: "suspended",
});

const cloneValue = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const uniqueStrings = (items = []) => dedupeStrings((Array.isArray(items) ? items : []).map((item) => sanitizeText(item, 220)).filter(Boolean));
const isCompletedStatus = (status = "") => ["completed_as_planned", "completed_modified", "partial_completed"].includes(String(status || "").trim().toLowerCase());
const isStrengthType = (value = "") => /strength/.test(String(value || "").toLowerCase());
const isRunType = (value = "") => ["easy-run", "hard-run", "long-run", "run+strength"].includes(String(value || "").trim().toLowerCase());

const toRuntimeFidelityMode = (mode = "") => (
  mode === PROGRAM_FIDELITY_MODES.runAsWritten
    ? PROGRAM_RUNTIME_FIDELITY.strict
    : mode === PROGRAM_FIDELITY_MODES.useAsStyle
    ? PROGRAM_RUNTIME_FIDELITY.styleOnly
    : PROGRAM_RUNTIME_FIDELITY.adapted
);

const formatRuntimeFidelityLabel = (mode = "") => (
  mode === PROGRAM_RUNTIME_FIDELITY.strict
    ? "follow closely"
    : mode === PROGRAM_RUNTIME_FIDELITY.styleOnly
    ? "use for feel"
    : "fit to you"
);

const resolveAthleteProfile = ({
  personalization = {},
  goals = [],
  athleteProfile = null,
} = {}) => {
  if (athleteProfile?.userProfile) return athleteProfile;
  const trainingContext = deriveTrainingContextFromPersonalization({ personalization });
  const daysPerWeek = Number(
    personalization?.userGoalProfile?.days_per_week
    || personalization?.canonicalAthlete?.userProfile?.daysPerWeek
    || personalization?.profile?.daysPerWeek
    || 0
  ) || 0;
  const experienceLevel = String(
    personalization?.profile?.estimatedFitnessLevel
    || personalization?.profile?.fitnessLevel
    || personalization?.canonicalAthlete?.userProfile?.experienceLevel
    || "unknown"
  ).trim().toLowerCase();
  return {
    goals: Array.isArray(goals) ? goals : [],
    userProfile: {
      daysPerWeek,
      experienceLevel,
      sessionLength: trainingContext?.sessionDuration?.value || personalization?.userGoalProfile?.session_length || "",
      trainingContext,
    },
    trainingContext,
  };
};

const buildEquipmentProfile = (athleteProfile = {}, personalization = {}) => {
  const trainingContext = athleteProfile?.trainingContext || athleteProfile?.userProfile?.trainingContext || deriveTrainingContextFromPersonalization({ personalization });
  const bucket = String(trainingContext?.equipmentAccess?.value || "").trim().toLowerCase();
  const items = Array.isArray(trainingContext?.equipmentAccess?.items) ? trainingContext.equipmentAccess.items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const text = `${bucket} ${items.join(" ")}`.toLowerCase();
  return {
    bucket,
    items,
    hasFullGym: /full_gym|full gym|barbell|rack|cable|leg press|smith/.test(text),
    hasBench: /bench/.test(text),
    hasCable: /cable/.test(text),
    hasPullup: /pull-up|pull up|pullup/.test(text),
    hasRunningAccess: /run|trail|road|treadmill|track|safe running/.test(text),
    isHotel: /hotel/.test(text) || String(trainingContext?.environment?.value || "").trim().toLowerCase() === "travel",
  };
};

const buildExercise = (ex, sets, reps, note = "") => ({
  ex: sanitizeText(ex, 120),
  sets: sanitizeText(sets, 40),
  reps: sanitizeText(reps, 40),
  note: sanitizeText(note, 140),
});

const restDay = (label = "Active Recovery") => ({
  type: "rest",
  label,
  nutri: NUTRITION_DAY_TYPES.recovery,
  isRecoverySlot: true,
});

const conditioningDay = ({
  label = "Conditioning",
  detail = "20-30 min controlled conditioning",
  nutri = NUTRITION_DAY_TYPES.conditioningMixed,
  optionalSecondary = "",
  optional = false,
  planningPriority = 4,
  keySession = false,
  programLabel = "",
} = {}) => ({
  type: "conditioning",
  label,
  fallback: detail,
  nutri,
  optional,
  planningPriority,
  keySession,
  programLabel,
  optionalSecondary,
  intensityGuidance: /interval|quality|tempo/i.test(label) ? "Controlled hard efforts" : "Controlled aerobic conditioning",
});

const strengthDay = ({
  label = "Strength",
  strSess = "A",
  strengthDuration = "35-45 min",
  strengthTrackLabel = "Gym",
  prescribedExercises = [],
  intensityGuidance = "Controlled strength work",
  optionalSecondary = "",
  optional = false,
  planningPriority = 3,
  keySession = false,
  programLabel = "",
} = {}) => ({
  type: "strength+prehab",
  label,
  strSess,
  strengthDuration,
  strengthDose: strengthDuration,
  strengthTrack: "program",
  strengthTrackLabel,
  prescribedExercises: cloneValue(prescribedExercises || []),
  intensityGuidance,
  optionalSecondary,
  optional,
  planningPriority,
  keySession,
  programLabel,
  nutri: NUTRITION_DAY_TYPES.strengthSupport,
});

const runDay = ({
  type = "easy-run",
  label = "Easy Run",
  run = null,
  nutri = NUTRITION_DAY_TYPES.runEasy,
  optionalSecondary = "",
  optional = false,
  planningPriority = 2,
  keySession = false,
  programLabel = "",
} = {}) => ({
  type,
  label,
  run: cloneValue(run || null),
  nutri,
  optional,
  planningPriority,
  keySession,
  programLabel,
  optionalSecondary,
});

const applyAvailabilityTrim = ({
  sessions = {},
  availableDaysPerWeek = 0,
} = {}) => {
  if (!availableDaysPerWeek || availableDaysPerWeek >= 7) return cloneValue(sessions || {});
  const next = cloneValue(sessions || {});
  const plannedDays = Object.entries(next)
    .filter(([, session]) => session && session.type !== "rest")
    .sort((a, b) => Number(a?.[1]?.planningPriority || 99) - Number(b?.[1]?.planningPriority || 99));
  if (plannedDays.length <= availableDaysPerWeek) return next;
  const removable = [...plannedDays].sort((a, b) => Number(b?.[1]?.planningPriority || 99) - Number(a?.[1]?.planningPriority || 99));
  let sessionsToRemove = plannedDays.length - availableDaysPerWeek;
  removable.forEach(([dayKey, session]) => {
    if (sessionsToRemove <= 0) return;
    if (session?.keySession) return;
    next[dayKey] = restDay("Recovery / schedule space");
    sessionsToRemove -= 1;
  });
  if (sessionsToRemove > 0) {
    removable.forEach(([dayKey]) => {
      if (sessionsToRemove <= 0) return;
      next[dayKey] = restDay("Recovery / schedule space");
      sessionsToRemove -= 1;
    });
  }
  return next;
};

const buildFoundationStrengthA = (equipment = {}) => ([
  buildExercise(equipment.hasFullGym ? "Back squat" : "Goblet squat", "3-4 sets", "5-8 reps", "Start with a repeatable squat pattern."),
  buildExercise(equipment.hasBench ? "Bench press" : "DB bench press", "3-4 sets", "6-8 reps", "Pressing stays crisp, not grindy."),
  buildExercise(equipment.hasCable || equipment.hasPullup ? "Row or pull-down" : "One-arm DB row", "3 sets", "8-10 reps", "Match pressing volume with clean pulling."),
  buildExercise(equipment.hasFullGym ? "Romanian deadlift" : "DB Romanian deadlift", "3 sets", "6-8 reps", "Keep hinge loading controlled."),
  buildExercise("Loaded carry or plank", "2-3 sets", "30-45 sec", "Finish with trunk control."),
]);

const buildFoundationStrengthB = (equipment = {}) => ([
  buildExercise(equipment.hasFullGym ? "Front squat or split squat" : "Rear-foot-elevated split squat", "3 sets", "6-8 reps", "Single-leg control keeps the session athletic."),
  buildExercise(equipment.hasFullGym ? "Overhead press" : "DB overhead press", "3-4 sets", "6-8 reps", "Keep the press crisp."),
  buildExercise(equipment.hasCable ? "Cable row" : "Single-arm row", "3 sets", "8-12 reps", "Repeatable pulling volume."),
  buildExercise("Hip hinge accessory", "2-3 sets", "8-10 reps", "Posterior-chain support without frying recovery."),
  buildExercise("Carry or trunk finisher", "2-3 sets", "30-45 sec", "Leave feeling athletic, not smoked."),
]);

const buildStrengthFoundationA = (equipment = {}) => ([
  buildExercise(equipment.hasFullGym ? "Back squat" : "Goblet squat", "4 sets", "5 reps", "This is the main lower-body practice."),
  buildExercise(equipment.hasBench ? "Bench press" : "DB bench press", "4 sets", "5 reps", "Keep the press repeatable."),
  buildExercise(equipment.hasCable || equipment.hasPullup ? "Pull-up or pull-down" : "One-arm DB row", "3 sets", "6-8 reps", "Strong upper-back support."),
  buildExercise(equipment.hasFullGym ? "Romanian deadlift" : "DB Romanian deadlift", "3 sets", "6 reps", "Own the hinge pattern."),
]);

const buildStrengthFoundationB = (equipment = {}) => ([
  buildExercise(equipment.hasFullGym ? "Deadlift or trap-bar deadlift" : "DB Romanian deadlift", "4 sets", "4-6 reps", "This is the heavy hinge exposure."),
  buildExercise(equipment.hasFullGym ? "Overhead press" : "DB overhead press", "4 sets", "5 reps", "Press with full-body tension."),
  buildExercise(equipment.hasCable || equipment.hasPullup ? "Row or pull-down" : "Chest-supported DB row", "3 sets", "8 reps", "Keep pulling volume honest."),
  buildExercise("Split squat or step-up", "3 sets", "8 reps", "Single-leg stability keeps the week balanced."),
]);

const buildPowerbuildingLowerStrength = (equipment = {}) => ([
  buildExercise(equipment.hasFullGym ? "Top squat set" : "Heavy goblet squat", "1 top set + 3 backoff sets", "4-6 reps", "Numbers matter, but bar speed still matters."),
  buildExercise(equipment.hasFullGym ? "Romanian deadlift" : "DB Romanian deadlift", "3 sets", "6-8 reps", "Keep hinge volume honest."),
  buildExercise(equipment.hasFullGym ? "Leg press or hack squat" : "Split squat", "3 sets", "8-12 reps", "Hypertrophy support for lower body."),
  buildExercise("Calves or trunk", "2-3 sets", "10-15 reps", "Finish with low-drama support work."),
]);

const buildPowerbuildingUpperStrength = (equipment = {}) => ([
  buildExercise(equipment.hasBench ? "Bench press top set" : "DB bench press", "1 top set + 3 backoff sets", "4-6 reps", "Heavy press stays central."),
  buildExercise(equipment.hasCable || equipment.hasPullup ? "Weighted pull-up or pull-down" : "One-arm DB row", "4 sets", "6-8 reps", "Pair heavy pressing with heavy pulling."),
  buildExercise(equipment.hasFullGym ? "Incline press" : "Incline DB press", "3 sets", "8-10 reps", "Upper-body volume supports physique goals."),
  buildExercise("Arms or rear delts", "2-3 sets", "10-15 reps", "Keep the bodybuilding layer visible."),
]);

const buildPowerbuildingLowerHypertrophy = (equipment = {}) => ([
  buildExercise(equipment.hasFullGym ? "Leg press or front squat" : "DB split squat", "4 sets", "8-12 reps", "Lower-body size work without maxing out strain."),
  buildExercise(equipment.hasFullGym ? "Romanian deadlift" : "DB Romanian deadlift", "3 sets", "8-10 reps", "Posterior-chain hypertrophy."),
  buildExercise("Hamstring curl or hinge accessory", "3 sets", "10-12 reps", "Controlled accessory volume."),
  buildExercise("Calves", "3 sets", "12-15 reps", "Simple finisher volume."),
]);

const buildPowerbuildingUpperHypertrophy = (equipment = {}) => ([
  buildExercise(equipment.hasBench ? "Incline bench or DB incline press" : "DB incline press", "4 sets", "8-12 reps", "Upper chest and shoulder volume."),
  buildExercise(equipment.hasCable ? "Cable row" : "Chest-supported row", "4 sets", "8-12 reps", "Stable back volume."),
  buildExercise("Lateral raise", "3 sets", "12-15 reps", "Keep shoulders looking trained."),
  buildExercise("Curls + triceps", "3 rounds", "10-15 reps", "Arm volume stays visible."),
]);

const buildTravelStrengthA = () => ([
  buildExercise("Goblet squat", "3-4 sets", "8 reps", "Choose the heaviest hotel-friendly loading option."),
  buildExercise("DB bench press", "3-4 sets", "8-10 reps", "Controlled pressing with minimal setup."),
  buildExercise("One-arm row", "3 sets", "10 reps", "Pair every press with pulling."),
  buildExercise("Split squat", "3 sets", "8 reps/side", "Single-leg work keeps the dose high-signal."),
  buildExercise("Plank or hollow hold", "2-3 sets", "30-45 sec", "Finish compactly."),
]);

const buildTravelStrengthB = () => ([
  buildExercise("DB Romanian deadlift", "3-4 sets", "8 reps", "Posterior chain without complex setup."),
  buildExercise("DB overhead press", "3 sets", "8 reps", "Press with control."),
  buildExercise("Walking lunge", "3 sets", "10 reps/side", "Keep the legs honest."),
  buildExercise("Chest-supported DB row", "3 sets", "10 reps", "Stable pulling."),
  buildExercise("Carry or trunk circuit", "2-3 rounds", "30-45 sec", "Leave feeling switched on."),
]);

const buildMinimalEquipmentStrength = () => ([
  buildExercise("Split squat", "3-4 sets", "8-12 reps", "Use tempo if load is limited."),
  buildExercise("Push-up or floor press", "3-4 sets", "8-15 reps", "Keep upper-body pushing honest."),
  buildExercise("Single-arm row", "3 sets", "10-12 reps", "Simple pulling volume."),
  buildExercise("Hinge variation", "3 sets", "10 reps", "Posterior chain with one implement."),
  buildExercise("Trunk finisher", "2-3 rounds", "30-45 sec", "Stay organized, not frantic."),
]);

const buildProgramBackboneSessions = ({
  programDefinition = null,
  runtimeFidelityMode = PROGRAM_RUNTIME_FIDELITY.adapted,
  availableDaysPerWeek = 0,
  baseWeek = {},
  equipmentProfile = {},
} = {}) => {
  if (!programDefinition?.id) return null;
  const strict = runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict;
  const labelPrefix = strict ? programDefinition.displayName : `${programDefinition.displayName} (adapted)`;
  let sessions = null;

  switch (programDefinition.id) {
    case "program_foundation_training":
      sessions = {
        1: strengthDay({ label: "Foundation Strength A", strSess: "A", strengthDuration: "35-45 min total-body strength", prescribedExercises: buildFoundationStrengthA(equipmentProfile), keySession: true, planningPriority: 1, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        3: conditioningDay({ label: "Aerobic Conditioning", detail: "25-35 min zone-2 bike, brisk incline walk, easy run, or mixed conditioning", keySession: true, planningPriority: 2, programLabel: labelPrefix }),
        5: strengthDay({ label: "Foundation Strength B", strSess: "B", strengthDuration: "35-45 min total-body strength", prescribedExercises: buildFoundationStrengthB(equipmentProfile), keySession: true, planningPriority: 1, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        6: conditioningDay({ label: "Optional Easy Conditioning", detail: "20-30 min easy conditioning or mobility reset", optional: true, planningPriority: 5, programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_strength_foundation":
      sessions = {
        1: strengthDay({ label: "Primary Lower-Body Strength", strSess: "A", strengthDuration: "40-55 min main-lift strength", prescribedExercises: buildStrengthFoundationA(equipmentProfile), intensityGuidance: "Heavy but repeatable", keySession: true, planningPriority: 1, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        3: strengthDay({ label: "Press + Pull Strength", strSess: "B", strengthDuration: "35-50 min pressing and pulling", prescribedExercises: buildStrengthFoundationB(equipmentProfile), intensityGuidance: "Controlled heavy work", keySession: true, planningPriority: 1, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        5: conditioningDay({ label: "Support Conditioning", detail: "20-25 min easy bike, incline walk, or short conditioning support", planningPriority: 4, programLabel: labelPrefix }),
        6: strengthDay({ label: "Full-Body Strength + Carries", strSess: "A", strengthDuration: "35-45 min full-body strength", prescribedExercises: buildFoundationStrengthB(equipmentProfile), keySession: true, planningPriority: 2, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_powerbuilding_builder":
      sessions = {
        1: strengthDay({ label: "Lower-Body Strength", strSess: "A", strengthDuration: "50-65 min top set + backoff work", prescribedExercises: buildPowerbuildingLowerStrength(equipmentProfile), intensityGuidance: "Heavy top sets, controlled backoff volume", keySession: true, planningPriority: 1, strengthTrackLabel: "Gym", programLabel: labelPrefix }),
        2: strengthDay({ label: "Upper-Body Strength", strSess: "B", strengthDuration: "50-60 min heavy upper-body work", prescribedExercises: buildPowerbuildingUpperStrength(equipmentProfile), intensityGuidance: "Heavy pressing with quality backoff work", keySession: true, planningPriority: 1, strengthTrackLabel: "Gym", programLabel: labelPrefix }),
        4: strengthDay({ label: "Lower-Body Hypertrophy", strSess: "A", strengthDuration: "45-60 min hypertrophy volume", prescribedExercises: buildPowerbuildingLowerHypertrophy(equipmentProfile), optionalSecondary: "Optional: calves or trunk finisher", planningPriority: 2, programLabel: labelPrefix }),
        6: strengthDay({ label: "Upper-Body Hypertrophy", strSess: "B", strengthDuration: "45-60 min hypertrophy volume", prescribedExercises: buildPowerbuildingUpperHypertrophy(equipmentProfile), optionalSecondary: "Optional: short incline walk cooldown", planningPriority: 2, programLabel: labelPrefix }),
        5: conditioningDay({ label: "Optional Conditioning Support", detail: "12-20 min easy conditioning only if recovery is good", optional: true, planningPriority: 5, programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_half_marathon_base":
      sessions = {
        1: runDay({ type: "easy-run", label: "Easy Run", run: baseWeek?.mon || { t: "Easy", d: "30-40 min" }, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: mobility reset after the run." }),
        3: runDay({ type: "hard-run", label: "Steady / Quality Run", run: baseWeek?.thu || { t: "Tempo", d: "20-30 min" }, nutri: NUTRITION_DAY_TYPES.runQuality, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: fueling reset and calf mobility." }),
        5: runDay({ type: "easy-run", label: "Easy Run + Strides", run: baseWeek?.fri || { t: "Easy", d: "25-35 min" }, keySession: true, planningPriority: 2, programLabel: labelPrefix, optionalSecondary: "Optional: 4-6 relaxed strides if recovery is good." }),
        6: runDay({ type: "long-run", label: "Long Run", run: baseWeek?.sat || { t: "Long", d: "45-65 min" }, nutri: NUTRITION_DAY_TYPES.runLong, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: 10 min walk and mobility cooldown." }),
        2: strengthDay({ label: "Strength Maintenance", strSess: "A", strengthDuration: "20-30 min supportive strength", prescribedExercises: buildFoundationStrengthB(equipmentProfile), optionalSecondary: "Optional: trunk and hip support so the run block stays stable.", optional: true, planningPriority: 5, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_marathon_base":
      sessions = {
        1: runDay({ type: "easy-run", label: "Easy Run", run: baseWeek?.mon || { t: "Easy", d: "35-45 min" }, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: mobility reset after the run." }),
        2: runDay({ type: "easy-run", label: "Aerobic Support Run", run: { t: "Easy", d: "25-35 min" }, keySession: true, planningPriority: 3, programLabel: labelPrefix, optionalSecondary: "Optional: short strength support if readiness is good." }),
        4: runDay({ type: "hard-run", label: "Steady / Aerobic Quality Run", run: baseWeek?.thu || { t: "Steady", d: "30-40 min" }, nutri: NUTRITION_DAY_TYPES.runQuality, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: fueling reset after the quality work." }),
        5: runDay({ type: "easy-run", label: "Easy Run", run: baseWeek?.fri || { t: "Easy", d: "30-40 min" }, keySession: true, planningPriority: 2, programLabel: labelPrefix, optionalSecondary: "Optional: mobility and calf reset." }),
        6: runDay({ type: "long-run", label: "Long Run", run: baseWeek?.sat || { t: "Long", d: "60-90 min" }, nutri: NUTRITION_DAY_TYPES.runLong, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: walk and refuel before the rest of the day." }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_hal_higdon_inspired_half":
      sessions = {
        1: runDay({ type: "easy-run", label: "Short Easy Run", run: baseWeek?.mon || { t: "Easy", d: "25-35 min" }, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: easy mobility finish." }),
        2: conditioningDay({ label: "Cross-Train", detail: "20-35 min low-impact cross-training or easy conditioning", optional: !strict, planningPriority: 4, programLabel: labelPrefix }),
        4: runDay({ type: "hard-run", label: "Steady / Quality Run", run: baseWeek?.thu || { t: "Tempo", d: "20-30 min" }, nutri: NUTRITION_DAY_TYPES.runQuality, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: fueling reset after the main set." }),
        5: runDay({ type: "easy-run", label: "Easy Run", run: baseWeek?.fri || { t: "Easy", d: "25-35 min" }, keySession: true, planningPriority: 2, programLabel: labelPrefix, optionalSecondary: "Optional: relaxed strides or mobility if recovery is good." }),
        6: runDay({ type: "long-run", label: "Long Run", run: baseWeek?.sat || { t: "Long", d: "45-70 min" }, nutri: NUTRITION_DAY_TYPES.runLong, keySession: true, planningPriority: 1, programLabel: labelPrefix, optionalSecondary: "Optional: walk cooldown and refuel." }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_hotel_gym_travel_build":
      sessions = {
        1: strengthDay({ label: "Hotel Density Strength A", strSess: "A", strengthDuration: "30-40 min compact density strength", prescribedExercises: buildTravelStrengthA(), optionalSecondary: "Optional: 5 min trunk finisher", keySession: true, planningPriority: 1, strengthTrackLabel: "Hotel gym", programLabel: labelPrefix }),
        3: conditioningDay({ label: "Treadmill / Travel Conditioning", detail: "18-28 min treadmill intervals, rower work, or brisk incline walking", keySession: true, planningPriority: 2, programLabel: labelPrefix }),
        5: strengthDay({ label: "Hotel Density Strength B", strSess: "B", strengthDuration: "30-40 min compact strength", prescribedExercises: buildTravelStrengthB(), keySession: true, planningPriority: 1, strengthTrackLabel: "Hotel gym", programLabel: labelPrefix }),
        6: conditioningDay({ label: "Optional Mobility / Easy Aerobic Reset", detail: "15-20 min mobility, walk, or easy aerobic reset", optional: true, planningPriority: 5, programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_busy_professional_3day_performance":
      sessions = {
        1: strengthDay({ label: "Full-Body Strength", strSess: "A", strengthDuration: "35-45 min full-body strength", prescribedExercises: buildFoundationStrengthA(equipmentProfile), keySession: true, planningPriority: 1, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        3: conditioningDay({ label: "Engine Work", detail: "20-30 min controlled conditioning or aerobic intervals", keySession: true, planningPriority: 2, programLabel: labelPrefix }),
        5: strengthDay({ label: "Performance Strength", strSess: "B", strengthDuration: "35-45 min full-body performance lifting", prescribedExercises: buildFoundationStrengthB(equipmentProfile), keySession: true, planningPriority: 1, strengthTrackLabel: equipmentProfile.isHotel ? "Hotel gym" : "Gym", programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    case "program_minimal_equipment_conditioning":
      sessions = {
        1: conditioningDay({ label: "Mixed Conditioning", detail: "20-30 min mixed conditioning or brisk interval circuit", keySession: true, planningPriority: 1, programLabel: labelPrefix }),
        3: strengthDay({ label: "Bodyweight / Single-Implement Strength", strSess: "A", strengthDuration: "25-35 min density strength", prescribedExercises: buildMinimalEquipmentStrength(), keySession: true, planningPriority: 2, strengthTrackLabel: "Minimal setup", programLabel: labelPrefix }),
        5: conditioningDay({ label: "Aerobic Conditioning", detail: "20-30 min aerobic conditioning, easy jog, or density circuit", keySession: true, planningPriority: 1, programLabel: labelPrefix }),
        6: conditioningDay({ label: "Optional Walk / Mobility", detail: "15-20 min easy walk, mobility, or trunk work", optional: true, planningPriority: 5, programLabel: labelPrefix }),
        0: restDay("Active Recovery"),
      };
      break;
    default:
      return null;
  }

  return runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.adapted
    ? applyAvailabilityTrim({ sessions, availableDaysPerWeek })
    : sessions;
};

const renameSession = (session = null, nextLabel = "") => (
  !session ? session : { ...session, label: sanitizeText(nextLabel, 120) || session.label }
);

const withOptionalSecondary = (session = null, line = "") => (
  !session ? session : { ...session, optionalSecondary: sanitizeText(line, 160) || session.optionalSecondary || "" }
);

const withStyleNote = (session = null, note = "") => (
  !session ? session : { ...session, styleBiasNote: sanitizeText(note, 180) || session.styleBiasNote || "" }
);

const applyProgramAsStyleInfluence = ({
  sessionsByDay = {},
  programDefinition = null,
} = {}) => {
  const next = cloneValue(sessionsByDay || {});
  if (!programDefinition?.id) return next;
  if (["program_half_marathon_base", "program_marathon_base", "program_hal_higdon_inspired_half"].includes(programDefinition.id)) {
    const swapKey = Object.keys(next).find((dayKey) => next[dayKey]?.type === "conditioning") || Object.keys(next).find((dayKey) => isStrengthType(next[dayKey]?.type));
    if (swapKey) {
      next[swapKey] = runDay({
        type: "easy-run",
        label: "Support Run",
        run: { t: "Easy", d: "20-30 min" },
        planningPriority: 3,
        programLabel: `${programDefinition.displayName} style`,
      });
    }
  }
  if (programDefinition.id === "program_powerbuilding_builder") {
    Object.keys(next).forEach((dayKey) => {
      if (isStrengthType(next[dayKey]?.type)) {
        next[dayKey] = withOptionalSecondary(next[dayKey], "Optional: top set + backoff feel on the first main lift.");
      }
    });
  }
  if (["program_hotel_gym_travel_build", "program_minimal_equipment_conditioning"].includes(programDefinition.id)) {
    Object.keys(next).forEach((dayKey) => {
      if (isStrengthType(next[dayKey]?.type)) {
        next[dayKey] = {
          ...next[dayKey],
          strengthDuration: "25-35 min compact work",
          strengthDose: "25-35 min compact work",
          strengthTrackLabel: "Travel / minimal setup",
        };
      }
      if (next[dayKey]?.type === "conditioning") {
        next[dayKey] = renameSession(next[dayKey], "Compact Conditioning");
      }
    });
  }
  return next;
};

const applyStyleOverlayToSessions = ({
  sessionsByDay = {},
  styleDefinition = null,
  activeGoalTypes = [],
} = {}) => {
  const next = cloneValue(sessionsByDay || {});
  if (!styleDefinition?.id) return next;
  const hasRunningGoal = activeGoalTypes.includes("running");

  switch (styleDefinition.id) {
    case "style_athletic_recomp":
      Object.keys(next).forEach((dayKey) => {
        if (isStrengthType(next[dayKey]?.type)) {
          next[dayKey] = withOptionalSecondary(next[dayKey], "Optional: loaded carry + trunk finisher to keep the week athletic.");
        }
        if (next[dayKey]?.type === "conditioning") {
          next[dayKey] = renameSession(next[dayKey], "Athletic Conditioning");
        }
      });
      break;
    case "style_golden_era_hypertrophy":
      Object.keys(next).forEach((dayKey) => {
        if (isStrengthType(next[dayKey]?.type)) {
          next[dayKey] = withOptionalSecondary(renameSession(next[dayKey], `${next[dayKey]?.label || "Strength"} + Shape Work`), "Optional: shoulder and arm finisher for shape and symmetry.");
        }
      });
      if (!hasRunningGoal) {
        const conditioningKey = Object.keys(next).find((dayKey) => next[dayKey]?.type === "conditioning");
        if (conditioningKey) {
          next[conditioningKey] = strengthDay({
            label: "Upper-Body Shape Work",
            strSess: "B",
            strengthDuration: "30-40 min higher-rep hypertrophy",
            prescribedExercises: buildPowerbuildingUpperHypertrophy({ hasBench: true }),
            planningPriority: 3,
            strengthTrackLabel: "Gym",
            programLabel: styleDefinition.displayName,
          });
        }
      }
      break;
    case "style_powerbuilding_bias":
      Object.keys(next).forEach((dayKey) => {
        if (isStrengthType(next[dayKey]?.type)) {
          next[dayKey] = withOptionalSecondary(next[dayKey], "Optional: top set + backoff feel on the first main lift.");
        }
      });
      if (!hasRunningGoal) {
        const conditioningKey = Object.keys(next).find((dayKey) => next[dayKey]?.type === "conditioning");
        if (conditioningKey) {
          next[conditioningKey] = strengthDay({
            label: "Upper Push / Pull Strength",
            strSess: "A",
            strengthDuration: "30-40 min pressing and pulling",
            prescribedExercises: buildPowerbuildingUpperStrength({ hasBench: true }),
            planningPriority: 3,
            strengthTrackLabel: "Gym",
            programLabel: styleDefinition.displayName,
          });
        }
      }
      break;
    case "style_marathoner_bias":
      Object.keys(next).forEach((dayKey) => {
        if (isStrengthType(next[dayKey]?.type)) {
          next[dayKey] = withStyleNote(renameSession(next[dayKey], "Support Strength"), "Keep strength supportive so endurance rhythm stays cleaner.");
        }
      });
      if (!hasRunningGoal) {
        const swapKey = Object.keys(next).find((dayKey) => next[dayKey]?.type === "conditioning");
        if (swapKey) {
          next[swapKey] = runDay({
            type: "easy-run",
            label: "Aerobic Support Run",
            run: { t: "Easy", d: "20-30 min zone-2" },
            planningPriority: 2,
            programLabel: styleDefinition.displayName,
          });
        }
      }
      break;
    case "style_fight_camp_lean":
      Object.keys(next).forEach((dayKey) => {
        if (isStrengthType(next[dayKey]?.type)) {
          next[dayKey] = {
            ...next[dayKey],
            strengthDuration: "25-35 min density strength",
            strengthDose: "25-35 min density strength",
            optionalSecondary: "Optional: 6-8 min trunk and conditioning finisher",
          };
        }
        if (next[dayKey]?.type === "conditioning") {
          next[dayKey] = withStyleNote(renameSession(next[dayKey], "Fight-Camp Conditioning"), "Stay sharp and repeatable rather than turning this into random punishment.");
        }
      });
      break;
    case "style_hotel_gym_travel_mode":
      Object.keys(next).forEach((dayKey) => {
        if (isStrengthType(next[dayKey]?.type)) {
          next[dayKey] = {
            ...next[dayKey],
            label: next[dayKey]?.label?.includes("Compact") ? next[dayKey].label : `Compact ${next[dayKey]?.label || "Strength"}`,
            strengthDuration: "25-35 min compact work",
            strengthDose: "25-35 min compact work",
            strengthTrackLabel: "Travel / hotel gym",
          };
        }
        if (next[dayKey]?.type === "conditioning") {
          next[dayKey] = renameSession(next[dayKey], "Compact Conditioning");
        }
      });
      break;
    default:
      break;
  }

  return next;
};

const mapProgramArchitecture = ({
  programDefinition = null,
  defaultArchitecture = "hybrid_performance",
} = {}) => {
  if (!programDefinition?.id) return defaultArchitecture;
  if (["program_half_marathon_base", "program_marathon_base", "program_hal_higdon_inspired_half"].includes(programDefinition.id)) return "race_prep_dominant";
  if (["program_strength_foundation", "program_powerbuilding_builder"].includes(programDefinition.id)) return "strength_dominant";
  if (["program_hotel_gym_travel_build", "program_busy_professional_3day_performance", "program_foundation_training"].includes(programDefinition.id)) return "hybrid_performance";
  if (programDefinition.id === "program_minimal_equipment_conditioning") return "body_comp_conditioning";
  return defaultArchitecture;
};

const countPlannedSessions = (sessionsByDay = {}) => Object.values(sessionsByDay || {}).filter((session) => session && session.type !== "rest" && !session.optional).length;

const inferCompletedCountForWindow = ({
  logs = {},
  startDate = "",
  endDate = "",
} = {}) => (
  Object.entries(logs || {}).filter(([dateKey, entry]) => {
    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    return isCompletedStatus(entry?.checkin?.status) || Number(entry?.miles || 0) > 0 || sanitizeText(entry?.type || "", 80).length > 0;
  }).length
);

const inferTypeHitsForWindow = ({
  logs = {},
  startDate = "",
  endDate = "",
} = {}) => {
  const entries = Object.entries(logs || {}).filter(([dateKey]) => {
    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    return true;
  });
  return {
    run: entries.some(([, entry]) => /run|tempo|interval|long/i.test(String(entry?.type || "")) || Number(entry?.miles || 0) >= 3),
    strength: entries.some(([, entry]) => /strength|bench|press|squat|deadlift|pull/i.test(String(entry?.type || ""))),
  };
};

export const deriveProgramAdherenceState = ({
  activeProgramInstance = null,
  programDefinition = null,
  logs = {},
  plannedDayRecords = {},
  planWeekRecords = {},
} = {}) => {
  if (!activeProgramInstance?.programDefinitionId || !programDefinition?.id) return null;
  const committedWeeks = listCommittedPlanWeekRecords(planWeekRecords)
    .filter((entry) => entry?.record?.planningBasis?.activeProgramId === programDefinition.id || !entry?.record?.planningBasis)
    .slice(0, 3);
  if (!committedWeeks.length) {
    return {
      state: "forming",
      score: 0.5,
      adherenceRatio: null,
      modifiedRatio: 0,
      summary: "Program adherence is still forming because there is not enough committed week history yet.",
      keySessionMisses: [],
      modifiedDays: 0,
    };
  }

  let plannedSessions = 0;
  let completedSessions = 0;
  let modifiedDays = 0;
  let missedRunBackbone = 0;
  let missedStrengthBackbone = 0;

  committedWeeks.forEach((entry) => {
    const record = entry?.record || null;
    const sessions = record?.sessionsByDay || {};
    plannedSessions += countPlannedSessions(sessions);
    completedSessions += inferCompletedCountForWindow({ logs, startDate: entry?.startDate || "", endDate: entry?.endDate || "" });
    const typeHits = inferTypeHitsForWindow({ logs, startDate: entry?.startDate || "", endDate: entry?.endDate || "" });
    if (Object.values(sessions).some((session) => session?.keySession && isRunType(session?.type)) && !typeHits.run) missedRunBackbone += 1;
    if (Object.values(sessions).some((session) => session?.keySession && isStrengthType(session?.type)) && !typeHits.strength) missedStrengthBackbone += 1;
    Object.entries(plannedDayRecords || {}).forEach(([dateKey, historyEntry]) => {
      if (entry?.startDate && dateKey < entry.startDate) return;
      if (entry?.endDate && dateKey > entry.endDate) return;
      const currentRecord = getCurrentPrescribedDayRecord(historyEntry);
      if (currentRecord?.decision?.modifiedFromBase || currentRecord?.flags?.isModified) modifiedDays += 1;
    });
  });

  const adherenceRatio = plannedSessions > 0 ? Math.max(0, Math.min(1.25, completedSessions / plannedSessions)) : null;
  const modifiedRatio = plannedSessions > 0 ? Math.max(0, modifiedDays / plannedSessions) : 0;
  const runtimeFidelityMode = toRuntimeFidelityMode(activeProgramInstance?.fidelityMode);
  const keySessionMisses = [];
  if (missedRunBackbone > 0) keySessionMisses.push("run backbone");
  if (missedStrengthBackbone > 0) keySessionMisses.push("strength backbone");

  let state = "aligned";
  if (adherenceRatio == null) state = "forming";
  else if (runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict) {
    if (adherenceRatio < 0.6 || keySessionMisses.length >= 1) state = "off_program";
    else if (adherenceRatio < 0.85 || modifiedRatio > 0.25) state = "drifting";
  } else if (runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.adapted) {
    if (adherenceRatio < 0.5) state = "off_program";
    else if (adherenceRatio < 0.75 || modifiedRatio > 0.35) state = "drifting";
  } else {
    if (adherenceRatio < 0.45) state = "off_program";
    else if (adherenceRatio < 0.7) state = "drifting";
  }

  const summary = state === "aligned"
    ? runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict
      ? "Your recent training still matches the written plan closely."
      : "This plan is still showing up clearly in your real training."
    : state === "drifting"
    ? runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict
      ? "Your recent training is starting to drift from the written plan, so FORMA is simplifying the next steps."
      : "Your recent training is drifting enough that the next week needs to stay simpler."
    : runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict
    ? "Your recent training has moved far enough from the written plan that it no longer fits as-is."
    : "Your recent training has moved far enough from the current plan that the next week needs a simpler reset.";

  return {
    state,
    score: state === "aligned" ? 0.9 : state === "drifting" ? 0.62 : state === "forming" ? 0.5 : 0.35,
    adherenceRatio,
    modifiedRatio,
    summary,
    keySessionMisses,
    modifiedDays,
  };
};

const buildRuntimePlanBasisExplanation = ({
  athleteProfile = null,
  activeProgramInstance = null,
  activeStyleSelection = null,
  programDefinition = null,
  styleDefinition = null,
  programCompatibility = null,
  styleCompatibility = null,
  basisMode = "default_goal_driven",
  runtimeFidelityMode = PROGRAM_RUNTIME_FIDELITY.adapted,
  fidelityStatus = PROGRAM_FIDELITY_STATUS.asRequested,
  adherence = null,
  compromiseLine = "",
} = {}) => {
  const base = buildPlanBasisExplanation({
    athleteProfile,
    activeProgramInstance,
    activeStyleSelection,
    programDefinition,
    styleDefinition,
    compatibilityAssessment: programCompatibility || styleCompatibility || null,
  }) || {};
  const programName = programDefinition?.displayName || "";
  const styleName = styleDefinition?.displayName || "";
  const fidelityLabel = formatRuntimeFidelityLabel(runtimeFidelityMode);
  const sourceBasisLabel = PROGRAM_SOURCE_BASIS_LABELS[programDefinition?.sourceBasis || styleDefinition?.sourceBasis || "evidence_informed_default"] || "Built for your goals";
  const sourceConfidenceLabel = SOURCE_CONFIDENCE_LABELS[programDefinition?.sourceConfidence || styleDefinition?.sourceConfidence || "high"] || "Well supported";

  if (basisMode === "program_suspended_fallback" && programDefinition) {
    return {
      ...base,
      basisType: "program_suspended_fallback",
      basisSummary: `${programName} is selected, but FORMA is not running it literally right now.`,
      personalizationSummary: `${compromiseLine || "Current safety or setup realities make the template a poor fit, so this week shifts back to FORMA's built-for-you plan."} ${adherence?.summary || ""}`.trim(),
      caveats: uniqueStrings([compromiseLine, ...(programCompatibility?.blockedConstraints || []), adherence?.summary]),
      sourceBasisLabel,
      sourceConfidenceLabel,
      requestedFidelityMode: activeProgramInstance?.fidelityMode || "",
      effectiveFidelityMode: runtimeFidelityMode,
      fidelityStatus,
      todayLine: `${programName} is selected, but today's session is coming from FORMA's built-for-you plan while it respects your current constraints.`,
      coachLine: `${programName} is on hold as a literal template right now. FORMA is using a safer built-for-you week until the blocking constraint changes.`,
      compromiseSummary: compromiseLine || "",
      adherenceSummary: adherence?.summary || "",
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    ...base,
    sourceBasisLabel,
    sourceConfidenceLabel,
    requestedFidelityMode: activeProgramInstance?.fidelityMode || "",
    effectiveFidelityMode: runtimeFidelityMode,
    fidelityStatus,
    caveats: uniqueStrings([
      ...(base?.caveats || []),
      compromiseLine,
      fidelityStatus === PROGRAM_FIDELITY_STATUS.downgradedForDrift ? "FORMA shifted this plan into a simpler fit because your recent training drifted too far from the written version." : "",
      fidelityStatus === PROGRAM_FIDELITY_STATUS.downgradedForConstraints ? "FORMA shifted this plan into a simpler fit because your current setup needs visible adjustments." : "",
    ]),
    personalizationSummary: uniqueStrings([
      base?.personalizationSummary || "",
      programDefinition?.id ? `${programName} is active in ${fidelityLabel} mode.` : "",
      activeStyleSelection?.styleDefinitionId ? `${styleName} is shaping the feel of the week.` : "",
      adherence?.summary || "",
      compromiseLine,
    ]).join(" "),
    todayLine: basisMode === "goal_driven_with_style"
      ? `${styleName} is shaping today's session, but your priority order and live constraints still lead the plan.`
      : basisMode === "program_plus_style"
      ? `Today's session comes from ${programName} in ${fidelityLabel} mode, with ${styleName} shaping the feel around the edges.`
      : basisMode === "program_used_as_style"
      ? `${programName} is shaping today's session as a directional influence rather than a literal template.`
      : programDefinition?.id
      ? `Today's session comes from ${programName} in ${fidelityLabel} mode.${compromiseLine ? ` ${compromiseLine}` : ""}`
      : `${base?.basisSummary || "Today's session comes from FORMA's built-for-you planning."}`,
    coachLine: basisMode === "program_plus_style"
      ? `The plan is anchored to ${programName}, while ${styleName} shapes exercise feel and weekly tone. Safety and real-life constraints still come first.`
      : basisMode === "goal_driven_with_style"
      ? `${styleName} is shaping the built-for-you plan, but it never overrides your top priority or safety rules.`
      : basisMode === "program_used_as_style"
      ? `${programName} is being used for feel only, so FORMA borrows the direction without pretending to run the full template.`
      : programDefinition?.id
      ? `${programName} is the main plan right now. The week is running in ${fidelityLabel} mode, and any necessary changes are explained clearly.`
      : base?.basisSummary || "The plan is currently coming from FORMA's built-for-you approach.",
    compromiseSummary: compromiseLine || "",
    adherenceSummary: adherence?.summary || "",
    lastUpdatedAt: new Date().toISOString(),
  };
};

export const deriveLiveProgramPlanningBasis = ({
  personalization = {},
  goals = [],
  athleteProfile = null,
  defaultArchitecture = "hybrid_performance",
  baseWeek = {},
  logs = {},
  plannedDayRecords = {},
  planWeekRecords = {},
} = {}) => {
  const resolvedAthleteProfile = resolveAthleteProfile({ personalization, goals, athleteProfile });
  const programsState = normalizeProgramsSelectionState(personalization?.programs || createDefaultProgramSelectionState());
  const activeProgramInstance = programsState?.activeProgramInstance || null;
  const activeStyleSelection = programsState?.activeStyleSelection || null;
  const programDefinition = getProgramDefinitionById(activeProgramInstance?.programDefinitionId || "");
  const styleDefinition = getStyleDefinitionById(activeStyleSelection?.styleDefinitionId || "");
  const availableDaysPerWeek = Number(resolvedAthleteProfile?.userProfile?.daysPerWeek || 0) || 0;
  const equipmentProfile = buildEquipmentProfile(resolvedAthleteProfile, personalization);
  const activeGoalTypes = uniqueStrings((Array.isArray(goals) ? goals : []).filter((goal) => goal?.active !== false).map((goal) => String(goal?.resolvedGoal?.planningCategory || goal?.category || "").trim().toLowerCase()));
  const programCompatibility = programDefinition ? assessProgramCompatibility({ programDefinition, athleteProfile: resolvedAthleteProfile, personalization, goals, fidelityMode: activeProgramInstance?.fidelityMode || PROGRAM_FIDELITY_MODES.adaptToMe }) : null;
  const styleCompatibility = styleDefinition ? assessStyleCompatibility({ styleDefinition, programDefinition, athleteProfile: resolvedAthleteProfile, goals, activeProgramInstance }) : null;
  const adherence = deriveProgramAdherenceState({ activeProgramInstance, programDefinition, logs, plannedDayRecords, planWeekRecords });
  const requestedRuntimeFidelityMode = toRuntimeFidelityMode(activeProgramInstance?.fidelityMode || PROGRAM_FIDELITY_MODES.adaptToMe);

  let effectiveRuntimeFidelityMode = requestedRuntimeFidelityMode;
  let fidelityStatus = PROGRAM_FIDELITY_STATUS.asRequested;
  let basisMode = "default_goal_driven";
  let compromiseLine = "";
  let usesProgramBackbone = false;

  if (programDefinition?.id) {
    if (requestedRuntimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.styleOnly) {
      basisMode = "program_used_as_style";
    } else if (programCompatibility?.outcome === COMPATIBILITY_OUTCOMES.incompatible) {
      const canDowngradeForSchedule = Boolean(programCompatibility?.scheduleMismatch) && availableDaysPerWeek >= Number(programDefinition?.adaptationPolicy?.minSessionsForAdapted || 0);
      const canDowngradeForEquipment = Boolean(programCompatibility?.equipmentMismatch) && String(programDefinition?.adaptationPolicy?.equipmentFlexibility || "medium") !== "low";
      if (requestedRuntimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict && (canDowngradeForSchedule || canDowngradeForEquipment)) {
        effectiveRuntimeFidelityMode = PROGRAM_RUNTIME_FIDELITY.adapted;
        fidelityStatus = PROGRAM_FIDELITY_STATUS.downgradedForConstraints;
        basisMode = "program_backbone";
        usesProgramBackbone = true;
        compromiseLine = programCompatibility?.reasons?.[0] || programCompatibility?.blockedConstraints?.[0] || "The written template needs visible adaptation to fit your current reality.";
      } else {
        basisMode = "program_suspended_fallback";
        fidelityStatus = PROGRAM_FIDELITY_STATUS.suspended;
        compromiseLine = programCompatibility?.blockedConstraints?.[0] || programCompatibility?.reasons?.[0] || "The current setup is not a clean literal fit for this program.";
      }
    } else {
      basisMode = "program_backbone";
      usesProgramBackbone = true;
    }
  }

  if (usesProgramBackbone && requestedRuntimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict && adherence?.state === "off_program") {
    effectiveRuntimeFidelityMode = PROGRAM_RUNTIME_FIDELITY.adapted;
    fidelityStatus = PROGRAM_FIDELITY_STATUS.downgradedForDrift;
    compromiseLine = adherence?.summary || "Your recent training drifted too far from the written plan to keep following it closely.";
  }

  let architectureOverride = defaultArchitecture;
  let dayTemplates = null;
  if (usesProgramBackbone) {
    architectureOverride = mapProgramArchitecture({ programDefinition, defaultArchitecture });
    dayTemplates = buildProgramBackboneSessions({ programDefinition, runtimeFidelityMode: effectiveRuntimeFidelityMode, availableDaysPerWeek, baseWeek, equipmentProfile });
  }

  if (basisMode === "default_goal_driven" && styleDefinition?.id) basisMode = "goal_driven_with_style";
  if (usesProgramBackbone && styleDefinition?.id && styleCompatibility?.outcome !== COMPATIBILITY_OUTCOMES.incompatible) basisMode = "program_plus_style";

  const styleOverlay = styleDefinition?.id && styleCompatibility?.outcome !== COMPATIBILITY_OUTCOMES.incompatible
    ? resolveStyleOverlayImpact({ styleDefinition, influenceLevel: activeStyleSelection?.influenceLevel || "standard", programDefinition })
    : null;

  const planningBasis = {
    precedence: [...PLANNING_PRECEDENCE_STACK],
    activeProgramId: programDefinition?.id || "",
    activeProgramName: programDefinition?.displayName || "",
    activeStyleId: styleDefinition?.id || "",
    activeStyleName: styleDefinition?.displayName || "",
    basisMode,
    requestedRuntimeFidelityMode,
    effectiveRuntimeFidelityMode,
    fidelityStatus,
    compatibility: cloneValue(programCompatibility || null),
    styleCompatibility: cloneValue(styleCompatibility || null),
    adherence: cloneValue(adherence || null),
    sourceBasis: programDefinition?.sourceBasis || styleDefinition?.sourceBasis || "evidence_informed_default",
    sourceConfidence: programDefinition?.sourceConfidence || styleDefinition?.sourceConfidence || "high",
    hardRules: uniqueStrings([...(programDefinition?.progressionModel?.hardRules || []), ...(programDefinition?.adaptationPolicy?.hardRules || []), "Safety, injury, equipment, and schedule rules still win first."]),
    softRules: uniqueStrings([...(programDefinition?.progressionModel?.softPreferences || []), ...(programDefinition?.adaptationPolicy?.softPreferences || [])]),
    styleBiases: styleOverlay ? cloneValue(styleOverlay.adaptableElements || []) : [],
    compromiseLine,
    drivers: uniqueStrings([programDefinition?.displayName || "", styleDefinition?.displayName || "", compromiseLine, adherence?.summary || "", programCompatibility?.reasons?.[0] || "", styleCompatibility?.reasons?.[0] || ""]),
  };
  if (usesProgramBackbone && dayTemplates) {
    planningBasis.expectedSessionsPerWeek = countPlannedSessions(dayTemplates);
    planningBasis.architectureOverride = architectureOverride;
    planningBasis.programSessionTypes = uniqueStrings(Object.values(dayTemplates).map((session) => session?.type || ""));
  }

  const runtimeExplanation = buildRuntimePlanBasisExplanation({
    athleteProfile: resolvedAthleteProfile,
    activeProgramInstance,
    activeStyleSelection,
    programDefinition,
    styleDefinition,
    programCompatibility,
    styleCompatibility,
    basisMode,
    runtimeFidelityMode: effectiveRuntimeFidelityMode,
    fidelityStatus,
    adherence,
    compromiseLine,
  });
  planningBasis.planBasisExplanation = runtimeExplanation;
  planningBasis.todayLine = runtimeExplanation?.todayLine || "";
  planningBasis.coachLine = runtimeExplanation?.coachLine || "";

  return {
    planningBasis,
    activeProgramInstance,
    activeStyleSelection,
    programDefinition,
    styleDefinition,
    architectureOverride,
    usesProgramBackbone,
    runtimeFidelityMode: effectiveRuntimeFidelityMode,
    styleOverlay,
    dayTemplates,
    applyToSessions: (sessions = {}) => {
      let nextSessions = cloneValue(sessions || {});
      if (programDefinition?.id && requestedRuntimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.styleOnly) {
        nextSessions = applyProgramAsStyleInfluence({ sessionsByDay: nextSessions, programDefinition });
      }
      if (styleDefinition?.id && styleCompatibility?.outcome !== COMPATIBILITY_OUTCOMES.incompatible) {
        nextSessions = applyStyleOverlayToSessions({ sessionsByDay: nextSessions, styleDefinition, activeGoalTypes });
      }
      return nextSessions;
    },
  };
};
