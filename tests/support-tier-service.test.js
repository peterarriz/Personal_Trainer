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
  assert.match(tier.honestyLine, /falling back to safer shared rules/i);
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
  assert.match(tier.basisLine, /No explicit goal is required/i);
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
  assert.match(tier.honestyLine, /guardrails/i);
});
