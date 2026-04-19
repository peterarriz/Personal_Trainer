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
    shortLabel: "High clarity",
    headline: "This plan can get specific",
    detail: "This goal has enough signal for clearer day-to-day guidance and faster adjustments.",
    coachLine: "The plan can be more specific here because the goal, anchors, and progress signals are already strong enough.",
  },
  [SUPPORT_TIER_LEVELS.tier2]: {
    id: SUPPORT_TIER_LEVELS.tier2,
    label: "Tier 2",
    shortLabel: "Good guidance",
    headline: "This plan can guide this well",
    detail: "The app can support this reliably, but it keeps a little more guardrail and asks for better anchors as you go.",
    coachLine: "This goal is supported well enough to be useful, but the app stays a bit more conservative at the edges.",
  },
  [SUPPORT_TIER_LEVELS.tier3]: {
    id: SUPPORT_TIER_LEVELS.tier3,
    label: "Tier 3",
    shortLabel: "Simple start",
    headline: "This plan will start simple",
    detail: "The app can get you moving safely here, then sharpen the plan as you add more signal.",
    coachLine: "This goal starts with a simpler version so the app can stay honest while it learns more from your setup and logs.",
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
    hasBodyComp: activeGoals.some((goal) => goal?.category === "body_comp" && goal?.resolvedGoal?.goalFamily !== "appearance")
      || /\b(fat loss|lose body fat|lose fat|lose weight|recomp|body comp)\b/.test(text),
    hasAppearance: activeGoals.some((goal) => goal?.resolvedGoal?.goalFamily === "appearance")
      || /\b(visible abs|six pack|body fat\s*(?:under|below|around|at|to)?\s*\d{1,2}(?:\.\d+)?\s*%|\d{1,2}(?:\.\d+)?\s*%\s*body fat|look athletic|physique|defined)\b/.test(text),
    hasSwim: /\b(swim|swimming|pool|open water)\b/.test(text),
    hasCycling: /\b(cycling|bike|biking|ride|riding|trainer|peloton)\b/.test(text),
    hasTriathlon: /\b(triathlon|multisport|sprint tri|olympic tri|70\.3|ironman)\b/.test(text),
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
    adapterId === DOMAIN_ADAPTER_IDS.bodyComp
    && signals.activeGoals.length > 0
    && signals.hasAppearance
    && !signals.hasBodyComp
    && !signals.hasRunning
    && !signals.hasStrength
    && !signals.hasSwim
    && !signals.hasCycling
    && !signals.hasTriathlon
    && !signals.hasPower
    && !signals.hasDurability
    && !signals.hasHybrid
  ) {
    return SUPPORT_TIER_LEVELS.tier2;
  }

  if (
    [
      DOMAIN_ADAPTER_IDS.foundation,
      DOMAIN_ADAPTER_IDS.strength,
      DOMAIN_ADAPTER_IDS.running,
      DOMAIN_ADAPTER_IDS.bodyComp,
      DOMAIN_ADAPTER_IDS.cycling,
    ].includes(adapterId)
  ) {
    return SUPPORT_TIER_LEVELS.tier1;
  }

  if (
    [
      DOMAIN_ADAPTER_IDS.swimming,
      DOMAIN_ADAPTER_IDS.triathlon,
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

  if (signals.hasSwim || signals.hasCycling || signals.hasTriathlon || signals.hasPower || signals.hasHybrid || signals.hasAppearance) {
    return SUPPORT_TIER_LEVELS.tier2;
  }

  return SUPPORT_TIER_LEVELS.tier3;
};

export const buildSupportTierModel = ({
  goals = [],
  domainAdapterId = "",
  goalCapabilityStack = null,
} = {}) => {
  const adapterId = String(domainAdapterId || goalCapabilityStack?.primary?.primaryDomain || "").trim();
  const fallbackMode = sanitizeText(goalCapabilityStack?.primary?.fallbackPlanningMode || "", 80).toLowerCase();
  const id = resolveSupportTier({
    goals,
    domainAdapterId,
    goalCapabilityStack,
  });
  const meta = SUPPORT_TIER_META[id] || SUPPORT_TIER_META[SUPPORT_TIER_LEVELS.tier3];
  const signals = collectGoalSignals(goals);
  const honestyLine = adapterId === DOMAIN_ADAPTER_IDS.hybrid
    ? "FORMA can guide hybrid training credibly, but it will not pretend every lane can peak at once. One lane leads and the other stays supportive."
    : adapterId === DOMAIN_ADAPTER_IDS.triathlon
    ? "FORMA can support a conservative multisport build here, but it gets more precise once your swim, bike, and run anchors are real."
    : adapterId === DOMAIN_ADAPTER_IDS.swimming
    ? "FORMA can coach swim structure here, but it gets sharper once your swim access and a recent benchmark are confirmed."
    : adapterId === DOMAIN_ADAPTER_IDS.durability
    ? "FORMA can support a careful return here, but it is not a rehab or medical plan. It stays conservative until your setup and logs show more tolerance."
    : adapterId === DOMAIN_ADAPTER_IDS.power
    ? "FORMA can guide jump and power work here, but it uses broader training signals rather than lab-grade power testing."
    : id === SUPPORT_TIER_LEVELS.tier1
    ? "The plan can be more specific here because your goal and inputs already give it a strong signal."
    : id === SUPPORT_TIER_LEVELS.tier2
    ? "The plan can support this credibly, but it will stay a little more conservative until the signal gets cleaner."
    : "The plan will stay useful by starting simple and getting sharper as you add more detail.";
  const basisLine = signals.activeGoals.length === 0
    ? "You do not need a formal goal to start. FORMA can still build a strong first week from your routine."
    : adapterId === DOMAIN_ADAPTER_IDS.hybrid
    ? "Hybrid plans stay believable by making the tradeoff visible. The lead lane gets the cleaner recovery while the other lane stays alive."
    : adapterId === DOMAIN_ADAPTER_IDS.triathlon
    ? "Triathlon starts with a conservative swim, bike, and run mix, then sharpens as those anchors get clearer."
    : adapterId === DOMAIN_ADAPTER_IDS.durability
    ? "Return-to-training plans bias finishable work first so week one is credible instead of optimistic."
    : signals.hasTriathlon
    ? "Triathlon starts with a balanced multisport build, then gets sharper as you confirm more swim, bike, and run anchors."
    : signals.hasCycling
    ? "Cycling gets its own endurance lane, so the plan can build around real riding instead of generic cardio."
    : signals.hasSwim
    ? "Swimming is supported, but it gets better once you add a benchmark and confirm your swim access."
    : signals.hasPower
    ? "Power goals are supported through a shared speed-and-power build rather than a one-off template."
    : signals.hasAppearance && !signals.hasBodyComp
    ? "Appearance goals work best when you pair them with trackable markers like waist, bodyweight, or photos."
    : id === SUPPORT_TIER_LEVELS.tier3 && fallbackMode
    ? "This starts as a broad first block, not a fake specialized plan. It gets sharper after you add better anchors and logs."
    : "The plan follows your main goal first and keeps the rest in support.";

  return {
    ...meta,
    honestyLine,
    basisLine,
  };
};
