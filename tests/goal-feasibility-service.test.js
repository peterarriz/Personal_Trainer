const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveGoalTranslation,
} = require("../src/services/goal-resolution-service.js");
const {
  GOAL_FEASIBILITY_ACTIONS,
  GOAL_FEASIBILITY_GATE_STATUSES,
  GOAL_REALISM_STATUSES,
  GOAL_TARGET_VALIDATION_STATUSES,
  applyFeasibilityPriorityOrdering,
  assessGoalFeasibility,
} = require("../src/services/goal-feasibility-service.js");
const {
  deriveIntakeCompletenessState,
} = require("../src/services/intake-completeness-service.js");

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
  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.proceed);
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
  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.warn);
  assert.ok(feasibility.conflictFlags.some((flag) => flag.key === "fat_loss_vs_strength"));
  assert.ok(feasibility.conflictFlags.some((flag) => flag.key === "limited_schedule_multi_goal_stack"));
  assert.match(feasibility.tradeoffSummary, /strength|schedule/i);
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
  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.proceed);
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
  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(feasibility.goalAssessments[0].realismStatus, GOAL_REALISM_STATUSES.unrealistic);
  assert.equal(feasibility.goalAssessments[0].minimumRealisticHorizonWeeks, 16);
  assert.match(feasibility.realisticByTargetDate[0].summary, /too compressed/i);
  assert.match(feasibility.longerHorizonNeeds[0].summary, /16\+ weeks/i);
});

test("impossible marathon target is blocked and given a phased revision", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 2:00 marathon",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 2:00 marathon",
      trainingDaysPerWeek: 5,
      sessionLength: "60 min",
      timingConstraints: ["October"],
    }),
    explicitUserConfirmation: {
      confirmed: true,
      acceptedProposal: true,
      targetHorizonWeeks: 24,
    },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
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
    now: "2026-04-10",
  });

  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(feasibility.status, GOAL_FEASIBILITY_GATE_STATUSES.impossible);
  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.unrealistic);
  assert.equal(feasibility.goalAssessments[0].targetValidationStatus, GOAL_TARGET_VALIDATION_STATUSES.unrealisticButValid);
  assert.equal(feasibility.targetValidation.status, GOAL_TARGET_VALIDATION_STATUSES.valid);
  assert.equal(feasibility.primary_reason_code, "target_beyond_credible_range");
  assert.ok(Array.isArray(feasibility.reasons));
  assert.ok(feasibility.reasons.length >= 1);
  assert.equal(feasibility.suggested_revision.kind, "build_running_base");
  assert.match(feasibility.suggested_revision.first_block_target, /runs per week|long run/i);
  assert.match(feasibility.explanation_text, /Realistic first block:/i);
  assert.match(feasibility.explanation_text, /What would change this:/i);
  assert.equal((feasibility.explanation_text.match(/What would change this:/g) || []).length, 1);
  assert.doesNotMatch(feasibility.explanation_text, /safe ceiling|conservative/i);
  assert.match(feasibility.blockingReasons[0], /marathon time target/i);
  assert.match(feasibility.recommendedRevision.summary, /first block|longer horizon/i);
});

test("unrealistic strength target with a compressed horizon is blocked", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "bench 225",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench 225" }),
    explicitUserConfirmation: {
      confirmed: true,
      acceptedProposal: true,
      targetHorizonWeeks: 6,
    },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "lifting consistently" },
    scheduleReality: { trainingDaysPerWeek: 3, sessionLength: "45 min", trainingLocation: "Gym" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentStrengthBaseline: { text: "135 x 3", weight: 135, reps: 3 },
      },
      missingRequired: [],
      missingOptional: [],
    },
    now: "2026-04-10",
  });

  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.unrealistic);
  assert.equal(feasibility.goalAssessments[0].targetValidationStatus, GOAL_TARGET_VALIDATION_STATUSES.unrealisticButValid);
  assert.match(feasibility.recommendedRevision.summary, /135|225/i);
});

test("impossible bench target is blocked even before a baseline comparison exists", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "bench press 2200 lbs",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench press 2200 lbs" }),
    explicitUserConfirmation: {
      confirmed: true,
      acceptedProposal: true,
      targetHorizonWeeks: 24,
    },
    now: "2026-04-11",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "advanced", currentBaseline: "lifting consistently" },
    scheduleReality: { trainingDaysPerWeek: 5, sessionLength: "60 min", trainingLocation: "Gym" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {},
      missingRequired: [],
      missingOptional: [],
    },
    now: "2026-04-11",
  });

  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.unrealistic);
  assert.equal(feasibility.goalAssessments[0].targetValidationStatus, GOAL_TARGET_VALIDATION_STATUSES.unrealisticButValid);
  assert.match(feasibility.blockingReasons[0], /credible human range|bench press/i);
  assert.match(feasibility.recommendedRevision.summary, /credible bench press milestone|2200/i);
});

test("body-comp goals with missing baseline stay blocked as incomplete instead of pretending they are realistic", () => {
  const rawGoalText = "lose 20 lb";
  const typedIntakePacket = buildIntakePacket({ rawGoalText });
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket,
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });
  const completeness = deriveIntakeCompletenessState({
    resolvedGoals: resolution.resolvedGoals,
    answers: {},
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: typedIntakePacket.intake.baselineContext,
    scheduleReality: typedIntakePacket.intake.scheduleReality,
    currentExperienceContext: {
      injuryConstraintContext: typedIntakePacket.intake.injuryConstraintContext,
      equipmentAccessContext: typedIntakePacket.intake.equipmentAccessContext,
    },
    intakeCompleteness: completeness,
    now: "2026-04-10",
  });

  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(feasibility.status, GOAL_FEASIBILITY_GATE_STATUSES.needsRevision);
  assert.equal(feasibility.primary_reason_code, "missing_required_context");
  assert.equal(feasibility.missingConfidence.level, "high");
  assert.equal(feasibility.targetValidation.status, GOAL_TARGET_VALIDATION_STATUSES.underconstrainedPlausible);
  assert.equal(feasibility.targetValidation.clarificationRequired, true);
  assert.equal(feasibility.suggested_revision.kind, "collect_missing_anchors");
  assert.match(feasibility.explanation_text, /What would change this:/i);
  assert.equal(feasibility.recommendedRevision.kind, "missing_context");
  assert.match(feasibility.recommendedRevision.summary, /current bodyweight|target timeline/i);
});

test("acceptable but ambitious race goals warn instead of fully blocking", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 1:45 half marathon",
      trainingDaysPerWeek: 3,
      sessionLength: "45 min",
      timingConstraints: ["October"],
    }),
    explicitUserConfirmation: {
      confirmed: true,
      acceptedProposal: true,
      targetHorizonWeeks: 12,
    },
    now: "2026-04-10",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: { experienceLevel: "intermediate", currentBaseline: "some running consistency" },
    scheduleReality: { trainingDaysPerWeek: 3, sessionLength: "45 min", trainingLocation: "Both" },
    currentExperienceContext: { injuryConstraintContext: { constraints: [] } },
    intakeCompleteness: {
      facts: {
        currentRunFrequency: 3,
        longestRecentRun: { text: "7 miles", miles: 7 },
        recentPaceBaseline: { text: "8:55 pace", paceText: "8:55" },
        targetTimelineText: "October",
      },
      missingRequired: [],
      missingOptional: [],
    },
    now: "2026-04-10",
  });

  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.warn);
  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.aggressive);
  assert.equal(feasibility.goalAssessments[0].targetValidationStatus, GOAL_TARGET_VALIDATION_STATUSES.aggressiveButValid);
  assert.ok(feasibility.warningReasons.length >= 1);
  assert.equal(feasibility.canProceed, true);
});

test("BMI percentage phrasing blocks for clarification as a malformed metric target", () => {
  const rawGoalText = "BMI under 10%";
  const typedIntakePacket = buildIntakePacket({ rawGoalText });
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket,
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: typedIntakePacket.intake.baselineContext,
    scheduleReality: typedIntakePacket.intake.scheduleReality,
    currentExperienceContext: {
      injuryConstraintContext: typedIntakePacket.intake.injuryConstraintContext,
      equipmentAccessContext: typedIntakePacket.intake.equipmentAccessContext,
    },
    intakeCompleteness: {
      facts: {},
      missingRequired: [],
      missingOptional: [],
    },
    now: "2026-04-11",
  });

  assert.equal(feasibility.confirmationAction, GOAL_FEASIBILITY_ACTIONS.block);
  assert.equal(feasibility.realismStatus, GOAL_REALISM_STATUSES.exploratory);
  assert.equal(feasibility.targetValidation.status, GOAL_TARGET_VALIDATION_STATUSES.malformedMetric);
  assert.equal(feasibility.targetValidation.clarificationRequired, true);
  assert.deepEqual(feasibility.targetValidation.issueKeys, ["bmi_percent_mismatch"]);
  assert.equal(feasibility.goalAssessments[0].targetValidationStatus, GOAL_TARGET_VALIDATION_STATUSES.malformedMetric);
  assert.equal(feasibility.recommendedRevision.kind, "clarification_required");
  assert.match(feasibility.recommendedRevision.summary, /body fat under 10%|bmi under/i);
});
