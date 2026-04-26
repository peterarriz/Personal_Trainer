import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getGoalContext, normalizeActualNutritionLog, compareNutritionPrescriptionToActual, getPlaceRecommendations, buildGroceryBasket, mergeActualNutritionLogUpdate, applyHydrationQuickAdd } from "../../modules-nutrition.js";
import { buildPlannedDayRecord, resolveEffectiveStatus } from "../../modules-checkins.js";
import { COACH_TOOL_ACTIONS, deterministicCoachPacket } from "../../modules-coach-engine.js";
import { coordinateCoachActionCommit, resolveStoredAiApiKey, runCoachChatRuntime } from "../../services/ai-runtime-service.js";
import {
  buildCoachActionHistoryModel,
  buildCoachActionLabel,
  buildCoachActionPreviewModel,
  buildCoachAskAnythingStateModel,
  buildCoachModeCards,
  buildCoachQuickChangeActions,
  buildCoachRecentQuestionModel,
  COACH_SURFACE_MODES,
} from "../../services/coach-surface-service.js";
import { buildSaveFeedbackModel, SAVE_FEEDBACK_PHASES } from "../../services/save-feedback-service.js";
import {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_OUTCOME_KINDS,
  buildRecommendationJoinKey,
} from "../../services/adaptive-learning-event-service.js";
import { deriveCalibrationState } from "../../services/calibration-state-service.js";
import {
  buildCoachOutcomeEventInput,
  buildCoachSuggestionRecommendationEventInput,
} from "../../services/adaptive-learning-domain-service.js";
import {
  buildTrainingContextFromEditor,
  deriveTrainingContextFromPersonalization,
  normalizeTrainingWeekdayAvailability,
  summarizeTrainingContext,
  TRAINING_CONTEXT_SOURCES,
  TRAINING_INTENSITY_VALUES,
  trainingEnvironmentToDisplayMode,
  trainingEquipmentToEnvironmentCode,
} from "../../services/training-context-service.js";
import { joinDisplayParts } from "../../services/text-format-service.js";
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

const ENV_MODE_PRESETS = {
 Home: { equipment: "none", time: "30" },
 Gym: { equipment: "full_gym", time: "45+" },
 Outdoor: { equipment: "none", time: "30" },
 Travel: { equipment: "basic_gym", time: "30" },
 Both: { equipment: "mixed", time: "45+" },
 Varies: { equipment: "mixed", time: "30" },
 Unknown: { equipment: "unknown", time: "unknown" },
};

const inferEquipmentFromPreset = (preset = {}, mode = "Home") => {
 const equipmentList = Array.isArray(preset?.equipment)
  ? preset.equipment.join(" ").toLowerCase()
  : String(preset?.equipment || "").toLowerCase();
 if (/full rack|barbell|cable|full gym/.test(equipmentList)) return "full_gym";
 if (/machine|hotel gym|db|dumbbell|basic gym/.test(equipmentList)) return "basic_gym";
 if (/bodyweight|none|no equipment/.test(equipmentList)) return "none";
 if (/mixed|both|varies/.test(equipmentList)) return "mixed";
 return ENV_MODE_PRESETS[mode]?.equipment || "unknown";
};

const resolveModePreset = (mode = "Home", presets = {}) => {
 const fallback = ENV_MODE_PRESETS[mode] || ENV_MODE_PRESETS.Home;
 const preset = presets?.[mode] || {};
 return {
  mode,
  equipment: inferEquipmentFromPreset(preset, mode),
  time: preset?.time || fallback.time,
 };
};

const resolveEnvironmentSelection = ({ personalization, todayKey, currentWeek }) => {
 const trainingContext = deriveTrainingContextFromPersonalization({ personalization });
 const contextSummary = summarizeTrainingContext(trainingContext);
 const presets = personalization?.environmentConfig?.presets || {};
 const base = {
  ...(personalization?.environmentConfig?.base || {}),
  equipment: trainingContext?.equipmentAccess?.confirmed ? trainingEquipmentToEnvironmentCode(trainingContext.equipmentAccess.value) : "unknown",
  time: trainingContext?.sessionDuration?.confirmed ? trainingContext.sessionDuration.value : "unknown",
  mode: trainingContext?.environment?.confirmed ? trainingEnvironmentToDisplayMode(trainingContext.environment.value) : "Unknown",
  neutral: !trainingContext?.environment?.confirmed,
  equipmentItems: contextSummary.equipmentItems,
  environmentSource: trainingContext?.environment?.source || TRAINING_CONTEXT_SOURCES.unknown,
  equipmentSource: trainingContext?.equipmentAccess?.source || TRAINING_CONTEXT_SOURCES.unknown,
  durationSource: trainingContext?.sessionDuration?.source || TRAINING_CONTEXT_SOURCES.unknown,
  intensitySource: trainingContext?.intensityPosture?.source || TRAINING_CONTEXT_SOURCES.unknown,
 };
 const finalizeScopedOverride = (selection = {}, scope = "base") => ({
  ...base,
  ...selection,
  neutral: false,
  scope,
 });
 const todayOverride = personalization?.environmentConfig?.todayOverride;
 const weekOverride = personalization?.environmentConfig?.weekOverride;
 const schedule = personalization?.environmentConfig?.schedule || [];
 const scheduledWindow = schedule.find((slot) => slot?.startDate && slot?.endDate && todayKey >= slot.startDate && todayKey <= slot.endDate);
 if (todayOverride?.date === todayKey) return finalizeScopedOverride(todayOverride, "today");
 if (scheduledWindow) {
  const modePreset = resolveModePreset(scheduledWindow.mode || "Travel", presets);
  return finalizeScopedOverride({ ...modePreset, ...scheduledWindow }, "calendar");
 }
 if (weekOverride?.week === currentWeek) return finalizeScopedOverride(weekOverride, "week");
 return { ...base, scope: "base" };
};

const joinHumanList = (items = []) => {
 const filtered = (items || []).filter(Boolean);
 if (!filtered.length) return "";
 if (filtered.length === 1) return filtered[0];
 if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
 return `${filtered.slice(0, -1).join(", ")}, and ${filtered[filtered.length - 1]}`;
};

const buildTrustSummary = ({
 explicitUserInput = false,
 loggedActuals = false,
 deviceData = false,
 inferredHeuristics = false,
 limitation = "",
 stale = false,
} = {}) => {
 const level = (explicitUserInput || loggedActuals) && (deviceData || inferredHeuristics)
  ? "grounded"
  : (explicitUserInput || loggedActuals || deviceData)
  ? "partial"
  : "limited";
 const sources = [
  explicitUserInput ? "your saved goals and preferences" : null,
  loggedActuals ? "recent logs" : null,
  deviceData ? "connected device signals" : null,
  inferredHeuristics ? "your early setup" : null,
 ].filter(Boolean);
 let summary = sources.length ? `Guidance is currently leaning on ${joinHumanList(sources)}.` : "Guidance is starting from your early setup.";
 if (!explicitUserInput && !loggedActuals && !deviceData) {
  summary = inferredHeuristics
   ? "Guidance is starting from your early setup until you add more goals, logs, or device signals."
   : "Add a goal, a log, or a device connection to sharpen this guidance.";
 } else if (!explicitUserInput && !loggedActuals) {
  summary = `Guidance is currently leaning on ${joinHumanList(sources)} until you add goals or log a session.`;
 } else if (!deviceData && inferredHeuristics) {
  summary = `Guidance is currently leaning on ${joinHumanList(sources)}. Connected device signals are not part of this yet.`;
 }
 if (stale) summary += " Some supporting data is stale.";
 if (limitation) summary += ` ${limitation}`;
 return {
  level,
  label: level === "grounded" ? "Strong signal" : level === "partial" ? "Good signal" : "Needs a little more input",
  summary,
  sourceLine: sources.length ? joinHumanList(sources) : "your early setup",
 };
};

export function CoachTab({
 planDay = null,
 surfaceModel = null,
 logs,
 dailyCheckins,
 currentWeek,
 todayWorkout: legacyTodayWorkout,
 bodyweights,
 personalization,
 athleteProfile = null,
 goals: explicitGoals = [],
 momentum,
 arbitration,
 expectations,
 memoryInsights,
 compoundingCoachMemory,
 recalibration,
 strengthLayer,
 patterns,
 proactiveTriggers,
 onApplyTrigger,
 learningLayer,
 salvageLayer,
 validationLayer,
 optimizationLayer,
 failureMode,
 planComposer,
 nutritionLayer: legacyNutritionLayer,
 realWorldNutrition: legacyRealWorldNutrition,
 nutritionActualLogs = {},
 weeklyNutritionReview = null,
 setPersonalization,
 coachActions,
 setCoachActions,
 coachPlanAdjustments,
 setCoachPlanAdjustments,
 weekNotes,
 setWeekNotes,
 planAlerts,
 setPlanAlerts,
 onOpenSettings = () => {},
 onTrackFrictionEvent = () => {},
 onRecordAdaptiveLearningEvent = () => {},
 syncStateModel = null,
 syncSurfaceModel = null,
 onPersist,
 runtime = {},
}) {
 const { C, WEEKS, safeStorageGet, sanitizeDisplayText, mergePersonalization, buildProvenanceText, buildGoalPrioritySummaryLine, validateAiPacketInvariant, validateDeterministicCoachPacketInvariant, buildInjuryRuleResult, buildReviewBadgeTone, deriveDeterministicReadinessState, buildSundayWeekInReview, resolveCanonicalSurfaceSessionLabel, SyncStateCallout, CompactSyncStatus } = runtime;
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
 const goals = explicitGoals?.length ? explicitGoals : (athleteProfile?.goals || []);
 const goalState = athleteProfile?.goalState || {};
 const userProfile = athleteProfile?.userProfile || {};
 const nutritionLayer = planDay?.resolved?.nutrition?.prescription || legacyNutritionLayer;
 const realWorldNutrition = planDay?.resolved?.nutrition?.reality || legacyRealWorldNutrition;
 const planDayWeek = planDay?.week || null;
 const livePlanningBasis = planDayWeek?.planningBasis || planComposer?.planningBasis || null;
 const livePlanBasisExplanation = livePlanningBasis?.planBasisExplanation || null;
 const canonicalCoachRecovery = planDay?.resolved?.recovery || null;
 const canonicalCoachSupplements = planDay?.resolved?.supplements || null;
 const todayKey = new Date().toISOString().split("T")[0];
 const nutritionActual = planDay?.resolved?.nutrition?.actual || nutritionActualLogs?.[todayKey] || normalizeActualNutritionLog({ dateKey: todayKey, feedback: {} });
 const nutritionComparison = planDay?.resolved?.nutrition?.comparison || compareNutritionPrescriptionToActual({
 nutritionPrescription: nutritionLayer,
 actualNutritionLog: nutritionActual,
 });
 const coachPhase = planDayWeek?.phase || todayWorkout?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
 const coachWeekFocus = planDayWeek?.weeklyIntent?.focus || planDayWeek?.planWeek?.weeklyIntent?.focus || "";
 const coachWeekSummary = planDayWeek?.summary || planDayWeek?.planWeek?.summary || "";
 const activeGoalsOrdered = [...(goals || [])]
 .filter((goal) => goal?.active)
 .sort((a, b) => (a?.priority || 99) - (b?.priority || 99));
 const currentPrimaryGoal = activeGoalsOrdered[0]?.name || arbitration?.priorityStack?.primary || "Consistency";
 const coachPrioritySummary = buildGoalPrioritySummaryLine(activeGoalsOrdered, { maxVisible: 3 });
 const currentBlockLabel = sanitizeDisplayText(
 planDayWeek?.programBlock?.label
 || planDayWeek?.label
 || `${coachPhase} block`
 );
 const currentPlanFocus = sanitizeDisplayText(
 livePlanBasisExplanation?.coachLine
 || planDayWeek?.weeklyIntent?.focus
 || planDayWeek?.successDefinition
 || coachWeekFocus
 || coachWeekSummary
 || planDayWeek?.programBlock?.summary
 || "Current week plan"
 );
 const coachPlanLine = joinDisplayParts([
 coachPrioritySummary ? `Goals: ${coachPrioritySummary}` : (currentPrimaryGoal ? `Goal: ${currentPrimaryGoal}` : ""),
 livePlanningBasis?.activeProgramName ? `Plan: ${livePlanningBasis.activeProgramName}` : "",
 livePlanningBasis?.activeStyleName ? `Bias: ${livePlanningBasis.activeStyleName}` : "",
 currentBlockLabel ? `This block: ${currentBlockLabel}` : "",
 ]);
const liveFidelityLabel = livePlanBasisExplanation?.effectiveFidelityMode === "strict"
? "Structured plan"
: livePlanBasisExplanation?.effectiveFidelityMode === "style_only"
? "Use for feel"
: livePlanBasisExplanation?.effectiveFidelityMode === "adapted"
? "Fit to you"
: "";
 const coachDebugMode = typeof window !== "undefined" && safeStorageGet(localStorage, "trainer_debug", "0") === "1";
 const coachOperatorHostname = typeof window !== "undefined" ? window.location.hostname : "";

 const [coachSurfaceMode, setCoachSurfaceMode] = useState(COACH_SURFACE_MODES.todayWeek);
 const [selectedTodayPrompt, setSelectedTodayPrompt] = useState("status");
 const [messages, setMessages] = useState([]);
 const [askInput, setAskInput] = useState("");
 const [askLoading, setAskLoading] = useState(false);
 const [actionLoading, setActionLoading] = useState(false);
 const [coachPreviewState, setCoachPreviewState] = useState(null);
 const acceptCoachActionInFlightRef = useRef(false);
 const [apiKey] = useState(() => (typeof window !== "undefined"
 ? resolveStoredAiApiKey({ safeStorageGet, storageLike: localStorage, debugMode: coachDebugMode, hostname: coachOperatorHostname })
 : ""));
 useEffect(() => {
 onTrackFrictionEvent({
 flow: "coach",
 action: "surface_view",
 outcome: "viewed",
 props: {
 surface: coachSurfaceMode,
 },
 });
 }, [coachSurfaceMode, onTrackFrictionEvent]);
const [coachNotice, setCoachNotice] = useState("");
const [coachError, setCoachError] = useState("");
const [coachSavePhase, setCoachSavePhase] = useState(SAVE_FEEDBACK_PHASES.idle);
const [coachSaveDetail, setCoachSaveDetail] = useState("");
const [coachSaveError, setCoachSaveError] = useState("");
const [coachSavedAtLabel, setCoachSavedAtLabel] = useState("");
const clearCoachSaveFeedback = () => {
setCoachSavePhase(SAVE_FEEDBACK_PHASES.idle);
setCoachSaveDetail("");
setCoachSaveError("");
setCoachSavedAtLabel("");
};
const beginCoachSave = (detail = "Saving this change.") => {
setCoachSavePhase(SAVE_FEEDBACK_PHASES.saving);
setCoachSaveDetail(detail);
setCoachSaveError("");
};
const finishCoachSave = (detail = "Future workouts will follow this update.") => {
const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
setCoachSavedAtLabel(stamp);
setCoachSaveDetail(detail);
setCoachSaveError("");
setCoachSavePhase(SAVE_FEEDBACK_PHASES.saved);
};
const failCoachSave = (message = "Change did not save. Try again.") => {
setCoachSaveError(message);
setCoachSavePhase(SAVE_FEEDBACK_PHASES.error);
};
const clearCoachPreview = () => {
setCoachPreviewState(null);
};
const coachSaveFeedbackModel = buildSaveFeedbackModel({
phase: coachSavePhase,
syncState: syncStateModel,
savedAtLabel: coachSavedAtLabel,
successMessage: coachSaveDetail,
savingMessage: coachSaveDetail,
errorMessage: coachSaveError,
});
const coachFeedbackModel = coachError
? {
tone: "critical",
chipLabel: "Coach",
title: "Coach could not finish that",
detail: coachError,
support: "",
liveMode: "assertive",
}
: coachSaveFeedbackModel.show
? coachSaveFeedbackModel
: coachNotice
? {
tone: "info",
chipLabel: "Coach",
title: coachNotice,
detail: "",
support: "",
liveMode: "polite",
}
: null;
const showCoachQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");

 const toCoachTestId = (value = "") => String(value || "")
 .trim()
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "")
 .slice(0, 80);

 const buildQuickPromptMessage = (label) => {
 const dated = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
 const yesterday = new Date();
 yesterday.setDate(yesterday.getDate() - 1);
 const yKey = yesterday.toISOString().split("T")[0];
 const y = logs?.[yKey];
 const last3 = dated.slice(-3).map(([dateKey, log]) => `${dateKey}: ${log?.type || "session"} feel ${log?.feel || 3}`).join(" | ");
 const completion14 = dated.slice(-14).filter(([, log]) => ["completed_as_planned", "completed_modified", "partial_completed"].includes(log?.checkin?.status)).length;
 const total14 = Math.max(1, dated.slice(-14).length);
 const map = {
 "My Achilles feels tight": `${label}. Include today's session type (${todayWorkout?.type || "unknown"}) and injury history (${(compoundingCoachMemory?.injuryHistory || []).slice(0, 2).join("; ") || "none"}).`,
 "I missed yesterday": `${label}. Yesterday was ${y?.type || "unknown"} on ${yKey}. Current week completion: ${completion14}/${total14}.`,
 "I'm traveling today": `${label}. Travel preset is active when needed. Today's prescription: ${todayWorkout?.label || "session"}.`,
 "I feel amazing this week": `${label}. Last 3 sessions: ${last3 || "none"}. Current phase: ${coachPhase}.`,
 "I slept badly": `${label}. Today's session type: ${todayWorkout?.type || "unknown"}. Readiness context: energy ${personalization?.trainingState?.fatigueScore || "n/a"}.`,
 "I want to push harder": `${label}. Current block: ${currentBlockLabel}. Primary goal: ${currentPrimaryGoal}. Last feels ${(dated.slice(-5).map(([, log]) => log?.feel || 3).join(", ") || "none")}.`,
 };
 return map[label] || label;
 };

 const stripCoachRecommendationTone = (text = "") => String(text || "")
 .replace(/^[^:]+:\s*/i, "")
 .replace(/\s*\[[^\]]+\]\s*$/i, "")
 .replace(/\s+/g, " ")
 .trim();

 const buildCompactCoachFallbackText = (packet = null) => {
 const summary = packet?.summary || {};
 const recommendation = stripCoachRecommendationTone(packet?.recommendations?.[0] || "");
 const actionLabel = buildCoachActionLabel(packet?.actions?.[0]?.type || "");
 return [
 summary?.headline || recommendation || sanitizeDisplayText(packet?.notices?.[0] || "Coach update ready."),
 summary?.recommendedAction ? `Recommendation: ${summary.recommendedAction}` : null,
 summary?.whyNow ? `Why: ${summary.whyNow}` : sanitizeDisplayText(packet?.effects?.[0] || packet?.notices?.[0] || ""),
 summary?.watchFor ? `Likely effect: ${summary.watchFor}` : null,
 actionLabel ? `Accept change: ${actionLabel}.` : null,
 ]
 .filter(Boolean)
 .join("\n");
 };

 const commitAction = async (action) => {
 const commitResult = coordinateCoachActionCommit({
 action,
 runtime: { adjustments: coachPlanAdjustments, weekNotes, planAlerts, personalization },
 currentWeek,
 todayWorkout,
 mergePersonalization,
 buildInjuryRuleResult,
existingCoachActions: coachActions,
});
if (!commitResult.ok) {
clearCoachSaveFeedback();
setCoachError(commitResult.ui.message);
setCoachNotice("");
return commitResult;
}
const mutation = commitResult.mutation;
const nextActions = commitResult.nextActions;
setCoachActions(nextActions);
setCoachPlanAdjustments(mutation.adjustments);
setWeekNotes(mutation.weekNotes);
setPlanAlerts(mutation.planAlerts);
setPersonalization(mutation.personalization);
beginCoachSave("Saving this change.");
try {
await onPersist(mutation.personalization, nextActions, mutation.adjustments, mutation.weekNotes, mutation.planAlerts);
setCoachError("");
setCoachNotice("");
finishCoachSave("Future workouts will follow this update.");
return commitResult;
} catch (error) {
setCoachNotice("");
setCoachError("");
failCoachSave(error?.message || "Change did not save. Try again.");
return {
...commitResult,
ok: false,
error: error?.message || "coach_persist_failed",
};
}
};

 const streamCoachResponse = async ({ userMsg, history }) => {
 const deterministic = deterministicCoachPacket({
 input: userMsg,
 todayWorkout,
 currentWeek,
 logs,
 bodyweights,
 personalization,
 learning: learningLayer,
 salvage: salvageLayer,
 planComposer,
 optimizationLayer,
 failureMode,
 momentum,
 strengthLayer,
 nutritionLayer,
 nutritionActual,
 nutritionComparison,
 arbitration,
 expectations,
 memoryInsights,
 coachMemoryContext: compoundingCoachMemory,
 realWorldNutrition,
 recalibration,
 });
 validateDeterministicCoachPacketInvariant(deterministic, "deterministicCoachPacket.chat");
 const coachPacketArgs = {
 dateKey: todayKey,
 currentWeek,
 canonicalGoalState: goalState,
 canonicalUserProfile: userProfile,
 goals,
 planDay,
 planWeek: planDayWeek?.planWeek || null,
 logs,
 dailyCheckins,
 nutritionActualLogs,
 bodyweights,
 momentum,
 expectations,
 strengthLayer,
 optimizationLayer,
 failureMode,
 readiness: canonicalCoachRecovery,
 nutritionComparison,
 arbitration,
 memoryInsights,
 coachMemoryContext: compoundingCoachMemory,
 weekNotes,
 planAlerts,
 };
 validateAiPacketInvariant(coachPacketArgs, "runCoachChatRuntime");
 return runCoachChatRuntime({
 apiKey,
 userMsg,
 history,
 deterministicText: buildCompactCoachFallbackText(deterministic),
 packetArgs: coachPacketArgs,
 fetchImpl: fetch,
 onText: () => {},
 }).then((result) => ({ ...result, deterministicPacket: deterministic }));
 };

const sendAdvisoryQuestion = async (preset = "") => {
const prepared = preset || askInput;
const userMsg = (prepared || "").trim();
if (!userMsg || askLoading) return;
const startedAt = Date.now();
 setAskInput("");
 setAskLoading(true);
 clearCoachPreview();
 clearCoachSaveFeedback();
 setCoachError("");
 setCoachNotice("");
 const ts = Date.now();
 const nextHistory = [...messages, { role: "user", text: userMsg, ts }].slice(-12);
 setMessages(nextHistory);
 const historyForModel = nextHistory.map((message) => ({
 role: message.role === "assistant" ? "assistant" : "user",
 content: message.text || "",
 }));
 try {
 const streamed = await streamCoachResponse({ userMsg, history: historyForModel });
 setMessages((prev) => [...prev, {
 role: "assistant",
 text: streamed.text || "Coach update ready.",
 packet: streamed.deterministicPacket || null,
 source: streamed.source,
 ts: Date.now(),
 }].slice(-12));
 onTrackFrictionEvent({
 flow: "coach",
 action: "advisory_question",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 input_mode: preset ? "preset" : "manual",
 history_count: historyForModel.length,
 },
 });
 } catch (error) {
 setCoachError(error?.message || "Coach could not answer that right now.");
 onTrackFrictionEvent({
 flow: "coach",
 action: "advisory_question",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 input_mode: preset ? "preset" : "manual",
 history_count: historyForModel.length,
 error_code: String(error?.message || "coach_question_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 } finally {
 setAskLoading(false);
 }
 };

 const todayPromptOptions = [
 { id: "status", label: "Normal day" },
 { id: "I missed yesterday", label: "Missed yesterday" },
 { id: "I'm traveling today", label: "Travel today" },
 { id: "I slept badly", label: "Slept badly" },
 { id: "My Achilles feels tight", label: "Pain flare" },
 { id: "I want to push harder", label: "Can I push?" },
 ];
 const askAnythingExamples = [
 "Should I protect today or keep it?",
 "What is the smartest call for this week?",
 "What matters most for recovery tonight?",
 ];
 const sundayArchive = personalization?.coachMemory?.sundayReviews || [];
 const readinessPromptSignal = coachPlanAdjustments?.extra?.readinessSignals?.[todayKey] || null;
 const coachReadiness = canonicalCoachRecovery || deriveDeterministicReadinessState({
 todayKey,
 checkin: dailyCheckins?.[todayKey] || logs?.[todayKey]?.checkin || {},
 promptSignal: readinessPromptSignal,
 workout: todayWorkout,
 logs,
 dailyCheckins,
 personalization,
 momentum,
 userProfile: userProfile || {},
 });
 const readinessMetrics = coachReadiness?.metrics || {};
 const env = resolveEnvironmentSelection({ personalization, todayKey, currentWeek });
 const dayTypeMap = { "long-run": "long", long: "long", "hard-run": "tempo", hard: "tempo", "easy-run": "easy", easy: "easy", "strength+prehab": "strength", strength: "strength", "run+strength": "hybrid", conditioning: "hybrid", otf: "hybrid", recovery: "recovery", rest: "recovery" };
 const dayType = dayTypeMap[todayWorkout?.type] || "hybrid";
 const calibrationState = deriveCalibrationState({ logs, dailyCheckins });
 const isCalibration = Boolean(momentum?.isCalibration || calibrationState.isCalibration);
 const weekState = failureMode?.mode === "chaotic" ? "chaotic" : momentum?.fatigueNotes >= 2 ? "fatigued" : "normal";
 const adherenceTrend = isCalibration ? "calibrating" : momentum?.completionRate >= 0.72 ? "stable" : momentum?.completionRate >= 0.5 ? "mixed" : "slipping";
 const fatigueSignal = (personalization?.trainingState?.fatigueScore || 1) >= 4 || momentum?.fatigueNotes >= 2;
 const injuryFlag = personalization?.injuryPainState?.level || "none";
 const recoveryAdjustedToday = coachReadiness?.state === "recovery" || todayWorkout?.type === "rest" || todayWorkout?.type === "recovery" || /recovery/i.test(String(todayWorkout?.label || ""));
 const reducedLoadToday = coachReadiness?.state === "reduced_load" || Boolean(todayWorkout?.minDay);
 const progressionReadyToday = coachReadiness?.state === "progression" || /progression-ready/i.test(String(todayWorkout?.label || ""));
 const goalPriority = currentPrimaryGoal;
 const recentEntries = Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]))
 .sort((a, b) => a.localeCompare(b))
 .slice(-7)
 .map((dateKey) => {
 const log = logs?.[dateKey] || {};
 return [dateKey, { ...log, checkin: { ...(log?.checkin || {}), ...(dailyCheckins?.[dateKey] || {}) } }];
 });
 const recentLogCount = recentEntries.length;
 const completedStatuses = new Set(["completed_as_planned", "completed_modified", "partial_completed"]);
 const recentSessionLabels = recentEntries
 .map(([, entry]) => entry?.type || entry?.label || "")
 .filter(Boolean)
 .slice(-3);
 const recentCountableStatuses = recentEntries
 .map(([dateKey, entry]) => resolveEffectiveStatus(entry?.checkin, dateKey))
 .filter((status) => status !== "not_logged" && status !== "not_logged_grace");
 const recentCompletedCount = recentCountableStatuses.filter((status) => completedStatuses.has(status)).length;
 const recentSkippedCount = recentCountableStatuses.filter((status) => status === "skipped").length;
 const recentModifiedCount = recentCountableStatuses.filter((status) => status === "completed_modified" || status === "partial_completed").length;
 const recentAdherence = readinessMetrics.countableCount
 ? (Number(readinessMetrics.completedCount || 0) / Math.max(1, Number(readinessMetrics.countableCount || 0)))
 : recentCountableStatuses.length
 ? (recentCompletedCount / recentCountableStatuses.length)
 : 0;
 const latestCompletedEntry = [...recentEntries].reverse().find(([dateKey, entry]) => completedStatuses.has(resolveEffectiveStatus(entry?.checkin, dateKey)));
 const latestCheckinEntry = [...recentEntries].reverse().find(([, entry]) => hasReadinessInputs(entry?.checkin) || entry?.checkin?.status && entry?.checkin?.status !== "not_logged");
 const latestCheckin = latestCheckinEntry?.[1]?.checkin || {};
 const latestFeel = String(latestCheckin?.sessionFeel || latestCheckinEntry?.[1]?.feel || "").toLowerCase();
 const latestSleep = Number(latestCheckin?.readiness?.sleep || 0);
 const latestStress = Number(latestCheckin?.readiness?.stress || 0);
 const latestSoreness = Number(latestCheckin?.readiness?.soreness || 0);
 const lowRecoverySignal = (latestSleep > 0 && latestSleep <= 2) || latestStress >= 4 || latestSoreness >= 4 || latestFeel === "harder_than_expected";
 const highRecoverySignal = latestSleep >= 4 && latestStress > 0 && latestStress <= 2 && latestSoreness > 0 && latestSoreness <= 2 && latestFeel !== "harder_than_expected";
 const latestCompletedLabel = latestCompletedEntry?.[1]?.type || latestCompletedEntry?.[1]?.label || "recent session";
 const todaySessionLabel = todayWorkout?.label || todayWorkout?.type || "today's session";
 const readinessEvidence = joinHumanList((coachReadiness?.factors || []).slice(0, 2));
 const veryLowConsistency = (Number(readinessMetrics.consistencyRatio || 0) > 0 && Number(readinessMetrics.consistencyRatio || 0) < 0.45) || recentSkippedCount >= 3;
 const feelDescriptor = latestFeel === "easier_than_expected"
 ? "easier than expected"
 : latestFeel === "harder_than_expected"
 ? "harder than expected"
 : latestFeel
 ? "steady"
 : "not recently logged";

 const coachDecisionMode = (() => {
 if (isCalibration) return "Hold";
 if (coachReadiness?.state === "recovery" || recoveryAdjustedToday) return "Protect";
 if (injuryFlag !== "none" || fatigueSignal) return "Protect";
 if (coachReadiness?.state === "reduced_load" || reducedLoadToday) return veryLowConsistency ? "Rebuild" : "Simplify";
 if (weekState === "chaotic" || env.time === "20" || adherenceTrend === "slipping") return "Simplify";
 if (momentum?.logGapDays >= 4 || recentLogCount <= 2 || recentAdherence < 0.55) return "Rebuild";
 if (coachReadiness?.state === "progression" || (progressionReadyToday && (momentum?.score || 0) >= 60 && weekState === "normal" && env.time !== "20")) return "Push";
 if ((momentum?.score || 0) >= 74 && weekState === "normal" && env.time !== "20") return "Push";
 return "Hold";
 })();

 const coachDecision = (() => {
 const dayLabel = dayType === "tempo" ? "quality run" : dayType === "long" ? "long-run" : dayType === "easy" ? "easy run" : dayType === "strength" ? "strength" : dayType === "recovery" ? "recovery" : "hybrid";
 if (coachDecisionMode === "Protect") return {
 stance: `Do the condensed ${dayLabel} version today and keep intensity controlled.`,
 why: `Recovery signals are elevated${readinessEvidence ? ` because ${readinessEvidence}` : ""}, so we protect consistency while keeping ${goalPriority} on track.`,
 watch: "I am watching pain and session feel after this workout.",
 options: [
 { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 10, reason: "protect_mode" } }, primary: true },
 { label: "Move to tomorrow", action: { type: COACH_TOOL_ACTIONS.MOVE_LONG_RUN, payload: { days: 1, reason: "protect_shift" } } },
 ],
 };
 if (coachDecisionMode === "Simplify") return {
 stance: `Keep this simple: complete the short ${dayLabel} version.`,
 why: coachReadiness?.state === "reduced_load"
 ? `Readiness says control the day${readinessEvidence ? ` because ${readinessEvidence}` : ""}.`
 : "Time and adherence say simplify now, then rebuild consistency.",
 watch: "I am watching completion rate over the next 3 days.",
 options: [
 { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 12, reason: "simplify_mode" } }, primary: true },
 { label: "Simplify week", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15, reason: "simplify_week" } } },
 ],
 };
 if (coachDecisionMode === "Rebuild") return {
 stance: `Take the short version of the ${dayLabel} session and rebuild rhythm first.`,
 why: `Recent execution dipped, so we rebuild frequency before adding load${readinessEvidence ? ` while respecting ${readinessEvidence}` : ""}.`,
 watch: "I am watching whether you can stack 2-3 clean sessions.",
 options: [
 { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15, reason: "rebuild_mode" } }, primary: true },
 { label: "Simplify week", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 18, reason: "rebuild_week" } } },
 ],
 };
 if (coachDecisionMode === "Push") return {
 stance: `Keep the full ${dayLabel} session and add one small progression.`,
 why: `Stability is strong enough to push while still protecting recovery${readinessEvidence ? ` because ${readinessEvidence}` : ""}.`,
 watch: "I am watching session quality and next-day fatigue.",
 options: [
 { label: "Keep full session", action: null, primary: true },
 { label: "Push slightly", action: { type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 1, reason: "push_mode" } } },
 ],
 };
 return {
 stance: `Keep the full ${dayLabel} session as written.`,
 why: `Current signals support staying steady and executing cleanly${readinessEvidence ? ` because ${readinessEvidence}` : ""}.`,
 watch: "I am watching consistency and workout quality this week.",
 options: [
 { label: "Keep full session", action: null, primary: true },
 { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 8, reason: "hold_condense" } } },
 ],
 };
 })();

 const coachSnapshot = (() => {
 const recentNames = recentSessionLabels.length ? recentSessionLabels.join(", ") : "no recent workouts logged";
 const adherenceLine = recentCountableStatuses.length
 ? `${recentCompletedCount}/${recentCountableStatuses.length} recent logged sessions were completed`
 : "recent adherence data is limited";
 const recoveryLine = coachReadiness?.recoveryLine
 ? coachReadiness.recoveryLine.replace(/^Recovery recommendation:\s*/i, "").trim()
 : lowRecoverySignal
 ? `latest recovery check-in is strained (sleep ${latestSleep || "-"}, stress ${latestStress || "-"}, soreness ${latestSoreness || "-"})`
 : highRecoverySignal
 ? `latest recovery check-in looked supportive (sleep ${latestSleep || "-"}, stress ${latestStress || "-"}, soreness ${latestSoreness || "-"})`
 : `latest session felt ${feelDescriptor}`;

 let watching = "";
 let doToday = "";
 let noticed = "";

 if (coachDecisionMode === "Protect") {
 watching = `Watching recovery after ${latestCompletedLabel}: ${recoveryLine}.`;
 doToday = `Do the shortest controlled version of ${todaySessionLabel}; stop the moment pain or session feel worsens.`;
 noticed = coachReadiness?.userVisibleLine || (recentModifiedCount > 0
 ? `You kept training alive with ${recentModifiedCount} modified session${recentModifiedCount > 1 ? "s" : ""}, but recovery is the limiter right now.`
 : `Recent work (${recentNames}) stacked stress faster than recovery caught up.`);
 } else if (coachDecisionMode === "Simplify") {
 watching = `Watching whether the next 72 hours turn ${adherenceLine} into a cleaner rhythm.`;
 doToday = `Strip ${todaySessionLabel} down to the first meaningful block and log it immediately when finished.`;
 noticed = coachReadiness?.userVisibleLine || (recentSkippedCount > 0
 ? `You skipped ${recentSkippedCount} recent session${recentSkippedCount > 1 ? "s" : ""}; simplicity is more useful than adding load.`
 : "Execution has been mixed, so reducing friction matters more than perfect programming this week.");
 } else if (coachDecisionMode === "Rebuild") {
 watching = `Watching whether you can stack the next 2 sessions after ${recentNames}.`;
 doToday = `Treat ${todaySessionLabel} as a rebuild rep: show up, finish the first block, and bank momentum.`;
 noticed = `Recent adherence is ${Math.round(recentAdherence * 100)}%, so the priority is rebuilding frequency before intensity.`;
 } else if (coachDecisionMode === "Push") {
 watching = `Watching whether today's quality stays smooth and tomorrow's recovery still looks normal after ${latestCompletedLabel}.`;
 doToday = `Keep the full ${todaySessionLabel} and add one small progression only if the first half feels controlled.`;
 noticed = coachReadiness?.userVisibleLine || `You are coming in off ${adherenceLine}, and the last session felt ${feelDescriptor}.`;
 } else {
 watching = `Watching for stable recovery and clean execution across ${recentNames}.`;
 doToday = `Run ${todaySessionLabel} as written and keep the effort boringly consistent.`;
 noticed = isCalibration
? `This is your getting-started week. Log ${calibrationState.minHistoryCount} meaningful sessions and the plan will start fitting you more closely.`
 : coachReadiness?.userVisibleLine || (lowRecoverySignal
 ? "You are still carrying some recovery drag, but not enough to force a full pullback."
 : `This week looks steady: ${adherenceLine}, with no strong signal to either push or cut back.`);
 }

 return { watch: watching, doToday, noticed };
 })();

 useEffect(() => {
 const isSunday = new Date().getDay() === 0;
 if (!isSunday) return;
 if (sundayArchive.some((review) => review?.date === todayKey)) return;
 const review = buildSundayWeekInReview({ logs, momentum, patterns, recalibration, currentWeek });
 const nextReviews = [review, ...sundayArchive].slice(0, 26);
 const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, sundayReviews: nextReviews } });
 setPersonalization(updated);
 onPersist(updated, coachActions, coachPlanAdjustments, weekNotes, planAlerts);
 }, [todayKey, currentWeek]);

 const weeklyNotice = sundayArchive[0]?.paragraph
 || patterns?.observations?.[0]?.msg
 || (isCalibration ? `Starting week: log ${calibrationState.minHistoryCount} sessions so next week's read gets sharper.` : momentum?.completionRate >= 0.72 ? "Consistency is trending up this week." : "Execution has been mixed this week.");
 const coachProvenance = buildProvenanceText({
 inputs: [
 goalPriority ? "your current goal priority" : null,
 recentEntries.length ? "recent workout logs" : null,
 recentCountableStatuses.length ? "adherence trend" : null,
 readinessMetrics?.hardSessions7d ? "recent intensity load" : null,
 latestCheckinEntry ? "latest recovery check-in" : null,
 ],
 limitation: latestCheckinEntry ? "" : "Recovery input is limited right now.",
 });
 const coachTrust = buildTrustSummary({
 explicitUserInput: Boolean(latestCheckinEntry || readinessPromptSignal),
 loggedActuals: Boolean(recentCountableStatuses.length || Object.keys(nutritionActualLogs || {}).length),
 deviceData: Boolean((Number(latestSleep) > 0) || (Number(personalization?.connectedDevices?.garmin?.trainingReadinessScore || 0) > 0)),
 inferredHeuristics: true,
 limitation: latestCheckinEntry ? "" : "Recovery input is limited right now.",
 stale: Boolean(!latestCheckinEntry && recentCountableStatuses.length === 0),
 });
 const decisionTone = buildReviewBadgeTone(
 coachDecisionMode === "Protect"
 ? "recovery"
 : coachDecisionMode === "Simplify" || coachDecisionMode === "Rebuild"
 ? "changed"
 : coachDecisionMode === "Push"
 ? "progression"
 : "match",
 C
 );
 const coachTrustTone = buildReviewBadgeTone(
 coachTrust.level === "grounded" ? "match" : coachTrust.level === "partial" ? "changed" : "recovery",
 C
 );
 const weeklyNutritionCoachLine = weeklyNutritionReview?.coaching?.coachLine || "Meal guidance gets sharper once a few real days are logged.";
 const weeklyNutritionActionLine = weeklyNutritionReview?.adaptation?.actions?.[0] || "Keep meals and hydration steady so next week's guidance can get more specific.";
 const recoveryPrescriptionLine = canonicalCoachRecovery?.prescription?.summary || canonicalCoachRecovery?.recoveryLine || "Recovery guidance is connected to today's plan.";
 const supplementCoachLine = Array.isArray(canonicalCoachSupplements?.plan?.items) && canonicalCoachSupplements.plan.items.length
 ? canonicalCoachSupplements.plan.items.slice(0, 3).map((item) => `${item.name} (${item.timing})`).join(" - ")
 : "No explicit supplement plan stored for today.";

 const compressCoachCopy = (text = "", maxLen = 180) => {
 const normalized = String(text || "").replace(/\s+/g, " ").trim();
 if (!normalized) return "";
 if (normalized.length <= maxLen) return normalized;
 return `${normalized.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
 };

 const coachRecommendationCardShellStyle = {
 background: "#0f172a",
 border: "1px solid #20314a",
 borderRadius: 14,
 padding: "0.72rem 0.75rem",
 display: "grid",
 gap: "0.5rem",
 };
 const coachRecommendationPartStyle = { display: "grid", gap: "0.14rem" };
 const coachRecommendationLabelStyle = { fontSize: "0.45rem", color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" };
 const coachRecommendationHeadlineStyle = { fontSize: "0.62rem", color: "#f8fbff", lineHeight: 1.45 };
 const coachRecommendationCopyStyle = { fontSize: "0.5rem", color: "#cbd5e1", lineHeight: 1.45 };
 const coachRecommendationDiffStyle = { fontSize: "0.47rem", color: "#8fa5c8", lineHeight: 1.45 };

 const buildCoachDiffLines = (previewModel = null, maxItems = 3) => (
 (previewModel?.diffLines || previewModel?.effectLines || [])
 .filter(Boolean)
 .map((line) => compressCoachCopy(line, 140))
 .slice(0, maxItems)
 );

 const renderCoachRecommendationCard = ({
 testId,
 headlineTestId,
 recommendation = "",
 why = "",
 likelyEffect = "",
 diffLines = [],
 actionSectionLabel = "Accept",
 actionLabel = "Accept change",
 actionTestId,
 onAction = null,
 actionDisabled = false,
 actionLoadingState = false,
 actionLoadingLabel = "Working...",
 emptyRecommendation = "No recommendation is ready yet.",
 emptyWhy = "Coach is waiting on a clearer signal.",
 emptyLikelyEffect = "Nothing changes right now.",
 accentColor = C.blue,
 }) => {
 return (
 <SurfaceRecommendationCard
 testId={testId}
 headlineTestId={headlineTestId}
 recommendation={recommendation}
 why={why}
 likelyEffect={likelyEffect}
 diffLines={diffLines}
 actionSectionLabel={actionSectionLabel}
 actionLabel={actionLabel}
 actionTestId={actionTestId}
 onAction={onAction}
 actionDisabled={actionDisabled}
 actionLoadingState={actionLoadingState}
 actionLoadingLabel={actionLoadingLabel}
 emptyRecommendation={emptyRecommendation}
 emptyWhy={emptyWhy}
 emptyLikelyEffect={emptyLikelyEffect}
 accentColor={accentColor}
 />
 );
 };

 const coachRecommendationLine = compressCoachCopy(coachDecision.stance, 140);
 const coachWhyLine = compressCoachCopy(coachDecision.why, 170);
 const coachNextLine = compressCoachCopy(coachSnapshot.doToday, 150);
 const coachWatchLine = compressCoachCopy(coachSnapshot.watch, 120);
 const coachNoticedLine = compressCoachCopy(coachSnapshot.noticed, 145);
 const supportNutritionLine = compressCoachCopy(weeklyNutritionActionLine, 140);
 const supportRecoveryLine = compressCoachCopy(recoveryPrescriptionLine, 140);
 const supportSupplementLine = compressCoachCopy(supplementCoachLine, 120);
 const latestWeeklyReviewLine = compressCoachCopy(sundayArchive[0]?.paragraph || weeklyNotice, 180);
  const canonicalCoachLabel = compressCoachCopy(
  resolveCanonicalSurfaceSessionLabel({
  sessionType: surfaceModel?.display?.sessionType || "",
  sessionLabel: todayWorkout?.label
  || surfaceModel?.display?.sessionLabel
  || "Today's session",
  fallback: "Today's session",
  isHybrid: Boolean(todayWorkout?.run && todayWorkout?.strengthDuration)
  || String(todayWorkout?.type || "").toLowerCase() === "run+strength",
  }),
  140
  );
 const canonicalCoachReason = compressCoachCopy(
 surfaceModel?.canonicalReasonLine
 || surfaceModel?.preferenceAndAdaptationLine
 || coachWhyLine,
 170
 );

 const todayPromptInput = selectedTodayPrompt === "status"
 ? "status"
 : buildQuickPromptMessage(selectedTodayPrompt);
 const todayScenarioPacket = deterministicCoachPacket({
 input: todayPromptInput,
 todayWorkout,
 currentWeek,
 logs,
 bodyweights,
 personalization,
 learning: learningLayer,
 salvage: salvageLayer,
 planComposer,
 optimizationLayer,
 failureMode,
 momentum,
 strengthLayer,
 nutritionLayer,
 nutritionActual,
 nutritionComparison,
 arbitration,
 expectations,
 memoryInsights,
 coachMemoryContext: compoundingCoachMemory,
 realWorldNutrition,
 recalibration,
 });
 validateDeterministicCoachPacketInvariant(todayScenarioPacket, "deterministicCoachPacket.surface");
 const scenarioSummary = todayScenarioPacket?.summary || {};
 const todayHeadline = compressCoachCopy(
 selectedTodayPrompt === "status"
 ? coachRecommendationLine
 : scenarioSummary.headline || coachRecommendationLine,
 150
 );
 const todayWhy = compressCoachCopy(
 selectedTodayPrompt === "status"
 ? coachWhyLine
 : scenarioSummary.whyNow || coachWhyLine,
 170
 );
 const todayNextMove = compressCoachCopy(
 selectedTodayPrompt === "status"
 ? coachNextLine
 : scenarioSummary.recommendedAction || coachNextLine,
 160
 );
 const todayWatch = compressCoachCopy(
 selectedTodayPrompt === "status"
 ? coachWatchLine
 : scenarioSummary.watchFor || coachWatchLine,
 130
 );

 const actionHistory = buildCoachActionHistoryModel({ coachActions });
 const latestAcceptedAction = actionHistory[0] || null;
 const askAnythingState = buildCoachAskAnythingStateModel({ apiKey });
 const coachModeCards = buildCoachModeCards({ activeMode: coachSurfaceMode });
 const recentQuestionHistory = buildCoachRecentQuestionModel({ messages });
 const compactCoachReason = canonicalCoachReason;
 const compactCoachPlanLine = compressCoachCopy(coachPlanLine || currentPlanFocus, 92);
 const compactSavedChangeDetail = compressCoachCopy(latestAcceptedAction?.detail || "", 88);
 const changePlanActions = buildCoachQuickChangeActions({
 currentWeek,
 todayWorkout,
 injuryArea: personalization?.injuryPainState?.area || "Achilles",
 });

 const todaySuggestedActions = (() => {
 const entries = [];
 const seen = new Set();
 const pushEntry = (action, description = "", scopeLabel = "Today") => {
 const type = String(action?.type || "");
 if (!type || seen.has(type)) return;
 seen.add(type);
 entries.push({
 id: `${type.toLowerCase()}_${entries.length}`,
 label: buildCoachActionLabel(type),
 description: description || "Look over this change before you use it.",
 scopeLabel,
 action,
 });
 };
 (coachDecision.options || []).forEach((option) => {
 if (!option?.action) return;
 pushEntry(
 option.action,
 option.label === "Move to tomorrow"
 ? "Keep the week intact by shifting the key session one day."
 : option.label === "Simplify week"
 ? "Pull workload down to preserve completion this week."
 : "Lighten today's stress without abandoning the week.",
 option.label === "Simplify week" ? "This week" : "Today"
 );
 });
 (todayScenarioPacket?.actions || []).slice(0, 4).forEach((action) => {
 pushEntry(action, scenarioSummary.recommendedAction || "Review the change Coach is recommending right now.", "Preview");
 });
 return entries.slice(0, 4);
 })();

 const selectCoachPrimaryAction = (entries = [], scopePriority = []) => {
 const normalizedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
 for (const scope of scopePriority) {
 const match = normalizedEntries.find((entry) => String(entry?.scopeLabel || "").toLowerCase() === String(scope || "").toLowerCase());
 if (match) return match;
 }
 return normalizedEntries[0] || null;
 };

 const buildCoachPreviewState = (action = null, { proposalSource = "coach_change_plan", displaySource = "Coach" } = {}) => {
 if (!action?.type) return null;
 const proposedAction = {
 ...action,
 proposalSource,
 source: proposalSource,
 };
 const commitResult = coordinateCoachActionCommit({
 action: proposedAction,
 runtime: { adjustments: coachPlanAdjustments, weekNotes, planAlerts, personalization },
 currentWeek,
 todayWorkout,
 mergePersonalization,
 buildInjuryRuleResult,
 existingCoachActions: coachActions,
 });
 const previewModel = buildCoachActionPreviewModel({
 action: proposedAction,
 commitResult,
 currentWeek,
 todayKey,
 todayWorkout,
 });
 return {
 action: proposedAction,
 commitResult,
 previewModel,
 displaySource,
 };
 };

 const buildCoachJobRecommendation = (entry = null, { proposalSource = "coach_change_plan", displaySource = "Coach" } = {}) => {
 if (!entry?.action?.type) return null;
 const previewState = buildCoachPreviewState(entry.action, { proposalSource, displaySource });
 if (!previewState) return null;
 const diffLines = buildCoachDiffLines(previewState.previewModel);
 return {
 entry,
 ...previewState,
 recommendation: compressCoachCopy(previewState.previewModel.headline || entry.label, 120),
 why: compressCoachCopy(entry.description || previewState.previewModel.summary || "Coach has a clean next move ready.", 130),
 likelyEffect: compressCoachCopy(previewState.previewModel.likelyEffect || diffLines[0] || "The next stretch gets easier to execute.", 120),
 diffLines,
 };
 };

 const primaryTodayAction = buildCoachJobRecommendation(
 selectCoachPrimaryAction(todaySuggestedActions, ["Today", "Pain-aware", "Preview", "Nutrition", "This week"]),
 { proposalSource: "coach_adjust_today", displaySource: "Adjust today" }
 );
 const primaryWeekAction = buildCoachJobRecommendation(
 selectCoachPrimaryAction(changePlanActions, ["This week", "Next week", "Schedule", "Nutrition", "Pain-aware", "Today"]),
 { proposalSource: "coach_adjust_week", displaySource: "Adjust this week" }
 );
 const otherWeekActions = (changePlanActions || []).filter((entry) => entry?.id !== primaryWeekAction?.entry?.id);
 const latestAskAnswer = [...messages].reverse().find((message) => message?.role === "assistant") || null;
 const latestAskSummary = latestAskAnswer?.packet?.summary || null;
 const latestAskAction = latestAskAnswer?.packet?.actions?.[0] || null;
 const askPreviewState = buildCoachPreviewState(latestAskAction, { proposalSource: "coach_ask_coach", displaySource: "Ask coach" });
 const askDiffLines = buildCoachDiffLines(askPreviewState?.previewModel);
 const askRecommendation = latestAskAnswer ? {
 recommendation: compressCoachCopy(latestAskSummary?.recommendedAction || latestAskSummary?.headline || latestAskAnswer.text || "Coach update ready.", 150),
 why: compressCoachCopy(latestAskSummary?.whyNow || askPreviewState?.previewModel?.summary || "Coach is using your current training context.", 130),
 likelyEffect: compressCoachCopy(askPreviewState?.previewModel?.likelyEffect || latestAskSummary?.watchFor || "The next best move becomes easier to see.", 120),
 diffLines: askDiffLines,
 action: askPreviewState?.action || null,
 } : null;
 const todayRecommendation = {
 recommendation: todayNextMove,
 why: todayWhy,
 likelyEffect: compressCoachCopy(primaryTodayAction?.previewModel?.likelyEffect || todayWatch, 120),
 diffLines: buildCoachDiffLines(primaryTodayAction?.previewModel),
 action: primaryTodayAction?.action || null,
 };
 const weekRecommendation = {
 recommendation: primaryWeekAction?.recommendation || "Hold the week steady.",
 why: primaryWeekAction?.why || latestWeeklyReviewLine,
 likelyEffect: primaryWeekAction?.likelyEffect || currentPlanFocus,
 diffLines: primaryWeekAction?.diffLines || [],
 action: primaryWeekAction?.action || null,
 };
 const openCoachPreview = ({
 action = null,
 previewModel = null,
 displaySource = "Coach",
 recommendation = "",
 why = "",
 likelyEffect = "",
 diffLines = [],
 } = {}) => {
 if (!action?.type || !previewModel) return;
 clearCoachSaveFeedback();
 setCoachError("");
 setCoachNotice("");
 setCoachPreviewState({
 action,
 displaySource,
 recommendation: compressCoachCopy(recommendation || previewModel.headline || buildCoachActionLabel(action?.type), 140),
 why: compressCoachCopy(why || previewModel.summary || "Coach has a clear next move ready.", 150),
 likelyEffect: compressCoachCopy(likelyEffect || previewModel.likelyEffect || "The next stretch gets easier to execute.", 130),
 diffLines: (Array.isArray(diffLines) && diffLines.length ? diffLines : buildCoachDiffLines(previewModel, 4)),
 auditLine: previewModel.auditLine || "Nothing changes until you accept this preview.",
 });
 };
 const acceptPreviewedCoachChange = async () => {
 if (!coachPreviewState?.action?.type) return;
 await acceptCoachRecommendation(coachPreviewState.action, {
 proposalSource: coachPreviewState.action.proposalSource || coachPreviewState.action.source || "coach_change_plan",
 });
 };
 const buildCoachAdaptiveRecommendationPayload = (recommendation = null, displaySource = "Coach") => {
 if (!recommendation?.action?.type) return null;
 return buildCoachSuggestionRecommendationEventInput({
 goals,
 action: recommendation.action,
 planDay,
 displaySource,
 recommendation: recommendation.recommendation,
 why: recommendation.why,
 likelyEffect: recommendation.likelyEffect,
 });
 };
 const getActiveCoachAdaptiveRecommendation = (mode = coachSurfaceMode) => {
 if (mode === COACH_SURFACE_MODES.todayWeek) {
 return {
 payload: buildCoachAdaptiveRecommendationPayload(todayRecommendation, "Adjust today"),
 recommendation: todayRecommendation,
 };
 }
 if (mode === COACH_SURFACE_MODES.changePlan) {
 return {
 payload: buildCoachAdaptiveRecommendationPayload(weekRecommendation, "Adjust this week"),
 recommendation: weekRecommendation,
 };
 }
 if (mode === COACH_SURFACE_MODES.askAnything) {
 return {
 payload: buildCoachAdaptiveRecommendationPayload(askRecommendation, "Ask coach"),
 recommendation: askRecommendation,
 };
 }
 return {
 payload: null,
 recommendation: null,
 };
 };
 useEffect(() => {
 const activeAdaptiveRecommendation = getActiveCoachAdaptiveRecommendation(coachSurfaceMode);
 if (!activeAdaptiveRecommendation?.payload) return;
 onRecordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: activeAdaptiveRecommendation.payload,
 dedupeKey: `coach_shown_${activeAdaptiveRecommendation.payload.recommendationJoinKey}_${coachSurfaceMode}`,
 });
 }, [askRecommendation, coachSurfaceMode, onRecordAdaptiveLearningEvent, todayRecommendation, weekRecommendation]);

 const acceptCoachRecommendation = async (action, { proposalSource = "coach_change_plan" } = {}) => {
 if (!action?.type || actionLoading || acceptCoachActionInFlightRef.current) return;
 const startedAt = Date.now();
 acceptCoachActionInFlightRef.current = true;
 setActionLoading(true);
 clearCoachSaveFeedback();
 setCoachNotice("");
 setCoachError("");
 const acceptedAction = {
 ...action,
 proposalSource: action?.proposalSource || proposalSource,
 source: action?.source || action?.proposalSource || proposalSource,
 };
 const acceptedRecommendationPayload = buildCoachSuggestionRecommendationEventInput({
 goals,
 action: acceptedAction,
 planDay,
 displaySource: proposalSource,
 recommendation: acceptedAction?.type || "Coach suggestion",
 why: "",
 likelyEffect: "",
 });
 try {
 const result = await commitAction(acceptedAction);
 if (result?.ok) {
 setCoachPreviewState(null);
 onRecordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
 payload: buildCoachOutcomeEventInput({
 recommendationJoinKey: acceptedRecommendationPayload?.recommendationJoinKey || `coach_${acceptedAction?.type || "action"}`,
 decisionId: `decision_${acceptedRecommendationPayload?.recommendationJoinKey || acceptedAction?.type || "coach_action"}`,
 outcomeKind: ADAPTIVE_OUTCOME_KINDS.coachAccepted,
 action: acceptedAction,
 status: "accepted",
 detail: "Coach suggestion accepted and persisted.",
 sourceSurface: "coach",
 }),
 dedupeKey: `coach_accept_${acceptedRecommendationPayload?.recommendationJoinKey || acceptedAction?.type || "action"}_${Math.floor(Date.now() / 1000)}`,
 });
 onTrackFrictionEvent({
 flow: "coach",
 action: "plan_accept",
 outcome: "success",
 props: {
 action_type: acceptedAction?.type || "unknown",
 duration_ms: Date.now() - startedAt,
 },
 });
 } else {
 onRecordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
 payload: buildCoachOutcomeEventInput({
 recommendationJoinKey: acceptedRecommendationPayload?.recommendationJoinKey || `coach_${acceptedAction?.type || "action"}`,
 decisionId: `decision_${acceptedRecommendationPayload?.recommendationJoinKey || acceptedAction?.type || "coach_action"}`,
 outcomeKind: ADAPTIVE_OUTCOME_KINDS.coachIgnored,
 action: acceptedAction,
 status: "ignored",
 detail: "Coach suggestion could not be applied.",
 sourceSurface: "coach",
 }),
 dedupeKey: `coach_accept_error_${acceptedRecommendationPayload?.recommendationJoinKey || acceptedAction?.type || "action"}_${Math.floor(Date.now() / 1000)}`,
 });
 onTrackFrictionEvent({
 flow: "coach",
 action: "plan_accept",
 outcome: "error",
 props: {
 action_type: acceptedAction?.type || "unknown",
 duration_ms: Date.now() - startedAt,
 },
 });
 }
 } finally {
 setActionLoading(false);
 acceptCoachActionInFlightRef.current = false;
 }
 };
 return (
 <div className="fi" data-testid="coach-tab" style={{ display: "grid", gap: "0.75rem" }}>
 {syncSurfaceModel?.showFullCard && (
 <SyncStateCallout
 model={syncSurfaceModel}
 dataTestId="coach-sync-status"
 compact
 style={{ background:"rgba(11, 20, 32, 0.76)" }}
 />
 )}
 <SurfaceHero accentColor={C.blue}>
 <SurfaceStack gap="0.45rem">
 <SurfaceHeroHeader>
 <SurfaceHeroCopy>
 <SurfaceHeading
 eyebrow="Coach"
 title="Adjust the plan without losing the plot."
 supporting="Make a quick change or ask for a straight recommendation."
 eyebrowColor={C.blue}
 titleSize="hero"
 />
 </SurfaceHeroCopy>
 <SurfaceMetaRow style={{ justifyContent: "flex-end" }}>
 {showCoachQuietSyncChip && (
 <div style={{ minWidth:210 }}>
 <CompactSyncStatus
 model={syncSurfaceModel}
 dataTestId="coach-sync-status"
 style={{
 background:"rgba(11, 20, 32, 0.32)",
 opacity:0.88,
 }}
 />
 </div>
 )}
 </SurfaceMetaRow>
 </SurfaceHeroHeader>

 <SurfaceQuietPanel style={{ display:"grid", gap:"0.35rem" }}>
 {!!surfaceModel?.explanationSourceLabel && <div style={{ fontSize: "0.44rem", color: "var(--consumer-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{surfaceModel.explanationSourceLabel}</div>}
 <div data-testid="coach-canonical-session-label" style={{ fontSize: "0.56rem", color: "var(--consumer-text)", lineHeight: 1.45 }}>{canonicalCoachLabel}</div>
 {!!compactCoachReason && <div data-testid="coach-canonical-reason" style={{ fontSize: "0.49rem", color: "var(--consumer-text-soft)", lineHeight: 1.45 }}>{compactCoachReason}</div>}
 <SurfaceMetaRow>
 <SurfacePill strong>Adjust today</SurfacePill>
 <SurfacePill>Adjust this week</SurfacePill>
 <SurfacePill>Ask coach</SurfacePill>
 {!!latestAcceptedAction?.headline && (
 <SurfacePill data-testid="coach-latest-accepted-change" style={{ color:C.green, background:`${C.green}14`, borderColor:`${C.green}24` }}>
 Latest change: {latestAcceptedAction.headline}
 </SurfacePill>
 )}
 </SurfaceMetaRow>
 {!!compactSavedChangeDetail && (
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {compactSavedChangeDetail}
 </div>
 )}
 </SurfaceQuietPanel>

 <div data-testid="coach-mode-switcher" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.45rem" }}>
 {coachModeCards.map((mode) => (
 <button
 key={mode.id}
 type="button"
 className={`btn ${coachSurfaceMode === mode.id ? "btn-selected" : ""}`}
 data-testid={`coach-mode-button-${mode.id}`}
 onClick={() => {
 const activeAdaptiveRecommendation = getActiveCoachAdaptiveRecommendation(coachSurfaceMode);
 if (coachSurfaceMode !== mode.id && activeAdaptiveRecommendation?.payload?.recommendationJoinKey && activeAdaptiveRecommendation?.recommendation?.action?.type) {
 onRecordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
 payload: buildCoachOutcomeEventInput({
 recommendationJoinKey: activeAdaptiveRecommendation.payload.recommendationJoinKey,
 decisionId: `decision_${activeAdaptiveRecommendation.payload.recommendationJoinKey}`,
 outcomeKind: ADAPTIVE_OUTCOME_KINDS.coachIgnored,
 action: activeAdaptiveRecommendation.recommendation.action,
 status: "ignored",
 detail: "Coach suggestion was left without being accepted.",
 sourceSurface: "coach",
 }),
 dedupeKey: `coach_ignore_${activeAdaptiveRecommendation.payload.recommendationJoinKey}_${mode.id}`,
 });
 }
 setCoachSurfaceMode(mode.id);
 clearCoachPreview();
 clearCoachSaveFeedback();
 setCoachError("");
 setCoachNotice("");
 }}
 style={{
 display:"grid",
 gap:"0.14rem",
 textAlign:"left",
 justifyItems:"start",
 minHeight:72,
 padding:"0.72rem 0.82rem",
 borderRadius:18,
 fontSize: "0.53rem",
 color: coachSurfaceMode === mode.id ? "var(--consumer-text)" : "var(--consumer-text-muted)",
 borderColor: coachSurfaceMode === mode.id
 ? mode.emphasis === "secondary" ? `${C.purple}45` : `${C.blue}38`
 : "var(--consumer-border)",
 background: coachSurfaceMode === mode.id
 ? mode.emphasis === "secondary" ? "rgba(168, 85, 247, 0.12)" : "rgba(59, 130, 246, 0.1)"
 : "var(--consumer-panel)",
 }}
 >
 <span style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--consumer-text)" }}>{mode.label}</span>
 <span style={{ fontSize:"0.48rem", lineHeight:1.45 }}>{mode.description}</span>
 </button>
 ))}
 </div>
 </SurfaceStack>
 </SurfaceHero>

 {coachFeedbackModel && (
 <StateFeedbackBanner
 model={coachFeedbackModel}
 dataTestId="coach-feedback-status"
 compact
 />
 )}

 {coachSurfaceMode === COACH_SURFACE_MODES.todayWeek && (
 <div data-testid="coach-mode-panel-adjust_today" style={{ display: "grid", gap: "0.75rem" }}>
 <SurfaceCard variant="action" accentColor={C.green} style={{ display: "grid", gap: "0.45rem" }}>
 <SurfaceHeading eyebrow="Adjust today" title="Choose what changed today" supporting="Pick the situation. Coach shows one move, why it helps, and what changes if you accept it." eyebrowColor={C.green} />

 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Common situations
 </div>
 <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
 {todayPromptOptions.map((prompt) => (
 <button
 key={prompt.id}
 type="button"
 className={`btn ${selectedTodayPrompt === prompt.id ? "btn-selected" : ""}`}
 data-testid={`coach-today-prompt-${toCoachTestId(prompt.id)}`}
 onClick={() => {
 setSelectedTodayPrompt(prompt.id);
 clearCoachPreview();
 clearCoachSaveFeedback();
 setCoachNotice("");
 setCoachError("");
 }}
 style={{ fontSize: "0.5rem" }}
 >
 {prompt.label}
 </button>
 ))}
 </div>

 {renderCoachRecommendationCard({
 testId: "coach-job-card-adjust-today",
 headlineTestId: "coach-today-headline",
 recommendation: todayRecommendation.recommendation,
 why: todayRecommendation.why,
 likelyEffect: todayRecommendation.likelyEffect,
 diffLines: todayRecommendation.diffLines,
 actionSectionLabel: "Preview",
 actionLabel: "Preview today's change",
 actionTestId: "coach-preview-adjust-today",
 onAction: todayRecommendation.action ? () => openCoachPreview({
 ...primaryTodayAction,
 recommendation: todayRecommendation.recommendation,
 why: todayRecommendation.why,
 likelyEffect: todayRecommendation.likelyEffect,
 diffLines: todayRecommendation.diffLines,
 }) : null,
 actionDisabled: actionLoading || !todayRecommendation.action?.type,
 actionLoadingState: actionLoading,
 actionLoadingLabel: "Opening...",
 accentColor: C.green,
 })}
 </SurfaceCard>
 </div>
 )}

 {coachPreviewState && (
 <SurfaceCard data-testid="coach-preview-card" variant="strong" accentColor={C.blue} style={{ display:"grid", gap:"0.55rem" }}>
 <SurfaceHeading
 eyebrow="Preview"
 title={coachPreviewState.recommendation}
 supporting={coachPreviewState.displaySource}
 eyebrowColor={C.blue}
 />
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>Why</div>
 <div style={{ fontSize:"0.54rem", color:"var(--consumer-text)", lineHeight:1.5 }}>{coachPreviewState.why}</div>
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>Likely effect</div>
 <div style={{ fontSize:"0.54rem", color:"var(--consumer-text)", lineHeight:1.5 }}>{coachPreviewState.likelyEffect}</div>
 </div>
 {!!coachPreviewState.auditLine && (
 <div data-testid="coach-preview-audit" style={{ fontSize:"0.49rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {coachPreviewState.auditLine}
 </div>
 )}
 {!!coachPreviewState.diffLines?.length && (
 <SurfaceDisclosure data-testid="coach-preview-details" summary="More detail">
 <div style={{ display:"grid", gap:"0.24rem" }}>
 {coachPreviewState.diffLines.map((line, index) => (
 <div key={`${index}_${line}`} style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 + {line}
 </div>
 ))}
 </div>
 </SurfaceDisclosure>
 )}
 <SurfaceActions>
 <button
 type="button"
 className="btn btn-primary"
 data-testid="coach-preview-accept"
 onClick={acceptPreviewedCoachChange}
 disabled={actionLoading || !coachPreviewState?.action?.type}
 style={{ opacity: actionLoading ? 0.6 : 1 }}
 >
 {actionLoading ? "Applying..." : "Accept change"}
 </button>
 <button
 type="button"
 className="btn"
 data-testid="coach-preview-cancel"
 onClick={clearCoachPreview}
 disabled={actionLoading}
 >
 Cancel
 </button>
 </SurfaceActions>
 </SurfaceCard>
 )}

 {coachSurfaceMode === COACH_SURFACE_MODES.changePlan && (
 <div data-testid="coach-mode-panel-adjust_week" style={{ display: "grid", gap: "0.75rem" }}>
 <SurfaceCard variant="action" accentColor={C.amber} style={{ display: "grid", gap: "0.45rem" }}>
 <SurfaceHeading eyebrow="Adjust this week" title="Change the week without rebuilding everything" supporting="Coach recommends one weekly move first. Nothing changes until you accept it." eyebrowColor={C.amber} />

 {renderCoachRecommendationCard({
 testId: "coach-job-card-adjust-week",
 recommendation: weekRecommendation.recommendation,
 why: weekRecommendation.why,
 likelyEffect: weekRecommendation.likelyEffect,
 diffLines: weekRecommendation.diffLines,
 actionSectionLabel: "Preview",
 actionLabel: "Preview weekly change",
 actionTestId: "coach-preview-adjust-week",
 onAction: weekRecommendation.action ? () => openCoachPreview({
 ...primaryWeekAction,
 recommendation: weekRecommendation.recommendation,
 why: weekRecommendation.why,
 likelyEffect: weekRecommendation.likelyEffect,
 diffLines: weekRecommendation.diffLines,
 }) : null,
 actionDisabled: actionLoading || !weekRecommendation.action?.type,
 actionLoadingState: actionLoading,
 actionLoadingLabel: "Opening...",
 accentColor: C.amber,
 })}

 {otherWeekActions.length > 0 && (
 <SurfaceDisclosure data-testid="coach-week-options-disclosure" summary="More weekly options">
 <div style={{ display:"grid", gap:"0.4rem" }}>
 {otherWeekActions.slice(0, 3).map((entry) => {
 const previewState = buildCoachJobRecommendation(entry, { proposalSource: "coach_adjust_week", displaySource: "Adjust this week" });
 return (
 <button
 key={entry.id}
 type="button"
 className="btn"
 data-testid={`coach-week-option-${toCoachTestId(entry.id)}`}
 onClick={() => previewState && openCoachPreview({
 ...previewState,
 recommendation: previewState.recommendation,
 why: previewState.why,
 likelyEffect: previewState.likelyEffect,
 diffLines: previewState.diffLines,
 })}
 style={{ minHeight:56, borderRadius:16, justifyContent:"space-between", display:"grid", gap:"0.16rem", textAlign:"left" }}
 >
 <span style={{ fontSize:"0.54rem", color:"var(--consumer-text)", fontWeight:700 }}>{entry.label}</span>
 <span style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>{entry.description}</span>
 </button>
 );
 })}
 </div>
 </SurfaceDisclosure>
 )}
 </SurfaceCard>

 </div>
 )}

 {coachSurfaceMode === COACH_SURFACE_MODES.askAnything && (
 <div data-testid="coach-mode-panel-ask_coach" style={{ display: "grid", gap: "0.75rem" }}>
 <SurfaceCard variant="subtle" accentColor={C.purple} style={{ display: "grid", gap: "0.45rem" }}>
 <SurfaceHeading
 eyebrow="Ask coach"
 title="Ask for a decision or next step"
 supporting={askAnythingState.headline}
 eyebrowColor={C.purple}
 />
 <div data-testid="coach-advisory-boundary" style={{ fontSize: "0.52rem", color: "var(--consumer-text-soft)", lineHeight: 1.45 }}>{askAnythingState.detail}</div>
 <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
 {askAnythingExamples.map((prompt) => (
 <button
 key={prompt}
 type="button"
 className="btn"
 data-testid={`coach-ask-example-${toCoachTestId(prompt)}`}
 onClick={() => sendAdvisoryQuestion(prompt)}
 disabled={askLoading}
 style={{ fontSize: "0.5rem" }}
 >
 {prompt}
 </button>
 ))}
 </div>
 <div style={{ display: "flex", gap: "0.45rem" }}>
 <input value={askInput} onChange={(e) => setAskInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAdvisoryQuestion()} placeholder="Ask coach about training, recovery, or nutrition" data-testid="coach-ask-input" style={{ flex: 1 }} disabled={askLoading} />
 <button type="button" className="btn btn-primary" data-testid="coach-ask-send" onClick={() => sendAdvisoryQuestion()} disabled={askLoading} style={{ opacity: askLoading ? 0.6 : 1 }}>{askLoading ? "Thinking..." : "Ask"}</button>
 </div>
 </SurfaceCard>

 <SurfaceCard data-testid="coach-ask-answer-card" style={{ display: "grid", gap: "0.35rem" }}>
{!latestAskAnswer && <div style={{ fontSize: "0.54rem", color: "#dbe7f6", lineHeight: 1.45 }}>Ask a question to get one clear next move.</div>}
 {!!latestAskAnswer && (
 <>
 <div style={{ fontSize: "0.47rem", color: "#64748b", letterSpacing: "0.08em" }}>LATEST ANSWER</div>
 {renderCoachRecommendationCard({
 testId: "coach-ask-message",
 recommendation: askRecommendation?.recommendation,
 why: askRecommendation?.why,
 likelyEffect: askRecommendation?.likelyEffect,
 diffLines: askRecommendation?.diffLines,
 actionSectionLabel: "Preview",
 actionLabel: "Preview suggested change",
 actionTestId: "coach-ask-preview-action",
 onAction: askRecommendation?.action ? () => openCoachPreview({
 ...askPreviewState,
 displaySource: "Ask coach",
 recommendation: askRecommendation?.recommendation,
 why: askRecommendation?.why,
 likelyEffect: askRecommendation?.likelyEffect,
 diffLines: askRecommendation?.diffLines,
 }) : null,
 actionDisabled: actionLoading || !askRecommendation?.action?.type,
 actionLoadingState: actionLoading,
 actionLoadingLabel: "Opening...",
 accentColor: C.purple,
 })}
 </>
 )}
 </SurfaceCard>

 <SurfaceDisclosure data-testid="coach-recent-questions-disclosure" summary={recentQuestionHistory.summary}>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 {!recentQuestionHistory.entries.length && (
 <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Keep this space for quick decisions, not a long transcript.
 </div>
 )}
 {recentQuestionHistory.entries.map((entry) => (
 <div key={entry.id} style={{ display:"grid", gap:"0.12rem", border:"1px solid var(--consumer-border)", borderRadius:14, padding:"0.55rem 0.62rem", background:"var(--consumer-panel)" }}>
 <div style={{ fontSize:"0.53rem", color:"var(--consumer-text)", lineHeight:1.45 }}>{entry.question}</div>
 {!!entry.timestampLabel && <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", lineHeight:1.4 }}>{entry.timestampLabel}</div>}
 </div>
 ))}
 </div>
 </SurfaceDisclosure>
 </div>
 )}

 </div>
 );
}
