const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildIntakeGoalReviewModel,
  buildRawGoalIntentFromAnswers,
  getNextIntakeClarifyingQuestion,
  resolveCompatibilityPrimaryGoalKey,
} = require("../src/services/intake-goal-flow-service.js");
const {
  resolveGoalTranslation,
  GOAL_MEASURABILITY_TIERS,
} = require("../src/services/goal-resolution-service.js");
const {
  assessGoalFeasibility,
  applyFeasibilityPriorityOrdering,
} = require("../src/services/goal-feasibility-service.js");

const buildIntakePacket = (rawGoalText) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background; 4 training days per week available",
    },
    scheduleReality: {
      trainingDaysPerWeek: 4,
      sessionLength: "45 min",
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

test("buildRawGoalIntentFromAnswers keeps raw user intent and clarification notes together", () => {
  const rawIntent = buildRawGoalIntentFromAnswers({
    answers: {
      goal_intent: "look athletic again",
      goal_clarification_notes: [
        { question: "What does athletic mean to you right now?", answer: "leaner waist and visible abs" },
      ],
      timeline_adjustment: "by late summer",
    },
    fallbackLabel: "General Fitness",
  });

  assert.match(rawIntent, /look athletic again/i);
  assert.match(rawIntent, /leaner waist and visible abs/i);
  assert.match(rawIntent, /late summer/i);
});

test("resolveCompatibilityPrimaryGoalKey falls back to the confirmed resolved goal category", () => {
  assert.equal(resolveCompatibilityPrimaryGoalKey({
    explicitPrimaryGoalKey: "",
    resolvedGoal: { planningCategory: "running" },
  }), "endurance");

  assert.equal(resolveCompatibilityPrimaryGoalKey({
    explicitPrimaryGoalKey: "",
    resolvedGoal: { planningCategory: "body_comp" },
  }), "fat_loss");
});

test("review model surfaces proxy tracking and missing info for vague appearance goals", () => {
  const rawGoalText = "look athletic again";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, source: "intake_preview" },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: buildIntakePacket(rawGoalText).intake.baselineContext,
    scheduleReality: buildIntakePacket(rawGoalText).intake.scheduleReality,
    currentExperienceContext: {
      injuryConstraintContext: buildIntakePacket(rawGoalText).intake.injuryConstraintContext,
      equipmentAccessContext: buildIntakePacket(rawGoalText).intake.equipmentAccessContext,
    },
    now: "2026-04-11",
  });
  const orderedResolvedGoals = applyFeasibilityPriorityOrdering({
    resolvedGoals: goalResolution.resolvedGoals,
    feasibility: goalFeasibility,
  });

  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals,
    goalFeasibility,
    aiInterpretationProposal: {
      interpretedGoalType: "appearance",
      missingClarifyingQuestions: ["What would make this feel visibly successful in the next 30 days?"],
    },
  });

  assert.equal(reviewModel.measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.ok(reviewModel.trackingLabels.some((label) => /waist/i.test(label)));
  assert.ok(reviewModel.unresolvedItems.length >= 1);
  assert.equal(reviewModel.clarifyingQuestions[0], "What would make this feel visibly successful in the next 30 days?");
});

test("next clarifying question skips ones already asked", () => {
  const question = getNextIntakeClarifyingQuestion({
    reviewModel: {
      clarifyingQuestions: [
        "Need a target race date or horizon to time the block structure precisely.",
        "What race are you aiming for?",
      ],
    },
    askedQuestions: ["Need a target race date or horizon to time the block structure precisely."],
    maxQuestions: 2,
  });

  assert.equal(question, "What race are you aiming for?");
});
