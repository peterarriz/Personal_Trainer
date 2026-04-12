import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIntakeMachineDebugView,
  createIntakeMachineState,
  intakeReducer,
  INTAKE_MACHINE_EVENTS,
  INTAKE_MACHINE_STATES,
  replayIntakeMachineEvents,
  validateMissingAnchorAnswer,
} from "../src/services/intake-machine-service.js";

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
  assert.ok(nextState.outbox.some((message) => /One quick thing before I lock this in: Which is easier right now: longest recent run or a recent race\/pace/i.test(message.text)));

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
  assert.ok(nextState.outbox.some((message) => /One quick thing before I lock this in: What's your longest recent run\?/i.test(message.text)));

  const debugView = buildIntakeMachineDebugView(nextState);
  assert.equal(debugView.state, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.deepEqual(
    debugView.missing_anchors.map((item) => item.field_id),
    ["longest_recent_run"]
  );
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
  assert.equal(timelineValidation.canonicalWrites[0].fieldKey, "target_timeline");
  assert.deepEqual(timelineValidation.canonicalWrites[0].record, {
    raw: "October 2026",
    value: "2026-10",
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
        goal_intent: "bench 225 in 6 weeks",
      },
      now: TEST_NOW,
    },
  };
  const interpretationEvent = buildInterpretationEvent({
    event_id: "evt_strength_block_interpreted",
    answers: {
      goal_intent: "bench 225 in 6 weeks",
    },
    rawGoalText: "bench 225 in 6 weeks",
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
