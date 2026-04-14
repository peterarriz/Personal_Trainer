import {
  buildProvenanceEvent,
  buildStructuredProvenance,
  PROVENANCE_ACTORS,
} from "./provenance-service.js";

const sanitizeText = (value = "", maxLength = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clonePlainValue = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toDateKey = (value = null) => {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split("T")[0];
  date.setHours(12, 0, 0, 0);
  return date.toISOString().split("T")[0];
};

const sortRowsByDate = (rows = []) => [...(Array.isArray(rows) ? rows : [])]
  .filter((row) => sanitizeText(row?.date || "", 24))
  .sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));

const upsertRowsByDate = (rows = [], nextRow = {}) => {
  const safeRow = {
    ...clonePlainValue(nextRow),
    date: toDateKey(nextRow?.date || null),
  };
  return sortRowsByDate([
    ...(Array.isArray(rows) ? rows : []).filter((row) => String(row?.date || "") !== safeRow.date),
    safeRow,
  ]);
};

const createManualProgressInputsBase = (manualProgressInputs = {}) => ({
  ...(manualProgressInputs || {}),
  measurements: { ...(manualProgressInputs?.measurements || {}) },
  metrics: { ...(manualProgressInputs?.metrics || {}) },
  benchmarks: { ...(manualProgressInputs?.benchmarks || {}) },
});

export const BASELINE_METRIC_KEYS = Object.freeze({
  bodyweightBaseline: "bodyweight_baseline",
  progressPhotos: "progress_photos",
  startingCapacity: "starting_capacity",
  swimAccessReality: "swim_access_reality",
  swimBenchmark: "swim_benchmark",
});

export const SWIM_ACCESS_REALITY_VALUES = Object.freeze({
  pool: "pool",
  openWater: "open_water",
  both: "both",
});

const SWIM_ACCESS_REALITY_META = Object.freeze({
  [SWIM_ACCESS_REALITY_VALUES.pool]: {
    label: "Pool only",
    summary: "Pool structure is the main reality right now.",
  },
  [SWIM_ACCESS_REALITY_VALUES.openWater]: {
    label: "Open water",
    summary: "Open-water reality shapes the early swim block.",
  },
  [SWIM_ACCESS_REALITY_VALUES.both]: {
    label: "Pool + open water",
    summary: "Both pool structure and open-water reality are available.",
  },
});

export const STARTING_CAPACITY_VALUES = Object.freeze({
  walkOnly: "walk_only",
  easyTen: "10_easy_minutes",
  steadyTwenty: "20_to_30_minutes",
  durableThirty: "30_plus_minutes",
});

export const STARTING_CAPACITY_META = Object.freeze({
  [STARTING_CAPACITY_VALUES.walkOnly]: {
    label: "Walks or very short efforts",
    summary: "Early work should stay in short, low-risk chunks.",
    capacityMinutes: 10,
  },
  [STARTING_CAPACITY_VALUES.easyTen]: {
    label: "About 10 easy minutes",
    summary: "Start with short repeatable efforts and build carefully.",
    capacityMinutes: 10,
  },
  [STARTING_CAPACITY_VALUES.steadyTwenty]: {
    label: "About 20 to 30 minutes",
    summary: "A moderate starting block is realistic right now.",
    capacityMinutes: 25,
  },
  [STARTING_CAPACITY_VALUES.durableThirty]: {
    label: "30+ minutes feels repeatable",
    summary: "The starting block can be fuller without pretending you need beginner-only work.",
    capacityMinutes: 35,
  },
});

export const normalizeSwimAccessRealityValue = (value = "") => {
  const clean = sanitizeText(value, 80).toLowerCase();
  if (!clean) return "";
  if (clean === SWIM_ACCESS_REALITY_VALUES.pool || /pool/.test(clean)) return SWIM_ACCESS_REALITY_VALUES.pool;
  if (clean === SWIM_ACCESS_REALITY_VALUES.openWater || /open[_ -]?water|lake|ocean/.test(clean)) return SWIM_ACCESS_REALITY_VALUES.openWater;
  if (clean === SWIM_ACCESS_REALITY_VALUES.both || /both/.test(clean)) return SWIM_ACCESS_REALITY_VALUES.both;
  return "";
};

export const describeSwimAccessReality = (value = "") => (
  SWIM_ACCESS_REALITY_META[normalizeSwimAccessRealityValue(value)]?.label || ""
);

export const normalizeStartingCapacityValue = (value = "") => {
  const clean = sanitizeText(value, 80).toLowerCase();
  if (!clean) return "";
  if (clean === STARTING_CAPACITY_VALUES.walkOnly || /walk/.test(clean)) return STARTING_CAPACITY_VALUES.walkOnly;
  if (clean === STARTING_CAPACITY_VALUES.easyTen || /10|short/.test(clean)) return STARTING_CAPACITY_VALUES.easyTen;
  if (clean === STARTING_CAPACITY_VALUES.steadyTwenty || /20|30|steady/.test(clean)) return STARTING_CAPACITY_VALUES.steadyTwenty;
  if (clean === STARTING_CAPACITY_VALUES.durableThirty || /30\+|30 plus|repeatable|durable/.test(clean)) return STARTING_CAPACITY_VALUES.durableThirty;
  return "";
};

export const describeStartingCapacity = (value = "") => (
  STARTING_CAPACITY_META[normalizeStartingCapacityValue(value)]?.label || ""
);

const normalizeDistanceUnit = (value = "") => {
  const clean = sanitizeText(value, 20).toLowerCase();
  if (!clean) return "";
  if (/^(yd|yard|yards)$/.test(clean)) return "yd";
  if (/^(m|meter|meters|metre|metres)$/.test(clean)) return "m";
  return clean;
};

const parseDurationText = (text = "") => {
  const hhmmss = sanitizeText(text, 120).match(/\b(\d+:\d{2}(?::\d{2})?)\b/);
  if (hhmmss?.[1]) return hhmmss[1];
  const minuteMatch = sanitizeText(text, 120).match(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  if (minuteMatch?.[1]) return `${minuteMatch[1]} min`;
  return "";
};

export const parseSwimBenchmarkText = (value = "") => {
  const raw = sanitizeText(value, 200);
  if (!raw) return null;
  const distanceMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(yd|yard|yards|m|meter|meters|metre|metres)\b/i);
  const distance = distanceMatch?.[1] ? Number(distanceMatch[1]) : null;
  const distanceUnit = distanceMatch?.[2] ? normalizeDistanceUnit(distanceMatch[2]) : "";
  const duration = parseDurationText(raw);
  if (!Number.isFinite(distance) && !duration) return null;
  return {
    raw,
    distance: Number.isFinite(distance) ? distance : null,
    distanceUnit,
    duration,
    note: raw,
  };
};

const createBaselineProvenance = ({
  fieldId = "",
  source = "user_override",
  revisionReason = "",
  now = Date.now(),
  surface = "settings",
  details = {},
} = {}) => buildStructuredProvenance({
  summary: sanitizeText(
    revisionReason
    || (surface === "intake"
      ? "Captured during intake before the first plan build."
      : "Saved from Metrics / Baselines."),
    200
  ),
  keyDrivers: [
    surface === "intake" ? "intake baseline capture" : "manual baseline edit",
    fieldId ? fieldId.replaceAll("_", " ") : "",
  ].filter(Boolean),
  events: [
    buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.user,
      trigger: surface === "intake" ? "intake_baseline_capture" : "manual_baseline_edit",
      mutationType: "baseline_capture",
      revisionReason: sanitizeText(
        revisionReason
        || (surface === "intake"
          ? "Captured during intake before the first plan build."
          : "Saved from Metrics / Baselines."),
        200
      ),
      sourceInputs: [
        fieldId ? `baseline.${fieldId}` : "",
        source || "",
      ].filter(Boolean),
      confidence: "high",
      timestamp: Number(now) || Date.now(),
      details: {
        surface: sanitizeText(surface, 40),
        fieldId: sanitizeText(fieldId, 80),
        source: sanitizeText(source, 40),
        ...(clonePlainValue(details || {}) || {}),
      },
    }),
  ],
});

const upsertManualProgressRow = ({
  manualProgressInputs = {},
  bucket = "metrics",
  key = "",
  row = {},
} = {}) => {
  const base = createManualProgressInputsBase(manualProgressInputs);
  if (!key) return base;
  base[bucket][key] = upsertRowsByDate(base?.[bucket]?.[key] || [], row);
  return base;
};

const findPrimaryStrengthGoalLabel = (resolvedGoals = []) => {
  const strengthGoal = toArray(resolvedGoals).find((goal) => String(goal?.planningCategory || "").toLowerCase() === "strength");
  return sanitizeText(strengthGoal?.primaryMetric?.label || strengthGoal?.summary || "Lift benchmark", 120) || "Lift benchmark";
};

export const buildManualProgressInputsFromIntake = ({
  answers = {},
  resolvedGoals = [],
  manualProgressInputs = {},
  profile = {},
  todayKey = null,
  now = Date.now(),
} = {}) => {
  const safeTodayKey = toDateKey(todayKey || now);
  const fields = answers?.intake_completeness?.fields || {};
  let nextInputs = createManualProgressInputsBase(manualProgressInputs);
  const profilePatch = {};
  const capturedKeys = [];

  const currentBodyweight = toFiniteNumber(fields?.current_bodyweight?.value, null);
  if (Number.isFinite(currentBodyweight) && currentBodyweight > 0) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "measurements",
      key: BASELINE_METRIC_KEYS.bodyweightBaseline,
      row: {
        date: safeTodayKey,
        value: currentBodyweight,
        unit: "lb",
        source: "intake_derived",
        note: "Captured during intake",
        provenance: createBaselineProvenance({
          fieldId: "current_bodyweight",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    profilePatch.weight = currentBodyweight;
    profilePatch.bodyweight = currentBodyweight;
    capturedKeys.push(BASELINE_METRIC_KEYS.bodyweightBaseline);
  } else if (Number.isFinite(Number(profile?.weight))) {
    profilePatch.weight = Number(profile.weight);
    profilePatch.bodyweight = Number(profile.weight);
  }

  const currentWaist = toFiniteNumber(fields?.current_waist?.value, null);
  if (Number.isFinite(currentWaist) && currentWaist > 0) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "measurements",
      key: "waist_circumference",
      row: {
        date: safeTodayKey,
        value: currentWaist,
        unit: "in",
        source: "intake_derived",
        note: "Captured during intake",
        provenance: createBaselineProvenance({
          fieldId: "current_waist",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push("waist_circumference");
  }

  const strengthBaseline = fields?.current_strength_baseline || null;
  if (Number.isFinite(strengthBaseline?.weight) && strengthBaseline.weight > 0) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "benchmarks",
      key: "lift_results",
      row: {
        date: safeTodayKey,
        exercise: findPrimaryStrengthGoalLabel(resolvedGoals),
        weight: Number(strengthBaseline.weight),
        reps: Number.isFinite(strengthBaseline?.reps) && strengthBaseline.reps > 0 ? Number(strengthBaseline.reps) : 1,
        sets: 1,
        note: "Captured during intake",
        source: "intake_derived",
        provenance: createBaselineProvenance({
          fieldId: "current_strength_baseline",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push("lift_results");
  }

  const longestRecentRun = fields?.longest_recent_run || null;
  const recentPaceBaseline = fields?.recent_pace_baseline || null;
  const currentRunFrequency = toFiniteNumber(fields?.current_run_frequency?.value, null);
  if (Number.isFinite(longestRecentRun?.miles) || Number.isFinite(longestRecentRun?.minutes) || sanitizeText(recentPaceBaseline?.paceText || recentPaceBaseline?.raw || "", 80)) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "benchmarks",
      key: "run_results",
      row: {
        date: safeTodayKey,
        distanceMiles: Number.isFinite(longestRecentRun?.miles) ? Number(longestRecentRun.miles) : null,
        durationMinutes: Number.isFinite(longestRecentRun?.minutes) ? String(longestRecentRun.minutes) : "",
        paceText: sanitizeText(recentPaceBaseline?.paceText || recentPaceBaseline?.raw || "", 40),
        note: currentRunFrequency ? `${currentRunFrequency} runs/week captured during intake` : "Captured during intake",
        source: "intake_derived",
        provenance: createBaselineProvenance({
          fieldId: "running_baseline",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push("run_results");
  }

  const swimBenchmark = parseSwimBenchmarkText(fields?.recent_swim_anchor?.raw || "");
  if (swimBenchmark) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "metrics",
      key: BASELINE_METRIC_KEYS.swimBenchmark,
      row: {
        date: safeTodayKey,
        distance: swimBenchmark.distance,
        distanceUnit: swimBenchmark.distanceUnit || "",
        duration: swimBenchmark.duration,
        note: swimBenchmark.note,
        source: "intake_derived",
        provenance: createBaselineProvenance({
          fieldId: "recent_swim_anchor",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push(BASELINE_METRIC_KEYS.swimBenchmark);
  }

  const swimAccessReality = normalizeSwimAccessRealityValue(fields?.swim_access_reality?.value || fields?.swim_access_reality?.raw || "");
  if (swimAccessReality) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "metrics",
      key: BASELINE_METRIC_KEYS.swimAccessReality,
      row: {
        date: safeTodayKey,
        value: swimAccessReality,
        label: describeSwimAccessReality(swimAccessReality),
        note: SWIM_ACCESS_REALITY_META[swimAccessReality]?.summary || "",
        source: "intake_derived",
        provenance: createBaselineProvenance({
          fieldId: "swim_access_reality",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push(BASELINE_METRIC_KEYS.swimAccessReality);
  }

  const startingCapacity = normalizeStartingCapacityValue(fields?.starting_capacity_anchor?.value || fields?.starting_capacity_anchor?.raw || "");
  if (startingCapacity) {
    const meta = STARTING_CAPACITY_META[startingCapacity] || null;
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "metrics",
      key: BASELINE_METRIC_KEYS.startingCapacity,
      row: {
        date: safeTodayKey,
        value: startingCapacity,
        label: meta?.label || describeStartingCapacity(startingCapacity),
        capacityMinutes: meta?.capacityMinutes || null,
        note: meta?.summary || "",
        source: "intake_derived",
        provenance: createBaselineProvenance({
          fieldId: "starting_capacity_anchor",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push(BASELINE_METRIC_KEYS.startingCapacity);
  }

  if (fields?.progress_photos?.value === true) {
    nextInputs = upsertManualProgressRow({
      manualProgressInputs: nextInputs,
      bucket: "metrics",
      key: BASELINE_METRIC_KEYS.progressPhotos,
      row: {
        date: safeTodayKey,
        count: 1,
        note: "Photos available for manual review",
        source: "intake_derived",
        provenance: createBaselineProvenance({
          fieldId: "progress_photos",
          source: "intake_derived",
          now,
          surface: "intake",
        }),
      },
    });
    capturedKeys.push(BASELINE_METRIC_KEYS.progressPhotos);
  }

  return {
    manualProgressInputs: nextInputs,
    profilePatch,
    capturedKeys,
  };
};

export const createBaselineSaveMeta = ({
  fieldId = "",
  source = "user_override",
  note = "",
  now = Date.now(),
} = {}) => ({
  note: sanitizeText(note || "Saved from Metrics / Baselines", 160),
  source: sanitizeText(source || "user_override", 40).toLowerCase() || "user_override",
  provenance: createBaselineProvenance({
    fieldId,
    source,
    now,
    surface: "settings",
    revisionReason: sanitizeText(note || "Saved from Metrics / Baselines.", 200),
  }),
});
