import { DOMAIN_ADAPTER_IDS } from "./goal-capability-resolution-service.js";

const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const SUPPORT_TIER_LEVELS = Object.freeze({
  tier1: "tier_1",
  tier2: "tier_2",
  tier3: "tier_3",
});

export const SUPPORT_TIER_META = Object.freeze({
  [SUPPORT_TIER_LEVELS.tier1]: {
    id: SUPPORT_TIER_LEVELS.tier1,
    label: "Tier 1",
    shortLabel: "First-class",
    headline: "First-class support",
    detail: "This goal family has a stronger deterministic backbone, clearer metrics, and tighter adaptation rules.",
    coachLine: "This is a first-class lane, so the plan can be more specific and adaptation rules can be more confident.",
  },
  [SUPPORT_TIER_LEVELS.tier2]: {
    id: SUPPORT_TIER_LEVELS.tier2,
    label: "Tier 2",
    shortLabel: "Bounded",
    headline: "Bounded but meaningful support",
    detail: "This goal family is supported through shared planning rules with a narrower adapter and more guardrails.",
    coachLine: "This lane is supported well enough to be useful, but the app stays more conservative about edge-case specificity.",
  },
  [SUPPORT_TIER_LEVELS.tier3]: {
    id: SUPPORT_TIER_LEVELS.tier3,
    label: "Tier 3",
    shortLabel: "Exploratory",
    headline: "Exploratory fallback support",
    detail: "The app can map this goal into a safe shared training mode, but it should stay honest about uncertainty and missing metrics.",
    coachLine: "This lane uses the nearest safe shared support mode instead of pretending the app has sport-specific mastery.",
  },
});

const collectGoalSignals = (goals = []) => {
  const activeGoals = (Array.isArray(goals) ? goals : []).filter((goal) => goal?.active !== false);
  const text = activeGoals.map((goal) => (
    sanitizeText(
      goal?.resolvedGoal?.summary
      || goal?.name
      || goal?.resolvedGoal?.primaryMetric?.label
      || "",
      160
    ).toLowerCase()
  )).join(" ");
  return {
    activeGoals,
    text,
    hasRunning: activeGoals.some((goal) => goal?.category === "running") || /\b(run|marathon|half marathon|10k|5k)\b/.test(text),
    hasStrength: activeGoals.some((goal) => goal?.category === "strength") || /\b(bench|deadlift|squat|stronger|strength)\b/.test(text),
    hasBodyComp: activeGoals.some((goal) => goal?.category === "body_comp") || /\b(fat loss|lean|recomp|body comp|physique|look athletic)\b/.test(text),
    hasSwim: /\b(swim|swimming|pool|open water)\b/.test(text),
    hasPower: activeGoals.some((goal) => goal?.resolvedGoal?.goalFamily === "athletic_power") || /\b(vertical|jump|dunk|explosive|power)\b/.test(text),
    hasDurability: activeGoals.some((goal) => goal?.category === "injury_prevention" || goal?.resolvedGoal?.goalFamily === "re_entry") || /\b(rehab|durability|prehab|return to training|rebuild|postpartum|recover)\b/.test(text),
    hasHybrid: /\b(hybrid|multi-domain|split focus)\b/.test(text),
  };
};

export const resolveSupportTier = ({
  goals = [],
  domainAdapterId = "",
  goalCapabilityStack = null,
} = {}) => {
  const adapterId = String(domainAdapterId || goalCapabilityStack?.primary?.primaryDomain || "").trim();
  const signals = collectGoalSignals(goals);
  const fallbackMode = sanitizeText(goalCapabilityStack?.primary?.fallbackPlanningMode || "", 80).toLowerCase();

  if (
    adapterId === DOMAIN_ADAPTER_IDS.foundation
    && signals.activeGoals.length > 0
    && fallbackMode
    && !signals.hasRunning
    && !signals.hasStrength
    && !signals.hasBodyComp
    && !signals.hasSwim
    && !signals.hasPower
    && !signals.hasDurability
    && !signals.hasHybrid
  ) {
    return SUPPORT_TIER_LEVELS.tier3;
  }

  if (
    [
      DOMAIN_ADAPTER_IDS.foundation,
      DOMAIN_ADAPTER_IDS.strength,
      DOMAIN_ADAPTER_IDS.running,
      DOMAIN_ADAPTER_IDS.bodyComp,
    ].includes(adapterId)
  ) {
    return SUPPORT_TIER_LEVELS.tier1;
  }

  if (
    [
      DOMAIN_ADAPTER_IDS.swimming,
      DOMAIN_ADAPTER_IDS.power,
      DOMAIN_ADAPTER_IDS.durability,
      DOMAIN_ADAPTER_IDS.hybrid,
    ].includes(adapterId)
  ) {
    return SUPPORT_TIER_LEVELS.tier2;
  }

  if (signals.hasDurability) {
    return SUPPORT_TIER_LEVELS.tier2;
  }

  if (signals.hasRunning || signals.hasStrength || signals.hasBodyComp) {
    return SUPPORT_TIER_LEVELS.tier1;
  }

  if (signals.hasSwim || signals.hasPower || signals.hasHybrid) {
    return SUPPORT_TIER_LEVELS.tier2;
  }

  return SUPPORT_TIER_LEVELS.tier3;
};

export const buildSupportTierModel = ({
  goals = [],
  domainAdapterId = "",
  goalCapabilityStack = null,
} = {}) => {
  const id = resolveSupportTier({
    goals,
    domainAdapterId,
    goalCapabilityStack,
  });
  const meta = SUPPORT_TIER_META[id] || SUPPORT_TIER_META[SUPPORT_TIER_LEVELS.tier3];
  const signals = collectGoalSignals(goals);
  const honestyLine = id === SUPPORT_TIER_LEVELS.tier1
    ? "The planner can be more specific here because the adapter, metrics, and adaptation rules are stronger."
    : id === SUPPORT_TIER_LEVELS.tier2
    ? "The planner can support this credibly, but it keeps more guardrails and relies on cleaner anchors."
    : "The planner will stay useful by falling back to safer shared rules and by surfacing uncertainty instead of bluffing.";
  const basisLine = signals.activeGoals.length === 0
    ? "No explicit goal is required. Foundation mode is still a supported Tier 1 entry path."
    : signals.hasSwim
    ? "Swimming is handled through the shared planner with a narrower adapter and more explicit metric honesty."
    : signals.hasPower
    ? "Vertical and power goals are handled through the shared power adapter instead of a one-off planner."
    : "Support tier follows the dominant goal family and the active domain adapter.";

  return {
    ...meta,
    honestyLine,
    basisLine,
  };
};
