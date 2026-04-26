import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { buildPlannedDayRecord, resolveEffectiveStatus } from "../../modules-checkins.js";
import { buildDayReview, buildDayReviewComparison, classifyDayReviewStatus } from "../../services/day-review-service.js";
import { buildGoalProgressTrackingFromGoals } from "../../services/goal-progress-service.js";
import { buildSaveFeedbackModel, SAVE_FEEDBACK_PHASES } from "../../services/save-feedback-service.js";
import { appendProvenanceSidecar, buildProvenanceEvent, describeProvenanceRecord, normalizeProvenanceEvent, PROVENANCE_ACTORS } from "../../services/provenance-service.js";
import { buildLegacyHistoryDisplayLabel } from "../../services/legacy-fallback-compat-service.js";
import {
  buildArchivedDayReview,
  buildArchivedPlanAudit,
  buildHistoricalWeekAuditEntries,
} from "../../services/history-audit-service.js";
import {
  HistoryAuditArchiveSection,
  HistoryAuditDayReviewCard,
  HistoryAuditWeekHistorySection,
} from "../../review-audit-components.jsx";
import { StateFeedbackBanner, StateFeedbackChip } from "../../components/StateFeedbackPrimitives.jsx";
import {
  SurfaceActions,
  SurfaceCard,
  SurfaceDisclosure,
  SurfaceHeading,
  SurfaceHero,
  SurfaceHeroCopy,
  SurfaceHeroHeader,
  SurfaceMetaRow,
  SurfacePill,
  SurfaceQuietPanel,
  SurfaceRecommendationCard,
  SurfaceStack,
} from "../../components/SurfaceSystem.jsx";
import { buildLogTrustModel } from "../../services/compact-trust-service.js";
import {
  WORKOUT_LOG_FAMILIES,
  WORKOUT_LOG_BLOCKER_OPTIONS,
  WORKOUT_LOG_BODY_STATUS_OPTIONS,
  WORKOUT_LOG_COMPLETION_SELECTIONS,
  WORKOUT_LOG_MODALITY_OPTIONS,
  WORKOUT_LOG_RECOVERY_STATE_OPTIONS,
  buildWorkoutDailyCheckinFromDraft,
  buildWorkoutQuickCaptureModel,
  buildWorkoutLogDraft,
  buildWorkoutLogEntryFromDraft,
  hasWorkoutQuickCaptureValues,
} from "../../services/workout-log-form-service.js";
import { getCurrentPrescribedDayRecord, getCurrentPrescribedDayRevision, normalizePrescribedDayHistoryEntry } from "../../services/prescribed-day-history-service.js";
import { CompactTrustRow } from "../../components/CompactTrustRow.jsx";
import {
  LogCompletionSelector,
  LogFeelStrip,
  LogValueStepper,
  StrengthExecutionCard,
} from "../../components/WorkoutLogControls.jsx";

export function LogTab({ planDay = null, surfaceModel = null, logs, dailyCheckins = {}, plannedDayRecords = {}, planWeekRecords = {}, weeklyCheckins = {}, nutritionActualLogs = {}, saveLogs, bodyweights, saveBodyweights, personalization, athleteProfile = null, saveManualProgressInputs = async () => null, currentWeek, todayWorkout: legacyTodayWorkout, planArchives = [], planStartDate = "", syncStateModel = null, syncSurfaceModel = null, runtime = {} }) {
 const { C, BAND_TENSION_LEVELS, sanitizeDisplayText, sanitizeStatusLabel, buildReviewBadgeTone, buildStrengthPrescriptionEntriesForLogging, getPlannedTrainingForLogDraft, inferExerciseMode, normalizeExerciseKey, resolveCanonicalSurfaceSessionLabel, resolvePlannedDayHistoryEntry, SyncStateCallout, CompactSyncStatus } = runtime;
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
 const plannedWorkout = planDay?.base?.training || legacyTodayWorkout;
 const goals = athleteProfile?.goals || [];
 const manualProgressInputs = personalization?.manualProgressInputs || {};
 const today = new Date().toISOString().split("T")[0];
 const e2eLogPlanOverride = useMemo(() => {
 if (typeof window === "undefined") return null;
 const searchParams = new URLSearchParams(window.location.search || "");
 if (!searchParams.has("e2e")) return null;
 try {
 const rawOverride = JSON.parse(window.localStorage.getItem("trainer_e2e_log_plan_override_v1") || "null");
 const historyEntry = normalizePrescribedDayHistoryEntry(today, rawOverride);
 const plannedDayRecord = getCurrentPrescribedDayRecord(historyEntry)
 || (rawOverride?.dateKey === today ? rawOverride : null);
 if (!plannedDayRecord?.dateKey || plannedDayRecord.dateKey !== today) return null;
 return { historyEntry, plannedDayRecord };
 } catch {
 return null;
 }
 }, [today]);
 const todayPlannedDayRecord = e2eLogPlanOverride?.plannedDayRecord || buildPlannedDayRecord(planDay);
 const FEEL_LABELS = {
 "1": { title: "Rough", tip: "Rest, eat, sleep. Tomorrow is a new session." },
 "2": { title: "Tired", tip: "Manageable. Log it and move on." },
 "3": { title: "Solid", tip: "Standard execution. Building as planned." },
 "4": { title: "Strong", tip: "Good day. Note it - the coach will." },
 "5": { title: "Best", tip: "Flag this. Worth knowing when these happen." },
 };
 const [detailed, setDetailed] = useState({
 date: today,
 family: WORKOUT_LOG_FAMILIES.generic,
 sessionType: sanitizeDisplayText(todayWorkout?.type || plannedWorkout?.type || "session"),
 sessionLabel: sanitizeDisplayText(todayWorkout?.label || plannedWorkout?.label || "Session"),
 prescribedLabel: sanitizeDisplayText(todayWorkout?.label || plannedWorkout?.label || ""),
 plannedSummary: surfaceModel?.display || buildDayPrescriptionDisplay({
 training: todayWorkout || plannedWorkout || null,
 includeWhy: false,
 prescribedExercises: buildStrengthPrescriptionEntriesForLogging(todayWorkout || plannedWorkout || null),
 }),
 completion: { selection: "completed" },
 session: { actualModality: "other", swapLabel: "" },
 signals: { bodyStatus: "", recoveryState: "", blocker: "" },
 feel: "3",
 location: "home",
 notes: "",
 run: { enabled: false, distance: "", duration: "", pace: "", purpose: "", structure: "" },
 strength: { enabled: false, hasPrescribedStructure: false, rows: [] },
 generic: { visible: true, reps: "", weight: "", duration: "", distance: "", modality: "other", plannedModality: "other" },
 });
 const [saved, setSaved] = useState(false);
 const [savedMsg, setSavedMsg] = useState("");
 const [savedAtLabel, setSavedAtLabel] = useState("");
 const [saveErrorMsg, setSaveErrorMsg] = useState("");
 const [feelTooltip, setFeelTooltip] = useState("");
 const [quickDetailsOpen, setQuickDetailsOpen] = useState(false);
 const [advancedFieldsOpen, setAdvancedFieldsOpen] = useState(false);
 const [pendingDeleteDate, setPendingDeleteDate] = useState("");
 const [selectedReviewDate, setSelectedReviewDate] = useState(today);
 const [selectedArchiveReviewTarget, setSelectedArchiveReviewTarget] = useState({ archiveId: "", dateKey: "" });
 const feelTooltipTimerRef = useRef(null);
 const detailedHydratedRef = useRef(false);
 const logFormRef = useRef(null);

 const history = Object.entries(logs || {})
 .filter(([date]) => date <= today)
 .sort((a,b)=>b[0].localeCompare(a[0]));
 const reviewDateKeys = useMemo(
 () => Array.from(new Set([
 ...Object.keys(logs || {}),
 ...Object.keys(dailyCheckins || {}),
 ...Object.keys(plannedDayRecords || {}),
 ...Object.keys(nutritionActualLogs || {}),
 today,
 ])).filter((dateKey) => dateKey && dateKey <= today).sort((a, b) => b.localeCompare(a)),
 [logs, dailyCheckins, plannedDayRecords, nutritionActualLogs, today]
 );
 const committedWeekReviews = useMemo(
 () => buildHistoricalWeekAuditEntries({ planWeekRecords, logs, weeklyCheckins, currentWeek })
 .filter((entry) => Number(entry?.absoluteWeek || 0) <= Number(currentWeek || 0)),
 [planWeekRecords, logs, weeklyCheckins, currentWeek]
 );
 const goalProgressTracking = useMemo(() => buildGoalProgressTrackingFromGoals({
 goals,
 logs,
 bodyweights,
 dailyCheckins,
 weeklyCheckins,
 manualProgressInputs,
 now: new Date(),
 }), [goals, logs, bodyweights, dailyCheckins, weeklyCheckins, manualProgressInputs]);
 const quickCapture = useMemo(() => buildWorkoutQuickCaptureModel({ draft: detailed }), [detailed]);
 const quickCaptureHasValues = useMemo(() => hasWorkoutQuickCaptureValues({ draft: detailed }), [detailed]);
 const archivedPlanAudits = useMemo(
 () => (planArchives || []).map((archive) => buildArchivedPlanAudit({ archive })).filter(Boolean),
 [planArchives]
 );
 const toDateKey = (d) => new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
 const getPlannedHistoryForDate = (dateKey, entry = null) => {
 // LEGACY_COMPAT: review surfaces still need archived prescribed snapshots
 // and template-derived rows until older arcs all carry durable day history.
 return resolvePlannedDayHistoryEntry({
 dateKey,
 existingEntry: (dateKey === today ? e2eLogPlanOverride?.historyEntry : null) || plannedDayRecords?.[dateKey] || null,
 todayKey: today,
 todayPlannedDayRecord,
 legacySnapshot: entry?.prescribedPlanSnapshot
 ? { ...entry.prescribedPlanSnapshot, ts: entry?.ts || null }
 : null,
 planStartDate,
 });
 };
 const getPlanComparison = (dateKey, entry = null) => {
 if (entry?.comparison?.completionKind) return entry.comparison;
 return buildDayReviewComparison({
 dateKey,
 actualLog: entry || {},
 actualCheckin: dailyCheckins?.[dateKey] || {},
 plannedDayRecord: getCurrentPrescribedDayRecord(getPlannedHistoryForDate(dateKey, entry)),
 });
 };
 const classifyStatus = (dateKey, entry) => {
 return classifyDayReviewStatus(getPlanComparison(dateKey, entry));
 };
 const formatReviewTimestamp = (value) => {
 if (!value) return "unknown";
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
 };
 const buildSessionSummary = (training = null) => {
 if (!training) return { label: "No prescribed session", detail: "", type: "" };
 return {
 label: sanitizeDisplayText(training?.label || training?.run?.t || training?.type || "Session"),
 detail: sanitizeDisplayText(training?.run?.d || training?.strengthDose || training?.strengthDuration || training?.fallback || training?.success || ""),
 type: sanitizeDisplayText(String(training?.type || "").replaceAll("-", " ")),
 };
 };
 const buildNutritionActualSummary = (actualNutrition = null) => {
 if (!actualNutrition?.loggedAt) {
 return { label: "Not logged", detail: "Actual nutrition has not been logged.", status: "missing" };
 }
 return {
 label: sanitizeDisplayText(actualNutrition?.quickStatus || actualNutrition?.adherence || "logged"),
 detail: sanitizeDisplayText(actualNutrition?.note || actualNutrition?.issue || actualNutrition?.deviationKind || "Nutrition log saved."),
 status: actualNutrition?.deviationKind || "",
 };
 };
 const buildRecoveryActualSummary = (actualRecovery = null) => {
 if (!actualRecovery?.loggedAt) {
 return { label: "Not logged", detail: "Actual recovery has not been logged.", status: "missing" };
 }
 return {
 label: sanitizeDisplayText(actualRecovery?.summary || "Recovery logged"),
 detail: sanitizeDisplayText(
 actualRecovery?.hydrationSupport?.summary
 || actualRecovery?.supplementAdherence?.summary
 || actualRecovery?.note
 || "Recovery log saved."
 ),
 status: actualRecovery?.hydrationSupport?.followed ? "match" : actualRecovery?.status || "",
 };
 };
 const reviewBadgeTone = (kind = "") => buildReviewBadgeTone(kind, C);
 const selectedDayReview = useMemo(
 () => buildDayReview({
 dateKey: selectedReviewDate,
 logs,
 dailyCheckins,
 nutritionActualLogs,
 resolvePrescribedHistory: getPlannedHistoryForDate,
 getCurrentPrescribedDayRevision,
 getCurrentPrescribedDayRecord,
 }),
 [selectedReviewDate, logs, dailyCheckins, plannedDayRecords, nutritionActualLogs, todayPlannedDayRecord]
 );
 const selectedArchivedDayReview = useMemo(() => {
 if (!selectedArchiveReviewTarget?.archiveId || !selectedArchiveReviewTarget?.dateKey) return null;
 const selectedArchive = (planArchives || []).find((archive) => (archive?.id || archive?.archivedAt) === selectedArchiveReviewTarget.archiveId);
 if (!selectedArchive) return null;
 return {
 archiveId: selectedArchiveReviewTarget.archiveId,
 dateKey: selectedArchiveReviewTarget.dateKey,
 review: buildArchivedDayReview({
 archive: selectedArchive,
 dateKey: selectedArchiveReviewTarget.dateKey,
 }),
 };
 }, [selectedArchiveReviewTarget, planArchives]);
 const summarizeExecutionDelta = (comparison = {}) => {
 if (!comparison?.hasPlannedDay) return "No planned day available for comparison.";
 return `${sanitizeStatusLabel(comparison?.completionKind)} - ${sanitizeStatusLabel(comparison?.differenceKind)}`;
 };
 useEffect(() => {
 if (!reviewDateKeys.length) return;
 if (!reviewDateKeys.includes(selectedReviewDate)) setSelectedReviewDate(reviewDateKeys[0]);
 }, [reviewDateKeys, selectedReviewDate]);
 useEffect(() => {
 if (!archivedPlanAudits.length) {
 if (selectedArchiveReviewTarget.archiveId || selectedArchiveReviewTarget.dateKey) {
 setSelectedArchiveReviewTarget({ archiveId: "", dateKey: "" });
 }
 return;
 }
 const selectedArchive = archivedPlanAudits.find((archive) => archive.id === selectedArchiveReviewTarget.archiveId);
 if (selectedArchive?.dayEntries?.some((entry) => entry.dateKey === selectedArchiveReviewTarget.dateKey)) return;
 const fallbackArchive = archivedPlanAudits.find((archive) => archive.dayEntries.length > 0) || null;
 if (!fallbackArchive) {
 if (selectedArchiveReviewTarget.archiveId || selectedArchiveReviewTarget.dateKey) {
 setSelectedArchiveReviewTarget({ archiveId: "", dateKey: "" });
 }
 return;
 }
 setSelectedArchiveReviewTarget({
 archiveId: fallbackArchive.id,
 dateKey: fallbackArchive.dayEntries[0]?.dateKey || "",
 });
 }, [archivedPlanAudits, selectedArchiveReviewTarget]);
 // LEGACY_COMPAT: older logs/archive rows may only have helper-derived labels.
 const cleanHistorySessionName = (value = "") => buildLegacyHistoryDisplayLabel(value, sanitizeDisplayText);
 const buildDetailedDraft = (dateKey = today, entryOverride = null) => {
 const safeDate = String(dateKey || today);
 const logEntry = entryOverride || logs?.[safeDate] || {};
 const plannedHistory = getPlannedHistoryForDate(safeDate, logEntry);
 const plannedDayRecord = getCurrentPrescribedDayRecord(plannedHistory) || (safeDate === today ? todayPlannedDayRecord : null);
 const fallbackTraining = getPlannedTrainingForLogDraft(plannedDayRecord) || (safeDate === today ? (todayWorkout || plannedWorkout) : null);
 return buildWorkoutLogDraft({
 dateKey: safeDate,
 plannedDayRecord,
 logEntry,
 fallbackTraining,
 prescribedExercises: buildStrengthPrescriptionEntriesForLogging(fallbackTraining),
 });
 };
const updateStrengthRow = (rowIndex, updates = {}) => {
setDetailed((current) => ({
...current,
strength: {
...(current?.strength || {}),
 rows: (current?.strength?.rows || []).map((row, index) => {
 if (index !== rowIndex) return row;
 const nextExercise = updates?.exercise ?? row?.exercise ?? "";
 const nextMode = updates?.mode || inferExerciseMode(nextExercise, row?.mode || "");
 const prescribedKey = normalizeExerciseKey(row?.prescribedExercise || "");
 const actualKey = normalizeExerciseKey(nextExercise || "");
 const substituted = Boolean(prescribedKey && actualKey && prescribedKey !== actualKey);
 return {
 ...row,
 ...updates,
 exercise: nextExercise,
 mode: nextMode,
 bodyweightOnly: nextMode === "bodyweight",
 bandTension: nextMode === "band"
 ? (updates?.bandTension ?? row?.bandTension ?? BAND_TENSION_LEVELS[0] ?? "Light")
 : (updates?.bandTension ?? row?.bandTension ?? ""),
 actualWeight: nextMode === "weighted" ? (updates?.actualWeight ?? row?.actualWeight ?? "") : "",
 isSubstituted: substituted,
 substitutionState: substituted ? "substituted" : (row?.prescribedExercise ? "prescribed" : "unplanned"),
 canResetToPrescribed: substituted && Boolean(row?.prescribedExercise),
 };
 }),
},
}));
};
 const updateRunDraft = (fieldKey, value) => {
 setDetailed((current) => ({
 ...current,
 run: {
  ...(current?.run || {}),
 enabled: true,
  [fieldKey]: value,
 },
 }));
 };
 const updateSessionDraft = (fieldKey, value) => {
 setDetailed((current) => ({
 ...current,
 session: {
  ...(current?.session || {}),
  [fieldKey]: value,
 },
 }));
 };
 const updateSignalDraft = (fieldKey, value) => {
 setDetailed((current) => ({
 ...current,
 signals: {
  ...(current?.signals || {}),
  [fieldKey]: value,
 },
 }));
 };
 const updateGenericDraft = (fieldKey, value) => {
 setDetailed((current) => ({
 ...current,
 generic: {
 ...(current?.generic || {}),
 visible: true,
 [fieldKey]: value,
 },
 }));
 };
 const addExtraStrengthRow = () => {
 setDetailed((current) => ({
 ...current,
 strength: {
 ...(current?.strength || {}),
 enabled: true,
 rows: [
 ...(current?.strength?.rows || []),
 {
 key: `extra_${Date.now()}_${Math.max(0, (current?.strength?.rows || []).length)}`,
 prescribedExercise: "",
 exercise: "",
 prescribedSetsText: "",
 prescribedRepsText: "",
 prescribedSets: 0,
 prescribedReps: 0,
 prescribedWeight: null,
 actualWeight: "",
 actualSets: "",
 actualReps: "",
 bandTension: "",
 bodyweightOnly: false,
 mode: "weighted",
 bucket: "general_strength",
 isSubstituted: true,
 substitutionState: "unplanned",
 canResetToPrescribed: false,
 substitutionAllowed: true,
 prefilledFromPrescription: false,
 },
 ],
 },
 }));
 };
 const removeStrengthRow = (rowIndex) => {
 setDetailed((current) => ({
 ...current,
 strength: {
 ...(current?.strength || {}),
 rows: (current?.strength?.rows || []).filter((_, index) => index !== rowIndex),
 },
 }));
 };
 const normalizeSteppedValue = (currentValue, delta, { min = 0, max = null, precision = 0 } = {}) => {
  const numericCurrent = Number(currentValue);
  const safeCurrent = Number.isFinite(numericCurrent) ? numericCurrent : 0;
  const numericDelta = Number(delta);
  const safeDelta = Number.isFinite(numericDelta) ? numericDelta : 0;
  let nextValue = safeCurrent + safeDelta;
  if (Number.isFinite(Number(min))) {
   nextValue = Math.max(Number(min), nextValue);
  }
  if (Number.isFinite(Number(max))) {
   nextValue = Math.min(Number(max), nextValue);
  }
  if (precision > 0) {
   return String(Number(nextValue.toFixed(precision)));
  }
  return String(Math.round(nextValue));
 };
 const updateStrengthFieldValue = (rowIndex, fieldKey, value) => {
  if (fieldKey === "exercise") {
   updateStrengthRow(rowIndex, { exercise: value });
   return;
  }
  if (fieldKey === "bandTension") {
   updateStrengthRow(rowIndex, { bandTension: value, mode: "band" });
   return;
  }
  if (fieldKey === "actualWeight") {
   updateStrengthRow(rowIndex, { actualWeight: value, mode: "weighted" });
   return;
  }
  updateStrengthRow(rowIndex, { [fieldKey]: value });
 };
 const stepStrengthField = (rowIndex, fieldKey, delta, options = {}) => {
  const row = detailed?.strength?.rows?.[rowIndex] || {};
  const nextValue = normalizeSteppedValue(row?.[fieldKey], delta, options);
  updateStrengthFieldValue(rowIndex, fieldKey, nextValue);
 };
 const stepRunField = (fieldKey, delta, options = {}) => {
  const nextValue = normalizeSteppedValue(detailed?.run?.[fieldKey], delta, options);
  updateRunDraft(fieldKey, nextValue);
 };
 const stepGenericField = (fieldKey, delta, options = {}) => {
  const nextValue = normalizeSteppedValue(detailed?.generic?.[fieldKey], delta, options);
  updateGenericDraft(fieldKey, nextValue);
 };
 const usePlannedExercise = (rowIndex) => {
  const row = detailed?.strength?.rows?.[rowIndex] || {};
  updateStrengthRow(rowIndex, {
   exercise: row?.prescribedExercise || "",
   actualWeight: row?.prescribedWeight ? String(row.prescribedWeight) : "",
   actualSets: row?.prescribedSets ? String(row.prescribedSets) : "",
   actualReps: row?.prescribedReps ? String(row.prescribedReps) : "",
  });
 };
useEffect(() => {
 const nextDraft = buildDetailedDraft(today, logs?.[today] || {});
 const draftStillUnhydrated = !detailedHydratedRef.current;
 const currentHasStructuredPrescription = Boolean(
  detailed?.sections?.run?.enabled
  || detailed?.sections?.strength?.enabled
  || (Array.isArray(detailed?.strength?.rows) && detailed.strength.rows.length > 0)
 );
 const nextHasStructuredPrescription = Boolean(
  nextDraft?.sections?.run?.enabled
  || nextDraft?.sections?.strength?.enabled
  || (Array.isArray(nextDraft?.strength?.rows) && nextDraft.strength.rows.length > 0)
 );
 const currentHasUserInput = Boolean(
  hasWorkoutQuickCaptureValues({ draft: detailed })
  || String(detailed?.notes || "").trim()
 );
 if (
  draftStillUnhydrated
  || (
   detailed?.date === today
   && !currentHasStructuredPrescription
   && nextHasStructuredPrescription
   && !currentHasUserInput
  )
 ) {
  setDetailed(nextDraft);
  detailedHydratedRef.current = true;
 }
}, [today, todayWorkout?.label, plannedWorkout?.label, plannedDayRecords?.[today], logs?.[today]]);
 useEffect(() => {
  setQuickDetailsOpen(false);
  setAdvancedFieldsOpen(false);
 }, [detailed?.date, detailed?.family]);
 const openHistoryEntry = (date, log = {}) => {
  setSelectedReviewDate(date);
  setDetailed(buildDetailedDraft(date, log));
  setQuickDetailsOpen(false);
  setAdvancedFieldsOpen(false);
  setPendingDeleteDate("");
 };

 const persistWorkoutLog = async ({ source = "full", draftOverride = null } = {}) => {
const draftSnapshot = draftOverride || detailed;
if (!draftSnapshot?.date) return;
 setSaveErrorMsg("");
 const existing = logs?.[draftSnapshot.date] || {};
 setDetailed(draftSnapshot);
 const nextEntryBase = buildWorkoutLogEntryFromDraft({
 draft: {
 ...draftSnapshot,
 sessionLabel: cleanHistorySessionName(draftSnapshot.sessionLabel || existing.type || todayWorkout?.label || plannedWorkout?.label || "Session"),
 },
 baseEntry: existing,
 todayKey: today,
 });
 const nextEntry = nextEntryBase;
 const mirroredDailyCheckin = buildWorkoutDailyCheckinFromDraft({
  draft: draftSnapshot,
  todayKey: today,
 });
 const saveResult = await saveLogs(
  { ...logs, [draftSnapshot.date]: nextEntry },
  {
   changedDateKey: draftSnapshot.date,
   mirroredDailyCheckin,
   plannedDayHistoryOverride: draftSnapshot.date === today ? e2eLogPlanOverride?.historyEntry || null : null,
   plannedDayRecordOverride: draftSnapshot.date === today ? todayPlannedDayRecord || null : null,
  },
 );
 if (saveResult?.ok === false) {
 setSaved(false);
 setSavedMsg("");
 setSaveErrorMsg("Save did not finish. Try again in a moment.");
 return;
 }
 setSaved(true);
 setSavedAtLabel(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
 setSavedMsg(draftSnapshot.date < today ? "Changes saved." : "Log saved.");
 if (source === "quick") setQuickDetailsOpen(false);
 setDetailed(buildDetailedDraft(draftSnapshot.date, nextEntry));
 setTimeout(()=>setSaved(false), 4000);
 };

 const delLog = async (date) => {
 const next = { ...logs };
 delete next[date];
 await saveLogs(next, { changedDateKey: date, clearMirroredDailyCheckin: true });
 setPendingDeleteDate("");
 };
 const showFeelTooltip = (feelValue) => {
 const tip = FEEL_LABELS[String(feelValue)]?.tip || "";
 setFeelTooltip(tip);
 if (feelTooltipTimerRef.current) clearTimeout(feelTooltipTimerRef.current);
 feelTooltipTimerRef.current = setTimeout(() => setFeelTooltip(""), 3000);
 };
 useEffect(() => () => {
 if (feelTooltipTimerRef.current) clearTimeout(feelTooltipTimerRef.current);
 }, []);
const canonicalLogLabel = resolveCanonicalSurfaceSessionLabel({
 sessionType: detailed?.plannedSummary?.sessionType || surfaceModel?.display?.sessionType || "",
 sessionLabel: detailed?.plannedSummary?.sessionLabel
 || detailed?.prescribedLabel
 || surfaceModel?.display?.sessionLabel
 || "Planned session",
 fallback: "Planned session",
 isHybrid: Boolean(
  detailed?.plannedSummary?.sections?.run?.enabled
  && detailed?.plannedSummary?.sections?.strength?.enabled
 )
 || Boolean(
  detailed?.plannedSummary?.sessionPlan?.sections?.run?.enabled
  && detailed?.plannedSummary?.sessionPlan?.sections?.strength?.enabled
 )
 || Boolean(
  (todayWorkout?.run || plannedWorkout?.run)
  && (todayWorkout?.strengthDuration || plannedWorkout?.strengthDuration)
 )
 || String(todayWorkout?.type || plannedWorkout?.type || "").toLowerCase() === "run+strength",
});
 const completionSelection = String(detailed?.completion?.selection || "completed").trim() || "completed";
 const isSkippedSelection = completionSelection === "skipped";
 const isPartialSelection = completionSelection === "partial";
 const isSwappedSelection = completionSelection === "swapped";
 const actualModalityKey = String(
  detailed?.session?.actualModality
  || detailed?.run?.modality
  || detailed?.generic?.modality
  || ""
 ).trim() || "other";
 const cardioModalityKeys = new Set(["run", "treadmill", "bike", "elliptical", "walk", "rower", "swim"]);
 const isCardioSwap = isSwappedSelection && cardioModalityKeys.has(actualModalityKey);
 const isStrengthSwap = isSwappedSelection && actualModalityKey === "strength";
 const showRunActuals = Boolean(!isSkippedSelection && ((detailed.sections?.run?.enabled && !isSwappedSelection) || isCardioSwap));
 const showStrengthActuals = Boolean(!isSkippedSelection && ((detailed.sections?.strength?.enabled && !isSwappedSelection) || isStrengthSwap));
 const showGenericActuals = Boolean(
  !isSkippedSelection
  && (
   (detailed.sections?.generic?.enabled && !isSwappedSelection)
   || (isSwappedSelection && !isCardioSwap && !isStrengthSwap)
  )
 );
 const prescribedStrengthRows = (detailed?.strength?.rows || [])
 .map((row, index) => ({ row, index }))
 .filter(({ row }) => Boolean(row?.prescribedExercise));
 const extraStrengthRows = (detailed?.strength?.rows || [])
 .map((row, index) => ({ row, index }))
 .filter(({ row }) => !row?.prescribedExercise);
 const hasPlanBackbone = Boolean(
  detailed?.plannedSummary?.sessionPlan?.available
  || detailed?.plannedSummary?.sessionLabel
  || detailed?.prescribedLabel
 );
 const hasExistingLog = Boolean(logs?.[detailed?.date || ""]);
 const hasSignalsInput = Boolean(
  String(detailed?.signals?.bodyStatus || "").trim()
  || String(detailed?.signals?.recoveryState || "").trim()
  || String(detailed?.signals?.blocker || "").trim()
 );
 const logTrustModel = useMemo(() => buildLogTrustModel({
  completionSelection,
  hasSignalsInput,
  actualModalityKey,
 }), [
  completionSelection,
  hasSignalsInput,
  actualModalityKey,
 ]);
 const hasAdvancedInput = Boolean(
  String(detailed?.notes || "").trim()
  || String(detailed?.feel || "3") !== "3"
  || String(detailed?.location || "home") !== "home"
  || hasSignalsInput
 );
 const canSavePrimary = Boolean(detailed?.date && (hasPlanBackbone || hasExistingLog || isSkippedSelection));
 const primarySaveLabel = isSkippedSelection
  ? "Save skipped day"
  : isPartialSelection
  ? "Save partial session"
  : isSwappedSelection
  ? "Save swapped session"
  : detailed?.date && detailed.date < today
  ? "Save changes"
  : "Save completed session";
 const primarySaveSupportLine = isSkippedSelection
  ? "Skipped days save without inventing workout data."
  : isPartialSelection
  ? "Keep only the work you actually finished."
  : isSwappedSelection
  ? "Record the substitute cleanly so review and adaptation can trust it."
  : quickCaptureHasValues
  ? "The prescribed session is loaded below. Save only the parts that changed."
  : "The prescribed session is loaded and ready to save.";
 const completionHelperLine = isSkippedSelection
  ? "Use skipped when the prescribed work did not happen."
  : isPartialSelection
  ? "Use partial when you only got through part of the session."
  : isSwappedSelection
  ? "Use swapped when you did a different session or different modality."
  : "Completed will auto-resolve to as prescribed or modified based on the actuals you save.";
const strengthSummaryLine = prescribedStrengthRows.length > 0
 ? `${prescribedStrengthRows.length} planned movement${prescribedStrengthRows.length === 1 ? "" : "s"} are loaded. Edit sets, reps, weight, or the name only if something changed.`
 : "Exercise logging appears when the plan includes lift detail.";
const extrasSummaryLine = extraStrengthRows.length > 0
 ? `${extraStrengthRows.length} added movement${extraStrengthRows.length === 1 ? "" : "s"} are in the log.`
 : "Use this only if you added work that was not in the prescription.";
 const prescribedSummaryRows = (detailed?.plannedSummary?.sessionPlan?.rows || []).slice(0, 4);
 const runPrefillBits = [
  detailed?.run?.plannedDurationHint ? `Planned time ${detailed.run.plannedDurationHint}` : "",
  detailed?.run?.plannedDistanceHint ? `planned distance ${detailed.run.plannedDistanceHint}` : "",
  detailed?.run?.plannedPaceHint ? `planned pace ${detailed.run.plannedPaceHint}` : "",
 ].filter(Boolean).join(" - ");
 const sessionTypeLabel = sanitizeDisplayText(
  detailed?.plannedSummary?.sessionType
  || String(todayWorkout?.type || plannedWorkout?.type || detailed?.family || "session").replaceAll("-", " ")
 );
 const sessionDateLabel = detailed?.date === today
  ? "Today"
  : new Date(`${detailed?.date || today}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
 const sessionContextLine = sanitizeDisplayText(
  detailed?.plannedSummary?.structure
  || detailed?.plannedSummary?.purpose
  || runPrefillBits
  || ""
 );
 const logExecutionLead = isSkippedSelection
  ? "You are recording that the planned work did not happen."
  : isSwappedSelection
  ? "The planned session stays visible, but the actual session below is the truth that will be saved."
  : showStrengthActuals && showRunActuals
  ? "The hybrid prescription is loaded once, and the actuals below stay in that same session."
  : showStrengthActuals
  ? "The prescribed lifts are loaded once, and the actuals below are what count."
  : showRunActuals
  ? "The prescribed cardio session is loaded once, and the actuals below are what count."
  : "The prescribed session is loaded below.";
 const feelSelection = FEEL_LABELS[String(detailed?.feel || "3")] || FEEL_LABELS["3"];
 const saveStateLine = saveErrorMsg
  ? saveErrorMsg
  : saved
  ? `${savedMsg || "Saved."}${savedAtLabel ? ` ${savedAtLabel}` : ""}`
  : primarySaveSupportLine;
 const largeSurfaceInputStyle = {
  minHeight: 56,
  borderRadius: 18,
  border: "1px solid var(--consumer-border-strong)",
  background: "var(--consumer-subpanel)",
  color: "var(--consumer-text)",
  fontSize: "1rem",
  fontWeight: 700,
  textAlign: "center",
  padding: "0.7rem 0.75rem",
  width: "100%",
  fontVariantNumeric: "tabular-nums",
 };
 const focusNextLogField = (currentTarget) => {
  const root = logFormRef.current;
  if (!root || !currentTarget) return;
  const nodes = Array.from(root.querySelectorAll("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), summary"))
   .filter((node) => node.offsetParent !== null);
  const currentIndex = nodes.findIndex((node) => node === currentTarget);
  if (currentIndex >= 0 && nodes[currentIndex + 1] && typeof nodes[currentIndex + 1].focus === "function") {
   nodes[currentIndex + 1].focus();
  }
 };
 const readLiveLogControlValue = (selector, fallback = "") => {
  const root = logFormRef.current;
  if (!root) return fallback;
  const node = root.querySelector(selector);
  if (!node || typeof node.value !== "string") return fallback;
  return node.value;
 };
const buildLiveDraftSnapshot = () => ({
 ...detailed,
 completion: {
  ...(detailed?.completion || {}),
  selection: completionSelection,
 },
 session: {
  ...(detailed?.session || {}),
  actualModality: actualModalityKey,
  swapLabel: readLiveLogControlValue('[data-testid="log-swap-label"]', detailed?.session?.swapLabel || ""),
 },
 run: {
   ...(detailed?.run || {}),
   modality: showRunActuals
    ? actualModalityKey
    : (detailed?.run?.modality || detailed?.run?.plannedModality || "run"),
   duration: readLiveLogControlValue('[data-testid="log-run-duration"]', detailed?.run?.duration || ""),
   distance: readLiveLogControlValue('[data-testid="log-run-distance"]', detailed?.run?.distance || ""),
   pace: readLiveLogControlValue('[data-testid="log-run-pace"]', detailed?.run?.pace || ""),
   rpe: readLiveLogControlValue('[data-testid="log-run-rpe"]', detailed?.run?.rpe || ""),
  },
  strength: {
   ...(detailed?.strength || {}),
   rows: (detailed?.strength?.rows || []).map((row, index) => ({
    ...row,
    actualSets: readLiveLogControlValue(`[data-testid="log-strength-row-sets-${index}"]`, row?.actualSets || ""),
    actualReps: readLiveLogControlValue(`[data-testid="log-strength-row-reps-${index}"]`, row?.actualReps || ""),
    actualWeight: readLiveLogControlValue(`[data-testid="log-strength-row-weight-${index}"]`, row?.actualWeight || ""),
    exercise: readLiveLogControlValue(`[data-testid="log-strength-row-exercise-${index}"]`, row?.exercise || ""),
    bandTension: readLiveLogControlValue(`select[aria-label="Exercise ${index + 1} band tension"]`, row?.bandTension || ""),
   })),
  },
  generic: {
   ...(detailed?.generic || {}),
   modality: showGenericActuals
    ? actualModalityKey
    : (detailed?.generic?.modality || detailed?.generic?.plannedModality || "other"),
   duration: readLiveLogControlValue('[data-testid="log-generic-duration"]', detailed?.generic?.duration || ""),
   distance: readLiveLogControlValue('[data-testid="log-generic-distance"]', detailed?.generic?.distance || ""),
   reps: readLiveLogControlValue('[data-testid="log-generic-reps"]', detailed?.generic?.reps || ""),
   weight: readLiveLogControlValue('[data-testid="log-generic-weight"]', detailed?.generic?.weight || ""),
  },
 signals: {
  ...(detailed?.signals || {}),
  bodyStatus: String(detailed?.signals?.bodyStatus || "").trim(),
  recoveryState: String(detailed?.signals?.recoveryState || "").trim(),
  blocker: String(detailed?.signals?.blocker || "").trim(),
 },
 location: readLiveLogControlValue('select[aria-label="Workout location"]', detailed?.location || "home"),
 notes: readLiveLogControlValue('textarea[aria-label="Session note"]', detailed?.notes || ""),
});
const handlePrimarySave = async () => {
 if (!canSavePrimary) return;
 const liveDraft = buildLiveDraftSnapshot();
 await persistWorkoutLog({
  source: "quick",
  draftOverride: liveDraft,
 });
};
 const handleLogFormKeyDown = (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
   event.preventDefault();
   handlePrimarySave();
   return;
  }
  const tagName = String(event.target?.tagName || "").toLowerCase();
 if (event.key === "Enter" && !event.shiftKey && !["textarea", "button", "summary", "select"].includes(tagName)) {
  event.preventDefault();
  focusNextLogField(event.target);
 }
 };
 const logSaveFeedbackModel = buildSaveFeedbackModel({
  phase: saveErrorMsg
   ? SAVE_FEEDBACK_PHASES.error
   : saved
   ? SAVE_FEEDBACK_PHASES.saved
   : SAVE_FEEDBACK_PHASES.idle,
  syncState: syncStateModel,
  savedAtLabel,
  successMessage: savedMsg,
  errorMessage: saveErrorMsg,
 });
 const showLogQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");

return (
 <div className="fi" data-testid="log-tab" style={{ display:"grid", gap:"0.75rem" }}>
{syncSurfaceModel?.showFullCard && (
<SyncStateCallout
 model={syncSurfaceModel}
 dataTestId="log-sync-status"
 compact
 style={{ background:"rgba(11, 20, 32, 0.76)" }}
/>
)}
<SurfaceHero accentColor={C.green} variant="action">
 <SurfaceHeroHeader>
 <SurfaceHeroCopy>
 <SurfaceHeading
 eyebrow="Log today"
 title={canonicalLogLabel}
 supporting="Your planned session is below. Update only what was different."
 eyebrowColor={C.green}
 titleTestId="log-canonical-session-label"
 titleSize="hero"
 />
 <SurfaceMetaRow>
 <SurfacePill strong>{sessionDateLabel}</SurfacePill>
 {!!sessionTypeLabel && <SurfacePill>{sessionTypeLabel}</SurfacePill>}
 </SurfaceMetaRow>
 <CompactTrustRow model={logTrustModel} dataTestId="log-trust-row" />
 </SurfaceHeroCopy>
 </SurfaceHeroHeader>
 <SurfaceQuietPanel>
 {logSaveFeedbackModel.show && (
 <StateFeedbackBanner
 model={logSaveFeedbackModel}
 dataTestId="log-save-status"
 compact
 />
 )}
 {showLogQuietSyncChip && (
 <CompactSyncStatus
 model={syncSurfaceModel}
 dataTestId="log-sync-status"
 style={{
 background:"rgba(11, 20, 32, 0.32)",
 opacity:0.88,
 }}
 />
 )}
 </SurfaceQuietPanel>
</SurfaceHero>
 <div
 data-testid="log-detailed-entry"
 ref={logFormRef}
 onKeyDownCapture={handleLogFormKeyDown}
 style={{ display:"grid", gap:"0.7rem", paddingBottom:"calc(env(safe-area-inset-bottom, 0px) + 5.4rem)" }}
 >
 <SurfaceCard
 variant="elevated"
 style={{
 display:"grid",
 gap:"0.78rem",
 padding:"0.86rem",
 borderRadius:24,
 background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 96%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 96%, transparent) 100%)",
 }}
 >
 <div style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.54rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.42 }}>
 {logExecutionLead}
 </div>
 {!!sessionContextLine && (
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {sessionContextLine}
 </div>
 )}
</div>
{!!detailed?.plannedSummary && (
<SurfaceCard
 data-testid="planned-session-plan"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.54rem",
 padding:"0.76rem",
 borderRadius:22,
 background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
 borderColor:"color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
 }}
>
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.06em", textTransform:"uppercase" }}>
 Planned
 </div>
 <div style={{ fontSize:"0.62rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
 {canonicalLogLabel}
 </div>
 {!!sessionContextLine && (
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {sessionContextLine}
 </div>
 )}
 </div>
 {!!prescribedSummaryRows.length && (
 <div style={{ display:"grid", gap:"0.32rem" }}>
 {prescribedSummaryRows.map((row, index) => (
 <div key={`${row?.title || "plan"}_${index}`} style={{ display:"grid", gap:"0.08rem" }}>
 <div style={{ fontSize:"0.52rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
 {index + 1}. {sanitizeDisplayText(row?.title || row?.label || `Block ${index + 1}`)}
 </div>
 {!!row?.detail && (
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {sanitizeDisplayText(row.detail)}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
</SurfaceCard>
)}
<LogCompletionSelector
 dataTestId="log-completion-selector"
 value={completionSelection}
 options={WORKOUT_LOG_COMPLETION_SELECTIONS}
 onChange={(nextSelection) => setDetailed((current) => ({
  ...current,
  completion: {
   ...(current?.completion || {}),
   selection: nextSelection,
  },
 }))}
 helper={completionHelperLine}
/>
{isSwappedSelection && (
 <SurfaceCard
 data-testid="log-swap-card"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.72rem",
 borderRadius:20,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", fontWeight:700 }}>Actual session</div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Pick what you actually did so the saved log stays honest.
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.45rem", gridTemplateColumns:"repeat(auto-fit,minmax(168px,1fr))" }}>
 <select
 data-testid="log-swap-modality"
 aria-label="Swapped session modality"
 value={actualModalityKey}
 onChange={(event) => {
  updateSessionDraft("actualModality", event.target.value);
  updateRunDraft("modality", event.target.value);
  updateGenericDraft("modality", event.target.value);
 }}
 style={largeSurfaceInputStyle}
 >
 {WORKOUT_LOG_MODALITY_OPTIONS.map((option) => (
 <option key={option.key} value={option.key}>{option.label}</option>
 ))}
 </select>
 <input
 data-testid="log-swap-label"
 aria-label="Actual session label"
 value={detailed?.session?.swapLabel || ""}
 onChange={(event) => updateSessionDraft("swapLabel", event.target.value)}
 placeholder="Optional actual session label"
 style={largeSurfaceInputStyle}
 />
 </div>
 </SurfaceCard>
)}
{showRunActuals && (
 <SurfaceCard
 variant="subtle"
 data-testid="log-run-actuals"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.72rem",
 borderRadius:20,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", fontWeight:700 }}>Cardio actuals</div>
 <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {isSwappedSelection
  ? "Log the substitute modality you actually did."
  : runPrefillBits || "The planned cardio session is loaded. Change only what happened."}
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(112px,1fr))", gap:"0.45rem" }}>
 <SurfaceCard
 data-testid="log-run-modality-card"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.65rem",
 borderRadius:18,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.06em", textTransform:"uppercase" }}>
 Modality
 </div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Save the actual cardio mode, not the planned one.
 </div>
 </div>
 <select
 data-testid="log-run-modality"
 aria-label="Cardio modality"
 value={actualModalityKey}
 onChange={(event) => {
  updateSessionDraft("actualModality", event.target.value);
  updateRunDraft("modality", event.target.value);
 }}
 style={largeSurfaceInputStyle}
 >
 {WORKOUT_LOG_MODALITY_OPTIONS.filter((option) => ["run", "treadmill", "bike", "elliptical", "walk", "rower", "swim"].includes(option.key)).map((option) => (
 <option key={option.key} value={option.key}>{option.label}</option>
 ))}
 </select>
 </SurfaceCard>
 <LogValueStepper
 dataTestId="log-run-duration-stepper"
 inputTestId="log-run-duration"
 label="Minutes"
 value={detailed.run?.duration || ""}
 suffix="min"
 helper={detailed.run?.plannedDurationHint ? `Planned ${detailed.run.plannedDurationHint}` : "Leave blank only if time truly did not matter."}
 decrementAmount={5}
 incrementAmount={5}
 min={0}
 max={360}
 onStep={(delta) => stepRunField("duration", delta, { min: 0, max: 360, precision: 0 })}
 onChange={(nextValue) => updateRunDraft("duration", nextValue)}
 />
 <LogValueStepper
 dataTestId="log-run-distance-stepper"
 inputTestId="log-run-distance"
 label="Distance"
 value={detailed.run?.distance || ""}
 suffix="mi"
 helper={detailed.run?.plannedDistanceHint ? `Planned ${detailed.run.plannedDistanceHint}` : "Optional if you tracked distance."}
 decrementAmount={0.5}
 incrementAmount={0.5}
 min={0}
 max={99}
 precision={1}
 onStep={(delta) => stepRunField("distance", delta, { min: 0, max: 99, precision: 1 })}
 onChange={(nextValue) => updateRunDraft("distance", nextValue)}
 inputMode="decimal"
 />
 <SurfaceCard
 data-testid="log-run-pace-card"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.65rem",
 borderRadius:18,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.06em", textTransform:"uppercase" }}>
 Pace
 </div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {detailed.run?.plannedPaceHint ? `Planned ${detailed.run.plannedPaceHint}` : "Optional if pace matters for this session."}
 </div>
 </div>
 <input
 data-testid="log-run-pace"
 aria-label="Run pace"
 inputMode="text"
 enterKeyHint="next"
 value={detailed.run?.pace || ""}
 onChange={e=>updateRunDraft("pace", e.target.value)}
 placeholder={detailed.run?.plannedPaceHint || "8:30 / mi"}
 style={largeSurfaceInputStyle}
 />
 </SurfaceCard>
 <SurfaceCard
 data-testid="log-run-rpe-card"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.65rem",
 borderRadius:18,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.06em", textTransform:"uppercase" }}>
 RPE
 </div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Optional if effort mattered for the session.
 </div>
 </div>
 <input
 data-testid="log-run-rpe"
 aria-label="Run effort"
 inputMode="numeric"
 enterKeyHint="next"
 value={detailed.run?.rpe || ""}
 onChange={e=>updateRunDraft("rpe", e.target.value)}
 placeholder="1-10"
 style={largeSurfaceInputStyle}
 />
 </SurfaceCard>
 </div>
 </SurfaceCard>
 )}
{!!showStrengthActuals && (
 <SurfaceCard
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.5rem",
 padding:"0.72rem",
 borderRadius:20,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", fontWeight:700 }}>Strength actuals</div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {strengthSummaryLine}
 </div>
 {!!detailed.substitutionSupport?.allowed && (
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Change the exercise name only if you actually swapped it.
 </div>
 )}
 </div>
 {prescribedStrengthRows.length > 0 ? (
 <div style={{ display:"grid", gap:"0.45rem" }}>
 {prescribedStrengthRows.map(({ row, index }) => (
<StrengthExecutionCard
key={`${row?.key || "exercise"}_${index}`}
row={row}
index={index}
onStepField={stepStrengthField}
onChangeField={updateStrengthFieldValue}
onUsePlannedExercise={usePlannedExercise}
bandTensionLevels={BAND_TENSION_LEVELS}
/>
 ))}
 </div>
 ) : (
 <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
 This session did not include saved lift-by-lift structure.
 </div>
 )}
 </SurfaceCard>
 )}
{!!showGenericActuals && (
 <SurfaceCard
 variant="subtle"
 data-testid="log-generic-actuals"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.72rem",
 borderRadius:20,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", fontWeight:700 }}>Recovery / other actuals</div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Log recovery work, mobility, walks, or other unstructured sessions without forcing a fake strength entry.
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(112px,1fr))", gap:"0.45rem" }}>
 <SurfaceCard
 data-testid="log-generic-modality-card"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.45rem",
 padding:"0.65rem",
 borderRadius:18,
 background:"var(--consumer-panel)",
 borderColor:"var(--consumer-border)",
 }}
 >
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.06em", textTransform:"uppercase" }}>
 Modality
 </div>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Pick what the session actually was.
 </div>
 </div>
 <select
 data-testid="log-generic-modality"
 aria-label="Recovery or other modality"
 value={actualModalityKey}
 onChange={(event) => {
  updateSessionDraft("actualModality", event.target.value);
  updateGenericDraft("modality", event.target.value);
 }}
 style={largeSurfaceInputStyle}
 >
 {WORKOUT_LOG_MODALITY_OPTIONS.filter((option) => option.key !== "strength").map((option) => (
 <option key={option.key} value={option.key}>{option.label}</option>
 ))}
 </select>
 </SurfaceCard>
 <LogValueStepper
 dataTestId="log-generic-duration-stepper"
 inputTestId="log-generic-duration"
 label="Minutes"
 value={detailed.generic?.duration || ""}
 suffix="min"
 helper="Log the total time if you tracked it."
 decrementAmount={5}
 incrementAmount={5}
 min={0}
 max={360}
 onStep={(delta) => stepGenericField("duration", delta, { min: 0, max: 360, precision: 0 })}
 onChange={(nextValue) => updateGenericDraft("duration", nextValue)}
 />
 <LogValueStepper
 dataTestId="log-generic-distance-stepper"
 inputTestId="log-generic-distance"
 label="Distance"
 value={detailed.generic?.distance || ""}
 suffix="mi"
 helper="Optional for walks or other cardio."
 decrementAmount={0.5}
 incrementAmount={0.5}
 min={0}
 max={99}
 precision={1}
 onStep={(delta) => stepGenericField("distance", delta, { min: 0, max: 99, precision: 1 })}
 onChange={(nextValue) => updateGenericDraft("distance", nextValue)}
 inputMode="decimal"
 />
 {!!detailed.generic?.reps || !!detailed.generic?.weight ? (
 <>
 <LogValueStepper
 dataTestId="log-generic-reps-stepper"
 inputTestId="log-generic-reps"
 label="Reps"
 value={detailed.generic?.reps || ""}
 decrementAmount={1}
 incrementAmount={1}
 min={0}
 max={999}
 onStep={(delta) => stepGenericField("reps", delta, { min: 0, max: 999, precision: 0 })}
 onChange={(nextValue) => updateGenericDraft("reps", nextValue)}
 />
 <LogValueStepper
 dataTestId="log-generic-weight-stepper"
 inputTestId="log-generic-weight"
 label="Weight"
 value={detailed.generic?.weight || ""}
 suffix="lb"
 decrementAmount={5}
 incrementAmount={5}
 min={0}
 max={999}
 onStep={(delta) => stepGenericField("weight", delta, { min: 0, max: 999, precision: 0 })}
 onChange={(nextValue) => updateGenericDraft("weight", nextValue)}
 />
 </>
 ) : null}
 </div>
 </SurfaceCard>
 )}
 {!isSkippedSelection && (
 <LogFeelStrip
 dataTestId="log-feel-strip"
 value={detailed.feel}
 labels={FEEL_LABELS}
 onChange={(nextFeel) => {
 setDetailed((current) => ({ ...current, feel: nextFeel }));
 showFeelTooltip(nextFeel);
 }}
 />
 )}
 {!isSkippedSelection && (
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {feelTooltip || feelSelection.tip}
 </div>
 )}
 <details
 data-testid="log-advanced-fields"
 open={advancedFieldsOpen}
 onToggle={e=>setAdvancedFieldsOpen(e.currentTarget.open)}
 style={{ border:"1px solid var(--consumer-border)", borderRadius:18, background:"var(--consumer-panel)", padding:"0.65rem 0.7rem" }}
 >
 <summary style={{ cursor:"pointer", fontSize:"0.54rem", color:"var(--consumer-text)" }}>Notes and recovery signals</summary>
 <div style={{ display:"grid", gap:"0.45rem", marginTop:"0.4rem" }}>
 <div style={{ display:"grid", gap:"0.45rem", gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))" }}>
 <select
 data-testid="log-location"
 aria-label="Workout location"
 value={detailed.location || "home"}
 onChange={e=>setDetailed({ ...detailed, location:e.target.value })}
 style={largeSurfaceInputStyle}
 >
 <option value="home">Home</option>
 <option value="gym">Gym</option>
 <option value="outdoor">Outdoor</option>
 <option value="travel">Travel</option>
 </select>
 <select
 data-testid="log-body-status"
 aria-label="Body status"
 value={detailed?.signals?.bodyStatus || ""}
 onChange={e=>updateSignalDraft("bodyStatus", e.target.value)}
 style={largeSurfaceInputStyle}
 >
 <option value="">Body status</option>
 {WORKOUT_LOG_BODY_STATUS_OPTIONS.map((option) => (
 <option key={option.key} value={option.key}>{option.label}</option>
 ))}
 </select>
 <select
 data-testid="log-recovery-state"
 aria-label="Recovery state"
 value={detailed?.signals?.recoveryState || ""}
 onChange={e=>updateSignalDraft("recoveryState", e.target.value)}
 style={largeSurfaceInputStyle}
 >
 <option value="">Recovery signal</option>
 {WORKOUT_LOG_RECOVERY_STATE_OPTIONS.map((option) => (
 <option key={option.key} value={option.key}>{option.label}</option>
 ))}
 </select>
 <select
 data-testid="log-blocker"
 aria-label="Main blocker"
 value={detailed?.signals?.blocker || ""}
 onChange={e=>updateSignalDraft("blocker", e.target.value)}
 style={largeSurfaceInputStyle}
 >
 {WORKOUT_LOG_BLOCKER_OPTIONS.map((option) => (
 <option key={option.key || "none"} value={option.key}>{option.label}</option>
 ))}
 </select>
 </div>
 <textarea
 aria-label="Session note"
 value={detailed.notes || ""}
 onChange={e=>setDetailed({ ...detailed, notes:e.target.value })}
 placeholder="Optional note about what changed, why it changed, or what mattered."
 rows={3}
 enterKeyHint="done"
 style={{ minHeight:88, resize:"vertical", fontSize:"max(16px, 0.86rem)", lineHeight:1.5 }}
 />
 </div>
 </details>
 </SurfaceCard>
{!!showStrengthActuals && (
<details data-testid="log-extra-exercises" open={quickDetailsOpen} onToggle={e=>setQuickDetailsOpen(e.currentTarget.open)} style={{ marginTop:"0.05rem", border:"1px solid var(--consumer-border)", borderRadius:14, background:"var(--consumer-panel)", padding:"0.55rem 0.62rem" }}>
<summary style={{ cursor:"pointer", fontSize:"0.5rem", color:"var(--consumer-text-muted)" }}>
Add or remove movements
</summary>
<div style={{ display:"grid", gap:"0.45rem", marginTop:"0.45rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {extrasSummaryLine}
 </div>
 {!!extraStrengthRows.length && (
 <div style={{ display:"grid", gap:"0.35rem" }}>
 {extraStrengthRows.map(({ row, index }) => {
 return (
<div key={`${row?.key || "extra"}_${index}`} data-testid={`log-extra-strength-row-${index}`} style={{ display:"grid", gap:"0.35rem" }}>
<StrengthExecutionCard
row={row}
index={index}
onStepField={stepStrengthField}
onChangeField={updateStrengthFieldValue}
onUsePlannedExercise={usePlannedExercise}
bandTensionLevels={BAND_TENSION_LEVELS}
/>
<div style={{ display:"flex", justifyContent:"flex-end" }}>
<button type="button" className="btn" onClick={()=>removeStrengthRow(index)} style={{ minHeight:48, borderRadius:14, fontSize:"0.48rem" }}>
Remove
</button>
</div>
 </div>
 );
 })}
 </div>
 )}
<button type="button" className="btn" onClick={addExtraStrengthRow} style={{ width:"fit-content", minHeight:48, borderRadius:14, fontSize:"0.48rem", color:"var(--consumer-text-muted)", borderColor:"var(--consumer-border-strong)" }}>
Add exercise
</button>
</div>
</details>
)}
<div data-testid="log-sticky-save" style={{ position:"fixed", left:"max(0.75rem, env(safe-area-inset-left, 0px))", right:"max(0.75rem, env(safe-area-inset-right, 0px))", bottom:"calc(env(safe-area-inset-bottom, 0px) + 0.35rem)", zIndex:4, pointerEvents:"none" }}>
<div style={{ border:"1px solid var(--consumer-border-strong)", borderRadius:14, background:"color-mix(in srgb, var(--consumer-panel) 92%, transparent)", backdropFilter:"blur(16px)", padding:"0.55rem 0.6rem", display:"grid", gap:"0.32rem", boxShadow:"var(--shadow-2)", maxWidth:640, margin:"0 auto", pointerEvents:"auto" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
<div data-testid="log-save-support-line" style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {saveStateLine}
 </div>
 {saved && (
 <span style={{ fontSize:"0.45rem", color:C.green, background:`${C.green}12`, border:`1px solid ${C.green}24`, borderRadius:999, padding:"0.12rem 0.34rem" }}>
 Saved {savedAtLabel}
 </span>
 )}
 </div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
<button
data-testid="log-save-quick"
className="btn btn-primary"
onClick={handlePrimarySave}
disabled={!canSavePrimary}
style={{ flex:"1 1 220px", minHeight:52, borderRadius:16, justifyContent:"center", fontSize:"0.56rem", opacity:canSavePrimary ? 1 : 0.55 }}
>
{primarySaveLabel}
</button>
</div>
</div>
</div>
 </div>

 <details className="card" data-testid="log-day-review-disclosure">
<summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"var(--consumer-text)" }}>Saved day review</summary>
<div style={{ marginTop:"0.45rem", display:"grid", gap:"0.45rem" }}>
<select aria-label="Choose a saved day to review" value={selectedReviewDate} onChange={(e)=>setSelectedReviewDate(e.target.value)} style={{ fontSize:"0.54rem", minWidth:150 }}>
 {(reviewDateKeys || []).slice(0, 60).map((dateKey) => (
 <option key={dateKey} value={dateKey}>{dateKey}</option>
 ))}
 </select>
 <HistoryAuditDayReviewCard
 title="DAY REVIEW"
 subtitle="See what was planned, what happened, and what changes next."
 review={selectedDayReview}
 palette={C}
 sanitizeDisplayText={sanitizeDisplayText}
 sanitizeStatusLabel={sanitizeStatusLabel}
 buildReviewBadgeTone={reviewBadgeTone}
 summarizeExecutionDelta={summarizeExecutionDelta}
 formatReviewTimestamp={formatReviewTimestamp}
 buildSessionSummary={buildSessionSummary}
 buildNutritionActualSummary={buildNutritionActualSummary}
 buildRecoveryActualSummary={buildRecoveryActualSummary}
 cleanHistorySessionName={cleanHistorySessionName}
 describeProvenanceRecord={describeProvenanceRecord}
 />
 </div>
 </details>

 <details className="card" data-testid="log-recent-history-disclosure">
<summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"var(--consumer-text)" }}>Recent history</summary>
 <div style={{ display:"grid", gap:"0.35rem", marginTop:"0.45rem" }}>
 {history.slice(0, 12).map(([date, log]) => (
<div key={date} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.45rem", alignItems:"center", border:"1px solid var(--consumer-border)", borderRadius:10, background:"var(--consumer-panel)", padding:"0.48rem 0.55rem" }}>
 <button className="btn" onClick={()=>openHistoryEntry(date, log)} style={{ border:"none", background:"transparent", padding:0, textAlign:"left", minWidth:0 }}>
<div style={{ fontSize:"0.54rem", color:"var(--consumer-text)", lineHeight:1.4 }}>{new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})} - {cleanHistorySessionName(log?.type || "Session")}</div>
<div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", marginTop:"0.12rem", lineHeight:1.4 }}>{summarizeExecutionDelta(getPlanComparison(date, log))}</div>
 </button>
 {pendingDeleteDate === date ? (
 <div style={{ display:"flex", gap:"0.25rem", alignItems:"center", flexWrap:"wrap" }}>
 <button className="btn" onClick={()=>delLog(date)} style={{ fontSize:"0.46rem", color:C.red, borderColor:C.red+"30", padding:"0.1rem 0.32rem" }}>Delete</button>
 <button className="btn" onClick={()=>setPendingDeleteDate("")} style={{ fontSize:"0.46rem", padding:"0.1rem 0.32rem" }}>Cancel</button>
 </div>
 ) : (
 <button className="btn" onClick={()=>setPendingDeleteDate(date)} style={{ fontSize:"0.46rem", color:C.red, borderColor:C.red+"30" }}>DEL</button>
 )}
 </div>
 ))}
 </div>
 </details>

 </div>
 );

}
