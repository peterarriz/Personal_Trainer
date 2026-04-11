const { sendJson } = require("./garmin");

const INTAKE_REQUEST_TYPES = new Set(["goal_interpretation", "clarifying_question_generation"]);
const GOAL_TYPES = new Set(["performance", "strength", "body_comp", "appearance", "hybrid", "general_fitness", "re_entry"]);
const MEASURABILITY_TIERS = new Set(["fully_measurable", "proxy_measurable", "exploratory_fuzzy"]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
const TIMELINE_STATUSES = new Set(["realistic", "aggressive", "unclear"]);
const METRIC_KINDS = new Set(["primary", "proxy"]);
const PROVIDER_DEFAULTS = {
  anthropic: {
    model: "claude-haiku-4-5",
    url: "https://api.anthropic.com/v1/messages",
  },
  openai: {
    model: "gpt-4.1-mini",
    url: "https://api.openai.com/v1/chat/completions",
  },
};

function sanitizeText(value = "", maxLength = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function slugify(value = "", fallback = "") {
  const slug = sanitizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function dedupeStrings(values = [], maxLength = 180) {
  const seen = new Set();
  return toArray(values)
    .map((value) => sanitizeText(value, maxLength))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeMetric(metric = null, fallbackKind = "proxy") {
  if (!metric || typeof metric !== "object") return null;
  const key = slugify(metric?.key || metric?.label || "", "");
  const label = sanitizeText(metric?.label || "", 80);
  const unit = sanitizeText(metric?.unit || "", 20);
  const kind = sanitizeText(metric?.kind || fallbackKind, 16).toLowerCase();
  const targetValue = sanitizeText(metric?.targetValue || metric?.value || "", 40);
  if (!key || !label || !METRIC_KINDS.has(kind)) return null;
  return {
    key,
    label,
    unit,
    kind,
    ...(targetValue ? { targetValue } : {}),
  };
}

function normalizeMetrics(payload = {}) {
  const primaryMetric = normalizeMetric(payload?.primaryMetric || null, "primary");
  const proxyMetrics = toArray(payload?.proxyMetrics)
    .map((metric) => normalizeMetric(metric, "proxy"))
    .filter(Boolean);
  const suggestedMetrics = toArray(payload?.suggestedMetrics || payload?.metrics)
    .map((metric) => normalizeMetric(metric, metric?.kind === "primary" ? "primary" : "proxy"))
    .filter(Boolean);
  const merged = [];
  const seen = new Set();
  [primaryMetric, ...proxyMetrics, ...suggestedMetrics].filter(Boolean).forEach((metric) => {
    const dedupeKey = `${metric.key}:${metric.kind}:${metric.unit}:${metric.targetValue || ""}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    merged.push(metric);
  });
  const normalizedPrimary = merged.find((metric) => metric.kind === "primary") || null;
  const normalizedProxy = merged.filter((metric) => metric.kind === "proxy");
  return {
    primaryMetric: normalizedPrimary,
    proxyMetrics: normalizedProxy.slice(0, 4),
    suggestedMetrics: merged.slice(0, 5),
  };
}

function sanitizeIntakeInterpretationProposal(payload = null) {
  const metrics = normalizeMetrics(payload || {});
  const horizonRaw = Number(payload?.timelineRealism?.suggestedHorizonWeeks ?? payload?.targetHorizonWeeks);
  const confidence = sanitizeText(payload?.confidence || payload?.confidenceLevel || "", 20).toLowerCase();
  const interpretedGoalType = sanitizeText(payload?.interpretedGoalType || payload?.goalFamily || "", 40).toLowerCase();
  const measurabilityTier = sanitizeText(payload?.measurabilityTier || "", 40).toLowerCase();
  const timelineStatus = sanitizeText(payload?.timelineRealism?.status || "", 24).toLowerCase();
  return {
    interpretedGoalType: GOAL_TYPES.has(interpretedGoalType) ? interpretedGoalType : "general_fitness",
    measurabilityTier: MEASURABILITY_TIERS.has(measurabilityTier) ? measurabilityTier : "exploratory_fuzzy",
    primaryMetric: metrics.primaryMetric,
    proxyMetrics: metrics.proxyMetrics,
    suggestedMetrics: metrics.suggestedMetrics,
    confidence: CONFIDENCE_LEVELS.has(confidence) ? confidence : "low",
    timelineRealism: {
      status: TIMELINE_STATUSES.has(timelineStatus) ? timelineStatus : "unclear",
      summary: sanitizeText(payload?.timelineRealism?.summary || "", 220),
      suggestedHorizonWeeks: Number.isFinite(horizonRaw) ? Math.max(1, Math.min(104, Math.round(horizonRaw))) : null,
    },
    detectedConflicts: dedupeStrings(payload?.detectedConflicts || payload?.tradeoffs || [], 140).slice(0, 4),
    missingClarifyingQuestions: dedupeStrings(payload?.missingClarifyingQuestions || payload?.missingInformation || [], 180).slice(0, 4),
    coachSummary: sanitizeText(payload?.coachSummary || payload?.summary || "", 420),
  };
}

function parseJsonObjectFromText(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && sanitizeText(value, 160)) return String(value).trim();
  }
  return "";
}

function resolveConfiguredProvider(requestedProvider = "") {
  const preferred = sanitizeText(requestedProvider || getEnv("AI_INTAKE_PROVIDER"), 40).toLowerCase();
  const hasAnthropic = Boolean(getEnv("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "VERCEL_ANTHROPIC_API_KEY"));
  const hasOpenAi = Boolean(getEnv("OPENAI_API_KEY", "VERCEL_OPENAI_API_KEY"));
  if (preferred === "anthropic" && hasAnthropic) return "anthropic";
  if (preferred === "openai" && hasOpenAi) return "openai";
  if (hasAnthropic) return "anthropic";
  if (hasOpenAi) return "openai";
  return "";
}

function resolveProviderModel(provider = "") {
  if (provider === "anthropic") {
    return sanitizeText(getEnv("AI_INTAKE_MODEL_ANTHROPIC"), 80) || PROVIDER_DEFAULTS.anthropic.model;
  }
  if (provider === "openai") {
    return sanitizeText(getEnv("AI_INTAKE_MODEL_OPENAI"), 80) || PROVIDER_DEFAULTS.openai.model;
  }
  return "";
}

function buildIntakeInterpretationSystemPrompt(statePacket = null) {
  return `You are an intake interpretation assistant inside a fitness app. Respond ONLY with valid JSON, no other text.

Your source of truth is the typed intake packet below.
Treat all output as a proposal only. You are not the system of record and you may not resolve goals as canonical truth.
Do not invent injuries, deadlines, baseline facts, or appearance constraints that are not present in the packet.
Keep output compact and practical for planning.
AI_STATE_PACKET_JSON:${JSON.stringify(statePacket || {})}

Return JSON in this exact format:
{
  "interpretedGoalType": "performance|strength|body_comp|appearance|hybrid|general_fitness|re_entry",
  "measurabilityTier": "fully_measurable|proxy_measurable|exploratory_fuzzy",
  "primaryMetric": { "key": "metric_key", "label": "Metric label", "unit": "time", "kind": "primary", "targetValue": "1:45:00" },
  "proxyMetrics": [
    { "key": "metric_key", "label": "Metric label", "unit": "lb", "kind": "proxy" }
  ],
  "confidence": "low|medium|high",
  "timelineRealism": {
    "status": "realistic|aggressive|unclear",
    "summary": "short timeline realism assessment",
    "suggestedHorizonWeeks": 12
  },
  "detectedConflicts": ["short conflict"],
  "missingClarifyingQuestions": ["short question"],
  "coachSummary": "2-4 sentence intake interpretation for the user"
}

RULES:
- Max 1 primaryMetric.
- Max 4 proxyMetrics.
- Use "unclear" for timelineRealism.status when the user has not given enough timing specificity.
- missingClarifyingQuestions should be the smallest useful set. Max 3.
- detectedConflicts should describe goal tension or planning tradeoffs, not generic warnings. Max 3.
- confidence should reflect how complete and usable the current goal language is.
- coachSummary must stay under 120 words and remain interpretation-only.
- Never claim the goal is impossible. If the timeline is aggressive, say what is realistic first.`;
}

function getAnthropicApiKey() {
  return getEnv("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "VERCEL_ANTHROPIC_API_KEY");
}

function getOpenAiApiKey() {
  return getEnv("OPENAI_API_KEY", "VERCEL_OPENAI_API_KEY");
}

async function requestAnthropicInterpretation({ model = "", systemPrompt = "", userPrompt = "", fetchImpl = fetch }) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, failureReason: "provider_not_configured", provider: "anthropic", model };
  }
  const response = await fetchImpl(PROVIDER_DEFAULTS.anthropic.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      failureReason: sanitizeText(data?.error?.type || `http_${response.status}`, 80) || "anthropic_request_failed",
      detail: sanitizeText(data?.error?.message || "", 220),
      provider: "anthropic",
      model,
    };
  }
  return {
    ok: true,
    provider: "anthropic",
    model,
    rawText: sanitizeText(data?.content?.[0]?.text || "", 20000),
    usage: {
      inputTokens: Number(data?.usage?.input_tokens || 0) || null,
      outputTokens: Number(data?.usage?.output_tokens || 0) || null,
      totalTokens: null,
    },
  };
}

async function requestOpenAiInterpretation({ model = "", systemPrompt = "", userPrompt = "", fetchImpl = fetch }) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, failureReason: "provider_not_configured", provider: "openai", model };
  }
  const response = await fetchImpl(PROVIDER_DEFAULTS.openai.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 700,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      failureReason: sanitizeText(data?.error?.type || `http_${response.status}`, 80) || "openai_request_failed",
      detail: sanitizeText(data?.error?.message || "", 220),
      provider: "openai",
      model,
    };
  }
  const rawText = sanitizeText(
    data?.choices?.[0]?.message?.content
    || data?.output_text
    || "",
    20000
  );
  return {
    ok: true,
    provider: "openai",
    model,
    rawText,
    usage: {
      inputTokens: Number(data?.usage?.prompt_tokens || data?.usage?.input_tokens || 0) || null,
      outputTokens: Number(data?.usage?.completion_tokens || data?.usage?.output_tokens || 0) || null,
      totalTokens: Number(data?.usage?.total_tokens || 0) || null,
    },
  };
}

async function requestProviderInterpretation({ provider = "", model = "", systemPrompt = "", userPrompt = "", fetchImpl = fetch }) {
  if (provider === "anthropic") {
    return requestAnthropicInterpretation({ model, systemPrompt, userPrompt, fetchImpl });
  }
  if (provider === "openai") {
    return requestOpenAiInterpretation({ model, systemPrompt, userPrompt, fetchImpl });
  }
  return { ok: false, failureReason: "unsupported_provider", provider, model };
}

function logGatewayEvent(event = {}) {
  const safeEvent = {
    requestType: sanitizeText(event?.requestType || "", 80),
    provider: sanitizeText(event?.provider || "", 40),
    model: sanitizeText(event?.model || "", 80),
    latencyMs: Number(event?.latencyMs || 0) || 0,
    usage: event?.usage || null,
    failureReason: sanitizeText(event?.failureReason || "", 120),
    status: sanitizeText(event?.status || "", 40),
  };
  const logLine = JSON.stringify({ layer: "ai_provider_gateway", ...safeEvent });
  if (safeEvent.failureReason) console.error(logLine);
  else console.info(logLine);
}

async function runIntakeProviderGateway({
  statePacket = null,
  requestType = "goal_interpretation",
  requestedProvider = "",
  requestedModel = "",
  fetchImpl = fetch,
} = {}) {
  const startedAt = Date.now();
  const provider = resolveConfiguredProvider(requestedProvider);
  const normalizedRequestType = INTAKE_REQUEST_TYPES.has(requestType) ? requestType : "goal_interpretation";
  const model = sanitizeText(requestedModel || resolveProviderModel(provider), 80);
  if (!provider || !model) {
    const meta = {
      requestType: normalizedRequestType,
      provider: provider || "none",
      model: model || "",
      latencyMs: Date.now() - startedAt,
      usage: null,
      failureReason: "provider_not_configured",
      status: "failed",
    };
    logGatewayEvent(meta);
    return { ok: false, meta, interpretation: null, rawText: "" };
  }

  const providerResult = await requestProviderInterpretation({
    provider,
    model,
    systemPrompt: buildIntakeInterpretationSystemPrompt(statePacket),
    userPrompt: "Interpret the typed intake packet and return a JSON proposal only.",
    fetchImpl,
  });
  if (!providerResult.ok) {
    const meta = {
      requestType: normalizedRequestType,
      provider,
      model,
      latencyMs: Date.now() - startedAt,
      usage: providerResult.usage || null,
      failureReason: providerResult.failureReason || "provider_request_failed",
      status: "failed",
    };
    logGatewayEvent(meta);
    return { ok: false, meta, interpretation: null, rawText: providerResult.rawText || "" };
  }

  const parsed = parseJsonObjectFromText(providerResult.rawText || "");
  if (!parsed) {
    const meta = {
      requestType: normalizedRequestType,
      provider,
      model,
      latencyMs: Date.now() - startedAt,
      usage: providerResult.usage || null,
      failureReason: "invalid_provider_json",
      status: "failed",
    };
    logGatewayEvent(meta);
    return { ok: false, meta, interpretation: null, rawText: providerResult.rawText || "" };
  }

  const interpretation = sanitizeIntakeInterpretationProposal(parsed);
  const meta = {
    requestType: normalizedRequestType,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    usage: providerResult.usage || null,
    failureReason: "",
    status: "ok",
  };
  logGatewayEvent(meta);
  return { ok: true, meta, interpretation, rawText: providerResult.rawText || "" };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  buildIntakeInterpretationSystemPrompt,
  parseJsonObjectFromText,
  readJsonBody,
  resolveConfiguredProvider,
  runIntakeProviderGateway,
  sanitizeIntakeInterpretationProposal,
  sendJson,
};
