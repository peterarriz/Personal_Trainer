import { comparePlannedDayToActual } from "../modules-checkins.js";
import { normalizeActualNutritionLog, compareNutritionPrescriptionToActual } from "../modules-nutrition.js";
import { describeProvenanceRecord, normalizeStructuredProvenance } from "./provenance-service.js";

const getNutritionPrescriptionForRecord = (record = null) => (
  record?.resolved?.nutrition?.prescription
  || record?.resolved?.nutrition
  || record?.base?.nutrition
  || null
);

export const buildDayReviewComparison = ({
  dateKey = "",
  actualLog = {},
  actualCheckin = {},
  plannedDayRecord = null,
} = {}) => comparePlannedDayToActual({
  plannedDayRecord,
  actualLog: actualLog || {},
  dailyCheckin: actualCheckin || {},
  dateKey,
});

export const classifyDayReviewStatus = (comparison = {}) => {
  if (comparison?.completionKind === "as_prescribed") return "completed_as_planned";
  if (comparison?.completionKind === "modified") return "completed_modified";
  if (comparison?.completionKind === "custom_session") return "custom_session";
  if (comparison?.completionKind === "skipped") return "skipped";
  if (comparison?.differenceKind === "not_logged_over_48h") return "not_logged_over_48h";
  if (comparison?.differenceKind === "pending") return "not_logged_under_48h";
  if (!comparison?.expectedSession) return "recovery_day";
  return "not_logged_under_48h";
};

export const buildDayReview = ({
  dateKey = "",
  logs = {},
  dailyCheckins = {},
  nutritionActualLogs = {},
  resolvePrescribedHistory,
  getCurrentPrescribedDayRevision,
  getCurrentPrescribedDayRecord,
} = {}) => {
  if (!dateKey || typeof resolvePrescribedHistory !== "function") return null;

  const actualLog = logs?.[dateKey] || {};
  const plannedHistory = resolvePrescribedHistory(dateKey, actualLog);
  const revisions = Array.isArray(plannedHistory?.revisions) ? plannedHistory.revisions : [];
  const currentRevision = typeof getCurrentPrescribedDayRevision === "function"
    ? getCurrentPrescribedDayRevision(plannedHistory)
    : revisions[revisions.length - 1] || null;
  const originalRevision = revisions[0] || currentRevision || null;
  const currentRecord = typeof getCurrentPrescribedDayRecord === "function"
    ? getCurrentPrescribedDayRecord(plannedHistory)
    : (currentRevision?.record || null);
  const originalRecord = originalRevision?.record || null;
  const actualCheckin = dailyCheckins?.[dateKey] || actualLog?.checkin || {};
  const actualNutrition = nutritionActualLogs?.[dateKey] || normalizeActualNutritionLog({ dateKey, feedback: {} });
  const comparison = buildDayReviewComparison({
    dateKey,
    actualLog,
    actualCheckin,
    plannedDayRecord: currentRecord,
  });
  const nutritionComparison = compareNutritionPrescriptionToActual({
    nutritionPrescription: getNutritionPrescriptionForRecord(currentRecord),
    actualNutritionLog: actualNutrition,
  });
  const latestPrescription = currentRecord?.resolved?.training || currentRecord?.base?.training || null;
  const originalPrescription = originalRecord?.resolved?.training || originalRecord?.base?.training || null;
  const plannedHistoryProvenance = normalizeStructuredProvenance(plannedHistory?.provenance || currentRecord?.provenance || null);

  return {
    dateKey,
    plannedHistory,
    revisions,
    revisionTimeline: revisions.map((revision) => ({
      revisionId: revision?.revisionId || "",
      revisionNumber: revision?.revisionNumber || 0,
      capturedAt: revision?.capturedAt || null,
      sourceType: revision?.sourceType || "unknown",
      durability: revision?.durability || "unknown",
      reason: revision?.reason || "",
      provenance: normalizeStructuredProvenance(revision?.provenance || null),
      provenanceSummary: describeProvenanceRecord(revision?.provenance || null, revision?.reason || ""),
      record: revision?.record || null,
    })),
    currentRevision,
    latestRevision: currentRevision,
    originalRevision,
    currentRecord,
    latestRecord: currentRecord,
    originalRecord,
    originalPrescription,
    latestPrescription,
    actualLog,
    actualWorkout: actualLog,
    actualCheckin,
    actualNutrition,
    comparison,
    nutritionComparison,
    reviewStatus: classifyDayReviewStatus(comparison),
    provenance: plannedHistoryProvenance,
    provenanceSummary: describeProvenanceRecord(plannedHistoryProvenance, currentRevision?.reason || ""),
    compatibility: {
      usedFallbackHistory: Boolean(plannedHistory && currentRevision && currentRevision?.durability !== "durable"),
      sourceType: currentRevision?.sourceType || "",
      durability: currentRevision?.durability || "",
    },
  };
};
