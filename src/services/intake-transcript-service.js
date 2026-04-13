const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const TRANSCRIPT_MESSAGE_KINDS = {
  anchorQuestion: "anchor_question",
  systemNote: "system_note",
  aiSummary: "ai_summary",
};

export const buildTranscriptMessageKey = ({
  stage = "",
  anchor_id = "",
  transition_id = "",
  intent = "",
  packet_version = "",
  message_kind = "",
} = {}) => {
  const kind = sanitizeText(message_kind, 40).toLowerCase();
  const cleanTransitionId = sanitizeText(transition_id, 120);
  if (!cleanTransitionId) return "";
  if (kind === TRANSCRIPT_MESSAGE_KINDS.anchorQuestion) {
    const cleanStage = sanitizeText(stage, 80);
    const cleanAnchorId = sanitizeText(anchor_id, 120);
    return cleanStage && cleanAnchorId
      ? sanitizeText(`${cleanStage}:${cleanAnchorId}:${cleanTransitionId}`, 220)
      : "";
  }
  if (kind === TRANSCRIPT_MESSAGE_KINDS.aiSummary) {
    const cleanIntent = sanitizeText(intent || "intake_interpretation", 80) || "intake_interpretation";
    const cleanPacketVersion = sanitizeText(packet_version || "unknown", 40) || "unknown";
    return sanitizeText(`ai:${cleanIntent}:${cleanPacketVersion}:${cleanTransitionId}`, 220);
  }
  return sanitizeText(`${sanitizeText(stage || "intake", 80) || "intake"}:system:${cleanTransitionId}`, 220);
};

const normalizeTranscriptEntry = (item = null) => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const messageKind = sanitizeText(item?.message_kind || "", 40).toLowerCase();
    const transitionId = sanitizeText(item?.transition_id || "", 120);
    const messageKey = sanitizeText(
      item?.message_key
      || item?.idempotency_key
      || item?.key
      || buildTranscriptMessageKey({
        stage: item?.stage,
        anchor_id: item?.anchor_id,
        transition_id: transitionId,
        intent: item?.intent,
        packet_version: item?.packet_version,
        message_kind: messageKind,
      }),
      220
    );
    return {
      role: sanitizeText(item?.role || "coach", 20).toLowerCase() || "coach",
      text: String(item?.text || ""),
      message_key: messageKey,
      idempotency_key: messageKey,
      transition_id: transitionId,
      stage: sanitizeText(item?.stage || "", 80),
      message_kind: messageKind,
      intent: sanitizeText(item?.intent || "", 80),
      packet_version: sanitizeText(item?.packet_version || "", 40),
    };
  }
  return {
    role: "coach",
    text: String(item || ""),
    message_key: "",
    idempotency_key: "",
    transition_id: "",
    stage: "",
    message_kind: "",
    intent: "",
    packet_version: "",
  };
};

const isLateAiTranscriptEntry = ({
  item = null,
  activeTransitionId = "",
} = {}) => {
  const cleanActiveTransitionId = sanitizeText(activeTransitionId, 120);
  const cleanItemTransitionId = sanitizeText(item?.transition_id || "", 120);
  const kind = sanitizeText(item?.message_kind || "", 40).toLowerCase();
  const messageKey = sanitizeText(item?.message_key || item?.idempotency_key || "", 220);
  const isAiSummary = kind === TRANSCRIPT_MESSAGE_KINDS.aiSummary || messageKey.startsWith("ai:");
  return Boolean(isAiSummary && cleanActiveTransitionId && cleanItemTransitionId && cleanItemTransitionId !== cleanActiveTransitionId);
};

export const queueCoachTranscriptMessages = ({
  texts = [],
  nextMessageId = 1,
  seenMessageKeys = [],
  seenIdempotencyKeys = [],
  activeTransitionId = "",
} = {}) => {
  const seen = new Set([
    ...toArray(seenMessageKeys),
    ...toArray(seenIdempotencyKeys),
  ].map((item) => sanitizeText(item, 220)).filter(Boolean));
  const queuedTexts = toArray(texts)
    .map((item) => normalizeTranscriptEntry(item))
    .filter((item) => String(item?.text || "").trim())
    .filter((item) => !isLateAiTranscriptEntry({
      item,
      activeTransitionId,
    }))
    .filter((item) => {
      if (!item.message_key) return true;
      if (seen.has(item.message_key)) return false;
      seen.add(item.message_key);
      return true;
    });
  const entries = queuedTexts.map((item, index) => ({
    id: nextMessageId + index,
    role: item.role || "coach",
    text: String(item.text || ""),
    displayedText: "",
    ...(item.message_key ? { message_key: item.message_key, idempotency_key: item.message_key } : {}),
    ...(item.transition_id ? { transition_id: item.transition_id } : {}),
    ...(item.stage ? { stage: item.stage } : {}),
    ...(item.message_kind ? { message_kind: item.message_kind } : {}),
  }));
  return {
    entries,
    nextMessageId: nextMessageId + entries.length,
    firstQueuedCoachId: entries[0]?.id || null,
    acceptedMessageKeys: entries.map((entry) => sanitizeText(entry?.message_key || entry?.idempotency_key || "", 220)).filter(Boolean),
    acceptedIdempotencyKeys: entries.map((entry) => sanitizeText(entry?.message_key || entry?.idempotency_key || "", 220)).filter(Boolean),
  };
};

export const resolveNextCoachStreamTargetId = ({
  currentStreamTargetId = null,
  queuedEntries = [],
} = {}) => currentStreamTargetId || queuedEntries.find((entry) => entry?.role === "coach")?.id || null;
