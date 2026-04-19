const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const ADAPTIVE_LEARNING_SINK_ENDPOINT = "/api/adaptive-learning/events";
export const ADAPTIVE_LEARNING_SINK_BATCH_MODEL = "adaptive_learning_sink_batch_v1";

export const buildAdaptiveLearningSinkBatch = ({
  events = [],
  snapshot = null,
  source = "client_replay",
} = {}) => {
  const safeEvents = toArray(events).filter(Boolean);
  return {
    model: ADAPTIVE_LEARNING_SINK_BATCH_MODEL,
    source: sanitizeText(source, 80) || "client_replay",
    actorId: sanitizeText(snapshot?.actorId || "", 120),
    userId: sanitizeText(snapshot?.userId || "", 120),
    eventCount: safeEvents.length,
    eventIds: safeEvents.map((event) => sanitizeText(event?.eventId || "", 160)).filter(Boolean),
    events: safeEvents,
  };
};

export const ingestAdaptiveLearningEvents = async ({
  safeFetchWithTimeout,
  authSession = null,
  endpoint = ADAPTIVE_LEARNING_SINK_ENDPOINT,
  events = [],
  snapshot = null,
  timeoutMs = 8500,
  source = "client_replay",
} = {}) => {
  const token = String(authSession?.access_token || "").trim();
  const safeEvents = toArray(events).filter(Boolean);
  if (typeof safeFetchWithTimeout !== "function") {
    return {
      ok: false,
      skipped: true,
      reason: "missing_fetch",
      ingestedEventIds: [],
      pendingEventIds: safeEvents.map((event) => sanitizeText(event?.eventId || "", 160)).filter(Boolean),
    };
  }
  if (!token) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_auth",
      ingestedEventIds: [],
      pendingEventIds: safeEvents.map((event) => sanitizeText(event?.eventId || "", 160)).filter(Boolean),
    };
  }
  if (!safeEvents.length) {
    return {
      ok: true,
      skipped: true,
      reason: "no_events",
      ingestedEventIds: [],
      pendingEventIds: [],
    };
  }

  const response = await safeFetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      buildAdaptiveLearningSinkBatch({
        events: safeEvents,
        snapshot,
        source,
      })
    ),
  }, timeoutMs);

  const body = await response.json().catch(() => ({}));
  const ingestedEventIds = toArray(body?.ingestedEventIds).map((eventId) => sanitizeText(eventId, 160)).filter(Boolean);
  const pendingEventIds = toArray(body?.pendingEventIds).map((eventId) => sanitizeText(eventId, 160)).filter(Boolean);
  if (!response.ok || body?.ok === false) {
    const error = new Error(sanitizeText(body?.message || "Adaptive event ingestion failed.", 220) || "Adaptive event ingestion failed.");
    error.code = sanitizeText(body?.code || "", 80) || "adaptive_event_ingest_failed";
    error.httpStatus = Number(response.status || 0) || null;
    error.ingestedEventIds = ingestedEventIds;
    error.pendingEventIds = pendingEventIds.length ? pendingEventIds : safeEvents.map((event) => sanitizeText(event?.eventId || "", 160)).filter(Boolean);
    throw error;
  }
  return {
    ok: true,
    ingestedEventIds: ingestedEventIds.length ? ingestedEventIds : safeEvents.map((event) => sanitizeText(event?.eventId || "", 160)).filter(Boolean),
    pendingEventIds,
    transport: sanitizeText(body?.transport || "", 80),
    endpoint: sanitizeText(endpoint, 160),
  };
};
