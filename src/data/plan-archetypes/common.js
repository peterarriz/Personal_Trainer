const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const uniqueStrings = (items = []) => {
  const seen = new Set();
  return toArray(items)
    .map((item) => sanitizeText(item, 120))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const PLAN_ARCHETYPE_FAMILIES = Object.freeze([
  "endurance",
  "strength",
  "physique",
  "general_fitness",
  "re_entry",
  "hybrid",
]);

export const PLAN_ARCHETYPE_EXPERIENCE_LEVELS = Object.freeze([
  "beginner",
  "intermediate",
  "advanced",
  "returning",
  "unknown",
]);

export const PLAN_ARCHETYPE_SESSION_LENGTHS = Object.freeze([
  "short_30",
  "standard_45",
  "extended_60",
  "long_75",
]);

export const PLAN_ARCHETYPE_EQUIPMENT_PROFILES = Object.freeze([
  "full_gym",
  "basic_gym",
  "dumbbells_only",
  "bands_bodyweight",
  "limited_home",
  "running_access",
  "pool_access",
  "bike_access",
  "mixed",
  "travel",
]);

export const PLAN_ARCHETYPE_ENVIRONMENTS = Object.freeze([
  "home",
  "gym",
  "outdoor",
  "pool",
  "road",
  "mixed",
  "travel",
]);

export const PLAN_ARCHETYPE_RISK_POSTURES = Object.freeze([
  "protective",
  "standard",
  "progressive",
]);

export const createPlanArchetype = ({
  id = "",
  family = "",
  subfamily = "",
  displayName = "",
  userFacingIntentLabel = "",
  internalDescription = "",
  supportedGoalIntents = [],
  supportedSecondaryIntents = [],
  supportedExperienceLevels = ["unknown"],
  supportedFrequencies = [3, 4],
  supportedSessionLengths = ["standard_45"],
  supportedEquipmentProfiles = ["mixed"],
  supportedEnvironments = ["mixed"],
  supportedRiskPostures = ["standard"],
  requiredAnchors = [],
  optionalAnchors = [],
  primaryMetrics = [],
  proxyMetrics = [],
  weeklyStructureTemplate = {},
  progressionStrategy = {},
  fatigueManagementStrategy = {},
  deloadStrategy = {},
  adaptationRules = [],
  eventCompatibility = [],
  hybridCompatibility = {},
  bodyCompCompatibility = {},
  contraindicationFlags = [],
  fallbackPriority = 50,
  tags = [],
  version = 1,
  active = true,
  planningCategory = "general_fitness",
  goalFamily = "general_fitness",
  primaryDomain = "general_foundation",
  architecture = "maintenance_rebuild",
  resolverHints = {},
  rationale = {},
} = {}) => Object.freeze({
  id: sanitizeText(id, 80),
  family: sanitizeText(family, 40).toLowerCase(),
  subfamily: sanitizeText(subfamily, 60).toLowerCase(),
  displayName: sanitizeText(displayName, 120),
  userFacingIntentLabel: sanitizeText(userFacingIntentLabel || displayName, 120),
  internalDescription: sanitizeText(internalDescription, 320),
  supportedGoalIntents: uniqueStrings(supportedGoalIntents),
  supportedSecondaryIntents: uniqueStrings(supportedSecondaryIntents),
  supportedExperienceLevels: uniqueStrings(supportedExperienceLevels),
  supportedFrequencies: uniqueStrings(supportedFrequencies.map((value) => `${Math.max(1, Math.min(7, Number(value) || 0))}`)),
  supportedSessionLengths: uniqueStrings(supportedSessionLengths),
  supportedEquipmentProfiles: uniqueStrings(supportedEquipmentProfiles),
  supportedEnvironments: uniqueStrings(supportedEnvironments),
  supportedRiskPostures: uniqueStrings(supportedRiskPostures),
  requiredAnchors: uniqueStrings(requiredAnchors),
  optionalAnchors: uniqueStrings(optionalAnchors),
  primaryMetrics: uniqueStrings(primaryMetrics),
  proxyMetrics: uniqueStrings(proxyMetrics),
  weeklyStructureTemplate: Object.freeze({
    patternId: sanitizeText(weeklyStructureTemplate?.patternId || "", 80).toLowerCase(),
    volumeProfile: sanitizeText(weeklyStructureTemplate?.volumeProfile || "", 80).toLowerCase(),
    intensityProfile: sanitizeText(weeklyStructureTemplate?.intensityProfile || "", 80).toLowerCase(),
    keySessionLabels: uniqueStrings(weeklyStructureTemplate?.keySessionLabels || []),
    longSession: Boolean(weeklyStructureTemplate?.longSession),
    supportStrengthDays: Math.max(0, Math.min(4, Number(weeklyStructureTemplate?.supportStrengthDays || 0) || 0)),
    minimumFrequency: Math.max(1, Math.min(7, Number(weeklyStructureTemplate?.minimumFrequency || 1) || 1)),
    notes: uniqueStrings(weeklyStructureTemplate?.notes || []),
  }),
  progressionStrategy: Object.freeze({
    id: sanitizeText(progressionStrategy?.id || "", 80).toLowerCase(),
    model: sanitizeText(progressionStrategy?.model || "", 120).toLowerCase(),
    primaryKnob: sanitizeText(progressionStrategy?.primaryKnob || "", 120).toLowerCase(),
    qualityDose: sanitizeText(progressionStrategy?.qualityDose || "", 160),
    rationale: sanitizeText(progressionStrategy?.rationale || "", 220),
  }),
  fatigueManagementStrategy: Object.freeze({
    id: sanitizeText(fatigueManagementStrategy?.id || "", 80).toLowerCase(),
    mode: sanitizeText(fatigueManagementStrategy?.mode || "", 120).toLowerCase(),
    summary: sanitizeText(fatigueManagementStrategy?.summary || "", 220),
  }),
  deloadStrategy: Object.freeze({
    id: sanitizeText(deloadStrategy?.id || "", 80).toLowerCase(),
    cadence: sanitizeText(deloadStrategy?.cadence || "", 120).toLowerCase(),
    summary: sanitizeText(deloadStrategy?.summary || "", 220),
  }),
  adaptationRules: toArray(adaptationRules)
    .map((rule, index) => ({
      id: sanitizeText(rule?.id || `${id}_rule_${index + 1}`, 120).toLowerCase(),
      trigger: sanitizeText(rule?.trigger || "", 180),
      action: sanitizeText(rule?.action || "", 180),
      rationale: sanitizeText(rule?.rationale || "", 220),
    }))
    .filter((rule) => rule.id && rule.trigger && rule.action),
  eventCompatibility: uniqueStrings(eventCompatibility),
  hybridCompatibility: Object.freeze({
    modes: uniqueStrings(hybridCompatibility?.modes || []),
    notes: sanitizeText(hybridCompatibility?.notes || "", 220),
  }),
  bodyCompCompatibility: Object.freeze({
    modes: uniqueStrings(bodyCompCompatibility?.modes || []),
    notes: sanitizeText(bodyCompCompatibility?.notes || "", 220),
  }),
  contraindicationFlags: uniqueStrings(contraindicationFlags),
  fallbackPriority: Math.max(1, Math.min(100, Math.round(Number(fallbackPriority) || 50))),
  tags: uniqueStrings(tags),
  version: Math.max(1, Math.round(Number(version) || 1)),
  active: Boolean(active),
  planningCategory: sanitizeText(planningCategory, 40).toLowerCase() || "general_fitness",
  goalFamily: sanitizeText(goalFamily, 40).toLowerCase() || "general_fitness",
  primaryDomain: sanitizeText(primaryDomain, 80).toLowerCase() || "general_foundation",
  architecture: sanitizeText(architecture, 80).toLowerCase() || "maintenance_rebuild",
  resolverHints: Object.freeze({
    preferredModality: sanitizeText(resolverHints?.preferredModality || "", 60).toLowerCase(),
    eventDistance: sanitizeText(resolverHints?.eventDistance || "", 60).toLowerCase(),
    liftFocus: sanitizeText(resolverHints?.liftFocus || "", 60).toLowerCase(),
    bodyCompMode: sanitizeText(resolverHints?.bodyCompMode || "", 60).toLowerCase(),
    hybridPriority: sanitizeText(resolverHints?.hybridPriority || "", 60).toLowerCase(),
    protectedBias: Boolean(resolverHints?.protectedBias),
    busyFriendly: Boolean(resolverHints?.busyFriendly),
  }),
  rationale: Object.freeze({
    frequencyWhy: sanitizeText(rationale?.frequencyWhy || "", 220),
    progressionWhy: sanitizeText(rationale?.progressionWhy || "", 220),
    recoveryWhy: sanitizeText(rationale?.recoveryWhy || "", 220),
    fallbackWhy: sanitizeText(rationale?.fallbackWhy || "", 220),
  }),
});
