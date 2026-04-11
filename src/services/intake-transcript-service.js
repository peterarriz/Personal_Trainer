export const queueCoachTranscriptMessages = ({
  texts = [],
  nextMessageId = 1,
} = {}) => {
  const queuedTexts = (Array.isArray(texts) ? texts : [texts]).filter((item) => String(item || "").trim());
  const entries = queuedTexts.map((text, index) => ({
    id: nextMessageId + index,
    role: "coach",
    text: String(text || ""),
    displayedText: "",
  }));
  return {
    entries,
    nextMessageId: nextMessageId + entries.length,
    firstQueuedCoachId: entries[0]?.id || null,
  };
};

export const resolveNextCoachStreamTargetId = ({
  currentStreamTargetId = null,
  queuedEntries = [],
} = {}) => currentStreamTargetId || queuedEntries.find((entry) => entry?.role === "coach")?.id || null;
