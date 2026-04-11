const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeGoalAdjustment,
  applyIntakeGoalStackConfirmation,
  buildIntakeGoalStackReviewModel,
  buildIntakeGoalReviewModel,
  buildRawGoalIntentFromAnswers,
  GOAL_STACK_ROLES,
  getNextIntakeClarifyingQuestion,
  resolveCompatibilityPrimaryGoalKey,
} = require("../src/services/intake-goal-flow-service.js");
const {
  resolveGoalTranslation,
  GOAL_MEASURABILITY_TIERS,
  applyResolvedGoalsToGoalSlots,
} = require("../src/services/goal-resolution-service.js");
const {
  GOAL_FEASIBILITY_ACTIONS,
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

const DEFAULT_GOAL_SLOTS = [
  { id: "g_primary", name: "Primary goal", type: "ongoing", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "progress_tracker" } },
  { id: "g_secondary_1", name: "Secondary goal 1", type: "ongoing", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "weekly_checkin", unit: "lb" } },
  { id: "g_secondary_2", name: "Secondary goal 2", type: "ongoing", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "logged_lifts", unit: "lb" } },
  { id: "g_resilience", name: "Resilience", type: "ongoing", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true, tracking: { mode: "progress_tracker" } },
];

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

  assert.equal(resolveCompatibilityPrimaryGoalKey({
    explicitPrimaryGoalKey: "fat_loss",
    resolvedGoal: { planningCategory: "running" },
  }), "endurance");
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
    answers: {},
  });

  assert.equal(reviewModel.measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.ok(reviewModel.trackingLabels.some((label) => /waist/i.test(label)));
  assert.ok(reviewModel.unresolvedItems.length >= 1);
  assert.equal(reviewModel.isPlannerReady, false);
  assert.match(reviewModel.clarifyingQuestions[0], /current bodyweight, waist, or progress photos/i);
  assert.ok(reviewModel.clarifyingQuestions.includes("What would make this feel visibly successful in the next 30 days?"));
});

test("review model asks for race timing when a measurable event goal is still missing a horizon", () => {
  const rawGoalText = "run a 1:45 half marathon";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, source: "intake_preview" },
    now: "2026-04-11",
  });

  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility: { realismStatus: "realistic" },
    aiInterpretationProposal: null,
    answers: {},
  });

  assert.equal(reviewModel.clarifyingQuestions[0], "What's the race date or target month?");
});

test("review model stays not-ready when realism blocks confirmation even after completeness is satisfied", () => {
  const rawGoalText = "bench 225";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, targetHorizonWeeks: 6, source: "intake_preview" },
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
    intakeCompleteness: {
      facts: {
        currentStrengthBaseline: { text: "135 x 3", weight: 135, reps: 3 },
      },
      missingRequired: [],
      missingOptional: [],
    },
    now: "2026-04-11",
  });

  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility,
    answers: {
      intake_completeness: {
        fields: {
          current_strength_baseline: { raw: "135 x 3", value: 135, weight: 135, reps: 3 },
        },
      },
    },
  });

  assert.equal(reviewModel.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(reviewModel.isPlannerReady, false);
  assert.match(reviewModel.recommendedRevisionSummary, /135|225/i);
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

  assert.equal(question.prompt, "What race are you aiming for?");
});

test("late-stage goal edit from body-comp to event goal clears stale proxy context and leaves confirmation on the latest resolved state only", () => {
  const adjusted = applyIntakeGoalAdjustment({
    answers: {
      goal_intent: "lose fat but keep strength",
      primary_goal: "fat_loss",
      timeline_adjustment: "by late summer",
      timeline_feedback: "leaner waist",
      goal_clarification_notes: [
        { question: "What would make this feel visibly successful in the next 30 days?", answer: "leaner waist and abs" },
      ],
      other_goals: "keep strength",
    },
    adjustmentText: "Actually, I want to run a 1:45 half marathon",
    currentResolvedGoal: { planningCategory: "body_comp", summary: "Lose fat while keeping strength" },
    currentPrimaryGoalKey: "fat_loss",
    now: "2026-04-11",
  });

  assert.equal(adjusted.kind, "goal_replacement");
  assert.equal(adjusted.answers.goal_intent, "run a 1:45 half marathon");
  assert.deepEqual(adjusted.answers.goal_clarification_notes, []);
  assert.equal(adjusted.answers.timeline_feedback, "");
  assert.equal(adjusted.answers.timeline_adjustment, "");

  const rawGoalText = buildRawGoalIntentFromAnswers({ answers: adjusted.answers, fallbackLabel: "" });
  assert.doesNotMatch(rawGoalText, /waist|abs|lose fat|keep strength/i);

  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const slottedGoals = applyResolvedGoalsToGoalSlots({
    resolvedGoals: resolution.resolvedGoals,
    goalSlots: DEFAULT_GOAL_SLOTS,
  });

  assert.equal(resolution.resolvedGoals[0].planningCategory, "running");
  assert.equal(resolveCompatibilityPrimaryGoalKey({
    explicitPrimaryGoalKey: adjusted.answers.primary_goal,
    resolvedGoal: resolution.resolvedGoals[0],
  }), "endurance");
  assert.equal(slottedGoals[0].category, "running");
  assert.ok(!resolution.tradeoffs.some((item) => /fat loss/i.test(item)));
});

test("late-stage goal edit from event goal to vague aesthetic goal clears stale race context", () => {
  const adjusted = applyIntakeGoalAdjustment({
    answers: {
      goal_intent: "run a 1:45 half marathon",
      primary_goal: "endurance",
      timeline_feedback: "October race",
      goal_clarification_notes: [
        { question: "What's the race date or target month?", answer: "October" },
      ],
    },
    adjustmentText: "Actually, I just want to look athletic again",
    currentResolvedGoal: { planningCategory: "running", summary: "Run a half marathon in 1:45:00" },
    currentPrimaryGoalKey: "endurance",
    now: "2026-04-11",
  });

  assert.equal(adjusted.kind, "goal_replacement");
  assert.equal(adjusted.answers.goal_intent, "look athletic again");
  assert.deepEqual(adjusted.answers.goal_clarification_notes, []);

  const rawGoalText = buildRawGoalIntentFromAnswers({ answers: adjusted.answers, fallbackLabel: "" });
  assert.doesNotMatch(rawGoalText, /half marathon|race|october|1:45/i);

  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(resolution.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(resolution.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(resolution.resolvedGoals[0].primaryMetric, null);
  assert.ok(resolution.resolvedGoals[0].proxyMetrics.some((metric) => /waist|bodyweight|progress/i.test(metric.label)));
});

test("primary body-comp plus maintained strength stays explicit in the confirmed goal stack", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat but keep strength",
    typedIntakePacket: buildIntakePacket("lose fat but keep strength"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const confirmedStack = applyIntakeGoalStackConfirmation({
    resolvedGoals: resolution.resolvedGoals,
    goalStackConfirmation: {
      primaryGoalId: resolution.resolvedGoals[0].id,
      rolesByGoalId: {
        [resolution.resolvedGoals[1].id]: GOAL_STACK_ROLES.maintained,
      },
    },
  });
  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals: resolution.resolvedGoals,
    goalResolution: resolution,
    goalFeasibility: { conflictFlags: [{ summary: "Aggressive fat loss can limit strength progression." }] },
    goalStackConfirmation: {
      primaryGoalId: resolution.resolvedGoals[0].id,
      rolesByGoalId: {
        [resolution.resolvedGoals[1].id]: GOAL_STACK_ROLES.maintained,
      },
      keepResiliencePriority: true,
    },
  });

  assert.equal(confirmedStack[0].planningCategory, "body_comp");
  assert.equal(confirmedStack[0].intakeConfirmedRole, GOAL_STACK_ROLES.primary);
  assert.equal(confirmedStack[1].planningCategory, "strength");
  assert.equal(confirmedStack[1].intakeConfirmedRole, GOAL_STACK_ROLES.maintained);
  assert.equal(review.activeGoals[0].roleLabel, "Primary");
  assert.equal(review.activeGoals[1].roleLabel, "Maintained");
  assert.ok(review.primaryTradeoff.length > 0);
});

test("primary race goal plus maintained strength stays explicit in the confirmed goal stack", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon but keep strength",
    typedIntakePacket: buildIntakePacket("run a 1:45 half marathon but keep strength"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const confirmedStack = applyIntakeGoalStackConfirmation({
    resolvedGoals: resolution.resolvedGoals,
    goalStackConfirmation: {
      primaryGoalId: resolution.resolvedGoals[0].id,
      rolesByGoalId: {
        [resolution.resolvedGoals[1].id]: GOAL_STACK_ROLES.maintained,
      },
    },
  });

  assert.equal(confirmedStack[0].planningCategory, "running");
  assert.equal(confirmedStack[1].planningCategory, "strength");
  assert.equal(confirmedStack[1].intakeConfirmedRole, GOAL_STACK_ROLES.maintained);
});

test("hybrid vague goal resolves into explicit leading and maintained structure", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "become a hybrid athlete",
    typedIntakePacket: buildIntakePacket("become a hybrid athlete"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals: resolution.resolvedGoals,
    goalResolution: resolution,
    goalFeasibility: { conflictFlags: [{ summary: "Both lanes need a clean lead goal." }] },
    goalStackConfirmation: null,
  });

  assert.equal(review.activeGoals.length, 2);
  assert.equal(review.activeGoals[0].role, GOAL_STACK_ROLES.primary);
  assert.equal(review.activeGoals[1].role, GOAL_STACK_ROLES.maintained);
  assert.ok(review.backgroundPriority?.enabled);
});

test("user can re-prioritize goals before confirmation", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat but keep strength",
    typedIntakePacket: buildIntakePacket("lose fat but keep strength"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const reprioritized = applyIntakeGoalStackConfirmation({
    resolvedGoals: resolution.resolvedGoals,
    goalStackConfirmation: {
      primaryGoalId: resolution.resolvedGoals[1].id,
      rolesByGoalId: {
        [resolution.resolvedGoals[0].id]: GOAL_STACK_ROLES.maintained,
      },
    },
  });
  const slottedGoals = applyResolvedGoalsToGoalSlots({
    resolvedGoals: reprioritized,
    goalSlots: DEFAULT_GOAL_SLOTS,
  });

  assert.equal(reprioritized[0].planningCategory, "strength");
  assert.equal(reprioritized[0].intakeConfirmedRole, GOAL_STACK_ROLES.primary);
  assert.equal(reprioritized[1].planningCategory, "body_comp");
  assert.equal(reprioritized[1].intakeConfirmedRole, GOAL_STACK_ROLES.maintained);
  assert.equal(slottedGoals[0].category, "strength");
  assert.equal(slottedGoals[0].goalRole, GOAL_STACK_ROLES.primary);
});
