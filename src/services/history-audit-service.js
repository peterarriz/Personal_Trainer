import { normalizeActualNutritionLog } from "../modules-nutrition.js";
import { buildDayReview } from "./day-review-service.js";
import { resolveLegacyPlannedDayHistoryEntry } from "./legacy-fallback-compat-service.js";
import {
  getCurrentPrescribedDayRecord,
  getCurrentPrescribedDayRevision,
  normalizePrescribedDayHistoryEntry,
} from "./prescribed-day-history-service.js";
import {
  buildPersistedPlanWeekReview,
  listCommittedPlanWeekRecords,
} from "./plan-week-persistence-service.js";

const buildArchiveLogMap = (archive = null) => (
  Object.fromEntries(
    (archive?.logEntries || [])
      .filter((entry) => Boolean(String(entry?.date || "").trim()))
      .map((entry) => [entry.date, entry])
  )
);

const buildArchiveDailyCheckinMap = (archive = null) => (
  Object.fromEntries(
    (archive?.logEntries || [])
      .filter((entry) => Boolean(String(entry?.date || "").trim()))
      .map((entry) => [entry.date, entry?.checkin || {}])
  )
);

const buildArchiveNutritionActualMap = (archive = null) => (
  Object.fromEntries(
    (archive?.logEntries || [])
      .filter((entry) => Boolean(String(entry?.date || "").trim()))
      .map((entry) => [
        entry.date,
        entry?.actualNutrition
          || entry?.actualNutritionLog
          || normalizeActualNutritionLog({ dateKey: entry.date, feedback: entry?.nutritionFeedback || {} }),
      ])
  )
);

export const buildHistoricalWeekAuditEntries = ({
  planWeekRecords = {},
  logs = {},
  weeklyCheckins = {},
  currentWeek = null,
} = {}) => listCommittedPlanWeekRecords(planWeekRecords)
  .map((entry) => buildPersistedPlanWeekReview({ planWeekRecord: entry, logs, weeklyCheckins, currentWeek }))
  .filter(Boolean);

export const buildArchivedDayReview = ({
  archive = null,
  dateKey = "",
} = {}) => {
  if (!archive || !dateKey) return null;
  const logs = buildArchiveLogMap(archive);
  const dailyCheckins = buildArchiveDailyCheckinMap(archive);
  const nutritionActualLogs = buildArchiveNutritionActualMap(archive);
  const archiveHistory = archive?.prescribedDayHistory || {};

  const resolveArchivedPrescribedHistory = (requestedDateKey, actualLog = null) => resolveLegacyPlannedDayHistoryEntry({
    dateKey: requestedDateKey,
    existingEntry: archiveHistory?.[requestedDateKey] || null,
    todayKey: "",
    todayPlannedDayRecord: null,
    legacySnapshot: actualLog?.prescribedPlanSnapshot
      ? { ...actualLog.prescribedPlanSnapshot, ts: actualLog?.ts || null }
      : null,
    allowScheduleFallback: false,
  });

  return buildDayReview({
    dateKey,
    logs,
    dailyCheckins,
    nutritionActualLogs,
    resolvePrescribedHistory: resolveArchivedPrescribedHistory,
    getCurrentPrescribedDayRevision,
    getCurrentPrescribedDayRecord,
  });
};

export const buildArchivedPlanAudit = ({
  archive = null,
} = {}) => {
  if (!archive || typeof archive !== "object") return null;
  const archiveHistory = archive?.prescribedDayHistory || {};
  const weekReviews = listCommittedPlanWeekRecords(archive?.planWeekHistory || {})
    .map((entry) => buildPersistedPlanWeekReview({ planWeekRecord: entry, logs: {}, weeklyCheckins: {}, currentWeek: 0 }))
    .filter(Boolean);
  const dayDateKeys = Array.from(new Set([
    ...Object.keys(archiveHistory || {}),
    ...(archive?.logEntries || []).map((entry) => String(entry?.date || "").trim()).filter(Boolean),
  ])).sort((a, b) => b.localeCompare(a));
  const dayEntries = dayDateKeys.map((dateKey) => {
    const historyEntry = normalizePrescribedDayHistoryEntry(dateKey, archiveHistory?.[dateKey] || null);
    const review = buildArchivedDayReview({ archive, dateKey });
    const plannedRecord = getCurrentPrescribedDayRecord(historyEntry || review?.plannedHistory || null) || review?.currentRecord || null;
    const plannedLabel = plannedRecord?.resolved?.training?.label || plannedRecord?.base?.training?.label || "";
    const actualLabel = review?.comparison?.actualSession?.label || review?.actualLog?.type || "";
    return {
      dateKey,
      plannedLabel,
      actualLabel,
      revisionCount: Array.isArray(review?.revisions) ? review.revisions.length : Array.isArray(historyEntry?.revisions) ? historyEntry.revisions.length : 0,
      reviewStatus: review?.reviewStatus || "",
      comparisonSummary: review?.comparison?.summary || "",
      usedFallbackHistory: Boolean(review?.compatibility?.usedFallbackHistory),
      review,
    };
  });

  return {
    id: archive?.id || archive?.archivedAt || `archive_${dayDateKeys[0] || "unknown"}`,
    label: archive?.planArcLabel || "Previous plan arc",
    archivedAt: archive?.archivedAt || null,
    committedWeekCount: weekReviews.length,
    prescribedDayCount: Object.keys(archiveHistory || {}).length,
    weekReviews,
    dayEntries,
  };
};
