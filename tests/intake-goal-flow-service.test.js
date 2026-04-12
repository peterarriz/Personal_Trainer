const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeGoalAdjustment,
  applyIntakeSecondaryGoalResponse,
  applyIntakeGoalStackConfirmation,
  buildIntakeClarificationCoachMessages,
  buildIntakeGoalStackReviewModel,
  buildIntakeGoalReviewModel,
  buildIntakeSecondaryGoalPrompt,
  buildRawGoalIntentFromAnswers,
  deriveIntakeConfirmationState,
  GOAL_STACK_ROLES,
  SECONDARY_GOAL_RESPONSE_KEYS,
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
const { buildGoalArbitrationStack } = require("../src/services/goal-arbitration-service.js");

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
  assert.match(reviewModel.clarifyingQuestions[0], /current bodyweight or waist/i);
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
  assert.equal(reviewModel.gateStatus, "blocked");
  assert.equal(reviewModel.gateLabel, "Too aggressive for this timeline");
  assert.equal(reviewModel.isPlannerReady, false);
  assert.match(reviewModel.recommendedRevisionSummary, /135|225/i);
});

test("review model keeps plausible but incomplete goals out of ready-to-plan state", () => {
  const rawGoalText = "lose 20 lb";
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
    intakeCompleteness: {
      facts: {},
      missingRequired: [
        { label: "Current bodyweight" },
        { label: "Target timeline" },
      ],
      missingOptional: [],
    },
    now: "2026-04-11",
  });

  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility,
    answers: {},
  });

  assert.equal(reviewModel.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(reviewModel.gateStatus, "incomplete");
  assert.equal(reviewModel.gateLabel, "Need one more detail");
  assert.equal(reviewModel.isPlannerReady, false);
});

test("review model reflects a warning state without promoting it to ready-to-plan language", () => {
  const rawGoalText = "run a 1:45 half marathon";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, targetHorizonWeeks: 12, source: "intake_preview" },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "some running consistency" },
    scheduleReality: { trainingDaysPerWeek: 3, sessionLength: "45 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentRunFrequency: 3,
        longestRecentRun: { text: "7 miles", miles: 7 },
        recentPaceBaseline: { text: "8:55 pace", paceText: "8:55" },
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
          current_run_frequency: { raw: "3 runs/week", value: 3 },
          longest_recent_run: { raw: "7 miles", value: 7, miles: 7 },
          recent_pace_baseline: { raw: "8:55 pace", value: "8:55", paceText: "8:55" },
          target_timeline: { raw: "October", value: "October" },
        },
      },
    },
  });

  assert.equal(reviewModel.confirmationAction, GOAL_FEASIBILITY_ACTIONS.warn);
  assert.equal(reviewModel.gateStatus, "warn");
  assert.equal(reviewModel.gateLabel, "Aggressive but possible");
  assert.equal(reviewModel.isPlannerReady, true);
});

test("ready-to-plan state produces a confirmable intake confirmation state", () => {
  const rawGoalText = "bench 225";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, targetHorizonWeeks: 20, source: "intake_preview" },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "lifting consistently" },
    scheduleReality: { trainingDaysPerWeek: 4, sessionLength: "45 min", trainingLocation: "Gym" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentStrengthBaseline: { text: "205 x 3", weight: 205, reps: 3 },
      },
      missingRequired: [],
      missingOptional: [],
      isComplete: true,
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
          current_strength_baseline: { raw: "205 x 3", value: 205, weight: 205, reps: 3 },
        },
      },
    },
  });

  const confirmationState = deriveIntakeConfirmationState({
    reviewModel,
    askedQuestions: [],
  });

  assert.equal(reviewModel.isPlannerReady, true);
  assert.equal(confirmationState.state, "ready");
  assert.equal(confirmationState.statusLabel, "Ready to build");
  assert.equal(confirmationState.headline, "This looks realistic from where you're starting.");
  assert.equal(confirmationState.canConfirm, true);
  assert.equal(confirmationState.ctaEnabled, true);
  assert.equal(confirmationState.ctaLabel, "Confirm and build my plan");
  assert.equal(confirmationState.reason, "");
});

test("blocked state produces an explicit non-confirmable reason instead of a silent no-op", () => {
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
      isComplete: true,
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

  const confirmationState = deriveIntakeConfirmationState({
    reviewModel,
    askedQuestions: [],
  });

  assert.equal(reviewModel.isPlannerReady, false);
  assert.equal(confirmationState.state, "blocked");
  assert.equal(confirmationState.statusLabel, "Too aggressive for this timeline");
  assert.match(confirmationState.headline, /too aggressive/i);
  assert.equal(confirmationState.canConfirm, false);
  assert.equal(confirmationState.ctaEnabled, false);
  assert.match(confirmationState.reason, /135|225|smaller|first block/i);
});

test("warned-but-allowed state still produces a confirmable intake confirmation state", () => {
  const rawGoalText = "run a 1:45 half marathon";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, targetHorizonWeeks: 12, source: "intake_preview" },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "some running consistency" },
    scheduleReality: { trainingDaysPerWeek: 3, sessionLength: "45 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentRunFrequency: 3,
        longestRecentRun: { text: "7 miles", miles: 7 },
        recentPaceBaseline: { text: "8:55 pace", paceText: "8:55" },
      },
      missingRequired: [],
      missingOptional: [],
      isComplete: true,
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
          current_run_frequency: { raw: "3 runs/week", value: 3 },
          longest_recent_run: { raw: "7 miles", value: 7, miles: 7 },
          recent_pace_baseline: { raw: "8:55 pace", value: "8:55", paceText: "8:55" },
          target_timeline: { raw: "October", value: "October" },
        },
      },
    },
  });

  const confirmationState = deriveIntakeConfirmationState({
    reviewModel,
    askedQuestions: [],
  });

  assert.equal(reviewModel.isPlannerReady, true);
  assert.equal(confirmationState.state, "warn");
  assert.equal(confirmationState.statusLabel, "Aggressive but possible");
  assert.match(confirmationState.headline, /aggressive, but i can build for it/i);
  assert.equal(confirmationState.canConfirm, true);
  assert.equal(confirmationState.ctaEnabled, true);
  assert.equal(confirmationState.ctaLabel, "Build my plan anyway");
  assert.ok(confirmationState.reason.length > 0);
});

test("incomplete but plausible state stays non-confirmable and surfaces the next required question", () => {
  const rawGoalText = "lose 20 lb";
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
    intakeCompleteness: {
      facts: {},
      missingRequired: [
        { label: "Current bodyweight" },
        { label: "Target timeline" },
      ],
      missingOptional: [],
      isComplete: false,
    },
    now: "2026-04-11",
  });
  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility,
    answers: {},
  });

  const confirmationState = deriveIntakeConfirmationState({
    reviewModel,
    askedQuestions: [],
  });

  assert.equal(reviewModel.isPlannerReady, false);
  assert.equal(confirmationState.state, "incomplete");
  assert.equal(confirmationState.statusLabel, "Need one more detail");
  assert.match(confirmationState.headline, /one more detail/i);
  assert.equal(confirmationState.canConfirm, false);
  assert.equal(confirmationState.ctaEnabled, false);
  assert.ok(confirmationState.nextQuestion?.prompt);
  assert.match(confirmationState.reason, /critical detail|bodyweight|timeline/i);
});

test("canonical review state carries the status and CTA fields the live review screen should render from", () => {
  const confirmationState = deriveIntakeConfirmationState({
    reviewModel: {
      orderedResolvedGoals: [{ summary: "Bench 225", planningCategory: "strength" }],
      isPlannerReady: true,
      gateStatus: "warn",
      confirmationAction: "warn",
      warningReasons: ["The timeline is tight for your current baseline."],
      tradeoffSummary: "",
    },
    askedQuestions: [],
  });

  assert.deepEqual(
    Object.keys(confirmationState).sort(),
    ["canConfirm", "ctaEnabled", "ctaLabel", "headline", "nextQuestion", "reason", "state", "statusLabel"].sort()
  );
  assert.equal(confirmationState.state, "warn");
  assert.equal(confirmationState.statusLabel, "Aggressive but possible");
  assert.equal(confirmationState.ctaLabel, "Build my plan anyway");
  assert.equal(confirmationState.ctaEnabled, true);
});

test("canonical review state follows gate status instead of legacy planner-ready flags", () => {
  const confirmationState = deriveIntakeConfirmationState({
    reviewModel: {
      orderedResolvedGoals: [{ summary: "Lose 20 lb", planningCategory: "body_comp" }],
      isPlannerReady: true,
      gateStatus: "incomplete",
      confirmationAction: "block",
      completeness: {
        missingRequired: [{ label: "Current bodyweight" }],
      },
      unresolvedItems: ["Current bodyweight"],
      nextQuestions: [{
        key: "body_comp_anchor",
        prompt: "What's your current bodyweight?",
        required: true,
      }],
    },
    askedQuestions: [],
  });

  assert.equal(confirmationState.state, "incomplete");
  assert.equal(confirmationState.statusLabel, "Need one more detail");
  assert.equal(confirmationState.canConfirm, false);
  assert.equal(confirmationState.ctaEnabled, false);
  assert.match(confirmationState.reason, /current bodyweight/i);
});

test("secondary-goal question appears after required anchors are satisfied and stays optional", () => {
  const rawGoalText = "bench 225";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, targetHorizonWeeks: 16, source: "intake_preview" },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "lifting consistently" },
    scheduleReality: { trainingDaysPerWeek: 4, sessionLength: "45 min", trainingLocation: "Gym" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentStrengthBaseline: { text: "185 x 3", weight: 185, reps: 3 },
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
          current_strength_baseline: { raw: "185 x 3", value: 185, weight: 185, reps: 3 },
        },
      },
    },
  });
  const prompt = buildIntakeSecondaryGoalPrompt({
    reviewModel,
    answers: {},
  });

  assert.match(prompt.prompt, /anything else you want to improve or maintain while chasing this/i);
  assert.match(prompt.helperText, /add extra goals one at a time/i);
  assert.equal(prompt.existingGoals.length, 0);
});

test("pure running review stays event-specific and does not pre-seed a hybrid maintained lane", () => {
  const rawGoalText = "I want to run a marathon";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, source: "intake_preview" },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "running consistently" },
    scheduleReality: { trainingDaysPerWeek: 4, sessionLength: "45 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentRunFrequency: 4,
        longestRecentRun: { text: "8 miles", miles: 8 },
        targetTimeline: { text: "October", value: "October" },
      },
      missingRequired: [],
      missingOptional: [],
      isComplete: true,
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
          current_run_frequency: { raw: "4 runs/week", value: 4 },
          longest_recent_run: { raw: "8 miles", value: 8, miles: 8 },
          target_timeline: { raw: "October", value: "October" },
        },
      },
    },
  });
  const prompt = buildIntakeSecondaryGoalPrompt({
    reviewModel,
    answers: {},
  });

  assert.equal(reviewModel.primarySummary, "Run a marathon");
  assert.equal(reviewModel.goalFamily, "performance");
  assert.equal(reviewModel.goalTypeLabel, "Event goal");
  assert.equal(reviewModel.orderedResolvedGoals.length, 1);
  assert.ok(prompt);
  assert.doesNotMatch(prompt.prompt, /currently treating/i);
});

test("secondary-goal prompt stays lightweight and freeform even when a maintained lane is inferred", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon but keep strength",
    typedIntakePacket: buildIntakePacket("run a 1:45 half marathon but keep strength"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution: resolution,
    orderedResolvedGoals: resolution.resolvedGoals,
    goalFeasibility: { confirmationAction: "proceed", realismStatus: "realistic" },
    answers: {
      intake_completeness: {
        fields: {
          current_run_frequency: { raw: "4 runs/week", value: 4 },
          longest_recent_run: { raw: "8 miles", value: 8, miles: 8 },
          current_strength_baseline: { raw: "185 x 3", value: 185, weight: 185, reps: 3 },
          target_timeline: { raw: "October", value: "October" },
        },
      },
    },
  });
  const prompt = buildIntakeSecondaryGoalPrompt({
    reviewModel,
    answers: {},
  });

  assert.match(prompt.prompt, /anything else you want to improve or maintain while chasing this/i);
  assert.match(prompt.helperText, /add anything else one at a time/i);
  assert.ok(prompt.inferredGoals.some((goal) => /strength/i.test(goal)));
  assert.equal(prompt.existingGoals.length, 0);
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

test("required clarifying flow prefers a different missing requirement before repeating an earlier one", () => {
  const question = getNextIntakeClarifyingQuestion({
    reviewModel: {
      nextQuestions: [
        { key: "running_timing", prompt: "What's the race date or target month?", required: true, source: "completeness" },
        { key: "running_baseline", prompt: "What's your current running baseline?", required: true, source: "completeness" },
      ],
    },
    askedQuestions: ["running_timing"],
    maxQuestions: 2,
  });

  assert.equal(question.key, "running_baseline");
});

test("clarification coach messages lead with the targeted question before the broader status copy", () => {
  const messages = buildIntakeClarificationCoachMessages({
    statusText: "I still need one or two critical anchors before I can build credibly.",
    nextQuestion: { prompt: "What's your current running baseline?" },
  });

  assert.equal(messages[0], "One quick thing before I lock this in: What's your current running baseline?");
  assert.equal(messages[1], "I still need one or two critical anchors before I can build credibly.");
});

test("completeness-scoped clarification notes do not flow back into raw goal intent", () => {
  const rawIntent = buildRawGoalIntentFromAnswers({
    answers: {
      goal_intent: "look athletic again",
      goal_clarification_notes: [
        {
          question: "What's one proxy we can track for this right now: current bodyweight or waist?",
          answer: "225 lbs",
          source: "completeness",
          questionKey: "appearance_proxy_anchor",
          fieldKeys: ["current_bodyweight"],
        },
      ],
    },
  });

  assert.equal(rawIntent, "look athletic again");
});

test("field-scoped clarification answers do not trigger implicit goal replacement while completeness is being collected", () => {
  const adjusted = applyIntakeGoalAdjustment({
    answers: {
      goal_intent: "look athletic again",
      primary_goal: "fat_loss",
    },
    adjustmentText: "225 lbs",
    currentResolvedGoal: { planningCategory: "body_comp", summary: "Look athletic again" },
    currentPrimaryGoalKey: "fat_loss",
    now: "2026-04-11",
    allowImplicitGoalReplacement: false,
  });

  assert.equal(adjusted.kind, "refinement");
  assert.equal(adjusted.answers.goal_intent, "look athletic again");
});

test("explicit filler words without a new goal signal do not replace the goal during clarification", () => {
  const adjusted = applyIntakeGoalAdjustment({
    answers: {
      goal_intent: "look athletic again",
      primary_goal: "fat_loss",
    },
    adjustmentText: "Actually, 191 lbs",
    currentResolvedGoal: { planningCategory: "body_comp", summary: "Look athletic again" },
    currentPrimaryGoalKey: "fat_loss",
    now: "2026-04-11",
    allowImplicitGoalReplacement: false,
  });

  assert.equal(adjusted.kind, "refinement");
  assert.equal(adjusted.answers.goal_intent, "look athletic again");
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

test("changing goals mid-clarification still clears stale clarification context before the next review build", () => {
  const adjusted = applyIntakeGoalAdjustment({
    answers: {
      goal_intent: "look athletic again",
      other_goals: "bench 225. get a six pack",
      additional_goals_list: ["bench 225", "get a six pack"],
      goal_clarification_notes: [
        {
          question: "What's one proxy we can track for this right now: current bodyweight or waist?",
          answer: "191 lbs",
          source: "completeness",
          questionKey: "appearance_proxy_anchor",
          fieldKeys: ["current_bodyweight"],
        },
      ],
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          current_bodyweight: { raw: "191 lbs", value: 191 },
        },
      },
    },
    adjustmentText: "Actually, I want to run a 1:45 half marathon",
    currentResolvedGoal: { planningCategory: "body_comp", summary: "Look athletic again" },
    currentPrimaryGoalKey: "fat_loss",
    now: "2026-04-11",
  });
  const rawGoalText = buildRawGoalIntentFromAnswers({ answers: adjusted.answers });

  assert.equal(adjusted.kind, "goal_replacement");
  assert.deepEqual(adjusted.answers.goal_clarification_notes, []);
  assert.deepEqual(adjusted.answers.intake_completeness.fields, {});
  assert.deepEqual(adjusted.answers.additional_goals_list, []);
  assert.equal(adjusted.answers.other_goals, "");
  assert.doesNotMatch(rawGoalText, /191 lbs/i);
  assert.match(rawGoalText, /1:45 half marathon/i);
});

test("primary goal only path skips the additional-goal step cleanly", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat",
    typedIntakePacket: buildIntakePacket("lose fat"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const outcome = applyIntakeSecondaryGoalResponse({
    answers: {},
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.primaryOnly, label: "No, just this goal" },
    resolvedGoals: resolution.resolvedGoals,
    goalStackConfirmation: null,
    goalFeasibility: { conflictFlags: [] },
  });

  assert.equal(outcome.rerunAssessment, false);
  assert.equal(outcome.answers.secondary_goal_prompt_answered, true);
  assert.deepEqual(outcome.answers.additional_goals_list, []);
  assert.equal(outcome.answers.other_goals, "");
});

test("continue without adding anything skips the additional-goal step cleanly", () => {
  const outcome = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "run a 1:45 half marathon",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.done },
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const rawGoalText = buildRawGoalIntentFromAnswers({
    answers: outcome.answers,
  });

  assert.equal(outcome.keepCollecting, false);
  assert.equal(outcome.rerunAssessment, false);
  assert.equal(outcome.answers.secondary_goal_prompt_answered, true);
  assert.deepEqual(outcome.answers.additional_goals_list, []);
  assert.equal(rawGoalText, "run a 1:45 half marathon");
});

test("primary plus one additional typed goal feeds into canonical resolution", () => {
  const outcome = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "run a 1:45 half marathon",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.addGoal },
    customText: "keep strength",
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const finalized = applyIntakeSecondaryGoalResponse({
    answers: outcome.answers,
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.done },
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const rawGoalText = buildRawGoalIntentFromAnswers({
    answers: finalized.answers,
  });
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(outcome.keepCollecting, true);
  assert.deepEqual(outcome.answers.additional_goals_list, ["keep strength"]);
  assert.equal(finalized.rerunAssessment, true);
  assert.equal(finalized.answers.other_goals, "keep strength");
  assert.equal(resolution.resolvedGoals[0].planningCategory, "running");
  assert.equal(resolution.resolvedGoals[1].planningCategory, "strength");
});

test("primary plus two additional typed goals are collected one at a time", () => {
  const firstAdd = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "run a 1:45 half marathon",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.addGoal },
    customText: "bench 225",
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const secondAdd = applyIntakeSecondaryGoalResponse({
    answers: firstAdd.answers,
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.addGoal },
    customText: "get a six pack",
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const finalized = applyIntakeSecondaryGoalResponse({
    answers: secondAdd.answers,
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.done },
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const rawGoalText = buildRawGoalIntentFromAnswers({
    answers: finalized.answers,
  });
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.deepEqual(secondAdd.answers.additional_goals_list, ["bench 225", "get a six pack"]);
  assert.equal(finalized.answers.other_goals, "bench 225. get a six pack");
  assert.match(rawGoalText, /bench 225/i);
  assert.match(rawGoalText, /get a six pack/i);
  assert.equal(resolution.rawIntent, rawGoalText);
  assert.ok(resolution.resolvedGoals.length >= 1);
});

test("changing the primary goal after collecting extra goals clears downstream additional-goal interpretation", () => {
  const collected = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "lose fat",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.addGoal },
    customText: "bench 225",
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const finalized = applyIntakeSecondaryGoalResponse({
    answers: collected.answers,
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.done },
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });
  const adjusted = applyIntakeGoalAdjustment({
    answers: finalized.answers,
    adjustmentText: "Actually, I want to run a 1:45 half marathon",
    currentResolvedGoal: { planningCategory: "body_comp", summary: "Lose fat" },
    currentPrimaryGoalKey: "fat_loss",
    now: "2026-04-11",
  });
  const rawGoalText = buildRawGoalIntentFromAnswers({
    answers: adjusted.answers,
  });

  assert.equal(adjusted.kind, "goal_replacement");
  assert.deepEqual(adjusted.answers.additional_goals_list, []);
  assert.equal(adjusted.answers.other_goals, "");
  assert.equal(adjusted.answers.secondary_goal_prompt_answered, false);
  assert.doesNotMatch(rawGoalText, /bench 225/i);
  assert.match(rawGoalText, /1:45 half marathon/i);
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
  assert.equal(review.activeGoals[0].roleLabel, "Lead goal");
  assert.equal(review.activeGoals[1].roleLabel, "Also keep");
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

test("final review keeps running lead, maintained bench goal, and background abs goal in separate sections", () => {
  const primaryResolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket("run a 1:45 half marathon"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const combinedPacket = buildIntakePacket("run a 1:45 half marathon. bench 225. get a six pack");
  const combinedResolution = resolveGoalTranslation({
    rawUserGoalIntent: combinedPacket.intake.rawGoalText,
    typedIntakePacket: combinedPacket,
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: combinedResolution.resolvedGoals,
    confirmedPrimaryGoal: primaryResolution.resolvedGoals[0],
    additionalGoalTexts: ["bench 225", "get a six pack"],
    typedIntakePacket: combinedPacket,
    now: "2026-04-11",
  });
  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution: primaryResolution,
    orderedResolvedGoals: arbitration.goals,
    goalFeasibility: { conflictFlags: [] },
    answers: {},
    goalStackConfirmation: null,
  });

  assert.equal(reviewModel.goalStackReview.primaryGoalId, arbitration.leadGoal?.id);
  assert.deepEqual(reviewModel.goalStackReview.activeGoalIds, [
    arbitration.leadGoal?.id,
    arbitration.maintainedGoals[0]?.id,
  ]);
  assert.deepEqual(reviewModel.goalStackReview.backgroundGoalIds, [arbitration.supportGoals[0]?.id]);
  assert.deepEqual(reviewModel.goalStackReview.deferredGoalIds, []);
  assert.equal(reviewModel.primarySummary, arbitration.leadGoal?.summary);
});

test("duplicate goal fingerprints do not render in both lead and later sections", () => {
  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals: [
      {
        id: "goal_strength_primary",
        summary: "Bench press 225 lb",
        planningCategory: "strength",
        goalFamily: "strength",
        planningPriority: 1,
        goalArbitrationRole: GOAL_STACK_ROLES.primary,
        measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
        primaryMetric: { key: "bench_press_1rm", targetValue: "225 lb", label: "Bench 1RM" },
      },
      {
        id: "goal_strength_duplicate",
        summary: "Bench press 225 lb",
        planningCategory: "strength",
        goalFamily: "strength",
        planningPriority: 3,
        goalArbitrationRole: GOAL_STACK_ROLES.deferred,
        measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
        primaryMetric: { key: "bench_press_1rm", targetValue: "225 lb", label: "Bench 1RM" },
      },
      {
        id: "goal_abs_background",
        summary: "Improve midsection definition",
        planningCategory: "body_comp",
        goalFamily: "appearance",
        planningPriority: 2,
        goalArbitrationRole: GOAL_STACK_ROLES.background,
        measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
        proxyMetrics: [{ label: "Waist trend" }],
      },
    ],
    goalResolution: null,
    goalFeasibility: null,
    goalStackConfirmation: null,
  });

  assert.deepEqual(review.activeGoalIds, ["goal_strength_primary"]);
  assert.deepEqual(review.backgroundGoalIds, ["goal_abs_background"]);
  assert.deepEqual(review.deferredGoalIds, []);
  assert.equal(review.activeGoals[0].role, GOAL_STACK_ROLES.primary);
  assert.equal(review.backgroundGoals[0].role, GOAL_STACK_ROLES.background);
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
