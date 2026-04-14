import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPersistableIntakeSession,
  INTAKE_SESSION_STORAGE_KEY,
  restorePersistedIntakeSession,
} from "../src/services/intake-session-service.js";
import {
  createIntakeMachineState,
  INTAKE_MACHINE_STATES,
} from "../src/services/intake-machine-service.js";

test("restored intake session keeps the active anchor but strips pending commit state", () => {
  const baseMachine = createIntakeMachineState();
  const snapshot = buildPersistableIntakeSession({
    startingFresh: false,
    messages: [
      {
        id: 7,
        role: "coach",
        text: "Quick baseline check: How many runs do you get in during a normal week?",
        message_key: "ANCHOR_COLLECTION:running_baseline:current_run_frequency:transition_000101",
      },
    ],
    answers: {
      goal_intent: "run a half marathon",
    },
    phase: "building",
    intakeMachine: {
      ...baseMachine,
      stage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
      transition_id: "transition_000101",
      outbox: [
        {
          text: "Duplicate anchor prompt should not survive restore.",
          message_key: "ANCHOR_COLLECTION:running_baseline:current_run_frequency:transition_000101",
        },
      ],
      draft: {
        ...(baseMachine.draft || {}),
        commitRequested: true,
        commitRequest: {
          confirmation_snapshot_id: "transition_000099",
        },
        missingAnchorsEngine: {
          currentAnchor: {
            anchor_id: "running_baseline:current_run_frequency",
            field_id: "current_run_frequency",
          },
          missingAnchors: [
            {
              anchor_id: "running_baseline:current_run_frequency",
              field_id: "current_run_frequency",
            },
          ],
        },
      },
    },
  });

  const restored = restorePersistedIntakeSession(snapshot, {
    startingFresh: false,
  });

  assert.ok(restored);
  assert.equal(INTAKE_SESSION_STORAGE_KEY, "intake_session_v1");
  assert.equal(restored.phase, "clarify");
  assert.equal(restored.intakeMachine.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(restored.intakeMachine.draft.commitRequested, false);
  assert.equal(restored.intakeMachine.draft.commitRequest, null);
  assert.deepEqual(restored.intakeMachine.outbox, []);
  assert.deepEqual(restored.intakeMachine.ui.currentBindingTarget, {
    anchor_id: "running_baseline:current_run_frequency",
    field_id: "current_run_frequency",
  });
  assert.equal(restored.nextMessageId, 8);
  assert.deepEqual(restored.processedMessageKeys, [
    "ANCHOR_COLLECTION:running_baseline:current_run_frequency:transition_000101",
  ]);
  assert.deepEqual(restored.processedTranscriptKeys, restored.processedMessageKeys);
});

test("restored intake session falls back to confirm from commit/building states", () => {
  const baseMachine = createIntakeMachineState();
  const restored = restorePersistedIntakeSession({
    startingFresh: true,
    messages: [
      {
        id: 3,
        role: "coach",
        text: "We are almost ready to build.",
      },
    ],
    phase: "building",
    intakeMachine: {
      ...baseMachine,
      stage: INTAKE_MACHINE_STATES.COMMIT,
      draft: {
        ...(baseMachine.draft || {}),
        commitRequested: true,
        commitRequest: {
          confirmation_snapshot_id: "transition_000201",
        },
      },
    },
  }, {
    startingFresh: true,
  });

  assert.ok(restored);
  assert.equal(restored.phase, "confirm");
  assert.equal(restored.intakeMachine.stage, INTAKE_MACHINE_STATES.COMMIT);
  assert.equal(restored.intakeMachine.draft.commitRequested, false);
  assert.equal(restored.intakeMachine.draft.commitRequest, null);
});

test("restored review-confirm snapshot can stay on interpretation when explicitly requested", () => {
  const baseMachine = createIntakeMachineState();
  const restored = restorePersistedIntakeSession({
    startingFresh: false,
    phase: "interpretation",
    messages: [
      {
        id: 4,
        role: "coach",
        text: "Here is the interpreted goal stack.",
      },
    ],
    intakeMachine: {
      ...baseMachine,
      stage: INTAKE_MACHINE_STATES.REVIEW_CONFIRM,
      draft: {
        ...(baseMachine.draft || {}),
        commitRequested: false,
      },
    },
  }, {
    startingFresh: false,
  });

  assert.ok(restored);
  assert.equal(restored.phase, "interpretation");
  assert.equal(restored.intakeMachine.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
});

test("persisted intake session keeps the ordered goal stack confirmation intact", () => {
  const snapshot = buildPersistableIntakeSession({
    startingFresh: false,
    phase: "confirm",
    answers: {
      goal_intent: "run a 1:45 half marathon",
      additional_goals_list: ["bench 225", "get leaner by summer"],
    },
    goalStackConfirmation: {
      orderedGoalIds: ["goal_strength", "goal_running", "goal_body_comp"],
      primaryGoalId: "goal_strength",
      removedGoalIds: ["goal_extra"],
      rolesByGoalId: {
        goal_strength: "primary",
        goal_running: "maintained",
        goal_body_comp: "background",
        goal_extra: "deferred",
      },
    },
  });

  const restored = restorePersistedIntakeSession(snapshot, {
    startingFresh: false,
  });

  assert.ok(restored);
  assert.deepEqual(restored.goalStackConfirmation?.orderedGoalIds, ["goal_strength", "goal_running", "goal_body_comp"]);
  assert.equal(restored.goalStackConfirmation?.primaryGoalId, "goal_strength");
  assert.deepEqual(restored.goalStackConfirmation?.removedGoalIds, ["goal_extra"]);
  assert.equal(restored.goalStackConfirmation?.rolesByGoalId?.goal_body_comp, "background");
});

test("restored intake session ignores snapshots from a different starting mode", () => {
  const restored = restorePersistedIntakeSession({
    startingFresh: true,
    messages: [
      {
        id: 1,
        role: "coach",
        text: "Starting fresh.",
      },
    ],
  }, {
    startingFresh: false,
  });

  assert.equal(restored, null);
});
