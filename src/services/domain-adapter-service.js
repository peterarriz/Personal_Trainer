import { dedupeStrings } from "../utils/collection-utils.js";
import {
  DOMAIN_ADAPTER_IDS,
  resolveGoalCapabilityStack,
} from "./goal-capability-resolution-service.js";
import { NUTRITION_DAY_TYPES } from "./nutrition-day-taxonomy-service.js";

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normalizeSessionLabel = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

const restDay = (label = "Active Recovery") => ({
  type: "rest",
  label,
  nutri: NUTRITION_DAY_TYPES.recovery,
  isRecoverySlot: true,
});

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

const buildSwimSession = ({
  type = "swim-session",
  label = "Swim Session",
  focus = "Technique",
  duration = "35-45 min",
  setLine = "",
  nutri = NUTRITION_DAY_TYPES.swimAerobic,
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
  intensityGuidance: /threshold|quality|pace/i.test(type) ? "controlled quality work" : "repeatable aerobic rhythm",
});

const buildPowerSession = ({
  type = "power-skill",
  label = "Power Session",
  focus = "Explosive lower-body work",
  dose = "25-35 min",
  support = "",
  nutri = NUTRITION_DAY_TYPES.strengthSupport,
} = {}) => ({
  type,
  label,
  nutri,
  power: {
    focus,
    dose,
    support,
  },
  fallback: support || dose,
  intensityGuidance: "high intent, low sloppy fatigue",
});

export const DOMAIN_ADAPTERS = {
  [DOMAIN_ADAPTER_IDS.foundation]: {
    id: DOMAIN_ADAPTER_IDS.foundation,
    label: "General Foundation",
    architecture: "maintenance_rebuild",
    supportedCapabilities: ["consistency_habit_restoration", "aerobic_base", "durability_prehab"],
    requiredAnchors: ["weekly schedule reality"],
    nutritionBias: "consistency_support",
  },
  [DOMAIN_ADAPTER_IDS.strength]: {
    id: DOMAIN_ADAPTER_IDS.strength,
    label: "Strength / Hypertrophy",
    architecture: "strength_dominant",
    supportedCapabilities: ["maximal_strength", "hypertrophy", "durability_prehab"],
    requiredAnchors: ["main lift baseline"],
    nutritionBias: "strength_support",
  },
  [DOMAIN_ADAPTER_IDS.running]: {
    id: DOMAIN_ADAPTER_IDS.running,
    label: "Running Endurance",
    architecture: "race_prep_dominant",
    supportedCapabilities: ["aerobic_base", "threshold_endurance", "endurance_event_preparation"],
    requiredAnchors: ["recent pace or distance anchor"],
    nutritionBias: "performance_support",
  },
  [DOMAIN_ADAPTER_IDS.swimming]: {
    id: DOMAIN_ADAPTER_IDS.swimming,
    label: "Swimming Endurance / Technique",
    architecture: "race_prep_dominant",
    supportedCapabilities: ["skill_technique", "aerobic_base", "threshold_endurance", "endurance_event_preparation"],
    requiredAnchors: ["pool access", "recent swim benchmark"],
    nutritionBias: "performance_support",
  },
  [DOMAIN_ADAPTER_IDS.cycling]: {
    id: DOMAIN_ADAPTER_IDS.cycling,
    label: "Cycling Endurance",
    architecture: "race_prep_dominant",
    supportedCapabilities: ["aerobic_base", "threshold_endurance", "endurance_event_preparation"],
    requiredAnchors: ["bike access", "recent ride benchmark"],
    nutritionBias: "performance_support",
  },
  [DOMAIN_ADAPTER_IDS.triathlon]: {
    id: DOMAIN_ADAPTER_IDS.triathlon,
    label: "Triathlon / Multisport",
    architecture: "hybrid_performance",
    supportedCapabilities: ["aerobic_base", "threshold_endurance", "skill_technique", "consistency_habit_restoration"],
    requiredAnchors: ["race format", "modality priority", "recent endurance anchors"],
    nutritionBias: "performance_support",
  },
  [DOMAIN_ADAPTER_IDS.power]: {
    id: DOMAIN_ADAPTER_IDS.power,
    label: "Power / Vertical / Plyometric",
    architecture: "strength_dominant",
    supportedCapabilities: ["power_explosiveness", "elasticity_reactive_ability", "maximal_strength", "durability_prehab"],
    requiredAnchors: ["jump benchmark", "tissue tolerance"],
    nutritionBias: "strength_support",
  },
  [DOMAIN_ADAPTER_IDS.bodyComp]: {
    id: DOMAIN_ADAPTER_IDS.bodyComp,
    label: "Body Composition / Recomposition",
    architecture: "body_comp_conditioning",
    supportedCapabilities: ["body_composition", "hypertrophy", "aerobic_base", "consistency_habit_restoration"],
    requiredAnchors: ["body-composition proxy"],
    nutritionBias: "deficit_support",
  },
  [DOMAIN_ADAPTER_IDS.durability]: {
    id: DOMAIN_ADAPTER_IDS.durability,
    label: "Durability / Rebuild",
    architecture: "maintenance_rebuild",
    supportedCapabilities: ["durability_prehab", "mobility_movement_quality", "consistency_habit_restoration"],
    requiredAnchors: ["active issue context"],
    nutritionBias: "consistency_support",
  },
  [DOMAIN_ADAPTER_IDS.hybrid]: {
    id: DOMAIN_ADAPTER_IDS.hybrid,
    label: "Hybrid Multi-Domain",
    architecture: "hybrid_performance",
    supportedCapabilities: ["aerobic_base", "maximal_strength", "hypertrophy", "consistency_habit_restoration"],
    requiredAnchors: ["dominant tradeoff preference"],
    nutritionBias: "maintenance_support",
  },
};

export const getDomainAdapterById = (adapterId = "") => DOMAIN_ADAPTERS[String(adapterId || "").trim()] || DOMAIN_ADAPTERS[DOMAIN_ADAPTER_IDS.foundation];

export const selectDomainAdapter = ({
  goals = [],
  defaultArchitecture = "hybrid_performance",
  lowBandwidth = false,
  upperBodyMaintenance = false,
} = {}) => {
  const capabilityStack = resolveGoalCapabilityStack({ goals });
  const primaryPacket = capabilityStack.primary || null;
  const adapter = getDomainAdapterById(primaryPacket?.primaryDomain || DOMAIN_ADAPTER_IDS.foundation);
  let architecture = adapter?.architecture || defaultArchitecture;
  if (adapter?.id === DOMAIN_ADAPTER_IDS.running && upperBodyMaintenance) {
    architecture = "event_prep_upper_body_maintenance";
  } else if (lowBandwidth && !["strength_dominant", "body_comp_conditioning"].includes(architecture)) {
    architecture = "maintenance_rebuild";
  }
  return {
    adapter,
    capabilityStack,
    architectureOverride: architecture,
  };
};

const replaceSupportiveSessionWithRecovery = (templates = {}, preferredDays = []) => {
  const next = clonePlainValue(templates || {});
  const targetDay = preferredDays.find((dayKey) => {
    const session = next?.[dayKey];
    return session && session.type !== "rest" && !/long run|threshold swim|quality|tempo/i.test(String(session?.label || ""));
  });
  if (!targetDay) return { dayTemplates: next, effects: [] };
  next[targetDay] = restDay("Recovery / mobility only");
  return {
    dayTemplates: next,
    effects: [`Supportive work was trimmed on ${targetDay}.`],
  };
};

const addAggressiveTopUp = (templates = {}, session) => {
  const next = clonePlainValue(templates || {});
  if (next?.[0]?.type === "rest") next[0] = session;
  return {
    dayTemplates: next,
    effects: [session?.label ? `${session.label} was added as an optional short add-on.` : "An optional short add-on was added."],
  };
};

export const applyPreferencePolicyToDayTemplates = ({
  dayTemplates = {},
  architecture = "hybrid_performance",
  adapter = null,
  preferencePolicy = null,
} = {}) => {
  const next = clonePlainValue(dayTemplates || {});
  const policyId = String(preferencePolicy?.id || "standard");
  if (policyId === "standard") {
    return { dayTemplates: next, effects: [], changed: false };
  }

  if (policyId === "conservative") {
    const recoveryDaysByArchitecture = {
      event_prep_upper_body_maintenance: [5, 3],
      race_prep_dominant: [5, 2],
      strength_dominant: [5, 2],
      body_comp_conditioning: [6, 2],
      hybrid_performance: [2, 6],
      maintenance_rebuild: [6],
    };
    const reduced = replaceSupportiveSessionWithRecovery(next, recoveryDaysByArchitecture[architecture] || [6, 5, 2]);
    Object.values(reduced.dayTemplates || {}).forEach((session) => {
      if (!session || !/strength/.test(String(session?.type || ""))) return;
      if (session.strengthDose) session.strengthDose = "20-30 min maintenance strength";
      if (session.strengthDuration) session.strengthDuration = "20-30 min";
      if (/support/i.test(String(session?.label || ""))) session.label = normalizeSessionLabel(`${session.label} (Controlled)`);
    });
    return {
      dayTemplates: reduced.dayTemplates,
      effects: dedupeStrings(["Conservative preference trimmed supportive work and reduced session density.", ...(reduced.effects || [])]),
      changed: true,
    };
  }

  const aggressiveTopUp = adapter?.id === DOMAIN_ADAPTER_IDS.swimming
    ? buildSwimSession({
        type: "swim-technique",
        label: "Optional Technique Swim",
        focus: "Technique",
        duration: "20-30 min",
        setLine: "Short drill set + easy aerobic finish.",
      })
    : adapter?.id === DOMAIN_ADAPTER_IDS.power
    ? buildPowerSession({
        type: "power-skill",
        label: "Optional Jump Primer",
        focus: "Low-dose jump exposure",
        dose: "15-20 min",
        support: "3-5 short jump sets + landing refreshers.",
      })
    : buildConditioningSession({
        label: "Optional Short Add-On",
        detail: "15-20 min controlled aerobic work or a mobility finisher",
        lowImpact: true,
      });
  const expanded = addAggressiveTopUp(next, aggressiveTopUp);
  Object.values(expanded.dayTemplates || {}).forEach((session) => {
    if (!session) return;
    if (/strength/.test(String(session?.type || "")) && session.strengthDose) {
      session.strengthDose = session.strengthDose === "20-35 min maintenance strength"
        ? "30-45 min progression strength"
        : session.strengthDose;
      session.optionalSecondary = normalizeSessionLabel(session.optionalSecondary || "Optional: progression finisher if readiness is good.");
    }
    if (/easy-run|conditioning|swim-aerobic|swim-technique/.test(String(session?.type || ""))) {
      session.optionalSecondary = normalizeSessionLabel(session.optionalSecondary || "Optional: short quality finish if recovery is still good.");
    }
  });
  return {
    dayTemplates: expanded.dayTemplates,
    effects: dedupeStrings(["Aggressive preference preserved more work and added a small optional add-on.", ...(expanded.effects || [])]),
    changed: true,
  };
};

export const buildDomainSpecificDayTemplates = ({
  adapter = null,
  architecture = "hybrid_performance",
  baseWeek = {},
  strengthPriority = false,
} = {}) => {
  const safeAdapter = adapter ? getDomainAdapterById(adapter.id || adapter) : null;
  if (!safeAdapter) return null;

  if (safeAdapter.id === DOMAIN_ADAPTER_IDS.swimming && architecture === "race_prep_dominant") {
    return {
      1: buildSwimSession({
        type: "swim-technique",
        label: "Technique Swim",
        focus: "Technique + rhythm",
        duration: baseWeek?.mon?.d || "35-45 min",
        setLine: "Drills, relaxed aerobic repeats, and short form resets.",
      }),
      2: {
        type: "strength+prehab",
        label: strengthPriority ? "Dryland Strength A" : "Dryland Support A",
        strSess: "A",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: strengthPriority ? "35-45 min dryland strength" : "20-30 min dryland support",
        optionalSecondary: "Optional: shoulder mobility reset after the main dryland work.",
      },
      3: buildSwimSession({
        type: "swim-aerobic",
        label: "Aerobic Swim",
        focus: "Aerobic base",
        duration: baseWeek?.fri?.d || "30-40 min",
        setLine: "Steady aerobic work with clean stroke count discipline.",
      }),
      4: buildSwimSession({
        type: "swim-threshold",
        label: "Threshold Swim",
        focus: "Threshold pacing",
        duration: baseWeek?.thu?.d || "35-45 min",
        setLine: "Main set at controlled threshold effort with generous form guardrails.",
        nutri: NUTRITION_DAY_TYPES.swimQuality,
      }),
      5: {
        type: "strength+prehab",
        label: strengthPriority ? "Dryland Strength B" : "Shoulder / Core Support",
        strSess: "B",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: strengthPriority ? "30-40 min dryland strength" : "20-25 min shoulder durability + trunk work",
        optionalSecondary: "Optional: 5-8 min band activation before the next swim day.",
      },
      6: buildSwimSession({
        type: "swim-endurance",
        label: "Long Aerobic Swim",
        focus: "Sustained endurance",
        duration: baseWeek?.sat?.d || "45-60 min",
        setLine: "Broken or continuous mile-context work with even pacing.",
        nutri: NUTRITION_DAY_TYPES.swimEndurance,
      }),
      0: restDay("Shoulder recovery"),
    };
  }

  if (safeAdapter.id === DOMAIN_ADAPTER_IDS.cycling && architecture === "race_prep_dominant") {
    return {
      1: buildConditioningSession({
        label: "Tempo Ride",
        detail: "35-50 min tempo or cadence-control ride",
      }),
      2: {
        type: "strength+prehab",
        label: "Support Strength A",
        strSess: "A",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: "20-30 min low-fatigue strength",
        optionalSecondary: "Optional: hip and trunk support.",
      },
      3: buildConditioningSession({
        label: "Aerobic Ride",
        detail: "30-45 min easy endurance ride",
        lowImpact: true,
      }),
      4: restDay("Recovery / walk"),
      5: {
        type: "strength+prehab",
        label: "Durability Strength",
        strSess: "B",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: "20-30 min durability strength",
        optionalSecondary: "Optional: calf and glute support.",
      },
      6: buildConditioningSession({
        label: "Long Ride",
        detail: "60-90 min aerobic ride",
      }),
      0: restDay("Active Recovery"),
    };
  }

  if (safeAdapter.id === DOMAIN_ADAPTER_IDS.triathlon && architecture === "hybrid_performance") {
    return {
      1: buildSwimSession({
        type: "swim-technique",
        label: "Technique Swim",
        focus: "Technique",
        duration: "30-40 min",
        setLine: "Drills + easy aerobic repeats.",
        nutri: NUTRITION_DAY_TYPES.swimTechnique,
      }),
      2: buildConditioningSession({
        label: "Bike Aerobic",
        detail: "35-50 min easy aerobic ride",
        lowImpact: true,
      }),
      3: {
        type: "easy-run",
        label: "Easy Run",
        run: { t: "Easy", d: "25-35 min" },
        nutri: NUTRITION_DAY_TYPES.runEasy,
        optionalSecondary: "Optional: strides only if recovery is clearly good.",
      },
      4: {
        type: "strength+prehab",
        label: "Tri Support Strength",
        strSess: "A",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: "20-30 min low-fatigue strength",
        optionalSecondary: "Optional: calf / shoulder support.",
      },
      5: restDay("Recovery / walk"),
      6: buildConditioningSession({
        label: "Brick or Long Bike",
        detail: "45-75 min bike with short transition run if ready",
      }),
      0: restDay("Active Recovery"),
    };
  }

  if (safeAdapter.id === DOMAIN_ADAPTER_IDS.power && architecture === "strength_dominant") {
    return {
      1: buildPowerSession({
        type: "power-skill",
        label: "Jump Technique + Power",
        focus: "Jump exposure and clean takeoff mechanics",
        dose: "25-35 min",
        support: "Low-volume jump sets, approach work, and landing quality.",
      }),
      2: {
        type: "strength+prehab",
        label: "Lower-Body Strength Support",
        strSess: "A",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: "35-45 min force-production strength",
        optionalSecondary: "Optional: ankle and foot stiffness drills after the main sets.",
      },
      3: buildConditioningSession({
        label: "Tissue Recovery + Tempo",
        detail: "15-25 min easy cyclical work plus calf, ankle, and tendon prep",
        lowImpact: true,
      }),
      4: buildPowerSession({
        type: "reactive-plyo",
        label: "Reactive Plyometrics",
        focus: "Elasticity and fast contacts",
        dose: "20-30 min",
        support: "Short contacts, low slop, and generous rest between sets.",
      }),
      5: {
        type: "strength+prehab",
        label: "Full-Body Strength B",
        strSess: "B",
        nutri: NUTRITION_DAY_TYPES.strengthSupport,
        strengthDose: "30-40 min lower-body and trunk support",
        optionalSecondary: "Optional: trunk bracing finisher if contacts stayed crisp.",
      },
      6: buildPowerSession({
        type: "sprint-support",
        label: "Sprint / Approach Support",
        focus: "Short acceleration and approach rhythm",
        dose: "20-30 min",
        support: "Short sprints, approach jumps, and controlled tissue exposure.",
      }),
      0: restDay("Tendon recovery"),
    };
  }

  return null;
};
