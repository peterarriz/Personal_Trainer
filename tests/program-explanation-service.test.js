const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProgramInstance,
  createStyleSelection,
  getProgramDefinitionById,
  getStyleDefinitionById,
  PROGRAM_FIDELITY_MODES,
} = require("../src/services/program-catalog-service.ts");
const {
  buildPlanBasisExplanation,
  buildProgramCardExplanation,
  buildStyleCardExplanation,
} = require("../src/services/program-explanation-service.ts");

test("default explanation stays goal-driven when no program or style is active", () => {
  const explanation = buildPlanBasisExplanation({
    athleteProfile: {
      goals: [{ id: "g1", active: true, name: "Get stronger" }],
      userProfile: { daysPerWeek: 3 },
      trainingContext: { equipmentAccess: { items: ["dumbbells"] } },
    },
  });

  assert.equal(explanation.basisType, "default_goal_driven");
  assert.ok(/goal-driven default logic/i.test(explanation.basisSummary));
});

test("program explanation reflects adapted mode", () => {
  const programDefinition = getProgramDefinitionById("program_strength_foundation");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
    athleteProfile: { goals: [] },
  });

  const explanation = buildPlanBasisExplanation({
    athleteProfile: {
      goals: [{ id: "g1", active: true, category: "strength", name: "Get stronger" }],
      userProfile: { daysPerWeek: 3 },
      trainingContext: { equipmentAccess: { items: ["barbell", "rack"] } },
    },
    activeProgramInstance,
    programDefinition,
    compatibilityAssessment: {
      reasons: ["Your current schedule is lighter than the template's ideal weekly shape."],
      outcome: "caution",
    },
  });

  assert.equal(explanation.basisType, "program_adapted");
  assert.ok(explanation.basisSummary.includes("Strength Foundation"));
  assert.ok(explanation.caveats.length >= 1);
});

test("program plus style explanation remains explicit about both layers", () => {
  const programDefinition = getProgramDefinitionById("program_foundation_training");
  const styleDefinition = getStyleDefinitionById("style_athletic_recomp");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
    athleteProfile: { goals: [] },
  });
  const activeStyleSelection = createStyleSelection({
    styleDefinition,
  });

  const explanation = buildPlanBasisExplanation({
    athleteProfile: {
      goals: [{ id: "g1", active: true, category: "body_comp", name: "Lean out" }],
      userProfile: { daysPerWeek: 3 },
      trainingContext: { equipmentAccess: { items: ["dumbbells"] } },
    },
    activeProgramInstance,
    activeStyleSelection,
    programDefinition,
    styleDefinition,
    compatibilityAssessment: { outcome: "compatible", reasons: [] },
  });

  assert.equal(explanation.basisType, "program_plus_style");
  assert.ok(explanation.basisSummary.includes("Foundation Training"));
  assert.ok(explanation.basisSummary.includes("Athletic Recomp"));
});

test("card explanations expose source and confidence copy", () => {
  const programCard = buildProgramCardExplanation({
    programDefinition: getProgramDefinitionById("program_foundation_training"),
  });
  const styleCard = buildStyleCardExplanation({
    styleDefinition: getStyleDefinitionById("style_golden_era_hypertrophy"),
  });

  assert.ok(programCard.basisLine.length > 0);
  assert.ok(styleCard.confidenceLine.length > 0);
});
