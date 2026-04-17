import { dedupeStrings } from "../utils/collection-utils.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const GOAL_CAPABILITY_FAMILIES = {
  maximalStrength: "maximal_strength",
  hypertrophy: "hypertrophy",
  bodyComp: "body_composition",
  aerobicBase: "aerobic_base",
  thresholdEndurance: "threshold_endurance",
  eventPrep: "endurance_event_preparation",
  power: "power_explosiveness",
  elasticity: "elasticity_reactive_ability",
  skill: "skill_technique",
  durability: "durability_prehab",
  mobility: "mobility_movement_quality",
  consistency: "consistency_habit_restoration",
};

export const DOMAIN_ADAPTER_IDS = {
  foundation: "general_foundation",
  strength: "strength_hypertrophy",
  running: "running_endurance",
  swimming: "swimming_endurance_technique",
  cycling: "cycling_endurance",
  triathlon: "triathlon_multisport",
  power: "power_vertical_plyometric",
  bodyComp: "body_composition_recomposition",
  durability: "durability_rebuild",
  hybrid: "hybrid_multi_domain",
};

const buildCapability = (capability, weight, role = "support") => ({
  capability,
  weight: Math.max(0.05, Math.min(1, Number(weight || 0) || 0)),
  role,
});

const getGoalSourceText = (goal = {}) => sanitizeText([
  goal?.name,
  goal?.resolvedGoal?.summary,
  goal?.resolvedGoal?.rawIntent?.text,
  goal?.resolvedGoal?.primaryMetric?.label,
  ...(goal?.resolvedGoal?.proxyMetrics || []).map((metric) => metric?.label),
].filter(Boolean).join(". "), 420).toLowerCase();

const detectCapabilitySignals = (goal = {}) => {
  const text = getGoalSourceText(goal);
  return {
    text,
    triathlon: /\b(triathlon|multisport|sprint tri|olympic tri|70\.3|ironman)\b/.test(text),
    cycling: /\b(cycling|bike|biking|ride|riding|trainer|peloton)\b/.test(text),
    swim: /\b(swim|swimming|pool|open water|laps?|freestyle|butterfly|backstroke|breaststroke)\b/.test(text),
    run: /\b(run|running|marathon|half marathon|10k|5k|pace|long run|tempo|race)\b/.test(text),
    strength: /\b(bench|press|squat|deadlift|strength|hypertrophy|muscle|powerbuilding|lifting)\b/.test(text),
    fatLoss: /\b(fat loss|lose fat|cut|lean|body fat|recomp|recomposition|body composition)\b/.test(text),
    appearance: /\b(look athletic|physique|aesthetic|defined|abs|midsection|leaner)\b/.test(text),
    vertical: /\b(vertical|jump higher|jumping higher|dunk|explosive|plyo|plyometric|reactive)\b/.test(text),
    durability: /\b(prehab|rehab|durability|rebuild|return|pain|injury|achilles|shoulder|knee|back)\b/.test(text),
    mobility: /\b(mobility|movement quality|move better|range of motion|flexibility)\b/.test(text),
    consistency: /\b(consistency|habit|routine|back into shape|re-entry|re entry|return to training)\b/.test(text),
    event: /\b(race|meet|competition|event)\b/.test(text),
    technique: /\b(technique|form|mechanics|economy|stroke)\b/.test(text),
    hybrid: /\b(hybrid|while keeping|while maintaining|and keep|but keep)\b/.test(text),
  };
};

const buildPacketFromSignals = ({ goal = {}, signals = {} } = {}) => {
  const resolvedGoal = goal?.resolvedGoal || {};
  const structuredPrimaryDomain = sanitizeText(resolvedGoal?.primaryDomain || "", 80).toLowerCase();
  const goalFamily = String(resolvedGoal?.goalFamily || goal?.goalFamily || "").toLowerCase();
  const confidence = sanitizeText(resolvedGoal?.confidence || goal?.confidenceLevel || "low", 20).toLowerCase() || "low";
  const targetHorizonWeeks = Number(resolvedGoal?.targetHorizonWeeks || goal?.targetHorizonWeeks || 0) || null;
  const primaryMetric = resolvedGoal?.primaryMetric || goal?.primaryMetric || null;
  const proxyMetrics = Array.isArray(resolvedGoal?.proxyMetrics)
    ? resolvedGoal.proxyMetrics
    : Array.isArray(goal?.proxyMetrics)
    ? goal.proxyMetrics
    : [];
  const missingAnchors = [];
  let primaryDomain = DOMAIN_ADAPTER_IDS.foundation;
  let secondaryDomains = [];
  let capabilityMix = [
    buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.5, "primary"),
    buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.25),
    buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.25),
  ];
  let fallbackPlanningMode = "foundation_then_specialize";

  if (structuredPrimaryDomain === DOMAIN_ADAPTER_IDS.triathlon || signals.triathlon) {
    primaryDomain = DOMAIN_ADAPTER_IDS.triathlon;
    secondaryDomains = dedupeStrings([
      DOMAIN_ADAPTER_IDS.swimming,
      DOMAIN_ADAPTER_IDS.cycling,
      DOMAIN_ADAPTER_IDS.running,
      signals.strength ? DOMAIN_ADAPTER_IDS.strength : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.eventPrep, 0.3, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.skill, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.15),
      buildCapability(GOAL_CAPABILITY_FAMILIES.maximalStrength, 0.1),
    ];
    fallbackPlanningMode = confidence === "low" ? "multisport_consistency_first" : "multisport_specific_progression";
    if (!/\b(sprint|olympic|70\.3|ironman)\b/.test(signals.text) && !primaryMetric) missingAnchors.push("race format or current multisport benchmark");
  } else if (structuredPrimaryDomain === DOMAIN_ADAPTER_IDS.cycling || (signals.cycling && !signals.swim && !signals.run)) {
    primaryDomain = DOMAIN_ADAPTER_IDS.cycling;
    secondaryDomains = dedupeStrings([
      signals.strength ? DOMAIN_ADAPTER_IDS.strength : "",
      signals.hybrid ? DOMAIN_ADAPTER_IDS.hybrid : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.4, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.thresholdEndurance, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.15),
    ];
    fallbackPlanningMode = confidence === "low" ? "cycling_base_first" : "cycling_specific_progression";
    if (!/\b(ride|bike|cycling|trainer|peloton)\b/.test(signals.text) && !primaryMetric) missingAnchors.push("recent ride anchor or riding access");
  } else if (structuredPrimaryDomain === DOMAIN_ADAPTER_IDS.swimming || signals.swim) {
    primaryDomain = DOMAIN_ADAPTER_IDS.swimming;
    secondaryDomains = dedupeStrings([
      signals.technique ? DOMAIN_ADAPTER_IDS.durability : "",
      signals.hybrid || signals.strength ? DOMAIN_ADAPTER_IDS.strength : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.eventPrep, 0.35, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.skill, 0.3),
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.15),
    ];
    fallbackPlanningMode = confidence === "low" ? "technique_and_aerobic_foundation" : "swim_specific_progression";
    if (!/\b(pool|open water|lake|ocean)\b/.test(signals.text)) missingAnchors.push("pool or swim-access reality");
    if (!/\b(mile|500|1000|1500|1\.2|2\.4|sprint|olympic|ironman)\b/.test(signals.text) && !primaryMetric) missingAnchors.push("event distance or current benchmark");
  } else if (signals.vertical || goalFamily === "athletic_power") {
    primaryDomain = DOMAIN_ADAPTER_IDS.power;
    secondaryDomains = dedupeStrings([
      DOMAIN_ADAPTER_IDS.strength,
      signals.durability ? DOMAIN_ADAPTER_IDS.durability : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.power, 0.35, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.elasticity, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.maximalStrength, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.2),
    ];
    fallbackPlanningMode = confidence === "low" ? "strength_and_tissue_foundation" : "power_progression";
    if (!primaryMetric) missingAnchors.push("jump benchmark or rim-touch anchor");
    if (!/\b(landing|tendon|achilles|knee|ankle)\b/.test(signals.text)) missingAnchors.push("tissue tolerance or landing history");
  } else if (structuredPrimaryDomain === DOMAIN_ADAPTER_IDS.running || signals.run || goal?.category === "running" || resolvedGoal?.planningCategory === "running") {
    primaryDomain = DOMAIN_ADAPTER_IDS.running;
    secondaryDomains = dedupeStrings([
      signals.strength || goalFamily === "hybrid" ? DOMAIN_ADAPTER_IDS.strength : "",
      signals.durability ? DOMAIN_ADAPTER_IDS.durability : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.eventPrep, 0.35, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.thresholdEndurance, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.15),
    ];
    fallbackPlanningMode = confidence === "low" ? "aerobic_foundation" : "race_specific_progression";
  } else if (goalFamily === "re_entry") {
    primaryDomain = DOMAIN_ADAPTER_IDS.durability;
    secondaryDomains = [DOMAIN_ADAPTER_IDS.foundation];
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.4, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.3),
      buildCapability(GOAL_CAPABILITY_FAMILIES.mobility, 0.15),
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.15),
    ];
    fallbackPlanningMode = "rebuild_then_specialize";
  } else if (signals.fatLoss || signals.appearance || goal?.category === "body_comp" || resolvedGoal?.planningCategory === "body_comp") {
    primaryDomain = DOMAIN_ADAPTER_IDS.bodyComp;
    secondaryDomains = dedupeStrings([
      signals.strength ? DOMAIN_ADAPTER_IDS.strength : "",
      signals.hybrid ? DOMAIN_ADAPTER_IDS.hybrid : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.bodyComp, 0.45, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.hypertrophy, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.15),
    ];
    fallbackPlanningMode = "adherence_first_recomposition";
  } else if (signals.strength || goal?.category === "strength" || resolvedGoal?.planningCategory === "strength") {
    primaryDomain = DOMAIN_ADAPTER_IDS.strength;
    secondaryDomains = dedupeStrings([
      signals.hybrid || signals.run ? DOMAIN_ADAPTER_IDS.hybrid : "",
      signals.durability ? DOMAIN_ADAPTER_IDS.durability : "",
    ].filter(Boolean));
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.maximalStrength, 0.4, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.hypertrophy, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.15),
    ];
    fallbackPlanningMode = "strength_foundation";
  } else if (signals.durability) {
    primaryDomain = DOMAIN_ADAPTER_IDS.durability;
    secondaryDomains = [DOMAIN_ADAPTER_IDS.foundation];
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.4, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.3),
      buildCapability(GOAL_CAPABILITY_FAMILIES.mobility, 0.15),
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.15),
    ];
    fallbackPlanningMode = "rebuild_then_specialize";
  } else if (signals.hybrid) {
    primaryDomain = DOMAIN_ADAPTER_IDS.hybrid;
    secondaryDomains = [DOMAIN_ADAPTER_IDS.strength, DOMAIN_ADAPTER_IDS.running];
    capabilityMix = [
      buildCapability(GOAL_CAPABILITY_FAMILIES.aerobicBase, 0.25, "primary"),
      buildCapability(GOAL_CAPABILITY_FAMILIES.maximalStrength, 0.25),
      buildCapability(GOAL_CAPABILITY_FAMILIES.consistency, 0.2),
      buildCapability(GOAL_CAPABILITY_FAMILIES.durability, 0.15),
      buildCapability(GOAL_CAPABILITY_FAMILIES.hypertrophy, 0.15),
    ];
    fallbackPlanningMode = "balanced_hybrid_foundation";
  }

  const candidateDomainAdapters = dedupeStrings([
    ...(Array.isArray(resolvedGoal?.candidateDomainAdapters) ? resolvedGoal.candidateDomainAdapters : []),
    primaryDomain,
    ...secondaryDomains,
    DOMAIN_ADAPTER_IDS.foundation,
  ]).slice(0, 5);

  return {
    goalId: goal?.id || "",
    rawUserIntent: sanitizeText(resolvedGoal?.rawIntent?.text || goal?.name || "", 220),
    normalizedSummary: sanitizeText(resolvedGoal?.summary || goal?.name || "Resolved goal", 160),
    goalFamily: sanitizeText(goalFamily || resolvedGoal?.planningCategory || goal?.category || "general_fitness", 40).toLowerCase(),
    planningCategory: sanitizeText(resolvedGoal?.planningCategory || goal?.category || "general_fitness", 40).toLowerCase(),
    primaryDomain,
    secondaryDomains,
    capabilityMix,
    primaryMetric,
    proxyMetrics,
    targetHorizonWeeks,
    targetEventContext: sanitizeText(resolvedGoal?.summary || goal?.measurableTarget || "", 160),
    hardConstraints: dedupeStrings(goal?.tradeoffs || resolvedGoal?.tradeoffs || []).slice(0, 4),
    equipmentAssumptions: [],
    scheduleAssumptions: [],
    confidence,
    missingAnchors: dedupeStrings([
      ...(resolvedGoal?.missingAnchors || []),
      ...(resolvedGoal?.unresolvedGaps || []),
      ...missingAnchors,
    ]).slice(0, 6),
    candidateDomainAdapters,
    fallbackPlanningMode,
    goalRole: sanitizeText(goal?.goalRole || resolvedGoal?.intakeConfirmedRole || "", 40).toLowerCase() || "primary",
  };
};

export const buildGoalCapabilityPacket = ({ goal = {} } = {}) => {
  const signals = detectCapabilitySignals(goal);
  return buildPacketFromSignals({ goal, signals });
};

export const resolveGoalCapabilityStack = ({ goals = [] } = {}) => {
  const safeGoals = Array.isArray(goals) ? goals.filter((goal) => goal?.active !== false) : [];
  const packets = safeGoals.map((goal) => buildGoalCapabilityPacket({ goal }));
  const primary = packets[0] || null;
  const supporting = packets.slice(1);
  return {
    packets,
    primary,
    supporting,
    dominantDomain: primary?.primaryDomain || DOMAIN_ADAPTER_IDS.foundation,
    supportingDomains: dedupeStrings(supporting.flatMap((packet) => [packet.primaryDomain, ...(packet.secondaryDomains || [])])).slice(0, 3),
  };
};
