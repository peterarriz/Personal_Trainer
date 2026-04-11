const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeCompletenessAnswer,
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
  assert.match(state.nextQuestions[0].prompt, /current bodyweight or waist/i);
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

test("field-scoped bodyweight answer binds only to the bodyweight anchor field", () => {
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question: {
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor,
      fieldKeys: ["current_bodyweight", "target_weight_change"],
      source: "completeness",
    },
    answerText: "191 lbs",
  });

  assert.equal(answered.answers.intake_completeness.fields.current_bodyweight.value, 191);
  assert.equal(answered.answers.intake_completeness.fields.current_strength_baseline, undefined);
  assert.equal(answered.answers.intake_completeness.fields.target_timeline, undefined);
});

test("field-scoped appearance proxy answer stays a proxy anchor instead of a strength target", () => {
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question: {
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
      fieldKeys: ["current_bodyweight", "current_waist"],
      source: "completeness",
    },
    answerText: "225 lbs",
  });

  assert.equal(answered.answers.intake_completeness.fields.current_bodyweight.value, 225);
  assert.equal(answered.answers.intake_completeness.fields.current_strength_baseline, undefined);
});

test("running baseline answer satisfies the required baseline field when it includes frequency and long-run detail", () => {
  const resolvedGoals = buildResolvedGoals("run a 2-hour half marathon");
  const answered = applyIntakeCompletenessAnswer({
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          target_timeline: { raw: "October 12", value: "October 12" },
        },
      },
    },
    question: {
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline,
      fieldKeys: ["current_run_frequency", "longest_recent_run", "recent_pace_baseline"],
      source: "completeness",
    },
    answerText: "3x/week, longest 6 miles",
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(answered.answers.intake_completeness.fields.current_run_frequency.value, 3);
  assert.equal(answered.answers.intake_completeness.fields.longest_recent_run.miles, 6);
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline));
});
