import { dedupeStrings } from "../utils/collection-utils.js";

export const PROVENANCE_VERSION = 1;

export const PROVENANCE_ACTORS = {
  user: "user",
  deterministicEngine: "deterministic_engine",
  aiInterpretation: "ai_interpretation",
  migration: "migration",
  fallback: "fallback",
};

const VALID_ACTORS = new Set(Object.values(PROVENANCE_ACTORS));
const VALID_CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const buildProvenanceEvent = ({
  actor = PROVENANCE_ACTORS.deterministicEngine,
  trigger = "",
  mutationType = "",
  revisionReason = "",
  sourceInputs = [],
  confidence = null,
  timestamp = Date.now(),
  details = {},
} = {}) => ({
  version: PROVENANCE_VERSION,
  actor: VALID_ACTORS.has(actor) ? actor : PROVENANCE_ACTORS.deterministicEngine,
  trigger: sanitizeText(trigger, 80) || "unknown_trigger",
  mutationType: sanitizeText(mutationType, 80) || "state_update",
  revisionReason: sanitizeText(revisionReason, 120) || "",
  sourceInputs: dedupeStrings((sourceInputs || []).map((value) => sanitizeText(value, 120))).slice(0, 8),
  confidence: VALID_CONFIDENCE_LEVELS.has(confidence) ? confidence : null,
  timestamp: Number(timestamp) || Date.now(),
  details: clonePlainValue(details || {}),
});

export const normalizeProvenanceEvent = (event = null, fallbacks = {}) => {
  if (!event || typeof event !== "object") {
    return buildProvenanceEvent(fallbacks);
  }
  return buildProvenanceEvent({
    actor: event?.actor || fallbacks?.actor,
    trigger: event?.trigger || fallbacks?.trigger,
    mutationType: event?.mutationType || fallbacks?.mutationType,
    revisionReason: event?.revisionReason || event?.reason || fallbacks?.revisionReason,
    sourceInputs: event?.sourceInputs || fallbacks?.sourceInputs || [],
    confidence: event?.confidence || fallbacks?.confidence || null,
    timestamp: event?.timestamp || event?.capturedAt || event?.updatedAt || fallbacks?.timestamp || Date.now(),
    details: {
      ...(clonePlainValue(event?.details || {}) || {}),
      ...(clonePlainValue(fallbacks?.details || {}) || {}),
    },
  });
};

export const buildProvenanceSummary = ({ keyDrivers = [], events = [], fallbackSummary = "" } = {}) => {
  const driverText = dedupeStrings((keyDrivers || []).map((value) => sanitizeText(value, 120))).slice(0, 3);
  if (driverText.length > 0) {
    return `Based on ${driverText.join(", ")}.`;
  }
  const primaryEvent = (events || []).find(Boolean) || null;
  if (primaryEvent?.revisionReason) {
    return sanitizeText(primaryEvent.revisionReason, 200);
  }
  return sanitizeText(fallbackSummary, 200);
};

export const buildStructuredProvenance = ({
  keyDrivers = [],
  events = [],
  summary = "",
} = {}) => {
  const normalizedEvents = (events || []).map((event) => normalizeProvenanceEvent(event)).filter(Boolean);
  const normalizedDrivers = dedupeStrings((keyDrivers || []).map((value) => sanitizeText(value, 120))).slice(0, 8);
  const updatedAt = normalizedEvents.reduce((max, event) => Math.max(max, Number(event?.timestamp || 0) || 0), 0) || Date.now();

  return {
    version: PROVENANCE_VERSION,
    summary: buildProvenanceSummary({ keyDrivers: normalizedDrivers, events: normalizedEvents, fallbackSummary: summary }),
    keyDrivers: normalizedDrivers,
    events: normalizedEvents,
    updatedAt,
  };
};

export const normalizeStructuredProvenance = (provenance = null, fallbacks = {}) => {
  if (provenance?.version === PROVENANCE_VERSION && Array.isArray(provenance?.events)) {
    return buildStructuredProvenance({
      keyDrivers: provenance?.keyDrivers || [],
      events: provenance?.events || [],
      summary: provenance?.summary || "",
    });
  }
  const fallbackEvents = Array.isArray(fallbacks?.events) ? fallbacks.events : [];
  const legacyEvents = Array.isArray(provenance?.events)
    ? provenance.events
    : provenance
    ? [normalizeProvenanceEvent(provenance, fallbacks)]
    : [];
  return buildStructuredProvenance({
    keyDrivers: provenance?.keyDrivers || fallbacks?.keyDrivers || [],
    events: [...legacyEvents, ...fallbackEvents].filter(Boolean),
    summary: provenance?.summary || fallbacks?.summary || "",
  });
};

export const buildLegacyProvenanceAdjustmentView = (events = []) => (
  (events || []).map((event) => ({
    type: event?.trigger || "unknown_trigger",
    actor: event?.actor || PROVENANCE_ACTORS.deterministicEngine,
    reason: event?.revisionReason || "",
    sourceInputs: clonePlainValue(event?.sourceInputs || []),
    mutationType: event?.mutationType || "",
    timestamp: event?.timestamp || Date.now(),
  }))
);

export const appendProvenanceSidecar = (container = {}, bucket = "", key = "", provenance = null) => ({
  ...(container || {}),
  provenance: {
    ...((container || {}).provenance || {}),
    [bucket]: {
      ...(((container || {}).provenance || {})?.[bucket] || {}),
      [String(key || "")]: provenance,
    },
  },
});

export const describeProvenanceRecord = (provenance = null, fallbackSummary = "") => (
  normalizeStructuredProvenance(provenance, { summary: fallbackSummary })?.summary || sanitizeText(fallbackSummary, 200)
);
