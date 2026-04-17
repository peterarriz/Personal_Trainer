const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getProgramDefinitionById,
  getStyleDefinitionById,
  PROGRAM_FIDELITY_MODES,
} = require("../src/services/program-catalog-service.ts");
const {
  assessProgramCompatibility,
  assessStyleCompatibility,
  COMPATIBILITY_OUTCOMES,
} = require("../src/services/program-compatibility-service.ts");

const buildAthleteProfile = ({
  goals = [],
  daysPerWeek = 3,
  experienceLevel = "beginner",
  equipmentItems = [],
  equipmentValue = "mixed",
} = {}) => ({
  goals,
  userProfile: {
    daysPerWeek,
    experienceLevel,
    equipmentAccess: equipmentItems,
  },
  trainingContext: {
    environment: { value: "gym" },
    equipmentAccess: {
      value: equipmentValue,
      items: equipmentItems,
    },
  },
});

test("running user with enough frequency gets a clean half-marathon base assessment", () => {
  const program = getProgramDefinitionById("program_half_marathon_base");
  const athleteProfile = buildAthleteProfile({
    goals: [{ id: "g1", active: true, category: "running", name: "Half marathon base" }],
    daysPerWeek: 4,
    experienceLevel: "beginner",
    equipmentItems: ["treadmill"],
  });

  const assessment = assessProgramCompatibility({
    programDefinition: program,
    athleteProfile,
    personalization: { injuryPainState: { level: "none" } },
    goals: athleteProfile.goals,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });

  assert.equal(assessment.outcome, COMPATIBILITY_OUTCOMES.compatible);
  assert.equal(assessment.blockedConstraints.length, 0);
});

test("powerbuilding strict mode blocks a two-day beginner with no full gym", () => {
  const program = getProgramDefinitionById("program_powerbuilding_builder");
  const athleteProfile = buildAthleteProfile({
    goals: [{ id: "g1", active: true, category: "strength", name: "Get stronger" }],
    daysPerWeek: 2,
    experienceLevel: "beginner",
    equipmentItems: ["dumbbells"],
    equipmentValue: "dumbbells",
  });

  const assessment = assessProgramCompatibility({
    programDefinition: program,
    athleteProfile,
    personalization: { injuryPainState: { level: "none" } },
    goals: athleteProfile.goals,
    fidelityMode: PROGRAM_FIDELITY_MODES.runAsWritten,
  });

  assert.equal(assessment.outcome, COMPATIBILITY_OUTCOMES.incompatible);
  assert.ok(assessment.blockedConstraints.some((line) => /full gym|sessions/i.test(line)));
});

test("style layering is blocked when a program is already being used as the style layer", () => {
  const style = getStyleDefinitionById("style_athletic_recomp");
  const programAsStyleInstance = {
    fidelityMode: PROGRAM_FIDELITY_MODES.useAsStyle,
    programDefinitionId: "program_foundation_training",
  };

  const assessment = assessStyleCompatibility({
    styleDefinition: style,
    athleteProfile: buildAthleteProfile({
      goals: [{ id: "g1", active: true, category: "body_comp", name: "Lean out" }],
    }),
    goals: [{ id: "g1", active: true, category: "body_comp", name: "Lean out" }],
    activeProgramInstance: programAsStyleInstance,
  });

  assert.equal(assessment.outcome, COMPATIBILITY_OUTCOMES.incompatible);
  assert.ok(assessment.blockedConstraints[0].includes("style layer"));
});

test("shoulder pain does not make a running plan incompatible by default", () => {
  const program = getProgramDefinitionById("program_half_marathon_base");
  const athleteProfile = buildAthleteProfile({
    goals: [{ id: "g1", active: true, category: "running", name: "Half marathon base" }],
    daysPerWeek: 4,
    experienceLevel: "beginner",
    equipmentItems: ["treadmill"],
  });

  const assessment = assessProgramCompatibility({
    programDefinition: program,
    athleteProfile,
    personalization: { injuryPainState: { level: "moderate_pain", area: "Shoulder" } },
    goals: athleteProfile.goals,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });

  assert.notEqual(assessment.outcome, COMPATIBILITY_OUTCOMES.incompatible);
  assert.equal(assessment.blockedConstraints.length, 0);
});

test("ankle pain blocks running plans that depend on impact tolerance", () => {
  const program = getProgramDefinitionById("program_half_marathon_base");
  const athleteProfile = buildAthleteProfile({
    goals: [{ id: "g1", active: true, category: "running", name: "Half marathon base" }],
    daysPerWeek: 4,
    experienceLevel: "beginner",
    equipmentItems: ["treadmill"],
  });

  const assessment = assessProgramCompatibility({
    programDefinition: program,
    athleteProfile,
    personalization: { injuryPainState: { level: "moderate_pain", area: "Ankle" } },
    goals: athleteProfile.goals,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });

  assert.equal(assessment.outcome, COMPATIBILITY_OUTCOMES.incompatible);
  assert.ok(assessment.blockedConstraints.some((line) => /ankle|running|impact/i.test(line)));
});
