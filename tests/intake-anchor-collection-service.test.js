import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnchorCollectionViewModel,
} from "../src/services/intake-anchor-collection-service.js";
import {
  createIntakeMachineState,
  intakeReducer,
  INTAKE_MACHINE_EVENTS,
  INTAKE_MACHINE_STATES,
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
  source: "user",
  now: TEST_NOW,
});

test("anchor collection view model shows a short stack of field cards after interpretation", () => {
  let state = createIntakeMachineState();
  state = intakeReducer(state, {
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
  state = intakeReducer(state, buildInterpretationEvent({
    event_id: "evt_interpretation_ready",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));

  const viewModel = buildAnchorCollectionViewModel({
    machineState: state,
    maxVisibleCards: 3,
  });

  assert.equal(state.stage, INTAKE_MACHINE_STATES.ANCHOR_COLLECTION);
  assert.equal(viewModel.isVisible, true);
  assert.equal(viewModel.totalRemaining, 3);
  assert.deepEqual(
    viewModel.visibleCards.map((card) => card.field_id),
    ["target_timeline", "current_run_frequency", "running_endurance_anchor_kind"]
  );
  assert.equal(viewModel.heading.includes("anchor"), false);
  assert.equal(viewModel.progressLabel.includes("anchor"), false);
  assert.equal(viewModel.visibleCards[0].status_label, "NOW");
  assert.equal(viewModel.visibleCards[1].status_label, "NEXT");
  assert.ok(viewModel.visibleCards.every((card) => String(card.why_it_matters || "").trim().length > 0));
  assert.ok(viewModel.visibleCards.every((card) => String(card.coach_voice_line || "").trim().length > 0));
  assert.match(viewModel.visibleCards[1].why_it_matters, /run/i);
  assert.match(viewModel.visibleCards[1].coach_voice_line, /coach note/i);
});

test("anchor collection view model advances from runs per week to anchor choice and then selected card", () => {
  let state = createIntakeMachineState();
  state = intakeReducer(state, {
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
  state = intakeReducer(state, buildInterpretationEvent({
    event_id: "evt_run_goal_interpreted",
    answers: {
      goal_intent: "run a 2-hour half marathon",
    },
    rawGoalText: "run a 2-hour half marathon",
  }));
  state = intakeReducer(state, {
    event_id: "evt_timeline_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: state.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "October 12",
      answer_value: "October 12",
    }),
  });

  let viewModel = buildAnchorCollectionViewModel({
    machineState: state,
    maxVisibleCards: 3,
  });
  assert.equal(viewModel.activeFieldId, "current_run_frequency");
  assert.deepEqual(
    viewModel.visibleCards.map((card) => card.field_id),
    ["current_run_frequency", "running_endurance_anchor_kind"]
  );

  state = intakeReducer(state, {
    event_id: "evt_frequency_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: state.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "3",
      answer_value: "3",
    }),
  });
  viewModel = buildAnchorCollectionViewModel({
    machineState: state,
    maxVisibleCards: 3,
  });
  assert.equal(viewModel.activeFieldId, "running_endurance_anchor_kind");
  assert.equal(viewModel.visibleCards[0].label, "Choose your running benchmark");
  assert.deepEqual(
    viewModel.visibleCards.map((card) => card.field_id),
    ["running_endurance_anchor_kind"]
  );

  state = intakeReducer(state, {
    event_id: "evt_anchor_choice_answered",
    type: INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
    timestamp: TEST_NOW,
    payload: buildAnchorAnsweredPayload({
      anchor: state.draft.missingAnchorsEngine.currentAnchor,
      raw_text: "Longest recent run",
      answer_value: {
        value: "longest_recent_run",
        raw: "Longest recent run",
      },
    }),
  });
  viewModel = buildAnchorCollectionViewModel({
    machineState: state,
    maxVisibleCards: 3,
  });
  assert.equal(viewModel.activeFieldId, "longest_recent_run");
  assert.deepEqual(
    viewModel.visibleCards.map((card) => card.field_id),
    ["longest_recent_run"]
  );
});

test("anchor collection view model caps the visible card stack at three cards", () => {
  const viewModel = buildAnchorCollectionViewModel({
    machineState: {
      stage: INTAKE_MACHINE_STATES.ANCHOR_COLLECTION,
      draft: {
        reviewModel: {
          primarySummary: "Run a 2-hour half marathon",
        },
        missingAnchorsEngine: {
          currentAnchor: { field_id: "field_1" },
          missingAnchors: [
            { field_id: "field_1", label: "Field 1" },
            { field_id: "field_2", label: "Field 2" },
            { field_id: "field_3", label: "Field 3" },
            { field_id: "field_4", label: "Field 4" },
          ],
        },
      },
    },
    maxVisibleCards: 99,
  });

  assert.equal(viewModel.totalRemaining, 4);
  assert.equal(viewModel.visibleCards.length, 3);
  assert.deepEqual(
    viewModel.visibleCards.map((card) => card.field_id),
    ["field_1", "field_2", "field_3"]
  );
});
