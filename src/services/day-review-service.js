import { comparePlannedDayToActual } from "../modules-checkins.js";
import { normalizeActualNutritionLog, compareNutritionPrescriptionToActual } from "../modules-nutrition.js";
import { describeProvenanceRecord, normalizeStructuredProvenance } from "./provenance-service.js";
import { normalizeActualRecoveryLog } from "./recovery-supplement-service.js";

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
    return "Carry pain-aware modifications into the next plan touch.";
  }
  if (comparison?.completionKind === "pending") {
    return "Keep the plan unchanged for now and update it once this outcome is logged.";
  }
  if (comparison?.differenceKind === "not_logged_over_48h") {
    return "Future adjustments should stay conservative until this day is clarified.";
  }
  if (comparison?.completionKind === "skipped") {
    return "Do not assume this stimulus happened when shaping the next hard push.";
  }
  if (comparison?.completionKind === "custom_session") {
    return "Use the work that actually happened here when shaping the next few days.";
  }
  if (comparison?.completionKind === "modified") {
    return comparison?.sameSessionFamily
      ? "Keep the session theme, but let fatigue and recovery guide the next progression step."
      : "The next plan touch should respect the changed session instead of the original prescription.";
  }
  if (comparison?.completionKind === "as_prescribed" && (nutritionComparison?.deviationKind === "under_fueled" || nutritionComparison?.matters === "high")) {
    return "Keep progression measured until fueling catches up with the training demand.";
  }
  if (comparison?.completionKind === "as_prescribed") {
    return "The next plan touch can treat this session as completed and progress normally.";
  }
  if (comparison?.completionKind === "recovery_day") {
    return comparison?.customSession
      ? "The next plan touch should account for the extra work done on the recovery day."
      : "No immediate plan change is needed from this recovery day alone.";
  }
  return "Let this day influence the next adjustment without overreacting to one datapoint.";
};

const buildDayReviewStory = ({
  revisions = [],
  latestPrescription = null,
  actualLog = {},
  actualCheckin = {},
  comparison = {},
  nutritionComparison = {},
} = {}) => {
  const classification = classifyDayReviewStory(comparison);
  return {
    ...classification,
    plannedSummary: summarizeTrainingForReview(latestPrescription, comparison?.expectedSession ? "Planned session unavailable" : "Recovery / rest"),
    actualSummary: buildActualOutcomeSummary({ actualLog, actualCheckin, comparison }),
    mainLesson: buildDayReviewLesson({ comparison, nutritionComparison, actualCheckin }),
    nextEffect: buildDayReviewNextEffect({ comparison, nutritionComparison, actualCheckin }),
    auditSummary: revisions.length > 1
      ? "The active plan was revised before execution."
      : "One saved plan capture is attached to this day.",
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
