const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSupportTierModel,
  resolveSupportTier,
} = require("../src/services/support-tier-service.js");
const {
  DOMAIN_ADAPTER_IDS,
} = require("../src/services/goal-capability-resolution-service.js");

test("swimming and power adapters stay tier 2 even when their planning packets use domain-specific fallback modes", () => {
  assert.equal(resolveSupportTier({
    goals: [{ active: true, name: "Swim a faster mile", category: "running" }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.swimming,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.swimming,
        fallbackPlanningMode: "technique_and_aerobic_foundation",
      },
    },
  }), "tier_2");

  assert.equal(resolveSupportTier({
    goals: [{ active: true, name: "Jump higher for basketball", category: "strength" }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.power,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.power,
        fallbackPlanningMode: "strength_and_tissue_foundation",
      },
    },
  }), "tier_2");
});

test("foundation-first unknown support stays exploratory when no stronger domain is active", () => {
  const tier = buildSupportTierModel({
    goals: [{ active: true, name: "Improve obstacle course fitness", category: "general_fitness" }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.foundation,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.foundation,
        fallbackPlanningMode: "foundation_then_specialize",
      },
    },
  });

  assert.equal(tier.id, "tier_3");
  assert.match(tier.honestyLine, /starting simple|getting sharper/i);
});

test("goal-free foundation mode remains tier 1", () => {
  const tier = buildSupportTierModel({
    goals: [],
    domainAdapterId: DOMAIN_ADAPTER_IDS.foundation,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.foundation,
        fallbackPlanningMode: "foundation_then_specialize",
      },
    },
  });

  assert.equal(tier.id, "tier_1");
  assert.match(tier.basisLine, /do not need a formal goal|strong first week/i);
});

test("re-entry and safe-rebuild goals stay tier 2 even when they share the general planner backbone", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      name: "Get back into consistent training shape",
      category: "general_fitness",
      resolvedGoal: {
        goalFamily: "re_entry",
        summary: "Get back into consistent training shape",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.durability,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.durability,
        fallbackPlanningMode: "rebuild_then_specialize",
      },
    },
  });

  assert.equal(tier.id, "tier_2");
  assert.match(tier.honestyLine, /conservative|signal gets cleaner/i);
});

test("appearance-only physique goals stay tier 2 even when they share the body-comp adapter", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      category: "body_comp",
      name: "Visible abs by August",
      resolvedGoal: {
        goalFamily: "appearance",
        planningCategory: "body_comp",
        summary: "Improve midsection definition by the target window",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.bodyComp,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.bodyComp,
        fallbackPlanningMode: "body_comp_conditioning",
      },
    },
  });

  assert.equal(tier.id, "tier_2");
  assert.match(tier.honestyLine, /conservative|signal gets cleaner/i);
  assert.match(tier.basisLine, /appearance|trackable markers/i);
});

test("numeric weight-loss goals remain tier 1 on the body-comp adapter", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      category: "body_comp",
      name: "Lose 15 lb",
      resolvedGoal: {
        goalFamily: "body_comp",
        planningCategory: "body_comp",
        summary: "Lose 15 lb",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.bodyComp,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.bodyComp,
        fallbackPlanningMode: "body_comp_conditioning",
      },
    },
  });

  assert.equal(tier.id, "tier_1");
});

test("hybrid support-tier copy stays honest about tradeoffs instead of sounding fully symmetric", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      category: "strength",
      name: "Run and lift with strength priority",
      resolvedGoal: {
        goalFamily: "hybrid",
        planningCategory: "strength",
        summary: "Run and lift with strength priority",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.hybrid,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.hybrid,
        fallbackPlanningMode: "run_lift_strength_priority",
      },
    },
  });

  assert.equal(tier.id, "tier_2");
  assert.match(tier.honestyLine, /one lane leads|supportive/i);
  assert.match(tier.basisLine, /tradeoff|lead lane|support/i);
});

test("triathlon support-tier copy makes the anchor requirement explicit", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      category: "general_fitness",
      name: "Train for triathlon or multisport",
      resolvedGoal: {
        goalFamily: "performance",
        planningCategory: "general_fitness",
        summary: "Train for triathlon or multisport",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.triathlon,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.triathlon,
        fallbackPlanningMode: "triathlon_beginner",
      },
    },
  });

  assert.equal(tier.id, "tier_2");
  assert.match(tier.honestyLine, /swim, bike, and run anchors|conservative multisport build/i);
  assert.match(tier.basisLine, /swim, bike, and run|conservative/i);
});

test("race-focused running degrades to tier 2 when explicit baseline signal context is still incomplete", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      category: "running",
      name: "Run a 1:45 half marathon",
      resolvedGoal: {
        goalFamily: "performance",
        planningCategory: "running",
        summary: "Run a 1:45 half marathon",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.running,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.running,
        fallbackPlanningMode: "race_prep_dominant",
      },
    },
    baselineSignals: {
      currentRunFrequency: true,
      longestRecentRun: false,
      recentPaceBaseline: false,
      targetTimeline: false,
    },
  });

  assert.equal(tier.id, "tier_2");
  assert.match(tier.honestyLine, /run frequency|benchmark|target window|conservative/i);
});

test("swim support degrades to tier 3 when swim anchor and access reality are still missing in a signaled context", () => {
  const tier = buildSupportTierModel({
    goals: [{
      active: true,
      category: "running",
      name: "Swim a faster mile",
      resolvedGoal: {
        goalFamily: "performance",
        planningCategory: "general_fitness",
        summary: "Swim a faster mile",
      },
    }],
    domainAdapterId: DOMAIN_ADAPTER_IDS.swimming,
    goalCapabilityStack: {
      primary: {
        primaryDomain: DOMAIN_ADAPTER_IDS.swimming,
        fallbackPlanningMode: "technique_and_aerobic_foundation",
      },
    },
    baselineSignals: {
      recentSwimAnchor: false,
      swimAccessReality: false,
    },
  });

  assert.equal(tier.id, "tier_3");
  assert.match(tier.honestyLine, /swim anchor|pool|open-water|start simple/i);
});
