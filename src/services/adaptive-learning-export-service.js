import { extractAdaptiveLearningEvents } from "./adaptive-learning-analysis/extraction.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const normalizeAdaptiveLearningSinkRowsForExtraction = ({
  rows = [],
  actorId = "",
  userId = "",
} = {}) => ({
  adaptiveLearning: {
    actorId: sanitizeText(actorId, 120) || sanitizeText(userId, 120),
    userId: sanitizeText(userId, 120),
    events: toArray(rows).map((row) => row?.event || row).filter(Boolean),
    pendingEventIds: [],
  },
});

export const buildAdaptiveLearningExportSummary = ({
  normalizedEvents = [],
  extractionSummary = {},
  sourceKind = "unknown",
  exportedAt = Date.now(),
  label = "",
} = {}) => {
  const safeEvents = toArray(normalizedEvents).filter(Boolean);
  const byEventName = safeEvents.reduce((acc, event) => {
    const key = sanitizeText(event?.eventName || "unknown", 120) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const byOwner = safeEvents.reduce((acc, event) => {
    const key = sanitizeText(event?.payload?.owner || "unknown", 60) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    label: sanitizeText(label, 160),
    exportedAt,
    sourceKind: sanitizeText(sourceKind, 80) || "unknown",
    eventCount: safeEvents.length,
    actorCount: Number(extractionSummary?.actorCount || 0),
    sourceCount: Number(extractionSummary?.sourceCount || 0),
    discardedCount: Number(extractionSummary?.discardedCount || 0),
    byEventName,
    byOwner,
  };
};

export const buildAdaptiveLearningExportArtifacts = ({
  rawSources = [],
  sourceKind = "unknown",
  exportedAt = Date.now(),
  label = "",
} = {}) => {
  const extraction = extractAdaptiveLearningEvents({ sources: rawSources });
  const summary = buildAdaptiveLearningExportSummary({
    normalizedEvents: extraction.events,
    extractionSummary: extraction.summary,
    sourceKind,
    exportedAt,
    label,
  });
  return {
    sourceKind: summary.sourceKind,
    exportedAt,
    label: summary.label,
    summary,
    extractionSummary: extraction.summary,
    normalizedEvents: extraction.events,
    rawSources,
  };
};
