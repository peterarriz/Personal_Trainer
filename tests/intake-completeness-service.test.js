const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveIntakeCompletenessState,
  INTAKE_COMPLETENESS_QUESTION_KEYS,
} = require("../src/services/intake-completeness-service.js");
const {
  resolveGoalTranslation,
} = require("../src/services/goal-resolution-service.js");

const buildIntakePacket = ({
  rawGoalText,
  timingConstraints = [],
  appearanceConstraints = [],
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
      trainingDaysPerWeek: 4,
      sessionLength: "45 min",
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

const buildResolvedGoals = (rawGoalText, options = {}) => (
  resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket({
      rawGoalText,
      timingConstraints: options.timingConstraints || [],
      appearanceConstraints: options.appearanceConstraints || [],
    }),
    explicitUserConfirmation: { confirmed: false, acceptedProposal: true, source: "intake_preview" },
    now: "2026-04-11",
  }).resolvedGoals
);

test("strength goal completeness asks for the current lift baseline", () => {
  const state = deriveIntakeCompletenessState({
    resolvedGoals: buildResolvedGoals("bench 225"),
    answers: {},
  });

  assert.equal(state.isComplete, false);
  assert.equal(state.missingRequired[0].key, INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline);
  assert.match(state.nextQuestions[0].prompt, /current bench press baseline/i);
});

test("weight-loss completeness asks for current bodyweight and timeline when needed", () => {
  const state = deriveIntakeCompletenessState({
    resolvedGoals: buildResolvedGoals("lose 20 lb"),
    answers: {},
  });

  assert.equal(state.isComplete, false);
  assert.deepEqual(state.missingRequired.map((item) => item.key), [
    INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor,
    INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline,
  ]);
  assert.match(state.nextQuestions[0].prompt, /current bodyweight/i);
});

test("race-goal completeness asks for race timing and current running baseline", () => {
  const state = deriveIntakeCompletenessState({
    resolvedGoals: buildResolvedGoals("run a 2-hour half marathon"),
    answers: {},
  });

  assert.equal(state.isComplete, false);
  assert.deepEqual(state.missingRequired.map((item) => item.key), [
    INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming,
    INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline,
  ]);
  assert.match(state.nextQuestions[0].prompt, /race date or target month/i);
});

test("vague appearance-goal completeness asks for a proxy anchor without forcing a timeline", () => {
  const state = deriveIntakeCompletenessState({
    resolvedGoals: buildResolvedGoals("look athletic again", {
      appearanceConstraints: ["look athletic again"],
    }),
    answers: {},
  });

  assert.equal(state.isComplete, false);
  assert.deepEqual(state.missingRequired.map((item) => item.key), [
    INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
  ]);
  assert.match(state.nextQuestions[0].prompt, /current bodyweight, waist, or progress photos/i);
});

test("multi-goal completeness keeps primary needs first and still asks for maintained strength baseline", () => {
  const resolvedGoals = buildResolvedGoals("lose fat but keep strength");
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          current_bodyweight: { raw: "205 lb", value: 205 },
          target_weight_change: { raw: "lose 20 lb", value: -20 },
          target_timeline: { raw: "by August", value: "by August" },
        },
      },
    },
  });

  assert.equal(state.isComplete, false);
  assert.deepEqual(state.missingRequired.map((item) => item.key), [
    INTAKE_COMPLETENESS_QUESTION_KEYS.maintainedStrengthBaseline,
  ]);
  assert.match(state.nextQuestions[0].prompt, /maintained strength goal/i);
});
