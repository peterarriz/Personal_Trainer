import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIntakeMachineDebugView,
  buildIntakeParseDebugView,
  createIntakeMachineState,
  intakeReducer,
  INTAKE_MACHINE_EVENTS,
  INTAKE_MACHINE_STATES,
  partitionCanonicalWritesForAnchor,
  replayIntakeMachineEvents,
  validateIntakeCommitRequest,
  validateMissingAnchorAnswer,
} from "../src/services/intake-machine-service.js";
import { applyIntakeGoalAdjustment } from "../src/services/intake-goal-flow-service.js";

const TEST_NOW = "2026-04-11T12:00:00.000Z";

const buildTypedIntakePacket = ({ rawGoalText = "" } = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background; 4 training days per week available",
      experienceLevel: "intermediate",
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
      timingConstraints: [],
      appearanceConstraints: [],
      additionalContext: "Find the balance",
    },
  },
});

const buildInterpretationEvent = ({ event_id, answers = {}, rawGoalText = "" }) => ({
  event_id,
  type: INTAKE_MACHINE_EVENTS.INTERPRETATION_READY,
  timestamp: TEST_NOW,
  payload: {
    assessment: {
      typedIntakePacket: buildTypedIntakePacket({ rawGoalText }),
      aiInterpretationProposal: null,
    },
    answers,
    now: TEST_NOW,
  },
});

const buildAnchorAnsweredPayload = ({
  anchor = null,
  raw_text = "",
  answer_value = null,
  source = "user",
} = {}) => ({
  anchor,
  binding_target: {
    anchor_id: anchor?.anchor_id || "",
    field_id: anchor?.field_id || "",
  },
  anchor_id: anchor?.anchor_id || "",
  field_id: anchor?.field_id || "",
  raw_text,
  answer_value,
  source,
  now: TEST_NOW,
});

const buildRunningAnchorState = () => {
  let nextState = createIntakeMachineState();
  nextState = intakeReducer(nextState, {
    event_id: "evt_running_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      now: TEST_NOW,
    },
  });
  return intakeReducer(nextState, buildInterpretationEvent({
    event_id: "evt_running_goal_interpreted",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));
};

const buildAppearanceAnchorState = () => {
  let nextState = createIntakeMachineState();
  nextState = intakeReducer(nextState, {
    event_id: "evt_appearance_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "look athletic again",
      },
      now: TEST_NOW,
    },
  });
  return intakeReducer(nextState, buildInterpretationEvent({
    event_id: "evt_appearance_goal_interpreted",
    answers: {
      goal_intent: "look athletic again",
    },
    rawGoalText: "look athletic again",
  }));
};

const buildConfirmableStrengthReviewState = () => {
  let nextState = createIntakeMachineState();
  nextState = intakeReducer(nextState, {
    event_id: "evt_strength_commit_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "bench 225",
      },
      now: TEST_NOW,
    },
  });
  nextState = intakeReducer(nextState, buildInterpretationEvent({
    event_id: "evt_strength_commit_goal_interpreted",
    answers: {
      goal_intent: "bench 225",
    },
    rawGoalText: "bench 225",
  }));
  nextState = intakeReducer(nextState, {
    event_id: "evt_strength_commit_baseline_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "205 estimated max",
      answer_value: {
        mode: "estimated_max",
        weight: "205",
        raw: "205 estimated max",
        value: "205",
      },
    }),
  });
  nextState = intakeReducer(nextState, {
    event_id: "evt_strength_commit_realism",
    type: INTAKE_MACHINE_EVENTS.REALISM_RESULT,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });
  return intakeReducer(nextState, {
    event_id: "evt_strength_commit_arbitration",
    type: INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });
};

test("replaying the same intake event log ends in the same state and missing anchors", () => {
  const events = [
    {
      event_id: "evt_goals_submitted",
      type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
      timestamp: TEST_NOW,
      payload: {
        answers: {
          goal_intent: "run a 2-hour half marathon",
        },
        now: TEST_NOW,
      },
    },
    buildInterpretationEvent({
      event_id: "evt_interpretation_ready",
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      rawGoalText: "run a 2-hour half marathon",
    }),
    {
      event_id: "evt_timeline_answered",
      type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
      timestamp: TEST_NOW,
      payload: buildAnchorAnsweredPayload({
        anchor: {
          anchor_id: "running_timing:target_timeline",
          field_id: "target_timeline",
          question: "What's the race date or target month?",
          validation: { message: "Enter the race date, target month, or rough time window for this goal." },
        },
        raw_text: "October 12",
        answer_value: "October 12",
      }),
    },
    {
      event_id: "evt_frequency_answered",
      type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
      timestamp: TEST_NOW,
      payload: buildAnchorAnsweredPayload({
        anchor: {
          anchor_id: "running_baseline:current_run_frequency",
          field_id: "current_run_frequency",
          question: "How many times are you running in a normal week?",
          validation: { message: "Enter how many runs you do in a normal week." },
        },
        raw_text: "3",
        answer_value: "3",
      }),
    },
  ];

  const firstReplay = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events,
  });
  const secondReplay = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events,
  });

  assert.equal(firstReplay.stage, secondReplay.stage);
  assert.equal(firstReplay.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.deepEqual(
    firstReplay.draft.missingAnchorsEngine.missingAnchors.map((anchor) => anchor.field_id),
    secondReplay.draft.missingAnchorsEngine.missingAnchors.map((anchor) => anchor.field_id)
  );
  assert.deepEqual(
    firstReplay.draft.missingAnchorsEngine.missingAnchors.map((anchor) => anchor.field_id),
    ["running_endurance_anchor_kind"]
  );
  assert.deepEqual(
    firstReplay.draft.answers.intake_completeness.fields,
    secondReplay.draft.answers.intake_completeness.fields
  );
});

test("duplicate events do not duplicate event log entries or messages", () => {
  const duplicateGoalEvent = {
    event_id: "evt_duplicate_goal",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
        additional_goals_list: ["bench 225"],
      },
      now: TEST_NOW,
    },
  };

  const finalState = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events: [
      duplicateGoalEvent,
      duplicateGoalEvent,
    ],
  });

  assert.equal(finalState.eventLog.length, 1);
  assert.equal(finalState.outbox.length, 1);
  assert.match(finalState.outbox[0].text, /Added: bench 225/i);
});

test("partial answer for a compound running requirement advances to the next missing sub-field without looping", () => {
  let nextState = createIntakeMachineState();
  nextState = intakeReducer(nextState, {
    event_id: "evt_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      now: TEST_NOW,
    },
  });
  nextState = intakeReducer(nextState, buildInterpretationEvent({
    event_id: "evt_goal_interpreted",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));
  nextState = intakeReducer(nextState, {
    event_id: "evt_goal_timeline_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });

  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_run_frequency");

  nextState = intakeReducer(nextState, {
    event_id: "evt_goal_frequency_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "3",
      answer_value: "3",
    }),
  });

  assert.equal(nextState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "running_endurance_anchor_kind");
  assert.ok(nextState.outbox.some((message) => /Got it\./i.test(message.text)));
  assert.ok(nextState.outbox.some((message) => /So I don't guess: Which is easier right now: longest recent run or a recent race\/pace/i.test(message.text)));

  nextState = intakeReducer(nextState, {
    event_id: "evt_goal_anchor_choice_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "Longest recent run",
      answer_value: {
        value: "longest_recent_run",
        raw: "Longest recent run",
      },
    }),
  });

  assert.equal(nextState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "longest_recent_run");
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.input_type, "number_with_unit");
  assert.ok(nextState.outbox.some((message) => /Last anchor for this: What's your longest recent run\?/i.test(message.text)));

  const anchorQuestions = nextState.outbox
    .filter((message) => message.message_kind === "anchor_question")
    .map((message) => message.text);
  assert.ok(anchorQuestions.every((text) => !/One quick thing before I lock this in/i.test(text)));

  const debugView = buildIntakeMachineDebugView(nextState);
  assert.equal(debugView.state, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.deepEqual(
    debugView.missing_anchors.map((item) => item.field_id),
    ["longest_recent_run"]
  );
  assert.equal(debugView.latest_binding?.field_id, "running_endurance_anchor_kind");
  assert.equal(debugView.latest_binding?.parsed_value, "longest_recent_run");
});

test("parse debug stays hidden when the dev flag is off", () => {
  let nextState = buildRunningAnchorState();
  nextState = intakeReducer(nextState, {
    event_id: "evt_parse_debug_timeline_answered_hidden",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "next year",
      answer_value: {
        value: "next year",
        raw: "next year",
        mode: "relative",
      },
    }),
  });

  const parseDebugView = buildIntakeParseDebugView({
    state: nextState,
    debugMode: false,
    toggleEnabled: true,
  });

  assert.equal(parseDebugView.visible, false);
  assert.equal(parseDebugView.field_id, "");
  assert.equal(parseDebugView.parsed_value, null);
});

test("parse debug shows parsed_value and field_id when the dev flag is on", () => {
  let nextState = buildRunningAnchorState();
  nextState = intakeReducer(nextState, {
    event_id: "evt_parse_debug_timeline_answered_visible",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "next year",
      answer_value: {
        value: "next year",
        raw: "next year",
        mode: "relative",
      },
    }),
  });

  const parseDebugView = buildIntakeParseDebugView({
    state: nextState,
    debugMode: true,
    toggleEnabled: true,
  });

  assert.equal(parseDebugView.visible, true);
  assert.equal(parseDebugView.field_id, "target_timeline");
  assert.equal(parseDebugView.parsed_value, "next year");
});

test("machine exposes field-card metadata for timeline and strength baseline parsing", () => {
  let runningState = createIntakeMachineState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_run_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      now: TEST_NOW,
    },
  });
  runningState = intakeReducer(runningState, buildInterpretationEvent({
    event_id: "evt_run_goal_interpreted",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));

  assert.equal(runningState.draft.missingAnchorsEngine.currentAnchor.field_id, "target_timeline");
  assert.equal(runningState.draft.missingAnchorsEngine.currentAnchor.input_type, "date_or_month");
  assert.ok(runningState.draft.missingAnchorsEngine.currentAnchor.why_it_matters);
  assert.ok(runningState.draft.missingAnchorsEngine.currentAnchor.coach_voice_line);

  const timelineValidation = validateMissingAnchorAnswer({
    anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
    raw_text: "October 2026",
    answer_value: {
      mode: "month",
      value: "2026-10",
      raw: "October 2026",
    },
  });

  assert.equal(timelineValidation.isValid, true);
  assert.equal(timelineValidation.summaryText, "October 2026");
  assert.deepEqual(
    timelineValidation.canonicalWrites.map((item) => item.fieldKey),
    ["target_timeline"]
  );
  assert.deepEqual(timelineValidation.canonicalWrites[0].record, {
    raw: "October 2026",
    value: "2026-10",
  });

  const naturalTimelineValidation = validateMissingAnchorAnswer({
    anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
    raw_text: "by summer",
    answer_value: "by summer",
  });

  assert.equal(naturalTimelineValidation.isValid, true);
  assert.equal(naturalTimelineValidation.summaryText, "by summer");
  assert.deepEqual(naturalTimelineValidation.canonicalWrites[0].record, {
    raw: "by summer",
    value: "by summer",
  });

  let strengthState = createIntakeMachineState();
  strengthState = intakeReducer(strengthState, {
    event_id: "evt_strength_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "bench 225",
      },
      now: TEST_NOW,
    },
  });
  strengthState = intakeReducer(strengthState, buildInterpretationEvent({
    event_id: "evt_strength_goal_interpreted",
    answers: {
      goal_intent: "bench 225",
    },
    rawGoalText: "bench 225",
  }));

  assert.equal(strengthState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_strength_baseline");
  assert.equal(strengthState.draft.missingAnchorsEngine.currentAnchor.input_type, "strength_top_set");

  const strengthValidation = validateMissingAnchorAnswer({
    anchor: strengthState.draft.missingAnchorsEngine.currentAnchor,
    raw_text: "185x5 and my conditioning is bad",
    answer_value: "185x5 and my conditioning is bad",
  });

  assert.equal(strengthValidation.isValid, true);
  assert.deepEqual(strengthValidation.parsed_value, {
    canonical_field_id: "current_strength_baseline",
    weight: 185,
    reps: 5,
  });
  assert.equal(strengthValidation.summaryText, "185x5");
  assert.deepEqual(strengthValidation.canonicalWrites[0].record, {
    raw: "185x5",
    value: 185,
    weight: 185,
    reps: 5,
  });

  const estimatedMaxValidation = validateMissingAnchorAnswer({
    anchor: strengthState.draft.missingAnchorsEngine.currentAnchor,
    raw_text: "205 estimated max",
    answer_value: {
      mode: "estimated_max",
      weight: "205",
      raw: "205 estimated max",
      value: "205",
    },
  });

  assert.equal(estimatedMaxValidation.isValid, true);
  assert.equal(estimatedMaxValidation.summaryText, "205 estimated max");
  assert.deepEqual(estimatedMaxValidation.canonicalWrites[0].record, {
    raw: "205 estimated max",
    value: 205,
    weight: 205,
    reps: 1,
  });
});

test("current field validation ignores extra facts that do not match the active field schema", () => {
  let runningState = createIntakeMachineState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_run_goal_submit_extra_facts",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      now: TEST_NOW,
    },
  });
  runningState = intakeReducer(runningState, buildInterpretationEvent({
    event_id: "evt_run_goal_interpreted_extra_facts",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));
  runningState = intakeReducer(runningState, {
    event_id: "evt_run_goal_timeline_answered_extra_facts",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });

  const frequencyValidation = validateMissingAnchorAnswer({
    anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
    raw_text: "3 runs a week and my longest run is 8 miles",
    answer_value: "3 runs a week and my longest run is 8 miles",
  });

  assert.equal(runningState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_run_frequency");
  assert.equal(frequencyValidation.isValid, true);
  assert.equal(frequencyValidation.summaryText, "3 runs/week");
  assert.deepEqual(
    frequencyValidation.canonicalWrites.map((item) => item.fieldKey),
    ["current_run_frequency"]
  );
});

test("strict canonical write partition rejects stray writes outside the current anchor field", () => {
  let runningState = buildRunningAnchorState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_timeline_before_write_partition_test",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "next year",
      answer_value: "next year",
    }),
  });

  const activeAnchor = runningState.draft.missingAnchorsEngine.currentAnchor;
  const partitioned = partitionCanonicalWritesForAnchor({
    anchor: activeAnchor,
    canonicalWrites: [
      {
        fieldKey: "current_run_frequency",
        record: { raw: "3", value: 3 },
      },
      {
        fieldKey: "longest_recent_run",
        record: { raw: "8 miles", value: 8, miles: 8 },
      },
    ],
    phase: "test",
  });

  assert.equal(activeAnchor.field_id, "current_run_frequency");
  assert.deepEqual(
    partitioned.acceptedWrites.map((item) => item.fieldKey),
    ["current_run_frequency"]
  );
  assert.deepEqual(
    partitioned.rejectedWrites.map((item) => item.fieldKey),
    ["longest_recent_run"]
  );
});

test("timeline answers clear only target_timeline on the current anchor", () => {
  const runningState = buildRunningAnchorState();
  const nextState = intakeReducer(runningState, {
    event_id: "evt_timeline_binding_scoped",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "next year",
      answer_value: "next year",
    }),
  });

  assert.equal(nextState.draft.answers.intake_completeness.fields.target_timeline.value, "next year");
  assert.equal(nextState.draft.answers.intake_completeness.fields.current_run_frequency, undefined);
  assert.equal(nextState.draft.answers.intake_completeness.fields.longest_recent_run, undefined);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_run_frequency");
});

test("anchor prompts use deterministic variation instead of repeating the same opener across fields", () => {
  const runningState = buildRunningAnchorState();
  const firstAnchorQuestion = runningState.outbox
    .filter((message) => message.message_kind === "anchor_question")
    .at(-1);
  const nextState = intakeReducer(runningState, {
    event_id: "evt_timeline_variation_check",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });
  const secondAnchorQuestion = nextState.outbox
    .filter((message) => message.message_kind === "anchor_question")
    .at(-1);

  assert.equal(firstAnchorQuestion?.text, "So I don't guess: What's the race date or target month?");
  assert.equal(secondAnchorQuestion?.text, "Quick baseline check: How many times are you running in a normal week?");
  assert.notEqual(firstAnchorQuestion?.text, secondAnchorQuestion?.text);
});

test("season timeline answers clear only target_timeline on the current anchor", () => {
  const runningState = buildRunningAnchorState();
  const nextState = intakeReducer(runningState, {
    event_id: "evt_timeline_binding_scoped_by_summer",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "by summer",
      answer_value: "by summer",
    }),
  });

  assert.equal(nextState.draft.answers.intake_completeness.fields.target_timeline.raw, "by summer");
  assert.equal(nextState.draft.answers.intake_completeness.fields.target_timeline.value, "by summer");
  assert.equal(nextState.draft.answers.intake_completeness.fields.current_run_frequency, undefined);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_run_frequency");
});

test("runs per week answers clear only current_run_frequency on the current anchor", () => {
  let runningState = buildRunningAnchorState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_timeline_for_frequency_scope",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });

  const nextState = intakeReducer(runningState, {
    event_id: "evt_frequency_binding_scoped",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "3 runs a week and my longest run is 8 miles",
      answer_value: "3 runs a week and my longest run is 8 miles",
    }),
  });

  assert.equal(nextState.draft.answers.intake_completeness.fields.current_run_frequency.value, 3);
  assert.equal(nextState.draft.answers.intake_completeness.fields.longest_recent_run, undefined);
  assert.equal(nextState.draft.answers.intake_completeness.fields.recent_pace_baseline, undefined);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "running_endurance_anchor_kind");
});

test("edit last answer re-asks the same first anchor without resetting intake", () => {
  let runningState = buildRunningAnchorState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_edit_last_timeline_answer",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });

  const editedState = intakeReducer(runningState, {
    event_id: "evt_user_back_edit_last_anchor",
    type: INTAKE_MACHINE_EVENTS.USER_BACK,
    timestamp: TEST_NOW,
    payload: {
      edit_last_anchor: true,
      now: TEST_NOW,
    },
  });

  assert.equal(editedState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(editedState.draft.answers.intake_completeness.fields.target_timeline, undefined);
  assert.equal(editedState.draft.missingAnchorsEngine.currentAnchor.field_id, "target_timeline");
  assert.equal(editedState.anchorBindingLog.length, 0);
  assert.equal(editedState.anchorBindingsByFieldId.target_timeline, undefined);
  assert.equal(editedState.ui.currentBindingTarget.field_id, "target_timeline");
  assert.ok(editedState.draft.typedIntakePacket);
});

test("edit last answer only removes the most recent anchor field and keeps earlier answers intact", () => {
  let runningState = buildRunningAnchorState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_edit_last_keep_timeline",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });
  runningState = intakeReducer(runningState, {
    event_id: "evt_edit_last_keep_frequency",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "3 runs a week",
      answer_value: "3 runs a week",
    }),
  });

  const editedState = intakeReducer(runningState, {
    event_id: "evt_user_back_edit_frequency_anchor",
    type: INTAKE_MACHINE_EVENTS.USER_BACK,
    timestamp: TEST_NOW,
    payload: {
      edit_last_anchor: true,
      now: TEST_NOW,
    },
  });

  assert.equal(editedState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(editedState.draft.answers.intake_completeness.fields.target_timeline.value, "October 12");
  assert.equal(editedState.draft.answers.intake_completeness.fields.current_run_frequency, undefined);
  assert.equal(editedState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_run_frequency");
  assert.equal(editedState.anchorBindingLog.length, 1);
  assert.equal(editedState.anchorBindingsByFieldId.target_timeline?.field_id, "target_timeline");
  assert.equal(editedState.anchorBindingsByFieldId.current_run_frequency, undefined);
});

test("anchor answers reject missing or mismatched binding targets", () => {
  const runningState = buildRunningAnchorState();
  const missingBindingState = intakeReducer(runningState, {
    event_id: "evt_missing_binding_target",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: {
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
      source: "user",
      now: TEST_NOW,
    },
  });

  assert.match(missingBindingState.ui.lastParseError, /binding target/i);
  assert.equal(missingBindingState.draft.answers.intake_completeness?.fields?.target_timeline, undefined);

  const mismatchedBindingState = intakeReducer(runningState, {
    event_id: "evt_mismatched_binding_target",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: {
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      binding_target: {
        anchor_id: "running_baseline:current_run_frequency",
        field_id: "current_run_frequency",
      },
      anchor_id: "running_baseline:current_run_frequency",
      field_id: "current_run_frequency",
      raw_text: "3",
      answer_value: "3",
      source: "user",
      now: TEST_NOW,
    },
  });

  assert.match(mismatchedBindingState.ui.lastParseError, /different intake field/i);
  assert.equal(mismatchedBindingState.draft.answers.intake_completeness?.fields?.current_run_frequency, undefined);
});

test("appearance proxy flow asks for a proxy choice first and then clears only the selected value field", () => {
  let appearanceState = buildAppearanceAnchorState();

  assert.equal(appearanceState.draft.missingAnchorsEngine.currentAnchor.field_id, "appearance_proxy_anchor_kind");

  appearanceState = intakeReducer(appearanceState, {
    event_id: "evt_appearance_proxy_choice",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: appearanceState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "Waist",
      answer_value: {
        value: "current_waist",
        raw: "Waist",
      },
    }),
  });

  assert.equal(appearanceState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_waist");

  appearanceState = intakeReducer(appearanceState, {
    event_id: "evt_appearance_proxy_value",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: appearanceState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "35 in",
      answer_value: {
        value: "35",
        unit: "in",
        raw: "35 in",
      },
    }),
  });

  assert.equal(appearanceState.draft.answers.intake_completeness.fields.current_waist.value, 35);
  assert.equal(appearanceState.draft.answers.intake_completeness.fields.current_bodyweight, undefined);
  assert.notEqual(appearanceState.draft.missingAnchorsEngine.currentAnchor?.field_id, "appearance_proxy_anchor_kind");
});

test("replayed intake never enables confirmation while required details are still missing", () => {
  const events = [
    {
      event_id: "evt_missing_required_goal_submit",
      type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
      timestamp: TEST_NOW,
      payload: {
        answers: {
          goal_intent: "run a 2-hour half marathon",
        },
        now: TEST_NOW,
      },
    },
    buildInterpretationEvent({
      event_id: "evt_missing_required_interpreted",
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      rawGoalText: "run a 2-hour half marathon",
    }),
  ];

  const finalState = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events,
  });

  assert.ok(finalState.draft.intakeCompleteness.missingRequired.length > 0);
  assert.equal(finalState.draft.confirmationState.status, "incomplete");
  assert.equal(finalState.draft.confirmationState.canConfirm, false);
  assert.equal(finalState.draft.confirmationState.next_required_field, "target_timeline");
});

test("replayed intake keeps confirmation disabled when feasibility blocks the goal", () => {
  const goalSubmittedEvent = {
    event_id: "evt_strength_block_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "bench 900",
      },
      now: TEST_NOW,
    },
  };
  const interpretationEvent = buildInterpretationEvent({
    event_id: "evt_strength_block_interpreted",
    answers: {
      goal_intent: "bench 900",
    },
    rawGoalText: "bench 900",
  });

  let strengthState = intakeReducer(createIntakeMachineState(), goalSubmittedEvent);
  strengthState = intakeReducer(strengthState, interpretationEvent);
  const baselineAnchor = strengthState.draft.missingAnchorsEngine.currentAnchor;

  const finalState = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events: [
      goalSubmittedEvent,
      interpretationEvent,
      {
        event_id: "evt_strength_block_baseline",
        type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
        timestamp: TEST_NOW,
        payload: buildAnchorAnsweredPayload({
          anchor: baselineAnchor,
          raw_text: "135x3",
          answer_value: "135x3",
        }),
      },
      {
        event_id: "evt_strength_block_realism",
        type: INTAKE_MACHINE_EVENTS.REALISM_RESULT,
        timestamp: TEST_NOW,
        payload: {
          now: TEST_NOW,
        },
      },
      {
        event_id: "evt_strength_block_arbitration",
        type: INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT,
        timestamp: TEST_NOW,
        payload: {
          now: TEST_NOW,
        },
      },
    ],
  });

  assert.equal(finalState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(finalState.draft.intakeCompleteness.missingRequired.length, 0);
  assert.equal(finalState.draft.goalFeasibility.confirmationAction, "block");
  assert.equal(finalState.draft.confirmationState.status, "block");
  assert.equal(finalState.draft.confirmationState.canConfirm, false);
});

test("confirmed intake requests a single canonical commit snapshot and ignores duplicate confirm events", () => {
  const reviewState = buildConfirmableStrengthReviewState();
  const reviewEvents = reviewState.eventLog.map((entry) => ({
    event_id: entry.event_id,
    type: entry.type,
    timestamp: entry.timestamp,
    payload: entry.payload,
  }));
  const replayedReviewState = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events: reviewEvents,
  });
  assert.equal(replayedReviewState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(replayedReviewState.draft.confirmationState.status, "proceed");

  const committedState = intakeReducer(replayedReviewState, {
    event_id: "evt_strength_commit_confirm",
    type: INTAKE_MACHINE_EVENTS.USER_CONFIRMED,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });

  assert.equal(committedState.stage, INTAKE_MACHINE_STATES.COMMIT);
  assert.equal(committedState.draft.commitRequested, true);
  assert.equal(
    committedState.draft.commitRequest.confirmation_snapshot_id,
    replayedReviewState.transition_id
  );
  assert.equal(
    validateIntakeCommitRequest(committedState.draft.commitRequest).ok,
    true
  );
  assert.equal(
    committedState.draft.commitRequest.confirmedResolvedGoals[0].intakeConfirmedRole,
    "primary"
  );

  const duplicateConfirmState = intakeReducer(committedState, {
    event_id: "evt_strength_commit_confirm_duplicate",
    type: INTAKE_MACHINE_EVENTS.USER_CONFIRMED,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });

  assert.equal(duplicateConfirmState, committedState);
});

test("successful commit consumption clears the pending request and records the committed snapshot", () => {
  const reviewState = buildConfirmableStrengthReviewState();
  const committedState = intakeReducer(reviewState, {
    event_id: "evt_strength_commit_confirm_once",
    type: INTAKE_MACHINE_EVENTS.USER_CONFIRMED,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });

  const consumedState = intakeReducer(committedState, {
    event_id: "evt_strength_commit_done",
    type: INTAKE_MACHINE_EVENTS.COMMIT_COMPLETED,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });

  assert.equal(consumedState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(consumedState.draft.commitRequested, false);
  assert.equal(consumedState.draft.commitRequest, null);
  assert.equal(
    consumedState.draft.lastCommittedSnapshotId,
    committedState.draft.commitRequest.confirmation_snapshot_id
  );
});

test("editing a goal clears any pending commit request and stale AI interpretation proposal", () => {
  const reviewState = buildConfirmableStrengthReviewState();
  const committedState = intakeReducer(reviewState, {
    event_id: "evt_strength_commit_for_edit_reset",
    type: INTAKE_MACHINE_EVENTS.USER_CONFIRMED,
    timestamp: TEST_NOW,
    payload: {
      now: TEST_NOW,
    },
  });

  const editedState = intakeReducer(committedState, {
    event_id: "evt_strength_edit_after_commit_request",
    type: INTAKE_MACHINE_EVENTS.USER_EDITED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        ...committedState.draft.answers,
        goal_intent: "bench 275",
      },
      now: TEST_NOW,
    },
  });

  assert.equal(editedState.stage, INTAKE_MACHINE_STATES.FREEFORM_GOALS);
  assert.equal(editedState.draft.commitRequested, false);
  assert.equal(editedState.draft.commitRequest, null);
  assert.equal(editedState.draft.aiInterpretationProposal, null);
});

test("editing the goal after answering running anchors resets stale intake state before the next goal is interpreted", () => {
  let runningState = createIntakeMachineState();
  runningState = intakeReducer(runningState, {
    event_id: "evt_running_edit_reset_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
        injury_text: "Right Achilles gets cranky with speed work.",
        training_days: "4",
        session_length: "45",
        home_equipment: ["Bands", "Pull-up bar"],
      },
      now: TEST_NOW,
    },
  });
  runningState = intakeReducer(runningState, buildInterpretationEvent({
    event_id: "evt_running_edit_reset_interpreted",
    answers: runningState.draft.answers,
    rawGoalText: "run a 2-hour half marathon",
  }));
  runningState = intakeReducer(runningState, {
    event_id: "evt_running_edit_reset_timeline",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });
  runningState = intakeReducer(runningState, {
    event_id: "evt_running_edit_reset_frequency",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "3 runs a week",
      answer_value: "3 runs a week",
    }),
  });

  assert.equal(runningState.draft.missingAnchorsEngine.currentAnchor.field_id, "running_endurance_anchor_kind");
  assert.equal(runningState.draft.answers.intake_completeness.fields.target_timeline.value, "October 12");
  assert.equal(runningState.draft.answers.intake_completeness.fields.current_run_frequency.value, 3);

  const adjustmentOutcome = applyIntakeGoalAdjustment({
    answers: runningState.draft.answers,
    adjustmentText: "Actually, I want to bench 225",
    currentResolvedGoal: runningState.draft.reviewModel?.activeResolvedGoals?.[0] || null,
    currentPrimaryGoalKey: runningState.draft.answers.primary_goal || "",
    now: new Date(TEST_NOW),
  });

  assert.equal(adjustmentOutcome.kind, "goal_replacement");

  const editedState = intakeReducer(runningState, {
    event_id: "evt_running_edit_reset_user_edited",
    type: INTAKE_MACHINE_EVENTS.USER_EDITED,
    timestamp: TEST_NOW,
    payload: {
      answers: adjustmentOutcome.answers,
      now: TEST_NOW,
    },
  });

  assert.equal(editedState.stage, INTAKE_MACHINE_STATES.FREEFORM_GOALS);
  assert.deepEqual(editedState.draft.missingAnchorsEngine, {
    missingAnchors: [],
    orderedFieldIds: [],
    currentAnchor: null,
    completenessState: null,
  });
  assert.deepEqual(editedState.anchorBindingsByFieldId, {});
  assert.deepEqual(editedState.anchorFailureCounts, {});
  assert.equal(editedState.draft.typedIntakePacket, null);
  assert.equal(editedState.draft.aiInterpretationProposal, null);
  assert.equal(editedState.draft.goalResolution, null);
  assert.equal(editedState.draft.goalFeasibility, null);
  assert.equal(editedState.draft.arbitration, null);
  assert.deepEqual(editedState.draft.orderedResolvedGoals, []);
  assert.equal(editedState.draft.reviewModel, null);
  assert.equal(editedState.draft.confirmationState, null);
  assert.equal(editedState.draft.intakeCompleteness, null);
  assert.equal(editedState.draft.answers.intake_completeness.fields.target_timeline, undefined);
  assert.equal(editedState.draft.answers.intake_completeness.fields.current_run_frequency, undefined);
  assert.equal(editedState.draft.answers.injury_text, "Right Achilles gets cranky with speed work.");
  assert.equal(editedState.draft.answers.training_days, "4");
  assert.equal(editedState.draft.answers.session_length, "45");
  assert.deepEqual(editedState.draft.answers.home_equipment, ["Bands", "Pull-up bar"]);

  let strengthState = intakeReducer(editedState, {
    event_id: "evt_strength_after_edit_goal_submit",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: editedState.draft.answers,
      now: TEST_NOW,
    },
  });
  strengthState = intakeReducer(strengthState, buildInterpretationEvent({
    event_id: "evt_strength_after_edit_interpreted",
    answers: strengthState.draft.answers,
    rawGoalText: "bench 225",
  }));

  assert.equal(strengthState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_strength_baseline");
  assert.equal(strengthState.draft.answers.intake_completeness.fields.target_timeline, undefined);
  assert.equal(strengthState.draft.answers.intake_completeness.fields.current_run_frequency, undefined);
});
