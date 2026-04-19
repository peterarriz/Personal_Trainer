const {
  fetchJson,
  getSupabaseConfig,
  loadTrainerData,
} = require("./garmin");

function sanitizeText(value = "", maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function toArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function getServiceRoleKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
  ];
  return candidates.find((value) => String(value || "").trim()) || "";
}

function getAdaptiveLearningEventTable() {
  return sanitizeText(
    process.env.SUPABASE_ADAPTIVE_EVENTS_TABLE
    || process.env.ADAPTIVE_LEARNING_EVENT_TABLE
    || "adaptive_learning_events",
    120
  );
}

function isAdaptiveEventSinkEnabled() {
  const raw = sanitizeText(
    process.env.ENABLE_ADAPTIVE_EVENT_SINK
    || process.env.ADAPTIVE_LEARNING_EVENT_SINK_ENABLED
    || "",
    20
  ).toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "enabled" || raw === "on";
}

function getAdaptiveLearningSinkDiagnostics() {
  const { url, anonKey } = getSupabaseConfig();
  const serviceRoleKey = getServiceRoleKey();
  const table = getAdaptiveLearningEventTable();
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!table) missing.push("SUPABASE_ADAPTIVE_EVENTS_TABLE");
  const enabled = isAdaptiveEventSinkEnabled();
  return {
    enabled,
    configured: enabled && missing.length === 0,
    missing,
    url,
    anonKey,
    serviceRoleKey,
    table,
    message: enabled
      ? missing.length
        ? "Adaptive event sink is enabled but not fully configured."
        : "Adaptive event sink is configured."
      : "Adaptive event sink is disabled on this deployment.",
  };
}

function sanitizeAdaptiveEvent(event = null) {
  if (!event || typeof event !== "object") return null;
  const eventId = sanitizeText(event?.eventId || "", 160);
  const eventName = sanitizeText(event?.eventName || "", 120);
  const actorId = sanitizeText(event?.actorId || "", 120);
  const userId = sanitizeText(event?.userId || "", 120);
  const localActorId = sanitizeText(event?.localActorId || "", 120);
  const occurredAt = Number(event?.occurredAt || 0);
  if (!eventId || !eventName || !actorId || !Number.isFinite(occurredAt) || occurredAt <= 0) return null;
  return {
    eventId,
    eventName,
    eventVersion: Math.max(1, Number(event?.eventVersion || 1) || 1),
    schemaVersion: sanitizeText(event?.schemaVersion || "", 40),
    actorId,
    userId,
    localActorId,
    dedupeKey: sanitizeText(event?.dedupeKey || "", 220),
    occurredAt,
    payload: event?.payload && typeof event.payload === "object" ? event.payload : {},
  };
}

function buildAdaptiveLearningEventRow(event = {}, userId = "") {
  const normalized = sanitizeAdaptiveEvent(event);
  if (!normalized) return null;
  return {
    id: normalized.eventId,
    user_id: sanitizeText(userId || normalized.userId || "", 120),
    actor_id: normalized.actorId,
    local_actor_id: normalized.localActorId,
    event_name: normalized.eventName,
    event_version: normalized.eventVersion,
    schema_version: normalized.schemaVersion,
    occurred_at: new Date(normalized.occurredAt).toISOString(),
    dedupe_key: normalized.dedupeKey || null,
    decision_id: sanitizeText(normalized?.payload?.decisionId || "", 160) || null,
    recommendation_join_key: sanitizeText(normalized?.payload?.recommendationJoinKey || "", 160) || null,
    payload: normalized.payload || {},
  };
}

async function insertAdaptiveLearningEventRows({
  userId = "",
  events = [],
} = {}) {
  const diagnostics = getAdaptiveLearningSinkDiagnostics();
  if (!diagnostics.configured) {
    const error = new Error(diagnostics.message || "Adaptive event sink is not configured.");
    error.code = diagnostics.enabled ? "adaptive_event_sink_misconfigured" : "adaptive_event_sink_disabled";
    error.httpStatus = 503;
    throw error;
  }
  const safeRows = toArray(events)
    .map((event) => buildAdaptiveLearningEventRow(event, userId))
    .filter(Boolean);
  if (!safeRows.length) {
    return {
      insertedRows: [],
      ingestedEventIds: [],
      pendingEventIds: [],
    };
  }

  const endpoint = `${diagnostics.url}/rest/v1/${encodeURIComponent(diagnostics.table)}?on_conflict=id`;
  const { res, data, text } = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      apikey: diagnostics.serviceRoleKey,
      Authorization: `Bearer ${diagnostics.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(safeRows),
  });

  if (!res.ok) {
    const error = new Error("Adaptive event ingestion failed.");
    error.code = "adaptive_event_ingest_failed";
    error.httpStatus = res.status || 500;
    error.detail = text;
    throw error;
  }

  const insertedRows = Array.isArray(data) ? data : [];
  const allIds = safeRows.map((row) => sanitizeText(row?.id || "", 160)).filter(Boolean);
  return {
    insertedRows,
    ingestedEventIds: allIds,
    pendingEventIds: [],
  };
}

async function listAdaptiveLearningEventsFromSink({
  userId = "",
  limit = 1000,
} = {}) {
  const diagnostics = getAdaptiveLearningSinkDiagnostics();
  if (!diagnostics.configured) {
    return {
      source: "disabled",
      events: [],
      configured: false,
    };
  }
  const safeLimit = Math.max(1, Math.min(5000, Number(limit || 1000) || 1000));
  const query = `${diagnostics.url}/rest/v1/${encodeURIComponent(diagnostics.table)}?user_id=eq.${encodeURIComponent(userId)}&order=occurred_at.asc&limit=${safeLimit}`;
  const { res, data, text } = await fetchJson(query, {
    headers: {
      apikey: diagnostics.serviceRoleKey,
      Authorization: `Bearer ${diagnostics.serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const error = new Error("Adaptive event export failed.");
    error.code = "adaptive_event_export_failed";
    error.httpStatus = res.status || 500;
    error.detail = text;
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    source: "event_sink",
    configured: true,
    rows,
    events: rows.map((row) => row?.payload && typeof row.payload === "object"
      ? {
          ...(row.payload.__rawEvent || {}),
          eventId: sanitizeText(row?.id || row?.payload?.__rawEvent?.eventId || "", 160),
          eventName: sanitizeText(row?.event_name || row?.payload?.__rawEvent?.eventName || "", 120),
          eventVersion: Number(row?.event_version || row?.payload?.__rawEvent?.eventVersion || 1) || 1,
          schemaVersion: sanitizeText(row?.schema_version || row?.payload?.__rawEvent?.schemaVersion || "", 40),
          actorId: sanitizeText(row?.actor_id || row?.payload?.__rawEvent?.actorId || "", 120),
          userId: sanitizeText(row?.user_id || row?.payload?.__rawEvent?.userId || "", 120),
          localActorId: sanitizeText(row?.local_actor_id || row?.payload?.__rawEvent?.localActorId || "", 120),
          occurredAt: Date.parse(row?.occurred_at || "") || Number(row?.payload?.__rawEvent?.occurredAt || 0) || 0,
          dedupeKey: sanitizeText(row?.dedupe_key || row?.payload?.__rawEvent?.dedupeKey || "", 220),
          payload: row?.payload?.__rawEvent?.payload && typeof row.payload.__rawEvent.payload === "object"
            ? row.payload.__rawEvent.payload
            : row.payload,
        }
      : null).filter(Boolean),
  };
}

async function listAdaptiveLearningEventsFromTrainerData({
  userAccessToken = "",
  userId = "",
} = {}) {
  const data = await loadTrainerData(userAccessToken, userId);
  const events = toArray(data?.adaptiveLearning?.events).map((event) => sanitizeAdaptiveEvent(event)).filter(Boolean);
  return {
    source: "trainer_data",
    configured: true,
    events,
    snapshot: data?.adaptiveLearning || null,
  };
}

module.exports = {
  buildAdaptiveLearningEventRow,
  getAdaptiveLearningSinkDiagnostics,
  insertAdaptiveLearningEventRows,
  isAdaptiveEventSinkEnabled,
  listAdaptiveLearningEventsFromSink,
  listAdaptiveLearningEventsFromTrainerData,
  sanitizeAdaptiveEvent,
};
