const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGoalArbitrationStack } = require("../src/services/goal-arbitration-service.js");
const { resolveGoalTranslation } = require("../src/services/goal-resolution-service.js");
const { assessGoalFeasibility } = require("../src/services/goal-feasibility-service.js");
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

  assert.equal(arbitration.leadGoal?.planningCategory, "running");
  assert.equal(arbitration.maintainedGoals[0]?.planningCategory, "strength");
  assert.equal(arbitration.supportGoals[0]?.goalFamily, "appearance");
  assert.equal(arbitration.deferredGoals.length, 0);
  assert.equal(arbitration.lanes.lead_goal?.id, arbitration.leadGoal?.id);
  assert.equal(arbitration.lanes.maintained_goals[0]?.id, arbitration.maintainedGoals[0]?.id);
  assert.equal(arbitration.lanes.support_goals[0]?.id, arbitration.supportGoals[0]?.id);
  assert.equal(arbitration.goalStack.leadGoal?.id, arbitration.leadGoal?.id);
  assert.equal(arbitration.conflictSummary.status, "clear");
  assert.equal(arbitration.arbitrationReasoning.leadGoalId, arbitration.leadGoal?.id);
  assert.equal(arbitration.arbitrationReasoning.maintainedGoalIds[0], arbitration.maintainedGoals[0]?.id);
  assert.match(arbitration.supportGoals[0]?.goalArbitrationReason || "", /check-ins|background/i);
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
  assert.equal(arbitration.leadGoal?.planningCategory, "body_comp");
  assert.equal(arbitration.maintainedGoals.length, 1);
  assert.equal(arbitration.supportGoals.length, 0);
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
  assert.equal(arbitration.maintainedGoals.length <= 1, true);
  assert.equal(arbitration.supportGoals.length <= 1, true);
  assert.equal(arbitration.conflictSummary.hasConflicts, true);
  assert.ok(arbitration.arbitrationReasoning.deferredGoalIds.length >= 2);
});

test("confirmed running lead stays lead when bench and abs are added later", () => {
  const primaryPacket = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" });
  const combinedPacket = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon. bench 225. get a six pack" });
  const confirmedPrimary = resolvePrimaryGoal("run a 1:45 half marathon", primaryPacket).resolvedGoals[0];
  const combinedResolution = resolveGoalTranslation({
    rawUserGoalIntent: combinedPacket.intake.rawGoalText,
    typedIntakePacket: combinedPacket,
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: combinedResolution.resolvedGoals,
    confirmedPrimaryGoal: confirmedPrimary,
    additionalGoalTexts: ["bench 225", "get a six pack"],
    typedIntakePacket: combinedPacket,
    now: "2026-04-11",
  });

  assert.equal(arbitration.leadGoal?.id, confirmedPrimary.id);
  assert.equal(arbitration.leadGoal?.planningCategory, "running");
  assert.equal(arbitration.maintainedGoals[0]?.planningCategory, "strength");
  assert.equal(arbitration.supportGoals[0]?.goalFamily, "appearance");
});

test("latest added goal does not automatically replace a confirmed body-comp lead", () => {
  const primaryPacket = buildIntakePacket({ rawGoalText: "lose 20 lb" });
  const combinedPacket = buildIntakePacket({ rawGoalText: "lose 20 lb. bench 225. get a six pack" });
  const confirmedPrimary = resolvePrimaryGoal("lose 20 lb", primaryPacket).resolvedGoals[0];
  const combinedResolution = resolveGoalTranslation({
    rawUserGoalIntent: combinedPacket.intake.rawGoalText,
    typedIntakePacket: combinedPacket,
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: combinedResolution.resolvedGoals,
    confirmedPrimaryGoal: confirmedPrimary,
    additionalGoalTexts: ["bench 225", "get a six pack"],
    typedIntakePacket: combinedPacket,
    now: "2026-04-11",
  });

  assert.equal(arbitration.leadGoal?.id, confirmedPrimary.id);
  assert.equal(arbitration.leadGoal?.planningCategory, "body_comp");
  assert.equal(arbitration.maintainedGoals[0]?.planningCategory, "strength");
  assert.equal(arbitration.supportGoals[0]?.goalFamily, "appearance");
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
  assert.equal(review.reviewContract.lead_goal?.summary, review.activeGoals[0]?.summary);
  assert.equal(review.reviewContract.maintained_goals[0]?.summary, review.activeGoals[1]?.summary);
  assert.equal(review.reviewContract.support_goals[0]?.summary, review.backgroundGoals[0]?.summary);
  assert.equal(review.orderedGoalStack.items[0]?.priorityLabel, "Priority 1");
  assert.equal(review.orderedGoalStack.items[1]?.priorityLabel, "Priority 2");
  assert.equal(review.orderedGoalStack.items[2]?.priorityLabel, "Priority 3");
  assert.match(review.reviewContract.tradeoff_statement, /Priority 1 is/i);
  assert.match(review.reviewContract.tradeoff_statement, /Priority 3 is/i);
  assert.deepEqual(confirmedStack.map((goal) => goal.planningCategory), ["running", "strength"]);
});

test("deferred appearance goals do not keep their missing proxy anchors in the finalization gate", () => {
  const packet = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" });
  const resolution = resolvePrimaryGoal("run a 1:45 half marathon", packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    confirmedPrimaryGoal: resolution.resolvedGoals[0],
    additionalGoalTexts: ["get a six pack"],
    goalFeasibility: {
      confirmationAction: "proceed",
      conflictFlags: [],
    },
    intakeCompleteness: {
      facts: {},
      missingRequired: [
        { label: "Appearance tracking proxy" },
      ],
      missingOptional: [],
    },
    answers: {
      intake_completeness: {
        fields: {
          target_timeline: { raw: "October", value: "2026-10", mode: "month" },
          current_run_frequency: { raw: "3 runs/week", value: 3 },
          running_endurance_anchor_kind: { raw: "Longest recent run", value: "longest_recent_run" },
          longest_recent_run: { raw: "7 miles", value: 7, unit: "miles", miles: 7 },
        },
      },
    },
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  assert.equal(
    arbitration.supportGoals.some((goal) => goal?.planningCategory === "body_comp")
    || arbitration.deferredGoals.some((goal) => goal?.planningCategory === "body_comp"),
    true
  );
  assert.equal(arbitration.conflictSummary.status, "clear");
  assert.equal(arbitration.finalization.ready, true);
  assert.equal(arbitration.finalization.blocked, false);
  assert.deepEqual(arbitration.finalization.blockingIssues, []);
});

test("secondary-goal arbitration dedupes the same appearance lane when it is present in both raw intent and explicit additional goals", () => {
  const primaryPacket = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" });
  const primaryResolution = resolvePrimaryGoal("run a 1:45 half marathon", primaryPacket);
  const combinedPacket = buildIntakePacket({ rawGoalText: "run a 1:45 half marathon. get a six pack" });
  const combinedResolution = resolvePrimaryGoal("run a 1:45 half marathon. get a six pack", combinedPacket);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: combinedResolution.resolvedGoals,
    confirmedPrimaryGoal: primaryResolution.resolvedGoals[0],
    additionalGoalTexts: ["get a six pack"],
    goalFeasibility: {
      confirmationAction: "proceed",
      conflictFlags: [],
    },
    intakeCompleteness: {
      facts: {},
      missingRequired: [],
      missingOptional: [],
    },
    answers: {
      goal_intent: "run a 1:45 half marathon",
      additional_goals_list: ["get a six pack"],
    },
    typedIntakePacket: combinedPacket,
    now: "2026-04-11",
  });

  const appearanceGoals = arbitration.goals.filter((goal) => (
    goal?.planningCategory === "body_comp"
    && goal?.goalFamily === "appearance"
  ));

  assert.equal(appearanceGoals.length, 1);
});

test("additional goals stay isolated from a hybrid primary sentence during arbitration", () => {
  const rawGoalText = "Bench 225 and get leaner by summer";
  const packet = buildIntakePacket({ rawGoalText });
  packet.intake.baselineContext.primaryGoalLabel = rawGoalText;
  const resolution = resolvePrimaryGoal(rawGoalText, packet);
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    confirmedPrimaryGoal: resolution.resolvedGoals[0],
    additionalGoalTexts: ["Jump higher again", "Keep shoulders healthy"],
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  const jumpGoals = arbitration.goals.filter((goal) => goal?.rawIntent?.text === "Jump higher again");
  const shoulderGoals = arbitration.goals.filter((goal) => goal?.rawIntent?.text === "Keep shoulders healthy");

  assert.equal(jumpGoals.length, 1);
  assert.equal(jumpGoals[0]?.goalFamily, "athletic_power");
  assert.equal(shoulderGoals.length, 1);
  assert.equal(shoulderGoals[0]?.goalFamily, "general_fitness");
  assert.equal(
    arbitration.goals.filter((goal) => goal?.rawIntent?.text === "Jump higher again" && goal?.goalFamily !== "athletic_power").length,
    0
  );
  assert.equal(
    arbitration.goals.filter((goal) => goal?.rawIntent?.text === "Keep shoulders healthy" && goal?.goalFamily !== "general_fitness").length,
    0
  );
});

test("malformed bmi phrasing requires clarification before arbitration finalizes", () => {
  const packet = buildIntakePacket({ rawGoalText: "BMI under 10%" });
  const resolution = resolvePrimaryGoal("BMI under 10%", packet);
  const feasibility = assessGoalFeasibility({
    resolvedGoals: resolution.resolvedGoals,
    userBaseline: packet.intake.baselineContext,
    scheduleReality: packet.intake.scheduleReality,
    currentExperienceContext: {
      injuryConstraintContext: packet.intake.injuryConstraintContext,
      equipmentAccessContext: packet.intake.equipmentAccessContext,
    },
    intakeCompleteness: {
      facts: {},
      missingRequired: [],
      missingOptional: [],
    },
    now: "2026-04-11",
  });
  const arbitration = buildGoalArbitrationStack({
    resolvedGoals: resolution.resolvedGoals,
    goalFeasibility: feasibility,
    intakeCompleteness: {
      facts: {},
      missingRequired: [],
      missingOptional: [],
    },
    typedIntakePacket: packet,
    now: "2026-04-11",
  });

  assert.equal(arbitration.finalization.ready, false);
  assert.equal(arbitration.finalization.requiresClarification, true);
  assert.equal(arbitration.conflictSummary.status, "blocked");
  assert.match(arbitration.finalization.clarificationPrompts[0], /body fat under 10%|bmi under/i);
  assert.ok(arbitration.arbitrationReasoning.decisions[0].validationIssueKeys.includes("bmi_percent_mismatch"));
});
