const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGoalArbitrationStack } = require("../src/services/goal-arbitration-service.js");
const { resolveGoalTranslation } = require("../src/services/goal-resolution-service.js");
const {
  applyIntakeGoalStackConfirmation,
  buildIntakeGoalStackReviewModel,
  GOAL_STACK_ROLES,
} = require("../src/services/intake-goal-flow-service.js");

const buildIntakePacket = ({
  rawGoalText = "",
  trainingDaysPerWeek = 4,
  sessionLength = "45 min",
} = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background; 4 training days per week available",
    },
    scheduleReality: {
      trainingDaysPerWeek,
      sessionLength,
      trainingLocation: "Unknown",
    },
    equipmentAccessContext: {
      trainingLocation: "Unknown",
      equipment: [],
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints: [],
      appearanceConstraints: [],
      additionalContext: "Find the balance",
    },
  },
});

const resolvePrimaryGoal = (rawGoalText, packet = buildIntakePacket({ rawGoalText })) => resolveGoalTranslation({
  rawUserGoalIntent: rawGoalText,
  typedIntakePacket: packet,
  explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
  now: "2026-04-11",
});

test("event goal plus strength and appearance goals resolve into lead, maintained, and background lanes", () => {
  const packet = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" });
  const resolution = resolvePrimaryGoal("run a 1:45 half marathon", packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    additionalGoalTexts: ["bench 225", "get a six pack"],
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  const primary = arbitration.goals.find((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.primary);
  const maintained = arbitration.goals.find((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.maintained);
  const background = arbitration.goals.find((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.background);

  assert.equal(primary?.planningCategory, "running");
  assert.equal(maintained?.planningCategory, "strength");
  assert.equal(background?.goalFamily, "appearance");
  assert.match(background?.goalArbitrationReason || "", /check-ins|background/i);
});

test("body-comp goal plus maintained strength keeps strength in the maintained lane", () => {
  const packet = buildIntakePacket({ rawGoalText: "lose 20 lb" });
  const resolution = resolvePrimaryGoal("lose 20 lb", packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    additionalGoalTexts: ["keep strength"],
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  const maintained = arbitration.goals.find((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.maintained);

  assert.equal(arbitration.goals[0].planningCategory, "body_comp");
  assert.equal(maintained?.planningCategory, "strength");
  assert.equal(arbitration.deferredGoalIds.length, 0);
});

test("strength goal plus aesthetic secondary keeps the aesthetic lane as background support", () => {
  const packet = buildIntakePacket({ rawGoalText: "bench 315" });
  const resolution = resolvePrimaryGoal("bench 315", packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    additionalGoalTexts: ["get bigger shoulders"],
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  const background = arbitration.goals.find((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.background);

  assert.equal(arbitration.goals[0].planningCategory, "strength");
  assert.ok(background);
  assert.match(background.summary, /shoulders|get bigger shoulders/i);
});

test("too many competing hard goals defer some lanes on a tight schedule", () => {
  const packet = buildIntakePacket({
    rawGoalText: "run a 1:45 half marathon",
    trainingDaysPerWeek: 3,
    sessionLength: "30 min",
  });
  const resolution = resolvePrimaryGoal("run a 1:45 half marathon", packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    additionalGoalTexts: ["bench 315", "lose 20 lb", "run a sub-20 5k"],
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  assert.equal(arbitration.goals[0].planningCategory, "running");
  assert.ok(arbitration.deferredGoalIds.length >= 2);
  assert.ok(arbitration.goals.some((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.deferred));
});

test("review keeps background and later goals visible while planner-facing confirmation keeps only lead and maintained lanes", () => {
  const packet = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" });
  const resolution = resolvePrimaryGoal("run a 1:45 half marathon", packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    additionalGoalTexts: ["bench 225", "get a six pack"],
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals: arbitration.goals,
    goalResolution: resolution,
    goalFeasibility: null,
    goalStackConfirmation: null,
  });
  const confirmedStack = applyIntakeGoalStackConfirmation({
    resolvedGoals: arbitration.goals,
    goalStackConfirmation: null,
    goalFeasibility: null,
  });

  assert.equal(review.activeGoals.length, 2);
  assert.equal(review.backgroundGoals.length, 1);
  assert.equal(review.deferredGoals.length, 0);
  assert.deepEqual(confirmedStack.map((goal) => goal.planningCategory), ["running", "strength"]);
});
