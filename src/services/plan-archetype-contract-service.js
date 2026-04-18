import { findPlanArchetypeById } from "../data/plan-archetypes/index.js";
import { NUTRITION_DAY_TYPES } from "./nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const dedupeStrings = (items = []) => {
  const seen = new Set();
  return toArray(items)
    .map((item) => sanitizeText(item, 80).toLowerCase())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const buildConditioningSession = ({
  label = "Supportive Conditioning",
  detail = "20-30 min easy aerobic conditioning",
  lowImpact = true,
  optionalSecondary = "",
  nutri = NUTRITION_DAY_TYPES.conditioningMixed,
} = {}) => ({
  type: "conditioning",
  label,
  nutri,
  fallback: detail,
  intensityGuidance: lowImpact ? "easy aerobic only" : "controlled conditioning",
  environmentNote: lowImpact ? "Choose the lowest-friction aerobic setup available." : "",
  optionalSecondary,
});

const buildStrengthSupportSession = ({
  label = "Protected Strength",
  strengthDose = "25-35 min repeatable strength",
  optionalSecondary = "",
  nutri = NUTRITION_DAY_TYPES.strengthSupport,
  strSess = "A",
} = {}) => ({
  type: "strength+prehab",
  label,
  strSess,
  strengthDose,
  nutri,
  optionalSecondary,
});

const isRunSessionType = (type = "") => /(easy-run|hard-run|long-run|run\+strength)/.test(String(type || "").toLowerCase());
const isSwimSessionType = (type = "") => /^swim-/.test(String(type || "").toLowerCase());
const isStrengthSessionType = (type = "") => String(type || "").toLowerCase() === "strength+prehab" || String(type || "").toLowerCase() === "run+strength";
const isRecoverySessionType = (type = "") => ["rest", "recovery"].includes(String(type || "").toLowerCase());
const isConditioningSessionType = (type = "") => String(type || "").toLowerCase() === "conditioning";
const isHybridSessionType = (type = "") => String(type || "").toLowerCase() === "run+strength";
const isQualitySessionType = (type = "") => ["hard-run", "long-run", "swim-threshold", "swim-endurance"].includes(String(type || "").toLowerCase());

const isEnduranceSessionType = (type = "") => (
  isRunSessionType(type)
  || isSwimSessionType(type)
  || isConditioningSessionType(type)
);

const classifyEnduranceSignalDomain = (primaryDomain = "") => {
  const safePrimaryDomain = sanitizeText(primaryDomain, 80).toLowerCase();
  if (safePrimaryDomain.includes("swim")) return "swim";
  if (safePrimaryDomain.includes("cycle") || safePrimaryDomain.includes("ride")) return "cycling";
  if (safePrimaryDomain.includes("triathlon")) return "hybrid";
  return "running";
};

export const PLAN_ARCHETYPE_CONTRACT_IDS = Object.freeze({
  strengthOnly: "strength_only",
  enduranceOnly: "endurance_only",
  physiqueFirst: "physique_first",
  reEntry: "re_entry",
  hybrid: "hybrid",
});

export const PLAN_ARCHETYPE_CONTRACTS = Object.freeze({
  [PLAN_ARCHETYPE_CONTRACT_IDS.strengthOnly]: Object.freeze({
    id: PLAN_ARCHETYPE_CONTRACT_IDS.strengthOnly,
    label: "Strength-only",
    allowedSessionTypes: Object.freeze(["strength+prehab", "conditioning", "rest"]),
    forbiddenSessionTypes: Object.freeze(["easy-run", "hard-run", "long-run", "run+strength", "swim-technique", "swim-threshold", "swim-aerobic", "swim-endurance"]),
    requiredTrackingMetricGroups: Object.freeze([
      Object.freeze(["top_set_load"]),
      Object.freeze(["performance_record"]),
      Object.freeze(["projected_goal_progress", "compound_lift_consistency", "weekly_strength_frequency"]),
    ]),
    defaultNutritionLane: "strength_only",
    expectedTodayKind: "strength_only",
    expectedMergeLanes: false,
    weekRules: Object.freeze({
      minStrengthSessions: 1,
      maxRunSessions: 0,
      maxSwimSessions: 0,
      maxHybridSessions: 0,
    }),
  }),
  [PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly]: Object.freeze({
    id: PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly,
    label: "Endurance-only",
    allowedSessionTypes: Object.freeze(["easy-run", "hard-run", "long-run", "run+strength", "strength+prehab", "conditioning", "rest", "swim-technique", "swim-threshold", "swim-aerobic", "swim-endurance"]),
    forbiddenSessionTypes: Object.freeze([]),
    requiredTrackingMetricGroups: Object.freeze([
      Object.freeze(["goal_pace_anchor", "swim_benchmark_retest", "ride_consistency", "return_to_run_consistency", "aerobic_base_consistency", "triathlon_consistency"]),
      Object.freeze(["weekly_run_frequency", "weekly_swim_frequency", "ride_frequency", "run_consistency", "swim_consistency"]),
      Object.freeze(["long_run_duration", "swim_benchmark_retest", "long_ride_duration", "continuous_running_time"]),
    ]),
    defaultNutritionLane: "endurance",
    expectedTodayKind: "run_only",
    expectedMergeLanes: false,
    weekRules: Object.freeze({
      minEnduranceSessions: 2,
      maxHybridSessions: 1,
    }),
  }),
  [PLAN_ARCHETYPE_CONTRACT_IDS.physiqueFirst]: Object.freeze({
    id: PLAN_ARCHETYPE_CONTRACT_IDS.physiqueFirst,
    label: "Physique-first",
    allowedSessionTypes: Object.freeze(["strength+prehab", "conditioning", "rest"]),
    forbiddenSessionTypes: Object.freeze(["easy-run", "hard-run", "long-run", "run+strength", "swim-technique", "swim-threshold", "swim-aerobic", "swim-endurance"]),
    requiredTrackingMetricGroups: Object.freeze([
      Object.freeze(["bodyweight_trend"]),
      Object.freeze(["waist_circumference", "checkin_consistency", "appearance_review_checklist"]),
      Object.freeze(["weekly_strength_frequency", "training_adherence", "checkin_consistency"]),
    ]),
    defaultNutritionLane: "strength_only",
    expectedTodayKind: "strength_only",
    expectedMergeLanes: false,
    weekRules: Object.freeze({
      minStrengthSessions: 1,
      maxRunSessions: 0,
      maxSwimSessions: 0,
      maxHybridSessions: 0,
    }),
  }),
  [PLAN_ARCHETYPE_CONTRACT_IDS.reEntry]: Object.freeze({
    id: PLAN_ARCHETYPE_CONTRACT_IDS.reEntry,
    label: "Re-entry",
    allowedSessionTypes: Object.freeze(["strength+prehab", "conditioning", "rest", "easy-run"]),
    forbiddenSessionTypes: Object.freeze(["hard-run", "long-run", "run+strength", "swim-threshold", "swim-endurance"]),
    requiredTrackingMetricGroups: Object.freeze([
      Object.freeze(["weekly_training_frequency"]),
      Object.freeze(["readiness_anchor"]),
      Object.freeze(["baseline_improvement"]),
      Object.freeze(["baseline_benchmark"]),
    ]),
    defaultNutritionLane: "strength_only",
    expectedTodayKind: "strength_only",
    expectedMergeLanes: false,
    weekRules: Object.freeze({
      minStrengthSessions: 1,
      maxHybridSessions: 0,
      maxQualitySessions: 0,
      maxLongRunSessions: 0,
    }),
  }),
  [PLAN_ARCHETYPE_CONTRACT_IDS.hybrid]: Object.freeze({
    id: PLAN_ARCHETYPE_CONTRACT_IDS.hybrid,
    label: "Hybrid",
    allowedSessionTypes: Object.freeze(["easy-run", "hard-run", "long-run", "run+strength", "strength+prehab", "conditioning", "rest", "swim-technique", "swim-threshold", "swim-aerobic", "swim-endurance"]),
    forbiddenSessionTypes: Object.freeze([]),
    requiredTrackingMetricGroups: Object.freeze([
      Object.freeze(["hybrid_consistency", "run_lift_consistency", "aesthetic_endurance_consistency", "sport_support_consistency", "triathlon_consistency"]),
      Object.freeze(["weekly_strength_frequency"]),
      Object.freeze(["weekly_run_frequency", "conditioning_consistency", "work_capacity_check", "run_consistency", "swim_consistency"]),
    ]),
    defaultNutritionLane: "hybrid",
    expectedTodayKind: "hybrid",
    expectedMergeLanes: true,
    weekRules: Object.freeze({
      minStrengthSessions: 1,
      minEnduranceSessions: 1,
    }),
  }),
});

const convertToConditioning = (session = null, { lowImpact = true, label = "", detail = "", nutri = NUTRITION_DAY_TYPES.conditioningMixed } = {}) => {
  const sessionText = sanitizeText([
    session?.label,
    session?.run?.t,
    session?.run?.d,
    session?.swim?.focus,
    session?.swim?.d,
  ].join(" "), 160).toLowerCase();
  const looksHard = /tempo|interval|threshold|quality|long/.test(sessionText) || isQualitySessionType(session?.type);
  return buildConditioningSession({
    label: label || (looksHard && !lowImpact ? "Conditioning Intervals" : "Supportive Conditioning"),
    detail: detail || (
      looksHard
        ? "20-30 min controlled bike, rower, incline walk, or mixed-modality intervals"
        : "20-30 min easy aerobic conditioning or brisk walk"
    ),
    lowImpact,
    optionalSecondary: sanitizeText(session?.optionalSecondary || "", 140),
    nutri,
  });
};

const convertToStrengthSupport = (session = null, { label = "Protected Strength", strengthDose = "25-35 min repeatable strength" } = {}) => buildStrengthSupportSession({
  label,
  strSess: sanitizeText(session?.strSess || "A", 20) || "A",
  strengthDose: sanitizeText(session?.strengthDose || strengthDose, 80) || strengthDose,
  optionalSecondary: sanitizeText(session?.optionalSecondary || "", 140),
});

export const summarizePlanContractDomains = ({ dayTemplates = {} } = {}) => {
  const sessions = Object.values(dayTemplates || {}).filter(Boolean);
  const exactTypes = dedupeStrings(sessions.map((session) => session?.type || ""));
  return {
    exactTypes,
    strengthSessions: sessions.filter((session) => isStrengthSessionType(session?.type)).length,
    runSessions: sessions.filter((session) => isRunSessionType(session?.type)).length,
    swimSessions: sessions.filter((session) => isSwimSessionType(session?.type)).length,
    enduranceSessions: sessions.filter((session) => isEnduranceSessionType(session?.type)).length,
    conditioningSessions: sessions.filter((session) => isConditioningSessionType(session?.type)).length,
    hybridSessions: sessions.filter((session) => isHybridSessionType(session?.type)).length,
    recoverySessions: sessions.filter((session) => isRecoverySessionType(session?.type)).length,
    qualitySessions: sessions.filter((session) => isQualitySessionType(session?.type)).length,
    longRunSessions: sessions.filter((session) => String(session?.type || "").toLowerCase() === "long-run").length,
  };
};

export const resolvePlanArchetypeContract = ({
  goals = [],
  primaryGoal = null,
  planArchetypeId = "",
  primaryDomain = "",
  planningCategory = "",
  goalFamily = "",
  architecture = "",
} = {}) => {
  const archetype = findPlanArchetypeById(planArchetypeId || primaryGoal?.resolvedGoal?.planArchetypeId || "");
  const family = sanitizeText(archetype?.family || "", 40).toLowerCase();
  const resolvedGoalFamily = sanitizeText(goalFamily || primaryGoal?.resolvedGoal?.goalFamily || "", 40).toLowerCase();
  const resolvedPlanningCategory = sanitizeText(planningCategory || primaryGoal?.resolvedGoal?.planningCategory || primaryGoal?.category || "", 40).toLowerCase();
  const resolvedPrimaryDomain = sanitizeText(primaryDomain || archetype?.primaryDomain || primaryGoal?.resolvedGoal?.primaryDomain || "", 80).toLowerCase();
  const goalCategories = dedupeStrings((goals || []).map((goal) => goal?.category || goal?.resolvedGoal?.planningCategory || ""));

  let contractId = PLAN_ARCHETYPE_CONTRACT_IDS.hybrid;
  if (family === "re_entry" || resolvedGoalFamily === "re_entry" || resolvedPrimaryDomain === "durability_rebuild") {
    contractId = PLAN_ARCHETYPE_CONTRACT_IDS.reEntry;
  } else if (
    family === "hybrid"
    || resolvedGoalFamily === "hybrid"
    || resolvedPrimaryDomain.includes("hybrid")
    || resolvedPrimaryDomain.includes("triathlon")
    || (goalCategories.includes("running") && goalCategories.includes("strength"))
  ) {
    contractId = PLAN_ARCHETYPE_CONTRACT_IDS.hybrid;
  } else if (
    family === "physique"
    || resolvedPlanningCategory === "body_comp"
    || ["body_comp", "appearance"].includes(resolvedGoalFamily)
  ) {
    contractId = PLAN_ARCHETYPE_CONTRACT_IDS.physiqueFirst;
  } else if (family === "strength" || resolvedPlanningCategory === "strength" || architecture === "strength_dominant") {
    contractId = PLAN_ARCHETYPE_CONTRACT_IDS.strengthOnly;
  } else if (
    family === "endurance"
    || resolvedPlanningCategory === "running"
    || /running_endurance|swimming_endurance_technique|cycling_endurance/.test(resolvedPrimaryDomain)
    || architecture === "race_prep_dominant"
  ) {
    contractId = PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly;
  }

  const baseContract = PLAN_ARCHETYPE_CONTRACTS[contractId] || PLAN_ARCHETYPE_CONTRACTS[PLAN_ARCHETYPE_CONTRACT_IDS.hybrid];
  const signalDomain = contractId === PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly
    ? classifyEnduranceSignalDomain(resolvedPrimaryDomain)
    : contractId === PLAN_ARCHETYPE_CONTRACT_IDS.hybrid
    ? "hybrid"
    : contractId === PLAN_ARCHETYPE_CONTRACT_IDS.reEntry && resolvedPlanningCategory === "running"
    ? "running"
    : "strength";

  const expectedTodayKind = contractId === PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly && signalDomain === "swim"
    ? "swim_only"
    : baseContract.expectedTodayKind;

  return {
    ...clonePlainValue(baseContract),
    planArchetypeId: sanitizeText(planArchetypeId || primaryGoal?.resolvedGoal?.planArchetypeId || "", 80).toLowerCase(),
    primaryDomain: resolvedPrimaryDomain,
    planningCategory: resolvedPlanningCategory,
    goalFamily: resolvedGoalFamily,
    architecture: sanitizeText(architecture, 80).toLowerCase(),
    signalDomain,
  };
};

export const enforcePlanArchetypeContract = ({
  contract = null,
  dayTemplates = {},
} = {}) => {
  const resolvedContract = contract?.id ? contract : resolvePlanArchetypeContract(contract || {});
  if (!resolvedContract?.id) return clonePlainValue(dayTemplates || {});

  return Object.fromEntries(
    Object.entries(dayTemplates || {}).map(([dayKey, session]) => {
      const type = String(session?.type || "").toLowerCase();
      if (!session || !type) return [dayKey, session];

      if (resolvedContract.id === PLAN_ARCHETYPE_CONTRACT_IDS.strengthOnly) {
        if (type === "run+strength") return [dayKey, convertToStrengthSupport(session, { label: "Strength + Conditioning Primer", strengthDose: "35-45 min strength" })];
        if (isRunSessionType(type) || isSwimSessionType(type)) return [dayKey, convertToConditioning(session, { lowImpact: type !== "hard-run" && type !== "long-run" && type !== "swim-threshold" && type !== "swim-endurance" })];
        return [dayKey, session];
      }

      if (resolvedContract.id === PLAN_ARCHETYPE_CONTRACT_IDS.physiqueFirst) {
        if (type === "run+strength") return [dayKey, convertToStrengthSupport(session, { label: "Strength + Aerobic Support", strengthDose: "30-40 min strength support" })];
        if (isRunSessionType(type) || isSwimSessionType(type)) return [dayKey, convertToConditioning(session, { lowImpact: true })];
        return [dayKey, session];
      }

      if (resolvedContract.id === PLAN_ARCHETYPE_CONTRACT_IDS.reEntry) {
        if (type === "run+strength") return [dayKey, convertToStrengthSupport(session, { label: "Protected Strength", strengthDose: "20-30 min low-friction strength" })];
        if (type === "hard-run" || type === "long-run" || type === "swim-threshold" || type === "swim-endurance") {
          return [dayKey, convertToConditioning(session, {
            lowImpact: true,
            label: "Repeatable Conditioning",
            detail: "15-25 min easy aerobic work",
            nutri: NUTRITION_DAY_TYPES.conditioningMixed,
          })];
        }
        return [dayKey, session];
      }

      return [dayKey, session];
    })
  );
};

export const selectRepresentativeSessionForContract = ({
  contract = null,
  dayTemplates = {},
} = {}) => {
  const resolvedContract = contract?.id ? contract : resolvePlanArchetypeContract(contract || {});
  const orderedSessions = Object.entries(dayTemplates || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, session]) => session)
    .filter(Boolean)
    .filter((session) => !isRecoverySessionType(session?.type));

  if (!orderedSessions.length) return null;
  if (resolvedContract?.id === PLAN_ARCHETYPE_CONTRACT_IDS.hybrid) {
    return orderedSessions.find((session) => isHybridSessionType(session?.type))
      || orderedSessions.find((session) => isEnduranceSessionType(session?.type) && isStrengthSessionType(session?.type))
      || orderedSessions[0];
  }
  if (resolvedContract?.id === PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly) {
    return orderedSessions.find((session) => isSwimSessionType(session?.type))
      || orderedSessions.find((session) => isRunSessionType(session?.type))
      || orderedSessions.find((session) => isConditioningSessionType(session?.type))
      || orderedSessions[0];
  }
  return orderedSessions.find((session) => isStrengthSessionType(session?.type)) || orderedSessions[0];
};

export const auditPlanArchetypeContract = ({
  contract = null,
  dayTemplates = {},
  trackedItems = [],
} = {}) => {
  const resolvedContract = contract?.id ? contract : resolvePlanArchetypeContract(contract || {});
  const summary = summarizePlanContractDomains({ dayTemplates });
  const trackedKeys = new Set(
    toArray(trackedItems)
      .map((item) => sanitizeText(item?.key || "", 60).toLowerCase())
      .filter(Boolean)
  );
  const violations = [];

  (resolvedContract?.forbiddenSessionTypes || []).forEach((type) => {
    if (summary.exactTypes.includes(type)) {
      violations.push({
        code: "forbidden_session_type",
        message: `${resolvedContract.label} plans cannot emit ${type}.`,
      });
    }
  });

  const rules = resolvedContract?.weekRules || {};
  if (Number.isFinite(rules.minStrengthSessions) && summary.strengthSessions < rules.minStrengthSessions) {
    violations.push({
      code: "missing_strength_lane",
      message: `${resolvedContract.label} plans need at least ${rules.minStrengthSessions} strength session${rules.minStrengthSessions === 1 ? "" : "s"} per week.`,
    });
  }
  if (Number.isFinite(rules.minEnduranceSessions) && summary.enduranceSessions < rules.minEnduranceSessions) {
    violations.push({
      code: "missing_endurance_lane",
      message: `${resolvedContract.label} plans need at least ${rules.minEnduranceSessions} endurance session${rules.minEnduranceSessions === 1 ? "" : "s"} per week.`,
    });
  }
  if (Number.isFinite(rules.maxRunSessions) && summary.runSessions > rules.maxRunSessions) {
    violations.push({
      code: "run_drift",
      message: `${resolvedContract.label} plans cannot quietly drift into ${summary.runSessions} run sessions.`,
    });
  }
  if (Number.isFinite(rules.maxSwimSessions) && summary.swimSessions > rules.maxSwimSessions) {
    violations.push({
      code: "swim_drift",
      message: `${resolvedContract.label} plans cannot quietly drift into ${summary.swimSessions} swim sessions.`,
    });
  }
  if (Number.isFinite(rules.maxHybridSessions) && summary.hybridSessions > rules.maxHybridSessions) {
    violations.push({
      code: "hybrid_drift",
      message: `${resolvedContract.label} plans cannot quietly drift into ${summary.hybridSessions} mixed-domain session${summary.hybridSessions === 1 ? "" : "s"}.`,
    });
  }
  if (Number.isFinite(rules.maxQualitySessions) && summary.qualitySessions > rules.maxQualitySessions) {
    violations.push({
      code: "quality_drift",
      message: `${resolvedContract.label} plans cannot carry ${summary.qualitySessions} quality session${summary.qualitySessions === 1 ? "" : "s"} in the current week.`,
    });
  }
  if (Number.isFinite(rules.maxLongRunSessions) && summary.longRunSessions > rules.maxLongRunSessions) {
    violations.push({
      code: "long_run_drift",
      message: `${resolvedContract.label} plans cannot carry a long-run slot in the current week.`,
    });
  }

  if (trackedKeys.size > 0) {
    (resolvedContract?.requiredTrackingMetricGroups || []).forEach((group) => {
      const hit = group.some((key) => trackedKeys.has(String(key).toLowerCase()));
      if (!hit) {
        violations.push({
          code: "missing_tracking_metric",
          message: `${resolvedContract.label} plans need one of: ${group.join(", ")}.`,
        });
      }
    });
  }

  return {
    ok: violations.length === 0,
    contract: clonePlainValue(resolvedContract || null),
    summary,
    violations,
  };
};
