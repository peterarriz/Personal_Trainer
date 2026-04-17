import { PROGRAM_FIDELITY_MODES } from "./program-catalog-service.ts";
import { isStyleCompatibleWithProgram } from "./style-overlay-service.ts";
import { buildInjuryCapabilityProfile } from "./injury-planning-service.js";

export const COMPATIBILITY_OUTCOMES = Object.freeze({
  compatible: "compatible",
  caution: "caution",
  incompatible: "incompatible",
});

const EXPERIENCE_ORDER = {
  beginner: 1,
  novice: 1,
  intermediate: 2,
  advanced: 3,
  unknown: 0,
};

const GOAL_ALIASES = {
  running: "running",
  endurance: "running",
  strength: "strength",
  body_comp: "body_comp",
  appearance: "appearance",
  general_fitness: "general_fitness",
  re_entry: "re_entry",
  hybrid: "general_fitness",
};

const normalizeGoalType = (value = "") => GOAL_ALIASES[String(value || "").trim().toLowerCase()] || String(value || "").trim().toLowerCase();

const uniqueStrings = (items = []) => Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean)));

const toSentence = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.endsWith(".") ? text : `${text}.`;
};

const resolveAvailableDaysPerWeek = (athleteProfile = {}) => Number(athleteProfile?.userProfile?.daysPerWeek || 0) || 0;

const resolveEquipmentSnapshot = (athleteProfile = {}) => {
  const trainingContext = athleteProfile?.trainingContext || athleteProfile?.userProfile?.trainingContext || {};
  const items = uniqueStrings(trainingContext?.equipmentAccess?.items || athleteProfile?.userProfile?.equipmentAccess || []);
  const bucket = String(trainingContext?.equipmentAccess?.value || "").trim().toLowerCase();
  return { items, bucket };
};

const resolveExperienceLevel = (athleteProfile = {}) => String(
  athleteProfile?.userProfile?.experienceLevel
  || athleteProfile?.userProfile?.fitnessLevel
  || "unknown"
).trim().toLowerCase();

const resolveActiveGoalTypes = (goals = []) => uniqueStrings(
  (Array.isArray(goals) ? goals : [])
    .filter((goal) => goal?.active !== false)
    .map((goal) => normalizeGoalType(goal?.resolvedGoal?.planningCategory || goal?.category || goal?.resolvedGoal?.goalFamily || ""))
);

const resolveInjuryProfile = (personalization = {}) => buildInjuryCapabilityProfile(personalization?.injuryPainState || {});

const hasRunningImpactConcern = (personalization = {}, goals = []) => {
  const injuryProfile = resolveInjuryProfile(personalization);
  const runningGoalActive = resolveActiveGoalTypes(goals).includes("running");
  return Boolean(runningGoalActive && injuryProfile.active && (injuryProfile.runningRestricted || injuryProfile.impactRestricted || injuryProfile.conditioningRestricted));
};

const evaluateSchedule = ({
  programDefinition = null,
  availableDaysPerWeek = 0,
  fidelityMode = PROGRAM_FIDELITY_MODES.adaptToMe,
} = {}) => {
  if (!programDefinition?.typicalSessionsPerWeek) return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
  const typical = Number(programDefinition.typicalSessionsPerWeek.typical || 0);
  const minForAdapted = Number(programDefinition?.adaptationPolicy?.minSessionsForAdapted || programDefinition?.typicalSessionsPerWeek?.min || typical);
  if (!availableDaysPerWeek) {
    return {
      mismatch: "Your weekly availability still needs to be confirmed before this can be activated with confidence.",
      blocked: fidelityMode === PROGRAM_FIDELITY_MODES.runAsWritten,
      scorePenalty: 18,
      changes: ["Confirm realistic days per week before locking the template in."],
    };
  }
  if (fidelityMode === PROGRAM_FIDELITY_MODES.runAsWritten && availableDaysPerWeek < typical) {
    return {
      mismatch: `This template expects about ${typical} sessions each week, and your current setup looks closer to ${availableDaysPerWeek}.`,
      blocked: true,
      scorePenalty: 34,
      changes: [`Use Adapt to me mode or pick a program built for ${availableDaysPerWeek} days per week.`],
    };
  }
  if (availableDaysPerWeek < minForAdapted) {
    return {
      mismatch: `This program needs at least ${minForAdapted} meaningful sessions each week to still be itself.`,
      blocked: true,
      scorePenalty: 34,
      changes: [`Increase weekly availability or pick a lower-frequency option.`],
    };
  }
  if (availableDaysPerWeek < typical) {
    return {
      mismatch: `Your current schedule is lighter than the template's ideal weekly shape.`,
      blocked: false,
      scorePenalty: 12,
      changes: [`Trim the weekly structure to ${availableDaysPerWeek} core sessions in Adapt to me mode.`],
    };
  }
  return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
};

const evaluateEquipment = ({
  programDefinition = null,
  equipmentSnapshot = {},
  fidelityMode = PROGRAM_FIDELITY_MODES.adaptToMe,
} = {}) => {
  const required = uniqueStrings(programDefinition?.requiredEquipment || []).map((item) => item.toLowerCase());
  if (!required.length) return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
  const ownedText = `${equipmentSnapshot?.bucket || ""} ${(equipmentSnapshot?.items || []).join(" ")}`.toLowerCase();
  const hasFullGym = /full_gym|full gym|barbell|rack|cable/.test(ownedText);
  const hasDumbbells = /dumbbell/.test(ownedText);
  const hasRunningAccess = /run|trail|road|treadmill|safe running/.test(ownedText) || required.includes("safe running access");
  const needsFullGym = required.some((item) => /full gym/.test(item));
  const needsDumbbells = required.some((item) => /dumbbell/.test(item));
  const needsRunningAccess = required.some((item) => /safe running/.test(item));
  const blockedStrict = fidelityMode === PROGRAM_FIDELITY_MODES.runAsWritten;

  if (needsFullGym && !hasFullGym) {
    return {
      mismatch: "This program is built around a full gym setup.",
      blocked: blockedStrict && programDefinition?.adaptationPolicy?.equipmentFlexibility === "low",
      scorePenalty: 26,
      changes: ["Use Adapt to me mode or choose a program built for dumbbells, bodyweight, or hotel equipment."],
    };
  }
  if (needsDumbbells && !hasDumbbells && !hasFullGym) {
    return {
      mismatch: "This program expects at least dumbbells or a simple loading option.",
      blocked: blockedStrict,
      scorePenalty: 18,
      changes: ["Confirm available equipment or switch to a minimal-equipment option."],
    };
  }
  if (needsRunningAccess && !hasRunningAccess) {
    return {
      mismatch: "This template needs real running access to make sense.",
      blocked: true,
      scorePenalty: 30,
      changes: ["Choose a non-running program or update the training environment."],
    };
  }
  return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
};

const evaluateExperience = ({
  programDefinition = null,
  experienceLevel = "unknown",
} = {}) => {
  const required = EXPERIENCE_ORDER[String(programDefinition?.minimumExperience || "beginner").toLowerCase()] || 1;
  const current = EXPERIENCE_ORDER[String(experienceLevel || "unknown").toLowerCase()] || 0;
  if (current >= required) return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
  return {
    mismatch: `This template assumes at least a ${String(programDefinition?.minimumExperience || "beginner").replaceAll("_", " ")} baseline.`,
    blocked: required >= EXPERIENCE_ORDER.intermediate,
    scorePenalty: 20,
    changes: ["Use a foundation option first or run this only in Adapt to me mode if the template allows it."],
  };
};

const evaluateGoals = ({
  programDefinition = null,
  activeGoalTypes = [],
} = {}) => {
  if (!activeGoalTypes.length) {
    return programDefinition?.goalsOptional
      ? { mismatch: null, blocked: false, scorePenalty: 0, changes: [] }
      : {
          mismatch: "This template works best when the main outcome is explicit.",
          blocked: false,
          scorePenalty: 10,
          changes: ["Add a goal or activate this in an exploratory mode only."],
        };
  }
  const compatible = uniqueStrings(programDefinition?.compatibleGoalTypes || []).map(normalizeGoalType);
  const incompatible = uniqueStrings(programDefinition?.incompatibleGoalTypes || []).map(normalizeGoalType);
  if (activeGoalTypes.some((goalType) => incompatible.includes(goalType))) {
    return {
      mismatch: "This template pulls in a different direction than your active priority order.",
      blocked: true,
      scorePenalty: 28,
      changes: ["Pick a better-matched program or use a style instead of forcing a mismatch."],
    };
  }
  if (compatible.length && !activeGoalTypes.some((goalType) => compatible.includes(goalType))) {
    return {
      mismatch: "Your current goals are not a natural match for this template's main purpose.",
      blocked: false,
      scorePenalty: 12,
      changes: ["Treat it as a style influence or reprioritize goals before activating it."],
    };
  }
  return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
};

const evaluateInjury = ({
  programDefinition = null,
  personalization = {},
  goals = [],
} = {}) => {
  const injuryProfile = resolveInjuryProfile(personalization);
  if (!injuryProfile.active) return { mismatch: null, blocked: false, scorePenalty: 0, changes: [] };
  const enduranceHeavy = String(programDefinition?.category || "") === "endurance";
  const strengthHeavy = String(programDefinition?.category || "") === "strength";
  if ((enduranceHeavy || hasRunningImpactConcern(personalization, goals)) && (injuryProfile.runningRestricted || injuryProfile.impactRestricted || injuryProfile.conditioningRestricted)) {
    return {
      mismatch: `${injuryProfile.area} symptoms currently limit the running or impact demands this plan depends on.`,
      blocked: true,
      scorePenalty: 30,
      changes: ["Use a lower-impact option or wait until running tolerance settles."],
    };
  }
  if (strengthHeavy && injuryProfile.lowerBodyLoadingRestricted && injuryProfile.upperBodyPushRestricted && injuryProfile.upperBodyPullRestricted) {
    return {
      mismatch: `${injuryProfile.area} symptoms currently limit both the lower-body and upper-body lifting lanes this plan needs.`,
      blocked: true,
      scorePenalty: 28,
      changes: ["Use a more protective block until one training lane is clearly available again."],
    };
  }
  return {
    mismatch: `${injuryProfile.area} symptoms call for movement-specific substitutions, not a literal copy of the template.`,
    blocked: false,
    scorePenalty: 12,
    changes: ["Use Adapt to me mode and keep substitutions focused on the unaffected movement lanes."],
  };
};

export const assessProgramCompatibility = ({
  programDefinition = null,
  athleteProfile = null,
  personalization = {},
  goals = [],
  fidelityMode = PROGRAM_FIDELITY_MODES.adaptToMe,
} = {}) => {
  if (!programDefinition?.id) return null;
  const availableDaysPerWeek = resolveAvailableDaysPerWeek(athleteProfile || {});
  const equipmentSnapshot = resolveEquipmentSnapshot(athleteProfile || {});
  const experienceLevel = resolveExperienceLevel(athleteProfile || {});
  const activeGoalTypes = resolveActiveGoalTypes(goals || athleteProfile?.goals || []);

  const schedule = evaluateSchedule({ programDefinition, availableDaysPerWeek, fidelityMode });
  const equipment = evaluateEquipment({ programDefinition, equipmentSnapshot, fidelityMode });
  const experience = evaluateExperience({ programDefinition, experienceLevel });
  const injury = evaluateInjury({ programDefinition, personalization, goals: goals || athleteProfile?.goals || [] });
  const goalFit = evaluateGoals({ programDefinition, activeGoalTypes });

  const evaluations = [schedule, equipment, experience, injury, goalFit];
  const blockedConstraints = evaluations.flatMap((item) => item?.blocked && item?.mismatch ? [toSentence(item.mismatch)] : []);
  const reasons = uniqueStrings(evaluations.flatMap((item) => item?.mismatch ? [toSentence(item.mismatch)] : []));
  const requiredChanges = uniqueStrings(evaluations.flatMap((item) => item?.changes || []));
  const score = Math.max(0, 100 - evaluations.reduce((total, item) => total + Number(item?.scorePenalty || 0), 0));
  const outcome = blockedConstraints.length
    ? COMPATIBILITY_OUTCOMES.incompatible
    : reasons.length
    ? COMPATIBILITY_OUTCOMES.caution
    : COMPATIBILITY_OUTCOMES.compatible;

  return {
    score,
    outcome,
    reasons,
    requiredChanges,
    blockedConstraints,
    equipmentMismatch: equipment?.mismatch || null,
    scheduleMismatch: schedule?.mismatch || null,
    experienceMismatch: experience?.mismatch || null,
    injuryMismatch: injury?.mismatch || null,
    goalMismatch: goalFit?.mismatch || null,
    selectedFidelityMode: fidelityMode,
  };
};

export const assessStyleCompatibility = ({
  styleDefinition = null,
  programDefinition = null,
  athleteProfile = null,
  goals = [],
  activeProgramInstance = null,
} = {}) => {
  if (!styleDefinition?.id) return null;
  const activeGoalTypes = resolveActiveGoalTypes(goals || athleteProfile?.goals || []);
  const reasons = [];
  const blockedConstraints = [];
  const requiredChanges = [];
  let score = 100;

  if (activeProgramInstance?.fidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle) {
    blockedConstraints.push("A program is already being used as the active style layer.");
    score -= 35;
  }

  if (programDefinition?.id && !isStyleCompatibleWithProgram({ styleDefinition, programDefinition })) {
    blockedConstraints.push(`${styleDefinition.displayName} does not layer cleanly onto ${programDefinition.displayName}.`);
    score -= 30;
  }

  const compatibleGoals = uniqueStrings(styleDefinition?.compatibleGoalTypes || []).map(normalizeGoalType);
  if (activeGoalTypes.length && compatibleGoals.length && !activeGoalTypes.some((goalType) => compatibleGoals.includes(goalType))) {
    reasons.push("This style is not a natural fit for the current goal mix.");
    requiredChanges.push("Keep goals primary or choose a style that points in the same direction.");
    score -= 16;
  }

  return {
    score: Math.max(0, score),
    outcome: blockedConstraints.length
      ? COMPATIBILITY_OUTCOMES.incompatible
      : reasons.length
      ? COMPATIBILITY_OUTCOMES.caution
      : COMPATIBILITY_OUTCOMES.compatible,
    reasons: uniqueStrings(reasons),
    requiredChanges: uniqueStrings(requiredChanges),
    blockedConstraints: uniqueStrings(blockedConstraints),
    equipmentMismatch: null,
    scheduleMismatch: null,
    experienceMismatch: null,
    injuryMismatch: null,
    goalMismatch: reasons[0] || null,
  };
};

export const buildCompatibilityHeadline = (assessment = null) => (
  assessment?.outcome === COMPATIBILITY_OUTCOMES.incompatible
    ? "This is not a clean fit right now."
    : assessment?.outcome === COMPATIBILITY_OUTCOMES.caution
    ? "This can work, but it needs clear adaptation."
    : "This is a clean fit for the current setup."
);
