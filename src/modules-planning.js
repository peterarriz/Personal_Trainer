import {
 deriveCanonicalAthleteState as deriveCanonicalGoalProfileState,
 daysUntil,
 getActiveTimeBoundGoal,
 getGoalBuckets,
 inferGoalType,
 normalizeGoalObject,
 normalizeGoals,
} from "./services/canonical-athlete-service.js";
import {
 buildLegacyProvenanceAdjustmentView,
 buildProvenanceEvent,
 buildStructuredProvenance,
 PROVENANCE_ACTORS,
} from "./services/provenance-service.js";
import {
 buildCanonicalSupplementPlan,
 buildRecoveryPrescription,
 normalizeActualRecoveryLog,
 deriveSupplementActual,
} from "./services/recovery-supplement-service.js";
import { assessGoalFeasibility } from "./services/goal-feasibility-service.js";
import {
 deriveActiveIssueContextFromPersonalization,
 deriveTrainingContextFromPersonalization,
 normalizeTrainingWeekdayAvailability,
 TRAINING_WEEKDAY_OPTIONS,
 TRAINING_EQUIPMENT_VALUES,
 TRAINING_INTENSITY_VALUES,
 TRAINING_SESSION_DURATION_VALUES,
} from "./services/training-context-service.js";
import { buildDynamicAdaptationState } from "./services/dynamic-adaptation-service.js";
import {
 applyPreferencePolicyToDayTemplates,
 buildDomainSpecificDayTemplates,
 selectDomainAdapter,
} from "./services/domain-adapter-service.js";
import {
 buildPreferenceEffectLine,
 resolveTrainingPreferencePolicy,
} from "./services/planning-effect-matrix-service.js";
import {
 deriveLiveProgramPlanningBasis,
 PROGRAM_RUNTIME_FIDELITY,
 buildEquipmentProfile,
 buildExercise,
 buildFoundationStrengthA,
 buildFoundationStrengthB,
 buildStrengthFoundationA,
 buildStrengthFoundationB,
 buildPowerbuildingLowerStrength,
 buildPowerbuildingUpperStrength,
 buildPowerbuildingLowerHypertrophy,
 buildPowerbuildingUpperHypertrophy,
 buildTravelStrengthA,
 buildTravelStrengthB,
 buildMinimalEquipmentStrength,
} from "./services/program-live-planning-service.js";
import {
 applyPlanningBaselineInfluence,
 buildPlanningBaselineInfluence,
} from "./services/metrics-baselines-service.js";
import { buildSupportTierModel } from "./services/support-tier-service.js";
import {
 NUTRITION_DAY_TYPES,
} from "./services/nutrition-day-taxonomy-service.js";
import { buildPlanArchetypeOverlay } from "./services/plan-generation/archetype-plan-generation-service.js";
import {
  auditPlanArchetypeContract,
  enforcePlanArchetypeContract,
  resolvePlanArchetypeContract,
} from "./services/plan-archetype-contract-service.js";
import {
  ADAPTIVE_POLICY_DECISION_POINTS,
  scoreAdaptiveDecision,
} from "./services/adaptive-policy-service.js";
import {
  resolveAdaptiveLearningScaffolding,
} from "./services/adaptive-learning-scaffolding-service.js";
import {
  buildHybridAdaptiveContext,
} from "./services/hybrid-adaptive-service.js";
import {
  buildGoalSupportPlanningContext,
} from "./services/goal-support-planning-service.js";
import {
  applyExercisePreferenceRows,
  buildHabitAdaptationContext,
} from "./services/habit-adaptation-service.js";
import {
  buildExerciseTransferProfile,
} from "./services/exercise-transfer-profile-service.js";
import { dedupeStrings } from "./utils/collection-utils.js";

export { daysUntil, deriveCanonicalGoalProfileState, getActiveTimeBoundGoal, getGoalBuckets, inferGoalType, normalizeGoalObject, normalizeGoals };

export const DEFAULT_PLANNING_HORIZON_WEEKS = 12;
export const RECOVERY_BLOCK_WEEKS = 2;
export const PROGRAM_BLOCK_MODEL_VERSION = 1;

const clonePlainValue = (value) => {
 if (value == null) return value;
 try {
 return JSON.parse(JSON.stringify(value));
 } catch {
 return value;
 }
};

const normalizeTrainingSignature = (day = {}) => JSON.stringify({
 type: day?.type || "",
 label: day?.label || "",
 runType: day?.run?.t || "",
 runDuration: day?.run?.d || "",
 swimFocus: day?.swim?.focus || "",
 swimDuration: day?.swim?.d || "",
 powerFocus: day?.power?.focus || "",
 powerDose: day?.power?.dose || "",
 strSess: day?.strSess || "",
 strengthTrack: day?.strengthTrack || "",
 strengthDuration: day?.strengthDuration || "",
 strengthDose: day?.strengthDose || "",
 nutri: day?.nutri || "",
 optionalSecondary: day?.optionalSecondary || "",
 minDay: Boolean(day?.minDay),
 readinessState: day?.readinessState || "",
});

const buildPlanDaySummary = (drivers = [], modifiedFromBase = false) => {
 const uniqueDrivers = dedupeStrings(drivers).slice(0, 3);
 if (!uniqueDrivers.length) {
 return modifiedFromBase
 ? "Today has been adjusted to fit your recent needs."
 : "Today follows the plan.";
 }
 if (!modifiedFromBase) {
 return `Today reflects ${uniqueDrivers.join(", ")}.`;
 }
 return `Today has been adjusted for ${uniqueDrivers.join(", ")}.`;
};

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const isRunSessionType = (value = "") => ["run+strength", "easy-run", "hard-run", "long-run"].includes(String(value || "").toLowerCase());
const resolvePlannedSessionKind = (plannedSession = null) => {
 const type = String(plannedSession?.type || "").toLowerCase();
 if (!type) return "";
 if (type === "rest" || type === "recovery") return "recovery";
 if (type === "run+strength") return "cardio";
 if (/^swim/.test(type)) return "cardio";
 if (["power-skill", "reactive-plyo", "sprint-support"].includes(type)) return "strength";
 if (/strength/.test(type)) return "strength";
 if (/run|conditioning|otf/.test(type)) return "cardio";
 return "";
};
const buildConditioningSession = ({
  label = "Conditioning",
  detail = "20-30 min zone-2 bike, rower, incline walk, or circuit",
  nutri = NUTRITION_DAY_TYPES.conditioningMixed,
  lowImpact = false,
} = {}) => ({
 type: "conditioning",
 label,
 nutri,
 fallback: detail,
  intensityGuidance: lowImpact ? "easy aerobic only" : "controlled aerobic conditioning",
  environmentNote: lowImpact ? "Use any low-impact aerobic setup available." : "",
});

const GOAL_ROLE_ORDER = Object.freeze({
 primary: 4,
 maintained: 3,
 background: 2,
 deferred: 1,
});

const resolvePlanningGoalRole = (goal = null, index = 0) => {
 const explicitRole = sanitizeText(
  goal?.intakeConfirmedRole
   || goal?.goalArbitrationRole
   || goal?.goalRole
   || goal?.resolvedGoal?.intakeConfirmedRole
   || goal?.resolvedGoal?.goalArbitrationRole
   || "",
  40
 ).toLowerCase();
 if (GOAL_ROLE_ORDER[explicitRole]) return explicitRole;
 if (index === 0) return "primary";
 if (index === 1) return "maintained";
 if (index === 2) return "background";
 return "deferred";
};

const normalizePlanningLaneCategory = (goal = null) => {
 const category = sanitizeText(
  goal?.category
   || goal?.resolvedGoal?.planningCategory
   || goal?.resolvedGoal?.goalFamily
   || "",
  60
 ).toLowerCase();
 if (["body_comp", "fat_loss", "appearance", "physique"].includes(category)) return "body_comp";
 if (["strength", "muscle_gain"].includes(category)) return "strength";
 if (["running", "run", "endurance"].includes(category)) return "running";
 return category || "general_fitness";
};

const resolvePlanningLaneDescriptors = (goal = null, index = 0) => {
 const primaryCategory = normalizePlanningLaneCategory(goal);
 const resolvedGoal = goal?.resolvedGoal || null;
 const defaultRole = resolvePlanningGoalRole(goal, index);
 const goalFamily = sanitizeText(
  resolvedGoal?.goalFamily
   || resolvedGoal?.planArchetypeFamily
   || goal?.goalFamily
   || "",
  40
 ).toLowerCase();
 const archetypeId = sanitizeText(resolvedGoal?.planArchetypeId || "", 80).toLowerCase();
 const primaryDomain = sanitizeText(resolvedGoal?.primaryDomain || "", 80).toLowerCase();
 const hybridMultiDomain = primaryDomain === "hybrid_multi_domain";
 const descriptors = primaryCategory ? [{ category: primaryCategory, role: defaultRole }] : [];
 const upsertDescriptor = (category = "", role = defaultRole) => {
  if (!category) return;
  const existingIndex = descriptors.findIndex((entry) => entry.category === category);
  if (existingIndex < 0) {
   descriptors.push({ category, role });
   return;
  }
  const nextWeight = GOAL_ROLE_ORDER[role] || 0;
  const currentWeight = GOAL_ROLE_ORDER[descriptors[existingIndex]?.role] || 0;
  if (nextWeight > currentWeight) {
   descriptors[existingIndex] = { category, role };
  }
 };

 if (/run_lift_running_priority/.test(archetypeId)) {
  upsertDescriptor("running", defaultRole);
  upsertDescriptor("strength", defaultRole === "primary" ? "maintained" : defaultRole);
 } else if (/run_lift_strength_priority/.test(archetypeId)) {
  upsertDescriptor("strength", defaultRole);
  upsertDescriptor("running", defaultRole === "primary" ? "maintained" : defaultRole);
 } else if (/aesthetic_endurance/.test(archetypeId)) {
  upsertDescriptor("body_comp", defaultRole);
  upsertDescriptor("running", defaultRole === "primary" ? "maintained" : defaultRole);
  upsertDescriptor("strength", "background");
 } else if (/strength_conditioning_balanced/.test(archetypeId)) {
  upsertDescriptor(primaryCategory || "strength", defaultRole);
  upsertDescriptor(primaryCategory === "running" ? "strength" : "running", defaultRole === "primary" ? "maintained" : defaultRole);
 } else if (/sport_support/.test(archetypeId)) {
  upsertDescriptor("strength", defaultRole);
  upsertDescriptor("running", defaultRole === "primary" ? "maintained" : defaultRole);
 } else if (goalFamily === "hybrid" && hybridMultiDomain) {
  if (primaryCategory === "running") {
   upsertDescriptor("strength", defaultRole === "primary" ? "maintained" : defaultRole);
  } else if (primaryCategory === "strength") {
   upsertDescriptor("running", defaultRole === "primary" ? "maintained" : defaultRole);
  } else if (primaryCategory === "body_comp") {
   upsertDescriptor("running", defaultRole === "primary" ? "maintained" : defaultRole);
   upsertDescriptor("strength", "background");
  }
 }

 return descriptors;
};

const cloneExercises = (exercises = []) => clonePlainValue(exercises || []) || [];

const buildUniqueExerciseRows = (rows = [], maxRows = 4) => {
 const seen = new Set();
 return (Array.isArray(rows) ? rows : [])
  .filter(Boolean)
  .filter((row) => {
   const key = sanitizeText(row?.ex || "", 120).toLowerCase();
   if (!key) return false;
   if (seen.has(key)) return false;
   seen.add(key);
   return true;
  })
  .slice(0, maxRows);
};

const buildUpperSupportRow = ({
 driverId = "",
 equipmentProfile = {},
} = {}) => {
 const safeDriverId = sanitizeText(driverId, 80).toLowerCase();
 switch (safeDriverId) {
  case "upper_back_stability":
  case "lat_strength":
   return buildExercise(
    equipmentProfile.hasCable ? "Chest-supported row or cable row" : equipmentProfile.hasPullup ? "Pull-up or pull-down" : "One-arm DB row",
    "3-4 sets",
    "8-12 reps",
    "Stable pulling supports better pressing and upper-body positions."
   );
  case "scapular_control":
   return buildExercise("Face pull or band external rotation", "2-3 sets", "12-15 reps", "Keep the shoulder blade organized.");
  case "anterior_delt_strength":
   return buildExercise("Lateral raise or DB shoulder press", "3 sets", "10-15 reps", "Shoulders often unlock stuck pressing.");
  case "triceps_strength":
   return buildExercise(equipmentProfile.hasCable ? "Cable pressdown or skull crusher" : "DB triceps extension or close-grip push-up", "2-3 sets", "10-12 reps", "Support the lockout without turning the session into arm day.");
  case "pressing_hypertrophy":
   return buildExercise(equipmentProfile.hasBench ? "Incline bench or DB incline press" : "DB incline press", "3-4 sets", "8-12 reps", "Extra pressing tissue can support the main lift.");
  case "trunk_bracing":
  case "trunk_stiffness":
   return buildExercise("Loaded carry or hard plank", "2-3 sets", "30-45 sec", "Keep tension transfer honest.");
  case "shoulder_tolerance":
  case "shoulder_rotation_endurance":
   return buildExercise("Serratus wall slide or band external rotation", "2-3 sets", "10-15 reps", "Durable shoulders keep the lane trainable.");
  case "elbow_tolerance":
   return buildExercise("Light triceps extension or push-up support", "2 sets", "12-15 reps", "Keep the joints calm while volume stays productive.");
  default:
   return null;
 }
};

const buildLowerDurabilityRow = ({
 driverId = "",
 equipmentProfile = {},
} = {}) => {
 const safeDriverId = sanitizeText(driverId, 80).toLowerCase();
 switch (safeDriverId) {
  case "calf_soleus_capacity":
   return buildExercise("Standing calf raise or bent-knee calf raise", "3 sets", "10-15 reps", "Lower-leg support matters more than it looks.");
  case "ankle_stiffness":
   return buildExercise("Calf raise or heel drop", "2-3 sets", "10-15 reps", "Clean force transfer starts at the ankle.");
  case "single_leg_control":
  case "hip_stability":
   return buildExercise("Split squat or step-up", "2-3 sets", "8 reps/side", "Single-leg control supports durable running and balanced lifting.");
  case "hamstring_durability":
  case "posterior_chain_strength":
  case "hip_extension_support":
   return buildExercise(equipmentProfile.hasFullGym ? "Hamstring curl or Romanian deadlift" : "DB Romanian deadlift or bridge", "2-3 sets", "8-12 reps", "Posterior-chain support without junk fatigue.");
  case "trunk_stiffness":
  case "trunk_bracing":
   return buildExercise("Carry or trunk hold", "2-3 sets", "30-45 sec", "Organize the trunk before adding more fatigue.");
  case "lower_leg_tolerance":
  case "tendon_tolerance":
  case "impact_tolerance":
   return buildExercise("Heel drop or tib raise", "2-3 sets", "10-15 reps", "Tissue tolerance keeps the next run credible.");
  default:
   return null;
 }
};

const buildSwimDrylandRow = ({
 driverId = "",
 equipmentProfile = {},
} = {}) => {
 const safeDriverId = sanitizeText(driverId, 80).toLowerCase();
 switch (safeDriverId) {
  case "lat_strength":
   return buildExercise(equipmentProfile.hasCable ? "Straight-arm pull-down or swim-cord pull" : equipmentProfile.hasPullup ? "Pull-up or pull-down" : "One-arm row", "3-4 sets", "8-12 reps", "Tie dryland pulling back to the stroke.");
  case "scapular_control":
   return buildExercise("Face pull or serratus wall slide", "2-3 sets", "12-15 reps", "Keep the shoulder blade moving cleanly.");
  case "triceps_strength":
   return buildExercise(equipmentProfile.hasCable ? "Cable pressdown" : "Close-grip push-up", "2-3 sets", "10-12 reps", "Support the finish of the stroke.");
  case "trunk_stiffness":
   return buildExercise("Pallof press or hollow hold", "2-3 sets", "20-40 sec", "Keep the trunk connected to the pull.");
  case "shoulder_rotation_endurance":
  case "shoulder_tolerance":
   return buildExercise("Band external rotation or wall slide", "2-3 sets", "10-15 reps", "Shoulder durability protects swim consistency.");
  case "neck_upper_back_tolerance":
   return buildExercise("Prone Y/T raise or face pull", "2-3 sets", "10-15 reps", "Upper-back tolerance supports longer swim work.");
  case "hip_extension_support":
   return buildExercise("Glute bridge or kick-support hinge", "2-3 sets", "10-12 reps", "Hip support helps body line and kick mechanics.");
  default:
   return null;
 }
};

const buildBenchSupportPacketA = ({
 supportPlanningContext = null,
 equipmentProfile = {},
} = {}) => buildUniqueExerciseRows([
 buildExercise(equipmentProfile.hasBench ? "Bench press top set" : "DB bench press", "1 top set + 3 backoff sets", "4-6 reps", "Heavy press stays central."),
 buildExercise(equipmentProfile.hasCable || equipmentProfile.hasPullup ? "Weighted pull-up or pull-down" : "One-arm DB row", "4 sets", "6-8 reps", "Pair heavy pressing with strong pulling."),
 ...(supportPlanningContext?.strengthFocusDriverIds || []).map((driverId) => buildUpperSupportRow({ driverId, equipmentProfile })),
], 4);

const buildBenchSupportPacketB = ({
 supportPlanningContext = null,
 equipmentProfile = {},
} = {}) => buildUniqueExerciseRows([
 buildExercise(equipmentProfile.hasBench ? "Incline bench or DB incline press" : "DB incline press", "4 sets", "8-12 reps", "Pressing volume supports the main lift without grinding."),
 ...(supportPlanningContext?.strengthFocusDriverIds || []).map((driverId) => buildUpperSupportRow({ driverId, equipmentProfile })),
], 4);

const buildUpperMaintenancePacket = ({
 supportPlanningContext = null,
 equipmentProfile = {},
} = {}) => buildUniqueExerciseRows([
 buildExercise(equipmentProfile.hasBench ? "DB bench press or incline press" : "Push-up or DB press", "3 sets", "6-10 reps", "Keep the pressing pattern alive without overfilling the week."),
 ...(supportPlanningContext?.strengthFocusDriverIds || []).map((driverId) => buildUpperSupportRow({ driverId, equipmentProfile })),
], 4);

const buildLowerDurabilityPacket = ({
 supportPlanningContext = null,
 equipmentProfile = {},
} = {}) => buildUniqueExerciseRows([
 buildExercise("Split squat or step-up", "2-3 sets", "8 reps/side", "Single-leg control keeps the support work athletic."),
 ...(supportPlanningContext?.durabilityFocusDriverIds || []).map((driverId) => buildLowerDurabilityRow({ driverId, equipmentProfile })),
], 4);

const buildSwimDrylandPacket = ({
 supportPlanningContext = null,
 equipmentProfile = {},
} = {}) => buildUniqueExerciseRows([
 buildExercise(equipmentProfile.hasCable ? "Straight-arm pull-down or swim-cord pull" : equipmentProfile.hasPullup ? "Pull-up or pull-down" : "One-arm row", "3-4 sets", "8-12 reps", "Dryland pulling should still look like support for the stroke."),
 ...(supportPlanningContext?.swimDrylandFocusDriverIds || []).map((driverId) => buildSwimDrylandRow({ driverId, equipmentProfile })),
], 4);

const buildSessionExercisePacket = ({
 emphasis = "full_body_a",
 equipmentProfile = {},
} = {}) => {
 switch (String(emphasis || "").toLowerCase()) {
  case "bench_focus_a":
   return cloneExercises(buildPowerbuildingUpperStrength(equipmentProfile));
  case "bench_focus_b":
   return cloneExercises(buildPowerbuildingUpperHypertrophy(equipmentProfile));
  case "upper_maintenance":
   return [
    ...cloneExercises(buildPowerbuildingUpperStrength(equipmentProfile)).slice(0, 2),
    buildExercise("Lateral raise or face pull", "2-3 sets", "12-15 reps", "Keep shoulders and scap control fresh."),
    buildExercise("Triceps or curls", "2 sets", "10-15 reps", "Leave a little in reserve."),
   ];
  case "lower_support":
   return [
    buildExercise(equipmentProfile.hasFullGym ? "Squat variation" : "Goblet squat", "3 sets", "5-6 reps", "Controlled loading. Do not chase fatigue."),
    buildExercise(equipmentProfile.hasFullGym ? "Romanian deadlift" : "DB Romanian deadlift", "3 sets", "6-8 reps", "Posterior-chain support without frying the run lane."),
    buildExercise("Split squat or step-up", "2-3 sets", "8 reps/side", "Keep the dose athletic and repeatable."),
    buildExercise("Trunk or calf support", "2 sets", "30-45 sec / 10-15 reps", "Finish organized, not cooked."),
   ];
  case "strength_maintenance":
   return cloneExercises(buildFoundationStrengthB(equipmentProfile)).slice(0, 4);
  case "body_comp_a":
   return [
    buildExercise(equipmentProfile.hasFullGym ? "DB bench press" : "Push-up or DB bench press", "3 sets", "8-10 reps", "Quality reps, short rest."),
    buildExercise(equipmentProfile.hasFullGym ? "Squat variation" : "Goblet squat", "3 sets", "8-10 reps", "Repeatable effort."),
    buildExercise("Row or pull-down", "3 sets", "10-12 reps", "Keep pulling volume honest."),
    buildExercise("Carry or trunk finisher", "2-3 rounds", "30-45 sec", "Finish with posture and tension."),
   ];
  case "body_comp_b":
   return [
    buildExercise(equipmentProfile.hasFullGym ? "Romanian deadlift" : "DB hinge", "3 sets", "8 reps", "Posterior-chain support."),
    buildExercise("DB overhead press", "3 sets", "8-10 reps", "Clean pressing volume."),
    buildExercise("Split squat or walking lunge", "3 sets", "8 reps/side", "Controlled lower-body volume."),
    buildExercise("Arms or trunk", "2-3 rounds", "10-15 reps", "Simple finishing work."),
   ];
  case "minimal":
   return cloneExercises(buildMinimalEquipmentStrength());
  case "travel_a":
   return cloneExercises(buildTravelStrengthA());
  case "travel_b":
   return cloneExercises(buildTravelStrengthB());
  case "full_body_b":
   return cloneExercises(buildFoundationStrengthB(equipmentProfile));
  case "lower_strength":
   return cloneExercises(buildPowerbuildingLowerStrength(equipmentProfile));
  case "lower_hypertrophy":
   return cloneExercises(buildPowerbuildingLowerHypertrophy(equipmentProfile));
  case "strength_foundation_a":
   return cloneExercises(buildStrengthFoundationA(equipmentProfile));
  case "strength_foundation_b":
   return cloneExercises(buildStrengthFoundationB(equipmentProfile));
  case "full_body_a":
  default:
   return cloneExercises(buildFoundationStrengthA(equipmentProfile));
 }
};

const buildRoleAwareStrengthSession = ({
 label = "Strength",
 strSess = "A",
 strengthDose = "35-45 min strength",
 prescribedExercises = [],
 upperBodyBias = false,
 lowerBodyLoad = "moderate",
 intensityGuidance = "Controlled strength work",
 optionalSecondary = "",
 nutri = NUTRITION_DAY_TYPES.strengthSupport,
 keySession = false,
 planningPriority = 3,
 laneRole = "support",
 primaryLane = "strength",
} = {}) => ({
 type: "strength+prehab",
 label,
 strSess,
 strengthDose,
 strengthDuration: strengthDose,
 prescribedExercises: cloneExercises(prescribedExercises),
 upperBodyBias,
 lowerBodyLoad,
 stressClass: keySession || lowerBodyLoad === "high" ? "hard" : lowerBodyLoad === "none" ? "easy" : "moderate",
 intensityGuidance,
 optionalSecondary,
 nutri,
 keySession,
 planningPriority,
 laneRole,
 primaryLane,
});

const buildRoleAwareRunSession = ({
 type = "easy-run",
 label = "Easy Run",
 run = null,
 nutri = NUTRITION_DAY_TYPES.runEasy,
 optionalSecondary = "",
 keySession = false,
 planningPriority = 2,
 laneRole = "support",
 primaryLane = "running",
} = {}) => ({
 type,
 label,
 run: clonePlainValue(run || null),
 nutri,
 optionalSecondary,
 keySession,
 planningPriority,
 laneRole,
 primaryLane,
 lowerBodyLoad: type === "long-run" || type === "hard-run" ? "high" : "moderate",
 stressClass: type === "long-run" || type === "hard-run" ? "hard" : "moderate",
});

const buildRoleAwareMixedSession = ({
 label = "Easy Run + Strength Finish",
 run = null,
 strSess = "A",
 strengthDose = "20-30 min upper-body support",
 prescribedExercises = [],
 upperBodyBias = true,
 optionalSecondary = "",
 nutri = NUTRITION_DAY_TYPES.hybridSupport,
 keySession = false,
 planningPriority = 2,
 laneRole = "maintained",
} = {}) => ({
 type: "run+strength",
 label,
 run: clonePlainValue(run || null),
 strSess,
 strengthDose,
 strengthDuration: strengthDose,
 prescribedExercises: cloneExercises(prescribedExercises),
 upperBodyBias,
 lowerBodyLoad: upperBodyBias ? "moderate" : "high",
 stressClass: keySession ? "hard" : "moderate",
 optionalSecondary,
 nutri,
 keySession,
 planningPriority,
 laneRole,
 primaryLane: "hybrid",
});

const buildGoalLaneModel = ({ activeGoals = [] } = {}) => {
 const safeGoals = Array.isArray(activeGoals) ? activeGoals.filter(Boolean) : [];
 const dedupeGoals = (items = []) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((goal) => {
   const key = sanitizeText(goal?.id || goal?.name || "", 160).toLowerCase();
   if (!key) return true;
   if (seen.has(key)) return false;
   seen.add(key);
   return true;
  });
 };
 const goalsWithRoles = safeGoals.flatMap((goal, index) => (
  resolvePlanningLaneDescriptors(goal, index).map(({ category, role }) => ({
   goal,
   role,
   category,
   roleWeight: GOAL_ROLE_ORDER[role] || 0,
  }))
 ));
 const primaryGoal = goalsWithRoles.find((entry) => entry.role === "primary")?.goal || safeGoals[0] || null;
 const maintainedGoals = dedupeGoals(goalsWithRoles.filter((entry) => entry.role === "maintained").map((entry) => entry.goal)).filter((goal) => goal?.id !== primaryGoal?.id);
 const supportGoals = dedupeGoals(goalsWithRoles.filter((entry) => entry.role === "background").map((entry) => entry.goal)).filter((goal) => goal?.id !== primaryGoal?.id);
 const deferredGoals = dedupeGoals(goalsWithRoles.filter((entry) => entry.role === "deferred").map((entry) => entry.goal)).filter((goal) => goal?.id !== primaryGoal?.id);
 const pickLane = (category = "") => {
  const laneGoals = goalsWithRoles.filter((entry) => entry.category === category).sort((left, right) => right.roleWeight - left.roleWeight);
  const top = laneGoals[0] || null;
  return {
   active: Boolean(top),
   role: top?.role || "",
   roleWeight: top?.roleWeight || 0,
   goals: laneGoals.map((entry) => entry.goal),
   leadGoal: top?.goal || null,
   summary: laneGoals.map((entry) => entry.goal?.name).filter(Boolean),
  };
 };
 const runningLane = pickLane("running");
 const strengthLane = pickLane("strength");
 const bodyCompLane = pickLane("body_comp");
 return {
  primaryGoal,
  maintainedGoals,
  supportGoals,
  deferredGoals,
  runningLane,
  strengthLane,
  bodyCompLane,
  meaningfulHybrid: Boolean(runningLane.active && (strengthLane.active || bodyCompLane.active)),
  upperBodyStrengthBias: Boolean(strengthLane.leadGoal && goalLooksUpperBodyFocused(strengthLane.leadGoal)),
  maintainedGoalLabels: maintainedGoals.map((goal) => goal?.name).filter(Boolean),
  supportGoalLabels: supportGoals.map((goal) => goal?.name).filter(Boolean),
  deferredGoalLabels: deferredGoals.map((goal) => goal?.name).filter(Boolean),
 };
};

const buildLaneDrivenRunSupportTemplate = ({
 architecture = "race_prep_dominant",
 baseWeek = {},
 laneModel = {},
 equipmentProfile = {},
 raceNear = false,
 bodyCompActive = false,
 timeCrunched = false,
} = {}) => {
 const upperMaintenanceA = buildSessionExercisePacket({
  emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_a" : "upper_maintenance",
  equipmentProfile,
 });
 const upperMaintenanceB = buildSessionExercisePacket({
  emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_b" : "strength_maintenance",
  equipmentProfile,
 });
 const recoverySecondary = bodyCompActive ? "Optional: short trunk or carry finisher." : "Optional: mobility reset if recovery is good.";
 const easySupportRun = baseWeek?.fri || { t: "Easy", d: raceNear ? "30-40 min" : "25-35 min" };
 return {
  1: buildRoleAwareRunSession({
   type: "easy-run",
   label: "Easy Run",
   run: baseWeek?.mon || { t: "Easy", d: "30-40 min" },
   nutri: NUTRITION_DAY_TYPES.runEasy,
   planningPriority: 2,
   laneRole: laneModel.runningLane?.role || "primary",
   optionalSecondary: timeCrunched ? "Optional: stop after the run if the day is busy." : "Optional: 4-6 relaxed strides only if recovery is clearly good.",
  }),
  2: buildRoleAwareStrengthSession({
   label: laneModel.upperBodyStrengthBias ? "Bench Maintenance A" : "Upper-Body Maintenance A",
   strSess: "A",
   strengthDose: timeCrunched ? "20-25 min upper-body maintenance" : "25-35 min upper-body maintenance",
   prescribedExercises: upperMaintenanceA,
   upperBodyBias: true,
   lowerBodyLoad: "none",
   intensityGuidance: "Keep the lift lane alive without adding lower-body fatigue.",
   optionalSecondary: recoverySecondary,
   nutri: NUTRITION_DAY_TYPES.hybridSupport,
   planningPriority: 3,
   laneRole: laneModel.strengthLane?.role || "maintained",
  }),
  3: buildRoleAwareRunSession({
   type: "easy-run",
   label: raceNear ? "Aerobic Support Run" : "Easy Support Run",
   run: easySupportRun,
   nutri: NUTRITION_DAY_TYPES.runEasy,
   planningPriority: 3,
   laneRole: laneModel.runningLane?.role || "primary",
   optionalSecondary: "Optional: 5-10 min mobility reset.",
  }),
  4: buildRoleAwareRunSession({
   type: "hard-run",
   label: `${baseWeek?.thu?.t || "Tempo"} Run`,
   run: baseWeek?.thu || { t: "Tempo", d: "25-35 min" },
   nutri: NUTRITION_DAY_TYPES.runQuality,
   keySession: true,
   planningPriority: 1,
   laneRole: laneModel.runningLane?.role || "primary",
   optionalSecondary: "Optional: short fueling and calf reset after the main work.",
  }),
  5: buildRoleAwareStrengthSession({
   label: laneModel.upperBodyStrengthBias ? "Bench Maintenance B" : "Upper-Body Maintenance B",
   strSess: "B",
   strengthDose: timeCrunched ? "20-25 min upper-body maintenance" : "20-30 min upper-body maintenance",
   prescribedExercises: upperMaintenanceB,
   upperBodyBias: true,
   lowerBodyLoad: "none",
   intensityGuidance: "Keep pressing and pulling quality without stealing from the run lane.",
   optionalSecondary: bodyCompActive ? "Optional: arms or trunk finisher." : "Optional: cuff or scap stability finisher.",
   planningPriority: 3,
   laneRole: laneModel.strengthLane?.role || "maintained",
  }),
  6: buildRoleAwareRunSession({
   type: "long-run",
   label: "Long Run",
   run: baseWeek?.sat || { t: "Long", d: "60-75 min" },
   nutri: NUTRITION_DAY_TYPES.runLong,
   keySession: true,
   planningPriority: 1,
   laneRole: laneModel.runningLane?.role || "primary",
   optionalSecondary: "Optional: walk cooldown and fueling reset after the long session.",
  }),
  0: buildScheduleBufferRecovery("Active Recovery"),
 };
};

const buildLaneDrivenStrengthHybridTemplate = ({
 baseWeek = {},
 laneModel = {},
 equipmentProfile = {},
 timeCrunched = false,
 bodyCompActive = false,
} = {}) => {
 const benchA = buildSessionExercisePacket({
  emphasis: equipmentProfile.hasFullGym || equipmentProfile.hasBench ? "bench_focus_a" : equipmentProfile.isHotel ? "travel_a" : "minimal",
  equipmentProfile,
 });
 const benchB = buildSessionExercisePacket({
  emphasis: equipmentProfile.hasFullGym || equipmentProfile.hasBench ? "bench_focus_b" : equipmentProfile.isHotel ? "travel_b" : "minimal",
  equipmentProfile,
 });
 const lowerSupport = buildSessionExercisePacket({
  emphasis: equipmentProfile.hasFullGym ? "lower_support" : equipmentProfile.isHotel ? "travel_b" : "minimal",
  equipmentProfile,
 });
 return {
  1: buildRoleAwareStrengthSession({
   label: laneModel.upperBodyStrengthBias ? "Bench Focus A" : "Upper-Body Strength",
   strSess: "A",
   strengthDose: timeCrunched ? "30-40 min upper-body strength" : "40-55 min upper-body strength",
   prescribedExercises: benchA,
   upperBodyBias: true,
   lowerBodyLoad: "none",
   intensityGuidance: "Heavy but repeatable upper-body work.",
   optionalSecondary: bodyCompActive ? "Optional: short arm finisher." : "Optional: upper-back support work.",
   planningPriority: 1,
   keySession: true,
   laneRole: laneModel.strengthLane?.role || "primary",
  }),
  2: buildRoleAwareRunSession({
   type: "hard-run",
   label: `${baseWeek?.thu?.t || "Tempo"} Run`,
   run: baseWeek?.thu || { t: "Tempo", d: "20-30 min" },
   nutri: NUTRITION_DAY_TYPES.runQuality,
   keySession: true,
   planningPriority: 1,
   laneRole: laneModel.runningLane?.role || "maintained",
   optionalSecondary: "Optional: easy cooldown walk only.",
  }),
  3: buildScheduleBufferRecovery("Recovery / mobility"),
  4: buildRoleAwareStrengthSession({
   label: "Lower-Body Support + Pulling",
   strSess: "B",
   strengthDose: timeCrunched ? "25-35 min lower-body support" : "30-40 min lower-body support",
   prescribedExercises: lowerSupport,
   upperBodyBias: false,
   lowerBodyLoad: "moderate",
   intensityGuidance: "Keep the lower-body lane strong without stealing from the run anchors.",
   optionalSecondary: "Optional: trunk or calf support only.",
   planningPriority: 2,
   laneRole: laneModel.strengthLane?.role || "primary",
  }),
  5: buildRoleAwareRunSession({
   type: "easy-run",
   label: "Easy Run",
   run: baseWeek?.fri || { t: "Easy", d: "25-35 min" },
   nutri: NUTRITION_DAY_TYPES.runEasy,
   planningPriority: 3,
   laneRole: laneModel.runningLane?.role || "maintained",
   optionalSecondary: "Optional: mobility reset or relaxed strides if recovery is clearly good.",
  }),
  6: buildRoleAwareMixedSession({
   label: laneModel.upperBodyStrengthBias ? "Long Aerobic + Bench Volume" : "Long Aerobic + Strength Finish",
   run: baseWeek?.sat || { t: "Long", d: "45-60 min" },
   strSess: "A",
   strengthDose: timeCrunched ? "15-20 min upper-body support" : "20-25 min upper-body support",
   prescribedExercises: benchB,
   upperBodyBias: true,
   optionalSecondary: "Optional: walk cooldown and refuel before adding any accessory work.",
   planningPriority: 2,
   laneRole: "maintained",
  }),
  0: buildScheduleBufferRecovery("Active Recovery"),
 };
};

const buildLaneDrivenBalancedHybridTemplate = ({
 baseWeek = {},
 laneModel = {},
 equipmentProfile = {},
 timeCrunched = false,
 bodyCompActive = false,
} = {}) => {
 const hybridFuelingSupport = Boolean(
  laneModel.meaningfulHybrid
  || (laneModel.runningLane?.active && laneModel.strengthLane?.active)
  || (laneModel.runningLane?.active && bodyCompActive)
 );
 const fullBodyA = buildSessionExercisePacket({
  emphasis: equipmentProfile.isHotel ? "travel_a" : equipmentProfile.hasFullGym ? "full_body_a" : "minimal",
  equipmentProfile,
 });
 const upperSupport = buildSessionExercisePacket({
  emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_b" : "upper_maintenance",
  equipmentProfile,
 });
 return {
  1: buildRoleAwareStrengthSession({
   label: laneModel.upperBodyStrengthBias ? "Bench + Pull Strength" : "Full-Body Strength A",
   strSess: "A",
   strengthDose: timeCrunched ? "30-40 min strength" : "35-50 min strength",
   prescribedExercises: laneModel.upperBodyStrengthBias ? upperSupport : fullBodyA,
   upperBodyBias: laneModel.upperBodyStrengthBias,
   lowerBodyLoad: laneModel.upperBodyStrengthBias ? "low" : "moderate",
   intensityGuidance: "Start the week with quality strength, not accumulated fatigue.",
   optionalSecondary: bodyCompActive ? "Optional: short trunk finisher." : "Optional: carry or mobility finisher.",
   keySession: true,
   planningPriority: 1,
   laneRole: laneModel.strengthLane?.role || "maintained",
  }),
  2: buildRoleAwareRunSession({
   type: "easy-run",
   label: "Easy Aerobic Run",
   run: baseWeek?.mon || { t: "Easy", d: "25-35 min" },
   nutri: NUTRITION_DAY_TYPES.runEasy,
   planningPriority: 3,
   laneRole: laneModel.runningLane?.role || "maintained",
   optionalSecondary: "Optional: short mobility reset.",
  }),
  3: buildRoleAwareStrengthSession({
   label: "Upper-Body Support",
   strSess: "B",
   strengthDose: timeCrunched ? "20-25 min support strength" : "25-35 min support strength",
   prescribedExercises: upperSupport,
   upperBodyBias: true,
   lowerBodyLoad: "none",
   intensityGuidance: "Keep the strength lane alive without overfilling the week.",
   optionalSecondary: "Optional: cuff, scap, or arm support only.",
   planningPriority: 3,
   laneRole: laneModel.strengthLane?.role || "maintained",
   nutri: hybridFuelingSupport ? NUTRITION_DAY_TYPES.hybridSupport : NUTRITION_DAY_TYPES.strengthSupport,
  }),
  4: buildRoleAwareRunSession({
   type: "hard-run",
   label: `${baseWeek?.thu?.t || "Tempo"} Run`,
   run: baseWeek?.thu || { t: "Tempo", d: "20-30 min" },
   nutri: NUTRITION_DAY_TYPES.runQuality,
   keySession: true,
   planningPriority: 1,
   laneRole: laneModel.runningLane?.role || "maintained",
   optionalSecondary: "Optional: fueling and calf reset after the main set.",
  }),
  5: buildScheduleBufferRecovery("Recovery / walk"),
  6: buildRoleAwareRunSession({
   type: "long-run",
   label: laneModel.runningLane?.active ? "Long Aerobic Support" : "Long Conditioning Support",
   run: baseWeek?.sat || { t: "Long", d: "45-60 min" },
   nutri: laneModel.runningLane?.active ? NUTRITION_DAY_TYPES.runLong : NUTRITION_DAY_TYPES.conditioningMixed,
   keySession: laneModel.runningLane?.roleWeight >= 3,
   planningPriority: 2,
   laneRole: laneModel.runningLane?.role || "support",
   optionalSecondary: "Optional: easy walk cooldown and refuel.",
  }),
  0: buildScheduleBufferRecovery("Active Recovery"),
 };
};

const buildLaneDrivenBodyCompTemplate = ({
 baseWeek = {},
 laneModel = {},
 equipmentProfile = {},
 hasRunningGoal = false,
 timeCrunched = false,
} = {}) => ({
 1: buildRoleAwareStrengthSession({
  label: "Strength Retention A",
  strSess: "A",
  strengthDose: timeCrunched ? "25-35 min strength" : "30-40 min strength",
  prescribedExercises: buildSessionExercisePacket({ emphasis: "body_comp_a", equipmentProfile }),
  lowerBodyLoad: "moderate",
  intensityGuidance: "Keep muscle and performance while the body-comp lane leads.",
  optionalSecondary: "Optional: short trunk finisher.",
  planningPriority: 1,
  keySession: true,
  laneRole: laneModel.strengthLane?.role || "maintained",
 }),
 2: hasRunningGoal
  ? buildRoleAwareRunSession({
    type: "easy-run",
    label: "Easy Aerobic Support",
    run: baseWeek?.mon || { t: "Easy", d: "25-35 min" },
    nutri: NUTRITION_DAY_TYPES.runEasy,
    planningPriority: 3,
    laneRole: laneModel.runningLane?.role || "support",
    optionalSecondary: "Optional: mobility reset.",
   })
  : buildConditioningSession({ label: "Easy Aerobic Support", detail: "20-30 min low-impact aerobic work", lowImpact: true }),
 3: buildRoleAwareStrengthSession({
  label: "Strength Retention B",
  strSess: "B",
  strengthDose: timeCrunched ? "25-35 min strength" : "30-40 min strength",
  prescribedExercises: buildSessionExercisePacket({ emphasis: "body_comp_b", equipmentProfile }),
  lowerBodyLoad: "moderate",
  intensityGuidance: "Keep the work dense and repeatable, not crushing.",
  optionalSecondary: "Optional: short carry or trunk finisher.",
  planningPriority: 1,
  laneRole: laneModel.strengthLane?.role || "maintained",
 }),
 4: buildConditioningSession({
  label: hasRunningGoal ? "Tempo Conditioning" : "Conditioning Intervals",
  detail: hasRunningGoal ? "20-30 min tempo conditioning or controlled threshold intervals" : "20-30 min controlled intervals or mixed conditioning",
 }),
 5: buildScheduleBufferRecovery("Recovery / walk"),
 6: hasRunningGoal
  ? buildRoleAwareRunSession({
    type: "easy-run",
    label: "Long Aerobic Support",
    run: baseWeek?.sat || { t: "Easy", d: "35-50 min" },
    nutri: NUTRITION_DAY_TYPES.runEasy,
    planningPriority: 3,
    laneRole: laneModel.runningLane?.role || "support",
    optionalSecondary: "Optional: easy mobility finish.",
   })
  : buildConditioningSession({ label: "Long Aerobic Support", detail: "25-40 min easy conditioning, incline walk, or bike", lowImpact: true }),
 0: buildScheduleBufferRecovery("Active Recovery"),
});

const buildRoleAwareHybridWeek = ({
 architecture = "hybrid_performance",
 baseWeek = {},
 laneModel = {},
 trainingContext = null,
 hasRunningGoal = false,
 bodyCompActive = false,
 timeCrunched = false,
 raceNear = false,
 travelHeavy = false,
} = {}) => {
 const equipmentProfile = buildEquipmentProfile({
  trainingContext,
  userProfile: { trainingContext },
 }, { trainingContext });
 if (architecture === "event_prep_upper_body_maintenance") {
  return buildLaneDrivenRunSupportTemplate({
   architecture,
   baseWeek,
   laneModel,
   equipmentProfile,
   raceNear: true,
   bodyCompActive,
   timeCrunched,
  });
 }
 if (architecture === "race_prep_dominant") {
  return buildLaneDrivenRunSupportTemplate({
   architecture,
   baseWeek,
   laneModel,
   equipmentProfile,
   raceNear,
   bodyCompActive,
   timeCrunched,
  });
 }
 if (architecture === "strength_dominant" && hasRunningGoal) {
  return buildLaneDrivenStrengthHybridTemplate({
   baseWeek,
   laneModel,
   equipmentProfile,
   timeCrunched,
   bodyCompActive,
  });
 }
 if (architecture === "strength_dominant") {
  const primaryStrengthA = buildSessionExercisePacket({
   emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_a" : equipmentProfile.hasFullGym ? "strength_foundation_a" : travelHeavy ? "travel_a" : "minimal",
   equipmentProfile,
  });
  const primaryStrengthB = buildSessionExercisePacket({
   emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_b" : equipmentProfile.hasFullGym ? "strength_foundation_b" : travelHeavy ? "travel_b" : "minimal",
   equipmentProfile,
  });
  return {
   1: buildRoleAwareStrengthSession({
    label: laneModel.upperBodyStrengthBias ? "Bench Focus A" : "Primary Strength A",
    strSess: "A",
    strengthDose: timeCrunched ? "30-40 min strength" : "40-55 min strength",
    prescribedExercises: primaryStrengthA,
    upperBodyBias: laneModel.upperBodyStrengthBias,
    lowerBodyLoad: laneModel.upperBodyStrengthBias ? "low" : "high",
    intensityGuidance: "This is the clearest strength driver of the week.",
    optionalSecondary: "Optional: short trunk finisher.",
    keySession: true,
    planningPriority: 1,
    laneRole: laneModel.strengthLane?.role || "primary",
   }),
   2: buildConditioningSession({ label: "Easy Conditioning", detail: "20-30 min easy bike, rower, incline walk, or mixed conditioning", lowImpact: true }),
   3: buildRoleAwareStrengthSession({
    label: laneModel.upperBodyStrengthBias ? "Lower-Body Support" : "Primary Strength B",
    strSess: "B",
    strengthDose: timeCrunched ? "25-35 min strength" : "35-45 min strength",
    prescribedExercises: laneModel.upperBodyStrengthBias
     ? buildSessionExercisePacket({ emphasis: "lower_support", equipmentProfile })
     : primaryStrengthB,
    upperBodyBias: false,
    lowerBodyLoad: laneModel.upperBodyStrengthBias ? "moderate" : "high",
    intensityGuidance: "Keep the second strength touch productive, not redundant.",
    optionalSecondary: "Optional: carry or mobility finisher.",
    planningPriority: 1,
    keySession: true,
    laneRole: laneModel.strengthLane?.role || "primary",
   }),
   4: buildScheduleBufferRecovery("Recovery / walk"),
   5: buildRoleAwareStrengthSession({
    label: laneModel.upperBodyStrengthBias ? "Bench Volume + Pulling" : "Strength Volume",
    strSess: "A",
    strengthDose: timeCrunched ? "25-35 min support strength" : "30-40 min support strength",
    prescribedExercises: laneModel.upperBodyStrengthBias
     ? buildSessionExercisePacket({ emphasis: "bench_focus_b", equipmentProfile })
     : buildSessionExercisePacket({ emphasis: "full_body_b", equipmentProfile }),
    upperBodyBias: laneModel.upperBodyStrengthBias,
    lowerBodyLoad: laneModel.upperBodyStrengthBias ? "low" : "moderate",
    intensityGuidance: "Accumulate useful work without turning the week into junk fatigue.",
    optionalSecondary: "Optional: easy aerobic cooldown.",
    planningPriority: 2,
    laneRole: laneModel.strengthLane?.role || "primary",
   }),
   6: buildConditioningSession({ label: "Supportive Conditioning", detail: "20-25 min easy conditioning to keep work capacity alive", lowImpact: true }),
   0: buildScheduleBufferRecovery("Active Recovery"),
  };
 }
 if (architecture === "body_comp_conditioning") {
  return buildLaneDrivenBodyCompTemplate({
   baseWeek,
   laneModel,
   equipmentProfile,
   hasRunningGoal,
   timeCrunched,
  });
 }
 if (architecture === "hybrid_performance" && laneModel.runningLane?.roleWeight > laneModel.strengthLane?.roleWeight) {
  return {
   ...buildLaneDrivenRunSupportTemplate({
    architecture,
    baseWeek,
    laneModel,
    equipmentProfile,
    raceNear,
    bodyCompActive,
    timeCrunched,
   }),
   1: buildRoleAwareMixedSession({
    label: laneModel.upperBodyStrengthBias ? "Easy Run + Bench Maintenance" : "Easy Run + Strength Finish",
    run: baseWeek?.mon || { t: "Easy", d: "30-40 min" },
    strSess: "A",
    strengthDose: timeCrunched ? "15-20 min upper-body support" : "20-25 min upper-body support",
    prescribedExercises: buildSessionExercisePacket({
     emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_a" : "upper_maintenance",
     equipmentProfile,
    }),
    upperBodyBias: true,
    optionalSecondary: "Optional: stop after the run if the day is busy.",
    planningPriority: 2,
    laneRole: "maintained",
   }),
   2: buildScheduleBufferRecovery("Recovery / mobility"),
  };
 }
 if (architecture === "hybrid_performance" && laneModel.strengthLane?.roleWeight > laneModel.runningLane?.roleWeight) {
  return buildLaneDrivenStrengthHybridTemplate({
   baseWeek,
   laneModel,
   equipmentProfile,
   timeCrunched,
   bodyCompActive,
  });
 }
 if (architecture === "hybrid_performance") {
  return buildLaneDrivenBalancedHybridTemplate({
   baseWeek,
   laneModel,
   equipmentProfile,
   timeCrunched,
   bodyCompActive,
  });
 }
 return null;
};

const isStrengthLikeSession = (session = null) => ["run+strength", "strength+prehab"].includes(String(session?.type || "").toLowerCase());

const resolveSupportAwarePacketForSession = ({
 session = null,
 supportPlanningContext = null,
 equipmentProfile = {},
 hasRunningGoal = false,
 domainAdapterId = "",
} = {}) => {
 if (!isStrengthLikeSession(session) || !supportPlanningContext) return null;
 const label = sanitizeText(session?.label || "", 160).toLowerCase();
 const leadDomain = sanitizeText(domainAdapterId || supportPlanningContext?.leadDomain || "", 80).toLowerCase();
 const existingRows = cloneExercises(session?.prescribedExercises || []);
 const rowCount = existingRows.length;
 const swimDryland = leadDomain === "swimming_endurance_technique" || /\bdryland|shoulder \/ core support|shoulder durability\b/.test(label);
 const benchFocused = /\bbench\b/.test(label);
 const upperSupport = Boolean(session?.upperBodyBias) || /\bupper-body|push\/pull|maintenance|volume|support\b/.test(label);
 const lowerDurability = /\blower-body support|durability\b/.test(label) || (hasRunningGoal && !session?.upperBodyBias && /\bstrength\b/.test(label));

 if (swimDryland) return buildSwimDrylandPacket({ supportPlanningContext, equipmentProfile });
 if (benchFocused && /\ba\b|focus a|maintenance a/.test(label)) return buildBenchSupportPacketA({ supportPlanningContext, equipmentProfile });
 if (benchFocused && /\bb\b|focus b|maintenance b|volume/.test(label)) return buildBenchSupportPacketB({ supportPlanningContext, equipmentProfile });
 if (benchFocused) return buildUpperMaintenancePacket({ supportPlanningContext, equipmentProfile });
 if (lowerDurability) return buildLowerDurabilityPacket({ supportPlanningContext, equipmentProfile });
 if (upperSupport) return buildUpperMaintenancePacket({ supportPlanningContext, equipmentProfile });
 if (!rowCount && leadDomain === "swimming_endurance_technique") return buildSwimDrylandPacket({ supportPlanningContext, equipmentProfile });
 if (!rowCount && hasRunningGoal) return buildLowerDurabilityPacket({ supportPlanningContext, equipmentProfile });
 if (!rowCount) return buildUpperMaintenancePacket({ supportPlanningContext, equipmentProfile });
 return null;
};

const applyGoalSupportExerciseSelection = ({
 dayTemplates = {},
 supportPlanningContext = null,
 equipmentProfile = {},
 hasRunningGoal = false,
 domainAdapterId = "",
} = {}) => {
 if (!supportPlanningContext?.summaries?.length) return clonePlainValue(dayTemplates || {});
 return Object.fromEntries(
  Object.entries(dayTemplates || {}).map(([dayKey, session]) => {
   if (!session || !isStrengthLikeSession(session)) return [dayKey, session];
   const packet = resolveSupportAwarePacketForSession({
    session,
    supportPlanningContext,
    equipmentProfile,
    hasRunningGoal,
    domainAdapterId,
   });
   if (!packet?.length) return [dayKey, session];
   return [dayKey, normalizeSessionEntryLabel({
    ...session,
    prescribedExercises: packet,
    supportFocus: {
     source: "goal_driver_graph",
     leadDomain: sanitizeText(domainAdapterId || supportPlanningContext?.leadDomain || "", 80).toLowerCase(),
    },
   })];
 })
 );
};

const WEEKDAY_LABELS = Object.freeze({
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
});
const PLANNER_DAY_ORDER = Object.freeze([1, 2, 3, 4, 5, 6, 0]);
const TRAINING_WEEKDAY_TO_PLANNER_DAY = Object.freeze(
 Object.fromEntries(
  TRAINING_WEEKDAY_OPTIONS.map((option) => [option.value, option.plannerDayKey])
 )
);

const resolveWeekdayLabel = (dayKey = null) => WEEKDAY_LABELS?.[Number(dayKey)] || "that day";
const resolveWeekdayLabelList = (dayKeys = []) => (
 dedupeStrings(
  (Array.isArray(dayKeys) ? dayKeys : [])
   .map((dayKey) => resolveWeekdayLabel(dayKey))
   .filter(Boolean)
 )
);

const isHabitShiftCandidate = (session = null, { architecture = "hybrid_performance" } = {}) => {
 if (!session || session?.type === "rest" || session?.isRecoverySlot) return false;
 const planningPriority = Number(session?.planningPriority ?? 99);
 const priorityScore = resolveSessionPriorityScore({ session, architecture });
 return Boolean(session?.keySession) || planningPriority <= 1 || priorityScore >= 84;
};

const resolveHabitShiftTargetScore = ({
 session = null,
 targetDayKey = null,
 targetStats = {},
 architecture = "hybrid_performance",
} = {}) => {
 const safeDayKey = Number(targetDayKey);
 const completionRate = Number(targetStats?.completionRate || 0);
 const completedCount = Number(targetStats?.completedCount || 0);
 if (!session || session?.type === "rest" || session?.isRecoverySlot) {
  return 120 + (completionRate * 20) + completedCount + (safeDayKey === 0 ? 3 : 0);
 }
 const type = String(session?.type || "").toLowerCase();
 const planningPriority = Number(session?.planningPriority ?? 4);
 const priorityScore = resolveSessionPriorityScore({ session, architecture });
 const easyReplacement = ["conditioning", "easy-run"].includes(type) || planningPriority >= 3 || priorityScore <= 60;
 if (!easyReplacement) return -Infinity;
 return 60 + (completionRate * 20) + completedCount - priorityScore + (safeDayKey === 0 ? 3 : 0);
};

const applyHabitDrivenScheduleShift = ({
 dayTemplates = {},
 habitAdaptationContext = null,
 architecture = "hybrid_performance",
 allowedDayKeys = null,
} = {}) => {
 const rawSourceDayKey = habitAdaptationContext?.chronicMissDayKey;
 if (!Number.isInteger(rawSourceDayKey)) {
  return {
   dayTemplates: clonePlainValue(dayTemplates || {}),
   changed: false,
   effects: [],
  };
 }
 const sourceDayKey = Number(rawSourceDayKey);

 const next = clonePlainValue(dayTemplates || {});
 const sourceSession = next?.[sourceDayKey] || null;
 if (!isHabitShiftCandidate(sourceSession, { architecture })) {
  return {
   dayTemplates: next,
   changed: false,
   effects: [],
  };
 }

 const weekdayStats = habitAdaptationContext?.weekdayStats || {};
 const sourceStats = weekdayStats?.[sourceDayKey] || {};
 const sourceCompletionRate = Number(sourceStats?.completionRate || 0);
 const reliableDayOrder = Array.isArray(habitAdaptationContext?.reliableDayOrder)
  ? habitAdaptationContext.reliableDayOrder
  : [];
 const allowedDayKeySet = Array.isArray(allowedDayKeys) && allowedDayKeys.length
  ? new Set(allowedDayKeys.map((dayKey) => Number(dayKey)).filter((dayKey) => Number.isInteger(dayKey)))
  : null;
 const candidates = reliableDayOrder
  .filter((dayKey) => (
   Number.isInteger(dayKey)
   && dayKey !== sourceDayKey
   && (!allowedDayKeySet || allowedDayKeySet.has(Number(dayKey)))
  ))
  .map((dayKey) => {
   const targetSession = next?.[dayKey] || null;
   const targetStats = weekdayStats?.[dayKey] || {};
   const targetCompletionRate = Number(targetStats?.completionRate || 0);
   const betterEvidence = targetCompletionRate >= (sourceCompletionRate + 0.2);
   const recoveryFallback = !targetSession || targetSession?.type === "rest" || targetSession?.isRecoverySlot;
   if (!betterEvidence && !recoveryFallback) return null;
   return {
    dayKey,
    targetSession,
    targetStats,
    score: resolveHabitShiftTargetScore({
     session: targetSession,
     targetDayKey: dayKey,
     targetStats,
     architecture,
    }),
   };
  })
  .filter((entry) => Number.isFinite(entry?.score))
  .sort((left, right) => right.score - left.score);

 const target = candidates[0] || null;
 if (!target) {
  return {
   dayTemplates: next,
   changed: false,
   effects: [],
  };
 }

 const movedSession = normalizeSessionEntryLabel({
  ...sourceSession,
  habitAdaptation: {
   source: "weekday_reliability",
   fromDayKey: sourceDayKey,
   toDayKey: target.dayKey,
  },
 });
 const replacementSession = target?.targetSession && target.targetSession.type !== "rest" && !target.targetSession.isRecoverySlot
  ? normalizeSessionEntryLabel({
   ...target.targetSession,
   habitAdaptation: {
    source: "weekday_reliability_backfill",
    fromDayKey: target.dayKey,
    toDayKey: sourceDayKey,
   },
  })
  : buildScheduleBufferRecovery("Recovery / schedule buffer");

 next[target.dayKey] = movedSession;
 next[sourceDayKey] = replacementSession;

 return {
  dayTemplates: next,
  changed: true,
  effects: [
   `Key work moved from ${resolveWeekdayLabel(sourceDayKey)} to ${resolveWeekdayLabel(target.dayKey)} because ${resolveWeekdayLabel(sourceDayKey)} has been unreliable lately.`,
  ],
 };
};

const buildCardioPreferenceDetail = (mode = "", { longSession = false } = {}) => {
 const safeMode = sanitizeText(mode, 40).toLowerCase();
 if (safeMode === "bike") return longSession ? "45-75 min steady bike instead of a default long run slot" : "20-35 min steady bike or spin";
 if (safeMode === "elliptical") return longSession ? "45-70 min steady elliptical session" : "20-35 min steady elliptical session";
 if (safeMode === "incline_walk") return longSession ? "40-70 min incline walk" : "20-35 min incline walk";
 if (safeMode === "rower") return longSession ? "35-55 min easy rower session" : "15-30 min controlled rower work";
 if (safeMode === "treadmill") return longSession ? "45-75 min treadmill long aerobic session" : "20-35 min treadmill run or walk";
 if (safeMode === "run_walk") return longSession ? "45-75 min easy run/walk" : "20-35 min easy run/walk";
 if (safeMode === "outdoor_run") return longSession ? "45-75 min outdoor long aerobic session" : "20-35 min outdoor easy run";
 if (safeMode === "swim") return longSession ? "35-55 min easy swim or pool aerobic work" : "20-35 min easy swim or pool aerobic work";
 return longSession ? "45-75 min easy aerobic work in the mode you usually keep" : "20-35 min easy aerobic work in the mode you usually keep";
};

const buildCardioPreferenceLabel = (mode = "", { longSession = false, conditioning = false } = {}) => {
 const safeMode = sanitizeText(mode, 40).toLowerCase();
 if (conditioning) {
  if (safeMode === "bike") return "Bike Conditioning";
  if (safeMode === "elliptical") return "Elliptical Conditioning";
  if (safeMode === "incline_walk") return "Incline Walk Conditioning";
  if (safeMode === "rower") return "Rower Conditioning";
  if (safeMode === "treadmill") return "Treadmill Conditioning";
  if (safeMode === "swim") return "Swim Conditioning";
  return "Conditioning";
 }
 if (longSession) {
  if (safeMode === "treadmill") return "Treadmill Long Aerobic";
  if (safeMode === "run_walk") return "Long Run/Walk";
  if (safeMode === "outdoor_run") return "Outdoor Long Run";
  return "Long Aerobic Support";
 }
 if (safeMode === "run_walk") return "Easy Run/Walk";
 if (safeMode === "treadmill") return "Treadmill Easy Run";
 if (safeMode === "outdoor_run") return "Outdoor Easy Run";
 if (safeMode === "bike") return "Bike Aerobic Support";
 if (safeMode === "elliptical") return "Elliptical Aerobic Support";
 if (safeMode === "incline_walk") return "Incline Walk Support";
 if (safeMode === "rower") return "Rower Aerobic Support";
 if (safeMode === "swim") return "Swim Aerobic Support";
 return "Aerobic Support";
};

const appendDistinctSecondaryLine = (current = "", addition = "") => {
 const safeCurrent = sanitizeText(current, 180);
 const safeAddition = sanitizeText(addition, 180);
 if (!safeAddition) return safeCurrent;
 if (!safeCurrent) return safeAddition;
 if (safeCurrent.toLowerCase().includes(safeAddition.toLowerCase())) return safeCurrent;
 return `${safeCurrent} ${safeAddition}`.trim();
};

const applyPreferredLongSessionDayShift = ({
 dayTemplates = {},
 habitAdaptationContext = null,
 allowedDayKeys = null,
} = {}) => {
 const preferredDayKey = Number(habitAdaptationContext?.preferredLongSessionDayKey);
 if (!Number.isInteger(preferredDayKey)) {
  return {
   dayTemplates: clonePlainValue(dayTemplates || {}),
   changed: false,
   effects: [],
  };
 }
 const allowedDayKeySet = Array.isArray(allowedDayKeys) && allowedDayKeys.length
  ? new Set(allowedDayKeys.map((dayKey) => Number(dayKey)).filter((dayKey) => Number.isInteger(dayKey)))
  : null;
 if (allowedDayKeySet && !allowedDayKeySet.has(preferredDayKey)) {
  return {
   dayTemplates: clonePlainValue(dayTemplates || {}),
   changed: false,
   effects: [],
  };
 }
 const next = clonePlainValue(dayTemplates || {});
 const currentLongEntry = Object.entries(next).find(([, session]) => inspectSessionCapabilities(session).longSession) || null;
 if (!currentLongEntry) {
  return {
   dayTemplates: next,
   changed: false,
   effects: [],
  };
 }
 const sourceDayKey = Number(currentLongEntry[0]);
 if (sourceDayKey === preferredDayKey) {
  return {
   dayTemplates: next,
   changed: false,
   effects: [],
  };
 }
 const targetSession = next?.[preferredDayKey] || null;
 if (targetSession && inspectSessionCapabilities(targetSession).longSession) {
  return {
   dayTemplates: next,
   changed: false,
   effects: [],
  };
 }
 if (targetSession && resolveSessionPriorityScore({ session: targetSession, architecture: "hybrid_performance" }) >= 84) {
  return {
   dayTemplates: next,
   changed: false,
   effects: [],
  };
 }

 const movedLongSession = normalizeSessionEntryLabel({
  ...currentLongEntry[1],
  habitAdaptation: {
   source: "preferred_long_session_day",
   fromDayKey: sourceDayKey,
   toDayKey: preferredDayKey,
  },
 });
 const replacementSession = targetSession && targetSession.type !== "rest" && !targetSession.isRecoverySlot
  ? normalizeSessionEntryLabel({
     ...targetSession,
     habitAdaptation: {
      source: "preferred_long_session_backfill",
      fromDayKey: preferredDayKey,
      toDayKey: sourceDayKey,
     },
    })
  : buildScheduleBufferRecovery("Recovery / schedule buffer");

 next[preferredDayKey] = movedLongSession;
 next[sourceDayKey] = replacementSession;

 return {
  dayTemplates: next,
  changed: true,
  effects: [
   `Long-session work moved to ${resolveWeekdayLabel(preferredDayKey)} because that is where it actually gets done most often.`,
  ],
 };
};

const applyHabitDrivenCardioPreferences = ({
 dayTemplates = {},
 habitAdaptationContext = null,
 architecture = "hybrid_performance",
 hasRunningGoal = false,
} = {}) => {
 const cardioPreferences = habitAdaptationContext?.cardioPreferences || {};
 if (!cardioPreferences?.easyAerobic && !cardioPreferences?.conditioning && !cardioPreferences?.longSession && !habitAdaptationContext?.lowImpactBias) {
  return {
   dayTemplates: clonePlainValue(dayTemplates || {}),
   changed: false,
   effects: [],
  };
 }

 const effectLines = [];
 const next = Object.fromEntries(
  Object.entries(dayTemplates || {}).map(([dayKey, session]) => {
   if (!session || session.type === "rest") return [dayKey, session];
   const capabilities = inspectSessionCapabilities(session);
   if (!capabilities.enduranceCapable) return [dayKey, session];

   const longSession = capabilities.longSession;
   const preference = longSession
    ? cardioPreferences.longSession || cardioPreferences.easyAerobic || null
    : session.type === "conditioning"
    ? cardioPreferences.conditioning || cardioPreferences.easyAerobic || null
    : session.type === "easy-run"
    ? cardioPreferences.easyAerobic || cardioPreferences.conditioning || null
    : null;
   if (!preference?.mode) return [dayKey, session];

   const mode = preference.mode;
   let nextSession = clonePlainValue(session);
   let changed = false;

   if (longSession) {
    if (["treadmill", "run_walk", "outdoor_run"].includes(mode)) {
      nextSession.label = buildCardioPreferenceLabel(mode, { longSession: true });
      nextSession.run = {
       ...(nextSession.run || {}),
       t: mode === "run_walk" ? "Run/Walk" : mode === "treadmill" ? "Treadmill" : "Outdoor",
      };
      nextSession.environmentNote = appendDistinctSecondaryLine(nextSession.environmentNote, `Habit preference: ${preference.label} is the long-session mode you keep choosing.`);
      changed = true;
    }
   } else if (session.type === "conditioning") {
    nextSession.label = buildCardioPreferenceLabel(mode, { conditioning: true });
    nextSession.fallback = buildCardioPreferenceDetail(mode, { longSession: false });
    if (habitAdaptationContext?.lowImpactBias || preference.lowImpact) {
      nextSession.intensityGuidance = "easy aerobic only";
      nextSession.environmentNote = "Low-impact modes have been the most repeatable lately.";
    }
    changed = true;
   } else if (session.type === "easy-run") {
    if (["treadmill", "run_walk", "outdoor_run"].includes(mode)) {
      nextSession.label = buildCardioPreferenceLabel(mode, { longSession: false });
      nextSession.run = {
       ...(nextSession.run || {}),
       t: mode === "run_walk" ? "Run/Walk" : mode === "treadmill" ? "Treadmill" : "Outdoor",
      };
      nextSession.environmentNote = appendDistinctSecondaryLine(nextSession.environmentNote, `Habit preference: ${preference.label} is the easy aerobic mode you usually keep.`);
      changed = true;
    } else if ((habitAdaptationContext?.lowImpactBias || preference.lowImpact) && (!hasRunningGoal || (!session.keySession && Number(session?.planningPriority || 99) >= 3 && !["race_prep_dominant", "event_prep_upper_body_maintenance"].includes(architecture)))) {
      nextSession = buildConditioningSession({
       label: buildCardioPreferenceLabel(mode, { conditioning: false }),
       detail: buildCardioPreferenceDetail(mode, { longSession: false }),
       nutri: nextSession?.nutri || NUTRITION_DAY_TYPES.runEasy,
       lowImpact: true,
      });
      nextSession.habitAdaptation = {
       source: "preferred_cardio_mode",
       mode,
       dayKey: Number(dayKey),
      };
      changed = true;
    } else {
      nextSession.environmentNote = appendDistinctSecondaryLine(nextSession.environmentNote, `Fallback: ${preference.label} works well when you want the option you usually keep.`);
      changed = true;
    }
   }

   if (!changed) return [dayKey, session];
   effectLines.push(
    longSession
     ? `Long aerobic work now leans into ${preference.label} when that stays true to the session intent.`
     : session.type === "conditioning"
     ? `Conditioning sessions now bias toward ${preference.label}, which is what keeps showing up in the logs.`
     : `Supportive aerobic sessions now respect the ${preference.label} option you keep choosing.`
   );
   return [dayKey, normalizeSessionEntryLabel(nextSession)];
  })
 );

 return {
  dayTemplates: next,
  changed: effectLines.length > 0,
  effects: dedupeStrings(effectLines).slice(0, 2),
 };
};

const resolveHabitAccessoryPrescription = (pattern = "", preferredExercise = "") => {
 const safePattern = sanitizeText(pattern, 80).toLowerCase();
 const safeExercise = sanitizeText(preferredExercise, 120);
 if (safePattern === "trunk") return { ex: safeExercise, sets: "2-3 sets", reps: "8-12 reps or 30-45 sec", note: "Your usual trunk add-on stays visible." };
 if (safePattern === "lower_leg_support") return { ex: safeExercise, sets: "3 sets", reps: "12-20 reps", note: "Your usual lower-leg support work stays visible." };
 if (safePattern === "single_leg") return { ex: safeExercise, sets: "2-3 sets", reps: "8-12 reps / side", note: "Your usual single-leg support work stays visible." };
 if (safePattern === "posterior_chain_support") return { ex: safeExercise, sets: "2-3 sets", reps: "8-12 reps", note: "Your usual posterior-chain support work stays visible." };
 if (safePattern === "swim_dryland") return { ex: safeExercise, sets: "2-3 sets", reps: "10-15 reps", note: "Your usual dryland support work stays visible." };
 return { ex: safeExercise, sets: "2-3 sets", reps: "10-15 reps", note: "You keep adding this, so it now stays in the support packet." };
};

const isHabitAddOnCompatible = ({
 session = null,
 pattern = "",
 hasRunningGoal = false,
} = {}) => {
 const safePattern = sanitizeText(pattern, 80).toLowerCase();
 const labelText = sanitizeText(`${session?.label || ""} ${session?.optionalSecondary || ""}`, 200).toLowerCase();
 const upperBodyBias = Boolean(session?.upperBodyBias) || /upper|bench|press|push\/pull|shoulder/.test(labelText);
 if (["trunk"].includes(safePattern)) return true;
 if (["shoulder_isolation", "scap_support", "triceps_support", "upper_pull", "upper_press_support", "shoulder_tolerance"].includes(safePattern)) return upperBodyBias;
 if (["lower_leg_support", "single_leg", "posterior_chain_support"].includes(safePattern)) return !upperBodyBias || hasRunningGoal || /durability|run|lower|leg/.test(labelText);
 if (safePattern === "swim_dryland") return /swim/.test(labelText);
 return false;
};

const applyHabitDrivenExercisePreferences = ({
 dayTemplates = {},
 habitAdaptationContext = null,
 hasRunningGoal = false,
} = {}) => {
 if (
  !habitAdaptationContext?.exercisePreferences?.length
  && !habitAdaptationContext?.accessoryAddOnPreferences?.length
  && !habitAdaptationContext?.avoidAccessoryPatterns?.length
 ) {
  return {
   dayTemplates: clonePlainValue(dayTemplates || {}),
   changed: false,
   effects: [],
  };
 }

 const effectRows = [];
 const addOnRows = [];
 const removedPatterns = [];
 const avoidPatterns = new Set((habitAdaptationContext?.avoidAccessoryPatterns || []).map((entry) => sanitizeText(entry?.pattern || "", 80).toLowerCase()).filter(Boolean));
 const addOnPreferences = Array.isArray(habitAdaptationContext?.accessoryAddOnPreferences)
  ? [...habitAdaptationContext.accessoryAddOnPreferences].sort((left, right) => Number(right?.evidenceCount || 0) - Number(left?.evidenceCount || 0))
  : [];
  const next = Object.fromEntries(
  Object.entries(dayTemplates || {}).map(([dayKey, session]) => {
   if (!session || !isStrengthLikeSession(session) || !Array.isArray(session?.prescribedExercises) || !session.prescribedExercises.length) {
    return [dayKey, session];
   }
   const result = applyExercisePreferenceRows({
    rows: session.prescribedExercises,
    exercisePreferences: habitAdaptationContext.exercisePreferences,
   });
   let nextRows = Array.isArray(result.rows) ? result.rows : session.prescribedExercises;
   if (avoidPatterns.size && nextRows.length > 3) {
    const beforeCount = nextRows.length;
    nextRows = nextRows.filter((row) => {
      const profile = row?.transferProfile || buildExerciseTransferProfile({ exerciseName: row?.ex || "", note: row?.note || "" });
      const primaryPattern = sanitizeText(profile?.primaryPattern || "", 80).toLowerCase();
      if (!primaryPattern || !avoidPatterns.has(primaryPattern)) return true;
      if ((profile?.directDriverIds || []).length > 0) return true;
      removedPatterns.push(primaryPattern);
      return false;
    });
    if (!nextRows.length) nextRows = Array.isArray(result.rows) ? result.rows : session.prescribedExercises;
    if (nextRows.length < beforeCount) {
      result.changed = true;
    }
   }

   if (addOnPreferences.length && nextRows.length < 5) {
    const existingPatterns = new Set(
      nextRows
        .map((row) => sanitizeText((row?.transferProfile || buildExerciseTransferProfile({ exerciseName: row?.ex || "", note: row?.note || "" }))?.primaryPattern || "", 80).toLowerCase())
        .filter(Boolean)
    );
    const preferredAddOn = addOnPreferences.find((entry) => (
      entry?.preferredExercise
      && !existingPatterns.has(sanitizeText(entry?.pattern || "", 80).toLowerCase())
      && isHabitAddOnCompatible({ session, pattern: entry?.pattern, hasRunningGoal })
    )) || null;
    if (preferredAddOn) {
      nextRows = [
        ...nextRows,
        resolveHabitAccessoryPrescription(preferredAddOn.pattern, preferredAddOn.preferredExercise),
      ];
      addOnRows.push(preferredAddOn);
      result.changed = true;
    }
   }

   if (!result.changed) return [dayKey, session];
   effectRows.push(...(result.replacements || []));
   return [dayKey, normalizeSessionEntryLabel({
    ...session,
    prescribedExercises: nextRows,
    habitPreferenceSummary: result.replacements,
   })];
  })
 );

 const effectLines = dedupeStrings(
  [
   ...effectRows.map((entry) => (
    entry?.to && entry?.from
     ? `Accessory choices now lean into ${entry.to} after repeated swaps away from ${entry.from}.`
     : ""
   )),
   ...addOnRows.map((entry) => (
    entry?.preferredExercise
     ? `${entry.preferredExercise} now stays in the support packet because you keep adding it.`
     : ""
   )),
   ...removedPatterns.map((pattern) => (
    pattern
     ? `${pattern.replace(/_/g, " ")} no longer gets forced when it keeps being skipped.`
     : ""
   )),
  ].filter(Boolean)
 ).slice(0, 3);

 return {
  dayTemplates: next,
  changed: effectRows.length > 0 || addOnRows.length > 0 || removedPatterns.length > 0,
  effects: effectLines,
 };
};

const summarizeLogText = (entry = null) => sanitizeText([
 entry?.actualSession?.sessionLabel || "",
 entry?.actualSession?.sessionType || "",
 entry?.actualSession?.modality || "",
 entry?.actualSession?.swapLabel || "",
 entry?.actualSession?.bodyStatus || "",
 entry?.actualSession?.recoveryState || "",
 entry?.checkin?.sessionFeel || "",
 entry?.label || "",
 entry?.type || "",
 entry?.notes || "",
].join(" "), 320).toLowerCase();

const buildRecentHybridLoadContext = ({
 logs = {},
 todayKey = "",
 lookbackDays = 4,
} = {}) => {
 const safeToday = sanitizeText(todayKey || new Date().toISOString().split("T")[0], 24);
 const anchor = new Date(`${safeToday}T12:00:00`);
 if (Number.isNaN(anchor.getTime())) {
  return {
   hardRunCount: 0,
   lowerBodyLoadCount: 0,
   lowRecoveryCount: 0,
   recentLegSoreness: false,
  };
 }
 const entries = [];
 for (let offset = 1; offset <= lookbackDays; offset += 1) {
  const cursor = new Date(anchor);
  cursor.setDate(anchor.getDate() - offset);
  const dateKey = cursor.toISOString().split("T")[0];
  if (logs?.[dateKey]) entries.push(logs[dateKey]);
 }
 const profile = entries.reduce((acc, entry) => {
  const text = summarizeLogText(entry);
  const bodyStatus = sanitizeText(entry?.actualSession?.bodyStatus || "", 40).toLowerCase();
  const recoveryState = sanitizeText(entry?.actualSession?.recoveryState || "", 40).toLowerCase();
  const feel = sanitizeText(entry?.checkin?.sessionFeel || entry?.actualSession?.sessionFeel || "", 40).toLowerCase();
  const hardRunLike = /\btempo|interval|threshold|quality|long run|race pace\b/.test(text);
  const lowerBodyLike = /\blegs_sore|beat_up|squat|deadlift|lunge|split squat|long run|tempo\b/.test(text) || ["legs_sore", "beat_up"].includes(bodyStatus);
  const lowRecoveryLike = ["low"].includes(recoveryState) || ["harder_than_expected"].includes(feel) || ["beat_up"].includes(bodyStatus);
  return {
   hardRunCount: acc.hardRunCount + (hardRunLike ? 1 : 0),
   lowerBodyLoadCount: acc.lowerBodyLoadCount + (lowerBodyLike ? 1 : 0),
   lowRecoveryCount: acc.lowRecoveryCount + (lowRecoveryLike ? 1 : 0),
   recentLegSoreness: acc.recentLegSoreness || ["legs_sore", "beat_up"].includes(bodyStatus),
  };
 }, {
  hardRunCount: 0,
  lowerBodyLoadCount: 0,
  lowRecoveryCount: 0,
  recentLegSoreness: false,
 });
 return {
  ...profile,
  protectiveLowerBodyBias: profile.lowerBodyLoadCount >= 2 || profile.recentLegSoreness || profile.lowRecoveryCount >= 2,
  capNextQualityRun: profile.hardRunCount >= 2 && profile.lowRecoveryCount >= 1,
 };
};

const capRunSessionToSupportive = (session = null, { labelSuffix = "(capped)" } = {}) => {
 if (!session || !isRunSessionType(session?.type)) return session;
 return normalizeSessionEntryLabel({
  ...session,
  type: "easy-run",
  label: `${sanitizeText(session?.label || "Run", 100)} ${labelSuffix}`.trim(),
  nutri: NUTRITION_DAY_TYPES.runEasy,
  run: {
   ...(clonePlainValue(session?.run || {}) || {}),
   t: "Easy",
  },
  optionalSecondary: "Optional: mobility reset and refuel before pushing later in the week.",
  stressClass: "moderate",
  lowerBodyLoad: "moderate",
 });
};

const rewriteToUpperBodySupport = (session = null, { laneModel = {}, trainingContext = null } = {}) => {
 if (!session || session?.type === "rest") return session;
 const equipmentProfile = buildEquipmentProfile({
  trainingContext,
  userProfile: { trainingContext },
 }, { trainingContext });
 return normalizeSessionEntryLabel({
  ...buildRoleAwareStrengthSession({
   label: laneModel.upperBodyStrengthBias ? "Bench Support" : "Upper-Body Support",
   strSess: session?.strSess || "B",
   strengthDose: "20-30 min upper-body support",
   prescribedExercises: buildSessionExercisePacket({
    emphasis: laneModel.upperBodyStrengthBias ? "bench_focus_b" : "upper_maintenance",
    equipmentProfile,
   }),
   upperBodyBias: true,
   lowerBodyLoad: "none",
   intensityGuidance: "Recent lower-body stress kept this touch upper-body biased.",
   optionalSecondary: "Optional: cuff, scap, or arm support only.",
   laneRole: laneModel.strengthLane?.role || "maintained",
  }),
 });
};

const applyHybridFatigueGuards = ({
 dayTemplates = {},
 architecture = "",
 laneModel = {},
 logs = {},
 todayKey = "",
 currentDayOfWeek = 0,
 trainingContext = null,
} = {}) => {
 const next = clonePlainValue(dayTemplates || {});
 const effects = [];
 const loadContext = buildRecentHybridLoadContext({ logs, todayKey });
 const futureDayKeys = Object.keys(next)
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value >= currentDayOfWeek)
  .sort((left, right) => left - right);
 const futureQualityDay = futureDayKeys.find((dayKey) => ["hard-run", "long-run"].includes(String(next?.[dayKey]?.type || "").toLowerCase()));

 if (laneModel.meaningfulHybrid) {
  futureDayKeys.forEach((dayKey) => {
   const session = next?.[dayKey];
   if (!session || session?.type === "rest") return;
   const lowerBodyLoad = sanitizeText(session?.lowerBodyLoad || "", 20).toLowerCase();
   const prevType = sanitizeText(next?.[dayKey - 1]?.type || "", 40).toLowerCase();
   const nextType = sanitizeText(next?.[dayKey + 1]?.type || "", 40).toLowerCase();
   const adjacentHardRun = ["hard-run", "long-run"].includes(prevType) || ["hard-run", "long-run"].includes(nextType);
   if (adjacentHardRun && ["moderate", "high"].includes(lowerBodyLoad)) {
    next[dayKey] = rewriteToUpperBodySupport(session, { laneModel, trainingContext });
    effects.push("Lower-body loading was biased away from the sessions surrounding the quality run anchors.");
   }
  });
 }

 if (loadContext.protectiveLowerBodyBias) {
  const nextLowerBodyDay = futureDayKeys.find((dayKey) => ["moderate", "high"].includes(sanitizeText(next?.[dayKey]?.lowerBodyLoad || "", 20).toLowerCase()));
  if (Number.isInteger(nextLowerBodyDay)) {
   next[nextLowerBodyDay] = rewriteToUpperBodySupport(next[nextLowerBodyDay], { laneModel, trainingContext });
   effects.push("Recent lower-body stress kept the next strength touch upper-body biased.");
  }
 }

 if (loadContext.capNextQualityRun && Number.isInteger(futureQualityDay) && String(next?.[futureQualityDay]?.type || "").toLowerCase() === "hard-run") {
  next[futureQualityDay] = capRunSessionToSupportive(next[futureQualityDay]);
  effects.push("Recent run strain capped the next quality run so the week can keep moving.");
 }

 return {
  dayTemplates: next,
  effects: dedupeStrings(effects),
  loadContext,
 };
};

const buildActualSplitFromDayTemplates = (dayTemplates = {}) => ({
 run: Object.values(dayTemplates || {}).filter((session) => ["easy-run", "hard-run", "long-run", "run+strength"].includes(String(session?.type || "").toLowerCase())).length,
 strength: Object.values(dayTemplates || {}).filter((session) => ["strength+prehab", "run+strength"].includes(String(session?.type || "").toLowerCase())).length,
 conditioning: Object.values(dayTemplates || {}).filter((session) => String(session?.type || "").toLowerCase() === "conditioning").length,
 recovery: Object.values(dayTemplates || {}).filter((session) => ["rest", "recovery"].includes(String(session?.type || "").toLowerCase()) || session?.isRecoverySlot).length,
 swim: Object.values(dayTemplates || {}).filter((session) => /^swim-/.test(String(session?.type || "").toLowerCase())).length,
 power: Object.values(dayTemplates || {}).filter((session) => ["power-skill", "reactive-plyo", "sprint-support"].includes(String(session?.type || "").toLowerCase())).length,
});

const convertRunSessionForStrengthFirstPlan = (session = null) => {
  if (!session || typeof session !== "object") return session;
  const type = String(session?.type || "").toLowerCase();
  if (!isRunSessionType(type)) return session;
  if (type === "run+strength") {
    return {
      ...session,
      type: "strength+prehab",
      label: "Strength + Conditioning Primer",
      run: undefined,
      strengthDose: session?.strengthDose || "35-45 min strength",
      optionalSecondary: "Optional: short bike, rower, or incline walk cooldown.",
    };
  }
  const sessionText = sanitizeText([
    session?.label,
    session?.run?.t,
    session?.run?.d,
  ].join(" "), 160).toLowerCase();
  const isHardConditioning = /tempo|interval|threshold|quality/.test(sessionText);
  const duration = sanitizeText(session?.run?.d || "", 48)
    .replace(/\+\s*strides optional/ig, "")
    .trim();
  const detail = isHardConditioning
    ? "20-30 min controlled bike, rower, incline walk, or mixed-modality intervals"
    : duration
    ? `${duration} bike, rower, incline walk, or circuit`
    : "20-30 min zone-2 bike, rower, incline walk, or circuit";
  return buildConditioningSession({
    label: isHardConditioning ? "Conditioning Intervals" : "Supportive Conditioning",
    detail,
    lowImpact: !isHardConditioning,
  });
};

const DEFAULT_RECOVERY_OPTIONAL_SECONDARY = "Optional: 20-30 min easy walk, mobility reset, or light bike if you want to move.";

const buildScheduleBufferRecovery = (label = "Recovery / schedule buffer") => ({
 type: "rest",
 label,
 nutri: NUTRITION_DAY_TYPES.recovery,
 isRecoverySlot: true,
 optionalSecondary: DEFAULT_RECOVERY_OPTIONAL_SECONDARY,
});

const resolveSessionPriorityScore = ({ session = null, architecture = "hybrid_performance" } = {}) => {
 const type = String(session?.type || "").toLowerCase();
 const text = sanitizeText([
 session?.label || "",
 session?.fallback || "",
 session?.run?.t || "",
 session?.run?.d || "",
 session?.swim?.focus || "",
 session?.swim?.setLine || "",
 session?.strengthDose || "",
 ].join(" "), 320).toLowerCase();
 let score = 50;
 if (!session || type === "rest" || session?.isRecoverySlot) return -999;
 if (/long-run/.test(type) || /\blong run|long ride|brick\b/.test(text)) score = 95;
 else if (/hard-run/.test(type) || /\bthreshold|interval|tempo|race-pace|quality\b/.test(text)) score = 90;
 else if (/^swim-/.test(type) && /\bthreshold|endurance\b/.test(text)) score = 84;
 else if (/^swim-/.test(type) && /\btechnique\b/.test(text)) score = 80;
 else if (/^swim-/.test(type)) score = 74;
 else if (/power|reactive-plyo|sprint-support/.test(type)) score = 78;
 else if (/run\+strength/.test(type)) score = 76;
 else if (/strength/.test(type) && /\bprimary|heavy|focus|bench|full-body|hypertrophy\b/.test(text)) score = 72;
 else if (/strength/.test(type)) score = 60;
 else if (/easy-run/.test(type)) score = 58;
 else if (/conditioning/.test(type)) score = 42;

 if (architecture === "race_prep_dominant" || architecture === "event_prep_upper_body_maintenance") {
 if (/run|long run|tempo|threshold|swim|ride|brick/.test(text) || /^swim-/.test(type)) score += 12;
 if (/strength/.test(type) && !/run\+strength/.test(type)) score -= 10;
 } else if (architecture === "strength_dominant") {
 if (/strength|power/.test(type)) score += 12;
 if (/conditioning|run/.test(type)) score -= 10;
 } else if (architecture === "body_comp_conditioning") {
 if (/strength/.test(type)) score += 10;
 if (/conditioning/.test(type)) score += 5;
 } else if (architecture === "maintenance_rebuild") {
 if (/tempo|threshold|interval|reactive|power/.test(text)) score -= 18;
 if (/hard-run|easy-run|long-run/.test(type) || /\brun|run\/walk\b/.test(text)) score += 10;
 if (/conditioning/.test(type)) score += 4;
 if (/strength/.test(type)) score += 2;
 } else if (architecture === "hybrid_performance") {
 if (/long run|tempo|threshold|primary strength|bench focus/.test(text)) score += 8;
 if (/conditioning/.test(type) && !/ride|bike|brick/.test(text)) score -= 6;
 }

 return score;
};

const inspectSessionCapabilities = (session = null) => {
 const type = String(session?.type || "").toLowerCase();
 const text = sanitizeText([
 session?.label || "",
 session?.fallback || "",
 session?.run?.t || "",
 session?.run?.d || "",
 session?.swim?.focus || "",
 session?.swim?.setLine || "",
 session?.strengthDose || "",
 ].join(" "), 320).toLowerCase();
 const swimCapable = Boolean(/^swim-/.test(type) || /\bswim|pool|open water|laps?\b/.test(text));
 const rideCapable = Boolean(/ride|bike|cycling|trainer|brick/.test(type) || /\bride|bike|cycling|trainer|brick|cadence\b/.test(text));
 const runCapable = Boolean(
 /hard-run|easy-run|long-run|run\+strength/.test(type)
 || (/\brun|jog|strides|threshold run|race-pace\b/.test(text) && !/\bbrick\b/.test(text))
 );
 return {
 strengthCapable: Boolean(/run\+strength|strength\+prehab|strength/.test(type) || /\bstrength|bench|squat|deadlift|press|hypertrophy|lift\b/.test(text)),
 enduranceCapable: Boolean(swimCapable || rideCapable || runCapable || /conditioning/.test(type) || /\bconditioning|aerobic|tempo|threshold\b/.test(text)),
 runCapable,
 swimCapable,
 rideCapable,
 brickLike: Boolean(/\bbrick|transition\b/.test(text)),
 qualityLike: Boolean(
  /hard-run/.test(type)
  || /^swim-threshold/.test(type)
  || /\btempo|threshold|interval|race-pace|quality\b/.test(text)
 ),
 longSession: Boolean(/long-run/.test(type) || /\blong run|long ride|brick\b/.test(text)),
 };
};

const chooseHybridScheduleSubset = (entries = [], targetCount = 0, { laneModel = null } = {}) => {
 const safeEntries = Array.isArray(entries) ? entries : [];
 const safeTargetCount = Number.isFinite(Number(targetCount)) ? Math.max(0, Math.min(safeEntries.length, Math.round(Number(targetCount)))) : 0;
 if (!safeTargetCount || safeEntries.length <= safeTargetCount) {
 return new Set(safeEntries.map((entry) => entry.dayKey));
 }
 const availableStrength = safeEntries.some((entry) => entry.strengthCapable);
 const availableRun = safeEntries.some((entry) => entry.runCapable);
 const availableSwim = safeEntries.some((entry) => entry.swimCapable);
 const availableRide = safeEntries.some((entry) => entry.rideCapable);
 const runningWeight = Number(laneModel?.runningLane?.roleWeight || 0);
 const strengthWeight = Number(laneModel?.strengthLane?.roleWeight || 0);
 const bodyCompWeight = Number(laneModel?.bodyCompLane?.roleWeight || 0);
 const runningLead = runningWeight > Math.max(strengthWeight, bodyCompWeight);
 const strengthLead = strengthWeight > Math.max(runningWeight, bodyCompWeight);
 const bodyCompLead = bodyCompWeight >= Math.max(runningWeight, strengthWeight) && bodyCompWeight > 0;
 let bestScore = -Infinity;
 let bestSet = new Set();

 const scoreSelection = (selection = []) => {
  const hasStrength = selection.some((entry) => entry.strengthCapable);
  const hasRun = selection.some((entry) => entry.runCapable);
  const hasSwim = selection.some((entry) => entry.swimCapable);
  const hasRide = selection.some((entry) => entry.rideCapable);
  const hasLongSession = selection.some((entry) => entry.longSession);
  const qualityCount = selection.filter((entry) => entry.qualityLike).length;
  const longCount = selection.filter((entry) => entry.longSession).length;
  const strengthCount = selection.filter((entry) => entry.strengthCapable).length;
  const enduranceLaneCount = [hasRun, hasSwim, hasRide].filter(Boolean).length;
  let score = selection.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
  if (availableStrength && hasStrength) score += 80;
  if (availableRun && hasRun) score += 140;
  if (availableSwim && hasSwim) score += 150;
  if (availableRide && hasRide) score += 140;
  if (hasStrength && enduranceLaneCount > 0) score += 56;
  if (enduranceLaneCount >= 2) score += 44 * enduranceLaneCount;
  if (hasLongSession) score += 24;
  if (runningLead) {
   if (hasLongSession) score += 55;
   if (qualityCount >= 1 && safeTargetCount >= 3) score += 35;
   if (safeTargetCount <= 2 && hasStrength) score += 35;
  }
  if (strengthLead) {
   score += strengthCount * 65;
   if (strengthCount >= Math.min(2, safeTargetCount)) score += 180;
   if (enduranceLaneCount > 0) score += 45;
   score -= longCount * 60;
   if (safeTargetCount <= 2 && strengthCount < 2) score -= 260;
  }
  if (bodyCompLead) {
   score += strengthCount * 55;
   if (strengthCount >= Math.min(2, safeTargetCount)) score += 170;
   if (enduranceLaneCount > 0) score += 55;
   if (safeTargetCount <= 3) score -= longCount * 75;
  }
  return score;
 };

 const search = (index = 0, selection = []) => {
 if (selection.length === safeTargetCount) {
 const score = scoreSelection(selection);
 if (score > bestScore) {
 bestScore = score;
 bestSet = new Set(selection.map((entry) => entry.dayKey));
 }
 return;
 }
 if (index >= safeEntries.length) return;
 const remainingSlots = safeTargetCount - selection.length;
 const remainingEntries = safeEntries.length - index;
 if (remainingEntries < remainingSlots) return;
 search(index + 1, [...selection, safeEntries[index]]);
 search(index + 1, selection);
 };

 search(0, []);
 return bestSet;
};

const chooseBodyCompScheduleSubset = (entries = [], targetCount = 0) => {
 const safeEntries = Array.isArray(entries) ? entries : [];
 const safeTargetCount = Number.isFinite(Number(targetCount)) ? Math.max(0, Math.min(safeEntries.length, Math.round(Number(targetCount)))) : 0;
 if (!safeTargetCount || safeEntries.length <= safeTargetCount) {
 return new Set(safeEntries.map((entry) => entry.dayKey));
 }
 let bestScore = -Infinity;
 let bestSet = new Set();

 const scoreSelection = (selection = []) => {
 const strengthCount = selection.filter((entry) => entry.strengthCapable).length;
 const conditioningCount = selection.filter((entry) => entry.enduranceCapable && !entry.strengthCapable).length;
 let score = selection.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
 score += strengthCount * 90;
 if (safeTargetCount >= 3 && strengthCount >= 2) score += 160;
 if (safeTargetCount <= 2 && strengthCount >= 1) score += 90;
 if (conditioningCount >= 1) score += 70;
 return score;
 };

 const search = (index = 0, selection = []) => {
 if (selection.length === safeTargetCount) {
 const score = scoreSelection(selection);
 if (score > bestScore) {
 bestScore = score;
 bestSet = new Set(selection.map((entry) => entry.dayKey));
 }
 return;
 }
 if (index >= safeEntries.length) return;
 const remainingSlots = safeTargetCount - selection.length;
 const remainingEntries = safeEntries.length - index;
 if (remainingEntries < remainingSlots) return;
 search(index + 1, [...selection, safeEntries[index]]);
 search(index + 1, selection);
 };

 search(0, []);
 return bestSet;
};

const chooseEnduranceScheduleSubset = (entries = [], targetCount = 0) => {
 const safeEntries = Array.isArray(entries) ? entries : [];
 const safeTargetCount = Number.isFinite(Number(targetCount)) ? Math.max(0, Math.min(safeEntries.length, Math.round(Number(targetCount)))) : 0;
 if (!safeTargetCount || safeEntries.length <= safeTargetCount) {
  return new Set(safeEntries.map((entry) => entry.dayKey));
 }
 let bestScore = -Infinity;
 let bestSet = new Set();

 const scoreSelection = (selection = []) => {
  const enduranceCount = selection.filter((entry) => entry.enduranceCapable).length;
  const supportRunCount = selection.filter((entry) => entry.runCapable && !entry.qualityLike && !entry.longSession).length;
  const qualityCount = selection.filter((entry) => entry.qualityLike).length;
  const longCount = selection.filter((entry) => entry.longSession).length;
  const strengthCount = selection.filter((entry) => entry.strengthCapable).length;
  let score = selection.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
  score += enduranceCount * 120;
  if (enduranceCount >= Math.min(2, safeTargetCount)) score += 110;
  if (longCount >= 1) score += 85;
  if (safeTargetCount <= 2 && supportRunCount >= 1) score += 45;
  if (safeTargetCount >= 3 && qualityCount >= 1) score += 55;
  if (safeTargetCount <= 2 && qualityCount >= 1) score -= 45;
  score -= strengthCount * 70;
  return score;
 };

 const search = (index = 0, selection = []) => {
  if (selection.length === safeTargetCount) {
   const score = scoreSelection(selection);
   if (score > bestScore) {
    bestScore = score;
    bestSet = new Set(selection.map((entry) => entry.dayKey));
   }
   return;
  }
  if (index >= safeEntries.length) return;
  const remainingSlots = safeTargetCount - selection.length;
  const remainingEntries = safeEntries.length - index;
  if (remainingEntries < remainingSlots) return;
  search(index + 1, [...selection, safeEntries[index]]);
  search(index + 1, selection);
 };

 search(0, []);
 return bestSet;
};

const chooseStrengthScheduleSubset = (entries = [], targetCount = 0) => {
 const safeEntries = Array.isArray(entries) ? entries : [];
 const safeTargetCount = Number.isFinite(Number(targetCount)) ? Math.max(0, Math.min(safeEntries.length, Math.round(Number(targetCount)))) : 0;
 if (!safeTargetCount || safeEntries.length <= safeTargetCount) {
  return new Set(safeEntries.map((entry) => entry.dayKey));
 }
 let bestScore = -Infinity;
 let bestSet = new Set();

 const scoreSelection = (selection = []) => {
  const strengthCount = selection.filter((entry) => entry.strengthCapable).length;
  const conditioningCount = selection.filter((entry) => entry.enduranceCapable && !entry.strengthCapable).length;
  let score = selection.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
  score += strengthCount * 140;
  if (strengthCount >= Math.min(3, safeTargetCount)) score += 120;
  if (safeTargetCount >= 3 && strengthCount >= 2) score += 90;
  if (conditioningCount >= 1) score += 18;
  if (conditioningCount > 1) score -= (conditioningCount - 1) * 18;
  return score;
 };

 const search = (index = 0, selection = []) => {
  if (selection.length === safeTargetCount) {
   const score = scoreSelection(selection);
   if (score > bestScore) {
    bestScore = score;
    bestSet = new Set(selection.map((entry) => entry.dayKey));
   }
   return;
  }
  if (index >= safeEntries.length) return;
  const remainingSlots = safeTargetCount - selection.length;
  const remainingEntries = safeEntries.length - index;
  if (remainingEntries < remainingSlots) return;
  search(index + 1, [...selection, safeEntries[index]]);
  search(index + 1, selection);
 };

 search(0, []);
 return bestSet;
};

const chooseTriathlonScheduleSubset = (entries = [], targetCount = 0) => {
 const safeEntries = Array.isArray(entries) ? entries : [];
 const safeTargetCount = Number.isFinite(Number(targetCount)) ? Math.max(0, Math.min(safeEntries.length, Math.round(Number(targetCount)))) : 0;
 if (!safeTargetCount || safeEntries.length <= safeTargetCount) {
  return new Set(safeEntries.map((entry) => entry.dayKey));
 }
 let bestScore = -Infinity;
 let bestSet = new Set();

 const scoreSelection = (selection = []) => {
  const hasSwim = selection.some((entry) => entry.swimCapable);
  const hasRide = selection.some((entry) => entry.rideCapable);
  const hasRun = selection.some((entry) => entry.runCapable);
  const hasBrick = selection.some((entry) => entry.brickLike);
  const strengthCount = selection.filter((entry) => entry.strengthCapable).length;
  let score = selection.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
  if (hasSwim) score += 150;
  if (hasRide) score += 150;
  if (hasRun) score += 150;
  if (hasSwim && hasRide && hasRun) score += 220;
  if (hasBrick) score += 55;
  if (strengthCount >= 1) score += 18;
  return score;
 };

 const search = (index = 0, selection = []) => {
  if (selection.length === safeTargetCount) {
   const score = scoreSelection(selection);
   if (score > bestScore) {
    bestScore = score;
    bestSet = new Set(selection.map((entry) => entry.dayKey));
   }
   return;
  }
  if (index >= safeEntries.length) return;
  const remainingSlots = safeTargetCount - selection.length;
  const remainingEntries = safeEntries.length - index;
  if (remainingEntries < remainingSlots) return;
  search(index + 1, [...selection, safeEntries[index]]);
  search(index + 1, selection);
 };

 search(0, []);
 return bestSet;
};

const resolveScheduleSubsetKeepSet = ({
 scoredEntries = [],
 targetCount = 0,
 architecture = "hybrid_performance",
 goalLaneModel = null,
 primaryGoalFamily = "",
 primaryDomain = "",
} = {}) => {
 const safeEntries = Array.isArray(scoredEntries) ? scoredEntries : [];
 const safeTargetCount = Number.isFinite(Number(targetCount)) ? Math.max(0, Math.min(safeEntries.length, Math.round(Number(targetCount)))) : 0;
 if (!safeTargetCount || safeEntries.length <= safeTargetCount) {
  return new Set(safeEntries.map((entry) => entry.dayKey));
 }
 const hybridLikeWeek = Boolean(primaryGoalFamily === "hybrid" || goalLaneModel?.meaningfulHybrid);
 const pureRunningWeek = !hybridLikeWeek
  && goalLaneModel?.runningLane?.active
  && !goalLaneModel?.strengthLane?.active
  && !goalLaneModel?.bodyCompLane?.active;
 const pureStrengthWeek = !hybridLikeWeek
  && goalLaneModel?.strengthLane?.active
  && !goalLaneModel?.runningLane?.active
  && !goalLaneModel?.bodyCompLane?.active;
 const pureBodyCompWeek = !hybridLikeWeek
  && goalLaneModel?.bodyCompLane?.active
  && !goalLaneModel?.runningLane?.active;
 return hybridLikeWeek
  ? chooseHybridScheduleSubset(safeEntries, safeTargetCount, { laneModel: goalLaneModel })
  : primaryDomain === "triathlon_multisport"
  ? chooseTriathlonScheduleSubset(safeEntries, safeTargetCount)
  : pureRunningWeek
  ? chooseEnduranceScheduleSubset(safeEntries, safeTargetCount)
  : pureStrengthWeek
  ? chooseStrengthScheduleSubset(safeEntries, safeTargetCount)
  : pureBodyCompWeek || architecture === "body_comp_conditioning"
  ? chooseBodyCompScheduleSubset(safeEntries, safeTargetCount)
  : new Set(
   safeEntries
    .slice(Math.max(0, safeEntries.length - safeTargetCount))
    .map((entry) => entry.dayKey)
  );
};

const limitDayTemplatesToScheduleReality = ({
 dayTemplates = {},
 targetDays = 0,
 architecture = "hybrid_performance",
 goalLaneModel = null,
 primaryGoalFamily = "",
 primaryDomain = "",
} = {}) => {
 const safeTargetDays = Number.isFinite(Number(targetDays)) ? Math.max(0, Math.min(7, Math.round(Number(targetDays)))) : 0;
 if (safeTargetDays < 2) return { dayTemplates, effects: [], changed: false };
 const next = clonePlainValue(dayTemplates || {});
 const activeEntries = Object.entries(next)
 .filter(([, session]) => session && session.type !== "rest" && !session?.isRecoverySlot);
 if (activeEntries.length <= safeTargetDays) {
 return { dayTemplates: next, effects: [], changed: false };
 }
 const scoredEntries = activeEntries
 .map(([dayKey, session]) => ({
 dayKey,
 session,
 score: resolveSessionPriorityScore({ session, architecture }),
 ...inspectSessionCapabilities(session),
 }))
 .sort((left, right) => left.score - right.score);
 const keepSet = resolveScheduleSubsetKeepSet({
  scoredEntries,
  targetCount: safeTargetDays,
  architecture,
  goalLaneModel,
  primaryGoalFamily,
  primaryDomain,
 });
 scoredEntries
 .filter(({ dayKey }) => !keepSet.has(dayKey))
 .forEach(({ dayKey }) => {
 next[dayKey] = buildScheduleBufferRecovery();
 });
 return {
 dayTemplates: next,
 effects: [`The week was trimmed to match a realistic ${safeTargetDays}-day schedule.`],
 changed: true,
 };
};

const resolveExplicitAvailableTrainingDayKeys = (trainingContext = null) => (
 normalizeTrainingWeekdayAvailability(
  trainingContext?.weekdayAvailability?.confirmed
   ? (trainingContext?.weekdayAvailability?.value || [])
   : []
 )
  .map((value) => TRAINING_WEEKDAY_TO_PLANNER_DAY?.[value])
  .filter((dayKey) => Number.isInteger(dayKey))
);

const resolveExplicitAvailabilityDayPreferenceOrder = (session = null) => {
 const capabilities = inspectSessionCapabilities(session);
 const type = String(session?.type || "").toLowerCase();
 if (capabilities.longSession) return [6, 0, 5, 4, 1, 3, 2];
 if (capabilities.qualityLike) return [4, 2, 3, 5, 1, 6, 0];
 if (type === "run+strength") return [1, 3, 2, 4, 5, 6, 0];
 if (type === "strength+prehab") return [1, 3, 5, 2, 4, 6, 0];
 if (type === "conditioning") return [2, 4, 3, 5, 1, 6, 0];
 if (capabilities.enduranceCapable) return [2, 4, 1, 3, 5, 6, 0];
 return [...PLANNER_DAY_ORDER];
};

const scoreExplicitAvailabilityPlacement = ({
 session = null,
 sourceDayKey = null,
 targetDayKey = null,
 assignedSessions = {},
 selectedDayKeys = [],
} = {}) => {
 if (!Number.isInteger(Number(targetDayKey))) return -Infinity;
 const safeTargetDayKey = Number(targetDayKey);
 const safeSelectedKeys = Array.isArray(selectedDayKeys) ? selectedDayKeys : [];
 if (!safeSelectedKeys.includes(safeTargetDayKey)) return -Infinity;

 const capabilities = inspectSessionCapabilities(session);
 const type = String(session?.type || "").toLowerCase();
 const preferenceOrder = resolveExplicitAvailabilityDayPreferenceOrder(session);
 const preferenceIndex = preferenceOrder.indexOf(safeTargetDayKey);
 let score = preferenceIndex >= 0 ? 120 - (preferenceIndex * 10) : 40;

 if (Number(sourceDayKey) === safeTargetDayKey) score += 8;
 if (capabilities.longSession) {
  if ([6, 0].includes(safeTargetDayKey)) score += 36;
  else if (safeTargetDayKey === 5) score += 18;
  else score -= 20;
 }
 if (capabilities.qualityLike && [2, 4].includes(safeTargetDayKey)) score += 18;
 if (type === "strength+prehab" && [1, 3, 5].includes(safeTargetDayKey)) score += 10;
 if (type === "run+strength" && [1, 3].includes(safeTargetDayKey)) score += 12;

 const previousSession = assignedSessions?.[safeTargetDayKey - 1] || null;
 const nextSession = assignedSessions?.[safeTargetDayKey + 1] || null;
 const adjacentSessions = [previousSession, nextSession].filter(Boolean);
 const lowerBodyLoad = String(session?.lowerBodyLoad || "").toLowerCase();
 adjacentSessions.forEach((adjacent) => {
  const adjacentCapabilities = inspectSessionCapabilities(adjacent);
  const adjacentLowerBodyLoad = String(adjacent?.lowerBodyLoad || "").toLowerCase();
  if (capabilities.longSession && adjacentCapabilities.qualityLike) score -= 24;
  if (capabilities.qualityLike && adjacentCapabilities.longSession) score -= 24;
  if (["moderate", "high"].includes(lowerBodyLoad) && (adjacentCapabilities.qualityLike || adjacentCapabilities.longSession)) score -= 16;
  if ((capabilities.qualityLike || capabilities.longSession) && ["moderate", "high"].includes(adjacentLowerBodyLoad)) score -= 16;
 });

 return score;
};

const applyExplicitWeekdayAvailability = ({
 dayTemplates = {},
 availableDayKeys = [],
 architecture = "hybrid_performance",
 goalLaneModel = null,
 primaryGoalFamily = "",
 primaryDomain = "",
} = {}) => {
 const selectedDayKeys = dedupeStrings(
  (Array.isArray(availableDayKeys) ? availableDayKeys : [])
   .map((dayKey) => Number(dayKey))
   .filter((dayKey) => Number.isInteger(dayKey))
   .map((dayKey) => String(dayKey))
 ).map((dayKey) => Number(dayKey));

 const baseTemplates = clonePlainValue(dayTemplates || {});
 if (!selectedDayKeys.length) {
  return {
   dayTemplates: Object.fromEntries(
    Object.entries(baseTemplates || {}).map(([dayKey, session]) => (
     session && (session.type === "rest" || session?.isRecoverySlot)
      ? [dayKey, {
        ...session,
        optionalSecondary: session?.optionalSecondary || DEFAULT_RECOVERY_OPTIONAL_SECONDARY,
      }]
      : [dayKey, session]
    ))
   ),
   changed: false,
   effects: [],
  };
 }

 const activeEntries = Object.entries(baseTemplates || {})
  .filter(([, session]) => session && session.type !== "rest" && !session?.isRecoverySlot)
  .map(([dayKey, session]) => ({
   dayKey: Number(dayKey),
   session,
   score: resolveSessionPriorityScore({ session, architecture }),
   ...inspectSessionCapabilities(session),
  }));
 const rankedKeepCandidates = [...activeEntries].sort((left, right) => left.score - right.score);

 const selectedDaySet = new Set(selectedDayKeys);
 const effects = [];
 let keepEntries = [...activeEntries].sort((left, right) => right.score - left.score);

 if (activeEntries.length > selectedDayKeys.length) {
  const keepSet = resolveScheduleSubsetKeepSet({
   scoredEntries: rankedKeepCandidates,
   targetCount: selectedDayKeys.length,
   architecture,
   goalLaneModel,
   primaryGoalFamily,
   primaryDomain,
  });
  const droppedEntries = activeEntries.filter((entry) => !keepSet.has(entry.dayKey));
  keepEntries = activeEntries
   .filter((entry) => keepSet.has(entry.dayKey))
   .sort((left, right) => right.score - left.score);
  if (droppedEntries.length) {
   effects.push(`The week now fits your usual ${selectedDayKeys.length}-day window, with lower-priority work pushed into recovery slots.`);
  }
 }

 const next = Object.fromEntries(
  PLANNER_DAY_ORDER.map((dayKey) => {
   const currentSession = baseTemplates?.[dayKey] || null;
   if (currentSession && (currentSession.type === "rest" || currentSession?.isRecoverySlot)) {
    return [dayKey, {
     ...currentSession,
     optionalSecondary: currentSession?.optionalSecondary || DEFAULT_RECOVERY_OPTIONAL_SECONDARY,
    }];
   }
   return [dayKey, buildScheduleBufferRecovery(selectedDaySet.has(dayKey) ? "Active Recovery" : "Recovery / optional movement")];
  })
 );

 const assignedSessions = {};
 let shiftedCount = 0;
 keepEntries.forEach((entry) => {
  const remainingDayKeys = selectedDayKeys.filter((dayKey) => !assignedSessions?.[dayKey]);
  if (!remainingDayKeys.length) return;
  const bestDayKey = remainingDayKeys
   .map((dayKey) => ({
    dayKey,
    score: scoreExplicitAvailabilityPlacement({
     session: entry.session,
     sourceDayKey: entry.dayKey,
     targetDayKey: dayKey,
     assignedSessions,
     selectedDayKeys,
   }),
   }))
   .sort((left, right) => right.score - left.score)[0]?.dayKey;
  if (!Number.isInteger(bestDayKey)) return;
  if (entry.dayKey !== bestDayKey) shiftedCount += 1;
  assignedSessions[bestDayKey] = normalizeSessionEntryLabel({
   ...entry.session,
   availabilityAdaptation: entry.dayKey === bestDayKey
    ? {
      source: "weekday_availability_confirmed",
      anchoredDayKey: bestDayKey,
     }
    : {
      source: "weekday_availability_shift",
      fromDayKey: entry.dayKey,
      toDayKey: bestDayKey,
     },
  });
 });

 Object.entries(assignedSessions).forEach(([dayKey, session]) => {
  next[dayKey] = session;
 });

 if (shiftedCount > 0) {
  effects.push(`Primary work now lands on ${resolveWeekdayLabelList(selectedDayKeys).join(", ")} when those days are available.`);
 }
 const weekendAvailable = selectedDaySet.has(6) || selectedDaySet.has(0);
 const longRunPlaced = Object.entries(assignedSessions).find(([, session]) => inspectSessionCapabilities(session).longSession) || null;
 if (weekendAvailable && longRunPlaced && [6, 0].includes(Number(longRunPlaced[0]))) {
  effects.push(`Long sessions now bias to the weekend when that window is available.`);
 }

 return {
  dayTemplates: next,
  changed: JSON.stringify(next) !== JSON.stringify(baseTemplates),
  effects: dedupeStrings(effects).slice(0, 2),
 };
};

const resolveFriendlyStrengthSlotLabel = (slot = "") => {
 const safeSlot = String(slot || "").trim().toUpperCase();
 return safeSlot ? `Full-Body Strength ${safeSlot}` : "Full-Body Strength";
};

const resolveFriendlySessionLabel = (label = "", context = {}) => {
 const safeLabel = sanitizeText(label, 120);
 const safeSlot = String(context?.strSess || "").trim().toUpperCase();
 if (!safeLabel) return safeSlot ? resolveFriendlyStrengthSlotLabel(safeSlot) : "Planned session";
 if (/^strength ([ab])$/i.test(safeLabel)) return resolveFriendlyStrengthSlotLabel(safeLabel.match(/^strength ([ab])$/i)?.[1]);
 if (/^strength priority ([ab])$/i.test(safeLabel)) return resolveFriendlyStrengthSlotLabel(safeLabel.match(/^strength priority ([ab])$/i)?.[1]);
 if (/^metabolic strength ([ab])$/i.test(safeLabel)) return `Strength Circuit ${String(safeLabel.match(/^metabolic strength ([ab])$/i)?.[1] || "").toUpperCase()}`;
 if (/^upper push\/pull strength$/i.test(safeLabel)) return "Upper-Body Push/Pull Strength";
 if (/^quality run \+ strength$/i.test(safeLabel)) return "Quality Run + Strength Finish";
 if (/^run \+ strength$/i.test(safeLabel)) return "Easy Run + Strength Finish";
 if (/^conditioning \/ otf$/i.test(safeLabel)) return "Conditioning Intervals";
 if (/^conditioning \(low-friction\)$/i.test(safeLabel)) return "Low-Friction Conditioning";
 if (/^supportive conditioning run$/i.test(safeLabel)) return "Easy Conditioning Run";
 if (/^supportive run\/walk$/i.test(safeLabel)) return "Easy Run/Walk";
 if (/^strength focus$/i.test(safeLabel)) return "Full-Body Strength Focus";
 if (/^short version strength$/i.test(safeLabel)) return "Short Full-Body Strength A";
 if (/^short version strength ([ab])$/i.test(safeLabel)) return `Short Full-Body Strength ${String(safeLabel.match(/^short version strength ([ab])$/i)?.[1] || "").toUpperCase()}`;
 return safeLabel;
};

const normalizeSessionEntryLabel = (session = null) => {
 if (!session || typeof session !== "object") return session;
 return {
 ...session,
 label: resolveFriendlySessionLabel(session?.label || "", session),
 };
};

const getAdaptiveDecisionPointId = (entry = null) => entry?.id || "";

const buildAdaptiveScheduleReliability = (inconsistencyRisk = "medium") => (
  inconsistencyRisk === "high"
    ? "fragile"
    : inconsistencyRisk === "low"
    ? "stable"
    : "variable"
);

const buildAdaptiveWeeklyStressState = ({
  lowEnergy = false,
  highStress = false,
  lowConfidence = false,
} = {}) => (
  lowEnergy || highStress || lowConfidence
    ? "strained"
    : "stable"
);

const buildAdaptivePolicyContext = ({
  goals = [],
  primary = null,
  architecture = "",
  planArchetypeOverlay = null,
  trainingContext = null,
  trainingDaysPerWeek = 0,
  inconsistencyRisk = "medium",
  activeIssueContext = null,
  runningGoalActive = false,
  strengthGoalActive = false,
  strengthPriority = false,
  hybridAthlete = false,
  timeCrunched = false,
  travelHeavy = false,
  outdoorPreferred = false,
  lowEnergy = false,
  highStress = false,
  lowConfidence = false,
  reEntry = false,
  cutbackWeek = false,
  dayTemplates = {},
  currentPhase = "",
} = {}) => ({
  ...(() => {
    const safeGoals = Array.isArray(goals) ? goals : [];
    const scheduleReliability = buildAdaptiveScheduleReliability(inconsistencyRisk);
    const weeklyStressState = buildAdaptiveWeeklyStressState({ lowEnergy, highStress, lowConfidence });
    const secondaryGoalCategories = safeGoals
      .filter((goal) => goal?.active !== false)
      .slice(1)
      .map((goal) => String(goal?.category || "").trim())
      .filter(Boolean);
    const physiqueGoalActive = Boolean(
      safeGoals.some((goal) => ["body_comp", "fat_loss", "appearance", "physique"].includes(String(goal?.category || "").toLowerCase()))
    );
    const hybridContext = buildHybridAdaptiveContext({
      goals: safeGoals,
      primaryGoalCategory: primary?.category || "",
      secondaryGoalCategories,
      architecture,
      planArchetypeId: planArchetypeOverlay?.planArchetypeId || primary?.resolvedGoal?.planArchetypeId || "",
      experienceLevel: trainingContext?.experienceLevel?.value || "",
      scheduleReliability,
      runningGoalActive,
      strengthGoalActive,
      physiqueGoalActive,
      travelHeavy,
      timeCrunched,
      painSensitive: Boolean(activeIssueContext?.activeConstraints?.length),
      weeklyStressState,
      currentPhase,
      dayTemplates,
    });
    return {
      primaryGoalCategory: primary?.category || "general_fitness",
      architecture,
      planArchetypeId: planArchetypeOverlay?.planArchetypeId || primary?.resolvedGoal?.planArchetypeId || "",
      experienceLevel: trainingContext?.experienceLevel?.value || "",
      scheduleReliability,
      environmentMode: trainingContext?.environment?.value || "",
      equipmentAccess: trainingContext?.equipmentAccess?.value || "",
      sessionDuration: trainingContext?.sessionDuration?.value || "",
      trainingDaysPerWeek,
      hybridAthlete,
      travelHeavy,
      timeCrunched,
      painSensitive: Boolean(activeIssueContext?.activeConstraints?.length),
      runningGoalActive,
      strengthGoalActive,
      physiqueGoalActive,
      strengthOrPhysiqueGoalActive: Boolean(strengthGoalActive || physiqueGoalActive),
      strengthPriority,
      outdoorPreferred,
      weeklyStressState,
      reEntry,
      cutbackWeek,
      ...hybridContext,
    };
  })(),
});

const appendAdaptiveTrace = (collection = [], trace = null) => {
  if (!trace) return Array.isArray(collection) ? collection : [];
  return [...(Array.isArray(collection) ? collection : []), clonePlainValue(trace)];
};

const applyAdaptiveProgressionBand = ({
  intent = {},
  actionId = "",
  architecture = "",
} = {}) => {
  const next = clonePlainValue(intent || {});
  if (actionId === "conservative_band") {
    if (next.aggressionLevel !== "rebuild") next.aggressionLevel = "controlled";
    if (next.recoveryBias === "low") next.recoveryBias = "moderate";
    if (next.volumeBias === "expanded") next.volumeBias = "baseline";
    if (next.performanceBias === "high") next.performanceBias = "moderate";
    return next;
  }
  if (actionId === "progressive_band") {
    if (next.aggressionLevel !== "rebuild") next.aggressionLevel = "progressive";
    if (next.recoveryBias === "moderate") next.recoveryBias = "low";
    if (next.volumeBias === "baseline") next.volumeBias = "expanded";
    if (["race_prep_dominant", "strength_dominant", "event_prep_upper_body_maintenance"].includes(architecture) && next.performanceBias !== "low") {
      next.performanceBias = "high";
    } else if (next.performanceBias === "low") {
      next.performanceBias = "moderate";
    }
  }
  return next;
};

const applyAdaptiveDeloadWindow = ({
  intent = {},
  actionId = "",
} = {}) => {
  const next = clonePlainValue(intent || {});
  if (actionId !== "pull_forward_deload") return next;
  next.adjusted = true;
  next.status = "adjusted";
  next.aggressionLevel = next.aggressionLevel === "rebuild" ? "rebuild" : "controlled";
  next.recoveryBias = "high";
  next.volumeBias = "reduced";
  next.performanceBias = "low";
  next.weeklyConstraints = dedupeStrings([
    ...(next.weeklyConstraints || []),
    "Recovery was pulled forward to protect adherence and consistency.",
  ]);
  return next;
};

const applyShortSeparateSessionFormat = (dayTemplates = {}) => Object.fromEntries(
  Object.entries(dayTemplates || {}).map(([dayKey, session]) => {
    if (!session || session?.type === "rest") return [dayKey, session];
    const next = { ...session };
    if (["run+strength", "strength+prehab"].includes(next.type)) {
      next.strengthDose = "20-30 min concise strength";
      next.optionalSecondary = "Optional: stop after the main work if the day is busy.";
    } else if (next.type === "conditioning") {
      next.label = "Low-Friction Conditioning";
      next.fallback = "15-20 min simple conditioning, brisk walk, or bike";
    }
    return [dayKey, normalizeSessionEntryLabel(next)];
  })
);

const applyHybridSessionFormatChoice = ({
  dayTemplates = {},
  actionId = "",
  runningGoalActive = false,
} = {}) => {
  if (actionId === "favor_mixed_sessions") {
    return applyStackedMixedSessions({
      dayTemplates,
      runningGoalActive,
    });
  }
  if (actionId === "favor_short_split_sessions") {
    return applyShortSeparateSessionFormat(dayTemplates);
  }
  return clonePlainValue(dayTemplates || {});
};

const buildAdaptiveRecoveryBuffer = (label = "Recovery / schedule buffer") => ({
  type: "rest",
  label,
  nutri: NUTRITION_DAY_TYPES.recovery,
  isRecoverySlot: true,
});

const applyStackedMixedSessions = ({
  dayTemplates = {},
  runningGoalActive = false,
} = {}) => {
  const next = clonePlainValue(dayTemplates || {});
  const entries = Object.entries(next)
    .map(([dayKey, session]) => ({ dayKey, session }))
    .filter((entry) => entry.session && entry.session.type !== "rest");
  const existingHybrid = entries.find((entry) => entry.session?.type === "run+strength");
  const supportDay = entries.find((entry) => ["conditioning", "easy-run"].includes(String(entry.session?.type || "")) && entry.dayKey !== existingHybrid?.dayKey);
  if (existingHybrid && supportDay) {
    next[existingHybrid.dayKey] = normalizeSessionEntryLabel({
      ...existingHybrid.session,
      label: "Condensed Hybrid Session",
      strengthDose: "20-30 min concise strength",
      optionalSecondary: "Optional: end the session after the main work if time is tight.",
    });
    next[supportDay.dayKey] = buildAdaptiveRecoveryBuffer();
    return next;
  }
  const strengthDay = entries.find((entry) => entry.session?.type === "strength+prehab");
  const enduranceDay = entries.find((entry) => ["easy-run", "conditioning"].includes(String(entry.session?.type || "")) && entry.dayKey !== strengthDay?.dayKey);
  if (!strengthDay || !enduranceDay) return next;
  if (runningGoalActive && enduranceDay.session?.type === "easy-run") {
    next[strengthDay.dayKey] = normalizeSessionEntryLabel({
      ...strengthDay.session,
      type: "run+strength",
      label: "Condensed Run + Strength",
      run: clonePlainValue(enduranceDay.session?.run || { t: "Easy", d: "20-25 min" }),
      nutri: NUTRITION_DAY_TYPES.hybridSupport,
      strengthDose: "20-30 min concise strength",
      optionalSecondary: "Optional: finish after the main lifts if the day is packed.",
    });
  } else {
    next[strengthDay.dayKey] = normalizeSessionEntryLabel({
      ...strengthDay.session,
      label: "Condensed Strength + Conditioning",
      strengthDose: "20-30 min concise strength",
      optionalSecondary: "Finish with 10-15 min easy conditioning only if time allows.",
    });
  }
  next[enduranceDay.dayKey] = buildAdaptiveRecoveryBuffer();
  return next;
};

const applyTravelSubstitutionSet = ({
  dayTemplates = {},
  actionId = "",
} = {}) => Object.fromEntries(
  Object.entries(dayTemplates || {}).map(([dayKey, session]) => {
    if (!session || session?.type === "rest" || actionId === "default_substitutions") {
      return [dayKey, session];
    }
    const next = { ...session };
    if (actionId === "hotel_gym_substitutions") {
      if (isRunSessionType(next?.type) || next?.type === "conditioning") {
        return [dayKey, buildConditioningSession({
          label: "Hotel Gym Conditioning",
          detail: "20-30 min treadmill, bike, rower, or incline walk",
          lowImpact: !/hard-run/.test(String(next?.type || "")),
        })];
      }
      if (/strength/.test(String(next?.type || ""))) {
        next.label = "Hotel Gym Strength";
        next.strengthDose = "25-35 min dumbbell or machine strength";
      }
      return [dayKey, normalizeSessionEntryLabel(next)];
    }
    if (actionId === "outdoor_endurance_substitutions") {
      if (isRunSessionType(next?.type)) {
        next.label = `Outdoor ${sanitizeText(next.label || "Endurance session", 120)}`;
        next.optionalSecondary = "Take this outside for an easy walk, run, or hill session.";
        return [dayKey, normalizeSessionEntryLabel(next)];
      }
      if (/strength/.test(String(next?.type || ""))) {
        next.label = "Outdoor Strength Circuit";
        next.strengthDose = "20-30 min bodyweight, band, or park-bench circuit";
        next.optionalSecondary = "Use a walk or easy jog as the warm-up and cooldown.";
        return [dayKey, normalizeSessionEntryLabel(next)];
      }
      return [dayKey, buildConditioningSession({
        label: "Outdoor Conditioning",
        detail: "20-30 min brisk walk, easy run, hill walk, or outdoor circuit",
        lowImpact: true,
      })];
    }
    if (actionId === "minimal_equipment_substitutions") {
      if (/strength/.test(String(next?.type || ""))) {
        next.label = "Minimal-Equipment Strength Circuit";
        next.strengthDose = "20-30 min bodyweight, band, or single-dumbbell work";
        next.optionalSecondary = "Keep transitions tight and stop at the minimum effective work.";
        return [dayKey, normalizeSessionEntryLabel(next)];
      }
      if (next?.type === "conditioning") {
        return [dayKey, buildConditioningSession({
          label: "Minimal-Equipment Conditioning",
          detail: "15-25 min walk, jog, jump-rope, or simple interval circuit",
          lowImpact: true,
        })];
      }
      return [dayKey, normalizeSessionEntryLabel(next)];
    }
    return [dayKey, normalizeSessionEntryLabel(next)];
  })
);

const applyHybridBalanceTemplate = ({
  dayTemplates = {},
  actionId = "",
} = {}) => {
  const next = clonePlainValue(dayTemplates || {});
  if (actionId === "run_supportive_hybrid") {
    if (next[1] && next[1].type === "run+strength") {
      next[1] = normalizeSessionEntryLabel({
        ...next[1],
        label: "Key Run + Light Strength Finish",
        strengthDose: "15-20 min upper-body and trunk strength",
        optionalSecondary: "Keep lower-body load light so the key run still lands cleanly.",
      });
    }
    if (next[3] && /strength/.test(String(next[3]?.type || ""))) {
      next[3] = normalizeSessionEntryLabel({
        ...next[3],
        label: "Strength Support (Upper-Body Bias)",
        strengthDose: "20-30 min upper-body and trunk strength",
        optionalSecondary: "Keep lower-body work light before the next key run.",
      });
    }
    if (next[2] && next[2].type === "conditioning") {
      next[2] = normalizeSessionEntryLabel({
        type: "easy-run",
        label: "Easy Endurance Support",
        run: { t: "Easy", d: "20-30 min zone-2" },
        nutri: NUTRITION_DAY_TYPES.runEasy,
        optionalSecondary: "Optional: 5 min mobility reset after the run.",
      });
    }
    if (next[5] && /strength/.test(String(next[5]?.type || ""))) {
      next[5] = normalizeSessionEntryLabel({
        ...next[5],
        label: "Strength Maintenance",
        strengthDose: "20-30 min maintenance strength",
      });
    }
    return next;
  }
  if (actionId === "strength_supportive_hybrid") {
    if (next[2]) {
      next[2] = normalizeSessionEntryLabel({
        type: "strength+prehab",
        label: "Strength + Conditioning Primer",
        strSess: "A",
        nutri: NUTRITION_DAY_TYPES.hybridSupport,
        strengthDose: "25-35 min strength",
        optionalSecondary: "Optional: 10 min easy aerobic finish.",
      });
    }
    if (next[4] && next[4].type === "hard-run") {
      next[4] = normalizeSessionEntryLabel({
        ...next[4],
        label: "Supportive Quality Run",
        run: { ...(next[4].run || {}), d: "15-20 min controlled quality" },
        optionalSecondary: "Keep the run crisp without turning it into a second weekly peak.",
      });
    }
    if (next[6] && isRunSessionType(next[6]?.type)) {
      next[6] = normalizeSessionEntryLabel({
        ...next[6],
        label: "Supportive Endurance (Short)",
        run: { ...(next[6].run || {}), d: "15-20 min easy" },
      });
    }
  }
  return next;
};

const applyHybridDeloadWindow = ({
  intent = {},
  actionId = "",
} = {}) => {
  const next = clonePlainValue(intent || {});
  if (actionId !== "pull_forward_hybrid_deload") return next;
  next.adjusted = true;
  next.status = "adjusted";
  next.aggressionLevel = next.aggressionLevel === "rebuild" ? "rebuild" : "controlled";
  next.recoveryBias = "high";
  next.volumeBias = "reduced";
  next.performanceBias = "low";
  next.weeklyConstraints = dedupeStrings([
    ...(next.weeklyConstraints || []),
    "Hybrid load is stepping down early so the run and lift peaks do not stack at the same time.",
  ]);
  return next;
};

const resolveResolvedGoalDescriptor = ({ goal = null, resolvedGoal = null, fallbackCategory = "" } = {}) => {
 const metricKey = String(resolvedGoal?.primaryMetric?.key || "").toLowerCase();
 const summary = sanitizeText(resolvedGoal?.summary || goal?.name || "", 160).toLowerCase();
 const category = String(resolvedGoal?.planningCategory || goal?.category || fallbackCategory || "").toLowerCase();
 const goalFamily = String(resolvedGoal?.goalFamily || goal?.goalFamily || "").toLowerCase();
 if (/\b(swim|swimming|pool|open water|laps?|freestyle|backstroke|breaststroke|butterfly)\b/.test(summary)) return "swim endurance";
 if (/\b(cycling|bike|ride|trainer|peloton)\b/.test(summary)) return "cycling endurance";
 if (/\b(triathlon|multisport|sprint tri|olympic tri|70\.3|ironman)\b/.test(summary)) return "multisport endurance";
 if (goalFamily === "athletic_power" || /\b(dunk|vertical|jump higher|jumping higher|explosive)\b/.test(summary)) return "athletic power";
 if (/bench|press/.test(metricKey) || /\bbench\b/.test(summary)) return "pressing strength";
 if (/squat/.test(metricKey) || /\bsquat\b/.test(summary)) return "squat strength";
 if (/deadlift/.test(metricKey) || /\bdeadlift\b/.test(summary)) return "pulling strength";
 if (/half_marathon/.test(metricKey) || /half marathon/.test(summary)) return "half-marathon endurance";
 if (/marathon/.test(metricKey) || /\bmarathon\b/.test(summary)) return "marathon endurance";
 if (/\b10k\b/.test(metricKey) || /\b10k\b/.test(summary)) return "10K pace support";
 if (/\b5k\b/.test(metricKey) || /\b5k\b/.test(summary)) return "5K pace support";
 if (/waist|progress_photos|body_fat|bodyweight/.test(metricKey) || category === "body_comp") return "body-composition progress";
 if (category === "strength") return "strength progression";
 if (category === "running") return "race-specific fitness";
 if (category === "body_comp") return "body-composition progress";
 return "primary-goal progress";
};

const resolveEmphasisLabel = ({
 architecture = "hybrid_performance",
 category = "",
 role = "dominant",
 goal = null,
 resolvedGoal = null,
} = {}) => {
 const descriptor = resolveResolvedGoalDescriptor({ goal, resolvedGoal, fallbackCategory: category });
 if (role === "secondary") {
 if (category === "strength") return /upper-body/i.test(sanitizeText(goal?.name || resolvedGoal?.summary || "", 120)) ? "Upper-body maintenance" : "Strength maintenance";
 if (category === "running") return "Conditioning maintenance";
 if (category === "body_comp") return "Body-composition maintenance";
 return "Secondary maintenance";
 }
 if (descriptor === "swim endurance") return "Swim endurance and technique";
 if (descriptor === "cycling endurance") return "Cycling endurance and aerobic base";
 if (descriptor === "multisport endurance") return "Triathlon and multisport readiness";
 if (architecture === "event_prep_upper_body_maintenance") return "Race prep";
 if (architecture === "race_prep_dominant") return descriptor === "race-specific fitness" ? "Race-specific running" : descriptor === "half-marathon endurance" ? "Half-marathon race prep" : "Run performance";
 if (architecture === "strength_dominant") return descriptor === "athletic power" ? "Athletic-power progression" : descriptor === "pressing strength" ? "Pressing strength progression" : descriptor === "squat strength" ? "Squat strength progression" : descriptor === "pulling strength" ? "Pulling strength progression" : "Strength progression";
 if (architecture === "body_comp_conditioning") return "Fat-loss momentum";
 if (architecture === "maintenance_rebuild") return "Hybrid rebuild";
 if (category === "running") return "Run performance";
 if (category === "strength") return "Strength progression";
 if (category === "body_comp") return "Body-composition progress";
 return "Hybrid performance";
};

const resolveWeeklyFocusLabel = ({
 architecture = "hybrid_performance",
 dominantCategory = "",
 secondaryCategory = "",
 primaryGoal = null,
 primaryResolvedGoal = null,
} = {}) => {
 const descriptor = resolveResolvedGoalDescriptor({ goal: primaryGoal, resolvedGoal: primaryResolvedGoal, fallbackCategory: dominantCategory });
 if (descriptor === "swim endurance") return "Build swim endurance and technique";
 if (descriptor === "cycling endurance") return "Build cycling endurance and repeatable ride quality";
 if (descriptor === "multisport endurance") return "Build multisport consistency without maxing every lane at once";
 if (architecture === "event_prep_upper_body_maintenance") return "Build race-specific fitness while keeping upper-body strength alive";
 if (architecture === "race_prep_dominant") return descriptor === "half-marathon endurance" ? "Build half-marathon pace and endurance" : "Build race-specific endurance and quality";
 if (architecture === "strength_dominant") return descriptor === "athletic power" ? "Build athletic power with repeatable lower-body work" : descriptor === "pressing strength" ? "Build pressing strength with repeatable full-body work" : "Build primary strength with repeatable full-body work";
 if (architecture === "body_comp_conditioning") return "Drive fat-loss momentum while protecting strength";
 if (architecture === "maintenance_rebuild") return "Rebuild repeatable run and strength rhythm";
 if (dominantCategory === "running") return secondaryCategory === "strength" ? "Build run fitness while keeping strength in the week" : "Build run fitness with repeatable support work";
 if (dominantCategory === "strength") return secondaryCategory === "running" ? "Build strength while keeping conditioning supportive" : "Build strength with repeatable support work";
 if (dominantCategory === "body_comp") return "Build sustainable body-composition momentum";
 return "Keep the primary lane moving without losing the secondary one";
};

const buildSessionsByDayFromTemplate = (template = {}) => {
 const restDay = buildScheduleBufferRecovery("Active Recovery");
 return {
 1: template?.mon ? normalizeSessionEntryLabel({ type: "easy-run", label: `${template.mon.t || "Easy"} Run`, run: clonePlainValue(template.mon), nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: mobility reset or short strength support if recovery is good." }) : null,
 2: null,
 3: template?.str ? normalizeSessionEntryLabel({ type: "strength+prehab", label: `Strength ${template.str}`, strSess: template.str, nutri: NUTRITION_DAY_TYPES.strengthSupport }) : null,
 4: template?.thu ? normalizeSessionEntryLabel({ type: "hard-run", label: `${template.thu.t || "Quality"} Run`, run: clonePlainValue(template.thu), nutri: NUTRITION_DAY_TYPES.runQuality }) : null,
 5: template?.fri ? normalizeSessionEntryLabel({ type: "easy-run", label: `${template.fri.t || "Easy"} Run`, run: clonePlainValue(template.fri), nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: mobility reset or strides if recovery is good." }) : null,
 6: template?.sat ? normalizeSessionEntryLabel({ type: "long-run", label: `${template.sat.t || "Long"} Run`, run: clonePlainValue(template.sat), nutri: NUTRITION_DAY_TYPES.runLong, optionalSecondary: "Optional: short mobility and fueling reset after the run." }) : null,
 0: restDay,
 };
};

const normalizeRunSignature = (run = null) => JSON.stringify({
 t: run?.t || "",
 d: run?.d || "",
});

const invertStrengthSession = (value = "") => value === "A" ? "B" : value === "B" ? "A" : value;

const resolveProjectedRunTemplateSlot = ({ dayKey = null, session = null, referenceTemplate = {} } = {}) => {
 const sessionSignature = normalizeRunSignature(session?.run || null);
 const templateSlots = [
 ["mon", referenceTemplate?.mon || null],
 ["thu", referenceTemplate?.thu || null],
 ["fri", referenceTemplate?.fri || null],
 ["sat", referenceTemplate?.sat || null],
 ];
 const matchedSlot = templateSlots.find(([, templateRun]) => normalizeRunSignature(templateRun || null) === sessionSignature);
 if (matchedSlot?.[0]) return matchedSlot[0];
 return null;
};

const projectSessionsByDayFromCanonicalPattern = ({
 template = {},
 referenceTemplate = {},
 sessionsByDay = null,
} = {}) => {
 if (!sessionsByDay || !Object.keys(sessionsByDay || {}).length) {
 return buildSessionsByDayFromTemplate(template);
 }

 const projected = Object.fromEntries(
 Object.entries(sessionsByDay || {}).map(([dayKeyRaw, session]) => {
 if (!session) return [dayKeyRaw, null];
 const dayKey = Number(dayKeyRaw);
 const nextSession = clonePlainValue(session);
 const runSlot = nextSession?.run
 ? resolveProjectedRunTemplateSlot({ dayKey, session: nextSession, referenceTemplate })
 : null;
 const projectedRun = runSlot ? clonePlainValue(template?.[runSlot] || null) : null;

 if (projectedRun) {
 nextSession.run = projectedRun;
 const currentLabel = String(nextSession?.label || "");
 const shouldRewriteRunLabel = ["hard-run", "easy-run", "long-run"].includes(String(nextSession?.type || ""))
 && /run$/i.test(currentLabel);
 if (shouldRewriteRunLabel) {
 nextSession.label = `${projectedRun.t || (nextSession.type === "long-run" ? "Long" : nextSession.type === "hard-run" ? "Quality" : "Easy")} Run`;
 }
 }

 const referenceStrength = String(referenceTemplate?.str || "");
 const templateStrength = String(template?.str || "");
 if (nextSession?.strSess && referenceStrength && templateStrength) {
 const alternateReference = invertStrengthSession(referenceStrength);
 if (String(nextSession.strSess) === referenceStrength) nextSession.strSess = templateStrength;
 else if (alternateReference && String(nextSession.strSess) === alternateReference) nextSession.strSess = invertStrengthSession(templateStrength) || nextSession.strSess;
 }

 return [dayKeyRaw, normalizeSessionEntryLabel(nextSession)];
 })
 );

 return projected;
};

const resolveProgramBlockWindow = ({
 currentWeek = 1,
 weekTemplate = {},
 weekTemplates = [],
} = {}) => {
 const phase = weekTemplate?.phase || weekTemplates?.[Math.max(0, currentWeek - 1)]?.phase || "";
 if (!phase || !Array.isArray(weekTemplates) || !weekTemplates.length) {
 return {
 phase,
 startWeek: currentWeek,
 endWeek: currentWeek,
 weekIndexInBlock: 1,
 totalWeeks: 1,
 weeksRemaining: 0,
 };
 }

 const safeIndex = Math.max(0, Math.min(currentWeek - 1, weekTemplates.length - 1));
 let startIndex = safeIndex;
 let endIndex = safeIndex;

 while (startIndex > 0 && weekTemplates[startIndex - 1]?.phase === phase) startIndex -= 1;
 while (endIndex < weekTemplates.length - 1 && weekTemplates[endIndex + 1]?.phase === phase) endIndex += 1;

 return {
 phase,
 startWeek: startIndex + 1,
 endWeek: endIndex + 1,
 weekIndexInBlock: (safeIndex - startIndex) + 1,
 totalWeeks: (endIndex - startIndex) + 1,
 weeksRemaining: Math.max(0, endIndex - safeIndex),
 };
};

const buildProgramBlockCompatibilityIntent = (programBlock = null) => (
 !programBlock ? null : {
 prioritized: programBlock?.goalAllocation?.prioritized || programBlock?.dominantEmphasis?.label || "Consistency and execution",
 maintained: clonePlainValue(programBlock?.goalAllocation?.maintained || [programBlock?.secondaryEmphasis?.label || "general fitness"].filter(Boolean)),
 support: clonePlainValue(programBlock?.goalAllocation?.support || []),
 deferred: clonePlainValue(programBlock?.goalAllocation?.deferred || []),
 minimized: programBlock?.goalAllocation?.minimized || "non-primary volume",
 heldBack: clonePlainValue(programBlock?.goalAllocation?.heldBack || []),
 why: programBlock?.goalAllocation?.why || "",
 narrative: programBlock?.summary || "",
 }
);

const buildFallbackProgramBlockFromCompatibilityIntent = ({
 weekNumber = 1,
 weekTemplate = {},
 weekTemplates = [],
 goals = [],
 architecture = "hybrid_performance",
 blockIntent = null,
 constraints = [],
} = {}) => {
 if (!blockIntent) return null;
 const window = resolveProgramBlockWindow({ currentWeek: weekNumber, weekTemplate, weekTemplates });
 const prioritized = blockIntent?.prioritized || "Consistency and execution";
 const maintained = Array.isArray(blockIntent?.maintained) && blockIntent.maintained.length
 ? blockIntent.maintained
 : ["general fitness"];
 return {
 version: PROGRAM_BLOCK_MODEL_VERSION,
 id: `program_block_${window.phase || "current"}_${window.startWeek}_${window.endWeek}`,
 label: `${window.phase || "Current"} · ${prioritized}`,
 architecture,
 phase: window.phase || "",
 window,
 dominantEmphasis: {
 category: goals?.[0]?.category || "hybrid",
 label: prioritized,
 objective: blockIntent?.narrative || `${prioritized} is the top block priority.`,
 role: "dominant",
 },
 secondaryEmphasis: {
 category: "maintenance",
 label: maintained[0] || "general fitness",
 objective: `${maintained[0] || "General fitness"} stays in the plan with less emphasis than the top priority.`,
 role: "secondary",
 },
 recoveryPosture: {
 level: "balanced",
 summary: "Recovery is managed to keep the block repeatable.",
 },
 nutritionPosture: {
 mode: "maintenance_support",
 summary: "Nutrition supports repeatable training and recovery.",
 },
 successCriteria: [
 `Keep ${prioritized.toLowerCase()} moving without breaking consistency.`,
 ],
 constraints: clonePlainValue(constraints || []),
 tradeoffs: [
 blockIntent?.minimized ? `${blockIntent.minimized} is intentionally limited this block.` : "",
 ].filter(Boolean),
 goalAllocation: {
 prioritized,
 maintained,
 minimized: blockIntent?.minimized || "non-primary volume",
 heldBack: clonePlainValue(blockIntent?.heldBack || []),
 why: blockIntent?.why || "",
 },
 drivers: dedupeStrings([prioritized, ...(maintained || [])]),
 summary: blockIntent?.narrative || `${prioritized} gets the most planning weight while the other priorities stay in the mix.`,
 };
};

const getResolvedGoalPayload = (goal = {}) => goal?.resolvedGoal || null;

const buildResolvedGoalBlockContext = ({
 goals = [],
 programContext = {},
} = {}) => {
 const activeGoals = Array.isArray(goals) ? goals.filter((goal) => goal?.active !== false) : [];
 const primaryGoal = activeGoals[0] || null;
 const secondaryGoals = activeGoals.slice(1, 3);
 const resolvedPrimaryGoal = getResolvedGoalPayload(primaryGoal);
 const resolvedSecondaryGoals = secondaryGoals.map((goal) => getResolvedGoalPayload(goal)).filter(Boolean);
 const resolvedGoals = activeGoals.map((goal) => getResolvedGoalPayload(goal)).filter(Boolean);
 const proxyMetricLabels = dedupeStrings(resolvedGoals.flatMap((goal) => (goal?.proxyMetrics || []).map((metric) => sanitizeText(metric?.label || "", 80)))).slice(0, 4);
 const primaryMetricLabel = sanitizeText(resolvedPrimaryGoal?.primaryMetric?.label || "", 80);
 const tradeoffs = dedupeStrings([
 ...activeGoals.flatMap((goal) => goal?.tradeoffs || []),
 ...resolvedGoals.flatMap((goal) => goal?.tradeoffs || []),
 ...(programContext?.goalFeasibility?.conflictFlags || []).map((flag) => sanitizeText(flag?.summary || "", 180)),
 ]).slice(0, 5);
 const feasibilityByGoalId = new Map((programContext?.goalFeasibility?.goalAssessments || []).map((item) => [item.goalId, item]));
 const primaryAssessment = resolvedPrimaryGoal ? feasibilityByGoalId.get(resolvedPrimaryGoal.id) || null : null;
 const sequencingSummary = sanitizeText(programContext?.goalFeasibility?.suggestedSequencing?.[0]?.summary || "", 220);
 const realisticByDateSummary = sanitizeText(programContext?.goalFeasibility?.realisticByTargetDate?.[0]?.summary || "", 220);
 const longerHorizonSummary = sanitizeText(programContext?.goalFeasibility?.longerHorizonNeeds?.[0]?.summary || "", 220);
 const maintainedLabels = secondaryGoals.map((goal) => goal?.name).filter(Boolean);
 const minimizedLabel = activeGoals.find((goal) => goal?.category === "injury_prevention")?.name || "non-primary volume";

 return {
 primaryGoal,
 secondaryGoals,
 resolvedPrimaryGoal,
 resolvedSecondaryGoals,
 resolvedGoals,
 primaryMetricLabel,
 proxyMetricLabels,
 tradeoffs,
 primaryAssessment,
 sequencingSummary,
 realisticByDateSummary,
 longerHorizonSummary,
 maintainedLabels,
 minimizedLabel,
 };
};

const goalLooksUpperBodyFocused = (goal = {}) => {
 const text = sanitizeText([
 goal?.name,
 goal?.resolvedGoal?.summary,
 goal?.resolvedGoal?.primaryMetric?.label,
 goal?.resolvedGoal?.primaryMetric?.key,
 ].filter(Boolean).join(" "), 240).toLowerCase();
 return /(bench|upper body|push|pull|press|chin|pull-up|pull up|row)/i.test(text);
};

const goalLooksRaceLike = (goal = {}) => {
 const text = sanitizeText([
 goal?.name,
 goal?.resolvedGoal?.summary,
 goal?.resolvedGoal?.primaryMetric?.label,
 goal?.resolvedGoal?.primaryMetric?.key,
 ].filter(Boolean).join(" "), 240).toLowerCase();
 return /(race|half marathon|marathon|10k|5k|run)/i.test(text);
};

const buildConcurrentPriorityExplanation = ({
 primary = null,
 runningGoal = null,
 strengthGoal = null,
 bodyCompGoal = null,
 dominantLabel = "",
} = {}) => {
 if (!runningGoal || !strengthGoal || !bodyCompGoal) return null;

 const primaryCategory = sanitizeText(primary?.category || "", 40).toLowerCase();
 const strengthName = sanitizeText(strengthGoal?.name || "Strength work", 120);
 const runningName = sanitizeText(runningGoal?.name || "Endurance work", 120);
 const bodyCompName = sanitizeText(bodyCompGoal?.name || "Fat loss", 120);
 const benchmarkWord = /bench/i.test(strengthName) ? "bench-progression" : "strength";
 let priorityLine = "";
 let heldBack = [];

 if (primaryCategory === "running") {
 priorityLine = `Prioritized: ${sanitizeText(dominantLabel || "Race prep", 120)} gets the cleanest fatigue and scheduling windows.`;
 heldBack = [
 `${strengthName} stays in maintenance territory, not a maximal ${benchmarkWord} push.`,
 `${bodyCompName} stays moderate and recovery-compatible, not an aggressive cut.`,
 ];
 } else if (primaryCategory === "strength") {
 priorityLine = `Prioritized: ${sanitizeText(dominantLabel || strengthName || "Strength progression", 120)} gets the cleanest recovery and loading windows.`;
 heldBack = [
 `${runningName} stays supportive, not a maximal race push.`,
 `${bodyCompName} stays moderate and recovery-compatible, not an aggressive cut.`,
 ];
 } else if (primaryCategory === "body_comp") {
 priorityLine = `Prioritized: ${sanitizeText(dominantLabel || bodyCompName || "Fat loss", 120)} stays repeatable enough to preserve training quality and lean mass.`;
 heldBack = [
 `${strengthName} stays retention-first, not a maximal ${benchmarkWord} push.`,
 `${runningName} stays supportive, not a maximal race push.`,
 ];
 } else {
 priorityLine = `Prioritized: ${sanitizeText(dominantLabel || primary?.name || "The top priority", 120)} gets the cleanest planning weight.`;
 heldBack = [
 `${strengthName} stays supportive, not maximal.`,
 `${bodyCompName} stays moderate rather than aggressive.`,
 ];
 }

 const whyLine = /bench/i.test(strengthName) && goalLooksRaceLike(runningGoal)
 ? "Why: the app cannot honestly promise maximal bench progress, maximal race improvement, and maximal fat loss in the same block."
 : "Why: the app cannot honestly promise maximal strength progress, maximal endurance improvement, and maximal fat loss in the same block.";

 return {
 priorityLine,
 heldBack,
 heldBackLine: `Held back: ${heldBack.join(" ")}`,
 whyLine,
 summary: [priorityLine, `Held back: ${heldBack.join(" ")}`, whyLine].filter(Boolean).join(" ").trim(),
 };
};

export const buildProgramBlock = ({
 weekNumber = 1,
 weekTemplate = {},
 weekTemplates = [],
 goals = [],
 architecture = "hybrid_performance",
 constraints = [],
 drivers = [],
 unlockMessage = "",
 programContext = {},
} = {}) => {
 const { active } = getGoalBuckets(goals);
 const primary = active[0] || null;
 const secondaryGoals = active.filter((goal) => goal?.id !== primary?.id).slice(0, 2);
 const runningGoal = active.find((goal) => goal?.category === "running") || null;
 const strengthGoal = active.find((goal) => goal?.category === "strength") || null;
 const bodyCompGoal = active.find((goal) => goal?.category === "body_comp") || null;
 const window = resolveProgramBlockWindow({ currentWeek: weekNumber, weekTemplate, weekTemplates });
 const phase = window.phase || weekTemplate?.phase || "";
 const lowBandwidth = Boolean(programContext?.lowBandwidth);
 const bodyCompActive = Boolean(programContext?.bodyCompActive || bodyCompGoal);
 const resolvedContext = buildResolvedGoalBlockContext({
 goals: active,
 programContext,
 });
 const primaryResolvedGoal = resolvedContext.resolvedPrimaryGoal;
 const primaryFeasibility = resolvedContext.primaryAssessment;
 const primaryMetricLabel = resolvedContext.primaryMetricLabel;
 const proxyMetricLabels = resolvedContext.proxyMetricLabels;
 const feasibilityStatus = sanitizeText(programContext?.goalFeasibility?.realismStatus || "", 40).toLowerCase();
 const domainAdapterId = String(programContext?.domainAdapter?.id || "").toLowerCase();
 const goalLaneModel = programContext?.goalLaneModel || null;

 const maintainedGoals = (goalLaneModel?.maintainedGoalLabels?.length
  ? goalLaneModel.maintainedGoalLabels
  : active
   .filter((goal) => goal?.id !== primary?.id && goal?.category !== "injury_prevention")
   .slice(0, 2)
   .map((goal) => goal?.name)
   .filter(Boolean)
 );
 const supportGoals = goalLaneModel?.supportGoalLabels || [];
 const deferredGoals = goalLaneModel?.deferredGoalLabels || [];
 const minimizedGoal = active.find((goal) => goal?.category === "injury_prevention")?.name || "non-primary volume";
 const primaryMeasurabilityTier = primaryResolvedGoal?.measurabilityTier || primary?.measurabilityTier || "";
 const primaryTargetHorizonWeeks = primaryResolvedGoal?.targetHorizonWeeks || primary?.targetHorizonWeeks || null;
 const dominantMetricLine = primaryMetricLabel
 ? `${primaryMetricLabel} is the main success anchor for this block.`
 : proxyMetricLabels.length
 ? `${proxyMetricLabels.slice(0, 2).join(" and ")} are the working signals for block progress.`
 : "";
 const horizonLine = primaryTargetHorizonWeeks
 ? `${primaryTargetHorizonWeeks} week target horizon sets the pacing of this block.`
 : primaryMeasurabilityTier === "exploratory_fuzzy"
 ? "This block starts by proving a first 30-day win before pushing a narrower target."
 : "";
 const feasibilityLine = resolvedContext.realisticByDateSummary || resolvedContext.longerHorizonSummary || "";
 const sequencingLine = resolvedContext.sequencingSummary || "";

 let labelSuffix = "Hybrid performance";
 let dominantEmphasis = {
 category: primary?.category || "hybrid",
 label: resolveEmphasisLabel({
 architecture,
 category: primary?.category || "hybrid",
 role: "dominant",
 goal: primary,
 resolvedGoal: primaryResolvedGoal,
 }),
 objective: ["Advance the primary lane while keeping the rest of the system credible.", horizonLine, feasibilityLine].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 let secondaryEmphasis = {
 category: secondaryGoals[0]?.category || "maintenance",
 label: resolveEmphasisLabel({
 architecture,
 category: secondaryGoals[0]?.category || "maintenance",
 role: "secondary",
 goal: secondaryGoals[0] || null,
 resolvedGoal: resolvedContext.resolvedSecondaryGoals[0] || null,
 }) || "General fitness",
 objective: sequencingLine || "Other priorities stay present without taking focus away from the top priority.",
 role: "secondary",
 };
 let minimizedEmphasis = {
 category: active.find((goal) => goal?.name === minimizedGoal)?.category || "support",
 label: minimizedGoal,
 objective: `${minimizedGoal} gets the least dedicated block volume so the overall priority order stays coherent.`,
 role: "minimized",
 };
 let recoveryPosture = {
 level: "balanced",
 summary: "Recovery is managed so the block can be repeated cleanly across several weeks.",
 };
 let nutritionPosture = {
 mode: "maintenance_support",
 summary: ["Nutrition supports steady training quality and repeatable recovery.", dominantMetricLine].filter(Boolean).join(" "),
 };
 let successCriteria = [
 "Keep the top priority progressing without losing consistency.",
 "Keep the next priority moving without letting it take over the block.",
 "Finish the block with recovery still intact.",
 dominantMetricLine,
 feasibilityLine,
 ];
 let tradeoffs = [...resolvedContext.tradeoffs];

 if (architecture === "event_prep_upper_body_maintenance") {
 labelSuffix = "Event-prep + upper-body maintenance";
 dominantEmphasis = {
 category: "running",
 label: resolveEmphasisLabel({
 architecture,
 category: "running",
 role: "dominant",
 goal: primary || runningGoal,
 resolvedGoal: primaryResolvedGoal,
 }),
 objective: [
 "Event-specific endurance or race prep takes first claim on fatigue, scheduling, and lower-body freshness this block.",
 horizonLine,
 feasibilityLine,
 ].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 secondaryEmphasis = {
 category: "strength",
 label: resolveEmphasisLabel({
 architecture,
 category: "strength",
 role: "secondary",
 goal: strengthGoal,
 resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "strength") || null,
 }) || "Upper-body maintenance",
 objective: sequencingLine || "Upper-body strength stays present with low leg-cost sessions so event prep can stay the top priority.",
 role: "secondary",
 };
 recoveryPosture = {
 level: "protective",
 summary: "Recovery strongly protects key run sessions and long-run quality by minimizing lower-body lifting fatigue.",
 };
 nutritionPosture = {
 mode: "performance_support",
 summary: [
 "Nutrition supports event-specific quality work while keeping enough protein to preserve upper-body training identity.",
 dominantMetricLine,
 ].filter(Boolean).join(" "),
 };
 successCriteria = [
 "Land the event-specific key sessions without lower-body lifting spillover.",
 "Keep 2 upper-body maintenance exposures each week.",
 "Arrive at the next block with race-specific durability intact.",
 dominantMetricLine,
 feasibilityLine,
 ];
 tradeoffs = dedupeStrings([
 "Lower-body hypertrophy and heavy bilateral lifting are intentionally minimized while event prep holds the most planning weight.",
 ...tradeoffs,
 ]);
 } else if (architecture === "race_prep_dominant") {
 const isSwimDomain = domainAdapterId === "swimming_endurance_technique";
 const isCyclingDomain = domainAdapterId === "cycling_endurance";
 const dominantCategory = isSwimDomain ? "swimming" : isCyclingDomain ? "cycling" : "running";
 const dominantObjectiveLine = isSwimDomain
 ? "Swim quality and endurance progression get first claim on fatigue and recovery this block."
 : isCyclingDomain
 ? "Ride quality and aerobic progression get first claim on fatigue and recovery this block."
 : "Run quality and endurance progression get first claim on fatigue and recovery this block.";
 const secondaryObjectiveLine = isSwimDomain
 ? "Dryland strength stays in the week with less emphasis so it supports swim progress instead of competing with it."
 : isCyclingDomain
 ? "Support strength stays in the week with less emphasis so it reinforces riding instead of competing with it."
 : "Strength stays in the week with less emphasis so it supports running instead of competing with it.";
 labelSuffix = isSwimDomain
 ? "Swim prep + dryland support"
 : isCyclingDomain
 ? "Cycling base + strength-support"
 : "Run-dominant + strength-maintenance";
 dominantEmphasis = {
 category: dominantCategory,
 label: resolveEmphasisLabel({
 architecture,
 category: dominantCategory,
 role: "dominant",
 goal: primary || runningGoal,
 resolvedGoal: primaryResolvedGoal,
 }),
 objective: [
 dominantObjectiveLine,
 horizonLine,
 feasibilityLine,
 ].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 secondaryEmphasis = {
 category: strengthGoal ? "strength" : "maintenance",
 label: resolveEmphasisLabel({
 architecture,
 category: strengthGoal ? "strength" : "maintenance",
 role: "secondary",
 goal: strengthGoal,
 resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "strength") || null,
 }) || "Strength maintenance",
 objective: sequencingLine || secondaryObjectiveLine,
 role: "secondary",
 };
 recoveryPosture = {
 level: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus) ? "protective" : "balanced",
 summary: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus)
 ? isSwimDomain
 ? "Recovery is protected so swim rhythm survives even when bandwidth is limited."
 : isCyclingDomain
 ? "Recovery is protected so ride rhythm survives even when bandwidth is limited."
 : "Recovery is protected so run rhythm survives even when bandwidth is limited."
 : isSwimDomain
 ? "Recovery is biased toward protecting threshold and endurance swim quality."
 : isCyclingDomain
 ? "Recovery is biased toward protecting the key ride sessions and long aerobic ride."
 : "Recovery is biased toward protecting the key run sessions and long-run quality.",
 };
 nutritionPosture = {
 mode: lowBandwidth ? "recovery_support" : "performance_support",
 summary: [
 isSwimDomain
 ? "Fuel key swim sessions, protect shoulder recovery, and replenish enough to keep quality work credible."
 : isCyclingDomain
 ? "Fuel key rides, protect leg freshness, and replenish enough to keep tempo and long rides credible."
 : "Fuel key run sessions, protect tendon recovery, and replenish enough to keep quality work credible.",
 dominantMetricLine,
 ].filter(Boolean).join(" "),
 };
 successCriteria = [
 isSwimDomain
 ? "Land the key swim sessions for the block without stacking recovery debt."
 : isCyclingDomain
 ? "Land the key rides for the block without stacking recovery debt."
 : "Land the key run sessions for the block without stacking recovery debt.",
 "Keep 1-2 strength touches in the week without letting them outrank the top priority.",
 isSwimDomain
 ? "Arrive at the next phase with swim durability intact."
 : isCyclingDomain
 ? "Arrive at the next phase with ride durability intact."
 : "Arrive at the next phase with run durability intact.",
 dominantMetricLine,
 feasibilityLine,
 ];
 tradeoffs = dedupeStrings([
 isSwimDomain
? "Dryland strength volume stays capped while swim work gets the cleanest recovery windows."
 : isCyclingDomain
 ? "Support strength volume stays capped while riding receives the cleanest recovery windows."
 : "Strength volume stays capped while running receives the cleanest recovery windows.",
 ...tradeoffs,
 ]);
 } else if (architecture === "strength_dominant") {
 labelSuffix = domainAdapterId === "power_vertical_plyometric"
 ? "Power / jump + force support"
 : "Strength-dominant + conditioning-maintenance";
 dominantEmphasis = {
 category: domainAdapterId === "power_vertical_plyometric" ? "power" : "strength",
 label: resolveEmphasisLabel({
 architecture,
 category: "strength",
 role: "dominant",
 goal: primary || strengthGoal,
 resolvedGoal: primaryResolvedGoal,
 }),
 objective: [
 "Strength progression is the main stressor to advance during this block.",
 horizonLine,
 feasibilityLine,
 ].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 secondaryEmphasis = {
 category: domainAdapterId === "power_vertical_plyometric"
 ? "strength"
 : runningGoal ? "running" : "conditioning",
 label: resolveEmphasisLabel({
 architecture,
 category: runningGoal ? "running" : "conditioning",
 role: "secondary",
 goal: runningGoal,
 resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "running") || null,
 }) || (domainAdapterId === "power_vertical_plyometric" ? "Force-production support" : "Conditioning maintenance"),
 objective: sequencingLine || (
 domainAdapterId === "power_vertical_plyometric"
 ? "Strength support stays present so jump and elastic work do not turn into isolated novelty."
 : "Conditioning stays supportive so it preserves work capacity without stealing lower-body recovery."
 ),
 role: "secondary",
 };
 recoveryPosture = {
 level: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus) ? "protective" : "balanced",
 summary: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus)
 ? "Recovery is kept protective so strength rhythm survives inconsistent weeks."
 : "Recovery protects the primary lifts while still leaving room for supportive conditioning.",
 };
 nutritionPosture = {
 mode: "strength_support",
 summary: [
 domainAdapterId === "power_vertical_plyometric"
 ? "Nutrition emphasizes protein coverage, jump-day fueling, and enough intake to keep explosive sessions productive."
 : "Nutrition emphasizes protein coverage, lift-day fueling, and enough intake to keep strength sessions productive.",
 dominantMetricLine,
 ].filter(Boolean).join(" "),
 };
 successCriteria = [
 domainAdapterId === "power_vertical_plyometric"
 ? "Progress explosive lower-body work without letting fatigue blunt jump quality."
 : "Progress the primary strength lifts with controlled fatigue.",
 domainAdapterId === "power_vertical_plyometric"
 ? "Keep force-production strength in the week so power work has real support."
 : "Keep 1-2 conditioning exposures so hybrid fitness does not collapse.",
 domainAdapterId === "power_vertical_plyometric"
 ? "Finish the block springier and stronger without runaway tendon fatigue."
 : "Finish the block stronger without letting supportive conditioning interfere.",
 dominantMetricLine,
 feasibilityLine,
 ];
 tradeoffs = dedupeStrings([
 "Conditioning stays supportive rather than chasing peak endurance or speed.",
 ...tradeoffs,
 ]);
 } else if (architecture === "body_comp_conditioning") {
 labelSuffix = "Body-comp + strength-retention";
 dominantEmphasis = {
 category: "body_comp",
 label: resolveEmphasisLabel({
 architecture,
 category: "body_comp",
 role: "dominant",
 goal: primary || bodyCompGoal,
 resolvedGoal: primaryResolvedGoal,
 }),
 objective: [
 "Energy balance and adherence drive the block while training protects lean mass and momentum.",
 horizonLine,
 feasibilityLine,
 ].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 secondaryEmphasis = {
 category: "strength",
 label: resolveEmphasisLabel({
 architecture,
 category: "strength",
 role: "secondary",
 goal: strengthGoal,
 resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "strength") || null,
 }) || "Strength retention",
 objective: sequencingLine || "Strength work stays present enough to retain muscle and training identity while conditioning supports expenditure.",
 role: "secondary",
 };
 recoveryPosture = {
 level: lowBandwidth || feasibilityStatus === "aggressive" ? "protective" : "balanced",
 summary: lowBandwidth || feasibilityStatus === "aggressive"
 ? "Recovery is slightly more protective so the deficit stays sustainable and strength can be retained."
 : "Recovery is protected enough to preserve adherence while the deficit stays sustainable.",
 };
 nutritionPosture = {
 mode: "deficit_support",
 summary: [
 "Nutrition prioritizes satiety, protein retention, and a deficit that the athlete can actually repeat.",
 dominantMetricLine,
 ].filter(Boolean).join(" "),
 };
 successCriteria = [
 "Keep nutrition adherence high enough that the deficit is sustainable.",
 "Retain minimum effective strength work.",
 "Use conditioning to support expenditure without creating rebound fatigue.",
 dominantMetricLine || "Use proxy metrics to show body-composition progress instead of guessing.",
 feasibilityLine,
 ];
 tradeoffs = dedupeStrings([
 "Aggressive performance progression is intentionally limited while body-comp pressure is active.",
 ...tradeoffs,
 ]);
 } else if (architecture === "maintenance_rebuild") {
 labelSuffix = "Balanced hybrid rebuild";
 dominantEmphasis = {
 category: "hybrid",
 label: "Balanced hybrid rebuild",
 objective: [
 "Rebuild rhythm with finishable run and strength doses before asking the athlete to push again.",
 horizonLine,
 feasibilityLine,
 ].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 secondaryEmphasis = {
 category: primary?.category || "maintenance",
 label: resolveEmphasisLabel({
 architecture,
 category: primary?.category || "maintenance",
 role: "secondary",
 goal: primary,
 resolvedGoal: primaryResolvedGoal,
 }) || "Primary goal maintenance",
 objective: sequencingLine || "Primary-goal qualities stay in maintenance range while consistency and recovery are restored.",
 role: "secondary",
 };
 recoveryPosture = {
 level: "protective",
 summary: "Recovery is protective on purpose so consistency can stabilize before progression returns.",
 };
 nutritionPosture = {
 mode: "consistency_support",
 summary: [
 "Nutrition stays low-friction and repeatable so the athlete can rebuild adherence across the block.",
 dominantMetricLine,
 ].filter(Boolean).join(" "),
 };
 successCriteria = [
 "String together repeatable sessions for several weeks in a row.",
 "Keep both run and strength in minimum effective range.",
 "Exit the block fresher and more consistent than it started.",
 dominantMetricLine || "Use simple check-ins and consistency proxies as the first proof of progress.",
 feasibilityLine,
 ];
 tradeoffs = dedupeStrings([
 "Aggressive progression is deferred until consistency and recovery are trustworthy again.",
 ...tradeoffs,
 ]);
 } else {
 labelSuffix = dominantEmphasis.category === "running" && strengthGoal
 ? "Run-dominant + strength-maintenance"
 : dominantEmphasis.category === "strength" && runningGoal
 ? "Strength-dominant + conditioning-maintenance"
 : "Hybrid performance";
 dominantEmphasis = {
 category: primary?.category || "hybrid",
 label: resolveEmphasisLabel({
 architecture,
 category: primary?.category || "hybrid",
 role: "dominant",
 goal: primary,
 resolvedGoal: primaryResolvedGoal,
 }),
 objective: [
 primary?.category === "running"
 ? "Run fitness advances while strength work stays present enough to keep the athlete meaningfully hybrid."
 : primary?.category === "strength"
 ? "Strength advances while conditioning stays present enough to protect broader fitness."
 : "Run, strength, and conditioning stay balanced enough that progress remains credible across the full priority mix.",
 horizonLine,
 feasibilityLine,
 ].filter(Boolean).join(" "),
 role: "dominant",
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 };
 secondaryEmphasis = {
 category: secondaryGoals[0]?.category || (primary?.category === "running" ? "strength" : "running"),
 label: resolveEmphasisLabel({
 architecture,
 category: secondaryGoals[0]?.category || (primary?.category === "running" ? "strength" : "running"),
 role: "secondary",
 goal: secondaryGoals[0] || null,
 resolvedGoal: resolvedContext.resolvedSecondaryGoals[0] || null,
 }) || (primary?.category === "running" ? "Strength maintenance" : "Conditioning maintenance"),
 objective: sequencingLine || (primary?.category === "running"
 ? "Strength stays in the week with less emphasis so the athlete still looks and performs like a hybrid athlete."
 : primary?.category === "strength"
 ? "Conditioning stays in the week so strength can stay the clearest driver without losing aerobic support."
 : "Other priorities stay alive so no part of the hybrid profile falls too far behind."),
 role: "secondary",
 };
 recoveryPosture = {
 level: lowBandwidth || feasibilityStatus === "aggressive" ? "protective" : "balanced",
 summary: lowBandwidth
 ? "Recovery stays slightly protective so hybrid work remains finishable."
 : feasibilityStatus === "aggressive"
 ? "Recovery leans slightly protective because the active priority order has real tradeoffs to manage."
 : "Recovery is balanced so both the top priority and the next priorities can stay credible across the block.",
 };
 nutritionPosture = {
 mode: primary?.category === "running"
 ? "performance_support"
 : primary?.category === "strength"
 ? "strength_support"
 : bodyCompActive
 ? "deficit_support"
 : "maintenance_support",
 summary: [
 primary?.category === "running"
 ? "Nutrition leans toward supporting key run work while covering enough protein to preserve strength."
 : primary?.category === "strength"
 ? "Nutrition supports productive lifting while keeping conditioning compatible."
 : bodyCompActive
 ? "Nutrition keeps the deficit sustainable enough that the hybrid structure survives."
 : "Nutrition supports repeatable hybrid training without overcommitting to one lane.",
 dominantMetricLine,
 ].filter(Boolean).join(" "),
 };
 successCriteria = [
 "Progress the top priority while keeping the next priority credible.",
 "Maintain enough cross-training that the athlete stays truly hybrid.",
 "Keep the block repeatable instead of overfilling a single week.",
 dominantMetricLine,
 feasibilityLine,
 ];
 tradeoffs = dedupeStrings([
 "The next priority stays alive without getting equal planning weight while the top priority receives cleaner recovery and planning attention.",
 ...tradeoffs,
 ]);
 }

 minimizedEmphasis = {
 category: active.find((goal) => goal?.name === minimizedGoal)?.category || "support",
 label: minimizedGoal,
 objective: `${minimizedGoal} gets the least dedicated block volume so the top priorities stay coherent.`,
 role: "minimized",
 };

 if (unlockMessage) tradeoffs = [...tradeoffs, unlockMessage];

 const concurrentPriorityExplanation = buildConcurrentPriorityExplanation({
 primary,
 runningGoal,
 strengthGoal,
 bodyCompGoal,
 dominantLabel: dominantEmphasis.label,
 });
 const safeConstraints = dedupeStrings([...(constraints || [])]);
 const safeTradeoffs = dedupeStrings([...(tradeoffs || []), ...safeConstraints.slice(0, 2)]).slice(0, 5);
 const safeCriteria = dedupeStrings(successCriteria.filter(Boolean)).slice(0, 5);
 const prioritized = dominantEmphasis.label || primary?.name || "Consistency and execution";
 const maintained = maintainedGoals.length
 ? maintainedGoals
 : [secondaryEmphasis.label || "general fitness"].filter(Boolean);
 const summary = [
 concurrentPriorityExplanation?.summary || "",
 dominantEmphasis.objective,
 secondaryEmphasis.objective,
 minimizedEmphasis.objective,
 ].filter(Boolean).join(" ").trim();

 return {
 version: PROGRAM_BLOCK_MODEL_VERSION,
 id: `program_block_${phase || "current"}_${window.startWeek}_${window.endWeek}_${architecture}`,
 label: `${phase || "Current"} - ${labelSuffix}`,
 architecture,
 phase,
 window,
 dominantEmphasis,
 secondaryEmphasis,
 minimizedEmphasis,
 recoveryPosture,
 nutritionPosture,
 successCriteria: safeCriteria,
 constraints: safeConstraints,
 tradeoffs: safeTradeoffs,
 goalAllocation: {
 prioritized,
 maintained,
 support: clonePlainValue(supportGoals),
 deferred: clonePlainValue(deferredGoals),
 minimized: minimizedGoal,
 heldBack: clonePlainValue(concurrentPriorityExplanation?.heldBack || []),
 why: concurrentPriorityExplanation?.whyLine || "",
 },
 priorityExplanation: clonePlainValue(concurrentPriorityExplanation || null),
 goalStack: {
 primaryResolvedGoalId: primaryResolvedGoal?.id || "",
 secondaryResolvedGoalIds: resolvedContext.resolvedSecondaryGoals.map((goal) => goal.id).filter(Boolean),
 measurabilityTier: primaryMeasurabilityTier,
 targetHorizonWeeks: primaryTargetHorizonWeeks,
 primaryMetricLabel,
 proxyMetricLabels,
 realismStatus: feasibilityStatus || "",
 realisticByDate: resolvedContext.realisticByDateSummary || "",
 sequencingSummary: sequencingLine,
 },
 feasibility: clonePlainValue(programContext?.goalFeasibility || null),
 drivers: dedupeStrings([
 prioritized,
 ...(maintained || []),
 minimizedGoal,
 ...(drivers || []),
 phase,
 architecture,
 programContext?.inconsistencyRisk ? `risk ${programContext.inconsistencyRisk}` : "",
 ]).slice(0, 8),
 summary,
 };
};

const resolveWeeklyNutritionEmphasis = ({
 primaryCategory = "general_fitness",
 architecture = "hybrid_performance",
 recoveryBias = "moderate",
 performanceBias = "moderate",
} = {}) => {
 if (recoveryBias === "high") return "recovery support and consistent fueling";
 if (primaryCategory === "body_comp" || architecture === "body_comp_conditioning") return "satiety, recovery, and deficit adherence";
 if (primaryCategory === "strength" || architecture === "strength_dominant") return "protein coverage and session recovery";
 if (performanceBias === "high" || ["race_prep_dominant", "event_prep_upper_body_maintenance"].includes(architecture)) return "fuel key sessions and replenish quality work";
 if (architecture === "maintenance_rebuild") return "consistency and low-friction meals";
 return "balanced support for training and recovery";
};

export const deriveWeeklyIntent = ({
 weekNumber = 1,
 weekTemplate = {},
 weekTemplates = [],
 goals = [],
 architecture = "hybrid_performance",
 programBlock = null,
 programContext = null,
 blockIntent = null,
 momentum = {},
 learningLayer = {},
 weeklyCheckin = {},
 coachPlanAdjustments = {},
 failureMode = {},
 environmentSelection = null,
 constraints = [],
  adaptivePolicy = null,
} = {}) => {
 const { active } = getGoalBuckets(goals);
 const primaryGoal = active[0] || null;
 const planningBasis = programContext?.planningBasis || null;
 const trainingPreferencePolicy = programContext?.trainingPreferencePolicy || null;
 const adaptationState = programContext?.adaptationState || null;
 const adaptationHints = adaptationState?.weeklyIntentHints || {};
 const normalizedProgramBlock = programBlock
 || buildFallbackProgramBlockFromCompatibilityIntent({
 weekNumber,
 weekTemplate,
 weekTemplates,
 goals,
 architecture,
 blockIntent,
 constraints,
 });
 const volumePctRaw = Number(coachPlanAdjustments?.weekVolumePct?.[String(weekNumber)] || 100);
 const volumePct = clampNumber(volumePctRaw, 70, 120);
 const lowEnergy = Number(weeklyCheckin?.energy || 3) <= 2;
 const highStress = Number(weeklyCheckin?.stress || 3) >= 4;
 const lowConfidence = Number(weeklyCheckin?.confidence || 3) <= 2;
 const simplifyBias = learningLayer?.adjustmentBias === "simplify";
 const cutback = Boolean(weekTemplate?.cutback);
 const chaotic = failureMode?.mode === "chaotic";
 const reEntry = Boolean(failureMode?.isReEntry);
 const intensityPosture = programContext?.trainingContext?.intensityPosture?.confirmed
 ? programContext.trainingContext.intensityPosture.value
 : TRAINING_INTENSITY_VALUES.unknown;
 const preferenceAdjusted = ["conservative", "aggressive"].includes(String(trainingPreferencePolicy?.id || ""));
 const adjusted = Boolean(
 chaotic
 || reEntry
 || cutback
 || lowEnergy
 || highStress
 || lowConfidence
 || simplifyBias
 || volumePct !== 100
 || environmentSelection?.scope === "week"
 || preferenceAdjusted
 || adaptationHints?.adjusted
 );

 let aggressionLevel = "steady";
 if (chaotic || reEntry || normalizedProgramBlock?.recoveryPosture?.level === "protective") aggressionLevel = "rebuild";
 else if (cutback || lowEnergy || highStress || lowConfidence || simplifyBias || volumePct < 100) aggressionLevel = "controlled";
 else if (
 volumePct > 100
 || normalizedProgramBlock?.recoveryPosture?.level === "progressive"
 || ["race_prep_dominant", "strength_dominant", "event_prep_upper_body_maintenance"].includes(architecture)
 ) aggressionLevel = "progressive";
 else if (intensityPosture === TRAINING_INTENSITY_VALUES.aggressive) aggressionLevel = "progressive";
 else if (intensityPosture === TRAINING_INTENSITY_VALUES.conservative) aggressionLevel = "controlled";
 if (adaptationHints?.aggressionHint) aggressionLevel = adaptationHints.aggressionHint;
 else if (trainingPreferencePolicy?.id === "aggressive" && aggressionLevel !== "rebuild") aggressionLevel = "progressive";
 else if (trainingPreferencePolicy?.id === "conservative" && aggressionLevel === "steady") aggressionLevel = "controlled";

 let recoveryBias = normalizedProgramBlock?.recoveryPosture?.level === "protective"
 ? "high"
 : normalizedProgramBlock?.recoveryPosture?.level === "progressive"
 ? "low"
 : "moderate";
 if (chaotic || reEntry || cutback || lowEnergy || highStress) recoveryBias = "high";
 else if (aggressionLevel === "progressive") recoveryBias = "low";
 if (adaptationHints?.recoveryHint) recoveryBias = adaptationHints.recoveryHint;
 else if (trainingPreferencePolicy?.id === "conservative" && recoveryBias === "moderate") recoveryBias = "high";

 let volumeBias = "baseline";
 if (cutback || volumePct < 100) volumeBias = "reduced";
 else if (volumePct > 100) volumeBias = "expanded";
 if (adaptationHints?.volumeBiasHint) volumeBias = adaptationHints.volumeBiasHint;
 else if (trainingPreferencePolicy?.id === "conservative") volumeBias = "reduced";
 else if (trainingPreferencePolicy?.id === "aggressive" && volumeBias === "baseline") volumeBias = "expanded";

 let performanceBias = "moderate";
 if (recoveryBias === "high") performanceBias = "low";
 else if (["race_prep_dominant", "strength_dominant", "event_prep_upper_body_maintenance"].includes(architecture) && aggressionLevel === "progressive") performanceBias = "high";
 if (adaptationHints?.performanceBiasHint) performanceBias = adaptationHints.performanceBiasHint;

  const adaptivePolicyTraces = [];
  const adaptivePolicyRuntime = adaptivePolicy?.runtime || programContext?.adaptivePolicyRuntime || null;
  const adaptivePolicyContext = {
    ...(adaptivePolicy?.context || programContext?.adaptivePolicyContext || {}),
    weeklyStressState: buildAdaptiveWeeklyStressState({ lowEnergy, highStress, lowConfidence }),
    reEntry,
    cutbackWeek: cutback,
  };
  const progressionDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.progressionAggressivenessBand),
    defaultActionId: aggressionLevel === "progressive"
      ? "progressive_band"
      : aggressionLevel === "steady"
      ? "default_band"
      : "conservative_band",
    candidateActionIds: ["default_band", "conservative_band", "progressive_band"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      progressive_band: chaotic
        || reEntry
        || cutback
        || lowEnergy
        || highStress
        || lowConfidence
        || normalizedProgramBlock?.recoveryPosture?.level === "protective"
        ? "safety_constraints_active"
        : "",
    },
  });
  adaptivePolicyTraces.push(progressionDecision);
  ({ aggressionLevel, recoveryBias, volumeBias, performanceBias } = applyAdaptiveProgressionBand({
    intent: { aggressionLevel, recoveryBias, volumeBias, performanceBias },
    actionId: progressionDecision.chosenActionId,
    architecture,
  }));
  const deloadDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.deloadTimingWindow),
    defaultActionId: "keep_current_window",
    candidateActionIds: ["keep_current_window", "pull_forward_deload"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      pull_forward_deload: cutback || reEntry || recoveryBias === "high" || volumeBias === "reduced"
        ? "already_in_protective_window"
        : "",
    },
  });
  adaptivePolicyTraces.push(deloadDecision);
  const deloadAdjustedIntent = applyAdaptiveDeloadWindow({
    intent: { aggressionLevel, recoveryBias, volumeBias, performanceBias, weeklyConstraints: [] },
    actionId: deloadDecision.chosenActionId,
  });
  ({ aggressionLevel, recoveryBias, volumeBias, performanceBias } = deloadAdjustedIntent);
  const hybridDeloadDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.hybridDeloadTimingWindow),
    defaultActionId: "keep_current_window",
    candidateActionIds: ["keep_current_window", "pull_forward_hybrid_deload"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      pull_forward_hybrid_deload: !adaptivePolicyContext?.hybridMeaningful || cutback || reEntry || recoveryBias === "high" || volumeBias === "reduced"
        ? "hybrid_context_required"
        : "",
    },
  });
  adaptivePolicyTraces.push(hybridDeloadDecision);
  const hybridDeloadAdjustedIntent = applyHybridDeloadWindow({
    intent: { aggressionLevel, recoveryBias, volumeBias, performanceBias, weeklyConstraints: deloadAdjustedIntent?.weeklyConstraints || [] },
    actionId: hybridDeloadDecision.chosenActionId,
  });
  ({ aggressionLevel, recoveryBias, volumeBias, performanceBias } = hybridDeloadAdjustedIntent);

 const focus = resolveWeeklyFocusLabel({
 architecture,
 dominantCategory: normalizedProgramBlock?.dominantEmphasis?.category || primaryGoal?.category || "",
 secondaryCategory: normalizedProgramBlock?.secondaryEmphasis?.category || "",
 primaryGoal,
 primaryResolvedGoal: normalizedProgramBlock?.goalStack?.primaryResolvedGoalId
 ? active.find((goal) => (goal?.resolvedGoal?.id || "") === normalizedProgramBlock.goalStack.primaryResolvedGoalId)?.resolvedGoal || primaryGoal?.resolvedGoal || null
 : primaryGoal?.resolvedGoal || null,
 }) || normalizedProgramBlock?.dominantEmphasis?.label
 || blockIntent?.prioritized
 || primaryGoal?.name
 || weekTemplate?.label
 || "Consistency and execution";
 const primaryCategory = primaryGoal?.category || "general_fitness";
  const weeklyConstraints = dedupeStrings([
 ...(normalizedProgramBlock?.constraints || []),
  ...(normalizedProgramBlock?.tradeoffs || []),
  ...(constraints || []),
  weekTemplate?.cutback ? "Cutback week" : "",
 chaotic ? "Salvage mode is active this week" : "",
 reEntry ? "Re-entry week: protect momentum first" : "",
 weeklyCheckin?.blocker ? `Weekly blocker: ${String(weeklyCheckin.blocker).replace(/_/g, " ")}` : "",
 environmentSelection?.scope === "week" ? `${String(environmentSelection?.mode || "custom").replace(/_/g, " ")} environment this week` : "",
  volumePct !== 100 ? `Volume set to ${volumePct}%` : "",
  ...(hybridDeloadAdjustedIntent?.weeklyConstraints || deloadAdjustedIntent?.weeklyConstraints || []),
  ...(adaptationHints?.weeklyConstraints || []),
 preferenceAdjusted ? buildPreferenceEffectLine(trainingPreferencePolicy) : "",
 ]);
 const nutritionEmphasis = recoveryBias === "high"
 ? resolveWeeklyNutritionEmphasis({
 primaryCategory,
 architecture,
 recoveryBias,
 performanceBias,
 })
 : adaptationHints?.nutritionEmphasis
 || normalizedProgramBlock?.nutritionPosture?.summary || resolveWeeklyNutritionEmphasis({
 primaryCategory,
 architecture,
 recoveryBias,
 performanceBias,
 });
 const status = adjusted ? "adjusted" : "planned";
 const maintainedFocus = normalizedProgramBlock?.secondaryEmphasis?.label || "";
 const minimizedFocus = normalizedProgramBlock?.minimizedEmphasis?.label || normalizedProgramBlock?.goalAllocation?.minimized || "";
 const tradeoffFocus = normalizedProgramBlock?.tradeoffs?.[0] || "";
 const priorityExplanation = clonePlainValue(normalizedProgramBlock?.priorityExplanation || null);
 const successDefinition = recoveryBias === "high"
 ? ["event_prep_upper_body_maintenance", "race_prep_dominant"].includes(architecture)
 ? architecture === "event_prep_upper_body_maintenance"
 ? "Protect recovery, land the key event-prep work, and keep upper-body maintenance exposures minimal but real."
 : "Protect recovery, land the key event-prep work, and keep strength work minimal but real."
 : architecture === "body_comp_conditioning"
 ? "Protect recovery, keep the deficit repeatable, and land the minimum effective maintenance work."
 : "Protect recovery, land the minimum effective work, and keep logging."
 : normalizedProgramBlock?.successCriteria?.length > 1
 ? `${normalizedProgramBlock.successCriteria[0]} ${normalizedProgramBlock.successCriteria[1]}`
 : normalizedProgramBlock?.successCriteria?.[0]
 ? normalizedProgramBlock.successCriteria[0]
 : performanceBias === "high"
 ? "Hit the key quality sessions without sacrificing recovery."
 : "String together repeatable sessions and keep the week stable.";
 const rationale = adjusted
 ? `This week is adjusted inside ${String(normalizedProgramBlock?.label || "the current block").toLowerCase()} around ${focus.toLowerCase()} with a ${aggressionLevel.replace(/_/g, " ")} posture. ${maintainedFocus ? `${maintainedFocus} stays active with less emphasis than the top priority.` : ""} ${minimizedFocus ? `${minimizedFocus} gets the least dedicated block volume.` : ""}`.trim()
 : `This week sits inside ${String(normalizedProgramBlock?.label || "the current block").toLowerCase()} and advances ${focus.toLowerCase()} with a ${aggressionLevel.replace(/_/g, " ")} posture. ${maintainedFocus ? `${maintainedFocus} stays active with less emphasis than the top priority.` : ""} ${minimizedFocus ? `${minimizedFocus} gets the least dedicated block volume.` : ""}`.trim();
 const rationaleWithPriorityExplanation = [
 rationale,
 priorityExplanation?.priorityLine,
 priorityExplanation?.heldBackLine,
 priorityExplanation?.whyLine,
 ].filter(Boolean).join(" ").trim();
 const basisLead = planningBasis?.activeProgramName
 ? `${planningBasis.activeProgramName} is shaping the live week.`
 : planningBasis?.activeStyleName
 ? `${planningBasis.activeStyleName} is shaping the feel of the week.`
 : "";
  const rationaleWithBasis = [basisLead, rationaleWithPriorityExplanation].filter(Boolean).join(" ").trim();
  const changeSummary = clonePlainValue(adaptationState?.changeSummary || null);
  const rationaleWithChange = [rationaleWithBasis, changeSummary?.headline, changeSummary?.preserved].filter(Boolean).join(" ").trim();
  const adaptivePolicySummary = adaptivePolicyTraces.find((trace) => trace?.usedAdaptiveChoice)?.explanation
    || adaptivePolicyTraces.find((trace) => trace?.fallbackReason === "shadow_mode")?.explanation
    || "";

  return {
 id: `weekly_intent_${weekNumber}`,
 weekNumber,
 programBlockId: normalizedProgramBlock?.id || "",
 blockLabel: normalizedProgramBlock?.label || "",
 focus,
 aggressionLevel,
 recoveryBias,
 volumeBias,
 performanceBias,
 nutritionEmphasis,
 weeklyConstraints,
 status,
 adjusted,
 volumePct,
 successDefinition,
 maintainedFocus,
 minimizedFocus,
 tradeoffFocus,
 drivers: dedupeStrings([
 focus,
 maintainedFocus,
 minimizedFocus,
 normalizedProgramBlock?.dominantEmphasis?.label || "",
 blockIntent?.prioritized || "",
 primaryGoal?.name || "",
 tradeoffFocus,
 planningBasis?.activeProgramName || "",
 planningBasis?.activeStyleName || "",
 planningBasis?.compromiseLine || "",
 volumePct !== 100 ? `volume ${volumePct}%` : "",
 weeklyCheckin?.blocker ? String(weeklyCheckin.blocker).replace(/_/g, " ") : "",
 changeSummary?.headline || "",
 preferenceAdjusted ? sanitizeText(trainingPreferencePolicy?.label || "", 60) : "",
 ]),
 blockTradeoffs: clonePlainValue(normalizedProgramBlock?.tradeoffs || []),
  rationale: rationaleWithChange,
  changeSummary,
  trainingPreferencePolicy: clonePlainValue(trainingPreferencePolicy || null),
  adaptivePolicySummary,
  adaptivePolicyTraces: clonePlainValue(adaptivePolicyTraces),
  };
};

export const buildPlanWeek = ({
 weekNumber = 1,
 template = {},
 weekTemplates = [],
 referenceTemplate = null,
 label = "",
 specificity = "high",
 kind = "plan",
 startDate = null,
 endDate = null,
 goals = [],
 architecture = "hybrid_performance",
 programBlock = null,
 programContext = null,
 blockIntent = null,
 split = null,
 sessionsByDay = null,
 momentum = {},
 learningLayer = {},
 weeklyCheckin = {},
 coachPlanAdjustments = {},
 failureMode = {},
 environmentSelection = null,
 constraints = [],
  adaptivePolicy = null,
} = {}) => {
 const hasCanonicalSessionPattern = Boolean(sessionsByDay && Object.keys(sessionsByDay || {}).length);
 const planningBasis = clonePlainValue(programContext?.planningBasis || null);
 const normalizedSessions = clonePlainValue(
 projectSessionsByDayFromCanonicalPattern({
 template,
 referenceTemplate: referenceTemplate || template,
 sessionsByDay: hasCanonicalSessionPattern ? sessionsByDay : null,
 })
 );
 const normalizedProgramBlock = programBlock
 || buildProgramBlock({
 weekNumber,
 weekTemplate: template,
 weekTemplates,
 goals,
 architecture,
 constraints,
 drivers: programContext?.drivers || [],
 unlockMessage: programContext?.unlockMessage || "",
 programContext,
 })
 || buildFallbackProgramBlockFromCompatibilityIntent({
 weekNumber,
 weekTemplate: template,
 weekTemplates,
 goals,
 architecture,
 blockIntent,
 constraints,
 });
  const resolvedAdaptivePolicy = adaptivePolicy || (
    programContext?.adaptivePolicyRuntime || programContext?.adaptivePolicyContext
      ? {
        runtime: clonePlainValue(programContext?.adaptivePolicyRuntime || null),
        context: clonePlainValue(programContext?.adaptivePolicyContext || null),
      }
      : null
  );
  const compatibilityBlockIntent = blockIntent || buildProgramBlockCompatibilityIntent(normalizedProgramBlock);
  const weeklyIntent = deriveWeeklyIntent({
 weekNumber,
 weekTemplate: template,
 weekTemplates,
 goals,
 architecture,
 programBlock: normalizedProgramBlock,
 programContext,
 blockIntent: compatibilityBlockIntent,
 momentum,
 learningLayer,
 weeklyCheckin,
 coachPlanAdjustments,
  failureMode,
  environmentSelection,
  constraints,
  adaptivePolicy: resolvedAdaptivePolicy,
  });
 const sessionSource = hasCanonicalSessionPattern
 ? normalizeRunSignature(referenceTemplate?.mon || null) === normalizeRunSignature(template?.mon || null)
 && normalizeRunSignature(referenceTemplate?.thu || null) === normalizeRunSignature(template?.thu || null)
 && normalizeRunSignature(referenceTemplate?.fri || null) === normalizeRunSignature(template?.fri || null)
 && normalizeRunSignature(referenceTemplate?.sat || null) === normalizeRunSignature(template?.sat || null)
 && String(referenceTemplate?.str || "") === String(template?.str || "")
 ? "canonical_week_pattern"
 : "projected_canonical_week_pattern"
 : "template_fallback";

 return {
 id: `plan_week_${weekNumber}`,
 weekNumber,
 absoluteWeek: weekNumber,
 phase: template?.phase || "",
 label: label || `${template?.phase || "BASE"} · Week ${weekNumber}`,
 kind,
 specificity,
 startDate: startDate || null,
 endDate: endDate || null,
 status: weeklyIntent.status,
 adjusted: Boolean(weeklyIntent.adjusted),
 architecture,
 programBlock: clonePlainValue(normalizedProgramBlock || null),
 blockIntent: clonePlainValue(compatibilityBlockIntent || null),
 split: clonePlainValue(split || null),
 weeklyIntent,
 focus: weeklyIntent.focus,
 aggressionLevel: weeklyIntent.aggressionLevel,
 recoveryBias: weeklyIntent.recoveryBias,
 volumeBias: weeklyIntent.volumeBias,
 performanceBias: weeklyIntent.performanceBias,
 nutritionEmphasis: weeklyIntent.nutritionEmphasis,
 successDefinition: weeklyIntent.successDefinition,
 changeSummary: clonePlainValue(weeklyIntent.changeSummary || null),
 planningBasis,
 drivers: clonePlainValue(weeklyIntent.drivers || []),
  rationale: weeklyIntent.rationale,
  adaptivePolicySummary: weeklyIntent.adaptivePolicySummary || "",
  adaptivePolicyTraces: clonePlainValue(weeklyIntent.adaptivePolicyTraces || []),
  sessionsByDay: normalizedSessions,
 template: clonePlainValue(template || {}),
 summary: weeklyIntent.rationale,
 constraints: clonePlainValue(weeklyIntent.weeklyConstraints || []),
 source: {
 sessionModel: sessionSource,
 specificity,
 planningModel: normalizedProgramBlock ? "program_block" : "block_intent_legacy",
 hasCanonicalSessions: hasCanonicalSessionPattern,
 planningBasisMode: planningBasis?.basisMode || "",
 usesTemplateFallback: sessionSource === "template_fallback",
 },
 };
};

/**
 * Canonical PlanDay contract shared by Today, Program, Coach, Nutrition, and Logging.
 *
 * Shape:
 * {
 * id,
 * dateKey,
 * dayOfWeek,
 * week,
 * base: {
 * training,
 * nutrition,
 * recovery,
 * supplements,
 * logging,
 * },
 * resolved: {
 * training,
 * nutrition: { prescription, reality },
 * recovery,
 * supplements,
 * logging,
 * },
 * decision: {
 * mode,
 * modeLabel,
 * confidence,
 * source,
 * inputDriven,
 * modifiedFromBase,
 * },
 * provenance: {
 * keyDrivers,
 * adjustments,
 * summary,
 * },
 * flags,
 * }
 */
export const buildCanonicalPlanDay = (args = {}) => {
 const {
 dateKey = "",
 dayOfWeek = 0,
 currentWeek = 1,
 baseWeek = {},
 basePlannedDay = null,
 resolvedDay = null,
 todayPlan = null,
 readiness = null,
 nutrition = {},
 adjustments = {},
 context = {},
 logging = {},
 } = args;
 const baseTraining = clonePlainValue(basePlannedDay || {});
 const resolvedTraining = clonePlainValue(resolvedDay || basePlannedDay || {});
 const planWeek = clonePlainValue(context?.planWeek || null);
 const planningBasis = clonePlainValue(context?.planningBasis || planWeek?.planningBasis || null);
 const programBlock = clonePlainValue(context?.programBlock || planWeek?.programBlock || null);
 const compatibilityBlockIntent = clonePlainValue(
 context?.blockIntent
 || planWeek?.blockIntent
 || buildProgramBlockCompatibilityIntent(programBlock)
 || null
 );
 const weeklyIntent = clonePlainValue(context?.weeklyIntent || planWeek?.weeklyIntent || null);
 const readinessState = clonePlainValue(readiness || {});
 const nutritionPrescription = clonePlainValue(nutrition?.prescription || null);
 const nutritionReality = clonePlainValue(nutrition?.reality || null);
 const nutritionActual = clonePlainValue(nutrition?.actual || null);
 const nutritionComparison = clonePlainValue(nutrition?.comparison || null);
 const dailyCheckin = clonePlainValue(logging?.dailyCheckin || null);
 const sessionLog = clonePlainValue(logging?.sessionLog || null);
 const nutritionLog = clonePlainValue(logging?.nutritionLog || null);
 const supplementLog = clonePlainValue(logging?.supplementLog || null);
 const dayOverride = adjustments?.dayOverride || null;
 const nutritionOverride = adjustments?.nutritionOverride || null;
 const injuryRule = adjustments?.injuryRule || null;
 const injuryState = clonePlainValue(adjustments?.injuryState || null);
 const failureMode = adjustments?.failureMode || null;
 const garminReadiness = adjustments?.garminReadiness || null;
 const deviceSyncAudit = adjustments?.deviceSyncAudit || null;
 const environmentSelection = adjustments?.environmentSelection || null;
 const supplementsPlan = buildCanonicalSupplementPlan({
 dateKey,
 supplementPlan: clonePlainValue(
 nutritionPrescription?.supplements
 || context?.supplementPlan
 || []
 ),
 training: resolvedTraining,
 nutritionPrescription,
 });
 const supplementsActual = deriveSupplementActual({
 supplementPlan: supplementsPlan,
 nutritionActualLog: nutritionActual || nutritionLog || null,
 supplementLog,
 });
 const baseRecoveryPrescription = buildRecoveryPrescription({
 dateKey,
 training: baseTraining,
 readinessState: null,
 nutritionPrescription,
 supplementPlan: supplementsPlan,
 injuryState,
 });
 const resolvedRecoveryPrescription = buildRecoveryPrescription({
 dateKey,
 training: resolvedTraining,
 readinessState,
 nutritionPrescription,
 supplementPlan: supplementsPlan,
 injuryState,
 });
 const actualRecovery = normalizeActualRecoveryLog({
 dateKey,
 dailyCheckin,
 nutritionActualLog: nutritionActual || nutritionLog || null,
 recoveryPrescription: resolvedRecoveryPrescription,
 supplementPlan: supplementsPlan,
 supplementLog,
 injuryState,
 });

 const baseSignature = normalizeTrainingSignature(baseTraining);
 const resolvedSignature = normalizeTrainingSignature(resolvedTraining);
 const comparisonModified = baseSignature !== resolvedSignature;
 const provenanceTimestamp = Date.now();

 const adjustmentEvents = [
 dayOverride ? buildProvenanceEvent({
 actor: dayOverride?.provenance?.actor || PROVENANCE_ACTORS.user,
 trigger: "day_override",
 mutationType: "daily_override",
 revisionReason: String(dayOverride?.reason || "day override").replace(/_/g, " "),
 sourceInputs: dayOverride?.provenance?.sourceInputs || ["coachPlanAdjustments.dayOverrides"],
 confidence: dayOverride?.provenance?.confidence || "high",
 timestamp: dayOverride?.provenance?.timestamp || provenanceTimestamp,
 details: {
 mode: dayOverride?.type || "",
 sourcePath: "coachPlanAdjustments.dayOverrides",
 },
 }) : null,
 nutritionOverride ? buildProvenanceEvent({
 actor: nutritionOverride?.provenance?.actor || PROVENANCE_ACTORS.user,
 trigger: "nutrition_override",
 mutationType: "nutrition_override",
 revisionReason: String(nutritionOverride?.reason || nutritionOverride?.dayType || nutritionOverride).replace(/_/g, " "),
 sourceInputs: nutritionOverride?.provenance?.sourceInputs || ["coachPlanAdjustments.nutritionOverrides"],
 confidence: nutritionOverride?.provenance?.confidence || "high",
 timestamp: nutritionOverride?.provenance?.timestamp || provenanceTimestamp,
 details: {
 dayType: nutritionOverride?.dayType || nutritionOverride,
 sourcePath: "coachPlanAdjustments.nutritionOverrides",
 },
 }) : null,
 injuryRule?.mods?.length ? buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "injury_rule",
 mutationType: "protective_adjustment",
 revisionReason: injuryRule.mods.join("; "),
 sourceInputs: ["injuryPainState", "buildInjuryRuleResult"],
 confidence: "high",
 timestamp: provenanceTimestamp,
 details: {
 modifications: clonePlainValue(injuryRule.mods || []),
 },
 }) : null,
 failureMode?.mode && failureMode.mode !== "normal" ? buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "failure_mode",
 mutationType: "compliance_hardening",
 revisionReason: String(failureMode.mode).replace(/_/g, " "),
 sourceInputs: ["failureMode", "momentum", "logs"],
 confidence: "high",
 timestamp: provenanceTimestamp,
 details: {
 mode: failureMode.mode,
 },
 }) : null,
 garminReadiness?.mode ? buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "device_readiness",
 mutationType: "readiness_adjustment",
 revisionReason: `garmin readiness ${String(garminReadiness.mode).replace(/_/g, " ")}`,
 sourceInputs: ["garminReadiness", "connectedDevices.garmin"],
 confidence: "medium",
 timestamp: provenanceTimestamp,
 details: {
 mode: garminReadiness.mode,
 },
 }) : null,
 deviceSyncAudit?.planMode && deviceSyncAudit.planMode !== "normal" ? buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "device_sync",
 mutationType: "device_fallback",
 revisionReason: String(deviceSyncAudit.reason || `device plan mode ${deviceSyncAudit.planMode}`).trim(),
 sourceInputs: ["deviceSyncAudit", "connectedDevices"],
 confidence: "medium",
 timestamp: provenanceTimestamp,
 details: {
 planMode: deviceSyncAudit.planMode,
 },
 }) : null,
 environmentSelection?.scope === "today" ? buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.user,
 trigger: "environment_override",
 mutationType: "daily_override",
 revisionReason: `${String(environmentSelection?.mode || "custom")} mode for today`,
 sourceInputs: ["environmentSelection", "environmentConfig.todayOverride"],
 confidence: "high",
 timestamp: provenanceTimestamp,
 details: {
 scope: environmentSelection?.scope || "",
 mode: environmentSelection?.mode || "",
 },
 }) : null,
 readinessState?.state && readinessState.state !== "steady" ? buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "readiness_adjustment",
 mutationType: "readiness_adjustment",
 revisionReason: readinessState?.userVisibleLine || readinessState?.stateLabel || readinessState?.state,
 sourceInputs: [
 "dailyCheckins",
 "recent_session_history",
 readinessState?.metrics?.hasTodayRecoveryInput ? "today_readiness_input" : "",
 readinessState?.source || "readiness_engine",
 ],
 confidence: "high",
 timestamp: provenanceTimestamp,
 details: {
 state: readinessState?.state || "",
 source: readinessState?.source || "deterministic_engine",
 },
 }) : null,
 ].filter(Boolean);
 const basisTodayLine = sanitizeText(planningBasis?.todayLine || planningBasis?.planBasisExplanation?.todayLine || "", 200);
 const basisCompromiseLine = sanitizeText(planningBasis?.compromiseLine || planningBasis?.planBasisExplanation?.compromiseSummary || "", 200);

 const keyDrivers = dedupeStrings([
 todayPlan?.reason,
 weeklyIntent?.changeSummary?.headline || planWeek?.changeSummary?.headline || "",
 basisTodayLine ? `basis ${basisTodayLine}` : "",
 basisCompromiseLine ? `compromise ${basisCompromiseLine}` : "",
 programBlock?.dominantEmphasis?.label ? `block ${programBlock.dominantEmphasis.label}` : "",
 weeklyIntent?.focus ? `week focus ${weeklyIntent.focus}` : "",
 weeklyIntent?.aggressionLevel ? `week posture ${String(weeklyIntent.aggressionLevel).replace(/_/g, " ")}` : "",
 ...(Array.isArray(readinessState?.factors) ? readinessState.factors : []),
 dayOverride?.reason ? String(dayOverride.reason).replace(/_/g, " ") : "",
 nutritionOverride ? `nutrition ${String(nutritionOverride).replace(/_/g, " ")}` : "",
 injuryRule?.mods?.[0] || "",
 failureMode?.mode && failureMode.mode !== "normal" ? `failure mode ${String(failureMode.mode).replace(/_/g, " ")}` : "",
 garminReadiness?.mode ? `garmin readiness ${String(garminReadiness.mode).replace(/_/g, " ")}` : "",
 deviceSyncAudit?.planMode && deviceSyncAudit.planMode !== "normal" ? String(deviceSyncAudit.reason || `device plan mode ${deviceSyncAudit.planMode}`) : "",
 environmentSelection?.mode ? `${String(environmentSelection.mode).toLowerCase()} environment` : "",
 ]).slice(0, 6);

 const modifiedFromBase = comparisonModified || adjustmentEvents.length > 0;
 const decisionMode = readinessState?.state
 || resolvedTraining?.readinessState
 || (modifiedFromBase ? "adjusted" : "planned");
 const decisionModeLabel = readinessState?.stateLabel
 || resolvedTraining?.readinessStateLabel
 || (modifiedFromBase ? "Adjusted" : "Planned");

 return {
 id: dateKey ? `plan_day_${dateKey}` : `plan_day_week_${currentWeek}_day_${dayOfWeek}`,
 dateKey,
 dayOfWeek,
 week: {
 currentWeek,
 phase: resolvedTraining?.week?.phase || programBlock?.phase || baseWeek?.phase || "",
 label: resolvedTraining?.week?.label || programBlock?.label || baseWeek?.label || "",
 architecture: context?.architecture || "",
 programBlock,
 blockIntent: compatibilityBlockIntent,
 planningBasis,
 planWeekId: planWeek?.id || "",
 status: planWeek?.status || weeklyIntent?.status || "planned",
 adjusted: Boolean(planWeek?.adjusted || weeklyIntent?.adjusted),
 summary: planWeek?.summary || weeklyIntent?.rationale || programBlock?.summary || "",
 constraints: clonePlainValue(planWeek?.constraints || weeklyIntent?.weeklyConstraints || programBlock?.constraints || []),
 successDefinition: weeklyIntent?.successDefinition || programBlock?.successCriteria?.[0] || "",
 weeklyIntent,
 changeSummary: clonePlainValue(planWeek?.changeSummary || weeklyIntent?.changeSummary || null),
 planWeek,
 todayPlan: clonePlainValue(todayPlan || null),
 },
 base: {
 training: baseTraining,
 nutrition: {
 dayType: baseTraining?.nutri || nutritionPrescription?.dayType || null,
 prescription: null,
 actual: null,
 comparison: null,
 },
 recovery: {
 mode: baseTraining?.type === "rest" ? "recovery" : "planned",
 recommendation: baseTraining?.recoveryRecommendation || baseRecoveryPrescription?.summary || "",
 success: baseTraining?.success || baseRecoveryPrescription?.successCriteria?.[0] || "",
 prescription: baseRecoveryPrescription,
 actual: null,
 summary: baseRecoveryPrescription?.summary || "",
 },
 supplements: {
 plan: supplementsPlan,
 actual: null,
 summary: supplementsPlan?.summary || "",
 },
 logging: {
 dateKey,
 expectedStatus: "planned",
 },
 },
 resolved: {
 training: resolvedTraining,
 nutrition: {
 dayType: nutritionPrescription?.dayType || resolvedTraining?.nutri || baseTraining?.nutri || null,
 prescription: nutritionPrescription,
 reality: nutritionReality,
 actual: nutritionActual,
 comparison: nutritionComparison,
 },
 recovery: {
 state: readinessState?.state || resolvedTraining?.readinessState || "steady",
 stateLabel: readinessState?.stateLabel || resolvedTraining?.readinessStateLabel || "Steady",
 source: readinessState?.source || "deterministic_engine",
 inputDriven: Boolean(readinessState?.inputDriven),
 coachLine: readinessState?.coachLine || "",
 recoveryLine: readinessState?.recoveryLine || resolvedTraining?.recoveryRecommendation || "",
 userVisibleLine: readinessState?.userVisibleLine || "",
 factors: clonePlainValue(readinessState?.factors || []),
 metrics: clonePlainValue(readinessState?.metrics || resolvedTraining?.readinessInputs || {}),
 summary: resolvedRecoveryPrescription?.summary || "",
 prescription: {
 ...clonePlainValue(resolvedRecoveryPrescription || {}),
 recommendation: resolvedTraining?.recoveryRecommendation || resolvedRecoveryPrescription?.summary || "",
 success: resolvedTraining?.success || resolvedRecoveryPrescription?.successCriteria?.[0] || "",
 intensityGuidance: resolvedTraining?.intensityGuidance || "",
 },
 actual: actualRecovery,
 },
 supplements: {
 plan: supplementsPlan,
 actual: supplementsActual,
 summary: supplementsPlan?.summary || "",
 },
 logging: {
 dateKey,
 status: logging?.sessionStatus || "not_logged",
 dailyCheckin,
 sessionLog,
 nutritionLog,
 supplementLog: supplementsActual?.takenMap || supplementsActual,
 hasCheckin: Boolean(dailyCheckin),
 hasSessionLog: Boolean(sessionLog),
 hasNutritionLog: Boolean(nutritionLog),
 hasRecoveryLog: Boolean(actualRecovery?.loggedAt),
 },
 },
 decision: {
 mode: decisionMode,
 modeLabel: decisionModeLabel,
 confidence: null,
 source: readinessState?.source || (adjustmentEvents[0]?.trigger || "deterministic_engine"),
 inputDriven: Boolean(readinessState?.inputDriven),
 modifiedFromBase,
 },
 provenance: {
 ...buildStructuredProvenance({
 keyDrivers,
 events: [
 buildProvenanceEvent({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "plan_day_resolution",
 mutationType: "plan_day_resolution",
 revisionReason: modifiedFromBase ? "resolved daily recommendation differs from base plan" : "resolved daily recommendation matches base plan",
 sourceInputs: [
 "weeklyIntent",
 "todayPlan",
 "basePlannedDay",
 "readiness",
 "nutrition",
 ],
 confidence: "high",
 timestamp: provenanceTimestamp,
 details: {
 modifiedFromBase,
 decisionMode,
 },
 }),
 ...adjustmentEvents,
 ],
 summary: buildPlanDaySummary(keyDrivers, modifiedFromBase),
 }),
 keyDrivers,
 summary: buildPlanDaySummary(keyDrivers, modifiedFromBase),
 adjustments: buildLegacyProvenanceAdjustmentView(adjustmentEvents),
 },
 flags: {
 isModified: modifiedFromBase,
 coachModified: Boolean(dayOverride || nutritionOverride),
 environmentModified: Boolean(environmentSelection?.scope === "today" || resolvedTraining?.environmentNote),
 injuryModified: Boolean(injuryRule?.mods?.length),
 readinessModified: Boolean(readinessState?.state && readinessState.state !== "steady"),
 nutritionModified: Boolean(
 nutritionOverride
 || (nutritionPrescription?.dayType && nutritionPrescription.dayType !== baseTraining?.nutri)
 ),
 deviceModified: Boolean(garminReadiness?.mode || (deviceSyncAudit?.planMode && deviceSyncAudit.planMode !== "normal")),
 failureModeModified: Boolean(failureMode?.mode && failureMode.mode !== "normal"),
 minDay: Boolean(resolvedTraining?.minDay),
 restDay: ["rest", "recovery"].includes(String(resolvedTraining?.type || "").toLowerCase()),
 },
 };
};

export const composeGoalNativePlan = ({
 goals,
 personalization,
 momentum,
 learningLayer,
 baseWeek,
 currentWeek = 1,
 weekTemplates = [],
 athleteProfile = null,
 logs = {},
 bodyweights = [],
 dailyCheckins = {},
 nutritionActualLogs = {},
 weeklyNutritionReview = null,
 coachActions = [],
 todayKey = "",
 currentDayOfWeek = null,
 plannedDayRecords = {},
 planWeekRecords = {},
  adaptivePolicyConfig = null,
  adaptivePolicyEvidence = null,
}) => {
 const { active } = getGoalBuckets(goals);
 const primary = active[0] || null;
 const secondary = active.slice(1, 3);
 const goalLaneModel = buildGoalLaneModel({ activeGoals: active });
 const trainingContext = deriveTrainingContextFromPersonalization({ personalization });
 const plannerEquipmentProfile = buildEquipmentProfile({
  trainingContext,
  userProfile: { trainingContext },
 }, { trainingContext });
 const activeIssueContext = deriveActiveIssueContextFromPersonalization({ personalization });
 const env = trainingContext?.environment?.confirmed ? trainingContext.environment.value : "unknown";
 const equipmentAccess = trainingContext?.equipmentAccess?.value || TRAINING_EQUIPMENT_VALUES.unknown;
 const environmentKnown = Boolean(trainingContext?.environment?.confirmed);
 const equipmentKnown = Boolean(trainingContext?.equipmentAccess?.confirmed);
 const hasGym = equipmentAccess === TRAINING_EQUIPMENT_VALUES.fullGym || equipmentAccess === TRAINING_EQUIPMENT_VALUES.basicGym;
 const runningGoal = goalLaneModel.runningLane?.leadGoal || active.find((goal) => normalizePlanningLaneCategory(goal) === "running");
 const strengthGoal = goalLaneModel.strengthLane?.leadGoal || active.find((goal) => normalizePlanningLaneCategory(goal) === "strength");
 const bodyCompGoal = goalLaneModel.bodyCompLane?.leadGoal || active.find((goal) => normalizePlanningLaneCategory(goal) === "body_comp");
 const hasRunningGoal = Boolean(goalLaneModel.runningLane?.active || runningGoal);
 const primaryResolvedGoal = primary?.resolvedGoal || null;
 const preservesRunLaneDespiteStrengthPriority = Boolean(
  primaryResolvedGoal
  && (
   String(primaryResolvedGoal?.goalFamily || "").toLowerCase() === "hybrid"
   || String(primaryResolvedGoal?.goalDiscoveryFamilyId || "").toLowerCase() === "hybrid"
   || String(primaryResolvedGoal?.planArchetypeFamily || "").toLowerCase() === "hybrid"
   || /run_lift|strength_conditioning_balanced|aesthetic_endurance|sport_support/i.test(String(primaryResolvedGoal?.planArchetypeId || ""))
  )
 );
  const raceNear = daysUntil(runningGoal?.targetDate) <= 56;
  const inconsistencyRisk = momentum?.inconsistencyRisk || "medium";
  const lowBandwidth = inconsistencyRisk === "high" || learningLayer?.adjustmentBias === "simplify";
 const strengthPriority = primary?.category === "strength" && !lowBandwidth;
 const bodyCompActive = Boolean(goalLaneModel.bodyCompLane?.active || bodyCompGoal);
 const resolvedGoals = active.map((goal) => goal?.resolvedGoal).filter(Boolean);
 const supportPlanningContext = buildGoalSupportPlanningContext({
  goals: active,
  logs,
  now: todayKey || new Date(),
 });
 const habitAdaptationContext = buildHabitAdaptationContext({
  logs,
  plannedDayRecords,
  todayKey: todayKey || new Date(),
 });
 const upperBodyMaintenance = Boolean(runningGoal && strengthGoal && goalLaneModel.upperBodyStrengthBias);
 const planArchetypeOverlay = buildPlanArchetypeOverlay({
 primaryGoal: primary,
 secondaryGoals: secondary,
 baseWeek,
 });
 const trainingPreferencePolicy = resolveTrainingPreferencePolicy({
  trainingContext,
  personalization,
  });
  const trainingDaysPerWeek = Number(personalization?.userGoalProfile?.days_per_week || personalization?.canonicalAthlete?.userProfile?.daysPerWeek || 0);
  const availableTrainingDayKeys = resolveExplicitAvailableTrainingDayKeys(trainingContext);
  const sessionDurationValue = trainingContext?.sessionDuration?.confirmed ? trainingContext.sessionDuration.value : "";
  const timeCrunched = lowBandwidth || ["20", "30", TRAINING_SESSION_DURATION_VALUES.min20, TRAINING_SESSION_DURATION_VALUES.min30].includes(String(sessionDurationValue || "")) || (trainingDaysPerWeek > 0 && trainingDaysPerWeek <= 3);
  const travelState = personalization?.travelState || {};
  const travelHeavy = Boolean(travelState?.isTravelWeek) || ["travel", "variable"].includes(String(env || "").toLowerCase());
  const outdoorPreferred = String(env || "").toLowerCase() === "outdoor" || String(travelState?.environmentMode || "").toLowerCase() === "outdoor";
  const hybridAthlete = Boolean(
    (primaryResolvedGoal && (
      String(primaryResolvedGoal?.goalFamily || "").toLowerCase() === "hybrid"
      || String(primaryResolvedGoal?.goalDiscoveryFamilyId || "").toLowerCase() === "hybrid"
      || String(primaryResolvedGoal?.planArchetypeFamily || "").toLowerCase() === "hybrid"
    ))
    || (hasRunningGoal && Boolean(strengthGoal))
  );
  const adaptivePolicyRuntime = resolveAdaptiveLearningScaffolding({
    personalization,
    adaptiveLearningConfig: personalization?.settings?.adaptiveLearning || personalization?.adaptiveLearning || null,
    adaptivePolicyConfig,
    adaptivePolicyEvidence,
  }).policyRuntime;
 const safeTodayKey = sanitizeText(todayKey || new Date().toISOString().split("T")[0], 24);
 const safeCurrentDayOfWeek = Number.isInteger(currentDayOfWeek)
 ? currentDayOfWeek
 : new Date(`${safeTodayKey}T12:00:00`).getDay();
 const primaryGoalFamily = sanitizeText(
  primaryResolvedGoal?.planArchetypeFamily
   || primaryResolvedGoal?.goalDiscoveryFamilyId
   || primaryResolvedGoal?.goalFamily
   || primary?.goalFamily
   || "",
  40
 ).toLowerCase();
 const primaryGoalDomain = sanitizeText(primaryResolvedGoal?.primaryDomain || "", 80).toLowerCase();

 const runningScore = (primary?.category === "running" ? 3 : 0) + (runningGoal ? 2 : 0) + (raceNear ? 2 : 0);
 const strengthEnvironmentScore = hasGym ? 1 : equipmentKnown ? -1 : 0;
 const strengthScore = (primary?.category === "strength" ? 3 : 0) + (strengthGoal ? 2 : 0) + strengthEnvironmentScore;
 const bodyCompScore = (primary?.category === "body_comp" ? 3 : 0) + (bodyCompGoal ? 2 : 0) + (lowBandwidth ? 1 : 0);

 let architecture = "hybrid_performance";
 if (lowBandwidth) {
 if (primary?.category === "strength") architecture = "strength_dominant";
 else if (primary?.category === "body_comp") architecture = "body_comp_conditioning";
 else architecture = "maintenance_rebuild";
 } else if (primary?.category === "running" && upperBodyMaintenance) architecture = "event_prep_upper_body_maintenance";
 else if (primary?.category === "running") architecture = "race_prep_dominant";
 else if (primary?.category === "body_comp") architecture = "body_comp_conditioning";
 else if (primary?.category === "strength") architecture = "strength_dominant";
 else if (runningScore >= Math.max(strengthScore, bodyCompScore) && raceNear && upperBodyMaintenance) architecture = "event_prep_upper_body_maintenance";
 else if (runningScore >= Math.max(strengthScore, bodyCompScore) && raceNear) architecture = "race_prep_dominant";
 else if (bodyCompScore >= Math.max(runningScore, strengthScore)) architecture = "body_comp_conditioning";
 else if (strengthScore >= Math.max(runningScore, bodyCompScore)) architecture = "strength_dominant";
 const domainSelection = selectDomainAdapter({
 goals: active,
 defaultArchitecture: planArchetypeOverlay?.architectureOverride || architecture,
 lowBandwidth,
 upperBodyMaintenance,
 });
 const domainAdapter = domainSelection?.adapter || null;
 const supportTier = buildSupportTierModel({
 goals: active,
 domainAdapterId: domainAdapter?.id || "",
 goalCapabilityStack: domainSelection?.capabilityStack || null,
 });
 architecture = planArchetypeOverlay?.architectureOverride || domainSelection?.architectureOverride || architecture;

 const splits = {
 event_prep_upper_body_maintenance: { run: 4, strength: 2, conditioning: 0, recovery: 1 },
 race_prep_dominant: { run: 4, strength: 2, conditioning: 1, recovery: 1 },
 strength_dominant: { run: 2, strength: 4, conditioning: 1, recovery: 1 },
 body_comp_conditioning: { run: 2, strength: 3, conditioning: 2, recovery: 1 },
 hybrid_performance: { run: 3, strength: 3, conditioning: 1, recovery: 1 },
 maintenance_rebuild: { run: 2, strength: 2, conditioning: 1, recovery: 2 },
 };
 const noRunGoalSplitOverrides = {
 strength_dominant: { run: 0, strength: 4, conditioning: 2, recovery: 1 },
 body_comp_conditioning: { run: 0, strength: 3, conditioning: 3, recovery: 1 },
 hybrid_performance: { run: 0, strength: 3, conditioning: 2, recovery: 1 },
 maintenance_rebuild: { run: 0, strength: 2, conditioning: 1, recovery: 2 },
 };
 const defaultSplit = !hasRunningGoal && noRunGoalSplitOverrides[architecture]
 ? noRunGoalSplitOverrides[architecture]
 : splits[architecture];

 const constraints = [];
 if (equipmentKnown && !hasGym && strengthGoal) constraints.push("Bench-specific progression constrained by the confirmed equipment setup; using lower-equipment substitutes.");
 if (!["race_prep_dominant", "event_prep_upper_body_maintenance"].includes(architecture) && runningGoal) constraints.push("Running kept supportive/maintenance until running priority or race proximity increases.");
 if (architecture === "event_prep_upper_body_maintenance") constraints.push("Lower-body lifting volume is capped so the event-prep lane keeps the cleanest recovery windows.");
 if (goalLaneModel.supportGoalLabels?.length) constraints.push(`${goalLaneModel.supportGoalLabels.join(" and ")} stay in support mode instead of taking equal planning weight this block.`);
 if (goalLaneModel.deferredGoalLabels?.length) constraints.push(`${goalLaneModel.deferredGoalLabels.join(" and ")} are deferred until the primary and maintained lanes are more secure.`);
 const capabilityPrimary = domainSelection?.capabilityStack?.primary || null;
 if (capabilityPrimary?.missingAnchors?.length) {
 constraints.push(`${domainAdapter?.label || "Current domain"} is running on the safest available fallback until ${capabilityPrimary.missingAnchors[0]} is clearer.`);
 }
 if (planArchetypeOverlay?.fatigueSummary) {
 constraints.push(planArchetypeOverlay.fatigueSummary);
 }
 const why = [
 `Primary goal: ${primary?.name || "none set"}.`,
 environmentKnown ? `Environment: ${env}.` : "Environment is still unconfirmed, so planning stays setup-neutral where possible.",
 `Inconsistency risk: ${inconsistencyRisk}.`,
 domainAdapter?.label ? `${domainAdapter.label} is the dominant planning adapter.` : null,
 bodyCompGoal ? "Body-comp goal is active and materially affects split allocation." : null,
 raceNear ? "Race date is near enough to increase running weight." : null,
 goalLaneModel.maintainedGoalLabels?.length ? `Maintained lanes: ${goalLaneModel.maintainedGoalLabels.join(", ")}.` : null,
 goalLaneModel.supportGoalLabels?.length ? `Support lanes: ${goalLaneModel.supportGoalLabels.join(", ")}.` : null,
 !hasRunningGoal && !["swimming_endurance_technique", "cycling_endurance", "triathlon_multisport"].includes(domainAdapter?.id || "") ? "No running goal is active, so conditioning stays non-run by default." : null,
 upperBodyMaintenance ? "Secondary strength work is upper-body biased, so lower-body fatigue can stay subordinate to event prep." : null,
 capabilityPrimary?.fallbackPlanningMode ? `Fallback mode: ${String(capabilityPrimary.fallbackPlanningMode).replace(/_/g, " ")}.` : null,
 ].filter(Boolean);
 if (planArchetypeOverlay?.progressionSummary) {
 why.push(planArchetypeOverlay.progressionSummary);
 }
 if (planArchetypeOverlay?.scienceRationale?.length) {
 why.push(...planArchetypeOverlay.scienceRationale.slice(0, 2));
 }
 const liveProgramPlanning = deriveLiveProgramPlanningBasis({
 personalization,
 goals,
 athleteProfile,
 defaultArchitecture: architecture,
 baseWeek,
 logs,
 plannedDayRecords,
 planWeekRecords,
 });
 const planningBasis = clonePlainValue(liveProgramPlanning?.planningBasis || null);
 const effectiveArchitecture = liveProgramPlanning?.architectureOverride || planArchetypeOverlay?.architectureOverride || domainSelection?.architectureOverride || architecture;
 const baseEffectiveSplit = !hasRunningGoal && noRunGoalSplitOverrides[effectiveArchitecture]
 ? noRunGoalSplitOverrides[effectiveArchitecture]
 : (splits[effectiveArchitecture] || defaultSplit);
 const effectiveSplit = planArchetypeOverlay?.splitOverride
 ? clonePlainValue(planArchetypeOverlay.splitOverride)
 : domainAdapter?.id === "swimming_endurance_technique"
 ? { ...baseEffectiveSplit, swim: 4, strength: 2, conditioning: 0, recovery: 1 }
 : domainAdapter?.id === "power_vertical_plyometric"
 ? { ...baseEffectiveSplit, power: 3, strength: 2, conditioning: 1, recovery: 1 }
 : baseEffectiveSplit;
 const fidelitySummary = liveProgramPlanning?.runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.strict
 ? "run mostly as written"
 : liveProgramPlanning?.runtimeFidelityMode === PROGRAM_RUNTIME_FIDELITY.styleOnly
 ? "used as a style influence"
 : "adapted to your current reality";
 if (planningBasis?.activeProgramName) {
 why.push(`${planningBasis.activeProgramName} is active and ${fidelitySummary}.`);
 } else if (planningBasis?.activeStyleName) {
 why.push(`${planningBasis.activeStyleName} is shaping the feel of the week without replacing the main plan logic.`);
 }
 if (planningBasis?.compromiseLine) constraints.push(planningBasis.compromiseLine);

 const restDay = (label = "Active Recovery") => buildScheduleBufferRecovery(label);

 const dayTemplates = {
 event_prep_upper_body_maintenance: {
 1: { type: "hard-run", label: `${baseWeek.mon?.t || "Quality"} Run`, run: baseWeek.mon, nutri: NUTRITION_DAY_TYPES.runQuality, optionalSecondary: "Optional: short trunk support after the run." },
 2: { type: "strength+prehab", label: "Upper-Body Maintenance A", strSess: baseWeek.str || "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, upperBodyBias: true, optionalSecondary: "Optional: 8 min shoulder mobility reset." },
 3: { type: "easy-run", label: "Easy Run", run: baseWeek.fri || { t: "Easy", d: "25-35 min" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: 5-10 min mobility finish." },
 4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: NUTRITION_DAY_TYPES.runQuality, optionalSecondary: "Optional: fueling and calf reset after the main work." },
 5: { type: "strength+prehab", label: "Upper-Body Maintenance B", strSess: baseWeek.str === "A" ? "B" : "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, upperBodyBias: true, optionalSecondary: "Optional: cuff or scap stability finisher." },
 6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: NUTRITION_DAY_TYPES.runLong, optionalSecondary: "Optional: 10 min walk and mobility cooldown." },
 0: restDay("Active Recovery"),
 },
 race_prep_dominant: {
 1: { type: "run+strength", label: "Quality Run + Strength Finish", run: baseWeek.mon, strSess: baseWeek.str, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: short lift finisher only if the run stayed smooth." },
 2: { type: "conditioning", label: "Conditioning Intervals", nutri: NUTRITION_DAY_TYPES.conditioningMixed, optionalSecondary: "Optional: mobility reset to keep legs fresh for the next run." },
 3: { type: "strength+prehab", label: "Strength + Durability", strSess: baseWeek.str === "A" ? "B" : "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: calf and foot durability work." },
 4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: NUTRITION_DAY_TYPES.runQuality, optionalSecondary: "Optional: short mobility and fueling reset." },
 5: { type: "easy-run", label: "Easy Run", run: baseWeek.fri, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: 4-6 relaxed strides if recovery is good." },
 6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: NUTRITION_DAY_TYPES.runLong, optionalSecondary: "Optional: walk, calf work, and fueling reset after the run." },
 0: restDay("Active Recovery"),
 },
 strength_dominant: {
 1: { type: "strength+prehab", label: "Full-Body Strength A", strSess: "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: carry or trunk finisher." },
 2: hasRunningGoal
 ? { type: "easy-run", label: "Easy Conditioning Run", run: { t: "Easy", d: "20-30 min zone-2" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: mobility reset after the run." }
 : buildConditioningSession({ label: "Supportive Conditioning", detail: "20-30 min zone-2 bike, rower, incline walk, or circuit", lowImpact: true }),
 3: { type: "strength+prehab", label: "Full-Body Strength B", strSess: "B", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: short mobility or trunk finisher." },
 4: { type: "strength+prehab", label: "Upper Push/Pull Strength", strSess: "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: shoulder-health accessory work." },
 5: hasRunningGoal
 ? { type: "easy-run", label: "Conditioning Support", run: { t: "Easy", d: "20-25 min + strides optional" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: strides or light mobility if readiness is good." }
 : buildConditioningSession({ label: "Conditioning Support", detail: "15-25 min controlled conditioning + mobility finish", lowImpact: true }),
 6: { type: "strength+prehab", label: "Full-Body Strength", strSess: "B", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: short walk cooldown to support recovery." },
 0: restDay("Active Recovery"),
 },
 body_comp_conditioning: {
 1: { type: "strength+prehab", label: "Strength Circuit A", strSess: "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: 5-10 min trunk finish." },
 2: hasRunningGoal
 ? { type: "easy-run", label: "Conditioning (low-friction)", run: { t: "Easy", d: "25-35 min zone-2" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: mobility reset to keep tomorrow easier." }
 : buildConditioningSession({ label: "Conditioning (low-friction)", detail: "25-35 min zone-2 bike, incline walk, or circuit", lowImpact: true }),
 3: { type: "strength+prehab", label: "Strength Circuit B", strSess: "B", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: loaded carry finisher." },
 4: { type: "conditioning", label: "Conditioning Intervals", nutri: NUTRITION_DAY_TYPES.conditioningMixed, optionalSecondary: "Optional: 5 min walk cooldown after intervals." },
 5: { type: "strength+prehab", label: "Strength Retention", strSess: "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: easy mobility reset." },
 6: hasRunningGoal
 ? { type: "easy-run", label: "Easy Run/Walk", run: { t: "Easy", d: "20-30 min" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: short core or mobility finisher." }
 : buildConditioningSession({ label: "Supportive Conditioning", detail: "20-30 min easy conditioning or brisk walk", lowImpact: true }),
 0: restDay("Active Recovery - Steps + Mobility"),
 },
 hybrid_performance: {
 1: hasRunningGoal
 ? { type: "run+strength", label: "Easy Run + Strength Finish", run: baseWeek.mon, strSess: baseWeek.str, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: short lift finisher if the run stayed easy." }
 : { type: "strength+prehab", label: "Strength + Conditioning Primer", strSess: baseWeek.str, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: easy aerobic cooldown." },
 2: { type: "conditioning", label: "Conditioning", nutri: NUTRITION_DAY_TYPES.conditioningMixed, optionalSecondary: "Optional: mobility reset to keep hybrid load coherent." },
 3: { type: "strength+prehab", label: "Full-Body Strength B + Durability", strSess: baseWeek.str === "A" ? "B" : "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: durability finisher for shoulders, hips, or trunk." },
 4: hasRunningGoal
 ? { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: NUTRITION_DAY_TYPES.runQuality, optionalSecondary: "Optional: short mobility and fueling reset." }
 : buildConditioningSession({ label: "Conditioning Intervals", detail: "20-30 min controlled intervals or mixed-modality conditioning" }),
 5: { type: "strength+prehab", label: "Full-Body Strength Focus", strSess: baseWeek.str, nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: low-drama carry or trunk finisher." },
 6: hasRunningGoal
 ? { type: "easy-run", label: "Supportive Endurance", run: baseWeek.fri, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: strides or mobility if recovery is still good." }
 : buildConditioningSession({ label: "Supportive Conditioning", detail: "20-30 min easy conditioning to keep work capacity alive", lowImpact: true }),
 0: restDay("Active Recovery"),
 },
 maintenance_rebuild: {
 1: { type: "strength+prehab", label: "Short Full-Body Strength A", strSess: "A", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: simple mobility reset." },
 2: restDay("Active Recovery - Walk"),
 3: hasRunningGoal
 ? { type: "easy-run", label: "Short Conditioning", run: { t: "Easy", d: "20-25 min" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: easy mobility finish." }
 : buildConditioningSession({ label: "Short Conditioning", detail: "15-20 min easy conditioning or brisk walk", lowImpact: true }),
 4: { type: "strength+prehab", label: "Short Full-Body Strength B", strSess: "B", nutri: NUTRITION_DAY_TYPES.strengthSupport, optionalSecondary: "Optional: trunk finisher if energy is good." },
 5: restDay("Active Recovery"),
 6: buildConditioningSession({ label: "Optional Conditioning", detail: "15-20 min optional easy conditioning", lowImpact: true }),
 0: restDay("Active Recovery"),
 },
 };

 const annotateTemplate = (template) => {
 const out = Object.fromEntries(Object.entries(template || {}).map(([day, session]) => {
 const nextSession = { ...session };
 const isStrengthSession = ["run+strength", "strength+prehab"].includes(nextSession.type);
 if (isStrengthSession && !strengthPriority && !/short strength/i.test(nextSession.label || "")) {
 nextSession.label = `${nextSession.label} (Short Strength)`;
 }
 if (isStrengthSession) {
 nextSession.strengthDose = strengthPriority ? "40-55 min strength progression" : "20-35 min maintenance strength";
 }
 const allowsOptionalCore = nextSession.type !== "rest";
 if (bodyCompActive && allowsOptionalCore) {
 nextSession.optionalSecondary = nextSession.optionalSecondary
 ? `${String(nextSession.optionalSecondary).replace(/\.*\s*$/, "")}. Optional: 8-10 min trunk support if recovery allows.`
 : "Optional: 8-10 min trunk support if recovery allows.";
 }
 return [day, normalizeSessionEntryLabel(nextSession)];
 }));
 return out;
 };

 const domainSpecificTemplates = buildDomainSpecificDayTemplates({
 adapter: domainAdapter,
 architecture: effectiveArchitecture,
 baseWeek,
 strengthPriority,
 });
const planContract = resolvePlanArchetypeContract({
 goals: active,
 primaryGoal: primary,
 planArchetypeId: planArchetypeOverlay?.planArchetypeId || primary?.resolvedGoal?.planArchetypeId || "",
 primaryDomain: domainAdapter?.id || planArchetypeOverlay?.primaryDomain || primary?.resolvedGoal?.primaryDomain || "",
 planningCategory: primary?.resolvedGoal?.planningCategory || primary?.category || "",
 goalFamily: primary?.resolvedGoal?.goalFamily || "",
 architecture: effectiveArchitecture,
});
 const preferRoleAwareHybridTemplates = Boolean(
  primaryGoalFamily === "hybrid"
  || goalLaneModel.meaningfulHybrid
  || goalLaneModel.maintainedGoals?.length
  || goalLaneModel.supportGoals?.length
  || (hasRunningGoal && Boolean(strengthGoal))
  || (bodyCompActive && Boolean(strengthGoal || hasRunningGoal))
 );
 const canUseRoleAwareHybridTemplates = preferRoleAwareHybridTemplates
 && !liveProgramPlanning?.usesProgramBackbone
 && ["event_prep_upper_body_maintenance", "race_prep_dominant", "strength_dominant", "body_comp_conditioning", "hybrid_performance"].includes(effectiveArchitecture)
 && !["swimming_endurance_technique", "cycling_endurance", "triathlon_multisport", "power_vertical_plyometric"].includes(domainAdapter?.id || "");
 const roleAwareHybridTemplates = canUseRoleAwareHybridTemplates
 ? buildRoleAwareHybridWeek({
   architecture: effectiveArchitecture,
   baseWeek,
   laneModel: goalLaneModel,
   trainingContext,
   hasRunningGoal,
   bodyCompActive,
   timeCrunched,
   raceNear,
   travelHeavy,
  })
 : null;
let annotatedTemplates = liveProgramPlanning?.usesProgramBackbone && liveProgramPlanning?.dayTemplates
 ? clonePlainValue(liveProgramPlanning.dayTemplates)
 : annotateTemplate(roleAwareHybridTemplates || planArchetypeOverlay?.dayTemplates || domainSpecificTemplates || dayTemplates[effectiveArchitecture] || dayTemplates[architecture] || {});
 annotatedTemplates = liveProgramPlanning?.applyToSessions
 ? liveProgramPlanning.applyToSessions(annotatedTemplates)
 : annotatedTemplates;
 const preferenceOverlay = applyPreferencePolicyToDayTemplates({
 dayTemplates: annotatedTemplates,
 architecture: effectiveArchitecture,
 adapter: domainAdapter,
 preferencePolicy: trainingPreferencePolicy,
 });
 annotatedTemplates = preferenceOverlay?.dayTemplates || annotatedTemplates;
 const baselineInfluence = buildPlanningBaselineInfluence({
 goals: active,
 personalization,
 bodyweights,
 logs,
 });
  const baselineOverlay = applyPlanningBaselineInfluence({
  dayTemplates: annotatedTemplates,
  influence: baselineInfluence,
  });
  annotatedTemplates = baselineOverlay?.dayTemplates || annotatedTemplates;
  const hybridFatigueGuard = applyHybridFatigueGuards({
    dayTemplates: annotatedTemplates,
    architecture: effectiveArchitecture,
    laneModel: goalLaneModel,
    logs,
    todayKey: safeTodayKey,
    currentDayOfWeek: safeCurrentDayOfWeek,
    trainingContext,
  });
  annotatedTemplates = hybridFatigueGuard?.dayTemplates || annotatedTemplates;
  const adaptivePolicyContext = buildAdaptivePolicyContext({
    goals: active,
    primary,
    architecture: effectiveArchitecture,
    planArchetypeOverlay,
    trainingContext,
    trainingDaysPerWeek,
    inconsistencyRisk,
    activeIssueContext,
    runningGoalActive: hasRunningGoal,
    strengthGoalActive: Boolean(strengthGoal),
    strengthPriority,
    hybridAthlete,
    timeCrunched,
    travelHeavy,
    outdoorPreferred,
    dayTemplates: annotatedTemplates,
    currentPhase: baseWeek?.phase || "",
  });
  const adaptivePolicyTraces = [];
  const timeCrunchedDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.timeCrunchedSessionFormatChoice),
    defaultActionId: "default_structure",
    candidateActionIds: ["default_structure", "stacked_mixed_sessions", "short_separate_sessions"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      stacked_mixed_sessions: !timeCrunched ? "time_crunched_context_required" : "",
      short_separate_sessions: !timeCrunched ? "time_crunched_context_required" : "",
    },
  });
  adaptivePolicyTraces.push(timeCrunchedDecision);
  if (timeCrunchedDecision.chosenActionId === "stacked_mixed_sessions") {
    annotatedTemplates = applyStackedMixedSessions({
      dayTemplates: annotatedTemplates,
      runningGoalActive: hasRunningGoal,
    });
  } else if (timeCrunchedDecision.chosenActionId === "short_separate_sessions") {
    annotatedTemplates = applyShortSeparateSessionFormat(annotatedTemplates);
  }
  const hybridSessionFormatDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.hybridSessionFormatChoice),
    defaultActionId: "keep_current_structure",
    candidateActionIds: ["keep_current_structure", "favor_mixed_sessions", "favor_short_split_sessions"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      favor_mixed_sessions: !adaptivePolicyContext.hybridMeaningful || (!timeCrunched && trainingDaysPerWeek > 4)
        ? "hybrid_context_required"
        : "",
      favor_short_split_sessions: !adaptivePolicyContext.hybridMeaningful
        || (!timeCrunched && !adaptivePolicyContext.hybridInconsistentSchedule && !adaptivePolicyContext.hybridTravelHeavy)
        ? "hybrid_context_required"
        : "",
    },
  });
  adaptivePolicyTraces.push(hybridSessionFormatDecision);
  if (adaptivePolicyContext.hybridMeaningful) {
    annotatedTemplates = applyHybridSessionFormatChoice({
      dayTemplates: annotatedTemplates,
      actionId: hybridSessionFormatDecision.chosenActionId,
      runningGoalActive: hasRunningGoal,
    });
  }
  const travelSubstitutionDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.travelSubstitutionSet),
    defaultActionId: "default_substitutions",
    candidateActionIds: ["default_substitutions", "hotel_gym_substitutions", "outdoor_endurance_substitutions", "minimal_equipment_substitutions"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      hotel_gym_substitutions: !travelHeavy || !hasGym ? "hotel_gym_context_required" : "",
      outdoor_endurance_substitutions: !travelHeavy && !outdoorPreferred ? "outdoor_context_required" : "",
      minimal_equipment_substitutions: !travelHeavy || hasGym ? "minimal_equipment_context_required" : "",
    },
  });
  adaptivePolicyTraces.push(travelSubstitutionDecision);
  annotatedTemplates = applyTravelSubstitutionSet({
    dayTemplates: annotatedTemplates,
    actionId: travelSubstitutionDecision.chosenActionId,
  });
  const hybridBalanceDecision = scoreAdaptiveDecision({
    decisionPointId: getAdaptiveDecisionPointId(ADAPTIVE_POLICY_DECISION_POINTS.hybridRunLiftBalanceTemplate),
    defaultActionId: "balanced_hybrid",
    candidateActionIds: ["balanced_hybrid", "run_supportive_hybrid", "strength_supportive_hybrid"],
    context: adaptivePolicyContext,
    runtime: adaptivePolicyRuntime,
    excludedCandidates: {
      run_supportive_hybrid: effectiveArchitecture !== "hybrid_performance" || !adaptivePolicyContext.hybridMeaningful || !hasRunningGoal || !adaptivePolicyContext.strengthOrPhysiqueGoalActive ? "hybrid_context_required" : "",
      strength_supportive_hybrid: effectiveArchitecture !== "hybrid_performance" || !adaptivePolicyContext.hybridMeaningful || !hasRunningGoal || !adaptivePolicyContext.strengthOrPhysiqueGoalActive ? "hybrid_context_required" : "",
    },
  });
  adaptivePolicyTraces.push(hybridBalanceDecision);
  if (effectiveArchitecture === "hybrid_performance") {
    annotatedTemplates = applyHybridBalanceTemplate({
      dayTemplates: annotatedTemplates,
      actionId: hybridBalanceDecision.chosenActionId,
    });
  }
  const adaptationState = buildDynamicAdaptationState({
  dayTemplates: annotatedTemplates,
 todayKey: safeTodayKey,
 currentDayOfWeek: safeCurrentDayOfWeek,
 logs,
 plannedDayRecords,
 dailyCheckins,
 weeklyNutritionReview,
 preferencePolicy: trainingPreferencePolicy,
 preferenceEffects: preferenceOverlay?.effects || [],
 preferenceChanged: Boolean(preferenceOverlay?.changed),
 adapter: domainAdapter,
 coachActions,
 });
annotatedTemplates = adaptationState?.adaptedDayTemplates || annotatedTemplates;
annotatedTemplates = Object.fromEntries(
  Object.entries(annotatedTemplates || {}).map(([day, session]) => [day, session ? normalizeSessionEntryLabel(session) : session])
);
if (!hasRunningGoal && primary?.category === "strength" && !preservesRunLaneDespiteStrengthPriority) {
  annotatedTemplates = Object.fromEntries(
    Object.entries(annotatedTemplates || {}).map(([day, session]) => [day, convertRunSessionForStrengthFirstPlan(session)])
  );
}
annotatedTemplates = enforcePlanArchetypeContract({
  contract: planContract,
  dayTemplates: annotatedTemplates,
});
const scheduleLimitedTemplates = limitDayTemplatesToScheduleReality({
  dayTemplates: annotatedTemplates,
  targetDays: Number(personalization?.userGoalProfile?.days_per_week || personalization?.canonicalAthlete?.userProfile?.daysPerWeek || 0),
 architecture: effectiveArchitecture,
  goalLaneModel,
  primaryGoalFamily,
  primaryDomain: primaryGoalDomain,
 });
 annotatedTemplates = scheduleLimitedTemplates.dayTemplates || annotatedTemplates;
 let strengthSessionsPerWeek = Object.values(annotatedTemplates).filter(s => ["run+strength", "strength+prehab"].includes(s?.type)).length;
 if (strengthGoal && strengthSessionsPerWeek < 1 && !liveProgramPlanning?.usesProgramBackbone) {
 annotatedTemplates[3] = {
  type: "strength+prehab",
  label: goalLaneModel.upperBodyStrengthBias || hasRunningGoal ? "Upper-Body Maintenance Touchpoint" : "Minimum Strength Touchpoint",
  strSess: "A",
  nutri: NUTRITION_DAY_TYPES.strengthSupport,
  strengthDose: "20-30 min maintenance strength",
  upperBodyBias: Boolean(goalLaneModel.upperBodyStrengthBias || hasRunningGoal),
  lowerBodyLoad: hasRunningGoal ? "none" : "low",
  optionalSecondary: "Optional: short trunk or mobility finish.",
 };
 strengthSessionsPerWeek = 1;
 }
 const explicitAvailabilityOverlay = applyExplicitWeekdayAvailability({
  dayTemplates: annotatedTemplates,
  availableDayKeys: availableTrainingDayKeys,
  architecture: effectiveArchitecture,
  goalLaneModel,
  primaryGoalFamily,
  primaryDomain: primaryGoalDomain,
 });
 annotatedTemplates = explicitAvailabilityOverlay?.dayTemplates || annotatedTemplates;
 if (!liveProgramPlanning?.usesProgramBackbone) {
  const habitScheduleOverlay = applyHabitDrivenScheduleShift({
   dayTemplates: annotatedTemplates,
   habitAdaptationContext,
   architecture: effectiveArchitecture,
   allowedDayKeys: availableTrainingDayKeys,
  });
  annotatedTemplates = habitScheduleOverlay?.dayTemplates || annotatedTemplates;
  const habitLongSessionOverlay = applyPreferredLongSessionDayShift({
   dayTemplates: annotatedTemplates,
   habitAdaptationContext,
   allowedDayKeys: availableTrainingDayKeys,
  });
  annotatedTemplates = habitLongSessionOverlay?.dayTemplates || annotatedTemplates;
  const habitCardioOverlay = applyHabitDrivenCardioPreferences({
   dayTemplates: annotatedTemplates,
   habitAdaptationContext,
   architecture: effectiveArchitecture,
   hasRunningGoal,
  });
  annotatedTemplates = habitCardioOverlay?.dayTemplates || annotatedTemplates;
  annotatedTemplates = applyGoalSupportExerciseSelection({
   dayTemplates: annotatedTemplates,
   supportPlanningContext,
   equipmentProfile: plannerEquipmentProfile,
   hasRunningGoal,
   domainAdapterId: domainAdapter?.id || "",
  });
  const habitExerciseOverlay = applyHabitDrivenExercisePreferences({
   dayTemplates: annotatedTemplates,
   habitAdaptationContext,
  });
  annotatedTemplates = habitExerciseOverlay?.dayTemplates || annotatedTemplates;
  if (habitScheduleOverlay?.effects?.length) {
   constraints.push(...habitScheduleOverlay.effects);
  }
  if (habitLongSessionOverlay?.effects?.length) {
   constraints.push(...habitLongSessionOverlay.effects);
  }
  if (habitCardioOverlay?.effects?.length) {
   why.push(...habitCardioOverlay.effects);
  }
  if (habitExerciseOverlay?.effects?.length) {
   why.push(...habitExerciseOverlay.effects);
  }
 }
 const finalSplit = buildActualSplitFromDayTemplates(annotatedTemplates);
 const planContractAudit = auditPlanArchetypeContract({
 contract: planContract,
 dayTemplates: annotatedTemplates,
 });
 if (explicitAvailabilityOverlay?.effects?.length) {
 constraints.push(...explicitAvailabilityOverlay.effects);
 }
 if (preferenceOverlay?.changed && preferenceOverlay?.effects?.length) {
 constraints.push(...preferenceOverlay.effects);
 }
if (baselineOverlay?.summaryLines?.length) {
 why.push(...baselineOverlay.summaryLines);
}
 if (hybridFatigueGuard?.effects?.length) {
  constraints.push(...hybridFatigueGuard.effects);
  why.push(...hybridFatigueGuard.effects);
 }
if (adaptationState?.weeklyIntentHints?.weeklyConstraints?.length) {
 constraints.push(...adaptationState.weeklyIntentHints.weeklyConstraints);
}
 if (scheduleLimitedTemplates.changed && scheduleLimitedTemplates.effects?.length) {
 constraints.push(...scheduleLimitedTemplates.effects);
 }
 if (adaptationState?.changeSummary?.headline) {
 why.push(adaptationState.changeSummary.headline);
 }

 const maintainedGoals = goalLaneModel.maintainedGoalLabels?.length
 ? goalLaneModel.maintainedGoalLabels
 : active
 .filter(g => g.id !== primary?.id && g.category !== "injury_prevention")
 .slice(0, 2)
 .map(g => g.name);
 const minimizedGoal = active.find(g => g.category === "injury_prevention")?.name || "non-primary volume";
 const goalFeasibility = resolvedGoals.length
 ? assessGoalFeasibility({
 resolvedGoals,
 userBaseline: {
 experienceLevel: personalization?.profile?.estimatedFitnessLevel || personalization?.canonicalAthlete?.userProfile?.experienceLevel || "unknown",
 fitnessLevel: personalization?.fitnessSignals?.fitnessLevel || personalization?.profile?.fitnessLevel || "",
 currentBaseline: personalization?.profile?.goalMix || "",
 primaryGoalLabel: primary?.name || "",
 },
 scheduleReality: {
 trainingDaysPerWeek: Number(personalization?.userGoalProfile?.days_per_week || personalization?.canonicalAthlete?.userProfile?.daysPerWeek || 0),
 sessionLength: trainingContext?.sessionDuration?.confirmed ? trainingContext.sessionDuration.value : "",
 trainingLocation: environmentKnown ? env : "",
 scheduleNotes: lowBandwidth ? "Bandwidth is currently limited." : "",
 },
 currentExperienceContext: {
 injuryConstraintContext: {
 constraints: activeIssueContext?.activeConstraints || [],
 injuryText: activeIssueContext?.notes || "",
 },
 equipmentAccessContext: {
 equipment: trainingContext?.equipmentAccess?.confirmed ? (trainingContext.equipmentAccess.items || []) : [],
 trainingLocation: environmentKnown ? env : "",
 },
 startingFresh: Boolean(personalization?.planResetUndo?.startedAt),
 },
 now: Date.now(),
 })
 : null;
 const programContext = {
 environmentMode: env,
 environmentKnown,
 hasGym,
 lowBandwidth,
 strengthPriority,
 bodyCompActive,
 inconsistencyRisk,
 trainingContext,
 drivers: dedupeStrings([
 primary?.name,
 ...secondary.map(g => g.name),
 planningBasis?.activeProgramName || "",
 planningBasis?.activeStyleName || "",
 domainAdapter?.label || "",
 adaptationState?.changeSummary?.headline || "",
 ...(preferenceOverlay?.effects || []),
 ].filter(Boolean)),
 unlockMessage: equipmentKnown && !hasGym && strengthGoal ? "When gym access returns, bench-specific progression can move from foundation mode to direct loading." : "",
 goalFeasibility,
 planningBasis,
 goalCapabilityStack: clonePlainValue(domainSelection?.capabilityStack || null),
 domainAdapter: clonePlainValue(domainAdapter || null),
  trainingPreferencePolicy: clonePlainValue(trainingPreferencePolicy || null),
  adaptationState: clonePlainValue(adaptationState || null),
  recentLoadContext: clonePlainValue(hybridFatigueGuard?.loadContext || null),
  goalLaneModel: clonePlainValue(goalLaneModel || null),
  supportTier: clonePlainValue(supportTier || null),
  baselineInfluence: clonePlainValue(baselineInfluence || null),
  supportPlanningContext: clonePlainValue(supportPlanningContext || null),
  habitAdaptationContext: clonePlainValue(habitAdaptationContext || null),
  planArchetypeOverlay: clonePlainValue(planArchetypeOverlay || null),
  planContract: clonePlainValue(planContract || null),
  planContractAudit: clonePlainValue(planContractAudit || null),
  adaptivePolicyRuntime: clonePlainValue(adaptivePolicyRuntime || null),
  adaptivePolicyContext: clonePlainValue(adaptivePolicyContext || null),
  adaptivePolicyTraces: clonePlainValue(adaptivePolicyTraces || []),
  };
 const programBlock = buildProgramBlock({
 weekNumber: currentWeek,
 weekTemplate: baseWeek,
 weekTemplates,
 goals,
 architecture: effectiveArchitecture,
 constraints,
 drivers: programContext.drivers,
 unlockMessage: programContext.unlockMessage,
 programContext,
 });
 const blockIntent = buildProgramBlockCompatibilityIntent(programBlock) || {
 prioritized: primary?.name || "Consistency and execution",
 maintained: maintainedGoals.length ? maintainedGoals : ["general fitness"],
 support: clonePlainValue(goalLaneModel.supportGoalLabels || []),
 deferred: clonePlainValue(goalLaneModel.deferredGoalLabels || []),
 minimized: minimizedGoal,
 narrative: `This block gives the most weight to ${primary?.category || "consistency"}. ${maintainedGoals[0] ? `${maintainedGoals[0]} stays active with less emphasis.` : "Other priorities stay active with less emphasis."} ${bodyCompActive ? "Core work stays minimal but consistent." : "Non-primary accessories stay intentionally limited."}`,
 };

 return {
 architecture: effectiveArchitecture,
 split: finalSplit,
 why,
 constraints,
 drivers: [primary?.name, ...secondary.map(g => g.name)].filter(Boolean),
 unlockMessage: programContext.unlockMessage,
 dayTemplates: annotatedTemplates,
 programContext,
 programBlock,
 blockIntent,
 planningBasis,
 goalCapabilityStack: clonePlainValue(domainSelection?.capabilityStack || null),
 domainAdapter: clonePlainValue(domainAdapter || null),
 supportTier: clonePlainValue(supportTier || null),
 supportPlanningContext: clonePlainValue(supportPlanningContext || null),
 habitAdaptationContext: clonePlainValue(habitAdaptationContext || null),
 baselineInfluence: clonePlainValue(baselineInfluence || null),
 trainingPreferencePolicy: clonePlainValue(trainingPreferencePolicy || null),
  adaptationState: clonePlainValue(adaptationState || null),
  planArchetypeOverlay: clonePlainValue(planArchetypeOverlay || null),
  planContract: clonePlainValue(planContract || null),
  planContractAudit: clonePlainValue(planContractAudit || null),
  adaptivePolicyRuntime: clonePlainValue(adaptivePolicyRuntime || null),
  adaptivePolicyContext: clonePlainValue(adaptivePolicyContext || null),
  adaptivePolicyTraces: clonePlainValue(adaptivePolicyTraces || []),
  changeSummary: clonePlainValue(adaptationState?.changeSummary || null),
 activeProgramInstance: liveProgramPlanning?.activeProgramInstance || null,
 activeStyleSelection: liveProgramPlanning?.activeStyleSelection || null,
 programDefinition: liveProgramPlanning?.programDefinition || null,
 styleDefinition: liveProgramPlanning?.styleDefinition || null,
 runtimeFidelityMode: liveProgramPlanning?.runtimeFidelityMode || "",
 strengthAllocation: {
 sessionsPerWeek: strengthSessionsPerWeek,
 dosing: strengthPriority ? "full" : "maintenance",
 targetSessionDuration: strengthPriority ? "40-55 min" : "20-35 min",
 },
 aestheticAllocation: bodyCompActive ? {
 active: true,
 weeklyCoreFinishers: 3,
 dosage: "8-12 min optional finishers",
 } : { active: false },
 };
};

export const getSpecificityBand = (offset) => offset <= 1 ? "high" : offset <= 5 ? "medium" : "directional";

export const getHorizonAnchor = (goals = [], horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS) => {
 const timeGoal = getActiveTimeBoundGoal(goals);
 if (!timeGoal) return { nearest: null, withinHorizon: false, weekIndex: null };
 const weekIndex = Math.ceil((Math.max(0, timeGoal.days) + 1) / 7);
 return { nearest: timeGoal, withinHorizon: weekIndex <= horizonWeeks, weekIndex };
};

const labelPhaseWeeks = (rows = []) => {
 const counts = {};
 return rows.map((row) => {
 if (row.kind !== "plan") return row;
 const phase = row?.template?.phase || "BASE";
 counts[phase] = (counts[phase] || 0) + 1;
 return { ...row, phaseWeek: counts[phase], phaseLabel: `${phase} · Week ${counts[phase]}` };
 });
};

export const buildRollingHorizonWeeks = ({
 currentWeek,
 horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS,
 goals,
 weekTemplates,
 architecture = "hybrid_performance",
 programBlock = null,
 programContext = null,
 blockIntent = null,
 split = null,
 sessionsByDay = null,
 referenceTemplate = null,
 momentum = {},
 learningLayer = {},
 weeklyCheckins = {},
 coachPlanAdjustments = {},
 failureMode = {},
 environmentSelection = null,
 constraints = [],
}) => {
 const anchor = getHorizonAnchor(goals, horizonWeeks);
 const timeGoal = getActiveTimeBoundGoal(goals);
 const today = new Date();

 const buildPlanWeekRow = (idx) => {
 const absoluteWeek = currentWeek + idx;
 const templateIndex = Math.max(0, Math.min((absoluteWeek - 1), (weekTemplates?.length || 1) - 1));
 const template = weekTemplates[templateIndex] || weekTemplates[weekTemplates.length - 1] || {};
 const startDate = new Date();
 startDate.setDate(startDate.getDate() + (idx * 7));
 const endDate = new Date(startDate);
 endDate.setDate(endDate.getDate() + 6);
 const isCurrentWeek = absoluteWeek === currentWeek;
 const planWeek = buildPlanWeek({
 weekNumber: absoluteWeek,
 template,
 weekTemplates,
 referenceTemplate: referenceTemplate || template,
 label: `${template?.phase || "BASE"} - Week ${absoluteWeek}`,
 specificity: getSpecificityBand(idx),
 kind: "plan",
 startDate,
 endDate,
 goals,
 architecture,
 programBlock: isCurrentWeek ? programBlock : null,
 programContext,
 blockIntent,
 split,
 sessionsByDay,
 momentum,
 learningLayer,
 weeklyCheckin: weeklyCheckins?.[String(absoluteWeek)] || {},
 coachPlanAdjustments,
 failureMode: isCurrentWeek ? failureMode : {},
 environmentSelection: isCurrentWeek ? environmentSelection : null,
 constraints,
 });
 return {
 kind: "plan",
 slot: idx + 1,
 absoluteWeek,
 template,
 planWeek,
 specificity: getSpecificityBand(idx),
 startDate,
 endDate,
 anchorHit: anchor.withinHorizon && anchor.weekIndex === (idx + 1),
 };
 };

 if (!timeGoal) {
 const fallback = Array.from({ length: horizonWeeks }).map((_, idx) => buildPlanWeekRow(idx));
 return fallback.map((row) => ({
 ...row,
 weekLabel: row?.planWeek?.label || `${row?.template?.phase || "BASE"} - Week ${row.absoluteWeek}`,
 }));
 }

 const daysToDeadline = daysUntil(timeGoal.targetDate);
 if (daysToDeadline >= 0) {
 const rows = Array.from({ length: horizonWeeks }).map((_, idx) => buildPlanWeekRow(idx));
 return labelPhaseWeeks(rows).map(row => ({
 ...row,
 weekLabel: row?.planWeek?.label || row.weekLabel || row.phaseLabel || `Week ${row.absoluteWeek}`,
 }));
 }

 const daysSinceDeadline = Math.abs(daysToDeadline);
 const recoveryWeeksRemaining = Math.max(0, RECOVERY_BLOCK_WEEKS - Math.floor(daysSinceDeadline / 7));
 if (recoveryWeeksRemaining > 0) {
 const recoveryRows = Array.from({ length: Math.min(horizonWeeks, recoveryWeeksRemaining) }).map((_, idx) => {
 const startDate = new Date(today);
 startDate.setDate(startDate.getDate() + (idx * 7));
 const endDate = new Date(startDate);
 endDate.setDate(endDate.getDate() + 6);
 return {
 kind: "recovery",
 slot: idx + 1,
 absoluteWeek: currentWeek + idx,
 weekLabel: `Recovery · Week ${idx + 1}`,
 focus: "Rebuild freshness and mobility before selecting a new race block.",
 startDate,
 endDate,
 };
 });
 if (recoveryRows.length < horizonWeeks) {
 recoveryRows.push({ kind: "next_goal_prompt", slot: recoveryRows.length + 1, absoluteWeek: currentWeek + recoveryRows.length, weekLabel: "Set Next Goal", focus: "Recovery block complete. Set your next time-bound goal." });
 }
 return recoveryRows;
 }

 return [{ kind: "next_goal_prompt", slot: 1, absoluteWeek: currentWeek, weekLabel: "Set Next Goal", focus: "Your previous race block has ended. Start the next time-bound plan." }];
};

// ── DETERMINISTIC TODAY-PLAN ENGINE ─────────────────────────────────────────

const GOAL_SESSION_ROTATIONS = {
 fat_loss: ["strength", "cardio", "strength", "cardio", "strength", "cardio"],
 muscle_gain: ["strength", "strength", "cardio", "strength", "strength", "cardio"],
 endurance: ["cardio", "cardio", "strength", "cardio", "cardio", "strength"],
 general_fitness: ["strength", "cardio", "strength", "cardio", "strength", "cardio"],
};

const STRENGTH_LABELS = {
 fat_loss: ["Metabolic Strength A", "Metabolic Strength B", "Strength Retention"],
 muscle_gain: ["Upper Body Strength", "Lower Body Strength", "Push/Pull Strength", "Full-Body Strength"],
 endurance: ["Maintenance Strength", "Prehab + Core"],
 general_fitness: ["Full-Body Strength A", "Full-Body Strength B"],
};

const CARDIO_LABELS = {
 fat_loss: ["Conditioning Intervals", "Steady-State Cardio", "HIIT Circuit"],
 muscle_gain: ["Easy Conditioning", "Low-Intensity Cardio"],
 endurance: ["Tempo Run", "Easy Run", "Long Run", "Interval Session"],
 general_fitness: ["Conditioning", "Easy Cardio", "Interval Training"],
};

const INTENSITY_MAP = {
 beginner: { base: "low", push: "moderate" },
 intermediate: { base: "moderate", push: "high" },
 advanced: { base: "moderate", push: "high" },
};

const SESSION_DURATIONS = { "20": 20, "30": 30, "45": 45, "60+": 60 };

/**
 * generateTodayPlan - deterministic engine that decides today's workout.
 *
 * @param {Object} userProfile - canonical user profile
 * { primaryGoalKey, experienceLevel, daysPerWeek, sessionLength, equipmentAccess, constraints }
 * @param {Object} recentActivity - { logs: { [dateKey]: { date, type, feel, notes } }, todayKey: "YYYY-MM-DD" }
 * @param {Object} fatigueSignals - { fatigueScore (0-10), trend: "improving"|"stable"|"worsening", momentum: string, injuryLevel: string }
 * @returns {{ type, duration, intensity, label, reason }}
 */
export const generateTodayPlan = (userProfile = {}, recentActivity = {}, fatigueSignals = {}, planningContext = {}) => {
 const goal = userProfile.primaryGoalKey || userProfile.primary_goal || "general_fitness";
 const experience = userProfile.experienceLevel || userProfile.experience_level || "beginner";
 const targetDays = userProfile.daysPerWeek || userProfile.days_per_week || 3;
 const trainingContext = userProfile.trainingContext || null;
 const sessionLen = trainingContext?.sessionDuration?.confirmed
 ? trainingContext.sessionDuration.value
 : (userProfile.sessionLength || userProfile.session_length || TRAINING_SESSION_DURATION_VALUES.min30);
 let duration = SESSION_DURATIONS[sessionLen] || 30;
 const hasConstraints = (userProfile.constraints || []).length > 0;
 const intensityPosture = trainingContext?.intensityPosture?.confirmed
 ? trainingContext.intensityPosture.value
 : TRAINING_INTENSITY_VALUES.unknown;
 const hasConfirmedSessionDuration = Boolean(trainingContext?.sessionDuration?.confirmed);

 const todayKey = recentActivity.todayKey || new Date().toISOString().split("T")[0];
 const logs = recentActivity.logs || {};
 const fatigue = fatigueSignals.fatigueScore ?? 2;
 const fatigueTrend = fatigueSignals.trend || "stable";
 const momentum = fatigueSignals.momentum || "stable";
 const injuryLevel = fatigueSignals.injuryLevel || "none";
 const planWeek = planningContext?.planWeek || null;
 const planningBasis = planningContext?.planningBasis || planWeek?.planningBasis || null;
 const programBlock = planningContext?.programBlock || planWeek?.programBlock || null;
 const weeklyIntent = planningContext?.weeklyIntent || planWeek?.weeklyIntent || null;
 const plannedSession = planningContext?.plannedSession || null;
 const plannedSessionKind = resolvePlannedSessionKind(plannedSession);
 const changeSummary = planningContext?.changeSummary || weeklyIntent?.changeSummary || planWeek?.changeSummary || null;
 const changeSummaryLine = [changeSummary?.headline, changeSummary?.preserved].filter(Boolean).join(" ").trim();
 const planningBasisTodayLine = sanitizeText(planningBasis?.todayLine || planningBasis?.planBasisExplanation?.todayLine || "", 220);
 const planningBasisCompromise = sanitizeText(planningBasis?.compromiseLine || planningBasis?.planBasisExplanation?.compromiseSummary || "", 220);

 // ── 1. Compute recent activity window (last 7 days) ──────────────
 const today = new Date(todayKey + "T12:00:00");
 const recentEntries = Object.entries(logs)
 .filter(([d]) => {
 const diff = (today.getTime() - new Date(d + "T12:00:00").getTime()) / 86400000;
 return diff > 0 && diff <= 7;
 })
 .sort((a, b) => b[0].localeCompare(a[0]));

 const sessionsThisWeek = recentEntries.length;
 const daysSinceLastWorkout = recentEntries.length
 ? Math.floor((today.getTime() - new Date(recentEntries[0][0] + "T12:00:00").getTime()) / 86400000)
 : 99;

 // ── 2. Classify recent sessions ───────────────────────────────────
 const recentTypes = recentEntries.map(([, l]) => {
 const t = String(l.type || "").toLowerCase();
 if (/strength|push|pull|upper|lower|full.body|metabolic/i.test(t)) return "strength";
 if (/run|cardio|conditioning|interval|tempo|hiit|otf/i.test(t)) return "cardio";
 return "other";
 });

 const recentStrength = recentTypes.filter(t => t === "strength").length;
 const recentCardio = recentTypes.filter(t => t === "cardio").length;

 // ── 3. Recovery gate ──────────────────────────────────────────────
 const needsRecovery =
 injuryLevel === "severe" ||
 injuryLevel === "moderate_pain" ||
 fatigue >= 7 ||
 fatigueTrend === "worsening" && fatigue >= 5 ||
 momentum === "falling off" && daysSinceLastWorkout <= 1 ||
 sessionsThisWeek >= targetDays ||
 daysSinceLastWorkout === 0; // already logged today

 if (needsRecovery) {
 const reason = injuryLevel === "severe"
 ? "Injury severity requires full rest."
 : injuryLevel === "moderate_pain"
 ? "Moderate pain detected - active recovery only."
 : fatigue >= 7
 ? "Fatigue is elevated - recovery prioritized to protect next session."
 : sessionsThisWeek >= targetDays
 ? `Weekly target of ${targetDays} sessions already reached. Recovery day.`
 : daysSinceLastWorkout === 0
 ? "Session already logged today."
 : "Accumulated fatigue warrants a recovery day.";

 return {
 type: "recovery",
 duration: Math.min(duration, 20),
 intensity: "low",
 label: injuryLevel === "severe"
 ? "Rest Day"
 : "Active Recovery - Walk + Mobility",
 reason: [changeSummaryLine, reason, planningBasisTodayLine].filter(Boolean).join(" "),
 };
 }

 // ── 4. Re-entry logic (long gap) ─────────────────────────────────
 if (plannedSession?.type === "rest") {
 return {
 type: "recovery",
 duration: Math.min(duration, 20),
 intensity: "low",
 label: plannedSession?.label || "Active Recovery",
 reason: [
 changeSummaryLine,
 weeklyIntent?.focus
 ? `This week's plan protects ${String(weeklyIntent.focus).toLowerCase()} with a recovery day today.`
 : "This week's plan calls for recovery today.",
 planningBasisTodayLine,
 ].filter(Boolean).join(" "),
 };
 }

 const isReEntry = daysSinceLastWorkout >= 4;
 if (isReEntry) {
 if (plannedSession && plannedSessionKind && plannedSessionKind !== "recovery") {
 const plannedLabel = plannedSession?.label || (plannedSessionKind === "strength" ? "Strength session" : "Conditioning session");
 return {
 type: plannedSessionKind,
 duration: Math.min(duration, plannedSessionKind === "strength" ? 30 : 25),
 intensity: "low",
 label: plannedLabel,
 reason: [changeSummaryLine, `${daysSinceLastWorkout} days since last session. Starting with the easiest version of today's planned ${plannedLabel.toLowerCase()} so the current block stays aligned.`, planningBasisCompromise || planningBasisTodayLine].filter(Boolean).join(" "),
 };
 }
 return {
 type: "strength",
 duration: Math.min(duration, 25),
 intensity: "low",
 label: "Re-entry: Easy Full-Body Movement",
 reason: [changeSummaryLine, `${daysSinceLastWorkout} days since last session. Starting easy to rebuild rhythm.`].filter(Boolean).join(" "),
 };
 }

 // ── 5. Determine session type via goal rotation ───────────────────
 const rotation = GOAL_SESSION_ROTATIONS[goal] || GOAL_SESSION_ROTATIONS.general_fitness;
 // Position in rotation = total sessions completed this week
 const rotationIndex = sessionsThisWeek % rotation.length;
 let sessionType = rotation[rotationIndex];
 const plannedSessionType = String(plannedSession?.type || "").toLowerCase();
 if (plannedSessionType === "run+strength") sessionType = "cardio";
 else if (/^swim/.test(plannedSessionType)) sessionType = "cardio";
 else if (/power|plyo|sprint/.test(plannedSessionType)) sessionType = "strength";
 else if (/strength/.test(plannedSessionType)) sessionType = "strength";
 else if (/run|conditioning|otf/.test(plannedSessionType)) sessionType = "cardio";

 // Balance correction: if one type is overrepresented, flip
 const targetSplit = rotation.filter(t => t === "strength").length / rotation.length;
 const actualStrengthRatio = sessionsThisWeek > 0 ? recentStrength / sessionsThisWeek : 0;
 if (sessionType === "strength" && actualStrengthRatio > targetSplit + 0.2 && recentCardio === 0) {
 sessionType = "cardio";
 } else if (sessionType === "cardio" && actualStrengthRatio < targetSplit - 0.2 && recentStrength === 0) {
 sessionType = "strength";
 }

 // ── 6. Determine intensity ────────────────────────────────────────
 const intensityBase = INTENSITY_MAP[experience] || INTENSITY_MAP.beginner;
 let intensity = intensityBase.base;
 // Push harder when fresh (2+ days gap, low fatigue, building momentum)
 if (daysSinceLastWorkout >= 2 && fatigue <= 3 && (momentum === "building momentum" || momentum === "stable")) {
 intensity = intensityBase.push;
 }
 // Pull back if constraints or elevated fatigue
 if (hasConstraints || fatigue >= 5) {
 intensity = "low";
 }
 if (programBlock?.recoveryPosture?.level === "protective" || weeklyIntent?.recoveryBias === "high") {
 intensity = "low";
 } else if (weeklyIntent?.aggressionLevel === "progressive" && !hasConstraints && fatigue <= 3) {
 intensity = intensityBase.push;
 }
 if (intensityPosture === TRAINING_INTENSITY_VALUES.conservative && intensity !== "low") {
 intensity = intensityBase.base;
 } else if (intensityPosture === TRAINING_INTENSITY_VALUES.aggressive && !hasConstraints && fatigue <= 3 && intensity !== "low") {
 intensity = intensityBase.push;
 }
 if (weeklyIntent?.volumeBias === "reduced") {
 duration = Math.max(20, duration - 10);
 } else if (weeklyIntent?.volumeBias === "expanded") {
 duration = Math.min(60, duration + 10);
 }

 // ── 7. Select label ──────────────────────────────────────────────
 const labelPool = sessionType === "strength"
 ? (STRENGTH_LABELS[goal] || STRENGTH_LABELS.general_fitness)
 : (CARDIO_LABELS[goal] || CARDIO_LABELS.general_fitness);
 const labelIndex = (sessionType === "strength" ? recentStrength : recentCardio) % labelPool.length;
 const label = plannedSession?.label || labelPool[labelIndex];

 // ── 8. Build reason ──────────────────────────────────────────────
 const reasonParts = [
 changeSummary?.headline || null,
 `Goal: ${goal.replace(/_/g, " ")}.`,
 `${sessionsThisWeek} of ${targetDays} sessions done this week.`,
 daysSinceLastWorkout >= 2
 ? `${daysSinceLastWorkout} days rest - ready to push.`
 : daysSinceLastWorkout === 1
 ? "Back-to-back day - moderate approach."
 : null,
 fatigue >= 4 ? `Fatigue elevated (${fatigue}/10) - intensity adjusted.` : null,
 hasConstraints ? `Active constraints: ${userProfile.constraints.join(", ")}.` : null,
 planningBasisTodayLine || null,
 planningBasisCompromise || null,
 weeklyIntent?.focus ? `Week focus: ${weeklyIntent.focus}.` : null,
 weeklyIntent?.aggressionLevel ? `Week posture: ${String(weeklyIntent.aggressionLevel).replace(/_/g, " ")}.` : null,
 !hasConfirmedSessionDuration ? "Typical session duration is still unconfirmed, so the default plan length is being used." : null,
 intensityPosture === TRAINING_INTENSITY_VALUES.aggressive ? "User preference: push when recovery supports it." : null,
 intensityPosture === TRAINING_INTENSITY_VALUES.conservative ? "User preference: keep progression more controlled." : null,
 changeSummary?.preserved || null,
 ].filter(Boolean);

 return {
 type: sessionType,
 duration,
 intensity,
 label,
 reason: reasonParts.join(" "),
 };
};
