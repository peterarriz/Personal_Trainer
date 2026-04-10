const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveGoalTranslation,
} = require("../src/services/goal-resolution-service.js");
const {
  GOAL_REALISM_STATUSES,
  applyFeasibilityPriorityOrdering,
  assessGoalFeasibility,
} = require("../src/services/goal-feasibility-service.js");

const buildIntakePacket = ({
  rawGoalText,
  trainingDaysPerWeek = 4,
  sessionLength = "45 min",
  timingConstraints = [],
  appearanceConstraints = [],
} = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background",
      experienceLevel: "Intermediate",
      fitnessLevel: "Intermediate",
    },
    scheduleReality: {
      trainingDaysPerWeek,
      sessionLength,
      trainingLocation: "Both",
    },
    equipmentAccessContext: {
      trainingLocation: "Both",
      equipment: ["Dumbbells", "Pull-up bar"],
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints,
      appearanceConstraints,
      additionalContext: "Find the balance",
    },
  },
});

test("compatible mixed goals stay realistic and keep low conflict when schedule support is strong", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "be a hybrid athlete",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "be a hybrid athlete",
      trainingDaysPerWeek: 5,
      sessionLength: "60 min",
    }),
    aiInterpretationProposal: {
      interpretedGoalType: "hybrid",
      measurabilityTier: "exploratory_fuzzy",
      timelineRealism: { status: "realistic", suggestedHorizonWeeks: 16 },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "consistent training" },
    scheduleReality: { trainingDaysPerWeek: 5, sessionLength: "60 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    now: "2026-04-10",
  });

  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.realistic);
  assert.deepEqual(feasibility.recommendedPriorityOrdering.map((item) => item.planningCategory), ["running", "strength"]);
  assert.equal(feasibility.conflictFlags[0].key, "hybrid_interference");
  assert.equal(feasibility.conflictFlags[0].severity, "low");
  assert.match(feasibility.suggestedSequencing[0].summary, /weekly split/i);
});

test("conflicting goals surface explicit conflict flags and recommend sequencing", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat but keep strength",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "lose fat but keep strength",
      trainingDaysPerWeek: 3,
      sessionLength: "30 min",
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "consistent training" },
    scheduleReality: { trainingDaysPerWeek: 3, sessionLength: "30 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    now: "2026-04-10",
  });
  const reordered = applyFeasibilityPriorityOrdering({
    resolvedGoals: resolution.resolvedGoals,
    feasibility,
  });

  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.aggressive);
  assert.ok(feasibility.conflictFlags.some((flag) => flag.key === "fat_loss_vs_strength"));
  assert.ok(feasibility.conflictFlags.some((flag) => flag.key === "limited_schedule_multi_goal_stack"));
  assert.match(feasibility.suggestedSequencing[0].summary, /body composition now/i);
  assert.equal(feasibility.recommendedPriorityOrdering[0].planningCategory, "body_comp");
  assert.equal(reordered[0].planningCategory, "body_comp");
  assert.equal(reordered[0].planningPriority, 1);
});

test("fuzzy appearance goals become exploratory with a realistic first-block outcome", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "look athletic again",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "look athletic again",
      appearanceConstraints: ["look athletic again"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "inconsistent lately" },
    scheduleReality: { trainingDaysPerWeek: 4, sessionLength: "45 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    now: "2026-04-10",
  });

  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.exploratory);
  assert.match(feasibility.realisticByTargetDate[0].summary, /next 30 days/i);
  assert.match(feasibility.longerHorizonNeeds[0].summary, /10\+ weeks/i);
  assert.match(feasibility.suggestedSequencing[0].summary, /first 30 days/i);
});

test("unrealistic deadline compression is flagged and pushed into a longer horizon", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 1:45 half marathon",
      trainingDaysPerWeek: 2,
      sessionLength: "20 min",
    }),
    explicitUserConfirmation: {
      confirmed: true,
      acceptedProposal: true,
      targetHorizonWeeks: 4,
    },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "beginner", currentBaseline: "restarting running" },
    scheduleReality: { trainingDaysPerWeek: 2, sessionLength: "20 min", trainingLocation: "Home" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    now: "2026-04-10",
  });

  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.unrealistic);
  assert.equal(feasibility.goalAssessments[0].realismStatus, GOAL_REALISM_STATUSES.unrealistic);
  assert.equal(feasibility.goalAssessments[0].minimumRealisticHorizonWeeks, 16);
  assert.match(feasibility.realisticByTargetDate[0].summary, /too compressed/i);
  assert.match(feasibility.longerHorizonNeeds[0].summary, /16\+ weeks/i);
});
