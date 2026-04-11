const test = require("node:test");
const assert = require("node:assert/strict");

const {
  queueCoachTranscriptMessages,
  resolveNextCoachStreamTargetId,
} = require("../src/services/intake-transcript-service.js");

test("clarification sequence queues in the expected order and targets the first message for streaming", () => {
  const queue = queueCoachTranscriptMessages({
    texts: [
      "One quick thing before I lock this in: What's your current running baseline?",
      "I still need one or two critical anchors before I can build credibly.",
    ],
    nextMessageId: 11,
  });

  assert.deepEqual(queue.entries.map((entry) => entry.text), [
    "One quick thing before I lock this in: What's your current running baseline?",
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
      "One quick thing before I lock this in: What's the race date or target month?",
      "I still need one or two critical anchors before I can build credibly.",
    ],
    nextMessageId: 21,
  });
  const secondQueue = queueCoachTranscriptMessages({
    texts: [
      "One quick thing before I lock this in: What's your current running baseline?",
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
      "One quick thing before I lock this in: What's the race date or target month?",
      "I still need one critical detail first: What's the race date or target month?",
    ],
    nextMessageId: adjustmentQueue.nextMessageId,
  });

  const allTexts = [...adjustmentQueue.entries, ...clarificationQueue.entries].map((entry) => entry.text);
  assert.deepEqual(allTexts, [
    "Tell me what you want to change and I'll recalibrate it before I build.",
    "One quick thing before I lock this in: What's the race date or target month?",
    "I still need one critical detail first: What's the race date or target month?",
  ]);
  assert.equal(resolveNextCoachStreamTargetId({
    currentStreamTargetId: null,
    queuedEntries: adjustmentQueue.entries,
  }), 31);
});
