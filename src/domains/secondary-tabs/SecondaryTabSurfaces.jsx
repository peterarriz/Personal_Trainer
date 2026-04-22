import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getGoalContext, normalizeActualNutritionLog, compareNutritionPrescriptionToActual, getPlaceRecommendations, buildGroceryBasket, mergeActualNutritionLogUpdate, applyHydrationQuickAdd } from "../../modules-nutrition.js";
import { buildPlannedDayRecord, resolveEffectiveStatus } from "../../modules-checkins.js";
import { COACH_TOOL_ACTIONS, deterministicCoachPacket } from "../../modules-coach-engine.js";
import { buildMacroShiftLine } from "../../prompts/coach-text.js";
import { SettingsAccountSection } from "../settings/SettingsAccountSection.jsx";
import { SettingsAdvancedSection } from "../settings/SettingsAdvancedSection.jsx";
import { SettingsBaselinesSection } from "../settings/SettingsBaselinesSection.jsx";
import { SettingsGoalsSection } from "../settings/SettingsGoalsSection.jsx";
import { SettingsPreferencesSection } from "../settings/SettingsPreferencesSection.jsx";
import { SettingsProfileSection } from "../settings/SettingsProfileSection.jsx";
import { SettingsProgramsSection } from "../settings/SettingsProgramsSection.jsx";
import { SettingsSurfaceNav } from "../settings/SettingsSurfaceNav.jsx";
import { useSettingsScreenState } from "../settings/useSettingsScreenState.js";
import { buildPlanSurfaceModel } from "../../services/plan-surface-service.js";
import { buildWeeklyNutritionCalendarModel } from "../../services/nutrition-weekly-calendar-service.js";
import { buildWeeklyNutritionGroceryModel } from "../../services/nutrition-weekly-grocery-service.js";
import { buildDayReview, buildDayReviewComparison, classifyDayReviewStatus } from "../../services/day-review-service.js";
import { canExposeInternalOperatorTools, canUseClientSuppliedAiKey } from "../../services/internal-access-policy-service.js";
import { buildAdaptiveDiagnosticsPanelModel } from "../../services/adaptive-policy-operator-service.js";
import { coordinateCoachActionCommit, resolveStoredAiApiKey, runCoachChatRuntime } from "../../services/ai-runtime-service.js";
import { GOAL_CHANGE_MODES } from "../../services/goal-change-service.js";
import {
  buildGoalEditorDraft,
  buildGoalManagementPreview,
  buildGoalSettingsViewModel,
  GOAL_ARCHIVE_STATUSES,
  GOAL_MANAGEMENT_CHANGE_TYPES,
} from "../../services/goal-management-service.js";
import {
  findGoalTemplateById,
  findGoalTemplateSelectionForGoalText,
  applyGoalTemplateSelectionToDraft,
  buildGoalTemplateSelection,
  buildGoalTemplateSelectionsFromAnswers,
  listGoalTemplateCategories,
  listGoalTemplates,
} from "../../services/goal-template-catalog-service.js";
import {
  buildGoalTimingPresentation,
  buildTimingModeHelpText,
  buildVisiblePlanningHorizonLabel,
  OPEN_ENDED_TIMING_VALUE,
} from "../../services/goal-timing-service.js";
import { buildGoalProgressTrackingFromGoals } from "../../services/goal-progress-service.js";
import { buildSharedSessionSummaryModel } from "../../services/session-summary-surface-service.js";
import { buildNutritionSurfaceModel } from "../../services/nutrition-surface-service.js";
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
  buildActiveBasisSnapshot,
  buildProgramCatalogViewModel,
  buildProgramSelectionHistoryEntry,
  createDefaultProgramSelectionState,
  createProgramInstance,
  createStyleSelection,
  getProgramDefinitionById,
  getStyleDefinitionById,
  listProgramDefinitions,
  listStyleDefinitions,
  normalizeProgramsSelectionState,
  PROGRAM_FIDELITY_MODES,
  PROGRAM_SELECTION_MODES,
  PROGRAM_SOURCE_BASIS_LABELS,
  SOURCE_CONFIDENCE_LABELS,
} from "../../services/program-catalog-service.ts";
import {
  assessProgramCompatibility,
  assessStyleCompatibility,
  buildCompatibilityHeadline,
  COMPATIBILITY_OUTCOMES,
} from "../../services/program-compatibility-service.ts";
import {
  buildActivationConfirmationCopy,
  buildCompatibilityWarningCopy,
  buildPlanBasisExplanation,
  buildProgramCardExplanation,
  buildProgramWeekExplanation,
  buildStyleCardExplanation,
} from "../../services/program-explanation-service.ts";
import { buildStyleOverlayPreview, STYLE_INFLUENCE_LEVELS } from "../../services/style-overlay-service.ts";
import { buildPlanEvolutionExport, renderPlanEvolutionExportMarkdown } from "../../services/audits/plan-evolution-export-service.js";
import { buildGoalAnchorQuickEntryModel, GOAL_ANCHOR_QUICK_ENTRY_TYPES, upsertGoalAnchorQuickEntry } from "../../services/goal-anchor-quick-entry-service.js";
import { appendProvenanceSidecar, buildProvenanceEvent, describeProvenanceRecord, normalizeProvenanceEvent, PROVENANCE_ACTORS } from "../../services/provenance-service.js";
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
import { buildLegacyHistoryDisplayLabel } from "../../services/legacy-fallback-compat-service.js";
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
import {
  isHardNutritionDayType,
  isRecoveryNutritionDayType,
  isStrengthNutritionDayType,
  normalizeNutritionDayType,
  NUTRITION_DAY_TYPES,
} from "../../services/nutrition-day-taxonomy-service.js";
import { joinDisplayParts } from "../../services/text-format-service.js";
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
import { sanitizeIntakeText } from "../../services/intake-flow-service.js";
import {
  buildDeleteAccountEndpointUnavailableDiagnostics,
  DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
  getTemporarilyUnavailableEndpoint,
  isMissingEndpointResponseStatus,
  markEndpointTemporarilyUnavailable,
} from "../../services/runtime-endpoint-availability-service.js";
import { CompactTrustRow } from "../../components/CompactTrustRow.jsx";
import { SessionSummaryBlock } from "../../components/SessionSummaryBlock.jsx";
import {
  LogCompletionSelector,
  LogFeelStrip,
  LogValueStepper,
  StrengthExecutionCard,
} from "../../components/WorkoutLogControls.jsx";

const buildLocationAwareOrderSuggestion = ({ nearby = [] }) => {
 const nameList = (nearby || []).map(n => String(n?.name || "").toLowerCase());
 if (nameList.some(n => n.includes("chipotle"))) {
 return "Nearby option: Chipotle with double chicken, fajita veggies, and black beans keeps protein high and fits today's target.";
 }
 if (nameList.some(n => n.includes("cava"))) {
 return "Nearby option: CAVA with greens + grains, double chicken, and hummus on the side keeps the meal balanced and protein-forward.";
 }
 if (nameList.some(n => n.includes("panera"))) {
 return "Nearby option: Panera with a teriyaki chicken bowl plus Greek yogurt is an easy protein-forward backup.";
 }
 return null;
};

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

const DELETE_DIAGNOSTICS_STALE_MS = 5 * 60 * 1000;

const createEmptySettingsDeleteDiagnosticsState = () => ({
 loading: false,
 checked: false,
 checkedAt: 0,
 configured: null,
 message: "",
 detail: "",
 fix: "",
 missing: [],
 required: [],
});

const shouldReuseDeleteDiagnosticsResult = ({
 diagnostics = null,
 now = Date.now(),
 staleMs = DELETE_DIAGNOSTICS_STALE_MS,
} = {}) => {
 if (!diagnostics?.checked) return false;
 const checkedAt = Number(diagnostics?.checkedAt || 0);
 if (!Number.isFinite(checkedAt) || checkedAt <= 0) return false;
 return (now - checkedAt) < Math.max(1000, Number(staleMs || DELETE_DIAGNOSTICS_STALE_MS));
};

const buildDeleteAccountHelpText = (deleteDiagnostics = null) => (
 deleteDiagnostics?.configured === true
  ? ""
  : "Full account deletion is not available here yet. You can still sign out or reset this device."
);

const buildLazyDeleteDiagnosticsState = (payload = {}) => ({
 loading: false,
 checked: true,
 checkedAt: Number(payload?.checkedAt || Date.now()),
 configured: Boolean(payload?.configured),
 message: String(payload?.message || (payload?.configured ? "Account deletion is configured for this deployment." : "Account deletion could not be verified.")),
 detail: String(payload?.detail || ""),
 fix: String(payload?.fix || ""),
 missing: Array.isArray(payload?.missing) ? payload.missing : [],
 required: Array.isArray(payload?.required) ? payload.required : [],
});

function useLazySettingsDeleteDiagnostics({
 activeSettingsSurface = "account",
 authEmail = "",
 authAccessToken = "",
 onTrackFrictionEvent = () => {},
} = {}) {
 const [deleteDiagnostics, setDeleteDiagnostics] = useState(createEmptySettingsDeleteDiagnosticsState);
 const deleteDiagnosticsRef = useRef(deleteDiagnostics);
 const inFlightRequestRef = useRef(null);
 const lastSettledRequestKeyRef = useRef("");

 useEffect(() => {
  deleteDiagnosticsRef.current = deleteDiagnostics;
 }, [deleteDiagnostics]);

 const refreshDeleteDiagnostics = useCallback(async ({ force = false } = {}) => {
  if (!authEmail || !authAccessToken) {
   const emptyState = createEmptySettingsDeleteDiagnosticsState();
   inFlightRequestRef.current = null;
   lastSettledRequestKeyRef.current = "";
   setDeleteDiagnostics(emptyState);
   return { ok: false, diagnostics: emptyState };
  }

  const requestKey = `${String(authEmail || "").trim().toLowerCase()}::${String(authAccessToken || "").slice(0, 24)}`;
  if (!force && inFlightRequestRef.current?.key === requestKey && inFlightRequestRef.current?.promise) {
   return inFlightRequestRef.current.promise;
  }
  if (
   !force
   && lastSettledRequestKeyRef.current === requestKey
   && shouldReuseDeleteDiagnosticsResult({ diagnostics: deleteDiagnosticsRef.current })
  ) {
   return {
    ok: true,
    diagnostics: deleteDiagnosticsRef.current,
    reused: true,
   };
  }

  const startedAt = Date.now();
  const requestPromise = (async () => {
   setDeleteDiagnostics((current) => ({ ...current, loading: true }));
   try {
    const unavailableEndpoint = getTemporarilyUnavailableEndpoint({
     endpoint: DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
    });
    if (unavailableEndpoint) {
     const next = buildLazyDeleteDiagnosticsState(
      buildDeleteAccountEndpointUnavailableDiagnostics({
       status: unavailableEndpoint?.status,
       reason: unavailableEndpoint?.reason,
      })
     );
     lastSettledRequestKeyRef.current = requestKey;
     setDeleteDiagnostics(next);
     onTrackFrictionEvent({
      flow: "settings",
      action: "delete_diagnostics",
      outcome: "blocked",
      props: {
       duration_ms: Date.now() - startedAt,
       missing_count: 0,
      },
     });
     return { ok: true, diagnostics: next, skipped: true };
    }

    const res = await fetch(DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT, {
     method: "GET",
     headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authAccessToken}`,
     },
    });
    const data = await res.json().catch(() => ({}));
    if (isMissingEndpointResponseStatus(res?.status)) {
     markEndpointTemporarilyUnavailable({
      endpoint: DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
      status: res?.status,
      reason: String(data?.code || data?.message || "endpoint_unavailable"),
     });
     const next = buildLazyDeleteDiagnosticsState(
      buildDeleteAccountEndpointUnavailableDiagnostics({
       status: res?.status,
       reason: String(data?.code || data?.message || "endpoint_unavailable"),
      })
     );
     lastSettledRequestKeyRef.current = requestKey;
     setDeleteDiagnostics(next);
     onTrackFrictionEvent({
      flow: "settings",
      action: "delete_diagnostics",
      outcome: "blocked",
      props: {
       duration_ms: Date.now() - startedAt,
       missing_count: 0,
      },
     });
     return { ok: true, diagnostics: next, skipped: true };
    }
    const next = buildLazyDeleteDiagnosticsState({
     ...data,
     checkedAt: Date.now(),
    });
    lastSettledRequestKeyRef.current = requestKey;
    setDeleteDiagnostics(next);
    onTrackFrictionEvent({
     flow: "settings",
     action: "delete_diagnostics",
     outcome: next.configured ? "success" : "blocked",
     props: {
      duration_ms: Date.now() - startedAt,
      missing_count: next.missing.length,
     },
    });
    return { ok: true, diagnostics: next };
   } catch (error) {
    const next = {
     loading: false,
     checked: true,
     checkedAt: Date.now(),
     configured: false,
     message: "Delete-account diagnostics could not be loaded.",
     detail: "The deployment did not confirm permanent delete support, so the delete flow stays blocked until diagnostics succeed.",
     fix: `Retry the diagnostics check. If it keeps failing, inspect the server deployment and the ${DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT} route.`,
     missing: [],
     required: [],
    };
    lastSettledRequestKeyRef.current = requestKey;
    setDeleteDiagnostics(next);
    onTrackFrictionEvent({
     flow: "settings",
     action: "delete_diagnostics",
     outcome: "error",
     props: {
      duration_ms: Date.now() - startedAt,
      error_code: String(error?.message || "diagnostics_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
     },
    });
    return { ok: false, error, diagnostics: next };
   }
  })();
  inFlightRequestRef.current = {
   key: requestKey,
   promise: requestPromise,
  };
  try {
   return await requestPromise;
  } finally {
   if (inFlightRequestRef.current?.promise === requestPromise) {
    inFlightRequestRef.current = null;
   }
  }
 }, [authAccessToken, authEmail, onTrackFrictionEvent]);

 useEffect(() => {
  if (activeSettingsSurface !== "account" || !authEmail || !authAccessToken) {
   if (!authEmail || !authAccessToken) {
    inFlightRequestRef.current = null;
    lastSettledRequestKeyRef.current = "";
    setDeleteDiagnostics(createEmptySettingsDeleteDiagnosticsState());
   }
   return;
  }
  let active = true;
  (async () => {
   const result = await refreshDeleteDiagnostics();
   if (!active || !result?.diagnostics) return;
  })();
  return () => {
   active = false;
  };
 }, [activeSettingsSurface, authAccessToken, authEmail, refreshDeleteDiagnostics]);

 return {
  deleteDiagnostics,
  refreshDeleteDiagnostics,
 };
}


export function SettingsTab({ onStartFresh, personalization, setPersonalization, onPersist, exportData, importData, authSession, onReloadCloudData, onDeleteAccount, onLogout = async () => {}, onResetThisDevice = async () => ({ ok: false }), onOpenAuthGate = () => {}, onOpenPlan = () => {}, passwordResetBusy = false, passwordResetMessage = "", onRequestPasswordReset = () => {}, storageStatus = null, syncStateModel = null, syncSurfaceModel = null, syncDiagnostics = null, deviceSyncAudit, athleteProfile = null, planComposer = null, adaptiveLearningSnapshot = null, saveProgramSelection = async () => null, previewGoalChange = async () => null, applyGoalChange = async () => ({ ok: false }), previewGoalManagementChange = async () => null, applyGoalManagementChange = async () => ({ ok: false }), saveManualProgressInputs = async () => null, logs = {}, bodyweights = [], planHistoryReviews = [], planHistoryWeekSummaries = [], focusSection = "", frictionDashboard = null, onTrackFrictionEvent = () => {}, runtime = {} }) {
 const { C, PRODUCT_BRAND, DEFAULT_TIMEZONE, DEFAULT_PERSONALIZATION, PROFILE, HEALTHKIT_PERMISSIONS, safeStorageGet, safeStorageSet, sanitizeDisplayText, mergePersonalization, getDiagnosticsCode, inferGoalTemplateCategoryIdForDraft, AppearanceThemeSection, MetricsBaselinesSection, SyncStateCallout, CompactSyncStatus } = runtime;
 const appleHealth = personalization?.connectedDevices?.appleHealth || {};
 const garmin = personalization?.connectedDevices?.garmin || {};
 const debugMode = typeof window !== "undefined" && safeStorageGet(localStorage, "trainer_debug", "0") === "1";
 const operatorHostname = typeof window !== "undefined" ? window.location.hostname : "";
 const showInternalSettingsTools = canExposeInternalOperatorTools({ debugMode, hostname: operatorHostname });
 const allowClientSuppliedAiKey = canUseClientSuppliedAiKey({ debugMode, hostname: operatorHostname });
 const appleHealthSupportedMode = typeof window !== "undefined" && safeStorageGet(localStorage, "apple_health_supported", "0") === "1";
 const appleHealthPromptSupported = debugMode || appleHealthSupportedMode;
 const [connectOpen, setConnectOpen] = useState(false);
 const [checking, setChecking] = useState(false);
 const [checkMsg, setCheckMsg] = useState("");
const [garminMsg, setGarminMsg] = useState("");
const [garminFix, setGarminFix] = useState("");
const [garminBusy, setGarminBusy] = useState("");
const [settingsSaveMsg, setSettingsSaveMsg] = useState("");
const [settingsSavePhase, setSettingsSavePhase] = useState(SAVE_FEEDBACK_PHASES.idle);
const [settingsSaveDetail, setSettingsSaveDetail] = useState("");
const [settingsSaveError, setSettingsSaveError] = useState("");
const [settingsSavedAtLabel, setSettingsSavedAtLabel] = useState("");
const [showEnvEditor, setShowEnvEditor] = useState(false);
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [deleteConfirm, setDeleteConfirm] = useState("");
 const [deleteStep, setDeleteStep] = useState(1);
 const [accountActionBusy, setAccountActionBusy] = useState("");
 const [accountActionMsg, setAccountActionMsg] = useState("");
 const [accountActionTone, setAccountActionTone] = useState("neutral");
 const [resetDeviceOpen, setResetDeviceOpen] = useState(false);
 const [resetDeviceConfirm, setResetDeviceConfirm] = useState("");
 const [backupCode, setBackupCode] = useState("");
 const [backupMsg, setBackupMsg] = useState("");
 const [planHistoryReportMarkdown, setPlanHistoryReportMarkdown] = useState("");
 const [planHistoryReportMsg, setPlanHistoryReportMsg] = useState("");
 const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
 const [pendingRestoreCode, setPendingRestoreCode] = useState("");
 const [appleImportText, setAppleImportText] = useState("");
 const [garminImportText, setGarminImportText] = useState("");
 const [importMsg, setImportMsg] = useState("");
 const [locationMsg, setLocationMsg] = useState("");
 const [selectedSettingsProgramId, setSelectedSettingsProgramId] = useState("");
 const [selectedSettingsStyleId, setSelectedSettingsStyleId] = useState("");
 const [selectedSettingsProgramFidelityMode, setSelectedSettingsProgramFidelityMode] = useState(PROGRAM_FIDELITY_MODES.adaptToMe);
 const [planManagementNotice, setPlanManagementNotice] = useState("");
 const [planManagementError, setPlanManagementError] = useState("");
 const [goalChangeMode, setGoalChangeMode] = useState(GOAL_CHANGE_MODES.refineCurrentGoal);
 const [goalChangeIntent, setGoalChangeIntent] = useState("");
 const [goalChangePreview, setGoalChangePreview] = useState(null);
 const [goalChangeError, setGoalChangeError] = useState("");
 const [goalChangeNotice, setGoalChangeNotice] = useState("");
 const [goalChangePreviewing, setGoalChangePreviewing] = useState(false);
 const [goalChangeApplying, setGoalChangeApplying] = useState(false);
 const [goalManagementNotice, setGoalManagementNotice] = useState("");
 const [goalManagementError, setGoalManagementError] = useState("");
 const [goalManagementPreview, setGoalManagementPreview] = useState(null);
 const [goalManagementBusy, setGoalManagementBusy] = useState(false);
 const [goalEditorOpen, setGoalEditorOpen] = useState(false);
 const [goalArchiveOpen, setGoalArchiveOpen] = useState(false);
 const [goalEditorMode, setGoalEditorMode] = useState("edit");
 const [goalEditorDraft, setGoalEditorDraft] = useState(null);
 const [goalEditorLibraryCategory, setGoalEditorLibraryCategory] = useState("all");
 const [goalEditorLibrarySearch, setGoalEditorLibrarySearch] = useState("");
 const [showGoalEditorCustomInput, setShowGoalEditorCustomInput] = useState(false);
 const [goalArchiveDraft, setGoalArchiveDraft] = useState({ goalId: "", archiveStatus: GOAL_ARCHIVE_STATUSES.archived });
 const [goalOrderDraftIds, setGoalOrderDraftIds] = useState([]);
 const settings = personalization?.settings || DEFAULT_PERSONALIZATION.settings;
 const profile = personalization?.profile || DEFAULT_PERSONALIZATION.profile;
 const unitSettings = settings?.units || DEFAULT_PERSONALIZATION.settings.units;
 const trainingPrefs = settings?.trainingPreferences || DEFAULT_PERSONALIZATION.settings.trainingPreferences;
 const appearance = settings?.appearance || DEFAULT_PERSONALIZATION.settings.appearance;
 const notif = settings?.notifications || DEFAULT_PERSONALIZATION.settings.notifications;
 const nutritionPrefs = personalization?.nutritionPreferenceState || DEFAULT_PERSONALIZATION.nutritionPreferenceState;
 const coachMemory = personalization?.coachMemory || DEFAULT_PERSONALIZATION.coachMemory || {};
 const [coachMemoryDraft, setCoachMemoryDraft] = useState({
 failurePatterns: (coachMemory.failurePatterns || []).join(", "),
 commonBarriers: (coachMemory.commonBarriers || []).join(", "),
 simplicityVsVariety: coachMemory.simplicityVsVariety || "",
 preferredFoodPatterns: (coachMemory.preferredFoodPatterns || []).join(", "),
 });
 const [coachApiKey, setCoachApiKey] = useState(typeof window !== "undefined"
 ? resolveStoredAiApiKey({ safeStorageGet, storageLike: localStorage, debugMode, hostname: operatorHostname })
 : "");
 const goals = athleteProfile?.goals || [];
 const goalSettingsModel = useMemo(
 () => buildGoalSettingsViewModel({
 goals,
 personalization,
 now: new Date(),
 }),
 [goals, personalization]
 );
 const programsState = useMemo(
 () => normalizeProgramsSelectionState(personalization?.programs || createDefaultProgramSelectionState()),
 [personalization?.programs]
 );
 const programDefinitions = useMemo(() => listProgramDefinitions(), []);
 const styleDefinitions = useMemo(() => listStyleDefinitions(), []);
 const activeBasisSnapshot = useMemo(
 () => buildActiveBasisSnapshot({ programsState }),
 [programsState]
 );
 const activeProgramDefinition = activeBasisSnapshot?.activeProgramDefinition || null;
 const activeStyleDefinition = activeBasisSnapshot?.activeStyleDefinition || null;
 const selectedSettingsProgramDefinition = useMemo(
 () => getProgramDefinitionById(selectedSettingsProgramId || "") || programDefinitions?.[0] || null,
 [selectedSettingsProgramId, programDefinitions]
 );
 const selectedSettingsStyleDefinition = useMemo(
 () => getStyleDefinitionById(selectedSettingsStyleId || "") || styleDefinitions?.[0] || null,
 [selectedSettingsStyleId, styleDefinitions]
 );
 const settingsProgramCompatibility = useMemo(
 () => assessProgramCompatibility({
 programDefinition: selectedSettingsProgramDefinition,
 athleteProfile,
 personalization,
 goals,
 fidelityMode: selectedSettingsProgramFidelityMode,
 }),
 [selectedSettingsProgramDefinition, athleteProfile, personalization, goals, selectedSettingsProgramFidelityMode]
 );
 const settingsStyleCompatibility = useMemo(
 () => assessStyleCompatibility({
 styleDefinition: selectedSettingsStyleDefinition,
 programDefinition: activeProgramDefinition,
 athleteProfile,
 goals,
 activeProgramInstance: programsState?.activeProgramInstance || null,
 }),
 [selectedSettingsStyleDefinition, activeProgramDefinition, athleteProfile, goals, programsState?.activeProgramInstance]
 );
 const settingsPlanBasisExplanation = useMemo(
 () => planComposer?.planningBasis?.planBasisExplanation || buildPlanBasisExplanation({
 athleteProfile,
 activeProgramInstance: programsState?.activeProgramInstance || null,
 activeStyleSelection: programsState?.activeStyleSelection || null,
 programDefinition: activeProgramDefinition,
 styleDefinition: activeStyleDefinition,
 compatibilityAssessment: programsState?.lastCompatibilityAssessment || null,
 }),
 [planComposer, athleteProfile, programsState?.activeProgramInstance, programsState?.activeStyleSelection, programsState?.lastCompatibilityAssessment, activeProgramDefinition, activeStyleDefinition]
 );
 useEffect(() => {
 const currentOrder = Array.isArray(goalSettingsModel?.currentGoalOrder) ? goalSettingsModel.currentGoalOrder : [];
 setGoalOrderDraftIds((existing) => {
 if (!existing.length) return currentOrder;
 const same = existing.length === currentOrder.length && existing.every((value, index) => value === currentOrder[index]);
 return same ? existing : currentOrder;
 });
 }, [goalSettingsModel?.currentGoalOrder]);

const patchSettings = async (patch = {}) => {
const startedAt = Date.now();
 const nextIntensityPreference = String(patch?.trainingPreferences?.intensityPreference || "").trim().toLowerCase();
 const shouldPatchIntensityPosture = [
 TRAINING_INTENSITY_VALUES.conservative,
 TRAINING_INTENSITY_VALUES.standard,
 TRAINING_INTENSITY_VALUES.aggressive,
 TRAINING_INTENSITY_VALUES.adaptive,
 ].includes(nextIntensityPreference);
 const next = mergePersonalization(personalization, {
 settings: {
 ...(settings || {}),
 ...(patch || {}),
 units: { ...(settings?.units || {}), ...(patch?.units || {}) },
 trainingPreferences: { ...(settings?.trainingPreferences || {}), ...(patch?.trainingPreferences || {}) },
 appearance: { ...(settings?.appearance || {}), ...(patch?.appearance || {}) },
 notifications: { ...(settings?.notifications || {}), ...(patch?.notifications || {}) },
 },
 trainingContext: shouldPatchIntensityPosture
 ? {
 intensityPosture: {
 value: nextIntensityPreference,
 confirmed: nextIntensityPreference !== TRAINING_INTENSITY_VALUES.unknown,
 source: TRAINING_CONTEXT_SOURCES.environmentEditor,
 },
 }
 : undefined,
});
setPersonalization(next);
beginSettingsSave("Saving your settings.");
try {
await onPersist(next);
finishSettingsSave("Your settings are up to date.");
onTrackFrictionEvent({
flow: "settings",
action: "settings_save",
outcome: "success",
props: {
duration_ms: Date.now() - startedAt,
section: patch?.appearance ? "preferences" : patch?.trainingPreferences ? "training_preferences" : patch?.notifications ? "notifications" : "settings",
},
});
} catch (error) {
failSettingsSave("Settings did not save. Try again.");
onTrackFrictionEvent({
flow: "settings",
action: "settings_save",
outcome: "error",
props: {
duration_ms: Date.now() - startedAt,
section: patch?.appearance ? "preferences" : patch?.trainingPreferences ? "training_preferences" : patch?.notifications ? "notifications" : "settings",
error_code: String(error?.message || "settings_save_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
},
});
}
};

const patchProfile = async (patch = {}) => {
const startedAt = Date.now();
const next = mergePersonalization(personalization, { profile: { ...(profile || {}), ...(patch || {}) } });
setPersonalization(next);
beginSettingsSave("Saving your profile.");
try {
await onPersist(next);
finishSettingsSave("Your profile is up to date.");
onTrackFrictionEvent({
flow: "settings",
action: "profile_save",
outcome: "success",
props: {
duration_ms: Date.now() - startedAt,
},
});
} catch (error) {
failSettingsSave("Profile changes did not save. Try again.");
onTrackFrictionEvent({
flow: "settings",
action: "profile_save",
outcome: "error",
props: {
duration_ms: Date.now() - startedAt,
error_code: String(error?.message || "profile_save_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
},
});
}
};

 const saveAccountProfile = async () => {
 const startedAt = Date.now();
 const age = accountProfileDraft.age === "" ? "" : Math.max(13, Number(accountProfileDraft.age) || 0);
 const birthYear = age ? Math.max(1900, new Date().getFullYear() - age) : "";
 const normalizedWeight = accountProfileDraft.weight === "" ? "" : Number(accountProfileDraft.weight) || "";
 const normalizedHeight = accountProfileDraft.unitsHeight === "cm"
 ? (accountProfileDraft.height === "" ? "" : Number(accountProfileDraft.height) || "")
 : accountProfileDraft.height;
 const trainingAgeYears = accountProfileDraft.trainingAgeYears === "" ? "" : Math.max(0, Number(accountProfileDraft.trainingAgeYears) || 0);
 const next = mergePersonalization(personalization, {
 profile: {
 ...(profile || {}),
 name: String(accountProfileDraft.name || "").trim(),
 timezone: String(accountProfileDraft.timezone || "").trim() || DEFAULT_TIMEZONE,
 birthYear,
 age,
 height: normalizedHeight,
 weight: normalizedWeight,
 bodyweight: normalizedWeight,
 trainingAgeYears,
 },
 settings: {
 ...(settings || {}),
 units: {
 ...(unitSettings || {}),
 weight: accountProfileDraft.unitsWeight || unitSettings?.weight || "lbs",
 height: accountProfileDraft.unitsHeight || unitSettings?.height || "ft_in",
 distance: accountProfileDraft.unitsDistance || unitSettings?.distance || "miles",
 },
 },
 });
setPersonalization(next);
beginSettingsSave("Saving your account details.");
try {
await onPersist(next);
finishSettingsSave("Your account details are up to date.");
onTrackFrictionEvent({
flow: "settings",
action: "account_profile_save",
outcome: "success",
props: {
duration_ms: Date.now() - startedAt,
},
});
} catch (error) {
failSettingsSave("Account details did not save. Try again.");
onTrackFrictionEvent({
flow: "settings",
action: "account_profile_save",
outcome: "error",
props: {
duration_ms: Date.now() - startedAt,
error_code: String(error?.message || "account_profile_save_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
},
});
}
};

 const saveTrainingContextInline = async ({
 mode = "Unknown",
 equipment = "unknown",
 equipmentItems = [],
 availableDays = [],
 time = "unknown",
 } = {}) => {
 const selectedItems = Array.isArray(equipmentItems)
 ? equipmentItems
 : String(equipmentItems || "")
 .split(/[,/]/)
 .map((item) => item.trim())
 .filter(Boolean);
 const normalizedAvailableDays = normalizeTrainingWeekdayAvailability(availableDays);
 const nextTrainingContext = buildTrainingContextFromEditor({
 mode,
 equipment,
 equipmentItems: selectedItems,
 availableDays: normalizedAvailableDays,
 time,
 });
 const nextEnvironmentConfig = {
 ...(personalization?.environmentConfig || {}),
 defaultMode: mode || personalization?.environmentConfig?.defaultMode || "Home",
 base: {
 mode: mode || personalization?.environmentConfig?.base?.mode || "Unknown",
 equipment: equipment || personalization?.environmentConfig?.base?.equipment || "unknown",
 equipmentItems: selectedItems,
 time: time || personalization?.environmentConfig?.base?.time || "unknown",
 },
 todayOverride: null,
 weekOverride: null,
 };
 const next = mergePersonalization(personalization, {
 environmentConfig: nextEnvironmentConfig,
 trainingContext: nextTrainingContext,
 userGoalProfile: {
 ...(personalization?.userGoalProfile || {}),
 available_days: normalizedAvailableDays,
 },
 settings: {
 ...(settings || {}),
 trainingPreferences: {
 ...(trainingPrefs || {}),
 defaultEnvironment: mode || trainingPrefs?.defaultEnvironment || "Home",
 },
 },
});
setPersonalization(next);
beginSettingsSave("Saving your training setup.");
try {
await onPersist(next);
finishSettingsSave("Future planning now uses this training setup.");
} catch {
failSettingsSave("Training setup did not save. Try again.");
}
};

const persistAppleHealth = async (patch = {}) => {
const next = mergePersonalization(personalization, {
 connectedDevices: {
 ...(personalization?.connectedDevices || {}),
 appleHealth: { ...appleHealth, ...(patch || {}) },
 },
});
setPersonalization(next);
beginSettingsSave("Saving your Apple Health connection.");
try {
await onPersist(next);
finishSettingsSave("Apple Health status was updated.");
} catch {
failSettingsSave("Apple Health status did not save. Try again.");
}
};
 const requestAppleHealth = async () => {
 const now = Date.now();
 let status = "connected";
 try {
 const handler = window?.webkit?.messageHandlers?.healthkit;
 if (handler?.postMessage) {
 handler.postMessage({ type: "request_permissions", permissions: HEALTHKIT_PERMISSIONS });
 } else {
 status = "simulated_web";
 }
 } catch {
 status = "simulated_web";
 }
 await persistAppleHealth({
 status,
 connectionMode: status === "simulated_web" ? "simulated" : "live",
 permissionRequestedAt: now,
 permissionsGranted: [...HEALTHKIT_PERMISSIONS],
 skipped: false,
 });
 setConnectOpen(false);
 };
 const callGarminApi = async (path, { method = "POST", body } = {}) => {
 if (!authSession?.access_token) {
 setGarminMsg("You must be signed in before using Garmin Connect.");
 setGarminFix("Sign in again, then retry from Settings.");
 return null;
 }
 const res = await fetch(path, {
 method,
 headers: {
 "Content-Type": "application/json",
 "Authorization": `Bearer ${authSession.access_token}`,
 },
 ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 setGarminMsg(data?.message || `Garmin request failed (${res.status}).`);
 setGarminFix(data?.fix || "");
 return null;
 }
 setGarminMsg(data?.message || "");
 setGarminFix(data?.fix || "");
 return data;
 };
 const connectGarmin = async () => {
 setGarminBusy("connect");
 setGarminMsg("Preparing Garmin authorization...");
 setGarminFix("");
 try {
 const data = await callGarminApi("/api/auth/garmin", { method: "POST" });
 if (data?.authorizeUrl) {
 window.location.assign(data.authorizeUrl);
 return;
 }
 } catch (e) {
 setGarminMsg("Garmin setup did not finish.");
 setGarminFix("Try again in a moment. If it keeps happening, reconnect Garmin from Settings.");
 }
 setGarminBusy("");
 };
 const syncGarminNow = async () => {
 setGarminBusy("sync");
 setGarminMsg("Syncing Garmin now...");
 setGarminFix("");
 try {
 const data = await callGarminApi("/api/auth/garmin/sync", { method: "POST" });
 if (data) await onReloadCloudData?.();
 } finally {
 setGarminBusy("");
 }
 };
 const disconnectGarmin = async () => {
 setGarminBusy("disconnect");
 setGarminFix("");
 try {
 const data = await callGarminApi("/api/auth/garmin/disconnect", { method: "POST" });
 if (data) await onReloadCloudData?.();
 } finally {
 setGarminBusy("");
 }
 };
 const activeAppleTypes = appleHealth?.permissionsGranted?.length ? appleHealth.permissionsGranted.join(", ") : "None";
 const lastGarminActivity = (garmin?.activities || []).slice(-1)[0];
 const profileWeightVal = profile?.weight ?? profile?.bodyweight ?? "";
 const profileHeightVal = profile?.height ?? "";
 const profileAgeVal = profile?.age ?? (
 Number(profile?.birthYear || 0)
 ? Math.max(13, new Date().getFullYear() - Number(profile.birthYear || 0))
 : ""
 );
 const profileTimezoneVal = profile?.timezone || DEFAULT_TIMEZONE;
 const buildAccountProfileDraft = () => ({
 name: profile?.name || "",
 timezone: profileTimezoneVal,
 age: profileAgeVal === "" ? "" : String(profileAgeVal),
 height: profileHeightVal ?? "",
 weight: profileWeightVal === "" ? "" : String(profileWeightVal),
 trainingAgeYears: profile?.trainingAgeYears === "" || profile?.trainingAgeYears == null ? "" : String(profile.trainingAgeYears),
 unitsWeight: unitSettings?.weight || "lbs",
 unitsHeight: unitSettings?.height || "ft_in",
 unitsDistance: unitSettings?.distance || "miles",
 });
const [accountProfileDraft, setAccountProfileDraft] = useState(buildAccountProfileDraft);
const garminLastSyncLabel = garmin?.lastSyncAt ? new Date(garmin.lastSyncAt).toLocaleString() : "never";
const formatIntegrationTimestamp = (value) => value ? new Date(value).toLocaleString() : "never";
const settingsSaveColor = /could not be reloaded|failed:/i.test(settingsSaveMsg) ? C.amber : C.green;
const beginSettingsSave = (detail = "This should only take a moment.") => {
setSettingsSavePhase(SAVE_FEEDBACK_PHASES.saving);
setSettingsSaveDetail(detail);
setSettingsSaveError("");
};
const finishSettingsSave = (detail = "Your changes are up to date.") => {
const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
setSettingsSavedAtLabel(stamp);
setSettingsSaveDetail(detail);
setSettingsSaveError("");
setSettingsSavePhase(SAVE_FEEDBACK_PHASES.saved);
setSettingsSaveMsg(`Saved ${stamp}`);
};
const failSettingsSave = (message = "Save did not finish. Try again.") => {
setSettingsSaveError(message);
setSettingsSavePhase(SAVE_FEEDBACK_PHASES.error);
setSettingsSaveMsg(message);
};
const settingsSaveFeedbackModel = useMemo(() => buildSaveFeedbackModel({
phase: settingsSavePhase,
syncState: syncStateModel,
savedAtLabel: settingsSavedAtLabel,
successMessage: settingsSaveDetail,
savingMessage: settingsSaveDetail,
errorMessage: settingsSaveError,
}), [settingsSaveDetail, settingsSaveError, settingsSavePhase, settingsSavedAtLabel, syncStateModel]);
const accountActionFeedbackModel = useMemo(() => {
if (!accountActionMsg) return null;
const busy = Boolean(accountActionBusy);
const tone = accountActionTone === "success"
? "success"
: accountActionTone === "warn"
? "caution"
: "info";
const chipLabel = busy
? accountActionBusy === "reload"
? "Refreshing"
: accountActionBusy === "logout"
? "Signing out"
: accountActionBusy === "reset_device"
? "Resetting"
: accountActionBusy === "delete_account"
? "Deleting"
: "Working"
: tone === "success"
? "Done"
: tone === "caution"
? "Heads up"
: "Working";
return {
tone,
chipLabel,
title: accountActionMsg,
detail: "",
support: "",
liveMode: busy ? "assertive" : "polite",
};
}, [accountActionBusy, accountActionMsg, accountActionTone]);
const settingsDiagnosticsFlag = typeof window !== "undefined"
? safeStorageGet(localStorage, "trainer_staff_diagnostics", "0")
: "0";
 const {
 activeSettingsSurface,
 setActiveSettingsSurface,
 lifecycleSummaryCards,
 showProtectedDiagnostics,
 } = useSettingsScreenState({
 focusSection,
 authEmail: authSession?.user?.email || "",
 debugMode,
 diagnosticsHostname: operatorHostname,
 storageReason: storageStatus?.reason || "",
 syncStateModel,
 diagnosticsLocationSearch: typeof window !== "undefined" ? window.location.search : "",
 storedDiagnosticsFlag: settingsDiagnosticsFlag,
 onTrackFrictionEvent,
 });
const adaptiveDiagnosticsModel = useMemo(() => {
 if (!showProtectedDiagnostics || !showInternalSettingsTools) return { visible: false };
 return buildAdaptiveDiagnosticsPanelModel({
  personalization,
  adaptiveLearningSnapshot,
  planComposer,
  trustedLocalDebug: true,
 });
}, [adaptiveLearningSnapshot, personalization, planComposer, showInternalSettingsTools, showProtectedDiagnostics]);
 const appendDebugDetail = (message = "", detail = "") => {
 const base = String(message || "").trim();
 const extra = String(detail || "").trim();
 if (!base || !debugMode || !extra || base.includes(extra)) return base;
 return `${base} (${extra})`;
 };
 const {
 deleteDiagnostics,
 refreshDeleteDiagnostics,
 } = useLazySettingsDeleteDiagnostics({
 activeSettingsSurface,
 authAccessToken: authSession?.access_token || "",
 authEmail: authSession?.user?.email || "",
 onTrackFrictionEvent,
 });
 const deleteAccountHelpText = buildDeleteAccountHelpText(deleteDiagnostics);
 const integrationStateTone = (state = "idle") => {
 if (state === "operational") return { color: C.green, bg: `${C.green}14` };
 if (state === "pending") return { color: C.blue, bg: `${C.blue}14` };
 if (state === "manual") return { color: C.amber, bg: `${C.amber}14` };
 if (state === "simulated") return { color: C.purple, bg: `${C.purple}14` };
 return { color: "#8fa5c8", bg: "rgba(143,165,200,0.12)" };
 };
const appleMode = appleHealth?.connectionMode
 || (appleHealth?.status === "simulated_web" ? "simulated" : appleHealth?.status === "manual_import" ? "manual_import" : appleHealth?.status === "connected" ? "live" : "unavailable");
 const appleIntegration = (() => {
 if (appleMode === "live" && appleHealth?.lastSyncStatus === "garmin_detected") {
 return {
 state: "operational",
 label: "Recent data found",
 summary: "Apple Health permission was requested, and recent Garmin-origin workouts were found here.",
 detail: `Last recorded check: ${formatIntegrationTimestamp(appleHealth?.lastConnectionCheck)}.`,
 };
 }
 if (appleMode === "live") {
 return {
 state: "pending",
 label: "Connected, awaiting verification",
 summary: appleHealth?.lastSyncStatus === "health_only"
 ? "Recent Apple Health workouts were found, but Garmin-origin entries were not confirmed here yet."
 : "Apple Health permission was requested, but recent workout data has not been confirmed here yet.",
 detail: `Last recorded check: ${formatIntegrationTimestamp(appleHealth?.lastConnectionCheck)}.`,
 };
 }
 if (appleMode === "manual_import") {
 return {
 state: "manual",
 label: "Manual import only",
 summary: "Apple Health data exists from a manual JSON import, not from a live device permission flow.",
 detail: `Imported: ${formatIntegrationTimestamp(appleHealth?.importedAt)}.`,
 };
 }
 if (appleMode === "simulated") {
 return {
 state: "simulated",
 label: "Simulated on web",
 summary: "This web environment is using a simulated Apple Health placeholder, not a real device link.",
 detail: "A real Apple Health permission flow needs an iPhone-capable environment.",
 };
 }
 if (appleHealth?.skipped) {
 return {
 state: "unavailable",
 label: "Not enabled",
 summary: "Apple Health has been skipped or not enabled yet.",
 detail: "No Apple Health data is being used right now.",
 };
 }
 return {
 state: "unavailable",
 label: "Not configured",
 summary: "Apple Health is not connected.",
 detail: "No Apple Health permission state or manual import is active.",
 };
 })();
 const garminMode = garmin?.connectionMode || (garmin?.status === "manual_import" ? "manual_import" : garmin?.status === "connected" ? "live" : "unavailable");
 const garminIntegration = (() => {
 if (garminMode === "live" && garmin?.lastSyncAt && (garmin?.activities || []).length > 0) {
 return {
 state: "operational",
 label: "Recent sync found",
 summary: "Garmin authorization exists, and recent activities were pulled through the server-side connection.",
 detail: `Last sync: ${garminLastSyncLabel}.`,
 };
 }
 if (garminMode === "live") {
 return {
 state: "pending",
 label: "Connected, never synced",
 summary: "Garmin authorization exists, but no completed sync has been recorded yet.",
 detail: `Last sync: ${garminLastSyncLabel}.`,
 };
 }
 if (garminMode === "manual_import") {
 return {
 state: "manual",
 label: "Manual import only",
 summary: "Garmin activity data came from a manual import, not from the server-side connection.",
 detail: `Imported: ${formatIntegrationTimestamp(garmin?.importedAt)}.`,
 };
 }
 return {
 state: "unavailable",
 label: "Not configured",
 summary: "Garmin Connect is not configured.",
 detail: "No live authorization or manual import is active.",
 };
 })();
 const locationIntegration = (() => {
 const status = personalization?.localFoodContext?.locationStatus || personalization?.connectedDevices?.location?.status || "unknown";
 if (status === "granted") {
 return {
 state: "operational",
 label: "Permission granted",
 summary: "Location permission was granted for travel context and local nutrition suggestions.",
 };
 }
 if (status === "denied") {
 return {
 state: "unavailable",
 label: "Permission denied",
 summary: "Location access was denied, so travel/location context stays manual.",
 };
 }
 if (status === "unavailable") {
 return {
 state: "unavailable",
 label: "Unavailable here",
 summary: "Location services are unavailable in this environment.",
 };
 }
 return {
 state: "unavailable",
 label: "Not enabled",
 summary: "Location access is not enabled.",
 };
 })();

 const checkConnection = async () => {
 setChecking(true);
 try {
 if (appleMode === "manual_import") {
 setCheckMsg("Manual Apple Health imports do not verify a live Apple Health connection.");
 return;
 }
 const workouts = appleHealth?.workouts || {};
 const cutoff = Date.now() - (7 * 86400000);
 const recent = Object.entries(workouts).filter(([date]) => new Date(`${date}T12:00:00`).getTime() >= cutoff);
 const hasGarmin = recent.some(([, w]) => /garmin/i.test(String(w?.source || w?.device || "")));
 const msg = recent.length === 0
 ? "No Apple Health workouts found in last 7 days."
 : hasGarmin
 ? `Recent Apple Health data found: ${recent.length} workouts, including Garmin-origin sessions.`
 : `Recent Apple Health data found: ${recent.length} workouts, but Garmin-origin sessions were not detected.`;
 setCheckMsg(msg);
 await persistAppleHealth({ lastConnectionCheck: Date.now(), lastSyncStatus: hasGarmin ? "garmin_detected" : "health_only" });
 } finally {
 setChecking(false);
 }
 };
 const importDeviceData = async (provider = "apple") => {
 try {
 const raw = provider === "apple" ? appleImportText : garminImportText;
 const parsed = JSON.parse(raw || "{}");
 if (provider === "apple") {
 const workouts = Array.isArray(parsed)
 ? Object.fromEntries(parsed.map((w, idx) => [w?.date || w?.startDate || `${new Date().toISOString().split("T")[0]}_${idx}`, w]))
 : (parsed?.workouts || {});
 await persistAppleHealth({
 status: "manual_import",
 connectionMode: "manual_import",
 workouts,
 importedAt: Date.now(),
 lastSyncStatus: Object.keys(workouts || {}).length > 0 ? "health_only" : (appleHealth?.lastSyncStatus || "connected"),
 });
 setImportMsg(`Imported ${Object.keys(workouts || {}).length} Apple Health workout entries.`);
 } else {
 const activities = Array.isArray(parsed) ? parsed : (parsed?.activities || []);
 const dailySummaries = parsed?.dailySummaries || garmin?.dailySummaries || {};
 const nextGarmin = {
 ...garmin,
 status: "manual_import",
 connectionMode: "manual_import",
 activities,
 dailySummaries,
 trainingReadinessScore: Number(parsed?.trainingReadinessScore ?? garmin?.trainingReadinessScore ?? 0) || garmin?.trainingReadinessScore || null,
 importedAt: Date.now(),
 lastApiStatus: "ok",
 };
 const next = mergePersonalization(personalization, { connectedDevices: { ...(personalization?.connectedDevices || {}), garmin: nextGarmin } });
 setPersonalization(next);
 await onPersist(next);
 setImportMsg(`Imported ${activities.length} Garmin activities.`);
 }
 } catch (e) {
 setImportMsg(`Import failed: ${e?.message || "invalid JSON"}`);
 }
 };
 const requestLocationAccess = async () => {
 if (!(typeof navigator !== "undefined" && navigator?.geolocation?.getCurrentPosition)) {
 const next = mergePersonalization(personalization, {
 localFoodContext: {
 ...(personalization?.localFoodContext || {}),
 locationPermissionGranted: false,
 locationStatus: "unavailable",
 locationLabel: personalization?.localFoodContext?.locationLabel || personalization?.localFoodContext?.city || "Saved city only",
 lastUpdatedAt: Date.now(),
 },
 });
 setPersonalization(next);
 await onPersist(next);
 setLocationMsg("Location services are unavailable in this browser.");
 return;
 }
 navigator.geolocation.getCurrentPosition(async (position) => {
 const fallbackLocationLabel = personalization?.localFoodContext?.city || personalization?.localFoodContext?.locationLabel || "Nearby area";
 const next = mergePersonalization(personalization, {
 connectedDevices: {
 ...(personalization?.connectedDevices || {}),
 location: {
 status: "granted",
 lat: Number(position?.coords?.latitude || 0),
 lng: Number(position?.coords?.longitude || 0),
 accuracyM: Number(position?.coords?.accuracy || 0),
 updatedAt: Date.now(),
 source: "ios_geolocation",
 },
 },
 localFoodContext: {
 ...(personalization?.localFoodContext || {}),
 city: personalization?.localFoodContext?.city || fallbackLocationLabel,
 locationPermissionGranted: true,
 locationStatus: "granted",
 locationLabel: fallbackLocationLabel,
 lastKnownLat: Number(position?.coords?.latitude || 0),
 lastKnownLng: Number(position?.coords?.longitude || 0),
 lastUpdatedAt: Date.now(),
 },
 });
 setPersonalization(next);
 await onPersist(next);
 setLocationMsg("Location permission granted and saved.");
 }, async (err) => {
 const next = mergePersonalization(personalization, {
 connectedDevices: {
 ...(personalization?.connectedDevices || {}),
 location: { status: "denied", error: err?.message || "permission_denied", updatedAt: Date.now() },
 },
 localFoodContext: {
 ...(personalization?.localFoodContext || {}),
 locationPermissionGranted: false,
 locationStatus: "denied",
 locationLabel: personalization?.localFoodContext?.locationLabel || personalization?.localFoodContext?.city || "",
 lastUpdatedAt: Date.now(),
 },
 });
 setPersonalization(next);
 await onPersist(next);
 setLocationMsg(sanitizeDisplayText("Location permission denied. Enable it in iPhone Settings ? Privacy & Security ? Location Services."));
 }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
 };
 const handleCopyBackup = async () => {
 const payload = exportData();
 try {
 await navigator.clipboard.writeText(payload);
 setBackupMsg("Copied");
 setTimeout(() => setBackupMsg(""), 2000);
 } catch {
 setBackupCode(payload);
 setBackupMsg("Unable to copy automatically");
 }
 };

const patchNutritionPreferences = async (patch = {}) => {
const startedAt = Date.now();
 const nextNutritionPreferenceState = {
  ...(personalization?.nutritionPreferenceState || DEFAULT_PERSONALIZATION.nutritionPreferenceState),
  ...(patch || {}),
 };
 const next = mergePersonalization(personalization, {
  nutritionPreferenceState: nextNutritionPreferenceState,
 });
 setPersonalization(next);
 beginSettingsSave("Saving your nutrition preferences.");
 try {
 await onPersist(next);
 finishSettingsSave("Your nutrition preferences are up to date.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "nutrition_preferences_save",
 outcome: "success",
 props: {
  duration_ms: Date.now() - startedAt,
 },
 });
 } catch (error) {
 failSettingsSave("Nutrition preferences did not save. Try again.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "nutrition_preferences_save",
 outcome: "error",
 props: {
  duration_ms: Date.now() - startedAt,
  error_code: String(error?.message || "nutrition_preferences_save_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 }
};
 const buildPlanHistoryReportMarkdown = (generatedAt = new Date().toISOString()) => renderPlanEvolutionExportMarkdown(buildPlanEvolutionExport({
 title: "Plan History Reviewer Report",
 generatedAt,
 reviews: planHistoryReviews,
 weekSummaries: planHistoryWeekSummaries,
 }));
 const handleGeneratePlanHistoryReport = () => {
 const generatedAt = new Date().toISOString();
 setPlanHistoryReportMarkdown(buildPlanHistoryReportMarkdown(generatedAt));
 setPlanHistoryReportMsg(`Generated ${new Date(generatedAt).toLocaleString()}`);
 };
 const handleCopyPlanHistoryReport = async () => {
 const generatedAt = new Date().toISOString();
 const markdown = planHistoryReportMarkdown || buildPlanHistoryReportMarkdown(generatedAt);
 if (!planHistoryReportMarkdown) {
 setPlanHistoryReportMarkdown(markdown);
 }
 try {
 await navigator.clipboard.writeText(markdown);
setPlanHistoryReportMsg("Copied plan history export.");
 } catch {
 setPlanHistoryReportMsg("Unable to copy automatically. The report stays visible below.");
 }
 };
 const handleRestoreRequest = () => {
 const raw = String(backupCode || "").trim();
 if (!raw) {
 setBackupMsg("Invalid backup code");
 return;
 }
 try {
 JSON.parse(decodeURIComponent(escape(atob(raw))));
 setPendingRestoreCode(raw);
 setBackupMsg("");
 setShowRestoreConfirm(true);
 } catch {
 setBackupMsg("Invalid backup code");
 }
 };
 const confirmRestore = async () => {
 const ok = await importData(pendingRestoreCode);
 if (!ok) {
 setBackupMsg("Invalid backup code");
 setShowRestoreConfirm(false);
 setPendingRestoreCode("");
 return;
 }
 setBackupCode("");
 setBackupMsg("");
 setPendingRestoreCode("");
 setShowRestoreConfirm(false);
 };
 useEffect(() => {
 if (typeof window === "undefined") return;
 const params = new URLSearchParams(window.location.search);
 const status = params.get("garmin_status");
 const message = params.get("garmin_message");
 const fix = params.get("garmin_fix");
 if (!status && !message && !fix) return;
 setGarminMsg(message || (status === "connected" ? "Garmin connected." : "Garmin returned with a status update."));
 setGarminFix(fix || "");
 params.delete("garmin_status");
 params.delete("garmin_message");
 params.delete("garmin_fix");
 params.delete("tab");
 const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
 window.history.replaceState({}, "", nextUrl);
 }, []);
 useEffect(() => {
 if (!selectedSettingsProgramId && programDefinitions?.[0]?.id) setSelectedSettingsProgramId(programDefinitions[0].id);
 }, [programDefinitions, selectedSettingsProgramId]);
 useEffect(() => {
 if (!selectedSettingsStyleId && styleDefinitions?.[0]?.id) setSelectedSettingsStyleId(styleDefinitions[0].id);
 }, [styleDefinitions, selectedSettingsStyleId]);
 useEffect(() => {
 setCoachMemoryDraft({
 failurePatterns: (coachMemory.failurePatterns || []).join(", "),
 commonBarriers: (coachMemory.commonBarriers || []).join(", "),
 simplicityVsVariety: coachMemory.simplicityVsVariety || "",
 preferredFoodPatterns: (coachMemory.preferredFoodPatterns || []).join(", "),
 });
 }, [
 coachMemory.failurePatterns,
 coachMemory.commonBarriers,
 coachMemory.simplicityVsVariety,
 coachMemory.preferredFoodPatterns,
 ]);
 useEffect(() => {
 setAccountProfileDraft(buildAccountProfileDraft());
 }, [
 profile?.name,
 profileTimezoneVal,
 profileAgeVal,
 profileHeightVal,
 profileWeightVal,
 profile?.trainingAgeYears,
 unitSettings?.weight,
 unitSettings?.height,
 unitSettings?.distance,
 ]);
const saveCoachSetup = async () => {
 const updated = mergePersonalization(personalization, {
 coachMemory: {
 ...(personalization?.coachMemory || {}),
 failurePatterns: coachMemoryDraft.failurePatterns.split(",").map((item) => item.trim()).filter(Boolean),
 commonBarriers: coachMemoryDraft.commonBarriers.split(",").map((item) => item.trim()).filter(Boolean),
 preferredFoodPatterns: coachMemoryDraft.preferredFoodPatterns.split(",").map((item) => item.trim()).filter(Boolean),
 simplicityVsVariety: coachMemoryDraft.simplicityVsVariety || "",
 },
 });
 setPersonalization(updated);
 if (allowClientSuppliedAiKey && typeof window !== "undefined") safeStorageSet(localStorage, "coach_api_key", coachApiKey || "");
 beginSettingsSave("Saving your coach setup.");
 try {
 await onPersist(updated);
 finishSettingsSave("Coach setup is up to date.");
 } catch {
 failSettingsSave("Coach setup did not save. Try again.");
 }
};
 const commitSettingsProgramsState = async (nextProgramsState, notice = "") => {
 setPlanManagementError("");
 setPlanManagementNotice(notice);
 await saveProgramSelection(nextProgramsState);
 };
 const handleSettingsActivateProgram = async () => {
 if (!selectedSettingsProgramDefinition?.id) return;
 if (settingsProgramCompatibility?.outcome === COMPATIBILITY_OUTCOMES.incompatible) {
 setPlanManagementNotice("");
 setPlanManagementError(settingsProgramCompatibility?.blockedConstraints?.[0] || settingsProgramCompatibility?.reasons?.[0] || "This program is not a clean fit right now.");
 return;
 }
 const nowIso = new Date().toISOString();
 const nextProgramInstance = createProgramInstance({
 programDefinition: selectedSettingsProgramDefinition,
 userId: "local",
 fidelityMode: selectedSettingsProgramFidelityMode,
 compatibilityAssessment: settingsProgramCompatibility,
 athleteProfile,
 activationDate: nowIso,
 });
 const nextStyleSelection = selectedSettingsProgramFidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle
 ? null
 : programsState?.activeStyleSelection || null;
 const nextHistoryEntry = buildProgramSelectionHistoryEntry({
 action: programsState?.activeProgramInstance ? "replaced_program" : "activated_program",
 programDefinition: selectedSettingsProgramDefinition,
 fidelityMode: selectedSettingsProgramFidelityMode,
 reason: settingsProgramCompatibility?.reasons?.[0] || buildCompatibilityHeadline(settingsProgramCompatibility),
 createdAt: nowIso,
 });
 await commitSettingsProgramsState({
 ...programsState,
 activeProgramInstance: nextProgramInstance,
 activeStyleSelection: nextStyleSelection,
 lastCompatibilityAssessment: settingsProgramCompatibility,
 planBasisExplanation: buildPlanBasisExplanation({
 athleteProfile,
 activeProgramInstance: nextProgramInstance,
 activeStyleSelection: nextStyleSelection,
 programDefinition: selectedSettingsProgramDefinition,
 styleDefinition: selectedSettingsProgramFidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle ? null : activeStyleDefinition,
 compatibilityAssessment: settingsProgramCompatibility,
 }),
 selectionHistory: [nextHistoryEntry, ...(programsState?.selectionHistory || [])].slice(0, 20),
}, `${selectedSettingsProgramDefinition.displayName} is now your active plan layer.`);
 };
 const handleSettingsActivateStyle = async () => {
 if (!selectedSettingsStyleDefinition?.id) return;
 if (settingsStyleCompatibility?.outcome === COMPATIBILITY_OUTCOMES.incompatible) {
 setPlanManagementNotice("");
setPlanManagementError(settingsStyleCompatibility?.blockedConstraints?.[0] || settingsStyleCompatibility?.reasons?.[0] || "This style does not fit your current plan.");
 return;
 }
 const nowIso = new Date().toISOString();
 const nextStyleSelection = createStyleSelection({
 styleDefinition: selectedSettingsStyleDefinition,
 userId: "local",
 compatibleWithCurrentPlan: settingsStyleCompatibility?.outcome !== COMPATIBILITY_OUTCOMES.incompatible,
 influenceLevel: STYLE_INFLUENCE_LEVELS.standard,
 activationDate: nowIso,
 });
 const nextHistoryEntry = buildProgramSelectionHistoryEntry({
 action: programsState?.activeStyleSelection ? "replaced_style" : "activated_style",
 styleDefinition: selectedSettingsStyleDefinition,
 reason: settingsStyleCompatibility?.reasons?.[0] || buildCompatibilityHeadline(settingsStyleCompatibility),
 createdAt: nowIso,
 });
 await commitSettingsProgramsState({
 ...programsState,
 activeStyleSelection: nextStyleSelection,
 lastCompatibilityAssessment: settingsStyleCompatibility,
 planBasisExplanation: buildPlanBasisExplanation({
 athleteProfile,
 activeProgramInstance: programsState?.activeProgramInstance || null,
 activeStyleSelection: nextStyleSelection,
 programDefinition: activeProgramDefinition,
 styleDefinition: selectedSettingsStyleDefinition,
 compatibilityAssessment: settingsStyleCompatibility,
 }),
 selectionHistory: [nextHistoryEntry, ...(programsState?.selectionHistory || [])].slice(0, 20),
 }, `${selectedSettingsStyleDefinition.displayName} is now the active style layer.`);
 };
 const handleSettingsClearProgramLayer = async () => {
 if (!programsState?.activeProgramInstance && !programsState?.activeStyleSelection) return;
 const nowIso = new Date().toISOString();
 const nextHistoryEntry = buildProgramSelectionHistoryEntry({
 action: "cleared_basis",
 programDefinition: activeProgramDefinition,
 styleDefinition: activeStyleDefinition,
 fidelityMode: programsState?.activeProgramInstance?.fidelityMode || "",
    reason: "Returned to FORMA's built-for-you plan.",
 createdAt: nowIso,
 });
 await commitSettingsProgramsState({
 ...programsState,
 activeProgramInstance: null,
 activeStyleSelection: null,
 lastCompatibilityAssessment: null,
 planBasisExplanation: buildPlanBasisExplanation({
 athleteProfile,
 activeProgramInstance: null,
 activeStyleSelection: null,
 programDefinition: null,
 styleDefinition: null,
 compatibilityAssessment: null,
 }),
 selectionHistory: [nextHistoryEntry, ...(programsState?.selectionHistory || [])].slice(0, 20),
}, "Program and style removed. FORMA is back to building your plan around your goals and routine.");
 };
 const handleSettingsGoalPreview = async () => {
 const cleanGoalText = sanitizeIntakeText(goalChangeIntent || "");
 if (!cleanGoalText) {
 setGoalChangeError("Add the goal in plain English first.");
 setGoalChangePreview(null);
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_preview",
 outcome: "blocked",
 props: {
 mode: goalChangeMode,
 },
 });
 return;
 }
 const startedAt = Date.now();
 setGoalChangePreviewing(true);
 setGoalChangeError("");
 setGoalChangeNotice("");
 try {
 const preview = await previewGoalChange({
 rawGoalText: cleanGoalText,
 changeMode: goalChangeMode,
 });
 if (!preview?.orderedResolvedGoals?.length) {
 setGoalChangeError("Preview could not resolve a clean priority order.");
 setGoalChangePreview(null);
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_preview",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 mode: goalChangeMode,
 },
 });
 } else {
 setGoalChangePreview(preview);
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_preview",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 mode: goalChangeMode,
 resolved_goal_count: preview.orderedResolvedGoals.length,
 },
 });
 }
 } catch (error) {
 setGoalChangeError(error?.message || "Goal preview failed.");
 setGoalChangePreview(null);
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_preview",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 mode: goalChangeMode,
 error_code: String(error?.message || "goal_preview_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 } finally {
 setGoalChangePreviewing(false);
 }
 };
 const handleSettingsGoalApply = async () => {
 if (!goalChangePreview?.orderedResolvedGoals?.length) {
 setGoalChangeError("Preview the goal change before confirming it.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_apply",
 outcome: "blocked",
 props: {
 mode: goalChangeMode,
 },
 });
 return;
 }
 const startedAt = Date.now();
 setGoalChangeApplying(true);
 setGoalChangeError("");
 setGoalChangeNotice("");
 try {
 const result = await applyGoalChange({
 rawGoalText: goalChangeIntent,
 changeMode: goalChangeMode,
 previewBundle: goalChangePreview,
 });
 if (!result?.ok) {
 setGoalChangeError(result?.error || "Goal change could not be applied.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_apply",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 mode: goalChangeMode,
 error_code: String(result?.error || "goal_apply_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 return;
 }
 setGoalChangeNotice(`${goalChangePreview?.modeMeta?.label || "Goal change"} applied.`);
 setGoalChangeIntent("");
 setGoalChangePreview(null);
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_apply",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 mode: goalChangeMode,
 resolved_goal_count: goalChangePreview?.orderedResolvedGoals?.length || 0,
 },
 });
 } catch (error) {
 setGoalChangeError(error?.message || "Goal change could not be applied.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "experimental_goal_apply",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 mode: goalChangeMode,
 error_code: String(error?.message || "goal_apply_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 } finally {
 setGoalChangeApplying(false);
 }
 };
 const resolveManagedGoalId = (goal = null) => String(
 goal?.goalRecordId
 || goal?.goalManagement?.recordId
 || goal?.resolvedGoal?.id
 || goal?.id
 || ""
 ).trim();
 const findCurrentManagedGoal = (goalId = "") => (
 (goals || []).find((goal) => resolveManagedGoalId(goal) === String(goalId || "").trim()) || null
 );
 const findArchivedManagedGoal = (goalId = "") => (
 (personalization?.goalManagement?.archivedGoals || []).find((goal) => resolveManagedGoalId(goal) === String(goalId || "").trim()) || null
 );
 const resetGoalManagementWorkflow = () => {
 setGoalManagementPreview(null);
 setGoalManagementError("");
 setGoalManagementNotice("");
 };
 const closeGoalEditor = () => {
 setGoalEditorOpen(false);
 setGoalEditorMode("edit");
 setGoalEditorDraft(null);
 setGoalEditorLibraryCategory("all");
 setGoalEditorLibrarySearch("");
 setShowGoalEditorCustomInput(false);
 resetGoalManagementWorkflow();
 };
 const closeGoalArchive = () => {
 setGoalArchiveOpen(false);
 setGoalArchiveDraft({ goalId: "", archiveStatus: GOAL_ARCHIVE_STATUSES.archived });
 resetGoalManagementWorkflow();
 };
 const openGoalEditor = (goalId = "") => {
 const goal = findCurrentManagedGoal(goalId);
 if (!goal) return;
 const draft = buildGoalEditorDraft({ goal });
 setGoalEditorMode("edit");
 setGoalEditorDraft(draft);
 setGoalEditorLibraryCategory(inferGoalTemplateCategoryIdForDraft(draft));
 setGoalEditorLibrarySearch("");
 setShowGoalEditorCustomInput(draft?.entryMode === "custom");
 setGoalEditorOpen(true);
 setGoalArchiveOpen(false);
 resetGoalManagementWorkflow();
 };
 const openNewGoalEditor = () => {
 const draft = buildGoalEditorDraft({ goal: null });
 setGoalEditorMode("add");
 setGoalEditorDraft(draft);
 setGoalEditorLibraryCategory("all");
 setGoalEditorLibrarySearch("");
 setShowGoalEditorCustomInput(false);
 setGoalEditorOpen(true);
 setGoalArchiveOpen(false);
 resetGoalManagementWorkflow();
 };
 const openGoalArchive = (goalId = "", defaultStatus = GOAL_ARCHIVE_STATUSES.archived) => {
 const goal = findCurrentManagedGoal(goalId);
 if (!goal) return;
 setGoalArchiveDraft({
 goalId,
 archiveStatus: defaultStatus,
 });
 setGoalArchiveOpen(true);
 setGoalEditorOpen(false);
 resetGoalManagementWorkflow();
 };
 const selectGoalEditorTemplate = (templateId = "") => {
 const selection = buildGoalTemplateSelection({ templateId });
 if (!selection) return;
 setShowGoalEditorCustomInput(false);
 setGoalEditorDraft((current) => applyGoalTemplateSelectionToDraft({
 draft: current || buildGoalEditorDraft({ goal: null }),
 selection,
 }));
 };
 const moveGoalInSettingsOrder = (goalId = "", direction = -1) => {
 const cleanGoalId = String(goalId || "").trim();
 if (!cleanGoalId) return;
 setGoalOrderDraftIds((current) => {
 const ids = Array.isArray(current) && current.length
 ? [...current]
 : [...(goalSettingsModel?.currentGoalOrder || [])];
 const currentIndex = ids.indexOf(cleanGoalId);
 if (currentIndex < 0) return ids;
 const nextIndex = direction < 0
 ? Math.max(0, currentIndex - 1)
 : Math.min(ids.length - 1, currentIndex + 1);
 if (nextIndex === currentIndex) return ids;
 const nextIds = [...ids];
 const [moved] = nextIds.splice(currentIndex, 1);
 nextIds.splice(nextIndex, 0, moved);
 return nextIds;
 });
 resetGoalManagementWorkflow();
 };
 const resetGoalOrderDraft = () => {
 setGoalOrderDraftIds(goalSettingsModel?.currentGoalOrder || []);
 resetGoalManagementWorkflow();
 };
 const handleGoalManagementPreview = async (change) => {
 const startedAt = Date.now();
 setGoalManagementBusy(true);
 setGoalManagementError("");
 setGoalManagementNotice("");
 try {
 const preview = await previewGoalManagementChange({ change });
 if (!preview?.nextGoals?.length) {
 setGoalManagementError("Preview could not build a clean active priority order.");
 setGoalManagementPreview(null);
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_preview",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 change_type: change?.type || "unknown",
 },
 });
 return null;
 }
 setGoalManagementPreview(preview);
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_preview",
 outcome: "requested",
 props: {
 duration_ms: Date.now() - startedAt,
 change_type: change?.type || "unknown",
 next_goal_count: preview.nextGoals.length,
 },
 });
 return preview;
 } catch (error) {
 setGoalManagementError(error?.message || "Goal preview failed.");
 setGoalManagementPreview(null);
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_preview",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 change_type: change?.type || "unknown",
 error_code: String(error?.message || "goal_preview_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 return null;
 } finally {
 setGoalManagementBusy(false);
 }
 };
 const handlePreviewGoalReprioritization = async () => {
 const currentOrder = goalSettingsModel?.currentGoalOrder || [];
 const draftOrder = Array.isArray(goalOrderDraftIds) ? goalOrderDraftIds : [];
 if (!draftOrder.length || currentOrder.join("|") === draftOrder.join("|")) {
 setGoalManagementError("Move at least one goal before previewing impact.");
 return;
 }
 await handleGoalManagementPreview({
 type: GOAL_MANAGEMENT_CHANGE_TYPES.reprioritize,
 orderedGoalIds: draftOrder,
 });
 };
 const handlePreviewGoalEdit = async () => {
 const hasTemplateSelection = Boolean(goalEditorDraft?.templateId);
 const hasCustomSelection = showGoalEditorCustomInput && Boolean(String(goalEditorDraft?.summary || goalEditorDraft?.selectionGoalText || "").trim());
 if (!hasTemplateSelection && !hasCustomSelection && goalEditorMode === "add") {
 setGoalManagementError("Pick a goal path first, or write a custom goal.");
 return;
 }
 if (goalEditorMode !== "add" && !goalEditorDraft?.goalId) {
 setGoalManagementError("Pick a goal to edit first.");
 return;
 }
 const preview = await handleGoalManagementPreview({
 type: goalEditorMode === "add" ? GOAL_MANAGEMENT_CHANGE_TYPES.add : GOAL_MANAGEMENT_CHANGE_TYPES.edit,
 goalId: goalEditorMode === "add" ? "" : goalEditorDraft.goalId,
 draft: goalEditorDraft,
 });
 if (preview) setGoalEditorOpen(false);
 };
 const handlePreviewGoalArchive = async () => {
 if (!goalArchiveDraft?.goalId) {
 setGoalManagementError("Pick a goal to move first.");
 return;
 }
 const preview = await handleGoalManagementPreview({
 type: GOAL_MANAGEMENT_CHANGE_TYPES.archive,
 goalId: goalArchiveDraft.goalId,
 archiveStatus: goalArchiveDraft.archiveStatus,
 });
 if (preview) setGoalArchiveOpen(false);
 };
 const handlePreviewGoalRestore = async (goalId = "") => {
 const archivedGoal = findArchivedManagedGoal(goalId);
 if (!archivedGoal) {
 setGoalManagementError("That inactive goal could not be found.");
 return;
 }
 await handleGoalManagementPreview({
 type: GOAL_MANAGEMENT_CHANGE_TYPES.restore,
 goalId,
 });
 };
 const handleApplyGoalManagement = async () => {
 if (!goalManagementPreview?.nextGoals?.length) {
setGoalManagementError("See the change first, then save it.");
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_apply",
 outcome: "blocked",
 props: {
 change_type: goalManagementPreview?.changeType || "unknown",
 },
 });
 return;
 }
 const startedAt = Date.now();
 setGoalManagementBusy(true);
 setGoalManagementError("");
 setGoalManagementNotice("");
 try {
 const result = await applyGoalManagementChange({
 previewBundle: goalManagementPreview,
 });
 if (!result?.ok) {
 setGoalManagementError(result?.error || "Goal update could not be applied.");
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_apply",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 change_type: goalManagementPreview?.changeType || "unknown",
 error_code: String(result?.error || "goal_update_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 return;
 }
 setGoalManagementNotice(`${goalManagementPreview?.changeLabel || "Goal update"} applied.`);
 setGoalManagementPreview(null);
 setGoalEditorOpen(false);
 setGoalEditorMode("edit");
 setGoalEditorDraft(null);
 setGoalEditorLibraryCategory("all");
 setGoalEditorLibrarySearch("");
 setShowGoalEditorCustomInput(false);
 setGoalArchiveOpen(false);
 setGoalArchiveDraft({ goalId: "", archiveStatus: GOAL_ARCHIVE_STATUSES.archived });
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_apply",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 change_type: goalManagementPreview?.changeType || "unknown",
 next_goal_count: goalManagementPreview?.nextGoals?.length || 0,
 },
 });
 } catch (error) {
 setGoalManagementError(error?.message || "Goal update could not be applied.");
 onTrackFrictionEvent({
 flow: "goals",
 action: "management_apply",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 change_type: goalManagementPreview?.changeType || "unknown",
 error_code: String(error?.message || "goal_update_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
 },
 });
 } finally {
 setGoalManagementBusy(false);
 }
 };
 const handleReloadCloud = async () => {
 const startedAt = Date.now();
 setAccountActionBusy("reload");
 setAccountActionMsg("");
 try {
 await onReloadCloudData?.();
 setSettingsSaveMsg("Reloaded cloud data.");
 setAccountActionTone("success");
 setAccountActionMsg("Cloud data was reloaded for the signed-in account.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "reload_cloud",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 },
 });
 } catch (error) {
 const reloadFailureMessage = appendDebugDetail(
 "Cloud data could not be reloaded right now. This device is still using its saved local copy.",
 error?.message || ""
 );
 setSettingsSaveMsg(reloadFailureMessage);
 setAccountActionTone("warn");
 setAccountActionMsg(reloadFailureMessage);
 onTrackFrictionEvent({
 flow: "settings",
 action: "reload_cloud",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 error_code: getDiagnosticsCode(error, "reload_cloud_failed"),
 },
 });
 } finally {
 setAccountActionBusy("");
 }
 };
 const handleLifecycleSignOut = async () => {
 setAccountActionBusy("logout");
 setAccountActionTone("neutral");
 setAccountActionMsg("Signing out now. Local data stays on this device unless you explicitly reset it.");
 onTrackFrictionEvent({
 flow: "settings",
 action: "sign_out",
 outcome: "requested",
 props: {
 surface: "account",
 },
 });
 onLogout?.();
 setDeleteOpen(false);
 setResetDeviceOpen(false);
 setDeleteConfirm("");
 setResetDeviceConfirm("");
 setAccountActionBusy("");
 };
 const handleResetDeviceSubmit = async () => {
 const startedAt = Date.now();
 setAccountActionBusy("reset_device");
 setAccountActionTone("warn");
 setAccountActionMsg("Resetting this device now. Cloud account state is unchanged.");
 try {
 await onResetThisDevice?.();
 setResetDeviceOpen(false);
 setResetDeviceConfirm("");
 setDeleteOpen(false);
 setDeleteConfirm("");
 onTrackFrictionEvent({
 flow: "settings",
 action: "reset_device",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 },
 });
 } finally {
 setAccountActionBusy("");
 }
 };
 const handleDeleteAccountSubmit = async () => {
 const startedAt = Date.now();
 setAccountActionBusy("delete_account");
 setAccountActionMsg("");
 const latestDiagnostics = deleteDiagnostics?.checked ? { ok: true, diagnostics: deleteDiagnostics } : await refreshDeleteDiagnostics();
 const deleteSupported = latestDiagnostics?.diagnostics?.configured === true;
 if (!deleteSupported) {
 setAccountActionTone("warn");
 setAccountActionMsg(appendDebugDetail(
 "Permanent delete is not available here yet. You can still sign out or reset this device.",
 latestDiagnostics?.diagnostics?.fix || latestDiagnostics?.diagnostics?.message || ""
 ));
 onTrackFrictionEvent({
 flow: "settings",
 action: "delete_account",
 outcome: "blocked",
 props: {
 duration_ms: Date.now() - startedAt,
 missing_count: latestDiagnostics?.diagnostics?.missing?.length || 0,
 },
 });
 setAccountActionBusy("");
 return;
 }
 try {
 const result = await onDeleteAccount?.();
 if (!result?.ok) {
 setAccountActionTone("warn");
 setAccountActionMsg(appendDebugDetail(
 result?.error?.userMessage || "Account deletion could not finish right now.",
 result?.error?.diagnosticsCode || result?.error?.fix || ""
 ));
 onTrackFrictionEvent({
 flow: "settings",
 action: "delete_account",
 outcome: "error",
 props: {
 duration_ms: Date.now() - startedAt,
 error_code: getDiagnosticsCode(result?.error, "delete_account_failed"),
 },
 });
 return;
 }
 setAccountActionTone("success");
 setAccountActionMsg("Account deleted. Local cache and signed-in identity were removed from this device.");
 setDeleteOpen(false);
 setDeleteConfirm("");
 onTrackFrictionEvent({
 flow: "settings",
 action: "delete_account",
 outcome: "success",
 props: {
 duration_ms: Date.now() - startedAt,
 },
 });
 } finally {
 setAccountActionBusy("");
 }
 };
 const handleToggleResetDevicePanel = () => {
 setResetDeviceOpen((value) => !value);
 setResetDeviceConfirm("");
 setDeleteOpen(false);
 setDeleteConfirm("");
 };
 const handleToggleDeleteAccountPanel = () => {
 setDeleteOpen((value) => !value);
 setDeleteStep(1);
 setDeleteConfirm("");
 setResetDeviceOpen(false);
 setResetDeviceConfirm("");
 };
 const handleDeleteAccountExportFirst = () => {
 exportData();
 setDeleteStep(2);
 };
 const currentGoalCards = goalSettingsModel?.currentGoals || [];
 const archivedGoalCards = goalSettingsModel?.archivedGoals || [];
 const goalLifecycleSections = goalSettingsModel?.lifecycleSections || [];
 const goalHistoryFeed = goalSettingsModel?.historyFeed || [];
 const goalCounts = goalSettingsModel?.counts || {};
 const currentGoalOrder = goalSettingsModel?.currentGoalOrder || [];
 const goalArchiveStatusOptions = [
 {
 status: GOAL_ARCHIVE_STATUSES.paused,
 label: "Pause goal",
 helper: "Take it out of the live stack without treating it as finished.",
 },
 {
 status: GOAL_ARCHIVE_STATUSES.future,
 label: "Move to future goals",
 helper: "Keep it visible for later without letting it shape the current plan yet.",
 },
 {
 status: GOAL_ARCHIVE_STATUSES.completed,
 label: "Mark completed",
 helper: "Preserve the finished goal, its history, and the fact that you closed it out.",
 },
 {
 status: GOAL_ARCHIVE_STATUSES.archived,
 label: "Archive goal",
 helper: "Close it without calling it complete or dropped.",
 },
 {
 status: GOAL_ARCHIVE_STATUSES.dropped,
 label: "Drop goal",
 helper: "Record that this goal left the stack intentionally without being completed.",
 },
 ];
 const getGoalRestoreLabel = (status = "") => {
 if (status === GOAL_ARCHIVE_STATUSES.paused) return "Resume";
 if (status === GOAL_ARCHIVE_STATUSES.future) return "Start now";
 return "Restore";
 };
 const goalEditorTemplateCategories = useMemo(() => listGoalTemplateCategories(), []);
 const allGoalEditorTemplates = useMemo(() => listGoalTemplates({ categoryId: "all" }), []);
 const activeGoalEditorCategory = useMemo(
 () => goalEditorTemplateCategories.find((category) => category.id === goalEditorLibraryCategory) || goalEditorTemplateCategories[0] || null,
 [goalEditorTemplateCategories, goalEditorLibraryCategory]
 );
 const visibleGoalEditorTemplates = useMemo(() => listGoalTemplates({
 categoryId: goalEditorLibraryCategory,
 query: goalEditorLibrarySearch,
 }), [goalEditorLibraryCategory, goalEditorLibrarySearch]);
 const goalOrderDirty = currentGoalOrder.join("|") !== (Array.isArray(goalOrderDraftIds) ? goalOrderDraftIds : []).join("|");
 return (
 <div className="fi" data-testid="settings-tab" style={{ display:"grid", gap:"0.75rem" }}>
 <div className="card card-subtle">
 <div style={{ display:"grid", gap:"0.2rem", marginBottom:"0.7rem" }}>
 <div className="sect-title" style={{ color:"var(--text-strong)", marginBottom:0 }}>SETTINGS</div>
 <div style={{ fontSize:"0.55rem", color:"var(--text-soft)", lineHeight:1.55 }}>
 Edit your account, profile, preferences, and devices here. Goal changes, plan layers, and baseline repair now live in Plan.
 </div>
 {settingsSaveFeedbackModel.show && (
 <StateFeedbackBanner
 model={settingsSaveFeedbackModel}
 dataTestId="settings-save-status"
 compact
 />
 )}
 </div>

 <div style={{ display:"grid", gap:"0.75rem" }}>
 <SettingsSurfaceNav
 activeSurface={activeSettingsSurface}
 onSelectSurface={setActiveSettingsSurface}
 />

 {activeSettingsSurface === "account" && (
 <SettingsAccountSection
 colors={C}
 authEmail={authSession?.user?.email || ""}
 syncStateCallout={(
 <SyncStateCallout
 model={syncSurfaceModel}
 dataTestId="settings-sync-status"
 style={{ background:"#0f172a" }}
 />
 )}
 lifecycleSummaryCards={lifecycleSummaryCards}
 accountActionMessage={accountActionMsg}
 accountActionFeedbackModel={accountActionFeedbackModel}
 accountActionTone={accountActionTone}
 accountActionBusy={accountActionBusy}
 onReloadCloud={handleReloadCloud}
 onLifecycleSignOut={handleLifecycleSignOut}
 onOpenAuthGate={onOpenAuthGate}
 resetDevice={{
 open: resetDeviceOpen,
 confirm: resetDeviceConfirm,
 onToggle: handleToggleResetDevicePanel,
 onConfirmChange: setResetDeviceConfirm,
 onSubmit: handleResetDeviceSubmit,
 }}
 deleteAccount={{
 diagnostics: deleteDiagnostics,
 open: deleteOpen,
 step: deleteStep,
 confirm: deleteConfirm,
 helpText: deleteAccountHelpText,
onToggle: handleToggleDeleteAccountPanel,
onRetryDiagnostics: () => refreshDeleteDiagnostics({ force: true }),
onExportFirst: handleDeleteAccountExportFirst,
onConfirmChange: setDeleteConfirm,
onSubmit: handleDeleteAccountSubmit,
 }}
 backupAndReset={{
 message: backupMsg,
 code: backupCode,
 onCodeChange: setBackupCode,
 onReviewRestore: handleRestoreRequest,
 onExportData: exportData,
 onCopyBackup: handleCopyBackup,
 onResetPlan: onStartFresh,
 }}
 historyReport={{
 message: planHistoryReportMsg,
 markdown: planHistoryReportMarkdown,
 onGenerate: handleGeneratePlanHistoryReport,
 onCopy: handleCopyPlanHistoryReport,
 }}
 passwordReset={{
 busy: passwordResetBusy,
 message: passwordResetMessage,
 onRequest: onRequestPasswordReset,
 }}
 syncDiagnostics={syncDiagnostics}
 showInternalSettingsTools={showInternalSettingsTools}
 showProtectedDiagnostics={showProtectedDiagnostics}
 />
 )}

 {activeSettingsSurface === "profile" && (
 <SettingsProfileSection
 colors={C}
 accountProfileDraft={accountProfileDraft}
 unitSettings={unitSettings}
 onChangeDraft={setAccountProfileDraft}
 onSaveProfile={saveAccountProfile}
 />
 )}

 {activeSettingsSurface === "goals" && (
 <SettingsGoalsSection
 colors={C}
 focusSection={focusSection}
 onOpenPlan={onOpenPlan}
 priorityExplanation={goalSettingsModel?.priorityExplanation || GOAL_PRIORITY_EXPLANATION}
 goalCounts={goalCounts}
 currentGoalCards={currentGoalCards}
 goalManagementError={goalManagementError}
 goalManagementNotice={goalManagementNotice}
 goalManagementBusy={goalManagementBusy}
 goalManagementPreview={goalManagementPreview}
 goalOrderDirty={goalOrderDirty}
 goalLifecycleSections={goalLifecycleSections}
 goalHistoryFeed={goalHistoryFeed}
 onAddGoal={openNewGoalEditor}
 onMoveGoal={moveGoalInSettingsOrder}
 onEditGoal={openGoalEditor}
 onArchiveGoal={openGoalArchive}
 onPreviewGoalReprioritization={handlePreviewGoalReprioritization}
 onResetGoalOrder={resetGoalOrderDraft}
 onApplyGoalManagement={handleApplyGoalManagement}
 onResetGoalManagementWorkflow={resetGoalManagementWorkflow}
 onPreviewGoalRestore={handlePreviewGoalRestore}
 getGoalRestoreLabel={getGoalRestoreLabel}
 />
 )}

 {activeSettingsSurface === "baselines" && (
 <SettingsBaselinesSection colors={C} focusSection={focusSection} onOpenPlan={onOpenPlan}>
 <MetricsBaselinesSection
 athleteProfile={athleteProfile}
 personalization={personalization}
 logs={logs}
 bodyweights={bodyweights}
 onPatchProfile={patchProfile}
 saveManualProgressInputs={saveManualProgressInputs}
 onSaveTrainingContext={saveTrainingContextInline}
 onSaved={setSettingsSaveMsg}
 />
 </SettingsBaselinesSection>
 )}

 {activeSettingsSurface === "programs" && (
 <SettingsProgramsSection
 colors={C}
 onOpenPlan={onOpenPlan}
 settingsPlanBasisExplanation={settingsPlanBasisExplanation}
 activeProgramDefinition={activeProgramDefinition}
 activeStyleDefinition={activeStyleDefinition}
 planManagementNotice={planManagementNotice}
 planManagementError={planManagementError}
 selectedSettingsProgramId={selectedSettingsProgramId}
 programDefinitions={programDefinitions}
 programFidelityModes={PROGRAM_FIDELITY_MODES}
 selectedSettingsProgramFidelityMode={selectedSettingsProgramFidelityMode}
 selectedSettingsProgramDefinition={selectedSettingsProgramDefinition}
 settingsProgramCompatibility={settingsProgramCompatibility}
 compatibilityOutcomes={COMPATIBILITY_OUTCOMES}
 styleDefinitions={styleDefinitions}
 selectedSettingsStyleId={selectedSettingsStyleId}
 selectedSettingsStyleDefinition={selectedSettingsStyleDefinition}
 settingsStyleCompatibility={settingsStyleCompatibility}
 onSelectProgramId={setSelectedSettingsProgramId}
 onSelectProgramFidelityMode={setSelectedSettingsProgramFidelityMode}
 onActivateProgram={handleSettingsActivateProgram}
 onClearProgramLayer={handleSettingsClearProgramLayer}
 onSelectStyleId={setSelectedSettingsStyleId}
 onActivateStyle={handleSettingsActivateStyle}
 />
 )}

 {activeSettingsSurface === "preferences" && (
 <SettingsPreferencesSection
 colors={C}
 trainingPrefs={trainingPrefs}
 nutritionPrefs={nutritionPrefs}
 appearance={appearance}
 notifications={notif}
 showEnvEditor={showEnvEditor}
 onToggleEnvEditor={() => setShowEnvEditor((value)=>!value)}
 onPatchSettings={patchSettings}
 onPatchNutritionPreferences={patchNutritionPreferences}
 AppearanceThemeSectionComponent={AppearanceThemeSection}
 />
 )}

 {activeSettingsSurface === "advanced" && (
 <SettingsAdvancedSection
 colors={C}
 showProtectedDiagnostics={showProtectedDiagnostics}
 showInternalSettingsTools={showInternalSettingsTools}
 frictionDashboard={frictionDashboard}
 adaptiveDiagnostics={adaptiveDiagnosticsModel}
 goalRequest={{
 mode: goalChangeMode,
 intent: goalChangeIntent,
 previewing: goalChangePreviewing,
 applying: goalChangeApplying,
 preview: goalChangePreview,
 error: goalChangeError,
 notice: goalChangeNotice,
 onModeChange: setGoalChangeMode,
 onIntentChange: setGoalChangeIntent,
 onPreview: handleSettingsGoalPreview,
 onApply: handleSettingsGoalApply,
 }}
 coachSetup={{
 memoryDraft: coachMemoryDraft,
 apiKey: coachApiKey,
 onChangeMemoryField: (field, value) => setCoachMemoryDraft((current) => ({ ...current, [field]: value })),
 onApiKeyChange: setCoachApiKey,
 onSave: saveCoachSetup,
 }}
 integrations={{
 apple: appleIntegration,
 garmin: garminIntegration,
 location: locationIntegration,
 garminBusy,
 checkMsg,
 garminMsg,
 locationMsg,
 importMsg,
 appleImportText,
 garminImportText,
 getTone: integrationStateTone,
 onRequestAppleHealth: requestAppleHealth,
 onConnectGarmin: connectGarmin,
 onRequestLocationAccess: requestLocationAccess,
 onAppleImportTextChange: setAppleImportText,
 onGarminImportTextChange: setGarminImportText,
 onImportDeviceData: importDeviceData,
 }}
 />
 )}
 </div>
 </div>

 {goalEditorOpen && goalEditorDraft && (
 <div onClick={closeGoalEditor} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.74)", display:"grid", placeItems:"center", zIndex:65, padding:"1rem" }}>
 <div onClick={(event)=>event.stopPropagation()} className="card card-soft" data-testid="settings-goal-editor" style={{ width:"100%", maxWidth:620, maxHeight:"88vh", overflowY:"auto", borderColor:"#30455f", background:"#0f172a", display:"grid", gap:"0.5rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.1em" }}>{goalEditorMode === "add" ? "ADD GOAL" : "EDIT GOAL"}</div>
 <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.45 }}>
{goalEditorMode === "add"
? "Pick a goal path first, then see how it will affect your active goals."
: "Refine this goal with a clearer path, then see what changes before you save it."}
 </div>
 </div>
 <div data-testid="settings-goal-editor-library" style={{ display:"grid", gap:"0.45rem", border:"1px solid #243752", borderRadius:14, background:"#0b1220", padding:"0.65rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>GOAL LIBRARY</div>
<div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>Start with the library. If nothing fits, write your own.</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {activeGoalEditorCategory?.helper || "Search or browse the library first to find the closest fit, then adjust from there."}
 </div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap" }}>
 {goalEditorTemplateCategories.map((category) => {
 const selected = goalEditorLibraryCategory === category.id;
 return (
 <button
 key={category.id}
 type="button"
 className="btn"
 data-testid={`settings-goal-editor-category-${category.id}`}
 onClick={() => setGoalEditorLibraryCategory(category.id)}
 style={{
 fontSize:"0.47rem",
 color:selected ? "#0f172a" : "#dbe7f6",
 background:selected ? "#dbe7f6" : "transparent",
 borderColor:selected ? "#dbe7f6" : "#2b3d55",
 }}
 >
 {category.label}
 </button>
 );
 })}
 </div>
 <input
 data-testid="settings-goal-editor-search"
 value={goalEditorLibrarySearch}
 onChange={(e)=>setGoalEditorLibrarySearch(e.target.value)}
 placeholder="Search goal paths"
 />
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.4rem", maxHeight:280, overflowY:"auto", paddingRight:"0.12rem", alignContent:"start" }}>
 {visibleGoalEditorTemplates.map((template) => {
 const selected = goalEditorDraft?.templateId === template.id;
 return (
 <button
 key={template.id}
 type="button"
 className="btn"
 data-testid={`settings-goal-editor-template-${template.id}`}
 onClick={() => selectGoalEditorTemplate(template.id)}
 style={{
 textAlign:"left",
 padding:"0.65rem",
 display:"grid",
 gap:"0.18rem",
 background:selected ? "rgba(147,197,253,0.12)" : "rgba(11,18,32,0.82)",
 borderColor:selected ? "rgba(147,197,253,0.55)" : "#22324a",
 }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"flex-start" }}>
 <div style={{ fontSize:"0.56rem", color:"#f8fafc", fontWeight:600, lineHeight:1.4 }}>{template.title}</div>
 <div style={{ fontSize:"0.44rem", color:selected ? "#bfdbfe" : "#8fa5c8" }}>{selected ? "Selected" : "Use"}</div>
 </div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>{template.helper}</div>
 </button>
 );
 })}
 {visibleGoalEditorTemplates.length === 0 && (
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5, border:"1px dashed #23344d", borderRadius:12, padding:"0.7rem" }}>
 No goal path matched that search yet.
 </div>
 )}
 </div>
 {(goalEditorDraft?.templateId || goalEditorDraft?.summary) && (
 <div style={{ border:"1px solid #20314a", borderRadius:12, background:"#0f172a", padding:"0.5rem", display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>SELECTED PATH</div>
 <div style={{ fontSize:"0.56rem", color:"#e2e8f0", lineHeight:1.45 }}>
 {goalEditorDraft?.summary || goalEditorDraft?.templateTitle || "Goal path"}
 </div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>
 {goalEditorDraft?.templateId
 ? findGoalTemplateById(goalEditorDraft.templateId)?.helper || "Library-based goal path"
 : "Custom goal path"}
 </div>
 </div>
 )}
 <div style={{ display:"grid", gap:"0.32rem", borderTop:"1px solid #182335", paddingTop:"0.42rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>Need something unusual? Write a custom goal.</div>
 <button
 type="button"
 className="btn"
 data-testid="settings-goal-editor-toggle-custom"
 onClick={() => {
 const nextOpen = !showGoalEditorCustomInput;
 setShowGoalEditorCustomInput(nextOpen);
 if (nextOpen) {
 setGoalEditorDraft((current) => ({
 ...(current || buildGoalEditorDraft({ goal: null })),
 entryMode: "custom",
 templateId: "",
 templateCategoryId: "custom",
 templateTitle: "Custom goal",
 }));
 }
 }}
 style={{ fontSize:"0.47rem", color:"#dbe7f6", borderColor:"#2b3d55" }}
 >
 {showGoalEditorCustomInput ? "Hide custom" : "Write a custom goal"}
 </button>
 </div>
 {showGoalEditorCustomInput && (
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Custom goal</span>
 <input
 data-testid="settings-goal-editor-custom-summary"
 value={goalEditorDraft.summary || ""}
 onChange={(e)=>setGoalEditorDraft((current) => ({
 ...(current || buildGoalEditorDraft({ goal: null })),
 entryMode: "custom",
 templateId: "",
 templateCategoryId: "custom",
 templateTitle: "Custom goal",
 selectionGoalText: e.target.value,
 summary: e.target.value,
 }))}
 placeholder="Describe the goal in plain English"
 />
 </label>
 )}
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.38rem" }}>
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Goal summary</span>
 <input data-testid="settings-goal-editor-summary" value={goalEditorDraft.summary || ""} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, summary: e.target.value }))} placeholder="Bench press 225 lb" />
 </label>
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Goal focus</span>
 <select data-testid="settings-goal-editor-category" value={goalEditorDraft.planningCategory || "general_fitness"} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, planningCategory: e.target.value }))}>
 <option value="running">Running</option>
 <option value="strength">Strength</option>
 <option value="body_comp">Body composition</option>
 <option value="general_fitness">General fitness</option>
 </select>
 </label>
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Target metric</span>
 <input data-testid="settings-goal-editor-primary-metric-label" value={goalEditorDraft.primaryMetricLabel || ""} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, primaryMetricLabel: e.target.value }))} placeholder="Bench 1RM" />
 </label>
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Target value</span>
 <input data-testid="settings-goal-editor-primary-metric-target" value={goalEditorDraft.primaryMetricTargetValue || ""} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, primaryMetricTargetValue: e.target.value }))} placeholder="225" />
 </label>
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Metric unit</span>
 <input data-testid="settings-goal-editor-primary-metric-unit" value={goalEditorDraft.primaryMetricUnit || ""} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, primaryMetricUnit: e.target.value }))} placeholder="lb" />
 </label>
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Proxy tracking</span>
 <input data-testid="settings-goal-editor-proxies" value={(goalEditorDraft.proxyMetrics || []).map((metric) => metric.label).join(", ")} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, proxyMetrics: String(e.target.value || "").split(",").map((item) => item.trim()).filter(Boolean).map((label) => ({ label, unit: "" })) }))} placeholder="Waist, bodyweight trend, progress photos" />
 </label>
 </div>
 <div style={{ display:"grid", gap:"0.24rem" }}>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Timing</div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 {[["open_ended","Open-ended"],["target_horizon","Target horizon"],["exact_date","Exact date"]].map(([value, label]) => (
 <button
 key={value}
 type="button"
 className="btn"
 data-testid={`settings-goal-editor-timing-${value}`}
 onClick={()=>setGoalEditorDraft((current) => ({ ...current, timingMode: value }))}
 style={{
 fontSize:"0.47rem",
 color:goalEditorDraft.timingMode === value ? "#0f172a" : "#dbe7f6",
 background:goalEditorDraft.timingMode === value ? "#dbe7f6" : "transparent",
 borderColor:goalEditorDraft.timingMode === value ? "#dbe7f6" : "#2b3d55",
 }}
 >
 {label}
 </button>
 ))}
 </div>
 <div style={{ fontSize:"0.47rem", color:"#94a3b8", lineHeight:1.5 }}>
 {buildTimingModeHelpText({
 timingMode: goalEditorDraft.timingMode || "open_ended",
 visibleHorizonWeeks: DEFAULT_PLANNING_HORIZON_WEEKS,
 })}
 </div>
 {goalEditorDraft.timingMode === "target_horizon" && (
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Horizon in weeks</span>
 <input data-testid="settings-goal-editor-horizon" type="number" min="1" max="104" value={goalEditorDraft.targetHorizonWeeks || ""} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, targetHorizonWeeks: e.target.value }))} placeholder="12" />
 </label>
 )}
 {goalEditorDraft.timingMode === "exact_date" && (
 <label style={{ display:"grid", gap:"0.12rem" }}>
 <span style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>Exact date</span>
 <input data-testid="settings-goal-editor-date" type="date" value={goalEditorDraft.targetDate || ""} onChange={(e)=>setGoalEditorDraft((current) => ({ ...current, targetDate: e.target.value }))} />
 </label>
 )}
 </div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 <button data-testid="settings-goal-editor-preview" className="btn btn-primary" onClick={handlePreviewGoalEdit} disabled={goalManagementBusy}>
{goalManagementBusy ? "Loading..." : "See changes"}
 </button>
 <button className="btn" onClick={closeGoalEditor} disabled={goalManagementBusy} style={{ color:"#dbe7f6", borderColor:"#2b3d55" }}>Close</button>
 </div>
 </div>
 </div>
 )}

 {goalArchiveOpen && (
 <div onClick={closeGoalArchive} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.74)", display:"grid", placeItems:"center", zIndex:65, padding:"1rem" }}>
 <div onClick={(event)=>event.stopPropagation()} className="card card-soft" data-testid="settings-goal-archive-sheet" style={{ width:"100%", maxWidth:520, borderColor:"#30455f", background:"#0f172a", display:"grid", gap:"0.5rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.1em" }}>GOAL STATUS</div>
 <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>Choose what should happen to this goal next.</div>
 </div>
 <div style={{ display:"grid", gap:"0.24rem" }}>
 {goalArchiveStatusOptions.map((option) => {
 const status = option.status;
 const selected = goalArchiveDraft.archiveStatus === status;
 return (
 <button
 key={status}
 type="button"
 className="btn"
 data-testid={`settings-goal-archive-status-${status}`}
 onClick={()=>setGoalArchiveDraft((current) => ({ ...current, archiveStatus: status }))}
 style={{
 justifyContent:"flex-start",
 color:selected ? "#0f172a" : "#dbe7f6",
 background:selected ? "#dbe7f6" : "transparent",
 borderColor:selected ? "#dbe7f6" : "#2b3d55",
 textAlign:"left",
 display:"grid",
 gap:"0.12rem",
 }}
 >
 <span>{option.label}</span>
 <span style={{ fontSize:"0.46rem", color:selected ? "#334155" : "#8fa5c8", lineHeight:1.45 }}>{option.helper}</span>
 </button>
 );
 })}
 </div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 <button data-testid="settings-goal-archive-preview" className="btn btn-primary" onClick={handlePreviewGoalArchive} disabled={goalManagementBusy}>
{goalManagementBusy ? "Loading..." : "See changes"}
 </button>
 <button className="btn" onClick={closeGoalArchive} disabled={goalManagementBusy} style={{ color:"#dbe7f6", borderColor:"#2b3d55" }}>Close</button>
 </div>
 </div>
 </div>
 )}

 {connectOpen && (
 <div onClick={()=>setConnectOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.72)", display:"grid", placeItems:"center", zIndex:60, padding:"1rem" }}>
 <div onClick={e=>e.stopPropagation()} className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"#30455f" }}>
 <div style={{ fontSize:"0.62rem", color:"#dbe7f6", lineHeight:1.7, marginBottom:"0.6rem" }}>
 {PRODUCT_BRAND.name} can read Apple Health workouts and device context that some recommendations use. You can revoke access any time.
 </div>
 <button className="btn btn-primary" onClick={requestAppleHealth} style={{ width:"100%", marginBottom:"0.45rem" }}>Connect Apple Health</button>
 <button className="btn" onClick={async ()=>{ await persistAppleHealth({ skipped: true }); setConnectOpen(false); }} style={{ width:"100%", fontSize:"0.52rem", color:"#93a8c8", borderColor:"#324761" }}>
 Skip for now
 </button>
 </div>
 </div>
 )}

 {showRestoreConfirm && (
 <div onClick={()=>setShowRestoreConfirm(false)} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.72)", display:"grid", placeItems:"center", zIndex:60, padding:"1rem" }}>
 <div onClick={e=>e.stopPropagation()} className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"#30455f", display:"grid", gap:"0.45rem" }}>
 <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.6 }}>
 Restore replaces current local data with the backup payload.
 </div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 <button className="btn btn-primary" onClick={confirmRestore}>Restore backup</button>
 <button className="btn" onClick={()=>setShowRestoreConfirm(false)}>Cancel</button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}


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
 supporting="The plan is loaded below. Record only what actually changed."
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
 Prescribed
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
  : runPrefillBits || "The prescribed cardio session is loaded. Change only the actuals."}
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

export function PlanTab({
 planDay = null,
 surfaceModel = null,
 currentPlanWeek = null,
 currentWeek = 1,
 logs = {},
 bodyweights = [],
 dailyCheckins = {},
 weeklyCheckins = {},
 personalization = {},
 athleteProfile = null,
 rollingHorizon = [],
 syncSurfaceModel = null,
 todayWorkout: legacyTodayWorkout = null,
 onManagePlan = () => {},
 onOpenToday = () => {},
 onOpenLog = () => {},
 runtime = {},
}) {
 const { C, PLAN_STATUS_TONES, sanitizeDisplayText, toTestIdFragment, SyncStateCallout, CompactSyncStatus } = runtime;
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout || null;
 const todayKey = sanitizeDisplayText(planDay?.dateKey || new Date().toISOString().split("T")[0]);
 const athleteGoals = athleteProfile?.goals || [];
 const showStorageBanner = Boolean(syncSurfaceModel?.showFullCard);
 const showQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");
 const planModel = useMemo(() => buildPlanSurfaceModel({
  planDay,
  surfaceModel,
  currentPlanWeek,
  currentWeek,
  rollingHorizon,
  logs,
  bodyweights,
  dailyCheckins,
  weeklyCheckins,
  athleteGoals,
  manualProgressInputs: personalization?.manualProgressInputs || {},
  todayWorkout,
 }), [
  planDay,
  surfaceModel,
  currentPlanWeek,
  currentWeek,
  rollingHorizon,
  logs,
  bodyweights,
  dailyCheckins,
  weeklyCheckins,
  athleteGoals,
  personalization?.manualProgressInputs,
  todayWorkout,
 ]);
 const [selectedCurrentDayKey, setSelectedCurrentDayKey] = useState("");
 const [selectedPreviewDayKey, setSelectedPreviewDayKey] = useState("");
 const currentWeekDays = Array.isArray(planModel?.currentWeekDays) ? planModel.currentWeekDays : [];
 const previewWeekDays = Array.isArray(planModel?.previewWeek?.days) ? planModel.previewWeek.days : [];
 const currentDayModel = planModel?.currentDay || currentWeekDays.find((day) => day?.isToday) || currentWeekDays[0] || null;
 const selectedCurrentDay = currentWeekDays.find((day) => String(day?.dayKey) === String(selectedCurrentDayKey)) || null;
 const selectedPreviewDay = previewWeekDays.find((day) => String(day?.dayKey) === String(selectedPreviewDayKey)) || null;
 const currentDaySummary = useMemo(() => buildSharedSessionSummaryModel({
  surfaceModel,
  sessionContextLine: currentDayModel?.isToday
   ? "Today is the active session inside the committed week."
   : "This is where the current day sits inside the committed week.",
  currentWeekFocus: planModel?.intentLine || currentPlanWeek?.weeklyIntent?.focus || currentPlanWeek?.summary || "",
 }), [
  surfaceModel,
  currentDayModel?.isToday,
  planModel?.intentLine,
  currentPlanWeek?.weeklyIntent?.focus,
  currentPlanWeek?.summary,
 ]);

 useEffect(() => {
  if (selectedCurrentDayKey && !currentWeekDays.some((day) => String(day?.dayKey) === String(selectedCurrentDayKey))) {
   setSelectedCurrentDayKey("");
  }
 }, [selectedCurrentDayKey, currentWeekDays]);

 useEffect(() => {
  if (selectedPreviewDayKey && !previewWeekDays.some((day) => String(day?.dayKey) === String(selectedPreviewDayKey))) {
   setSelectedPreviewDayKey("");
  }
 }, [selectedPreviewDayKey, previewWeekDays]);

 const buildStatusPillStyle = (tone = null) => ({
  color: tone?.color || "var(--consumer-text-muted)",
  background: tone?.background || "var(--consumer-subpanel)",
  borderColor: tone?.borderColor || "var(--consumer-border-strong)",
 });

 const buildGoalDistanceTone = (statusKey = "") => {
  if (statusKey === "on_track") return { color:C.green, background:`${C.green}14`, borderColor:`${C.green}30` };
  if (statusKey === "needs_data") return { color:C.amber, background:`${C.amber}14`, borderColor:`${C.amber}30` };
  if (statusKey === "review_based") return { color:C.purple, background:`${C.purple}14`, borderColor:`${C.purple}30` };
  return { color:C.blue, background:`${C.blue}14`, borderColor:`${C.blue}30` };
 };

 const renderDayDetailPanel = (day = null, { preview = false } = {}) => {
  if (!day) {
   return (
    <div style={{ fontSize:"0.52rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
     {preview ? "Choose an upcoming day to see how the preview week is shaping up." : "Choose a day in this week to see where it fits."}
    </div>
   );
  }

  const showTodayAction = !preview && Boolean(day?.isToday);
  const showLogAction = !preview && Boolean(day?.dateKey && day.dateKey <= todayKey);
  const detailTone = buildStatusPillStyle(day?.status?.tone);

  return (
   <div data-testid="planned-session-plan" style={{ display:"grid", gap:"0.42rem" }}>
    <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
     <div style={{ display:"grid", gap:"0.12rem", minWidth:0 }}>
      <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
       {preview ? "Preview day" : "Day context"}
      </div>
      <div style={{ fontSize:"0.68rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
       {day.title}
      </div>
      {!!day.detail && (
       <div style={{ fontSize:"0.52rem", color:"var(--consumer-text-soft)", lineHeight:1.5 }}>
        {day.detail}
       </div>
      )}
     </div>
     <SurfacePill style={detailTone}>{day.status?.label || (preview ? "Preview" : "Upcoming")}</SurfacePill>
    </div>
    <CompactTrustRow model={day?.trustModel || null} dataTestId="program-day-trust-row" />
    <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
     {preview
      ? "Preview weeks show direction, not a locked prescription."
      : day.status?.detail
      ? day.status.detail
      : day?.isToday
      ? "Today owns the prescription. Log owns the execution."
      : day?.dateKey && day.dateKey < todayKey
      ? "Log holds the execution truth for finished days."
      : "Plan keeps the week oriented without repeating Today."}
    </div>
    {(showTodayAction || showLogAction) && (
     <SurfaceActions>
      {showTodayAction && (
       <button type="button" className="btn btn-primary" onClick={onOpenToday} style={{ fontSize:"0.5rem" }}>
        Open Today
       </button>
      )}
      {showLogAction && (
       <button type="button" className="btn" onClick={onOpenLog} style={{ fontSize:"0.5rem" }}>
        Open Log
       </button>
      )}
     </SurfaceActions>
    )}
   </div>
  );
 };

 return (
  <div className="fi" data-testid="program-tab" style={{ display:"grid", gap:"0.75rem" }}>
   {showStorageBanner && (
    <SyncStateCallout
     model={syncSurfaceModel}
     dataTestId="program-sync-status"
     compact
     style={{ background:"rgba(11, 20, 32, 0.76)" }}
    />
   )}

   <SurfaceHero data-testid="program-trajectory-header" accentColor={C.blue} style={{ borderColor:`${C.blue}26` }}>
    <SurfaceStack gap="0.55rem">
     <SurfaceHeroHeader>
      <SurfaceHeroCopy>
       <SurfaceHeading
        eyebrow="Plan"
        title={planModel?.weekLabel || "This week"}
        titleTestId="program-trajectory-title"
        supporting={planModel?.intentLine || "This week is keeping the active goals moving in one coherent direction."}
        eyebrowColor={C.blue}
        titleSize="hero"
       />
      </SurfaceHeroCopy>
      <SurfaceMetaRow style={{ justifyContent:"flex-end" }}>
       <SurfacePill style={{ color:C.blue, background:`${C.blue}12`, borderColor:`${C.blue}24`, fontWeight:750 }}>
        {planModel?.commitmentLabel || "Committed week"}
       </SurfacePill>
       {!!planModel?.previewWeek?.label && <SurfacePill>Next: {planModel.previewWeek.label}</SurfacePill>}
       {showQuietSyncChip && (
        <div style={{ minWidth:210 }}>
         <CompactSyncStatus
          model={syncSurfaceModel}
          dataTestId="program-sync-status"
          style={{
           background:"rgba(11, 20, 32, 0.32)",
           opacity:0.88,
          }}
         />
        </div>
       )}
      </SurfaceMetaRow>
     </SurfaceHeroHeader>

     <SurfaceQuietPanel data-testid="program-current-day-context" style={{ display:"grid", gap:"0.45rem" }}>
     <SessionSummaryBlock
       model={currentDaySummary}
       accentColor={C.blue}
       titleTestId="program-canonical-session-label"
       rationaleTestId="program-change-summary"
       contextTestId="program-current-day-context-line"
       showContext
      />
      <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
       {planModel?.commitmentLine || "This week is committed. Future weeks stay preview-only until they arrive."}
      </div>
     <CompactTrustRow model={planModel?.weekTrustModel || null} dataTestId="program-header-trust-row" />
     </SurfaceQuietPanel>

     {!!planModel?.goalDistanceItems?.length && (
      <div
       data-testid="program-goal-distance"
       style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",
        gap:"0.45rem",
       }}
      >
       {planModel.goalDistanceItems.map((item) => {
        const tone = buildGoalDistanceTone(item?.statusKey);
        const railRatio = Number.isFinite(Number(item?.progressRatio)) ? Math.max(0, Math.min(1, Number(item.progressRatio))) : null;
        return (
         <div
          key={`program-goal-distance-${item.key}`}
          data-testid={`program-goal-distance-item-${toTestIdFragment(item.key || item.summary)}`}
          style={{
           border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
           borderRadius:20,
           padding:"0.68rem 0.74rem",
           background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
           display:"grid",
           gap:"0.28rem",
           alignContent:"start",
          }}
         >
          <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
           <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
            <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
             {item.kind === "exact_metric" ? "Goal distance" : "Goal status"}
            </div>
            <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.4 }}>
             {item.summary}
            </div>
            <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
             {item.metricLabel}
            </div>
           </div>
           <SurfacePill style={buildStatusPillStyle(tone)}>{item.statusLabel}</SurfacePill>
          </div>

          {item.kind === "exact_metric" ? (
           <>
            <div style={{ fontSize:"0.62rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
             {item.distanceLabel}
            </div>
            <div style={{ display:"grid", gap:"0.14rem" }}>
             <div
              aria-hidden="true"
              style={{
               height:8,
               borderRadius:999,
               background:"color-mix(in srgb, var(--consumer-border) 72%, rgba(255,255,255,0.04))",
               overflow:"hidden",
               position:"relative",
              }}
             >
              {railRatio !== null && (
               <div
                style={{
                 width:`${Math.max(6, Math.round(railRatio * 100))}%`,
                 height:"100%",
                 borderRadius:999,
                 background:`linear-gradient(90deg, ${tone.background} 0%, ${tone.color} 100%)`,
                }}
               />
              )}
             </div>
             <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", flexWrap:"wrap" }}>
              <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.4 }}>
               {item.currentLabel}
              </div>
              <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.4 }}>
               {item.targetLabel}
              </div>
             </div>
             <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-faint)", lineHeight:1.4 }}>
              {item.baselineLabel}
             </div>
            </div>
           </>
          ) : (
           <>
            <div style={{ fontSize:"0.6rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
             {item.headline}
            </div>
            <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-soft)", lineHeight:1.45 }}>
             {item.detailLine}
            </div>
            {!!item.noteLine && (
             <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-faint)", lineHeight:1.45 }}>
              {item.noteLine}
             </div>
            )}
           </>
          )}
         </div>
        );
       })}
      </div>
     )}

     <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.45rem" }}>
      {Array.isArray(planModel?.alignmentItems) && planModel.alignmentItems.map((item, index) => (
       <div
        key={`program-alignment-${index}`}
        style={{
         border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
         borderRadius:20,
         padding:"0.68rem 0.74rem",
         background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
         display:"grid",
         gap:"0.18rem",
        }}
       >
        <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         Goal alignment
        </div>
        <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.4 }}>
         {item.label}
        </div>
        <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-soft)", lineHeight:1.45 }}>
         {item.detail}
        </div>
       </div>
      ))}
     </div>

     <SurfaceActions>
      <button type="button" className="btn btn-primary" data-testid="program-primary-cta" onClick={onOpenToday} style={{ fontSize:"0.5rem" }}>
       Open Today
      </button>
      <button type="button" className="btn" data-testid="program-secondary-cta" onClick={onOpenLog} style={{ fontSize:"0.5rem" }}>
       Open Log
      </button>
      <button type="button" className="btn" onClick={() => onManagePlan("plan")} style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)" }}>
       Manage plan
      </button>
     </SurfaceActions>
    </SurfaceStack>
   </SurfaceHero>

   <SurfaceCard data-testid="program-roadmap" style={{ display:"grid", gap:"0.48rem" }}>
    <div style={{ display:"grid", gap:"0.16rem" }}>
     <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>VISIBLE ARC</div>
     <div style={{ fontSize:"0.52rem", color:"var(--consumer-text-soft)", lineHeight:1.52 }}>
      The current week is committed. The next few weeks show where the block is trying to go.
     </div>
    </div>
    <div data-testid="program-roadmap-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:"0.4rem" }}>
     {(planModel?.roadmapRows || []).map((row) => (
      <div
       key={`program-roadmap-week-${row.absoluteWeek}`}
       data-testid={`program-roadmap-week-${row.absoluteWeek}`}
       style={{
        border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
        borderRadius:20,
        background:row?.isCurrentWeek ? "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 100%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
        padding:"0.66rem 0.74rem",
        display:"grid",
        gap:"0.18rem",
       }}
      >
       <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
        <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         {row.weekLabel}
        </div>
        <SurfacePill style={buildStatusPillStyle(row?.isCurrentWeek ? PLAN_STATUS_TONES.completed : PLAN_STATUS_TONES.preview)}>
         {row.stateLabel}
        </SurfacePill>
       </div>
       <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.4 }}>
        {row.phaseLabel}
       </div>
       <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-soft)", lineHeight:1.45 }}>
        {row.focus}
       </div>
      </div>
     ))}
    </div>
   </SurfaceCard>

   <SurfaceCard data-testid="program-this-week" style={{ display:"grid", gap:"0.58rem" }}>
    <div style={{ display:"grid", gap:"0.16rem" }}>
     <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>THIS WEEK</div>
     <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", lineHeight:1.45 }}>
      {planModel?.balanceLine || "This week is laid out below."}
     </div>
     <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
      {planModel?.currentWeekSummaryLine || "Nothing has been logged yet this week."}
     </div>
    </div>

    <div data-testid="program-current-week-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:"0.35rem" }}>
     {currentWeekDays.map((day) => (
      <button
       key={`program-current-week-cell-${day.dayKey}`}
       type="button"
       data-testid={`program-current-week-cell-${day.dayKey}`}
       data-current-day={day.isToday ? "true" : "false"}
       onClick={() => setSelectedCurrentDayKey((current) => String(current) === String(day.dayKey) ? "" : String(day.dayKey))}
       className="btn"
       style={{
        minHeight:112,
        padding:"0.66rem 0.72rem",
        borderRadius:20,
        borderColor:day.isToday ? `${C.blue}30` : "color-mix(in srgb, var(--consumer-border) 88%, rgba(255,255,255,0.04))",
        background:day.isToday ? "linear-gradient(180deg, rgba(60, 145, 230, 0.12) 0%, rgba(60, 145, 230, 0.06) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
        display:"grid",
        gap:"0.2rem",
        justifyItems:"start",
        textAlign:"left",
       }}
      >
       <div style={{ display:"flex", width:"100%", justifyContent:"space-between", gap:"0.25rem", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         {day.dayLabel}{day.isToday ? " - Today" : ""}
        </div>
        <SurfacePill style={buildStatusPillStyle(day?.status?.tone)}>{day.status?.label}</SurfacePill>
       </div>
       <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
        {day.title}
       </div>
       {!!day.detail && (
        <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
         {day.detail}
        </div>
       )}
      </button>
     ))}
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:"0.5rem" }}>
     <div style={{ display:"grid", gap:"0.32rem" }}>
      {currentWeekDays.map((day) => {
       const selected = String(selectedCurrentDayKey) === String(day.dayKey);
       return (
        <div
         key={`program-this-week-session-item-${day.dayKey}`}
         data-testid={`program-this-week-session-item-${day.dayKey}`}
         data-session-selected={selected ? "true" : "false"}
         style={{
          border:"1px solid color-mix(in srgb, var(--consumer-border) 88%, rgba(255,255,255,0.04))",
          borderRadius:20,
          background:selected ? "linear-gradient(180deg, rgba(60, 145, 230, 0.12) 0%, rgba(60, 145, 230, 0.06) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
          padding:"0.18rem",
         }}
        >
         <button
          type="button"
          className="btn"
          data-testid={`program-this-week-session-button-${day.dayKey}`}
          aria-expanded={selected ? "true" : "false"}
          onClick={() => setSelectedCurrentDayKey((current) => String(current) === String(day.dayKey) ? "" : String(day.dayKey))}
          style={{
           width:"100%",
           minHeight:56,
           border:"none",
           background:"transparent",
           justifyContent:"space-between",
           display:"grid",
           gridTemplateColumns:"auto 1fr auto",
           gap:"0.45rem",
           textAlign:"left",
           alignItems:"center",
          }}
         >
          <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
           {day.dayLabel}
          </div>
          <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
           <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
            {day.title}
           </div>
           <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
            {day.detail || day.status?.detail}
           </div>
          </div>
          <SurfacePill style={buildStatusPillStyle(day?.status?.tone)}>{day.status?.label}</SurfacePill>
         </button>
        </div>
       );
      })}
     </div>

     <div
      data-testid="program-this-week-session-detail-panel"
      style={{
       border:"1px solid color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
       borderRadius:22,
       background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
       padding:"0.76rem 0.82rem",
       display:"grid",
       gap:"0.35rem",
       alignContent:"start",
      }}
     >
      {renderDayDetailPanel(selectedCurrentDay)}
     </div>
    </div>

    {!!planModel?.upcomingKeySessions?.length && (
     <div data-testid="program-upcoming-key-sessions" style={{ display:"grid", gap:"0.24rem" }}>
      <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
       Key sessions coming next
      </div>
      <div style={{ display:"grid", gap:"0.24rem" }}>
       {planModel.upcomingKeySessions.map((session) => (
        <div key={session.key} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.4rem", alignItems:"baseline" }}>
         <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
          {session.dayLabel}
         </div>
         <div style={{ fontSize:"0.52rem", color:"var(--consumer-text)", lineHeight:1.45 }}>
          {session.title}{session.detail ? ` - ${session.detail}` : ""}
         </div>
         <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)" }}>
          {session.statusLabel}
         </div>
        </div>
       ))}
      </div>
     </div>
    )}
   </SurfaceCard>

   {!!planModel?.previewWeek && (
    <SurfaceCard data-testid="program-future-weeks" style={{ display:"grid", gap:"0.5rem" }}>
     <div style={{ display:"grid", gap:"0.16rem" }}>
      <div className="sect-title" style={{ color:C.purple, marginBottom:0 }}>NEXT WEEK PREVIEW</div>
      <div style={{ fontSize:"0.58rem", color:"var(--consumer-text)", lineHeight:1.45 }}>
       {planModel.previewWeek.focus}
      </div>
      <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
       {planModel.previewWeek.shapeLine}
      </div>
     </div>

     <div
      data-testid={`program-future-week-card-${planModel.previewWeek.absoluteWeek || toTestIdFragment(planModel.previewWeek.label)}`}
      style={{
       border:"1px solid var(--consumer-border)",
       borderRadius:20,
       background:"var(--consumer-panel)",
       padding:"0.72rem 0.78rem",
       display:"grid",
       gap:"0.45rem",
      }}
     >
      <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
       <div style={{ display:"grid", gap:"0.08rem" }}>
        <div style={{ fontSize:"0.46rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
         {planModel.previewWeek.label}
        </div>
        <div style={{ fontSize:"0.56rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
         Forecast only
        </div>
       </div>
       <SurfacePill style={buildStatusPillStyle(PLAN_STATUS_TONES.preview)}>Preview</SurfacePill>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:"0.5rem" }}>
       <div style={{ display:"grid", gap:"0.3rem" }}>
        {previewWeekDays.map((day) => {
         const selected = String(selectedPreviewDayKey) === String(day.dayKey);
         return (
          <div
           key={`program-future-week-session-item-${planModel.previewWeek.absoluteWeek || "next"}_${day.dayKey}`}
           data-testid={`program-future-week-session-item-${planModel.previewWeek.absoluteWeek || "next"}_${day.dayKey}`}
           data-session-selected={selected ? "true" : "false"}
           style={{
            border:"1px solid var(--consumer-border)",
            borderRadius:18,
            background:selected ? "rgba(110, 99, 217, 0.08)" : "var(--consumer-subpanel)",
            padding:"0.18rem",
           }}
          >
           <button
            type="button"
            className="btn"
            data-testid={`program-future-week-session-button-${planModel.previewWeek.absoluteWeek || "next"}_${day.dayKey}`}
            aria-expanded={selected ? "true" : "false"}
            onClick={() => setSelectedPreviewDayKey((current) => String(current) === String(day.dayKey) ? "" : String(day.dayKey))}
            style={{
             width:"100%",
             minHeight:54,
             border:"none",
             background:"transparent",
             justifyContent:"space-between",
             display:"grid",
             gridTemplateColumns:"auto 1fr auto",
             gap:"0.45rem",
             textAlign:"left",
             alignItems:"center",
            }}
           >
            <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
             {day.dayLabel}
            </div>
            <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
             <div style={{ fontSize:"0.54rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
              {day.title}
             </div>
             <div style={{ fontSize:"0.48rem", color:"var(--consumer-text-soft)", lineHeight:1.4 }}>
              {day.detail || day.status?.detail}
             </div>
            </div>
            <SurfacePill style={buildStatusPillStyle(day?.status?.tone)}>{day.status?.label}</SurfacePill>
           </button>
          </div>
         );
        })}
       </div>

       <div
        data-testid="program-future-week-session-detail-panel"
        style={{
         border:"1px solid var(--consumer-border)",
         borderRadius:20,
         background:"var(--consumer-subpanel)",
         padding:"0.72rem 0.78rem",
         display:"grid",
         gap:"0.35rem",
         alignContent:"start",
        }}
       >
        {renderDayDetailPanel(selectedPreviewDay, { preview:true })}
       </div>
      </div>
     </div>
    </SurfaceCard>
   )}
  </div>
 );
}

// LOG TAB (POLISHED)

export function NutritionTab({ planDay = null, surfaceModel = null, todayWorkout: legacyTodayWorkout, currentWeek, logs, personalization, athleteProfile = null, momentum, bodyweights, learningLayer, nutritionLayer: legacyNutritionLayer, realWorldNutrition: legacyRealWorldNutrition, nutritionActualLogs = {}, nutritionFavorites, weeklyNutritionReview = null, saveNutritionFavorites, saveNutritionActualLog, syncStateModel = null, syncSurfaceModel = null, runtime = {} }) {
 const { C, PROFILE, WEEKS, DEFAULT_NUTRITION_FAVORITES, sanitizeDisplayText, sanitizeStatusLabel, buildProvenanceText, cleanSurfaceSessionLabel, resolveCanonicalSurfaceSessionLabel, buildReviewBadgeTone, SyncStateCallout, CompactSyncStatus } = runtime;
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
 const goals = athleteProfile?.goals || [];
 const nutritionLayer = planDay?.resolved?.nutrition?.prescription || legacyNutritionLayer;
 const realWorldNutrition = planDay?.resolved?.nutrition?.reality || legacyRealWorldNutrition;
 const planDayWeek = planDay?.week || null;
 const localFoodContext = personalization?.localFoodContext || {};
 const savedLocation = personalization?.connectedDevices?.location || {};
 const [localNutritionFavorites, setLocalNutritionFavorites] = useState(nutritionFavorites || {});
 const favorites = {
 ...DEFAULT_NUTRITION_FAVORITES,
 ...(localNutritionFavorites || {}),
 mealAnchors: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealAnchors || {}),
 ...(localNutritionFavorites?.mealAnchors || {}),
 },
 supplementStack: Array.isArray(localNutritionFavorites?.supplementStack) ? localNutritionFavorites.supplementStack : [],
 likedMealPatterns: {
 ...(DEFAULT_NUTRITION_FAVORITES?.likedMealPatterns || {}),
 ...(localNutritionFavorites?.likedMealPatterns || {}),
 },
 dislikedMealPatterns: {
 ...(DEFAULT_NUTRITION_FAVORITES?.dislikedMealPatterns || {}),
 ...(localNutritionFavorites?.dislikedMealPatterns || {}),
 },
 mealPatternFeedback: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealPatternFeedback || {}),
 ...(localNutritionFavorites?.mealPatternFeedback || {}),
 },
 mealCalendarOverrides: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealCalendarOverrides || {}),
 ...(localNutritionFavorites?.mealCalendarOverrides || {}),
 },
 };
 const locationPermissionGranted = Boolean(localFoodContext?.locationPermissionGranted || savedLocation?.status === "granted");
 const locationUnavailable = !locationPermissionGranted && ["denied", "unavailable"].includes(String(localFoodContext?.locationStatus || savedLocation?.status || "").toLowerCase());
 const showNearbySection = locationPermissionGranted;
 const resolvedLocationLabel = showNearbySection
 ? localFoodContext.city || localFoodContext.locationLabel || "Nearby area"
 : "";
 const hasSavedStorePreference = Boolean(localFoodContext.groceryOptions?.[0] || favorites?.groceries?.[0]?.name || favorites?.groceries?.[0]);
 const [store, setStore] = useState(localFoodContext.groceryOptions?.[0] || favorites?.groceries?.[0]?.name || favorites?.groceries?.[0] || "Saved default");
 const EMPTY_NUTRITION_CHECK = { deviationKind: "", issue: "", note: "" };
 const [nutritionCheck, setNutritionCheck] = useState(EMPTY_NUTRITION_CHECK);
 const [nutritionSavePhase, setNutritionSavePhase] = useState(SAVE_FEEDBACK_PHASES.idle);
 const [nutritionSaveDetail, setNutritionSaveDetail] = useState("");
 const [nutritionSaveError, setNutritionSaveError] = useState("");
 const [nutritionSavedAtLabel, setNutritionSavedAtLabel] = useState("");
 const [lastKey, setLastKey] = useState("");
 const [hydrationOz, setHydrationOz] = useState(0);
 const [hydrationNudgedAt, setHydrationNudgedAt] = useState(null);
 const [showHydrationNudge, setShowHydrationNudge] = useState(false);
 const [supplementTaken, setSupplementTaken] = useState({});
 const [openSupplementInfo, setOpenSupplementInfo] = useState("");
 const [newSupplementName, setNewSupplementName] = useState("");
 const [newSupplementTiming, setNewSupplementTiming] = useState("");
 const [mealAnchorDrafts, setMealAnchorDrafts] = useState({
 breakfast: "",
 lunch: "",
 travelFallback: "",
 emergencyOrder: "",
 });
 const goalContext = getGoalContext(goals) || { primary: null, secondary: [] };
 const dayType = normalizeNutritionDayType(nutritionLayer?.dayType || todayWorkout?.nutri || NUTRITION_DAY_TYPES.runEasy);
 const city = showNearbySection ? resolvedLocationLabel : "";
 const nearby = (showNearbySection
 ? getPlaceRecommendations({ city, dayType, favorites, mode: "nearby", query: "" })
 : [])
 .map((x, i) => ({ id: x?.id || `nearby_${i}_${x?.name || "option"}`, name: x?.name || "Nearby option", meal: x?.meal || "Protein + carbs + produce" }))
 .filter(x => x.id !== lastKey)
 .slice(0, 2);
 const locationAwareOrder = showNearbySection ? buildLocationAwareOrderSuggestion({ nearby }) : null;
 const basket = buildGroceryBasket({ store, city, days: 3, dayType });
 const fastest = nearby[0] || { name: "Saved default", meal: "Protein shake + fruit + sandwich", tag: "fallback" };
 const travelBreakfast = ["Starbucks: egg bites + oatmeal + banana", "Hotel breakfast: eggs + Greek yogurt + fruit", "Airport: wrap + extra protein + water"];
 const bodyCompActive = goals?.some(g => g.active && g.category === "body_comp");
 const strengthActive = goals?.some(g => g.active && g.category === "strength");
 const runningActive = goals?.some(g => g.active && g.category === "running");
 const hardDay = isHardNutritionDayType(dayType) || ["hard-run", "long-run"].includes(todayWorkout?.type);
 const recoveryDay = isRecoveryNutritionDayType(dayType) || todayWorkout?.type === "rest";
 const strengthDay = isStrengthNutritionDayType(dayType) || ["run+strength", "strength+prehab"].includes(todayWorkout?.type);
 const simplifiedWeek = ["drifting","falling off"].includes(momentum?.momentumState) || learningLayer?.adjustmentBias === "simplify";
 const nutritionUnavailable = !nutritionLayer || !realWorldNutrition;
 const resolvedTargets = nutritionLayer?.targets || { cal: 2500, p: 190, c: 240, f: 70 };
 const phaseMode = (nutritionLayer?.phaseMode || "maintain").toUpperCase();
 const currentPhase = planDayWeek?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
 const todayDate = new Date();
 todayDate.setHours(0, 0, 0, 0);
 const todayKey = sanitizeDisplayText(planDay?.dateKey || todayDate.toISOString().split("T")[0]);
 const yesterday = new Date(todayDate);
 yesterday.setDate(todayDate.getDate() - 1);
 const yesterdayKey = yesterday.toISOString().split("T")[0];
 const yesterdayType = String(logs?.[yesterdayKey]?.type || "");
 const yesterdayIntensity = /(interval|tempo|long|hard|race)/i.test(yesterdayType) ? "high" : /(rest|easy|recovery)/i.test(yesterdayType) ? "low" : "moderate";
 const bw7 = (bodyweights || []).slice(-7).map(x => Number(x?.w)).filter(n => Number.isFinite(n));
 const weightTrend7day = bw7.length >= 2 ? (bw7[bw7.length - 1] - bw7[0]) : 0;
 const macroShiftLine = buildMacroShiftLine({
 yesterdayIntensity,
 todaySessionType: dayType || todayWorkout?.type || "session",
 phase: `${phaseMode}/${currentPhase}`,
 weightTrend7day,
 });
 const latestWeight = Number(bodyweights?.[bodyweights.length - 1]?.w) || Number(personalization?.profile?.weight) || PROFILE.weight || 190;
 const workoutType = todayWorkout?.type || "";
 const intensityBonus = (["hard", "long"].includes(workoutType) || isHardNutritionDayType(dayType))
 ? 30
 : (["easy", "otf", "strength"].includes(workoutType) || isStrengthNutritionDayType(dayType) || dayType === NUTRITION_DAY_TYPES.runEasy)
 ? 18
 : 8;
 const storedHydrationTargetOz = Number(nutritionLayer?.targets?.hydrationTargetOz || nutritionLayer?.hydrationTargetOz || 0) || 0;
 const inferredHydrationTargetOz = Math.max(80, Math.round((latestWeight * 0.5) + intensityBonus));
 const hydrationTargetOz = storedHydrationTargetOz || inferredHydrationTargetOz;
 const hydrationTargetLabel = storedHydrationTargetOz ? `Target ${hydrationTargetOz} oz` : `Suggested ${hydrationTargetOz} oz`;
 const hydrationPct = Math.max(0, Math.min(100, Math.round(((hydrationOz || 0) / hydrationTargetOz) * 100)));
 const savedMealAnchors = {
 breakfast: String(favorites?.mealAnchors?.breakfast || "").trim(),
 lunch: String(favorites?.mealAnchors?.lunch || "").trim(),
 travelFallback: String(favorites?.mealAnchors?.travelFallback || "").trim(),
 emergencyOrder: String(favorites?.mealAnchors?.emergencyOrder || "").trim(),
 };

 const proteinLevel = `${Math.round(resolvedTargets.p)}g`;
 const carbLevel = `${Math.round(resolvedTargets.c)}g`;
 const calorieLevel = `${Math.round(resolvedTargets.cal)} kcal`;
 const targetChangeSummary = sanitizeDisplayText(nutritionLayer?.targetChangeSummary || macroShiftLine);
 const breakfast = realWorldNutrition?.mealStructure?.breakfast || "Greek yogurt + fruit + granola";
 const lunch = realWorldNutrition?.mealStructure?.lunch || "Protein bowl with rice/potatoes + veggies";
 const dinner = realWorldNutrition?.mealStructure?.dinner || "Lean protein + carb + vegetable";
 const snack = realWorldNutrition?.mealStructure?.snack || (hardDay ? "Banana + protein shake" : "Apple + string cheese");
 const mealSlots = Array.isArray(realWorldNutrition?.mealSlots) ? realWorldNutrition.mealSlots : [];
 const dailyRecommendations = Array.isArray(realWorldNutrition?.dailyRecommendations) ? realWorldNutrition.dailyRecommendations : [];
 const whyThisToday = realWorldNutrition?.whyToday || macroShiftLine;
 const performanceGuidance = realWorldNutrition?.performanceGuidance || null;
 const adaptiveContext = realWorldNutrition?.adaptiveContext || null;
 const performanceGuidanceRows = performanceGuidance
 ? [
 { key: "day_before", label: "DAY BEFORE", line: sanitizeDisplayText(performanceGuidance.dayBefore || "") },
 { key: "day_of", label: "DAY OF", line: sanitizeDisplayText(performanceGuidance.dayOf || "") },
 { key: "during", label: "DURING", line: sanitizeDisplayText(performanceGuidance.during || "") },
 { key: "recovery", label: "RECOVERY", line: sanitizeDisplayText(performanceGuidance.recovery || "") },
 { key: "hydration", label: "HYDRATION", line: sanitizeDisplayText(performanceGuidance.hydration || "") },
 { key: "sodium", label: "SODIUM", line: sanitizeDisplayText(performanceGuidance.sodium || "") },
 ].filter((entry) => Boolean(entry.line))
 : [];
 const adaptiveContextRows = adaptiveContext
 ? [
 { key: "phase", label: adaptiveContext?.phase?.label || "Phase", line: sanitizeDisplayText(adaptiveContext?.phase?.line || "") },
 { key: "trend", label: adaptiveContext?.trend?.label || "Trend", line: sanitizeDisplayText(adaptiveContext?.trend?.line || "") },
 { key: "energy", label: adaptiveContext?.energy?.label || "Energy model", line: sanitizeDisplayText(adaptiveContext?.energy?.line || "") },
 { key: "adjustment", label: adaptiveContext?.adjustment?.label || "Adjustment", line: sanitizeDisplayText(adaptiveContext?.adjustment?.line || "") },
 ].filter((entry) => Boolean(entry.line))
 : [];
 const emergencyOrder = sanitizeDisplayText(realWorldNutrition?.emergencyOrder || savedMealAnchors.emergencyOrder || "");
 const groceryHooks = realWorldNutrition?.groceryHooks || null;
 const customSupplementStack = Array.isArray(favorites?.supplementStack) ? favorites.supplementStack : [];
 const phaseModeLower = String(nutritionLayer?.phaseMode || "maintain").toLowerCase();
 const sessionKind = String(todayWorkout?.type || dayType || "rest");
 const sessionIntensity = /hard|long|interval|tempo/.test(sessionKind) ? "hard" : /strength|otf|hybrid/.test(sessionKind) ? "moderate" : "easy";
 const nowHour = new Date().getHours();
 const inferredSessionTime = todayWorkout?.sessionTime || todayWorkout?.scheduledTime || (nowHour < 12 ? "morning" : nowHour < 18 ? "afternoon" : "evening");
 const isTravelNoSession = Boolean(nutritionLayer?.travelMode && (recoveryDay || sessionKind === "rest"));
 const directiveSentence = isTravelNoSession
 ? joinDisplayParts(["Travel day with no session", "keep it simple and hit your recovery anchors."])
 : hardDay
 ? joinDisplayParts(["Hard session today", "lead with carbs, close with protein."])
 : strengthDay
 ? joinDisplayParts(["Strength session today", "prioritize protein timing and steady carbs."])
 : recoveryDay
 ? joinDisplayParts(["Recovery day", "keep protein high and appetite decisions simple."])
 : joinDisplayParts(["Steady day", "balanced meals and consistency win."]);
 const shoppingDay = Number(favorites?.shoppingDay ?? 0);
 const todayDow = new Date().getDay();
 const showSundayGrocerySection = todayDow === shoppingDay || todayDow === ((shoppingDay + 6) % 7);
 const describeSupplementPlainText = (name = "") => {
 const lower = String(name || "").toLowerCase();
 if (lower.includes("creatine")) return "Creatine helps your muscles produce quick energy and recover between hard efforts.";
 if (lower.includes("protein")) return "Protein powder is a convenient way to close protein gaps when meals fall short.";
 if (lower.includes("electrolyte")) return "Electrolytes replace sodium and minerals lost in sweat so pacing and energy stay steadier.";
 if (lower.includes("omega")) return "Omega-3s support general recovery and joint comfort when training load builds.";
 if (lower.includes("magnesium")) return "Magnesium supports relaxation and sleep quality, which improves recovery.";
 if (lower.includes("vitamin d")) return "Vitamin D3 supports immune and bone function, especially if sun exposure is inconsistent.";
 return `${name || "This supplement"} supports consistency when food or training constraints are high.`;
 };
 const defaultSupplements = [
 { key: "Creatine", name: "Creatine", defaultTiming: "with breakfast", defaultDose: "5g", product: "Thorne Creatine Monohydrate", contexts: ["daily"] },
 { key: "Protein", name: "Protein", defaultTiming: "post-workout if food protein is low", defaultDose: "1 scoop", product: "Transparent Labs 100% Grass-Fed Whey", contexts: ["hard_day", "strength_day", "if_needed"] },
 { key: "Electrolytes", name: "Electrolytes", defaultTiming: "30 min pre-run", defaultDose: "1 serving", product: "LMNT Electrolyte Drink Mix", contexts: ["hard_day", "travel_day"] },
 { key: "Omega-3", name: "Omega-3", defaultTiming: "with lunch", defaultDose: "2 caps", product: "Nordic Naturals Ultimate Omega", contexts: ["daily"] },
 { key: "Magnesium", name: "Magnesium", defaultTiming: "before bed", defaultDose: "400mg", product: "Doctor's Best High Absorption Magnesium", contexts: ["daily", "recovery_day"] },
 { key: "Vitamin D3", name: "Vitamin D3", defaultTiming: "with first meal", defaultDose: "1 cap", product: "NOW Vitamin D3 2000 IU", contexts: ["daily"] },
 ];
 const approvedSupplementStack = customSupplementStack
 .map((supplement, idx) => ({
 key: `custom_${idx}_${String(supplement?.name || "supplement").toLowerCase().replace(/\s+/g, "_")}`,
 name: supplement?.name || "Custom Supplement",
 defaultTiming: supplement?.timing || "with a meal",
 defaultDose: supplement?.dose || "1 serving",
 product: supplement?.product || `${supplement?.name || "Brand"} (user-selected brand)`,
 contexts: Array.isArray(supplement?.contexts) ? supplement.contexts : ["daily"],
 }))
 .filter((supplement, idx, arr) => idx === arr.findIndex((candidate) => String(candidate?.name || "").toLowerCase() === String(supplement?.name || "").toLowerCase()));
 const supplementCatalog = [
 ...defaultSupplements,
 ...approvedSupplementStack,
 ].filter((supplement, idx, arr) => idx === arr.findIndex((candidate) => String(candidate?.name || "").toLowerCase() === String(supplement?.name || "").toLowerCase()));
 const supplementCatalogByName = Object.fromEntries(supplementCatalog.map((supplement) => [
 String(supplement?.name || "").toLowerCase(),
 supplement,
 ]));
 const activeSupplementItems = Array.isArray(planDay?.resolved?.supplements?.plan?.items)
 ? planDay.resolved.supplements.plan.items
 : [];
 const supplementRows = activeSupplementItems.map((item, index) => {
 const catalog = supplementCatalogByName[String(item?.name || "").toLowerCase()] || {};
 return {
 key: item?.id || `active_supplement_${index}`,
 name: item?.name || catalog.name || "Supplement",
 instruction: [item?.dose || catalog.defaultDose || "", item?.timing || catalog.defaultTiming || ""].filter(Boolean).join(" ").trim(),
 purpose: item?.purpose || catalog.purpose || "",
 product: item?.product || catalog.product || "",
 plain: describeSupplementPlainText(item?.name || catalog.name || "Supplement"),
 };
 });
 const supplementInfoByName = Object.fromEntries([
 ...supplementCatalog,
 ...supplementRows,
 ].map((supplement) => [
 supplement.name,
 {
 plain: describeSupplementPlainText(supplement.name),
 why: `Included for your active goals: ${(goals || []).filter((goal) => goal.active).map((goal) => goal.name).slice(0, 2).join(" + ") || "performance consistency"}.`,
 stop: "Reduce or pause if your clinician advises, if labs indicate no need, or if GI side effects persist for more than a week.",
 product: supplement.product ? `${supplement.product} - Amazon or brand direct.` : "Use the brand and dose you already tolerate well.",
 },
 ]));
 const mealMacroPlan = [
 { key: "breakfast", label: "Breakfast", text: breakfast, split: { p: 0.24, c: 0.27, f: 0.24 } },
 { key: "lunch", label: "Lunch", text: lunch, split: { p: 0.30, c: 0.30, f: 0.28 } },
 { key: "dinner", label: "Dinner", text: dinner, split: { p: 0.31, c: 0.28, f: 0.30 } },
 { key: "snack", label: "Optional snack", text: snack, split: { p: 0.15, c: 0.15, f: 0.18 } },
 ];
 const mealMacroRows = mealMacroPlan.map((m, idx) => {
 const p = Math.round((resolvedTargets.p || 0) * m.split.p);
 const c = Math.round((resolvedTargets.c || 0) * m.split.c);
 const f = Math.round((resolvedTargets.f || 0) * m.split.f);
 const running = mealMacroPlan.slice(0, idx + 1).reduce((acc, cur) => ({
 p: acc.p + Math.round((resolvedTargets.p || 0) * cur.split.p),
 c: acc.c + Math.round((resolvedTargets.c || 0) * cur.split.c),
 f: acc.f + Math.round((resolvedTargets.f || 0) * cur.split.f),
 }), { p: 0, c: 0, f: 0 });
 return { ...m, p, c, f, running };
 });
 const mealSlotByKey = Object.fromEntries(mealSlots.map((slot) => [slot.key, slot]));

 const nutritionLogDateOptions = Array.from({ length: 7 }, (_, offset) => {
 const nextDate = new Date(`${todayKey}T12:00:00`);
 nextDate.setDate(nextDate.getDate() - offset);
 return nextDate.toISOString().split("T")[0];
 });
 const [selectedLogDateKey, setSelectedLogDateKey] = useState(todayKey);
 const selectedLogDateOptionKey = nutritionLogDateOptions.join("|");
 const selectedLogIsToday = selectedLogDateKey === todayKey;
 const formatNutritionLogDateLabel = (dateKey = "") => {
 if (!dateKey) return "Today";
 const safeDate = new Date(`${dateKey}T12:00:00`);
 if (Number.isNaN(safeDate.getTime())) return dateKey;
 const formatted = safeDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
 return dateKey === todayKey ? `${formatted} (Today)` : formatted;
 };
 const actualNutritionToday = nutritionActualLogs?.[todayKey] || planDay?.resolved?.nutrition?.actual || normalizeActualNutritionLog({ dateKey: todayKey, feedback: {} });
 const actualNutritionForSelectedDate = nutritionActualLogs?.[selectedLogDateKey]
 || (selectedLogIsToday ? planDay?.resolved?.nutrition?.actual : null)
 || normalizeActualNutritionLog({ dateKey: selectedLogDateKey, feedback: {} });
 const selectedLogDateLabel = formatNutritionLogDateLabel(selectedLogDateKey);
 const nutritionComparison = planDay?.resolved?.nutrition?.comparison || compareNutritionPrescriptionToActual({
 nutritionPrescription: nutritionLayer,
 actualNutritionLog: actualNutritionToday,
 });
 const nutritionGoalName = goalContext?.primary?.name || "current goal";
  const currentSessionLabel = cleanSurfaceSessionLabel(todayWorkout?.label || todayWorkout?.type || dayType || "session", "session");
 const nutritionBasisLabel = planDay?.resolved?.nutrition?.prescription
 ? "stored nutrition target for today"
 : "suggested nutrition defaults for today";
 const nutritionProvenance = buildProvenanceText({
 inputs: [
 nutritionBasisLabel,
 `your current goal (${nutritionGoalName})`,
 "time of day",
 actualNutritionToday?.loggedAt ? "your logged nutrition today" : null,
 ],
 limitation: actualNutritionToday?.loggedAt ? "" : "Today's intake log is limited.",
 });
 const recoveryPrescription = planDay?.resolved?.recovery?.prescription || null;
 const supplementPlan = planDay?.resolved?.supplements?.plan || null;
  const canonicalNutritionLabel = resolveCanonicalSurfaceSessionLabel({
  sessionType: surfaceModel?.display?.sessionType || "",
  sessionLabel: surfaceModel?.display?.sessionLabel
  || currentSessionLabel
  || "Today's session",
  fallback: "Today's session",
  isHybrid: Boolean(todayWorkout?.run && todayWorkout?.strengthDuration)
  || String(todayWorkout?.type || "").toLowerCase() === "run+strength",
  });
 const canonicalNutritionReason = sanitizeDisplayText(
 surfaceModel?.canonicalReasonLine
 || surfaceModel?.preferenceAndAdaptationLine
 || nutritionProvenance
 );
 const hasStoredSupplementPlan = activeSupplementItems.length > 0;
 const showSupplementChecklist = supplementRows.length > 0;
 const supplementPrescriptionLine = hasStoredSupplementPlan
 ? `Active today: ${activeSupplementItems.slice(0, 3).map((item) => `${item.name} (${item.timing})`).join(" - ")}`
 : approvedSupplementStack.length
 ? "You have an approved supplement stack, but nothing is active for today's training and recovery context."
 : "No supplement stack is approved yet. Add only the supplements you actually use.";
 const approvedSupplementLine = approvedSupplementStack.length
 ? `${approvedSupplementStack.length} approved item${approvedSupplementStack.length === 1 ? "" : "s"} stored for contextual use.`
 : "Approved supplements are opt-in. Nothing becomes a checklist until you add it here.";
 const hydrationSupportLine = storedHydrationTargetOz
 ? recoveryPrescription?.hydrationSupport?.summary || `Stored hydration target: ${Math.round(storedHydrationTargetOz)} oz.`
 : "No explicit hydration target is stored for today. The tracker below uses a suggested baseline from bodyweight and session load.";
 const weeklyNutritionHeadline = weeklyNutritionReview?.coaching?.headline || "Your weekly meal strategy sharpens as real days get logged.";
 const weeklyPlannedVsActualLine = weeklyNutritionReview?.coaching?.plannedVsActualLine || "Keep the plan separate from what actually happened so next week's guidance stays realistic.";
 const weeklyAdherenceLine = weeklyNutritionReview?.adherence?.summary || "Still learning which days feel easiest to execute.";
 const weeklyHydrationLine = weeklyNutritionReview?.hydration?.summary || "Hydration pattern is still coming into focus.";
const weeklySupplementLine = weeklyNutritionReview?.supplements?.summary || "Supplement routine is optional and still taking shape.";
const weeklyFrictionLine = weeklyNutritionReview?.friction?.summary || "No repeating meal friction has stood out yet.";
const weeklyAdaptationLine = weeklyNutritionReview?.adaptation?.summary || "Stay with the current meal structure next week.";
const weeklyTopCauses = Array.isArray(weeklyNutritionReview?.friction?.topCauses)
 ? weeklyNutritionReview.friction.topCauses.slice(0, 2)
 : [];
useEffect(() => {
if (nutritionLogDateOptions.includes(selectedLogDateKey)) return;
setSelectedLogDateKey(todayKey);
}, [todayKey, selectedLogDateKey, selectedLogDateOptionKey]);
useEffect(() => {
setNutritionSavePhase(SAVE_FEEDBACK_PHASES.idle);
setNutritionSaveDetail("");
setNutritionSaveError("");
setNutritionSavedAtLabel("");
}, [selectedLogDateKey]);
useEffect(() => {
setMealAnchorDrafts({
breakfast: savedMealAnchors.breakfast,
 lunch: savedMealAnchors.lunch,
 travelFallback: savedMealAnchors.travelFallback,
 emergencyOrder: savedMealAnchors.emergencyOrder,
 });
 }, [savedMealAnchors.breakfast, savedMealAnchors.lunch, savedMealAnchors.travelFallback, savedMealAnchors.emergencyOrder]);
 useEffect(() => {
 if (!actualNutritionForSelectedDate?.loggedAt) {
 setNutritionCheck(EMPTY_NUTRITION_CHECK);
 setHydrationOz(0);
 setHydrationNudgedAt(null);
 setSupplementTaken({});
 setShowHydrationNudge(false);
 return;
 }
 setNutritionCheck({
 deviationKind: actualNutritionForSelectedDate?.deviationKind || "",
 issue: actualNutritionForSelectedDate?.issue || "",
 note: actualNutritionForSelectedDate?.note || "",
 });
 setHydrationOz(Number(actualNutritionForSelectedDate?.hydration?.oz || 0));
 setHydrationNudgedAt(actualNutritionForSelectedDate?.hydration?.nudgedAt || null);
 setSupplementTaken(actualNutritionForSelectedDate?.supplements?.takenMap || {});
 setShowHydrationNudge(false);
 }, [
 selectedLogDateKey,
 actualNutritionForSelectedDate?.loggedAt,
 actualNutritionForSelectedDate?.deviationKind,
 actualNutritionForSelectedDate?.issue,
 actualNutritionForSelectedDate?.note,
 actualNutritionForSelectedDate?.hydration?.oz,
 actualNutritionForSelectedDate?.hydration?.nudgedAt,
 JSON.stringify(actualNutritionForSelectedDate?.supplements?.takenMap || {}),
 ]);
 useEffect(() => {
 if (!selectedLogIsToday) return;
 const hour = new Date().getHours();
 if (hour < 15 || hydrationPct >= 50 || hydrationNudgedAt || showHydrationNudge) return;
 setShowHydrationNudge(true);
 const nudgedAt = Date.now();
 setHydrationNudgedAt(nudgedAt);
 }, [hydrationPct, hydrationNudgedAt, selectedLogIsToday, showHydrationNudge, todayKey]);
const hasExplicitNutritionSignal = (payload = {}) => {
const safePayload = payload || {};
return Boolean(
String(safePayload?.deviationKind || "").trim()
 || String(safePayload?.issue || "").trim()
 || String(safePayload?.note || "").trim()
 || Number(safePayload?.hydrationOz || 0) > 0
 || Object.values(safePayload?.supplementTaken || {}).some(Boolean)
);
};
const persistNutritionFeedback = async (payload, successMessage = "Saved nutrition update.") => {
if (!hasExplicitNutritionSignal(payload)) return;
startNutritionSave("Saving your nutrition update.");
const result = await saveNutritionActualLog(selectedLogDateKey, payload);
if (!result?.ok) {
failNutritionSave("Nutrition update did not save. Try again.");
return;
}
finishNutritionSave(successMessage);
};
 const nutritionQuickLogReady = hasExplicitNutritionSignal({
 ...nutritionCheck,
 hydrationOz,
 supplementTaken,
 });
 const logHydration = async (oz = 12) => {
 const nextHydration = applyHydrationQuickAdd({
 currentOz: hydrationOz,
 targetOz: hydrationTargetOz,
 incrementOz: oz,
 });
 setHydrationOz(nextHydration.hydrationOz);
 await persistNutritionFeedback({ ...nutritionCheck, hydrationOz: nextHydration.hydrationOz, hydrationTargetOz, hydrationNudgedAt }, "Hydration saved.");
 };
 const toggleSupplementTaken = async (name) => {
 const nextTaken = { ...supplementTaken, [name]: !supplementTaken?.[name] };
 setSupplementTaken(nextTaken);
 await persistNutritionFeedback({ ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt, supplementTaken: nextTaken }, "Supplement update saved.");
 };
const saveMealAnchors = async () => {
const nextAnchors = {
breakfast: String(mealAnchorDrafts?.breakfast || "").trim(),
lunch: String(mealAnchorDrafts?.lunch || "").trim(),
travelFallback: String(mealAnchorDrafts?.travelFallback || "").trim(),
emergencyOrder: String(mealAnchorDrafts?.emergencyOrder || "").trim(),
};
startNutritionSave("Saving your meal anchors.");
const nextFavorites = { ...favorites, mealAnchors: nextAnchors };
const result = await saveNutritionFavorites(nextFavorites);
if (!result?.ok) {
failNutritionSave("Meal anchors did not save. Try again.");
return;
}
setLocalNutritionFavorites(nextFavorites);
finishNutritionSave("Meal anchors saved.");
};
 const getMealPatternVote = (preferenceKey = "") => {
 const safeKey = String(preferenceKey || "").trim().toLowerCase();
 if (!safeKey) return "";
 const explicitVote = String(favorites?.mealPatternFeedback?.[safeKey] || "").trim().toLowerCase();
 if (["liked", "disliked"].includes(explicitVote)) return explicitVote;
 if (favorites?.likedMealPatterns?.[safeKey]) return "liked";
 if (favorites?.dislikedMealPatterns?.[safeKey]) return "disliked";
 return "";
 };
 const saveMealPatternVote = async (preferenceKey, vote) => {
 const safeKey = String(preferenceKey || "").trim().toLowerCase();
 const safeVote = String(vote || "").trim().toLowerCase();
 if (!safeKey || !["liked", "disliked"].includes(safeVote)) return;
 const currentVote = getMealPatternVote(safeKey);
 const removing = currentVote === safeVote;
 const nextLikedMealPatterns = { ...(favorites?.likedMealPatterns || {}) };
 const nextDislikedMealPatterns = { ...(favorites?.dislikedMealPatterns || {}) };
 const nextMealPatternFeedback = { ...(favorites?.mealPatternFeedback || {}) };
 delete nextLikedMealPatterns[safeKey];
 delete nextDislikedMealPatterns[safeKey];
 if (removing) delete nextMealPatternFeedback[safeKey];
 else {
 nextMealPatternFeedback[safeKey] = safeVote;
 if (safeVote === "liked") nextLikedMealPatterns[safeKey] = true;
 if (safeVote === "disliked") nextDislikedMealPatterns[safeKey] = true;
 }
 startNutritionSave(removing ? "Removing meal feedback." : safeVote === "liked" ? "Saving meal like." : "Saving meal avoid.");
 const nextFavorites = {
  ...favorites,
  likedMealPatterns: nextLikedMealPatterns,
  dislikedMealPatterns: nextDislikedMealPatterns,
  mealPatternFeedback: nextMealPatternFeedback,
 };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal feedback did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave(
  removing
   ? "Meal feedback removed."
   : safeVote === "liked"
   ? "Meal moved up in the rotation."
   : "Meal moved down in the rotation."
 );
 };
 const rotateMealCalendarSlot = async (dateKey, slotKey) => {
 const safeDateKey = String(dateKey || "").trim();
 const safeSlotKey = String(slotKey || "").trim().toLowerCase();
 if (!safeDateKey || !safeSlotKey) return;
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 const nextDateOverrides = { ...(nextOverrides?.[safeDateKey] || {}) };
 const currentSeedOffset = Math.max(0, Math.round(Number(nextDateOverrides?.[safeSlotKey]?.seedOffset || 0)));
 nextDateOverrides[safeSlotKey] = {
  mode: "pattern",
  seedOffset: currentSeedOffset + 1,
 };
 nextOverrides[safeDateKey] = nextDateOverrides;
 startNutritionSave("Rotating this meal slot.");
 const nextFavorites = {
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal rotation did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Weekly meal slot rotated.");
 };
 const resetMealCalendarSlot = async (dateKey, slotKey) => {
 const safeDateKey = String(dateKey || "").trim();
 const safeSlotKey = String(slotKey || "").trim().toLowerCase();
 if (!safeDateKey || !safeSlotKey) return;
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 const nextDateOverrides = { ...(nextOverrides?.[safeDateKey] || {}) };
 delete nextDateOverrides[safeSlotKey];
 if (Object.keys(nextDateOverrides).length > 0) nextOverrides[safeDateKey] = nextDateOverrides;
 else delete nextOverrides[safeDateKey];
 startNutritionSave("Resetting this meal slot.");
 const nextFavorites = {
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal reset did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Meal slot reset to the default rotation.");
 };
 const resetVisibleWeekMealCalendar = async () => {
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 (weeklyMealCalendarModel?.days || []).forEach((day) => {
  if (day?.dateKey) delete nextOverrides[day.dateKey];
 });
 startNutritionSave("Resetting this week's meal calendar.");
 const nextFavorites = {
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Weekly meal calendar did not reset. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Weekly meal calendar reset.");
 };
 const toggleApprovedSupplement = async (supplement) => {
 const nextName = String(supplement?.name || "").trim();
 if (!nextName) return;
 const exists = approvedSupplementStack.some((item) => String(item?.name || "").toLowerCase() === nextName.toLowerCase());
 const nextStack = exists
 ? approvedSupplementStack.filter((item) => String(item?.name || "").toLowerCase() !== nextName.toLowerCase())
 : [
 ...approvedSupplementStack,
 {
 name: supplement.name,
 timing: supplement.defaultTiming,
 dose: supplement.defaultDose,
 product: supplement.product,
 contexts: supplement.contexts || ["daily"],
 },
 ];
 startNutritionSave("Saving your approved supplements.");
 const nextFavorites = { ...favorites, supplementStack: nextStack };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
 failNutritionSave("Supplement changes did not save. Try again.");
 return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave(exists ? "Supplement removed from your saved stack." : "Supplement added to your saved stack.");
 };
 const addCustomSupplement = async () => {
 if (!newSupplementName.trim() || !newSupplementTiming.trim()) return;
 const nextStack = [
 ...approvedSupplementStack,
 { name: newSupplementName.trim(), timing: newSupplementTiming.trim(), contexts: ["daily"] },
 ];
 startNutritionSave("Saving your supplement defaults.");
 const nextFavorites = { ...favorites, supplementStack: nextStack };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
 failNutritionSave("Supplement defaults did not save. Try again.");
 return;
 }
 setLocalNutritionFavorites(nextFavorites);
 setNewSupplementName("");
 setNewSupplementTiming("");
 finishNutritionSave("Supplement defaults saved.");
 };
 const removeCustomSupplement = async (name) => {
 const nextStack = approvedSupplementStack.filter((x) => String(x?.name || "").toLowerCase() !== String(name || "").toLowerCase());
 startNutritionSave("Saving your supplement defaults.");
 const nextFavorites = { ...favorites, supplementStack: nextStack };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
 failNutritionSave("Supplement defaults did not save. Try again.");
 return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Supplement defaults saved.");
 };

 const nutritionTone = buildReviewBadgeTone(nutritionComparison?.adherence || nutritionComparison?.deviationKind, C);
 const targetTone = buildReviewBadgeTone(sessionIntensity === "hard" ? "progression" : recoveryDay ? "recovery" : "match", C);
 const comparisonLabel = actualNutritionToday?.loggedAt
 ? `${sanitizeStatusLabel(nutritionComparison?.adherence, "logged")} - ${sanitizeStatusLabel(nutritionComparison?.deviationKind, "matched")}`
 : "Not logged yet";
 const complianceLine = actualNutritionToday?.loggedAt
 ? sanitizeDisplayText(nutritionComparison?.summary || "Nutrition logged.")
: "Log a quick outcome once the day settles so today's plan and what you actually ate stay clear.";
 const savedFallbackMeal = sanitizeDisplayText(
 savedMealAnchors.lunch
 || savedMealAnchors.breakfast
 || favorites?.safeMeals?.[0]?.meal
 || favorites?.safeMeals?.[0]?.name
 || favorites?.defaultMeals?.[0]?.meal
 || favorites?.defaultMeals?.[0]?.name
 || ""
 );
 const fastFallback = locationAwareOrder || (showNearbySection
 ? `${fastest.name}: ${fastest.meal}`
 : nutritionLayer?.travelMode
 ? savedMealAnchors.travelFallback || travelBreakfast[0]
 : emergencyOrder
 ? `Emergency order: ${emergencyOrder}`
 : savedFallbackMeal
 ? `Saved default: ${savedFallbackMeal}`
 : "Use your default: protein + carb + fruit + water.");
 const approvedSupplementNames = new Set(
 approvedSupplementStack.map((supplement) => String(supplement?.name || "").toLowerCase())
 );
 const approvedCustomSupplements = approvedSupplementStack.filter((supplement) => (
 !defaultSupplements.some((preset) => String(preset?.name || "").toLowerCase() === String(supplement?.name || "").toLowerCase())
 ));
 const breakfastAnchorSuggestion = sanitizeDisplayText(mealSlotByKey.breakfast?.primary || breakfast);
 const lunchAnchorSuggestion = sanitizeDisplayText(mealSlotByKey.lunch?.primary || lunch);
 const travelAnchorSuggestion = sanitizeDisplayText(
 savedMealAnchors.travelFallback
 || mealSlotByKey.breakfast?.travelSwap
 || mealSlotByKey.lunch?.travelSwap
 || travelBreakfast[0]
 );
 const emergencyOrderLine = emergencyOrder || "No emergency takeout order is saved yet.";
 const travelOrGroceryTitle = nutritionLayer?.travelMode ? "TRAVEL OPTION" : "GROCERY HOOK";
 const travelOrGroceryLine = nutritionLayer?.travelMode
 ? travelAnchorSuggestion
 : hasSavedStorePreference
 ? `${store}: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`
 : `Suggested staples: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`;
const nutritionSurfaceModel = buildNutritionSurfaceModel({
dayType,
todayWorkout,
nutritionLayer,
 realWorldNutrition,
 weeklyNutritionReview,
 nutritionComparison,
 hydrationOz,
 hydrationTargetOz,
fallbackMeal: fastFallback,
});
const executionPlan = nutritionSurfaceModel?.executionPlan || realWorldNutrition?.executionPlan || null;
const executionPlanSections = Array.isArray(executionPlan?.sections) ? executionPlan.sections : [];
const weeklyNutritionGroceryModel = useMemo(() => buildWeeklyNutritionGroceryModel({
planWeek: planDayWeek?.planWeek || null,
nutritionLayer,
 goalContext,
 favorites,
 momentum,
 learningLayer,
 location: city,
 }), [planDayWeek?.planWeek, nutritionLayer, goalContext, favorites, momentum, learningLayer, city]);
const weeklyMealCalendarModel = useMemo(() => buildWeeklyNutritionCalendarModel({
 planWeek: planDayWeek?.planWeek || null,
 nutritionLayer,
 goalContext,
 favorites,
 momentum,
 learningLayer,
 location: city,
 todayKey,
 }), [planDayWeek?.planWeek, nutritionLayer, goalContext, favorites, momentum, learningLayer, city, todayKey]);
 const executionPlanMacroTargets = Array.isArray(executionPlan?.macroTargets) && executionPlan.macroTargets.length
 ? executionPlan.macroTargets
 : [
 { label: "Calories", value: calorieLevel, suffix: "" },
 { label: "Protein", value: proteinLevel, suffix: " (must hit)" },
 { label: "Carbs", value: carbLevel, suffix: "" },
 { label: "Fat", value: `${Math.round(resolvedTargets.f || 0)}g`, suffix: "" },
 ];
 const executionPlanTitle = sanitizeDisplayText(executionPlan?.title || "Today's execution plan");
 const executionPlanFocusLine = sanitizeDisplayText(executionPlan?.focusLine || directiveSentence || "Balanced meals, stable energy, and low-friction execution.");
 const executionPlanWhyLine = sanitizeDisplayText(executionPlan?.whyLine || whyThisToday || "Meals are organized around the work instead of random decisions.");
 const compressNutritionCopy = (text = "", maxLen = 110) => {
 const normalized = String(text || "").replace(/\s+/g, " ").trim();
 if (!normalized) return "";
 if (normalized.length <= maxLen) return normalized;
 return `${normalized.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
 };
 const compactDirectiveSentence = compressNutritionCopy(directiveSentence, 78);
 const compactNutritionReason = sanitizeDisplayText(canonicalNutritionReason || nutritionProvenance);
 const compactTargetChangeSummary = targetChangeSummary && targetChangeSummary !== canonicalNutritionReason
 ? compressNutritionCopy(targetChangeSummary, 88)
 : "";
 const compactComplianceLine = compressNutritionCopy(complianceLine, 88);
 const visiblePerformanceGuidanceRows = performanceGuidanceRows.slice(0, 3);
 const compactAdaptiveContextRows = adaptiveContextRows.slice(0, 2);
 const compactWhyThisToday = compressNutritionCopy(whyThisToday, 92);
 const compactDailyRecommendations = dailyRecommendations
 .slice(0, 2)
 .map((line) => compressNutritionCopy(line, 72))
 .filter(Boolean);
 const compactWeeklyNutritionHeadline = compressNutritionCopy(weeklyNutritionHeadline, 84);
 const compactWeeklyPlannedVsActualLine = compressNutritionCopy(weeklyPlannedVsActualLine, 88);
 const compactWeeklyFrictionLine = compressNutritionCopy(weeklyFrictionLine, 84);
 const compactHydrationSupportLine = compressNutritionCopy(hydrationSupportLine, 88);
 const compactSupplementPrescriptionLine = compressNutritionCopy(supplementPrescriptionLine, 88);
const compactApprovedSupplementLine = compressNutritionCopy(approvedSupplementLine, 88);
const compactNutritionHeroLine = compressNutritionCopy(nutritionSurfaceModel?.heroLine || compactDirectiveSentence, 112);
const compactNutritionTargetBiasLine = compressNutritionCopy(nutritionSurfaceModel?.targetBiasLine || "", 88);
const compactNutritionStrategySummary = compressNutritionCopy(nutritionSurfaceModel?.strategySummary || compactWhyThisToday, 118);
 const executionPlanObjectives = Array.isArray(executionPlan?.objectiveItems) && executionPlan.objectiveItems.length
 ? executionPlan.objectiveItems
 : [
 compactDirectiveSentence || "Stay consistent today.",
 `Hit protein (${proteinLevel})`,
 hardDay || strengthDay ? "Keep carbs visible around training." : "Keep the day low friction.",
 "No decision fatigue.",
 ].filter(Boolean).slice(0, 4);
 const executionPlanRules = Array.isArray(executionPlan?.executionRules) && executionPlan.executionRules.length
 ? executionPlan.executionRules
 : [
 hardDay || strengthDay
 ? "Eat normally today. Saving calories now usually backfires later."
 : "Keep meals normal and repeatable today.",
 recoveryDay
 ? "Recovery still needs real meals."
 : "Keep protein high and let carbs match the work.",
 nutritionLayer?.travelMode
 ? "Travel rule: protein first, carb second, sauce last."
 : "Prep tomorrow quietly before the night gets busy.",
 ].filter(Boolean).slice(0, 4);
const nutritionStrategyRows = Array.isArray(nutritionSurfaceModel?.strategyRows)
? nutritionSurfaceModel.strategyRows
: [];
const nutritionAdjustmentRows = Array.isArray(nutritionSurfaceModel?.adjustments)
 ? nutritionSurfaceModel.adjustments
 : [];
 const compactFuelingDetailSummary = compactDailyRecommendations[0]
 || compressNutritionCopy(performanceGuidance?.priorityLine || whyThisToday, 96)
 || compactDirectiveSentence;
 const compactApprovedSupplementEmptyLine = approvedSupplementStack.length
 ? "Approved stack saved."
 : "No approved supplements saved yet.";
 const startNutritionSave = (detail = "Saving your nutrition update.") => {
 setNutritionSavePhase(SAVE_FEEDBACK_PHASES.saving);
 setNutritionSaveDetail(detail);
 setNutritionSaveError("");
 };
 const finishNutritionSave = (detail = "Nutrition is up to date.") => {
 const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
 setNutritionSavedAtLabel(stamp);
 setNutritionSaveDetail(detail);
 setNutritionSaveError("");
 setNutritionSavePhase(SAVE_FEEDBACK_PHASES.saved);
 };
 const failNutritionSave = (message = "Nutrition update did not save. Try again.") => {
 setNutritionSaveError(message);
 setNutritionSavePhase(SAVE_FEEDBACK_PHASES.error);
 };
 const nutritionSaveFeedbackModel = buildSaveFeedbackModel({
 phase: nutritionSavePhase,
 syncState: syncStateModel,
 savedAtLabel: nutritionSavedAtLabel,
 successMessage: nutritionSaveDetail,
 savingMessage: nutritionSaveDetail,
 errorMessage: nutritionSaveError,
 });
 const showNutritionQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");

 return (
 <div className="fi" data-testid="nutrition-tab" style={{ display:"grid", gap:"0.75rem" }}>
 {syncSurfaceModel?.showFullCard && (
 <SyncStateCallout
 model={syncSurfaceModel}
 dataTestId="nutrition-sync-status"
 compact
 style={{ background:"rgba(11, 20, 32, 0.76)" }}
 />
 )}
 <div data-testid="nutrition-execution-plan-header" className="card card-soft card-action" style={{ borderColor:C.blue+"28" }}>
 <div style={{ display:"grid", gap:"0.28rem", marginBottom:"0.55rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>{executionPlanTitle.toUpperCase()}</div>
 <span className="ui-pill" style={{ color:C.blue, background:`${C.blue}12`, borderColor:`${C.blue}22` }}>
 {sanitizeDisplayText(nutritionSurfaceModel?.laneLabel || sanitizeStatusLabel(dayType, "today"))}
 </span>
 </div>
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Focus</div>
 <div style={{ fontSize:"0.68rem", color:"#f8fafc", lineHeight:1.35 }}>{executionPlanFocusLine}</div>
 </div>
 {!!canonicalNutritionLabel && (
 <div data-testid="nutrition-canonical-session-label" style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {canonicalNutritionLabel}
 </div>
 )}
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Why today</div>
 <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.5 }}>{executionPlanWhyLine}</div>
 </div>
 {!!canonicalNutritionReason && canonicalNutritionReason !== executionPlanWhyLine && (
 <div data-testid="nutrition-canonical-reason" style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {canonicalNutritionReason}
 </div>
 )}
 {!!surfaceModel?.explanationSourceLabel && (
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 {surfaceModel.explanationSourceLabel}
 </div>
 )}
 {nutritionSaveFeedbackModel.show && (
 <StateFeedbackBanner
 model={nutritionSaveFeedbackModel}
 dataTestId="nutrition-save-status"
 compact
 />
 )}
 {showNutritionQuietSyncChip && (
 <CompactSyncStatus
 model={syncSurfaceModel}
 dataTestId="nutrition-sync-status"
 style={{
 background:"rgba(11, 20, 32, 0.32)",
 opacity:0.88,
 }}
 />
 )}
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.35rem" }}>
 {executionPlanMacroTargets.map((row, index) => {
 const tone = row.label === "Protein" ? C.red : row.label === "Carbs" ? C.green : row.label === "Calories" ? C.amber : "#dbe7f6";
 return (
 <div key={`${row.label}_${index}`} style={{ border:"1px solid #22324a", borderRadius:10, background:"#0f172a", padding:"0.5rem 0.55rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>{sanitizeDisplayText(row.label)}</div>
 <div style={{ fontSize:"0.62rem", color:tone, marginTop:"0.12rem" }}>
 {sanitizeDisplayText(`${row.value || ""}${row.suffix || ""}`)}
 </div>
 </div>
 );
 })}
 </div>
 <div data-testid="nutrition-plan-objectives" style={{ display:"grid", gap:"0.16rem", marginTop:"0.46rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Objective</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.28rem" }}>
 {executionPlanObjectives.map((item, index) => (
 <div key={`nutrition_objective_${index}`} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0b1321", padding:"0.46rem 0.52rem", fontSize:"0.52rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {sanitizeDisplayText(item)}
 </div>
 ))}
 </div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", marginTop:"0.42rem" }}>
 <span className="ui-pill" style={{ color:nutritionTone.color, background:nutritionTone.bg, borderColor:"transparent" }}>
 {comparisonLabel}
 </span>
 </div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45, marginTop:"0.45rem" }}>
 {compactComplianceLine}
 </div>
 </div>

<div data-testid="nutrition-execution-plan-meals" className="card card-subtle" style={{ borderColor:C.amber+"28" }}>
<div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
<div className="sect-title" style={{ color:C.amber, marginBottom:0 }}>TODAY'S MEALS</div>
 <div style={{ fontSize:"0.58rem", color:"#f8fafc", lineHeight:1.45 }}>{compactNutritionStrategySummary}</div>
</div>
<div style={{ display:"grid", gap:"0.4rem" }}>
{executionPlanSections.map((section, sectionIndex) => {
const sectionPreferenceKey = String(section.preferenceKey || "").trim().toLowerCase();
const sectionCanVote = section.sourceType !== "anchor" && Boolean(sectionPreferenceKey);
const sectionVote = sectionCanVote ? getMealPatternVote(sectionPreferenceKey) : "";
const sectionLiked = sectionVote === "liked";
const sectionDisliked = sectionVote === "disliked";
return (
<div key={section.key || `execution_meal_${sectionIndex}`} style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.72rem 0.8rem", display:"grid", gap:"0.32rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.45rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.08rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(section.label || "Meal")}</div>
 <div style={{ fontSize:"0.68rem", color:"#f8fafc", lineHeight:1.35, fontWeight:600 }}>{sanitizeDisplayText(section.title || "Meal build")}</div>
 {!!section.targetLine && (
 <div style={{ fontSize:"0.5rem", color:"#9fb2d2", lineHeight:1.45 }}>{sanitizeDisplayText(section.targetLine)}</div>
 )}
 </div>
 {!!sectionCanVote && (
 <div style={{ display:"flex", gap:"0.22rem", flexWrap:"wrap" }}>
 <button
 data-testid={`nutrition-like-meal-${section.key || sectionIndex}`}
 className="btn"
 onClick={()=>saveMealPatternVote(sectionPreferenceKey, "liked")}
 style={{
 fontSize:"0.48rem",
 borderColor:sectionLiked ? C.green : "#2a3b56",
 color:sectionLiked ? C.green : "#dbe7f6",
 background:sectionLiked ? `${C.green}12` : "transparent",
 }}
 >
 {sectionLiked ? "Liked" : "Thumbs up"}
 </button>
 <button
 data-testid={`nutrition-dislike-meal-${section.key || sectionIndex}`}
 className="btn"
 onClick={()=>saveMealPatternVote(sectionPreferenceKey, "disliked")}
 style={{
 fontSize:"0.48rem",
 borderColor:sectionDisliked ? C.red : "#2a3b56",
 color:sectionDisliked ? C.red : "#dbe7f6",
 background:sectionDisliked ? `${C.red}12` : "transparent",
 }}
 >
 {sectionDisliked ? "Avoiding" : "Thumbs down"}
 </button>
 </div>
 )}
 </div>
 {!!section.buildItems?.length && (
 <div style={{ display:"grid", gap:"0.14rem", marginTop:"0.08rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(section.buildHeading || "Build")}</div>
 {section.buildItems.slice(0, 6).map((item, itemIndex) => (
 <div key={`${section.key || sectionIndex}_build_${itemIndex}`} style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>
 {itemIndex + 1}. {sanitizeDisplayText(item)}
 </div>
 ))}
 </div>
 )}
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.32rem" }}>
 {!!section.coachLine && (
 <div style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0b1321", padding:"0.46rem 0.52rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Coach note</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(section.coachLine)}</div>
 </div>
 )}
 {!!section.prepLine && (
 <div style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0b1321", padding:"0.46rem 0.52rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Prep</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(section.prepLine)}</div>
 </div>
 )}
 {!!section.backupLine && (
 <div style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0b1321", padding:"0.46rem 0.52rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>If life gets busy</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(section.backupLine)}</div>
 </div>
 )}
 </div>
 {!!section.groceryItems?.length && (
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Pull for the week</div>
 <div style={{ display:"flex", gap:"0.26rem", flexWrap:"wrap" }}>
 {section.groceryItems.slice(0, 8).map((item) => (
 <span key={`${section.key || sectionIndex}_${item}`} className="ui-pill" style={{ color:"#dbe7f6", background:"rgba(30, 41, 59, 0.72)", borderColor:"#22324a" }}>
 {sanitizeDisplayText(item)}
 </span>
 ))}
 </div>
 </div>
 )}
 {!!section.detailLine && (
 <div style={{ display:"grid", gap:"0.08rem", marginTop:"0.08rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(section.detailLabel || "Execution note")}</div>
 <div style={{ fontSize:"0.5rem", color:"#e2e8f0", lineHeight:1.45 }}>{sanitizeDisplayText(section.detailLine)}</div>
 </div>
 )}
 {!!section.why && (
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45, marginTop:"0.08rem" }}>
 {sanitizeDisplayText(section.why)}
 </div>
 )}
 {!!section.recipeSteps?.length && (
 <details data-testid={`nutrition-meal-recipe-${section.key || sectionIndex}`} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0b1321", padding:"0.5rem 0.56rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.5rem", color:"#dbe7f6" }}>How to make it</summary>
 <div style={{ display:"grid", gap:"0.14rem", marginTop:"0.38rem" }}>
 {section.recipeSteps.map((step, stepIndex) => (
 <div key={`${section.key || sectionIndex}_recipe_${stepIndex}`} style={{ fontSize:"0.5rem", color:"#cfe0f4", lineHeight:1.5 }}>
 {stepIndex + 1}. {sanitizeDisplayText(step)}
 </div>
 ))}
 </div>
 </details>
 )}
 {!!section.improvementTips?.length && (
 <details data-testid={`nutrition-meal-upgrade-${section.key || sectionIndex}`} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0b1321", padding:"0.5rem 0.56rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.5rem", color:"#dbe7f6" }}>Make it better</summary>
 <div style={{ display:"grid", gap:"0.14rem", marginTop:"0.38rem" }}>
 {section.improvementTips.map((tip, tipIndex) => (
 <div key={`${section.key || sectionIndex}_tip_${tipIndex}`} style={{ fontSize:"0.5rem", color:"#cfe0f4", lineHeight:1.5 }}>
 {tipIndex + 1}. {sanitizeDisplayText(tip)}
 </div>
 ))}
 </div>
 </details>
 )}
 </div>
);
})}
{!executionPlanSections.length && (
<div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.62rem 0.7rem", fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {compactFuelingDetailSummary}
 </div>
)}
</div>
</div>

 <div data-testid="nutrition-execution-rules" className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>EXECUTION RULES</div>
 {executionPlanRules.map((rule, index) => (
 <div key={`nutrition_rule_${index}`} style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.5 }}>
 {index + 1}. {sanitizeDisplayText(rule)}
 </div>
 ))}
 </div>
 </div>

 {weeklyMealCalendarModel && (
 <div data-testid="nutrition-weekly-meal-calendar" className="card card-subtle" style={{ borderColor:C.blue+"26" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", flexWrap:"wrap", alignItems:"flex-start" }}>
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>WEEKLY MEAL CALENDAR</div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>{sanitizeDisplayText(weeklyMealCalendarModel.summary)}</div>
 </div>
 <div style={{ display:"flex", gap:"0.26rem", flexWrap:"wrap", alignItems:"center" }}>
 <span className="ui-pill" style={{ color:C.blue, background:`${C.blue}12`, borderColor:`${C.blue}22` }}>
 {sanitizeDisplayText(weeklyMealCalendarModel.weekLabel || "This week")}
 </span>
 {weeklyMealCalendarModel.overrideCount > 0 && (
 <button
 data-testid="nutrition-weekly-calendar-reset"
 className="btn"
 onClick={resetVisibleWeekMealCalendar}
 style={{ fontSize:"0.48rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Reset week
 </button>
 )}
 </div>
 </div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 Rotate any slot that looks stale. The grocery list below follows this calendar.
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:"0.42rem" }}>
 {weeklyMealCalendarModel.days.map((day) => (
 <div
 key={day.dateKey}
 data-testid={`nutrition-meal-calendar-day-${day.dateKey}`}
 style={{
 border:"1px solid #22324a",
 borderRadius:14,
 background:day.isToday ? "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(11,19,33,0.94))" : "#0f172a",
 padding:"0.62rem 0.68rem",
 display:"grid",
 gap:"0.32rem",
 }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"baseline", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.08rem" }}>
 <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 {sanitizeDisplayText(day.dayLabel)}{day.isToday ? " - Today" : ""}
 </div>
 <div style={{ fontSize:"0.58rem", color:"#f8fafc", lineHeight:1.4 }}>{sanitizeDisplayText(day.sessionLabel)}</div>
 </div>
 {day.hasSavedOverrides && (
 <span className="ui-pill" style={{ color:C.amber, background:`${C.amber}12`, borderColor:`${C.amber}22` }}>
 Edited
 </span>
 )}
 </div>
 <div style={{ display:"grid", gap:"0.26rem" }}>
 {day.meals.map((meal) => {
 const mealVote = meal.preferenceKey ? getMealPatternVote(meal.preferenceKey) : "";
 const mealLiked = mealVote === "liked";
 const mealDisliked = mealVote === "disliked";
 return (
 <div
 key={`${day.dateKey}_${meal.slotKey}`}
 data-testid={`nutrition-meal-calendar-slot-${day.dateKey}-${meal.slotKey}`}
 style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0b1321", padding:"0.48rem 0.54rem", display:"grid", gap:"0.18rem" }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"baseline", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 {sanitizeDisplayText(meal.label)}
 </div>
 <div style={{ display:"flex", gap:"0.2rem", flexWrap:"wrap", alignItems:"center" }}>
 {meal.sourceType === "anchor" && (
 <span className="ui-pill" style={{ color:"#8fa5c8", background:"rgba(30,41,59,0.6)", borderColor:"#22324a" }}>
 Saved anchor
 </span>
 )}
 {meal.hasOverride && (
 <span className="ui-pill" style={{ color:C.amber, background:`${C.amber}12`, borderColor:`${C.amber}22` }}>
 Rotated
 </span>
 )}
 </div>
 </div>
 <div style={{ fontSize:"0.56rem", color:"#f8fafc", lineHeight:1.42 }}>{sanitizeDisplayText(meal.title)}</div>
 {!!meal.targetLine && (
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.42 }}>{sanitizeDisplayText(meal.targetLine)}</div>
 )}
 {!!meal.buildPreview?.length && (
 <div style={{ fontSize:"0.48rem", color:"#cfe0f4", lineHeight:1.42 }}>
 {meal.buildPreview.map((item) => sanitizeDisplayText(item)).join(" • ")}
 </div>
 )}
 <div style={{ display:"flex", gap:"0.2rem", flexWrap:"wrap" }}>
 {!!meal.preferenceKey && meal.sourceType !== "anchor" && (
 <>
 <button
 data-testid={`nutrition-calendar-like-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>saveMealPatternVote(meal.preferenceKey, "liked")}
 style={{
 fontSize:"0.46rem",
 borderColor:mealLiked ? C.green : "#2a3b56",
 color:mealLiked ? C.green : "#dbe7f6",
 background:mealLiked ? `${C.green}12` : "transparent",
 }}
 >
 {mealLiked ? "Liked" : "Like"}
 </button>
 <button
 data-testid={`nutrition-calendar-dislike-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>saveMealPatternVote(meal.preferenceKey, "disliked")}
 style={{
 fontSize:"0.46rem",
 borderColor:mealDisliked ? C.red : "#2a3b56",
 color:mealDisliked ? C.red : "#dbe7f6",
 background:mealDisliked ? `${C.red}12` : "transparent",
 }}
 >
 {mealDisliked ? "Avoiding" : "Avoid"}
 </button>
 </>
 )}
 <button
 data-testid={`nutrition-meal-calendar-rotate-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>rotateMealCalendarSlot(day.dateKey, meal.slotKey)}
 style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Rotate
 </button>
 {meal.hasOverride && (
 <button
 data-testid={`nutrition-meal-calendar-reset-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>resetMealCalendarSlot(day.dateKey, meal.slotKey)}
 style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Reset
 </button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {weeklyNutritionGroceryModel && (
 <div data-testid="nutrition-weekly-grocery-list" className="card card-subtle" style={{ borderColor:C.green+"28" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", flexWrap:"wrap", alignItems:"flex-start" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>WEEK PLAN + GROCERY</div>
 <span className="ui-pill" style={{ color:C.green, background:`${C.green}12`, borderColor:`${C.green}22` }}>
 {sanitizeDisplayText(weeklyNutritionGroceryModel.weekLabel || "This week")}
 </span>
 </div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>{sanitizeDisplayText(weeklyNutritionGroceryModel.summary)}</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.4rem" }}>
 {weeklyNutritionGroceryModel.groups.map((group) => (
 <div key={group.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.56rem 0.62rem", display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(group.label)}</div>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 {group.items.map((item) => (
 <div key={`${group.key}_${item.name}`} style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"baseline" }}>
 <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.4 }}>{sanitizeDisplayText(item.name)}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", whiteSpace:"nowrap" }}>x{item.count}</div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 {weeklyNutritionGroceryModel.prepNotes?.length > 0 && (
 <div style={{ marginTop:"0.42rem", border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.56rem 0.62rem", display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Batch prep</div>
 {weeklyNutritionGroceryModel.prepNotes.map((note, index) => (
 <div key={`weekly_grocery_prep_${index}`} style={{ fontSize:"0.53rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {index + 1}. {sanitizeDisplayText(note)}
 </div>
 ))}
 </div>
 )}
 {!!weeklyNutritionGroceryModel.dailyPlans?.length && (
 <details style={{ marginTop:"0.42rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.53rem", color:"#8fa5c8" }}>See the generated week behind this list</summary>
 <div style={{ display:"grid", gap:"0.28rem", marginTop:"0.45rem" }}>
 {weeklyNutritionGroceryModel.dailyPlans.map((day) => (
 <div key={day.dateKey} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.56rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"baseline", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.53rem", color:"#f8fafc" }}>{sanitizeDisplayText(day.dayLabel)}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>{sanitizeDisplayText(day.sessionLabel)}</div>
 </div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {day.meals.map((meal, index) => `${index + 1}. ${sanitizeDisplayText(meal)}`).join("   ")}
 </div>
 </div>
 ))}
 </div>
 </details>
 )}
 </div>
 )}

 <div data-testid="nutrition-quick-log" className="card card-action" style={{ borderColor:C.green+"30", background:"#0d1410" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>QUICK LOG</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {selectedLogIsToday
 ? "Save the day in a few taps."
 : "Log a recent day."}
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", flexWrap:"wrap", alignItems:"end" }}>
 <div data-testid="nutrition-log-date-label" style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>
 For {selectedLogDateLabel}.
 </div>
 <label style={{ display:"grid", gap:"0.14rem", minWidth:180 }}>
 <span style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em" }}>LOG DAY</span>
 <select data-testid="nutrition-log-date-select" value={selectedLogDateKey} onChange={(e)=>setSelectedLogDateKey(e.target.value)} style={{ fontSize:"0.54rem" }}>
 {nutritionLogDateOptions.map((dateKey) => (
 <option key={dateKey} value={dateKey}>{formatNutritionLogDateLabel(dateKey)}</option>
 ))}
 </select>
 </label>
 </div>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>How did the day compare with the plan?</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:"0.3rem" }}>
 {[["followed","Followed plan"],["under_fueled","Under-fueled"],["over_indulged","Ate more than planned"],["deviated","Different than plan"]].map(([key, label]) => (
 <button key={key} className={`btn ${nutritionCheck.deviationKind===key ? "btn-selected" : ""}`} onClick={()=>setNutritionCheck((current)=>({ ...current, deviationKind:key, issue:key === "followed" ? "" : current.issue }))} style={{ fontSize:"0.54rem", borderColor:nutritionCheck.deviationKind===key?C.green:"#1e293b", color:nutritionCheck.deviationKind===key?C.green:"#64748b", background:nutritionCheck.deviationKind===key?`${C.green}12`:"transparent" }}>
 {label}
 </button>
 ))}
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>Main friction, if anything</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:"0.3rem" }}>
 {[["","None"],["hunger","Hunger"],["convenience","Convenience"],["travel","Travel"]].map(([key, label]) => (
 <button key={label} className={`btn ${(nutritionCheck.issue||"")===key ? "btn-selected" : ""}`} onClick={()=>setNutritionCheck((current)=>({ ...current, issue:key }))} style={{ fontSize:"0.54rem", borderColor:(nutritionCheck.issue||"")===key?C.blue:"#1e293b", color:(nutritionCheck.issue||"")===key?C.blue:"#64748b", background:(nutritionCheck.issue||"")===key?`${C.blue}12`:"transparent" }}>
 {label}
 </button>
 ))}
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.35rem", alignItems:"start" }}>
 <input value={nutritionCheck.note || ""} onChange={e=>setNutritionCheck((current)=>({ ...current, note:e.target.value }))} placeholder="Quick note (optional)" />
 <button data-testid="nutrition-save-quick" className="btn btn-primary" disabled={!nutritionQuickLogReady} onClick={()=>persistNutritionFeedback({ ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt, supplementTaken }, actualNutritionForSelectedDate?.loggedAt ? `Nutrition log updated for ${selectedLogDateLabel}.` : `Nutrition log saved for ${selectedLogDateLabel}.`)} style={{ fontSize:"0.52rem", opacity:nutritionQuickLogReady ? 1 : 0.5, width:"fit-content" }}>
 Save
 </button>
 </div>
 </div>
 </div>

 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.75rem" }}>
 <div className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.4rem" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>HYDRATION</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>{compactHydrationSupportLine}</div>
 </div>
 <button className="btn" onClick={()=>logHydration(12)} style={{ width:"100%", display:"block", textAlign:"left", borderColor:"#2a3b56", padding:"0.42rem 0.46rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6", marginBottom:"0.22rem" }}>
 <span>{Math.round(hydrationOz)} oz logged</span>
 <span style={{ color:"#8fa5c8" }}>{hydrationTargetLabel}</span>
 </div>
 <div style={{ width:"100%", height:10, borderRadius:999, background:"#0f172a", border:"1px solid #243752", overflow:"hidden" }}>
 <div style={{ width:`${hydrationPct}%`, height:"100%", background: hydrationPct >= 100 ? C.green : C.blue, transition:"width 180ms ease" }} />
 </div>
 <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#8fa5c8" }}>Tap to add 12 oz</div>
 </button>
 </div>

 <div className="card card-subtle" style={{ borderColor:C.green+"24" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.4rem" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>KEY ADJUSTMENTS</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>{compactFuelingDetailSummary}</div>
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 {(nutritionAdjustmentRows.length ? nutritionAdjustmentRows : [{ key: "detail_focus", label: "Today", line: compactFuelingDetailSummary }]).map((row) => (
 <div key={row.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{sanitizeDisplayText(row.label)}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(row.line)}</div>
 </div>
 ))}
 </div>
 </div>
 </div>

 <details data-testid="nutrition-performance-guidance" className="card card-subtle" style={{ borderColor:C.green+"28" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.56rem", color:"#dbe7f6" }}>
 Fueling details
 </summary>
 <div style={{ display:"grid", gap:"0.42rem", marginTop:"0.45rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.58rem", color:"#f8fafc", lineHeight:1.45 }}>{compactWhyThisToday}</div>
 {compactDailyRecommendations.length > 0 && (
 <div style={{ display:"grid", gap:"0.14rem" }}>
 {compactDailyRecommendations.map((line, index) => (
 <div key={`nutrition_detail_tip_${index}`} style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {line}
 </div>
 ))}
 </div>
 )}
 </div>
 {!!visiblePerformanceGuidanceRows.length && (
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.35rem" }}>
 {visiblePerformanceGuidanceRows.map((entry) => (
 <div key={entry.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{entry.label}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{entry.line}</div>
 </div>
 ))}
 </div>
 )}
 {!!compactAdaptiveContextRows.length && (
 <div data-testid="nutrition-adaptive-context" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.35rem" }}>
 {compactAdaptiveContextRows.map((entry) => (
 <div key={entry.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{sanitizeDisplayText(entry.label)}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{compressNutritionCopy(entry.line, 78)}</div>
 </div>
 ))}
 </div>
 )}
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.35rem" }}>
 <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>LOW-FRICTION BACKUP</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{fastFallback}</div>
 </div>
 <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{travelOrGroceryTitle}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{travelOrGroceryLine}</div>
 </div>
 <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>EMERGENCY ORDER</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{emergencyOrderLine}</div>
 </div>
 </div>
 </div>
 </details>

 <details data-testid="nutrition-meal-anchors" className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.56rem", color:"#dbe7f6" }}>Saved meal anchors</summary>
 <div style={{ display:"grid", gap:"0.18rem", marginTop:"0.45rem", marginBottom:"0.45rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
 Save the meals you repeat so this tab stays useful when the day gets busy.
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.35rem" }}>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>DEFAULT BREAKFAST</span>
 <input value={mealAnchorDrafts.breakfast} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, breakfast:e.target.value }))} placeholder="Greek yogurt + berries + granola" />
 </label>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>DEFAULT LUNCH</span>
 <input value={mealAnchorDrafts.lunch} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, lunch:e.target.value }))} placeholder="Chicken rice bowl + fruit" />
 </label>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>TRAVEL FALLBACK</span>
 <input value={mealAnchorDrafts.travelFallback} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, travelFallback:e.target.value }))} placeholder="Egg bites + oatmeal + banana" />
 </label>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>EMERGENCY TAKEOUT</span>
 <input value={mealAnchorDrafts.emergencyOrder} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, emergencyOrder:e.target.value }))} placeholder="Chipotle double chicken bowl" />
 </label>
 </div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap", marginTop:"0.45rem" }}>
 <button className="btn" onClick={()=>setMealAnchorDrafts((current)=>({ ...current, breakfast: breakfastAnchorSuggestion }))} style={{ fontSize:"0.5rem", borderColor:"#2a3b56", color:"#dbe7f6" }}>
 Use today's breakfast
 </button>
 <button className="btn" onClick={()=>setMealAnchorDrafts((current)=>({ ...current, lunch: lunchAnchorSuggestion }))} style={{ fontSize:"0.5rem", borderColor:"#2a3b56", color:"#dbe7f6" }}>
 Use today's lunch
 </button>
 <button className="btn btn-primary" onClick={saveMealAnchors} style={{ fontSize:"0.5rem" }}>
 Save anchors
 </button>
 </div>
 <div style={{ display:"grid", gap:"0.14rem", marginTop:"0.42rem" }}>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Breakfast suggestion: {breakfastAnchorSuggestion}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Lunch suggestion: {lunchAnchorSuggestion}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Travel backup: {travelAnchorSuggestion}</div>
 </div>
 </details>

 <details className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.56rem", color:"#dbe7f6" }}>Supplement plan</summary>
 <div style={{ display:"grid", gap:"0.42rem", marginTop:"0.45rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{compactSupplementPrescriptionLine}</div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {showSupplementChecklist ? compactApprovedSupplementLine : compactApprovedSupplementEmptyLine}
 </div>
 </div>
 {!showSupplementChecklist && (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
 {compactApprovedSupplementEmptyLine}
 </div>
 )}
 {showSupplementChecklist && (
 <div style={{ display:"grid", gap:"0.3rem" }}>
 {supplementRows.map((supp, i) => (
 <div key={`${supp.name}_${i}`} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.42rem 0.48rem" }}>
 <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.35rem", alignItems:"center" }}>
 <button className="btn" onClick={()=>toggleSupplementTaken(supp.name)} style={{ width:24, minWidth:24, height:24, padding:0, borderColor:"#2d435f", color:supplementTaken?.[supp.name] ? C.green : "#64748b", background:"transparent", fontSize:"0.62rem" }}>
 {supplementTaken?.[supp.name] ? "x" : ""}
 </button>
 <div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>{supp.name}</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.08rem" }}>{supp.instruction}</div>
 </div>
 <button className="btn" onClick={()=>setOpenSupplementInfo(prev => prev === supp.name ? "" : supp.name)} style={{ fontSize:"0.48rem", padding:"0.12rem 0.34rem", color:"#8fa5c8", borderColor:"#2c3e58" }}>{openSupplementInfo === supp.name ? "Hide" : "Why"}</button>
 </div>
 {openSupplementInfo === supp.name && (
 <div style={{ marginTop:"0.28rem", fontSize:"0.51rem", color:"#9fb2d2", lineHeight:1.55 }}>
 {supplementInfoByName[supp.name]?.plain}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 <details style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.52rem 0.56rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.52rem", color:"#dbe7f6" }}>Manage approved supplements</summary>
 <div style={{ display:"grid", gap:"0.28rem", marginTop:"0.4rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>APPROVED STACK</div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {compactApprovedSupplementLine}
 </div>
 <div style={{ display:"flex", gap:"0.3rem", flexWrap:"wrap" }}>
 {defaultSupplements.map((supplement) => {
 const isApproved = approvedSupplementNames.has(String(supplement?.name || "").toLowerCase());
 return (
 <button
 key={supplement.key}
 className="btn"
 onClick={()=>toggleApprovedSupplement(supplement)}
 style={{
 fontSize:"0.48rem",
 borderColor:isApproved ? C.green : "#2a3b56",
 color:isApproved ? C.green : "#dbe7f6",
 background:isApproved ? `${C.green}12` : "transparent",
 }}
 >
 {isApproved ? `Remove ${supplement.name}` : `Add ${supplement.name}`}
 </button>
 );
 })}
 </div>
 {approvedCustomSupplements.length > 0 && (
 <div style={{ display:"grid", gap:"0.18rem" }}>
 {approvedCustomSupplements.map((supplement) => (
 <div key={`approved_custom_${supplement.key}`} style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.48rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {supplement.name} / {supplement.defaultTiming}
 </div>
 <button className="btn" onClick={()=>removeCustomSupplement(supplement.name)} style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#8fa5c8" }}>
 Remove
 </button>
 </div>
 ))}
 </div>
 )}
 <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr) auto", gap:"0.3rem", alignItems:"start" }}>
 <input value={newSupplementName} onChange={(e)=>setNewSupplementName(e.target.value)} placeholder="Custom supplement" />
 <input value={newSupplementTiming} onChange={(e)=>setNewSupplementTiming(e.target.value)} placeholder="Timing" />
 <button className="btn btn-primary" onClick={addCustomSupplement} disabled={!newSupplementName.trim() || !newSupplementTiming.trim()} style={{ fontSize:"0.48rem", opacity:newSupplementName.trim() && newSupplementTiming.trim() ? 1 : 0.5 }}>
 Add
 </button>
 </div>
 </div>
 </details>
 </div>
 </details>

 </div>
 );
 if (false) return (
 <div className="fi">
 <div className="card card-soft card-action" style={{ marginBottom:"0.8rem", borderColor:C.blue+"28" }}>
 <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.45rem", flexWrap:"wrap", marginBottom:"0.45rem" }}>
 <div>
 <div className="sect-title" style={{ color:C.blue, marginBottom:"0.14rem" }}>TODAY'S NUTRITION TARGET</div>
 <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.5 }}>{directiveSentence}</div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
 <span className="ui-pill" style={{ color:targetTone.color, background:targetTone.bg, borderColor:"transparent" }}>{sanitizeStatusLabel(dayType, "today")}</span>
 <span className="ui-pill" style={{ color:nutritionTone.color, background:nutritionTone.bg, borderColor:"transparent" }}>{comparisonLabel}</span>
 <span className="ui-pill" style={{ color:"#8fa5c8", background:"#0f172a", borderColor:"#243752" }}>{phaseMode}</span>
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:"0.4rem" }}>
 {[["Protein", proteinLevel, C.red], ["Carbs", carbLevel, C.green], ["Calories", calorieLevel, C.amber]].map(([label, value, col]) => (
 <div key={label} style={{ background:"#0f172a", border:`1px solid ${col}30`, borderRadius:10, padding:"0.46rem 0.4rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>{label}</div>
 <div className="mono" style={{ color:col, fontSize:"0.9rem", marginTop:"0.12rem" }}>{value}</div>
 </div>
 ))}
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>WHY THIS MATCHES TODAY'S TRAINING</div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.48rem 0.52rem" }}>
 <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.55 }}>{whyThisToday}</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.38rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>TRAINING LINK</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>{currentSessionLabel}</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{macroShiftLine}</div>
 </div>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>GUIDANCE BASIS</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.55 }}>{nutritionProvenance}</div>
 </div>
 </div>
 {dailyRecommendations.length > 0 && (
 <div style={{ display:"grid", gap:"0.22rem" }}>
 {dailyRecommendations.slice(0, 3).map((line, idx) => (
 <div key={`nutrition_rec_${idx}`} style={{ fontSize:"0.54rem", color:"#c7d5ea", lineHeight:1.5 }}>
 {idx + 1}. {line}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem" }}>
 <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>PRACTICAL MEAL STRUCTURE</div>
 <div style={{ display:"grid", gap:"0.38rem" }}>
 {mealMacroRows.map((meal) => (
 <div key={meal.key} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.46rem 0.52rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.58rem", color:"#e2e8f0" }}>{meal.label}</div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8" }}>{meal.p}g protein - {meal.c}g carbs - {meal.f}g fat</div>
 </div>
 <div style={{ fontSize:"0.54rem", color:"#c7d5ea", marginTop:"0.12rem", lineHeight:1.5 }}>{meal.text}</div>
 </div>
 ))}
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.38rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>LOW-FRICTION BACKUP</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>{fastFallback}</div>
 </div>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>SHOPPING / TRAVEL NOTE</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>
 {nutritionLayer?.travelMode
 ? travelBreakfast[0]
 : hasSavedStorePreference
 ? `${store}: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`
 : `Suggested staples: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`}
 </div>
 </div>
 </div>
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem", borderColor:C.blue+"24" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>RECOVERY + SUPPLEMENT GUIDANCE</div>
 <div style={{ display:"grid", gap:"0.34rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>RECOVERY</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.55 }}>
{recoveryPrescription?.summary || "Recovery guidance is connected to today's plan."}
 </div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{hydrationSupportLine}</div>
 </div>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>SUPPLEMENTS</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.55 }}>{supplementPrescriptionLine}</div>
 </div>
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem" }}>
<div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>HYDRATION & SUPPLEMENTS</div>
 <div style={{ display:"grid", gap:"0.42rem" }}>
 <button className="btn" onClick={()=>logHydration(12)} style={{ width:"100%", display:"block", textAlign:"left", borderColor:"#2a3b56", padding:"0.42rem 0.46rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6", marginBottom:"0.22rem" }}>
 <span>{Math.round(hydrationOz)} oz logged</span>
 <span style={{ color:"#8fa5c8" }}>{hydrationTargetLabel}</span>
 </div>
 <div style={{ width:"100%", height:10, borderRadius:999, background:"#0f172a", border:"1px solid #243752", overflow:"hidden" }}>
 <div style={{ width:`${hydrationPct}%`, height:"100%", background: hydrationPct >= 100 ? C.green : C.blue, transition:"width 180ms ease" }} />
 </div>
 <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#8fa5c8" }}>Tap to add 12 oz</div>
 </button>
 {!showSupplementChecklist && (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
Your supplement checklist shows up once a supplement plan is saved for today.
 </div>
 )}
 {showSupplementChecklist && (
 <div style={{ display:"grid", gap:"0.3rem" }}>
 {supplementRows.map((supp, i) => (
 <div key={`${supp.name}_${i}`} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.42rem 0.48rem" }}>
 <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.35rem", alignItems:"center" }}>
 <button className="btn" onClick={()=>toggleSupplementTaken(supp.name)} style={{ width:24, minWidth:24, height:24, padding:0, borderColor:"#2d435f", color:supplementTaken?.[supp.name] ? C.green : "#64748b", background:"transparent", fontSize:"0.62rem" }}>
 {supplementTaken?.[supp.name] ? "?" : ""}
 </button>
 <div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>{supp.name}</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.08rem" }}>{supp.instruction}</div>
 </div>
 <button className="btn" onClick={()=>setOpenSupplementInfo(prev => prev === supp.name ? "" : supp.name)} style={{ fontSize:"0.48rem", padding:"0.12rem 0.34rem", color:"#8fa5c8", borderColor:"#2c3e58" }}>{openSupplementInfo === supp.name ? "Hide" : "Why"}</button>
 </div>
 {openSupplementInfo === supp.name && (
 <div style={{ marginTop:"0.28rem", fontSize:"0.51rem", color:"#9fb2d2", lineHeight:1.55 }}>
 {supplementInfoByName[supp.name]?.plain}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 </div>
 );
}

// COACH TAB (REDESIGNED)


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
  sessionLabel: surfaceModel?.display?.sessionLabel
  || todayWorkout?.label
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
 title="Three jobs, one clear boundary."
 supporting="Adjust today, adjust this week, or ask coach."
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
 <SurfaceHeading eyebrow="Adjust today" title="Make the clearest call for right now" supporting="Pick the situation. Coach gives one move, why it matters, and what changes if you use it." eyebrowColor={C.green} />

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
 <SurfaceHeading eyebrow="Adjust this week" title="Change one thing, keep the week coherent" supporting="Coach recommends one weekly move first. Nothing changes until you accept the preview." eyebrowColor={C.amber} />

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
 title="Ask for a call, tradeoff, or next step"
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
