const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTranscriptMessageKey,
  queueCoachTranscriptMessages,
  resolveNextCoachStreamTargetId,
  TRANSCRIPT_MESSAGE_KINDS,
} = require("../src/services/intake-transcript-service.js");
const {
  createIntakeMachineState,
  intakeReducer,
  INTAKE_MACHINE_EVENTS,
} = require("../src/services/intake-machine-service.js");

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
      text: "I mapped the goal and I just need a couple of anchors before planning.",
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

test("clarification sequence queues in the expected order and targets the first message for streaming", () => {
  const queue = queueCoachTranscriptMessages({
    texts: [
      "Quick baseline check: What's your current running baseline?",
      "I still need one or two critical anchors before I can build credibly.",
    ],
    nextMessageId: 11,
  });

  assert.deepEqual(queue.entries.map((entry) => entry.text), [
    "Quick baseline check: What's your current running baseline?",
    "I still need one or two critical anchors before I can build credibly.",
  ]);
  assert.deepEqual(queue.entries.map((entry) => entry.id), [11, 12]);
  assert.equal(resolveNextCoachStreamTargetId({
    currentStreamTargetId: null,
    queuedEntries: queue.entries,
  }), 11);
});

test("repeated clarification updates preserve stable order without letting a later message steal the stream target", () => {
  const firstQueue = queueCoachTranscriptMessages({
    texts: [
      "So I don't guess: What's the race date or target month?",
      "I still need one or two critical anchors before I can build credibly.",
    ],
    nextMessageId: 21,
  });
  const secondQueue = queueCoachTranscriptMessages({
    texts: [
      "Quick baseline check: What's your current running baseline?",
      "I still need one or two critical anchors before I can build credibly.",
    ],
    nextMessageId: firstQueue.nextMessageId,
  });

  assert.equal(resolveNextCoachStreamTargetId({
    currentStreamTargetId: null,
    queuedEntries: firstQueue.entries,
  }), 21);
  assert.equal(resolveNextCoachStreamTargetId({
    currentStreamTargetId: 21,
    queuedEntries: secondQueue.entries,
  }), 21);
  assert.deepEqual(secondQueue.entries.map((entry) => entry.id), [23, 24]);
});

test("late goal edit follow-up messages keep insertion order stable across multiple queued batches", () => {
  const adjustmentQueue = queueCoachTranscriptMessages({
    texts: ["Tell me what you want to change and I'll recalibrate it before I build."],
    nextMessageId: 31,
  });
  const clarificationQueue = queueCoachTranscriptMessages({
    texts: [
      "So I don't guess: What's the race date or target month?",
      "I still need one critical detail first: What's the race date or target month?",
    ],
    nextMessageId: adjustmentQueue.nextMessageId,
  });

  const allTexts = [...adjustmentQueue.entries, ...clarificationQueue.entries].map((entry) => entry.text);
  assert.deepEqual(allTexts, [
    "Tell me what you want to change and I'll recalibrate it before I build.",
    "So I don't guess: What's the race date or target month?",
    "I still need one critical detail first: What's the race date or target month?",
  ]);
  assert.equal(resolveNextCoachStreamTargetId({
    currentStreamTargetId: null,
    queuedEntries: adjustmentQueue.entries,
  }), 31);
});

test("anchor question idempotency keys prevent duplicate transcript messages for the same anchor", () => {
  const anchorQuestionKey = buildTranscriptMessageKey({
    stage: "ANCHOR_COLLECTION",
    anchor_id: "running_timing:target_timeline",
    transition_id: "transition_000002",
    message_kind: TRANSCRIPT_MESSAGE_KINDS.anchorQuestion,
  });
  const firstQueue = queueCoachTranscriptMessages({
    texts: [
      {
        text: "So I don't guess: What's the race date or target month?",
        message_key: anchorQuestionKey,
      },
      {
        text: "So I don't guess: What's the race date or target month?",
        message_key: anchorQuestionKey,
      },
    ],
    nextMessageId: 41,
  });

  assert.equal(firstQueue.entries.length, 1);
  assert.equal(firstQueue.entries[0].idempotency_key, anchorQuestionKey);

  const secondQueue = queueCoachTranscriptMessages({
    texts: [
      {
        text: "So I don't guess: What's the race date or target month?",
        message_key: anchorQuestionKey,
      },
    ],
    nextMessageId: firstQueue.nextMessageId,
    seenMessageKeys: firstQueue.acceptedMessageKeys,
  });

  assert.equal(secondQueue.entries.length, 0);
});

test("answering one anchor and recomputing only queues the next anchor question once", () => {
  let machineState = createIntakeMachineState();
  machineState = intakeReducer(machineState, {
    event_id: "evt_goal_submit_for_transcript",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
      },
      now: TEST_NOW,
    },
  });
  machineState = intakeReducer(machineState, buildInterpretationEvent({
    event_id: "evt_goal_interpreted_for_transcript",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));

  const firstQueue = queueCoachTranscriptMessages({
    texts: machineState.outbox.map((message) => ({
      text: message.text,
      message_key: message.message_key || message.idempotency_key || message.key,
      transition_id: message.transition_id,
      stage: message.stage,
      anchor_id: message.anchor_id,
      message_kind: message.message_kind,
    })),
    nextMessageId: 101,
    activeTransitionId: machineState.transition_id,
  });

  machineState = intakeReducer(machineState, {
    event_id: "evt_timeline_answered_for_transcript",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: machineState.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });

  const secondQueue = queueCoachTranscriptMessages({
    texts: machineState.outbox.map((message) => ({
      text: message.text,
      message_key: message.message_key || message.idempotency_key || message.key,
      transition_id: message.transition_id,
      stage: message.stage,
      anchor_id: message.anchor_id,
      message_kind: message.message_kind,
    })),
    nextMessageId: firstQueue.nextMessageId,
    seenMessageKeys: firstQueue.acceptedMessageKeys,
    activeTransitionId: machineState.transition_id,
  });

  const anchorQuestions = secondQueue.entries.filter((entry) => entry.message_kind === TRANSCRIPT_MESSAGE_KINDS.anchorQuestion);
  assert.equal(anchorQuestions.length, 1);
  assert.match(anchorQuestions[0].text, /running.*normal week/i);
});

test("committed goal-added notes do not duplicate when the same outbox is drained twice", () => {
  const machineState = intakeReducer(createIntakeMachineState(), {
    event_id: "evt_goal_added_once",
    type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
    timestamp: TEST_NOW,
    payload: {
      answers: {
        goal_intent: "run a 2-hour half marathon",
        additional_goals_list: ["bench 225"],
      },
      now: TEST_NOW,
    },
  });

  const firstQueue = queueCoachTranscriptMessages({
    texts: machineState.outbox.map((message) => ({
      text: message.text,
      message_key: message.message_key || message.idempotency_key || message.key,
      transition_id: message.transition_id,
      stage: message.stage,
      anchor_id: message.anchor_id,
      message_kind: message.message_kind,
    })),
    nextMessageId: 131,
    activeTransitionId: machineState.transition_id,
  });

  const secondQueue = queueCoachTranscriptMessages({
    texts: machineState.outbox.map((message) => ({
      text: message.text,
      message_key: message.message_key || message.idempotency_key || message.key,
      transition_id: message.transition_id,
      stage: message.stage,
      anchor_id: message.anchor_id,
      message_kind: message.message_kind,
    })),
    nextMessageId: firstQueue.nextMessageId,
    seenMessageKeys: firstQueue.acceptedMessageKeys,
    activeTransitionId: machineState.transition_id,
  });

  assert.equal(firstQueue.entries.filter((entry) => /Added: bench 225/i.test(entry.text)).length, 1);
  assert.equal(secondQueue.entries.length, 0);
});

test("secondary-goal added note does not duplicate when a live UI note and the machine outbox share the same key", () => {
  const goalAddedKey = "goal_added:bench 225";
  const liveQueue = queueCoachTranscriptMessages({
    texts: [{
      text: "Added bench 225. If there's another goal that matters, drop it in. Otherwise we can keep moving.",
      message_key: goalAddedKey,
      idempotency_key: goalAddedKey,
      message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      transition_id: "transition_000123",
      stage: "REVIEW_CONFIRM",
    }],
    nextMessageId: 151,
    activeTransitionId: "transition_000123",
  });

  const outboxQueue = queueCoachTranscriptMessages({
    texts: [{
      text: "Added: bench 225.",
      message_key: goalAddedKey,
      idempotency_key: goalAddedKey,
      message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      transition_id: "transition_000123",
      stage: "REVIEW_CONFIRM",
    }],
    nextMessageId: liveQueue.nextMessageId,
    seenMessageKeys: liveQueue.acceptedMessageKeys,
    activeTransitionId: "transition_000123",
  });

  assert.equal(liveQueue.entries.length, 1);
  assert.equal(outboxQueue.entries.length, 0);
});

test("late AI proposal summaries are discarded once intake has moved to a newer transition", () => {
  const lateAiKey = buildTranscriptMessageKey({
    transition_id: "transition_000002",
    intent: "intake_interpretation",
    packet_version: "2026-04-v1",
    message_kind: TRANSCRIPT_MESSAGE_KINDS.aiSummary,
  });
  const lateQueue = queueCoachTranscriptMessages({
    texts: [{
      text: "This late summary should never hit the transcript.",
      message_key: lateAiKey,
      transition_id: "transition_000002",
      message_kind: TRANSCRIPT_MESSAGE_KINDS.aiSummary,
      intent: "intake_interpretation",
      packet_version: "2026-04-v1",
    }],
    nextMessageId: 151,
    activeTransitionId: "transition_000003",
  });

  assert.equal(lateQueue.entries.length, 0);

  const currentQueue = queueCoachTranscriptMessages({
    texts: [{
      text: "This current summary is still allowed.",
      message_key: buildTranscriptMessageKey({
        transition_id: "transition_000003",
        intent: "intake_interpretation",
        packet_version: "2026-04-v1",
        message_kind: TRANSCRIPT_MESSAGE_KINDS.aiSummary,
      }),
      transition_id: "transition_000003",
      message_kind: TRANSCRIPT_MESSAGE_KINDS.aiSummary,
      intent: "intake_interpretation",
      packet_version: "2026-04-v1",
    }],
    nextMessageId: 151,
    activeTransitionId: "transition_000003",
  });

  assert.equal(currentQueue.entries.length, 1);
  assert.equal(currentQueue.entries[0].message_kind, TRANSCRIPT_MESSAGE_KINDS.aiSummary);
});

test("system-note topics keep review notes distinct while deduping repeated blocked confirmation notes", () => {
  const transitionId = "transition_000321";
  const stage = "REVIEW_CONFIRM";
  const secondaryPromptKey = buildTranscriptMessageKey({
    stage,
    transition_id: transitionId,
    message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
    topic: "secondary_goal_prompt",
  });
  const blockedConfirmKey = buildTranscriptMessageKey({
    stage,
    transition_id: transitionId,
    message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
    topic: "confirm_blocked_target_timeline",
  });

  const queue = queueCoachTranscriptMessages({
    texts: [
      {
        text: "Anything else you want to improve or maintain while chasing this?",
        message_key: secondaryPromptKey,
        transition_id: transitionId,
        stage,
        message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      },
      {
        text: "I still need your race timing before I can build this.",
        message_key: blockedConfirmKey,
        transition_id: transitionId,
        stage,
        message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      },
      {
        text: "I still need your race timing before I can build this.",
        message_key: blockedConfirmKey,
        transition_id: transitionId,
        stage,
        message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      },
    ],
    nextMessageId: 181,
    activeTransitionId: transitionId,
  });

  assert.equal(queue.entries.length, 2);
  assert.equal(queue.entries[0].message_key, secondaryPromptKey);
  assert.equal(queue.entries[1].message_key, blockedConfirmKey);
});

test("stable review-note keys dedupe repeated blocked notes even when review recomputes advance the transition id", () => {
  const blockedConfirmKey = "review_note:confirm_blocked_current_strength_baseline";
  const queue = queueCoachTranscriptMessages({
    texts: [
      {
        text: "I still need your current bench baseline before I build this.",
        message_key: blockedConfirmKey,
        transition_id: "transition_000401",
        stage: "REVIEW_CONFIRM",
        message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      },
      {
        text: "I still need your current bench baseline before I build this.",
        message_key: blockedConfirmKey,
        transition_id: "transition_000402",
        stage: "REVIEW_CONFIRM",
        message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
      },
    ],
    nextMessageId: 201,
    activeTransitionId: "transition_000402",
  });

  assert.equal(queue.entries.length, 1);
  assert.equal(queue.entries[0].message_key, blockedConfirmKey);
});
