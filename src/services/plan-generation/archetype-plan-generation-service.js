import { NUTRITION_DAY_TYPES } from "../nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const restDay = (label = "Active Recovery") => ({
  type: "rest",
  label,
  nutri: NUTRITION_DAY_TYPES.recovery,
  isRecoverySlot: true,
});

const alternateStrengthSlot = (slot = "A") => String(slot || "").toUpperCase() === "A" ? "B" : "A";

const runSession = ({
  type = "easy-run",
  label = "Easy run",
  run = null,
  nutri = NUTRITION_DAY_TYPES.runEasy,
  strengthDose = "",
  optionalSecondary = "",
} = {}) => ({
  type,
  label,
  run: clonePlainValue(run || null),
  nutri,
  ...(strengthDose ? { strengthDose } : {}),
  optionalSecondary,
});

const strengthSession = ({
  label = "Strength",
  strSess = "A",
  strengthDose = "30-45 min strength",
  optionalSecondary = "",
  upperBodyBias = false,
  nutri = NUTRITION_DAY_TYPES.strengthSupport,
} = {}) => ({
  type: "strength+prehab",
  label,
  strSess,
  strengthDose,
  upperBodyBias,
  nutri,
  optionalSecondary,
});

const conditioningSession = ({
  label = "Conditioning",
  detail = "20-35 min zone-2 conditioning",
  optionalSecondary = "",
  lowImpact = false,
  nutri = NUTRITION_DAY_TYPES.conditioningMixed,
} = {}) => ({
  type: "conditioning",
  label,
  fallback: detail,
  intensityGuidance: lowImpact ? "easy aerobic only" : "controlled conditioning",
  environmentNote: lowImpact ? "Choose the lowest-friction aerobic option available." : "",
  nutri,
  optionalSecondary,
});

const swimSession = ({
  type = "swim-aerobic",
  label = "Aerobic swim",
  focus = "Aerobic rhythm",
  duration = "35-45 min",
  setLine = "",
  nutri = NUTRITION_DAY_TYPES.swimAerobic,
  optionalSecondary = "",
} = {}) => ({
  type,
  label,
  nutri,
  swim: {
    focus,
    d: duration,
    setLine,
  },
  fallback: setLine || duration,
  optionalSecondary,
});

const resolveCanonicalPatternId = (patternId = "") => {
  const normalized = sanitizeText(patternId, 80).toLowerCase();
  const aliases = {
    run_marathon_completion: "run_event_completion",
    run_marathon_improvement: "run_event_improvement",
    aerobic_base_general: "general_aerobic_base",
    lift_focus_bench: "lift_focus_strength",
    busy_body_comp: "fat_loss_busy_life",
    recomp_balanced: "recomp_moderate_cardio",
    event_cut: "event_cut_structured",
    protected_restart_low_capacity: "protected_restart",
  };
  return aliases[normalized] || normalized;
};

const buildSplitFromTemplates = (templates = {}) => {
  const sessions = Object.values(templates || {}).filter(Boolean);
  return {
    run: sessions.filter((session) => ["easy-run", "hard-run", "long-run", "run+strength"].includes(String(session?.type || ""))).length,
    strength: sessions.filter((session) => ["strength+prehab", "run+strength"].includes(String(session?.type || ""))).length,
    conditioning: sessions.filter((session) => String(session?.type || "") === "conditioning").length,
    swim: sessions.filter((session) => /^swim-/.test(String(session?.type || ""))).length,
    recovery: sessions.filter((session) => ["rest", "recovery"].includes(String(session?.type || ""))).length,
  };
};

const buildOverlay = ({ resolvedGoal = null, patternId = "", architectureOverride = "", dayTemplates = {} } = {}) => ({
  architectureOverride,
  dayTemplates,
  splitOverride: buildSplitFromTemplates(dayTemplates),
  planArchetypeId: sanitizeText(resolvedGoal?.planArchetypeId || "", 80).toLowerCase(),
  patternId,
  primaryDomain: sanitizeText(resolvedGoal?.primaryDomain || "", 80).toLowerCase(),
  scienceRationale: Array.isArray(resolvedGoal?.scienceRationale) ? [...resolvedGoal.scienceRationale] : [],
  progressionSummary: sanitizeText(resolvedGoal?.progressionStrategy?.rationale || "", 220),
  fatigueSummary: sanitizeText(resolvedGoal?.fatigueManagementStrategy?.summary || "", 220),
});

export {
  alternateStrengthSlot,
  buildOverlay,
  buildSplitFromTemplates,
  conditioningSession,
  restDay,
  runSession,
  sanitizeText,
  strengthSession,
  swimSession,
};

const buildRunEventTemplates = ({
  baseWeek = {},
  minimumFrequency = 3,
  supportStrengthDays = 1,
  longRunLabel = "Long run",
  qualityLabel = "Threshold run",
  includeSecondQuality = false,
  conservative = false,
  upperBodyMaintenance = false,
} = {}) => {
  const strengthSlot = String(baseWeek?.str || "A").toUpperCase() || "A";
  const secondaryStrengthSlot = alternateStrengthSlot(strengthSlot);
  return {
    1: runSession({
      type: includeSecondQuality ? "hard-run" : "easy-run",
      label: includeSecondQuality ? "Quality session A" : "Easy aerobic run",
      run: includeSecondQuality ? (baseWeek?.mon || { t: "Intervals", d: "35-45 min" }) : (baseWeek?.mon || { t: "Easy", d: "30-40 min" }),
      nutri: includeSecondQuality ? NUTRITION_DAY_TYPES.runQuality : NUTRITION_DAY_TYPES.runEasy,
      optionalSecondary: includeSecondQuality ? "Optional: short mobility reset after the main set." : "Optional: relaxed strides only if recovery is clearly good.",
    }),
    2: supportStrengthDays > 0
      ? strengthSession({
          label: upperBodyMaintenance ? "Upper-body maintenance" : "Support strength",
          strSess: strengthSlot,
          strengthDose: upperBodyMaintenance ? "20-30 min upper-body maintenance" : "25-35 min support strength",
          optionalSecondary: upperBodyMaintenance ? "Optional: shoulder mobility reset." : "Optional: calf and trunk durability work.",
          upperBodyBias: upperBodyMaintenance,
        })
      : restDay("Recovery / walk"),
    3: runSession({
      type: conservative ? "easy-run" : "hard-run",
      label: qualityLabel,
      run: conservative ? { t: "Steady", d: "20-30 min relaxed progression" } : (baseWeek?.thu || { t: "Tempo", d: "30-40 min" }),
      nutri: conservative ? NUTRITION_DAY_TYPES.runEasy : NUTRITION_DAY_TYPES.runQuality,
      optionalSecondary: conservative ? "Optional: 5-10 min walk cooldown." : "Optional: light drills or strides after the main work.",
    }),
    4: minimumFrequency >= 4
      ? runSession({
          type: "easy-run",
          label: conservative ? "Repeatable easy run" : "Easy support run",
          run: baseWeek?.fri || { t: "Easy", d: "25-35 min" },
          nutri: NUTRITION_DAY_TYPES.runEasy,
          optionalSecondary: "Optional: 5-10 min mobility reset.",
        })
      : restDay("Recovery / walk"),
    5: supportStrengthDays >= 2
      ? strengthSession({
          label: upperBodyMaintenance ? "Upper-body maintenance B" : "Durability strength",
          strSess: secondaryStrengthSlot,
          strengthDose: upperBodyMaintenance ? "20-25 min upper-body work" : "20-30 min durability strength",
          optionalSecondary: upperBodyMaintenance ? "Optional: cuff or scap support." : "Optional: easy trunk work only.",
          upperBodyBias: upperBodyMaintenance,
        })
      : restDay("Active Recovery"),
    6: runSession({
      type: "long-run",
      label: longRunLabel,
      run: baseWeek?.sat || { t: "Long", d: "60-90 min" },
      nutri: NUTRITION_DAY_TYPES.runLong,
      optionalSecondary: "Optional: walk cooldown and fueling reset after the long session.",
    }),
    0: restDay("Active Recovery"),
  };
};

const buildStrengthTemplates = ({ variant = "general_strength", strengthDose = "35-50 min strength progression" } = {}) => {
  if (variant === "hypertrophy_upper_lower") {
    return {
      1: strengthSession({ label: "Lower strength", strSess: "A", strengthDose: "45-60 min lower-body strength", optionalSecondary: "Optional: calves and trunk." }),
      2: strengthSession({ label: "Upper strength", strSess: "B", strengthDose: "45-60 min upper-body strength", optionalSecondary: "Optional: rear-delt / cuff finish." }),
      3: restDay("Recovery / walk"),
      4: strengthSession({ label: "Lower hypertrophy", strSess: "A", strengthDose: "40-55 min lower-body hypertrophy", optionalSecondary: "Optional: easy bike flush." }),
      5: strengthSession({ label: "Upper hypertrophy", strSess: "B", strengthDose: "40-55 min upper-body hypertrophy", optionalSecondary: "Optional: arms / delts finisher." }),
      6: conditioningSession({ label: "Easy conditioning", detail: "20-30 min low-stress conditioning", lowImpact: true, optionalSecondary: "Optional: mobility reset." }),
      0: restDay("Active Recovery"),
    };
  }
  if (variant === "dumbbell_hypertrophy") {
    return {
      1: strengthSession({ label: "Full-body hypertrophy A", strSess: "A", strengthDose: "35-45 min dumbbell hypertrophy", optionalSecondary: "Optional: pump finisher." }),
      2: conditioningSession({ label: "Easy conditioning", detail: "20-25 min walk, bike, or low-impact conditioning", lowImpact: true, optionalSecondary: "Optional: mobility reset." }),
      3: strengthSession({ label: "Full-body hypertrophy B", strSess: "B", strengthDose: "35-45 min dumbbell hypertrophy", optionalSecondary: "Optional: unilateral finisher." }),
      4: restDay("Recovery / walk"),
      5: strengthSession({ label: "Pump / support day", strSess: "A", strengthDose: "25-35 min density work", optionalSecondary: "Optional: arm or glute finisher." }),
      6: conditioningSession({ label: "Easy aerobic work", detail: "20-30 min low-stress conditioning", lowImpact: true, optionalSecondary: "Optional: core reset." }),
      0: restDay("Active Recovery"),
    };
  }
  if (variant === "bench_focus") {
    return {
      1: strengthSession({ label: "Bench focus A", strSess: "A", strengthDose: "40-55 min pressing progression", optionalSecondary: "Optional: upper-back support work." }),
      2: conditioningSession({ label: "Easy conditioning", detail: "20-30 min easy aerobic work", lowImpact: true, optionalSecondary: "Optional: shoulder mobility reset." }),
      3: strengthSession({ label: "Lower-body support", strSess: "B", strengthDose: "25-35 min strength support", optionalSecondary: "Optional: trunk or sled support." }),
      4: restDay("Recovery / walk"),
      5: strengthSession({ label: "Bench focus B", strSess: "A", strengthDose: "35-50 min pressing volume", optionalSecondary: "Optional: triceps / upper-back finisher." }),
      6: strengthSession({ label: "Upper-body support", strSess: "B", strengthDose: "20-30 min accessory support", optionalSecondary: "Optional: cuff or scap stability." }),
      0: restDay("Active Recovery"),
    };
  }
  if (variant === "limited_equipment") {
    return {
      1: strengthSession({ label: "Limited-equipment strength A", strSess: "A", strengthDose: "30-40 min limited-equipment strength", optionalSecondary: "Optional: carries or trunk finisher." }),
      2: conditioningSession({ label: "Easy conditioning", detail: "15-25 min low-impact conditioning", lowImpact: true, optionalSecondary: "Optional: mobility reset." }),
      3: strengthSession({ label: "Limited-equipment strength B", strSess: "B", strengthDose: "30-40 min limited-equipment strength", optionalSecondary: "Optional: unilateral finisher." }),
      4: restDay("Recovery / walk"),
      5: strengthSession({ label: "Strength density", strSess: "A", strengthDose: "25-35 min density work", optionalSecondary: "Optional: core support." }),
      6: conditioningSession({ label: "Supportive conditioning", detail: "20-30 min easy conditioning", lowImpact: true, optionalSecondary: "Optional: walk cooldown." }),
      0: restDay("Active Recovery"),
    };
  }
  if (variant === "maintenance") {
    return {
      1: strengthSession({ label: "Strength maintenance A", strSess: "A", strengthDose: "20-30 min maintenance strength", optionalSecondary: "Optional: short mobility reset." }),
      2: restDay("Recovery / walk"),
      3: conditioningSession({ label: "Easy conditioning", detail: "20-30 min supportive conditioning", lowImpact: true, optionalSecondary: "Optional: easy mobility." }),
      4: strengthSession({ label: "Strength maintenance B", strSess: "B", strengthDose: "20-30 min maintenance strength", optionalSecondary: "Optional: trunk finish." }),
      5: restDay("Active Recovery"),
      6: conditioningSession({ label: "Optional easy aerobic", detail: "15-20 min easy aerobic work", lowImpact: true }),
      0: restDay("Active Recovery"),
    };
  }
  if (variant === "busy_three_day") {
    return {
      1: strengthSession({ label: "Full-body heavy", strSess: "A", strengthDose: "35-45 min compact strength", optionalSecondary: "Optional: brief trunk support." }),
      2: restDay("Recovery / walk"),
      3: strengthSession({ label: "Full-body medium", strSess: "B", strengthDose: "35-45 min compact strength", optionalSecondary: "Optional: easy mobility reset." }),
      4: conditioningSession({ label: "Supportive conditioning", detail: "20-25 min low-stress aerobic work", lowImpact: true, optionalSecondary: "Optional: walk cooldown." }),
      5: restDay("Active Recovery"),
      6: strengthSession({ label: "Full-body volume", strSess: "A", strengthDose: "35-45 min volume-focused strength", optionalSecondary: "Optional: carry or core finisher." }),
      0: restDay("Active Recovery"),
    };
  }
  return {
    1: strengthSession({ label: "Full-body strength A", strSess: "A", strengthDose, optionalSecondary: "Optional: easy trunk finish." }),
    2: conditioningSession({ label: "Easy conditioning", detail: "20-25 min easy aerobic work", lowImpact: true, optionalSecondary: "Optional: mobility reset." }),
    3: strengthSession({ label: "Full-body strength B", strSess: "B", strengthDose, optionalSecondary: "Optional: shoulder or hip mobility." }),
    4: restDay("Recovery / walk"),
    5: strengthSession({ label: "Full-body strength C", strSess: "A", strengthDose, optionalSecondary: "Optional: loaded carry finisher." }),
    6: conditioningSession({ label: "Supportive conditioning", detail: "15-25 min easy conditioning", lowImpact: true, optionalSecondary: "Optional: walk cooldown." }),
    0: restDay("Active Recovery"),
  };
};

const buildBodyCompTemplates = ({ variant = "fat_loss_strength_retention" } = {}) => {
  const isBusy = variant === "fat_loss_busy_life";
  const isRecomp = variant === "recomp_moderate_cardio";
  const isEventCut = variant === "event_cut_structured";
  return {
    1: strengthSession({
      label: isRecomp ? "Strength progression" : "Strength retention",
      strSess: "A",
      strengthDose: isRecomp ? "40-50 min progression strength" : "30-40 min retention strength",
      optionalSecondary: isRecomp ? "Optional: short conditioning finisher." : "Optional: 8-10 min core finish.",
    }),
    2: conditioningSession({
      label: isEventCut ? "Conditioning intervals" : isBusy ? "Low-friction conditioning" : "Aerobic conditioning",
      detail: isEventCut ? "20-30 min controlled intervals" : "25-40 min easy aerobic conditioning or brisk walk",
      lowImpact: !isEventCut,
      optionalSecondary: "Optional: mobility reset to keep tomorrow easy.",
    }),
    3: strengthSession({
      label: isRecomp ? "Hypertrophy support" : "Full-body strength",
      strSess: "B",
      strengthDose: isRecomp ? "35-45 min hypertrophy support" : "30-40 min full-body strength",
      optionalSecondary: "Optional: trunk or carry finisher.",
    }),
    4: restDay(isBusy ? "Walk + recovery" : "Active Recovery"),
    5: conditioningSession({
      label: isEventCut ? "Tempo conditioning" : "Easy conditioning",
      detail: isEventCut ? "20-30 min tempo ride, run, or mixed conditioning" : "20-30 min easy conditioning",
      lowImpact: !isEventCut,
      optionalSecondary: isBusy ? "Optional: extra steps instead of a harder session." : "Optional: easy walk cooldown.",
    }),
    6: strengthSession({
      label: isBusy ? "Short strength touchpoint" : isRecomp ? "Strength + pump" : "Strength maintenance",
      strSess: "A",
      strengthDose: isBusy ? "20-30 min minimum-effective strength" : "25-40 min strength support",
      optionalSecondary: "Optional: short core or mobility finish.",
    }),
    0: restDay("Active Recovery"),
  };
};

const buildGeneralFitnessTemplates = ({ variant = "general_fitness_consistency" } = {}) => {
  if (variant === "athleticism_work_capacity") {
    return {
      1: strengthSession({ label: "Athletic strength", strSess: "A", strengthDose: "35-45 min full-body strength", optionalSecondary: "Optional: jumps or throws if readiness is good." }),
      2: conditioningSession({ label: "Work-capacity conditioning", detail: "20-30 min mixed conditioning", optionalSecondary: "Optional: mobility reset." }),
      3: restDay("Recovery / walk"),
      4: strengthSession({ label: "Strength + movement quality", strSess: "B", strengthDose: "30-40 min strength support", optionalSecondary: "Optional: movement prep finisher." }),
      5: conditioningSession({ label: "Aerobic base", detail: "25-35 min easy aerobic work", lowImpact: true, optionalSecondary: "Optional: easy strides or skill work." }),
      6: conditioningSession({ label: "Athletic circuit", detail: "20-30 min athletic circuit or field work", optionalSecondary: "Optional: mobility cooldown." }),
      0: restDay("Active Recovery"),
    };
  }
  if (variant === "healthy_routine_busy") {
    return {
      1: strengthSession({ label: "Short full-body strength", strSess: "A", strengthDose: "20-30 min strength", optionalSecondary: "Optional: 5-8 min mobility reset." }),
      2: restDay("Walk + recovery"),
      3: conditioningSession({ label: "Short conditioning", detail: "15-25 min easy conditioning or brisk walk", lowImpact: true, optionalSecondary: "Optional: light mobility." }),
      4: strengthSession({ label: "Short full-body strength B", strSess: "B", strengthDose: "20-30 min strength", optionalSecondary: "Optional: trunk finisher." }),
      5: restDay("Active Recovery"),
      6: conditioningSession({ label: "Optional movement", detail: "15-20 min easy movement session", lowImpact: true }),
      0: restDay("Active Recovery"),
    };
  }
  return {
    1: strengthSession({ label: "Full-body strength", strSess: "A", strengthDose: "30-40 min strength", optionalSecondary: "Optional: mobility reset." }),
    2: conditioningSession({ label: "Easy conditioning", detail: "20-30 min easy aerobic conditioning", lowImpact: true, optionalSecondary: "Optional: walk cooldown." }),
    3: restDay("Recovery / walk"),
    4: strengthSession({ label: "Repeatable strength", strSess: "B", strengthDose: "25-35 min strength", optionalSecondary: "Optional: trunk support." }),
    5: conditioningSession({ label: "Consistency conditioning", detail: "20-30 min low-stress conditioning", lowImpact: true, optionalSecondary: "Optional: easy mobility." }),
    6: conditioningSession({ label: "Optional long walk", detail: "30-45 min walk or easy aerobic work", lowImpact: true }),
    0: restDay("Active Recovery"),
  };
};

const buildReEntryTemplates = ({ variant = "protected_restart" } = {}) => {
  const isLowImpact = variant === "low_impact_restart";
  return {
    1: strengthSession({
      label: isLowImpact ? "Low-impact strength" : "Protected strength",
      strSess: "A",
      strengthDose: "20-30 min low-friction strength",
      optionalSecondary: "Optional: breathing or mobility cooldown.",
    }),
    2: restDay("Walk + recovery"),
    3: conditioningSession({
      label: isLowImpact ? "Low-impact aerobic" : "Repeatable conditioning",
      detail: isLowImpact ? "15-25 min walk, bike, or pool work" : "15-25 min easy aerobic work",
      lowImpact: true,
      optionalSecondary: "Optional: mobility reset.",
    }),
    4: restDay("Recovery / walk"),
    5: strengthSession({
      label: variant === "rebuild_after_time_off" ? "Rebuild strength" : "Protected strength B",
      strSess: "B",
      strengthDose: variant === "rebuild_after_time_off" ? "25-35 min rebuild strength" : "20-30 min low-friction strength",
      optionalSecondary: "Optional: trunk or balance finish.",
    }),
    6: conditioningSession({
      label: variant === "rebuild_after_time_off" ? "Easy endurance" : "Optional easy movement",
      detail: variant === "rebuild_after_time_off" ? "20-30 min easy endurance" : "15-20 min walk or mobility",
      lowImpact: true,
    }),
    0: restDay("Active Recovery"),
  };
};

const buildHybridTemplates = ({ variant = "strength_conditioning_balanced", baseWeek = {} } = {}) => {
  const runningPriority = variant === "run_lift_running_priority";
  const strengthPriority = variant === "run_lift_strength_priority";
  const aestheticBlend = variant === "aesthetic_endurance_blend";
  const sportSupport = variant === "sport_support_field_court";
  return {
    1: runningPriority
      ? runSession({ type: "run+strength", label: "Quality run + support strength", run: baseWeek?.mon || { t: "Quality", d: "35-45 min" }, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: short upper-body finisher only if the run stays smooth." })
      : strengthPriority
      ? strengthSession({ label: "Primary strength", strSess: "A", strengthDose: "40-55 min strength progression", optionalSecondary: "Optional: short easy aerobic cooldown." })
      : strengthSession({ label: sportSupport ? "Field-sport strength" : aestheticBlend ? "Aesthetic strength" : "Balanced strength", strSess: "A", strengthDose: "35-45 min strength", optionalSecondary: "Optional: mobility or trunk finish." }),
    2: sportSupport
      ? conditioningSession({ label: "Change-of-direction conditioning", detail: "20-30 min COD, tempo, or shuttles", optionalSecondary: "Optional: ankle / calf durability." })
      : conditioningSession({ label: aestheticBlend ? "Aerobic support" : "Conditioning", detail: "20-30 min mixed or aerobic conditioning", lowImpact: !runningPriority, optionalSecondary: "Optional: mobility reset.", nutri: NUTRITION_DAY_TYPES.hybridSupport }),
    3: runningPriority
      ? strengthSession({ label: "Strength support", strSess: "B", strengthDose: "25-35 min maintenance strength", optionalSecondary: "Optional: calf and trunk durability." })
      : strengthPriority
      ? runSession({ type: "run+strength", label: "Supportive run + lift", run: baseWeek?.fri || { t: "Easy", d: "20-30 min" }, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: 15-20 min upper-body or trunk strength if recovery is steady.", strengthDose: "15-20 min strength support" })
      : aestheticBlend
      ? runSession({ type: "run+strength", label: "Aesthetic run + lift", run: baseWeek?.fri || { t: "Easy", d: "25-35 min" }, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: 15-20 min physique-support lifting if recovery stays smooth.", strengthDose: "15-20 min physique-support strength" })
      : runSession({ type: "easy-run", label: "Easy endurance", run: baseWeek?.fri || { t: "Easy", d: "25-35 min" }, nutri: NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: strides if recovery is good." }),
    4: strengthPriority
      ? strengthSession({ label: "Secondary strength", strSess: "B", strengthDose: "35-45 min strength support", optionalSecondary: "Optional: easy carry or trunk finisher." })
      : runSession({ type: runningPriority ? "hard-run" : "easy-run", label: runningPriority ? "Primary run quality" : sportSupport ? "Tempo field conditioning" : "Hybrid endurance", run: runningPriority ? (baseWeek?.thu || { t: "Tempo", d: "30-40 min" }) : { t: "Steady", d: "25-35 min" }, nutri: runningPriority ? NUTRITION_DAY_TYPES.runQuality : NUTRITION_DAY_TYPES.hybridSupport, optionalSecondary: "Optional: mobility cooldown." }),
    5: restDay("Active Recovery"),
    6: runningPriority
      ? runSession({ type: "long-run", label: "Long Run Build", run: baseWeek?.sat || { t: "Long easy", d: "55-75 min" }, nutri: NUTRITION_DAY_TYPES.runLong, optionalSecondary: "Optional: fueling reset." })
      : conditioningSession({ label: strengthPriority ? "Conditioning support" : sportSupport ? "Game-speed support" : "Long aerobic support", detail: strengthPriority ? "20-30 min easy conditioning" : "30-45 min aerobic work", lowImpact: strengthPriority, optionalSecondary: "Optional: easy mobility or walk cooldown.", nutri: NUTRITION_DAY_TYPES.hybridSupport }),
    0: restDay("Active Recovery"),
  };
};

export const buildPlanArchetypeOverlay = ({
  primaryGoal = null,
  baseWeek = {},
} = {}) => {
  const resolvedGoal = primaryGoal?.resolvedGoal || null;
  const patternId = resolveCanonicalPatternId(resolvedGoal?.weeklyStructureTemplate?.patternId || "");
  if (!patternId) return null;
  const minimumFrequency = Number(resolvedGoal?.weeklyStructureTemplate?.minimumFrequency || 0) || 0;
  const supportStrengthDays = Number(resolvedGoal?.weeklyStructureTemplate?.supportStrengthDays || 0) || 0;
  const eventDistance = sanitizeText(resolvedGoal?.specificityInputs?.eventDistance || "", 80).toLowerCase();
  const primaryDomain = sanitizeText(resolvedGoal?.primaryDomain || "", 80).toLowerCase();

  switch (patternId) {
    case "run_event_completion":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: eventDistance === "marathon" ? "race_prep_dominant" : "race_prep_dominant",
        dayTemplates: buildRunEventTemplates({
          baseWeek,
          minimumFrequency: minimumFrequency || (eventDistance === "marathon" ? 4 : 3),
          supportStrengthDays: supportStrengthDays || 1,
          longRunLabel: eventDistance === "marathon" ? "Long endurance run" : "Long run",
          qualityLabel: eventDistance === "marathon" ? "Steady / marathon-support run" : "Threshold support run",
        }),
      });
    case "run_event_improvement":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: "race_prep_dominant",
        dayTemplates: buildRunEventTemplates({
          baseWeek,
          minimumFrequency: Math.max(4, minimumFrequency || 4),
          supportStrengthDays: Math.max(1, supportStrengthDays || 1),
          longRunLabel: "Long run",
          qualityLabel: "Race-pace / threshold run",
          includeSecondQuality: true,
        }),
      });
    case "run_return_conservative":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: "maintenance_rebuild",
        dayTemplates: buildRunEventTemplates({
          baseWeek,
          minimumFrequency: 3,
          supportStrengthDays: 1,
          longRunLabel: "Long run / walk",
          qualityLabel: "Steady return session",
          conservative: true,
        }),
      });
    case "general_aerobic_base":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: primaryDomain === "cycling_endurance" ? "race_prep_dominant" : "hybrid_performance",
        dayTemplates: primaryDomain === "cycling_endurance"
          ? {
              1: conditioningSession({ label: "Tempo ride", detail: "35-50 min controlled tempo ride", optionalSecondary: "Optional: cadence drills." }),
              2: strengthSession({ label: "Support strength", strSess: "A", strengthDose: "20-30 min support strength", optionalSecondary: "Optional: hip and trunk support." }),
              3: restDay("Recovery / walk"),
              4: conditioningSession({ label: "Aerobic ride", detail: "30-45 min easy endurance ride", lowImpact: true, optionalSecondary: "Optional: easy mobility." }),
              5: strengthSession({ label: "Durability strength", strSess: "B", strengthDose: "20-30 min durability strength", optionalSecondary: "Optional: calf / hip support." }),
              6: conditioningSession({ label: "Long ride", detail: "60-90 min aerobic ride", optionalSecondary: "Optional: fueling reset." }),
              0: restDay("Active Recovery"),
            }
          : buildGeneralFitnessTemplates({ variant: "general_fitness_consistency" }),
      });
    case "swim_base":
    case "swim_endurance_improvement":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: "race_prep_dominant",
        dayTemplates: patternId === "swim_endurance_improvement"
          ? {
              1: swimSession({ type: "swim-technique", label: "Technique swim", focus: "Technique", duration: "30-40 min", setLine: "Drills + rhythm work.", nutri: NUTRITION_DAY_TYPES.swimTechnique, optionalSecondary: "Optional: shoulder activation." }),
              2: strengthSession({ label: "Dryland strength", strSess: "A", strengthDose: "25-35 min dryland strength", optionalSecondary: "Optional: cuff and trunk support." }),
              3: swimSession({ type: "swim-threshold", label: "Threshold swim", focus: "Threshold pacing", duration: "35-45 min", setLine: "Controlled threshold repeats with full technique guardrails.", nutri: NUTRITION_DAY_TYPES.swimQuality, optionalSecondary: "Optional: easy cooldown." }),
              4: restDay("Recovery / walk"),
              5: swimSession({ type: "swim-aerobic", label: "Aerobic swim", focus: "Aerobic support", duration: "30-40 min", setLine: "Steady aerobic work.", optionalSecondary: "Optional: mobility reset." }),
              6: swimSession({ type: "swim-endurance", label: "Endurance swim", focus: "Endurance", duration: "45-60 min", setLine: "Longer broken endurance set.", nutri: NUTRITION_DAY_TYPES.swimEndurance, optionalSecondary: "Optional: fueling reset." }),
              0: restDay("Active Recovery"),
            }
          : {
              1: swimSession({ type: "swim-technique", label: "Technique swim", focus: "Technique + rhythm", duration: "30-40 min", setLine: "Drills + relaxed aerobic repeats.", nutri: NUTRITION_DAY_TYPES.swimTechnique, optionalSecondary: "Optional: band activation." }),
              2: strengthSession({ label: "Dryland support", strSess: "A", strengthDose: "20-30 min dryland support", optionalSecondary: "Optional: shoulder mobility reset." }),
              3: swimSession({ type: "swim-aerobic", label: "Aerobic swim", focus: "Aerobic endurance", duration: "35-45 min", setLine: "Steady repeats with clean stroke count.", optionalSecondary: "Optional: easy walk cooldown." }),
              4: restDay("Recovery / walk"),
              5: strengthSession({ label: "Shoulder / core support", strSess: "B", strengthDose: "20-25 min support work", optionalSecondary: "Optional: cuff and scap work." }),
              6: swimSession({ type: "swim-endurance", label: "Long aerobic swim", focus: "Endurance", duration: "40-55 min", setLine: "Long steady swim or aerobic broken set.", nutri: NUTRITION_DAY_TYPES.swimEndurance, optionalSecondary: "Optional: fueling and shoulder reset." }),
              0: restDay("Active Recovery"),
            },
      });
    case "cycling_base":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: "race_prep_dominant",
        dayTemplates: {
          1: conditioningSession({ label: "Tempo ride", detail: "35-50 min tempo or cadence-control ride", optionalSecondary: "Optional: short mobility reset." }),
          2: strengthSession({ label: "Support strength", strSess: "A", strengthDose: "20-30 min lower-fatigue strength", optionalSecondary: "Optional: trunk support." }),
          3: restDay("Recovery / walk"),
          4: conditioningSession({ label: "Aerobic ride", detail: "30-45 min easy endurance ride", lowImpact: true, optionalSecondary: "Optional: cadence drills." }),
          5: strengthSession({ label: "Durability strength", strSess: "B", strengthDose: "20-30 min durability work", optionalSecondary: "Optional: hip / calf support." }),
          6: conditioningSession({ label: "Long ride", detail: "60-90 min aerobic ride", optionalSecondary: "Optional: fueling reset and short walk cooldown." }),
          0: restDay("Active Recovery"),
        },
      });
    case "triathlon_beginner":
      return buildOverlay({
        resolvedGoal,
        patternId,
        architectureOverride: "hybrid_performance",
        dayTemplates: {
          1: swimSession({ type: "swim-technique", label: "Technique swim", focus: "Technique", duration: "30-40 min", setLine: "Drills + relaxed aerobic repeats.", nutri: NUTRITION_DAY_TYPES.swimTechnique, optionalSecondary: "Optional: easy walk cooldown." }),
          2: conditioningSession({ label: "Bike aerobic", detail: "35-50 min easy aerobic ride", lowImpact: true, optionalSecondary: "Optional: cadence work.", nutri: NUTRITION_DAY_TYPES.hybridSupport }),
          3: runSession({ type: "easy-run", label: "Easy run", run: baseWeek?.fri || { t: "Easy", d: "25-35 min" }, nutri: NUTRITION_DAY_TYPES.runEasy, optionalSecondary: "Optional: strides only if recovery is clearly good." }),
          4: strengthSession({ label: "Tri support strength", strSess: "A", strengthDose: "20-30 min low-fatigue strength", optionalSecondary: "Optional: calf / shoulder support." }),
          5: restDay("Recovery / walk"),
          6: conditioningSession({ label: "Brick or long bike", detail: "45-75 min bike with short transition run if ready", optionalSecondary: "Optional: fueling reset.", nutri: NUTRITION_DAY_TYPES.hybridSupport }),
          0: restDay("Active Recovery"),
        },
      });
    case "strength_full_body_beginner":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "general_strength", strengthDose: "35-50 min beginner full-body strength" }) });
    case "strength_busy_three_day":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "busy_three_day" }) });
    case "hypertrophy_upper_lower":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "hypertrophy_upper_lower" }) });
    case "hypertrophy_dumbbell_full_body":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "dumbbell_hypertrophy" }) });
    case "lift_focus_strength":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "bench_focus" }) });
    case "limited_equipment_strength":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "limited_equipment" }) });
    case "strength_maintenance_minimal":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "strength_dominant", dayTemplates: buildStrengthTemplates({ variant: "maintenance" }) });
    case "fat_loss_strength_retention":
    case "fat_loss_busy_life":
    case "recomp_moderate_cardio":
    case "event_cut_structured":
    case "leaner_general":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "body_comp_conditioning", dayTemplates: buildBodyCompTemplates({ variant: patternId }) });
    case "general_fitness_consistency":
    case "athleticism_work_capacity":
    case "healthy_routine_busy":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: patternId === "healthy_routine_busy" ? "maintenance_rebuild" : "hybrid_performance", dayTemplates: buildGeneralFitnessTemplates({ variant: patternId }) });
    case "protected_restart":
    case "rebuild_after_time_off":
    case "low_impact_restart":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "maintenance_rebuild", dayTemplates: buildReEntryTemplates({ variant: patternId }) });
    case "run_lift_running_priority":
    case "run_lift_strength_priority":
    case "strength_conditioning_balanced":
    case "aesthetic_endurance_blend":
    case "sport_support_field_court":
      return buildOverlay({ resolvedGoal, patternId, architectureOverride: "hybrid_performance", dayTemplates: buildHybridTemplates({ variant: patternId, baseWeek }) });
    default:
      return null;
  }
};
