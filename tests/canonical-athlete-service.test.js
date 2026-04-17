const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCanonicalAthleteState,
  inferNormalizedGoalPriority,
  normalizeGoals,
} = require("../src/services/canonical-athlete-service.js");

test("legacy goal roles migrate into a stable numeric priority order", () => {
  const normalized = normalizeGoals([
    { name: "Race day", goalArbitrationRole: "primary" },
    { name: "Keep strength", goalArbitrationRole: "maintained" },
    { name: "Lean out", goalArbitrationRole: "background" },
    { name: "Swim confidence", goalArbitrationRole: "deferred" },
    { name: "Mobility", intakeConfirmedRole: "deferred" },
  ]);

  assert.deepEqual(
    normalized.map((goal) => ({ name: goal.name, priority: goal.priority })),
    [
      { name: "Race day", priority: 1 },
      { name: "Keep strength", priority: 2 },
      { name: "Lean out", priority: 3 },
      { name: "Swim confidence", priority: 4 },
      { name: "Mobility", priority: 5 },
    ]
  );
});

test("explicit numeric priority still wins over legacy role fallback", () => {
  assert.equal(
    inferNormalizedGoalPriority({
      priority: 7,
      goalArbitrationRole: "primary",
    }, 0),
    7
  );
});

test("canonical athlete state carries nutrition style and preferred cuisines from settings", () => {
  const canonical = deriveCanonicalAthleteState({
    goals: [{ name: "Half marathon PR", category: "running", active: true, priority: 1 }],
    personalization: {
      nutritionPreferenceState: {
        style: "high carb performance",
        preferredMeals: ["overnight oats"],
        preferredCuisines: ["mexican", "mediterranean", "mexican"],
      },
      profile: { name: "Peter" },
    },
  });

  assert.equal(canonical.userProfile.preferences.nutritionStyle, "high carb performance");
  assert.deepEqual(canonical.userProfile.preferences.preferredMeals, ["overnight oats"]);
  assert.deepEqual(canonical.userProfile.preferences.preferredCuisines, ["mexican", "mediterranean"]);
});
