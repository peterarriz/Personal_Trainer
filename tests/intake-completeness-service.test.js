const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeCompletenessAnswer,
  buildIntakeCompletenessDraft,
  deriveIntakeCompletenessState,
  INTAKE_COMPLETENESS_QUESTION_KEYS,
  INTAKE_COMPLETENESS_VALUE_TYPES,
  isStructuredIntakeCompletenessQuestion,
  validateIntakeCompletenessAnswer,
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
  assert.equal(state.nextQuestions[0].expectedValueType, INTAKE_COMPLETENESS_VALUE_TYPES.strengthBaseline);
  assert.equal(isStructuredIntakeCompletenessQuestion(state.nextQuestions[0]), true);
  assert.deepEqual(state.nextQuestions[0].inputFields.map((field) => field.key), [
    "current_strength_baseline_weight",
    "current_strength_baseline_reps",
  ]);
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
  assert.equal(state.nextQuestions[0].expectedValueType, INTAKE_COMPLETENESS_VALUE_TYPES.bodyCompAnchor);
  assert.deepEqual(state.nextQuestions[0].inputFields.map((field) => field.key), [
    "current_bodyweight",
    "target_weight_change",
  ]);
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
  assert.equal(state.nextQuestions[0].expectedValueType, INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline);
  assert.equal(state.nextQuestions[1].expectedValueType, INTAKE_COMPLETENESS_VALUE_TYPES.runningBaseline);
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
  assert.equal(state.nextQuestions[0].expectedValueType, INTAKE_COMPLETENESS_VALUE_TYPES.appearanceProxyAnchor);
  assert.deepEqual(state.nextQuestions[0].inputFields.map((field) => field.key), [
    "current_bodyweight",
    "current_waist",
  ]);
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

test("structured running goal follow-up for race date validates and clears immediately", () => {
  const resolvedGoals = buildResolvedGoals("run a 2-hour half marathon");
  const question = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: {},
  }).nextQuestions[0];
  const validation = validateIntakeCompletenessAnswer({
    question,
    answerValues: {
      target_timeline: "October 12",
    },
  });
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question,
    answerValues: {
      target_timeline: "October 12",
    },
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(validation.isValid, true);
  assert.equal(validation.summaryText, "October 12");
  assert.equal(answered.answers.intake_completeness.fields.target_timeline.value, "October 12");
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming));
});

test("structured running baseline follow-up validates required fields and clears immediately", () => {
  const resolvedGoals = buildResolvedGoals("run a 2-hour half marathon");
  const question = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          target_timeline: { raw: "October 12", value: "October 12" },
        },
      },
    },
  }).nextQuestions[0];
  const validation = validateIntakeCompletenessAnswer({
    question,
    answerValues: {
      current_run_frequency: "3",
      longest_recent_run: "6 miles",
      recent_pace_baseline: "",
    },
  });
  const answered = applyIntakeCompletenessAnswer({
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          target_timeline: { raw: "October 12", value: "October 12" },
        },
      },
    },
    question,
    answerValues: {
      current_run_frequency: "3",
      longest_recent_run: "6 miles",
      recent_pace_baseline: "",
    },
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(validation.isValid, true);
  assert.match(validation.summaryText, /3 runs\/week/i);
  assert.equal(answered.answers.intake_completeness.fields.current_run_frequency.value, 3);
  assert.equal(answered.answers.intake_completeness.fields.longest_recent_run.miles, 6);
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline));
});

test("structured strength benchmark follow-up stores the current lift baseline immediately", () => {
  const resolvedGoals = buildResolvedGoals("bench 225");
  const question = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: {},
  }).nextQuestions[0];
  const validation = validateIntakeCompletenessAnswer({
    question,
    answerValues: {
      current_strength_baseline_weight: "185",
      current_strength_baseline_reps: "3",
    },
  });
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question,
    answerValues: {
      current_strength_baseline_weight: "185",
      current_strength_baseline_reps: "3",
    },
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(validation.isValid, true);
  assert.equal(validation.summaryText, "185 x 3");
  assert.equal(answered.answers.intake_completeness.fields.current_strength_baseline.weight, 185);
  assert.equal(answered.answers.intake_completeness.fields.current_strength_baseline.reps, 3);
  assert.equal(state.isComplete, true);
});

test("structured body-comp follow-up captures current bodyweight and target change cleanly", () => {
  const resolvedGoals = buildResolvedGoals("lose 20 lb");
  const question = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: {},
  }).nextQuestions[0];
  const validation = validateIntakeCompletenessAnswer({
    question,
    answerValues: {
      current_bodyweight: "191",
      target_weight_change: "20",
    },
  });
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question,
    answerValues: {
      current_bodyweight: "191",
      target_weight_change: "20",
    },
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(validation.isValid, true);
  assert.equal(answered.answers.intake_completeness.fields.current_bodyweight.value, 191);
  assert.equal(answered.answers.intake_completeness.fields.target_weight_change.value, -20);
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor));
});

test("structured appearance proxy follow-up accepts waist without contaminating other fields", () => {
  const resolvedGoals = buildResolvedGoals("look athletic again", {
    appearanceConstraints: ["look athletic again"],
  });
  const question = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: {},
  }).nextQuestions[0];
  const validation = validateIntakeCompletenessAnswer({
    question,
    answerValues: {
      current_bodyweight: "",
      current_waist: "35",
    },
  });
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question,
    answerValues: {
      current_bodyweight: "",
      current_waist: "35",
    },
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(validation.isValid, true);
  assert.equal(answered.answers.intake_completeness.fields.current_waist.value, 35);
  assert.equal(answered.answers.intake_completeness.fields.current_bodyweight, undefined);
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor));
});

test("structured drafts seed existing body-comp fields back into the follow-up form", () => {
  const question = deriveIntakeCompletenessState({
    resolvedGoals: buildResolvedGoals("lose 20 lb"),
    answers: {},
  }).nextQuestions[0];
  const draft = buildIntakeCompletenessDraft({
    question,
    answers: {
      intake_completeness: {
        version: "2026-04-v1",
        fields: {
          current_bodyweight: { raw: "191 lb", value: 191 },
          target_weight_change: { raw: "20 lb", value: -20 },
        },
      },
    },
  });

  assert.equal(draft.current_bodyweight, "191");
  assert.equal(draft.target_weight_change, "20");
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

test("appearance proxy question only stores the fields it explicitly asked for", () => {
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question: {
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
      fieldKeys: ["current_bodyweight", "current_waist"],
      source: "completeness",
    },
    answerText: "I can do photos if needed",
  });

  assert.equal(answered.answers.intake_completeness, undefined);
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

test("race date answer clears the running timing requirement immediately", () => {
  const resolvedGoals = buildResolvedGoals("run a 2-hour half marathon");
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question: {
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming,
      fieldKeys: ["target_timeline"],
      source: "completeness",
    },
    answerText: "October 12",
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(answered.answers.intake_completeness.fields.target_timeline.value, "October 12");
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming));
  assert.equal(state.nextQuestions[0]?.key, INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline);
});

test("running baseline answer with natural phrasing clears the baseline requirement immediately", () => {
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
    answerText: "3 runs, longest 90 minutes",
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(answered.answers.intake_completeness.fields.current_run_frequency.value, 3);
  assert.equal(answered.answers.intake_completeness.fields.longest_recent_run.minutes, 90);
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline));
});

test("bodyweight answer clears the body-comp anchor requirement without re-asking it", () => {
  const resolvedGoals = buildResolvedGoals("lose 20 lb");
  const answered = applyIntakeCompletenessAnswer({
    answers: {},
    question: {
      key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor,
      fieldKeys: ["current_bodyweight", "target_weight_change"],
      source: "completeness",
    },
    answerText: "191 lbs",
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(answered.answers.intake_completeness.fields.current_bodyweight.value, 191);
  assert.ok(!state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor));
  assert.equal(state.nextQuestions[0]?.key, INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompTimeline);
});

test("invalid partial running baseline answer still re-prompts correctly", () => {
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
    answerText: "3 runs",
  });
  const state = deriveIntakeCompletenessState({
    resolvedGoals,
    answers: answered.answers,
  });

  assert.equal(answered.answers.intake_completeness.fields.current_run_frequency.value, 3);
  assert.ok(state.missingRequired.some((item) => item.key === INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline));
  assert.equal(state.nextQuestions[0]?.key, INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline);
});
