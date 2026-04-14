const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    ...nextRow,
    date: toDateKey(nextRow?.date || null),
  };
  return sortRowsByDate([
    ...(Array.isArray(rows) ? rows : []).filter((row) => String(row?.date || "") !== safeRow.date),
    safeRow,
  ]);
};

const trackedItemKeySet = (goalCards = []) => new Set(
  (Array.isArray(goalCards) ? goalCards : []).flatMap((card) => (card?.trackedItems || []).map((item) => item?.key).filter(Boolean))
);

const createAnchor = ({
  type = "",
  label = "",
  helperText = "",
  fields = [],
  surfaces = ["program", "log"],
} = {}) => ({
  type,
  label,
  helperText,
  fields: Array.isArray(fields) ? fields : [],
  surfaces: Array.isArray(surfaces) ? surfaces : ["program", "log"],
});

export const GOAL_ANCHOR_QUICK_ENTRY_TYPES = {
  bodyweight: "bodyweight",
  waist: "waist",
  liftBenchmark: "lift_benchmark",
  runBenchmark: "run_benchmark",
};

export const buildGoalAnchorQuickEntryModel = ({
  goalProgressTracking = null,
} = {}) => {
  const goalCards = Array.isArray(goalProgressTracking?.goalCards) ? goalProgressTracking.goalCards : [];
  const trackedKeys = trackedItemKeySet(goalCards);
  const hasStrengthGoal = goalCards.some((card) => card?.planningCategory === "strength");
  const hasRunningGoal = goalCards.some((card) => card?.planningCategory === "running");
  const hasBodyCompGoal = goalCards.some((card) => card?.planningCategory === "body_comp" || card?.goalFamily === "appearance");
  const hasExploratoryGoal = goalCards.some((card) => card?.trackingMode === "exploratory" || card?.goalFamily === "re_entry");
  const anchors = [];

  if (hasBodyCompGoal || trackedKeys.has("bodyweight_trend") || trackedKeys.has("appearance_review_checklist")) {
    anchors.push(createAnchor({
      type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.bodyweight,
      label: "Current bodyweight",
      helperText: "Optional scale check so body-composition goals have a fresh trend anchor.",
      fields: ["date", "bodyweight"],
    }));
  }

  if (hasBodyCompGoal || trackedKeys.has("waist_circumference") || trackedKeys.has("appearance_review_checklist")) {
    anchors.push(createAnchor({
      type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.waist,
      label: "Waist",
      helperText: "Optional tape-measure check that updates physique proxies without repeating intake.",
      fields: ["date", "waist"],
    }));
  }

  if (
    hasStrengthGoal
    || trackedKeys.has("top_set_load")
    || trackedKeys.has("performance_record")
    || trackedKeys.has("projected_goal_progress")
    || hasExploratoryGoal
  ) {
    anchors.push(createAnchor({
      type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.liftBenchmark,
      label: "Lift benchmark",
      helperText: "Save one recent top set so strength goals have a real anchor even before full logging polish.",
      fields: ["date", "exercise", "weight", "reps", "sets"],
    }));
  }

  if (
    hasRunningGoal
    || trackedKeys.has("goal_pace_anchor")
    || trackedKeys.has("weekly_run_frequency")
    || trackedKeys.has("long_run_duration")
    || hasExploratoryGoal
  ) {
    anchors.push(createAnchor({
      type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark,
      label: "Recent run result",
      helperText: "Save a recent distance, time, and pace anchor so run goals have something concrete to track.",
      fields: ["date", "distance", "duration", "pace"],
    }));
  }

  return anchors;
};

export const upsertGoalAnchorQuickEntry = ({
  manualProgressInputs = {},
  type = "",
  entry = {},
} = {}) => {
  const base = {
    ...(manualProgressInputs || {}),
    measurements: { ...(manualProgressInputs?.measurements || {}) },
    metrics: { ...(manualProgressInputs?.metrics || {}) },
    benchmarks: { ...(manualProgressInputs?.benchmarks || {}) },
  };

  if (type === GOAL_ANCHOR_QUICK_ENTRY_TYPES.waist) {
    const nextRow = {
      date: toDateKey(entry?.date || null),
      value: toFiniteNumber(entry?.value, null),
      note: sanitizeText(entry?.note || "", 160),
    };
    base.measurements.waist_circumference = upsertRowsByDate(base.measurements.waist_circumference, nextRow);
    return base;
  }

  if (type === GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark) {
    const nextRow = {
      date: toDateKey(entry?.date || null),
      distanceMiles: toFiniteNumber(entry?.distanceMiles ?? entry?.distance, null),
      durationMinutes: sanitizeText(entry?.durationMinutes ?? entry?.duration || "", 24),
      paceText: sanitizeText(entry?.paceText ?? entry?.pace || "", 24),
      note: sanitizeText(entry?.note || "", 160),
    };
    base.benchmarks.run_results = upsertRowsByDate(base.benchmarks.run_results, nextRow);
    return base;
  }

  if (type === GOAL_ANCHOR_QUICK_ENTRY_TYPES.liftBenchmark) {
    const nextRow = {
      date: toDateKey(entry?.date || null),
      exercise: sanitizeText(entry?.exercise || "Lift benchmark", 120),
      weight: toFiniteNumber(entry?.weight, null),
      reps: toFiniteNumber(entry?.reps, null),
      sets: toFiniteNumber(entry?.sets, null),
      note: sanitizeText(entry?.note || "", 160),
    };
    base.benchmarks.lift_results = upsertRowsByDate(base.benchmarks.lift_results, nextRow);
    return base;
  }

  return base;
};
