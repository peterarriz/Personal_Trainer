const clonePlanWeekValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

export const PLAN_WEEK_RECORD_MODEL = "plan_week_record";
export const PLAN_WEEK_RECORD_VERSION = 1;
export const PLAN_WEEK_RECORD_COMMITMENT = {
  committed: "committed",
  projected: "projected",
};
export const PLAN_WEEK_RECORD_DURABILITY = {
  durable: "durable",
  legacyBackfill: "legacy_backfill",
};

const normalizeCommitment = (value = "") => (
  String(value || "").trim().toLowerCase() === PLAN_WEEK_RECORD_COMMITMENT.projected
    ? PLAN_WEEK_RECORD_COMMITMENT.projected
    : PLAN_WEEK_RECORD_COMMITMENT.committed
);

const normalizeDurability = (value = "") => (
  String(value || "").trim().toLowerCase() === PLAN_WEEK_RECORD_DURABILITY.legacyBackfill
    ? PLAN_WEEK_RECORD_DURABILITY.legacyBackfill
    : PLAN_WEEK_RECORD_DURABILITY.durable
);

const stripPlanWeekStorageMetadata = (planWeek = null) => {
  if (!planWeek) return null;
  const next = clonePlanWeekValue(planWeek);
  if (!next) return null;
  delete next.capturedAt;
  delete next.updatedAt;
  delete next.weeklyCheckin;
  return next;
};

const formatWeekReviewLabel = (value = "", fallback = "Unknown") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const spaced = raw.replaceAll("_", " ").replaceAll("-", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const buildPersistedPlanWeekStory = ({
  plannedSessionCount = 0,
  loggedSessionCount = 0,
  weeklyCheckin = null,
  focus = "",
  summary = "",
  isCurrentWeek = false,
} = {}) => {
  const plannedCount = Number(plannedSessionCount || 0);
  const loggedCount = Number(loggedSessionCount || 0);
  const ratio = plannedCount > 0 ? loggedCount / plannedCount : 1;
  const lowEnergy = Number(weeklyCheckin?.energy || 0) > 0 && Number(weeklyCheckin?.energy || 0) <= 2;
  const highStress = Number(weeklyCheckin?.stress || 0) >= 4;
  const lowConfidence = Number(weeklyCheckin?.confidence || 0) > 0 && Number(weeklyCheckin?.confidence || 0) <= 2;

  let classificationKey = "match";
  let classificationLabel = "Match";
  let toneKey = "match";

  if (isCurrentWeek && loggedCount < plannedCount) {
    classificationKey = "pending";
    classificationLabel = "In progress";
    toneKey = "missing";
  } else if (plannedCount > 0 && ratio < 0.5) {
    classificationKey = "changed";
    classificationLabel = "Changed";
    toneKey = "changed";
  } else if (plannedCount > 0 && ratio < 1) {
    classificationKey = "partial";
    classificationLabel = "Partial";
    toneKey = "partial";
  }

  const plannedSummary = plannedCount > 0
    ? `Planned ${plannedCount} training session${plannedCount === 1 ? "" : "s"}${focus ? ` around ${focus.toLowerCase()}` : ""}.`
    : "No training sessions were planned in this saved week.";

  let actualSummary = "";
  if (plannedCount === 0) {
    actualSummary = loggedCount > 0
      ? `Logged ${loggedCount} session${loggedCount === 1 ? "" : "s"} in an otherwise quiet week.`
      : "No training sessions were logged.";
  } else if (isCurrentWeek && loggedCount === 0) {
    actualSummary = "No sessions are logged yet in this week snapshot.";
  } else if (loggedCount >= plannedCount) {
    actualSummary = `Logged ${loggedCount} session${loggedCount === 1 ? "" : "s"} against ${plannedCount} planned.`;
  } else {
    actualSummary = `Logged ${loggedCount} of ${plannedCount} planned session${plannedCount === 1 ? "" : "s"}.`;
  }

  let whatMattered = focus || summary || "Consistency across the week mattered most.";
  if (lowEnergy || highStress) {
    whatMattered = "Low energy or higher stress shaped this week more than the planned progression target.";
  } else if (lowConfidence) {
    whatMattered = "Confidence dipped, so predictability mattered more than ambition this week.";
  } else if (classificationKey === "match") {
    whatMattered = "The saved week and the logged work stayed closely aligned.";
  } else if (classificationKey === "partial") {
    whatMattered = "Some planned work landed, but real-life context mattered more than perfect completion.";
  } else if (classificationKey === "changed") {
    whatMattered = "What actually happened this week matters more than the original weekly draft.";
  }

  let nextEffect = "The next week can keep its intended progression.";
  if (isCurrentWeek) {
    nextEffect = "Use the remaining days to stay on intent instead of forcing make-up volume.";
  } else if (lowEnergy || highStress) {
    nextEffect = "Start the next week a touch more conservatively until energy and stress settle.";
  } else if (classificationKey === "partial") {
    nextEffect = "Build the next week from the work that landed instead of cramming in what was missed.";
  } else if (classificationKey === "changed") {
    nextEffect = "Let the next week start from what actually happened rather than chasing the earlier draft.";
  }

  return {
    classificationKey,
    classificationLabel,
    toneKey,
    plannedSummary,
    actualSummary,
    whatMattered,
    nextEffect,
    statusLabel: formatWeekReviewLabel(isCurrentWeek ? "in_progress" : classificationKey, classificationLabel),
  };
};

export const buildPersistedPlanWeekKey = ({
  weekKey = "",
  planWeek = null,
} = {}) => {
  const explicit = String(weekKey || "").trim();
  if (explicit) return explicit;
  const numeric = Number(planWeek?.absoluteWeek || planWeek?.weekNumber || 0);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "";
};

const isPersistedPlanWeekRecord = (entry = null) => Boolean(
  entry
  && typeof entry === "object"
  && entry?.model === PLAN_WEEK_RECORD_MODEL
  && Number(entry?.historyVersion || 0) >= 1
  && entry?.record
  && typeof entry.record === "object"
);

export const createPersistedPlanWeekRecord = ({
  planWeek = null,
  weekKey = "",
  capturedAt = Date.now(),
  sourceType = "current_plan_week",
  commitment = PLAN_WEEK_RECORD_COMMITMENT.committed,
  durability = PLAN_WEEK_RECORD_DURABILITY.durable,
  weeklyCheckin = null,
} = {}) => {
  const safePlanWeek = stripPlanWeekStorageMetadata(planWeek);
  if (!safePlanWeek?.id) return null;
  const resolvedWeekKey = buildPersistedPlanWeekKey({ weekKey, planWeek: safePlanWeek });
  if (!resolvedWeekKey) return null;
  const absoluteWeek = Number(safePlanWeek?.absoluteWeek || safePlanWeek?.weekNumber || 0) || null;
  return {
    model: PLAN_WEEK_RECORD_MODEL,
    historyVersion: PLAN_WEEK_RECORD_VERSION,
    weekKey: resolvedWeekKey,
    weekNumber: Number(safePlanWeek?.weekNumber || absoluteWeek || 0) || null,
    absoluteWeek,
    startDate: safePlanWeek?.startDate || null,
    endDate: safePlanWeek?.endDate || null,
    commitment: normalizeCommitment(commitment),
    durability: normalizeDurability(durability),
    sourceType: String(sourceType || "current_plan_week").trim() || "current_plan_week",
    firstCommittedAt: Number(capturedAt) || Date.now(),
    lastCommittedAt: Number(capturedAt) || Date.now(),
    weeklyCheckin: clonePlanWeekValue(weeklyCheckin || null),
    summary: safePlanWeek?.summary || safePlanWeek?.weeklyIntent?.rationale || "",
    record: safePlanWeek,
  };
};

export const normalizePersistedPlanWeekRecord = (weekKey = "", entry = null) => {
  if (!entry) return null;
  if (isPersistedPlanWeekRecord(entry)) {
    const safePlanWeek = stripPlanWeekStorageMetadata(entry?.record || null);
    if (!safePlanWeek?.id) return null;
    const resolvedWeekKey = buildPersistedPlanWeekKey({ weekKey: entry?.weekKey || weekKey, planWeek: safePlanWeek });
    if (!resolvedWeekKey) return null;
    return {
      model: PLAN_WEEK_RECORD_MODEL,
      historyVersion: PLAN_WEEK_RECORD_VERSION,
      weekKey: resolvedWeekKey,
      weekNumber: Number(entry?.weekNumber || safePlanWeek?.weekNumber || safePlanWeek?.absoluteWeek || 0) || null,
      absoluteWeek: Number(entry?.absoluteWeek || safePlanWeek?.absoluteWeek || safePlanWeek?.weekNumber || 0) || null,
      startDate: entry?.startDate || safePlanWeek?.startDate || null,
      endDate: entry?.endDate || safePlanWeek?.endDate || null,
      commitment: normalizeCommitment(entry?.commitment),
      durability: normalizeDurability(entry?.durability),
      sourceType: String(entry?.sourceType || "current_plan_week").trim() || "current_plan_week",
      firstCommittedAt: Number(entry?.firstCommittedAt || entry?.lastCommittedAt || Date.now()) || Date.now(),
      lastCommittedAt: Number(entry?.lastCommittedAt || entry?.firstCommittedAt || Date.now()) || Date.now(),
      weeklyCheckin: clonePlanWeekValue(entry?.weeklyCheckin || null),
      summary: String(entry?.summary || safePlanWeek?.summary || safePlanWeek?.weeklyIntent?.rationale || ""),
      record: safePlanWeek,
    };
  }

  if (entry?.id && (entry?.weekNumber || entry?.absoluteWeek)) {
    return createPersistedPlanWeekRecord({
      planWeek: entry,
      weekKey,
      capturedAt: Number(entry?.updatedAt || entry?.capturedAt || Date.now()) || Date.now(),
      sourceType: entry?.source?.planningModel ? "legacy_plan_week_snapshot" : "legacy_plan_week",
      durability: PLAN_WEEK_RECORD_DURABILITY.legacyBackfill,
      weeklyCheckin: entry?.weeklyCheckin || null,
    });
  }

  return null;
};

export const normalizePersistedPlanWeekRecordMap = (planWeekRecords = {}) => (
  Object.fromEntries(
    Object.entries(planWeekRecords || {})
      .map(([weekKey, entry]) => {
        const normalized = normalizePersistedPlanWeekRecord(weekKey, entry);
        return normalized ? [normalized.weekKey, normalized] : null;
      })
      .filter(Boolean)
  )
);

export const getPersistedPlanWeekRecord = ({
  planWeekRecords = {},
  weekKey = "",
  absoluteWeek = null,
} = {}) => {
  const normalizedMap = normalizePersistedPlanWeekRecordMap(planWeekRecords);
  const explicitWeekKey = String(weekKey || "").trim();
  if (explicitWeekKey && normalizedMap[explicitWeekKey]) return normalizedMap[explicitWeekKey];
  const numericWeek = Number(absoluteWeek || 0);
  if (!Number.isFinite(numericWeek) || numericWeek <= 0) return null;
  return normalizedMap[String(numericWeek)] || Object.values(normalizedMap).find((entry) => Number(entry?.absoluteWeek || 0) === numericWeek) || null;
};

export const listPersistedPlanWeekRecords = (planWeekRecords = {}) => (
  Object.values(normalizePersistedPlanWeekRecordMap(planWeekRecords))
    .sort((a, b) => (
      Number(b?.absoluteWeek || b?.weekNumber || 0) - Number(a?.absoluteWeek || a?.weekNumber || 0)
      || Number(b?.lastCommittedAt || 0) - Number(a?.lastCommittedAt || 0)
    ))
);

export const listCommittedPlanWeekRecords = (planWeekRecords = {}) => (
  listPersistedPlanWeekRecords(planWeekRecords)
    .filter((entry) => normalizeCommitment(entry?.commitment) === PLAN_WEEK_RECORD_COMMITMENT.committed)
);

export const upsertPersistedPlanWeekRecord = ({
  planWeekRecords = {},
  planWeek = null,
  capturedAt = Date.now(),
  sourceType = "current_plan_week",
  commitment = PLAN_WEEK_RECORD_COMMITMENT.committed,
  durability = PLAN_WEEK_RECORD_DURABILITY.durable,
  weeklyCheckin = null,
} = {}) => {
  const normalizedMap = normalizePersistedPlanWeekRecordMap(planWeekRecords);
  const safePlanWeek = stripPlanWeekStorageMetadata(planWeek);
  const resolvedWeekKey = buildPersistedPlanWeekKey({ planWeek: safePlanWeek });
  if (!safePlanWeek?.id || !resolvedWeekKey) {
    return {
      changed: false,
      record: getPersistedPlanWeekRecord({ planWeekRecords: normalizedMap, weekKey: resolvedWeekKey }),
      nextRecords: normalizedMap,
    };
  }

  const existingRecord = normalizedMap[resolvedWeekKey] || null;
  const nextComparable = JSON.stringify({
    planWeek: safePlanWeek,
    weeklyCheckin: clonePlanWeekValue(weeklyCheckin || null),
    commitment: normalizeCommitment(commitment),
    durability: normalizeDurability(durability),
  });
  const existingComparable = existingRecord ? JSON.stringify({
    planWeek: stripPlanWeekStorageMetadata(existingRecord?.record || null),
    weeklyCheckin: clonePlanWeekValue(existingRecord?.weeklyCheckin || null),
    commitment: normalizeCommitment(existingRecord?.commitment),
    durability: normalizeDurability(existingRecord?.durability),
  }) : "";

  if (existingRecord && existingComparable === nextComparable) {
    return {
      changed: false,
      record: existingRecord,
      nextRecords: normalizedMap,
    };
  }

  const nextRecord = existingRecord
    ? {
        ...existingRecord,
        weekKey: resolvedWeekKey,
        weekNumber: Number(safePlanWeek?.weekNumber || safePlanWeek?.absoluteWeek || existingRecord?.weekNumber || 0) || null,
        absoluteWeek: Number(safePlanWeek?.absoluteWeek || safePlanWeek?.weekNumber || existingRecord?.absoluteWeek || 0) || null,
        startDate: safePlanWeek?.startDate || existingRecord?.startDate || null,
        endDate: safePlanWeek?.endDate || existingRecord?.endDate || null,
        sourceType: String(sourceType || existingRecord?.sourceType || "current_plan_week").trim() || "current_plan_week",
        commitment: normalizeCommitment(commitment),
        durability: normalizeDurability(durability),
        lastCommittedAt: Number(capturedAt) || Date.now(),
        weeklyCheckin: clonePlanWeekValue(weeklyCheckin || null),
        summary: safePlanWeek?.summary || safePlanWeek?.weeklyIntent?.rationale || existingRecord?.summary || "",
        record: safePlanWeek,
      }
    : createPersistedPlanWeekRecord({
        planWeek: safePlanWeek,
        weekKey: resolvedWeekKey,
        capturedAt,
        sourceType,
        commitment,
        durability,
        weeklyCheckin,
      });

  return {
    changed: true,
    record: nextRecord,
    nextRecords: {
      ...normalizedMap,
      [resolvedWeekKey]: nextRecord,
    },
  };
};

export const buildPersistedPlanWeekReview = ({
  planWeekRecord = null,
  logs = {},
  weeklyCheckins = {},
  currentWeek = null,
} = {}) => {
  const normalizedRecord = normalizePersistedPlanWeekRecord(planWeekRecord?.weekKey || "", planWeekRecord);
  const planWeek = normalizedRecord?.record || null;
  if (!planWeek?.id) return null;
  const plannedSessionCount = Object.values(planWeek?.sessionsByDay || {}).filter((session) => (
    session
    && !["rest", "recovery"].includes(String(session?.type || "").toLowerCase())
  )).length;
  const logsInWindow = (normalizedRecord?.startDate && normalizedRecord?.endDate)
    ? Object.entries(logs || {}).filter(([dateKey]) => dateKey >= normalizedRecord.startDate && dateKey <= normalizedRecord.endDate)
    : [];
  const loggedSessionCount = logsInWindow.filter(([, entry]) => {
    const actualType = String(entry?.actualSession?.sessionType || entry?.type || entry?.label || "").trim().toLowerCase();
    return actualType && !["rest", "recovery"].includes(actualType);
  }).length;
  const fallbackWeeklyCheckin = weeklyCheckins?.[String(normalizedRecord?.absoluteWeek || normalizedRecord?.weekNumber || "")] || null;
  const resolvedWeeklyCheckin = clonePlanWeekValue(normalizedRecord?.weeklyCheckin || fallbackWeeklyCheckin || null);
  const isCurrentWeek = Number(currentWeek || 0) > 0 && Number(normalizedRecord?.absoluteWeek || 0) === Number(currentWeek || 0);
  const story = buildPersistedPlanWeekStory({
    plannedSessionCount,
    loggedSessionCount,
    weeklyCheckin: resolvedWeeklyCheckin,
    focus: planWeek?.weeklyIntent?.focus || planWeek?.focus || "",
    summary: normalizedRecord.summary || planWeek?.summary || "",
    isCurrentWeek,
  });
  return {
    weekKey: normalizedRecord.weekKey,
    weekNumber: normalizedRecord.weekNumber,
    absoluteWeek: normalizedRecord.absoluteWeek,
    label: planWeek?.label || `Week ${normalizedRecord.absoluteWeek || normalizedRecord.weekNumber || "?"}`,
    phase: planWeek?.phase || "",
    startDate: normalizedRecord.startDate || null,
    endDate: normalizedRecord.endDate || null,
    status: planWeek?.status || "",
    summary: normalizedRecord.summary || planWeek?.summary || "",
    focus: planWeek?.weeklyIntent?.focus || planWeek?.focus || "",
    plannedSessionCount,
    loggedSessionCount,
    weeklyCheckin: resolvedWeeklyCheckin,
    commitment: normalizedRecord.commitment,
    durability: normalizedRecord.durability,
    isCurrentWeek,
    story,
    planWeek,
  };
};
