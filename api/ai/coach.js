const { getBearerToken, getSupabaseUser, loadTrainerData, saveTrainerData, sendJson } = require("../_lib/garmin");

const MODEL_DEFAULTS = {
  coach_snapshot: "claude-haiku-4-5",
  adjustment_notification: "claude-haiku-4-5",
  coach_conversation: "claude-sonnet-4-6",
  weekly_review: "claude-sonnet-4-6",
  plan_generation: "claude-sonnet-4-6",
  plan_adjustment: "claude-sonnet-4-6",
  generic: "claude-sonnet-4-6",
};

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
]);

function getAnthropicKey() {
  return String(
    process.env.ANTHROPIC_API_KEY
    || process.env.CLAUDE_API_KEY
    || process.env.VERCEL_ANTHROPIC_API_KEY
    || ""
  ).trim();
}

function clampMaxTokens(value, fallback = 600) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(64, Math.min(1200, Math.round(n)));
}

function normalizeMessages(messages, user) {
  const input = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: "user", content: String(user || "").trim() }];
  return input
    .map((entry) => ({
      role: entry?.role === "assistant" ? "assistant" : "user",
      content: String(entry?.content || "").trim().slice(0, 12000),
    }))
    .filter((entry) => entry.content);
}

function normalizeAiControl(aiControl = {}) {
  return {
    snapshots: { ...(aiControl?.snapshots || {}) },
    weeklyReviews: { ...(aiControl?.weeklyReviews || {}) },
    cachedResponses: { ...(aiControl?.cachedResponses || {}) },
    usageLog: Array.isArray(aiControl?.usageLog) ? aiControl.usageLog.slice(-250) : [],
  };
}

function getCachedEntry(aiControl, requestType, cacheKey) {
  if (!cacheKey) return null;
  if (requestType === "coach_snapshot") return aiControl.snapshots?.[cacheKey] || null;
  if (requestType === "weekly_review") return aiControl.weeklyReviews?.[cacheKey] || null;
  return aiControl.cachedResponses?.[requestType]?.[cacheKey] || null;
}

function setCachedEntry(aiControl, requestType, cacheKey, entry) {
  if (!cacheKey) return aiControl;
  if (requestType === "coach_snapshot") {
    aiControl.snapshots = { ...(aiControl.snapshots || {}), [cacheKey]: entry };
    return aiControl;
  }
  if (requestType === "weekly_review") {
    aiControl.weeklyReviews = { ...(aiControl.weeklyReviews || {}), [cacheKey]: entry };
    return aiControl;
  }
  aiControl.cachedResponses = {
    ...(aiControl.cachedResponses || {}),
    [requestType]: {
      ...((aiControl.cachedResponses || {})[requestType] || {}),
      [cacheKey]: entry,
    },
  };
  return aiControl;
}

function isCacheValid(entry, { cacheMaxAgeMs = 0, invalidateAfterTs = 0, cacheFingerprint = "" } = {}) {
  if (!entry?.text) return false;
  const generatedAt = Number(entry.generatedAt || 0);
  if (cacheMaxAgeMs > 0 && generatedAt > 0 && (Date.now() - generatedAt) > cacheMaxAgeMs) return false;
  if (invalidateAfterTs > 0 && generatedAt > 0 && generatedAt < Number(invalidateAfterTs)) return false;
  if (cacheFingerprint && entry.cacheFingerprint && entry.cacheFingerprint !== cacheFingerprint) return false;
  return true;
}

function getRateLimitState(aiControl, requestType) {
  const usageLog = Array.isArray(aiControl?.usageLog) ? aiControl.usageLog : [];
  if (requestType !== "coach_conversation") return { allowed: true, retryAfterMinutes: 0 };
  const cutoff = Date.now() - (60 * 60 * 1000);
  const recent = usageLog.filter((entry) => entry?.type === "coach_conversation" && Number(entry?.ts || 0) >= cutoff);
  if (recent.length < 10) return { allowed: true, retryAfterMinutes: 0 };
  const oldestTs = Math.min(...recent.map((entry) => Number(entry.ts || 0)).filter(Boolean));
  const retryAfterMs = Math.max(0, (oldestTs + (60 * 60 * 1000)) - Date.now());
  return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil(retryAfterMs / 60000)) };
}

function appendUsage(aiControl, usageEntry) {
  aiControl.usageLog = [...(aiControl.usageLog || []), usageEntry].slice(-250);
  return aiControl;
}

function chooseModel(requestType, requestedModel) {
  const preferred = String(requestedModel || "").trim();
  if (preferred && ALLOWED_MODELS.has(preferred)) return preferred;
  return MODEL_DEFAULTS[requestType] || MODEL_DEFAULTS.generic;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function pipeStream(upstream, res) {
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Use POST for coach AI requests." });
  }

  const anthropicKey = getAnthropicKey();
  if (!anthropicKey) {
    return sendJson(res, 500, {
      code: "anthropic_not_configured",
      message: "Coach AI is not configured on the server.",
      fix: "Set ANTHROPIC_API_KEY in Vercel without any VITE_ or NEXT_PUBLIC_ prefix.",
    });
  }

  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return sendJson(res, 401, {
        code: "auth_required",
        message: "You must be signed in before using coach AI.",
        fix: "Sign back into FORMA, then retry.",
      });
    }

    const user = await getSupabaseUser(authToken);
    const body = await readJsonBody(req);
    const requestType = String(body?.requestType || "generic");
    const selectedModel = chooseModel(requestType, body?.model);
    const messages = normalizeMessages(body?.messages, body?.user);
    if (!messages.length) {
      return sendJson(res, 400, {
        code: "missing_prompt",
        message: "Coach AI needs a user message or message history.",
        fix: "Send at least one user message in the request payload.",
      });
    }

    const existingData = await loadTrainerData(authToken, user.id);
    const nextData = { ...(existingData || {}) };
    const nextPersonalization = { ...(nextData.personalization || {}) };
    const aiControl = normalizeAiControl(nextPersonalization.aiControl || {});
    const cacheKey = String(body?.cacheKey || "").trim();
    const cacheOptions = {
      cacheMaxAgeMs: Number(body?.cacheMaxAgeMs || 0),
      invalidateAfterTs: Number(body?.invalidateAfterTs || 0),
      cacheFingerprint: String(body?.cacheFingerprint || "").trim(),
    };

    const cachedEntry = getCachedEntry(aiControl, requestType, cacheKey);
    if (cachedEntry && isCacheValid(cachedEntry, cacheOptions)) {
      return sendJson(res, 200, {
        text: String(cachedEntry.text || ""),
        usage: null,
        cached: true,
        model: cachedEntry.model || selectedModel,
      });
    }

    const rateLimit = getRateLimitState(aiControl, requestType);
    if (!rateLimit.allowed) {
      return sendJson(res, 429, {
        code: "rate_limited",
        message: "Coach is resting.",
        retryAfterMinutes: rateLimit.retryAfterMinutes,
        fix: `Try again in ${rateLimit.retryAfterMinutes} minutes.`,
      });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: clampMaxTokens(body?.maxTokens, body?.stream ? 450 : 600),
        stream: Boolean(body?.stream),
        ...(body?.system ? { system: String(body.system).slice(0, 16000) } : {}),
        messages,
      }),
    });

    if (body?.stream) {
      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        return sendJson(res, upstream.status || 502, {
          code: "anthropic_stream_failed",
          message: "Coach streaming failed before a response could start.",
          fix: "Retry in a moment. If this keeps happening, verify the server-side Anthropic key in Vercel.",
          detail: text,
        });
      }
      appendUsage(aiControl, {
        ts: Date.now(),
        type: requestType,
        model: selectedModel,
        inputTokens: null,
        outputTokens: null,
        cached: false,
      });
      nextPersonalization.aiControl = aiControl;
      nextData.personalization = nextPersonalization;
      await saveTrainerData(authToken, user.id, nextData);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();
      await pipeStream(upstream, res);
      return;
    }

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return sendJson(res, upstream.status || 502, {
        code: data?.error?.type || "anthropic_request_failed",
        message: data?.error?.message || "Coach AI request failed on the server.",
        fix: "Retry in a moment. If this keeps failing, verify ANTHROPIC_API_KEY in Vercel.",
      });
    }

    const text = String(data?.content?.[0]?.text || "").trim();
    const generatedAt = Date.now();
    appendUsage(aiControl, {
      ts: generatedAt,
      type: requestType,
      model: selectedModel,
      inputTokens: Number(data?.usage?.input_tokens || 0) || null,
      outputTokens: Number(data?.usage?.output_tokens || 0) || null,
      cached: false,
      cacheKey: cacheKey || null,
    });
    if (cacheKey && text) {
      setCachedEntry(aiControl, requestType, cacheKey, {
        text,
        generatedAt,
        model: selectedModel,
        cacheFingerprint: cacheOptions.cacheFingerprint || "",
      });
    }
    nextPersonalization.aiControl = aiControl;
    nextData.personalization = nextPersonalization;
    await saveTrainerData(authToken, user.id, nextData);

    return sendJson(res, 200, {
      text,
      usage: data?.usage || null,
      cached: false,
      model: selectedModel,
    });
  } catch (error) {
    return sendJson(res, 500, {
      code: "coach_proxy_failed",
      message: error?.message || "Coach AI proxy failed before Anthropic could respond.",
      fix: "Retry in a moment. If the issue persists, verify your Supabase session and the server-side Anthropic key.",
    });
  }
};
