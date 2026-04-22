const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalDriverProfile,
  normalizeGoalDriverProfile,
} = require("../src/services/goal-driver-graph-service.js");

test("bench goals expose shoulder, triceps, and upper-back support drivers", () => {
  const profile = buildGoalDriverProfile({
    goal: {
      name: "Bench 225",
      category: "strength",
      resolvedGoal: {
        planningCategory: "strength",
        goalFamily: "strength",
        primaryMetric: { key: "bench_press_weight", label: "Bench press", targetValue: "225" },
      },
    },
  });

  assert.equal(profile.primaryOutcomeId, "bench_press_strength");
  assert.ok(profile.supportDrivers.some((driver) => driver.id === "anterior_delt_strength"));
  assert.ok(profile.supportDrivers.some((driver) => driver.id === "triceps_strength"));
  assert.ok(profile.supportDrivers.some((driver) => driver.id === "upper_back_stability"));
});

test("swim goals expose dryland support drivers without pretending dryland replaces the pool", () => {
  const profile = buildGoalDriverProfile({
    goal: {
      name: "Swim a faster mile",
      category: "general_fitness",
      resolvedGoal: {
        planningCategory: "general_fitness",
        primaryDomain: "swimming_endurance_technique",
        goalFamily: "performance",
      },
    },
  });

  assert.equal(profile.primaryDomain, "swimming_endurance_technique");
  assert.ok(profile.supportDrivers.some((driver) => driver.id === "lat_strength"));
  assert.ok(profile.supportDrivers.some((driver) => driver.id === "scapular_control"));
  assert.match((profile.transferNotes || []).join(" "), /never replaces pool time/i);
});

test("normalized driver profiles keep only durable consumer-safe fields", () => {
  const profile = normalizeGoalDriverProfile({
    version: "custom",
    primaryDomain: "strength_hypertrophy",
    primaryOutcomeId: "bench_press_strength",
    primaryOutcomeLabel: "Bench press strength",
    focusLabel: "Bench support graph",
    directDrivers: [{ id: "horizontal_press_strength", label: "Horizontal pressing strength", weight: 2, rationale: "Heavy pressing still has to move." }],
    supportDrivers: [{ id: "triceps_strength", label: "Triceps strength", weight: 0.2, rationale: "Lockout support." }],
    protectiveDrivers: [{ id: "shoulder_tolerance", label: "Shoulder tolerance", weight: 0.15 }],
    transferNotes: ["Keep support work tied to the main outcome."],
  });

  assert.equal(profile.directDrivers[0].weight, 1);
  assert.equal(profile.supportDrivers[0].id, "triceps_strength");
  assert.equal(profile.protectiveDrivers[0].id, "shoulder_tolerance");
});
