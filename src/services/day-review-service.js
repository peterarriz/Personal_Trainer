import { comparePlannedDayToActual } from "../modules-checkins.js";
import { normalizeActualNutritionLog, compareNutritionPrescriptionToActual } from "../modules-nutrition.js";
import { describeProvenanceRecord, normalizeStructuredProvenance } from "./provenance-service.js";
import { normalizeActualRecoveryLog } from "./recovery-supplement-service.js";
import { buildAdaptiveOutcomeExplanation } from "./adaptive-explanation-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const getNutritionPrescriptionForRecord = (record = null) => (
  record?.resolved?.nutrition?.prescription
  || record?.resolved?.nutrition
  || record?.base?.nutrition
  || null
);

const getRecoveryPrescriptionForRecord = (record = null) => (
  record?.resolved?.recovery?.prescription
  || record?.base?.recovery?.prescription
  || null
);

const getSupplementPlanForRecord = (record = null) => (
  record?.resolved?.supplements?.plan
  || record?.base?.supplements?.plan
  || null
);

const formatReviewLabel = (value = "", fallback = "Unknown") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const spaced = raw.replaceAll("_", " ").replaceAll("-", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const summarizeTrainingForReview = (training = null, fallbackLabel = "No planned session") => {
  if (!training) {
    return {
      label: fallbackLabel,
      detail: "No saved session detail.",
    };
  }
  const detailParts = [
    training?.run?.d,
    training?.strengthDose,
    training?.strengthDuration,
    training?.success,
    training?.fallback,
    training?.strengthTrack ? `Track: ${formatReviewLabel(training.strengthTrack)}` : "",
  ].filter(Boolean);
  return {
    label: String(training?.label || training?.run?.t || formatReviewLabel(training?.type, fallbackLabel)).trim() || fallbackLabel,
    detail: detailParts.join(" • ") || "Session detail unavailable.",
  };
};

const buildActualOutcomeSummary = ({
  actualLog = {},
  actualCheckin = {},
  comparison = {},
} = {}) => {
  const actualLabel = String(
    actualLog?.actualSession?.sessionLabel
    || actualLog?.type
    || actualLog?.label
    || comparison?.actualLabel
    || ""
  ).trim();
  const detail = String(
    actualLog?.notes
    || actualCheckin?.note
    || (actualCheckin?.blocker ? `Blocker: ${formatReviewLabel(actualCheckin.blocker)}` : "")
    || (actualCheckin?.sessionFeel ? `Felt ${formatReviewLabel(actualCheckin.sessionFeel).toLowerCase()}` : "")
    || ""
  ).trim();

  if (actualLabel) {
    return {
      label: actualLabel,
      detail: detail || formatReviewLabel(comparison?.completionKind || comparison?.status || "logged", "Workout logged"),
    };
  }

  if (comparison?.completionKind === "skipped") {
    return {
      label: "Skipped",
      detail: detail || "The planned session did not happen.",
    };
  }

  if (comparison?.completionKind === "pending") {
    return {
      label: "Awaiting log",
      detail: "The session is still inside the logging window.",
    };
  }

  if (comparison?.differenceKind === "not_logged_over_48h") {
    return {
      label: "No result logged",
      detail: "The session has not been logged yet.",
    };
  }

  if (comparison?.completionKind === "recovery_day") {
    return {
      label: String(comparison?.plannedLabel || "Recovery day").trim() || "Recovery day",
      detail: detail || "No training session was expected.",
    };
  }

  return {
    label: "No workout logged",
    detail: detail || "No actual session detail was saved.",
  };
};

const classifyDayReviewStory = (comparison = {}) => {
  if (comparison?.completionKind === "as_prescribed" || comparison?.completionKind === "recovery_day") {
    return {
      classificationKey: "match",
      classificationLabel: "Match",
      toneKey: "match",
    };
  }
  if (comparison?.completionKind === "modified" && comparison?.sameSessionFamily) {
    return {
      classificationKey: "partial",
      classificationLabel: "Partial",
      toneKey: "partial",
    };
  }
  if (comparison?.completionKind === "pending") {
    return {
      classificationKey: "pending",
      classificationLabel: "Awaiting log",
      toneKey: "missing",
    };
  }
  if (comparison?.differenceKind === "not_logged_over_48h") {
    return {
      classificationKey: "pending",
      classificationLabel: "Missing outcome",
      toneKey: "missing",
    };
  }
  return {
    classificationKey: "changed",
    classificationLabel: "Changed",
    toneKey: "changed",
  };
};

const buildDayReviewLesson = ({
  comparison = {},
  nutritionComparison = {},
  actualCheckin = {},
} = {}) => {
  if (comparison?.completionKind === "pending") {
    return "There is not enough actual signal yet to learn from this day.";
  }
  if (comparison?.differenceKind === "not_logged_over_48h") {
    return "This day is unresolved, so the plan should stay conservative until the outcome is clear.";
  }
  if (actualCheckin?.blocker === "pain_injury") {
    return "Pain or injury changed the day, so safety matters more than chasing the original dose.";
  }
  if (comparison?.completionKind === "skipped") {
    return actualCheckin?.blocker
      ? `${formatReviewLabel(actualCheckin.blocker)} got in the way, so consistency mattered more than precision.`
      : "The missed session matters more than the original prescription because the intended stimulus did not happen.";
  }
  if (comparison?.completionKind === "custom_session") {
    return "A different session happened, so the actual work matters more than the original plan on paper.";
  }
  if (comparison?.completionKind === "modified") {
    return comparison?.sameSessionFamily
      ? "You kept the session intent but changed the dose, which is useful readiness signal."
      : "The training direction changed, so the real session matters more than the original label.";
  }
  if (nutritionComparison?.deviationKind === "under_fueled" || nutritionComparison?.matters === "high") {
    return "Fueling likely shaped recovery enough to matter for the next training decision.";
  }
  if (actualCheckin?.sessionFeel === "harder_than_expected") {
    return "The session landed harder than expected, which matters for near-term load.";
  }
  if (comparison?.completionKind === "as_prescribed") {
    return "Planned and actual stayed aligned, so this is a clean read on readiness.";
  }
  if (comparison?.completionKind === "recovery_day") {
    return comparison?.customSession
      ? "Unplanned work happened on a recovery day, which matters for recovery more than volume."
      : "The day stayed true to its recovery intent.";
  }
  return String(comparison?.summary || "This day adds useful signal to the next plan adjustment.").trim();
};

const buildDayReviewNextEffect = ({
  comparison = {},
  nutritionComparison = {},
  actualCheckin = {},
} = {}) => {
  if (actualCheckin?.blocker === "pain_injury") {
    return "Keep the next day pain-aware instead of forcing the original dose back in.";
  }
  if (comparison?.completionKind === "pending") {
    return "Keep the near-term plan steady for now and update it once this outcome is logged.";
  }
  if (comparison?.differenceKind === "not_logged_over_48h") {
    return "Keep the next few decisions conservative until this day is clarified.";
  }
  if (comparison?.completionKind === "skipped") {
    return "Treat this as a missed stimulus and move forward without trying to cram it back in.";
  }
  if (comparison?.completionKind === "custom_session") {
    return "Let the next few days build from the work that actually happened here.";
  }
  if (comparison?.completionKind === "modified") {
    return comparison?.sameSessionFamily
      ? "Keep the session theme, but let fatigue and recovery guide the next progression step."
      : "Let the next plan decision follow the changed session that actually happened.";
  }
  if (comparison?.completionKind === "as_prescribed" && (nutritionComparison?.deviationKind === "under_fueled" || nutritionComparison?.matters === "high")) {
    return "Keep progression measured until fueling catches up with the training demand.";
  }
  if (comparison?.completionKind === "as_prescribed") {
    return "The next plan touch can treat this session as complete and stay on its normal path.";
  }
  if (comparison?.completionKind === "recovery_day") {
    return comparison?.customSession
      ? "Account for the extra work that landed on the recovery day before pushing again."
      : "No immediate plan change is needed from this recovery day alone.";
  }
  return "Let this day influence the next adjustment without overreacting to one datapoint.";
};

const buildDayReviewPrimarySummary = ({
  revisions = [],
  latestPrescription = null,
  originalPrescription = null,
  comparison = {},
} = {}) => {
  const latestLabel = String(latestPrescription?.label || latestPrescription?.run?.t || latestPrescription?.type || "").trim().toLowerCase();
  const originalLabel = String(originalPrescription?.label || originalPrescription?.run?.t || originalPrescription?.type || "").trim().toLowerCase();
  const planSettledToDifferentPrescription = Boolean(revisions.length > 1 && latestLabel && originalLabel && latestLabel !== originalLabel);

  if (comparison?.completionKind === "pending") {
    return planSettledToDifferentPrescription
      ? "The saved plan settled before the session window closed, and this review stays anchored to that final prescription."
      : "This review stays anchored to the saved prescription until an actual outcome is logged.";
  }
  if (comparison?.differenceKind === "not_logged_over_48h") {
    return planSettledToDifferentPrescription
      ? "The day settled before execution, and the review still follows that final prescription while the outcome remains unresolved."
      : "The outcome is still unresolved, so this review stays anchored to the saved prescription.";
  }
  if (planSettledToDifferentPrescription) {
    return "The day settled into a different saved prescription before execution, so this review follows the final plan instead of the earlier draft.";
  }
  if (revisions.length > 1) {
    return "This review follows the prescription that was active when the day arrived.";
  }
  return "This review follows the saved prescription for the day.";
};

const buildDayReviewStory = ({
  revisions = [],
  latestPrescription = null,
  originalPrescription = null,
  actualLog = {},
  actualCheckin = {},
  comparison = {},
  nutritionComparison = {},
} = {}) => {
  const classification = classifyDayReviewStory(comparison);
  const explanation = buildAdaptiveOutcomeExplanation({ comparison, actualCheckin });
  return {
    ...classification,
    plannedSummary: summarizeTrainingForReview(latestPrescription, comparison?.expectedSession ? "Planned session unavailable" : "Recovery / rest"),
    actualSummary: buildActualOutcomeSummary({ actualLog, actualCheckin, comparison }),
    mainLesson: buildDayReviewLesson({ comparison, nutritionComparison, actualCheckin }),
    nextEffect: buildDayReviewNextEffect({ comparison, nutritionComparison, actualCheckin }),
    explanationSourceLabel: sanitizeText(explanation?.sourceLabel || "", 80),
    explanationLine: sanitizeText(explanation?.line || "", 220),
    explanationDetailLine: sanitizeText(explanation?.detailLine || "", 220),
    explanation,
    auditSummary: buildDayReviewPrimarySummary({
      revisions,
      latestPrescription,
      originalPrescription,
      comparison,
    }),
  };
};

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
  const actualRecovery = normalizeActualRecoveryLog({
    dateKey,
    dailyCheckin: actualCheckin,
    nutritionActualLog: actualNutrition,
    recoveryPrescription: getRecoveryPrescriptionForRecord(currentRecord),
    supplementPlan: getSupplementPlanForRecord(currentRecord),
  });
  const latestPrescription = currentRecord?.resolved?.training || currentRecord?.base?.training || null;
  const originalPrescription = originalRecord?.resolved?.training || originalRecord?.base?.training || null;
  const plannedHistoryProvenance = normalizeStructuredProvenance(plannedHistory?.provenance || currentRecord?.provenance || null);
  const story = buildDayReviewStory({
    revisions,
    latestPrescription,
    originalPrescription,
    actualLog,
    actualCheckin,
    comparison,
    nutritionComparison,
  });

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
    actualRecovery,
    comparison,
    nutritionComparison,
    story,
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
