import {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  getStableCaptureAtForDate,
  normalizePrescribedDayHistoryEntry,
  PRESCRIBED_DAY_DURABILITY,
} from "./prescribed-day-history-service.js";
import {
  buildProvenanceEvent,
  buildStructuredProvenance,
  PROVENANCE_ACTORS,
} from "./provenance-service.js";

const cloneStructuredValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

// LEGACY_COMPAT: older workout logs only kept a lightweight prescribed snapshot.
export const buildLegacyPlannedDayRecordFromSnapshot = ({ dateKey = "", snapshot = null } = {}) => {
  if (!dateKey || !snapshot) return null;
  const baseLabel = String(snapshot?.baseLabel || snapshot?.resolvedLabel || "Planned session").trim();
  const resolvedLabel = String(snapshot?.resolvedLabel || snapshot?.baseLabel || baseLabel).trim();
  return {
    id: `legacy_snapshot_${dateKey}`,
    dateKey,
    source: "legacy_log_snapshot",
    week: {},
    base: {
      training: baseLabel ? { label: baseLabel, type: "planned_session" } : null,
      nutrition: null,
      recovery: null,
      supplements: null,
    },
    resolved: {
      training: resolvedLabel ? { label: resolvedLabel, type: snapshot?.modifiedFromBase ? "modified_session" : "planned_session" } : null,
      nutrition: null,
      recovery: null,
      supplements: null,
    },
    decision: {
      mode: String(snapshot?.mode || "legacy_snapshot"),
      modeLabel: String(snapshot?.modeLabel || ""),
      modifiedFromBase: Boolean(snapshot?.modifiedFromBase),
    },
    durability: PRESCRIBED_DAY_DURABILITY.legacyBackfill,
    provenance: {
      ...buildStructuredProvenance({
        keyDrivers: ["legacy prescribed snapshot"],
        events: [
          buildProvenanceEvent({
            actor: PROVENANCE_ACTORS.migration,
            trigger: "legacy_log_snapshot",
            mutationType: "migration_backfill",
            revisionReason: "Recovered from legacy prescribed snapshot.",
            sourceInputs: ["logs.prescribedPlanSnapshot"],
            confidence: "medium",
            timestamp: getStableCaptureAtForDate(dateKey),
          }),
        ],
        summary: "Recovered from legacy prescribed snapshot.",
      }),
      adjustments: [],
    },
    flags: {
      isModified: Boolean(snapshot?.modifiedFromBase),
    },
  };
};

// FALLBACK_ONLY: schedule-template reconstruction is lower-confidence than a
// committed prescribed-day record and must never overwrite one.
export const buildLegacyPlannedDayRecordFromWorkout = ({ dateKey = "", weekNumber = 0, workout = null } = {}) => {
  if (!dateKey || !workout) return null;
  return {
    id: `legacy_schedule_${dateKey}`,
    dateKey,
    source: "legacy_schedule_helper",
    week: {
      number: weekNumber,
      phase: workout?.week?.phase || workout?.phase || "",
    },
    base: {
      training: cloneStructuredValue(workout),
      nutrition: workout?.nutri ? { dayType: workout.nutri } : null,
      recovery: null,
      supplements: null,
    },
    resolved: {
      training: cloneStructuredValue(workout),
      nutrition: workout?.nutri ? { dayType: workout.nutri } : null,
      recovery: null,
      supplements: null,
    },
    decision: {
      mode: "static_schedule",
      modeLabel: "Static schedule fallback",
      modifiedFromBase: false,
    },
    durability: PRESCRIBED_DAY_DURABILITY.fallbackDerived,
    provenance: {
      ...buildStructuredProvenance({
        keyDrivers: ["legacy schedule fallback"],
        events: [
          buildProvenanceEvent({
            actor: PROVENANCE_ACTORS.fallback,
            trigger: "legacy_schedule_helper",
            mutationType: "fallback_reconstruction",
            revisionReason: "Recovered from legacy week-template fallback.",
            sourceInputs: ["week_templates", "getTodayWorkout"],
            confidence: "low",
            timestamp: getStableCaptureAtForDate(dateKey),
            details: {
              weekNumber,
            },
          }),
        ],
        summary: "Recovered from legacy week-template fallback.",
      }),
      adjustments: [],
    },
    flags: {
      isModified: false,
      restDay: workout?.type === "rest",
    },
  };
};

// LEGACY_COMPAT: this helper is the isolation boundary for older prescribed-day
// recovery. Core flows should call this helper instead of inlining fallbacks.
export const resolveLegacyPlannedDayHistoryEntry = ({
  dateKey = "",
  existingEntry = null,
  todayKey = "",
  todayPlannedDayRecord = null,
  legacySnapshot = null,
  allowScheduleFallback = true,
  planStartDate = "",
  fallbackStartDate = null,
  resolvePlanWeekNumberForDateKey,
  resolveScheduleWorkout,
  validateInvariant = null,
} = {}) => {
  if (!dateKey) return null;

  const normalizedExisting = normalizePrescribedDayHistoryEntry(dateKey, existingEntry);
  if (normalizedExisting) return normalizedExisting;

  if (dateKey === todayKey && todayPlannedDayRecord) {
    return createPrescribedDayHistoryEntry({
      plannedDayRecord: todayPlannedDayRecord,
      capturedAt: getStableCaptureAtForDate(dateKey),
      sourceType: "plan_day_engine",
      durability: PRESCRIBED_DAY_DURABILITY.durable,
      reason: "today_plan_capture",
      validateInvariant,
    });
  }

  const legacySnapshotRecord = buildLegacyPlannedDayRecordFromSnapshot({ dateKey, snapshot: legacySnapshot });
  if (legacySnapshotRecord) {
    return createPrescribedDayHistoryEntry({
      plannedDayRecord: legacySnapshotRecord,
      capturedAt: legacySnapshot?.ts || getStableCaptureAtForDate(dateKey),
      sourceType: "legacy_log_snapshot",
      durability: PRESCRIBED_DAY_DURABILITY.legacyBackfill,
      reason: "legacy_snapshot_backfill",
      validateInvariant,
    });
  }

  if (!allowScheduleFallback) return null;
  const dateObj = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return null;
  if (typeof resolvePlanWeekNumberForDateKey !== "function" || typeof resolveScheduleWorkout !== "function") return null;

  const week = resolvePlanWeekNumberForDateKey({
    dateKey,
    planStartDate,
    fallbackStartDate,
  });
  const workout = resolveScheduleWorkout(week, dateObj.getDay());
  const fallbackRecord = buildLegacyPlannedDayRecordFromWorkout({ dateKey, weekNumber: week, workout });
  if (!fallbackRecord) return null;

  return createPrescribedDayHistoryEntry({
    plannedDayRecord: fallbackRecord,
    capturedAt: getStableCaptureAtForDate(dateKey),
    sourceType: "legacy_schedule_helper",
    durability: PRESCRIBED_DAY_DURABILITY.fallbackDerived,
    reason: "schedule_backfill",
    validateInvariant,
  });
};

// LEGACY_COMPAT: archive previews may only have historical snapshot fields.
export const resolveArchivedPlannedDayRecordCompat = ({
  dateKey = "",
  historyEntry = null,
  legacySnapshot = null,
} = {}) => {
  const normalizedHistory = normalizePrescribedDayHistoryEntry(dateKey, historyEntry);
  return (
    getCurrentPrescribedDayRecord(normalizedHistory)
    || buildLegacyPlannedDayRecordFromSnapshot({ dateKey, snapshot: legacySnapshot })
  );
};

// LEGACY_COMPAT: archive/log labels may still need helper-derived cleanup when
// older rows lack canonical actualSession labels.
export const buildLegacyHistoryDisplayLabel = (value = "", sanitizeText = null) => {
  const normalized = String(value || "Session")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim() || "Session";
  return typeof sanitizeText === "function" ? sanitizeText(normalized) : normalized;
};
