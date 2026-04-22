import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { SettingsAccountSection } from "../settings/SettingsAccountSection.jsx";
import { SettingsAdvancedSection } from "../settings/SettingsAdvancedSection.jsx";
import { SettingsBaselinesSection } from "../settings/SettingsBaselinesSection.jsx";
import { SettingsGoalsSection } from "../settings/SettingsGoalsSection.jsx";
import { SettingsPreferencesSection } from "../settings/SettingsPreferencesSection.jsx";
import { SettingsProfileSection } from "../settings/SettingsProfileSection.jsx";
import { SettingsProgramsSection } from "../settings/SettingsProgramsSection.jsx";
import { SettingsSurfaceNav } from "../settings/SettingsSurfaceNav.jsx";
import { useSettingsScreenState } from "../settings/useSettingsScreenState.js";
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
import { StateFeedbackBanner, StateFeedbackChip } from "../../components/StateFeedbackPrimitives.jsx";
import { sanitizeIntakeText } from "../../services/intake-flow-service.js";
import {
  buildDeleteAccountEndpointUnavailableDiagnostics,
  DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
  getTemporarilyUnavailableEndpoint,
  isMissingEndpointResponseStatus,
  markEndpointTemporarilyUnavailable,
} from "../../services/runtime-endpoint-availability-service.js";

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
