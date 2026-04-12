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
      payload: {
        anchor: {
          field_id: "target_timeline",
          question: "What's the race date or target month?",
          validation: { message: "Enter the race date, target month, or rough time window for this goal." },
        },
        field_id: "target_timeline",
        raw_text: "October 12",
        answer_value: "October 12",
        source: "user",
        now: TEST_NOW,
      },
    },
    {
      event_id: "evt_frequency_answered",
      type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
      timestamp: TEST_NOW,
      payload: {
        anchor: {
          field_id: "current_run_frequency",
          question: "How many times are you running in a normal week?",
          validation: { message: "Enter how many runs you do in a normal week." },
        },
        field_id: "current_run_frequency",
        raw_text: "3",
        answer_value: "3",
        source: "user",
        now: TEST_NOW,
      },
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
    payload: {
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      field_id: nextState.draft.missingAnchorsEngine.currentAnchor.field_id,
      raw_text: "October 12",
      answer_value: "October 12",
      source: "user",
      now: TEST_NOW,
    },
  });

  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "current_run_frequency");

  nextState = intakeReducer(nextState, {
    event_id: "evt_goal_frequency_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: {
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      field_id: nextState.draft.missingAnchorsEngine.currentAnchor.field_id,
      raw_text: "3",
      answer_value: "3",
      source: "user",
      now: TEST_NOW,
    },
  });

  assert.equal(nextState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "running_endurance_anchor_kind");
  assert.ok(nextState.outbox.some((message) => /Got it\./i.test(message.text)));
  assert.ok(nextState.outbox.some((message) => /Next: Which is easier right now: longest recent run or a recent race\/pace/i.test(message.text)));

  nextState = intakeReducer(nextState, {
    event_id: "evt_goal_anchor_choice_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: {
      anchor: nextState.draft.missingAnchorsEngine.currentAnchor,
      field_id: nextState.draft.missingAnchorsEngine.currentAnchor.field_id,
      raw_text: "Longest recent run",
      answer_value: {
        value: "longest_recent_run",
        raw: "Longest recent run",
      },
      source: "user",
      now: TEST_NOW,
    },
  });

  assert.equal(nextState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.field_id, "longest_recent_run");
  assert.equal(nextState.draft.missingAnchorsEngine.currentAnchor.input_type, "number_with_unit");
  assert.ok(nextState.outbox.some((message) => /Next: What's your longest recent run\?/i.test(message.text)));

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
    payload: {
      anchor: runningState.draft.missingAnchorsEngine.currentAnchor,
      field_id: runningState.draft.missingAnchorsEngine.currentAnchor.field_id,
      raw_text: "October 12",
      answer_value: "October 12",
      source: "user",
      now: TEST_NOW,
    },
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
