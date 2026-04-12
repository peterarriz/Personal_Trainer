const { sendJson } = require("./garmin");

const INTAKE_REQUEST_TYPES = new Set(["goal_interpretation", "clarifying_question_generation", "missing_field_extraction"]);
const GOAL_TYPES = new Set(["performance", "strength", "body_comp", "appearance", "hybrid", "general_fitness", "re_entry"]);
const MEASURABILITY_TIERS = new Set(["fully_measurable", "proxy_measurable", "exploratory_fuzzy"]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
const TIMELINE_STATUSES = new Set(["realistic", "aggressive", "unclear"]);
const METRIC_KINDS = new Set(["primary", "proxy"]);
const EXTRACTION_INPUT_TYPES = new Set(["number", "number_with_unit", "choice_chips", "date_or_month", "strength_top_set", "text"]);
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

function sanitizeStructuredValue(value = null, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeText(value, 160);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 6)
      .map((item) => sanitizeStructuredValue(item, depth + 1))
      .filter((item) => item !== null && item !== undefined && item !== "");
    return items;
  }
  if (typeof value === "object") {
    const out = {};
    Object.entries(value)
      .slice(0, 8)
      .forEach(([key, item]) => {
        const cleanKey = sanitizeText(key, 40);
        const cleanValue = sanitizeStructuredValue(item, depth + 1);
        if (!cleanKey || cleanValue === null || cleanValue === undefined || cleanValue === "") return;
        out[cleanKey] = cleanValue;
      });
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function sanitizeEvidenceSpan(span = {}) {
  const start = Number(span?.start);
  const end = Number(span?.end);
  const text = sanitizeText(span?.text || "", 120);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || !text) return null;
  return {
    start: Math.max(0, Math.round(start)),
    end: Math.max(Math.round(start), Math.round(end)),
    text,
  };
}

function sanitizeMissingField(field = {}) {
  const field_id = sanitizeText(field?.field_id || "", 80);
  const label = sanitizeText(field?.label || "", 120);
  const input_type = sanitizeText(field?.input_type || "text", 30).toLowerCase();
  const validation = field?.validation && typeof field.validation === "object"
    ? {
        kind: sanitizeText(field.validation.kind || "", 80),
        message: sanitizeText(field.validation.message || "", 220),
        ...(Number.isFinite(field.validation.min) ? { min: field.validation.min } : {}),
        ...(Number.isFinite(field.validation.max) ? { max: field.validation.max } : {}),
        ...(field.validation.direction ? { direction: sanitizeText(field.validation.direction, 20).toLowerCase() } : {}),
      }
    : {};
  if (!field_id || !label || !EXTRACTION_INPUT_TYPES.has(input_type)) return null;
  return {
    field_id,
    label,
    input_type,
    validation,
    examples: dedupeStrings(field?.examples || [], 120).slice(0, 4),
    options: toArray(field?.options)
      .map((item) => ({
        value: sanitizeText(item?.value || "", 80),
        label: sanitizeText(item?.label || item?.value || "", 120),
      }))
      .filter((item) => item.value && item.label)
      .slice(0, 6),
    unit_options: toArray(field?.unit_options)
      .map((item) => ({
        value: sanitizeText(item?.value || item, 40),
        label: sanitizeText(item?.label || item, 60),
      }))
      .filter((item) => item.value && item.label)
      .slice(0, 4),
  };
}

function sanitizeFieldExtractionRequest(request = {}) {
  return {
    utterance: sanitizeText(request?.utterance || "", 600),
    context: sanitizeText(request?.context || "", 220),
    missingFields: toArray(request?.missingFields || request?.missing_fields)
      .map((item) => sanitizeMissingField(item))
      .filter(Boolean)
      .slice(0, 6),
  };
}

function sanitizeMissingFieldExtractionProposal(payload = null, extractionRequest = {}) {
  const allowedFieldIds = new Set(
    toArray(extractionRequest?.missingFields).map((item) => sanitizeText(item?.field_id || "", 80)).filter(Boolean)
  );
  const seenFieldIds = new Set();
  const candidates = toArray(payload?.candidates || payload?.fields)
    .map((candidate) => {
      const field_id = sanitizeText(candidate?.field_id || candidate?.fieldId || "", 80);
      if (!field_id || !allowedFieldIds.has(field_id) || seenFieldIds.has(field_id)) return null;
      const raw_text = sanitizeText(candidate?.raw_text || candidate?.raw || candidate?.text || "", 220);
      const confidenceRaw = Number(candidate?.confidence ?? candidate?.parse_confidence ?? 0);
      const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
      if (!raw_text) return null;
      seenFieldIds.add(field_id);
      return {
        field_id,
        confidence,
        raw_text,
        parsed_value: sanitizeStructuredValue(candidate?.parsed_value ?? candidate?.value ?? null),
        evidence_spans: toArray(candidate?.evidence_spans || candidate?.evidenceSpans)
          .map((span) => sanitizeEvidenceSpan(span))
          .filter(Boolean)
          .slice(0, 3),
      };
    })
    .filter(Boolean);
  return { candidates };
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

function buildMissingFieldExtractionSystemPrompt({
  statePacket = null,
  extractionRequest = null,
} = {}) {
  return `You are a bounded intake extraction assistant inside a fitness app. Respond ONLY with valid JSON, no other text.

Your source of truth is the typed intake packet and extraction request below.
You may propose candidate values only for the explicitly allowed missing fields.
You are not the system of record and you may not write canonical goals, plan state, or any field not listed in missingFields.
AI_STATE_PACKET_JSON:${JSON.stringify(statePacket || {})}
EXTRACTION_REQUEST_JSON:${JSON.stringify(extractionRequest || {})}

Return JSON in this exact format:
{
  "candidates": [
    {
      "field_id": "field_id_from_missingFields",
      "confidence": 0.0,
      "raw_text": "exact supporting text",
      "parsed_value": {},
      "evidence_spans": [
        { "start": 0, "end": 7, "text": "supporting text" }
      ]
    }
  ]
}

RULES:
- Only use field_id values that appear in missingFields.
- Max 1 candidate per field_id.
- If the utterance does not clearly support a field, omit it.
- confidence must be between 0 and 1 and reflect extraction certainty only.
- evidence_spans must quote exact supporting text from the utterance.
- parsed_value must stay small and schema-aligned.
- Use these schema hints:
  * number_with_unit => { "value": 185, "unit": "lb" }
  * choice_chips => { "value": "option_value" }
  * date_or_month => { "mode": "date|month", "value": "2026-10-12|2026-10", "raw": "October 12" }
  * strength_top_set => { "weight": 185, "reps": 5, "raw": "185 x 5" }
  * text => "short parsed text"
- If nothing is clear, return { "candidates": [] }.`;
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
  extractionRequest = null,
  requestedProvider = "",
  requestedModel = "",
  fetchImpl = fetch,
} = {}) {
  const startedAt = Date.now();
  const provider = resolveConfiguredProvider(requestedProvider);
  const normalizedRequestType = INTAKE_REQUEST_TYPES.has(requestType) ? requestType : "goal_interpretation";
  const normalizedExtractionRequest = sanitizeFieldExtractionRequest(extractionRequest || {});
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
    systemPrompt: normalizedRequestType === "missing_field_extraction"
      ? buildMissingFieldExtractionSystemPrompt({
          statePacket,
          extractionRequest: normalizedExtractionRequest,
        })
      : buildIntakeInterpretationSystemPrompt(statePacket),
    userPrompt: normalizedRequestType === "missing_field_extraction"
      ? "Extract only explicitly allowed missing fields from the user's utterance and return a JSON proposal only."
      : "Interpret the typed intake packet and return a JSON proposal only.",
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

  const interpretation = normalizedRequestType === "missing_field_extraction"
    ? null
    : sanitizeIntakeInterpretationProposal(parsed);
  const extraction = normalizedRequestType === "missing_field_extraction"
    ? sanitizeMissingFieldExtractionProposal(parsed, normalizedExtractionRequest)
    : null;
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
  return { ok: true, meta, interpretation, extraction, rawText: providerResult.rawText || "" };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  buildMissingFieldExtractionSystemPrompt,
  buildIntakeInterpretationSystemPrompt,
  parseJsonObjectFromText,
  readJsonBody,
  resolveConfiguredProvider,
  runIntakeProviderGateway,
  sanitizeFieldExtractionRequest,
  sanitizeIntakeInterpretationProposal,
  sanitizeMissingFieldExtractionProposal,
  sendJson,
};
