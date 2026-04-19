const fs = require("fs");
const path = require("path");
const { loadLocalEnv } = require("./_lib/load-local-env.cjs");

const {
  buildAdaptiveLearningExportArtifacts,
  normalizeAdaptiveLearningSinkRowsForExtraction,
} = require("../src/services/adaptive-learning-export-service.js");

loadLocalEnv();

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "artifacts", "adaptive-learning-export");
const DEFAULT_PAGE_SIZE = 1000;

function getArgValue(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function sanitizeText(value = "", maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { raw: text } : null;
  }
  return { res, data, text };
}

async function fetchPagedRows({
  table = "",
  select = "*",
  filters = "",
  pageSize = DEFAULT_PAGE_SIZE,
  headers = {},
} = {}) {
  const urlRoot = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_KEY");
  if (!urlRoot || !serviceRoleKey) {
    throw new Error("Adaptive export needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const rows = [];
  let offset = 0;
  while (true) {
    const filterSegment = filters ? `${filters}&` : "";
    const query = `${urlRoot}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(select)}&${filterSegment}limit=${pageSize}&offset=${offset}`;
    const { res, data, text } = await fetchJson(query, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
        ...headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Adaptive export failed for ${table}: ${text || res.status}`);
    }
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function formatErrorMessage(error) {
  return sanitizeText(error?.message || String(error || ""), 320);
}

function groupSinkRowsAsSources(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = `${sanitizeText(row?.user_id || "", 120)}__${sanitizeText(row?.actor_id || "", 120)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        actorId: sanitizeText(row?.actor_id || "", 120),
        userId: sanitizeText(row?.user_id || "", 120),
        rows: [],
      });
    }
    groups.get(key).rows.push({
      eventId: sanitizeText(row?.id || "", 160),
      eventName: sanitizeText(row?.event_name || "", 120),
      eventVersion: Number(row?.event_version || 1) || 1,
      schemaVersion: sanitizeText(row?.schema_version || "", 40),
      actorId: sanitizeText(row?.actor_id || "", 120),
      userId: sanitizeText(row?.user_id || "", 120),
      localActorId: sanitizeText(row?.local_actor_id || "", 120),
      occurredAt: Date.parse(row?.occurred_at || "") || 0,
      dedupeKey: sanitizeText(row?.dedupe_key || "", 220),
      payload: row?.payload?.__rawEvent?.payload && typeof row.payload.__rawEvent.payload === "object"
        ? row.payload.__rawEvent.payload
        : row?.payload && typeof row.payload === "object"
          ? row.payload
          : {},
    });
  });
  return [...groups.values()].map((group) => normalizeAdaptiveLearningSinkRowsForExtraction({
    rows: group.rows,
    actorId: group.actorId,
    userId: group.userId,
  }));
}

async function loadSources({ source = "auto", userId = "", pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const sinkTable = getEnv("SUPABASE_ADAPTIVE_EVENTS_TABLE", "ADAPTIVE_LEARNING_EVENT_TABLE", "adaptive_learning_events");
  const sinkEnabled = ["1", "true", "yes", "enabled", "on"].includes(
    sanitizeText(getEnv("ENABLE_ADAPTIVE_EVENT_SINK", "ADAPTIVE_LEARNING_EVENT_SINK_ENABLED"), 20).toLowerCase()
  );
  const warnings = [];
  if ((source === "auto" || source === "sink") && sinkEnabled) {
    const filters = userId ? `user_id=eq.${encodeURIComponent(userId)}&` : "";
    try {
      const rows = await fetchPagedRows({
        table: sinkTable,
        select: "*",
        filters,
        pageSize,
      });
      return {
        sourceKind: "event_sink",
        rawSources: groupSinkRowsAsSources(rows),
        warnings,
      };
    } catch (error) {
      if (source === "sink") {
        throw error;
      }
      warnings.push(`Dedicated adaptive event sink unavailable. Falling back to trainer_data. ${formatErrorMessage(error)}`);
    }
  }

  const filters = userId ? `user_id=eq.${encodeURIComponent(userId)}&` : "";
  const trainerRows = await fetchPagedRows({
    table: "trainer_data",
    select: "user_id,data",
    filters,
    pageSize,
  });
  return {
    sourceKind: "trainer_data",
    rawSources: trainerRows.map((row) => ({
      actorId: sanitizeText(row?.user_id || "", 120),
      userId: sanitizeText(row?.user_id || "", 120),
      data: row?.data || {},
    })),
    warnings,
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, String(value || ""), "utf8");
}

function buildReport(artifacts = {}) {
  return [
    "# Adaptive Learning Export",
    "",
    `- Source: ${artifacts?.sourceKind || "unknown"}`,
    `- Requested source: ${artifacts?.requestedSource || artifacts?.sourceKind || "unknown"}`,
    `- Label: ${artifacts?.label || "adaptive_learning_export"}`,
    `- Event count: ${artifacts?.summary?.eventCount || 0}`,
    `- Actor count: ${artifacts?.summary?.actorCount || 0}`,
    `- Source envelopes: ${artifacts?.summary?.sourceCount || 0}`,
    `- Discarded during extraction: ${artifacts?.summary?.discardedCount || 0}`,
    "",
    "## Warnings",
    "",
    ...(Array.isArray(artifacts?.warnings) && artifacts.warnings.length
      ? artifacts.warnings.map((warning) => `- ${warning}`)
      : ["- None."]),
    "",
    "## Event Counts",
    "",
    ...Object.entries(artifacts?.summary?.byEventName || {}).map(([key, count]) => `- ${key}: ${count}`),
    "",
  ].join("\n");
}

async function main() {
  const outputDir = path.resolve(getArgValue("--output", DEFAULT_OUTPUT_DIR));
  const source = sanitizeText(getArgValue("--source", "auto"), 40).toLowerCase() || "auto";
  const userId = sanitizeText(getArgValue("--user-id", ""), 120);
  const label = sanitizeText(getArgValue("--label", `adaptive_learning_export_${source}`), 160);
  const pageSize = Math.max(1, Math.min(5000, Number(getArgValue("--page-size", DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));

  const { sourceKind, rawSources, warnings = [] } = await loadSources({ source, userId, pageSize });
  const baseArtifacts = buildAdaptiveLearningExportArtifacts({
    rawSources,
    sourceKind,
    exportedAt: Date.now(),
    label,
  });
  const artifacts = {
    ...baseArtifacts,
    requestedSource: source,
    warnings,
  };

  ensureDir(outputDir);
  writeJson(path.join(outputDir, "adaptive-learning-export.json"), artifacts);
  writeJson(path.join(outputDir, "summary.json"), artifacts.summary);
  writeJson(path.join(outputDir, "normalized-events.json"), artifacts.normalizedEvents);
  writeJson(path.join(outputDir, "raw-sources.json"), artifacts.rawSources);
  writeJson(path.join(outputDir, "warnings.json"), warnings);
  writeText(path.join(outputDir, "report.md"), buildReport(artifacts));

  console.log("Adaptive learning export complete.");
  console.log(`Source: ${sourceKind}`);
  warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  console.log(`Events: ${artifacts.summary.eventCount}`);
  console.log(`Artifacts written to: ${outputDir}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
