const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const MISSING_WORKOUT_TEXT = "No workout log";
const MISSING_NUTRITION_TEXT = "No nutrition log";
const MISSING_ACTUAL_LOG_TEXT = "No saved workout or nutrition log.";

const formatDriverLabel = (value = "") => {
  const text = sanitizeText(value, 60).replaceAll("_", " ");
  if (!text) return "unknown";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const collectProvenanceText = (review = {}) => {
  const parts = [
    review?.provenanceSummary,
    review?.currentRevision?.reason,
    review?.currentRevision?.provenanceSummary,
    review?.story?.nextEffect,
  ].filter(Boolean);
  const eventTexts = Array.isArray(review?.provenance?.events)
    ? review.provenance.events.flatMap((event) => [
        event?.summary,
        event?.reason,
        ...(Array.isArray(event?.sourceInputs) ? event.sourceInputs : []),
      ].filter(Boolean))
    : [];
  return [...parts, ...eventTexts].map((value) => sanitizeText(value, 280)).join(" ").toLowerCase();
};

export const inferPlanEvolutionChangeDrivers = (review = {}) => {
  const drivers = new Set();
  const workoutStatus = sanitizeText(review?.actualCheckin?.status || review?.actualLog?.actualSession?.status || "", 80).toLowerCase();
  const hasWorkoutLog = Boolean(
    workoutStatus
    && workoutStatus !== "not_logged"
    || sanitizeText(review?.actualLog?.type || review?.actualLog?.label || "", 120)
    || sanitizeText(review?.actualLog?.notes || review?.actualCheckin?.note || "", 120)
  );
  if (hasWorkoutLog) drivers.add("workout_log");

  const nutrition = review?.actualNutrition || {};
  const hasNutritionLog = Boolean(
    sanitizeText(nutrition?.deviationKind || "", 80)
    || sanitizeText(nutrition?.issue || "", 80)
    || sanitizeText(nutrition?.note || "", 160)
    || nutrition?.loggedAt
  );
  if (hasNutritionLog) drivers.add("nutrition_log");

  const provenanceText = collectProvenanceText(review);
  if (/(baseline|bodyweight|waist|bench anchor|pace anchor|running pace|metrics|anchor|strength baseline|current bodyweight)/i.test(provenanceText)) {
    drivers.add("baseline_edit");
  }
  if (/(preference|preferences|trainingpreferences|training preference|environmentconfig|equipment|travel preference|settings|intensity preference)/i.test(provenanceText)) {
    drivers.add("preferences");
  }

  return Array.from(drivers);
};

const buildActualLogText = ({
  actualWorkout = "",
  actualNutrition = "",
} = {}) => {
  const parts = [];
  if (actualWorkout && actualWorkout !== MISSING_WORKOUT_TEXT) {
    parts.push(`Workout: ${actualWorkout}`);
  }
  if (actualNutrition && actualNutrition !== MISSING_NUTRITION_TEXT) {
    parts.push(`Nutrition: ${actualNutrition}`);
  }
  return parts.length ? sanitizeText(parts.join(" | "), 320) : MISSING_ACTUAL_LOG_TEXT;
};

export const buildPlanEvolutionExportEntry = (review = {}) => {
  const dateKey = sanitizeText(review?.dateKey || "", 40);
  if (!dateKey) return null;
  const originalPrescription = sanitizeText(review?.originalPrescription?.label || review?.originalRecord?.resolved?.training?.label || review?.originalRecord?.base?.training?.label || "No saved original prescription");
  const latestPrescription = sanitizeText(review?.latestPrescription?.label || review?.latestRecord?.resolved?.training?.label || review?.latestRecord?.base?.training?.label || originalPrescription || "No saved latest prescription");
  const actualWorkout = sanitizeText(review?.story?.actualSummary?.label || review?.actualLog?.actualSession?.sessionLabel || review?.actualLog?.type || MISSING_WORKOUT_TEXT);
  const hasActualNutritionLog = Boolean(review?.actualNutrition?.loggedAt);
  const actualNutrition = sanitizeText(
    hasActualNutritionLog
      ? review?.actualNutrition?.note
      || review?.nutritionComparison?.summary
      || review?.actualNutrition?.deviationKind
      || MISSING_NUTRITION_TEXT
      : MISSING_NUTRITION_TEXT
  );
  const revisionCount = Array.isArray(review?.revisions)
    ? review.revisions.length
    : Array.isArray(review?.revisionTimeline)
    ? review.revisionTimeline.length
    : 0;
  const sourceLabel = sanitizeText(review?.reportSource || review?.sourceLabel || "Current plan history", 120);
  const whyChanged = sanitizeText(
    review?.story?.nextEffect
      || review?.provenanceSummary
      || review?.currentRevision?.provenanceSummary
      || review?.currentRevision?.reason
      || "No saved change explanation."
  );
  const changeDrivers = inferPlanEvolutionChangeDrivers(review);

  return {
    dateKey,
    sourceLabel,
    originalPrescription,
    latestPrescription,
    revisedPrescription: latestPrescription,
    actualWorkout,
    actualNutrition,
    actualLog: buildActualLogText({ actualWorkout, actualNutrition }),
    revisionCount,
    whyChanged,
    changeDrivers,
  };
};

export const buildPlanEvolutionWeekSummary = (weekReview = {}) => {
  const label = sanitizeText(
    weekReview?.label
      || (weekReview?.absoluteWeek || weekReview?.weekNumber ? `Week ${weekReview?.absoluteWeek || weekReview?.weekNumber}` : ""),
    120
  );
  if (!label) return null;
  const startDate = sanitizeText(weekReview?.startDate || "", 40);
  const endDate = sanitizeText(weekReview?.endDate || "", 40);
  const dateRange = startDate && endDate
    ? `${startDate} to ${endDate}`
    : startDate || endDate || "Week window unavailable";
  return {
    weekKey: sanitizeText(weekReview?.weekKey || weekReview?.absoluteWeek || weekReview?.weekNumber || "", 32),
    sourceLabel: sanitizeText(weekReview?.reportSource || weekReview?.sourceLabel || "Current plan history", 120),
    label,
    dateRange,
    status: sanitizeText(weekReview?.story?.classificationLabel || weekReview?.story?.statusLabel || weekReview?.status || "Unknown", 80),
    plannedSummary: sanitizeText(weekReview?.story?.plannedSummary || weekReview?.focus || weekReview?.summary || "No weekly plan summary was saved.", 320),
    actualSummary: sanitizeText(weekReview?.story?.actualSummary || "No weekly actual summary was saved.", 320),
    whatMattered: sanitizeText(weekReview?.story?.whatMattered || weekReview?.focus || weekReview?.summary || "No weekly summary was saved.", 320),
    nextEffect: sanitizeText(weekReview?.story?.nextEffect || "No forward-looking weekly effect was saved.", 320),
  };
};

export const buildPlanEvolutionExport = ({
  title = "Plan Evolution Audit Export",
  generatedAt = new Date().toISOString(),
  reviews = [],
  weekSummaries = [],
} = {}) => {
  const entries = (Array.isArray(reviews) ? reviews : [])
    .map((review) => buildPlanEvolutionExportEntry(review))
    .filter(Boolean);
  const normalizedWeekSummaries = (Array.isArray(weekSummaries) ? weekSummaries : [])
    .map((entry) => buildPlanEvolutionWeekSummary(entry))
    .filter(Boolean);

  return {
    title: sanitizeText(title, 120) || "Plan Evolution Audit Export",
    generatedAt: sanitizeText(generatedAt, 40) || new Date().toISOString(),
    entryCount: entries.length,
    weekSummaryCount: normalizedWeekSummaries.length,
    entries,
    weekSummaries: normalizedWeekSummaries,
  };
};

export const renderPlanEvolutionExportMarkdown = (report = {}) => {
  const lines = [
    `# ${sanitizeText(report?.title || "Plan Evolution Audit Export", 120)}`,
    "",
    `Generated: ${sanitizeText(report?.generatedAt || new Date().toISOString(), 40)}`,
    "",
  ];

  const entries = Array.isArray(report?.entries) ? report.entries : [];
  const weekSummaries = Array.isArray(report?.weekSummaries) ? report.weekSummaries : [];

  lines.push("## Week Summaries");
  lines.push("");
  if (weekSummaries.length === 0) {
    lines.push("No saved week summaries were available for export.");
    lines.push("");
  } else {
    weekSummaries.forEach((entry) => {
      lines.push(`### ${entry.label}`);
      lines.push(`- Source: ${entry.sourceLabel}`);
      lines.push(`- Week window: ${entry.dateRange}`);
      lines.push(`- Status: ${entry.status}`);
      lines.push(`- Planned summary: ${entry.plannedSummary}`);
      lines.push(`- Actual summary: ${entry.actualSummary}`);
      lines.push(`- What mattered: ${entry.whatMattered}`);
      lines.push(`- What changes next: ${entry.nextEffect}`);
      lines.push("");
    });
  }

  lines.push("## Day-Level Plan Evolution");
  lines.push("");
  if (entries.length === 0) {
    lines.push("No saved day reviews were available for export.");
    return `${lines.join("\n")}\n`;
  }

  entries.forEach((entry) => {
    lines.push(`### ${entry.dateKey}`);
    lines.push(`- Source: ${entry.sourceLabel}`);
    lines.push(`- Original prescription: ${entry.originalPrescription}`);
    lines.push(`- Latest prescription: ${entry.latestPrescription}`);
    lines.push(`- Actual log: ${entry.actualLog}`);
    lines.push(`- Revision count: ${entry.revisionCount}`);
    lines.push(`- Why it changed: ${entry.whyChanged}`);
    lines.push(`- Change drivers: ${(entry.changeDrivers || []).map((value) => formatDriverLabel(value)).join(", ") || "Unknown"}`);
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
};
