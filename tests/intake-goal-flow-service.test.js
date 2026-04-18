const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeGoalAdjustment,
  applyIntakeSecondaryGoalResponse,
  buildIntakeConfirmationNeedsList,
  buildIntakeGoalStackConfirmation,
  applyIntakeGoalStackConfirmation,
  buildIntakeClarificationCoachMessages,
  buildIntakeMilestoneDecisionModel,
  buildIntakeGoalStackReviewModel,
  buildIntakeGoalReviewModel,
  buildIntakeSummaryRailModel,
  buildIntakeSecondaryGoalPrompt,
  buildRawGoalIntentFromAnswers,
  canAskSecondaryGoal,
  createIntakeMilestoneSelectionRecord,
  deriveIntakeConfirmationState,
  GOAL_STACK_ROLES,
  INTAKE_MILESTONE_PATHS,
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

const buildReviewModelForGoalText = ({
  rawGoalText = "",
  answers = {},
  aiInterpretationProposal = null,
  now = "2026-04-11",
} = {}) => {
  const typedIntakePacket = buildIntakePacket(rawGoalText);
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket,
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, source: "intake_preview" },
    now,
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: typedIntakePacket.intake.baselineContext,
    scheduleReality: typedIntakePacket.intake.scheduleReality,
    currentExperienceContext: {
      injuryConstraintContext: typedIntakePacket.intake.injuryConstraintContext,
      equipmentAccessContext: typedIntakePacket.intake.equipmentAccessContext,
    },
    now,
  });
  const orderedResolvedGoals = applyFeasibilityPriorityOrdering({
    resolvedGoals: goalResolution.resolvedGoals,
    feasibility: goalFeasibility,
  });
  return buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals,
    goalFeasibility,
    aiInterpretationProposal,
    answers,
  });
};

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

test("summary rail keeps exact multi-goal intent visible before build", () => {
  const reviewModel = {
    orderedResolvedGoals: [
      {
        id: "goal_strength",
        summary: "Bench press 225 lb",
        planningCategory: "strength",
        goalFamily: "strength",
        goalArbitrationRole: GOAL_STACK_ROLES.primary,
        targetHorizonWeeks: 16,
        primaryMetric: { label: "Bench 1RM" },
        first30DaySuccessDefinition: "Build a repeatable bench progression.",
      },
      {
        id: "goal_body_comp",
        summary: "Get leaner by summer",
        planningCategory: "body_comp",
        goalFamily: "appearance",
        goalArbitrationRole: GOAL_STACK_ROLES.maintained,
        targetDate: "2026-07-01",
        proxyMetrics: [{ label: "Waist trend" }],
        first30DaySuccessDefinition: "Tighten food consistency for the first 30 days.",
      },
    ],
    trackingLabels: ["Bench 1RM", "Waist trend"],
    completeness: {
      missingRequired: [],
    },
    goalStackReview: {
      tradeoffStatement: "Strength leads while body comp keeps moving in the background.",
    },
    tradeoffSummary: "Pushing bench progress too hard can slow the lean-out pace.",
  };
  const summaryRail = buildIntakeSummaryRailModel({
    answers: {
      goal_intent: "Bench 225",
      additional_goals_list: ["Get leaner by summer"],
      other_goals: "Get leaner by summer",
    },
    reviewModel,
    draftPrimaryGoal: "Bench 225",
    draftAdditionalGoals: ["Get leaner by summer"],
  });

  assert.deepEqual(
    summaryRail.sections.map((section) => section.label),
    ["Goal request", "Priority draft", "Tracking focus", "Still open", "Balancing notes"]
  );
  assert.ok(summaryRail.yourWords.some((item) => /bench 225/i.test(item)));
  assert.ok(summaryRail.yourWords.some((item) => /get leaner by summer/i.test(item)));
  assert.ok(summaryRail.interpretedGoals.length >= 2);
  assert.ok(summaryRail.interpretedGoals.some((goal) => /bench|225/i.test(goal.summary)));
  assert.ok(summaryRail.interpretedGoals.some((goal) => /lean|fat|body/i.test(goal.summary)));
  assert.ok(summaryRail.interpretedGoals.some((goal) => /target horizon/i.test(goal.timingLabel || "")));
  assert.ok(summaryRail.interpretedGoals.some((goal) => /target date/i.test(goal.timingLabel || "")));
  assert.ok(summaryRail.sections.find((section) => section.label === "Priority draft")?.items.some((item) => /target horizon|target date/i.test(item)));
  assert.ok(summaryRail.tradeoffItems.length >= 1);
});

test("summary rail gives vague users proxy tracking and a near-term win", () => {
  const rawGoalText = "I want to look athletic again";
  const reviewModel = buildReviewModelForGoalText({
    rawGoalText,
    answers: {
      goal_intent: rawGoalText,
    },
    aiInterpretationProposal: {
      interpretedGoalType: "appearance",
      missingClarifyingQuestions: ["What would make this feel visibly successful in the next 30 days?"],
    },
  });
  const summaryRail = buildIntakeSummaryRailModel({
    answers: {
      goal_intent: rawGoalText,
    },
    reviewModel,
  });

  assert.ok(summaryRail.yourWords.some((item) => /look athletic again/i.test(item)));
  assert.ok(summaryRail.trackingItems.some((item) => /waist|bodyweight|30 days|30-day/i.test(item)));
  assert.ok(summaryRail.fuzzyItems.some((item) => /30 days|30-day|bodyweight|waist|what would make this/i.test(item)));
  assert.ok(summaryRail.tradeoffItems.length >= 1);
});

test("summary rail stays coherent for hybrid multi-goal users", () => {
  const rawGoalText = "run a 1:45 half marathon but keep strength and get leaner";
  const reviewModel = buildReviewModelForGoalText({
    rawGoalText,
    answers: {
      goal_intent: "run a 1:45 half marathon",
      additional_goals_list: ["keep strength", "get leaner"],
      other_goals: "keep strength. get leaner",
    },
  });
  const summaryRail = buildIntakeSummaryRailModel({
    answers: {
      goal_intent: "run a 1:45 half marathon",
      additional_goals_list: ["keep strength", "get leaner"],
      other_goals: "keep strength. get leaner",
    },
    reviewModel,
    draftAdditionalGoals: ["keep strength", "get leaner"],
  });

  assert.ok(summaryRail.interpretedGoals.length >= 2);
  assert.ok(summaryRail.sections.find((section) => section.label === "Priority draft")?.items.length >= 2);
  assert.ok(summaryRail.sections.find((section) => section.label === "Tracking focus")?.items.length >= 1);
  assert.ok(summaryRail.sections.find((section) => section.label === "Balancing notes")?.items.length >= 1);
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
  assert.equal(reviewModel.gateLabel, "Needs a safer first step");
  assert.equal(reviewModel.isPlannerReady, false);
  assert.match(reviewModel.recommendedRevisionSummary, /135|225/i);
});

test("unrealistic marathon review surfaces two first-block alternatives without adding new required questions", () => {
  const rawGoalText = "run a 2:00 marathon";
  const typedIntakePacket = buildIntakePacket(rawGoalText);
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket,
    explicitUserConfirmation: {
      confirmed: false,
      acceptedProposal: true,
      targetHorizonWeeks: 24,
      source: "intake_preview",
    },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    userBaseline: { experienceLevel: "advanced", currentBaseline: "running consistently" },
    scheduleReality: { trainingDaysPerWeek: 5, sessionLength: "60 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentRunFrequency: 5,
        longestRecentRun: { text: "18 miles", miles: 18 },
        recentPaceBaseline: { text: "7:10 pace", paceText: "7:10" },
        targetTimelineText: "October",
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
          current_run_frequency: { raw: "5", value: 5 },
          longest_recent_run: { raw: "18 miles", miles: 18 },
          recent_pace_baseline: { raw: "7:10 pace", paceText: "7:10" },
          target_timeline: { raw: "October", value: "October" },
        },
      },
    },
  });

  assert.equal(reviewModel.gateFirstBlockAlternatives.length, 2);
  assert.equal(reviewModel.gateFirstBlockAlternatives[0].label, "Conservative");
  assert.equal(reviewModel.gateFirstBlockAlternatives[1].label, "Standard");
  assert.equal(reviewModel.nextQuestions.length, 0);
  assert.equal(reviewModel.completeness.missingRequired.length, 0);
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
  assert.equal(reviewModel.gateLabel, "Ambitious but workable");
  assert.equal(reviewModel.isPlannerReady, true);
});

test("confirmation copy stays coachy and avoids internal gate language", () => {
  const confirmationState = deriveIntakeConfirmationState({
    reviewModel: {
      activeResolvedGoals: [{ id: "goal_1", summary: "Run a faster half marathon" }],
      completeness: {
        missingRequired: [],
      },
      arbitrationBlockingIssues: [],
      confirmationAction: "block",
      gateSuggestedRevision: {
        summary: "Let's start with a steadier first block and reassess after four weeks.",
      },
      gateReasons: [
        { summary: "Your current running volume is still a little low for that target date." },
      ],
      gateExplanationText: "Right now the timeline is asking for more running volume than you're showing me.",
    },
  });

  assert.equal(confirmationState.status, "block");
  assert.equal(/gate|validation|schema|field/i.test(confirmationState.reason), false);
  assert.match(confirmationState.reason, /steadier first block|running volume|timeline/i);
});

test("confirmation copy sanitizes backticks and intake engine tokens", () => {
  const confirmationState = deriveIntakeConfirmationState({
    reviewModel: {
      activeResolvedGoals: [{ id: "goal_1", summary: "Run a faster half marathon" }],
      completeness: {
        missingRequired: [
          { label: "`current_run_frequency`" },
        ],
      },
      arbitrationBlockingIssues: [],
      confirmationAction: "proceed",
    },
  });

  assert.equal(confirmationState.status, "incomplete");
  assert.equal(confirmationState.reason.includes("`"), false);
  assert.equal(/current_run_frequency/i.test(confirmationState.reason), false);
  assert.match(confirmationState.reason, /runs per week/i);
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
  assert.equal(confirmationState.status, "proceed");
  assert.equal(confirmationState.canConfirm, true);
  assert.equal(confirmationState.requiresAcknowledgement, false);
  assert.equal(confirmationState.next_required_field, null);
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
  assert.equal(confirmationState.status, "block");
  assert.equal(confirmationState.canConfirm, false);
  assert.equal(confirmationState.requiresAcknowledgement, false);
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
  assert.equal(confirmationState.status, "warn");
  assert.equal(confirmationState.canConfirm, true);
  assert.equal(confirmationState.requiresAcknowledgement, false);
  assert.equal(confirmationState.next_required_field, null);
  assert.ok(confirmationState.reason.length > 0);
});

test("ambitious confirmation surfaces a clean milestone chooser instead of acknowledgement friction", () => {
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

  const milestoneDecisionModel = buildIntakeMilestoneDecisionModel({
    reviewModel,
    goalFeasibility,
    goalStackConfirmation: null,
  });

  assert.equal(milestoneDecisionModel.state, "warn");
  assert.equal(milestoneDecisionModel.headline, "Target is ambitious");
  assert.equal(milestoneDecisionModel.selectedKey, INTAKE_MILESTONE_PATHS.keepTarget);
  assert.deepEqual(
    milestoneDecisionModel.choices.map((choice) => choice.key),
    [INTAKE_MILESTONE_PATHS.keepTarget, INTAKE_MILESTONE_PATHS.milestoneFirst]
  );
  assert.equal(
    milestoneDecisionModel.choices.some((choice) => /acknowledge|checkbox/i.test(choice.summary || choice.label || "")),
    false
  );
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
  assert.equal(confirmationState.status, "incomplete");
  assert.equal(confirmationState.canConfirm, false);
  assert.equal(confirmationState.requiresAcknowledgement, false);
  assert.equal(confirmationState.next_required_field, "current_bodyweight");
  assert.match(confirmationState.reason, /current bodyweight/i);
});

test("confirmation needs list prefers live anchor labels over internal requirement keys", () => {
  const needsList = buildIntakeConfirmationNeedsList({
    reviewModel: {
      completeness: {
        missingRequired: [
          { label: "current_run_frequency" },
          { label: "running_endurance_anchor_kind" },
        ],
      },
      nextQuestions: [
        { prompt: "How many times are you running in a normal week?" },
      ],
    },
    machineState: {
      draft: {
        missingAnchorsEngine: {
          currentAnchor: {
            field_id: "current_run_frequency",
            label: "Runs per week",
            question: "How many times are you running in a normal week?",
          },
          missingAnchors: [
            {
              field_id: "current_run_frequency",
              label: "Runs per week",
              question: "How many times are you running in a normal week?",
            },
            {
              field_id: "running_endurance_anchor_kind",
              label: "Choose your running benchmark",
              question: "Which is easier right now: longest recent run or a recent race/pace?",
            },
            {
              field_id: "longest_recent_run",
              label: "Longest recent run",
              question: "What's your longest recent run?",
            },
          ],
        },
      },
    },
    confirmationState: {
      status: "incomplete",
    },
  });

  assert.deepEqual(needsList, [
    "Runs per week",
    "Choose your running benchmark",
    "Longest recent run",
  ]);
  assert.equal(needsList.some((item) => /current_run_frequency|running_endurance_anchor_kind/i.test(item)), false);
});

test("blocked confirmation needs list stays short and plain english", () => {
  const needsList = buildIntakeConfirmationNeedsList({
    reviewModel: {
      gateSuggestedRevision: {
        requested_data: [
          "Current weekly run volume",
          "Recent longest run",
          "Race date or target month",
          "Recent pace result",
        ],
      },
      arbitrationBlockingIssues: [
        "Current weekly run volume",
      ],
    },
    machineState: {
      draft: {
        missingAnchorsEngine: {
          currentAnchor: null,
          missingAnchors: [],
        },
      },
    },
    confirmationState: {
      status: "block",
    },
  });

  assert.deepEqual(needsList, [
    "Current weekly run volume",
    "Recent longest run",
    "Race date or target month",
  ]);
  assert.ok(needsList.length >= 1 && needsList.length <= 3);
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
    ["canConfirm", "next_required_field", "reason", "requiresAcknowledgement", "status"].sort()
  );
  assert.equal(confirmationState.status, "warn");
  assert.equal(confirmationState.canConfirm, true);
  assert.equal(confirmationState.requiresAcknowledgement, false);
});

test("blocked strength target can branch into a smaller milestone before confirmation", () => {
  const rawGoalText = "bench 225";
  const goalResolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket(rawGoalText),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, targetHorizonWeeks: 6, source: "intake_preview" },
    now: "2026-04-11",
  });
  const feasibilityContext = {
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
  };
  const blockedGoalFeasibility = assessGoalFeasibility({
    resolvedGoals: goalResolution.resolvedGoals,
    ...feasibilityContext,
  });
  const blockedReviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility: blockedGoalFeasibility,
    answers: {
      intake_completeness: {
        fields: {
          current_strength_baseline: { raw: "135 x 3", value: 135, weight: 135, reps: 3 },
        },
      },
    },
  });
  const blockedMilestoneDecision = buildIntakeMilestoneDecisionModel({
    reviewModel: blockedReviewModel,
    goalFeasibility: blockedGoalFeasibility,
    goalStackConfirmation: null,
  });
  const milestoneRecord = createIntakeMilestoneSelectionRecord({
    goal: goalResolution.resolvedGoals[0],
    goalAssessment: blockedGoalFeasibility.goalAssessments[0],
  });
  const goalStackConfirmation = buildIntakeGoalStackConfirmation({
    resolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility: blockedGoalFeasibility,
    goalStackConfirmation: {
      milestonePlanByGoalId: {
        [goalResolution.resolvedGoals[0].id]: milestoneRecord,
      },
    },
  });
  const milestoneResolvedGoals = applyIntakeGoalStackConfirmation({
    resolvedGoals: goalResolution.resolvedGoals,
    goalStackConfirmation,
    goalFeasibility: blockedGoalFeasibility,
  });
  const milestoneGoalFeasibility = assessGoalFeasibility({
    resolvedGoals: milestoneResolvedGoals,
    ...feasibilityContext,
  });
  const milestoneReviewModel = buildIntakeGoalReviewModel({
    goalResolution,
    orderedResolvedGoals: goalResolution.resolvedGoals,
    goalFeasibility: milestoneGoalFeasibility,
    goalStackConfirmation,
    answers: {
      intake_completeness: {
        fields: {
          current_strength_baseline: { raw: "135 x 3", value: 135, weight: 135, reps: 3 },
        },
      },
    },
  });
  const milestoneConfirmationState = deriveIntakeConfirmationState({
    reviewModel: milestoneReviewModel,
  });

  assert.equal(blockedMilestoneDecision.state, "block");
  assert.deepEqual(
    blockedMilestoneDecision.choices.map((choice) => choice.key),
    [INTAKE_MILESTONE_PATHS.milestoneFirst]
  );
  assert.equal(milestoneResolvedGoals[0].milestonePath?.strategy, INTAKE_MILESTONE_PATHS.milestoneFirst);
  assert.match(milestoneResolvedGoals[0].summary || "", /build bench press toward/i);
  assert.equal(milestoneResolvedGoals[0].milestonePath?.longTermTargetSummary, "Bench press 225 lb");
  assert.notEqual(milestoneConfirmationState.status, "block");
});

test("canonical review state follows gate status instead of legacy planner-ready flags", () => {
  const confirmationState = deriveIntakeConfirmationState({
    reviewModel: {
      orderedResolvedGoals: [{ summary: "Lose 20 lb", planningCategory: "body_comp" }],
      isPlannerReady: true,
      gateStatus: "incomplete",
      confirmationAction: "block",
      completeness: {
        missingRequired: [{ label: "Current bodyweight", fieldKeys: ["current_bodyweight"] }],
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

  assert.equal(confirmationState.status, "incomplete");
  assert.equal(confirmationState.canConfirm, false);
  assert.equal(confirmationState.next_required_field, "current_bodyweight");
  assert.match(confirmationState.reason, /current bodyweight/i);
});

test("compound running completeness points confirmation to the next micro-anchor instead of looping back", () => {
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
    goalFeasibility: {
      confirmationAction: GOAL_FEASIBILITY_ACTIONS.proceed,
    },
    answers: {
      intake_completeness: {
        fields: {
          target_timeline: { raw: "October", value: "October" },
          current_run_frequency: { raw: "3 runs/week", value: 3 },
        },
      },
    },
  });

  const confirmationState = deriveIntakeConfirmationState({ reviewModel });

  assert.equal(confirmationState.status, "incomplete");
  assert.equal(confirmationState.next_required_field, "running_endurance_anchor_kind");
  assert.match(confirmationState.reason, /current running baseline/i);
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
  assert.match(prompt.helperText, /quick options below/i);
  assert.equal(prompt.existingGoals.length, 0);
  assert.deepEqual(prompt.quickOptions.map((option) => option.label), ["Skip", "Maintain strength", "Maintain mobility", "Custom..."]);
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
  const quickOptionLabels = Array.isArray(prompt.quickOptions) ? prompt.quickOptions.map((option) => option.label) : [];

  assert.match(prompt.prompt, /anything else you want to improve or maintain while chasing this/i);
  assert.match(prompt.helperText, /quick options below/i);
  assert.ok(prompt.inferredGoals.some((goal) => /strength/i.test(goal)));
  assert.equal(prompt.existingGoals.length, 0);
  assert.deepEqual(quickOptionLabels, ["Skip", "Maintain strength", "Maintain mobility", "Custom..."]);
});

test("secondary-goal prompt stays hidden while required anchors are still missing", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket("run a 1:45 half marathon"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution: resolution,
    orderedResolvedGoals: resolution.resolvedGoals,
    goalFeasibility: { confirmationAction: "proceed", realismStatus: "realistic" },
    answers: {},
  });

  assert.equal(reviewModel.completeness.missingRequired.length > 0, true);
  assert.equal(canAskSecondaryGoal({
    stage: "REVIEW_CONFIRM",
    reviewModel,
    answers: {},
  }), false);
  assert.equal(buildIntakeSecondaryGoalPrompt({
    reviewModel,
    answers: {},
  }), null);
});

test("secondary-goal prompt appears once after anchors are satisfied and stays gone after the user answers it", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "bench 225",
    typedIntakePacket: buildIntakePacket("bench 225"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const goalFeasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "lifting consistently" },
    scheduleReality: { trainingDaysPerWeek: 4, sessionLength: "45 min", trainingLocation: "Gym" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentStrengthBaseline: { text: "185 x 3", weight: 185, reps: 3 },
      },
      missingRequired: [],
      missingOptional: [],
      isComplete: true,
    },
    now: "2026-04-11",
  });
  const reviewModel = buildIntakeGoalReviewModel({
    goalResolution: resolution,
    orderedResolvedGoals: resolution.resolvedGoals,
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
  const finalized = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "bench 225",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.primaryOnly, label: "No, just this goal" },
    resolvedGoals: resolution.resolvedGoals,
    goalStackConfirmation: null,
    goalFeasibility,
  });

  assert.ok(prompt);
  assert.equal(canAskSecondaryGoal({
    stage: "REVIEW_CONFIRM",
    reviewModel,
    answers: {},
  }), true);
  assert.equal(finalized.answers.secondary_goal_prompt_answered, true);
  assert.equal(canAskSecondaryGoal({
    stage: "REVIEW_CONFIRM",
    reviewModel,
    answers: finalized.answers,
  }), false);
  assert.equal(buildIntakeSecondaryGoalPrompt({
    reviewModel,
    answers: finalized.answers,
  }), null);
});

test("skip marks the optional secondary-goal step as answered so it does not reappear", () => {
  const outcome = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "run a 1:45 half marathon",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.skip, label: "Skip" },
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });

  assert.equal(outcome.rerunAssessment, false);
  assert.equal(outcome.keepCollecting, false);
  assert.equal(outcome.answers.secondary_goal_prompt_answered, true);
  assert.deepEqual(outcome.answers.additional_goals_list, []);
  assert.equal(outcome.answers.other_goals, "");
});

test("preset secondary-goal buttons add the selected maintenance goal without closing the step", () => {
  const outcome = applyIntakeSecondaryGoalResponse({
    answers: {
      goal_intent: "run a 1:45 half marathon",
    },
    response: { key: SECONDARY_GOAL_RESPONSE_KEYS.maintainStrength, label: "Maintain strength" },
    resolvedGoals: [],
    goalStackConfirmation: null,
    goalFeasibility: null,
  });

  assert.equal(outcome.keepCollecting, true);
  assert.equal(outcome.rerunAssessment, false);
  assert.equal(outcome.answers.secondary_goal_prompt_answered, false);
  assert.deepEqual(outcome.answers.additional_goals_list, ["maintain strength"]);
  assert.equal(outcome.answers.other_goals, "maintain strength");
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
    nextQuestion: {
      prompt: "What's your current running baseline?",
      fieldKeys: ["current_run_frequency", "longest_recent_run", "recent_pace_baseline"],
    },
  });

  assert.equal(messages[0], "Quick baseline check: What's your current running baseline?");
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

test("goal replacement preserves only durable context fields while clearing stale intake follow-up answers", () => {
  const adjusted = applyIntakeGoalAdjustment({
    answers: {
      goal_intent: "run a 1:45 half marathon",
      injury_text: "Right Achilles gets cranky with speed work.",
      training_days: "4",
      session_length: "45",
      home_equipment: ["Bands", "Pull-up bar"],
      home_equipment_other: "Adjustable bench",
      other_goals: "keep upper body",
      additional_goals_list: ["keep upper body"],
      secondary_goal_prompt_answered: true,
      timeline_feedback: "October race",
      goal_clarification_notes: [{ question: "What's your current running baseline?", answer: "3 runs/week" }],
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          target_timeline: { raw: "October 12", value: "October 12" },
          current_run_frequency: { raw: "3 runs/week", value: 3 },
        },
      },
    },
    adjustmentText: "Actually, I want to bench 225",
    currentResolvedGoal: { planningCategory: "running", summary: "Run a 1:45 half marathon" },
    currentPrimaryGoalKey: "endurance",
    now: "2026-04-11",
  });

  assert.equal(adjusted.kind, "goal_replacement");
  assert.equal(adjusted.answers.goal_intent, "bench 225");
  assert.equal(adjusted.answers.injury_text, "Right Achilles gets cranky with speed work.");
  assert.equal(adjusted.answers.training_days, "4");
  assert.equal(adjusted.answers.session_length, "45");
  assert.deepEqual(adjusted.answers.home_equipment, ["Bands", "Pull-up bar"]);
  assert.equal(adjusted.answers.home_equipment_other, "Adjustable bench");
  assert.deepEqual(adjusted.answers.intake_completeness.fields, {});
  assert.deepEqual(adjusted.answers.goal_clarification_notes, []);
  assert.equal(adjusted.answers.timeline_feedback, "");
  assert.deepEqual(adjusted.answers.additional_goals_list, []);
  assert.equal(adjusted.answers.other_goals, "");
  assert.equal(adjusted.answers.secondary_goal_prompt_answered, false);
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
  assert.equal(review.activeGoals[0].roleLabel, "Priority 1");
  assert.equal(review.activeGoals[1].roleLabel, "Priority 2");
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
  assert.equal(reviewModel.reviewContract.lead_goal?.summary, arbitration.leadGoal?.summary);
  assert.equal(reviewModel.reviewContract.maintained_goals[0]?.summary, arbitration.maintainedGoals[0]?.summary);
  assert.equal(reviewModel.reviewContract.support_goals[0]?.summary, arbitration.supportGoals[0]?.summary);
  assert.equal(reviewModel.goalStackReview.orderedGoalStack.items[0]?.priorityLabel, "Priority 1");
  assert.equal(reviewModel.goalStackReview.orderedGoalStack.items[1]?.priorityLabel, "Priority 2");
  assert.equal(reviewModel.goalStackReview.orderedGoalStack.items[2]?.priorityLabel, "Priority 3");
  assert.equal(reviewModel.reviewContract.ordered_goal_stack.top_priorities[0]?.summary, arbitration.leadGoal?.summary);
  assert.deepEqual(
    reviewModel.reviewContract.lane_sections.map((section) => section.title),
    ["Priority 1", "Priority 2", "Priority 3", "Priorities 4+"]
  );
  assert.equal(reviewModel.reviewContract.actions.confirm.label, "Build my plan");
  assert.equal(reviewModel.reviewContract.actions.changePriority.label, "Reorder goals");
  assert.equal(reviewModel.reviewContract.actions.editGoal.label, "Edit a goal");
  assert.equal(reviewModel.reviewContract.actions.dropGoal.label, "Drop a goal");
  assert.match(reviewModel.tradeoffStatement, /Priority 1 is/i);
  assert.match(reviewModel.tradeoffStatement, /Priority 2 is/i);
  assert.match(reviewModel.tradeoffStatement, /Priority 3 is/i);
});

test("promoting a background appearance goal to lead immediately reopens its missing anchors", () => {
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
  const backgroundGoal = arbitration.supportGoals[0];
  const answers = {
    intake_completeness: {
      fields: {
        target_timeline: { raw: "October", value: "2026-10", mode: "month" },
        current_run_frequency: { raw: "3 runs/week", value: 3 },
        running_endurance_anchor_kind: { raw: "Longest recent run", value: "longest_recent_run" },
        longest_recent_run: { raw: "7 miles", value: 7, unit: "miles", miles: 7 },
        current_strength_baseline: { raw: "185x5", weight: 185, reps: 5, mode: "top_set", value: "185" },
      },
    },
  };

  const defaultReviewModel = buildIntakeGoalReviewModel({
    goalResolution: primaryResolution,
    orderedResolvedGoals: arbitration.goals,
    goalFeasibility: {
      conflictFlags: [],
      confirmationAction: GOAL_FEASIBILITY_ACTIONS.proceed,
    },
    answers,
    goalStackConfirmation: null,
  });
  const defaultConfirmationState = deriveIntakeConfirmationState({
    reviewModel: defaultReviewModel,
  });

  assert.equal(defaultReviewModel.goalStackReview.backgroundGoalIds[0], backgroundGoal?.id);
  assert.equal(defaultConfirmationState.status, "proceed");

  const promotedReviewModel = buildIntakeGoalReviewModel({
    goalResolution: primaryResolution,
    orderedResolvedGoals: arbitration.goals,
    goalFeasibility: {
      conflictFlags: [],
      confirmationAction: GOAL_FEASIBILITY_ACTIONS.proceed,
    },
    answers,
    goalStackConfirmation: {
      primaryGoalId: backgroundGoal?.id,
      rolesByGoalId: {
        [arbitration.leadGoal?.id]: GOAL_STACK_ROLES.maintained,
        [arbitration.maintainedGoals[0]?.id]: GOAL_STACK_ROLES.maintained,
        [backgroundGoal?.id]: GOAL_STACK_ROLES.primary,
      },
      removedGoalIds: [],
    },
  });
  const promotedConfirmationState = deriveIntakeConfirmationState({
    reviewModel: promotedReviewModel,
  });

  assert.equal(promotedReviewModel.goalStackReview.activeGoalIds.includes(backgroundGoal?.id), true);
  assert.equal(promotedConfirmationState.status, "incomplete");
  assert.equal(promotedConfirmationState.canConfirm, false);
  assert.equal(promotedConfirmationState.next_required_field, "appearance_proxy_anchor_kind");
});

test("goal stack review keeps parsed goals separate and lets one be removed before anchors continue", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon but keep strength",
    typedIntakePacket: buildIntakePacket("run a 1:45 half marathon but keep strength"),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const initialReview = buildIntakeGoalStackReviewModel({
    resolvedGoals: resolution.resolvedGoals,
    goalResolution: resolution,
    goalFeasibility: { conflictFlags: [] },
    goalStackConfirmation: null,
  });

  assert.equal(initialReview.activeGoals.length, 2);
  assert.equal(initialReview.activeGoals[0]?.summary, "Run a half marathon in 1:45:00");
  assert.equal(initialReview.activeGoals[1]?.summary, "Keep strength in the plan while another priority leads");

  const withoutSecondary = buildIntakeGoalStackReviewModel({
    resolvedGoals: resolution.resolvedGoals,
    goalResolution: resolution,
    goalFeasibility: { conflictFlags: [] },
    goalStackConfirmation: {
      removedGoalIds: [resolution.resolvedGoals[1]?.id],
    },
  });

  assert.equal(withoutSecondary.activeGoals.length, 1);
  assert.equal(withoutSecondary.activeGoals[0]?.summary, "Run a half marathon in 1:45:00");

  const withoutLead = buildIntakeGoalStackReviewModel({
    resolvedGoals: resolution.resolvedGoals,
    goalResolution: resolution,
    goalFeasibility: { conflictFlags: [] },
    goalStackConfirmation: {
      removedGoalIds: [resolution.resolvedGoals[0]?.id],
    },
  });

  assert.equal(withoutLead.activeGoals.length, 1);
  assert.equal(withoutLead.activeGoals[0]?.summary, "Keep strength in the plan while another priority leads");
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

test("review model labels deferred goals with the intake review vocabulary", () => {
  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals: [
      {
        id: "goal_race_lead",
        summary: "Run a half marathon",
        planningCategory: "running",
        goalFamily: "performance",
        planningPriority: 1,
        goalArbitrationRole: GOAL_STACK_ROLES.primary,
        measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
        primaryMetric: { key: "half_marathon_completion", targetValue: "complete", label: "Half marathon" },
      },
      {
        id: "goal_strength_deferred",
        summary: "Bench press 225 lb",
        planningCategory: "strength",
        goalFamily: "strength",
        planningPriority: 2,
        goalArbitrationRole: GOAL_STACK_ROLES.deferred,
        measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
        primaryMetric: { key: "bench_press_1rm", targetValue: "225 lb", label: "Bench 1RM" },
      },
    ],
    goalResolution: null,
    goalFeasibility: null,
    goalStackConfirmation: null,
  });

  assert.equal(review.activeGoals[0].roleLabel, "Priority 1");
  assert.equal(review.deferredGoals[0].roleLabel, "Priority 2");
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

test("explicit ordered goal ids override a stale primary goal id when the user reorders the stack", () => {
  const resolvedGoals = [
    {
      id: "goal_running",
      summary: "Run a 1:45 half marathon",
      planningCategory: "running",
      goalFamily: "performance",
      planningPriority: 1,
      goalArbitrationRole: GOAL_STACK_ROLES.primary,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "half_marathon_finish_time", targetValue: "1:45:00", label: "Half marathon time" },
    },
    {
      id: "goal_bench",
      summary: "Bench press 225 lb",
      planningCategory: "strength",
      goalFamily: "strength",
      planningPriority: 2,
      goalArbitrationRole: GOAL_STACK_ROLES.maintained,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "bench_press_1rm", targetValue: "225 lb", label: "Bench 1RM" },
    },
    {
      id: "goal_body_comp",
      summary: "Get leaner by summer",
      planningCategory: "body_comp",
      goalFamily: "body_comp",
      planningPriority: 3,
      goalArbitrationRole: GOAL_STACK_ROLES.background,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Bodyweight trend" }],
    },
  ];

  const confirmation = buildIntakeGoalStackConfirmation({
    resolvedGoals,
    goalStackConfirmation: {
      primaryGoalId: "goal_running",
      orderedGoalIds: ["goal_bench", "goal_running", "goal_body_comp"],
      removedGoalIds: [],
    },
  });

  assert.equal(confirmation.primaryGoalId, "goal_bench");
  assert.deepEqual(confirmation.orderedGoalIds, ["goal_bench", "goal_running", "goal_body_comp"]);
  assert.equal(confirmation.rolesByGoalId.goal_bench, GOAL_STACK_ROLES.primary);
  assert.equal(confirmation.rolesByGoalId.goal_running, GOAL_STACK_ROLES.maintained);
  assert.equal(confirmation.rolesByGoalId.goal_body_comp, GOAL_STACK_ROLES.background);
});

test("ordered goal stack keeps five goals visible while planner confirmation still compresses to the top priorities", () => {
  const resolvedGoals = [
    {
      id: "goal_running_lead",
      summary: "Run a half marathon in 1:45:00",
      planningCategory: "running",
      goalFamily: "performance",
      planningPriority: 1,
      goalArbitrationRole: GOAL_STACK_ROLES.primary,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "half_marathon_finish_time", targetValue: "1:45:00", label: "Half marathon time" },
    },
    {
      id: "goal_strength_bench",
      summary: "Bench press 225 lb",
      planningCategory: "strength",
      goalFamily: "strength",
      planningPriority: 2,
      goalArbitrationRole: GOAL_STACK_ROLES.maintained,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "bench_press_1rm", targetValue: "225 lb", label: "Bench 1RM" },
    },
    {
      id: "goal_body_comp",
      summary: "Get leaner by summer",
      planningCategory: "body_comp",
      goalFamily: "body_comp",
      planningPriority: 3,
      goalArbitrationRole: GOAL_STACK_ROLES.background,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Bodyweight trend" }],
    },
    {
      id: "goal_power_jump",
      summary: "Jump higher again",
      planningCategory: "strength",
      goalFamily: "athletic_power",
      planningPriority: 4,
      goalArbitrationRole: GOAL_STACK_ROLES.deferred,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Jump contacts" }],
    },
    {
      id: "goal_durability",
      summary: "Keep shoulders healthy",
      planningCategory: "injury_prevention",
      goalFamily: "general_fitness",
      planningPriority: 5,
      goalArbitrationRole: GOAL_STACK_ROLES.deferred,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Pain-free sessions" }],
    },
  ];
  const goalStackConfirmation = {
    orderedGoalIds: [
      "goal_strength_bench",
      "goal_running_lead",
      "goal_body_comp",
      "goal_power_jump",
      "goal_durability",
    ],
    removedGoalIds: [],
  };

  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals,
    goalResolution: null,
    goalFeasibility: { conflictFlags: [{ key: "limited_schedule_multi_goal_stack", summary: "The schedule needs a clean focus." }] },
    goalStackConfirmation,
  });
  const confirmed = applyIntakeGoalStackConfirmation({
    resolvedGoals,
    goalStackConfirmation,
  });

  assert.deepEqual(
    review.orderedGoalStack.items.map((goal) => goal.id),
    goalStackConfirmation.orderedGoalIds
  );
  assert.equal(review.orderedGoalStack.additional_goals.length, 2);
  assert.equal(review.reviewContract.ordered_goal_stack.sections[3]?.title, "Priorities 4+");
  assert.match(review.reviewContract.tradeoff_statement, /Priority 1 is Bench press 225 lb/i);
  assert.deepEqual(
    confirmed.map((goal) => goal.id),
    ["goal_strength_bench", "goal_running_lead"]
  );
});

test("ordered goal stack keeps seven goals visible and preserves later priorities as explicit additional goals", () => {
  const resolvedGoals = [
    {
      id: "goal_running_lead",
      summary: "Run a half marathon in 1:45:00",
      planningCategory: "running",
      goalFamily: "performance",
      planningPriority: 1,
      goalArbitrationRole: GOAL_STACK_ROLES.primary,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "half_marathon_finish_time", targetValue: "1:45:00", label: "Half marathon time" },
    },
    {
      id: "goal_strength_bench",
      summary: "Bench press 225 lb",
      planningCategory: "strength",
      goalFamily: "strength",
      planningPriority: 2,
      goalArbitrationRole: GOAL_STACK_ROLES.maintained,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "bench_press_1rm", targetValue: "225 lb", label: "Bench 1RM" },
    },
    {
      id: "goal_body_comp",
      summary: "Get leaner by summer",
      planningCategory: "body_comp",
      goalFamily: "body_comp",
      planningPriority: 3,
      goalArbitrationRole: GOAL_STACK_ROLES.background,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Bodyweight trend" }],
    },
    {
      id: "goal_power_jump",
      summary: "Jump higher again",
      planningCategory: "strength",
      goalFamily: "athletic_power",
      planningPriority: 4,
      goalArbitrationRole: GOAL_STACK_ROLES.deferred,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Jump contacts" }],
    },
    {
      id: "goal_durability",
      summary: "Keep shoulders healthy",
      planningCategory: "injury_prevention",
      goalFamily: "general_fitness",
      planningPriority: 5,
      goalArbitrationRole: GOAL_STACK_ROLES.deferred,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Pain-free sessions" }],
    },
    {
      id: "goal_swim_confidence",
      summary: "Swim confidently in open water",
      planningCategory: "swim",
      goalFamily: "performance",
      planningPriority: 6,
      goalArbitrationRole: GOAL_STACK_ROLES.deferred,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Open-water sessions" }],
    },
    {
      id: "goal_mobility",
      summary: "Move better through hips and ankles",
      planningCategory: "general_fitness",
      goalFamily: "general_fitness",
      planningPriority: 7,
      goalArbitrationRole: GOAL_STACK_ROLES.deferred,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ label: "Mobility sessions" }],
    },
  ];
  const goalStackConfirmation = {
    orderedGoalIds: [
      "goal_strength_bench",
      "goal_running_lead",
      "goal_body_comp",
      "goal_power_jump",
      "goal_durability",
      "goal_swim_confidence",
      "goal_mobility",
    ],
    removedGoalIds: [],
  };

  const review = buildIntakeGoalStackReviewModel({
    resolvedGoals,
    goalResolution: null,
    goalFeasibility: { conflictFlags: [{ key: "limited_schedule_multi_goal_stack", summary: "The schedule needs a clean focus." }] },
    goalStackConfirmation,
  });

  assert.deepEqual(
    review.orderedGoalStack.items.map((goal) => goal.id),
    goalStackConfirmation.orderedGoalIds
  );
  assert.equal(review.orderedGoalStack.additional_goals.length, 4);
  assert.equal(review.reviewContract.ordered_goal_stack.sections[3]?.title, "Priorities 4+");
  assert.ok(review.orderedGoalStack.items.some((goal) => goal.priorityLabel === "Priority 7"));
});
