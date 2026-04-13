import { createIntakeMachineState, INTAKE_MACHINE_STATES } from "./intake-machine-service.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const clonePlainValue = (value = null) => {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const INTAKE_SESSION_STORAGE_KEY = "intake_session_v1";

const normalizePersistedMessage = (message = null, fallbackId = 1) => {
  const id = Number(message?.id);
  const text = String(message?.text || "");
  if (!text.trim()) return null;
  return {
    id: Number.isFinite(id) && id > 0 ? id : fallbackId,
    role: sanitizeText(message?.role || "coach", 20).toLowerCase() || "coach",
    text,
    displayedText: text,
    ...(sanitizeText(message?.message_key || message?.idempotency_key || "", 220)
      ? { message_key: sanitizeText(message?.message_key || message?.idempotency_key || "", 220), idempotency_key: sanitizeText(message?.message_key || message?.idempotency_key || "", 220) }
      : {}),
    ...(sanitizeText(message?.transition_id || "", 120) ? { transition_id: sanitizeText(message?.transition_id || "", 120) } : {}),
    ...(sanitizeText(message?.stage || "", 80) ? { stage: sanitizeText(message?.stage || "", 80) } : {}),
    ...(sanitizeText(message?.message_kind || "", 40) ? { message_kind: sanitizeText(message?.message_kind || "", 40).toLowerCase() } : {}),
  };
};

const resolveRestoredPhase = ({
  phase = "",
  intakeMachine = null,
  pendingSecondaryGoalPrompt = null,
} = {}) => {
  const machineStage = sanitizeText(intakeMachine?.stage || "", 80);
  const hasCurrentAnchor = Boolean(
    sanitizeText(intakeMachine?.draft?.missingAnchorsEngine?.currentAnchor?.anchor_id || "", 120)
    && sanitizeText(intakeMachine?.draft?.missingAnchorsEngine?.currentAnchor?.field_id || "", 80)
  );
  if (sanitizeText(phase, 40) === "adjust") return "adjust";
  if (machineStage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION) return hasCurrentAnchor ? "clarify" : "review";
  if (pendingSecondaryGoalPrompt && machineStage === INTAKE_MACHINE_STATES.REVIEW_CONFIRM) return "secondary_goal";
  if (
    machineStage === INTAKE_MACHINE_STATES.REVIEW_CONFIRM
    || machineStage === INTAKE_MACHINE_STATES.REALISM_GATE
    || machineStage === INTAKE_MACHINE_STATES.GOAL_ARBITRATION
    || machineStage === INTAKE_MACHINE_STATES.COMMIT
  ) {
    return "review";
  }
  return "questions";
};

const normalizeIntakeMachineSnapshot = (intakeMachine = null) => {
  const fallback = createIntakeMachineState();
  const machine = intakeMachine && typeof intakeMachine === "object"
    ? {
        ...fallback,
        ...clonePlainValue(intakeMachine),
        draft: {
          ...(fallback.draft || {}),
          ...clonePlainValue(intakeMachine?.draft || {}),
        },
        ui: {
          ...(fallback.ui || {}),
          ...clonePlainValue(intakeMachine?.ui || {}),
        },
        clock: {
          ...(fallback.clock || {}),
          ...clonePlainValue(intakeMachine?.clock || {}),
        },
      }
    : fallback;
  return {
    ...machine,
    stage: sanitizeText(machine?.stage || fallback.stage, 80) || fallback.stage,
    outbox: [],
    draft: {
      ...(machine.draft || {}),
      commitRequested: false,
      commitRequest: null,
      lastCommittedSnapshotId: sanitizeText(machine?.draft?.lastCommittedSnapshotId || "", 120),
    },
    ui: {
      ...(machine.ui || {}),
      currentBindingTarget: (
        sanitizeText(machine?.draft?.missingAnchorsEngine?.currentAnchor?.anchor_id || "", 120)
        && sanitizeText(machine?.draft?.missingAnchorsEngine?.currentAnchor?.field_id || "", 80)
      )
        ? {
            anchor_id: sanitizeText(machine.draft.missingAnchorsEngine.currentAnchor.anchor_id, 120),
            field_id: sanitizeText(machine.draft.missingAnchorsEngine.currentAnchor.field_id, 80),
          }
        : null,
    },
  };
};

export const buildPersistableIntakeSession = ({
  messages = [],
  answers = {},
  stepIndex = 0,
  draft = "",
  phase = "questions",
  assessmentText = "",
  assessmentBoundary = null,
  assessmentPreview = null,
  goalStackConfirmation = null,
  askedClarifyingQuestions = [],
  pendingClarifyingQuestion = null,
  pendingSecondaryGoalPrompt = null,
  secondaryGoalEntries = [],
  showSecondaryGoalCustomInput = false,
  intakeMachine = null,
  adjustmentTargetGoal = null,
  nextMessageId = 1,
  nextIntakeEventId = 1,
  secondaryGoalAddedMessageKeys = [],
  startingFresh = false,
} = {}) => {
  const normalizedMessages = toArray(messages)
    .map((message, index) => normalizePersistedMessage(message, index + 1))
    .filter(Boolean);
  const nextMessageCounter = Math.max(
    Number(nextMessageId) || 1,
    normalizedMessages.reduce((maxId, message) => Math.max(maxId, Number(message?.id) || 0), 0) + 1
  );
  const normalizedMachine = normalizeIntakeMachineSnapshot(intakeMachine);
  const safePendingSecondaryGoalPrompt = pendingSecondaryGoalPrompt && typeof pendingSecondaryGoalPrompt === "object"
    ? clonePlainValue(pendingSecondaryGoalPrompt)
    : null;
  const safePhase = resolveRestoredPhase({
    phase,
    intakeMachine: normalizedMachine,
    pendingSecondaryGoalPrompt: safePendingSecondaryGoalPrompt,
  });
  return {
    version: "2026-04-v1",
    saved_at: new Date().toISOString(),
    startingFresh: Boolean(startingFresh),
    messages: normalizedMessages,
    answers: clonePlainValue(answers || {}),
    stepIndex: Math.max(0, Number(stepIndex) || 0),
    draft: String(draft || ""),
    phase: safePhase,
    assessmentText: sanitizeText(assessmentText, 680),
    assessmentBoundary: clonePlainValue(assessmentBoundary || null),
    assessmentPreview: clonePlainValue(assessmentPreview || null),
    goalStackConfirmation: clonePlainValue(goalStackConfirmation || null),
    askedClarifyingQuestions: toArray(askedClarifyingQuestions).map((item) => sanitizeText(item, 220)).filter(Boolean),
    pendingClarifyingQuestion: clonePlainValue(pendingClarifyingQuestion || null),
    pendingSecondaryGoalPrompt: safePendingSecondaryGoalPrompt,
    secondaryGoalEntries: toArray(secondaryGoalEntries).map((item) => sanitizeText(item, 180)).filter(Boolean),
    showSecondaryGoalCustomInput: Boolean(showSecondaryGoalCustomInput),
    intakeMachine: normalizedMachine,
    adjustmentTargetGoal: clonePlainValue(adjustmentTargetGoal || null),
    nextMessageId: nextMessageCounter,
    nextIntakeEventId: Math.max(1, Number(nextIntakeEventId) || 1),
    processedMessageKeys: normalizedMessages
      .map((message) => sanitizeText(message?.message_key || message?.idempotency_key || "", 220))
      .filter(Boolean),
    secondaryGoalAddedMessageKeys: toArray(secondaryGoalAddedMessageKeys)
      .map((item) => sanitizeText(item, 180).toLowerCase())
      .filter(Boolean),
  };
};

export const restorePersistedIntakeSession = (snapshot = null, { startingFresh = null } = {}) => {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (typeof startingFresh === "boolean" && Boolean(snapshot?.startingFresh) !== startingFresh) {
    return null;
  }
  const normalized = buildPersistableIntakeSession(snapshot);
  return {
    ...normalized,
    startingFresh: Boolean(normalized.startingFresh),
    processedTranscriptKeys: normalized.processedMessageKeys,
  };
};
