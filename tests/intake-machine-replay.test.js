import test from "node:test";
import assert from "node:assert/strict";

import {
  createIntakeMachineState,
  intakeReducer,
  replayIntakeMachineEvents,
  INTAKE_MACHINE_EVENTS,
  INTAKE_MACHINE_STATES,
} from "../src/services/intake-machine-service.js";

const TEST_NOW = "2026-04-11T12:00:00.000Z";

const STAGE_ORDER = {
  [INTAKE_MACHINE_STATES.FREEFORM_GOALS]: 0,
  [INTAKE_MACHINE_STATES.GOAL_INTERPRETATION]: 1,
  [INTAKE_MACHINE_STATES.ANCHOR_COLLECTION]: 2,
  [INTAKE_MACHINE_STATES.REALISM_GATE]: 3,
  [INTAKE_MACHINE_STATES.GOAL_ARBITRATION]: 4,
  [INTAKE_MACHINE_STATES.REVIEW_CONFIRM]: 5,
  [INTAKE_MACHINE_STATES.COMMIT]: 6,
};

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

const buildGoalSubmittedEvent = ({
  event_id = "evt_goal_submit",
  goal_intent = "",
} = {}) => ({
  event_id,
  type: INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED,
  timestamp: TEST_NOW,
  payload: {
    answers: {
      goal_intent,
    },
    now: TEST_NOW,
  },
});

const buildInterpretationEvent = ({
  event_id = "evt_goal_interpreted",
  goal_intent = "",
} = {}) => ({
  event_id,
  type: INTAKE_MACHINE_EVENTS.INTERPRETATION_READY,
  timestamp: TEST_NOW,
  payload: {
    assessment: {
      typedIntakePacket: buildTypedIntakePacket({ rawGoalText: goal_intent }),
      aiInterpretationProposal: null,
    },
    answers: {
      goal_intent,
    },
    now: TEST_NOW,
  },
});

const buildCurrentAnchorAnswerEvent = ({
  state,
  event_id,
  raw_text = "",
  answer_value = null,
} = {}) => {
  const anchor = state?.draft?.missingAnchorsEngine?.currentAnchor || null;
  return {
    event_id,
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: {
      anchor,
      binding_target: {
        anchor_id: anchor?.anchor_id || "",
        field_id: anchor?.field_id || "",
      },
      anchor_id: anchor?.anchor_id || "",
      field_id: anchor?.field_id || "",
      raw_text,
      answer_value,
      source: "user",
      now: TEST_NOW,
    },
  };
};

const buildStageEvent = ({
  event_id,
  type,
} = {}) => ({
  event_id,
  type,
  timestamp: TEST_NOW,
  payload: {
    now: TEST_NOW,
  },
});

const buildScenarioStepEvent = ({
  state,
  step = {},
  index = 0,
} = {}) => {
  if (step.kind === "answer") {
    return buildCurrentAnchorAnswerEvent({
      state,
      event_id: step.event_id || `evt_answer_${index}`,
      raw_text: step.raw_text,
      answer_value: step.answer_value,
    });
  }

  return buildStageEvent({
    event_id: step.event_id || `evt_stage_${index}`,
    type: step.kind,
  });
};

const runReplayScenario = ({
  goal_intent = "",
  steps = [],
} = {}) => {
  const events = [
    buildGoalSubmittedEvent({
      event_id: `evt_submit_${goal_intent.replace(/\W+/g, "_").toLowerCase() || "goal"}`,
      goal_intent,
    }),
    buildInterpretationEvent({
      event_id: `evt_interpret_${goal_intent.replace(/\W+/g, "_").toLowerCase() || "goal"}`,
      goal_intent,
    }),
  ];

  let directState = createIntakeMachineState();
  const states = [];

  events.forEach((event) => {
    directState = intakeReducer(directState, event);
    states.push(directState);
  });

  steps.forEach((step, index) => {
    const event = buildScenarioStepEvent({
      state: directState,
      step,
      index,
    });
    events.push(event);
    directState = intakeReducer(directState, event);
    states.push(directState);
  });

  const replayedState = replayIntakeMachineEvents({
    initialState: createIntakeMachineState(),
    events,
  });

  return {
    events,
    states,
    directState,
    replayedState,
  };
};

const assertNoStageRegressions = (states = []) => {
  let previousRank = -1;
  states.forEach((state, index) => {
    const currentRank = Number(STAGE_ORDER[state?.stage] ?? -1);
    assert.ok(currentRank >= previousRank, `stage regressed at step ${index}: ${state?.stage || "unknown"}`);
    previousRank = currentRank;
  });
};

const assertNoDuplicateAnchorPrompts = (state = {}) => {
  const anchorPrompts = (Array.isArray(state?.outbox) ? state.outbox : [])
    .filter((message) => message?.message_kind === "anchor_question");
  assert.equal(
    new Set(anchorPrompts.map((message) => message?.message_key || "")).size,
    anchorPrompts.length
  );
  assert.equal(
    new Set(anchorPrompts.map((message) => `${message?.anchor_id || ""}|${message?.text || ""}`)).size,
    anchorPrompts.length
  );
};

const assertReplayMatchesDirectState = ({
  directState = {},
  replayedState = {},
} = {}) => {
  assert.equal(replayedState.stage, directState.stage);
  assert.deepEqual(
    replayedState.draft?.confirmationState || null,
    directState.draft?.confirmationState || null
  );
  assert.deepEqual(
    (replayedState.draft?.missingAnchorsEngine?.missingAnchors || []).map((anchor) => anchor.field_id),
    (directState.draft?.missingAnchorsEngine?.missingAnchors || []).map((anchor) => anchor.field_id)
  );
};

test("replay harness covers the running event-goal path end to end", () => {
  const scenario = runReplayScenario({
    goal_intent: "run a 2-hour half marathon",
    steps: [
      { kind: "answer", raw_text: "October 12", answer_value: "October 12" },
      { kind: "answer", raw_text: "3", answer_value: "3" },
      {
        kind: "answer",
        raw_text: "Longest recent run",
        answer_value: {
          value: "longest_recent_run",
          raw: "Longest recent run",
        },
      },
      {
        kind: "answer",
        raw_text: "8 miles",
        answer_value: {
          value: "8",
          unit: "miles",
          raw: "8 miles",
        },
      },
      { kind: INTAKE_MACHINE_EVENTS.REALISM_RESULT },
      { kind: INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT },
    ],
  });

  const interpretationState = scenario.states[1];
  const anchorCollectionStates = scenario.states.filter((state) => state.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);

  assertNoStageRegressions(scenario.states);
  assertNoDuplicateAnchorPrompts(scenario.replayedState);
  assertReplayMatchesDirectState(scenario);

  assert.equal(interpretationState.draft.confirmationState.canConfirm, false);
  assert.equal(interpretationState.draft.confirmationState.next_required_field, "target_timeline");
  assert.ok(anchorCollectionStates.every((state) => state.draft.confirmationState.canConfirm === false));
  assert.equal(scenario.replayedState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(scenario.replayedState.draft.confirmationState.canConfirm, true);
});

test("replay harness covers the strength target path end to end", () => {
  const scenario = runReplayScenario({
    goal_intent: "bench 225",
    steps: [
      {
        kind: "answer",
        raw_text: "205 estimated max",
        answer_value: {
          mode: "estimated_max",
          weight: "205",
          raw: "205 estimated max",
          value: "205",
        },
      },
      { kind: INTAKE_MACHINE_EVENTS.REALISM_RESULT },
      { kind: INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT },
    ],
  });

  const interpretationState = scenario.states[1];
  const anchorCollectionStates = scenario.states.filter((state) => state.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);

  assertNoStageRegressions(scenario.states);
  assertNoDuplicateAnchorPrompts(scenario.replayedState);
  assertReplayMatchesDirectState(scenario);

  assert.equal(interpretationState.draft.confirmationState.canConfirm, false);
  assert.equal(interpretationState.draft.confirmationState.next_required_field, "current_strength_baseline");
  assert.ok(anchorCollectionStates.every((state) => state.draft.confirmationState.canConfirm === false));
  assert.equal(scenario.replayedState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(scenario.replayedState.draft.confirmationState.canConfirm, true);
});

test("replay harness covers the appearance proxy path end to end", () => {
  const scenario = runReplayScenario({
    goal_intent: "look athletic again",
    steps: [
      {
        kind: "answer",
        raw_text: "Waist",
        answer_value: {
          value: "current_waist",
          raw: "Waist",
        },
      },
      {
        kind: "answer",
        raw_text: "35 in",
        answer_value: {
          value: "35",
          unit: "in",
          raw: "35 in",
        },
      },
      { kind: INTAKE_MACHINE_EVENTS.REALISM_RESULT },
      { kind: INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT },
    ],
  });

  const interpretationState = scenario.states[1];
  const anchorCollectionStates = scenario.states.filter((state) => state.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);

  assertNoStageRegressions(scenario.states);
  assertNoDuplicateAnchorPrompts(scenario.replayedState);
  assertReplayMatchesDirectState(scenario);

  assert.equal(interpretationState.draft.confirmationState.canConfirm, false);
  assert.equal(interpretationState.draft.confirmationState.next_required_field, "appearance_proxy_anchor_kind");
  assert.ok(anchorCollectionStates.every((state) => state.draft.confirmationState.canConfirm === false));
  assert.equal(scenario.replayedState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(scenario.replayedState.draft.confirmationState.canConfirm, true);
});

test("replay harness covers the vague health path end to end", () => {
  const scenario = runReplayScenario({
    goal_intent: "I want to be in better shape",
    steps: [
      {
        kind: "answer",
        raw_text: "20 to 30 min",
        answer_value: {
          value: "20_to_30_minutes",
          raw: "20 to 30 min",
        },
      },
      { kind: INTAKE_MACHINE_EVENTS.REALISM_RESULT },
      { kind: INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT },
    ],
  });

  const interpretationState = scenario.states[1];
  const anchorCollectionStates = scenario.states.filter((state) => state.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);

  assertNoStageRegressions(scenario.states);
  assertNoDuplicateAnchorPrompts(scenario.replayedState);
  assertReplayMatchesDirectState(scenario);

  assert.equal(interpretationState.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(interpretationState.draft.intakeCompleteness.missingRequired.length, 1);
  assert.equal(interpretationState.draft.confirmationState.canConfirm, false);
  assert.equal(interpretationState.draft.confirmationState.next_required_field, "starting_capacity_anchor");
  assert.ok(anchorCollectionStates.every((state) => state.draft.confirmationState.canConfirm === false));
  assert.equal(
    scenario.replayedState.outbox.filter((message) => message?.message_kind === "anchor_question").length,
    1
  );
  assert.equal(scenario.replayedState.stage, INTAKE_MACHINE_STATES.REVIEW_CONFIRM);
  assert.equal(scenario.replayedState.draft.confirmationState.canConfirm, true);
});
