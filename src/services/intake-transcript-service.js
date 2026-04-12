const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const normalizeTranscriptEntry = (item = null) => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      role: sanitizeText(item?.role || "coach", 20).toLowerCase() || "coach",
      text: String(item?.text || ""),
      idempotency_key: sanitizeText(item?.idempotency_key || item?.key || "", 220),
    };
  }
  return {
    role: "coach",
    text: String(item || ""),
    idempotency_key: "",
  };
};

export const queueCoachTranscriptMessages = ({
  texts = [],
  nextMessageId = 1,
  seenIdempotencyKeys = [],
} = {}) => {
  const seen = new Set(toArray(seenIdempotencyKeys).map((item) => sanitizeText(item, 220)).filter(Boolean));
  const queuedTexts = toArray(texts)
    .map((item) => normalizeTranscriptEntry(item))
    .filter((item) => String(item?.text || "").trim())
    .filter((item) => {
      if (!item.idempotency_key) return true;
      if (seen.has(item.idempotency_key)) return false;
      seen.add(item.idempotency_key);
      return true;
    });
  const entries = queuedTexts.map((item, index) => ({
    id: nextMessageId + index,
    role: item.role || "coach",
    text: String(item.text || ""),
    displayedText: "",
    ...(item.idempotency_key ? { idempotency_key: item.idempotency_key } : {}),
  }));
  return {
    entries,
    nextMessageId: nextMessageId + entries.length,
    firstQueuedCoachId: entries[0]?.id || null,
    acceptedIdempotencyKeys: entries.map((entry) => sanitizeText(entry?.idempotency_key || "", 220)).filter(Boolean),
  };
};

export const resolveNextCoachStreamTargetId = ({
  currentStreamTargetId = null,
  queuedEntries = [],
} = {}) => currentStreamTargetId || queuedEntries.find((entry) => entry?.role === "coach")?.id || null;
