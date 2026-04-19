const {
  getBearerToken,
  getSupabaseUser,
  sendJson,
} = require("../_lib/garmin");
const {
  getAdaptiveLearningSinkDiagnostics,
  insertAdaptiveLearningEventRows,
  listAdaptiveLearningEventsFromSink,
  listAdaptiveLearningEventsFromTrainerData,
  sanitizeAdaptiveEvent,
} = require("../_lib/adaptive-learning");
const { applyRateLimitHeaders, consumeRateLimit, getClientIp } = require("../_lib/security");

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async (req, res) => {
  const authToken = getBearerToken(req);
  if (!authToken) {
    return sendJson(res, 401, {
      ok: false,
      code: "auth_required",
      message: "You must be signed in before using adaptive event ingestion.",
    });
  }

  try {
    const user = await getSupabaseUser(authToken);
    const clientIp = getClientIp(req);

    if (req.method === "GET") {
      const source = String(req.query?.source || "auto").trim().toLowerCase();
      const diagnostics = getAdaptiveLearningSinkDiagnostics();
      const rateLimit = consumeRateLimit({
        bucket: "adaptive_learning_export",
        key: `${clientIp}:${user.id}`,
        limit: 20,
        windowMs: 15 * 60 * 1000,
      });
      applyRateLimitHeaders(res, rateLimit);
      if (!rateLimit.allowed) {
        return sendJson(res, 429, {
          ok: false,
          code: "rate_limited",
          message: "Adaptive export requests are temporarily rate limited.",
        });
      }
      if (source === "diagnostics") {
        return sendJson(res, 200, {
          ok: true,
          code: diagnostics.configured ? "adaptive_event_sink_configured" : "adaptive_event_sink_unavailable",
          diagnostics: {
            enabled: diagnostics.enabled,
            configured: diagnostics.configured,
            missing: diagnostics.missing,
            table: diagnostics.table,
            message: diagnostics.message,
          },
        });
      }
      const eventSource = (source === "event_sink" || (source === "auto" && diagnostics.configured))
        ? await listAdaptiveLearningEventsFromSink({
            userId: user.id,
            limit: req.query?.limit,
          }).catch(() => null)
        : null;
      if (eventSource?.events?.length) {
        return sendJson(res, 200, {
          ok: true,
          code: "adaptive_events_exported",
          source: eventSource.source,
          eventCount: eventSource.events.length,
          events: eventSource.events,
        });
      }
      const trainerDataSource = await listAdaptiveLearningEventsFromTrainerData({
        userAccessToken: authToken,
        userId: user.id,
      });
      return sendJson(res, 200, {
        ok: true,
        code: "adaptive_events_exported",
        source: trainerDataSource.source,
        eventCount: trainerDataSource.events.length,
        events: trainerDataSource.events,
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, {
        ok: false,
        code: "method_not_allowed",
        message: "Use GET or POST for adaptive events.",
      });
    }

    const rateLimit = consumeRateLimit({
      bucket: "adaptive_learning_ingest",
      key: `${clientIp}:${user.id}`,
      limit: 120,
      windowMs: 15 * 60 * 1000,
    });
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      return sendJson(res, 429, {
        ok: false,
        code: "rate_limited",
        message: "Adaptive event ingestion is temporarily rate limited.",
      });
    }

    const body = await readJsonBody(req);
    const safeEvents = (Array.isArray(body?.events) ? body.events : [])
      .map((event) => sanitizeAdaptiveEvent(event))
      .filter(Boolean);
    if (!safeEvents.length) {
      return sendJson(res, 400, {
        ok: false,
        code: "missing_events",
        message: "Adaptive event ingestion requires at least one valid event.",
      });
    }
    const result = await insertAdaptiveLearningEventRows({
      userId: user.id,
      events: safeEvents.map((event) => ({
        ...event,
        payload: {
          ...event.payload,
          __rawEvent: event,
        },
      })),
    });
    return sendJson(res, 202, {
      ok: true,
      code: "adaptive_events_ingested",
      transport: "supabase_event_sink",
      ingestedEventIds: result.ingestedEventIds,
      pendingEventIds: result.pendingEventIds,
      eventCount: result.ingestedEventIds.length,
    });
  } catch (error) {
    return sendJson(res, Number(error?.httpStatus || 500) || 500, {
      ok: false,
      code: String(error?.code || "adaptive_event_ingest_failed"),
      message: error?.message || "Adaptive event handling failed.",
      detail: String(error?.detail || "").slice(0, 240),
    });
  }
};
