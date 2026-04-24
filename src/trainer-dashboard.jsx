import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { DEFAULT_PLANNING_HORIZON_WEEKS, composeGoalNativePlan, normalizeGoals, getActiveTimeBoundGoal, generateTodayPlan } from "./modules-planning.js";
import { createAuthStorageModule, buildStorageStatus, classifyStorageError, createPersistQueueController, createPersistedPayloadFingerprint, STORAGE_STATUS_REASONS } from "./modules-auth-storage.js";
import { getGoalContext, normalizeActualNutritionLog, resolveNutritionActualLogStoreCompat, compareNutritionPrescriptionToActual, getPlaceRecommendations, buildGroceryBasket, mergeActualNutritionLogUpdate, applyHydrationQuickAdd } from "./modules-nutrition.js";
import { DEFAULT_DAILY_CHECKIN, CHECKIN_STATUS_OPTIONS, CHECKIN_FEEL_OPTIONS, parseMicroCheckin, deriveClosedLoopValidationLayer, resolveEffectiveStatus, buildPlannedDayRecord, comparePlannedDayToActual } from "./modules-checkins.js";
import { COACH_TOOL_ACTIONS, deterministicCoachPacket } from "./modules-coach-engine.js";
import { buildCheckinReadSummary, buildWeeklyPlanningCoachBrief, buildTodayWhyNowSentence, buildMacroShiftLine, buildSkippedQualityDecision, buildWeeklyConsistencyAnchor, buildBadWeekTriageResponse } from "./prompts/coach-text.js";
import { SettingsIcon } from "./icons.js";
import { assembleCanonicalPlanDay, resolvePlanDayStateInputs, resolvePlanDayTimeOfDay } from "./services/plan-day-service.js";
import { buildCanonicalPlanSurfaceAudit, buildCanonicalPlanSurfaceModel } from "./services/plan-day-surface-service.js";
import { assemblePlanWeekRuntime, mergeCurrentPlanWeekIntoHorizon, resolveCurrentPlanWeekNumber, resolvePlanWeekNumberForDateKey, resolveProgramDisplayHorizon } from "./services/plan-week-service.js";
import { buildDayReview } from "./services/day-review-service.js";
import {
 AUTH_ENTRY_STYLE_TEXT,
 BRAND_THEME_MODES,
 BRAND_THEME_OPTIONS,
 PRODUCT_BRAND,
 buildAuthEntryTheme,
 buildAuthEntryViewModel,
 buildBrandThemePreviewModel,
 buildBrandThemeState,
 buildMetricsBaselinesModel,
 buildSyncStateModel,
 buildSyncSurfaceModel,
 createInitialSyncPresentationState,
 createInitialSyncRuntimeState,
 normalizeAppearanceSettings,
 reduceSyncRuntimeState,
 stabilizeSyncStatePresentation,
 SYNC_RUNTIME_EVENT_TYPES,
 SYNC_STATE_IDS,
 SYNC_SURFACE_KEYS,
} from "./domains/settings/index.js";
import {
 buildFrictionDashboardModel,
 createFrictionAnalytics,
 FRICTION_ANALYTICS_EVENT_NAME,
} from "./services/friction-analytics-service.js";
import {
 createInitialSyncDiagnosticsState,
 reduceSyncDiagnosticsState,
 SYNC_DIAGNOSTIC_EVENT_TYPES,
} from "./services/sync-diagnostics-service.js";
import {
 ADAPTIVE_LEARNING_EVENT_NAMES,
 ADAPTIVE_OUTCOME_KINDS,
 ADAPTIVE_RECOMMENDATION_KINDS,
 buildRecommendationJoinKey,
} from "./services/adaptive-learning-event-service.js";
import { createAdaptiveLearningStore } from "./services/adaptive-learning-store-service.js";
import {
 buildAdaptiveLearningIdentityFromSession,
 buildAuthLifecycleEventInput,
 buildCoachOutcomeEventInput,
 buildCoachSuggestionRecommendationEventInput,
 buildCohortSnapshotEventInput,
 buildDayPrescriptionRecommendationEventInput,
 buildGoalChangeEventInput,
 buildIntakeCompletionRecommendationEventInput,
 buildNutritionOutcomeEventInput,
 buildNutritionRecommendationEventInput,
 buildPlanGenerationRecommendationEventInput,
 buildSyncLifecycleEventInput,
 buildUserStateSnapshotEventInput,
 buildWeeklyEvaluationEventInput,
 buildWeeklyPlanRefreshRecommendationEventInput,
 buildWorkoutAdjustmentRecommendationEventInput,
 buildWorkoutOutcomeEventInput,
} from "./services/adaptive-learning-domain-service.js";
import { coordinateCoachActionCommit, resolveStoredAiApiKey, runIntakeCoachVoiceRuntime, runIntakeInterpretationRuntime, runPlanAnalysisRuntime } from "./services/ai-runtime-service.js";
import { canExposeInternalOperatorTools } from "./services/internal-access-policy-service.js";
import { deriveCanonicalAthleteState, withLegacyGoalProfileCompatibility } from "./services/canonical-athlete-service.js";
import { buildPlanningGoalsFromResolvedGoals, applyResolvedGoalsToGoalSlots, buildGoalStateFromResolvedGoals, resolveGoalTranslation } from "./services/goal-resolution-service.js";
import { buildGoalArbitrationStack } from "./services/goal-arbitration-service.js";
import { GOAL_FEASIBILITY_ACTIONS, GOAL_REALISM_STATUSES, applyFeasibilityPriorityOrdering, assessGoalFeasibility } from "./services/goal-feasibility-service.js";
import {
 GOAL_CHANGE_MODES,
 GOAL_CHANGE_MODE_META,
 buildGoalChangeArchiveEntry,
 buildGoalChangeHistoryEvent,
 prepareGoalChangeActiveState,
 resolveGoalChangePlanStartDate,
} from "./services/goal-change-service.js";
import { GOAL_PROGRESS_STATUSES } from "./services/goal-progress-service.js";
import {
 buildGoalReview,
 buildGoalReviewHistoryEntry,
 GOAL_REVIEW_DUE_STATES,
 GOAL_REVIEW_RECOMMENDATIONS,
} from "./services/goal-review-service.js";
import {
 applyCanonicalRuntimeStateSetters,
 buildCanonicalRuntimeState,
 buildCanonicalRuntimeStateFromStorage,
 buildPersistedTrainerPayload,
 DEFAULT_COACH_PLAN_ADJUSTMENTS,
 DEFAULT_NUTRITION_FAVORITES,
 exportRuntimeStateAsBase64,
 importRuntimeStateFromBase64,
} from "./services/persistence-adapter-service.js";
import {
 buildExercisePerformanceRowsFromRecords,
 getExercisePerformanceRecordsForLog,
 getSessionPerformanceRecordsForLog,
 normalizeLogPerformanceState,
 normalizePerformanceExerciseKey,
} from "./services/performance-record-service.js";
import {
 buildPlanReference,
 getCurrentPrescribedDayRecord,
 getCurrentPrescribedDayRevision,
 getStableCaptureAtForDate,
 normalizePrescribedDayHistoryEntry,
 PRESCRIBED_DAY_DURABILITY,
 upsertPrescribedDayHistoryEntry,
} from "./services/prescribed-day-history-service.js";
import {
 buildPersistedPlanWeekReview,
 getPersistedPlanWeekRecord,
 listCommittedPlanWeekRecords,
 upsertPersistedPlanWeekRecord,
} from "./services/plan-week-persistence-service.js";
import { buildWeeklyNutritionReview } from "./services/weekly-nutrition-review-service.js";
import {
 buildArchivedDayReview,
 buildArchivedPlanAudit,
 buildHistoricalWeekAuditEntries,
} from "./services/history-audit-service.js";
import {
 buildPlanEvolutionExport,
 renderPlanEvolutionExportMarkdown,
} from "./services/audits/plan-evolution-export-service.js";
import {
 CALIBRATION_MIN_HISTORY_COUNT,
 deriveCalibrationState,
} from "./services/calibration-state-service.js";
import {
 buildTrainingContextFromEditor,
 buildTrainingContextFromAnswers,
 createEmptyTrainingContext,
 deriveActiveIssueContextFromPersonalization,
 deriveTrainingContextFromPersonalization,
 describeTrainingContextSource,
 formatTrainingWeekdayAvailability,
 normalizeTrainingWeekdayKey,
 normalizeTrainingWeekdayAvailability,
 summarizeTrainingContext,
 TRAINING_CONTEXT_SOURCES,
 TRAINING_EQUIPMENT_VALUES,
 TRAINING_ENVIRONMENT_VALUES,
 TRAINING_INTENSITY_VALUES,
 TRAINING_SESSION_DURATION_VALUES,
 TRAINING_WEEKDAY_OPTIONS,
 trainingEnvironmentToDisplayMode,
 trainingEquipmentToEnvironmentCode,
} from "./services/training-context-service.js";
import {
 AFFECTED_AREAS,
 buildInjuryCapabilityProfile,
 buildInjuryRuleResult as buildSharedInjuryRuleResult,
 INJURY_LIMITATION_OPTIONS,
 INJURY_SIDE_OPTIONS,
} from "./services/injury-planning-service.js";
import {
 applyIntakeSecondaryGoalResponse,
 applyIntakeCompletenessAnswer,
 applyIntakeGoalAdjustment,
 applyIntakeGoalStackConfirmation,
 buildIntakeCompletenessPacketContext,
 buildIntakeConfirmationNeedsList,
 canAskSecondaryGoal,
 buildIntakeMilestoneDecisionModel,
 buildIntakeSummaryRailModel,
 buildIntakeGoalStackConfirmation,
 buildIntakeGoalStackReviewModel,
 buildIntakeGoalReviewModel,
 buildIntakeSecondaryGoalPrompt,
 createIntakeMilestoneSelectionRecord,
 deriveIntakeConfirmationState,
 INTAKE_MILESTONE_PATHS,
 buildRawGoalIntentFromAnswers,
 GOAL_REVIEW_LANE_KEYS,
 GOAL_STACK_ROLES,
 readAdditionalGoalEntries,
 SECONDARY_GOAL_RESPONSE_KEYS,
 resolveCompatibilityPrimaryGoalKey,
} from "./services/intake-goal-flow-service.js";
import { buildIntakePlanPreviewModel } from "./services/intake-plan-preview-service.js";
import {
 buildIntakeCompletenessDraft,
 deriveIntakeCompletenessState,
 isStructuredIntakeCompletenessQuestion,
 validateIntakeCompletenessAnswer,
} from "./services/intake-completeness-service.js";
import {
  applyIntakeStarterMetrics,
  buildIntakeGoalCaptureModel,
  INTAKE_COPY_DECK,
  buildIntakeStarterGoalTypes,
  buildIntakeStarterMetricDraft,
  buildIntakeStarterMetricQuestions,
  inferIntakeStarterGoalTypeId,
  INTAKE_STAGE_CONTRACT,
  listFeaturedIntakeGoalTemplates,
} from "./services/intake-entry-service.js";
import {
 BASELINE_METRIC_KEYS,
 buildManualProgressInputsFromIntake,
 createBaselineSaveMeta,
 STARTING_CAPACITY_META,
 STARTING_CAPACITY_VALUES,
 SWIM_ACCESS_REALITY_VALUES,
} from "./services/intake-baseline-service.js";
import {
 joinDisplayParts,
 sanitizeDisplayCopy,
} from "./services/text-format-service.js";
import { formatRunTarget } from "./services/session-label-format-service.js";
import { adaptStrengthWorkoutForState, isStrengthWorkoutCandidate } from "./services/strength-readiness-adaptation-service.js";
import { buildDayPrescriptionDisplay } from "./services/day-prescription-display-service.js";
import { getMovementExplanation } from "./services/movement-explanation-service.js";
import {
 isHardNutritionDayType,
 isRecoveryNutritionDayType,
 isStrengthNutritionDayType,
 normalizeNutritionDayType,
 NUTRITION_DAY_TYPES,
} from "./services/nutrition-day-taxonomy-service.js";
import {
 GOAL_ANCHOR_QUICK_ENTRY_TYPES,
 buildGoalAnchorQuickEntryModel,
 upsertGoalAnchorQuickEntry,
} from "./services/goal-anchor-quick-entry-service.js";
import { buildGoalManagementPreview } from "./services/goal-management-service.js";
import {
  findGoalTemplateById,
  findGoalTemplateSelectionForGoalText,
  applyGoalTemplateSelectionToDraft,
  buildGoalTemplateSelection,
  buildGoalTemplateSelectionsFromAnswers,
  listGoalTemplateCategories,
  listGoalTemplates,
} from "./services/goal-template-catalog-service.js";
import {
 buildGoalTimingPresentation,
 buildTimingModeHelpText,
 buildVisiblePlanningHorizonLabel,
 OPEN_ENDED_TIMING_VALUE,
} from "./services/goal-timing-service.js";
import { buildPostIntakeReadyModel } from "./services/post-intake-ready-service.js";
import { buildSharedSessionSummaryModel } from "./services/session-summary-surface-service.js";
import { buildTodayCommandCenterModel } from "./services/today-command-center-service.js";
import {
 buildTodayPrescriptionSurfaceModel,
 TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
} from "./services/today-prescription-surface-service.js";
import {
 buildSupportTierModel,
} from "./services/support-tier-service.js";
import {
 createDefaultProgramSelectionState,
 normalizeProgramsSelectionState,
} from "./services/program-catalog-service.ts";
import {
 buildIntakeInjuryConstraintContext,
 INTAKE_INJURY_IMPACT_OPTIONS,
 normalizeHomeEquipmentResponse,
 sanitizeIntakeText,
} from "./services/intake-flow-service.js";
import {
 createIntakeMachineState,
 intakeReducer,
 INTAKE_MACHINE_EVENTS,
 INTAKE_MACHINE_STATES,
 validateIntakeCommitRequest,
} from "./services/intake-machine-service.js";
import { buildAnchorCollectionViewModel } from "./services/intake-anchor-collection-service.js";
import { aiExtractForMissingFields } from "./services/intake-ai-extraction-service.js";
import { resolveCoachVoiceDisplayCopy } from "./services/intake-coach-voice-service.js";
import {
 buildTranscriptMessageKey,
 queueCoachTranscriptMessages,
 resolveNextCoachStreamTargetId,
 TRANSCRIPT_MESSAGE_KINDS,
} from "./services/intake-transcript-service.js";
import {
 buildPersistableIntakeSession,
 INTAKE_SESSION_STORAGE_KEY,
 restorePersistedIntakeSession,
} from "./services/intake-session-service.js";
import { resolveLegacyPlannedDayHistoryEntry } from "./services/legacy-fallback-compat-service.js";
import { appendProvenanceSidecar, buildProvenanceEvent, describeProvenanceRecord, normalizeProvenanceEvent, PROVENANCE_ACTORS } from "./services/provenance-service.js";
import {
 StateFeedbackBanner,
 StateFeedbackChip,
} from "./components/StateFeedbackPrimitives.jsx";
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
} from "./components/SurfaceSystem.jsx";
import { IntakeSummaryRail } from "./components/IntakeSummaryRail.jsx";
import { CompactTrustRow } from "./components/CompactTrustRow.jsx";
import { ExerciseHowDisclosure } from "./components/ExerciseHowDisclosure.jsx";

function useResponsiveMediaQuery(query) {
 const getMatches = useCallback(() => {
 if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
 return false;
 }
 return window.matchMedia(query).matches;
 }, [query]);
 const [matches, setMatches] = useState(() => getMatches());
 useEffect(() => {
 if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
 return undefined;
 }
 const mediaQueryList = window.matchMedia(query);
 const handleChange = (event) => {
 setMatches(Boolean(event?.matches));
 };
 setMatches(mediaQueryList.matches);
 if (typeof mediaQueryList.addEventListener === "function") {
 mediaQueryList.addEventListener("change", handleChange);
 return () => mediaQueryList.removeEventListener("change", handleChange);
 }
 mediaQueryList.addListener(handleChange);
 return () => mediaQueryList.removeListener(handleChange);
 }, [getMatches, query]);
 return matches;
}

const FORMA_LAZY_CHUNK_NAMES = Object.freeze({
 logTab: "secondary.log",
 planTab: "secondary.plan",
 nutritionTab: "secondary.nutrition",
 coachTab: "secondary.coach",
 settingsTab: "secondary.settings",
});

const FORMA_LAZY_MODULES = Object.freeze({
 logTab: {
  chunkName: FORMA_LAZY_CHUNK_NAMES.logTab,
  moduleId: "src/domains/secondary-tabs/LogTabSurface.jsx",
  exportName: "LogTab",
 },
 planTab: {
  chunkName: FORMA_LAZY_CHUNK_NAMES.planTab,
  moduleId: "src/domains/secondary-tabs/PlanTabSurface.jsx",
  exportName: "PlanTab",
 },
 nutritionTab: {
  chunkName: FORMA_LAZY_CHUNK_NAMES.nutritionTab,
  moduleId: "src/domains/secondary-tabs/NutritionTabSurface.jsx",
  exportName: "NutritionTab",
 },
 coachTab: {
  chunkName: FORMA_LAZY_CHUNK_NAMES.coachTab,
  moduleId: "src/domains/secondary-tabs/CoachTabSurface.jsx",
  exportName: "CoachTab",
 },
 settingsTab: {
  chunkName: FORMA_LAZY_CHUNK_NAMES.settingsTab,
  moduleId: "src/domains/secondary-tabs/SettingsTabSurface.jsx",
  exportName: "SettingsTab",
 },
});

const loadFormaLazyChunk = (chunkName = "") => {
 if (typeof window === "undefined" || !chunkName) return Promise.resolve();
 const loader = window.__FORMA_LOAD_CHUNK__;
 if (typeof loader !== "function") return Promise.resolve();
 return loader(chunkName);
};

function useFormaLazyChunkState(chunkName = "", active = false) {
 const [state, setState] = useState(() => ({
 ready: !chunkName,
 loading: false,
 error: "",
 }));

 const loadChunk = useCallback(() => {
 if (!chunkName) {
  setState({ ready:true, loading:false, error:"" });
  return Promise.resolve();
 }
 const loadedChunks = typeof window !== "undefined" ? window.__FORMA_LOADED_CHUNKS__ : null;
 if (loadedChunks?.[chunkName]) {
  setState({ ready:true, loading:false, error:"" });
  return Promise.resolve();
 }
 setState((current) => current.ready ? current : { ready:false, loading:true, error:"" });
 return loadFormaLazyChunk(chunkName).then(() => {
  setState({ ready:true, loading:false, error:"" });
 }).catch((error) => {
  setState({
   ready:false,
   loading:false,
   error:String(error?.message || "Could not load this surface."),
  });
  throw error;
 });
 }, [chunkName]);

 useEffect(() => {
 if (!active) return undefined;
 let cancelled = false;
 loadChunk().catch(() => {
  if (cancelled) return;
 });
 return () => {
  cancelled = true;
 };
 }, [active, loadChunk]);

 return {
  ...state,
 loadChunk,
 };
}

function useFormaLazyModuleState({ chunkName = "", moduleId = "", exportName = "default", active = false } = {}) {
 const chunkState = useFormaLazyChunkState(chunkName, active);
 const [moduleState, setModuleState] = useState(() => ({
  Component: null,
  error: "",
  loading: false,
 }));

 const loadModule = useCallback(() => {
  if (!moduleId) {
   setModuleState({ Component: null, error: "Missing module id.", loading: false });
   return Promise.reject(new Error("Missing module id."));
  }
  const moduleLoader = typeof window !== "undefined" ? window.__FORMA_LOAD_MODULE__ : null;
  if (typeof moduleLoader !== "function") {
   setModuleState({ Component: null, error: "", loading: false });
   return Promise.resolve(null);
  }
  setModuleState((current) => ({
   Component: current.Component,
   error: "",
   loading: current.Component ? false : true,
  }));
  return moduleLoader({ chunkName, moduleId }).then((loadedModule) => {
   const nextComponent = loadedModule?.[exportName] || loadedModule?.default || null;
   if (!nextComponent) {
    throw new Error(`Lazy surface export not found: ${exportName}`);
   }
   setModuleState({ Component: nextComponent, error: "", loading: false });
   return nextComponent;
  }).catch((error) => {
   setModuleState({
    Component: null,
    error: String(error?.message || "Could not load this surface."),
    loading: false,
   });
   throw error;
  });
 }, [chunkName, exportName, moduleId]);

 useEffect(() => {
  if (!active || moduleState.Component) return undefined;
  let cancelled = false;
  loadModule().catch(() => {
   if (cancelled) return;
  });
  return () => {
   cancelled = true;
  };
 }, [active, loadModule, moduleState.Component]);

 return {
  ...chunkState,
  ...moduleState,
  error: moduleState.error || chunkState.error,
  loading: chunkState.loading || moduleState.loading,
 loadModule,
 };
}

function LazySurfaceSlot({
 surface = null,
 active = false,
 runtime = {},
 surfaceProps = {},
 loadingTitle = "Loading",
 loadingDetail = "Bringing this surface in now.",
 dataTestId = "",
 onRetry = () => {},
 onFallbackBack = () => {},
}) {
 const moduleState = useFormaLazyModuleState({
  chunkName: surface?.chunkName || "",
  moduleId: surface?.moduleId || "",
  exportName: surface?.exportName || "default",
  active,
 });

 if (!active) return null;
 if (moduleState.Component) {
  const LoadedSurface = moduleState.Component;
  return <LoadedSurface {...surfaceProps} runtime={runtime} />;
 }

 return (
  <SurfaceCard
   data-testid={dataTestId || "lazy-surface-loading"}
   variant="subtle"
   style={{
    display:"grid",
    gap:"0.42rem",
    padding:"0.85rem 0.9rem",
    borderRadius:24,
    borderColor:"var(--consumer-border-strong)",
    background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
   }}
  >
   <div style={{ fontSize:"0.52rem", color:"var(--consumer-text)", fontWeight:700 }}>{loadingTitle}</div>
   <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
    {moduleState.loading ? loadingDetail : moduleState.error || loadingDetail}
   </div>
   {!moduleState.loading && (
    <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
     <button type="button" className="btn btn-primary" onClick={() => (moduleState.loadModule?.() || Promise.resolve()).catch(() => {})} style={{ fontSize:"0.5rem" }}>
      Try again
     </button>
     <button type="button" className="btn" onClick={onFallbackBack} style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)" }}>
      Back to Today
     </button>
    </div>
   )}
  </SurfaceCard>
 );
}

// PROFILE
const DEFAULT_TIMEZONE = (() => {
 try {
 return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
 } catch {
 return "America/Chicago";
 }
})();

const PROFILE = {
 name: "Athlete", height: "6'1\"", weight: 190, age: 30, timezone: DEFAULT_TIMEZONE,
 goalRace: "TBD", goalTime: "TBD", goalPace: "TBD",
 startDate: new Date(),
 tdee: 3100,
 pushUpMax: 33,
};

// PLAN DATA
const PHASE_ZONES = {
 "BASE": { easy:"10:15-10:30", tempo:"8:45-8:55", int:"8:00-8:10", long:"10:15-10:30", color:"#4ade80" },
 "BUILDING": { easy:"10:00-10:15", tempo:"8:38-8:48", int:"7:55-8:05", long:"10:00-10:15", color:"#60a5fa" },
 "PEAKBUILD":{ easy:"9:50-10:05", tempo:"8:30-8:40", int:"7:50-8:00", long:"9:50-10:05", color:"#f59e0b" },
 "PEAK": { easy:"9:45-10:00", tempo:"8:28-8:35", int:"7:45-7:55", long:"9:45-10:00", color:"#f87171" },
 "TAPER": { easy:"9:45-10:00", tempo:"8:28-8:01 goal pace", int:"7:45-7:55", long:"9:45-10:00", color:"#c084fc" },
};

const WEEKS = [
 { w:1, phase:"BASE", label:"Getting legs back", mon:{t:"Easy",d:"3 mi"}, thu:{t:"Tempo",d:"2mi WU+20min+1mi CD"}, fri:{t:"Easy",d:"4 mi"}, sat:{t:"Long",d:"4 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:2, phase:"BASE", label:"Building rhythm", mon:{t:"Easy",d:"3 mi"}, thu:{t:"Tempo",d:"2mi WU+25min+1mi CD"}, fri:{t:"Easy",d:"4 mi"}, sat:{t:"Long",d:"5 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:3, phase:"BASE", label:"First intervals", mon:{t:"Easy",d:"3.5 mi"}, thu:{t:"Intervals",d:"1mi+3x8min/3min+1mi"},fri:{t:"Easy",d:"4.5 mi"}, sat:{t:"Long",d:"5 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runQuality },
 { w:4, phase:"BASE", label:"Cutback", cutback:true, mon:{t:"Easy",d:"3 mi"}, thu:{t:"Tempo",d:"1mi WU+20min easy+1mi"}, fri:{t:"Easy",d:"3 mi"}, sat:{t:"Long",d:"4 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:5, phase:"BUILDING", label:"New territory", mon:{t:"Easy",d:"3.5 mi"}, thu:{t:"Tempo",d:"2mi WU+30min+1mi CD"}, fri:{t:"Easy",d:"5 mi"}, sat:{t:"Long",d:"6 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:6, phase:"BUILDING", label:"Speed sharpening", mon:{t:"Easy",d:"4 mi"}, thu:{t:"Intervals",d:"1mi+4x6min/2min+1mi"},fri:{t:"Easy",d:"5 mi"}, sat:{t:"Long",d:"7 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runQuality },
 { w:7, phase:"BUILDING", label:"Dialing in", mon:{t:"Easy",d:"4 mi"}, thu:{t:"Tempo",d:"2mi WU+35min+1mi CD"}, fri:{t:"Easy",d:"5.5 mi"}, sat:{t:"Long",d:"7 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:8, phase:"BUILDING", label:"Cutback", cutback:true, mon:{t:"Easy",d:"3 mi"}, thu:{t:"Tempo",d:"1mi WU+20min+1mi"}, fri:{t:"Easy",d:"4 mi"}, sat:{t:"Long",d:"5 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:9, phase:"PEAKBUILD",label:"Double digits incoming", mon:{t:"Easy",d:"4 mi"}, thu:{t:"Intervals",d:"1mi+4x8min/3min+1mi"},fri:{t:"Easy",d:"6 mi"}, sat:{t:"Long",d:"8 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runQuality },
 { w:10, phase:"PEAKBUILD",label:"Pushing toward 9", mon:{t:"Easy",d:"4.5 mi"}, thu:{t:"Tempo",d:"2mi WU+40min+1mi CD"}, fri:{t:"Easy",d:"6 mi"}, sat:{t:"Long",d:"9 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:11, phase:"PEAKBUILD",label:"Holding strong", mon:{t:"Easy",d:"4.5 mi"}, thu:{t:"Intervals",d:"1mi+5x6min/2min+1mi"},fri:{t:"Easy",d:"6.5 mi"}, sat:{t:"Long",d:"9 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runQuality },
 { w:12, phase:"PEAKBUILD",label:"Cutback", cutback:true, mon:{t:"Easy",d:"3.5 mi"}, thu:{t:"Tempo",d:"1mi WU+25min+1mi"}, fri:{t:"Easy",d:"4 mi"}, sat:{t:"Long",d:"5 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:13, phase:"PEAK", label:"Double digits", mon:{t:"Easy",d:"5 mi"}, thu:{t:"Tempo",d:"2mi WU+45min+1mi CD"}, fri:{t:"Easy",d:"7 mi"}, sat:{t:"Long",d:"10 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:14, phase:"PEAK", label:"Biggest week", mon:{t:"Easy",d:"5 mi"}, thu:{t:"Intervals",d:"1mi+5x8min/3min+1mi"},fri:{t:"Easy",d:"7 mi"}, sat:{t:"Long",d:"11 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runQuality },
 { w:15, phase:"PEAK", label:"Peak complete", mon:{t:"Easy",d:"5 mi"}, thu:{t:"Tempo",d:"2mi WU+45min+1mi CD"}, fri:{t:"Easy",d:"7 mi"}, sat:{t:"Long",d:"12 mi"}, str:"B", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:16, phase:"TAPER", label:"Back off", mon:{t:"Easy",d:"4 mi"}, thu:{t:"Tempo",d:"1mi WU+30min+1mi"}, fri:{t:"Easy",d:"5 mi"}, sat:{t:"Long",d:"9 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:17, phase:"TAPER", label:"Final sharpening", mon:{t:"Easy",d:"3 mi"}, thu:{t:"Tempo",d:"1mi WU+20min@8:01+1mi"}, fri:{t:"Easy",d:"4 mi"}, sat:{t:"Long",d:"6 mi"}, str:"A", nutri:NUTRITION_DAY_TYPES.runEasy },
 { w:18, phase:"TAPER", label:"Race Week", race:true, mon:{t:"Easy",d:"3 mi shakeout"},thu:{t:"Easy",d:"2mi+strides"}, fri:{t:"Easy",d:"Rest/walk"},sat:{t:"Long",d:"13.1 mi"},str:null, nutri:NUTRITION_DAY_TYPES.runLong },
];

const STRENGTH = {
 A: {
 home: [
 { ex:"Wide Push-up", sets:"4x20", note:"Slow 3-count down. Outer chest." },
 { ex:"Standard Push-up", sets:"4x20", note:"Perfect form. 2 down, 1 up." },
 { ex:"Diamond Push-up", sets:"4x15", note:"Triceps. Rest 45 sec between sets." },
 { ex:"Decline Push-up (feet elevated)", sets:"3x15", note:"Upper chest emphasis." },
 { ex:"Band Chest Fly", sets:"4x15", note:"2-sec hold at center squeeze." },
 { ex:"Band Bicep Curl (slow)", sets:"4x15", note:"3-sec lower. No swinging." },
 { ex:"Band Tricep Overhead Extension", sets:"4x15", note:"Full lockout each rep." },
 { ex:"Plank to Push-up", sets:"3x10 each", note:"Core stability + chest combo." },
 { ex:"Dead Bug", sets:"3x12 each side", note:"Low back glued to floor." },
 ],
 hotel: [
 { ex:"Barbell Bench Press", sets:"5x5 ? 4x8", note:"Start at ~135 lbs. Progressive overload weekly." },
 { ex:"Incline DB Press", sets:"4x10", note:"30-45 deg angle. Full stretch at bottom." },
 { ex:"Cable Chest Fly", sets:"4x12", note:"Slight forward lean. Squeeze hard at center." },
 { ex:"EZ Bar Curl", sets:"4x10", note:"Strict form. No body english." },
 { ex:"Hammer Curl", sets:"3x12 each", note:"Brachialis hit. Control the lower." },
 { ex:"Tricep Pushdown (cable)", sets:"4x12", note:"Elbows pinned to sides." },
 { ex:"Overhead Tricep Extension (cable)", sets:"3x12", note:"Full stretch overhead." },
 { ex:"Ab Wheel / Cable Crunch", sets:"4x15", note:"Slow. Feel the abs, not the hip flexors." },
 ]
 },
 B: {
 home: [
 { ex:"Push-up Complex (3 rounds)", sets:"Widex15 ? Stdx15 ? Diamondx12", note:"No rest within round. 90 sec between rounds. This is the abs killer too." },
 { ex:"Band Chest Press (one arm)", sets:"3x12 each", note:"Unilateral press challenges core stability." },
 { ex:"Band Bent-over Row", sets:"4x15", note:"Row to chest. Posture for racing." },
 { ex:"Band Overhead Press", sets:"4x12", note:"Stand on band. Full extension." },
 { ex:"Band Pull-Apart", sets:"4x20", note:"Straight arms. Rear delts + posture." },
 { ex:"Band Lateral Raise", sets:"3x12", note:"Slow lower. Don't shrug." },
 { ex:"Hollow Body Hold", sets:"4x30 sec", note:"THE abs exercise. Lower back pressed down, legs low." },
 { ex:"Bicycle Crunch", sets:"3x20 each side", note:"Controlled. Don't yank the neck." },
 { ex:"Leg Raise", sets:"4x15", note:"Lower abs. Slow lower, don't let them crash." },
 ],
 hotel: [
 { ex:"Incline Barbell Press", sets:"4x8", note:"Upper chest. Control the eccentric." },
 { ex:"DB Fly (flat)", sets:"4x12", note:"Wide arc. Deep stretch." },
 { ex:"Cable Row (seated)", sets:"4x12", note:"Full retraction at top." },
 { ex:"Face Pull", sets:"4x15", note:"External rotation. Protects shoulders for runners." },
 { ex:"Dips (weighted if possible)", sets:"4x10", note:"Lean slightly forward for chest emphasis." },
 { ex:"Cable Crunch", sets:"4x15", note:"Round the spine. Abs only." },
 { ex:"Hanging Leg Raise", sets:"4x12", note:"Full hang. Legs to 90 deg. Core only." },
 { ex:"Plank Variations", sets:"3x60 sec each", note:"Standard, side L, side R. Squeeze everything." },
 ]
 }
};

const ACHILLES = [
 { ex:"Eccentric Heel Drop (bilateral wks 1-4, single-leg wks 5+)", sets:"3x15 each leg", note:"The #1 exercise. 4-sec lower. Do EVERY day." },
 { ex:"Calf Stretch (straight leg)", sets:"2x60 sec each", note:"Deep stretch. Hold it." },
 { ex:"Calf Stretch (bent knee)", sets:"2x60 sec each", note:"Targets soleus ? Achilles directly." },
 { ex:"Ankle Circles + Alphabet", sets:"1x each ankle", note:"Full mobility." },
 { ex:"Glute Bridge", sets:"3x15", note:"Strong glutes = less Achilles compensation." },
];
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
 const equipmentList = Array.isArray(preset?.equipment) ? preset.equipment.join(" ").toLowerCase() : String(preset?.equipment || "").toLowerCase();
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
const resolveTravelStateEnvironmentMode = ({ mode = "", equipment = "unknown" } = {}) => {
 const normalizedMode = String(mode || "").trim().toLowerCase();
 if (normalizedMode === "outdoor") return "outdoor";
 if (normalizedMode === "both") return "mixed";
 if (normalizedMode === "varies") return "variable";
 if (normalizedMode === "travel") return "travel";
 if (normalizedMode === "home") return "home";
 if (normalizedMode === "gym") {
 return equipment === "basic_gym"
 ? "limited gym"
 : equipment === "full_gym"
 ? "full gym"
 : "gym";
 }
 return equipment === "full_gym"
 ? "full gym"
 : equipment === "basic_gym"
 ? "limited gym"
 : equipment === "none"
 ? "home"
 : equipment === "mixed"
 ? "mixed"
 : equipment === "unknown"
 ? "unknown"
 : "home";
};
const CORE_FINISHER = [
 { ex: "Dead Bug", sets: "3", reps: "15/side", rest: "30s", cue: "Ribs down, low back pressed into floor." },
 { ex: "Plank", sets: "3", reps: "30s", rest: "30s", cue: "Glutes tight, neutral neck, no low-back sag." },
 { ex: "Bird Dog", sets: "3", reps: "12/side", rest: "30s", cue: "Move slow, keep hips level and square." },
];

const sanitizeWorkoutDetailText = (value = "") => sanitizeDisplayCopy(String(value ?? ""));
const cleanSurfaceSessionLabel = (value = "", fallback = "Session") => sanitizeDisplayText(
 String(value || fallback)
 .replace(/\(\s*reduced-load\s*\)/gi, "")
 .replace(/\(\s*extended\s*\)/gi, "")
 .replace(/\(\s*20-min version\s*\)/gi, "")
 .replace(/\s*\bReduced-load\b/gi, "")
 .replace(/\s*\bExtended\b/gi, "")
 .replace(/\s{2,}/g, " ")
) || sanitizeDisplayText(fallback);
const resolveCanonicalSurfaceSessionLabel = ({ sessionType = "", sessionLabel = "", fallback = "Session", isHybrid = false } = {}) => {
 if (isHybrid) return "Run + strength";
 const normalizedType = sanitizeDisplayText(sessionType);
 if (/run \+ strength/i.test(normalizedType)) return normalizedType;
 return cleanSurfaceSessionLabel(sessionLabel || normalizedType || fallback, fallback);
};
const sanitizeWorkoutRun = (run = null) => (
 run
 ? {
 ...run,
 t: sanitizeWorkoutDetailText(run.t),
 d: sanitizeWorkoutDetailText(run.d),
 }
 : null
);
const sanitizeWorkoutZones = (zones = null) => (
 zones
 ? {
 ...zones,
 easy: sanitizeWorkoutDetailText(zones.easy),
 tempo: sanitizeWorkoutDetailText(zones.tempo),
 int: sanitizeWorkoutDetailText(zones.int),
 long: sanitizeWorkoutDetailText(zones.long),
 }
 : null
);
const sanitizeWorkoutEntry = (entry = {}) => ({
 ...entry,
 ex: sanitizeWorkoutDetailText(entry.ex),
 sets: sanitizeWorkoutDetailText(entry.sets),
 reps: sanitizeWorkoutDetailText(entry.reps),
 rest: sanitizeWorkoutDetailText(entry.rest),
 note: sanitizeWorkoutDetailText(entry.note),
 cue: sanitizeWorkoutDetailText(entry.cue),
});

const parseSetPrescription = (setsText = "") => {
 const normalized = sanitizeWorkoutDetailText(setsText).trim().replace(/[xx]/gi, "x");
 const m = normalized.match(/^(\d+)\s*x\s*(.+)$/i);
 if (m) return { sets: m[1], reps: m[2] };
 return { sets: "As prescribed", reps: normalized || "As prescribed" };
};

const safeStorageGet = (storageLike, key, fallback = "") => {
 try {
 if (!storageLike?.getItem) return fallback;
 const value = storageLike.getItem(key);
 return value ?? fallback;
 } catch {
 return fallback;
 }
};

const safeStorageSet = (storageLike, key, value) => {
 try {
 if (!storageLike?.setItem) return false;
 storageLike.setItem(key, value);
 return true;
 } catch {
 return false;
 }
};

const toTestIdFragment = (value = "") => String(value || "")
 .trim()
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "")
 .slice(0, 80);

const safeStorageRemove = (storageLike, key) => {
 try {
 if (!storageLike?.removeItem) return false;
 storageLike.removeItem(key);
 return true;
 } catch {
 return false;
 }
};

const readPersistedIntakeSessionSnapshot = ({
 startingFresh = false,
} = {}) => {
 if (typeof window === "undefined") return null;
 const raw = safeStorageGet(sessionStorage, INTAKE_SESSION_STORAGE_KEY, "");
 if (!raw) return null;
 try {
 return restorePersistedIntakeSession(JSON.parse(raw), {
 startingFresh: Boolean(startingFresh),
 });
 } catch {
 return null;
 }
};

const normalizeStrengthExercise = (entry = {}) => {
 const { sets, reps } = parseSetPrescription(entry.sets || "");
 const cue = sanitizeWorkoutDetailText(entry.cue || entry.note || "Controlled reps with full range and stable form.");
 const note = sanitizeWorkoutDetailText(entry.note || "");
 const rest = sanitizeWorkoutDetailText(entry.rest || (/rest/i.test(note) ? (note.match(/rest\s*[^.]+/i)?.[0] || "45-60s") : "45-75s"));
 return {
 ex: sanitizeWorkoutDetailText(entry.ex || "Exercise"),
 sets: sanitizeWorkoutDetailText(sets),
 reps: sanitizeWorkoutDetailText(entry.reps || reps),
 rest,
 cue,
 note,
 };
};

const PROGRESSIVE_OVERLOAD_SET_CAPS = {
 compound: 6,
 lower_body: 6,
 upper_isolation: 5,
 default: 5,
};

const inferExerciseBucket = (exerciseName = "") => {
 const ex = String(exerciseName || "").toLowerCase();
 if (/squat|deadlift|hinge|rdl|lunge|split squat|step[-\s]?up|leg press|calf/.test(ex)) return "lower_body";
 if (/curl|tricep|lateral raise|fly|pull[-\s]?apart|face pull/.test(ex)) return "upper_isolation";
 if (/bench|press|row|dip|overhead|ohp|push[-\s]?up|chin[-\s]?up|pull[-\s]?up/.test(ex)) return "compound";
 return "default";
};
const inferLiftKey = (exerciseName = "") => {
 const ex = String(exerciseName || "").toLowerCase();
 if (/bench|chest press|incline/.test(ex)) return "bench";
 if (/squat|leg press|split squat|lunge/.test(ex)) return "squat";
 if (/deadlift|rdl|hinge/.test(ex)) return "deadlift";
 if (/overhead|ohp|shoulder press/.test(ex)) return "ohp";
 return "";
};

const getWeightIncrementByBucket = (bucket = "default") => {
 if (bucket === "upper_isolation") return 2.5;
 if (bucket === "compound" || bucket === "lower_body") return 5;
 return 5;
};

const parseRepTarget = (repsText = "") => {
 const text = sanitizeWorkoutDetailText(repsText).toLowerCase();
 const range = text.match(/(\d+)\s*[-\u2013\u2014]\s*(\d+)/);
 if (range) return Number(range[2]);
 const simple = text.match(/(\d+)/);
 return simple ? Number(simple[1]) : 8;
};

const parseSetCount = (setsText = "") => {
 const match = String(setsText || "").match(/(\d+)/);
 return match ? Number(match[1]) : 3;
};

const mapSessionFeelToScore = (sessionFeel = "about_right") => (
 sessionFeel === "easier_than_expected" ? 4 : sessionFeel === "harder_than_expected" ? 2 : 3
);
const resolvePhaseMode = ({ currentPhase = "BASE", goals = [] }) => {
 const raw = String(currentPhase || "").toUpperCase();
 if (raw.includes("CUT")) return "cut";
 if (raw.includes("BUILD")) return "build";
 const fatLossGoal = (goals || []).some((g) => g?.active && g?.category === "body_comp" && /lose|cut|fat/i.test(`${g?.name || ""} ${g?.measurableTarget || ""}`));
 if (fatLossGoal) return "cut";
 return "maintain";
};

const toDateKey = (v) => {
 const d = new Date(v || Date.now());
 if (Number.isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
 d.setHours(0, 0, 0, 0);
 return d.toISOString().split("T")[0];
};

const sortDatedEntries = (rows = []) => [...(Array.isArray(rows) ? rows : [])]
 .filter((row) => String(row?.date || "").trim())
 .sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));

const getLatestDatedEntry = (rows = []) => {
 const sorted = sortDatedEntries(rows);
 return sorted[sorted.length - 1] || null;
};

const parseLiftGoalWeights = (goals = []) => {
 const tracked = {};
 const lookups = [
 { key: "bench", regex: /bench[^0-9]*(\d{2,3})/i },
 { key: "squat", regex: /squat[^0-9]*(\d{2,3})/i },
 { key: "deadlift", regex: /deadlift[^0-9]*(\d{2,3})/i },
 { key: "ohp", regex: /(ohp|overhead press)[^0-9]*(\d{2,3})/i },
 ];
 const pool = (goals || [])
 .filter((g) => g?.active && g?.category === "strength")
 .map((g) => `${g?.name || ""} ${g?.measurableTarget || ""}`);
 for (const text of pool) {
 for (const lookup of lookups) {
 if (tracked[lookup.key]) continue;
 const m = String(text || "").match(lookup.regex);
 if (m) tracked[lookup.key] = Number(m[m.length - 1]);
 }
 }
 return tracked;
};

const deriveProgressiveOverloadAdjustments = ({ logs = {}, todayWorkout = {}, checkin = {}, personalization = {}, currentPhase = "BASE", goals = [], goalState = {} }) => {
 const dated = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
 const historyByExercise = {};
 dated.forEach(([date, entry]) => {
 (entry?.strengthPerformance || []).forEach((p) => {
 if (!p?.exercise) return;
 const key = String(p.exercise).toLowerCase();
 historyByExercise[key] = historyByExercise[key] || [];
 historyByExercise[key].push({ ...p, date, sessionFeelScore: Number(p.sessionFeelScore || 3) });
 });
 });

 const phaseMode = resolvePhaseMode({ currentPhase, goals });
 const isCut = phaseMode === "cut";
 const isBuild = phaseMode === "build";
 const injuryActive = (personalization?.injuryPainState?.level || "none") !== "none";
 const activeTimedGoal = getActiveTimeBoundGoal(goals);
 const deadlineDate = activeTimedGoal?.targetDate || goalState?.deadline || "";
 const daysToGoal = deadlineDate
 ? Math.max(0, Math.ceil((new Date(deadlineDate).getTime() - Date.now()) / 86400000))
 : null;
 const goalWeights = parseLiftGoalWeights(goals);
 const prior = personalization?.strengthProgression || {};
 const fitnessLevel = personalization?.fitnessSignals?.fitnessLevel || "intermediate";
 const incrementMultiplier = fitnessLevel === "developing" ? 0.5 : fitnessLevel === "advanced" ? 1.15 : 1;
 const prevPrescriptions = prior?.prescriptions || {};
 const nextPrescriptions = { ...prevPrescriptions };
 const updates = [];
 const todayPerformance = checkin?.strengthPerformance || [];

 todayPerformance.forEach((perf) => {
 const exercise = perf?.exercise || "";
 const exKey = String(exercise).toLowerCase();
 const liftKey = inferLiftKey(exercise) || exKey;
 if (!exercise) return;
 const bucket = perf?.bucket || inferExerciseBucket(exercise);
 const increment = Math.max(2.5, Number((getWeightIncrementByBucket(bucket) * incrementMultiplier).toFixed(1)));
 const maxSets = PROGRESSIVE_OVERLOAD_SET_CAPS[bucket] || PROGRESSIVE_OVERLOAD_SET_CAPS.default;
 const sessions = (historyByExercise[exKey] || []).slice(-3);
 const last = sessions[sessions.length - 1];
 const prev = sessions[sessions.length - 2];
 const repsRatioLast = Number(last?.completionRatio || 0);
 const repsRatioPrev = Number(prev?.completionRatio || 0);
 const hadTwoClean = repsRatioLast >= 1 && repsRatioPrev >= 1 && Number(last?.sessionFeelScore || 0) >= 3 && Number(prev?.sessionFeelScore || 0) >= 3;
 const harderAndUnder = checkin?.sessionFeel === "harder_than_expected" && repsRatioLast < 0.85;
 const shouldIncrease = hadTwoClean && !injuryActive;
 const shouldDecrease = injuryActive || repsRatioLast < 0.8 || harderAndUnder;
 const shouldHold = !shouldIncrease && !shouldDecrease && (repsRatioLast >= 0.8 || checkin?.sessionFeel === "harder_than_expected");
 const preset = prevPrescriptions[exKey] || prevPrescriptions[liftKey] || { workingWeight: Number(perf?.weightUsed || 0), sets: Number(perf?.prescribedSets || parseSetCount(perf?.prescribedSetsText || "")) || 3 };
 let nextWeight = Number(preset.workingWeight || perf?.weightUsed || 0);
 let nextSets = Number(preset.sets || perf?.prescribedSets || 3);
 let ruleTriggered = "hold";
 if (shouldIncrease) {
 nextWeight += increment;
 ruleTriggered = "increase_weight";
 } else if (shouldDecrease) {
 nextWeight = Math.max(increment, nextWeight - increment);
 ruleTriggered = injuryActive ? "decrease_weight_injury" : "decrease_weight_underperformance";
 } else if (shouldHold) {
 ruleTriggered = "hold_weight";
 }
 const cleanThreeAtSameWeight = sessions.length >= 3
 && sessions.slice(-3).every((s) => Number(s?.completionRatio || 0) >= 1 && Math.abs(Number(s?.weightUsed || 0) - Number(preset.workingWeight || 0)) < 0.01);
 if (cleanThreeAtSameWeight && isBuild && nextSets < maxSets) {
 nextSets += 1;
 ruleTriggered = "add_set_build_phase";
 }
 const avgFeel3 = sessions.length ? sessions.reduce((acc, s) => acc + Number(s?.sessionFeelScore || 3), 0) / sessions.length : 3;
 if ((isCut && nextSets > Math.max(3, maxSets - 1)) || avgFeel3 < 2.5) {
 nextSets = Math.max(2, nextSets - 1);
 ruleTriggered = isCut ? "remove_set_cut_volume_cap" : "remove_set_low_feel";
 }
 nextPrescriptions[exKey] = {
 exercise,
 bucket,
 workingWeight: nextWeight,
 sets: nextSets,
 increment,
 updatedAt: Date.now(),
 liftKey,
 };
 updates.push({
 exercise,
 exKey,
 liftKey,
 oldWeight: Number(preset.workingWeight || perf?.weightUsed || 0),
 newWeight: nextWeight,
 oldSets: Number(preset.sets || perf?.prescribedSets || 3),
 newSets: nextSets,
 ruleTriggered,
 increment,
 daysToGoal,
 phase: currentPhase,
 injuryActive,
 });
 });

 const nextTracking = { ...(prior?.tracking || {}) };
 Object.entries(nextPrescriptions).forEach(([key, p]) => {
 const sessions = (historyByExercise[key] || []).slice(-8);
 const canonicalKey = p?.liftKey || inferLiftKey(p?.exercise || "") || key;
 const recent4 = sessions.slice(-4);
 const first = recent4[0];
 const last = recent4[recent4.length - 1];
 const weeks = Math.max(1, recent4.length - 1);
 const rate = recent4.length >= 2 ? (Number(last?.weightUsed || p.workingWeight || 0) - Number(first?.weightUsed || p.workingWeight || 0)) / weeks : 0;
 const goalWeight = goalWeights[canonicalKey] || goalWeights[key] || nextTracking[canonicalKey]?.goalWeight || null;
 const currentWorkingWeight = Number(p.workingWeight || 0);
 const weeksToGoal = goalWeight && rate > 0 ? Math.max(0, (goalWeight - currentWorkingWeight) / rate) : null;
 const projectedDate = weeksToGoal !== null ? new Date(Date.now() + (weeksToGoal * 7 * 86400000)).toISOString().split("T")[0] : "";
 nextTracking[canonicalKey] = {
 ...(nextTracking[canonicalKey] || {}),
 exercise: p.exercise,
 currentWorkingWeight,
 goalWeight: goalWeight || nextTracking[canonicalKey]?.goalWeight || null,
 progressionRateLbsPerWeek: Number.isFinite(rate) ? Number(rate.toFixed(2)) : 0,
 projectedDateToGoal: projectedDate,
 updatedAt: Date.now(),
 };
 });

 return { updates, nextPrescriptions, nextTracking };
};

const BAND_TENSION_LEVELS = [
 "Light",
 "Medium",
 "Heavy",
 "Extra Heavy",
 "Extra Heavy + Light",
 "Two Heavy Bands",
];

const PROGRESSIVE_OVERLOAD_SET_CAPS_V2 = {
 compound: 5,
 lower_body: 5,
 upper_isolation: 4,
 core: 4,
 default: 4,
};

const toFiniteNumber = (value, fallback = null) => {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeExerciseKey = (exerciseName = "") => normalizePerformanceExerciseKey(exerciseName);

const inferExerciseMode = (exerciseName = "", explicitMode = "") => {
 const forced = String(explicitMode || "").toLowerCase();
 if (["weighted", "band", "bodyweight"].includes(forced)) return forced;
 const ex = normalizeExerciseKey(exerciseName);
 if (/band/.test(ex)) return "band";
 if (/push[-\s]?up|pull[-\s]?up|chin[-\s]?up|plank|dead bug|bird dog|leg raise|crunch|heel drop|stretch|alphabet|bridge|dip/.test(ex)) return "bodyweight";
 return "weighted";
};

const inferExerciseBucketV2 = (exerciseName = "") => {
 const ex = normalizeExerciseKey(exerciseName);
 if (/plank|dead bug|bird dog|leg raise|crunch|heel drop|hollow|carry/.test(ex)) return "core";
 return inferExerciseBucket(exerciseName);
};

const getWeightIncrementByBucketV2 = (bucket = "default") => (bucket === "lower_body" ? 5 : 2.5);

const getPhaseForDateKey = (dateKey = "", planStartDate = "") => {
 const week = resolvePlanWeekNumberForDateKey({
 dateKey,
 planStartDate,
 fallbackStartDate: PROFILE.startDate,
 });
 return WEEKS[Math.max(0, Math.min(week - 1, WEEKS.length - 1))]?.phase || "BASE";
};

const shiftBandTension = (bandTension = "", direction = 0) => {
 const normalized = String(bandTension || "").trim();
 const currentIndex = BAND_TENSION_LEVELS.findIndex((level) => level.toLowerCase() === normalized.toLowerCase());
 const safeIndex = currentIndex >= 0 ? currentIndex : 0;
 const nextIndex = Math.max(0, Math.min(BAND_TENSION_LEVELS.length - 1, safeIndex + direction));
 return BAND_TENSION_LEVELS[nextIndex];
};

const extractGoalWeightFromText = (text = "") => {
 const matches = String(text || "").match(/(\d{2,3}(?:\.\d+)?)/g);
 if (!matches?.length) return null;
 return Number(matches[matches.length - 1]);
};

const parseExerciseGoalTargets = ({ goals = [], exercises = [] }) => {
 const liftTargets = parseLiftGoalWeights(goals);
 const pool = (goals || [])
 .filter((g) => g?.active && g?.category === "strength")
 .map((g) => `${g?.name || ""} ${g?.measurableTarget || ""}`.toLowerCase());
 const targets = {};
 (exercises || []).forEach((exercise) => {
 const exKey = normalizeExerciseKey(exercise);
 if (!exKey || targets[exKey]) return;
 const liftKey = inferLiftKey(exercise);
 if (liftKey && liftTargets[liftKey]) {
 targets[exKey] = { goalWeight: liftTargets[liftKey], liftKey };
 return;
 }
 const tokens = exKey.split(" ").filter((token) => token.length > 2);
 const match = pool.find((text) => text.includes(exKey) || tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length || 1));
 const goalWeight = extractGoalWeightFromText(match || "");
 if (goalWeight) targets[exKey] = { goalWeight, liftKey };
 });
 return targets;
};

const buildStrengthHistoryByExercise = (logs = {}) => {
 const historyByExercise = {};
 Object.entries(logs || {})
 .sort((a, b) => a[0].localeCompare(b[0]))
 .forEach(([dateKey, entry]) => {
 getExercisePerformanceRecordsForLog(entry || {}, { dateKey }).forEach((record) => {
 if (!record?.exerciseKey) return;
 historyByExercise[record.exerciseKey] = historyByExercise[record.exerciseKey] || [];
 historyByExercise[record.exerciseKey].push(record);
 });
 });
 return historyByExercise;
};

const getRecordActualWeight = (record = {}) => toFiniteNumber(record?.actual?.weight ?? record?.actualWeight, null);
const getRecordPrescribedWeight = (record = {}) => toFiniteNumber(record?.prescribed?.weight ?? record?.prescribedWeight, null);
const getRecordActualReps = (record = {}) => Number(record?.actual?.reps ?? record?.actualReps ?? 0);
const getRecordPrescribedReps = (record = {}) => Number(record?.prescribed?.reps ?? record?.prescribedReps ?? 0);
const getRecordActualSets = (record = {}) => Number(record?.actual?.sets ?? record?.actualSets ?? 0);
const getRecordPrescribedSets = (record = {}) => Number(record?.prescribed?.sets ?? record?.prescribedSets ?? 0);
const getRecordBandTension = (record = {}) => String(record?.prescribed?.bandTension || record?.bandTension || "").trim();
const getRecordBodyweightOnly = (record = {}) => Boolean(record?.prescribed?.bodyweightOnly ?? record?.bodyweightOnly);
const getRecordFeelScore = (record = {}) => Number(record?.metrics?.feelScore ?? record?.feelThisSession ?? 3);
const getRecordCompletionRatio = (record = {}) => Number(record?.metrics?.completionRatio ?? record?.completionRatio ?? 0);

const isFullExerciseCompletion = (record = {}) => getRecordActualReps(record) >= getRecordPrescribedReps(record) && getRecordActualSets(record) >= getRecordPrescribedSets(record);
const isHoldSignal = (record = {}) => getRecordActualReps(record) < (getRecordPrescribedReps(record) * 0.8) || getRecordActualSets(record) < getRecordPrescribedSets(record) || getRecordFeelScore(record) <= 2;
const isPoorSignal = (record = {}) => getRecordActualReps(record) < (getRecordPrescribedReps(record) * 0.7) && getRecordFeelScore(record) <= 2;

const getResistanceSignature = (record = {}, prescription = {}) => {
 if (getRecordBodyweightOnly(record) || prescription?.mode === "bodyweight") return "bodyweight";
 if (getRecordBandTension(record) || prescription?.bandTension) return `band:${getRecordBandTension(record) || prescription?.bandTension}`;
 const weight = toFiniteNumber(getRecordActualWeight(record) ?? getRecordPrescribedWeight(record) ?? prescription?.workingWeight, null);
 return weight !== null ? `weight:${weight}` : "weight:0";
};

const formatPrescriptionChangeValue = ({ mode = "weighted", weight = null, bandTension = "", sets = 0, reps = 0 }) => {
 if (mode === "bodyweight") return `${sets}x${reps}`;
 if (mode === "band") return bandTension || "Band";
 return weight !== null && weight !== undefined ? `${weight} lb` : `${sets} sets`;
};

const buildExercisePerformanceRowsForStorage = (dateKey = "", performance = []) => (
 buildExercisePerformanceRowsFromRecords(
 Array.isArray(performance) && performance.some((record) => record?.scope === "exercise")
 ? performance
 : getExercisePerformanceRecordsForLog({ strengthPerformance: performance || [] }, { dateKey })
 )
);

const deriveProgressiveOverloadAdjustmentsV2 = ({ logs = {}, performance = [], personalization = {}, currentPhase = "BASE", goals = [], goalState = {}, sessionDateKey = "" }) => {
 const historyByExercise = buildStrengthHistoryByExercise(logs);
 const phaseMode = resolvePhaseMode({ currentPhase, goals });
 const allowSetAddition = phaseMode === "build" || phaseMode === "maintain";
 const prior = personalization?.strengthProgression || {};
 const prevPrescriptions = prior?.prescriptions || {};
 const nextPrescriptions = { ...prevPrescriptions };
 const performanceRecords = Array.isArray(performance) && performance.some((record) => record?.scope === "exercise")
 ? performance.filter((record) => record?.scope === "exercise")
 : getExercisePerformanceRecordsForLog({ strengthPerformance: performance || [] }, { dateKey: sessionDateKey });
 const allExercises = Array.from(new Set([
 ...Object.keys(historyByExercise),
 ...performanceRecords.map((record) => normalizeExerciseKey(record?.exercise || "")),
 ...Object.values(prevPrescriptions || {}).map((record) => normalizeExerciseKey(record?.exercise || "")),
 ].filter(Boolean)));
 const goalTargets = parseExerciseGoalTargets({ goals, exercises: allExercises });
 const updates = [];

 performanceRecords.forEach((record) => {
 const exKey = record.exerciseKey;
 const exerciseHistory = historyByExercise[exKey] || [];
 const lastTwo = exerciseHistory.slice(-2);
 const existing = prevPrescriptions[exKey] || prevPrescriptions[record.liftKey] || {};
 const bucket = record.bucket || inferExerciseBucketV2(record.exercise);
 const maxSets = PROGRESSIVE_OVERLOAD_SET_CAPS_V2[bucket] || PROGRESSIVE_OVERLOAD_SET_CAPS_V2.default;
 const mode = record.mode || inferExerciseMode(record.exercise);
 const baseReps = Math.max(1, Number(existing?.baselineReps || getRecordPrescribedReps(record) || 1));
 let nextSets = Math.max(1, Number(existing?.sets || getRecordPrescribedSets(record) || 1));
 let nextReps = Math.max(1, Number(existing?.reps || getRecordPrescribedReps(record) || 1));
 let nextWeight = mode === "weighted" ? toFiniteNumber(existing?.workingWeight ?? getRecordPrescribedWeight(record) ?? getRecordActualWeight(record), null) : null;
 let nextBandTension = mode === "band" ? String(existing?.bandTension || getRecordBandTension(record) || BAND_TENSION_LEVELS[0]) : "";
 const oldSets = nextSets;
 const oldReps = nextReps;
 const oldWeight = nextWeight;
 const oldBandTension = nextBandTension;
 const bothSolid = lastTwo.length === 2 && lastTwo.every((item) => isFullExerciseCompletion(item) && getRecordFeelScore(item) >= 3);
 const bothPoor = lastTwo.length === 2 && lastTwo.every((item) => isPoorSignal(item));
 const resistanceSignature = getResistanceSignature(record, existing);
 let consecutiveSameResistance = 0;
 for (let idx = exerciseHistory.length - 1; idx >= 0; idx -= 1) {
 const item = exerciseHistory[idx];
 if (!isFullExerciseCompletion(item)) break;
 if (getResistanceSignature(item, existing) !== resistanceSignature) break;
 consecutiveSameResistance += 1;
 }
 let ruleTriggered = "hold";

 if (mode === "bodyweight") {
 if (bothPoor) {
 if (nextReps > baseReps) nextReps -= 1;
 else if (nextSets > 2) nextSets -= 1;
 ruleTriggered = "decrease_bodyweight_target";
 } else if (bothSolid) {
 if (nextReps < baseReps + 5) {
 nextReps += 1;
 ruleTriggered = "increase_bodyweight_reps";
 } else if (nextSets < maxSets) {
 nextSets += 1;
 nextReps = baseReps;
 ruleTriggered = "add_bodyweight_set";
 }
 } else if (lastTwo.some((item) => isHoldSignal(item))) {
 ruleTriggered = "hold_bodyweight_target";
 }
 } else {
 const addSetTriggered = allowSetAddition && consecutiveSameResistance >= 4 && nextSets < maxSets;
 if (addSetTriggered) {
 nextSets += 1;
 ruleTriggered = "add_set_after_four_full_sessions";
 } else if (bothPoor) {
 if (mode === "band") nextBandTension = shiftBandTension(nextBandTension, -1);
 else if (nextWeight !== null) nextWeight = Math.max(getWeightIncrementByBucketV2(bucket), Number((nextWeight - getWeightIncrementByBucketV2(bucket)).toFixed(1)));
 ruleTriggered = mode === "band" ? "decrease_band_tension" : "decrease_weight";
 } else if (bothSolid) {
 if (mode === "band") nextBandTension = shiftBandTension(nextBandTension, 1);
 else if (nextWeight !== null) nextWeight = Number((nextWeight + getWeightIncrementByBucketV2(bucket)).toFixed(1));
 ruleTriggered = mode === "band" ? "increase_band_tension" : "increase_weight";
 } else if (lastTwo.some((item) => isHoldSignal(item))) {
 ruleTriggered = mode === "band" ? "hold_band_tension" : "hold_weight";
 }
 }

 nextPrescriptions[exKey] = {
 exercise: record.exercise,
 bucket,
 mode,
 workingWeight: nextWeight,
 bandTension: nextBandTension || null,
 sets: nextSets,
 reps: nextReps,
 baselineReps: baseReps,
 liftKey: record.liftKey,
 updatedAt: Date.now(),
 };

 const oldValue = formatPrescriptionChangeValue({ mode, weight: oldWeight, bandTension: oldBandTension, sets: oldSets, reps: oldReps });
 const newValue = formatPrescriptionChangeValue({ mode, weight: nextWeight, bandTension: nextBandTension, sets: nextSets, reps: nextReps });
 if (oldValue !== newValue) {
 updates.push({
 exercise: record.exercise,
 exKey,
 liftKey: record.liftKey || exKey,
 mode,
 bucket,
 ruleTriggered,
 oldWeight,
 newWeight: nextWeight,
 oldBandTension,
 newBandTension: nextBandTension,
 oldSets,
 newSets: nextSets,
 oldReps,
 newReps: nextReps,
 oldValue,
 newValue,
 });
 }
 });

 const nextTracking = { ...(prior?.tracking || {}) };
 allExercises.forEach((exerciseKey) => {
 const history = historyByExercise[exerciseKey] || [];
 const prescription = nextPrescriptions[exerciseKey] || prevPrescriptions[exerciseKey] || {};
 const exerciseName = prescription?.exercise || history[history.length - 1]?.exercise || exerciseKey;
 const liftKey = prescription?.liftKey || inferLiftKey(exerciseName);
 const target = goalTargets[exerciseKey] || goalTargets[liftKey] || {};
 const weightedHistory = history.filter((record) => toFiniteNumber(getRecordActualWeight(record) ?? getRecordPrescribedWeight(record), null) !== null).slice(-4);
 const first = weightedHistory[0];
 const last = weightedHistory[weightedHistory.length - 1];
 const firstWeight = toFiniteNumber(getRecordActualWeight(first) ?? getRecordPrescribedWeight(first), null);
 const lastWeight = toFiniteNumber(getRecordActualWeight(last) ?? getRecordPrescribedWeight(last) ?? prescription?.workingWeight, null);
 const elapsedDays = first?.date && last?.date ? Math.max(1, (new Date(`${last.date}T12:00:00`) - new Date(`${first.date}T12:00:00`)) / 86400000) : 0;
 const elapsedWeeks = elapsedDays > 0 ? elapsedDays / 7 : 0;
 const progressionRate = weightedHistory.length >= 2 && firstWeight !== null && lastWeight !== null && elapsedWeeks > 0
 ? Number(((lastWeight - firstWeight) / elapsedWeeks).toFixed(2))
 : 0;
 const currentWorkingWeight = toFiniteNumber(prescription?.workingWeight ?? lastWeight, null);
 const goalWeight = toFiniteNumber(target?.goalWeight ?? nextTracking[exerciseKey]?.goalWeight, null);
 const weeksToGoal = goalWeight !== null && currentWorkingWeight !== null
 ? goalWeight <= currentWorkingWeight
 ? 0
 : progressionRate > 0
 ? Number(((goalWeight - currentWorkingWeight) / progressionRate).toFixed(1))
 : null
 : null;
 const projectedDate = weeksToGoal !== null ? toDateKey(Date.now() + (weeksToGoal * 7 * 86400000)) : "";
 const activeTimedGoal = getActiveTimeBoundGoal(goals);
 const deadlineDate = String(activeTimedGoal?.targetDate || goalState?.deadline || "").trim();
 const deadlineConflict = Boolean(projectedDate && deadlineDate && projectedDate > deadlineDate);
 const trackingKey = liftKey || exerciseKey;
 nextTracking[trackingKey] = {
 ...(nextTracking[trackingKey] || {}),
 exercise: exerciseName,
 exerciseKey,
 currentWorkingWeight,
 goalWeight,
 progressionRateLbsPerWeek: progressionRate,
 projectedWeeksToGoal: weeksToGoal,
 projectedDateToGoal: projectedDate,
 deadlineDate,
 deadlineConflict,
 deadlineMessage: deadlineConflict ? `Projected goal date ${projectedDate} is after your target date ${deadlineDate}.` : "",
 updatedAt: Date.now(),
 };
 });

 return { updates, nextPrescriptions, nextTracking };
};

const HEALTHKIT_PERMISSIONS = [
 "Heart Rate (read)",
 "Resting Heart Rate (read)",
 "VO2 Max (read)",
 "Active Energy Burned (read)",
 "Workout sessions (read)",
 "Body Mass (read/write)",
 "Sleep Analysis (read)",
];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const deriveRunHealthMetrics = ({ workout = {}, log = {} }) => {
 const avgHr = Number(workout?.avgHr || workout?.averageHeartRate || 0);
 const maxHr = Number(workout?.maxHr || workout?.maxHeartRate || 0);
 const calories = Number(workout?.calories || workout?.activeEnergy || 0);
 const paceSeconds = (() => {
 const pace = String(log?.pace || "");
 const m = pace.match(/(\d+):(\d+)/);
 if (m) return (Number(m[1]) * 60) + Number(m[2]);
 return Number(workout?.paceSeconds || 0);
 })();
 const hrPaceRatio = (avgHr > 0 && paceSeconds > 0) ? Number((avgHr / paceSeconds).toFixed(3)) : null;
 const startHr = Number(workout?.startHr || avgHr || 0);
 const endHr = Number(workout?.endHr || avgHr || 0);
 const hrDrift = (startHr > 0 && endHr > 0) ? Number((((endHr - startHr) / startHr) * 100).toFixed(2)) : null;
 const recoveryHr = workout?.recoveryHr60 !== undefined && workout?.recoveryHr60 !== null
 ? Number(workout?.recoveryHr60)
 : (maxHr > 0 && Number(workout?.hrAfter60 || 0) > 0 ? Number(maxHr - Number(workout?.hrAfter60 || 0)) : null);
 return { avgHr, maxHr, calories, hrPaceRatio, hrDrift, recoveryHr };
};

const classifyRunFitnessLevel = ({ sessions = [], age = 30, actualMaxHr = null }) => {
 if (sessions.length < 5) return "unknown";
 const estimatedMax = Number(actualMaxHr || (220 - Number(age || 30)));
 const easyRuns = sessions.filter((s) => /easy|recovery/.test(String(s?.type || "").toLowerCase()) && Number(s?.avgHr || 0) > 0);
 if (!easyRuns.length || estimatedMax <= 0) return "unknown";
 const ratios = easyRuns.map((s) => Number(s.avgHr) / estimatedMax).filter((v) => Number.isFinite(v) && v > 0);
 if (!ratios.length) return "unknown";
 const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
 if (avg > 0.75) return "developing";
 if (avg >= 0.65) return "intermediate";
 return "advanced";
};

const deriveFitnessLayer = ({ logs = {}, personalization = {} }) => {
 const appleWorkouts = personalization?.connectedDevices?.appleHealth?.workouts || {};
 const dated = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
 const runSessions = dated
 .map(([date, log]) => {
 const sessionRecord = getSessionPerformanceRecordsForLog(log || {}, { dateKey: date })
 .find((record) => record?.sessionFamily === "run" || record?.domain === "endurance");
 const looksLikeRun = sessionRecord || /run/.test(String(log?.type || "").toLowerCase());
 if (!looksLikeRun) return null;
 const workout = appleWorkouts?.[date] || {};
 const metrics = deriveRunHealthMetrics({ workout, log });
 return {
 date,
 type: sessionRecord?.sessionType || log?.type || "",
 avgHr: sessionRecord?.actual?.avgHr ?? metrics.avgHr,
 maxHr: sessionRecord?.actual?.maxHr ?? metrics.maxHr,
 calories: sessionRecord?.actual?.calories ?? metrics.calories,
 hrPaceRatio: sessionRecord?.actual?.hrPaceRatio ?? metrics.hrPaceRatio,
 hrDrift: sessionRecord?.actual?.hrDrift ?? metrics.hrDrift,
 recoveryHr: sessionRecord?.actual?.recoveryHr ?? metrics.recoveryHr,
 };
 })
 .filter(Boolean)
 .filter((s) => Number(s?.avgHr || 0) > 0);
 const last5WithHr = runSessions.slice(-5);
 const fitnessLevel = classifyRunFitnessLevel({
 sessions: last5WithHr,
 age: personalization?.profile?.age || PROFILE.age,
 actualMaxHr: personalization?.profile?.actualMaxHr || null,
 });
 const targetMid = 0.7;
 const recentEasy = runSessions.slice(-8).filter((s) => /easy|recovery/.test(String(s?.type || "").toLowerCase()));
 const easyAvgPct = (() => {
 const maxHr = Number(personalization?.profile?.actualMaxHr || (220 - Number(personalization?.profile?.age || PROFILE.age)));
 if (!recentEasy.length || maxHr <= 0) return null;
 return recentEasy.reduce((acc, s) => acc + (Number(s.avgHr || 0) / maxHr), 0) / recentEasy.length;
 })();
 const paceOffsetSec = easyAvgPct === null ? 0 : easyAvgPct > targetMid + 0.05 ? 18 : easyAvgPct < targetMid - 0.07 ? -12 : 0;
 const strengthSamples = dated
 .flatMap(([dateKey, l]) => getExercisePerformanceRecordsForLog(l || {}, { dateKey }).map((record) => Number(getRecordCompletionRatio(record))))
 .filter((n) => Number.isFinite(n) && n > 0)
 .slice(-15);
 const strengthRirEstimate = strengthSamples.length ? Number((strengthSamples.reduce((a, b) => a + b, 0) / strengthSamples.length).toFixed(2)) : null;
 const strengthLevel = strengthRirEstimate === null ? "unknown" : strengthRirEstimate < 0.85 ? "developing" : strengthRirEstimate < 0.98 ? "intermediate" : "advanced";
 const mergedFitness = fitnessLevel === "unknown" ? strengthLevel : fitnessLevel;
 return {
 fitnessLevel: mergedFitness,
 runSignals: runSessions,
 paceOffsetSec,
 strengthLevel,
 strengthRirEstimate,
 updatedAt: Date.now(),
 };
};

const deriveGarminReadiness = (personalization = {}, todayKey = new Date().toISOString().split("T")[0]) => {
 const garmin = personalization?.connectedDevices?.garmin || {};
 const summary = garmin?.dailySummaries?.[todayKey] || {};
 const score = Number(summary?.trainingReadinessScore ?? garmin?.trainingReadinessScore ?? 0);
 if (!Number.isFinite(score) || score <= 0) return { score: null, mode: null, source: "none" };
 if (score >= 75) return { score, mode: "locked_in", source: "garmin" };
 if (score >= 50) return { score, mode: "standard", source: "garmin" };
 if (score >= 25) return { score, mode: "reduced_load", source: "garmin" };
 return { score, mode: "recovery", source: "garmin" };
};

const deriveDeviceSyncAudit = (personalization = {}, todayKey = new Date().toISOString().split("T")[0]) => {
 const appleWorkouts = personalization?.connectedDevices?.appleHealth?.workouts || {};
 const garminActivities = personalization?.connectedDevices?.garmin?.activities || [];
 const garminSummary = personalization?.connectedDevices?.garmin?.dailySummaries?.[todayKey] || {};
 const recentCutoff = Date.now() - (7 * 86400000);
 const appleRecent = Object.entries(appleWorkouts).filter(([date]) => new Date(`${date}T12:00:00`).getTime() >= recentCutoff);
 const garminRecent = (garminActivities || []).filter((a) => {
 const t = new Date(a?.startTime || a?.date || "").getTime();
 return Number.isFinite(t) && t >= recentCutoff;
 });
 const readiness = Number(garminSummary?.trainingReadinessScore ?? personalization?.connectedDevices?.garmin?.trainingReadinessScore ?? 0);
 const sleep = Number(garminSummary?.sleepScore ?? 0);
 const stress = Number(garminSummary?.stressScore ?? 0);
 const utilization = [
 appleRecent.length > 0 ? `Apple Health workouts (7d): ${appleRecent.length}` : "Apple Health workouts (7d): none",
 garminRecent.length > 0 ? `Garmin activities (7d): ${garminRecent.length}` : "Garmin activities (7d): none",
 readiness > 0 ? `Garmin readiness: ${readiness}` : "Garmin readiness: unavailable",
 sleep > 0 ? `Sleep score: ${sleep}` : "Sleep score: unavailable",
 ];
 let planMode = "normal";
 let reason = "";
 if (readiness > 0 && readiness <= 30) {
 planMode = "recovery";
 reason = "Low Garmin readiness";
 } else if ((sleep > 0 && sleep < 45) || stress >= 80) {
 planMode = "reduced_load";
 reason = sleep > 0 && sleep < 45 ? "Low sleep score" : "High stress score";
 }
 return { appleRecentCount: appleRecent.length, garminRecentCount: garminRecent.length, readiness, sleep, stress, planMode, reason, utilization };
};

const matchGarminRunActivity = ({ garminActivities = [], dateKey = "", log = {} }) => {
 const logTime = new Date(`${dateKey}T12:00:00`).getTime();
 const maxDiff = 2 * 60 * 60 * 1000;
 return (garminActivities || [])
 .filter((a) => /run/i.test(String(a?.type || a?.sport || "")))
 .map((a) => {
 const startTs = Number(a?.startTs || new Date(a?.startTime || `${dateKey}T12:00:00`).getTime());
 return { ...a, diff: Math.abs(startTs - logTime) };
 })
 .filter((a) => a.diff <= maxDiff)
 .sort((a, b) => a.diff - b.diff)[0] || null;
};

const buildRunRoutine = (todayWorkout) => {
 const run = todayWorkout?.run;
 if (!run) return [];
 const focus = run.t || "Run";
 if (focus === "Intervals") {
 return [
 { ex: "Warm-up jog", sets: "1", reps: "10-15 min easy + drills", rest: " - ", cue: "Stay relaxed and progressively raise cadence." },
 { ex: "Main interval set", sets: "1", reps: run.d || "As prescribed", rest: "Recoveries built in", cue: "Hit quality effort; keep form tall." },
 { ex: "Cool-down", sets: "1", reps: "8-12 min easy jog/walk", rest: " - ", cue: "Lower HR gradually; finish with light mobility." },
 ].map(sanitizeWorkoutEntry);
 }
 if (focus === "Tempo") {
 return [
 { ex: "Warm-up", sets: "1", reps: "10-15 min easy + strides", rest: " - ", cue: "Prime mechanics before threshold work." },
 { ex: "Tempo segment", sets: "1", reps: run.d || "As prescribed", rest: "Steady", cue: "Controlled discomfort, even pacing." },
 { ex: "Cool-down", sets: "1", reps: "8-12 min easy", rest: " - ", cue: "Finish smooth and conversational." },
 ].map(sanitizeWorkoutEntry);
 }
 if (focus === "Long") {
 return [
 { ex: "Long aerobic run", sets: "1", reps: run.d || "As prescribed", rest: "Continuous", cue: "Easy effort, nose-breathing test early." },
 { ex: "Fuel & hydration", sets: "Every 30-40 min", reps: "Water + carbs as needed", rest: " - ", cue: "Start fueling before you feel depleted." },
 { ex: "Post-run reset", sets: "1", reps: "5-10 min walk + calf/hip mobility", rest: " - ", cue: "Downshift gradually to aid recovery." },
 ].map(sanitizeWorkoutEntry);
 }
 return [
 { ex: "Easy aerobic run", sets: "1", reps: run.d || "As prescribed", rest: "Continuous", cue: "Conversational pace, smooth cadence." },
 { ex: "Strides (optional)", sets: "4-6", reps: "15-20s", rest: "40-60s walk", cue: "Quick feet, relaxed upper body." },
 { ex: "Cool-down walk", sets: "1", reps: "5 min", rest: " - ", cue: "Finish breathing calm and controlled." },
 ].map(sanitizeWorkoutEntry);
};

const getPlannedTrainingForLogDraft = (plannedDayRecord = null) => (
 plannedDayRecord?.resolved?.training
 || plannedDayRecord?.plan?.resolved?.training
 || plannedDayRecord?.training
 || plannedDayRecord?.base?.training
 || null
);

const buildStrengthPrescriptionEntriesForLogging = (training = null) => {
 const prescribedExercises = Array.isArray(training?.prescribedExercises)
 ? training.prescribedExercises.map(sanitizeWorkoutEntry).filter((item) => item?.ex)
 : [];
 if (prescribedExercises.length) return prescribedExercises;
 const strengthTrack = String(training?.strengthTrack || "").trim();
 const strengthSession = String(training?.strSess || "").trim();
 const mainExercises = (STRENGTH[strengthSession]?.[strengthTrack] || []).map(sanitizeWorkoutEntry);
 if (!mainExercises.length) return [];
 const adapted = adaptStrengthWorkoutForState({
  workout: training,
  state: training?.strengthPrescriptionMode || training?.readinessState || "steady",
  fallbackRows: mainExercises,
 });
 return Array.isArray(adapted?.prescribedExercises) && adapted.prescribedExercises.length
 ? adapted.prescribedExercises.map(sanitizeWorkoutEntry).filter((item) => item?.ex)
 : mainExercises;
};

const deriveReadinessAdjustedCheckin = (checkin = {}) => {
 const readiness = checkin.readiness || {};
 const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
 const sleep = toNum(readiness.sleep);
 const soreness = toNum(readiness.soreness);
 const stress = toNum(readiness.stress);
 const readinessFilled = [sleep, soreness, stress].some(v => typeof v === "number" && !Number.isNaN(v) && v > 0);
 if (!readinessFilled) return { readinessFilled: false, readiness: null, adjusted: {} };

 const adjusted = {};
 const lowReadiness = (sleep !== null && sleep <= 2) || (soreness !== null && soreness >= 4) || (stress !== null && stress >= 4);
 const highReadiness = (sleep !== null && sleep >= 4) && (soreness !== null && soreness <= 2) && (stress !== null && stress <= 2);
 if (lowReadiness) {
 adjusted.sessionFeel = "harder_than_expected";
 if (checkin.status === "completed_as_planned") adjusted.status = "completed_modified";
 } else if (highReadiness && checkin.sessionFeel !== "harder_than_expected") {
 adjusted.sessionFeel = "easier_than_expected";
 }
 const marker = `[readiness s${sleep || "-"} so${soreness || "-"} st${stress || "-"}]`;
 const cleanedNote = String(checkin.note || "").replace(/\s*\[readiness s.*?\]\s*$/i, "").trim();
 adjusted.note = cleanedNote ? `${cleanedNote} ${marker}` : marker;
 return { readinessFilled: true, readiness: { sleep, soreness, stress }, adjusted };
};
const stripInternalTags = (text = "") => sanitizeDisplayCopy(String(text || ""))
 .replace(/\[.*?\]/g, "")
 .replace(/\s{2,}/g, " ")
 .trim();
const normalizePendingStrengthAdjustments = (value) => {
 if (Array.isArray(value)) return value.filter(Boolean);
 return value ? [value] : [];
};
const sanitizeDisplayText = (text = "") => stripInternalTags(
 sanitizeDisplayCopy(String(text || "")
 .replace(/Auto-assumed complete unless corrected\.?/gi, "")
 .replace(/\btravelRun\b/gi, "run")
 .replace(/\bhybridRun\b/gi, "run + strength")
 .replace(/\brun_easy\b/gi, "easy run")
 .replace(/\brun_quality\b/gi, "quality run")
 .replace(/\brun_long\b/gi, "long run")
 .replace(/\bswim_technique\b/gi, "technique swim")
 .replace(/\bswim_aerobic\b/gi, "aerobic swim")
 .replace(/\bswim_quality\b/gi, "threshold swim")
 .replace(/\bswim_endurance\b/gi, "endurance swim")
 .replace(/\bstrength_support\b/gi, "strength support")
 .replace(/\bhybrid_support\b/gi, "run + strength")
 .replace(/\bconditioning_mixed\b/gi, "conditioning")
 .replace(/\btravel_endurance\b/gi, "travel endurance")
 .replace(/\btravel_recovery\b/gi, "travel recovery")
 )
).trim();
const sanitizeStatusLabel = (value = "", fallback = "Unknown") => {
 const textValue = String(value || "").replaceAll("_", " ").trim();
 return sanitizeDisplayText(textValue || fallback);
};
const joinHumanList = (items = []) => {
  const filtered = (items || []).filter(Boolean);
  if (!filtered.length) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered[filtered.length - 1]}`;
};
function resolveGoalPlanningCategory(goal = null) {
  return String(
    goal?.resolvedGoal?.planningCategory
    || goal?.planningCategory
    || goal?.category
    || ""
  ).trim().toLowerCase() || "general_fitness";
}
function getPrimaryPlanningGoal(goals = []) {
  const prioritizedGoals = typeof sortGoalsForPriorityDisplay === "function"
    ? sortGoalsForPriorityDisplay(goals)
    : (Array.isArray(goals) ? goals.filter((goal) => goal?.active) : []);
  return prioritizedGoals[0] || (Array.isArray(goals) ? goals.find((goal) => goal?.active) : null) || null;
}
const buildProvenanceText = ({ inputs = [], limitation = "" }) => {
  const joined = joinHumanList(inputs);
  if (!joined) return limitation || "";
  return limitation ? `Based on ${joined}. ${limitation}` : `Based on ${joined}.`;
};
const CANONICAL_INVARIANTS_ENABLED = (() => {
 if (typeof window === "undefined") return false;
 try {
 const host = String(window.location?.hostname || "").toLowerCase();
 const storedDebug = localStorage?.getItem ? (localStorage.getItem("trainer_debug") || "0") : "0";
 return ["localhost", "127.0.0.1"].includes(host) || storedDebug === "1";
 } catch {
 return false;
 }
})();
const warnCanonicalInvariant = (entity = "CanonicalState", message = "", context = null) => {
 if (!CANONICAL_INVARIANTS_ENABLED) return false;
 try {
 console.warn(`[canonical-invariant] ${entity}: ${message}`, context || {});
 } catch {}
 return false;
};
const assertCanonicalInvariant = (condition, entity = "CanonicalState", message = "", context = null) => (
 condition ? true : warnCanonicalInvariant(entity, message, context)
);
const validateActualNutritionLogInvariant = (actualNutritionLog = null, expectedDateKey = "", origin = "unknown") => {
 if (!actualNutritionLog) return true;
 const ok =
 assertCanonicalInvariant(typeof actualNutritionLog === "object", "ActualNutritionLog", "value should be an object", { origin, actualNutritionLog })
 && assertCanonicalInvariant(String(actualNutritionLog?.model || "") === "actual_nutrition_log_v1", "ActualNutritionLog", "unexpected model", { origin, model: actualNutritionLog?.model })
 && assertCanonicalInvariant(Boolean(String(actualNutritionLog?.dateKey || "").trim()), "ActualNutritionLog", "dateKey is required", { origin, actualNutritionLog })
 && assertCanonicalInvariant(!expectedDateKey || actualNutritionLog?.dateKey === expectedDateKey, "ActualNutritionLog", "dateKey does not match expected key", { origin, expectedDateKey, actualDateKey: actualNutritionLog?.dateKey })
 && assertCanonicalInvariant(typeof actualNutritionLog?.adherence === "string", "ActualNutritionLog", "adherence should be a string", { origin, adherence: actualNutritionLog?.adherence })
 && assertCanonicalInvariant(typeof actualNutritionLog?.deviationKind === "string", "ActualNutritionLog", "deviationKind should be a string", { origin, deviationKind: actualNutritionLog?.deviationKind });
 return ok;
};
const validateActualRecoveryLogInvariant = (actualRecoveryLog = null, expectedDateKey = "", origin = "unknown") => {
 if (!actualRecoveryLog) return true;
 const ok =
 assertCanonicalInvariant(typeof actualRecoveryLog === "object", "ActualRecoveryLog", "value should be an object", { origin, actualRecoveryLog })
 && assertCanonicalInvariant(String(actualRecoveryLog?.model || "") === "actual_recovery_log_v1", "ActualRecoveryLog", "unexpected model", { origin, model: actualRecoveryLog?.model })
 && assertCanonicalInvariant(!expectedDateKey || actualRecoveryLog?.dateKey === expectedDateKey, "ActualRecoveryLog", "dateKey does not match expected key", { origin, expectedDateKey, actualDateKey: actualRecoveryLog?.dateKey })
 && assertCanonicalInvariant(typeof actualRecoveryLog?.hydrationSupport === "object", "ActualRecoveryLog", "hydrationSupport should be present", { origin, actualRecoveryLog })
 && assertCanonicalInvariant(typeof actualRecoveryLog?.supplementAdherence === "object", "ActualRecoveryLog", "supplementAdherence should be present", { origin, actualRecoveryLog });
 return ok;
};
const validatePlanWeekInvariant = (planWeek = null, origin = "unknown") => {
 if (!planWeek) return true;
 const sessionsByDay = planWeek?.sessionsByDay;
 const ok =
 assertCanonicalInvariant(typeof planWeek === "object", "PlanWeek", "value should be an object", { origin, planWeek })
 && assertCanonicalInvariant(Boolean(String(planWeek?.id || "").trim()), "PlanWeek", "id is required", { origin, planWeek })
 && assertCanonicalInvariant(Number.isFinite(Number(planWeek?.absoluteWeek || planWeek?.weekNumber || 0)), "PlanWeek", "absoluteWeek/weekNumber should be numeric", { origin, absoluteWeek: planWeek?.absoluteWeek, weekNumber: planWeek?.weekNumber })
 && assertCanonicalInvariant(Boolean(planWeek?.programBlock && typeof planWeek.programBlock === "object"), "PlanWeek", "programBlock should be present", { origin, programBlock: planWeek?.programBlock })
 && assertCanonicalInvariant(Boolean(planWeek?.weeklyIntent && typeof planWeek.weeklyIntent === "object"), "PlanWeek", "weeklyIntent should be present", { origin, weeklyIntent: planWeek?.weeklyIntent })
 && assertCanonicalInvariant(Boolean(sessionsByDay && typeof sessionsByDay === "object" && !Array.isArray(sessionsByDay)), "PlanWeek", "sessionsByDay should be an object map", { origin, sessionsByDay });
 return ok;
};
const validatePlanWeekRecordInvariant = (entry = null, expectedWeekKey = "", origin = "unknown") => {
 if (!entry) return true;
 const resolvedWeekKey = String(entry?.weekKey || expectedWeekKey || "").trim();
 const ok =
 assertCanonicalInvariant(typeof entry === "object", "PlanWeekRecord", "value should be an object", { origin, entry })
 && assertCanonicalInvariant(String(entry?.model || "") === "plan_week_record", "PlanWeekRecord", "unexpected model", { origin, model: entry?.model })
 && assertCanonicalInvariant(Number(entry?.historyVersion || 0) >= 1, "PlanWeekRecord", "historyVersion should be present", { origin, historyVersion: entry?.historyVersion })
 && assertCanonicalInvariant(Boolean(resolvedWeekKey), "PlanWeekRecord", "weekKey is required", { origin, entry })
 && assertCanonicalInvariant(!expectedWeekKey || entry?.weekKey === expectedWeekKey, "PlanWeekRecord", "weekKey mismatch", { origin, expectedWeekKey, actualWeekKey: entry?.weekKey })
 && assertCanonicalInvariant(Boolean(entry?.record && typeof entry.record === "object"), "PlanWeekRecord", "record should be present", { origin, entry });
 validatePlanWeekInvariant(entry?.record || null, `${origin}:record`);
 return ok;
};
const validatePlanDayInvariant = (planDay = null, origin = "unknown") => {
 if (!planDay) return true;
 const nutritionActual = planDay?.resolved?.nutrition?.actual || null;
 const actualRecovery = planDay?.resolved?.recovery?.actual || null;
 const ok =
 assertCanonicalInvariant(typeof planDay === "object", "PlanDay", "value should be an object", { origin, planDay })
 && assertCanonicalInvariant(Boolean(String(planDay?.dateKey || "").trim()), "PlanDay", "dateKey is required", { origin, dateKey: planDay?.dateKey })
 && assertCanonicalInvariant(Boolean(planDay?.base && typeof planDay.base === "object"), "PlanDay", "base branch is required", { origin, base: planDay?.base })
 && assertCanonicalInvariant(Boolean(planDay?.resolved && typeof planDay.resolved === "object"), "PlanDay", "resolved branch is required", { origin, resolved: planDay?.resolved })
 && assertCanonicalInvariant(Boolean(planDay?.resolved?.training || planDay?.base?.training), "PlanDay", "training payload is missing", { origin, planDay })
 && assertCanonicalInvariant(Boolean(planDay?.week?.programBlock && typeof planDay.week.programBlock === "object"), "PlanDay", "week.programBlock should be present", { origin, week: planDay?.week })
 && assertCanonicalInvariant(Boolean(planDay?.decision && typeof planDay.decision === "object"), "PlanDay", "decision block is required", { origin, decision: planDay?.decision });
 if (nutritionActual) validateActualNutritionLogInvariant(nutritionActual, planDay?.dateKey || "", `${origin}:resolved.nutrition.actual`);
 if (actualRecovery) validateActualRecoveryLogInvariant(actualRecovery, planDay?.dateKey || "", `${origin}:resolved.recovery.actual`);
 return ok;
};
const validatePrescribedDayHistoryInvariant = (entry = null, expectedDateKey = "", origin = "unknown") => {
 if (!entry) return true;
 const revisions = Array.isArray(entry?.revisions) ? entry.revisions : [];
 const currentRevision = revisions.find((revision) => revision?.revisionId === entry?.currentRevisionId) || null;
 const ok =
 assertCanonicalInvariant(Boolean(String(entry?.dateKey || expectedDateKey || "").trim()), "PrescribedDayHistory", "dateKey is required", { origin, entry })
 && assertCanonicalInvariant(!expectedDateKey || entry?.dateKey === expectedDateKey, "PrescribedDayHistory", "history envelope dateKey mismatch", { origin, expectedDateKey, actualDateKey: entry?.dateKey })
 && assertCanonicalInvariant(Array.isArray(entry?.revisions) && revisions.length > 0, "PrescribedDayHistory", "revisions are required", { origin, revisions })
 && assertCanonicalInvariant(Boolean(entry?.currentRevisionId), "PrescribedDayHistory", "currentRevisionId is required", { origin, currentRevisionId: entry?.currentRevisionId })
 && assertCanonicalInvariant(Boolean(currentRevision), "PrescribedDayHistory", "currentRevisionId must resolve to a revision", { origin, currentRevisionId: entry?.currentRevisionId, revisionIds: revisions.map((revision) => revision?.revisionId) });
 revisions.forEach((revision, index) => {
 assertCanonicalInvariant(Number(revision?.revisionNumber || 0) === index + 1 || Number(revision?.revisionNumber || 0) > 0, "PrescribedDayHistory", "revisionNumber should be positive and ordered", { origin, revisionNumber: revision?.revisionNumber, index });
 assertCanonicalInvariant(revision?.record?.dateKey === (entry?.dateKey || expectedDateKey), "PrescribedDayHistory", "revision record dateKey mismatch", { origin, revisionDateKey: revision?.record?.dateKey, envelopeDateKey: entry?.dateKey || expectedDateKey });
 });
 return ok;
};
const validateAiPacketInvariant = (packetArgs = {}, origin = "unknown") => {
 const ok =
 assertCanonicalInvariant(Boolean(packetArgs && typeof packetArgs === "object"), "AIPacket", "packetArgs should be an object", { origin, packetArgs })
 && assertCanonicalInvariant(Boolean(String(packetArgs?.dateKey || "").trim()), "AIPacket", "dateKey is required", { origin, dateKey: packetArgs?.dateKey })
 && assertCanonicalInvariant(Number.isFinite(Number(packetArgs?.currentWeek || 0)), "AIPacket", "currentWeek should be numeric", { origin, currentWeek: packetArgs?.currentWeek })
 && assertCanonicalInvariant(Boolean(packetArgs?.canonicalGoalState && typeof packetArgs.canonicalGoalState === "object"), "AIPacket", "canonicalGoalState is required", { origin })
 && assertCanonicalInvariant(Boolean(packetArgs?.canonicalUserProfile && typeof packetArgs.canonicalUserProfile === "object"), "AIPacket", "canonicalUserProfile is required", { origin })
 && assertCanonicalInvariant(Boolean(packetArgs?.planDay && typeof packetArgs.planDay === "object"), "AIPacket", "planDay is required", { origin })
 && assertCanonicalInvariant(Boolean(packetArgs?.logs && typeof packetArgs.logs === "object"), "AIPacket", "logs should be an object map", { origin })
 && assertCanonicalInvariant(Boolean(Array.isArray(packetArgs?.bodyweights)), "AIPacket", "bodyweights should be an array", { origin, bodyweights: packetArgs?.bodyweights });
 validatePlanDayInvariant(packetArgs?.planDay || null, `${origin}:packet.planDay`);
 validatePlanWeekInvariant(packetArgs?.planWeek || null, `${origin}:packet.planWeek`);
 return ok;
};
const validateDeterministicCoachPacketInvariant = (packet = null, origin = "unknown") => {
 if (!packet) return warnCanonicalInvariant("CoachPacket", "deterministic packet is missing", { origin, packet });
 return (
 assertCanonicalInvariant(typeof packet === "object", "CoachPacket", "packet should be an object", { origin, packet })
 && assertCanonicalInvariant(
 Boolean(String(packet?.coachBrief || "").trim()) || Array.isArray(packet?.recommendations) || Array.isArray(packet?.notices),
 "CoachPacket",
 "expected coachBrief, recommendations, or notices",
 { origin, packet }
 )
 );
};
const validateCanonicalRuntimeStateInvariant = (runtimeState = null, origin = "unknown") => {
 if (!runtimeState || typeof runtimeState !== "object") return warnCanonicalInvariant("RuntimeState", "runtimeState should be an object", { origin, runtimeState });
 assertCanonicalInvariant(Boolean(runtimeState?.logs && typeof runtimeState.logs === "object"), "RuntimeState", "logs should be an object map", { origin });
 assertCanonicalInvariant(Array.isArray(runtimeState?.bodyweights), "RuntimeState", "bodyweights should be an array", { origin, bodyweights: runtimeState?.bodyweights });
 assertCanonicalInvariant(Boolean(runtimeState?.plannedDayRecords && typeof runtimeState.plannedDayRecords === "object"), "RuntimeState", "plannedDayRecords should be an object map", { origin });
 assertCanonicalInvariant(Boolean(runtimeState?.planWeekRecords && typeof runtimeState.planWeekRecords === "object"), "RuntimeState", "planWeekRecords should be an object map", { origin });
 Object.entries(runtimeState?.nutritionActualLogs || {}).slice(0, 40).forEach(([dateKey, actualNutritionLog]) => {
 validateActualNutritionLogInvariant(actualNutritionLog, dateKey, `${origin}:runtime.nutritionActualLogs`);
 });
 Object.entries(runtimeState?.plannedDayRecords || {}).slice(0, 40).forEach(([dateKey, entry]) => {
 validatePrescribedDayHistoryInvariant(entry, dateKey, `${origin}:runtime.plannedDayRecords`);
 });
 Object.entries(runtimeState?.planWeekRecords || {}).slice(0, 40).forEach(([weekKey, entry]) => {
 validatePlanWeekRecordInvariant(entry, weekKey, `${origin}:runtime.planWeekRecords`);
 });
 return true;
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

const buildReviewBadgeTone = (kind = "", palette = {}) => {
 const green = palette.green || "#27f59a";
 const blue = palette.blue || "#60a5fa";
 const amber = palette.amber || "#f59e0b";
 const value = String(kind || "").toLowerCase();
 if (/match|completed_as_planned|on_track|followed|high/.test(value)) return { color: green, bg: green + "14" };
 if (/modified|partial|changed|deviated|minor/.test(value)) return { color: blue, bg: blue + "14" };
 if (/skip|miss|unknown|missing|material|low|not_logged/.test(value)) return { color: amber, bg: amber + "14" };
 return { color: "#94a3b8", bg: "#1e293b" };
};

// HELPERS
const READINESS_SUCCESS_STATUSES = new Set(["completed_as_planned", "completed_modified", "partial_completed"]);
const toReadinessNumber = (value) => {
 const n = Number(value);
 return Number.isFinite(n) ? n : 0;
};
const hasReadinessInputs = (checkin = {}) => {
 const sleep = toReadinessNumber(checkin?.readiness?.sleep);
 const stress = toReadinessNumber(checkin?.readiness?.stress);
 const soreness = toReadinessNumber(checkin?.readiness?.soreness);
 const feel = String(checkin?.sessionFeel || "").trim();
 return sleep > 0 || stress > 0 || soreness > 0 || Boolean(feel);
};
const classifySessionDemand = (session = {}) => {
 const text = `${session?.type || ""} ${session?.label || ""} ${session?.run?.t || ""}`.toLowerCase();
 if (/rest|recovery|mobility|walk/.test(text)) return "recovery";
 if (/interval|tempo|long|hard|race|conditioning|otf|hiit|quality/.test(text)) return "high";
 if (/strength|run\+strength|strength\+prehab|hybrid|upper|lower|full.body|metabolic/.test(text)) return "moderate";
 if (/easy|steady|zone-2|zone 2/.test(text)) return "low";
 return "moderate";
};
const appendWorkoutQualifier = (label = "", qualifier = "") => {
 const base = String(label || "Session").trim() || "Session";
 if (!qualifier) return base;
 return base.toLowerCase().includes(String(qualifier).toLowerCase()) ? base : `${base} (${qualifier})`;
};
const scaleSessionDescriptor = (text = "", fallback = "20-30 min controlled", ratio = 0.72) => {
 const input = String(text || "").trim();
 if (!input) return fallback;
 const scaled = input.replace(/(\d+(\.\d+)?)/g, (match) => {
 const num = Number(match);
 if (!Number.isFinite(num)) return match;
 return String(Math.max(1, Math.round(num * ratio * 10) / 10));
 });
 return scaled === input ? fallback : scaled;
};
const getDayOfWeek = () => {
 return new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
};

const deriveTodayReadinessInfluence = ({ todayKey = new Date().toISOString().split("T")[0], checkin = {}, promptSignal = null, workout = null, logs = {}, dailyCheckins = {}, personalization = {}, momentum = {}, userProfile = {} }) => {
 const promptState = String(promptSignal?.state || "").toLowerCase();
 const baseWorkout = { ...(workout || {}), run: workout?.run ? { ...workout.run } : workout?.run };
 if (!Object.keys(baseWorkout).length) return null;

 const isNegativeRecovery = (candidate = {}) => {
 const sleep = toReadinessNumber(candidate?.readiness?.sleep);
 const stress = toReadinessNumber(candidate?.readiness?.stress);
 const soreness = toReadinessNumber(candidate?.readiness?.soreness);
 const feel = String(candidate?.sessionFeel || "").toLowerCase();
 return feel === "harder_than_expected" || (sleep > 0 && sleep <= 2) || stress >= 4 || soreness >= 4;
 };
 const isPositiveRecovery = (candidate = {}) => {
 const sleep = toReadinessNumber(candidate?.readiness?.sleep);
 const stress = toReadinessNumber(candidate?.readiness?.stress);
 const soreness = toReadinessNumber(candidate?.readiness?.soreness);
 const feel = String(candidate?.sessionFeel || "").toLowerCase();
 return feel === "easier_than_expected" || (sleep >= 4 && stress > 0 && stress <= 2 && soreness > 0 && soreness <= 2);
 };

 const todayTs = new Date(`${todayKey}T12:00:00`).getTime();
 const targetDays = Math.max(2, Number(userProfile?.daysPerWeek || userProfile?.days_per_week) || 3);
 const allDates = Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]));
 const recentRows = allDates
 .filter((dateKey) => {
 const t = new Date(`${dateKey}T12:00:00`).getTime();
 const diff = (todayTs - t) / 86400000;
 return diff > 0 && diff <= 10;
 })
 .sort((a, b) => b.localeCompare(a))
 .map((dateKey) => {
 const t = new Date(`${dateKey}T12:00:00`).getTime();
 const daysBack = Math.max(0, Math.round(((todayTs - t) / 86400000) * 10) / 10);
 const log = logs?.[dateKey] || {};
 const mergedCheckin = { ...(log?.checkin || {}), ...(dailyCheckins?.[dateKey] || {}) };
 return {
 date: dateKey,
 daysBack,
 log,
 checkin: mergedCheckin,
 status: resolveEffectiveStatus(mergedCheckin, dateKey),
 demand: classifySessionDemand({ type: log?.type, label: log?.label, run: { t: log?.type } }),
 };
 });
 const recent7 = recentRows.filter((row) => row.daysBack <= 7);
 const completedCount = recent7.filter((row) => READINESS_SUCCESS_STATUSES.has(row.status)).length;
 const skippedCount = recent7.filter((row) => row.status === "skipped" || row.status === "not_logged_expired").length;
 const modifiedCount = recent7.filter((row) => row.status === "completed_modified" || row.status === "partial_completed").length;
 const consistencyRatio = Math.min(1.25, completedCount / Math.max(1, targetDays));
 const hardSessions72h = recentRows.filter((row) => row.daysBack <= 3 && row.demand === "high").length;
 const hardSessions7d = recent7.filter((row) => row.demand === "high").length;
 const recentSupportiveCount = recentRows.slice(0, 3).filter((row) => isPositiveRecovery(row.checkin)).length;
 const recentStrainedCount = recentRows.slice(0, 3).filter((row) => isNegativeRecovery(row.checkin)).length;
 const latestRecoveryRow = recentRows.find((row) => hasReadinessInputs(row.checkin)) || null;
 const activeCheckin = hasReadinessInputs(checkin) ? checkin : (latestRecoveryRow?.checkin || {});
 const sleep = toReadinessNumber(activeCheckin?.readiness?.sleep);
 const stress = toReadinessNumber(activeCheckin?.readiness?.stress);
 const soreness = toReadinessNumber(activeCheckin?.readiness?.soreness);
 const feel = String(activeCheckin?.sessionFeel || "").toLowerCase();
 const inputDriven = hasReadinessInputs(checkin) || Boolean(promptState);
 const explicitDeviceBias = String(baseWorkout?.readinessBias || "").toLowerCase();
 const planBias = explicitDeviceBias
 || (baseWorkout?.type === "rest" && /recovery mode/i.test(String(baseWorkout?.label || "")) ? "recover" : "")
 || (baseWorkout?.minDay ? "reduce" : "");

 let protectScore = 0;
 let progressScore = 0;
 const protectReasons = [];
 const progressReasons = [];

 if (planBias === "recover") {
 protectScore += 4;
 protectReasons.push(explicitDeviceBias === "recover" ? "device readiness is low" : "the current plan is already protecting recovery");
 } else if (planBias === "reduce") {
 protectScore += 2;
 protectReasons.push(explicitDeviceBias === "reduce" ? "device readiness is cautious" : "the current plan is already reduced");
 }
 if (String(personalization?.injuryPainState?.level || "none") !== "none") {
 protectScore += 2;
 protectReasons.push("injury status still needs protection");
 }
 if (promptState === "recover") {
 protectScore += 2;
 protectReasons.push("you flagged low readiness");
 }
 if ((sleep > 0 && sleep <= 1) || stress >= 5 || soreness >= 5) {
 protectScore += 4;
 protectReasons.push("today's recovery input is clearly strained");
 } else if (isNegativeRecovery(activeCheckin)) {
 protectScore += 3;
 protectReasons.push("today's recovery input is strained");
 } else if (recentStrainedCount >= 2) {
 protectScore += 1;
 protectReasons.push("recent recovery signals have been trending heavy");
 }
 if (hardSessions72h >= 2) {
 protectScore += 2;
 protectReasons.push("recent intensity stacked up");
 } else if (hardSessions72h === 1 && (isNegativeRecovery(activeCheckin) || recentStrainedCount >= 1)) {
 protectScore += 1;
 protectReasons.push("a recent hard session is still hanging around");
 }
 if (consistencyRatio < 0.45) {
 protectScore += 2;
 protectReasons.push("recent schedule consistency is low");
 } else if (consistencyRatio < 0.6 || skippedCount >= 2) {
 protectScore += 1;
 protectReasons.push("consistency is better served by a finishable day");
 }
 if (modifiedCount >= 2) {
 protectScore += 1;
 protectReasons.push("recent sessions have needed modification");
 }

 if (promptState === "push") {
 progressScore += 1;
 progressReasons.push("you flagged high readiness");
 }
 if (isPositiveRecovery(activeCheckin)) {
 progressScore += 3;
 progressReasons.push("today's recovery input looks supportive");
 } else if (recentSupportiveCount >= 2) {
 progressScore += 1;
 progressReasons.push("recent recovery inputs have been steady");
 }
 if (consistencyRatio >= 0.85 && skippedCount === 0) {
 progressScore += 1;
 progressReasons.push("recent completion has been consistent");
 }
 if (hardSessions72h === 0 && hardSessions7d <= 2) {
 progressScore += 1;
 progressReasons.push("recent intensity is under control");
 }
 if (momentum?.momentumState === "building momentum") {
 progressScore += 1;
 progressReasons.push("training momentum is building");
 }

 const state = protectScore >= 6 || (protectScore >= 4 && (hardSessions72h >= 1 || planBias === "recover"))
 ? "recovery"
 : protectScore >= 3
 ? "reduced_load"
 : progressScore >= 4 && protectScore === 0
 ? "progression"
 : "steady";

 const strengthLaneActive = isStrengthWorkoutCandidate(baseWorkout);
 let adjustedWorkout = { ...baseWorkout, run: baseWorkout?.run ? { ...baseWorkout.run } : baseWorkout?.run };
 const baseDemand = classifySessionDemand(baseWorkout);
 const reasonText = joinHumanList((state === "progression" ? progressReasons : protectReasons).slice(0, 3));
 const baseExplanation = String(baseWorkout?.explanation || "").trim();
 const appendEnvironmentNote = (note = "") => {
 adjustedWorkout.environmentNote = [baseWorkout?.environmentNote, note].filter(Boolean).join(" ").trim();
 };

 let badge = "";
 let coachLine = "";
 let recoveryLine = "";
 let userVisibleLine = "";

 if (state === "recovery") {
 badge = "Recovery focus";
 if (adjustedWorkout?.run) {
 adjustedWorkout.run.t = "Recovery Aerobic";
 adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : "15-25 min walk or easy spin";
 }
 adjustedWorkout.type = strengthLaneActive ? (baseWorkout?.type || "strength+prehab") : (adjustedWorkout?.run ? "recovery" : "rest");
 adjustedWorkout.label = refreshAdjustedWorkoutLabel({
 workout: adjustedWorkout,
 qualifier: "Recovery focus",
 injuryState: personalization?.injuryPainState,
 });
 adjustedWorkout.minDay = true;
 adjustedWorkout.nutri = NUTRITION_DAY_TYPES.recovery;
 adjustedWorkout.success = "Keep effort easy, do the mobility work, and finish fresher than you started.";
 adjustedWorkout.recoveryRecommendation = "Walk or easy spin + 8-10 min mobility.";
 adjustedWorkout.intensityGuidance = "low";
 adjustedWorkout.optionalSecondary = "8-10 min mobility reset";
 if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "12-15 min mobility + activation";
 appendEnvironmentNote("Recovery focus today: walking, easy aerobic work, and mobility only.");
 coachLine = "Recovery focus today: remove intensity, keep movement easy, and protect the next 48 hours.";
 recoveryLine = "Recovery recommendation: walk or easy spin, then 8-10 minutes of mobility.";
 userVisibleLine = "Your recovery inputs and recent load shifted today toward recovery work.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is recovery focus based on ${reasonText || "strained recovery and recent load"}. Today's call is easy movement, mobility, and no hard effort.`;
 } else if (state === "reduced_load") {
 badge = "Reduced-load";
 if (adjustedWorkout?.run) {
 adjustedWorkout.run.t = baseDemand === "high" ? "Easy Aerobic" : (adjustedWorkout.run.t || "Controlled Aerobic");
 adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : scaleSessionDescriptor(adjustedWorkout.run.d || "", "20-30 min controlled");
 }
 adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Reduced-load");
 adjustedWorkout.minDay = true;
 adjustedWorkout.nutri = adjustedWorkout?.run ? NUTRITION_DAY_TYPES.runEasy : (baseWorkout?.nutri || NUTRITION_DAY_TYPES.strengthSupport);
 adjustedWorkout.success = "Keep intensity capped, finish the first useful block, and stop there.";
 adjustedWorkout.recoveryRecommendation = "Finish with 5-8 min mobility and keep the rest of the day easy.";
 adjustedWorkout.intensityGuidance = "controlled";
 adjustedWorkout.optionalSecondary = "5-8 min mobility or tissue work";
 if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "15-25 min";
 appendEnvironmentNote("Reduced-load today: cap intensity, shorten the session, and use mobility as the finish.");
 coachLine = "Reduced-load today: keep the session, lower the strain, and finish before fatigue starts to drift.";
 recoveryLine = "Recovery recommendation: cap intensity, finish with mobility, and skip extra volume.";
 userVisibleLine = "Your recovery and recent training pattern trimmed today's load.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is reduced-load based on ${reasonText || "recent strain and consistency signals"}. Keep the stimulus, but lower the intensity and total load.`;
 } else if (state === "progression") {
 badge = "Progression-ready";
 if (adjustedWorkout?.run && /easy/i.test(String(adjustedWorkout?.run?.t || ""))) adjustedWorkout.run.t = "Easy + strides";
 adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Progression-ready");
 adjustedWorkout.success = "Keep the planned session and add only one controlled progression if it stays smooth.";
 adjustedWorkout.recoveryRecommendation = "Keep your normal fueling and recovery; no extra hero volume after the session.";
 adjustedWorkout.intensityGuidance = "steady with one small progression";
 adjustedWorkout.extendedFinisher = adjustedWorkout?.extendedFinisher || (adjustedWorkout?.run ? "Optional: 4 x 20s strides if the session stays smooth." : "Optional: add one final quality set if form stays crisp.");
 appendEnvironmentNote("Progression-ready today: one small progression is available if execution stays controlled.");
 coachLine = "Current signals may support one small progression today: keep the plan intact and add it only if the session stays smooth.";
 recoveryLine = "Recovery recommendation: normal fueling, normal mobility, and no extra bonus work after the progression.";
 userVisibleLine = "Current recovery and consistency signals may support a small progression today.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is progression-ready based on ${reasonText || "recovery signals that look supportive and stable recent training"}. Keep the plan intact and progress only if the first half feels controlled.`;
 } else {
 adjustedWorkout.recoveryRecommendation = "Normal recovery: finish the session, refuel, and do your usual mobility.";
 adjustedWorkout.intensityGuidance = "planned";
 appendEnvironmentNote("Readiness is steady today: run the planned session with clean control.");
 coachLine = "Readiness is steady today: execute the planned session cleanly and keep the effort controlled.";
 recoveryLine = "Recovery recommendation: follow your normal fueling and mobility routine after the session.";
 userVisibleLine = "Current signals do not suggest changing the planned session.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness looks steady based on ${reasonText || "recent completion, recovery, and training load"}. Run the planned session as written and keep recovery normal.`;
 }

 if (strengthLaneActive) {
 adjustedWorkout = adaptStrengthWorkoutForState({
 workout: adjustedWorkout,
 state: ["recovery", "reduced_load"].includes(state) ? state : "steady",
 });
 }

 adjustedWorkout.readinessState = state;
 adjustedWorkout.readinessInputs = {
 completedCount,
 skippedCount,
 modifiedCount,
 consistencyRatio,
 hardSessions72h,
 hardSessions7d,
 sleep,
 stress,
 soreness,
 feel,
 };

 return {
 state,
 source: promptSignal?.label || (hasReadinessInputs(checkin) ? "check-in" : "readiness engine"),
 badge,
 coachLine,
 recoveryLine,
 userVisibleLine,
 inputDriven,
 factors: state === "progression" ? progressReasons : protectReasons,
 adjustedWorkout,
 };
};

const deriveDeterministicReadinessState = ({ todayKey = new Date().toISOString().split("T")[0], checkin = {}, promptSignal = null, workout = null, logs = {}, dailyCheckins = {}, personalization = {}, momentum = {}, userProfile = {} }) => {
 const promptState = String(promptSignal?.state || "").toLowerCase();
 const promptLabel = String(promptSignal?.label || "").trim();
 const baseWorkout = { ...(workout || {}), run: workout?.run ? { ...workout.run } : workout?.run };
 if (!Object.keys(baseWorkout).length) return null;

 const demandLoad = (demand = "") => demand === "high" ? 2 : demand === "moderate" ? 1 : 0;
 const isNegativeRecovery = (candidate = {}) => {
 const sleep = toReadinessNumber(candidate?.readiness?.sleep);
 const stress = toReadinessNumber(candidate?.readiness?.stress);
 const soreness = toReadinessNumber(candidate?.readiness?.soreness);
 const feel = String(candidate?.sessionFeel || "").toLowerCase();
 return feel === "harder_than_expected" || (sleep > 0 && sleep <= 2) || stress >= 4 || soreness >= 4;
 };
 const isPositiveRecovery = (candidate = {}) => {
 const sleep = toReadinessNumber(candidate?.readiness?.sleep);
 const stress = toReadinessNumber(candidate?.readiness?.stress);
 const soreness = toReadinessNumber(candidate?.readiness?.soreness);
 const feel = String(candidate?.sessionFeel || "").toLowerCase();
 return feel === "easier_than_expected" || (sleep >= 4 && stress > 0 && stress <= 2 && soreness > 0 && soreness <= 2);
 };

 const todayTs = new Date(`${todayKey}T12:00:00`).getTime();
 const targetDays = Math.max(2, Number(userProfile?.daysPerWeek || userProfile?.days_per_week || 3) || 3);
 const allDates = Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]))
 .filter(Boolean)
 .sort((a, b) => b.localeCompare(a));
 const recentRows = allDates
 .map((dateKey) => {
 const t = new Date(`${dateKey}T12:00:00`).getTime();
 const daysBack = Math.max(0, Math.round(((todayTs - t) / 86400000) * 10) / 10);
 const log = logs?.[dateKey] || {};
 const mergedCheckin = { ...(log?.checkin || {}), ...(dailyCheckins?.[dateKey] || {}) };
 return {
 date: dateKey,
 daysBack,
 log,
 checkin: mergedCheckin,
 status: resolveEffectiveStatus(mergedCheckin, dateKey),
 demand: classifySessionDemand({ type: log?.type, label: log?.label, run: log?.run || { t: log?.type } }),
 };
 })
 .filter((row) => row.daysBack > 0 && row.daysBack <= 10);
 const recent7 = recentRows.filter((row) => row.daysBack <= 7);
 const recentCountableRows = recent7.filter((row) => row.status !== "not_logged" && row.status !== "not_logged_grace");
 const completedRows = recentCountableRows.filter((row) => READINESS_SUCCESS_STATUSES.has(row.status));
 const skippedRows = recent7.filter((row) => row.status === "skipped" || row.status === "not_logged_expired");
 const modifiedRows = recent7.filter((row) => row.status === "completed_modified" || row.status === "partial_completed");
 const highDemand72h = recentRows.filter((row) => row.daysBack <= 3 && row.demand === "high" && READINESS_SUCCESS_STATUSES.has(row.status));
 const highDemand7d = recent7.filter((row) => row.demand === "high" && READINESS_SUCCESS_STATUSES.has(row.status));
 const trainingLoad72h = recentRows
 .filter((row) => row.daysBack <= 3 && READINESS_SUCCESS_STATUSES.has(row.status))
 .reduce((sum, row) => sum + demandLoad(row.demand), 0);
 const trainingLoad7d = recent7
 .filter((row) => READINESS_SUCCESS_STATUSES.has(row.status))
 .reduce((sum, row) => sum + demandLoad(row.demand), 0);
 const recentSupportiveRows = recentRows.slice(0, 3).filter((row) => isPositiveRecovery(row.checkin));
 const recentStrainedRows = recentRows.slice(0, 3).filter((row) => isNegativeRecovery(row.checkin));
 const latestRecoveryRow = recentRows.find((row) => hasReadinessInputs(row.checkin)) || null;
 const hasTodayRecoveryInput = hasReadinessInputs(checkin);
 const activeCheckin = hasTodayRecoveryInput ? checkin : (latestRecoveryRow?.checkin || {});
 const sleep = toReadinessNumber(activeCheckin?.readiness?.sleep);
 const stress = toReadinessNumber(activeCheckin?.readiness?.stress);
 const soreness = toReadinessNumber(activeCheckin?.readiness?.soreness);
 const feel = String(activeCheckin?.sessionFeel || "").toLowerCase();
 const inputDriven = hasTodayRecoveryInput || Boolean(promptState);
 const completionRatio = completedRows.length / Math.max(1, targetDays);
 const adherenceRatio = recentCountableRows.length ? (completedRows.length / recentCountableRows.length) : 0;
 const consistencyRatio = Math.min(1.25, completionRatio);
 const lowScheduleConsistency = completionRatio < 0.6 || adherenceRatio < 0.6 || skippedRows.length >= 2;
 const veryLowScheduleConsistency = completionRatio < 0.4 || adherenceRatio < 0.5 || skippedRows.length >= 3;
 const severeNegativeCheckin = (sleep > 0 && sleep <= 1) || stress >= 5 || soreness >= 5;
 const strongNegativeCheckin = promptState === "recover" || feel === "harder_than_expected" || (sleep > 0 && sleep <= 2) || stress >= 4 || soreness >= 4;
 const strongPositiveCheckin = promptState === "push" || feel === "easier_than_expected" || (sleep >= 4 && stress > 0 && stress <= 2 && soreness > 0 && soreness <= 2 && feel !== "harder_than_expected");
 const injuryNeedsProtection = String(personalization?.injuryPainState?.level || "none") !== "none";
 const explicitDeviceBias = String(baseWorkout?.readinessBias || "").toLowerCase();
 const planBias = explicitDeviceBias
 || (baseWorkout?.type === "rest" && /recovery mode/i.test(String(baseWorkout?.label || "")) ? "recover" : "")
 || (baseWorkout?.minDay ? "reduce" : "");

 let protectScore = 0;
 let progressScore = 0;
 const protectReasons = [];
 const progressReasons = [];

 if (planBias === "recover") {
 protectScore += 4;
 protectReasons.push(explicitDeviceBias === "recover" ? "device readiness is already low" : "the current plan is already in recovery mode");
 } else if (planBias === "reduce") {
 protectScore += 2;
 protectReasons.push(explicitDeviceBias === "reduce" ? "device readiness is already cautious" : "the current plan is already reduced");
 }
 if (injuryNeedsProtection) {
 protectScore += 2;
 protectReasons.push("injury status still needs protection");
 }
 if (promptState === "recover") {
 protectScore += 3;
 protectReasons.push("you flagged low readiness");
 }
 if (severeNegativeCheckin) {
 protectScore += 4;
 protectReasons.push("the latest recovery check-in is clearly strained");
 } else if (strongNegativeCheckin) {
 protectScore += 3;
 protectReasons.push("the latest recovery check-in is strained");
 } else if (recentStrainedRows.length >= 2) {
 protectScore += 2;
 protectReasons.push("recent recovery signals have been trending heavy");
 }
 if (trainingLoad72h >= 3 || highDemand72h.length >= 2) {
 protectScore += 2;
 protectReasons.push("recent intensity stacked up");
 } else if (highDemand72h.length === 1 && (strongNegativeCheckin || recentStrainedRows.length >= 1)) {
 protectScore += 1;
 protectReasons.push("a recent hard session still needs to be absorbed");
 }
 if (veryLowScheduleConsistency) {
 protectScore += 2;
 protectReasons.push("schedule consistency has broken down recently");
 } else if (lowScheduleConsistency) {
 protectScore += 1;
 protectReasons.push("recent schedule consistency is uneven");
 }
 if (modifiedRows.length >= 2) {
 protectScore += 1;
 protectReasons.push("recent sessions have needed modification");
 }
 if ((momentum?.logGapDays || 0) >= 4) {
 protectScore += 1;
 protectReasons.push("recent logging gaps suggest rhythm is off");
 }

 if (promptState === "push") {
 progressScore += 2;
 progressReasons.push("you flagged high readiness");
 }
 if (strongPositiveCheckin) {
 progressScore += 3;
 progressReasons.push("the latest recovery check-in looks supportive");
 } else if (recentSupportiveRows.length >= 2) {
 progressScore += 1;
 progressReasons.push("recent recovery inputs have stayed steady");
 }
 if (adherenceRatio >= 0.8 && skippedRows.length === 0) {
 progressScore += 2;
 progressReasons.push("recent workout completion has been reliable");
 } else if (completionRatio >= 0.85 && skippedRows.length <= 1) {
 progressScore += 1;
 progressReasons.push("recent schedule consistency has been solid");
 }
 if (trainingLoad72h <= 2 && highDemand7d.length <= 2) {
 progressScore += 1;
 progressReasons.push("recent intensity is under control");
 }
 if (momentum?.momentumState === "building momentum" || (momentum?.score || 0) >= 70) {
 progressScore += 1;
 progressReasons.push("training momentum is building");
 }

 let state = "steady";
 if (planBias === "recover" || protectScore >= 7 || (strongNegativeCheckin && (trainingLoad72h >= 2 || recentStrainedRows.length >= 2 || injuryNeedsProtection))) {
 state = "recovery";
 } else if (protectScore >= 4 || strongNegativeCheckin || veryLowScheduleConsistency) {
 state = "reduced_load";
 } else if (progressScore >= 5 && protectScore <= 1 && highDemand72h.length === 0 && adherenceRatio >= 0.75) {
 state = "progression";
 }

 const strengthLaneActive = isStrengthWorkoutCandidate(baseWorkout);
 let adjustedWorkout = { ...baseWorkout, run: baseWorkout?.run ? { ...baseWorkout.run } : baseWorkout?.run };
 const baseDemand = classifySessionDemand(baseWorkout);
 const factors = state === "progression"
 ? progressReasons
 : state === "steady"
 ? (protectReasons.length ? protectReasons : progressReasons)
 : protectReasons;
 const reasonText = joinHumanList(factors.slice(0, 3));
 const baseExplanation = String(baseWorkout?.explanation || "").trim();
 const appendEnvironmentNote = (note = "") => {
 adjustedWorkout.environmentNote = [baseWorkout?.environmentNote, note].filter(Boolean).join(" ").trim();
 };

 let badge = "Steady";
 let coachLine = "";
 let recoveryLine = "";
 let userVisibleLine = "";

 if (state === "recovery") {
 badge = "Recovery focus";
 if (adjustedWorkout?.run) {
 adjustedWorkout.run.t = "Recovery Aerobic";
 adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : "15-25 min walk or easy spin";
 }
 adjustedWorkout.type = strengthLaneActive ? (baseWorkout?.type || "strength+prehab") : (adjustedWorkout?.run ? "recovery" : "rest");
 adjustedWorkout.label = refreshAdjustedWorkoutLabel({
 workout: adjustedWorkout,
 qualifier: "Recovery focus",
 injuryState: personalization?.injuryPainState,
 });
 adjustedWorkout.minDay = true;
 adjustedWorkout.nutri = NUTRITION_DAY_TYPES.recovery;
 adjustedWorkout.success = "Keep effort easy, do the mobility work, and finish fresher than you started.";
 adjustedWorkout.recoveryRecommendation = "Walk or easy spin + 8-10 min mobility.";
 adjustedWorkout.intensityGuidance = "recovery only";
 adjustedWorkout.optionalSecondary = "8-10 min mobility reset";
 if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "12-15 min mobility + activation";
 appendEnvironmentNote("Recovery focus today: walking, easy aerobic work, and mobility only.");
 coachLine = "Recovery focus today: remove intensity, keep movement easy, and protect the next 48 hours.";
 recoveryLine = "Recovery recommendation: walk or easy spin, then 8-10 minutes of mobility.";
 userVisibleLine = "Recent completion, recovery input, and intensity stacking all point to recovery work today.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is recovery focus based on ${reasonText || "strained recovery and recent load"}. Today's call is easy movement, mobility, and no hard effort.`;
 } else if (state === "reduced_load") {
 badge = "Reduced-load";
 if (adjustedWorkout?.run) {
 adjustedWorkout.run.t = baseDemand === "high" ? "Easy Aerobic" : (adjustedWorkout.run.t || "Controlled Aerobic");
 adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : scaleSessionDescriptor(adjustedWorkout.run.d || "", "20-30 min controlled");
 if (["hard-run", "long-run"].includes(baseWorkout?.type || "")) adjustedWorkout.type = "easy-run";
 }
 adjustedWorkout.label = refreshAdjustedWorkoutLabel({
 workout: adjustedWorkout,
 qualifier: "Reduced-load",
 injuryState: personalization?.injuryPainState,
 });
 adjustedWorkout.minDay = true;
 adjustedWorkout.nutri = adjustedWorkout?.run ? NUTRITION_DAY_TYPES.runEasy : (baseWorkout?.nutri || NUTRITION_DAY_TYPES.strengthSupport);
 adjustedWorkout.success = "Keep intensity capped, finish the first useful block, and stop there.";
 adjustedWorkout.recoveryRecommendation = "Finish with 5-8 min mobility and keep the rest of the day easy.";
 adjustedWorkout.intensityGuidance = "controlled";
 adjustedWorkout.optionalSecondary = "5-8 min mobility or tissue work";
 if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "15-25 min";
 appendEnvironmentNote("Reduced-load today: cap intensity, shorten the session, and use mobility as the finish.");
 coachLine = "Reduced-load today: keep the session, lower the strain, and finish before fatigue starts to drift.";
 recoveryLine = "Recovery recommendation: cap intensity, finish with mobility, and skip extra volume.";
 userVisibleLine = "Your recovery signals or recent consistency trimmed today's load.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is reduced-load based on ${reasonText || "recent strain and consistency signals"}. Keep the stimulus, but lower the intensity and total load.`;
 } else if (state === "progression") {
 badge = "Progression-ready";
 if (adjustedWorkout?.run && /easy/i.test(String(adjustedWorkout?.run?.t || ""))) adjustedWorkout.run.t = "Easy + strides";
 adjustedWorkout.label = refreshAdjustedWorkoutLabel({
 workout: adjustedWorkout,
 qualifier: "Progression-ready",
 injuryState: personalization?.injuryPainState,
 });
 adjustedWorkout.success = "Keep the planned session and add only one controlled progression if it stays smooth.";
 adjustedWorkout.recoveryRecommendation = "Keep your normal fueling and recovery; no extra hero volume after the session.";
 adjustedWorkout.intensityGuidance = "planned plus one small progression";
 adjustedWorkout.extendedFinisher = adjustedWorkout?.extendedFinisher || (adjustedWorkout?.run ? "Optional: 4 x 20s strides if the session stays smooth." : "Optional: add one final quality set if form stays crisp.");
 appendEnvironmentNote("Progression-ready today: one small progression is available if execution stays controlled.");
 coachLine = "Current signals may support one small progression today: keep the plan intact and add it only if the session stays smooth.";
 recoveryLine = "Recovery recommendation: normal fueling, normal mobility, and no extra bonus work after the progression.";
 userVisibleLine = "Supportive-looking recovery signals and reliable recent completion may allow a small progression today.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is progression-ready based on ${reasonText || "recovery signals that look supportive and stable recent training"}. Keep the plan intact and progress only if the first half feels controlled.`;
 } else {
 adjustedWorkout.recoveryRecommendation = "Normal recovery: finish the session, refuel, and do your usual mobility.";
 adjustedWorkout.intensityGuidance = "planned";
 appendEnvironmentNote("Readiness is steady today: run the planned session with clean control.");
 coachLine = "Readiness is steady today: execute the planned session cleanly and keep the effort controlled.";
 recoveryLine = "Recovery recommendation: follow your normal fueling and mobility routine after the session.";
 userVisibleLine = "Current signals do not suggest changing the planned session.";
 adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness looks steady based on ${reasonText || "recent completion, recovery, and training load"}. Run the planned session as written and keep recovery normal.`;
 }

 if (strengthLaneActive) {
 adjustedWorkout = adaptStrengthWorkoutForState({
 workout: adjustedWorkout,
 state: ["recovery", "reduced_load"].includes(state) ? state : "steady",
 });
 }

 adjustedWorkout.readinessState = state;
 adjustedWorkout.readinessStateLabel = badge;
 adjustedWorkout.readinessInputs = {
 completedCount: completedRows.length,
 countableCount: recentCountableRows.length,
 skippedCount: skippedRows.length,
 modifiedCount: modifiedRows.length,
 consistencyRatio: Number(consistencyRatio.toFixed(2)),
 adherenceRatio: Number(adherenceRatio.toFixed(2)),
 hardSessions72h: highDemand72h.length,
 hardSessions7d: highDemand7d.length,
 trainingLoad72h,
 trainingLoad7d,
 recentSupportiveCount: recentSupportiveRows.length,
 recentStrainedCount: recentStrainedRows.length,
 sleep,
 stress,
 soreness,
 feel,
 targetDays,
 latestRecoveryDate: latestRecoveryRow?.date || "",
 hasTodayRecoveryInput,
 hasRecoveryHistory: Boolean(latestRecoveryRow),
 promptState,
 };

 return {
 state,
 stateLabel: badge,
 source: promptLabel || (hasTodayRecoveryInput ? "today's check-in" : latestRecoveryRow?.date ? `recovery inputs from ${latestRecoveryRow.date}` : planBias ? "device recovery signals" : "recent training pattern"),
 badge,
 coachLine,
 recoveryLine,
 userVisibleLine,
 inputDriven,
 factors,
 metrics: adjustedWorkout.readinessInputs,
 adjustedWorkout,
 };
};

const getTodayWorkout = (weekNum, dayNum) => {
 // FALLBACK_ONLY: this static template helper still powers legacy prescribed-
 // history reconstruction and older preview/backfill paths. Canonical planning
 // should flow through PlanDay/PlanWeek when that data exists.
 const week = WEEKS[(weekNum - 1) % WEEKS.length];
 if (!week) return null;
 const zones = sanitizeWorkoutZones(PHASE_ZONES[week.phase]);
 const dayMap = {
 1: { type: "run+strength", run: week.mon, strSess: week.str, label: "Easy Run + Strength A" },
 2: { type: "otf", label: "Orange Theory - Hybrid Day" },
 3: { type: "strength+prehab", strSess: week.str === "A" ? "B" : "A", label: "Strength B + Durability" },
 4: { type: "hard-run", run: week.thu, label: `${week.thu?.t} Run` },
 5: { type: "easy-run", run: week.fri, label: "Easy Run" },
 6: { type: "long-run", run: week.sat, label: "Long Run" },
 0: { type: "rest", label: "Rest Day", isRecoverySlot: true },
 };
 const workout = dayMap[dayNum] || dayMap[0];
 return {
 ...workout,
 label: sanitizeWorkoutDetailText(workout.label),
 run: sanitizeWorkoutRun(workout.run),
 week,
 zones,
 };
};

const dayColors = { "run+strength":"#3c91e6", otf:"#c97a2b", "strength+prehab":"#6e63d9", "hard-run":"#d85d78", "easy-run":"#2da772", "long-run":"#c94f6d", rest:"#536479" };
const C = { green:"#2da772", blue:"#3c91e6", amber:"#c97a2b", red:"#d85d78", purple:"#6e63d9", lime:"#b5d43a", slate:"#5f6f85" };
const PLAN_STATUS_TONES = {
 completed: { color:C.green, background:`${C.green}12`, borderColor:`${C.green}24` },
 upcoming: { color:"#dbe7f6", background:"rgba(30, 41, 59, 0.72)", borderColor:"rgba(71, 85, 105, 0.72)" },
 adjusted: { color:C.amber, background:`${C.amber}12`, borderColor:`${C.amber}24` },
 recovery: { color:"#8fa5c8", background:"rgba(100, 116, 139, 0.18)", borderColor:"rgba(100, 116, 139, 0.28)" },
 preview: { color:C.purple, background:`${C.purple}12`, borderColor:`${C.purple}24` },
 missed: { color:C.red, background:`${C.red}12`, borderColor:`${C.red}24` },
};
function SyncStateCallout({ model = null, dataTestId = "", compact = false, style = {} }) {
 return (
 <StateFeedbackBanner
 model={{
 ...model,
 liveMode: model?.stateId === SYNC_STATE_IDS.synced ? "off" : "polite",
 }}
 dataTestId={dataTestId}
 compact={compact}
 style={style}
 />
 );
}
function CompactSyncStatus({ model = null, dataTestId = "", style = {} }) {
 return (
 <StateFeedbackChip
 model={{
 ...model,
 liveMode: model?.stateId === SYNC_STATE_IDS.synced ? "off" : "polite",
 }}
 dataTestId={dataTestId}
 style={style}
 />
 );
}
const WORKOUT_TYPE_ICON = { "run+strength":"run_strength", otf:"otf", "strength+prehab":"strength_prehab", "hard-run":"hard_run", "easy-run":"easy_run", "long-run":"long_run", rest:"rest" };
const RUN_TYPE_ICON = { Easy:"easy_run", Tempo:"tempo_run", Intervals:"interval_run", Long:"long_run", Recovery:"rest" };
const NUTRITION_ICON = { Protein:"protein", Carbs:"carbs", Calories:"calories", Breakfast:"breakfast", Lunch:"lunch", Dinner:"dinner", "Optional snack":"snack", "Travel backup":"travel", "Grocery reset":"grocery" };
function InlineGlyph({ name = "easy_run", color = "#cbd5e1", size = 14 }) {
 const stroke = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
 let body = <circle cx="12" cy="12" r="6" {...stroke} />;

 switch (name) {
 case "tempo_run":
 body = (
 <>
 <path d="M5 16 L10 11 L13 14 L19 8" {...stroke} />
 <path d="M16 8 H19 V11" {...stroke} />
 </>
 );
 break;
 case "interval_run":
 body = (
 <>
 <path d="M6 18 V14" {...stroke} />
 <path d="M12 18 V10" {...stroke} />
 <path d="M18 18 V6" {...stroke} />
 </>
 );
 break;
 case "long_run":
 body = (
 <>
 <path d="M5 14 C8 9, 12 9, 16 14" {...stroke} />
 <path d="M16 14 L19 11" {...stroke} />
 <path d="M16 14 L19 17" {...stroke} />
 </>
 );
 break;
 case "hard_run":
 body = <path d="M12 4 L7 13 H11 L9 20 L17 10 H13 L15 4 Z" {...stroke} />;
 break;
 case "run_strength":
 body = (
 <>
 <path d="M4 12 H8" {...stroke} />
 <path d="M16 12 H20" {...stroke} />
 <path d="M8 10 V14" {...stroke} />
 <path d="M16 10 V14" {...stroke} />
 <path d="M8 12 H16" {...stroke} />
 <path d="M6 18 C9 15, 12 15, 16 16" {...stroke} />
 </>
 );
 break;
 case "strength_prehab":
 body = (
 <>
 <path d="M6 10 H9" {...stroke} />
 <path d="M15 10 H18" {...stroke} />
 <path d="M9 8 V12" {...stroke} />
 <path d="M15 8 V12" {...stroke} />
 <path d="M9 10 H15" {...stroke} />
 <path d="M12 13 V18" {...stroke} />
 <path d="M9.5 18 H14.5" {...stroke} />
 </>
 );
 break;
 case "otf":
 body = (
 <>
 <circle cx="12" cy="12" r="3.2" {...stroke} />
 <path d="M12 4 V6.5" {...stroke} />
 <path d="M12 17.5 V20" {...stroke} />
 <path d="M4 12 H6.5" {...stroke} />
 <path d="M17.5 12 H20" {...stroke} />
 <path d="M6.3 6.3 L8 8" {...stroke} />
 <path d="M16 16 L17.7 17.7" {...stroke} />
 </>
 );
 break;
 case "rest":
 body = <path d="M14.5 5.5 A6.5 6.5 0 1 0 18 17 A5.2 5.2 0 1 1 14.5 5.5 Z" fill={color} stroke="none" />;
 break;
 case "easy_run":
 default:
 body = (
 <>
 <path d="M5 15 C8 11, 12 11, 16 15" {...stroke} />
 <path d="M16 15 L19 12" {...stroke} />
 </>
 );
 break;
 }

 return (
 <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} style={{ display:"inline-block", flex:"0 0 auto" }}>
 {body}
 </svg>
 );
}
const PHASE_ARC_LABELS = {
 running: {
 BASE: { name: "Aerobic Engine Base", objective: "Rebuild aerobic durability and movement economy." },
 BUILDING: { name: "Strength Reintroduction", objective: "Layer controlled intensity while preserving consistency." },
 PEAKBUILD: { name: "Race-Specific Build", objective: "Convert fitness into goal-pace tolerance." },
 PEAK: { name: "Peak Block", objective: "Sharpen race execution and confidence under load." },
 TAPER: { name: "Sharpen & Freshen", objective: "Absorb adaptation and arrive race-ready." },
 },
 body_comp: {
 BASE: { name: "Cut & Base Phase", objective: "Establish calorie control while protecting training rhythm." },
 BUILDING: { name: "Lean Strength Rebuild", objective: "Keep recomposition momentum and rebuild force output." },
 PEAKBUILD: { name: "Performance Cut Block", objective: "Hold deficit discipline while maintaining quality work." },
 PEAK: { name: "Peak Composition Block", objective: "Finalize body comp with performance preserved." },
 TAPER: { name: "Consolidation Taper", objective: "Stabilize outcomes and lock habits." },
 },
 strength: {
 BASE: { name: "Movement Foundation", objective: "Restore technique quality and repeatable volume." },
 BUILDING: { name: "Strength Reintroduction", objective: "Progress core lifts with controlled fatigue." },
 PEAKBUILD: { name: "Intensification Block", objective: "Push load progression and neural readiness." },
 PEAK: { name: "Peak Strength Block", objective: "Express top-end strength with focused intent." },
 TAPER: { name: "Deload & Test", objective: "Recover and realize strength expression." },
 },
};
const SESSION_NAMING = {
 EASY_RUN: "Easy Run",
 RECOVERY_RUN: "Recovery Run",
 RECOVERY_MOBILITY: "Active Recovery",
 LOW_IMPACT: "Low-Impact Cardio",
 HYBRID_PREFIX: "Easy Run + Strength",
 WALK_MOBILITY: "Walk + Mobility",
 ACHILLES_BADGE: "Modified for Achilles",
};
const isRunTarget = (value = "") => /(\d+(\.\d+)?\s*mi|\d+\s*(min|minutes?))/i.test(String(value || ""));
const formatRunTargetFromLogEntry = (entry = {}) => {
 const miles = Number(entry?.miles || 0);
 if (Number.isFinite(miles) && miles > 0) return `${miles} mi`;
 const runTime = String(entry?.runTime || "").trim();
 if (!runTime) return "";
 const mins = runTime.match(/(\d+)\s*(min|minutes?)/i);
 if (mins) return `${mins[1]} min`;
 const numeric = Number(runTime);
 if (Number.isFinite(numeric) && numeric > 0) return `${numeric} min`;
 return runTime;
};
const applySessionNamingRules = (session = {}, injuryState = {}) => {
 const next = { ...(session || {}) };
 const type = String(next?.type || "").toLowerCase();
 const runDescriptor = next?.run?.d || "";
 const runType = String(next?.run?.t || "").toLowerCase();
 const hasRunningPrescription = !!next?.run && (type.includes("run") || isRunTarget(runDescriptor) || /(easy|tempo|interval|long)/i.test(runType));
 const walkModified = injuryState?.area === "Achilles" && injuryState?.level !== "none" && /(walk)/i.test(`${runType} ${runDescriptor} ${next?.environmentNote || ""}`);
 if (walkModified) {
 next.label = SESSION_NAMING.WALK_MOBILITY;
 next.modifierBadge = SESSION_NAMING.ACHILLES_BADGE;
 return next;
 }
 if (hasRunningPrescription) {
 const runTarget = formatRunTarget(runDescriptor);
 if (type === "recovery" || /recovery/.test(runType)) {
 next.label = runTarget ? joinDisplayParts([SESSION_NAMING.RECOVERY_RUN, runTarget]) : SESSION_NAMING.RECOVERY_RUN;
 return next;
 }
 if (type === "run+strength") {
 next.label = `${SESSION_NAMING.HYBRID_PREFIX} ${next?.strSess || "A"}`;
 return next;
 }
 if (type === "long-run") {
 next.label = runTarget ? joinDisplayParts(["Long Run", runTarget]) : "Long Run";
 return next;
 }
 if (type === "hard-run" && !/easy/i.test(runType)) {
 next.label = runTarget ? joinDisplayParts([`${next?.run?.t || "Quality"} Run`, runTarget]) : `${next?.run?.t || "Quality"} Run`;
 return next;
 }
 next.label = runTarget ? joinDisplayParts([SESSION_NAMING.EASY_RUN, runTarget]) : SESSION_NAMING.EASY_RUN;
 return next;
 }
 if (type === "conditioning" || type === "otf") {
 next.label = next.label || (type === "otf" ? "Conditioning / OTF" : "Conditioning");
 return next;
 }
 const lowImpactOnly = /(bike|elliptical|pool|incline walk|low-impact)/i.test(`${next?.label || ""} ${next?.environmentNote || ""}`);
 next.label = lowImpactOnly ? SESSION_NAMING.LOW_IMPACT : SESSION_NAMING.RECOVERY_MOBILITY;
 return next;
};
const refreshAdjustedWorkoutLabel = ({ workout = {}, qualifier = "", injuryState = {} } = {}) => {
 const safeWorkout = workout && typeof workout === "object" ? workout : {};
 const relabeledWorkout = safeWorkout?.run ? applySessionNamingRules(safeWorkout, injuryState) : safeWorkout;
 const baseLabel = String(relabeledWorkout?.label || safeWorkout?.label || "Session").trim() || "Session";
 return appendWorkoutQualifier(baseLabel, qualifier);
};
const relabelRecentLogs = (logs = {}) => {
 const now = Date.now();
 let changed = 0;
 const nextLogs = { ...(logs || {}) };
 Object.entries(nextLogs).forEach(([dateKey, entry]) => {
 const ageDays = (now - new Date(`${dateKey}T12:00:00`).getTime()) / 86400000;
 if (ageDays > 30 || !entry) return;
 const typeText = String(entry.type || "");
 const notesText = String(entry.notes || "");
 const runTarget = formatRunTargetFromLogEntry(entry);
 const containsRunSignal = !!runTarget || /(easy run|tempo run|interval|long run|\brun\b)/i.test(`${typeText} ${notesText}`);
 const containsRecoveryLabel = /(recovery|low-impact)/i.test(typeText);
 if (containsRunSignal && containsRecoveryLabel) {
 const nextType = runTarget ? `${SESSION_NAMING.EASY_RUN} - ${runTarget}` : SESSION_NAMING.EASY_RUN;
 if (nextType !== typeText) {
 nextLogs[dateKey] = { ...entry, type: nextType };
 changed += 1;
 }
 }
 });
 return { nextLogs, changed };
};
const DAY_CONTEXT_OVERRIDES = {
 busy_day: {
 label: "Busy Day Override",
 type: "rest",
 nutri: NUTRITION_DAY_TYPES.runEasy,
 fallback: "10-15 min brisk walk + mobility",
 success: "Today = just show up for 10-20 minutes and hit protein target.",
 },
 low_energy_day: {
 label: "Low Energy Override",
 type: "easy-run",
 nutri: NUTRITION_DAY_TYPES.recovery,
 fallback: "15-20 min zone-2 easy movement",
 success: "Today = 20 minutes + recovery nutrition + early sleep.",
 },
 travel_day: {
 label: "Travel Day Override",
 type: "rest",
 nutri: NUTRITION_DAY_TYPES.travelEndurance,
 fallback: "Hotel circuit 12 min (push-up, squat, plank)",
 success: "Today = keep momentum alive with short version.",
 },
 social_event_day: {
 label: "Social/Event Day Override",
 type: "rest",
 nutri: NUTRITION_DAY_TYPES.recovery,
 fallback: "10 min walk before event + hydration",
 success: "Today = don't break the streak: minimum session + simple meal anchor.",
 },
 minimum_viable_day: {
 label: "Short Version Day",
 type: "rest",
 nutri: NUTRITION_DAY_TYPES.runEasy,
 fallback: "10-20 min option: 5 min mobility + 10 min easy cardio + 2 sets push/pull/core",
 success: "Today = minimum effective work, no guilt, preserve momentum.",
 },
};

const fmtDate = (d) => sanitizeDisplayCopy(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
const buildNamedPhaseArc = ({ rollingHorizon = [], goals = [] }) => {
 const primaryCategory = resolveGoalPlanningCategory(getPrimaryPlanningGoal(goals)) || "running";
 const labelSet = PHASE_ARC_LABELS[primaryCategory] || PHASE_ARC_LABELS.running;
 const blocks = [];
 for (const h of rollingHorizon) {
 const programBlock = h?.planWeek?.programBlock || null;
 const phase = programBlock?.phase || h?.template?.phase;
 if (!phase) continue;
 const meta = labelSet[phase] || { name: `${phase} Block`, objective: "Execute core plan priorities." };
 const blockKey = programBlock?.id || phase;
 const blockName = programBlock?.label || meta.name;
 const blockObjective = programBlock?.summary || programBlock?.dominantEmphasis?.objective || meta.objective;
 const last = blocks[blocks.length - 1];
 if (last && last.key === blockKey) {
 last.endWeek = h.absoluteWeek;
 } else {
 blocks.push({ key: blockKey, phase, startWeek: h.absoluteWeek, endWeek: h.absoluteWeek, name: blockName, objective: blockObjective });
 }
 }
 return blocks.map(({ key, ...block }) => block);
};
const safeFetchWithTimeout = async (url, options = {}, timeoutMs = 8500) => {
 const sanitizeDiagnosticsToken = (value = "", fallback = "unknown") => String(value || "")
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "_")
 .replace(/^_+|_+$/g, "")
 .slice(0, 60) || fallback;
 const buildDiagnosticsError = ({
 message = "Cloud request could not be completed.",
 code = "request_failed",
 diagnosticsCode = "request_failed",
 causeMessage = "",
 } = {}) => {
 const error = new Error(message);
 error.code = code;
 error.diagnosticsCode = diagnosticsCode;
 error.causeMessage = String(causeMessage || "");
 return error;
 };
 const ctrl = new AbortController();
 const timer = setTimeout(() => ctrl.abort(), timeoutMs);
 try {
 return await fetch(url, { ...options, signal: ctrl.signal });
 } catch (error) {
 if (error?.name === "AbortError") {
 throw buildDiagnosticsError({
 message: "Cloud request timed out.",
 code: "fetch_timeout",
 diagnosticsCode: `fetch_timeout_${timeoutMs}`,
 });
 }
 const message = String(error?.message || error || "");
 if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
 throw buildDiagnosticsError({
 message: "Cloud request could not reach the network.",
 code: "fetch_network",
 diagnosticsCode: `fetch_network_${sanitizeDiagnosticsToken(message, "request_failed")}`,
 causeMessage: message,
 });
 }
 throw error;
 } finally {
 clearTimeout(timer);
 }
};

const getDiagnosticsCode = (error = null, fallback = "unknown") => String(
 error?.diagnosticsCode
 || error?.code
 || error?.message
 || error
 || fallback
)
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "_")
 .replace(/^_+|_+$/g, "")
 .slice(0, 60) || fallback;

const getNormalizedStorageUserCopy = (error = null, fallback = "Cloud sync could not finish right now. This device is still using its saved local copy.") => {
 if (!error) return fallback;
 if (error?.code === "delete_account_not_configured") {
 return "Permanent delete is not available here yet. You can still sign out or reset this device.";
 }
 const storageStatus = classifyStorageError(error);
 if (storageStatus?.reason === STORAGE_STATUS_REASONS.authRequired) {
 return "Your session expired before the cloud request could finish. Sign in again and try once more.";
 }
 if (storageStatus?.reason === STORAGE_STATUS_REASONS.providerUnavailable) {
 return "Cloud account services are unavailable right now, so this device is staying local for now.";
 }
 if (storageStatus?.reason === STORAGE_STATUS_REASONS.dataIncompatible) {
 return "Cloud data could not be applied safely right now. This device is still using its saved local copy.";
 }
 if (storageStatus?.reason === STORAGE_STATUS_REASONS.transient) {
 return fallback;
 }
 return fallback;
};

const sameStorageStatus = (left = null, right = null) => (
 String(left?.mode || "") === String(right?.mode || "")
 && String(left?.label || "") === String(right?.label || "")
 && String(left?.reason || "") === String(right?.reason || "")
 && String(left?.detail || "") === String(right?.detail || "")
);

const hasUsableLocalResumePayload = (payload = null) => {
 const profile = payload?.personalization?.profile || {};
 if (profile?.onboardingComplete || profile?.profileSetupComplete) return true;
 if (Array.isArray(payload?.goals) && payload.goals.some((goal) => Boolean(goal?.active || goal?.name))) return true;
 if (Object.keys(payload?.logs || {}).length > 0) return true;
 if (Object.keys(payload?.dailyCheckins || {}).length > 0) return true;
 if (Object.keys(payload?.plannedDayRecords || {}).length > 0) return true;
 if (Object.keys(payload?.planWeekRecords || {}).length > 0) return true;
 if (Object.keys(payload?.nutritionActualLogs || {}).length > 0) return true;
 return false;
};

const PRIMARY_GOAL_OPTIONS = ["fat_loss", "muscle_gain", "endurance", "general_fitness"];
const PRIMARY_GOAL_LABELS = { fat_loss: "Fat Loss", muscle_gain: "Muscle Gain", endurance: "Endurance", general_fitness: "General Fitness" };
const EXPERIENCE_LEVEL_OPTIONS = ["beginner", "intermediate", "advanced"];
const EXPERIENCE_LEVEL_LABELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const SESSION_LENGTH_OPTIONS = ["20", "30", "45", "60+"];
const SESSION_LENGTH_LABELS = { "20": "20 min", "30": "30 min", "45": "45 min", "60+": "60+ min" };
const TRAINING_WEEKDAY_CHIP_ITEMS = TRAINING_WEEKDAY_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

const parseTrainingDaysForIntakePacket = (value = "") => {
 const text = String(value || "").trim();
 if (!text) return 0;
 const numeric = Number(text.replace(/[^\d.]/g, ""));
 if (!Number.isFinite(numeric)) return 0;
 return Math.max(0, Math.min(14, Math.round(numeric)));
};

const parseAvailableTrainingDaysForIntakePacket = (value = []) => normalizeTrainingWeekdayAvailability(value);

const splitIntakeListText = (value = "") => String(value || "")
 .split(/[,/]/)
 .map((item) => item.trim())
 .filter(Boolean)
 .slice(0, 8);

const extractAppearanceConstraints = (...values) => values
 .map((value) => String(value || "").trim())
 .filter((value) => value && /(abs|lean|athletic|toned|look|appearance|physique|body comp|body composition|shirtless|defined)/i.test(value))
 .slice(0, 3);

const resolveGoalTemplateSelectionFromAnswers = ({
 answers = {},
 goalText = "",
 index = 0,
} = {}) => {
 const selection = findGoalTemplateSelectionForGoalText({
 answers,
 goalText,
 index,
 });
 return selection?.templateId ? selection : null;
};

const inferGoalTemplateCategoryIdForDraft = (draft = {}) => {
 const explicitCategoryId = String(draft?.templateCategoryId || "").trim().toLowerCase();
 if (explicitCategoryId && explicitCategoryId !== "custom") return explicitCategoryId;
 const planningCategory = String(draft?.planningCategory || "").trim().toLowerCase();
 if (planningCategory === "strength") return "strength";
 if (planningCategory === "body_comp") return "physique";
 if (planningCategory === "running") return "running";
 if (planningCategory === "swim" || planningCategory === "swimming") return "swim";
 if (["general_fitness", "mobility", "injury_prevention", "health"].includes(planningCategory)) return "health";
 return "all";
};

const buildIntakePacketArgsFromAnswers = ({ answers = {}, existingMemory = [] } = {}) => {
 const primaryGoalKey = String(answers.primary_goal || "").trim();
 const primaryGoalLabel = PRIMARY_GOAL_LABELS[primaryGoalKey] || sanitizeIntakeText(String(answers.goal_intent || "").trim()).slice(0, 80) || primaryGoalKey || "General Fitness";
 const additionalGoalEntries = readAdditionalGoalEntries({ answers });
 const experienceLabel = EXPERIENCE_LEVEL_LABELS[answers.experience_level] || String(answers.experience_level || "").trim();
 const sessionLengthLabel = SESSION_LENGTH_LABELS[answers.session_length] || String(answers.session_length || "").trim();
 const availableTrainingDays = parseAvailableTrainingDaysForIntakePacket(answers.available_training_days || answers.available_days || []);
 const availableTrainingDayLabels = formatTrainingWeekdayAvailability(availableTrainingDays);
 const trainingLocation = String(answers.training_location || "").trim();
 const homeEquipment = Array.isArray(answers.home_equipment)
 ? answers.home_equipment
 : splitIntakeListText(answers.equipment_text || "");
 const injuryConstraintContext = buildIntakeInjuryConstraintContext({
 injuryText: answers.injury_text,
 injuryImpact: answers.injury_impact,
 injuryArea: answers.injury_area,
 injurySide: answers.injury_side,
 injuryLimitations: answers.injury_limitations,
 });
 const timingConstraints = [
 answers.timeline_adjustment,
 answers.timeline_feedback,
 ].map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3);
 const completenessContext = buildIntakeCompletenessPacketContext({
 resolvedGoals: [],
 answers,
 });
 const mergedTimingConstraints = [...timingConstraints, ...(completenessContext?.timingHints || [])]
 .map((value) => String(value || "").trim())
 .filter(Boolean)
 .slice(0, 4);
 const rawGoalText = sanitizeIntakeText(String(answers.goal_intent || "").trim())
 || additionalGoalEntries[0]
 || primaryGoalLabel;
 const goalTemplateStack = buildGoalTemplateSelectionsFromAnswers({ answers });
 const primaryGoalTemplateSelection = resolveGoalTemplateSelectionFromAnswers({
 answers,
 goalText: rawGoalText,
 index: 0,
 });

 return {
 input: "Interpret this onboarding intake without writing canonical goal state.",
 intakeContext: {
 rawGoalText: rawGoalText || primaryGoalLabel,
 goalTemplateSelection: primaryGoalTemplateSelection,
 goalTemplateStack,
 baselineContext: {
 primaryGoalKey,
 primaryGoalLabel,
 experienceLevel: experienceLabel,
 fitnessLevel: experienceLabel,
 startingFresh: Boolean(answers.starting_fresh),
 currentBaseline: [
 experienceLabel ? `${experienceLabel} training background` : "",
 answers.training_days ? `${answers.training_days} training days per week available` : "",
 availableTrainingDayLabels.length ? `usually available ${availableTrainingDayLabels.join(", ")}` : "",
 sessionLengthLabel ? `${sessionLengthLabel} sessions` : "",
 ...(completenessContext?.summaryLines || []),
 ].filter(Boolean).join("; "),
 priorMemory: (existingMemory || []).slice(-6),
 },
 scheduleReality: {
 trainingDaysPerWeek: parseTrainingDaysForIntakePacket(answers.training_days),
 availableDays: availableTrainingDays,
 sessionLength: sessionLengthLabel,
 trainingLocation,
 scheduleNotes: answers.training_days && sessionLengthLabel
 ? `${answers.training_days} days per week, ${sessionLengthLabel} sessions${availableTrainingDayLabels.length ? `, usually ${availableTrainingDayLabels.join(", ")}` : ""}${completenessContext?.summaryLines?.length ? `; ${completenessContext.summaryLines.join("; ")}` : ""}`
 : "",
 },
 equipmentAccessContext: {
 trainingLocation,
 equipment: homeEquipment,
 accessNotes: trainingLocation === "Varies a lot" || trainingLocation === "Varies"
 ? "Environment changes week to week."
 : "",
 },
 injuryConstraintContext: {
 injuryText: injuryConstraintContext.injuryText,
 injuryImpact: injuryConstraintContext.injuryImpact,
 injuryArea: injuryConstraintContext.injuryArea,
 injurySide: injuryConstraintContext.injurySide,
 injuryLimitations: injuryConstraintContext.injuryLimitations,
 constraints: injuryConstraintContext.constraints,
 },
 userProvidedConstraints: {
 timingConstraints: mergedTimingConstraints,
 appearanceConstraints: extractAppearanceConstraints(
 primaryGoalLabel,
 answers.primary_goal_detail,
 answers.other_goals,
 answers.timeline_adjustment,
 answers.timeline_feedback
 ).concat(completenessContext?.appearanceHints || []),
 additionalContext: String(answers.coaching_style || "").trim(),
 },
 goalCompletenessContext: {
 ...(completenessContext || {}),
 timingHints: mergedTimingConstraints,
 },
 },
 };
};

const buildGoalChangePacketArgs = ({
 rawGoalText = "",
 changeMode = GOAL_CHANGE_MODES.refineCurrentGoal,
 canonicalUserProfile = {},
 personalization = {},
 goals = [],
 goalState = {},
 existingMemory = [],
} = {}) => {
 const trainingContext = canonicalUserProfile?.trainingContext || deriveTrainingContextFromPersonalization({ personalization });
 const cleanGoalText = sanitizeIntakeText(rawGoalText || "");
 const activeGoals = (Array.isArray(goals) ? goals : [])
 .filter((goal) => goal?.active && goal?.category !== "injury_prevention" && goal?.id !== "g_resilience")
 .sort((a, b) => Number(a?.priority || 99) - Number(b?.priority || 99));
 const activeGoalLabels = activeGoals
 .map((goal) => String(goal?.resolvedGoal?.summary || goal?.name || "").trim())
 .filter(Boolean)
 .slice(0, 4);
 const daysPerWeek = parseTrainingDaysForIntakePacket(String(canonicalUserProfile?.daysPerWeek || ""));
 const availableTrainingDays = parseAvailableTrainingDaysForIntakePacket(canonicalUserProfile?.availableTrainingDays || []);
 const availableTrainingDayLabels = formatTrainingWeekdayAvailability(availableTrainingDays);
 const sessionLength = trainingContext?.sessionDuration?.confirmed
 ? String(trainingContext.sessionDuration.value || "").trim()
 : "";
 const trainingLocation = trainingContext?.environment?.confirmed
 ? trainingEnvironmentToDisplayMode(trainingContext.environment.value)
 : "";
 const equipment = trainingContext?.equipmentAccess?.confirmed
 ? (Array.isArray(trainingContext.equipmentAccess.items) ? trainingContext.equipmentAccess.items : [])
 : [];
 const constraints = Array.isArray(canonicalUserProfile?.constraints)
 ? canonicalUserProfile.constraints.filter(Boolean)
 : [];
 const scheduleConstraints = Array.isArray(canonicalUserProfile?.scheduleConstraints)
 ? canonicalUserProfile.scheduleConstraints.filter(Boolean)
 : [];
 const baselineNotes = [
 canonicalUserProfile?.experienceLevel ? `${canonicalUserProfile.experienceLevel} training background` : "",
 daysPerWeek ? `${daysPerWeek} training days per week` : "",
 availableTrainingDayLabels.length ? `usually available ${availableTrainingDayLabels.join(", ")}` : "",
 sessionLength ? `${sessionLength} sessions` : "",
 activeGoalLabels.length ? `current goals: ${activeGoalLabels.join(" / ")}` : "",
 ].filter(Boolean).join("; ");
 const timingConstraints = [
 goalState?.deadline ? `Current active target date: ${goalState.deadline}` : "",
 GOAL_CHANGE_MODE_META?.[changeMode]?.effectLine || "",
 ].filter(Boolean);
 const additionalContext = [
 "User is changing goals from an existing planning arc.",
 activeGoalLabels.length ? `Current priority order: ${activeGoalLabels.join(" / ")}.` : "",
 canonicalUserProfile?.preferences?.goalMix ? `Current goal mix: ${canonicalUserProfile.preferences.goalMix}.` : "",
 scheduleConstraints.length ? `Schedule constraints: ${scheduleConstraints.join("; ")}.` : "",
 personalization?.travelState?.isTravelWeek ? "Training environment may vary because travel is active." : "",
 ].filter(Boolean).join(" ");
 const activeIssueContext = deriveActiveIssueContextFromPersonalization({ personalization });
 const injuryText = [
 ...constraints,
 activeIssueContext?.notes || "",
 ].filter(Boolean).join("; ");

 return {
 input: `Interpret this goal change request without writing canonical goal state. Change mode: ${changeMode}.`,
 intakeContext: {
 rawGoalText: cleanGoalText,
 baselineContext: {
 primaryGoalKey: String(canonicalUserProfile?.primaryGoalKey || "").trim(),
 primaryGoalLabel: String(goalState?.primaryGoal || activeGoalLabels[0] || "").trim(),
 experienceLevel: String(canonicalUserProfile?.experienceLevel || "").trim(),
 fitnessLevel: String(canonicalUserProfile?.fitnessLevel || "").trim(),
 startingFresh: changeMode === GOAL_CHANGE_MODES.startNewGoalArc,
 currentBaseline: baselineNotes,
 priorMemory: (existingMemory || []).slice(-6),
 },
 scheduleReality: {
 trainingDaysPerWeek: daysPerWeek,
 availableDays: availableTrainingDays,
 sessionLength,
 trainingLocation,
 scheduleNotes: dedupeStrings([
  availableTrainingDayLabels.length ? `Usually available ${availableTrainingDayLabels.join(", ")}` : "",
  ...scheduleConstraints,
 ]).join("; "),
 },
 equipmentAccessContext: {
 trainingLocation,
 equipment,
 accessNotes: personalization?.travelState?.isTravelWeek ? "Environment may change during travel weeks." : "",
 },
 injuryConstraintContext: {
 injuryText,
 constraints: [...constraints, ...(activeIssueContext?.activeConstraints || [])].filter(Boolean),
 },
 userProvidedConstraints: {
 timingConstraints,
 appearanceConstraints: extractAppearanceConstraints(
 cleanGoalText,
 goalState?.primaryGoal,
 canonicalUserProfile?.preferences?.goalMix
 ),
 additionalContext,
 },
 },
 };
};

const buildGoalFeasibilityContextFromIntake = (intakeContext = {}) => ({
 userBaseline: intakeContext?.baselineContext || {},
 scheduleReality: intakeContext?.scheduleReality || {},
 currentExperienceContext: {
 injuryConstraintContext: intakeContext?.injuryConstraintContext || {},
 equipmentAccessContext: intakeContext?.equipmentAccessContext || {},
 trainingLocation: intakeContext?.scheduleReality?.trainingLocation || intakeContext?.equipmentAccessContext?.trainingLocation || "",
 startingFresh: Boolean(intakeContext?.baselineContext?.startingFresh),
 },
});

const buildArbitrationIntakePacket = ({
 typedIntakePacket = null,
 rawGoalText = "",
 goalTemplateSelection = null,
} = {}) => {
 const packet = typedIntakePacket && typeof typedIntakePacket === "object"
 ? typedIntakePacket
 : { version: "2026-04-v1", intent: "intake_interpretation" };
 const intake = packet?.intake || packet?.intakeContext || {};
 return {
 ...packet,
 intake: {
 ...intake,
 rawGoalText,
 goalTemplateSelection: goalTemplateSelection || intake?.goalTemplateSelection || null,
 },
 };
};

const buildFocusedArbitrationIntakePacket = ({
 typedIntakePacket = null,
 rawGoalText = "",
 goalTemplateSelection = null,
} = {}) => {
 const packet = typedIntakePacket && typeof typedIntakePacket === "object"
 ? typedIntakePacket
 : { version: "2026-04-v1", intent: "intake_interpretation" };
 const intake = packet?.intake || packet?.intakeContext || {};
 return {
 ...packet,
 intake: {
 rawGoalText,
 goalTemplateSelection: goalTemplateSelection || null,
 baselineContext: {
 ...(intake?.baselineContext || {}),
 primaryGoalLabel: rawGoalText || intake?.baselineContext?.primaryGoalLabel || "",
 },
 scheduleReality: {
 ...(intake?.scheduleReality || {}),
 },
 equipmentAccessContext: {
 ...(intake?.equipmentAccessContext || {}),
 },
 injuryConstraintContext: {
 ...(intake?.injuryConstraintContext || {}),
 },
 userProvidedConstraints: {
 timingConstraints: [],
 appearanceConstraints: [],
 additionalContext: sanitizeIntakeText(intake?.userProvidedConstraints?.additionalContext || ""),
 },
 goalCompletenessContext: {},
 },
 };
};

const buildConfirmedArbitrationInputs = ({
 answers = {},
 typedIntakePacket = null,
 now = new Date(),
} = {}) => {
 const primaryGoalText = sanitizeIntakeText(String(answers?.goal_intent || "").trim()).slice(0, 320);
 const additionalGoalTexts = readAdditionalGoalEntries({ answers });
 const primaryGoalTemplateSelection = resolveGoalTemplateSelectionFromAnswers({
 answers,
 goalText: primaryGoalText,
 index: 0,
 });
 const confirmedPrimaryGoal = primaryGoalText
 ? resolveGoalTranslation({
 rawUserGoalIntent: primaryGoalText,
 typedIntakePacket: buildFocusedArbitrationIntakePacket({
 typedIntakePacket,
 rawGoalText: primaryGoalText,
 goalTemplateSelection: primaryGoalTemplateSelection,
 }),
 explicitUserConfirmation: {
 confirmed: true,
 acceptedProposal: true,
 source: "confirmed_primary_goal",
 },
 now,
 })?.resolvedGoals?.[0] || null
 : null;
 const confirmedAdditionalGoals = additionalGoalTexts.flatMap((goalText, index) => {
 const goalTemplateSelection = resolveGoalTemplateSelectionFromAnswers({
 answers,
 goalText,
 index: index + 1,
 });
 const resolution = resolveGoalTranslation({
 rawUserGoalIntent: goalText,
 typedIntakePacket: buildArbitrationIntakePacket({
 typedIntakePacket: buildFocusedArbitrationIntakePacket({
 typedIntakePacket,
 rawGoalText: goalText,
 goalTemplateSelection,
 }),
 rawGoalText: goalText,
 goalTemplateSelection,
 }),
 explicitUserConfirmation: {
 confirmed: true,
 acceptedProposal: true,
 source: "confirmed_additional_goal",
 },
 now,
 });
 return Array.isArray(resolution?.resolvedGoals) ? resolution.resolvedGoals : [];
 });
 return {
 confirmedPrimaryGoal,
 confirmedAdditionalGoals,
 additionalGoalTexts,
 };
};

const buildPreviewGoalResolutionBundle = ({
 intakeContext = {},
 aiInterpretationProposal = null,
 answers = {},
 now = new Date(),
} = {}) => {
 const typedIntakePacket = {
 version: "2026-04-v1",
 intent: "intake_interpretation",
 intake: intakeContext,
 };
 const primaryGoalTemplateSelection = intakeContext?.goalTemplateSelection
 || resolveGoalTemplateSelectionFromAnswers({
 answers,
 goalText: intakeContext?.rawGoalText || "",
 index: 0,
 });
 const focusedPrimaryTypedPacket = {
 ...typedIntakePacket,
 intake: buildFocusedArbitrationIntakePacket({
 typedIntakePacket,
 rawGoalText: intakeContext?.rawGoalText || "",
 goalTemplateSelection: primaryGoalTemplateSelection,
 }).intake,
 };
 const goalResolution = resolveGoalTranslation({
 rawUserGoalIntent: intakeContext?.rawGoalText || "",
 typedIntakePacket: focusedPrimaryTypedPacket,
 aiInterpretationProposal,
 explicitUserConfirmation: {
 confirmed: false,
 acceptedProposal: true,
 source: "intake_preview",
 },
 now,
 });
 const intakeCompleteness = deriveIntakeCompletenessState({
 resolvedGoals: goalResolution?.resolvedGoals || [],
 answers,
 });
 const previewGoalFeasibility = assessGoalFeasibility({
 resolvedGoals: goalResolution?.resolvedGoals || [],
 ...buildGoalFeasibilityContextFromIntake(intakeContext),
 intakeCompleteness,
 now,
 });
 const feasibleResolvedGoals = applyFeasibilityPriorityOrdering({
 resolvedGoals: goalResolution?.resolvedGoals || [],
 feasibility: previewGoalFeasibility,
 });
 const arbitrationInputs = buildConfirmedArbitrationInputs({
 answers,
 typedIntakePacket,
 now,
 });
 const arbitration = buildGoalArbitrationStack({
 resolvedGoals: feasibleResolvedGoals,
 confirmedPrimaryGoal: arbitrationInputs.confirmedPrimaryGoal,
 confirmedAdditionalGoals: arbitrationInputs.confirmedAdditionalGoals,
 additionalGoalTexts: arbitrationInputs.additionalGoalTexts,
 goalFeasibility: previewGoalFeasibility,
 intakeCompleteness,
 answers,
 typedIntakePacket,
 now,
 });
 const orderedResolvedGoals = arbitration?.goals?.length ? arbitration.goals : feasibleResolvedGoals;
 const activeResolvedGoals = applyIntakeGoalStackConfirmation({
 resolvedGoals: orderedResolvedGoals,
 goalStackConfirmation: null,
 goalFeasibility: previewGoalFeasibility,
 });
 const effectiveResolvedGoals = activeResolvedGoals.length ? activeResolvedGoals : orderedResolvedGoals;
 const activeCompleteness = deriveIntakeCompletenessState({
 resolvedGoals: effectiveResolvedGoals,
 answers,
 });
 const goalFeasibility = assessGoalFeasibility({
 resolvedGoals: effectiveResolvedGoals,
 ...buildGoalFeasibilityContextFromIntake(intakeContext),
 intakeCompleteness: activeCompleteness,
 now,
 });

 return {
 typedIntakePacket,
 goalResolution,
 goalFeasibility,
 orderedResolvedGoals,
 };
};

const buildIntakeTimelineFallback = (payload = {}) => {
 const packetArgs = buildIntakePacketArgsFromAnswers({ answers: payload, existingMemory: [] });
 const preview = buildPreviewGoalResolutionBundle({
 intakeContext: packetArgs.intakeContext,
 aiInterpretationProposal: null,
 answers: payload,
 now: new Date(),
 });
 const topGoal = preview?.orderedResolvedGoals?.[0] || preview?.goalResolution?.resolvedGoals?.[0] || null;
 const focusLabel = topGoal?.summary || PRIMARY_GOAL_LABELS[payload.primary_goal] || payload.primary_goal || "your goal";
 const gateLine = sanitizeIntakeText(preview?.goalFeasibility?.explanation_text || "");
 if (gateLine) return gateLine;
 return sanitizeIntakeText(`I need a little more grounded context before I can finish the gate for ${String(focusLabel).toLowerCase()}.`);
};

const buildIntakeAssessmentTextFromProposal = ({
 payload = {},
 interpretation = null,
 previewGoalResolution = null,
 goalFeasibility = null,
} = {}) => {
 const orderedResolvedGoals = applyFeasibilityPriorityOrdering({
 resolvedGoals: previewGoalResolution?.resolvedGoals || [],
 feasibility: goalFeasibility,
 });
 const topGoal = orderedResolvedGoals?.[0] || previewGoalResolution?.resolvedGoals?.[0] || null;
 if (!topGoal || !goalFeasibility) return buildIntakeTimelineFallback(payload);
 const gateLine = sanitizeIntakeText(goalFeasibility?.explanation_text || "");
 const priorityLine = orderedResolvedGoals.length > 1
 ? `Priority order: ${orderedResolvedGoals.map((goal) => goal.summary).join(", then ")}.`
 : `Priority order: ${topGoal.summary}.`;
 const optionalInterpretationLine = interpretation?.missingClarifyingQuestions?.[0]
 ? `Main open question: ${interpretation.missingClarifyingQuestions[0]}`
 : "";
 return sanitizeIntakeText([
 gateLine,
 priorityLine,
 optionalInterpretationLine,
 ].filter(Boolean).join(" "));
};

const mergeAssessmentTypedIntakePacket = ({
 fallbackPacket = null,
 runtimePacket = null,
} = {}) => {
 const safeFallbackPacket = fallbackPacket && typeof fallbackPacket === "object" ? fallbackPacket : null;
 const safeRuntimePacket = runtimePacket && typeof runtimePacket === "object" ? runtimePacket : null;
 if (!safeFallbackPacket) return safeRuntimePacket;
 if (!safeRuntimePacket) return safeFallbackPacket;
 const fallbackIntake = safeFallbackPacket?.intake || safeFallbackPacket?.intakeContext || {};
 const runtimeIntake = safeRuntimePacket?.intake || safeRuntimePacket?.intakeContext || {};
 return {
 ...safeFallbackPacket,
 ...safeRuntimePacket,
 intake: {
 ...fallbackIntake,
 ...runtimeIntake,
 goalTemplateSelection: runtimeIntake?.goalTemplateSelection || fallbackIntake?.goalTemplateSelection || null,
 goalTemplateStack: Array.isArray(runtimeIntake?.goalTemplateStack) && runtimeIntake.goalTemplateStack.length
 ? runtimeIntake.goalTemplateStack
 : Array.isArray(fallbackIntake?.goalTemplateStack)
 ? fallbackIntake.goalTemplateStack
 : [],
 goalCompletenessContext: runtimeIntake?.goalCompletenessContext || fallbackIntake?.goalCompletenessContext || {},
 },
 };
};

const buildTypedIntakeAssessment = async ({ answers = {}, existingMemory = [] } = {}) => {
 const packetArgs = buildIntakePacketArgsFromAnswers({ answers, existingMemory });
 const previewFallback = buildPreviewGoalResolutionBundle({
 intakeContext: packetArgs.intakeContext,
 aiInterpretationProposal: null,
 answers,
 now: new Date(),
 });
 const fallbackText = buildIntakeTimelineFallback(answers);
 const fallbackPacket = previewFallback.typedIntakePacket;
 const runtime = await runIntakeInterpretationRuntime({
 safeFetchWithTimeout,
 packetArgs,
 });
 const assessmentTypedIntakePacket = mergeAssessmentTypedIntakePacket({
 fallbackPacket,
 runtimePacket: runtime?.statePacket || null,
 });
 if (!runtime?.ok || !runtime?.interpreted) {
 const reviewModel = buildIntakeGoalReviewModel({
 goalResolution: previewFallback.goalResolution,
 orderedResolvedGoals: previewFallback.orderedResolvedGoals,
 goalFeasibility: previewFallback.goalFeasibility,
 aiInterpretationProposal: null,
 answers,
 });
 return {
 text: fallbackText,
 typedIntakePacket: assessmentTypedIntakePacket,
 aiInterpretationProposal: null,
 goalResolution: previewFallback.goalResolution,
 orderedResolvedGoals: previewFallback.orderedResolvedGoals,
 resolvedGoalPreview: previewFallback.goalResolution?.resolvedGoals || [],
 goalFeasibility: previewFallback.goalFeasibility,
 reviewModel,
 };
 }
 const previewFromProposal = buildPreviewGoalResolutionBundle({
 intakeContext: runtime?.statePacket?.intake || packetArgs.intakeContext,
 aiInterpretationProposal: runtime.interpreted,
 answers,
 now: new Date(),
 });
 const reviewModel = buildIntakeGoalReviewModel({
 goalResolution: previewFromProposal.goalResolution,
 orderedResolvedGoals: previewFromProposal.orderedResolvedGoals,
 goalFeasibility: previewFromProposal.goalFeasibility,
 aiInterpretationProposal: runtime.interpreted,
 answers,
 });
 return {
 text: buildIntakeAssessmentTextFromProposal({
 payload: answers,
 interpretation: runtime.interpreted,
 previewGoalResolution: previewFromProposal.goalResolution,
 goalFeasibility: previewFromProposal.goalFeasibility,
 }),
 typedIntakePacket: assessmentTypedIntakePacket,
 aiInterpretationProposal: runtime.interpreted,
 goalResolution: previewFromProposal.goalResolution,
 orderedResolvedGoals: previewFromProposal.orderedResolvedGoals,
 resolvedGoalPreview: previewFromProposal.goalResolution?.resolvedGoals || [],
 goalFeasibility: previewFromProposal.goalFeasibility,
 reviewModel,
 };
};

const DEFAULT_USER_GOAL_PROFILE = {
 primary_goal: "",
 experience_level: "",
 days_per_week: 3,
 session_length: "30",
 equipment_access: [],
 constraints: [],
};

const INTAKE_UI_PHASES = {
 goals: "goals",
 interpretation: "interpretation",
 clarify: "clarify",
 confirm: "confirm",
 adjust: "adjust",
 building: "building",
};

const INTAKE_STAGE_LABELS = INTAKE_STAGE_CONTRACT.map((stage) => ({
 key: stage.key,
 label: stage.label,
}));

const GOAL_STACK_PRIORITY_META = [
 {
 helper: "Gets the most planning weight right now.",
 tint: C.green,
 },
 {
 helper: "Still shapes the block, with slightly less weight than Priority 1.",
 tint: "#dbe7f6",
 },
 {
 helper: "Balanced into the week after the first two priorities.",
 tint: "#9fb4d3",
 },
];

const buildVisibleGoalPriorityLabel = (priorityIndex = null) => (
 Number.isFinite(Number(priorityIndex)) && Number(priorityIndex) >= 0
 ? `Priority ${Math.max(1, Math.round(Number(priorityIndex)) + 1)}`
 : "Priority"
);

const resolveGoalPriorityCardMeta = (priorityIndex = null) => {
 const normalizedPriorityIndex = Number.isFinite(Number(priorityIndex))
 ? Math.max(0, Math.round(Number(priorityIndex)))
 : null;
 if (normalizedPriorityIndex !== null && normalizedPriorityIndex < GOAL_STACK_PRIORITY_META.length) {
 return GOAL_STACK_PRIORITY_META[normalizedPriorityIndex];
 }
 return {
 helper: "Stays visible in the stack and can still shape exercise selection, sequencing, and tracking when it fits cleanly.",
 tint: "#9fb4d3",
 };
};

const isUserPriorityGoal = (goal = null) => Boolean(
 goal?.active
 && goal?.id !== "g_resilience"
 && goal?.category !== "injury_prevention"
);

const sortGoalsForPriorityDisplay = (goals = []) => (
 [...(Array.isArray(goals) ? goals : [])]
 .filter(isUserPriorityGoal)
 .sort((left, right) => (
 Number(left?.priority || 99) - Number(right?.priority || 99)
 || String(left?.name || left?.resolvedGoal?.summary || "").localeCompare(String(right?.name || right?.resolvedGoal?.summary || ""))
 ))
);

const buildGoalPriorityRows = (goals = []) => (
 sortGoalsForPriorityDisplay(goals)
 .map((goal, index) => ({
 id: String(goal?.goalRecordId || goal?.id || `goal_priority_${index}`).trim(),
 label: buildVisibleGoalPriorityLabel(index),
 summary: String(goal?.name || goal?.resolvedGoal?.summary || "").trim(),
 goal,
 }))
 .filter((row) => row.summary)
);

const buildGoalPrioritySummaryLine = (goals = [], { maxVisible = 3 } = {}) => {
 const rows = buildGoalPriorityRows(goals);
 if (!rows.length) return "";
 const visible = rows.slice(0, maxVisible).map((row) => `${row.label}: ${row.summary}`);
 const overflowCount = Math.max(0, rows.length - maxVisible);
 return [...visible, overflowCount ? `+${overflowCount} more priority${overflowCount === 1 ? "" : "ies"}` : ""].filter(Boolean).join(" - ");
};

const GOAL_PRIORITY_EXPLANATION = "Higher priorities get more planning weight, while the rest stay visible and still shape the plan when they fit cleanly.";

const normalizeIntakeGoalEntry = (value = "", maxLength = 180) => sanitizeIntakeText(String(value || "").replace(/\s+/g, " ").trim()).slice(0, maxLength);

const dedupeIntakeGoalEntries = (items = []) => {
 const seen = new Set();
 return (Array.isArray(items) ? items : [items])
 .map((item) => normalizeIntakeGoalEntry(item))
 .filter(Boolean)
 .filter((item) => {
 const key = item.toLowerCase();
 if (seen.has(key)) return false;
 seen.add(key);
 return true;
 });
};

const EXPERIENCE_LEVEL_TO_TRAINING_AGE_YEARS = Object.freeze({
 beginner: 0,
 intermediate: 3,
 advanced: 6,
});

const readSeededExperienceLevel = (profile = {}) => {
 const explicitLevel = String(profile?.estimatedFitnessLevel || "").trim().toLowerCase();
 if (EXPERIENCE_LEVEL_OPTIONS.includes(explicitLevel)) return explicitLevel;
 const trainingAgeYears = Math.max(0, Number(profile?.trainingAgeYears || 0) || 0);
 if (trainingAgeYears >= 5) return "advanced";
 if (trainingAgeYears >= 2) return "intermediate";
 return "";
};

const upsertSeededCurrentBodyweight = (answers = {}, rawValue = "") => {
 const numericValue = Number(String(rawValue || "").trim());
 if (!Number.isFinite(numericValue) || numericValue <= 0) return answers;
 return {
 ...answers,
 intake_completeness: {
 version: "2026-04-v1",
 ...(answers?.intake_completeness || {}),
 fields: {
 ...(answers?.intake_completeness?.fields || {}),
 current_bodyweight: {
 raw: `${numericValue} lb`,
 value: numericValue,
 },
 },
 },
 };
};

const buildSeededIntakeAnswers = ({
  baseAnswers = {},
  personalization = {},
} = {}) => {
  const profile = personalization?.profile || DEFAULT_PERSONALIZATION.profile;
  const seededTrainingContext = deriveTrainingContextFromPersonalization({ personalization });
 let nextAnswers = {
 ...baseAnswers,
 };
  if (!nextAnswers?.experience_level) {
    const seededExperienceLevel = readSeededExperienceLevel(profile);
    nextAnswers.experience_level = seededExperienceLevel || "beginner";
  }
  if (!String(nextAnswers?.training_days || "").trim()) {
    nextAnswers.training_days = "3";
  }
  if (!String(nextAnswers?.session_length || "").trim()) {
    nextAnswers.session_length = "30";
  }
  if (!Array.isArray(nextAnswers?.available_training_days) || nextAnswers.available_training_days.length === 0) {
    const seededAvailableDays = normalizeTrainingWeekdayAvailability(
      seededTrainingContext?.weekdayAvailability?.confirmed
        ? (seededTrainingContext?.weekdayAvailability?.value || [])
        : (personalization?.userGoalProfile?.available_days || [])
    );
    if (seededAvailableDays.length) nextAnswers.available_training_days = seededAvailableDays;
  }
  if (!String(nextAnswers?.coaching_style || "").trim()) {
    nextAnswers.coaching_style = "Balanced coaching";
  }
 const existingBodyweight = nextAnswers?.intake_completeness?.fields?.current_bodyweight?.value;
 if (!(Number(existingBodyweight) > 0) && Number(profile?.weight) > 0) {
 nextAnswers = upsertSeededCurrentBodyweight(nextAnswers, profile.weight);
 }
 return nextAnswers;
};

const INTAKE_MULTI_GOAL_STARTERS = /^(?:get|lose|drop|bench|squat|deadlift|run|look|build|gain|keep|maintain|improve|move|be|become|add|cut|trim|finish|complete|hit|reach)\b/i;

const splitPrimaryGoalEntryIntoStack = (value = "") => {
 const normalized = normalizeIntakeGoalEntry(value, 320);
 if (!normalized) {
 return {
 primaryGoalText: "",
 additionalGoals: [],
 };
 }

 const clauses = normalized
 .replace(/\s*&\s*/g, " and ")
 .split(/\s*[;\n]+\s*|\s*,\s*/)
 .map((item) => normalizeIntakeGoalEntry(item, 320))
 .filter(Boolean);

 const extractedGoals = [];
 clauses.forEach((clause) => {
 const segments = clause
 .split(/\s+(?:and|but|plus)\s+/i)
 .map((item) => normalizeIntakeGoalEntry(item, 320))
 .filter(Boolean);

 if (segments.length <= 1) {
 extractedGoals.push(clause);
 return;
 }

 let currentSegment = segments[0];
 segments.slice(1).forEach((segment) => {
 if (INTAKE_MULTI_GOAL_STARTERS.test(segment)) {
 extractedGoals.push(currentSegment);
 currentSegment = segment;
 return;
 }
 currentSegment = normalizeIntakeGoalEntry(`${currentSegment} and ${segment}`, 320);
 });
 extractedGoals.push(currentSegment);
 });

 const orderedGoals = dedupeIntakeGoalEntries(extractedGoals);
 return {
 primaryGoalText: orderedGoals[0] || normalized,
 additionalGoals: orderedGoals.slice(1),
 };
};

const DEFAULT_PERSONALIZATION = {
 // Deprecated runtime input. Canonical athlete state is derived in canonical-athlete-service.js.
 userGoalProfile: { ...DEFAULT_USER_GOAL_PROFILE },
 profile: {
 name: "Athlete",
 timezone: DEFAULT_TIMEZONE,
 birthYear: "",
 height: "",
 weight: "",
 profileSetupComplete: false,
 onboardingComplete: false,
 trainingAgeYears: 0,
 preferredCoachingTone: "adaptive",
 preferredTrainingStyle: "",
 goalMix: "",
 estimatedFitnessLevel: "unknown",
 preferredEnvironments: [],
 inconsistencyRisk: "unknown",
 currentMomentumState: "unknown",
 likelyAdherencePattern: "unknown",
 injurySensitivity: "",
  weekOneReadyDate: "",
  weekOneReadySeenAt: "",
 },
 // Deprecated runtime input. Persisted for backward compatibility until canonical goal-state persistence exists.
 goalState: {
 primaryGoal: "",
 priority: "undecided",
 confidence: 0,
 planStartDate: "",
 },
 trainingState: {
 loadStatus: "building",
 fatigueScore: 2,
 trend: "steady",
 rationale: "Starting baseline.",
 },
 injuryPainState: {
 level: "none",
 area: "Achilles",
 side: "unspecified",
 impact: "",
 limitations: [],
 achilles: { status: "managed", painScore: 1, trend: "stable" },
 notes: "",
 capabilities: buildInjuryCapabilityProfile({ level: "none", area: "Achilles" }).capabilities,
 preserveForPlanning: false,
 activeModifications: [],
 },
 travelState: {
 isTravelWeek: false,
 access: "home",
 nextTripNote: "",
 environmentMode: "home",
 },
 environmentConfig: {
 base: { equipment: "dumbbells", time: "30" },
 defaultMode: "Home",
 todayOverride: null,
 weekOverride: null,
 schedule: [],
 presets: {
 Home: { equipment: ["dumbbells", "pull-up bar"], time: "30" },
 Outdoor: { equipment: ["bodyweight only", "outdoor route"], time: "30" },
 Travel: { equipment: ["bodyweight only"], time: "20" },
 Gym: { equipment: ["full rack", "barbell", "cable stack"], time: "45+" },
 },
 },
 adherenceMomentumState: {
 sevenDayCompletion: 0,
 consistency: "unknown",
 momentum: "neutral",
 },
 nutritionPreferenceState: {
 style: "high-protein performance",
 dislikes: ["pastries"],
 preferredMeals: ["rice bowls", "eggs", "greek yogurt"],
 carbTolerance: "high around workouts",
 preferredCuisines: [],
 maintenanceEstimateCalories: "",
 weeklyDeficitTargetCalories: "",
 },
 localFoodContext: {
 city: "",
 groceryOptions: [],
 quickOptions: [],
 locationPermissionGranted: false,
 locationStatus: "unknown",
 locationLabel: "",
 lastKnownLat: null,
 lastKnownLng: null,
 lastUpdatedAt: 0,
 },
 manualProgressInputs: {
 measurements: {},
 metrics: {},
 benchmarks: {},
 },
 coachMemory: {
 wins: [],
 constraints: [],
 failurePatterns: [],
 pushResponse: "",
 protectResponse: "",
 commonBarriers: [],
 preferredFoodPatterns: [],
 scheduleConstraints: [],
 simplicityVsVariety: "",
 lastAdjustment: "Onboarding pending.",
 longTermMemory: [],
 sundayReviews: [],
 lastSundayPushWeek: "",
 },
 trainingContext: createEmptyTrainingContext(),
 strengthProgression: {
 prescriptions: {},
 pendingByDate: {},
 notifications: {},
 explanations: {},
 tracking: {},
 },
 connectedDevices: {
 appleHealth: {
 status: "not_connected",
 permissionRequestedAt: 0,
 permissionsGranted: [],
 skipped: false,
 workouts: {},
 samples: { restingHr: null, vo2max: null, sleepHours: null, activeEnergy: null },
 lastConnectionCheck: null,
 lastSyncStatus: "unknown",
 },
 garmin: {
 status: "not_connected",
 deviceName: "",
 oauthTokenRef: "",
 permissionsGranted: [],
 connectedAt: 0,
 activities: [],
 dailySummaries: {},
 trainingReadinessScore: null,
 lastSyncAt: 0,
 lastApiErrorAt: 0,
 lastApiStatus: "ok",
 lastErrorMessage: "",
 lastErrorFix: "",
 },
 },
 fitnessSignals: {
 fitnessLevel: "unknown",
 paceOffsetSec: 0,
 runSignals: [],
 updatedAt: 0,
 },
 settings: {
 units: { weight: "lbs", distance: "miles", height: "ft_in" },
 trainingPreferences: {
 defaultEnvironment: "Home",
 weeklyCheckinDay: "Sun",
 intensityPreference: "Standard",
 },
 appearance: {
 theme: "Atlas",
 mode: "Dark",
 },
 notifications: {
 allOff: false,
 weeklyReminderOn: true,
 weeklyReminderTime: "18:00",
 proactiveNudgeOn: true,
 },
 },
 programs: createDefaultProgramSelectionState(),
 planArchives: [],
 goalChangeHistory: [],
 goalReviewHistory: [],
 goalManagement: {
 version: 1,
 archivedGoals: [],
 history: [],
 },
 planResetUndo: null,
};

const PERSONALIZATION_ACTIONS = {
 SET_GOAL: "SET_GOAL",
 SET_TRAVEL: "SET_TRAVEL",
 SET_PAIN: "SET_PAIN",
 ADD_MEMORY: "ADD_MEMORY",
 UPDATE_NUTRITION_PREF: "UPDATE_NUTRITION_PREF",
};

const mergePersonalization = (base, patch) => ({
 ...base,
 ...patch,
 userGoalProfile: { ...(base.userGoalProfile || DEFAULT_PERSONALIZATION.userGoalProfile), ...(patch?.userGoalProfile || {}) },
 goalState: { ...(base.goalState || DEFAULT_PERSONALIZATION.goalState), ...(patch?.goalState || {}) },
 injuryPainState: {
 ...(base.injuryPainState || DEFAULT_PERSONALIZATION.injuryPainState),
 ...(patch?.injuryPainState || {}),
 achilles: {
 ...((base.injuryPainState || DEFAULT_PERSONALIZATION.injuryPainState).achilles || {}),
 ...(patch?.injuryPainState?.achilles || {}),
 },
 capabilities: {
 ...((base.injuryPainState || DEFAULT_PERSONALIZATION.injuryPainState).capabilities || {}),
 ...(patch?.injuryPainState?.capabilities || {}),
 },
 },
 travelState: { ...base.travelState, ...(patch?.travelState || {}) },
 trainingContext: {
 ...(base.trainingContext || createEmptyTrainingContext()),
 ...(patch?.trainingContext || {}),
 environment: {
 ...((base.trainingContext || createEmptyTrainingContext()).environment || {}),
 ...(patch?.trainingContext?.environment || {}),
 },
 equipmentAccess: {
 ...((base.trainingContext || createEmptyTrainingContext()).equipmentAccess || {}),
 ...(patch?.trainingContext?.equipmentAccess || {}),
 },
 sessionDuration: {
 ...((base.trainingContext || createEmptyTrainingContext()).sessionDuration || {}),
 ...(patch?.trainingContext?.sessionDuration || {}),
 },
 intensityPosture: {
 ...((base.trainingContext || createEmptyTrainingContext()).intensityPosture || {}),
 ...(patch?.trainingContext?.intensityPosture || {}),
 },
 weekdayAvailability: {
 ...((base.trainingContext || createEmptyTrainingContext()).weekdayAvailability || {}),
 ...(patch?.trainingContext?.weekdayAvailability || {}),
 },
 },
 environmentConfig: {
 ...(base.environmentConfig || DEFAULT_PERSONALIZATION.environmentConfig),
 ...(patch?.environmentConfig || {}),
 base: { ...(base.environmentConfig?.base || DEFAULT_PERSONALIZATION.environmentConfig.base), ...(patch?.environmentConfig?.base || {}) },
 },
 nutritionPreferenceState: { ...base.nutritionPreferenceState, ...(patch?.nutritionPreferenceState || {}) },
 localFoodContext: { ...base.localFoodContext, ...(patch?.localFoodContext || {}) },
 manualProgressInputs: {
 ...(base.manualProgressInputs || DEFAULT_PERSONALIZATION.manualProgressInputs),
 ...(patch?.manualProgressInputs || {}),
 measurements: {
 ...((base.manualProgressInputs || DEFAULT_PERSONALIZATION.manualProgressInputs).measurements || {}),
 ...(patch?.manualProgressInputs?.measurements || {}),
 },
 metrics: {
 ...((base.manualProgressInputs || DEFAULT_PERSONALIZATION.manualProgressInputs).metrics || {}),
 ...(patch?.manualProgressInputs?.metrics || {}),
 },
 benchmarks: {
 ...((base.manualProgressInputs || DEFAULT_PERSONALIZATION.manualProgressInputs).benchmarks || {}),
 ...(patch?.manualProgressInputs?.benchmarks || {}),
 },
 },
 coachMemory: { ...base.coachMemory, ...(patch?.coachMemory || {}), wins: patch?.coachMemory?.wins || base.coachMemory.wins, constraints: patch?.coachMemory?.constraints || base.coachMemory.constraints },
 goalManagement: {
 ...(base.goalManagement || DEFAULT_PERSONALIZATION.goalManagement),
 ...(patch?.goalManagement || {}),
 archivedGoals: patch?.goalManagement?.archivedGoals || (base.goalManagement || DEFAULT_PERSONALIZATION.goalManagement).archivedGoals,
 history: patch?.goalManagement?.history || (base.goalManagement || DEFAULT_PERSONALIZATION.goalManagement).history,
 },
 programs: {
 ...(base.programs || createDefaultProgramSelectionState()),
 ...(patch?.programs || {}),
 selectionHistory: patch?.programs?.selectionHistory || (base.programs || createDefaultProgramSelectionState()).selectionHistory,
 },
});

const derivePersonalization = (logs, bodyweights, previous) => {
 const base = mergePersonalization(DEFAULT_PERSONALIZATION, previous || {});
 const entries = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
 const last14 = entries.slice(-14);
 const completed7 = entries.filter(([date]) => ((Date.now() - new Date(date + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24)) <= 7).length;
 const avgFeel = last14.length ? (last14.reduce((s, [, l]) => s + (parseInt(l.feel || 3)), 0) / last14.length) : 3;
 const travelHits = last14.filter(([, l]) => l.location === "hotel").length;
 const achillesSignals = last14.filter(([, l]) => (l.notes || "").toLowerCase().includes("achilles") || (l.notes || "").toLowerCase().includes("tight")).length;
 const latestBW = (bodyweights || []).length ? bodyweights[bodyweights.length - 1].w : PROFILE.weight;
 const startBW = (bodyweights || []).length ? bodyweights[0].w : PROFILE.weight;
 const weightDelta = (latestBW - startBW).toFixed(1);
 const injuryProfile = buildInjuryCapabilityProfile(base.injuryPainState || {});
 return mergePersonalization(base, {
 goalState: {
 ...base.goalState,
 confidence: Math.min(0.95, Math.max(0.35, 0.5 + ((avgFeel - 3) * 0.1) + (completed7 >= 4 ? 0.1 : -0.05))),
 },
 trainingState: {
 loadStatus: avgFeel <= 2.2 ? "recovery-needed" : avgFeel >= 4 ? "ready-to-push" : "building",
 fatigueScore: Math.max(1, Math.min(5, Math.round(6 - avgFeel))),
 trend: entries.length < 5 ? "early" : avgFeel >= 3.2 ? "up" : "flat",
 rationale: `Avg feel ${avgFeel.toFixed(1)}/5 over last ${last14.length || 0} logs.`,
 },
 injuryPainState: {
 ...base.injuryPainState,
 area: injuryProfile.area || base.injuryPainState.area,
 impact: base.injuryPainState?.impact || "",
 capabilities: injuryProfile.capabilities,
 achilles: {
 status: achillesSignals > 2 ? "flared" : achillesSignals > 0 ? "watch" : "managed",
 painScore: Math.min(5, Math.max(1, 2 + achillesSignals)),
 trend: achillesSignals > 2 ? "up" : "stable",
 },
 },
 travelState: {
 ...base.travelState,
 isTravelWeek: travelHits > 0,
 access: travelHits > 0 ? "hotel" : "home",
 },
 adherenceMomentumState: {
 sevenDayCompletion: completed7,
 consistency: completed7 >= 4 ? "high" : completed7 >= 2 ? "medium" : "low",
 momentum: avgFeel >= 3.5 && completed7 >= 4 ? "up" : completed7 <= 1 ? "down" : "neutral",
 },
 coachMemory: {
 ...base.coachMemory,
 lastAdjustment: `Momentum ${completed7}/7 sessions, bodyweight ${weightDelta > 0 ? "+" : ""}${weightDelta} lbs.`,
 }
 });
};

const buildInjuryRuleResult = (todayWorkout, injuryState) => {
 return buildSharedInjuryRuleResult(todayWorkout, injuryState);
 const level = injuryState?.level || "none";
 const area = injuryState?.area || "Achilles";
 if (level === "none") return { workout: todayWorkout, mods: [], why: "No active injury modifiers.", caution: null };
 const base = { ...(todayWorkout || { label: "Recovery Mode", type: "rest" }) };
 if (level === "mild_tightness") {
 return {
 workout: { ...base, label: `${base.label || "Session"}`, injuryAdjusted: true },
 mods: ["Reduce intensity by ~10%", "Add 10-15 min warm-up", "Preserve easy aerobic work only"],
 why: `${area} mild tightness is active, so we keep movement but reduce risk.`,
 caution: "Training adjustment logic only - not medical advice."
 };
 }
 if (level === "moderate_pain") {
 return {
 workout: { ...base, label: "Low-Impact Cardio / Walk + Recovery", type: "rest", injuryAdjusted: true, nutri: "rest" },
 mods: ["Remove tempo/speed work", "Replace with bike, incline walk, or easy walk", "Elevate recovery + mobility guidance"],
 why: `${area} moderate pain indicates hard running is too risky today.`,
 caution: "If pain persists/worsens, seek professional assessment."
 };
 }
 return {
 workout: { ...base, label: "Stop / Recovery Only", type: "rest", injuryAdjusted: true, nutri: "rest" },
 mods: ["Suppress hard run recommendations", "Switch to recovery mode only", "Use stop/caution language and monitor symptoms"],
 why: `${area} sharp pain signal requires immediate training de-load.`,
 caution: "Stop training and get medical guidance if symptoms are sharp or escalating."
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

const resolvePlanningEnvironmentMode = (personalization = {}) => {
 const trainingContext = deriveTrainingContextFromPersonalization({ personalization });
 return trainingContext?.environment?.confirmed ? trainingContext.environment.value : "unknown";
};

const resolvePlanningEquipmentAccess = (personalization = {}) => {
 const trainingContext = deriveTrainingContextFromPersonalization({ personalization });
 return trainingContext?.equipmentAccess?.confirmed ? trainingContext.equipmentAccess.value : "unknown";
};

const applyEnvironmentToWorkout = (workout, env, context = {}) => {
 const next = { ...(workout || {}) };
 const equipment = env?.equipment || "unknown";
 const time = env?.time || "unknown";
 const behavior = String(env?.behavior || "").toLowerCase();
 const weekState = context.weekState || "normal";
 const injuryFlag = context.injuryFlag || "none";
  const shortSession = time === "20";
  const mediumSession = time === "30";
  const longSession = time === "45+" || time === "45" || time === "60+";
 const limitedEquipment = equipment === "none";
 const gymReady = equipment === "full_gym" || equipment === "basic_gym";
 const chaotic = weekState === "chaotic";
 const fatigued = weekState === "fatigued";
 const achillesLimited = injuryFlag !== "none";
 const forceOutdoorSession = behavior === "outdoor_session";
 const dayIdentity = next.type === "long-run"
 ? "long"
 : next.type === "easy-run"
 ? "easy"
 : next.type === "hard-run"
 ? "tempo"
 : next.type === "strength+prehab"
 ? "strength"
 : next.type === "rest"
 ? "recovery"
 : next.type === "run+strength" || next.type === "otf"
 ? "hybrid"
 : "easy";

 const allowSecondary = !chaotic && !shortSession;
 if (!allowSecondary) next.optionalSecondary = null;
 if (env?.neutral) {
 next.environmentNote = [next.environmentNote, "Training setup is still unconfirmed, so this prescription stays equipment-neutral until you set your environment."].filter(Boolean).join(" ").trim();
 return next;
 }

 if (forceOutdoorSession) {
 const outdoorMove = achillesLimited
 ? shortSession
 ? "15-20 min outdoor walk"
 : mediumSession
 ? "20-30 min outdoor walk"
 : "30-45 min outdoor walk"
 : shortSession
 ? "15-20 min brisk walk or easy jog"
 : mediumSession
 ? "25-35 min brisk walk, hike, or easy jog"
 : "35-50 min easy run, hike, or brisk walk";
 if (dayIdentity === "strength") {
 next.type = "conditioning";
 next.label = shortSession ? "Outdoor reset" : "Outdoor aerobic session";
 next.fallback = outdoorMove;
 next.optionalSecondary = allowSecondary ? "Optional: 8-12 min bodyweight strength after the outdoor work." : null;
 next.environmentNote = "Outdoor override active: swap the gym session for simple outdoor aerobic work today.";
 next.nutri = NUTRITION_DAY_TYPES.conditioningMixed;
 return next;
 }
 if (dayIdentity === "hybrid") {
 next.label = shortSession ? "Outdoor hybrid reset" : "Outdoor hybrid session";
 next.run = { ...(next.run || {}), t: "Easy", d: shortSession ? "10-12 min easy jog or walk" : mediumSession ? "18-25 min easy run or walk" : "25-35 min easy outdoor run" };
 next.strengthDose = shortSession ? "6-8 min bodyweight strength" : "8-12 min bodyweight strength";
 next.optionalSecondary = allowSecondary ? "Optional: keep the strength piece bodyweight-only." : null;
 next.environmentNote = "Outdoor override active: keep both lanes alive, but make the whole session outdoor-friendly.";
 return next;
 }
 if (dayIdentity === "recovery") {
 next.label = "Outdoor recovery walk";
 next.fallback = achillesLimited ? "Easy outdoor walk only." : "Easy outdoor walk and mobility.";
 next.environmentNote = "Outdoor override active: keep recovery simple and outside.";
 next.optionalSecondary = null;
 return next;
 }
 next.environmentNote = [next.environmentNote, "Outdoor override active today."].filter(Boolean).join(" ").trim();
 }

 if (dayIdentity === "long") {
 if (longSession) {
 next.run = next.run || { t: "Easy", d: "Long easy run" };
 next.environmentNote = "Long-run identity preserved.";
 } else if (mediumSession) {
 next.run = { ...(next.run || {}), t: "Easy", d: "25 min easy + 5 min cooldown" };
 next.environmentNote = "Compressed long-run day: easy aerobic time only.";
 } else {
 next.run = { ...(next.run || {}), t: "Easy", d: "20 min easy" };
 next.environmentNote = "Minimum viable long-run touchpoint.";
 }
 if (chaotic) next.fallback = "Short easy run or brisk walk. Keep the long-run rhythm.";
 if (achillesLimited) {
 next.run = { ...(next.run || {}), t: "Easy / run-walk", d: shortSession ? "15-20 min gentle run-walk" : "20-25 min gentle run-walk" };
 next.environmentNote = "Achilles-protect long day: reduced duration and intensity.";
 }
 }

 if (dayIdentity === "tempo") {
 if (longSession) {
 next.run = next.run || { t: "Tempo", d: "Warmup + tempo + cooldown" };
 next.environmentNote = "Tempo identity preserved.";
 } else if (mediumSession) {
 next.run = { ...(next.run || {}), t: fatigued ? "Steady" : "Tempo", d: "5 warmup + 15-18 min tempo + 5 cooldown" };
 next.environmentNote = fatigued ? "Fatigued week: steady effort instead of hard tempo." : "Compressed tempo set.";
 } else {
 next.run = { ...(next.run || {}), t: fatigued ? "Steady" : "Steady-hard", d: "5 easy + 10 steady-hard + 5 easy" };
 next.environmentNote = "Short tempo day: simple, controlled effort.";
 }
 if (achillesLimited) {
 next.run = { ...(next.run || {}), t: "Moderate steady", d: shortSession ? "15-20 min moderate steady" : "20-25 min moderate steady" };
 next.environmentNote = "Achilles-protect tempo day: no surges, steady effort.";
 }
 }

 if (dayIdentity === "easy") {
 if (longSession) {
 next.run = next.run || { t: "Easy", d: "Normal easy run" };
 } else if (mediumSession) {
 next.run = { ...(next.run || {}), t: "Easy", d: "25-30 min easy" };
 } else {
 next.run = { ...(next.run || {}), t: chaotic ? "Run/walk" : "Easy", d: "20 min easy or run/walk" };
 }
 if (chaotic) next.fallback = "Easy jog or walk is enough today.";
 next.environmentNote = chaotic ? "Chaotic week: keep this simple and finish it." : "Easy-day identity preserved.";
 }

 if (dayIdentity === "strength") {
 next.strengthTrack = gymReady ? "hotel" : "home";
 if (limitedEquipment) {
 next.label = `${next.label || "Strength"} (Bodyweight only)`;
 next.environmentNote = shortSession ? "Minimum viable full-body bodyweight strength." : "Bodyweight full-body strength session.";
 } else if (equipment === "dumbbells") {
 next.label = `${next.label || "Strength"} (Dumbbell compounds)`;
 next.environmentNote = "Dumbbell compounds only. Keep it clean.";
 } else {
 next.label = `${next.label || "Strength"} (${equipment === "full_gym" ? "Full gym" : "Basic gym"})`;
 next.environmentNote = "Condensed full-body gym strength.";
 }
 next.strengthDuration = shortSession ? "15-20 min" : mediumSession ? "20-30 min" : "30-45 min";
 next.fallback = shortSession ? "Minimum viable strength: 2 compound moves + core." : next.fallback;
 }

 if (dayIdentity === "recovery") {
 next.type = "rest";
 next.label = next.todayPlan?.label || "Active Recovery - Walk + Mobility";
 next.environmentNote = "Recovery stays recovery. Walk, mobility, rehab only.";
 next.optionalSecondary = null;
 next.fallback = "Easy walk + mobility only.";
 }

 if (dayIdentity === "hybrid") {
 if (shortSession) {
 next.label = "Hybrid (short): 12 min easy run + 8 min strength";
 next.environmentNote = "Hybrid compressed to keep both run and strength touchpoints.";
 next.strengthTrack = limitedEquipment ? "home" : gymReady ? "hotel" : "home";
 } else if (mediumSession) {
 next.label = "Hybrid: easy run + short strength";
 next.environmentNote = "Balanced hybrid session with simple structure.";
 next.strengthTrack = limitedEquipment ? "home" : gymReady ? "hotel" : "home";
 } else {
 next.environmentNote = "Hybrid day: run first, strength second.";
 next.strengthTrack = limitedEquipment ? "home" : gymReady ? "hotel" : "home";
 }
 }

 if (shortSession && !next.fallback) next.fallback = "20-min version: main work only.";
 if (mediumSession && !next.environmentNote) next.environmentNote = "30-min cap: prioritize main stimulus.";
 if (longSession && !next.environmentNote) next.environmentNote = gymReady ? "45+ min with full setup." : "45+ min available.";
 if (forceOutdoorSession && next.environmentNote && !/outdoor/i.test(next.environmentNote)) {
 next.environmentNote = `Outdoor override active today. ${next.environmentNote}`.trim();
 }
 return next;
};

const scaleMilesString = (text, factor) => {
 if (!text) return text;
 const m = text.match(/(\d+(\.\d+)?)\s*mi/);
 if (!m) return text;
 const val = parseFloat(m[1]);
 const scaled = Math.max(2, Math.round((val * factor) * 10) / 10);
 return text.replace(m[0], `${scaled} mi`);
};

const computeAdaptiveSignals = ({ logs, bodyweights, personalization }) => {
 const entries = Object.entries(logs || {}).sort((a,b) => a[0].localeCompare(b[0]));
 const last14 = entries.slice(-14).map(([,l]) => l);
 const keySessions = last14.filter(l => /tempo|interval|long|race/i.test(l.type || "")).length;
 const completed = last14.length;
 const adherenceScore = Math.max(0, Math.min(1, completed / 8));
 const avgFeel = last14.length ? last14.reduce((s,l)=>s + parseInt(l.feel || 3), 0) / last14.length : 3;
 const easyHighEffortHits = last14.filter(l => /easy/i.test(l.type || "") && parseInt(l.feel || 3) <= 2).length;
 const missedPattern = Math.max(0, 8 - completed);
 const fatigueFlag = avgFeel <= 2.4 || easyHighEffortHits >= 2;
 const momentumFlag = adherenceScore >= 0.85 && avgFeel >= 3.5;
 const needDeload = fatigueFlag && (missedPattern >= 2 || keySessions <= 1);
 const readiness = needDeload ? "low" : momentumFlag ? "high" : "medium";
 const volumeTolerance = needDeload ? 0.88 : momentumFlag ? 1.05 : adherenceScore < 0.5 ? 0.93 : 1.0;
 const intensityTolerance = (personalization.injuryPainState.level !== "none" || fatigueFlag || personalization.travelState.isTravelWeek) ? 0.85 : momentumFlag ? 1.05 : 1.0;
 const bwDropFast = bodyweights.length >= 2 ? ((bodyweights[0].w - bodyweights[bodyweights.length - 1].w) / Math.max(1, bodyweights.length - 1)) > 0.35 : false;
 return { adherenceScore, fatigueFlag, momentumFlag, readiness, needDeload, volumeTolerance, intensityTolerance, bwDropFast };
};

const buildAdaptiveWeek = (week, signals, personalization, memoryInsights = []) => {
 const changed = [];
 const adjusted = JSON.parse(JSON.stringify(week));
 if (signals.volumeTolerance !== 1.0) {
 adjusted.mon.d = scaleMilesString(week.mon.d, signals.volumeTolerance);
 adjusted.fri.d = scaleMilesString(week.fri.d, signals.volumeTolerance);
 adjusted.sat.d = scaleMilesString(week.sat.d, signals.volumeTolerance);
 changed.push(`Volume ${signals.volumeTolerance > 1 ? "progressed" : "reduced"} (${Math.round((signals.volumeTolerance - 1) * 100)}%)`);
 }
 if (signals.intensityTolerance < 0.95 && /Tempo|Intervals/.test(week.thu.t)) {
 adjusted.thu.t = "Easy Aerobic";
 adjusted.thu.d = "30-45 min easy aerobic + strides optional";
 changed.push("Hard run replaced with easy aerobic work");
 }
 if (personalization.injuryPainState.level !== "none") {
 adjusted.thu.t = "Low-Impact";
 adjusted.thu.d = "Bike or incline walk 35-45 min";
 changed.push(`Intensity protected for ${personalization.injuryPainState.area} ${personalization.injuryPainState.level.replaceAll("_"," ")}`);
 }
 if (personalization.travelState.isTravelWeek) {
 adjusted.mon.d = scaleMilesString(adjusted.mon.d, 0.9);
 adjusted.fri.d = scaleMilesString(adjusted.fri.d, 0.9);
 changed.push("Travel simplification applied");
 }
 const equipmentAccess = resolvePlanningEquipmentAccess(personalization);
 if (equipmentAccess === "none") {
 adjusted.str = "A";
 changed.push("Environment mode reduced equipment dependency.");
 }
 if (equipmentAccess === "basic_gym") {
 changed.push("Limited-gym substitutions prioritized (dumbbell/cable friendly).");
 }
 if (memoryInsights.some(m => m.key === "prefers_simpler_weeks")) {
 adjusted.thu.t = adjusted.thu.t === "Intervals" ? "Tempo" : adjusted.thu.t;
 changed.push("Long-term memory: simpler weekly density improves follow-through.");
 }
 return { adjusted, changed };
};

const DEFAULT_MULTI_GOALS = [
 { id: "g_primary", name: "Primary goal (set in onboarding)", type: "time_bound", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "deadline" } },
 { id: "g_secondary_1", name: "Secondary goal 1", type: "ongoing", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "weekly_checkin", unit: "lb" } },
 { id: "g_secondary_2", name: "Secondary goal 2", type: "ongoing", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "logged_lifts", unit: "lb" } },
 { id: "g_resilience", name: "Resilience & injury prevention", type: "ongoing", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true, tracking: { mode: "progress_tracker" } },
];

const arbitrateGoals = ({ goals, momentum, personalization }) => {
 const active = (goals || []).filter(g => g.active).sort((a,b)=>a.priority-b.priority);
 const primary = active[0] || null;
 const secondary = active.filter(g => g.id !== primary?.id).slice(0,3);
 const maintenance = active.slice(3);
 const deprioritized = [];
 const conflicts = [];
 const pushes = [];
 const maintains = [];
 const reduces = [];
 const consistencyThreatened = ["drifting","falling off"].includes(momentum.momentumState);
 const env = resolvePlanningEnvironmentMode(personalization);
 const equipmentAccess = resolvePlanningEquipmentAccess(personalization);

 if (primary?.category === "body_comp" && secondary.find(g=>g.category==="running")) {
 conflicts.push("Fat loss vs run performance");
 pushes.push("Run quality sessions");
 maintains.push("Moderate deficit only");
 reduces.push("Aggressive calorie cuts");
 }
 if (active.find(g=>g.category==="strength") && active.find(g=>g.category==="running")) {
 conflicts.push("Strength vs endurance recovery load");
 pushes.push("1-2 meaningful strength sessions");
 maintains.push("Key run sessions");
 reduces.push("Extra accessory volume");
 }
 if (consistencyThreatened) {
 conflicts.push("Consistency vs optimization");
 pushes.push("Low-friction routine completion");
 reduces.push("Complexity and perfection targets");
 active.slice(2).forEach(g=>deprioritized.push(g.name));
 }
 if (["none", "basic_gym"].includes(equipmentAccess) || env === "variable") {
 conflicts.push("Environment constraints vs ideal programming");
 maintains.push("Strength stimulus via substitutes");
 reduces.push("Barbell-specific progression assumptions");
 }
 const priorityStack = {
 primary: primary?.name || "None",
 secondary: secondary?.[0]?.name || "None",
 maintained: maintenance?.[0]?.name || secondary?.[1]?.name || "None"
 };
 const maintainGoals = secondary
 .filter(g => g.category !== "injury_prevention")
 .slice(0, 2)
 .map(g => g.name);
 const minimizeGoal = active.find(g => g.category === "injury_prevention")?.name || (secondary[2]?.name || "non-primary extras");
 const goalAllocation = {
 primary: primary?.name || "Consistency",
 maintained: maintainGoals.length ? maintainGoals : ["General fitness"],
 minimized: minimizeGoal,
 };
 const prioritizedCategory = primary?.category === "running"
 ? "running"
 : primary?.category === "strength"
 ? "strength"
 : primary?.category === "body_comp"
 ? "body composition"
 : "consistency";
 const allocationNarrative = `This block gives the most room to ${prioritizedCategory}. ${goalAllocation.maintained[0]} stays active with less emphasis. ${active.some(g => g.category === "body_comp") ? "Core work stays minimal but consistent." : `${goalAllocation.minimized} gets the least dedicated block volume.`}`;
 const strengthSessionsTarget = primary?.category === "strength" && !consistencyThreatened ? 2 : 1;
 const strengthInclusion = {
 sessionsPerWeek: strengthSessionsTarget === 2 ? "1-2" : "1",
 dose: primary?.category === "strength" && !consistencyThreatened ? "full_progression" : "maintenance_short",
 duration: primary?.category === "strength" && !consistencyThreatened ? "40-55 min" : "20-35 min",
 label: primary?.category === "strength" && !consistencyThreatened ? "Strength progression session" : "Short strength maintenance session",
 };
 const aestheticInclusion = active.some(g => g.category === "body_comp")
 ? { active: true, optionalLine: "Optional: 10 min core", weeklyTarget: "2-4 short finishers" }
 : { active: false, optionalLine: "" };
 const shiftReason = consistencyThreatened
 ? "This week is consistency-first to rebuild execution."
 : primary?.category === "running" && secondary.find(g => g.category === "body_comp")
 ? "This week is slightly run-focused while fat loss is supported through nutrition precision."
 : primary?.category === "body_comp" && active.find(g => g.category === "running")
 ? "This week is cut-focused while run quality is protected."
 : primary?.category === "strength"
 ? "This week is slightly strength-focused while endurance stays active with less emphasis."
 : "This week keeps a balanced mixed-goal plan.";
 const decisionLinks = [
 consistencyThreatened
 ? "Volume is lower because adherence risk is elevated right now."
 : "Volume stays targeted so primary-goal sessions remain high quality.",
 primary?.category === "body_comp" || active.some(g => g.category === "body_comp")
 ? "Calories use a moderate deficit to keep fat loss moving without crashing performance."
 : "Calories stay closer to maintenance/performance support on quality training days.",
 primary?.category === "strength" && !consistencyThreatened
 ? "Strength progression is pushed this block with controlled fatigue."
 : "Strength progression is slowed to protect run quality and recovery."
 ];
 const explanation = `Priority 1 is ${priorityStack.primary}. This week puts the most weight on ${pushes[0] || "consistency"}, keeps ${maintains[0] || "other priorities"} active, and trims ${reduces[0] || "non-essential load"} where needed. ${allocationNarrative}`;
 const todayLine = `Today's balance: most weight on ${pushes[0] || "consistency"}; keep ${maintains[0] || "other priorities"} active; trim ${reduces[0] || "non-essential load"} where needed.`;
 const coachTradeoffLine = `Tradeoff: ${shiftReason} Strength is ${strengthInclusion.dose === "full_progression" ? "progressed" : "kept lighter"} (${strengthInclusion.duration}) so recovery supports ${priorityStack.primary}.`;
 const coachSummary = `${shiftReason} Decision links: ${decisionLinks.join(" ")}`;
 return { primary, secondary, maintenance, deprioritized, conflicts, pushes, maintains, reduces, explanation, priorityStack, shiftReason, decisionLinks, todayLine, coachSummary, goalAllocation, allocationNarrative, strengthInclusion, aestheticInclusion, coachTradeoffLine };
};

const getMomentumEngineState = ({ logs, dailyCheckins = {}, bodyweights, personalization }) => {
 const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const last14 = entries.slice(-14);
 const last7Count = entries.filter(([d]) => ((Date.now()-new Date(d+"T12:00:00").getTime())/(1000*60*60*24)) <= 7).length;
 const calibration = deriveCalibrationState({ logs, dailyCheckins });
 const logGapDays = entries.length ? Math.floor((Date.now() - new Date(entries[entries.length-1][0]+"T12:00:00").getTime())/(1000*60*60*24)) : 99;
 const bwLogs7 = (bodyweights || []).filter(b => ((Date.now()-new Date(b.date+"T12:00:00").getTime())/(1000*60*60*24)) <= 7).length;
 const fatigueNotes = last14.filter(([,l]) => /(tired|fatigue|chaos|travel|unmotivated|bad sleep|overwhelmed)/i.test(l.notes || "")).length;
 if (calibration.isCalibration) {
 return {
 score: 50,
 momentumState: "calibrating",
 coachMode: "calibration mode",
 inconsistencyRisk: "unknown",
 likelyAdherencePattern: "calibrating baseline",
 completionRate: 0,
 logGapDays: 0,
 fatigueNotes,
 isCalibration: true,
 historyCount: calibration.historyCount,
 minHistoryCount: calibration.minHistoryCount,
 };
 }
 const completionRate = Math.min(1, last14.length / 8);
 let score = 50;
 score += completionRate * 30;
 score += Math.min(10, bwLogs7 * 3);
 score -= Math.min(25, logGapDays * 4);
 score -= fatigueNotes * 4;
 score -= last7Count <= 1 ? 12 : 0;
 score = Math.max(0, Math.min(100, Math.round(score)));
 const momentumState = score >= 75 ? "building momentum" : score >= 55 ? "stable" : score >= 35 ? "drifting" : "falling off";
 const coachMode = momentumState === "building momentum" ? "push mode" : momentumState === "stable" ? "rebuild mode" : momentumState === "drifting" ? "simplify mode" : "reset mode";
 const protectNeeded = personalization.injuryPainState.level !== "none" || fatigueNotes >= 3;
 const finalCoachMode = protectNeeded ? "protect mode" : coachMode;
 const likelyAdherencePattern = score >= 70 ? "high if structured" : score >= 45 ? "needs low-friction plan" : "requires reset prompts";
 const inconsistencyRisk = score >= 70 ? "low" : score >= 45 ? "medium" : "high";
 return { score, momentumState, coachMode: finalCoachMode, inconsistencyRisk, likelyAdherencePattern, completionRate, logGapDays, fatigueNotes, isCalibration: false, historyCount: calibration.historyCount, minHistoryCount: calibration.minHistoryCount };
};

const buildProactiveTriggers = ({ momentum, personalization, goals, learning, nutritionActualLogs, longTermMemory }) => {
 const triggers = [];
 const actualNutritionLogs = Object.values(nutritionActualLogs || {});
 const dropFast = (longTermMemory || []).some(m => m.key === "drops_after_3_4_days" && m.confidence === "high");
 if (momentum.momentumState === "drifting") triggers.push({ id:"drift", msg:"Drift detected - want a simplified version of this week?", actionLabel:"Simplify week", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 12 }, priority:85 });
 if (momentum.momentumState === "falling off") triggers.push({ id:"reset", msg:"Momentum has dipped - want a compressed reset week to make execution easier?", actionLabel:"Use reset week", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:95 });
 if (momentum.score >= 80) triggers.push({ id:"progress", msg:"Consistency streak is strong - progress slightly this week?", actionLabel:"Progress slightly", actionType:"PROGRESS_STRENGTH_EMPHASIS", payload:{ weeks: 1 }, priority:70 });
 if (personalization.travelState.isTravelWeek) triggers.push({ id:"env", msg:"Environment changed - switch to travel/home assumptions?", actionLabel:"Switch travel mode", actionType:"SWITCH_TRAVEL_MODE", payload:{ mode:"travel" }, priority:72 });
 if (goals?.find(g=>g.category==="body_comp" && g.active) && momentum.logGapDays >= 3) triggers.push({ id:"nutrition", msg:"Nutrition drift risk is rising - simplify meals for a few days?", actionLabel:"Simplify meals", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:78 });
 if (momentum.logGapDays >= (dropFast ? 2 : 3)) triggers.push({ id:"nolog", msg:"No logs recently - apply low-friction reset plan?", actionLabel:"Low-friction reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:88 });
 if (learning?.stats?.timeBlockers >= 2) triggers.push({ id:"time_friction", msg:"Time blockers keep repeating - cap sessions and reduce density?", actionLabel:"Reduce density", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 15 }, priority:84 });
 if (learning?.stats?.harder >= 3) triggers.push({ id:"too_hard", msg:"Sessions are repeatedly harder than expected - lower aggressiveness?", actionLabel:"Lower aggressiveness", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 10 }, priority:80 });
 if ((learning?.stats?.equipBlockers || 0) + (learning?.stats?.travelBlockers || 0) >= 2) triggers.push({ id:"env_fast", msg:"Gym access pattern changed - switch environment assumptions faster?", actionLabel:"Use no-equipment mode", actionType:"SWITCH_ENV_MODE", payload:{ mode:"no equipment" }, priority:74 });
 const recentNutri = actualNutritionLogs.slice(-7);
 if (recentNutri.filter(n => n.adherence === "low").length >= 2) triggers.push({ id:"nutri_simplify", msg:"Nutrition has been off-track - simplify meal structure for 3 days?", actionLabel:"Apply meal defaults", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:82 });
 if (recentNutri.filter(n => n.issue === "travel" || n.issue === "convenience" || n.deviationKind === "deviated").length >= 2) triggers.push({ id:"nutri_travel", msg:"Travel/convenience is derailing nutrition - switch to travel nutrition mode?", actionLabel:"Enable travel nutrition", actionType:"SWITCH_TRAVEL_NUTRITION_MODE", payload:{ enabled:true }, priority:79 });
 if ((momentum.momentumState === "drifting" || momentum.momentumState === "falling off") && learning?.stats?.skipped >= 2) triggers.push({ id:"salvage_mode", msg:"You've missed 2+ sessions - switch to a 3-day salvage plan?", actionLabel:"Use simpler week", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:92 });
 const confidenceBoost = learning?.adaptation?.active ? 6 : -4;
 return triggers
 .map(t => ({ ...t, priority: (t.priority || 50) + confidenceBoost }))
 .sort((a,b) => b.priority - a.priority)
 .slice(0, 2);
};

const detectBehaviorPatterns = ({ logs, bodyweights, personalization }) => {
 const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const last21 = entries.slice(-21);
 const patterns = [];
 const streakThenMiss = last21.some((_, i) => i >= 3 && /missed|skip|rest/i.test((last21[i]?.[1]?.notes || "")) && last21.slice(Math.max(0, i-3), i).filter(([,l])=>/run|strength|otf/i.test(l.type || "")).length >= 2);
 if (streakThenMiss) patterns.push("You often miss after 2-3 strong days.");
 const env = resolvePlanningEnvironmentMode(personalization);
 const travelLow = ["variable", "gym"].includes(env) && last21.length < 6;
 if (travelLow) patterns.push("Adherence tends to drop when environment changes.");
 const strengthDrop = last21.filter(([,l])=>/strength/i.test(l.type || "")).length < 2 && last21.filter(([,l])=>/run|tempo|interval|long/i.test(l.type || "")).length >= 5;
 if (strengthDrop) patterns.push("Strength work drops when running ramps.");
 const bwInconsistent = (bodyweights || []).length < 2 || (bodyweights.filter(b => ((Date.now()-new Date(b.date+"T12:00:00").getTime())/(1000*60*60*24)) <= 14).length < 2);
 if (bwInconsistent) patterns.push("Bodyweight logging is inconsistent lately.");
 const fatigueRepeats = last21.filter(([,l]) => /(fatigue|chaos|busy|travel|bad sleep)/i.test(l.notes || "")).length >= 2;
 if (fatigueRepeats) patterns.push("Notes repeatedly mention fatigue/chaos/travel.");
 const checkinTimeSkips = last21.filter(([,l]) => l.checkin?.status === "skipped" && l.checkin?.blocker === "time").length >= 2;
 if (checkinTimeSkips) patterns.push("Check-ins suggest time is the most common skip trigger.");
 return patterns.slice(0, 4);
};

const generateDailyCoachBrief = ({ momentum, todayWorkout, arbitration, injuryState, patterns, learning, salvage }) => {
 const warning = injuryState.level !== "none" ? `Watch ${injuryState.area} (${injuryState.level.replaceAll("_"," ")}).` : momentum.momentumState === "falling off" ? "Consistency is the risk today." : "No major red flags.";
 const optionalAdjustment = learning?.adjustmentBias === "simplify"
 ? "Start with a 20-minute minimum dose today; extend only if energy is good."
 : injuryState.level !== "none"
 ? "Downgrade intensity one notch and keep aerobic work easy."
 : "If energy is low, do the first 20 minutes only and bank consistency.";
 return {
 focus: salvage?.active ? "Salvage week: execute the compressed essentials only." : momentum.momentumState.includes("drifting") ? "Preserve momentum, not perfection." : `Execute ${todayWorkout?.label || "today's session"} cleanly.`,
 why: arbitration.explanation,
 arbitrationLine: `${arbitration.todayLine} ${arbitration.coachTradeoffLine || ""}`.trim(),
 warning,
 success: todayWorkout?.minDay ? (todayWorkout?.success || "Today = short version and momentum preserved.") : salvage?.active ? salvage.compressedPlan.success : todayWorkout?.type === "rest" ? "Log recovery, mobility, and tomorrow plan." : "Complete the planned session and log how it felt.",
 optionalAdjustment,
 patternNote: learning?.topObservations?.[0]?.msg || patterns[0] || "No dominant negative pattern detected this week."
 };
};

const generateWeeklyCoachReview = ({ momentum, arbitration, signals, personalization, patterns, learning, nutritionActualLogs, weeklyNutritionReview = null, expectations, recalibration }) => ({
 ...(() => {
 const recentNutri = Object.values(nutritionActualLogs || {}).slice(-7);
 const offTrack = recentNutri.filter(n => n.adherence === "low").length;
 const underFueled = recentNutri.filter(n => n.deviationKind === "under_fueled").length;
 const nutritionLearned = weeklyNutritionReview?.adaptation?.shouldAdapt
 ? weeklyNutritionReview.adaptation.summary
 : weeklyNutritionReview?.deviationPattern?.dominant === "under_fueled"
 ? "Nutrition came in under plan multiple times; protect fueling on key days."
 : underFueled >= 2
 ? "Nutrition came in under plan multiple times; protect fueling on key days."
 : offTrack >= 2
 ? "Nutrition consistency dropped; simplify meals and defaults."
 : weeklyNutritionReview?.friction?.summary || null;
 return {
 wentWell: momentum.score >= 60 ? "You kept core training momentum." : "You still kept some training touchpoints alive.",
 drifted: momentum.momentumState === "drifting" || momentum.momentumState === "falling off" ? "Execution drifted on consistency and logging rhythm." : "Drift was limited.",
 learned: nutritionLearned || learning?.topObservations?.[0]?.msg || patterns[0] || "Current routine works best when kept simple.",
 changesNextWeek: learning?.adjustmentBias === "simplify"
 ? "Simplify next week structure (shorter sessions and lower friction defaults)."
 : learning?.adjustmentBias === "progress"
 ? "Progress modestly (+3-5%) while keeping recovery quality high."
 : momentum.momentumState === "building momentum" ? "Progress slightly (+5% load where tolerated)." : momentum.momentumState === "stable" ? "Hold structure and sharpen execution." : "Simplify week and reset friction points.",
 tradeoff: arbitration.conflicts[0] || "No major conflict this week; maintain balanced progress.",
 arbitrationShift: arbitration.shiftReason,
 expectation: expectations?.nextWindow || "Near-term outlook still forming.",
 expectationCondition: expectations?.conditionLine || "Condition: maintain current structure and logging for clearer trend signal.",
 expectationMotivation: expectations?.motivationLine || "Progress compounds with consistency.",
 recalibrationSummary: recalibration?.summary || "No recalibration this week.",
 recalibrationWhy: recalibration?.why || "",
 recalibrationChanges: recalibration?.changes || []
 };
 })()
});

const buildUnifiedDailyStory = ({ todayWorkout, dailyBrief, progress, arbitration, expectations, salvage, momentum }) => {
 const hasOverride = !!(todayWorkout?.coachOverride || todayWorkout?.minDay || todayWorkout?.reason);
 const priority = salvage?.active
 ? "salvage"
 : hasOverride
 ? "override"
 : ["drifting","falling off"].includes(momentum?.momentumState)
 ? "drift"
 : progress?.warnings?.length
 ? "progress"
 : "expectation";

 const sessionText = todayWorkout?.label || "today's session";
 const expectationSentence = expectations?.nextWindow
 ? `${expectations.nextWindow} ${expectations.conditionLine}`
 : "Near-term outlook stays positive if consistency holds.";
 const progressSentence = progress?.highlights?.slice(0, 2).join("; ") || "Progress signal is still forming.";
 const arbitrationSentence = arbitration?.todayLine || "Today prioritizes consistency and key goal quality.";
 const successSentence = dailyBrief?.success || "Complete the planned session and log how it felt.";

 if (priority === "salvage") {
 return {
 priority,
 brief: `This is a salvage day: execute only the essentials and protect momentum. ${salvage.compressedPlan.success} ${expectationSentence}`,
 success: successSentence
 };
 }
 if (priority === "override") {
 return {
 priority,
 brief: `Today is intentionally adjusted (${todayWorkout?.reason?.replaceAll("_"," ") || "coach override"}) so execution stays realistic. ${arbitrationSentence} ${expectationSentence}`,
 success: successSentence
 };
 }
 if (priority === "drift") {
 return {
 priority,
 brief: `Consistency is the top priority today. Keep ${sessionText} simple and complete; perfection is not required. ${progressSentence}.`,
 success: successSentence
 };
 }
 if (priority === "progress") {
 return {
 priority,
 brief: `You're trending in the right direction (${progressSentence}), so today stays focused on high-value execution. ${arbitrationSentence}`,
 success: successSentence
 };
 }
 return {
 priority,
 brief: `Today is about steady execution of ${sessionText}. ${expectationSentence} ${arbitrationSentence}`,
 success: successSentence
 };
};

const deriveBehaviorLoop = ({ dailyCheckins, logs, momentum, salvageLayer }) => {
 const entries = Object.entries(dailyCheckins || {}).sort((a,b) => a[0].localeCompare(b[0]));
 const isSuccess = (c) => c?.status === "completed_as_planned" || c?.status === "completed_modified";
 const isMinViable = (c) => c?.status === "completed_modified" || /min(imum)?\s?(day|dose)/i.test(c?.note || "");
 const isCountable = (c, dateKey) => {
 const eff = resolveEffectiveStatus(c, dateKey);
 return eff !== "not_logged_grace" && eff !== "not_logged";
 };

 let consistencyStreak = 0;
 for (let i = entries.length - 1; i >= 0; i--) {
 const [dateKey, checkin] = entries[i];
 if (!isCountable(checkin, dateKey)) continue; // skip grace-period entries
 if (isSuccess(checkin)) consistencyStreak += 1;
 else break;
 }
 let minViableStreak = 0;
 for (let i = entries.length - 1; i >= 0; i--) {
 if (isMinViable(entries[i][1])) minViableStreak += 1;
 else break;
 }

 const latest = entries[entries.length - 1]?.[1] || null;
 const latestStatus = latest?.status || "not_logged";
 const resolution = !latest || latestStatus === "not_logged"
 ? "New streak starts with one completed day."
 : latestStatus === "completed_as_planned"
 ? "Good day - you hit what mattered."
 : latestStatus === "completed_modified"
 ? "Not perfect, but you kept momentum."
 : latestStatus === "skipped"
 ? "Recovery day logged - next action is to restart with a minimum day."
 : "Day logged - momentum stays alive.";

 const identity = salvageLayer?.active
 ? "You're handling setbacks like an athlete who stays in the game."
 : consistencyStreak >= 5
 ? "You're building consistency identity."
 : ["drifting","falling off"].includes(momentum?.momentumState)
 ? "You're back on track by showing up today."
 : "You're reinforcing a reliable training rhythm.";

 return {
 consistencyStreak,
 minViableStreak,
 resolution,
 identity,
 recoveryTone: latest?.status === "skipped" || consistencyStreak === 0
 };
};

const deriveLongTermMemoryLayer = ({ logs, dailyCheckins, weeklyCheckins, nutritionActualLogs, validationLayer, previousMemory = [] }) => {
 const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const checkins = Object.entries(dailyCheckins || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const weekly = Object.values(weeklyCheckins || {});
 const nutrition = Object.values(nutritionActualLogs || {});
 const last28Logs = entries.slice(-28).map(([,l])=>l || {});
 const last28Checkins = checkins.slice(-28).map(([,c])=>c || {});

 const makeMemory = (key, bucket, label, evidence) => {
 const prev = (previousMemory || []).find(m => m.key === key);
 const toConf = (n) => n >= 5 ? "high" : n >= 3 ? "medium" : n >= 2 ? "low" : null;
 const conf = toConf(evidence);
 if (!conf) return null;
 const lastObserved = Date.now();
 return { key, bucket, label, confidence: conf, evidenceCount: evidence, lastObserved };
 };

 const memories = [
 makeMemory("prefers_simpler_weeks","behavior","stays more consistent when weeks are simpler", last28Checkins.filter(c => c.status === "completed_modified" && !c.passiveAssumed).length),
 makeMemory("drops_after_3_4_days","behavior","often loses momentum after 3-4 hard days", Math.max(0, last28Logs.length - 4 >= 0 ? last28Checkins.filter(c => c.status === "skipped").length : 0)),
 makeMemory("fatigue_sensitive","performance","fatigue rises quickly when load stacks too fast", weekly.filter(w => Number(w.energy || 3) <= 2 || Number(w.stress || 3) >= 4).length),
 makeMemory("home_better_than_travel","environment","home setup yields higher completion than travel weeks", entries.filter(([,l]) => l.location !== "hotel").length >= 6 ? entries.filter(([,l]) => l.location === "hotel").length : 0),
 makeMemory("nutrition_simple_meals","nutrition","adherence is better with simpler repeatable meals", nutrition.filter(n => n.adherence === "low" && ["convenience","travel"].includes(n.issue)).length >= 2 ? 3 : nutrition.filter(n => ["partial", "high"].includes(n.adherence)).length),
 makeMemory("validation_simplify_positive","validation","simplifying weeks tends to improve adherence/momentum", (validationLayer?.recentResolved || []).filter(r => r.strategy === "simplify_density" && r.impact === "positive").length),
 makeMemory("validation_aggressive_negative","validation","aggressive progress blocks can reduce consistency", (validationLayer?.recentResolved || []).filter(r => r.strategy === "aggressive_progression" && r.impact === "negative").length),
 ].filter(Boolean);

 const decayedPrev = (previousMemory || []).map(m => {
 const days = Math.floor((Date.now() - Number(m.lastObserved || Date.now())) / (1000*60*60*24));
 if (days < 21) return m;
 const downgraded = m.confidence === "high" ? "medium" : m.confidence === "medium" ? "low" : "low";
 return { ...m, confidence: downgraded };
 });

 const merged = [...decayedPrev.filter(p => !memories.find(m => m.key === p.key)), ...memories]
 .sort((a,b) => (b.evidenceCount || 0) - (a.evidenceCount || 0))
 .slice(0, 10);
 return merged;
};

const deriveCompoundingCoachMemory = ({ dailyCheckins, weeklyCheckins, personalization, momentum }) => {
 const checkins = Object.values(dailyCheckins || {});
 const weekly = Object.entries(weeklyCheckins || {});
 const injuryHistory = checkins
 .filter(c => (c?.painLevel || "none") !== "none")
 .slice(-8)
 .map(c => `${c?.painLevel || "pain"} (${c?.painArea || personalization?.injuryPainState?.area || "Achilles"})`);
 const recurringBreakdowns = weekly
 .filter(([, w]) => Number(w?.energy || 3) <= 2 || Number(w?.stress || 3) >= 4)
 .slice(-6)
 .map(([weekKey, w]) => ({
 week: weekKey,
 why: Number(w?.stress || 3) >= 4 ? "high stress" : Number(w?.energy || 3) <= 2 ? "low energy" : (w?.blocker || "execution friction"),
 }));
 const preferredMotivationStyle = momentum?.inconsistencyRisk === "high" || momentum?.momentumState === "drifting"
 ? "supportive + minimum-viable action prompts"
 : momentum?.momentumState === "building momentum"
 ? "performance-focused progression cues"
 : "balanced direct coaching";
 const summaryLine = recurringBreakdowns[0]
 ? `Recent breakdown pattern: week ${recurringBreakdowns[0].week} driven by ${recurringBreakdowns[0].why}.`
 : "No major weekly breakdown pattern recently.";
 return {
 injuryHistory: [...new Set(injuryHistory)].slice(0, 5),
 preferredMotivationStyle,
 recurringBreakdowns,
 summaryLine,
 updatedAt: Date.now(),
 };
};

const deriveRecalibrationEngine = ({ currentWeek, progress, momentum, learningLayer, memoryInsights, arbitration }) => {
 const periodicTrigger = currentWeek > 1 && currentWeek % 4 === 0;
 const prolongedInconsistency = ["drifting","falling off"].includes(momentum?.momentumState) && (progress?.adherenceRate || 0) < 60;
 const majorPatternShift = (memoryInsights || []).some(m => ["drops_after_3_4_days","fatigue_sensitive"].includes(m.key) && m.confidence === "high");
 const active = periodicTrigger || prolongedInconsistency || majorPatternShift;
 const reasons = [
 periodicTrigger ? "4-week checkpoint reached" : null,
 prolongedInconsistency ? "consistency has been below target" : null,
 majorPatternShift ? "new high-confidence behavior pattern detected" : null
 ].filter(Boolean);

 const changes = [];
 if (prolongedInconsistency || learningLayer?.adjustmentBias === "simplify") changes.push("reduce weekly density and simplify session flow");
 if (progress?.weightSignal?.includes("holding roughly steady")) changes.push("tighten nutrition structure with simpler repeatable meals");
 if (progress?.runSignal?.includes("improving") && arbitration?.primary?.category === "running") changes.push("slightly progress run quality while maintaining recovery");
 if (progress?.strengthSignal?.includes("deprioritized")) changes.push("rebuild strength with minimum effective progression");
 if (!changes.length) changes.push("hold structure and sharpen execution quality");

 const aggressiveness = prolongedInconsistency ? "lower" : progress?.adherenceRate >= 75 ? "slightly_higher" : "steady";
 const summary = active
 ? "We're recalibrating your plan to keep progress aligned with current reality."
 : "No recalibration needed this week.";
 const why = active
 ? `Trigger: ${reasons.join(" + ")}.`
 : "Current assumptions are still working.";
 const expect = aggressiveness === "lower"
 ? "Expect smoother execution and recovery over the next 1-2 weeks."
 : aggressiveness === "slightly_higher"
 ? "Expect gradual progression with controlled load increases."
 : "Expect steady progress if consistency holds.";

 return { active, reasons, changes: changes.slice(0, 4), aggressiveness, summary, why, expect };
};

const buildSundayWeekInReview = ({ logs = {}, momentum, patterns = [], recalibration, currentWeek }) => {
 const recent = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7);
 if (momentum?.isCalibration) {
 return {
 date: new Date().toISOString().split("T")[0],
 week: currentWeek,
 paragraph: `Week one is live and your routine is still settling in. Win: you are set up and ready. Watch: log the first ${momentum?.minHistoryCount || CALIBRATION_MIN_HISTORY_COUNT} sessions so next week fits you better. Next week: keep the schedule simple and keep showing up.`,
 };
 }
 const consistency = momentum?.completionRate >= 0.75
 ? "Consistency held strong this week."
 : momentum?.completionRate >= 0.55
 ? "Consistency was mixed but serviceable."
 : "Consistency dipped and needs a reset next week.";
 const winLog = recent.find(([, l]) => /progress|strong|solid|better|completed/i.test(`${l?.notes || ""} ${l?.type || ""}`));
 const win = winLog
 ? `Win: ${winLog[1]?.type || "a key session"} on ${winLog[0]}.`
 : `Win: you still logged ${recent.length} training touchpoint${recent.length === 1 ? "" : "s"} this week.`;
 const watch = `Watch: ${patterns?.[0] || "recovery drift when stress rises."}`;
 const nextChange = `Next week change: ${(recalibration?.changes || [])[0] || "keep structure simple and protect key sessions."}`;
 return {
 date: new Date().toISOString().split("T")[0],
 week: currentWeek,
 paragraph: `${consistency} ${win} ${watch} ${nextChange}`,
 };
};

const deriveStrengthLayer = ({ goals, momentum, personalization, logs }) => {
 const strengthGoal = (goals || []).find(g => g.active && g.category === "strength");
 const equipmentAccess = resolvePlanningEquipmentAccess(personalization);
 const benchEstimate = parseInt((strengthGoal?.measurableTarget || "").match(/\d+/)?.[0] || "185");
 const trainingMax = Math.round(benchEstimate * 0.9); // conservative re-entry
 const arbitration = arbitrateGoals({ goals, momentum, personalization });
 let focus = "maintain";
 if (arbitration.primary?.category === "strength" && momentum.coachMode !== "protect mode") focus = "push";
 if (["drifting","falling off"].includes(momentum.momentumState) || arbitration.deprioritized.includes(strengthGoal?.name)) focus = "deprioritize";

 const recentBenchHits = Object.values(logs || {}).filter(l => /bench/i.test((l.type || "") + " " + (l.notes || ""))).length;
 const progression = focus === "push"
 ? [`Bench 4x6 @ ~${Math.round(trainingMax*0.72)} lbs`, "If bar speed is solid, add 5 lbs next week", "Incline DB 3x10 + row 3x10 + triceps 3x12"]
 : focus === "maintain"
 ? [`Bench 2x5 @ ~${Math.round(trainingMax*0.65)} lbs`, "Keep 1 short upper hypertrophy block", "No grind reps while run load is high"]
 : ["Minimal dose: push-up ladder 3 rounds", "DB or band press 3x12", "One pull movement + shoulder health work"];

 const lowerBody = ["Running weeks: 1 moderate lower session only", "Hip hinge + split squat + calf/achilles support", "Avoid heavy eccentric leg volume before key runs"];
 const substitutions = equipmentAccess === "full_gym" ? ["Barbell bench", "Incline DB", "Cable fly"] :
 equipmentAccess === "basic_gym" ? ["DB flat press", "Machine press", "Push-up tempo sets"] :
 equipmentAccess === "none" ? ["Push-up mechanical drops", "Backpack floor press", "Bench dip + pike push-up"] :
 ["Band chest press", "Tempo push-ups", "Single-arm rows with available load"];
 const tradeoff = focus !== "push" ? "Strength progression is intentionally slowed to protect the top priorities and consistency." : "Strength is currently being pushed while endurance stays active with less emphasis.";
 return { focus, benchEstimate, trainingMax, recentBenchHits, progression, lowerBody, substitutions, tradeoff };
};

const deriveStrengthProgressTracker = ({ logs = {}, goals = [], strengthLayer = {} }) => {
 const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const activeStrengthGoal = (goals || []).find(g => g.active && g.category === "strength");
 const targetFromGoal = parseInt((activeStrengthGoal?.measurableTarget || "").match(/\d+/)?.[0] || "0", 10) || 0;
 const liftDefs = [
 { key: "bench", label: "Bench Press", keywords: /bench|press/i, baseCurrent: strengthLayer.trainingMax || 165, goal: targetFromGoal || Math.round((strengthLayer.trainingMax || 165) + 25) },
 { key: "squat", label: "Squat", keywords: /squat/i, baseCurrent: Math.round((strengthLayer.trainingMax || 165) * 1.35), goal: Math.round((strengthLayer.trainingMax || 165) * 1.5) },
 { key: "deadlift", label: "Deadlift", keywords: /deadlift|hinge/i, baseCurrent: Math.round((strengthLayer.trainingMax || 165) * 1.65), goal: Math.round((strengthLayer.trainingMax || 165) * 1.85) },
 { key: "ohp", label: "Overhead Press", keywords: /overhead|ohp|shoulder press/i, baseCurrent: Math.round((strengthLayer.trainingMax || 165) * 0.6), goal: Math.round((strengthLayer.trainingMax || 165) * 0.72) },
 ];
 return liftDefs.map((lift) => {
 const sessions = entries
 .flatMap(([date, log]) => {
 const canonicalSessions = getExercisePerformanceRecordsForLog(log || {}, { dateKey: date })
 .filter((record) => record?.liftKey === lift.key || lift.keywords.test(record?.exercise || ""))
 .map((record) => ({
 date,
 load: getRecordActualWeight(record) ?? getRecordPrescribedWeight(record),
 note: record?.exercise || log?.notes || log?.type || "Strength session",
 }));
 if (canonicalSessions.length > 0) return canonicalSessions;
 if (!lift.keywords.test(`${log?.type || ""} ${log?.notes || ""}`)) return [];
 const text = `${log?.type || ""} ${log?.notes || ""}`;
 const load = parseInt((text.match(/(\d{2,3})\s?(lb|lbs)?/i) || [])[1] || "0", 10) || null;
 return [{ date, load, note: log?.notes || log?.type || "Strength session" }];
 })
 .filter((session) => session?.load || session?.note)
 .slice(-4);
 const current = sessions[sessions.length - 1]?.load || lift.baseCurrent;
 const goal = Math.max(lift.goal, current + 5);
 const delta = Math.max(0, goal - current);
 const projectedWeeks = Math.max(2, Math.ceil(delta / 5));
 return {
 ...lift,
 current,
 goal,
 projected: `${projectedWeeks}-${projectedWeeks + 2} weeks`,
 sessions,
 };
 });
};

const deriveProgressEngine = ({ logs, bodyweights, momentum, strengthLayer }) => {
 const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const last14Logs = entries.slice(-14).map(([,l])=>l);
 const prev14Logs = entries.slice(-28, -14).map(([,l])=>l);
 const thisWeekCount = entries.filter(([d]) => ((Date.now()-new Date(d+"T12:00:00").getTime())/(1000*60*60*24)) <= 7).length;
 const prevWeekCount = entries.filter(([d]) => {
 const dd = ((Date.now()-new Date(d+"T12:00:00").getTime())/(1000*60*60*24));
 return dd > 7 && dd <= 14;
 }).length;
 const adherenceRate = Math.round(Math.min(100, (last14Logs.length / 10) * 100));
 const streak = (() => {
 let s = 0;
 for (let i = entries.length - 1; i >= 0; i--) {
 const diff = Math.floor((Date.now() - new Date(entries[i][0]+"T12:00:00").getTime())/(1000*60*60*24));
 if (diff <= s + 1) s += 1; else break;
 }
 return Math.min(s, 14);
 })();

 const bwRecent = (bodyweights || []).slice(-21);
 const bwWeeklyDelta = bwRecent.length >= 2 ? (bwRecent[bwRecent.length-1].w - bwRecent[0].w) / Math.max(1, Math.round(bwRecent.length/7)) : 0;
 const weightTrend = bwRecent.length < 2 ? "insufficient" : bwWeeklyDelta <= -0.3 ? "down" : bwWeeklyDelta >= 0.3 ? "up" : "flat";
 const weightSignal = weightTrend === "down" ? `weight trending down ~${Math.abs(bwWeeklyDelta).toFixed(1)} lb/week` : weightTrend === "up" ? `weight trending up ~${Math.abs(bwWeeklyDelta).toFixed(1)} lb/week` : "weight holding roughly steady";

 const runPaces = last14Logs.filter(l => /run|tempo|interval|long/i.test(l.type || "") && l.pace && /\d+:\d+/.test(l.pace)).map(l => {
 const [m,s] = l.pace.split(":").map(Number); return m + (s/60);
 });
 const prevRunPaces = prev14Logs.filter(l => /run|tempo|interval|long/i.test(l.type || "") && l.pace && /\d+:\d+/.test(l.pace)).map(l => {
 const [m,s] = l.pace.split(":").map(Number); return m + (s/60);
 });
 const runAvg = runPaces.length ? runPaces.reduce((a,b)=>a+b,0)/runPaces.length : null;
 const prevRunAvg = prevRunPaces.length ? prevRunPaces.reduce((a,b)=>a+b,0)/prevRunPaces.length : null;
 const runTrend = runAvg && prevRunAvg ? (runAvg < prevRunAvg - 0.15 ? "improving" : runAvg > prevRunAvg + 0.15 ? "declining" : "steady") : "insufficient";
 const runSignal = runTrend === "improving" ? "running endurance/performance improving" : runTrend === "declining" ? "running performance slightly down; simplify and recover" : runTrend === "steady" ? "running performance holding steady" : "running trend still forming";

 const strengthSignal = strengthLayer.focus === "push" ? `estimated bench TM pushing (${strengthLayer.trainingMax})` : strengthLayer.focus === "maintain" ? `strength holding steady (TM ${strengthLayer.trainingMax})` : "strength temporarily deprioritized to protect consistency";
 const consistencySignal = thisWeekCount > prevWeekCount ? "consistency improving vs last week" : thisWeekCount < prevWeekCount ? "consistency softer vs last week" : "consistency steady vs last week";
 const warnings = [];
 if (weightTrend === "flat") warnings.push("weight trend is flat");
 if (runTrend === "declining") warnings.push("run performance trend is down");
 if (adherenceRate < 55) warnings.push("adherence is low");

 const highlights = [weightSignal, runSignal, strengthSignal, consistencySignal].slice(0, 4);
 return { highlights, warnings, weightSignal, runSignal, strengthSignal, streak, adherenceRate, consistencySignal };
};

const deriveExpectationEngine = ({ progress, momentum, arbitration }) => {
 const adherenceBand = progress?.adherenceRate >= 75 ? "high" : progress?.adherenceRate >= 55 ? "moderate" : "low";
 const weightWeekly = (() => {
 const m = /~([0-9.]+) lb\/week/.exec(progress?.weightSignal || "");
 return m ? parseFloat(m[1]) : null;
 })();
 const monthWeight = weightWeekly ? Math.max(0.8, Math.min(4.5, weightWeekly * 4)) : null;
 const weightExpectation = progress?.weightSignal?.includes("down")
 ? `At this pace, you'll likely drop ~${Math.round(monthWeight)}-${Math.round(monthWeight + 1)} lbs over the next month if consistency holds.`
 : progress?.weightSignal?.includes("steady")
 ? "Scale trend should stay relatively stable over the next month if intake and execution stay similar."
 : "Bodyweight trend may drift up if this pattern continues; tightening consistency should correct it.";
 const runExpectation = progress?.runSignal?.includes("improving")
 ? "Running capacity should improve steadily over the next few weeks if we keep this structure."
 : progress?.runSignal?.includes("holding steady")
 ? "Running performance should keep inching forward if consistency holds."
 : progress?.runSignal?.includes("down")
 ? "Running performance may stay flat or dip short-term unless we simplify load and recover better."
 : "Running forecast is still forming; 2-3 consistent weeks will make direction clearer.";
 const strengthExpectation = progress?.strengthSignal?.includes("pushing")
 ? "You're on track to rebuild strength over the next few weeks if we maintain current structure."
 : "Strength should hold and gradually rebuild if consistency and recovery stay in place.";
 const expectationStrength = adherenceBand === "high" && momentum?.momentumState !== "falling off"
 ? "slightly_positive"
 : adherenceBand === "low" || ["drifting","falling off"].includes(momentum?.momentumState)
 ? "conservative"
 : "neutral";
 const nextWindow = expectationStrength === "slightly_positive"
 ? "Near-term outlook: cautiously positive."
 : expectationStrength === "conservative"
 ? "Near-term outlook: progress is still possible, but slower unless consistency improves."
 : "Near-term outlook: steady progress if routines remain stable.";
 const motivationLine = expectationStrength === "conservative"
 ? "This is still worth continuing - even small consistent weeks re-accelerate progress."
 : "This is worth continuing - current habits are creating real momentum.";
 const conditionLine = expectationStrength === "conservative"
 ? "Condition: outcomes improve meaningfully if consistency and logging tighten."
 : "Condition: outcomes hold if consistency, structure, and current intake stay similar.";
 const coachLine = `${nextWindow} ${motivationLine} ${conditionLine}`;
 return { weightExpectation, runExpectation, strengthExpectation, expectationStrength, nextWindow, motivationLine, conditionLine, coachLine };
};

const parseSessionMinutes = (log) => {
 const rt = String(log?.runTime || "").trim();
 if (/^\d+$/.test(rt)) return Number(rt);
 if (/^\d+:\d{2}$/.test(rt)) {
 const [m, s] = rt.split(":").map(Number);
 return m + Math.round((s || 0) / 60);
 }
 const txt = `${log?.type || ""} ${log?.notes || ""}`;
 const m = txt.match(/(\d+)\s*min/i);
 return m ? Number(m[1]) : null;
};

const derivePersonalOptimizationLayer = ({ logs, dailyCheckins, nutritionActualLogs, coachActions, validationLayer }) => {
 const logEntries = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
 const last42 = logEntries.slice(-42).map(([, l]) => l || {});
 const checkinEntries = Object.entries(dailyCheckins || {}).sort((a, b) => a[0].localeCompare(b[0]));
 const last42Checkins = checkinEntries.slice(-42).map(([, c]) => c || {});
 const weeklyCompleted = [];
 for (let i = 0; i < last42Checkins.length; i += 7) {
 const week = last42Checkins.slice(i, i + 7);
 if (!week.length) continue;
 weeklyCompleted.push(week.filter(c => ["completed_as_planned", "completed_modified"].includes(c.status) && !c.passiveAssumed).length);
 }
 const avgWeeklySessions = weeklyCompleted.length ? weeklyCompleted.reduce((s, n) => s + n, 0) / weeklyCompleted.length : 3;
 const optimalFrequency = avgWeeklySessions >= 4.2 ? "4-5 sessions/week" : avgWeeklySessions >= 3 ? "3-4 sessions/week" : "2-3 sessions/week";

 const durations = last42.map(parseSessionMinutes).filter(Boolean);
 const avgMinutes = durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : 35;
 const optimalSessionLength = avgMinutes <= 35 ? "25-40 min" : avgMinutes <= 50 ? "35-50 min" : "45-60 min";

 const recentNutrition = Object.values(nutritionActualLogs || {}).slice(-21);
 const hunger = recentNutrition.filter(n => n.deviationKind === "under_fueled" || n.issue === "hunger").length;
 const offTrack = recentNutrition.filter(n => n.adherence === "low").length;
 const optimalDeficitRange = hunger >= 2 || offTrack >= 4 ? "minimal deficit (0-150 kcal)" : "moderate deficit (120-250 kcal)";

 const modifications = last42Checkins.filter(c => c.status === "completed_modified").length;
 const skips = last42Checkins.filter(c => c.status === "skipped").length;
 const optimalComplexity = (modifications + skips) >= 8 ? "low complexity" : "moderate complexity";

 const experimentActions = (coachActions || []).filter(a => a.source === "optimization_experiment");
 const lastExperimentTs = experimentActions[0]?.ts || 0;
 const cooldownDays = Math.floor((Date.now() - Number(lastExperimentTs || 0)) / 86400000);
 const canExperiment = cooldownDays >= 10 && last42Checkins.length >= 12;
 const winningSignals = (validationLayer?.recentResolved || []).filter(r => r.impact === "positive").length;
 const losingSignals = (validationLayer?.recentResolved || []).filter(r => r.impact === "negative").length;
 const reinforcementBias = winningSignals > losingSignals ? "reinforce_winners" : losingSignals > winningSignals ? "reduce_losers" : "hold";

 const pendingExperiment = canExperiment ? {
 type: avgWeeklySessions >= 4 ? "volume_minus_small" : "volume_plus_small",
 deltaPct: 6,
 note: avgWeeklySessions >= 4 ? "Test slightly lower volume for better consistency." : "Test slightly higher volume if momentum is stable.",
 } : null;

 const coachLine = `You seem to perform best with ${optimalFrequency} and ${optimalSessionLength} sessions.`;
 return {
 optimalZones: { optimalFrequency, optimalSessionLength, optimalDeficitRange, optimalComplexity },
 experimentation: { canExperiment, pendingExperiment, cooldownDays },
 reinforcementBias,
 coachLine,
 confidence: last42Checkins.length >= 14 ? "medium" : "low",
 };
};

const deriveLearningLayer = ({ dailyCheckins, logs, weeklyCheckins, momentum, personalization, validationLayer, optimizationLayer }) => {
 const checkins = Object.entries(dailyCheckins || {}).sort((a,b)=>a[0].localeCompare(b[0]));
 const last28 = checkins.slice(-28).map(([,v]) => v || {});
 const total = Math.max(1, last28.length);
 const skipped = last28.filter(c => c.status === "skipped").length;
 const modified = last28.filter(c => c.status === "completed_modified").length;
 const harder = last28.filter(c => c.sessionFeel === "harder_than_expected").length;
 const easier = last28.filter(c => c.sessionFeel === "easier_than_expected").length;
 const timeBlockers = last28.filter(c => c.blocker === "time").length;
 const equipBlockers = last28.filter(c => c.blocker === "no_equipment").length;
 const travelBlockers = last28.filter(c => c.blocker === "schedule_travel").length;
 const skippedByTravel = last28.filter(c => c.status === "skipped" && ["schedule_travel","no_equipment"].includes(c.blocker)).length;
 const logsArr = Object.values(logs || {});
 const strengthMods = logsArr.filter(l => /strength/i.test(l.type || "") && l.checkin?.status === "completed_modified").length;
 const runMods = logsArr.filter(l => /run|tempo|interval|long/i.test(l.type || "") && l.checkin?.status === "completed_modified").length;
 const weekly = Object.values(weeklyCheckins || {});
 const lowEnergyWeeks = weekly.filter(w => Number(w.energy || 3) <= 2).length;
 const highStressWeeks = weekly.filter(w => Number(w.stress || 3) >= 4).length;
 const lowConfidenceWeeks = weekly.filter(w => Number(w.confidence || 3) <= 2).length;

 const toConfidence = (count) => count >= 4 ? "high" : count >= 2 ? "medium" : "low";
 const observations = [];
 if (timeBlockers >= 1) observations.push({ key:"time", count: timeBlockers, msg:"You tend to skip when sessions feel too long/busy; shorter sessions improve follow-through.", confidence: toConfidence(timeBlockers), impact: "reduce_session_length" });
 if (harder >= 1) observations.push({ key:"hard", count: harder, msg:"Sessions often feel harder than expected; progression should be less aggressive.", confidence: toConfidence(harder), impact: "lower_aggressiveness" });
 if ((equipBlockers + travelBlockers) >= 1) observations.push({ key:"env", count: equipBlockers + travelBlockers, msg:"When gym access disappears, adherence drops; switch to simpler environment assumptions faster.", confidence: toConfidence(equipBlockers + travelBlockers), impact: "simplify_environment" });
 if (strengthMods > runMods) observations.push({ key:"strength_mods", count: strengthMods - runMods + 1, msg:"You modify strength sessions more than runs; keep strength sessions concise and practical.", confidence: toConfidence(strengthMods - runMods + 1), impact: "strength_simplify" });
 if (skippedByTravel >= 1) observations.push({ key:"travel_falloff", count: skippedByTravel, msg:"You often fall off after travel/missed days; reduce weekly density during chaotic periods.", confidence: toConfidence(skippedByTravel), impact: "reduce_week_density" });
 if (easier >= 2 && skipped <= 1) observations.push({ key:"ready", count: easier, msg:"You've handled this workload well before; modest progression is usually tolerated.", confidence: toConfidence(easier), impact: "modest_progress" });
 if (highStressWeeks + lowEnergyWeeks >= 1) observations.push({ key:"stress", count: highStressWeeks + lowEnergyWeeks, msg:"High-stress/low-energy weeks reduce execution; simplify sooner.", confidence: toConfidence(highStressWeeks + lowEnergyWeeks), impact: "simplify_week" });
 const ranked = observations.sort((a,b) => b.count - a.count);
 const topObservations = ranked.slice(0, 3);
 const mediumHigh = topObservations.filter(o => ["medium","high"].includes(o.confidence));
 const adaptation = {
 active: mediumHigh.length > 0,
 reasons: mediumHigh.map(o => `${o.msg} (${o.confidence})`),
 reduceDensity: mediumHigh.some(o => ["reduce_week_density","simplify_week","reduce_session_length"].includes(o.impact)),
 lowerAggressiveness: mediumHigh.some(o => ["lower_aggressiveness","reduce_week_density"].includes(o.impact)),
 simplifyStrength: mediumHigh.some(o => o.impact === "strength_simplify"),
 environmentFastSwitch: mediumHigh.some(o => o.impact === "simplify_environment"),
 pushSlightly: mediumHigh.some(o => o.impact === "modest_progress") && !mediumHigh.some(o => o.impact === "lower_aggressiveness"),
 validationBias: validationLayer?.strategyAdjustments || {},
 optimizationBias: optimizationLayer?.reinforcementBias || "hold",
 };
 const validationSimplifyPenalty = Object.values(validationLayer?.strategyAdjustments || {}).filter(v => v === "reduce").length;
 const validationProgressBoost = Object.values(validationLayer?.strategyAdjustments || {}).filter(v => v === "strengthen").length;
 const optimizationReduce = optimizationLayer?.reinforcementBias === "reduce_losers";
 const optimizationReinforce = optimizationLayer?.reinforcementBias === "reinforce_winners";
 const adjustmentBias = harder >= 3 || skipped >= 3 || lowConfidenceWeeks >= 2 || optimizationReduce
 ? "simplify"
 : (easier >= 4 && modified <= 1 && skipped <= 1) || validationProgressBoost >= 2 || optimizationReinforce
 ? "progress"
 : validationSimplifyPenalty >= 1
 ? "simplify"
 : "hold";
 const explanation = topObservations.length
 ? `Based on ${last28.length} recent check-ins: ${topObservations.map(o => o.msg).join(" ")}`
 : validationLayer?.summary || "Learning layer needs a few more quick check-ins before giving strong guidance.";

 return {
 stats: { total, skipped, modified, harder, easier, timeBlockers, equipBlockers, travelBlockers },
 weeklySignals: { lowEnergyWeeks, highStressWeeks, lowConfidenceWeeks },
 topObservations,
 adaptation,
 adjustmentBias,
 explanation,
 };
};

const deriveSalvageLayer = ({ logs, momentum, dailyCheckins, weeklyCheckins, personalization, learningLayer }) => {
 const recentLogs = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-10);
 const recentCheckins = Object.values(dailyCheckins || {}).slice(-10);
 const recentWeekly = Object.values(weeklyCheckins || {}).slice(-2);
 const missedCount = recentCheckins.filter(c => c.status === "skipped").length;
 const timeChaosBlockers = recentCheckins.filter(c => ["time","schedule_travel"].includes(c.blocker)).length + recentLogs.filter(([,l]) => /(chaos|busy|no time|overwhelmed|travel)/i.test(l.notes || "")).length;
 const travelLowAdherence = ["travel","limited gym","no equipment"].includes(personalization.travelState.environmentMode || "") && (missedCount >= 2 || momentum.momentumState !== "stable");
 const lowEnergyConfidence = recentWeekly.some(w => Number(w.energy || 3) <= 2 || Number(w.confidence || 3) <= 2);
 const drifting = ["drifting","falling off"].includes(momentum.momentumState);
 const repeatedSkipSignals = missedCount >= 2;
 const triggerReasons = [];
 if (repeatedSkipSignals) triggerReasons.push("multiple skipped sessions");
 if (drifting) triggerReasons.push(`momentum is ${momentum.momentumState}`);
 if (timeChaosBlockers >= 3) triggerReasons.push("time/chaos blockers are repeating");
 if (travelLowAdherence) triggerReasons.push("travel + low adherence");
 if (lowEnergyConfidence) triggerReasons.push("weekly check-ins show low energy/confidence");
 const active = triggerReasons.length >= 2;

 const compressedPlan = {
 keep: [
 "1 key run OR long run (pick the most realistic one this week)",
 "1 strength session (full-body, 35-45 min)",
 "1 optional conditioning/recovery session (easy run, walk, or mobility)",
 ],
 remove: [
 "Extra accessory volume",
 "Second-tier intensity sessions",
 "Complex day-to-day meal decisions",
 ],
 success: "Win the week by completing 2 core sessions + 1 optional recovery touchpoint.",
 nutrition: "Use default repeatable meals for 3 days: protein anchor + easy carbs around training.",
 };

 const exitReady = !active && ["stable","building momentum"].includes(momentum.momentumState) && missedCount <= 1;
 const coachMessage = active
 ? "Week has been compressed to preserve momentum. We're prioritizing consistency over perfection."
 : exitReady
 ? "Salvage mode can be exited: adherence and momentum have recovered."
 : "Standard mode active.";

 return { active, triggerReasons, compressedPlan, exitReady, coachMessage };
};

const getLastDateKey = (obj = {}) => {
 const keys = Object.keys(obj || {}).sort((a, b) => a.localeCompare(b));
 return keys.length ? keys[keys.length - 1] : null;
};

const diffDaysFromKey = (dateKey) => {
 if (!dateKey) return 999;
 const ms = new Date(`${dateKey}T12:00:00`).getTime();
 if (Number.isNaN(ms)) return 999;
 return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
};

const deriveFailureModeHardening = ({ logs, dailyCheckins, bodyweights, coachPlanAdjustments, coachActions, salvageLayer }) => {
 const lastLogGap = diffDaysFromKey(getLastDateKey(logs));
 const lastCheckinGap = diffDaysFromKey(getLastDateKey(dailyCheckins));
 const lastBWDate = bodyweights?.length ? bodyweights[bodyweights.length - 1]?.date : null;
 const lastBWGap = diffDaysFromKey(lastBWDate);
 const engagementGapDays = Math.min(lastLogGap, lastCheckinGap);
 const isLowEngagement = engagementGapDays >= 5;
 const isReEntry = engagementGapDays >= 10;
 const recentOverrides = Object.keys(coachPlanAdjustments?.dayOverrides || {})
 .filter(k => diffDaysFromKey(k) <= 14).length;
 const recentSalvageActivations = (coachActions || [])
 .filter(a => a.type === "ACTIVATE_SALVAGE" && (Date.now() - Number(a.ts || 0)) <= 21 * 86400000).length;
 const chaotic = salvageLayer?.active || recentOverrides >= 3 || recentSalvageActivations >= 2;
 const staleData = Math.min(lastLogGap, lastBWGap) >= 10 || (lastLogGap >= 7 && lastBWGap >= 21);
 const mode = isReEntry ? "re_entry" : (chaotic ? "chaotic" : (isLowEngagement ? "low_engagement" : "normal"));
 const planningHorizonDays = chaotic ? 3 : isLowEngagement ? 4 : 7;
 const uncertainty = staleData ? "high" : isLowEngagement ? "medium" : "low";
 const minimumViableStructure = {
 sessions: ["1 key run/walk", "1 strength minimum session (20-35 min)", "1 optional recovery touchpoint"],
 expectation: "Aim for consistency touchpoints, not full-volume perfection."
 };
 const coachBehavior = {
 tone: "no-guilt-forward-looking",
 primaryLine: isReEntry
 ? "Welcome back - we reset from today and rebuild momentum with a re-entry week."
 : chaotic
 ? "Keeping this week simple to protect your streak."
 : isLowEngagement
 ? "Low engagement detected - only essentials for now; keep it light and achievable."
 : "Standard coaching mode.",
 };
 return { mode, engagementGapDays, planningHorizonDays, uncertainty, staleData, chaotic, isLowEngagement, isReEntry, minimumViableStructure, coachBehavior };
};

// MAIN APP
const cloneStructuredValue = (value) => {
 if (value == null) return value;
 try {
 return JSON.parse(JSON.stringify(value));
 } catch {
 return value;
 }
};


const buildLegacyPlanSnapshot = (plannedDayEntry = null) => {
 const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayEntry) || plannedDayEntry;
 if (!plannedDayRecord?.dateKey) return null;
 return {
 dateKey: plannedDayRecord.dateKey,
 baseLabel: plannedDayRecord?.base?.training?.label || "",
 resolvedLabel: plannedDayRecord?.resolved?.training?.label || "",
 mode: plannedDayRecord?.decision?.mode || "",
 modeLabel: plannedDayRecord?.decision?.modeLabel || "",
 modifiedFromBase: Boolean(plannedDayRecord?.decision?.modifiedFromBase),
 };
};

const resolvePlannedDayHistoryEntry = ({
 dateKey = "",
 existingEntry = null,
 todayKey = "",
 todayPlannedDayRecord = null,
 legacySnapshot = null,
 allowScheduleFallback = true,
 planStartDate = "",
} = {}) => {
 // LEGACY_COMPAT: older logs and archive-era reviews still need prescribed-day
 // recovery from legacy snapshots and template-derived schedule history.
 return resolveLegacyPlannedDayHistoryEntry({
 dateKey,
 existingEntry,
 todayKey,
 todayPlannedDayRecord,
 legacySnapshot,
 allowScheduleFallback,
 planStartDate,
 fallbackStartDate: PROFILE.startDate,
 resolvePlanWeekNumberForDateKey,
 resolveScheduleWorkout: getTodayWorkout,
 validateInvariant: validatePrescribedDayHistoryInvariant,
 });
};

const getNutritionOverrideDayType = (override = null) => String(override?.dayType || override || "").trim();

const buildAdjustmentProvenance = ({
 actor = PROVENANCE_ACTORS.user,
 trigger = "manual_override",
 mutationType = "state_update",
 revisionReason = "",
 sourceInputs = [],
 confidence = "high",
 timestamp = Date.now(),
 details = {},
} = {}) => buildProvenanceEvent({
 actor,
 trigger,
 mutationType,
 revisionReason,
 sourceInputs,
 confidence,
 timestamp,
 details,
});

export default function TrainerDashboard() {
 const [tab, setTab] = useState(() => {
 if (typeof window === "undefined") return 0;
 const requestedTab = new URLSearchParams(window.location.search).get("tab");
 return requestedTab === "settings" ? 5 : 0;
 });
 const [settingsFocus, setSettingsFocus] = useState("");
 const [logs, setLogs] = useState({});
 const [bodyweights, setBodyweights] = useState([]);
 const [loading, setLoading] = useState(true);
 // Dynamic plan state
 const [paceOverrides, setPaceOverrides] = useState({}); // { "BASE": { easy: "...", ... }, ... }
 const [weekNotes, setWeekNotes] = useState({}); // { 5: "Makeup long run added", ... }
 const [planAlerts, setPlanAlerts] = useState([]); // [{ id, msg, type, ts }]
 const [personalization, setPersonalization] = useState(DEFAULT_PERSONALIZATION);
 const [goals, setGoals] = useState(DEFAULT_MULTI_GOALS);
 const [coachActions, setCoachActions] = useState([]);
 const [coachPlanAdjustments, setCoachPlanAdjustments] = useState(DEFAULT_COACH_PLAN_ADJUSTMENTS);
 const [dailyCheckins, setDailyCheckins] = useState({});
 const [plannedDayRecords, setPlannedDayRecords] = useState({});
 const [planWeekRecords, setPlanWeekRecords] = useState({});
 const [weeklyCheckins, setWeeklyCheckins] = useState({});
 const [nutritionFavorites, setNutritionFavorites] = useState(DEFAULT_NUTRITION_FAVORITES);
 const [nutritionActualLogs, setNutritionActualLogs] = useState({});
 const [analyzing, setAnalyzing] = useState(false);
 const [storageStatus, setStorageStatus] = useState(() => buildStorageStatus({ mode: "syncing", label: "SYNCING", reason: STORAGE_STATUS_REASONS.unknown, detail: "Cloud sync is initializing." }));
 const [syncRuntime, setSyncRuntime] = useState(() => createInitialSyncRuntimeState({
 isOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
 now: Date.now(),
 }));
 const [syncDiagnostics, setSyncDiagnostics] = useState(() => createInitialSyncDiagnosticsState({
 now: Date.now(),
 }));
 const applyStorageStatus = (nextStatus = null) => {
 if (!nextStatus) return;
 setStorageStatus((currentStatus) => (
 sameStorageStatus(currentStatus, nextStatus)
 ? currentStatus
 : nextStatus
 ));
 };
 const dispatchSyncRuntime = (event = {}) => {
 setSyncRuntime((currentState) => reduceSyncRuntimeState(currentState, event));
 };
 const recordSyncDiagnostic = useCallback((event = {}) => {
 if (!event?.type) return;
 setSyncDiagnostics((currentState) => reduceSyncDiagnosticsState(currentState, event));
 }, []);
 const [lastSaved, setLastSaved] = useState(null);
 const [dismissedTriggers, setDismissedTriggers] = useState([]);
 const [authSession, setAuthSession] = useState(null);
 const [authMode, setAuthMode] = useState("signin");
 const [authEmail, setAuthEmail] = useState("");
 const [authPassword, setAuthPassword] = useState("");
 const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
 const [authDisplayName, setAuthDisplayName] = useState("");
 const [authUnits, setAuthUnits] = useState("imperial");
 const [authTimezone, setAuthTimezone] = useState(DEFAULT_TIMEZONE);
 const [authError, setAuthError] = useState("");
 const [authNotice, setAuthNotice] = useState("");
 const [authPendingConfirmationEmail, setAuthPendingConfirmationEmail] = useState("");
 const [authRecoverySession, setAuthRecoverySession] = useState(null);
 const [authPasswordResetBusy, setAuthPasswordResetBusy] = useState(false);
 const [authConfirmationResendBusy, setAuthConfirmationResendBusy] = useState(false);
 const [authRecoveryBusy, setAuthRecoveryBusy] = useState(false);
 const [authInitializing, setAuthInitializing] = useState(true);
 const [startupLocalResumeAvailable, setStartupLocalResumeAvailable] = useState(false);
 const [startupUsableLocalResumeAvailable, setStartupUsableLocalResumeAvailable] = useState(false);
 const [startupLocalResumeAccepted, setStartupLocalResumeAccepted] = useState(false);
 const realtimeClientRef = useRef(null);
 const realtimeChannelRef = useRef(null);
 const realtimeResyncTimerRef = useRef(null);
 const realtimeInterruptedRef = useRef(false);
const lastLocalMutationAtRef = useRef(0);
const skipNextGoalsPersistRef = useRef(false);
const suspendLocalPersistenceRef = useRef(false);
const authSessionRef = useRef(null);
const authSessionUserIdRef = useRef("");
const authEmailInputRef = useRef(null);
const authPasswordInputRef = useRef(null);
const authPasswordConfirmInputRef = useRef(null);
const authDisplayNameInputRef = useRef(null);
const sbLoadRef = useRef(null);
const persistExecutorRef = useRef(null);
const persistQueueRef = useRef(null);
 const logDiagRef = useRef(null);
 const historyRelabelAppliedRef = useRef(false);
 const bootPersistenceReadyRef = useRef(false);
 const bootInteractiveRecordedRef = useRef(false);
const [startFreshConfirmOpen, setStartFreshConfirmOpen] = useState(false);
const [showAppleHealthFirstLaunch, setShowAppleHealthFirstLaunch] = useState(false);
const DEBUG_MODE = typeof window !== "undefined" && safeStorageGet(localStorage, "trainer_debug", "0") === "1";
const TRUSTED_DEBUG_MODE = typeof window !== "undefined" && canExposeInternalOperatorTools({ debugMode: DEBUG_MODE, hostname: window.location.hostname }) === true;
const APPLE_HEALTH_SUPPORTED_MODE = typeof window !== "undefined" && safeStorageGet(localStorage, "apple_health_supported", "0") === "1";
if (!persistQueueRef.current) {
 persistQueueRef.current = createPersistQueueController({
 execute: async (request) => {
 if (typeof persistExecutorRef.current !== "function") {
 return {
 ok: false,
 skipped: true,
 stale: true,
 reason: "persist_executor_unavailable",
 };
 }
 return persistExecutorRef.current(request);
 },
 });
}
 const logDiag = (...args) => { if (DEBUG_MODE) console.log("[trainer-debug]", ...args); };
 const recordBootMetric = useCallback((payload = {}) => {
 if (typeof window === "undefined") return;
 const current = window.__FORMA_BOOT_METRICS__ || {};
 window.__FORMA_BOOT_METRICS__ = {
 ...current,
 ...payload,
 lastUpdatedAt: Math.round(typeof performance !== "undefined" ? performance.now() : 0),
 };
 }, []);
 const frictionAnalytics = useMemo(() => createFrictionAnalytics(), []);
 const adaptiveLearningStore = useMemo(() => createAdaptiveLearningStore(), []);
 const [analyticsVersion, setAnalyticsVersion] = useState(0);

 useEffect(() => {
 if (loading || authInitializing || bootInteractiveRecordedRef.current) return;
 const finalizeBoot = () => {
 if (bootInteractiveRecordedRef.current) return;
 bootInteractiveRecordedRef.current = true;
 recordBootMetric({
 interactiveAt: Math.round(typeof performance !== "undefined" ? performance.now() : 0),
 initialSurface: authSession?.user?.id
 ? "signed_in"
 : personalization?.profile?.onboardingComplete
 ? "app_shell"
 : "auth_or_onboarding",
 currentTab: tab,
 serviceWorkerControlled: typeof navigator !== "undefined" ? Boolean(navigator.serviceWorker?.controller) : false,
 });
 };
 if (typeof requestAnimationFrame === "function") {
 requestAnimationFrame(() => setTimeout(finalizeBoot, 0));
 return;
 }
 setTimeout(finalizeBoot, 0);
 }, [authInitializing, authSession?.user?.id, loading, personalization?.profile?.onboardingComplete, recordBootMetric, tab]);
const trackFrictionEvent = useMemo(() => ({ flow = "app", action = "interaction", outcome = "observed", props = {} } = {}) => {
 const eventPayload = { flow, action, outcome, props };
 const sendEvent = () => {
  frictionAnalytics.track(eventPayload);
 };
 if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
  window.setTimeout(sendEvent, 0);
  return;
 }
 sendEvent();
}, [frictionAnalytics]);
 const recordAdaptiveLearningEvent = useCallback(({
 eventName = "",
 payload = {},
 dedupeKey = "",
 authSessionOverride = authSession,
 userId = "",
 occurredAt = Date.now(),
 } = {}) => {
 const identity = buildAdaptiveLearningIdentityFromSession({
 authSession: authSessionOverride,
 localActorId: adaptiveLearningStore?.getSnapshot?.()?.actorId || "",
 });
 return adaptiveLearningStore.recordEvent({
 eventName,
 payload,
 actorId: identity.actorId || userId || adaptiveLearningStore?.getSnapshot?.()?.actorId || "",
 userId: userId || identity.userId || "",
 localActorId: identity.localActorId || adaptiveLearningStore?.getSnapshot?.()?.actorId || "",
 dedupeKey,
 occurredAt,
 });
 }, [adaptiveLearningStore, authSession]);
 const classifyFrictionErrorCode = (error = null) => getDiagnosticsCode(error, "unknown");
 useEffect(() => {
 adaptiveLearningStore.setUserIdentity({
 userId: String(authSession?.user?.id || "").trim(),
 localActorId: adaptiveLearningStore?.getSnapshot?.()?.actorId || "",
 });
 }, [adaptiveLearningStore, authSession?.user?.id]);
 useEffect(() => {
 if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
 const handleAnalyticsEvent = () => setAnalyticsVersion((current) => current + 1);
 window.addEventListener(FRICTION_ANALYTICS_EVENT_NAME, handleAnalyticsEvent);
 return () => window.removeEventListener(FRICTION_ANALYTICS_EVENT_NAME, handleAnalyticsEvent);
 }, [frictionAnalytics]);
 const canonicalAthlete = useMemo(
 () => deriveCanonicalAthleteState({ goals, personalization, profileDefaults: PROFILE }),
 [goals, personalization]
 );
 const goalsModel = canonicalAthlete.goals;
 const goalBuckets = canonicalAthlete.goalBuckets;
 const activeTimeBoundGoal = canonicalAthlete.activeTimeBoundGoal;
 const canonicalUserProfile = canonicalAthlete.userProfile;
 const canonicalGoalState = canonicalAthlete.goalState;
 const frictionDashboard = useMemo(
 () => buildFrictionDashboardModel({ events: frictionAnalytics.readEvents() }),
 [analyticsVersion, frictionAnalytics]
 );
 const syncStateModel = useMemo(() => buildSyncStateModel({
 storageStatus,
 authSession,
 syncRuntime,
 authError,
 hasLocalCache: Boolean(startupLocalResumeAvailable),
 authInitializing,
 appLoading: loading,
 now: syncRuntime?.updatedAt || Date.now(),
 }), [
 storageStatus,
 authSession,
 syncRuntime,
 authError,
 startupLocalResumeAvailable,
 authInitializing,
 loading,
 ]);
 const syncStateModelRef = useRef(syncStateModel);
 const syncDiagnosticsRef = useRef(syncDiagnostics);
 useEffect(() => {
 syncStateModelRef.current = syncStateModel;
 }, [syncStateModel]);
 useEffect(() => {
 syncDiagnosticsRef.current = syncDiagnostics;
 }, [syncDiagnostics]);
 const [syncPresentationState, setSyncPresentationState] = useState(() => createInitialSyncPresentationState({
 syncState: syncStateModel,
 now: Date.now(),
 }));
 const [syncTestOverride, setSyncTestOverride] = useState(null);
 const syncPresentationStateRef = useRef(syncPresentationState);
 const syncTestOverrideRef = useRef(syncTestOverride);
 useEffect(() => {
 syncPresentationStateRef.current = syncPresentationState;
 }, [syncPresentationState]);
 useEffect(() => {
 syncTestOverrideRef.current = syncTestOverride;
 }, [syncTestOverride]);
 useEffect(() => {
 setSyncPresentationState((current) => stabilizeSyncStatePresentation({
 currentPresentation: current,
 syncState: syncStateModel,
 now: Date.now(),
 }));
 }, [syncStateModel]);
 useEffect(() => {
 const nextUpdateAt = Number(syncPresentationState?.nextUpdateAt || 0);
 if (!nextUpdateAt || nextUpdateAt <= Date.now()) return undefined;
 const timer = window.setTimeout(() => {
 setSyncPresentationState((current) => stabilizeSyncStatePresentation({
 currentPresentation: current,
 syncState: syncStateModelRef.current,
 now: Date.now(),
 }));
 }, Math.max(0, nextUpdateAt - Date.now()));
 return () => window.clearTimeout(timer);
 }, [syncPresentationState?.nextUpdateAt]);
 const effectiveSyncStateModel = syncTestOverride?.rawState || syncStateModel;
 const effectiveSyncPresentationState = syncTestOverride?.presentation || syncPresentationState;
 const displayedSyncStateModel = effectiveSyncPresentationState?.displayedState || effectiveSyncStateModel;
 const syncSurfaceModels = useMemo(() => ({
 today: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.today,
 }),
 program: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.program,
 }),
 log: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.log,
 }),
 nutrition: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.nutrition,
 }),
 coach: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.coach,
 }),
 settings: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.settings,
 }),
 auth: buildSyncSurfaceModel({
 syncState: displayedSyncStateModel,
 surface: SYNC_SURFACE_KEYS.auth,
 }),
 }), [displayedSyncStateModel]);
 useEffect(() => {
 if (typeof window === "undefined" || window.__E2E_SYNC_TEST !== true) return undefined;
 const buildSyncTestState = (preset = "synced", at = Date.now()) => {
 const timestamp = Number(at) || Date.now();
 const authState = authSessionRef.current || authSession || null;
 const hasLocalCache = startupLocalResumeAvailable;
 if (preset === "syncing") {
 return buildSyncStateModel({
 storageStatus: buildStorageStatus({
 mode: "syncing",
 label: "SYNCING",
 reason: STORAGE_STATUS_REASONS.synced,
 detail: "Cloud sync is working normally.",
 }),
 authSession: authState,
 syncRuntime: {
 ...createInitialSyncRuntimeState({ isOnline: true, now: timestamp }),
 cloudSyncInFlight: true,
 updatedAt: timestamp,
 },
 authError,
 hasLocalCache,
 authInitializing: false,
 appLoading: false,
 now: timestamp,
 });
 }
 if (preset === "retrying") {
 return buildSyncStateModel({
 storageStatus: buildStorageStatus({
 mode: "local",
 label: "SYNC RETRYING",
 reason: STORAGE_STATUS_REASONS.transient,
 detail: "Cloud sync timed out. Local changes are still saved safely on this device.",
 }),
 authSession: authState,
 syncRuntime: {
 ...createInitialSyncRuntimeState({ isOnline: true, now: timestamp }),
 retryEligible: true,
 lastCloudFailureAt: timestamp,
 lastErrorCode: "fetch_timeout",
 lastErrorMessage: "Cloud request timed out.",
 pendingLocalWrites: true,
 updatedAt: timestamp,
 },
 authError,
 hasLocalCache,
 authInitializing: false,
 appLoading: false,
 now: timestamp,
 });
 }
 if (preset === "stale") {
 return buildSyncStateModel({
 storageStatus: buildStorageStatus({
 mode: "cloud",
 label: "SYNCED",
 reason: STORAGE_STATUS_REASONS.synced,
 detail: "Cloud sync is working normally.",
 }),
 authSession: authState,
 syncRuntime: {
 ...createInitialSyncRuntimeState({ isOnline: true, now: timestamp }),
 realtimeInterrupted: true,
 updatedAt: timestamp,
 },
 authError,
 hasLocalCache,
 authInitializing: false,
 appLoading: false,
 now: timestamp,
 });
 }
 return buildSyncStateModel({
 storageStatus: buildStorageStatus({
 mode: "cloud",
 label: "SYNCED",
 reason: STORAGE_STATUS_REASONS.synced,
 detail: "Cloud sync is working normally.",
 }),
 authSession: authState,
 syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: timestamp }),
 authError,
 hasLocalCache,
 authInitializing: false,
 appLoading: false,
 now: timestamp,
 });
 };
 const buildSyncTestSnapshot = () => ({
 rawStateId: syncTestOverrideRef.current?.rawState?.id || syncStateModelRef.current?.id || "",
 displayedStateId: syncTestOverrideRef.current?.presentation?.displayedState?.id || syncPresentationStateRef.current?.displayedState?.id || "",
 diagnostics: syncDiagnosticsRef.current || null,
 todaySurface: buildSyncSurfaceModel({
 syncState: syncTestOverrideRef.current?.presentation?.displayedState || syncTestOverrideRef.current?.rawState || syncPresentationStateRef.current?.displayedState || syncStateModelRef.current,
 surface: SYNC_SURFACE_KEYS.today,
 }),
 programSurface: buildSyncSurfaceModel({
 syncState: syncTestOverrideRef.current?.presentation?.displayedState || syncTestOverrideRef.current?.rawState || syncPresentationStateRef.current?.displayedState || syncStateModelRef.current,
 surface: SYNC_SURFACE_KEYS.program,
 }),
 });
 const applySyncPreset = (preset = "synced", at = Date.now()) => {
 const timestamp = Number(at) || Date.now();
 const rawState = buildSyncTestState(preset, timestamp);
 const currentOverride = syncTestOverrideRef.current;
 const nextOverride = {
 rawState,
 presentation: currentOverride?.presentation
 ? stabilizeSyncStatePresentation({
 currentPresentation: currentOverride.presentation,
 syncState: rawState,
 now: timestamp,
 })
 : createInitialSyncPresentationState({
 syncState: rawState,
 now: timestamp,
 }),
 };
 syncTestOverrideRef.current = nextOverride;
 setSyncTestOverride(nextOverride);
 return true;
 };
 window.__TRAINER_SYNC_TEST_HELPERS = {
 applyPreset: applySyncPreset,
 reconcilePresentation: (offsetMs = 0) => {
 const currentOverride = syncTestOverrideRef.current;
 const rawState = currentOverride?.rawState || syncStateModelRef.current;
 const currentPresentation = currentOverride?.presentation || syncPresentationStateRef.current;
 const nextOverride = {
 rawState,
 presentation: stabilizeSyncStatePresentation({
 currentPresentation,
 syncState: rawState,
 now: Date.now() + (Number(offsetMs) || 0),
 }),
 };
 syncTestOverrideRef.current = nextOverride;
 setSyncTestOverride(nextOverride);
 },
 snapshot: buildSyncTestSnapshot,
 };
 return () => {
 syncTestOverrideRef.current = null;
 setSyncTestOverride(null);
 if (window.__TRAINER_SYNC_TEST_HELPERS?.snapshot === buildSyncTestSnapshot) {
 delete window.__TRAINER_SYNC_TEST_HELPERS;
 }
 };
 }, [authError, authInitializing, authSession, loading, startupLocalResumeAvailable]);

 const today = new Date();
 const currentWeek = resolveCurrentPlanWeekNumber({
 planStartDate: canonicalGoalState?.planStartDate || "",
 fallbackStartDate: PROFILE.startDate,
 now: today,
 });
 const dayOfWeek = getDayOfWeek();
 const baseTodayWorkout = getTodayWorkout(currentWeek, dayOfWeek);
 const baseWeek = WEEKS[(currentWeek - 1) % WEEKS.length] || WEEKS[0];
 const todayKey = new Date().toISOString().split("T")[0];
 useEffect(() => {
 if (tab !== 5 && settingsFocus) setSettingsFocus("");
 }, [tab, settingsFocus]);
 const dismissedTriggerStorageKey = `dismissed_triggers_${todayKey}`;
 const dayOverride = coachPlanAdjustments.dayOverrides?.[todayKey];
 const nutritionOverride = coachPlanAdjustments.nutritionOverrides?.[todayKey];
 const environmentSelection = resolveEnvironmentSelection({ personalization, todayKey, currentWeek });
 const momentum = getMomentumEngineState({ logs, dailyCheckins, bodyweights, personalization });
 const patterns = detectBehaviorPatterns({ logs, bodyweights, personalization });
 const validationLayer = deriveClosedLoopValidationLayer({ coachActions, logs, dailyCheckins });
 const optimizationLayer = derivePersonalOptimizationLayer({ logs, dailyCheckins, nutritionActualLogs, coachActions, validationLayer });
 const learningLayer = deriveLearningLayer({ dailyCheckins, logs, weeklyCheckins, momentum, personalization, validationLayer, optimizationLayer });
 const salvageLayer = deriveSalvageLayer({ logs, momentum, dailyCheckins, weeklyCheckins, personalization, learningLayer });
 const failureMode = deriveFailureModeHardening({ logs, dailyCheckins, bodyweights, coachPlanAdjustments, coachActions, salvageLayer });
 const prePlanWeeklyNutritionReview = useMemo(() => buildWeeklyNutritionReview({
 anchorDateKey: todayKey,
 plannedDayRecords,
 nutritionActualLogs,
 }), [todayKey, plannedDayRecords, nutritionActualLogs]);
 const planComposer = composeGoalNativePlan({
 goals: goalsModel,
 personalization,
 momentum,
 learningLayer,
 currentWeek,
 baseWeek,
 weekTemplates: WEEKS,
 athleteProfile: canonicalAthlete,
 logs,
 bodyweights,
 dailyCheckins,
 nutritionActualLogs,
 weeklyNutritionReview: prePlanWeeklyNutritionReview,
 coachActions,
 todayKey,
 currentDayOfWeek: dayOfWeek,
 plannedDayRecords,
 planWeekRecords,
 });
 const planWeekRuntime = useMemo(() => {
 const runtime = assemblePlanWeekRuntime({
 todayKey,
 currentWeek,
 dayOfWeek,
 goals: goalsModel,
 baseWeek,
 weekTemplates: WEEKS,
 planComposer,
 momentum,
 learningLayer,
 weeklyCheckins,
 coachPlanAdjustments,
 failureMode,
 environmentSelection,
 horizonWeeks: DEFAULT_PLANNING_HORIZON_WEEKS,
 });
 validatePlanWeekInvariant(runtime?.currentPlanWeek || null, "assemblePlanWeekRuntime.currentPlanWeek");
 return runtime;
 }, [
 todayKey,
 currentWeek,
 dayOfWeek,
 goalsModel,
 baseWeek,
 planComposer,
 momentum,
 learningLayer,
 weeklyCheckins,
 coachPlanAdjustments,
 failureMode,
 environmentSelection,
 ]);
 const currentWeeklyCheckin = planWeekRuntime.currentWeeklyCheckin;
 const currentPlanWeek = planWeekRuntime.currentPlanWeek;
 const currentPlanSession = planWeekRuntime.currentPlanSession;
 useEffect(() => {
 if (loading || !currentPlanWeek?.id) return;
 const { nextRecords, changed } = upsertPersistedPlanWeekRecord({
 planWeekRecords,
 planWeek: currentPlanWeek,
 capturedAt: Date.now(),
 sourceType: "current_plan_week",
 weeklyCheckin: currentWeeklyCheckin,
 });
 if (!changed) return;
 setPlanWeekRecords(nextRecords);
 persistAll(
 logs,
 bodyweights,
 paceOverrides,
 weekNotes,
 planAlerts,
 personalization,
 coachActions,
 coachPlanAdjustments,
 goalsModel,
 dailyCheckins,
 weeklyCheckins,
 nutritionFavorites,
 nutritionActualLogs,
 plannedDayRecords,
 nextRecords
 );
 }, [
 loading,
 currentPlanWeek,
 currentWeeklyCheckin,
 planWeekRecords,
 logs,
 bodyweights,
 paceOverrides,
 weekNotes,
 planAlerts,
 personalization,
 coachActions,
 coachPlanAdjustments,
 goalsModel,
 dailyCheckins,
 weeklyCheckins,
 nutritionFavorites,
 nutritionActualLogs,
 plannedDayRecords,
 ]);
 const todayPlan = generateTodayPlan(
 canonicalUserProfile,
 { logs, todayKey },
 {
 fatigueScore: personalization.trainingState?.fatigueScore ?? 2,
 trend: personalization.trainingState?.trend || "stable",
 momentum: momentum.momentumState,
 injuryLevel: personalization.injuryPainState?.level || "none",
 },
 {
 programBlock: currentPlanWeek?.programBlock || null,
 weeklyIntent: currentPlanWeek?.weeklyIntent || null,
 planWeek: currentPlanWeek,
 plannedSession: currentPlanSession,
 changeSummary: currentPlanWeek?.changeSummary || planComposer?.changeSummary || null,
 planningBasis: planComposer?.planningBasis || currentPlanWeek?.planningBasis || null,
 }
 );
 const rollingHorizon = planWeekRuntime.rollingHorizon;
 const horizonAnchor = planWeekRuntime.horizonAnchor;
 const hasStructuredProfile = Boolean(canonicalUserProfile?.primaryGoalKey);
 const goalNativeBase = currentPlanSession
 ? {
 ...baseTodayWorkout,
 ...currentPlanSession,
 week: {
 ...baseWeek,
 planWeekId: currentPlanWeek?.id || "",
 status: currentPlanWeek?.status || "planned",
 adjusted: Boolean(currentPlanWeek?.adjusted),
 programBlock: currentPlanWeek?.programBlock || null,
 weeklyIntent: currentPlanWeek?.weeklyIntent || null,
 },
 zones: baseTodayWorkout?.zones,
 }
 : baseTodayWorkout;
 const goalNativeWorkout = hasStructuredProfile
 ? todayPlan.type === "recovery"
 ? { ...goalNativeBase, type: "rest", label: todayPlan.label, nutri: "rest", run: null, strSess: null, todayPlan }
 : { ...goalNativeBase, label: todayPlan.label, planIntensity: todayPlan.intensity, planDuration: todayPlan.duration, todayPlan }
 : goalNativeBase;
 const todayWorkoutBase = dayOverride ? { ...goalNativeWorkout, ...dayOverride, coachOverride: true, nutri: nutritionOverride || dayOverride.nutri || goalNativeWorkout?.week?.nutri } : { ...goalNativeWorkout, nutri: nutritionOverride || goalNativeWorkout?.week?.nutri };
 const weekState = failureMode?.mode === "chaotic" ? "chaotic" : momentum?.fatigueNotes >= 2 ? "fatigued" : "normal";
 const todayWorkoutEnvironment = applyEnvironmentToWorkout(todayWorkoutBase, environmentSelection, { weekState, injuryFlag: personalization?.injuryPainState?.level || "none" });
 const injuryRule = buildInjuryRuleResult(todayWorkoutEnvironment, personalization.injuryPainState);
 const todayWorkout = applySessionNamingRules(injuryRule.workout, personalization.injuryPainState);
 const garminReadiness = deriveGarminReadiness(personalization, todayKey);
 const deviceSyncAudit = deriveDeviceSyncAudit(personalization, todayKey);
 const arbitration = arbitrateGoals({ goals: goalsModel, momentum, personalization });
 const strengthLayer = deriveStrengthLayer({ goals: goalsModel, momentum, personalization, logs });
 const progressEngine = deriveProgressEngine({ logs, bodyweights, momentum, strengthLayer });
 const expectations = deriveExpectationEngine({ progress: progressEngine, momentum, arbitration });
 const behaviorLoop = deriveBehaviorLoop({ dailyCheckins, logs, momentum, salvageLayer });
 const longTermMemory = useMemo(
 () => deriveLongTermMemoryLayer({
 logs,
 dailyCheckins,
 weeklyCheckins,
 nutritionActualLogs,
 validationLayer,
 previousMemory: personalization?.coachMemory?.longTermMemory || []
 }),
 [logs, dailyCheckins, weeklyCheckins, nutritionActualLogs, validationLayer]
 );
 const memoryInsights = longTermMemory.filter(m => m.confidence === "high").slice(0, 4);
 const compoundingCoachMemory = deriveCompoundingCoachMemory({ dailyCheckins, weeklyCheckins, personalization, momentum });
 const recalibration = deriveRecalibrationEngine({ currentWeek, progress: progressEngine, momentum, learningLayer, memoryInsights, arbitration });
 const todayWorkoutHardenedBase = failureMode.isReEntry
 ? { ...todayWorkout, label: `Re-entry day: ${todayWorkout?.label || "short version"}`, minDay: true, success: "Re-entry week: complete one essential session and log it. Momentum first.", explanation: `You haven't trained in a while, so today is a re-entry session. The goal is to rebuild rhythm with one manageable session - not to catch up.` }
 : (failureMode.mode === "chaotic" || failureMode.isLowEngagement)
 ? { ...todayWorkout, minDay: true, success: "Complete the short version only.", explanation: `Life has been chaotic recently, so today is the short version. Completing something small protects your momentum better than skipping entirely.` }
 : todayWorkout;
 const todayWorkoutHardened = garminReadiness?.mode === "recovery"
 ? { ...todayWorkoutHardenedBase, type: "rest", label: "Recovery Mode (Garmin readiness)", run: null, strSess: null, nutri: "rest", success: "Walk + mobility only today. Resume loading when readiness improves.", explanation: `Garmin readiness is coming in low today, so the app is treating device data as a caution signal rather than a guarantee. Recovery today protects the rest of the week.` }
 : garminReadiness?.mode === "reduced_load"
 ? { ...todayWorkoutHardenedBase, minDay: true, label: `${todayWorkoutHardenedBase?.label || "Session"} (Reduced-load)`, explanation: `Garmin readiness is pointing to partial recovery, so today's session is reduced as a caution move rather than a hard stop.` }
 : deviceSyncAudit?.planMode === "recovery"
 ? { ...todayWorkoutHardenedBase, type: "rest", label: "Recovery Mode (Device signals)", run: null, strSess: null, nutri: "rest", success: "Device data suggests a recovery day.", explanation: `Connected device data is leaning recovery today. The app is using that signal cautiously because device context is suggestive, not definitive, on its own.` }
 : deviceSyncAudit?.planMode === "reduced_load"
 ? { ...todayWorkoutHardenedBase, minDay: true, label: `${todayWorkoutHardenedBase?.label || "Session"} (Device-adjusted)`, explanation: `Device signals suggest slightly reducing today's load to stay within productive training ranges.` }
 : todayWorkoutHardenedBase;
 if (!todayWorkoutHardened.explanation && todayWorkoutHardened.todayPlan?.reason) {
 todayWorkoutHardened.explanation = todayWorkoutHardened.todayPlan.reason;
 }
 const cadenceRuns = (personalization?.connectedDevices?.garmin?.activities || []).filter((a) => /run/i.test(String(a?.type || a?.sport || "")) && Number(a?.cadence || 0) > 0);
 const avgCadence = cadenceRuns.length ? (cadenceRuns.reduce((acc, a) => acc + Number(a?.cadence || 0), 0) / cadenceRuns.length) : null;
 if (todayWorkoutHardened?.run?.t === "Easy" && cadenceRuns.length >= 10) {
 if (avgCadence < 170) todayWorkoutHardened.environmentNote = `${todayWorkoutHardened.environmentNote ? `${todayWorkoutHardened.environmentNote} ` : ""}Target 170+ spm - shorter, quicker steps.`;
 else if (avgCadence > 180 && (currentWeek % 2 === 0)) todayWorkoutHardened.environmentNote = `${todayWorkoutHardened.environmentNote ? `${todayWorkoutHardened.environmentNote} ` : ""}Cadence is efficient - keep that quick, relaxed turnover.`;
 }
 const todaySummary = personalization?.connectedDevices?.garmin?.dailySummaries?.[todayKey] || {};
 if (todayWorkoutHardened?.type === "rest" && Number(todaySummary?.steps || 0) > 0) {
 todayWorkoutHardened.environmentNote = `${todayWorkoutHardened.environmentNote ? `${todayWorkoutHardened.environmentNote} ` : ""}Today steps: ${todaySummary.steps}. Keep rest day movement easy.`;
 }
 const planDayTimeOfDay = resolvePlanDayTimeOfDay({ hours: today.getHours() });
 const planDayStateInputs = useMemo(() => resolvePlanDayStateInputs({
 dateKey: todayKey,
 logs,
 dailyCheckins,
 nutritionActualLogs,
 coachPlanAdjustments,
 }), [todayKey, logs, dailyCheckins, nutritionActualLogs, coachPlanAdjustments]);
 const savedTodayCheckin = planDayStateInputs.dailyCheckin;
 const savedReadinessPromptSignal = planDayStateInputs.readinessPromptSignal;
 const sharedReadinessInfluence = deriveDeterministicReadinessState({
 todayKey,
 checkin: savedTodayCheckin,
 promptSignal: savedReadinessPromptSignal,
 workout: todayWorkoutHardened,
 logs,
 dailyCheckins,
 personalization,
 momentum,
 userProfile: canonicalUserProfile,
 });
 const planDayBundle = useMemo(() => {
 const bundle = assembleCanonicalPlanDay({
 dateKey: todayKey,
 dayOfWeek,
 currentWeek,
 baseWeek,
 basePlannedDay: goalNativeWorkout,
 resolvedTrainingCandidate: todayWorkoutHardened,
 todayPlan,
 readinessInfluence: sharedReadinessInfluence,
 goals: goalsModel,
 momentum,
 personalization,
 bodyweights,
 learningLayer,
 nutritionActualLogs,
 coachPlanAdjustments,
 salvageLayer,
 failureMode,
 nutritionFavorites,
 currentPlanWeek: {
 ...currentPlanWeek,
 architecture: planComposer?.architecture || "",
 programBlock: planComposer?.programBlock || currentPlanWeek?.programBlock || null,
 blockIntent: planComposer?.blockIntent || null,
 },
 dayOverride,
 nutritionOverride,
 environmentSelection,
 injuryRule,
 garminReadiness,
 deviceSyncAudit,
 logs,
 dailyCheckins,
 stateInputs: planDayStateInputs,
 timeOfDay: planDayTimeOfDay,
 });
 validatePlanDayInvariant(bundle?.planDay || null, "assembleCanonicalPlanDay.planDay");
 validateActualNutritionLogInvariant(bundle?.planDay?.resolved?.nutrition?.actual || null, todayKey, "assembleCanonicalPlanDay.actualNutrition");
 return bundle;
 }, [
 todayKey,
 dayOfWeek,
 currentWeek,
 baseWeek,
 goalNativeWorkout,
 todayWorkoutHardened,
 todayPlan,
 sharedReadinessInfluence,
 goalsModel,
 momentum,
 personalization,
 bodyweights,
 learningLayer,
 nutritionActualLogs,
 coachPlanAdjustments,
 salvageLayer,
 failureMode,
 nutritionFavorites,
 dayOverride,
 nutritionOverride,
 environmentSelection,
 injuryRule,
 garminReadiness,
 deviceSyncAudit,
 planComposer,
 currentPlanWeek,
 logs,
 dailyCheckins,
 planDayStateInputs,
 planDayTimeOfDay,
 ]);
 const planDay = planDayBundle.planDay;
 const effectiveTodayWorkout = planDayBundle.effectiveTraining;
 const nutritionLayer = planDayBundle.nutritionLayer;
 const realWorldNutrition = planDayBundle.realWorldNutrition;
 const nutritionComparison = planDayBundle.nutritionComparison;
 const todayPlannedDayRecord = buildPlannedDayRecord(planDay);
 const planDayWeek = planDay?.week || null;
 const liveWeek = planDayWeek?.planWeek || currentPlanWeek || null;
 const fallbackWeeklyIntent = liveWeek
 ? {
 focus: liveWeek?.focus,
 aggressionLevel: liveWeek?.aggressionLevel,
 recoveryBias: liveWeek?.recoveryBias,
 volumePct: liveWeek?.weeklyIntent?.volumePct,
 nutritionEmphasis: liveWeek?.nutritionEmphasis,
 }
 : null;
 const canonicalSurfaceWeekContext = {
 ...(planDayWeek || {}),
 planWeek: liveWeek,
 weeklyIntent: planDayWeek?.weeklyIntent || liveWeek?.weeklyIntent || fallbackWeeklyIntent,
 planningBasis: planDayWeek?.planningBasis || liveWeek?.planningBasis || planComposer?.planningBasis || null,
 changeSummary: planDayWeek?.changeSummary || liveWeek?.changeSummary || planComposer?.changeSummary || null,
 };
 const prescribedSurfaceExercises = buildStrengthPrescriptionEntriesForLogging(planDay?.resolved?.training || null);
 const planDaySurfaceModels = {
 today: buildCanonicalPlanSurfaceModel({
 surface: "today",
 planDay,
 week: canonicalSurfaceWeekContext,
 prescribedExercises: prescribedSurfaceExercises,
 }),
 program: buildCanonicalPlanSurfaceModel({
 surface: "program",
 planDay,
 week: canonicalSurfaceWeekContext,
 prescribedExercises: prescribedSurfaceExercises,
 }),
 log: buildCanonicalPlanSurfaceModel({
 surface: "log",
 plannedDayRecord: todayPlannedDayRecord,
 week: canonicalSurfaceWeekContext,
 provenance: planDay?.provenance || null,
 prescribedExercises: prescribedSurfaceExercises,
 }),
 nutrition: buildCanonicalPlanSurfaceModel({
 surface: "nutrition",
 planDay,
 week: canonicalSurfaceWeekContext,
 prescribedExercises: prescribedSurfaceExercises,
 }),
 coach: buildCanonicalPlanSurfaceModel({
 surface: "coach",
 planDay,
 week: canonicalSurfaceWeekContext,
 prescribedExercises: prescribedSurfaceExercises,
 }),
 };
 const planDaySurfaceAudit = buildCanonicalPlanSurfaceAudit({
 canonicalSurface: planDaySurfaceModels?.today || null,
 surfaceModels: planDaySurfaceModels,
 });
 useEffect(() => {
 if (!personalization?.profile?.onboardingComplete || !currentPlanWeek?.id) return;
 const planGenerationEvent = buildPlanGenerationRecommendationEventInput({
 goals: goalsModel,
 planComposer,
 currentPlanWeek,
 currentWeek,
 sourceSurface: "intake",
 });
 const weeklyRefreshEvent = buildWeeklyPlanRefreshRecommendationEventInput({
 goals: goalsModel,
 currentPlanWeek,
 currentWeek,
 dayOfWeek,
 sourceSurface: "program",
 });
 const cohortSnapshotEvent = buildCohortSnapshotEventInput({
 goals: goalsModel,
 personalization,
 planComposer,
 });
 const userStateSnapshotEvent = buildUserStateSnapshotEventInput({
 snapshotKind: "weekly_refresh",
 goals: goalsModel,
 currentPlanWeek,
 planDay,
 personalization,
 syncMode: storageStatus?.mode || "local",
 pendingLocalWrites: Boolean(syncDiagnostics?.pendingLocalWrites),
 latestCompletionRate: momentum?.completionRate || 0,
 });
 if (planGenerationEvent) {
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: planGenerationEvent,
 dedupeKey: `plan_generation_${planGenerationEvent.recommendationJoinKey}_${currentPlanWeek?.status || "planned"}_${Boolean(currentPlanWeek?.adjusted)}`,
 });
 }
 if (weeklyRefreshEvent) {
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: weeklyRefreshEvent,
 dedupeKey: `weekly_refresh_${weeklyRefreshEvent.recommendationJoinKey}_${currentPlanWeek?.changeSummary?.headline || currentPlanWeek?.summary || ""}`,
 });
 }
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.cohortSnapshotCaptured,
 payload: cohortSnapshotEvent,
 dedupeKey: `cohort_snapshot_${cohortSnapshotEvent.cohortKey}`,
 });
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.userStateSnapshotCaptured,
 payload: userStateSnapshotEvent,
 dedupeKey: `user_state_week_${currentPlanWeek?.id}_${currentPlanWeek?.status || "planned"}_${storageStatus?.mode || "local"}`,
 });
 }, [
 currentPlanWeek,
 currentWeek,
 dayOfWeek,
 goalsModel,
 momentum?.completionRate,
 personalization,
 planComposer,
 planDay,
 recordAdaptiveLearningEvent,
 storageStatus?.mode,
 syncDiagnostics?.pendingLocalWrites,
 ]);
 useEffect(() => {
 if (!planDay?.dateKey) return;
 const dayRecommendationEvent = buildDayPrescriptionRecommendationEventInput({
 goals: goalsModel,
 planDay,
 currentWeek,
 dayOfWeek,
 sourceSurface: "today",
 });
 const workoutAdjustmentEvent = buildWorkoutAdjustmentRecommendationEventInput({
 goals: goalsModel,
 planDay,
 currentWeek,
 dayOfWeek,
 sourceSurface: "today",
 });
 const nutritionRecommendationEvent = buildNutritionRecommendationEventInput({
 goals: goalsModel,
 planDay,
 sourceSurface: "nutrition",
 });
 const userStateSnapshotEvent = buildUserStateSnapshotEventInput({
 snapshotKind: "daily_prescription",
 goals: goalsModel,
 currentPlanWeek,
 planDay,
 personalization,
 syncMode: storageStatus?.mode || "local",
 pendingLocalWrites: Boolean(syncDiagnostics?.pendingLocalWrites),
 latestCompletionRate: momentum?.completionRate || 0,
 });
 if (dayRecommendationEvent) {
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: dayRecommendationEvent,
 dedupeKey: `day_prescription_${dayRecommendationEvent.recommendationJoinKey}_${planDay?.decision?.mode || "planned"}_${planDay?.resolved?.training?.label || ""}`,
 });
 }
 if (workoutAdjustmentEvent) {
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: workoutAdjustmentEvent,
 dedupeKey: `workout_adjustment_${workoutAdjustmentEvent.recommendationJoinKey}_${planDay?.provenance?.summary || ""}`,
 });
 }
 if (nutritionRecommendationEvent) {
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: nutritionRecommendationEvent,
 dedupeKey: `nutrition_recommendation_${nutritionRecommendationEvent.recommendationJoinKey}_${planDay?.resolved?.nutrition?.dayType || ""}`,
 });
 }
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.userStateSnapshotCaptured,
 payload: userStateSnapshotEvent,
 dedupeKey: `user_state_day_${planDay?.id}_${planDay?.decision?.mode || "planned"}_${storageStatus?.mode || "local"}`,
 });
 }, [
 currentPlanWeek,
 currentWeek,
 dayOfWeek,
 goalsModel,
 momentum?.completionRate,
 personalization,
 planDay,
 recordAdaptiveLearningEvent,
 storageStatus?.mode,
 syncDiagnostics?.pendingLocalWrites,
 ]);
const runtimeDebugSnapshot = useMemo(() => {
 if (!TRUSTED_DEBUG_MODE) return null;
 const weekIntent = currentPlanWeek?.weeklyIntent || {};
 const readiness = planDay?.resolved?.recovery || {};
 const nutritionActual = planDay?.resolved?.nutrition?.actual || null;
 const nutritionComparisonSummary = planDay?.resolved?.nutrition?.comparison || {};
 const latestAcceptedCoachAction = (coachActions || []).find((action) => action?.acceptedBy);
 const latestAiPlanAlert = (planAlerts || []).find((alert) => alert?.source === "ai_proposal_accepted");
 const latestPlanRevision = plannedDayRecords?.[todayKey]?.revisions?.slice?.(-1)?.[0] || null;
 const plannedHistory = plannedDayRecords?.[todayKey] || null;
 const loggingState = planDay?.resolved?.logging || {};
 return {
 generatedAt: new Date().toISOString(),
 storage: {
 mode: storageStatus?.mode || "unknown",
 label: storageStatus?.label || "UNKNOWN",
 authError: authError || "",
 },
 planDay: {
 dateKey: planDay?.dateKey || todayKey,
 label: planDay?.resolved?.training?.label || planDay?.base?.training?.label || "No day loaded",
 type: planDay?.resolved?.training?.type || "unknown",
 decisionMode: planDay?.decision?.mode || "unknown",
 confidence: planDay?.decision?.confidence || "unknown",
 modifiedFromBase: Boolean(planDay?.decision?.modifiedFromBase || planDay?.flags?.isModified),
 provenanceSummary: planDay?.provenance?.summary || "",
 keyDrivers: Array.isArray(planDay?.provenance?.keyDrivers) ? planDay.provenance.keyDrivers.slice(0, 5) : [],
 },
 planWeek: {
 id: currentPlanWeek?.id || "",
 weekNumber: currentPlanWeek?.weekNumber || currentWeek,
 label: currentPlanWeek?.label || "",
 phase: currentPlanWeek?.phase || baseWeek?.phase || "",
 programBlockLabel: currentPlanWeek?.programBlock?.label || "",
 dominantEmphasis: currentPlanWeek?.programBlock?.dominantEmphasis?.label || "",
 status: currentPlanWeek?.status || "planned",
 adjusted: Boolean(currentPlanWeek?.adjusted),
 focus: weekIntent?.focus || "",
 aggressionLevel: weekIntent?.aggressionLevel || "",
 recoveryBias: weekIntent?.recoveryBias || "",
 volumeBias: weekIntent?.volumeBias || "",
 performanceBias: weekIntent?.performanceBias || "",
 nutritionEmphasis: weekIntent?.nutritionEmphasis || "",
 constraints: Array.isArray(currentPlanWeek?.constraints) ? currentPlanWeek.constraints.slice(0, 5) : [],
 },
 readiness: {
 state: readiness?.state || "unknown",
 stateLabel: readiness?.stateLabel || "",
 source: readiness?.source || "",
 inputDriven: Boolean(readiness?.inputDriven),
 userVisibleLine: readiness?.userVisibleLine || readiness?.recoveryLine || "",
 factors: Array.isArray(readiness?.factors) ? readiness.factors.slice(0, 5) : [],
 },
 nutrition: {
 dayType: planDay?.resolved?.nutrition?.dayType || planDay?.resolved?.nutrition?.prescription?.dayType || "",
 actualLogged: Boolean(nutritionActual),
 compliance: nutritionActual?.compliance || "",
 deviationKind: nutritionActual?.deviationKind || nutritionComparisonSummary?.deviationKind || "",
 comparisonStatus: nutritionComparisonSummary?.status || "",
 comparisonImpact: nutritionComparisonSummary?.impact || "",
 comparisonSummary: nutritionComparisonSummary?.summary || "",
 },
 surfaceAudit: {
 ok: Boolean(planDaySurfaceAudit?.ok),
 mismatchCount: Array.isArray(planDaySurfaceAudit?.mismatches) ? planDaySurfaceAudit.mismatches.length : 0,
 comparedFields: Array.isArray(planDaySurfaceAudit?.comparedFields) ? planDaySurfaceAudit.comparedFields : [],
 mismatches: Array.isArray(planDaySurfaceAudit?.mismatches) ? planDaySurfaceAudit.mismatches : [],
 surfaces: planDaySurfaceAudit?.surfaces || {},
 },
 logging: {
 checkinStatus: loggingState?.dailyCheckin?.status || "",
 sessionStatus: loggingState?.status || "",
 hasCheckin: Boolean(loggingState?.hasCheckin),
 hasSessionLog: Boolean(loggingState?.hasSessionLog),
 hasNutritionLog: Boolean(loggingState?.hasNutritionLog),
 },
 prescribedHistory: {
 durability: latestPlanRevision?.durability || "none",
 sourceType: latestPlanRevision?.sourceType || "",
 revisionNumber: latestPlanRevision?.revisionNumber || 0,
 revisionCount: Array.isArray(plannedHistory?.revisions) ? plannedHistory.revisions.length : 0,
 currentRevisionId: plannedHistory?.currentRevisionId || "",
 },
 ai: {
 analyzing,
 latestAcceptedPlanProposal: latestAiPlanAlert
 ? {
 id: latestAiPlanAlert.id || "",
 type: latestAiPlanAlert.type || "",
 message: latestAiPlanAlert.msg || "",
 acceptedBy: latestAiPlanAlert.acceptedBy || "",
 packetIntent: latestAiPlanAlert.packetIntent || "",
 packetVersion: latestAiPlanAlert.packetVersion || "",
 }
 : null,
 latestAcceptedCoachAction: latestAcceptedCoachAction
 ? {
 type: latestAcceptedCoachAction.type || "",
 source: latestAcceptedCoachAction.source || "",
 proposalSource: latestAcceptedCoachAction.proposalSource || "",
 acceptedBy: latestAcceptedCoachAction.acceptedBy || "",
 acceptancePolicy: latestAcceptedCoachAction.acceptancePolicy || "",
 reason: latestAcceptedCoachAction.reason || latestAcceptedCoachAction.rationale || "",
 }
 : null,
 },
 };
}, [
 TRUSTED_DEBUG_MODE,
 currentPlanWeek,
 currentWeek,
 baseWeek,
 planDay,
 coachActions,
 planAlerts,
 plannedDayRecords,
 planDaySurfaceAudit,
 todayKey,
 storageStatus,
 authError,
 analyzing,
 ]);
 const dailyBrief = generateDailyCoachBrief({ momentum, todayWorkout: effectiveTodayWorkout, arbitration, injuryState: personalization.injuryPainState, patterns, learning: learningLayer, salvage: salvageLayer });
 const dailyStory = buildUnifiedDailyStory({ todayWorkout: effectiveTodayWorkout, dailyBrief, progress: progressEngine, arbitration, expectations, salvage: salvageLayer, momentum });
 const weeklyNutritionReview = useMemo(() => buildWeeklyNutritionReview({
 anchorDateKey: todayKey,
 planDay,
 plannedDayRecords,
 nutritionActualLogs,
 }), [todayKey, planDay, plannedDayRecords, nutritionActualLogs]);
 const weeklyReview = generateWeeklyCoachReview({ momentum, arbitration, signals: computeAdaptiveSignals({ logs, bodyweights, personalization }), personalization, patterns, learning: learningLayer, nutritionActualLogs, weeklyNutritionReview, expectations, recalibration });
 const planHistoryReviewDateKeys = useMemo(
 () => Array.from(new Set([
 ...Object.keys(logs || {}),
 ...Object.keys(dailyCheckins || {}),
 ...Object.keys(plannedDayRecords || {}),
 ...Object.keys(nutritionActualLogs || {}),
 todayKey,
 ])).filter((dateKey) => dateKey && dateKey <= todayKey).sort((a, b) => b.localeCompare(a)),
 [logs, dailyCheckins, plannedDayRecords, nutritionActualLogs, todayKey]
 );
 const planHistoryDayReviews = useMemo(
 () => planHistoryReviewDateKeys
 .map((dateKey) => buildDayReview({
 dateKey,
 logs,
 dailyCheckins,
 nutritionActualLogs,
 resolvePrescribedHistory: (requestedDateKey, actualLog = null) => resolvePlannedDayHistoryEntry({
 dateKey: requestedDateKey,
 existingEntry: plannedDayRecords?.[requestedDateKey] || null,
 todayKey,
 todayPlannedDayRecord,
 legacySnapshot: actualLog?.prescribedPlanSnapshot
 ? { ...actualLog.prescribedPlanSnapshot, ts: actualLog?.ts || null }
 : null,
 planStartDate: canonicalGoalState?.planStartDate || "",
 }),
 getCurrentPrescribedDayRevision,
 getCurrentPrescribedDayRecord,
 }))
 .filter(Boolean)
 .map((review) => ({ ...review, reportSource: "Current plan history" })),
 [
 planHistoryReviewDateKeys,
 logs,
 dailyCheckins,
 nutritionActualLogs,
 plannedDayRecords,
 todayKey,
 todayPlannedDayRecord,
 canonicalGoalState?.planStartDate,
 ]
 );
 const planHistoryArchivedAudits = useMemo(
 () => (personalization?.planArchives || []).map((archive) => buildArchivedPlanAudit({ archive })).filter(Boolean),
 [personalization?.planArchives]
 );
 const planHistoryWeekSummaries = useMemo(() => {
 const currentWeekSummaries = buildHistoricalWeekAuditEntries({
 planWeekRecords,
 logs,
 weeklyCheckins,
 currentWeek,
 })
 .filter((entry) => Number(entry?.absoluteWeek || 0) <= Number(currentWeek || 0))
 .map((entry) => ({ ...entry, reportSource: "Current plan history" }));
 const archivedWeekSummaries = planHistoryArchivedAudits.flatMap((archive) => (
 Array.isArray(archive?.weekReviews)
 ? archive.weekReviews.map((entry) => ({
 ...entry,
 reportSource: `Archived plan: ${archive.label || archive.id}`,
 }))
 : []
 ));
 return [...currentWeekSummaries, ...archivedWeekSummaries];
 }, [planHistoryArchivedAudits, planWeekRecords, logs, weeklyCheckins, currentWeek]);
 const planHistoryReportReviews = useMemo(
 () => [
 ...planHistoryDayReviews,
 ...planHistoryArchivedAudits.flatMap((archive) => (
 Array.isArray(archive?.dayEntries)
 ? archive.dayEntries
 .map((entry) => entry?.review
 ? {
 ...entry.review,
 reportSource: `Archived plan: ${archive.label || archive.id}`,
 }
 : null)
 .filter(Boolean)
 : []
 )),
 ],
 [planHistoryDayReviews, planHistoryArchivedAudits]
 );
 const baseProactiveTriggers = buildProactiveTriggers({ momentum, personalization, goals: goalsModel, learning: learningLayer, nutritionActualLogs, longTermMemory }).filter(t => !dismissedTriggers.includes(t.id));
 const optimizationTrigger = optimizationLayer.experimentation.canExperiment && optimizationLayer.experimentation.pendingExperiment
 ? [{
 id: "opt_micro",
 msg: `Optional micro-test: ${optimizationLayer.experimentation.pendingExperiment.note}`,
 actionLabel: "Run micro-test",
 actionType: optimizationLayer.experimentation.pendingExperiment.type === "volume_minus_small" ? "REDUCE_WEEKLY_VOLUME" : "PROGRESS_STRENGTH_EMPHASIS",
 payload: optimizationLayer.experimentation.pendingExperiment.type === "volume_minus_small"
 ? { pct: optimizationLayer.experimentation.pendingExperiment.deltaPct, reason: "optimization_micro_test" }
 : { weeks: 1, reason: "optimization_micro_test" },
 source: "optimization",
 priority: 52,
 }]
 : [];
 const proactiveTriggers = [...optimizationTrigger, ...baseProactiveTriggers];

 useEffect(() => {
 try {
 const raw = sessionStorage.getItem(dismissedTriggerStorageKey);
 const parsed = raw ? JSON.parse(raw) : [];
 setDismissedTriggers(Array.isArray(parsed) ? parsed : []);
 } catch {
 setDismissedTriggers([]);
 }
 }, [dismissedTriggerStorageKey]);

 useEffect(() => {
 try { sessionStorage.setItem(dismissedTriggerStorageKey, JSON.stringify(dismissedTriggers || [])); } catch {}
 }, [dismissedTriggerStorageKey, dismissedTriggers]);

useEffect(() => {
 if (typeof window === "undefined") return undefined;
 if (!TRUSTED_DEBUG_MODE || !runtimeDebugSnapshot) {
  try { delete window.__trainerRuntime; } catch {}
  return undefined;
 }
 window.__trainerRuntime = runtimeDebugSnapshot;
 return () => {
  if (window.__trainerRuntime === runtimeDebugSnapshot) delete window.__trainerRuntime;
 };
}, [TRUSTED_DEBUG_MODE, runtimeDebugSnapshot]);

 const dismissTriggerForToday = (id) => {
 if (!id) return;
 setDismissedTriggers(prev => Array.from(new Set([...(prev || []), id])));
 };

 useEffect(() => {
 if (loading) return;
 const prev = JSON.stringify(personalization?.coachMemory?.longTermMemory || []);
 const next = JSON.stringify(longTermMemory || []);
 if (prev === next) return;
 const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, longTermMemory } });
 setPersonalization(updated);
 persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 }, [longTermMemory]);

 useEffect(() => {
 if (loading) return;
 const prev = JSON.stringify(personalization?.coachMemory?.compounding || {});
 const next = JSON.stringify(compoundingCoachMemory || {});
 if (prev === next) return;
 const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, compounding: compoundingCoachMemory } });
 setPersonalization(updated);
 persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 }, [compoundingCoachMemory?.summaryLine, compoundingCoachMemory?.preferredMotivationStyle, compoundingCoachMemory?.injuryHistory?.join("|"), compoundingCoachMemory?.recurringBreakdowns?.map(r => `${r.week}:${r.why}`).join("|")]);

 const setInjuryState = async (level, nextIssueState = {}) => {
 const resolvedArea = typeof nextIssueState === "string"
 ? nextIssueState
 : nextIssueState?.area || personalization.injuryPainState.area;
 const resolvedSide = typeof nextIssueState === "string"
 ? personalization.injuryPainState?.side || "unspecified"
 : nextIssueState?.side || personalization.injuryPainState?.side || "unspecified";
 const resolvedLimitations = Array.isArray(nextIssueState?.limitations)
 ? nextIssueState.limitations
 : Array.isArray(personalization.injuryPainState?.limitations)
 ? personalization.injuryPainState.limitations
 : [];
 const resolvedNotes = typeof nextIssueState === "string"
 ? (personalization.injuryPainState?.notes || "")
 : (nextIssueState?.notes ?? personalization.injuryPainState?.notes ?? "");
 const resolvedImpact = typeof nextIssueState === "string"
 ? (personalization.injuryPainState?.impact || "")
 : (nextIssueState?.impact ?? personalization.injuryPainState?.impact ?? "");
 const painScore = level === "none" ? 1 : level === "mild_tightness" ? 2 : level === "moderate_pain" ? 4 : 5;
 const injuryProfile = buildInjuryCapabilityProfile({
 ...personalization.injuryPainState,
 level,
 area: resolvedArea,
 side: resolvedSide,
 notes: resolvedNotes,
 impact: resolvedImpact,
 limitations: resolvedLimitations,
 preserveForPlanning: level !== "none",
 });
 const updated = mergePersonalization(personalization, {
 profile: {
 ...personalization.profile,
 inconsistencyRisk: momentum.inconsistencyRisk,
 currentMomentumState: momentum.momentumState,
 likelyAdherencePattern: momentum.likelyAdherencePattern,
 },
 injuryPainState: {
 ...personalization.injuryPainState,
 level,
 area: injuryProfile.area || resolvedArea,
 impact: resolvedImpact,
 side: resolvedSide,
 limitations: resolvedLimitations,
 preserveForPlanning: level !== "none",
 notes: level === "none" ? "" : resolvedNotes,
 capabilities: injuryProfile.capabilities,
 achilles: { ...personalization.injuryPainState.achilles, status: level === "none" ? "managed" : level === "mild_tightness" ? "watch" : "flared", painScore },
 activeModifications: level === "none" ? [] : buildInjuryRuleResult(todayWorkoutBase, { ...injuryProfile, level, area: injuryProfile.area || resolvedArea, side: resolvedSide, notes: resolvedNotes, impact: resolvedImpact, limitations: resolvedLimitations }).mods,
 }
 });
 setPersonalization(updated);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments);
 };
 const setEnvironmentMode = async ({ equipment, equipmentItems = [], availableDays = [], time, mode, behavior, scope = "base", clearTodayOverride = false }) => {
 const presets = personalization.environmentConfig?.presets || {};
 const baseMode = personalization.environmentConfig?.defaultMode || "Home";
 const fromMode = mode ? resolveModePreset(mode, presets) : null;
 const baseConfig = personalization.environmentConfig?.base || resolveModePreset(baseMode, presets);
 const selectedMode = mode || baseMode || "Unknown";
 const selectedEquipment = equipment || fromMode?.equipment || baseConfig.equipment || "unknown";
 const selectedTime = time || fromMode?.time || baseConfig.time || "unknown";
 const selectedBehavior = typeof behavior === "string"
 ? behavior
 : mode
 ? ""
 : scope === "today"
 ? String(personalization.environmentConfig?.todayOverride?.behavior || "")
 : scope === "week"
 ? String(personalization.environmentConfig?.weekOverride?.behavior || "")
 : String(baseConfig?.behavior || "");
 const selectedItems = Array.isArray(equipmentItems)
 ? equipmentItems
 : String(equipmentItems || "")
 .split(/[,/]/)
 .map((item) => item.trim())
 .filter(Boolean);
 const selected = { equipment: selectedEquipment, equipmentItems: selectedItems, time: selectedTime, mode: selectedMode, behavior: selectedBehavior };
 const trainingContextPatch = scope === "base"
 ? buildTrainingContextFromEditor({
 mode: selected.mode,
 equipment: selected.equipment,
 equipmentItems: selected.equipmentItems,
 availableDays,
 time: selected.time,
 })
 : null;
 const nextEnvironmentConfig = {
 ...(personalization.environmentConfig || {}),
 defaultMode: scope === "base" ? selected.mode : (personalization.environmentConfig?.defaultMode || selected.mode),
 base: scope === "base" ? selected : baseConfig,
 todayOverride: clearTodayOverride ? null : (scope === "today" ? { ...selected, date: todayKey } : (scope === "base" ? null : personalization.environmentConfig?.todayOverride || null)),
 weekOverride: scope === "week" ? { ...selected, week: currentWeek } : (scope === "base" ? null : personalization.environmentConfig?.weekOverride || null),
 };
 const draftPersonalization = mergePersonalization(personalization, { environmentConfig: nextEnvironmentConfig, trainingContext: trainingContextPatch || undefined });
 const resolvedSelection = resolveEnvironmentSelection({ personalization: draftPersonalization, todayKey, currentWeek });
 const effectiveEquipment = resolvedSelection?.equipment || selected.equipment;
 const environmentMode = resolveTravelStateEnvironmentMode({
 mode: resolvedSelection?.mode || selected.mode,
 equipment: effectiveEquipment,
 });
 const updated = mergePersonalization(draftPersonalization, {
 travelState: {
 ...draftPersonalization.travelState,
 environmentMode,
 access: environmentMode.includes("gym") ? "hotel" : environmentMode,
 },
 });
 setPersonalization(updated);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals);
 };
 const saveEnvironmentSchedule = async (schedule = []) => {
 const cleaned = (schedule || [])
 .filter(s => s?.startDate && s?.endDate && s.startDate <= s.endDate)
 .slice(0, 20);
 const updated = mergePersonalization(personalization, {
 environmentConfig: {
 ...personalization.environmentConfig,
 schedule: cleaned,
 },
 });
 setPersonalization(updated);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 };

 const applyDayContextOverride = async (contextKey) => {
 const cfg = DAY_CONTEXT_OVERRIDES[contextKey];
 if (!cfg) return;
 const appliedAt = Date.now();
 const overrideReason = String(contextKey || "day_context_override").replaceAll("_", " ");
 const dayOverrideProvenance = buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.user,
 trigger: "day_context_override",
 mutationType: "daily_override",
 revisionReason: overrideReason,
 sourceInputs: ["TodayTab", "DAY_CONTEXT_OVERRIDES"],
 timestamp: appliedAt,
 details: {
 dateKey: todayKey,
 contextKey,
 trainingType: cfg.type || "",
 },
 });
 const nutritionOverrideProvenance = buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.user,
 trigger: "day_context_override",
 mutationType: "nutrition_override",
 revisionReason: `nutrition set to ${String(cfg.nutri || "").replaceAll("_", " ")}`,
 sourceInputs: ["TodayTab", "DAY_CONTEXT_OVERRIDES"],
 timestamp: appliedAt,
 details: {
 dateKey: todayKey,
 contextKey,
 dayType: cfg.nutri || "",
 },
 });
 const nextAdjustments = {
 ...coachPlanAdjustments,
 dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}), [todayKey]: { label: cfg.label, type: cfg.type, reason: contextKey, minDay: true, fallback: cfg.fallback, success: cfg.success, injuryAdjusted: false, provenance: dayOverrideProvenance } },
 nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}), [todayKey]: { dayType: cfg.nutri, reason: contextKey, provenance: nutritionOverrideProvenance } },
 extra: { ...(coachPlanAdjustments.extra || {}), dayContext: { ...((coachPlanAdjustments.extra || {}).dayContext || {}), [todayKey]: contextKey } }
 };
 const nextNotes = { ...weekNotes, [currentWeek]: `Day override applied (${contextKey.replaceAll("_"," ")}).` };
 setCoachPlanAdjustments(nextAdjustments);
 setWeekNotes(nextNotes);
 await persistAll(logs, bodyweights, paceOverrides, nextNotes, planAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 };

 const shiftTodayWorkout = async ({ daysForward = 1, mode = "replace" } = {}) => {
 const targetDate = new Date();
 targetDate.setDate(targetDate.getDate() + Math.max(1, Math.min(6, daysForward)));
 const toKey = targetDate.toISOString().split("T")[0];
 const previousAdjustments = coachPlanAdjustments;
 const previousNotes = weekNotes;
 const existingTomorrow = coachPlanAdjustments?.dayOverrides?.[toKey];
 const shiftedAt = Date.now();
 const shiftedSessionProvenance = buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.user,
 trigger: "schedule_shift",
 mutationType: "daily_override",
 revisionReason: `Session shifted from ${todayKey} to ${toKey}.`,
 sourceInputs: ["TodayTab", "shiftTodayWorkout"],
 timestamp: shiftedAt,
 details: {
 fromDateKey: todayKey,
 toDateKey: toKey,
 mode,
 },
 });
 const shiftedSession = { ...todayWorkoutBase, label: `${todayWorkoutBase?.label || "Session"} (Shifted)`, shiftedFrom: todayKey, coachOverride: true, provenance: shiftedSessionProvenance };
 const tomorrowPayload = mode === "add_second" && existingTomorrow
 ? { ...existingTomorrow, secondSession: shiftedSession, label: `${existingTomorrow.label || "Session"} + 2nd session`, provenance: normalizeProvenanceEvent(existingTomorrow?.provenance || shiftedSessionProvenance, { trigger: "schedule_shift" }) }
 : shiftedSession;
 const recoveryOverrideProvenance = buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.user,
 trigger: "schedule_shift",
 mutationType: "daily_override",
 revisionReason: `Recovery day inserted after shifting session to ${toKey}.`,
 sourceInputs: ["TodayTab", "shiftTodayWorkout"],
 timestamp: shiftedAt,
 details: {
 fromDateKey: todayKey,
 toDateKey: toKey,
 mode,
 },
 });
 const nutritionOverrideProvenance = buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.user,
 trigger: "schedule_shift",
 mutationType: "nutrition_override",
 revisionReason: "Nutrition day downgraded to easy run after schedule shift.",
 sourceInputs: ["TodayTab", "shiftTodayWorkout"],
 timestamp: shiftedAt,
 details: {
 dateKey: todayKey,
 dayType: NUTRITION_DAY_TYPES.runEasy,
 },
 });
 const nextAdjustments = {
 ...coachPlanAdjustments,
 dayOverrides: {
 ...(coachPlanAdjustments.dayOverrides || {}),
 [toKey]: tomorrowPayload,
 [todayKey]: { label: `${todayWorkoutBase?.label || "Session"} moved to ${toKey}`, type: "rest", reason: "schedule_shift", minDay: true, fallback: `${todayWorkoutBase?.label || "Session"} moved to tomorrow`, success: "Session moved. Recovery day auto-inserted.", provenance: recoveryOverrideProvenance }
 },
 nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}), [todayKey]: { dayType: NUTRITION_DAY_TYPES.runEasy, reason: "schedule_shift", provenance: nutritionOverrideProvenance } },
 extra: { ...(coachPlanAdjustments.extra || {}), scheduleFlex: true }
 };
 const nextNotes = { ...weekNotes, [currentWeek]: `Workout shifted from ${todayKey} to ${toKey}${mode === "add_second" ? " as second session" : ""}.` };
 setCoachPlanAdjustments(nextAdjustments);
 setWeekNotes(nextNotes);
 await persistAll(logs, bodyweights, paceOverrides, nextNotes, planAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 return { previousAdjustments, previousNotes };
 };

 const restoreShiftTodayWorkout = async ({ previousAdjustments, previousNotes }) => {
 if (!previousAdjustments || !previousNotes) return;
 setCoachPlanAdjustments(previousAdjustments);
 setWeekNotes(previousNotes);
 await persistAll(logs, bodyweights, paceOverrides, previousNotes, planAlerts, personalization, coachActions, previousAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 };

 // SUPABASE STORAGE
 const authStorage = useMemo(() => createAuthStorageModule({
 safeFetchWithTimeout,
 logDiag,
 mergePersonalization,
 normalizeGoals,
 DEFAULT_PERSONALIZATION,
 DEFAULT_MULTI_GOALS,
 analytics: frictionAnalytics,
 reportSyncDiagnostic: recordSyncDiagnostic,
 adaptiveLearningStore,
 }), [adaptiveLearningStore, frictionAnalytics, recordSyncDiagnostic]);

 const { SB_URL, SB_KEY, SB_CONFIG_ERROR, localLoad, getClientCloudConfigDiagnostics } = authStorage;
 const clientCloudConfigDiagnostics = useMemo(() => {
 const base = getClientCloudConfigDiagnostics?.() || {};
 return {
 supabaseUrlConfigured: Boolean(base?.supabaseUrlConfigured || SB_URL),
 supabaseAnonKeyConfigured: Boolean(base?.supabaseAnonKeyConfigured || SB_KEY),
 supabaseUrlSource: String(base?.supabaseUrlSource || "").trim(),
 supabaseAnonKeySource: String(base?.supabaseAnonKeySource || "").trim(),
 supabaseUrlHost: String(base?.supabaseUrlHost || "").trim(),
 configError: String(SB_CONFIG_ERROR || base?.configError || "").trim(),
 };
 }, [SB_CONFIG_ERROR, SB_KEY, SB_URL, getClientCloudConfigDiagnostics]);
 useEffect(() => {
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.clientConfigState,
 at: Date.now(),
 ...clientCloudConfigDiagnostics,
 });
 }, [
 clientCloudConfigDiagnostics.configError,
 clientCloudConfigDiagnostics.supabaseAnonKeyConfigured,
 clientCloudConfigDiagnostics.supabaseAnonKeySource,
 clientCloudConfigDiagnostics.supabaseUrlConfigured,
 clientCloudConfigDiagnostics.supabaseUrlHost,
 clientCloudConfigDiagnostics.supabaseUrlSource,
 ]);
 const readLocalResumeSnapshot = () => {
 const snapshot = localLoad();
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheState,
 at: Date.now(),
 hasPendingWrites: Boolean(snapshot?.syncMeta?.pendingCloudWrite),
 lastLocalMutationTs: snapshot?.syncMeta?.lastLocalMutationTs,
 lastCloudSyncTs: snapshot?.syncMeta?.lastCloudSyncTs,
 });
 return {
 payload: snapshot,
 hasCache: Boolean(snapshot && typeof snapshot === "object"),
 hasUsableState: hasUsableLocalResumePayload(snapshot),
 };
 };
 const syncLocalResumeFlags = () => {
 const snapshot = readLocalResumeSnapshot();
 setStartupLocalResumeAvailable(snapshot.hasCache);
 setStartupUsableLocalResumeAvailable(snapshot.hasUsableState);
 return snapshot;
 };
 const resumeUsableLocalState = ({
 statusOverride = null,
 fallbackToAuthGate = false,
 } = {}) => {
 const snapshot = syncLocalResumeFlags();
 if (!TRUSTED_DEBUG_MODE) {
 if (statusOverride) applyStorageStatus(statusOverride);
 if (fallbackToAuthGate || !authSessionRef.current?.user?.id) {
 setStartupLocalResumeAccepted(false);
 }
 return false;
 }
 if (!snapshot.hasUsableState) {
 if (statusOverride && snapshot.hasCache) {
 hydrateLocalRuntimeCache({ statusOverride });
 }
 if (fallbackToAuthGate) {
 setStartupLocalResumeAccepted(false);
 }
 return false;
 }
 suspendLocalPersistenceRef.current = false;
 hydrateLocalRuntimeCache({ statusOverride });
 setStartupLocalResumeAccepted(true);
 return true;
 };
 const authRecoveryActive = Boolean(authRecoverySession?.access_token && authRecoverySession?.user?.id);
 const localResumeBypassEnabled = TRUSTED_DEBUG_MODE && startupLocalResumeAccepted;
 const authGateVisible = authRecoveryActive || (!authSession?.user?.id && !localResumeBypassEnabled);
 const authDiagnosticStatus = authInitializing
 ? "booting"
 : authRecoveryActive
 ? "recovery_pending"
 : authSession?.user?.id
 ? "active"
 : "signed_out";
 const authGateSignatureRef = useRef("");
 const readAuthInputValue = useCallback((inputRef, fallback = "") => {
 const inputValue = inputRef?.current && typeof inputRef.current.value === "string"
 ? inputRef.current.value
 : null;
 return String(inputValue ?? fallback ?? "");
 }, []);
 const readAuthFormValues = useCallback(() => ({
 email: readAuthInputValue(authEmailInputRef, authEmail).trim(),
 password: readAuthInputValue(authPasswordInputRef, authPassword),
 passwordConfirm: readAuthInputValue(authPasswordConfirmInputRef, authPasswordConfirm),
 displayName: readAuthInputValue(authDisplayNameInputRef, authDisplayName).trim(),
 }), [authDisplayName, authEmail, authPassword, authPasswordConfirm, readAuthInputValue]);
 const syncAuthFormStateFromDom = useCallback(() => {
 const nextValues = readAuthFormValues();
 if (nextValues.email !== authEmail) setAuthEmail(nextValues.email);
 if (nextValues.password !== authPassword) setAuthPassword(nextValues.password);
 if (nextValues.passwordConfirm !== authPasswordConfirm) setAuthPasswordConfirm(nextValues.passwordConfirm);
 if (nextValues.displayName !== authDisplayName) setAuthDisplayName(nextValues.displayName);
 return nextValues;
 }, [authDisplayName, authEmail, authPassword, authPasswordConfirm, readAuthFormValues]);
 const scheduleAuthAction = useCallback((action) => {
 const runAction = () => {
  try {
  const result = action?.();
  if (result && typeof result.catch === "function") {
  result.catch((error) => {
  console.error("Auth action failed", error);
  setAuthError("That action could not finish. Try again.");
  });
  }
  } catch (error) {
  console.error("Auth action failed", error);
  setAuthError("That action could not finish. Try again.");
  }
 };
 if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
  window.setTimeout(runAction, 0);
  return;
 }
 runAction();
 }, []);

 useEffect(() => {
 if (!authGateVisible) return undefined;
 const syncAutofill = () => {
 syncAuthFormStateFromDom();
 };
 syncAutofill();
 if (typeof window === "undefined") return undefined;
 const timers = [50, 250, 800, 1600].map((delay) => window.setTimeout(syncAutofill, delay));
 window.addEventListener("focus", syncAutofill);
 if (typeof document !== "undefined") {
 document.addEventListener("visibilitychange", syncAutofill);
 }
 return () => {
 timers.forEach((timerId) => window.clearTimeout(timerId));
 window.removeEventListener("focus", syncAutofill);
 if (typeof document !== "undefined") {
 document.removeEventListener("visibilitychange", syncAutofill);
 }
 };
 }, [authGateVisible, authMode, syncAuthFormStateFromDom]);

 useEffect(() => {
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.authSessionState,
 at: Date.now(),
 hasSession: Boolean(authSession?.user?.id),
 userId: String(authSession?.user?.id || ""),
 email: String(authSession?.user?.email || ""),
 hasRefreshToken: Boolean(authSession?.refresh_token),
 expiresAt: authSession?.expires_at ? Number(authSession.expires_at) * 1000 : 0,
 lastEnsureStatus: authDiagnosticStatus,
 source: authRecoveryActive ? "password_recovery" : authSession?.user?.id ? "auth_session" : "auth_gate",
 });
 }, [
 authDiagnosticStatus,
 authInitializing,
 authRecoveryActive,
 authSession?.expires_at,
 authSession?.refresh_token,
 authSession?.user?.email,
 authSession?.user?.id,
 ]);

 useEffect(() => {
 if (!authGateVisible) {
 authGateSignatureRef.current = "";
 return;
 }
 const signature = [
 authMode,
 authRecoveryActive ? "recovery" : "standard",
 startupUsableLocalResumeAvailable ? "resume" : "blank",
 SB_CONFIG_ERROR ? "provider_unavailable" : "provider_ready",
 ].join("|");
 if (authGateSignatureRef.current === signature) return;
 authGateSignatureRef.current = signature;
 trackFrictionEvent({
 flow: "auth",
 action: "gate_view",
 outcome: "viewed",
 props: {
 mode: authMode,
 recovery_active: authRecoveryActive,
 local_resume_available: startupUsableLocalResumeAvailable,
 provider_ready: !SB_CONFIG_ERROR,
 },
 });
 }, [SB_CONFIG_ERROR, authGateVisible, authMode, authRecoveryActive, startupUsableLocalResumeAvailable]);

 const handleSignIn = async () => {
 const authValues = syncAuthFormStateFromDom();
 if (!authValues.email || !String(authValues.password || "").trim()) {
 setAuthError("Enter your email and password first.");
 return;
 }
 suspendLocalPersistenceRef.current = false;
 setAuthNotice("");
 authStorage.clearPasswordRecoverySession?.();
 setAuthRecoverySession(null);
 setAuthPasswordConfirm("");
 trackFrictionEvent({
 flow: "auth",
 action: "sign_in",
 outcome: "requested",
 props: {
 mode: authMode,
 },
 });
 await authStorage.handleSignIn({
 authEmail: authValues.email,
 authPassword: authValues.password,
 setAuthError,
 setAuthSession,
 });
 };

 const handleSignUp = async () => {
 const authValues = syncAuthFormStateFromDom();
 if (!authValues.displayName || !authValues.email || !String(authValues.password || "").trim()) {
 setAuthError("Enter your name, email, and password first.");
 return;
 }
 suspendLocalPersistenceRef.current = false;
 setAuthNotice("");
 authStorage.clearPasswordRecoverySession?.();
 setAuthRecoverySession(null);
 setAuthPasswordConfirm("");
 trackFrictionEvent({
 flow: "auth",
 action: "sign_up",
 outcome: "requested",
 props: {
 mode: authMode,
 },
 });
 const result = await authStorage.handleSignUp({
 authEmail: authValues.email,
 authPassword: authValues.password,
 authProfile: {
 displayName: authValues.displayName,
 units: authUnits,
 timezone: authTimezone,
 },
 setAuthError,
 setAuthNotice,
 setAuthSession,
 redirectTo: buildAuthReturnRedirectUrl(),
 });
 if (result?.ok) {
 setPersonalization((current) => mergePersonalization(current, {
 profile: {
 ...current?.profile,
 name: authValues.displayName || current?.profile?.name || DEFAULT_PERSONALIZATION.profile.name,
 timezone: String(authTimezone || "").trim() || current?.profile?.timezone || DEFAULT_PERSONALIZATION.profile.timezone,
 profileSetupComplete: false,
 },
 settings: {
 ...(current?.settings || DEFAULT_PERSONALIZATION.settings),
 units: authUnits === "metric"
 ? { weight: "kg", height: "cm", distance: "kilometers" }
 : { weight: "lbs", height: "ft_in", distance: "miles" },
 },
 }));
 if (result?.needsEmailConfirmation) {
 setAuthPendingConfirmationEmail(String(result?.pendingConfirmationEmail || authValues.email || "").trim());
 setAuthMode("signin");
 setAuthPassword("");
 } else if (result?.alreadyRegistered) {
 setAuthPendingConfirmationEmail("");
 setAuthMode("signin");
 setAuthPassword("");
 } else {
 setAuthPendingConfirmationEmail("");
 }
 }
 };

 const buildAuthReturnRedirectUrl = () => {
 if (typeof window === "undefined") return "";
 return `${window.location.origin}${window.location.pathname}`;
 };

 const exitPasswordRecovery = ({ keepNotice = false, keepError = false } = {}) => {
 authStorage.clearPasswordRecoverySession?.();
 setAuthRecoverySession(null);
 setAuthMode("signin");
 setAuthPassword("");
 setAuthPasswordConfirm("");
 if (!keepError) setAuthError("");
 if (!keepNotice) setAuthNotice("");
 };

 const handleForgotPassword = async ({ source = "auth_gate", emailOverride = "" } = {}) => {
 if (authPasswordResetBusy) return;
 const authValues = syncAuthFormStateFromDom();
 setAuthPasswordResetBusy(true);
 trackFrictionEvent({
 flow: "auth",
 action: "forgot_password",
 outcome: "requested",
 props: {
 source,
 },
 });
 try {
 await authStorage.handleForgotPassword({
 authEmail: emailOverride || authValues.email,
 setAuthError,
 setAuthNotice,
 redirectTo: buildAuthReturnRedirectUrl(),
 });
 } finally {
 setAuthPasswordResetBusy(false);
 }
 };

 const handleResendSignupConfirmation = async ({ source = "auth_gate" } = {}) => {
 if (authConfirmationResendBusy) return;
 setAuthConfirmationResendBusy(true);
 const authValues = syncAuthFormStateFromDom();
 const pendingEmail = String(authPendingConfirmationEmail || authValues.email || "").trim();
 trackFrictionEvent({
 flow: "auth",
 action: "resend_confirmation",
 outcome: "requested",
 props: {
 source,
 },
 });
 try {
 const result = await authStorage.handleResendSignupConfirmation({
 authEmail: pendingEmail,
 setAuthError,
 setAuthNotice,
 redirectTo: buildAuthReturnRedirectUrl(),
 });
 if (result?.ok) {
 setAuthPendingConfirmationEmail(pendingEmail);
 }
 } finally {
 setAuthConfirmationResendBusy(false);
 }
 };

 const handlePasswordRecoverySubmit = async () => {
 if (authRecoveryBusy) return;
 const authValues = syncAuthFormStateFromDom();
 const trimmedPassword = String(authValues.password || "");
 if (!authRecoverySession?.access_token || !authRecoverySession?.user?.id) {
 setAuthError("This reset link is no longer valid. Request a new one.");
 exitPasswordRecovery({ keepError: true });
 return;
 }
 setAuthError("");
 setAuthNotice("");
 if (!trimmedPassword.trim()) {
 setAuthError("Enter a new password first.");
 return;
 }
 if (trimmedPassword.length < 8) {
 setAuthError("Choose a password with at least 8 characters.");
 return;
 }
 if (trimmedPassword !== String(authValues.passwordConfirm || "")) {
 setAuthError("Passwords do not match yet.");
 return;
 }
 setAuthRecoveryBusy(true);
 trackFrictionEvent({
 flow: "auth",
 action: "password_reset_complete",
 outcome: "requested",
 props: {
 source: "recovery_link",
 },
 });
 try {
 const result = await authStorage.handlePasswordRecoveryUpdate({
 recoverySession: authRecoverySession,
 nextPassword: trimmedPassword,
 setAuthError,
 });
 if (result?.ok) {
 const recoveryEmail = String(authRecoverySession?.user?.email || authEmail || "").trim();
 exitPasswordRecovery({ keepNotice: true });
 if (recoveryEmail) setAuthEmail(recoveryEmail);
 setAuthNotice("Password updated. Sign in with your new password.");
 }
 } finally {
 setAuthRecoveryBusy(false);
 }
 };

 const handleSignOut = () => {
 const localResumeSnapshot = readLocalResumeSnapshot();
 trackFrictionEvent({
 flow: "auth",
 action: "sign_out",
 outcome: "requested",
 props: {
 has_local_resume: localResumeSnapshot.hasUsableState,
 },
 });
 authStorage.handleSignOut({ authSession, setAuthSession, setStorageStatus });
 authStorage.clearPasswordRecoverySession?.();
 setAuthMode("signin");
 setAuthError("");
 setAuthNotice("");
 setAuthRecoverySession(null);
 setAuthPasswordConfirm("");
 const resumedLocally = resumeUsableLocalState({
 statusOverride: buildStorageStatus({
 mode: "local",
 label: "SIGNED OUT",
 reason: STORAGE_STATUS_REASONS.signedOut,
 detail: "Cloud sync is paused until you sign back in.",
 }),
 fallbackToAuthGate: true,
 });
 if (!resumedLocally) {
 syncLocalResumeFlags();
 }
 return { ok: true };
 };

 const resetRuntimeAfterAccountRemoval = () => {
 suspendLocalPersistenceRef.current = true;
 const resetPersonalization = mergePersonalization(DEFAULT_PERSONALIZATION, {
 profile: {
 ...DEFAULT_PERSONALIZATION.profile,
 onboardingComplete: false,
 },
 });
 setLogs({});
 setBodyweights([]);
 setDailyCheckins({});
 setPlannedDayRecords({});
 setPlanWeekRecords({});
 setWeeklyCheckins({});
 setGoals(normalizeGoals(DEFAULT_MULTI_GOALS));
 setPersonalization(resetPersonalization);
 setCoachActions([]);
 setCoachPlanAdjustments(DEFAULT_COACH_PLAN_ADJUSTMENTS);
 setNutritionFavorites(DEFAULT_NUTRITION_FAVORITES);
 setNutritionActualLogs({});
 setPaceOverrides({});
 setWeekNotes({});
 setPlanAlerts([]);
 setTab(0);
 setAuthError("");
 setAuthNotice("");
 setStartupLocalResumeAccepted(false);
 setStartupLocalResumeAvailable(false);
 setStartupUsableLocalResumeAvailable(false);
 };

 const handleResetThisDevice = () => {
 trackFrictionEvent({
 flow: "settings",
 action: "reset_device",
 outcome: "requested",
 props: {
 had_auth_session: Boolean(authSession?.user?.id),
 },
 });
 authStorage.handleSignOut({ authSession, setAuthSession, setStorageStatus });
 authStorage.clearCachedAuthSession();
 authStorage.clearLocalCache();
 resetRuntimeAfterAccountRemoval();
 applyStorageStatus(buildStorageStatus({
 mode: "local",
 label: "DEVICE RESET",
 reason: STORAGE_STATUS_REASONS.deviceReset,
 detail: "Local data was cleared from this device. Sign in to reload cloud data or create an account to start again.",
 }));
 return { ok: true };
 };

 const handleDeleteAccount = async () => {
 trackFrictionEvent({
 flow: "auth",
 action: "delete_account",
 outcome: "requested",
 props: {
 has_auth_session: Boolean(authSession?.user?.id),
 },
 });
 try {
 const result = await authStorage.handleDeleteAccount({
 authSession,
 setAuthSession,
 setStorageStatus,
 setAuthError,
 clearLocalData: async () => {
 resetRuntimeAfterAccountRemoval();
 },
 });
 return { ok: true, data: result };
 } catch (error) {
 const shouldReclassifyStorage = error?.code !== "delete_account_not_configured";
 if (shouldReclassifyStorage) {
 const nextStatus = classifyStorageError(error);
 applyStorageStatus(nextStatus);
 }
 const diagnosticsCode = getDiagnosticsCode(error, "delete_account_failed");
 const authMessage = getNormalizedStorageUserCopy(
 error,
 "Account deletion could not finish right now. This device is still using its saved local copy."
 );
 if (error && typeof error === "object") {
 error.userMessage = authMessage;
 error.diagnosticsCode = diagnosticsCode;
 }
 logDiag("auth.delete.failed", diagnosticsCode);
 setAuthError(authMessage);
 return { ok: false, error };
 }
 };

 const buildPersistedPersonalization = (draftPersonalization = personalization, draftGoals = goals) => {
 const canonicalForPersist = deriveCanonicalAthleteState({
 goals: draftGoals,
 personalization: draftPersonalization,
 profileDefaults: PROFILE,
 });
 return withLegacyGoalProfileCompatibility({
 personalization: draftPersonalization,
 canonicalAthlete: canonicalForPersist,
 });
 };

 const applyCanonicalRuntimeState = (runtimeState) => {
 applyCanonicalRuntimeStateSetters({
 runtimeState,
 setters: {
 setLogs,
 setBodyweights,
 setPaceOverrides,
 setWeekNotes,
 setPlanAlerts,
 setPersonalization,
 setGoals,
 setCoachActions,
 setCoachPlanAdjustments,
 setDailyCheckins,
 setPlannedDayRecords,
 setPlanWeekRecords,
 setWeeklyCheckins,
 setNutritionFavorites,
 setNutritionActualLogs,
 },
 });
 };

 const noteCloudSyncStarted = (source = "sync") => {
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncStarted,
 source,
 at: Date.now(),
 });
 };

 const noteCloudSyncSucceeded = (source = "sync") => {
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncSucceeded,
 source,
 at: Date.now(),
 });
 };

 const noteCloudSyncFailed = ({ source = "sync", error = null, status = null } = {}) => {
 const reason = String(status?.reason || "").trim();
 const errorCode = classifyFrictionErrorCode(error || status?.reason || "sync_failed");
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncFailed,
 source,
 at: Date.now(),
 errorCode,
 errorMessage: String(error?.message || status?.detail || "").trim(),
 retryEligible: reason === STORAGE_STATUS_REASONS.transient,
 conflictDetected: reason === STORAGE_STATUS_REASONS.dataIncompatible,
 fatalErrorCode: reason === STORAGE_STATUS_REASONS.providerUnavailable ? errorCode : "",
 pendingLocalWrites: Boolean(authSessionRef.current?.user?.id),
 });
 };

 persistExecutorRef.current = async (request = {}) => {
 if (suspendLocalPersistenceRef.current) {
 return {
 ok: false,
 skipped: true,
 stale: true,
 reason: "persistence_suspended",
 };
 }
 const requestUserId = String(request?.userId || "").trim();
 const currentUserId = String(authSessionRef.current?.user?.id || "").trim();
 if (requestUserId !== currentUserId) {
 return {
 ok: false,
 skipped: true,
 stale: true,
 reason: "auth_user_changed",
 };
 }
 const effectiveAuthSession = authSessionRef.current || request?.authSession || null;
 const shouldAttemptCloudPersist = Boolean(
 currentUserId
 && request?.payload?.personalization?.profile?.onboardingComplete
 );
 if (shouldAttemptCloudPersist) {
 markLocalMutation();
 noteCloudSyncStarted("persist_all");
 }
 const persistResult = await authStorage.persistAll({
 payload: request?.payload || {},
 authSession: effectiveAuthSession,
 setStorageStatus,
 setAuthSession,
 });
 if (!shouldAttemptCloudPersist) return persistResult;
 if (persistResult?.stale) return persistResult;
 if (persistResult?.ok && persistResult?.synced) {
 noteCloudSyncSucceeded("persist_all");
 return persistResult;
 }
 if (!persistResult?.ok) {
 noteCloudSyncFailed({
 source: "persist_all",
 error: persistResult?.error || null,
 status: persistResult?.status || null,
 });
 }
 return persistResult;
 };

 const persistAll = async (newLogs, newBW, newOvr, newNotes, newAlerts, newPersonalization = personalization, newCoachActions = coachActions, newCoachPlanAdjustments = coachPlanAdjustments, newGoals = goals, newDailyCheckins = dailyCheckins, newWeeklyCheckins = weeklyCheckins, newNutritionFavorites = nutritionFavorites, newNutritionActualLogs = nutritionActualLogs, newPlannedDayRecords = plannedDayRecords, newPlanWeekRecords = planWeekRecords) => {
 if (suspendLocalPersistenceRef.current) {
 return {
 ok: false,
 skipped: true,
 stale: true,
 reason: "persistence_suspended",
 };
 }
 const normalizedGoalPayload = normalizeGoals(newGoals || []);
 const runtimeState = buildCanonicalRuntimeState({
 logs: newLogs,
 bodyweights: newBW,
 paceOverrides: newOvr,
 weekNotes: newNotes,
 planAlerts: newAlerts,
 personalization: newPersonalization,
 goals: normalizedGoalPayload,
 coachActions: newCoachActions,
 coachPlanAdjustments: newCoachPlanAdjustments,
 dailyCheckins: newDailyCheckins,
 plannedDayRecords: newPlannedDayRecords,
 planWeekRecords: newPlanWeekRecords,
 weeklyCheckins: newWeeklyCheckins,
 nutritionFavorites: newNutritionFavorites,
 nutritionActualLogs: newNutritionActualLogs,
 });
 validateCanonicalRuntimeStateInvariant(runtimeState, "persistAll.buildCanonicalRuntimeState");
 const payload = buildPersistedTrainerPayload({
 runtimeState,
 transformPersonalization: (draftPersonalization) => buildPersistedPersonalization(draftPersonalization, normalizedGoalPayload),
 });
 const requestUserId = String(authSessionRef.current?.user?.id || authSession?.user?.id || "").trim();
 return (
 persistQueueRef.current?.enqueue({
 key: createPersistedPayloadFingerprint(payload),
 ownerId: requestUserId,
 request: {
 payload,
 authSession,
 userId: requestUserId,
 },
 })
 || persistExecutorRef.current?.({
 payload,
 authSession,
 userId: requestUserId,
 })
 );
 };

 const hydrateLocalRuntimeCache = ({ statusOverride = null } = {}) => {
 const cache = localLoad();
 const hasCache = Boolean(cache && typeof cache === "object");
 const hasUsableState = hasUsableLocalResumePayload(cache);
 setStartupLocalResumeAvailable(hasCache);
 setStartupUsableLocalResumeAvailable(hasUsableState);
 if (hasCache) {
 try {
 const cachedRuntimeState = buildCanonicalRuntimeStateFromStorage({
 storedPayload: cache,
 mergePersonalization,
 DEFAULT_PERSONALIZATION,
 normalizeGoals,
 DEFAULT_MULTI_GOALS,
 });
 validateCanonicalRuntimeStateInvariant(cachedRuntimeState, "buildCanonicalRuntimeStateFromStorage.startup");
 applyCanonicalRuntimeState(cachedRuntimeState);
 } catch (cacheErr) {
 logDiag("startup.local_cache.import_failed", cacheErr?.message || "unknown");
 }
 }
 if (statusOverride) applyStorageStatus(statusOverride);
 return hasUsableState;
 };

 const sbLoad = async ({ source = "cloud_reload" } = {}) => {
 if (authSession?.user?.id) noteCloudSyncStarted(source);
 try {
 const loadResult = await authStorage.sbLoad({
 authSession,
 setAuthSession,
 setters: {
 setLogs,
 setBodyweights,
 setPaceOverrides,
 setWeekNotes,
 setPlanAlerts,
 setPersonalization,
 setGoals,
 setCoachActions,
 setCoachPlanAdjustments,
 setDailyCheckins,
 setPlannedDayRecords,
 setPlanWeekRecords,
 setWeeklyCheckins,
 setNutritionFavorites,
 setNutritionActualLogs,
 },
 persistAll,
 });
 if (loadResult?.stale) return loadResult;
 if (authSession?.user?.id) noteCloudSyncSucceeded(source);
 return loadResult;
 } catch (error) {
 if (authSession?.user?.id) {
 noteCloudSyncFailed({
 source,
 error,
 status: classifyStorageError(error),
 });
 }
 throw error;
 }
 };

 const markLocalMutation = () => {
 lastLocalMutationAtRef.current = Date.now();
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.localMutationRecorded,
 at: lastLocalMutationAtRef.current,
 signedIn: Boolean(authSessionRef.current?.user?.id),
 });
 };

const LOCAL_MUTATION_GUARD_MS = 8000;
const isRecentLocalMutation = () => (Date.now() - Number(lastLocalMutationAtRef.current || 0)) < LOCAL_MUTATION_GUARD_MS;

 const scheduleRealtimeResync = (reason = "realtime_change") => {
 if (authInitializing || !authSessionRef.current?.user?.id) return;
 if (realtimeResyncTimerRef.current) clearTimeout(realtimeResyncTimerRef.current);
 realtimeResyncTimerRef.current = setTimeout(async () => {
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncAttempt,
 reason,
 at: Date.now(),
 });
 try {
 skipNextGoalsPersistRef.current = true;
 const loadResult = await (sbLoadRef.current?.({ source: "realtime_resync" }) || Promise.resolve());
 if (loadResult?.stale) {
 skipNextGoalsPersistRef.current = false;
 return;
 }
 applyStorageStatus(buildStorageStatus({ mode: "cloud", label: "SYNCED", reason: STORAGE_STATUS_REASONS.synced, detail: "Cloud sync is working normally." }));
 logDiagRef.current?.("realtime.resync.ok", reason);
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncResult,
 ok: true,
 reason,
 at: Date.now(),
 });
 } catch (e) {
 skipNextGoalsPersistRef.current = false;
 logDiagRef.current?.("realtime.resync.failed", reason, e?.message || "unknown");
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncResult,
 ok: false,
 reason,
 httpStatus: e?.httpStatus,
 supabaseErrorCode: e?.supabaseErrorCode || e?.code || "",
 errorMessage: e?.message || "",
 at: Date.now(),
 });
 }
 }, 900);
 };

 const getPlannedDayHistoryForDate = (dateKey, logEntry = null) => {
 const hasHistoricalNeed = Boolean(
 logEntry
 || dailyCheckins?.[dateKey]
 || nutritionActualLogs?.[dateKey]
 );
 // LEGACY_COMPAT: history lookup prefers canonical prescribed-day entries,
 // but still backfills older snapshots/schedule rows for pre-migration dates.
 return resolvePlannedDayHistoryEntry({
 dateKey,
 existingEntry: plannedDayRecords?.[dateKey] || null,
 todayKey,
 todayPlannedDayRecord,
 legacySnapshot: logEntry?.prescribedPlanSnapshot
 ? { ...logEntry.prescribedPlanSnapshot, ts: logEntry?.ts || null }
 : null,
 allowScheduleFallback: hasHistoricalNeed,
 planStartDate: canonicalGoalState?.planStartDate || "",
 });
 };

 const getPlannedDayRecordForDate = (dateKey, logEntry = null) => getCurrentPrescribedDayRecord(
 getPlannedDayHistoryForDate(dateKey, logEntry)
 );

 const decorateLogEntryWithPlanContext = ({
  dateKey,
  entry = null,
  dailyCheckin = {},
  plannedDayHistoryOverride = null,
  plannedDayRecordOverride = null,
 } = {}) => {
 if (!dateKey || !entry) return entry;
 const exercisePerformance = getExercisePerformanceRecordsForLog(entry || {}, { dateKey });
 const plannedDayHistory = plannedDayHistoryOverride || getPlannedDayHistoryForDate(dateKey, entry);
 const plannedDayRecord = plannedDayRecordOverride || getCurrentPrescribedDayRecord(plannedDayHistory);
 const shouldIgnoreDailyOutcome = !entry?.actualSession?.status && !entry?.checkin?.status && (
 Number(entry?.miles || 0) > 0
 || Number(entry?.runTime || 0) > 0
 || exercisePerformance.length > 0
 || Boolean(String(entry?.type || "").trim())
 );
 const comparisonDailyCheckin = shouldIgnoreDailyOutcome
 ? { ...(dailyCheckin || {}), status: "not_logged" }
 : dailyCheckin;
 const comparison = comparePlannedDayToActual({
 plannedDayRecord,
 actualLog: entry,
 dailyCheckin: comparisonDailyCheckin,
 dateKey,
 });
 const legacyStatus = comparison.completionKind === "as_prescribed"
 ? "completed_as_planned"
 : comparison.completionKind === "modified" || comparison.completionKind === "custom_session"
 ? "completed_modified"
 : comparison.completionKind === "skipped"
 ? "skipped"
 : (entry?.checkin?.status || "");
 const actualStatus = legacyStatus || comparison.status;
 const sessionType = String(entry?.actualSession?.sessionType || entry?.type || "").trim();
 const sessionLabel = String(entry?.actualSession?.sessionLabel || entry?.type || entry?.label || sessionType || "Session").trim();
 return normalizeLogPerformanceState({
 dateKey,
 logEntry: {
 ...entry,
 planDayId: entry?.planDayId || plannedDayRecord?.id || "",
 planReference: buildPlanReference(plannedDayHistory || plannedDayRecord) || entry?.planReference || null,
 prescribedPlanSnapshot: entry?.prescribedPlanSnapshot || buildLegacyPlanSnapshot(plannedDayHistory || plannedDayRecord),
 actualSession: {
 ...(entry?.actualSession || {}),
 status: actualStatus,
 completionKind: comparison.completionKind,
 sessionType,
 sessionLabel,
 customSession: Boolean(comparison.customSession),
 modifiedFromPlan: comparison.differenceKind !== "none" && comparison.differenceKind !== "pending" && comparison.differenceKind !== "unknown",
 loggedAt: entry?.actualSession?.loggedAt || entry?.editedAt || entry?.ts || Date.now(),
 },
 comparison,
 checkin: {
 ...(entry?.checkin || {}),
 ...(legacyStatus ? { status: legacyStatus } : {}),
 ...(dailyCheckin?.sessionFeel ? { sessionFeel: dailyCheckin.sessionFeel } : {}),
 ...(dailyCheckin?.blocker ? { blocker: dailyCheckin.blocker } : {}),
 ...(dailyCheckin?.note ? { note: dailyCheckin.note } : {}),
 ...(entry?.feel ? { feelRating: String(entry.feel) } : {}),
 ts: Date.now(),
 },
 ts: Date.now(),
 },
 });
 };

 const buildRealtimeLogEntry = (row = {}, existing = {}) => {
 const dateKey = String(row?.date || existing?.date || "").split("T")[0];
 const exercises = Array.isArray(row?.exercises) ? row.exercises : (existing?.strengthPerformance || []);
 const feelRating = row?.feel_rating ?? existing?.feel ?? existing?.checkin?.feelRating ?? "3";
 const inferredType = existing?.type
 || exercises?.[0]?.exercise
 || (Number(row?.distance_mi || 0) > 0 ? "Run" : "")
 || "Logged session";
 const completionStatus = row?.completion_status || existing?.actualSession?.status || existing?.checkin?.status || "";
 return normalizeLogPerformanceState({
 dateKey,
 logEntry: {
 ...existing,
 date: dateKey,
 type: inferredType,
 miles: row?.distance_mi ?? existing?.miles ?? "",
 runTime: row?.duration_min ?? existing?.runTime ?? "",
 feel: String(feelRating || "3"),
 notes: row?.note ?? existing?.notes ?? "",
 strengthPerformance: exercises,
 healthMetrics: row?.avg_hr ? { ...(existing?.healthMetrics || {}), avgHr: Number(row.avg_hr) } : (existing?.healthMetrics || null),
 actualSession: {
 ...(existing?.actualSession || {}),
 ...(completionStatus ? { status: completionStatus } : {}),
 sessionType: existing?.actualSession?.sessionType || inferredType,
 sessionLabel: existing?.actualSession?.sessionLabel || inferredType,
 loggedAt: existing?.actualSession?.loggedAt || Date.now(),
 },
 checkin: {
 ...(existing?.checkin || {}),
 ...(completionStatus ? { status: completionStatus } : {}),
 ts: Date.now(),
 },
 ts: Date.now(),
 syncedFromRealtime: true,
 },
 });
 };

 useEffect(() => {
 if (loading) return;
 const relevantDateKeys = Array.from(new Set([
 todayKey,
 ...Object.keys(logs || {}),
 ...Object.keys(dailyCheckins || {}),
 ...Object.keys(nutritionActualLogs || {}),
 ...Object.keys(plannedDayRecords || {}),
 ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
 let changed = false;
 const nextPlannedDayRecords = { ...(plannedDayRecords || {}) };

 relevantDateKeys.forEach((dateKey) => {
 const existingEntry = nextPlannedDayRecords?.[dateKey] || null;
 const normalizedExisting = normalizePrescribedDayHistoryEntry(dateKey, existingEntry);
 const hadExisting = Boolean(existingEntry);
 if (normalizedExisting && JSON.stringify(normalizedExisting) !== JSON.stringify(existingEntry || null)) {
 nextPlannedDayRecords[dateKey] = normalizedExisting;
 changed = true;
 }
 if (dateKey === todayKey && todayPlannedDayRecord) {
 const currentHistoryEntry = nextPlannedDayRecords?.[dateKey] || normalizedExisting;
 const { nextEntry, changed: revisionChanged } = upsertPrescribedDayHistoryEntry({
 dateKey,
 existingEntry: currentHistoryEntry,
 plannedDayRecord: todayPlannedDayRecord,
 capturedAt: currentHistoryEntry ? Date.now() : getStableCaptureAtForDate(dateKey),
 sourceType: "plan_day_engine",
 durability: PRESCRIBED_DAY_DURABILITY.durable,
 reason: currentHistoryEntry
 ? (todayPlannedDayRecord?.decision?.modifiedFromBase ? "same_day_adjustment" : "daily_decision_refresh")
 : "daily_decision_capture",
 validateInvariant: validatePrescribedDayHistoryInvariant,
 });
 if (nextEntry && JSON.stringify(nextEntry) !== JSON.stringify(nextPlannedDayRecords?.[dateKey] || null)) {
 nextPlannedDayRecords[dateKey] = nextEntry;
 changed = true;
 } else if (revisionChanged && !hadExisting) {
 changed = true;
 }
 return;
 }
 if (nextPlannedDayRecords?.[dateKey]) return;
 // FALLBACK_ONLY: backfill only when historical context exists and no
 // canonical prescribed-day record has been committed for that date.
 const backfilledEntry = getPlannedDayHistoryForDate(dateKey, logs?.[dateKey] || null);
 if (backfilledEntry) {
 nextPlannedDayRecords[dateKey] = backfilledEntry;
 changed = true;
 }
 });

 if (!changed) return;
 setPlannedDayRecords(nextPlannedDayRecords);
 persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs, nextPlannedDayRecords);
 }, [
 loading,
 todayKey,
 todayPlannedDayRecord,
 plannedDayRecords,
 logs,
 dailyCheckins,
 nutritionActualLogs,
 bodyweights,
 paceOverrides,
 weekNotes,
 planAlerts,
 personalization,
 coachActions,
 coachPlanAdjustments,
 goals,
 weeklyCheckins,
 nutritionFavorites,
 ]);

 const syncSessionLogShadowRow = async (dateKey, entry = null) => {
 if (!authSession?.user?.id || !dateKey) return;
 try {
 await authStorage.syncSessionLogForDate({ dateKey, entry, authSession, setAuthSession });
 } catch (e) {
 logDiag("session_logs sync failed", e?.message || "unknown");
 }
 };

useEffect(() => {
authSessionRef.current = authSession;
}, [authSession]);

useEffect(() => {
 const nextUserId = String(authSession?.user?.id || "").trim();
 if (authSessionUserIdRef.current === nextUserId) return;
 authSessionUserIdRef.current = nextUserId;
 persistQueueRef.current?.invalidateQueued({
 ok: false,
 skipped: true,
 stale: true,
 reason: nextUserId ? "auth_user_changed" : "signed_out",
 });
 authStorage.invalidatePersistenceLifecycle?.({
 resetFingerprints: false,
 resetTransientCooldown: nextUserId === "",
 bumpLocalFence: nextUserId === "",
 });
}, [authStorage, authSession?.user?.id]);

 useEffect(() => {
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.authStateChanged,
 hasAuthSession: Boolean(authSession?.user?.id),
 at: Date.now(),
 });
 }, [authSession?.user?.id]);

 useEffect(() => {
 if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
 const updateOnlineState = () => {
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.onlineStatusChanged,
 isOnline: navigator?.onLine !== false,
 at: Date.now(),
 });
 };
 updateOnlineState();
 window.addEventListener("online", updateOnlineState);
 window.addEventListener("offline", updateOnlineState);
 return () => {
 window.removeEventListener("online", updateOnlineState);
 window.removeEventListener("offline", updateOnlineState);
 };
 }, []);

 useEffect(() => {
 sbLoadRef.current = sbLoad;
 }, [sbLoad]);

 useEffect(() => {
 logDiagRef.current = logDiag;
 }, [logDiag]);

 useEffect(() => {
 console.log("[supabase] resolved URL:", SB_URL || "(missing)");
 if (SB_CONFIG_ERROR) {
 const localSnapshot = localLoad();
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadResult,
 ok: false,
 endpoint: "deployment_env",
 method: "BOOT",
 source: "provider_boot",
 supabaseErrorCode: "provider_unavailable",
 errorMessage: SB_CONFIG_ERROR,
 retryEligible: false,
 pendingLocalWrites: Boolean(localSnapshot?.syncMeta?.pendingCloudWrite),
 at: Date.now(),
 });
 const providerStatus = buildStorageStatus({
 mode: "local",
 label: "PROVIDER ERROR",
 reason: STORAGE_STATUS_REASONS.providerUnavailable,
 detail: "Cloud sync provider is unavailable or misconfigured.",
 });
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncFailed,
 at: Date.now(),
 retryEligible: false,
 fatalErrorCode: "provider_unavailable",
 errorCode: "provider_unavailable",
 errorMessage: "Cloud sync provider is unavailable or misconfigured.",
 });
 setAuthError(
 DEBUG_MODE
 ? `Cloud sign-in is unavailable right now. Your account is still required before FORMA can reopen local data on this device. (${SB_CONFIG_ERROR})`
 : "Cloud sign-in is unavailable right now. Your account is still required before FORMA can reopen local data on this device."
 );
 resumeUsableLocalState({ statusOverride: providerStatus, fallbackToAuthGate: true });
 bootPersistenceReadyRef.current = true;
 setAuthInitializing(false);
 setLoading(false);
 return;
 }
 (async () => {
 let restoredAuthSession = null;
 const recoveryResult = await authStorage.resolvePasswordRecoverySession?.();
 if (recoveryResult?.ok && recoveryResult?.session?.user?.id) {
 setAuthRecoverySession(recoveryResult.session);
 setAuthMode("recovery");
 setAuthEmail(String(recoveryResult.session?.user?.email || ""));
 setAuthPassword("");
 setAuthPasswordConfirm("");
 setAuthError("");
 setAuthNotice("Choose a new password to finish the reset.");
 setStartupLocalResumeAccepted(false);
 bootPersistenceReadyRef.current = true;
 setAuthInitializing(false);
 setLoading(false);
 return;
 }
 if (recoveryResult?.error && !recoveryResult?.session?.user?.id) {
 setAuthError("This reset link is no longer valid. Request a fresh one and try again.");
 }
 const restored = authStorage.loadAuthSession();
 if (restored) {
 const ensured = await authStorage.ensureValidSession(restored, { reason: "app_boot" });
 if (ensured?.session?.user?.id) {
 restoredAuthSession = ensured.session;
 setAuthSession(ensured.session);
 authStorage.saveAuthSession(ensured.session);
 logDiag("auth.boot.restored", ensured.status);
 } else if (ensured?.status === "refresh_failed" || ensured?.status === "refresh_missing" || ensured?.status === "missing") {
 setAuthSession(null);
 authStorage.saveAuthSession(null);
 setAuthError("Session expired. Please sign in again.");
 logDiag("auth.boot.expired", ensured?.status);
 } else {
 logDiag("auth.boot.transient_or_unknown", ensured?.status);
 }
 }
 if (!restoredAuthSession?.user?.id) {
 const localSnapshot = syncLocalResumeFlags();
 if (localSnapshot.hasUsableState) {
 const signedOutStatus = buildStorageStatus({
 mode: "local",
 label: "NOT SIGNED IN",
 reason: STORAGE_STATUS_REASONS.notSignedIn,
 detail: "Your last saved local copy is still on this device, but sign-in is required before FORMA can reopen it.",
 });
 if (TRUSTED_DEBUG_MODE) {
 resumeUsableLocalState({
 statusOverride: signedOutStatus,
 fallbackToAuthGate: false,
 });
 } else {
 applyStorageStatus(signedOutStatus);
 setStartupLocalResumeAccepted(false);
 }
 }
 }
  const restoredSignedInSession = Boolean(restoredAuthSession?.user?.id);
  // Keep boot persistence suspended until signed-in cloud hydration finishes.
  // Otherwise the default empty runtime can briefly persist over a valid seed.
  bootPersistenceReadyRef.current = !restoredSignedInSession;
  setAuthInitializing(false);
  if (!restoredSignedInSession) {
    setLoading(false);
  }
  })();
  }, [SB_URL, SB_CONFIG_ERROR, authStorage]);

 useEffect(() => {
 if (authInitializing || !authSession?.user?.id) return;
 bootPersistenceReadyRef.current = false;
 (async () => {
 setLoading(true);
 try {
 const loadResult = await sbLoad({ source: "auth_boot" });
 if (loadResult?.stale) {
 bootPersistenceReadyRef.current = true;
 setLoading(false);
 return;
 }
 setAuthError("");
 applyStorageStatus(buildStorageStatus({ mode: "cloud", label: "SYNCED", reason: STORAGE_STATUS_REASONS.synced, detail: "Cloud sync is working normally." }));
 } catch(e) {
 logDiag("Cloud load failed:", e.message);
 const nextStatus = classifyStorageError(e);
 if (e?.message === "AUTH_REQUIRED") {
 setAuthError("Session expired. Please sign in again.");
 setAuthSession(null);
 authStorage.saveAuthSession(null);
 } else {
 setAuthError("");
 }
 const cache = localLoad();
 if (cache) {
 try {
 const cachedRuntimeState = buildCanonicalRuntimeStateFromStorage({
 storedPayload: cache,
 mergePersonalization,
 DEFAULT_PERSONALIZATION,
 normalizeGoals,
 DEFAULT_MULTI_GOALS,
 });
 validateCanonicalRuntimeStateInvariant(cachedRuntimeState, "buildCanonicalRuntimeStateFromStorage.cache");
 applyCanonicalRuntimeState(cachedRuntimeState);
 } catch (cacheErr) {
 logDiag("local cache import fallback failed", cacheErr?.message || "unknown");
 }
 }
 applyStorageStatus(nextStatus);
 }
 bootPersistenceReadyRef.current = true;
 setLoading(false);
 })();
 }, [authSession?.user?.id, authInitializing]);

 useEffect(() => {
 if (authInitializing || !authSession?.user?.id) return;
 let cancelled = false;
 const heartbeat = async () => {
 const ensured = await authStorage.ensureValidSession(authSession, { reason: "heartbeat" });
 if (cancelled) return;
 if (ensured?.session?.access_token && ensured.session.access_token !== authSession?.access_token) {
 setAuthSession(ensured.session);
 authStorage.saveAuthSession(ensured.session);
 }
 // Never force logout from heartbeat checks. Safari pinch/text zoom can trigger
 // transient focus/visibility churn, so auth expiration should only be enforced
 // from explicit auth-required API failures.
 if (!ensured?.session && (ensured?.status === "refresh_failed" || ensured?.status === "refresh_missing")) {
 logDiag("auth.heartbeat.refresh_unavailable", ensured?.status);
 }
 };
 const id = setInterval(heartbeat, 60000);
 return () => { cancelled = true; clearInterval(id); };
 }, [authInitializing, authSession?.user?.id, authSession?.access_token, authSession?.refresh_token]);

 useEffect(() => {
 if (!authSession?.access_token) return;
 authStorage.saveAuthSession(authSession);
 }, [authSession?.access_token, authSession?.refresh_token, authSession?.user?.id]);

 useEffect(() => {
 if (authInitializing || !authSession?.user?.id || !authSession?.access_token || !SB_URL || !SB_KEY || typeof createClient !== "function") return;
 const userId = authSession.user.id;
 const client = createClient(SB_URL, SB_KEY, {
 auth: {
 persistSession: false,
 autoRefreshToken: false,
 detectSessionInUrl: false,
 },
 });
 realtimeClientRef.current = client;
 try {
 client.realtime.setAuth(authSession.access_token);
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeAuthResult,
 ok: true,
 at: Date.now(),
 });
 } catch (e) {
 logDiag("realtime.auth.failed", e?.message || "unknown");
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeAuthResult,
 ok: false,
 supabaseErrorCode: e?.code || "",
 errorMessage: e?.message || "",
 at: Date.now(),
 });
 }

const handleSessionLogChange = (payload) => {
if (isRecentLocalMutation()) return;
const row = payload?.eventType === "DELETE" ? payload?.old : payload?.new;
const dateKey = String(row?.date || "").split("T")[0];
if (!dateKey) {
 scheduleRealtimeResync("session_logs_missing_date");
 return;
 }
 setLogs((prev) => {
 const next = { ...(prev || {}) };
 if (payload?.eventType === "DELETE") {
 delete next[dateKey];
 return next;
 }
 next[dateKey] = buildRealtimeLogEntry(row, next[dateKey] || {});
 return next;
 });
 };

 const handleGoalChange = () => {
 if (isRecentLocalMutation()) return;
 scheduleRealtimeResync("goals_change");
 };

 const handleCoachMemoryChange = () => {
 if (isRecentLocalMutation()) return;
 scheduleRealtimeResync("coach_memory_change");
 };

 const handleTrainerDataChange = () => {
 if (isRecentLocalMutation()) return;
 scheduleRealtimeResync("trainer_data_change");
 };

 const channel = client.channel(`user-data:${userId}`)
 .on("postgres_changes", {
 event: "*",
 schema: "public",
 table: "session_logs",
 filter: `user_id=eq.${userId}`,
 }, handleSessionLogChange)
 .on("postgres_changes", {
 event: "*",
 schema: "public",
 table: "goals",
 filter: `user_id=eq.${userId}`,
 }, handleGoalChange)
 .on("postgres_changes", {
 event: "*",
 schema: "public",
 table: "coach_memory",
 filter: `user_id=eq.${userId}`,
 }, handleCoachMemoryChange)
 .on("postgres_changes", {
 event: "*",
 schema: "public",
 table: "trainer_data",
 filter: `user_id=eq.${userId}`,
 }, handleTrainerDataChange);

 realtimeChannelRef.current = channel;
 channel.subscribe((status) => {
 logDiag("realtime.status", status);
 recordSyncDiagnostic({
 type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeStatus,
 status,
 at: Date.now(),
 });
 if (status === "SUBSCRIBED") {
 if (realtimeInterruptedRef.current) {
 realtimeInterruptedRef.current = false;
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.realtimeResumed,
 at: Date.now(),
 });
 scheduleRealtimeResync("realtime_reconnected");
 }
 return;
 }
 if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
 realtimeInterruptedRef.current = true;
 dispatchSyncRuntime({
 type: SYNC_RUNTIME_EVENT_TYPES.realtimeInterrupted,
 at: Date.now(),
 });
 }
 });

 const handleOnline = () => {
 if (!authSessionRef.current?.user?.id) return;
 scheduleRealtimeResync("browser_online");
 };
 window.addEventListener("online", handleOnline);

 return () => {
 window.removeEventListener("online", handleOnline);
 if (realtimeResyncTimerRef.current) clearTimeout(realtimeResyncTimerRef.current);
 realtimeInterruptedRef.current = false;
 try { channel.unsubscribe(); } catch {}
 try { client.removeChannel(channel); } catch {}
 if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
 if (realtimeClientRef.current === client) realtimeClientRef.current = null;
 };
 }, [authInitializing, authSession?.user?.id, authSession?.access_token, SB_URL, SB_KEY]);

 useEffect(() => {
 if (loading || historyRelabelAppliedRef.current) return;
 const { nextLogs, changed } = relabelRecentLogs(logs);
 historyRelabelAppliedRef.current = true;
 if (changed <= 0) return;
 setLogs(nextLogs);
 persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 }, [loading, logs]);

 useEffect(() => {
 if (skipNextGoalsPersistRef.current) {
 skipNextGoalsPersistRef.current = false;
 return;
 }
 if (!loading && bootPersistenceReadyRef.current) persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 }, [goals, loading]);

 useEffect(() => {
 if (loading || typeof window === "undefined" || typeof Notification === "undefined") return;
const reminderPreviewEnabled = TRUSTED_DEBUG_MODE && new URLSearchParams(window.location.search || "").get("reminder_preview") === "1";
 if (!reminderPreviewEnabled) return;
 const now = new Date();
 const checkinDayMap = { Sun: 0, Mon: 1, Sat: 6 };
 const targetDow = checkinDayMap[personalization?.settings?.trainingPreferences?.weeklyCheckinDay ?? "Sun"] ?? 0;
 if (now.getDay() !== targetDow) return;
 const weekTag = `${now.getUTCFullYear()}_W${currentWeek}`;
 const lastPushWeek = personalization?.coachMemory?.lastSundayPushWeek || "";
 if (lastPushWeek === weekTag) return;

 (async () => {
 if (Notification.permission === "default") {
 try { await Notification.requestPermission(); } catch { return; }
 }
 if (Notification.permission !== "granted") return;
 const note = new Notification("Weekly coach check-in", {
 body: "3 quick questions. Tap to update your next week automatically.",
 });
 note.onclick = async () => {
 try { window.focus(); } catch {}
 const energy = Number(window.prompt("Coach check-in (1/3): Energy this week? (1-5)", "3") || "3");
 const stress = Number(window.prompt("Coach check-in (2/3): Stress this week? (1-5)", "3") || "3");
 const blocker = String(window.prompt("Coach check-in (3/3): Biggest blocker? (time/travel/recovery/none)", "none") || "none");
 await applySundayPushAdjustments({ energy, stress, blocker });
 };
 const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, lastSundayPushWeek: weekTag } });
 setPersonalization(updated);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 })();
 }, [DEBUG_MODE, loading, currentWeek, personalization?.coachMemory?.lastSundayPushWeek]);

const saveLogs = async (newLogs, options = {}) => {
 const startedAt = Date.now();
 const changedDateKey = String(options?.changedDateKey || "").trim();
 const forcedStatus = String(options?.forceStatus || "").trim();
 const plannedDayHistoryOverride = options?.plannedDayHistoryOverride || null;
 const plannedDayRecordOverride = options?.plannedDayRecordOverride || null;
 const mirroredDailyCheckin = options?.mirroredDailyCheckin && typeof options.mirroredDailyCheckin === "object"
  ? options.mirroredDailyCheckin
  : null;
 const clearMirroredDailyCheckin = Boolean(options?.clearMirroredDailyCheckin);
 const nextLogs = { ...(newLogs || {}) };
 if (changedDateKey && nextLogs?.[changedDateKey]) {
  nextLogs[changedDateKey] = normalizeLogPerformanceState({
   dateKey: changedDateKey,
   logEntry: decorateLogEntryWithPlanContext({
    dateKey: changedDateKey,
    entry: nextLogs[changedDateKey],
    dailyCheckin: mirroredDailyCheckin || dailyCheckins?.[changedDateKey] || {},
    plannedDayHistoryOverride,
    plannedDayRecordOverride,
   }),
  });
  if (forcedStatus) {
   nextLogs[changedDateKey] = normalizeLogPerformanceState({
    dateKey: changedDateKey,
    logEntry: {
     ...nextLogs[changedDateKey],
     actualSession: {
      ...(nextLogs[changedDateKey]?.actualSession || {}),
      status: forcedStatus,
      completionKind: forcedStatus === "completed_as_planned" ? "as_prescribed" : (nextLogs[changedDateKey]?.actualSession?.completionKind || ""),
      modifiedFromPlan: forcedStatus === "completed_as_planned" ? false : nextLogs[changedDateKey]?.actualSession?.modifiedFromPlan,
     },
     checkin: {
      ...(nextLogs[changedDateKey]?.checkin || {}),
      status: forcedStatus,
      sessionFeel: nextLogs[changedDateKey]?.checkin?.sessionFeel || "about_right",
      ts: Date.now(),
     },
     comparison: forcedStatus === "completed_as_planned"
      ? {
       ...(nextLogs[changedDateKey]?.comparison || {}),
       status: forcedStatus,
       completionKind: "as_prescribed",
       differenceKind: "none",
       severity: "none",
       matters: false,
       customSession: false,
      }
      : (nextLogs[changedDateKey]?.comparison || {}),
    },
   });
  }
 }
 const nextDailyCheckins = { ...(dailyCheckins || {}) };
 if (changedDateKey && clearMirroredDailyCheckin) {
  delete nextDailyCheckins[changedDateKey];
 } else if (changedDateKey && mirroredDailyCheckin) {
  nextDailyCheckins[changedDateKey] = {
   ...DEFAULT_DAILY_CHECKIN,
   ...(nextDailyCheckins?.[changedDateKey] || {}),
   ...(mirroredDailyCheckin || {}),
   readiness: {
    ...(DEFAULT_DAILY_CHECKIN.readiness || {}),
    ...(nextDailyCheckins?.[changedDateKey]?.readiness || {}),
    ...(mirroredDailyCheckin?.readiness || {}),
   },
   actualRecovery: {
    ...(DEFAULT_DAILY_CHECKIN.actualRecovery || {}),
    ...(nextDailyCheckins?.[changedDateKey]?.actualRecovery || {}),
    ...(mirroredDailyCheckin?.actualRecovery || {}),
   },
   ts: Date.now(),
  };
 }
 setLogs(nextLogs);
 setDailyCheckins(nextDailyCheckins);
 const derivedBase = derivePersonalization(nextLogs, bodyweights, personalization);
 const m = getMomentumEngineState({ logs: nextLogs, dailyCheckins: nextDailyCheckins, bodyweights, personalization: derivedBase });
 let derived = mergePersonalization(derivedBase, { profile: { ...derivedBase.profile, inconsistencyRisk: m.inconsistencyRisk, currentMomentumState: m.momentumState, likelyAdherencePattern: m.likelyAdherencePattern } });
 const changedLog = changedDateKey ? nextLogs?.[changedDateKey] : null;
 const changedExerciseRecords = changedDateKey ? getExercisePerformanceRecordsForLog(changedLog || {}, { dateKey: changedDateKey }) : [];
 if (changedDateKey) await syncExercisePerformanceRows(changedDateKey, changedLog || null);
 if (changedDateKey && changedExerciseRecords.length > 0) {
 const currentPhase = getPhaseForDateKey(changedDateKey, canonicalGoalState?.planStartDate || "");
 derived = await applyStrengthProgressionForLog({
 dateKey: changedDateKey,
 nextLogs,
 linkedLog: changedLog,
 basePersonalization: derived,
 currentPhase,
 shouldSync: false,
 });
 }
 setPersonalization(derived);
 try {
 await persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, derived, coachActions, coachPlanAdjustments, goals, nextDailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 if (changedDateKey) await syncSessionLogShadowRow(changedDateKey, changedLog || null);
 setLastSaved(new Date().toLocaleTimeString());
 trackFrictionEvent({
 flow: "logging",
 action: "workout_log",
 outcome: "success",
 props: {
 date_key: changedDateKey || "bulk",
 duration_ms: Date.now() - startedAt,
 has_strength_records: changedExerciseRecords.length > 0,
 },
 });
 return { ok: true };
 } catch(e) {
 logDiag("saveLogs fallback", e.message);
 applyStorageStatus(classifyStorageError(e));
 trackFrictionEvent({
 flow: "logging",
 action: "workout_log",
 outcome: "error",
 props: {
 date_key: changedDateKey || "bulk",
 duration_ms: Date.now() - startedAt,
  error_code: classifyFrictionErrorCode(e),
 },
 });
 return { ok: false, error: e };
 }
 analyzePlan(nextLogs);
};

 const saveBodyweights = async (arr) => {
 setBodyweights(arr);
 const derivedBase = derivePersonalization(logs, arr, personalization);
 const m = getMomentumEngineState({ logs, dailyCheckins, bodyweights: arr, personalization: derivedBase });
 const derived = mergePersonalization(derivedBase, { profile: { ...derivedBase.profile, inconsistencyRisk: m.inconsistencyRisk, currentMomentumState: m.momentumState, likelyAdherencePattern: m.likelyAdherencePattern } });
 setPersonalization(derived);
 try {
 await persistAll(logs, arr, paceOverrides, weekNotes, planAlerts, derived, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 setLastSaved(new Date().toLocaleTimeString());
 } catch(e) { logDiag("saveBodyweights fallback", e.message); applyStorageStatus(classifyStorageError(e)); }
 };

 const saveManualProgressInputs = async (update, options = {}) => {
 const currentInputs = personalization?.manualProgressInputs || DEFAULT_PERSONALIZATION.manualProgressInputs;
 const nextInputs = typeof update === "function" ? update(currentInputs) : (update || currentInputs);
 const profilePatch = options?.profilePatch && typeof options.profilePatch === "object" ? options.profilePatch : null;
 const nextPersonalization = mergePersonalization(personalization, {
 manualProgressInputs: nextInputs,
 ...(profilePatch ? { profile: { ...(personalization?.profile || {}), ...profilePatch } } : {}),
 });
 setPersonalization(nextPersonalization);
 try {
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 setLastSaved(new Date().toLocaleTimeString());
 } catch(e) { logDiag("saveManualProgressInputs fallback", e.message); applyStorageStatus(classifyStorageError(e)); }
 };

 const saveProgramSelection = async (update) => {
 const currentPrograms = normalizeProgramsSelectionState(personalization?.programs || createDefaultProgramSelectionState());
 const nextPrograms = normalizeProgramsSelectionState(
 typeof update === "function" ? update(currentPrograms) : (update || currentPrograms)
 );
 const nextPersonalization = mergePersonalization(personalization, { programs: nextPrograms });
 setPersonalization(nextPersonalization);
 try {
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 setLastSaved(new Date().toLocaleTimeString());
 } catch (e) {
 logDiag("saveProgramSelection fallback", e.message);
 applyStorageStatus(classifyStorageError(e));
 }
 };

 const savePlanState = async (newOvr, newNotes, newAlerts) => {
 try { await persistAll(logs, bodyweights, newOvr, newNotes, newAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs); } catch(e) {}
 };

 const syncExercisePerformanceRows = async (dateKey, logEntryOrPerformance = null) => {
 const exerciseRecords = Array.isArray(logEntryOrPerformance) && logEntryOrPerformance.some((record) => record?.scope === "exercise")
 ? logEntryOrPerformance.filter((record) => record?.scope === "exercise")
 : Array.isArray(logEntryOrPerformance)
 ? getExercisePerformanceRecordsForLog({ strengthPerformance: logEntryOrPerformance || [] }, { dateKey })
 : getExercisePerformanceRecordsForLog(logEntryOrPerformance || {}, { dateKey });
 const rows = buildExercisePerformanceRowsForStorage(dateKey, exerciseRecords);
 if (!authSession?.user?.id) return rows;
 try {
 await authStorage.syncExercisePerformanceForDate({ dateKey, rows, authSession, setAuthSession });
 } catch (e) {
 logDiag("exercise_performance sync failed", e?.message || "unknown");
 }
 return rows;
 };

 const buildStrengthAdjustmentNotification = async (update, tomorrowKey, currentPhase) => {
 const isUp = /increase|add/.test(String(update?.ruleTriggered || ""));
 const isDown = /decrease/.test(String(update?.ruleTriggered || ""));
 const icon = isUp ? "?" : isDown ? "?" : "?";
 const summary = `${icon} ${update.exercise}: ${update.oldValue} ? ${update.newValue} today`;
 const coachPrompt = `Exercise: ${update.exercise}
Change: ${update.oldValue} -> ${update.newValue}
Reason: ${String(update.ruleTriggered || "progressive_overload").replaceAll("_", " ")}
Write one sentence a coach would say. Under 12 words. Specific. No praise language.`;
 const explainPrompt = `Explain this strength adjustment in 2-3 sentences.
Exercise: ${update.exercise}
Change: ${update.oldValue} -> ${update.newValue}
Rule: ${String(update.ruleTriggered || "progressive_overload").replaceAll("_", " ")}
Phase: ${currentPhase}
Keep it plain and specific.`;
 const coachLineRaw = await callAnthropic({ system: "You write concise training adjustment lines.", user: coachPrompt, maxTokens: 60 });
 const explanationRaw = await callAnthropic({ system: "You explain deterministic strength progression decisions clearly.", user: explainPrompt, maxTokens: 140 });
 const oldProxy = update.mode === "band"
 ? BAND_TENSION_LEVELS.findIndex((level) => level === update.oldBandTension)
 : update.mode === "bodyweight"
 ? ((Number(update.oldSets || 0) * 100) + Number(update.oldReps || 0))
 : update.oldWeight;
 const newProxy = update.mode === "band"
 ? BAND_TENSION_LEVELS.findIndex((level) => level === update.newBandTension)
 : update.mode === "bodyweight"
 ? ((Number(update.newSets || 0) * 100) + Number(update.newReps || 0))
 : update.newWeight;
 return {
 id: `strength_${tomorrowKey}_${update.exKey}_${Date.now()}`,
 exercise: update.exercise,
 icon,
 summary,
 inlineNote: summary,
 note: `${update.exercise}: ${update.oldValue} ? ${update.newValue} today`,
 coachLine: (coachLineRaw || "").trim().split("\n")[0] || `${update.exercise} moves ${update.oldValue} to ${update.newValue}.`,
 explanation: (explanationRaw || "").trim() || `${update.exercise} changed from ${update.oldValue} to ${update.newValue} because the last two sessions matched the engine rule ${String(update.ruleTriggered || "progressive_overload").replaceAll("_", " ")}.`,
 reason: update.ruleTriggered,
 oldValue: update.oldValue,
 newValue: update.newValue,
 oldWeight: oldProxy,
 newWeight: newProxy,
 oldBandTension: update.oldBandTension,
 newBandTension: update.newBandTension,
 oldSets: update.oldSets,
 newSets: update.newSets,
 oldReps: update.oldReps,
 newReps: update.newReps,
 mode: update.mode,
 };
 };

 const applyStrengthProgressionForLog = async ({ dateKey, nextLogs, linkedLog, basePersonalization, currentPhase, shouldSync = true }) => {
 const performanceRecords = getExercisePerformanceRecordsForLog(linkedLog || {}, { dateKey });
 if (shouldSync) await syncExercisePerformanceRows(dateKey, linkedLog || null);
 if (performanceRecords.length === 0) return basePersonalization;

 const { updates, nextPrescriptions, nextTracking } = deriveProgressiveOverloadAdjustmentsV2({
 logs: nextLogs,
 performance: performanceRecords,
 personalization: basePersonalization,
 currentPhase,
 goals,
 goalState: canonicalGoalState,
 sessionDateKey: dateKey,
 });

 const tomorrow = new Date(`${dateKey}T12:00:00`);
 tomorrow.setDate(tomorrow.getDate() + 1);
 const tomorrowKey = toDateKey(tomorrow);
 const existingQueue = normalizePendingStrengthAdjustments(basePersonalization?.strengthProgression?.pendingByDate?.[tomorrowKey]);
 const builtQueue = [];
 for (const update of updates) {
 builtQueue.push(await buildStrengthAdjustmentNotification(update, tomorrowKey, currentPhase));
 }

 const nextStrengthProgression = {
 ...(basePersonalization?.strengthProgression || {}),
 prescriptions: nextPrescriptions,
 tracking: nextTracking,
 pendingByDate: {
 ...(basePersonalization?.strengthProgression?.pendingByDate || {}),
 [tomorrowKey]: [...builtQueue, ...existingQueue.filter((item) => !builtQueue.some((nextItem) => nextItem?.exercise === item?.exercise))].slice(0, 12),
 },
 };

 return mergePersonalization(basePersonalization, { strengthProgression: nextStrengthProgression });
 };

 const saveDailyCheckin = async (dateKey, checkin) => {
 const startedAt = Date.now();
 const merged = {
 ...DEFAULT_DAILY_CHECKIN,
 ...(checkin || {}),
 readiness: {
 ...(DEFAULT_DAILY_CHECKIN.readiness || {}),
 ...((checkin || {}).readiness || {}),
 },
 actualRecovery: {
 ...(DEFAULT_DAILY_CHECKIN.actualRecovery || {}),
 ...((checkin || {}).actualRecovery || {}),
 },
 };
 const plannedDayHistory = getPlannedDayHistoryForDate(dateKey, logs?.[dateKey] || null);
 const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayHistory);
 const nextDailyEntry = {
 ...merged,
 planReference: buildPlanReference(plannedDayHistory || plannedDayRecord),
 actualRecovery: {
 status: merged.status || "not_logged",
 sessionFeel: merged.sessionFeel || "",
 blocker: merged.blocker || "",
 note: merged.note || "",
 bodyweight: merged.bodyweight || "",
 readiness: cloneStructuredValue(merged.readiness || {}),
 sleepHours: merged?.actualRecovery?.sleepHours || "",
 mobilityMinutes: merged?.actualRecovery?.mobilityMinutes || "",
 tissueWorkMinutes: merged?.actualRecovery?.tissueWorkMinutes || "",
 painProtocolCompleted: Boolean(merged?.actualRecovery?.painProtocolCompleted),
 recoveryNote: merged?.actualRecovery?.note || "",
 loggedAt: Date.now(),
 },
 ts: Date.now(),
 };
 const nextDaily = { ...dailyCheckins, [dateKey]: nextDailyEntry };
 const feelMap = { easier_than_expected: "4", about_right: "3", harder_than_expected: "2" };
 const plannedTraining = plannedDayRecord?.resolved?.training || todayWorkout || {};
 const existingLog = logs[dateKey] || null;
 const baseLog = existingLog || {
 date: dateKey,
 type: plannedTraining?.label || plannedTraining?.type || "Planned Session",
 location: personalization.travelState.environmentMode === "travel" ? "hotel" : "home",
 miles: "",
 pace: "",
 pushups: "",
 notes: "",
 };
 const matchedGarminRun = matchGarminRunActivity({
 garminActivities: personalization?.connectedDevices?.garmin?.activities || [],
 dateKey,
 log: baseLog,
 });
 const hasStrengthPerformance = Array.isArray(merged?.strengthPerformance) && merged.strengthPerformance.length > 0;
 const actualOutcomeLogged = Boolean(merged?.status && merged.status !== "not_logged");
 const shouldMaterializeLog = Boolean(existingLog || actualOutcomeLogged || hasStrengthPerformance);
 let linkedLog = existingLog;
 let nextLogs = logs;
 if (shouldMaterializeLog) {
 linkedLog = normalizeLogPerformanceState({
 dateKey,
 logEntry: decorateLogEntryWithPlanContext({
 dateKey,
 entry: {
 ...baseLog,
 miles: matchedGarminRun?.distanceMiles ? String(Number(matchedGarminRun.distanceMiles).toFixed(2)) : (baseLog?.miles || ""),
 pace: matchedGarminRun?.pace ? String(matchedGarminRun.pace) : (baseLog?.pace || ""),
 runTime: matchedGarminRun?.durationMin ? String(Math.round(Number(matchedGarminRun.durationMin))) : (baseLog?.runTime || ""),
 feel: baseLog.feel || feelMap[merged.sessionFeel] || "3",
 notes: merged.note ? (baseLog.notes ? `${baseLog.notes} | ${merged.note}` : merged.note) : baseLog.notes,
 strengthPerformance: hasStrengthPerformance ? merged.strengthPerformance : (baseLog?.strengthPerformance || []),
 healthMetrics: (() => {
 const workout = matchedGarminRun
 ? { avgHr: matchedGarminRun?.avgHr, maxHr: matchedGarminRun?.maxHr, calories: matchedGarminRun?.calories, paceSeconds: matchedGarminRun?.paceSeconds, source: "garmin" }
 : (personalization?.connectedDevices?.appleHealth?.workouts?.[dateKey] || {});
 const isRun = /run/.test(String(baseLog?.type || plannedTraining?.type || "").toLowerCase());
 if (!isRun) return baseLog?.healthMetrics || null;
 return deriveRunHealthMetrics({ workout, log: baseLog });
 })(),
 actualSession: {
 ...(baseLog?.actualSession || {}),
 ...(actualOutcomeLogged ? { status: merged.status } : {}),
 sessionType: baseLog?.actualSession?.sessionType || baseLog?.type || plannedTraining?.label || "Logged session",
 sessionLabel: baseLog?.actualSession?.sessionLabel || baseLog?.type || plannedTraining?.label || "Logged session",
 },
 ts: Date.now(),
 },
 dailyCheckin: nextDailyEntry,
 }),
 });
 nextLogs = { ...logs, [dateKey]: linkedLog };
 }
 let nextPersonalization = personalization;
 const strengthPerformanceRecords = getExercisePerformanceRecordsForLog(linkedLog || {}, { dateKey });
 const isStrengthDay = ["run+strength", "strength+prehab"].includes(plannedTraining?.type || "") || strengthPerformanceRecords.length > 0;
 if (isStrengthDay && strengthPerformanceRecords.length > 0) {
 const currentPhase = plannedTraining?.week?.phase || todayWorkout?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
 nextPersonalization = await applyStrengthProgressionForLog({
 dateKey,
 nextLogs,
 linkedLog,
 basePersonalization: personalization,
 currentPhase,
 });
}
 const nextFitnessSignals = deriveFitnessLayer({ logs: nextLogs, personalization: nextPersonalization });
 nextPersonalization = mergePersonalization(nextPersonalization, { fitnessSignals: nextFitnessSignals, profile: { ...nextPersonalization.profile, fitnessLevel: nextFitnessSignals.fitnessLevel } });
 const phaseNow = todayWorkout?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
 if (Number(nextFitnessSignals?.paceOffsetSec || 0) !== 0) {
 const parsePaceToSec = (p = "") => {
 const m = String(p || "").match(/(\d+):(\d+)/);
 return m ? (Number(m[1]) * 60) + Number(m[2]) : null;
 };
 const secToPace = (s = 0) => {
 const mm = Math.floor(s / 60);
 const ss = Math.round(s % 60);
 return `${mm}:${String(ss).padStart(2, "0")}`;
 };
 const baseEasy = getZones(phaseNow)?.easy || "";
 const easyStart = baseEasy.split("-")[0] || baseEasy;
 const easySec = parsePaceToSec(easyStart);
 if (easySec) {
 const shifted = secToPace(clamp(easySec + Number(nextFitnessSignals.paceOffsetSec || 0), 360, 900));
 const nextOverrides = {
 ...paceOverrides,
 [phaseNow]: { ...(paceOverrides?.[phaseNow] || {}), easy: shifted },
 };
 setPaceOverrides(nextOverrides);
 }
 }
 setDailyCheckins(nextDaily);
 setLogs(nextLogs);
 setPersonalization(nextPersonalization);
 const workoutOutcomeComparison = linkedLog?.comparison || comparePlannedDayToActual({
 plannedDayRecord,
 actualLog: linkedLog || existingLog || {},
 dailyCheckin: nextDailyEntry,
 dateKey,
 });
 const workoutRecommendationJoinKey = buildRecommendationJoinKey({
 recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
 planWeekId: plannedDayRecord?.week?.planWeekId || planDay?.week?.planWeekId || "",
 planDayId: plannedDayRecord?.id || `plan_day_${dateKey}`,
 dateKey,
 weekNumber: plannedDayRecord?.week?.currentWeek || currentWeek,
 chosenOption: {
 optionKey: plannedTraining?.label || plannedTraining?.type || "planned_session",
 label: plannedTraining?.label || plannedTraining?.type || "Planned session",
 },
 fallbackSeed: plannedDayRecord?.provenance?.summary || plannedTraining?.label || plannedTraining?.type || "",
 });
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
 payload: buildWorkoutOutcomeEventInput({
 recommendationJoinKey: workoutRecommendationJoinKey,
 decisionId: `decision_${workoutRecommendationJoinKey}`,
 dateKey,
 comparison: workoutOutcomeComparison,
 checkin: nextDailyEntry,
 planDay,
 plannedDayRecord,
 actualLog: linkedLog || existingLog || null,
 sourceSurface: "log",
 }),
 dedupeKey: `workout_outcome_${dateKey}_${linkedLog?.ts || nextDailyEntry?.ts || Date.now()}`,
 });
 await persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, nextDaily, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 if (linkedLog) await syncSessionLogShadowRow(dateKey, linkedLog);
 trackFrictionEvent({
 flow: "logging",
 action: "daily_checkin",
 outcome: "success",
 props: {
 date_key: dateKey,
 duration_ms: Date.now() - startedAt,
 actual_outcome_logged: actualOutcomeLogged,
 materialized_log: shouldMaterializeLog,
 },
 });
 };

 const saveWeeklyCheckin = async (weekNum, checkin) => {
 const startedAt = Date.now();
 const nextWeekly = { ...weeklyCheckins, [String(weekNum)]: { ...(checkin || {}), ts: Date.now() } };
 const nextAlerts = [{ id:`weekly_${Date.now()}`, type:"info", msg:"Weekly reflection saved - nice follow-through." }, ...planAlerts].slice(0, 12);
 const recentComparisons = [];
 if (Number(weekNum || 0) === Number(currentWeek || 0) && currentPlanWeek?.startDate && currentPlanWeek?.endDate) {
 const cursor = new Date(`${currentPlanWeek.startDate}T12:00:00`);
 const end = new Date(`${currentPlanWeek.endDate}T12:00:00`);
 while (cursor <= end) {
 const cursorKey = cursor.toISOString().split("T")[0];
 const weekPlannedDayRecord = getPlannedDayRecordForDate(cursorKey, logs?.[cursorKey] || null);
 const weekDailyCheckin = dailyCheckins?.[cursorKey] || logs?.[cursorKey]?.checkin || {};
 const weekComparison = comparePlannedDayToActual({
 plannedDayRecord: weekPlannedDayRecord,
 actualLog: logs?.[cursorKey] || {},
 dailyCheckin: weekDailyCheckin,
 dateKey: cursorKey,
 });
 const weekRecommendationJoinKey = buildRecommendationJoinKey({
 recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
 planWeekId: weekPlannedDayRecord?.week?.planWeekId || currentPlanWeek?.id || "",
 planDayId: weekPlannedDayRecord?.id || `plan_day_${cursorKey}`,
 dateKey: cursorKey,
 weekNumber: currentPlanWeek?.weekNumber || currentWeek,
 chosenOption: {
 optionKey: weekPlannedDayRecord?.resolved?.training?.label || weekPlannedDayRecord?.resolved?.training?.type || "planned_session",
 label: weekPlannedDayRecord?.resolved?.training?.label || weekPlannedDayRecord?.resolved?.training?.type || "Planned session",
 },
 fallbackSeed: weekPlannedDayRecord?.provenance?.summary || weekPlannedDayRecord?.resolved?.training?.label || "",
 });
 recentComparisons.push({
 ...weekComparison,
 recommendationJoinKey: weekRecommendationJoinKey,
 });
 cursor.setDate(cursor.getDate() + 1);
 }
 }
 setWeeklyCheckins(nextWeekly);
 setPlanAlerts(nextAlerts);
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.weeklyEvaluationCompleted,
 payload: buildWeeklyEvaluationEventInput({
 currentPlanWeek,
 weeklyCheckin: checkin,
 recentComparisons,
 nutritionSummary: weeklyNutritionReview?.adaptation?.summary || "",
 acceptedCoachActions: (coachActions || []).filter((action) => action?.acceptedBy).length,
 goalProgressSignal: checkin?.summary || checkin?.note || "",
 }),
 dedupeKey: `weekly_evaluation_${weekNum}_${nextWeekly?.[String(weekNum)]?.ts || Date.now()}`,
 });
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, nextAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, nextWeekly, nutritionFavorites, nutritionActualLogs);
 trackFrictionEvent({
 flow: "logging",
 action: "weekly_checkin",
 outcome: "success",
 props: {
 week_num: weekNum,
 duration_ms: Date.now() - startedAt,
 },
 });
 };

const saveNutritionFavorites = async (nextFavorites) => {
 setNutritionFavorites(nextFavorites);
 try {
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nextFavorites, nutritionActualLogs);
 return { ok: true };
 } catch (e) {
 applyStorageStatus(classifyStorageError(e));
 return { ok: false, error: e };
 }
};

const saveNutritionActualLog = async (dateKey, feedback) => {
 const startedAt = Date.now();
 const plannedDayHistory = getPlannedDayHistoryForDate(dateKey, logs?.[dateKey] || null);
 const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayHistory);
 const planReference = buildPlanReference(plannedDayHistory || plannedDayRecord);
 const actualNutrition = mergeActualNutritionLogUpdate({
 dateKey,
 previousLog: nutritionActualLogs?.[dateKey] || null,
 feedback,
 planReference,
 });
 validateActualNutritionLogInvariant(actualNutrition, dateKey, "saveNutritionActualLog.mergeActualNutritionLogUpdate");
 const nextActualLogs = {
 ...nutritionActualLogs,
 [dateKey]: actualNutrition,
 };
 setNutritionActualLogs(nextActualLogs);
 const nutritionRecommendationJoinKey = buildRecommendationJoinKey({
 recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.nutritionRecommendation,
 planWeekId: plannedDayRecord?.week?.planWeekId || planDay?.week?.planWeekId || "",
 planDayId: plannedDayRecord?.id || `plan_day_${dateKey}`,
 dateKey,
 weekNumber: plannedDayRecord?.week?.currentWeek || currentWeek,
 chosenOption: {
 optionKey: actualNutrition?.dayType || plannedDayRecord?.resolved?.nutrition?.dayType || "nutrition_day",
 label: actualNutrition?.dayType || plannedDayRecord?.resolved?.nutrition?.dayType || "Nutrition day",
 },
 fallbackSeed: plannedDayRecord?.provenance?.summary || actualNutrition?.note || "",
 });
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationOutcomeRecorded,
 payload: buildNutritionOutcomeEventInput({
 recommendationJoinKey: nutritionRecommendationJoinKey,
 decisionId: `decision_${nutritionRecommendationJoinKey}`,
 dateKey,
 actualNutritionLog: actualNutrition,
 sourceSurface: "nutrition",
 }),
 dedupeKey: `nutrition_outcome_${dateKey}_${actualNutrition?.loggedAt || actualNutrition?.updatedAt || Date.now()}`,
 });
 try {
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nextActualLogs);
 trackFrictionEvent({
 flow: "logging",
 action: "nutrition_log",
 outcome: "success",
 props: {
 date_key: dateKey,
 duration_ms: Date.now() - startedAt,
 has_hydration: actualNutrition?.hydrationOz !== undefined,
 },
 });
 return { ok: true };
 } catch (e) {
 applyStorageStatus(classifyStorageError(e));
 trackFrictionEvent({
 flow: "logging",
 action: "nutrition_log",
 outcome: "error",
 props: {
 date_key: dateKey,
 duration_ms: Date.now() - startedAt,
 error_code: classifyFrictionErrorCode(e),
 },
 });
 return { ok: false, error: e };
 }
};

 useEffect(() => {
 if (loading || authInitializing) return;
 if (!personalization?.profile?.onboardingComplete) return;
 if (!APPLE_HEALTH_SUPPORTED_MODE) return;
 const apple = personalization?.connectedDevices?.appleHealth || {};
 if (apple?.permissionRequestedAt || apple?.skipped) return;
 setShowAppleHealthFirstLaunch(true);
 }, [loading, authInitializing, personalization?.profile?.onboardingComplete, personalization?.connectedDevices?.appleHealth?.permissionRequestedAt, personalization?.connectedDevices?.appleHealth?.skipped, DEBUG_MODE, APPLE_HEALTH_SUPPORTED_MODE]);

 const updateAppleHealthState = async (patch = {}) => {
 const nextPersonalization = mergePersonalization(personalization, {
 connectedDevices: {
 ...(personalization?.connectedDevices || {}),
 appleHealth: { ...(personalization?.connectedDevices?.appleHealth || {}), ...(patch || {}) },
 },
 });
 setPersonalization(nextPersonalization);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 };

 const requestAppleHealthPermissions = async () => {
 let status = "connected";
 try {
 const handler = window?.webkit?.messageHandlers?.healthkit;
 if (handler?.postMessage) handler.postMessage({ type: "request_permissions", permissions: HEALTHKIT_PERMISSIONS });
 else status = "simulated_web";
 } catch {
 status = "simulated_web";
 }
 await updateAppleHealthState({
 status,
 permissionRequestedAt: Date.now(),
 permissionsGranted: [...HEALTHKIT_PERMISSIONS],
 skipped: false,
 });
 setShowAppleHealthFirstLaunch(false);
 };

 const applySundayPushAdjustments = async ({ energy = 3, stress = 3, blocker = "none" }) => {
 const clampedEnergy = Math.max(1, Math.min(5, Number(energy) || 3));
 const clampedStress = Math.max(1, Math.min(5, Number(stress) || 3));
 const cleanBlocker = String(blocker || "none").toLowerCase().trim() || "none";
 const confidence = Math.max(1, Math.min(5, Math.round((clampedEnergy + (6 - clampedStress)) / 2)));
 const appliedAt = Date.now();
 const nextWeekly = {
 ...weeklyCheckins,
 [String(currentWeek)]: {
 energy: clampedEnergy,
 stress: clampedStress,
 confidence,
 blocker: cleanBlocker,
 source: "sunday_push",
 ts: appliedAt,
 provenance: buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.user,
 trigger: "sunday_push_checkin",
 mutationType: "weekly_checkin",
 revisionReason: `Sunday push check-in saved with blocker ${cleanBlocker}.`,
 sourceInputs: ["SundayPush", "weeklyCheckins"],
 timestamp: appliedAt,
 details: {
 week: currentWeek,
 blocker: cleanBlocker,
 energy: clampedEnergy,
 stress: clampedStress,
 },
 }),
 }
 };
 const requiresDeload = clampedEnergy <= 2 || clampedStress >= 4 || ["time", "travel", "recovery"].includes(cleanBlocker);
 const nextAdjustments = requiresDeload
 ? {
 ...coachPlanAdjustments,
 dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}) },
 nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}) },
 weekVolumePct: {
 ...(coachPlanAdjustments.weekVolumePct || {}),
 [String(currentWeek + 1)]: Math.min(Number(coachPlanAdjustments?.weekVolumePct?.[String(currentWeek + 1)] || 100), 88),
 },
 extra: appendProvenanceSidecar(
 { ...(coachPlanAdjustments.extra || {}), sundayPushAppliedAt: appliedAt, sundayPushBlocker: cleanBlocker },
 "weekVolumeByWeek",
 String(currentWeek + 1),
 buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: "sunday_push_checkin",
 mutationType: "weekly_volume_adjustment",
 revisionReason: "Next week volume capped from Sunday push recovery risk.",
 sourceInputs: ["weeklyCheckins", "SundayPush"],
 timestamp: appliedAt,
 details: {
 week: currentWeek + 1,
 blocker: cleanBlocker,
 },
 })
 ),
 }
 : coachPlanAdjustments;
 const nextAlerts = [{ id:`sunday_push_${Date.now()}`, type:"info", msg:"Weekly coach push check-in received. Plan updated silently." }, ...planAlerts].slice(0, 12);
 setWeeklyCheckins(nextWeekly);
 setPlanAlerts(nextAlerts);
 if (requiresDeload) setCoachPlanAdjustments(nextAdjustments);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, nextAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, nextWeekly, nutritionFavorites, nutritionActualLogs);
 };

 const applyProactiveNudge = async (trigger) => {
 const dateKey = new Date().toISOString().split("T")[0];
 const appliedAt = Date.now();
 const nudgeProvenance = buildAdjustmentProvenance({
 actor: PROVENANCE_ACTORS.deterministicEngine,
 trigger: trigger?.id || trigger?.actionType || "proactive_nudge",
 mutationType: "proactive_adjustment",
 revisionReason: trigger?.msg || String(trigger?.actionType || "proactive_nudge").replaceAll("_", " "),
 sourceInputs: [
 "proactiveTriggers",
 trigger?.source || "coach_engine",
 ],
 confidence: trigger?.score >= 80 ? "high" : "medium",
 timestamp: appliedAt,
 details: {
 actionType: trigger?.actionType || "",
 score: Number(trigger?.score || 0) || null,
 },
 });
 let nextAdjustments = { ...coachPlanAdjustments, dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}) }, nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}) }, weekVolumePct: { ...(coachPlanAdjustments.weekVolumePct || {}) }, extra: { ...(coachPlanAdjustments.extra || {}) } };
 let nextPersonalization = personalization;
 let nextWeekNotes = { ...weekNotes };
 if (trigger.actionType === "REDUCE_WEEKLY_VOLUME") {
 nextAdjustments.weekVolumePct[currentWeek] = 100 - (trigger.payload?.pct || 10);
 nextAdjustments.extra = appendProvenanceSidecar(nextAdjustments.extra, "weekVolumeByWeek", currentWeek, nudgeProvenance);
 nextWeekNotes[currentWeek] = `Proactive nudge applied: week volume reduced by ${trigger.payload?.pct || 10}%.`;
 }
 if (trigger.actionType === "PROGRESS_STRENGTH_EMPHASIS") nextAdjustments.extra.strengthEmphasisWeeks = trigger.payload?.weeks || 1;
 if (trigger.actionType === "SWITCH_TRAVEL_MODE") {
 nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, environmentMode: trigger.payload?.mode || "travel", isTravelWeek: true } });
 }
 if (trigger.actionType === "SIMPLIFY_MEALS_THIS_WEEK") nextAdjustments.extra.defaultMealStructureDays = trigger.payload?.days || 3;
 if (trigger.actionType === "SWITCH_TRAVEL_NUTRITION_MODE") {
 nextAdjustments.extra.travelNutritionMode = true;
 nextAdjustments.nutritionOverrides[dateKey] = { dayType: NUTRITION_DAY_TYPES.travelEndurance, reason: trigger?.msg || "travel_nutrition_mode", provenance: nudgeProvenance };
 }
 if (trigger.actionType === "SWITCH_ENV_MODE") {
 nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, environmentMode: trigger.payload?.mode || "home" } });
 }
 if (trigger.actionType === "ACTIVATE_SALVAGE") {
 nextAdjustments.weekVolumePct[currentWeek] = 80;
 nextAdjustments.extra = appendProvenanceSidecar(nextAdjustments.extra, "weekVolumeByWeek", currentWeek, nudgeProvenance);
 nextAdjustments.extra.mealSimplicityMode = true;
 nextWeekNotes[currentWeek] = "Proactive nudge applied: salvage compression (core sessions only).";
 }
 const nextCoachActions = [{
 id:`nudge_${appliedAt}`,
 ts: appliedAt,
 type: trigger.actionType,
 payload: trigger.payload || {},
 source: trigger.source === "optimization" ? "optimization_experiment" : "proactive_nudge",
 reason: trigger.msg || "proactive trigger",
 triggerReason: trigger.id || "trigger",
 provenance: nudgeProvenance,
 }, ...coachActions].slice(0, 80);
 setCoachActions(nextCoachActions);
 setCoachPlanAdjustments(nextAdjustments);
 setPersonalization(nextPersonalization);
 setWeekNotes(nextWeekNotes);
 setDismissedTriggers(prev => [...prev, trigger.id]);
 await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, planAlerts, nextPersonalization, nextCoachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 };

 const exportData = () => {
 const normalizedGoalPayload = normalizeGoals(goals || []);
 return exportRuntimeStateAsBase64({
 runtimeState: buildCanonicalRuntimeState({
 logs,
 bodyweights,
 paceOverrides,
 weekNotes,
 planAlerts,
 personalization,
 goals: normalizedGoalPayload,
 coachActions,
 coachPlanAdjustments,
 dailyCheckins,
 plannedDayRecords,
 planWeekRecords,
 weeklyCheckins,
 nutritionFavorites,
 nutritionActualLogs,
 }),
 transformPersonalization: (draftPersonalization) => buildPersistedPersonalization(draftPersonalization, normalizedGoalPayload),
 });
 };

 const importData = async (str) => {
 try {
 const runtimeState = importRuntimeStateFromBase64({
 encoded: str,
 mergePersonalization,
 DEFAULT_PERSONALIZATION,
 normalizeGoals,
 DEFAULT_MULTI_GOALS,
 });
 applyCanonicalRuntimeState(runtimeState);
 // Push restored data to Supabase immediately
 await persistAll(
 runtimeState.logs,
 runtimeState.bodyweights,
 runtimeState.paceOverrides,
 runtimeState.weekNotes,
 runtimeState.planAlerts,
 runtimeState.personalization,
 runtimeState.coachActions,
 runtimeState.coachPlanAdjustments,
 runtimeState.goals,
 runtimeState.dailyCheckins,
 runtimeState.weeklyCheckins,
 runtimeState.nutritionFavorites,
 runtimeState.nutritionActualLogs,
 runtimeState.plannedDayRecords,
 runtimeState.planWeekRecords
 );
 setLastSaved("restored + synced");
 applyStorageStatus(buildStorageStatus({ mode: "cloud", label: "SYNCED", reason: STORAGE_STATUS_REASONS.synced, detail: "Cloud sync is working normally." }));
 return true;
 } catch(e) {
 logDiag("import failed", e.message);
 applyStorageStatus(buildStorageStatus({
 mode: "local",
 label: "RESTORE FAILED",
 reason: STORAGE_STATUS_REASONS.dataIncompatible,
 detail: "The restore payload could not be applied safely.",
 }));
 return false;
 }
 };

 const startFreshPlan = async () => {
 const todayIso = new Date().toISOString().split("T")[0];
 const undoExpiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
 const planArcLabel = `${canonicalGoalState?.planStartDate || "Unknown start"} ? ${todayIso}`;
 const archiveEntry = {
 id: `archive_${Date.now()}`,
 archivedAt: new Date().toISOString(),
 planArcLabel,
 goalsSnapshot: goalsModel,
 prescribedDayHistory: cloneStructuredValue(plannedDayRecords || {}),
 planWeekHistory: cloneStructuredValue(planWeekRecords || {}),
 logEntries: Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([date, entry]) => ({ date, ...entry })),
 };
 const undoSnapshot = {
 logs,
 bodyweights,
 paceOverrides,
 weekNotes,
 planAlerts,
 goals: goalsModel,
 dailyCheckins,
 plannedDayRecords,
 planWeekRecords,
 weeklyCheckins,
 nutritionFavorites,
 nutritionActualLogs,
 coachActions,
 coachPlanAdjustments,
 personalization,
 };
 const nextPersonalizationBase = mergePersonalization(personalization, {
 profile: { ...personalization.profile, onboardingComplete: false },
 injuryPainState: (personalization?.injuryPainState?.level || "none") === "none"
 ? {
 ...personalization.injuryPainState,
 notes: "",
 preserveForPlanning: false,
 activeModifications: [],
 }
 : personalization.injuryPainState,
 planArchives: [archiveEntry, ...(personalization?.planArchives || [])].slice(0, 12),
 planResetUndo: { startedAt: Date.now(), startedDate: todayIso, expiresAt: undoExpiresAt, snapshot: undoSnapshot },
 });
 const nextPersonalization = withLegacyGoalProfileCompatibility({
 personalization: nextPersonalizationBase,
 canonicalAthlete,
 goalStateOverrides: { planStartDate: todayIso },
 });
 const clearedLogs = {};
 const clearedBodyweights = [];
 const clearedPaceOverrides = {};
 const clearedWeekNotes = {};
 const resetAlerts = [{ id:`fresh_${Date.now()}`, type:"info", msg:`New plan started ${todayIso}.`, ts: Date.now() }];
 const resetDaily = {};
 const resetPlannedDayRecords = {};
 const resetPlanWeekRecords = {};
 const resetWeekly = {};
 setLogs(clearedLogs);
 setBodyweights(clearedBodyweights);
 setPaceOverrides(clearedPaceOverrides);
 setWeekNotes(clearedWeekNotes);
 setPlanAlerts(resetAlerts);
 setDailyCheckins(resetDaily);
 setPlannedDayRecords(resetPlannedDayRecords);
 setPlanWeekRecords(resetPlanWeekRecords);
 setWeeklyCheckins(resetWeekly);
 setPersonalization(nextPersonalization);
 setStartFreshConfirmOpen(false);
 await persistAll(clearedLogs, clearedBodyweights, clearedPaceOverrides, clearedWeekNotes, resetAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goalsModel, resetDaily, resetWeekly, nutritionFavorites, nutritionActualLogs, resetPlannedDayRecords, resetPlanWeekRecords);
 };

 const undoStartFresh = async () => {
 const undo = personalization?.planResetUndo;
 if (!undo || Date.now() > Number(undo?.expiresAt || 0) || !undo?.snapshot) return;
 const snap = undo.snapshot;
 // LEGACY_COMPAT: reset undo snapshots may predate nutritionActualLogs.
 const restoredNutritionActualLogs = resolveNutritionActualLogStoreCompat({
 nutritionActualLogs: snap.nutritionActualLogs,
 legacyNutritionFeedback: snap.nutritionFeedback || {},
 });
 const restoredPersonalization = mergePersonalization(snap.personalization || personalization, { planResetUndo: null });
 setLogs(snap.logs || {});
 setBodyweights(snap.bodyweights || []);
 setPaceOverrides(snap.paceOverrides || {});
 setWeekNotes(snap.weekNotes || {});
 setPlanAlerts(snap.planAlerts || []);
 setGoals(normalizeGoals(snap.goals || goalsModel));
 setDailyCheckins(snap.dailyCheckins || {});
 setPlannedDayRecords(snap.plannedDayRecords || {});
 setPlanWeekRecords(snap.planWeekRecords || {});
 setWeeklyCheckins(snap.weeklyCheckins || {});
 setNutritionFavorites(snap.nutritionFavorites || nutritionFavorites);
 setNutritionActualLogs(restoredNutritionActualLogs);
 setCoachActions(snap.coachActions || coachActions);
 setCoachPlanAdjustments(snap.coachPlanAdjustments || coachPlanAdjustments);
 setPersonalization(restoredPersonalization);
 await persistAll(snap.logs || {}, snap.bodyweights || [], snap.paceOverrides || {}, snap.weekNotes || {}, snap.planAlerts || [], restoredPersonalization, snap.coachActions || coachActions, snap.coachPlanAdjustments || coachPlanAdjustments, normalizeGoals(snap.goals || goalsModel), snap.dailyCheckins || {}, snap.weeklyCheckins || {}, snap.nutritionFavorites || nutritionFavorites, restoredNutritionActualLogs, snap.plannedDayRecords || {}, snap.planWeekRecords || {});
 };

 const undoBanner = (() => {
 const undo = personalization?.planResetUndo;
 if (!undo) return null;
 if (Date.now() > Number(undo?.expiresAt || 0)) return null;
 return { startedDate: undo.startedDate, expiresAt: undo.expiresAt };
 })();
 // Merge default zones with any AI-generated overrides
 function getZones(phaseName) {
 const defaults = sanitizeWorkoutZones(PHASE_ZONES[phaseName] || PHASE_ZONES["BASE"]);
 const overrides = sanitizeWorkoutZones(paceOverrides[phaseName] || {});
 return { ...defaults, ...overrides };
 }

 // AI PLAN ANALYSIS
 // Fires after every log save. Compares actual vs prescribed, detects patterns,
 // returns JSON modifications to apply to the plan.
 // TODO(ai-runtime): Remaining ad hoc AI payload paths are tracked in
 // `AI_RUNTIME_TODO_PATHS` and still use this thin text helper until unified.
const getAnthropicKey = () => (typeof window !== "undefined"
 ? resolveStoredAiApiKey({
   safeStorageGet,
   storageLike: localStorage,
   debugMode: safeStorageGet(localStorage, "trainer_debug", "0") === "1",
   hostname: window.location?.hostname || "",
 })
 : "");
 const callAnthropic = async ({ system, user, maxTokens = 800 }) => {
 const key = getAnthropicKey();
 if (!key) return null;
 try {
 const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 "x-api-key": key,
 "anthropic-version": "2023-06-01"
 },
 body: JSON.stringify({
 model: "claude-3-5-haiku-latest",
 max_tokens: maxTokens,
 system,
 messages: [{ role: "user", content: user }]
 })
 }, 9000);
 if (!res.ok) return null;
 const data = await res.json();
 return data?.content?.[0]?.text || null;
 } catch {
 return null;
 }
 };

 const analyzePlan = async (newLogs) => {
 setAnalyzing(true);
 try {
 const analysisPacketArgs = {
 dateKey: todayKey,
 currentWeek,
 canonicalGoalState,
 canonicalUserProfile,
 goals: goalsModel,
 planDay,
 planWeek: currentPlanWeek,
 logs: newLogs,
 dailyCheckins,
 nutritionActualLogs,
 bodyweights,
 momentum,
 expectations,
 strengthLayer,
 optimizationLayer,
 failureMode,
 readiness: sharedReadinessInfluence,
 nutritionComparison,
 arbitration,
 memoryInsights,
 weekNotes,
 paceOverrides,
 planAlerts,
 };
 validateAiPacketInvariant(analysisPacketArgs, "runPlanAnalysisRuntime");
 const analysisResult = await runPlanAnalysisRuntime({
 apiKey: getAnthropicKey(),
 safeFetchWithTimeout,
 packetArgs: analysisPacketArgs,
 });
 if (!analysisResult.ok && analysisResult.status === "invalid_json") {
 logDiag("Plan analysis degraded: invalid JSON proposal");
 setAnalyzing(false);
 return;
 }
 if (!analysisResult.ok) {
 setAnalyzing(false);
 return;
 }
 if (analysisResult.rejected.length > 0) {
 logDiag("AI plan proposal rejected parts:", analysisResult.rejected.join("; "));
 }
 const result = analysisResult.accepted;

 if (!analysisResult.hasChanges || result?.noChange) {
 setAnalyzing(false);
 return;
 }

 // Apply pace adjustments
 let newOverrides = paceOverrides;
 if (result.paceAdjustments && Object.keys(result.paceAdjustments).length > 0) {
 newOverrides = { ...paceOverrides };
 Object.entries(result.paceAdjustments).forEach(([phase, zones]) => {
 newOverrides[phase] = { ...(newOverrides[phase] || {}), ...zones };
 });
 setPaceOverrides(newOverrides);
 }

 // Apply week notes
 let newWeekNotes = weekNotes;
 if (result.weekNotes && Object.keys(result.weekNotes).length > 0) {
 newWeekNotes = { ...weekNotes, ...result.weekNotes };
 setWeekNotes(newWeekNotes);
 }

 // Apply alerts (deduplicate by id)
 let newAlerts = planAlerts;
 if (result.alerts && result.alerts.length > 0) {
 const existingIds = new Set(planAlerts.map(a => a.id));
 const added = result.alerts
 .filter(a => !existingIds.has(a.id))
 .map(a => ({ ...a, ts: Date.now() }));
 newAlerts = [...added, ...planAlerts].slice(0, 10);
 setPlanAlerts(newAlerts);
 }

 // Persist plan state changes to Supabase
 if (newOverrides !== paceOverrides || newWeekNotes !== weekNotes || newAlerts !== planAlerts) {
 savePlanState(newOverrides, newWeekNotes, newAlerts);
 }
 } catch(e) {
 // Silent fail - analysis is best-effort, never blocks logging
 logDiag("Plan analysis degraded:", e.message);
 }
 setAnalyzing(false);
 };

 const TABS = [
 { id: "today", label: "Today" },
 { id: "log", label: "Log" },
 { id: "program", label: "Plan" },
 { id: "nutrition", label: "Nutrition" },
 { id: "coach", label: "Coach" },
 ];
 const warmSecondaryTabs = useCallback(() => {
 loadFormaLazyChunk(FORMA_LAZY_CHUNK_NAMES.secondaryTabs).catch(() => {});
 }, []);
 const secondarySurfaceRuntime = useMemo(() => ({
 C,
 PRODUCT_BRAND,
 DEFAULT_TIMEZONE,
 DEFAULT_PERSONALIZATION,
 PROFILE,
 WEEKS,
 DEFAULT_NUTRITION_FAVORITES,
 HEALTHKIT_PERMISSIONS,
 PLAN_STATUS_TONES,
 BAND_TENSION_LEVELS,
 AppearanceThemeSection,
 MetricsBaselinesSection,
 safeStorageGet,
 safeStorageSet,
 sanitizeDisplayText,
 sanitizeStatusLabel,
 mergePersonalization,
 toTestIdFragment,
 buildProvenanceText,
 cleanSurfaceSessionLabel,
 resolveCanonicalSurfaceSessionLabel,
 buildReviewBadgeTone,
 buildStrengthPrescriptionEntriesForLogging,
 buildGoalPrioritySummaryLine,
 deriveDeterministicReadinessState,
 buildSundayWeekInReview,
 getDiagnosticsCode,
 getPlannedTrainingForLogDraft,
 inferGoalTemplateCategoryIdForDraft,
 inferExerciseMode,
 normalizeExerciseKey,
 resolvePlannedDayHistoryEntry,
 validateAiPacketInvariant,
 validateDeterministicCoachPacketInvariant,
 buildInjuryRuleResult,
 SyncStateCallout,
 CompactSyncStatus,
 }), []);

 const runtimeAppearance = personalization?.settings?.appearance || DEFAULT_PERSONALIZATION.settings.appearance;
 const bootBrandThemeState = buildBrandThemeState({
 appearance: runtimeAppearance,
 });
 const bootThemeTokens = bootBrandThemeState.cssVars || {};
 const bootResolvedMode = String(bootBrandThemeState.resolvedMode || "").toLowerCase() === "light" ? "light" : "dark";

 if (authInitializing || loading) return (
 <div style={{ ...bootThemeTokens, background:bootBrandThemeState.appBackground, minHeight:"100vh", display:"grid", placeItems:"center", padding:"1rem", fontFamily:"var(--font-body)", color:"var(--text)", colorScheme:bootResolvedMode }}>
 <div style={{ width:"min(480px, 100%)", display:"grid", gap:"0.9rem", padding:"1.15rem", borderRadius:"calc(var(--radius-lg) + 4px)", border:"1px solid color-mix(in srgb, var(--border) 90%, rgba(255,255,255,0.06))", background:"linear-gradient(180deg, color-mix(in srgb, var(--panel-2) 84%, transparent) 0%, color-mix(in srgb, var(--panel) 98%, transparent) 100%)", boxShadow:"var(--shadow-2), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
 <div style={{ display:"flex", alignItems:"center", gap:"0.85rem" }}>
 <div aria-hidden="true" style={{ width:54, height:54, borderRadius:18, display:"grid", placeItems:"center", background:"linear-gradient(135deg, color-mix(in srgb, var(--brand-mark-bg) 92%, transparent) 0%, color-mix(in srgb, var(--surface-1) 96%, transparent) 100%)", border:"1px solid color-mix(in srgb, var(--brand-mark-border) 84%, rgba(255,255,255,0.06))", boxShadow:"var(--shadow-2)", color:"var(--text-strong)", fontFamily:"var(--font-display)", fontSize:"1.22rem", fontWeight:700, letterSpacing:"0.08em" }}>{PRODUCT_BRAND.mark}</div>
 <div style={{ display:"grid", gap:"0.18rem", minWidth:0 }}>
 <div style={{ fontFamily:"var(--font-display)", fontSize:"1rem", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--text-strong)" }}>
 Opening {PRODUCT_BRAND.name}
 </div>
 <div style={{ fontSize:"0.58rem", color:"var(--text-soft)", lineHeight:1.55 }}>
 Restoring your training space and account context.
 </div>
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.24rem" }}>
 <div style={{ height:8, borderRadius:999, background:"color-mix(in srgb, var(--surface-2) 92%, transparent)", overflow:"hidden" }}>
 <div style={{ width:"42%", height:"100%", borderRadius:999, background:"var(--cta-bg)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08)" }} />
 </div>
 <div style={{ fontSize:"0.48rem", color:"var(--muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Getting the shell ready
 </div>
 </div>
 </div>
 </div>
 );

 const authProviderUnavailable = syncStateModel?.id === SYNC_STATE_IDS.fatalError && syncStateModel?.reasonKey === "provider_unavailable";
 const authRecoveryMode = authMode === "recovery";
 const authSubmitDisabled = Boolean(
 authProviderUnavailable
 || (authRecoveryMode && authRecoveryBusy)
 );
 const authBrandThemeState = bootBrandThemeState;
 const authEntryTheme = buildAuthEntryTheme({ brandThemeState: authBrandThemeState });
 const authEntryView = buildAuthEntryViewModel({
 authMode,
 startupLocalResumeAvailable: startupUsableLocalResumeAvailable,
 authProviderUnavailable,
 allowLocalFallback: TRUSTED_DEBUG_MODE,
 syncStateModel,
 });

 if (authGateVisible) return (
 <div data-testid="auth-gate" className="auth-entry-root" style={authEntryTheme.cssVars}>
 <style>{AUTH_ENTRY_STYLE_TEXT}</style>
 <div className="auth-entry-shell">
 <section className="auth-entry-rail" data-testid="auth-entry-rail">
 <div className="auth-brand-row">
 <div className="auth-brand-mark" aria-hidden="true">{PRODUCT_BRAND.mark}</div>
 <div className="auth-brand-copy">
 <div className="auth-brand-wordmark">{PRODUCT_BRAND.name}</div>
 <div className="auth-brand-strapline">{PRODUCT_BRAND.strapline}</div>
 </div>
 </div>
 <div className="auth-eyebrow">{authEntryView.eyebrow}</div>
 <div className="auth-title">{authEntryView.title}</div>
 <div className="auth-subtitle">{authEntryView.subtitle}</div>
 {authEntryView.statusBadges.length > 0 && (
 <div className="auth-status-row">
 {authEntryView.statusBadges.map((badge) => (
 <div key={badge} className="auth-status-badge">{badge}</div>
 ))}
 </div>
 )}
 {authEntryView.showExceptionalContext && (
 <SyncStateCallout
 model={syncSurfaceModels?.auth || null}
 dataTestId="auth-sync-status"
 style={{ background:"var(--auth-panel-soft)", borderColor:"var(--auth-border)" }}
 />
 )}
 {authEntryView.pathCards.length > 0 && (
 <div className="auth-path-grid">
 {authEntryView.pathCards.map((card) => (
 <article
 key={card.id}
 className="auth-path-card"
 data-testid={`auth-path-${card.id}`}
 data-tone={card.tone}
 data-emphasis={card.emphasis}
 >
 <div>
 <div className="auth-path-kicker">{card.kicker}</div>
 <div className="auth-path-title" style={{ marginTop:"0.28rem" }}>{card.title}</div>
 </div>
 <div className="auth-path-description">{card.description}</div>
 <div className="auth-benefit-list">
 {card.benefits.map((benefit) => (
 <div key={benefit} className="auth-benefit-item">
 <span className="auth-benefit-dot" aria-hidden="true" />
 <span>{benefit}</span>
 </div>
 ))}
 </div>
 </article>
 ))}
 </div>
 )}
 </section>
 <section className="auth-entry-form" data-testid="auth-entry-form">
 <div className="auth-form-head">
 <div className="auth-section-label">Account</div>
 <div className="auth-form-title">{authEntryView.form.title}</div>
 <div className="auth-form-support">{authEntryView.form.description}</div>
 </div>
 {authEntryView.form.modeOptions.length > 0 && (
 <div className="auth-mode-switch" role="tablist" aria-label="Account access mode">
 {authEntryView.form.modeOptions.map((option) => (
 <button
 key={option.id}
 type="button"
 role="tab"
 aria-selected={option.active}
 data-auth-variant={option.variant}
 data-active={option.active ? "true" : "false"}
 data-testid={`auth-mode-${option.id}`}
 className="auth-mode-button"
 onClick={() => {
 const nextAuthMode = option.id;
 const applyAuthModeSwitch = () => {
 trackFrictionEvent({
 flow: "auth",
 action: "mode_switch",
 outcome: "selected",
 props: {
 mode: nextAuthMode,
 },
 });
 if (authRecoveryActive) {
 authStorage.clearPasswordRecoverySession?.();
 setAuthRecoverySession(null);
 setAuthPassword("");
 setAuthPasswordConfirm("");
 }
 setAuthNotice("");
 if (nextAuthMode !== "signin") {
 setAuthPendingConfirmationEmail("");
 }
 setAuthMode(nextAuthMode);
 };
 if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
 window.setTimeout(applyAuthModeSwitch, 0);
 return;
 }
 applyAuthModeSwitch();
 }}
 >
 <span className="auth-mode-title">{option.label}</span>
 <span className="auth-mode-description">{option.description}</span>
 </button>
 ))}
 </div>
 )}
 <div className="auth-fieldset">
 {authMode === "signup" && (
 <>
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-signup-name">Display name</label>
 <input
 id="auth-signup-name"
 data-testid="auth-signup-name"
 className="auth-field-input"
 ref={authDisplayNameInputRef}
 defaultValue={authDisplayName}
 onInput={e=>setAuthDisplayName(e.currentTarget.value)}
 onChange={e=>setAuthDisplayName(e.target.value)}
 placeholder="First name or display name"
 autoComplete="given-name"
 />
 </div>
 <div className="auth-field-row">
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-signup-units">Units</label>
 <select
 id="auth-signup-units"
 data-testid="auth-signup-units"
 className="auth-field-input"
 value={authUnits}
 onChange={e=>setAuthUnits(e.target.value)}
 >
 <option value="imperial">Imperial</option>
 <option value="metric">Metric</option>
 </select>
 </div>
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-signup-timezone">Timezone</label>
 <input
 id="auth-signup-timezone"
 data-testid="auth-signup-timezone"
 className="auth-field-input"
 value={authTimezone}
 onChange={e=>setAuthTimezone(e.target.value)}
 placeholder="America/Chicago"
 autoComplete="off"
 />
 </div>
 </div>
 </>
 )}
 {authRecoveryMode ? (
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-recovery-email">Resetting password for</label>
 <input
 id="auth-recovery-email"
 data-testid="auth-recovery-email"
 className="auth-field-input"
 value={String(authRecoverySession?.user?.email || authEmail || "")}
 readOnly
 disabled
 autoComplete="email"
 />
 </div>
 ) : (
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-email">Email</label>
 <input
 id="auth-email"
 data-testid="auth-email"
 className="auth-field-input"
 ref={authEmailInputRef}
 defaultValue={authEmail}
 onInput={e=>setAuthEmail(e.currentTarget.value)}
 onChange={e=>setAuthEmail(e.target.value)}
 placeholder="you@example.com"
 autoComplete="email"
 />
 </div>
 )}
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-password">{authRecoveryMode ? "New password" : "Password"}</label>
 <input
 id="auth-password"
 key={`auth-password-${authMode}`}
 data-testid="auth-password"
 className="auth-field-input"
 type="password"
 ref={authPasswordInputRef}
 defaultValue={authPassword}
 onInput={e=>setAuthPassword(e.currentTarget.value)}
 onChange={e=>setAuthPassword(e.target.value)}
 placeholder={authRecoveryMode ? "Choose a new password" : authMode === "signup" ? "Create a password" : "Enter your password"}
 autoComplete={authMode === "signin" ? "current-password" : "new-password"}
 />
 </div>
 {authRecoveryMode && (
 <div className="auth-field">
 <label className="auth-field-label" htmlFor="auth-password-confirm">Confirm new password</label>
 <input
 id="auth-password-confirm"
 data-testid="auth-password-confirm"
 className="auth-field-input"
 type="password"
 ref={authPasswordConfirmInputRef}
 defaultValue={authPasswordConfirm}
 onInput={e=>setAuthPasswordConfirm(e.currentTarget.value)}
 onChange={e=>setAuthPasswordConfirm(e.target.value)}
 placeholder="Enter it one more time"
 autoComplete="new-password"
 />
 </div>
 )}
 </div>
 {authMode === "signin" && (
 <div className="auth-inline-links">
 <button
 type="button"
 data-testid="auth-forgot-password"
 data-auth-variant="tertiary"
 className="auth-action"
 disabled={authPasswordResetBusy}
 onClick={() => scheduleAuthAction(() => handleForgotPassword({ source: "auth_gate" }))}
 >
 {authPasswordResetBusy ? "Sending reset link..." : "Forgot password?"}
 </button>
 </div>
 )}
 {authMode === "signin" && authPendingConfirmationEmail && (
 <div className="auth-inline-links">
 <button
 type="button"
 data-testid="auth-resend-confirmation"
 data-auth-variant="tertiary"
 className="auth-action"
 disabled={authConfirmationResendBusy}
 onClick={() => scheduleAuthAction(() => handleResendSignupConfirmation({ source: "auth_gate" }))}
 >
 {authConfirmationResendBusy ? "Resending confirmation..." : "Resend confirmation email"}
 </button>
 </div>
 )}
 {authRecoveryMode && (
 <div className="auth-inline-links">
 <button
 type="button"
 data-testid="auth-recovery-cancel"
 data-auth-variant="tertiary"
 className="auth-action"
 disabled={authRecoveryBusy}
 onClick={() => scheduleAuthAction(() => exitPasswordRecovery())}
 >
 Back to sign in
 </button>
 </div>
 )}
 <div className="auth-action-stack">
 <button
 type="button"
 data-testid="auth-submit"
 data-auth-variant={authEntryView.form.primaryAction.variant}
 className="auth-action"
 onClick={() => scheduleAuthAction(authMode === "signup" ? handleSignUp : authRecoveryMode ? handlePasswordRecoverySubmit : handleSignIn)}
 disabled={authSubmitDisabled}
 >
 {authRecoveryMode && authRecoveryBusy ? "Updating password..." : authEntryView.form.primaryAction.label}
 </button>
 <div className="auth-action-caption" data-testid="auth-primary-caption">
 {authEntryView.form.primaryCaption}
 </div>
 {authEntryView.localAction && (
 <div className="auth-local-cta" data-testid="auth-local-cta">
 <div className="auth-local-cta-head">
 <div className="auth-status-badge" style={{ width:"fit-content" }}>{authEntryView.localAction.badge}</div>
 <div className="auth-local-cta-title">{authEntryView.localAction.title}</div>
 <div className="auth-local-cta-description" data-testid="auth-local-cta-description">
 {authEntryView.localAction.description}
 </div>
 </div>
 <button
 type="button"
 data-testid="continue-local-mode"
 data-auth-variant={authEntryView.localAction.variant}
 className="auth-action"
 onClick={() => scheduleAuthAction(() => {
 trackFrictionEvent({
 flow: "auth",
 action: "continue_local_mode",
 outcome: "selected",
 props: {
 local_resume_available: startupLocalResumeAvailable,
 },
 });
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.authLifecycleChanged,
 dedupeKey: `auth_continue_local_${startupLocalResumeAvailable ? "resume" : "blank"}_${Math.floor(Date.now() / 1000)}`,
 payload: buildAuthLifecycleEventInput({
 authEvent: "continue_local_mode",
 status: "selected",
 source: "auth_gate",
 hadCloudSession: false,
 mergedLocalCache: Boolean(startupLocalResumeAvailable),
 detail: startupLocalResumeAvailable
 ? "The user chose the saved local resume path instead of signing in."
 : "The user chose to continue in local-only mode.",
 }),
 });
 if (startupLocalResumeAvailable) {
 suspendLocalPersistenceRef.current = false;
 hydrateLocalRuntimeCache({
 statusOverride: buildStorageStatus({
 mode: "local",
 label: "NOT SIGNED IN",
 reason: STORAGE_STATUS_REASONS.notSignedIn,
 detail: "You are using local data because no signed-in cloud session is active.",
 }),
 });
 } else {
 suspendLocalPersistenceRef.current = false;
 applyStorageStatus(buildStorageStatus({
 mode: "local",
 label: "LOCAL MODE",
 reason: STORAGE_STATUS_REASONS.providerUnavailable,
 detail: "Cloud sign-in is unavailable, so the app is continuing with local-only storage.",
 }));
 }
 setAuthError("");
 setStartupLocalResumeAccepted(true);
 })}
 >
 {authEntryView.localAction.label}
 </button>
 </div>
 )}
 {authNotice && <div data-testid="auth-notice" className="auth-notice">{authNotice}</div>}
 {authError && <div className="auth-error">{authError}</div>}
 </div>
 </section>
 </div>
 </div>
 );


 const activeTargetDate = activeTimeBoundGoal?.targetDate || canonicalGoalState?.deadline || null;
 const daysToRace = activeTargetDate ? Math.max(0, Math.ceil((new Date(activeTargetDate) - today) / (1000*60*60*24))) : null;
 const activePhase = (rollingHorizon || []).find(h => h.absoluteWeek === currentWeek)?.template?.phase || todayWorkoutHardened?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
 const currentPhaseWeekLabel = sanitizeDisplayText(
 (rollingHorizon || []).find(h => h.absoluteWeek === currentWeek)?.weekLabel
 || joinDisplayParts([activePhase, `Week ${currentWeek}`])
 );
 const PHASE_THEME = {
 BASE: { accent: "#27f59a", accentSoft: "rgba(39,245,154,0.2)", accentGlow: "rgba(39,245,154,0.34)" },
 BUILDING: { accent: "#00c2ff", accentSoft: "rgba(0,194,255,0.22)", accentGlow: "rgba(0,194,255,0.34)" },
 PEAKBUILD: { accent: "#7c5cff", accentSoft: "rgba(124,92,255,0.24)", accentGlow: "rgba(124,92,255,0.35)" },
 PEAK: { accent: "#ff3d81", accentSoft: "rgba(255,61,129,0.24)", accentGlow: "rgba(255,61,129,0.36)" },
 TAPER: { accent: "#9aa6ff", accentSoft: "rgba(154,166,255,0.22)", accentGlow: "rgba(154,166,255,0.32)" },
 };
 const phaseTheme = PHASE_THEME[activePhase] || PHASE_THEME.BASE;
 const brandThemeState = buildBrandThemeState({
 appearance: personalization?.settings?.appearance || DEFAULT_PERSONALIZATION.settings.appearance,
 phaseTheme,
 });
 const themeTokens = brandThemeState.cssVars;
 const appBackground = brandThemeState.appBackground;
 const activeBrandTheme = brandThemeState.theme;
 const activeAppearanceMode = brandThemeState.resolvedMode;
 const onboardingComplete = personalization?.profile?.onboardingComplete;
 const profileSetupComplete = personalization?.profile?.profileSetupComplete ?? onboardingComplete;
 const finishProfileSetup = async (profileDraft = {}) => {
 const todayKey = new Date().toISOString().split("T")[0];
 const unitPreset = profileDraft?.units === "metric"
 ? { weight: "kg", height: "cm", distance: "kilometers" }
 : { weight: "lbs", height: "ft_in", distance: "miles" };
 const nextTrainingContext = buildTrainingContextFromEditor({
 mode: profileDraft?.environmentMode || "Home",
 equipment: profileDraft?.equipmentAccess || TRAINING_EQUIPMENT_VALUES.unknown,
 time: profileDraft?.sessionLength || TRAINING_SESSION_DURATION_VALUES.min30,
 intensity: personalization?.settings?.trainingPreferences?.intensityPreference || TRAINING_INTENSITY_VALUES.standard,
 });
 const explicitAge = Number(profileDraft?.age || 0) || "";
 const birthYear = Number(profileDraft?.birthYear || 0) || "";
 const age = explicitAge || (birthYear ? Math.max(13, new Date().getFullYear() - birthYear) : "");
 const derivedBirthYear = age ? Math.max(1900, new Date().getFullYear() - Number(age)) : "";
 const nextPersonalization = mergePersonalization(personalization, {
 profile: {
 ...personalization.profile,
 name: String(profileDraft?.name || "").trim() || personalization?.profile?.name || DEFAULT_PERSONALIZATION.profile.name,
 timezone: String(profileDraft?.timezone || "").trim() || personalization?.profile?.timezone || DEFAULT_PERSONALIZATION.profile.timezone,
 birthYear: derivedBirthYear,
 age,
 height: profileDraft?.height,
 weight: profileDraft?.weight,
 trainingAgeYears: Math.max(0, Number(profileDraft?.trainingAgeYears || 0) || 0),
 estimatedFitnessLevel: profileDraft?.trainingAgeYears >= 5 ? "advanced" : profileDraft?.trainingAgeYears >= 2 ? "intermediate" : personalization?.profile?.estimatedFitnessLevel || "beginner",
 profileSetupComplete: true,
 },
 settings: {
 ...(personalization.settings || DEFAULT_PERSONALIZATION.settings),
 units: unitPreset,
 },
 trainingContext: nextTrainingContext,
 environmentConfig: {
 ...(personalization.environmentConfig || DEFAULT_PERSONALIZATION.environmentConfig),
 defaultMode: trainingEnvironmentToDisplayMode(nextTrainingContext?.environment?.value || "") || "Home",
 base: {
 equipment: trainingEquipmentToEnvironmentCode(nextTrainingContext?.equipmentAccess?.value || "") || "unknown",
 time: nextTrainingContext?.sessionDuration?.value || "30",
 },
 },
 });
 setPersonalization(nextPersonalization);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 setLastSaved(todayKey);
 };
 const finishOnboarding = async (answers) => {
 const todayKey = new Date().toISOString().split("T")[0];
 const existingMemory = personalization?.coachMemory?.longTermMemory || [];
 const experienceLevel = answers.experience_level || "beginner";
 const trainingContext = buildTrainingContextFromAnswers({ answers });
 const injuryConstraintContext = buildIntakeInjuryConstraintContext({
 injuryText: answers.injury_text,
 injuryImpact: answers.injury_impact,
 injuryArea: answers.injury_area,
 injurySide: answers.injury_side,
 injuryLimitations: answers.injury_limitations,
 });
 const sessionLength = trainingContext?.sessionDuration?.confirmed ? trainingContext.sessionDuration.value : (answers.session_length || "30");
 const coachingStyle = String(answers.coaching_style || "Balanced coaching").trim();
 const trainingDaysLabel = String(answers.training_days || "3").trim();
 const trainingDays = trainingDaysLabel === "6+" ? 6 : Math.max(2, Number(trainingDaysLabel) || 3);
 const availableTrainingDays = parseAvailableTrainingDaysForIntakePacket(answers.available_training_days || answers.available_days || []);
 const availableTrainingDayLabels = formatTrainingWeekdayAvailability(availableTrainingDays);
 const trainingLocation = trainingContext?.environment?.confirmed ? trainingEnvironmentToDisplayMode(trainingContext.environment.value) : "Unknown";
 const homeEquipment = Array.isArray(answers.home_equipment) ? answers.home_equipment.filter(Boolean) : [];
 const homeEquipmentOther = String(answers.home_equipment_other || "").trim();
 const normalizedEquipment = [
 ...homeEquipment.filter((item) => item !== "Other"),
 ...(homeEquipment.includes("Other") && homeEquipmentOther ? [homeEquipmentOther] : []),
 ];
 if (trainingContext?.environment?.value === TRAINING_ENVIRONMENT_VALUES.home && normalizedEquipment.length === 0) {
 normalizedEquipment.push("Bodyweight only");
 }
 const constraints = [];
 if (injuryConstraintContext.hasCurrentIssue) {
 constraints.push(...injuryConstraintContext.constraints);
 }
 const freshPacketArgs = buildIntakePacketArgsFromAnswers({ answers, existingMemory });
 const expectedRawGoalText = sanitizeIntakeText(String(freshPacketArgs?.intakeContext?.rawGoalText || "").trim());
 const providedPacketRawGoalText = sanitizeIntakeText(String(
 answers?.typedIntakePacket?.intake?.rawGoalText
 || answers?.typedIntakePacket?.intakeContext?.rawGoalText
 || ""
 ).trim());
 const canonicalCommitValidation = validateIntakeCommitRequest(answers?.intake_commit || null);
 const canonicalCommit = canonicalCommitValidation.ok ? canonicalCommitValidation.commitRequest : null;
 const canReuseAssessmentBoundary = Boolean(expectedRawGoalText && providedPacketRawGoalText && expectedRawGoalText === providedPacketRawGoalText);
 const fallbackTypedIntakePacket = canonicalCommit?.typedIntakePacket || (canReuseAssessmentBoundary ? answers?.typedIntakePacket : {
 version: "2026-04-v1",
 intent: "intake_interpretation",
 intake: freshPacketArgs.intakeContext,
 });
 const goalResolution = canonicalCommit
 ? {
 resolvedGoals: canonicalCommit.confirmedResolvedGoals,
 confidenceLevel: canonicalCommit.confirmedResolvedGoals?.[0]?.confidence || "",
 unresolvedGaps: canonicalCommit.confirmedResolvedGoals.flatMap((goal) => goal?.unresolvedGaps || []),
 }
 : resolveGoalTranslation({
 rawUserGoalIntent: expectedRawGoalText || fallbackTypedIntakePacket?.intake?.rawGoalText || buildRawGoalIntentFromAnswers({ answers, fallbackLabel: "General Fitness" }) || "General Fitness",
 typedIntakePacket: fallbackTypedIntakePacket,
 aiInterpretationProposal: canReuseAssessmentBoundary ? (answers?.aiInterpretationProposal || null) : null,
 explicitUserConfirmation: {
 confirmed: true,
 acceptedProposal: true,
 source: "onboarding_complete",
 },
 now: todayKey,
 });
 const baseResolvedGoals = canonicalCommit?.confirmedResolvedGoals?.length
 ? canonicalCommit.confirmedResolvedGoals
 : (goalResolution?.resolvedGoals || []);
 const intakeCompleteness = deriveIntakeCompletenessState({
 resolvedGoals: baseResolvedGoals,
 answers,
 });
 const goalFeasibility = canonicalCommit?.goalFeasibility || assessGoalFeasibility({
 resolvedGoals: baseResolvedGoals,
 ...buildGoalFeasibilityContextFromIntake(fallbackTypedIntakePacket?.intake || {}),
 intakeCompleteness,
 now: todayKey,
 });
 const feasibleResolvedGoals = canonicalCommit?.confirmedResolvedGoals?.length
 ? canonicalCommit.confirmedResolvedGoals
 : applyFeasibilityPriorityOrdering({
 resolvedGoals: baseResolvedGoals,
 feasibility: goalFeasibility,
 });
 const arbitrationInputs = buildConfirmedArbitrationInputs({
 answers,
 typedIntakePacket: fallbackTypedIntakePacket,
 now: todayKey,
 });
 const arbitration = canonicalCommit?.arbitration || buildGoalArbitrationStack({
 resolvedGoals: feasibleResolvedGoals,
 confirmedPrimaryGoal: arbitrationInputs.confirmedPrimaryGoal,
 confirmedAdditionalGoals: arbitrationInputs.confirmedAdditionalGoals,
 additionalGoalTexts: arbitrationInputs.additionalGoalTexts,
 goalFeasibility,
 intakeCompleteness,
 answers,
 typedIntakePacket: fallbackTypedIntakePacket,
 now: todayKey,
 });
 const arbitratedResolvedGoals = canonicalCommit?.confirmedResolvedGoals?.length
 ? canonicalCommit.confirmedResolvedGoals
 : (arbitration?.goals?.length ? arbitration.goals : feasibleResolvedGoals);
 const goalStackConfirmation = canonicalCommit?.goalStackConfirmation || buildIntakeGoalStackConfirmation({
 resolvedGoals: arbitratedResolvedGoals,
 goalStackConfirmation: answers?.goal_stack_confirmation || null,
 goalFeasibility,
 });
 const orderedResolvedGoals = canonicalCommit?.confirmedResolvedGoals?.length
 ? canonicalCommit.confirmedResolvedGoals
 : applyIntakeGoalStackConfirmation({
 resolvedGoals: arbitratedResolvedGoals,
 goalStackConfirmation,
 goalFeasibility,
 });
 const orderedPlanningGoals = buildPlanningGoalsFromResolvedGoals({
 resolvedGoals: orderedResolvedGoals,
 });
 const primaryPlanningGoal = orderedPlanningGoals?.[0] || null;
 const primaryResolvedGoal = orderedResolvedGoals?.[0] || null;
 const primaryCategory = primaryPlanningGoal?.category || "general_fitness";
 const primaryGoalLabel = primaryResolvedGoal?.summary || sanitizeIntakeText(String(answers.goal_intent || "").trim()).slice(0, 80) || "General Fitness";
 const primaryGoal = primaryGoalLabel;
 const compatibilityPrimaryGoalKey = resolveCompatibilityPrimaryGoalKey({
 explicitPrimaryGoalKey: answers.primary_goal || "",
 resolvedGoal: primaryResolvedGoal || primaryPlanningGoal,
 });
 const compatibilityUserProfile = {
 primary_goal: compatibilityPrimaryGoalKey,
 experience_level: experienceLevel,
 days_per_week: trainingDays,
 available_days: availableTrainingDays,
 session_length: sessionLength,
 equipment_access: normalizedEquipment,
 constraints,
 };
 const refreshedGoals = normalizeGoals(applyResolvedGoalsToGoalSlots({
 resolvedGoals: orderedResolvedGoals,
 goalSlots: goalsModel || DEFAULT_MULTI_GOALS,
 }));
 const nextPresets = {
 ...(DEFAULT_PERSONALIZATION.environmentConfig?.presets || {}),
 ...(personalization.environmentConfig?.presets || {}),
 Home: {
 equipment: normalizedEquipment.length ? normalizedEquipment : (personalization.environmentConfig?.presets?.Home?.equipment || ["Bodyweight only"]),
 time: sessionLength,
 },
 Outdoor: {
 equipment: personalization.environmentConfig?.presets?.Outdoor?.equipment || ["Bodyweight only", "Outdoor route"],
 time: sessionLength,
 },
 Gym: {
 equipment: personalization.environmentConfig?.presets?.Gym?.equipment || ["full rack", "barbell", "cable stack"],
 time: trainingDays >= 5 ? "45+" : sessionLength,
 },
 Travel: {
 equipment: ["Bodyweight only"],
 time: "20",
 },
 };
 const defaultMode = trainingContext?.environment?.confirmed
 ? trainingEnvironmentToDisplayMode(trainingContext.environment.value)
 : "Unknown";
 const intensityPosture = trainingContext?.intensityPosture?.value || TRAINING_INTENSITY_VALUES.unknown;
 const intensityPreference = intensityPosture === TRAINING_INTENSITY_VALUES.aggressive
 ? "Aggressive"
 : intensityPosture === TRAINING_INTENSITY_VALUES.conservative
 ? "Conservative"
 : "Standard";
 const goalMix = orderedResolvedGoals?.map((goal) => goal?.summary).filter(Boolean).join(" + ") || primaryGoalLabel;
 const onboardingMemory = [
 answers.timeline_assessment ? `Timeline assessment: ${answers.timeline_assessment}` : null,
 answers.timeline_adjustment ? `Timeline adjustment requested: ${answers.timeline_adjustment}` : null,
 `Primary goal: ${primaryGoalLabel}`,
 orderedResolvedGoals?.length ? `Resolved goals: ${orderedResolvedGoals.map((goal) => goal.summary).join(" / ")}` : null,
 orderedResolvedGoals?.[1] ? `Priority 2 goal: ${orderedResolvedGoals[1].summary}` : null,
 arbitration?.goals?.find((goal) => goal?.goalArbitrationRole === GOAL_STACK_ROLES.background)?.summary
 ? `Priority 3 goal: ${arbitration.goals.find((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.background)?.summary}`
 : null,
 arbitration?.goals?.filter((goal) => goal?.goalArbitrationRole === GOAL_STACK_ROLES.deferred).length
 ? `Later priorities: ${arbitration.goals.filter((goal) => goal.goalArbitrationRole === GOAL_STACK_ROLES.deferred).map((goal) => goal.summary).join(" / ")}`
 : null,
 goalStackConfirmation?.keepResiliencePriority ? "Recovery priority: resilience and durability stay protected." : null,
 goalFeasibility?.realismStatus ? `Goal realism: ${goalFeasibility.realismStatus}` : null,
 goalFeasibility?.conflictFlags?.[0] ? `Goal conflict: ${goalFeasibility.conflictFlags[0].summary}` : null,
 goalFeasibility?.suggestedSequencing?.[0] ? `Goal sequencing: ${goalFeasibility.suggestedSequencing[0].summary}` : null,
 orderedResolvedGoals.flatMap((goal) => goal?.tradeoffs || [])[0] ? `Goal tradeoff: ${orderedResolvedGoals.flatMap((goal) => goal?.tradeoffs || [])[0]}` : null,
 orderedResolvedGoals.flatMap((goal) => goal?.unresolvedGaps || [])[0] ? `Goal refinement gap: ${orderedResolvedGoals.flatMap((goal) => goal?.unresolvedGaps || [])[0]}` : null,
 `Experience level: ${EXPERIENCE_LEVEL_LABELS[experienceLevel] || experienceLevel}`,
 `Session length: ${SESSION_LENGTH_LABELS[sessionLength] || sessionLength}`,
 constraints.length ? `Constraints: ${constraints.join(", ")}` : "Constraints: None",
 `Training availability: ${trainingDaysLabel} days per week`,
 availableTrainingDayLabels.length ? `Usually available: ${availableTrainingDayLabels.join(", ")}` : null,
 `Primary environment: ${trainingLocation}`,
 normalizedEquipment.length ? `Equipment: ${normalizedEquipment.join(", ")}` : null,
 `Coaching preference: ${coachingStyle}`,
 ].filter(Boolean);
 const onboardingGoalState = buildGoalStateFromResolvedGoals({
 resolvedGoals: orderedResolvedGoals,
 planStartDate: todayKey,
 });
 const intakeBaselineCapture = buildManualProgressInputsFromIntake({
 answers,
 resolvedGoals: orderedResolvedGoals,
 manualProgressInputs: personalization?.manualProgressInputs || DEFAULT_PERSONALIZATION.manualProgressInputs,
 profile: personalization?.profile || DEFAULT_PERSONALIZATION.profile,
 todayKey,
 now: Date.now(),
 });
 const mappedTrainingAgeYears = EXPERIENCE_LEVEL_TO_TRAINING_AGE_YEARS[experienceLevel] ?? 0;
 const nextPersonalizationBase = mergePersonalization(personalization, {
 profile: {
 ...personalization.profile,
 ...(intakeBaselineCapture.profilePatch || {}),
 profileSetupComplete: true,
 onboardingComplete: true,
 trainingAgeYears: mappedTrainingAgeYears,
 preferredTrainingStyle: coachingStyle,
 goalMix,
 estimatedFitnessLevel: experienceLevel,
  weekOneReadyDate: todayKey,
  weekOneReadySeenAt: "",
 },
 settings: {
 ...(personalization.settings || DEFAULT_PERSONALIZATION.settings),
 trainingPreferences: {
 ...(personalization.settings?.trainingPreferences || DEFAULT_PERSONALIZATION.settings.trainingPreferences),
 defaultEnvironment: trainingContext?.environment?.confirmed
 ? trainingLocation
 : (personalization.settings?.trainingPreferences?.defaultEnvironment || DEFAULT_PERSONALIZATION.settings.trainingPreferences.defaultEnvironment),
 intensityPreference,
 },
 },
 trainingContext,
 manualProgressInputs: intakeBaselineCapture.manualProgressInputs,
 injuryPainState: {
 ...personalization.injuryPainState,
 level: constraints.length === 0 ? "none" : "mild_tightness",
 area: injuryConstraintContext?.injuryArea || personalization.injuryPainState.area,
 side: injuryConstraintContext?.injurySide || personalization.injuryPainState?.side || "unspecified",
 impact: injuryConstraintContext?.injuryImpact || "",
 limitations: injuryConstraintContext?.injuryLimitations || [],
 capabilities: injuryConstraintContext?.capabilityProfile?.capabilities || personalization.injuryPainState?.capabilities || DEFAULT_PERSONALIZATION.injuryPainState.capabilities,
 notes: constraints.length === 0 ? "" : `Onboarding note: ${constraints.join("; ")}`,
 },
 environmentConfig: {
 ...personalization.environmentConfig,
 defaultMode: trainingContext?.environment?.confirmed
 ? defaultMode
 : (personalization.environmentConfig?.defaultMode || DEFAULT_PERSONALIZATION.environmentConfig.defaultMode),
 presets: nextPresets,
 base: {
 equipment: trainingContext?.equipmentAccess?.confirmed ? trainingEquipmentToEnvironmentCode(trainingContext.equipmentAccess.value) : "unknown",
 time: trainingContext?.sessionDuration?.confirmed ? trainingContext.sessionDuration.value : "unknown",
 },
 },
 nutritionPreferenceState: {
 ...(personalization.nutritionPreferenceState || DEFAULT_PERSONALIZATION.nutritionPreferenceState),
 style: primaryCategory === "body_comp" ? "high-protein fat-loss support" : "high-protein performance",
 },
 coachMemory: {
 ...personalization.coachMemory,
 constraints: [
 `${trainingDaysLabel} day reality`,
 ...(availableTrainingDayLabels.length ? [`Usually available ${availableTrainingDayLabels.join(", ")}`] : []),
 trainingContext?.environment?.value === TRAINING_ENVIRONMENT_VALUES.variable ? "training location varies week to week" : `${trainingLocation} training setup`,
 ],
 commonBarriers: [
 `${trainingDaysLabel} day reality`,
 ...(availableTrainingDayLabels.length ? [`Core work should favor ${availableTrainingDayLabels.join(", ")}`] : []),
 trainingContext?.environment?.value === TRAINING_ENVIRONMENT_VALUES.variable ? "environment changes often" : "recovery consistency",
 ],
 scheduleConstraints: [
  `Available ${trainingDaysLabel} days per week`,
  ...(availableTrainingDayLabels.length ? [`Usually available ${availableTrainingDayLabels.join(", ")}`] : []),
  `Session length: ${SESSION_LENGTH_LABELS[sessionLength] || sessionLength}`,
 ],
 pushResponse: intensityPosture === TRAINING_INTENSITY_VALUES.aggressive
 ? "Responds well to a harder push when recovery and guardrails are in place."
 : personalization.coachMemory?.pushResponse || "",
 protectResponse: intensityPosture === TRAINING_INTENSITY_VALUES.standard
 ? "Wants balanced coaching with enough push to keep progress moving."
 : intensityPosture === TRAINING_INTENSITY_VALUES.conservative
 ? "Prefers a steadier approach that protects consistency over big swings."
 : personalization.coachMemory?.protectResponse || "",
 preferredFoodPatterns: [
 primaryCategory === "body_comp" ? "high-protein fat-loss support" : "high-protein performance",
 ],
 simplicityVsVariety: intensityPosture === TRAINING_INTENSITY_VALUES.conservative
 ? "simplicity"
 : intensityPosture === TRAINING_INTENSITY_VALUES.standard
 ? "balanced"
 : "variety",
 lastAdjustment: `Onboarding complete ${todayKey}.`,
 longTermMemory: [
 ...(personalization.coachMemory?.longTermMemory || []),
 ...(answers.starting_fresh ? ["Started a new plan from today while preserving past history and coach memory."] : []),
 ...onboardingMemory,
 ].slice(-40),
 },
 });
 const nextPersonalization = withLegacyGoalProfileCompatibility({
 personalization: nextPersonalizationBase,
 canonicalAthlete: deriveCanonicalAthleteState({
 goals: refreshedGoals,
 personalization: nextPersonalizationBase,
 profileDefaults: PROFILE,
 }),
 userProfileOverrides: compatibilityUserProfile,
 goalStateOverrides: onboardingGoalState,
 });
 setPersonalization(nextPersonalization);
 setGoals(refreshedGoals);
 setTab(0);
 const intakeCompletionEvent = buildIntakeCompletionRecommendationEventInput({
 goals: refreshedGoals,
 personalization: nextPersonalization,
 sourceSurface: "intake",
 });
 if (intakeCompletionEvent) {
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
 payload: intakeCompletionEvent,
 dedupeKey: `intake_completion_${intakeCompletionEvent.recommendationJoinKey}_${todayKey}`,
 });
 }
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.cohortSnapshotCaptured,
 payload: buildCohortSnapshotEventInput({
 goals: refreshedGoals,
 personalization: nextPersonalization,
 planComposer,
 }),
 dedupeKey: `cohort_snapshot_intake_${todayKey}_${refreshedGoals?.[0]?.id || "goal"}`,
 });
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.userStateSnapshotCaptured,
 payload: buildUserStateSnapshotEventInput({
 snapshotKind: "intake_completion",
 goals: refreshedGoals,
 currentPlanWeek,
 planDay,
 personalization: nextPersonalization,
 syncMode: storageStatus?.mode || "local",
 pendingLocalWrites: Boolean(syncDiagnostics?.pendingLocalWrites),
 latestCompletionRate: momentum?.completionRate || 0,
 }),
 dedupeKey: `user_state_intake_${todayKey}_${refreshedGoals?.[0]?.id || "goal"}`,
 });
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, refreshedGoals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 };

 const previewGoalChange = async ({
 rawGoalText = "",
 changeMode = GOAL_CHANGE_MODES.refineCurrentGoal,
 } = {}) => {
 const cleanGoalText = sanitizeIntakeText(rawGoalText || "");
 if (!cleanGoalText) return null;
 const packetArgs = buildGoalChangePacketArgs({
 rawGoalText: cleanGoalText,
 changeMode,
 canonicalUserProfile,
 personalization,
 goals: goalsModel,
 goalState: canonicalGoalState,
 existingMemory: personalization?.coachMemory?.longTermMemory || [],
 });
 const fallbackPreview = buildPreviewGoalResolutionBundle({
 intakeContext: packetArgs.intakeContext,
 aiInterpretationProposal: null,
 now: new Date(),
 });
 let typedIntakePacket = fallbackPreview.typedIntakePacket;
 let aiInterpretationProposal = null;
 const runtime = await runIntakeInterpretationRuntime({
 safeFetchWithTimeout,
 packetArgs,
 });
 if (runtime?.ok && runtime?.interpreted) {
 typedIntakePacket = runtime.statePacket || typedIntakePacket;
 aiInterpretationProposal = runtime.interpreted;
 }

 const previewBundle = buildPreviewGoalResolutionBundle({
 intakeContext: typedIntakePacket?.intake || packetArgs.intakeContext,
 aiInterpretationProposal,
 now: new Date(),
 });
 const explanationText = buildIntakeAssessmentTextFromProposal({
 payload: { primary_goal: canonicalUserProfile?.primaryGoalKey || "", primary_goal_detail: cleanGoalText },
 interpretation: aiInterpretationProposal,
 previewGoalResolution: previewBundle.goalResolution,
 goalFeasibility: previewBundle.goalFeasibility,
 });

 return {
 rawGoalText: cleanGoalText,
 changeMode,
 modeMeta: GOAL_CHANGE_MODE_META?.[changeMode] || GOAL_CHANGE_MODE_META[GOAL_CHANGE_MODES.refineCurrentGoal],
 typedIntakePacket,
 aiInterpretationProposal,
 goalResolution: previewBundle.goalResolution,
 goalFeasibility: previewBundle.goalFeasibility,
 orderedResolvedGoals: previewBundle.orderedResolvedGoals,
 explanationText,
 interpretationSource: aiInterpretationProposal ? "ai_proposal" : "deterministic_fallback",
 };
 };

 const applyGoalChange = async ({
 rawGoalText = "",
 changeMode = GOAL_CHANGE_MODES.refineCurrentGoal,
 previewBundle = null,
 } = {}) => {
 const cleanGoalText = sanitizeIntakeText(rawGoalText || "");
 if (!cleanGoalText) return { ok: false, error: "missing_goal_text" };
 const preparedPreview = previewBundle || await previewGoalChange({ rawGoalText: cleanGoalText, changeMode });
 const orderedResolvedGoals = preparedPreview?.orderedResolvedGoals || [];
 if (!orderedResolvedGoals.length) return { ok: false, error: "missing_resolved_goals" };

 const todayKeyLocal = new Date().toISOString().split("T")[0];
 const planningGoals = buildPlanningGoalsFromResolvedGoals({ resolvedGoals: orderedResolvedGoals });
 const primaryPlanningGoal = planningGoals?.[0] || null;
 const primaryCategory = primaryPlanningGoal?.category || "general_fitness";
 const nextGoals = normalizeGoals(applyResolvedGoalsToGoalSlots({
 resolvedGoals: orderedResolvedGoals,
 goalSlots: goalsModel || DEFAULT_MULTI_GOALS,
 }));
 const nextPlanStartDate = resolveGoalChangePlanStartDate({
 mode: changeMode,
 todayKey: todayKeyLocal,
 existingPlanStartDate: canonicalGoalState?.planStartDate || todayKeyLocal,
 });
 const nextGoalState = buildGoalStateFromResolvedGoals({
 resolvedGoals: orderedResolvedGoals,
 planStartDate: nextPlanStartDate,
 });
 const archiveEntry = buildGoalChangeArchiveEntry({
 todayKey: todayKeyLocal,
 mode: changeMode,
 rawGoalIntent: cleanGoalText,
 currentGoalState: canonicalGoalState,
 goals: goalsModel,
 resolvedGoals: orderedResolvedGoals,
 plannedDayRecords,
 planWeekRecords,
 weeklyCheckins,
 logs,
 });
 const historyEvent = buildGoalChangeHistoryEvent({
 todayKey: todayKeyLocal,
 mode: changeMode,
 rawGoalIntent: cleanGoalText,
 previousGoals: (goalsModel || [])
 .filter((goal) => goal?.active && goal?.category !== "injury_prevention" && goal?.id !== "g_resilience")
 .sort((a, b) => Number(a?.priority || 99) - Number(b?.priority || 99))
 .map((goal) => String(goal?.resolvedGoal?.summary || goal?.name || "").trim())
 .filter(Boolean),
 nextGoals: orderedResolvedGoals.map((goal) => goal?.summary).filter(Boolean),
 archivedPlanId: archiveEntry?.id || "",
 });
 const nextActivePlanningState = prepareGoalChangeActiveState({
 mode: changeMode,
 todayKey: todayKeyLocal,
 currentWeek,
 plannedDayRecords,
 planWeekRecords,
 weeklyCheckins,
 weekNotes,
 planAlerts,
 paceOverrides,
 coachPlanAdjustments,
 defaultCoachPlanAdjustments: DEFAULT_COACH_PLAN_ADJUSTMENTS,
 });
 const compatibilityPrimaryGoalKey = primaryCategory === "body_comp"
 ? "fat_loss"
 : primaryCategory === "strength"
 ? "muscle_gain"
 : primaryCategory === "running"
 ? "endurance"
 : "general_fitness";
 const compatibilityUserProfile = {
 primary_goal: compatibilityPrimaryGoalKey,
 experience_level: canonicalUserProfile?.experienceLevel || "beginner",
 days_per_week: Math.max(2, Number(canonicalUserProfile?.daysPerWeek || 3) || 3),
 available_days: Array.isArray(canonicalUserProfile?.availableTrainingDays) ? canonicalUserProfile.availableTrainingDays : [],
 session_length: String(canonicalUserProfile?.sessionLength || "30"),
 equipment_access: Array.isArray(canonicalUserProfile?.equipmentAccess) ? canonicalUserProfile.equipmentAccess : [],
 constraints: Array.isArray(canonicalUserProfile?.constraints) ? canonicalUserProfile.constraints : [],
 };
 const goalMix = orderedResolvedGoals.map((goal) => goal?.summary).filter(Boolean).join(" + ");
 const nextGoalAlert = {
 id: `goal_change_${Date.now()}`,
 type: "info",
 msg: `${historyEvent.label} applied. Planning now follows ${orderedResolvedGoals[0]?.summary || "the updated priority order"}.`,
 ts: Date.now(),
 };
 const nextPersonalizationBase = mergePersonalization(personalization, {
 profile: {
 ...personalization.profile,
 profileSetupComplete: true,
 onboardingComplete: true,
 goalMix,
 },
 injuryPainState: (personalization?.injuryPainState?.level || "none") === "none"
 ? {
 ...personalization.injuryPainState,
 notes: "",
 preserveForPlanning: false,
 activeModifications: [],
 }
 : personalization.injuryPainState,
 nutritionPreferenceState: {
 ...(personalization.nutritionPreferenceState || DEFAULT_PERSONALIZATION.nutritionPreferenceState),
 style: primaryCategory === "body_comp" ? "high-protein fat-loss support" : "high-protein performance",
 },
 coachMemory: {
 ...personalization.coachMemory,
 lastAdjustment: `${historyEvent.label} ${todayKeyLocal}.`,
 longTermMemory: [
 ...(personalization?.coachMemory?.longTermMemory || []),
 `Goal change mode: ${historyEvent.label}.`,
 `New raw goal intent: ${cleanGoalText}`,
 orderedResolvedGoals.length ? `Resolved goals: ${orderedResolvedGoals.map((goal) => goal.summary).join(" / ")}` : null,
 preparedPreview?.goalFeasibility?.realismStatus ? `Goal realism: ${preparedPreview.goalFeasibility.realismStatus}` : null,
 preparedPreview?.goalFeasibility?.conflictFlags?.[0]?.summary ? `Goal conflict: ${preparedPreview.goalFeasibility.conflictFlags[0].summary}` : null,
 preparedPreview?.goalFeasibility?.suggestedSequencing?.[0]?.summary ? `Goal sequencing: ${preparedPreview.goalFeasibility.suggestedSequencing[0].summary}` : null,
 ].filter(Boolean).slice(-40),
 },
 planArchives: [archiveEntry, ...(personalization?.planArchives || [])].slice(0, 12),
 goalChangeHistory: [historyEvent, ...(personalization?.goalChangeHistory || [])].slice(0, 24),
 planResetUndo: null,
 });
 const nextPersonalization = withLegacyGoalProfileCompatibility({
 personalization: nextPersonalizationBase,
 canonicalAthlete: deriveCanonicalAthleteState({
 goals: nextGoals,
 personalization: nextPersonalizationBase,
 profileDefaults: PROFILE,
 }),
 userProfileOverrides: compatibilityUserProfile,
 goalStateOverrides: nextGoalState,
 });
 const nextPlanAlerts = [nextGoalAlert];

 setGoals(nextGoals);
 setPersonalization(nextPersonalization);
 setPaceOverrides(nextActivePlanningState.paceOverrides);
 setWeekNotes(nextActivePlanningState.weekNotes);
 setPlanAlerts(nextPlanAlerts);
 setPlannedDayRecords(nextActivePlanningState.plannedDayRecords);
 setPlanWeekRecords(nextActivePlanningState.planWeekRecords);
 setWeeklyCheckins(nextActivePlanningState.weeklyCheckins);
 setCoachPlanAdjustments(nextActivePlanningState.coachPlanAdjustments);
 const abandonedGoalSummaries = (historyEvent?.previousGoals || []).filter((summary) => !(historyEvent?.nextGoals || []).includes(summary));
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.goalChanged,
 payload: buildGoalChangeEventInput({
 changeKind: changeMode === GOAL_CHANGE_MODES.startNewGoalArc ? "replace" : "edit",
 changeMode,
 historyEvent,
 previousGoals: historyEvent?.previousGoals || [],
 nextGoals: historyEvent?.nextGoals || [],
 abandonedGoals: abandonedGoalSummaries,
 rationale: preparedPreview?.goalFeasibility?.realismStatus || historyEvent?.label || "",
 }),
 dedupeKey: `goal_change_${historyEvent?.id || todayKeyLocal}_${changeMode}`,
 });

 await persistAll(
 logs,
 bodyweights,
 nextActivePlanningState.paceOverrides,
 nextActivePlanningState.weekNotes,
 nextPlanAlerts,
 nextPersonalization,
 coachActions,
 nextActivePlanningState.coachPlanAdjustments,
 nextGoals,
 dailyCheckins,
 nextActivePlanningState.weeklyCheckins,
 nutritionFavorites,
 nutritionActualLogs,
 nextActivePlanningState.plannedDayRecords,
 nextActivePlanningState.planWeekRecords
 );

 return {
 ok: true,
 archiveEntry,
 historyEvent,
 orderedResolvedGoals,
 goalFeasibility: preparedPreview?.goalFeasibility || null,
 };
 };

 const previewGoalManagementChange = async ({
 change = null,
 } = {}) => {
 if (!change) return null;
 return buildGoalManagementPreview({
 goals: goalsModel,
 personalization,
 change,
 now: new Date(),
 });
 };

 const applyGoalManagementChange = async ({
 previewBundle = null,
 } = {}) => {
 if (!previewBundle?.nextGoals?.length || !previewBundle?.nextResolvedGoals?.length) {
 return { ok: false, error: "missing_goal_management_preview" };
 }

 const todayKeyLocal = new Date().toISOString().split("T")[0];
 const changeMode = previewBundle?.plannerChangeMode === GOAL_CHANGE_MODES.refineCurrentGoal
 ? GOAL_CHANGE_MODES.refineCurrentGoal
 : GOAL_CHANGE_MODES.reprioritizeGoalStack;
 const nextGoals = normalizeGoals(previewBundle.nextGoals || []);
 const orderedResolvedGoals = previewBundle.nextResolvedGoals || [];
 const primaryPlanningGoal = buildPlanningGoalsFromResolvedGoals({ resolvedGoals: orderedResolvedGoals })?.[0] || null;
 const primaryCategory = primaryPlanningGoal?.category || "general_fitness";
 const nextPlanStartDate = resolveGoalChangePlanStartDate({
 mode: changeMode,
 todayKey: todayKeyLocal,
 existingPlanStartDate: canonicalGoalState?.planStartDate || todayKeyLocal,
 });
 const nextGoalState = buildGoalStateFromResolvedGoals({
 resolvedGoals: orderedResolvedGoals,
 planStartDate: nextPlanStartDate,
 });
 const archiveEntry = buildGoalChangeArchiveEntry({
 todayKey: todayKeyLocal,
 mode: changeMode,
 rawGoalIntent: previewBundle?.changeLabel || "settings_goal_management_update",
 currentGoalState: canonicalGoalState,
 goals: goalsModel,
 resolvedGoals: orderedResolvedGoals,
 plannedDayRecords,
 planWeekRecords,
 weeklyCheckins,
 logs,
 });
 const previousGoals = (goalsModel || [])
 .filter((goal) => goal?.active && goal?.category !== "injury_prevention" && goal?.id !== "g_resilience")
 .sort((a, b) => Number(a?.priority || 99) - Number(b?.priority || 99))
 .map((goal) => String(goal?.resolvedGoal?.summary || goal?.name || "").trim())
 .filter(Boolean);
 const nextGoalSummaries = orderedResolvedGoals.map((goal) => goal?.summary).filter(Boolean);
 const historyEvent = buildGoalChangeHistoryEvent({
 todayKey: todayKeyLocal,
 mode: changeMode,
 rawGoalIntent: previewBundle?.changeLabel || "settings_goal_management_update",
 previousGoals,
 nextGoals: nextGoalSummaries,
 archivedPlanId: archiveEntry?.id || "",
 });
 const nextActivePlanningState = prepareGoalChangeActiveState({
 mode: changeMode,
 todayKey: todayKeyLocal,
 currentWeek,
 plannedDayRecords,
 planWeekRecords,
 weeklyCheckins,
 weekNotes,
 planAlerts,
 paceOverrides,
 coachPlanAdjustments,
 defaultCoachPlanAdjustments: DEFAULT_COACH_PLAN_ADJUSTMENTS,
 });
 const compatibilityPrimaryGoalKey = primaryCategory === "body_comp"
 ? "fat_loss"
 : primaryCategory === "strength"
 ? "muscle_gain"
 : primaryCategory === "running"
 ? "endurance"
 : "general_fitness";
 const compatibilityUserProfile = {
 primary_goal: compatibilityPrimaryGoalKey,
 experience_level: canonicalUserProfile?.experienceLevel || "beginner",
 days_per_week: Math.max(2, Number(canonicalUserProfile?.daysPerWeek || 3) || 3),
 available_days: Array.isArray(canonicalUserProfile?.availableTrainingDays) ? canonicalUserProfile.availableTrainingDays : [],
 session_length: String(canonicalUserProfile?.sessionLength || "30"),
 equipment_access: Array.isArray(canonicalUserProfile?.equipmentAccess) ? canonicalUserProfile.equipmentAccess : [],
 constraints: Array.isArray(canonicalUserProfile?.constraints) ? canonicalUserProfile.constraints : [],
 };
 const goalMix = nextGoalSummaries.join(" + ");
 const nextGoalAlert = {
 id: `goal_management_${Date.now()}`,
 type: "info",
 msg: `${previewBundle?.changeLabel || "Goal update"} confirmed. Planning now follows the active priority order shown in Settings.`,
 ts: Date.now(),
 };
 const nextPersonalizationBase = mergePersonalization(personalization, {
 profile: {
 ...personalization.profile,
 profileSetupComplete: true,
 onboardingComplete: true,
 goalMix,
 },
 injuryPainState: (personalization?.injuryPainState?.level || "none") === "none"
 ? {
 ...personalization.injuryPainState,
 notes: "",
 preserveForPlanning: false,
 activeModifications: [],
 }
 : personalization.injuryPainState,
 nutritionPreferenceState: {
 ...(personalization.nutritionPreferenceState || DEFAULT_PERSONALIZATION.nutritionPreferenceState),
 style: primaryCategory === "body_comp" ? "high-protein fat-loss support" : "high-protein performance",
 },
 coachMemory: {
 ...personalization.coachMemory,
 lastAdjustment: `${previewBundle?.changeLabel || "Goal update"} ${todayKeyLocal}.`,
 longTermMemory: [
 ...(personalization?.coachMemory?.longTermMemory || []),
 `Settings goal update: ${previewBundle?.changeLabel || "Goal update"}.`,
 nextGoalSummaries.length ? `Active goals: ${nextGoalSummaries.join(" / ")}` : null,
 previewBundle?.impactLines?.[0] ? `Plan impact: ${previewBundle.impactLines[0]}` : null,
 ].filter(Boolean).slice(-40),
 },
 planArchives: [archiveEntry, ...(personalization?.planArchives || [])].slice(0, 12),
 goalChangeHistory: [historyEvent, ...(personalization?.goalChangeHistory || [])].slice(0, 24),
 goalManagement: previewBundle?.nextGoalManagement || personalization?.goalManagement || DEFAULT_PERSONALIZATION.goalManagement,
 planResetUndo: null,
 });
 const nextPersonalization = withLegacyGoalProfileCompatibility({
 personalization: nextPersonalizationBase,
 canonicalAthlete: deriveCanonicalAthleteState({
 goals: nextGoals,
 personalization: nextPersonalizationBase,
 profileDefaults: PROFILE,
 }),
 userProfileOverrides: compatibilityUserProfile,
 goalStateOverrides: nextGoalState,
 });
 const nextPlanAlerts = [nextGoalAlert];

 setGoals(nextGoals);
 setPersonalization(nextPersonalization);
 setPaceOverrides(nextActivePlanningState.paceOverrides);
 setWeekNotes(nextActivePlanningState.weekNotes);
 setPlanAlerts(nextPlanAlerts);
 setPlannedDayRecords(nextActivePlanningState.plannedDayRecords);
 setPlanWeekRecords(nextActivePlanningState.planWeekRecords);
 setWeeklyCheckins(nextActivePlanningState.weeklyCheckins);
 setCoachPlanAdjustments(nextActivePlanningState.coachPlanAdjustments);
 const abandonedGoalSummaries = previousGoals.filter((summary) => !nextGoalSummaries.includes(summary));
 recordAdaptiveLearningEvent({
 eventName: ADAPTIVE_LEARNING_EVENT_NAMES.goalChanged,
 payload: buildGoalChangeEventInput({
 changeKind: abandonedGoalSummaries.length ? "abandon" : "edit",
 changeMode,
 historyEvent,
 previousGoals,
 nextGoals: nextGoalSummaries,
 abandonedGoals: abandonedGoalSummaries,
 rationale: previewBundle?.changeLabel || historyEvent?.label || "",
 }),
 dedupeKey: `goal_management_change_${historyEvent?.id || todayKeyLocal}_${changeMode}`,
 });

 await persistAll(
 logs,
 bodyweights,
 nextActivePlanningState.paceOverrides,
 nextActivePlanningState.weekNotes,
 nextPlanAlerts,
 nextPersonalization,
 coachActions,
 nextActivePlanningState.coachPlanAdjustments,
 nextGoals,
 dailyCheckins,
 nextActivePlanningState.weeklyCheckins,
 nutritionFavorites,
 nutritionActualLogs,
 nextActivePlanningState.plannedDayRecords,
 nextActivePlanningState.planWeekRecords
 );

 return {
 ok: true,
 archiveEntry,
 historyEvent,
 orderedResolvedGoals,
 nextGoals,
 };
 };

 const saveGoalReview = async ({
 goalReview = null,
 action = GOAL_REVIEW_RECOMMENDATIONS.keepCurrentGoal,
 note = "",
 } = {}) => {
 const reviewEntry = buildGoalReviewHistoryEntry({
 goalReview,
 action,
 note,
 now: new Date(),
 });
 const nextPersonalization = mergePersonalization(personalization, {
 goalReviewHistory: [reviewEntry, ...(personalization?.goalReviewHistory || [])].slice(0, 24),
 });
 setPersonalization(nextPersonalization);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs, plannedDayRecords, planWeekRecords);
 return reviewEntry;
 };

 const dismissWeekOneReady = async () => {
 const alreadySeen = String(personalization?.profile?.weekOneReadySeenAt || "").trim();
 if (alreadySeen) return;
 const nextPersonalization = mergePersonalization(personalization, {
 profile: {
 ...(personalization?.profile || {}),
 weekOneReadySeenAt: new Date().toISOString(),
 },
 });
 setPersonalization(nextPersonalization);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs, plannedDayRecords, planWeekRecords);
 };

 return (
 <div
 data-testid="app-root"
 data-onboarding-complete={onboardingComplete ? "true" : "false"}
 style={{
 ...themeTokens,
 fontFamily:"var(--font-body)",
 background:appBackground,
 minHeight:"100vh",
 color:"var(--text)",
 colorScheme:String(activeAppearanceMode || "").toLowerCase() === "light" ? "light" : "dark",
 padding:onboardingComplete
 ? "calc(1.1rem + var(--safe-area-top)) calc(1rem + var(--safe-area-right)) calc(1.15rem + var(--safe-area-bottom)) calc(1rem + var(--safe-area-left))"
 : 0,
 }}
 >
 <style>{`
 @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Outfit:wght@400;500;600;700&family=Sora:wght@500;600;700&family=Space+Grotesk:wght@500;700&display=swap');
 :root{
 --safe-area-top:env(safe-area-inset-top, 0px);
 --safe-area-right:env(safe-area-inset-right, 0px);
 --safe-area-bottom:env(safe-area-inset-bottom, 0px);
 --safe-area-left:env(safe-area-inset-left, 0px);
 --accent:var(--brand-accent);
 --accent-2:var(--phase-accent);
 --hot:#ff3d81;
 --signal:#27f59a;
 --space-1:0.25rem;
 --space-2:0.5rem;
 --space-3:0.75rem;
 --space-4:1rem;
 --space-5:1.5rem;
 --space-6:2rem;
 --space-7:2.65rem;
 --radius-sm:8px;
 --radius-md:12px;
 --radius-lg:18px;
 --shell-max:1180px;
 --shell-gutter:clamp(0.9rem, 2.8vw, 1.45rem);
 --hairline:rgba(255,255,255,0.06);
 --control-height:2.55rem;
 --control-height-sm:2.05rem;
 --pill-height:1.44rem;
 --divider-weight:1px;
 --type-label:0.48rem;
 --type-meta:0.54rem;
 --type-body:0.6rem;
 --type-title:1.04rem;
 --instrument-cyan:#57e8ff;
 --instrument-green:#2ff0a0;
 --instrument-amber:#ffb35a;
 --instrument-red:#ff537d;
 --ink-black:#03070d;
 --graphite:#07111a;
 --lux-border:color-mix(in srgb, var(--border-strong) 74%, rgba(255,255,255,0.16));
 --signal-rail:linear-gradient(180deg, transparent 0%, var(--instrument-cyan) 18%, var(--instrument-green) 54%, transparent 100%);
 --state-success:${C.green};
 --state-info:${C.blue};
 --state-warning:${C.amber};
 --state-danger:${C.red};
 --consumer-panel:var(--surface-1);
 --consumer-panel-strong:var(--panel-2);
 --consumer-subpanel:var(--surface-2);
 --consumer-border:var(--border);
 --consumer-border-strong:var(--border-strong);
 --consumer-text:var(--text-strong);
 --consumer-text-soft:var(--text);
 --consumer-text-muted:var(--text-soft);
 --consumer-text-faint:var(--muted);
 --surface-hero-gap:0.62rem;
 --surface-section-gap:0.5rem;
 --surface-copy-gap:0.2rem;
 --surface-quiet-padding:0.62rem;
 --surface-title-hero:clamp(0.78rem, 0.7rem + 0.55vw, 0.98rem);
 --surface-title-section:0.72rem;
 --surface-support-size:0.52rem;
 --surface-meta-size:0.47rem;
 --surface-card-padding:0.82rem;
 --surface-card-padding-lg:1rem;
 }
 html{
 background:var(--bg);
 color:var(--text);
 color-scheme:light dark;
 -webkit-text-size-adjust:100%;
 text-size-adjust:100%;
 scroll-padding-top:calc(var(--safe-area-top) + 1.4rem);
 scroll-padding-bottom:calc(var(--safe-area-bottom) + 7.2rem);
 }
 body{background:var(--bg);color:var(--text)}
 * { box-sizing:border-box; margin:0; padding:0; }
 ::-webkit-scrollbar{width:8px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(111,129,160,0.38);border-radius:999px}
 .fi{animation:fi 0.22s ease forwards}
 .hov{transition:background 0.18s ease,border-color 0.18s ease;cursor:pointer} .hov:hover{background:var(--brand-accent-soft)!important}
 .btn{
 background:linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 88%, rgba(255,255,255,0.06)) 0%, color-mix(in srgb, var(--surface-1) 98%, transparent) 100%);
 border:1px solid color-mix(in srgb, var(--border) 90%, var(--hairline));
 border-radius:calc(var(--radius-sm) + 1px);
 display:inline-flex;
 align-items:center;
 justify-content:center;
 gap:0.34rem;
 font-family:var(--font-body);
 font-size:clamp(0.52rem, 0.5rem + 0.08vw, 0.58rem);
 font-weight:650;
 letter-spacing:0.015em;
 line-height:1.2;
 cursor:pointer;
 min-height:var(--control-height-sm);
 min-width:0;
 padding:0.52rem 0.78rem;
 transition:background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
 color:var(--text);
 box-shadow:var(--button-shadow-rest), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -12px 20px rgba(0,0,0,0.08);
 touch-action:manipulation;
 -webkit-tap-highlight-color:transparent;
 }
 .btn:hover{border-color:var(--border-strong);color:var(--text-strong);background:linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 100%, transparent) 0%, color-mix(in srgb, var(--surface-2) 88%, transparent) 100%);transform:translateY(-1px);box-shadow:var(--button-shadow-hover), inset 0 1px 0 rgba(255,255,255,0.05)}
 .btn:active{transform:translateY(0) scale(0.985)}
 .btn:focus-visible{outline:none;border-color:var(--border-strong);box-shadow:0 0 0 3px var(--focus-ring), var(--button-shadow-hover)}
 .btn:disabled{cursor:not-allowed;opacity:0.58;transform:none!important;box-shadow:none;background:var(--surface-2);color:var(--text-soft)}
 .btn-primary{
 background:linear-gradient(135deg, color-mix(in srgb, var(--instrument-cyan) 82%, var(--cta-bg)) 0%, color-mix(in srgb, var(--cta-bg) 78%, #2f7cff) 52%, color-mix(in srgb, var(--instrument-green) 34%, var(--cta-bg)) 100%)!important;
 border:1px solid var(--cta-border)!important;
 color:var(--cta-text, var(--accent-contrast))!important;
 font-weight:800;
 box-shadow:0 16px 34px rgba(0,0,0,0.22), 0 0 22px color-mix(in srgb, var(--instrument-cyan) 18%, transparent), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -16px 24px rgba(0,0,0,0.12);
 }
 .btn-primary:hover{filter:none;background:linear-gradient(135deg, color-mix(in srgb, var(--instrument-cyan) 92%, var(--cta-bg-hover)) 0%, color-mix(in srgb, var(--cta-bg-hover) 78%, #3988ff) 52%, color-mix(in srgb, var(--instrument-green) 42%, var(--cta-bg-hover)) 100%)!important;border-color:var(--border-strong)!important;box-shadow:0 20px 42px rgba(0,0,0,0.24), 0 0 28px color-mix(in srgb, var(--instrument-cyan) 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.28)}
 .btn-primary:disabled{background:var(--cta-bg)!important;color:var(--cta-text, var(--accent-contrast))!important;opacity:0.52}
 .btn-selected{background:var(--accent-soft)!important;border-color:var(--border-strong)!important;color:var(--text-strong)!important;box-shadow:var(--shadow-1)}
 .btn-selected:hover{background:var(--accent-soft)!important}
 input,textarea,select{
 background:var(--input-bg);
 border:1px solid var(--border);
 border-radius:var(--radius-sm);
 color:var(--text);
 font-family:var(--font-body);
 font-size:max(16px, 0.7rem);
 padding:0.62rem 0.72rem;
 outline:none;
 width:100%;
 min-height:var(--control-height);
 line-height:1.35;
 transition:border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
 scroll-margin-top:calc(var(--safe-area-top) + 1.25rem);
 scroll-margin-bottom:calc(var(--safe-area-bottom) + 7rem);
 }
 input:focus,textarea:focus,select:focus{border-color:var(--border-strong);box-shadow:0 0 0 3px var(--focus-ring);background:var(--input-bg-focus)}
 input::placeholder,textarea::placeholder{color:var(--text-muted)}
 input:disabled,textarea:disabled,select:disabled{opacity:0.62;cursor:not-allowed}
 textarea{min-height:6rem;resize:vertical}
 input[type="checkbox"],input[type="radio"]{accent-color:var(--accent);width:0.95rem;height:0.95rem;min-height:auto;flex:0 0 auto}
 @keyframes fi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
 @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(124,92,255,0)}50%{box-shadow:0 0 0 10px rgba(124,92,255,0.14)}}
 @keyframes heroShift{
 0%{background-position:0% 50%}
 50%{background-position:100% 50%}
 100%{background-position:0% 50%}
 }
 @keyframes completePop{
 0%{transform:scale(0.96); opacity:0}
 65%{transform:scale(1.04); opacity:1}
 100%{transform:scale(1); opacity:1}
 }
 @keyframes ringPulse{
 0%,100%{box-shadow:0 0 0 0 rgba(39,245,154,0)}
 50%{box-shadow:0 0 0 10px rgba(39,245,154,0.16)}
 }
 @keyframes coachFadeIn{
 from{opacity:0; transform:translateY(6px)}
 to{opacity:1; transform:translateY(0)}
 }
 .tag{display:inline-flex;align-items:center;justify-content:center;min-height:var(--pill-height);padding:0.16rem 0.5rem;border-radius:9px;letter-spacing:0.045em;line-height:1.1;white-space:nowrap;background:var(--badge-bg);color:var(--badge-text);border:1px solid var(--badge-border);font-weight:750}
 .ui-pill{display:inline-flex;align-items:center;justify-content:center;min-height:var(--pill-height);padding:0.16rem 0.48rem;border-radius:9px;border:1px solid color-mix(in srgb, var(--border) 86%, var(--hairline));background:linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 70%, transparent) 0%, color-mix(in srgb, var(--surface-1) 92%, transparent) 100%);color:var(--text-soft);font-size:0.44rem;line-height:1.1;font-weight:700;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06)}
 .ui-pill-strong{font-weight:750;letter-spacing:0.08em;text-transform:uppercase}
 .ui-eyebrow{font-size:0.47rem;color:var(--text-soft);letter-spacing:0.12em;text-transform:uppercase;line-height:1.35}
 .ui-divider{border-top:var(--divider-weight) solid var(--border);padding-top:0.62rem}
 .card{
 position:relative;
 overflow:hidden;
 background:linear-gradient(180deg, color-mix(in srgb, var(--panel-2) 64%, rgba(255,255,255,0.02)) 0%, color-mix(in srgb, var(--panel) 98%, transparent) 100%);
 border:1px solid color-mix(in srgb, var(--card-border) 88%, var(--hairline));
 border-radius:var(--radius-md);
 padding:var(--surface-card-padding);
 box-shadow:var(--card-shadow), inset 0 1px 0 rgba(255,255,255,0.055), inset 0 -28px 52px rgba(0,0,0,0.08);
 transition:transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease
 }
 .card::before{
 content:"";
 position:absolute;
 inset:-1px -1px auto -1px;
 height:28%;
 pointer-events:none;
 background:var(--card-top-light);
 opacity:0.28;
 }
 .card::after{
 content:"";
 position:absolute;
 inset:auto -20% -50% auto;
 width:180px;
 height:180px;
 background:var(--card-bloom);
 pointer-events:none;
 opacity:0.28;
 }
 .card:hover{transform:translateY(-1px); box-shadow:var(--card-shadow-hover), 0 0 0 1px color-mix(in srgb, var(--instrument-cyan) 8%, transparent), inset 0 1px 0 rgba(255,255,255,0.06); border-color:var(--border-strong)}
 .card-strong{
 background:linear-gradient(180deg, color-mix(in srgb, var(--panel-3) 62%, transparent) 0%, color-mix(in srgb, var(--panel-2) 98%, transparent) 100%);
 border-color:var(--border-strong);
 box-shadow:var(--card-strong-shadow);
 }
 .card-elevated{
 background:linear-gradient(180deg, color-mix(in srgb, var(--panel-3) 78%, transparent) 0%, color-mix(in srgb, var(--panel-2) 98%, transparent) 100%);
 border-color:var(--border-strong);
 box-shadow:var(--shadow-2), inset 0 1px 0 rgba(255,255,255,0.05);
 }
 .card-soft{
 background:linear-gradient(180deg, color-mix(in srgb, var(--panel) 96%, transparent) 0%, color-mix(in srgb, var(--surface-1) 82%, transparent) 100%);
 border-color:var(--card-soft-border);
 box-shadow:var(--card-soft-shadow), inset 0 1px 0 rgba(255,255,255,0.03);
 }
 .sect-title{font-family:var(--font-display);font-size:var(--type-title);font-weight:800;letter-spacing:0;text-transform:none;color:var(--text-strong)}
 .mono{font-family:var(--font-mono); letter-spacing:0.01em}
 .coach-copy{font-family:var(--font-body); color:var(--text); line-height:1.65}
 .completion-pop{animation:completePop 0.35s ease-out}
 .pulse-ring{animation:ringPulse 1.35s ease-in-out infinite; border-radius:999px}
 .coach-fade{animation:coachFadeIn 0.28s ease-out both}
 .card-hero{
 border-color:var(--border-strong)!important;
 box-shadow:var(--shadow-2);
 }
 .card-hero::after{
 opacity:0.8;
 }
 .card-action{
 border-color:var(--border-strong)!important;
 box-shadow:var(--shadow-2);
 }
 .card-subtle{
 opacity:1;
 box-shadow:var(--shadow-1);
 }
 .surface-stack{display:grid;gap:var(--space-4)}
 .surface-hero{
 display:grid;
 gap:0.78rem;
 background:linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 92%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 100%, transparent) 100%);
 }
 .surface-hero-action{background:linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 100%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)}
 .surface-hero-header{
 display:flex;
 justify-content:space-between;
 align-items:flex-start;
 gap:0.6rem;
 flex-wrap:wrap;
 }
 .surface-hero-copy,
 .surface-heading{
 display:grid;
 gap:var(--surface-copy-gap);
 min-width:0;
 }
 .surface-hero-copy{flex:1 1 320px}
 .surface-eyebrow{
 font-size:0.46rem;
 color:var(--consumer-text-muted);
 letter-spacing:0.12em;
 text-transform:uppercase;
 line-height:1.35;
 }
 .surface-title{
 font-family:var(--font-display);
 font-size:clamp(0.74rem, 0.7rem + 0.14vw, 0.82rem);
 font-weight:700;
 color:var(--consumer-text);
 line-height:1.18;
 letter-spacing:0.01em;
 overflow-wrap:anywhere;
 }
 .surface-title-hero{font-size:clamp(0.88rem, 0.74rem + 0.68vw, 1.08rem);line-height:1.08}
 .surface-support{
 font-size:clamp(0.53rem, 0.49rem + 0.08vw, 0.58rem);
 color:var(--consumer-text-soft);
 line-height:1.55;
 overflow-wrap:anywhere;
 }
 .surface-meta-row,
 .surface-actions{
 display:flex;
 gap:0.35rem;
 flex-wrap:wrap;
 align-items:center;
 }
 .surface-quiet-panel{
 border:1px solid color-mix(in srgb, var(--consumer-border) 90%, var(--hairline));
 border-radius:var(--radius-md);
 background:linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 96%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 96%, transparent) 100%);
 padding:0.72rem;
 display:grid;
 gap:0.42rem;
 }
 .surface-card{
 display:grid;
 gap:0.58rem;
 }
 .surface-card-action{background:var(--consumer-panel-strong)}
 .surface-card-elevated{background:linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)}
 .surface-card-subtle,
 .surface-card-default{background:var(--consumer-panel)}
 .surface-disclosure{
 display:grid;
 gap:0;
 }
 .surface-disclosure summary{
 cursor:pointer;
 font-size:0.55rem;
 color:var(--consumer-text);
 }
 .surface-disclosure-body{
 display:grid;
 gap:0.45rem;
 margin-top:0.45rem;
 }
 .surface-recommendation-card{
 display:grid;
 gap:0.5rem;
 background:var(--consumer-subpanel);
 border:1px solid var(--consumer-border);
 border-radius:14px;
 padding:0.72rem 0.75rem;
 }
 .surface-recommendation-part{
 display:grid;
 gap:0.14rem;
 }
 .surface-recommendation-label{
 font-size:0.45rem;
 color:var(--consumer-text-muted);
 letter-spacing:0.08em;
 text-transform:uppercase;
 }
 .surface-recommendation-headline{
 font-size:0.62rem;
 color:var(--consumer-text);
 line-height:1.45;
 overflow-wrap:anywhere;
 }
 .surface-recommendation-copy,
 .surface-recommendation-diff{
 font-size:0.5rem;
 color:var(--consumer-text-soft);
 line-height:1.5;
 overflow-wrap:anywhere;
 }
 .surface-recommendation-disclosure{
 border:1px solid var(--consumer-border);
 border-radius:12px;
 padding:0.48rem 0.54rem;
 background:rgba(8, 15, 26, 0.46);
 }
 .surface-recommendation-disclosure summary{
 cursor:pointer;
 font-size:0.49rem;
 color:var(--consumer-text-muted);
 line-height:1.4;
 }
 .surface-recommendation-detail-list{
 display:grid;
 gap:0.18rem;
 margin-top:0.3rem;
 }
 .empty-state{
 border:1px dashed var(--empty-border);
 background:var(--empty-bg);
 border-radius:var(--radius-md);
 padding:0.9rem;
 }
 .app-shell-frame{
 max-width:var(--shell-max);
 margin:0 auto;
 padding:var(--shell-gutter);
 background:linear-gradient(180deg, color-mix(in srgb, var(--shell-overlay) 78%, transparent) 0%, color-mix(in srgb, var(--shell-overlay) 60%, transparent) 100%);
 color:var(--text);
 position:relative;
 isolation:isolate;
 border-left:1px solid color-mix(in srgb, var(--instrument-cyan) 9%, transparent);
 border-right:1px solid color-mix(in srgb, var(--instrument-green) 8%, transparent);
 }
 .app-shell-frame::before{
 content:"";
 position:fixed;
 inset:0;
 z-index:-2;
 pointer-events:none;
 background:
  linear-gradient(90deg, color-mix(in srgb, var(--instrument-cyan) 8%, transparent) 1px, transparent 1px),
  linear-gradient(180deg, color-mix(in srgb, var(--instrument-cyan) 5%, transparent) 1px, transparent 1px);
 background-size:72px 72px;
 mask-image:linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0.08) 45%, transparent 100%);
 opacity:0.55;
 }
 .app-shell-frame::after{
 content:"";
 position:fixed;
 top:0;
 bottom:0;
 left:max(0.55rem, env(safe-area-inset-left, 0px));
 width:2px;
 z-index:-1;
 pointer-events:none;
 background:var(--signal-rail);
 opacity:0.58;
 box-shadow:0 0 18px color-mix(in srgb, var(--instrument-cyan) 38%, transparent);
 }
 .app-shell-header{
 display:grid;
 grid-template-columns:minmax(0,1fr) auto;
 align-items:center;
 gap:0.9rem;
 margin-bottom:1rem;
 padding:0.88rem 0.98rem;
 border-radius:calc(var(--radius-lg) + 4px);
 border:1px solid color-mix(in srgb, var(--border) 90%, var(--hairline));
 background:linear-gradient(135deg, color-mix(in srgb, var(--panel-2) 86%, transparent) 0%, color-mix(in srgb, var(--panel) 98%, transparent) 54%, color-mix(in srgb, var(--instrument-cyan) 5%, transparent) 100%);
 box-shadow:var(--shadow-1), inset 0 1px 0 rgba(255,255,255,0.04);
 backdrop-filter:blur(16px);
 }
 .app-brand-mark{
 width:54px;
 height:54px;
 border-radius:14px;
 display:grid;
 place-items:center;
 background:linear-gradient(145deg, color-mix(in srgb, var(--instrument-cyan) 20%, var(--brand-mark-bg)) 0%, color-mix(in srgb, var(--brand-mark-bg) 88%, var(--surface-1)) 52%, color-mix(in srgb, var(--ink-black) 52%, var(--surface-1)) 100%);
 border:1px solid color-mix(in srgb, var(--brand-mark-border) 84%, var(--hairline));
 box-shadow:var(--shadow-2);
 color:var(--text-strong);
 font-family:var(--font-display);
 font-size:1.12rem;
 font-weight:850;
 letter-spacing:0.02em;
 position:relative;
 overflow:hidden;
 clip-path:polygon(0 0, 88% 0, 100% 12%, 100% 100%, 12% 100%, 0 88%);
 }
 .app-brand-mark::before{
 content:"";
 position:absolute;
 inset:8px 9px;
 border-top:2px solid color-mix(in srgb, var(--instrument-cyan) 76%, var(--text-strong));
 border-left:2px solid color-mix(in srgb, var(--instrument-cyan) 52%, transparent);
 opacity:0.62;
 }
 .app-brand-mark::after{
 content:"";
 position:absolute;
 right:-10px;
 bottom:8px;
 width:38px;
 height:2px;
 background:color-mix(in srgb, var(--instrument-green) 70%, transparent);
 transform:rotate(-32deg);
 box-shadow:0 0 14px color-mix(in srgb, var(--instrument-green) 44%, transparent);
 }
 .app-settings-button{
 width:46px;
 height:46px;
 padding:0;
 display:inline-flex;
 align-items:center;
 justify-content:center;
 flex-shrink:0;
 background:linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 100%, transparent) 0%, color-mix(in srgb, var(--surface-2) 88%, transparent) 100%);
 }
 .app-tab-strip{
 display:flex;
 gap:0.38rem;
 margin-bottom:1.1rem;
 background:linear-gradient(180deg, color-mix(in srgb, var(--tab-strip-bg) 94%, transparent) 0%, color-mix(in srgb, var(--surface-1) 88%, transparent) 100%);
 padding:0.34rem;
 border-radius:16px;
 border:1px solid color-mix(in srgb, var(--tab-strip-border) 88%, var(--hairline));
 overflow-x:auto;
 box-shadow:var(--shadow-1), inset 0 1px 0 rgba(255,255,255,0.03);
 backdrop-filter:blur(12px);
 }
 .app-tab-button{
 color:var(--tab-text);
 background:transparent;
 border-color:transparent;
 font-weight:600;
 flex-shrink:0;
 min-width:96px;
 min-height:max(44px, 2.5rem);
 }
 .app-tab-button[data-active="true"]{
 color:var(--tab-active-text);
 background:linear-gradient(180deg, color-mix(in srgb, var(--tab-active-bg) 100%, transparent) 0%, color-mix(in srgb, var(--surface-1) 70%, transparent) 100%);
 border-color:var(--border-strong);
 font-weight:750;
 box-shadow:var(--shadow-1), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 color-mix(in srgb, var(--instrument-cyan) 76%, transparent);
 }
 [data-testid="today-session-card"],
 [data-testid="program-trajectory-header"],
 [data-testid="program-roadmap"],
 [data-testid="program-this-week"],
 [data-testid="nutrition-execution-plan-header"],
 [data-testid="nutrition-execution-plan-meals"],
 [data-testid="nutrition-execution-rules"],
 [data-testid="nutrition-weekly-meal-calendar"],
 [data-testid="nutrition-weekly-grocery-list"],
 [data-testid="nutrition-quick-log"],
 [data-testid="settings-tab"] > .card.card-subtle{
 border-radius:var(--radius-lg)!important;
 border-color:var(--lux-border)!important;
 background:linear-gradient(135deg, color-mix(in srgb, var(--ink-black) 30%, var(--panel-2)) 0%, color-mix(in srgb, var(--panel) 96%, transparent) 62%, color-mix(in srgb, var(--instrument-cyan) 4%, transparent) 100%)!important;
 }
 [data-testid="today-session-card"],
 [data-testid="program-trajectory-header"],
 [data-testid="program-roadmap"],
 [data-testid="program-this-week"],
 [data-testid="nutrition-execution-plan-header"],
 [data-testid="nutrition-execution-plan-meals"],
 [data-testid="nutrition-weekly-meal-calendar"],
 [data-testid="settings-tab"] > .card.card-subtle{
 position:relative;
 isolation:isolate;
 }
 [data-testid="today-session-card"]::before,
 [data-testid="program-trajectory-header"]::before,
 [data-testid="program-roadmap"]::before,
 [data-testid="nutrition-execution-plan-header"]::before,
 [data-testid="settings-tab"] > .card.card-subtle::before{
 content:"";
 position:absolute;
 left:0;
 top:0.85rem;
 bottom:0.85rem;
 width:3px;
 border-radius:999px;
 background:var(--signal-rail);
 opacity:0.66;
 box-shadow:0 0 18px color-mix(in srgb, var(--instrument-cyan) 28%, transparent);
 }
 [data-testid="today-full-workout"] > div,
 [data-testid^="program-current-week-cell-"],
 [data-testid^="program-roadmap-week-"],
 [data-testid="nutrition-execution-plan-meals"] > div:nth-child(2) > div,
 [data-testid^="nutrition-meal-calendar-day-"],
 [data-testid^="nutrition-meal-calendar-slot-"]{
 border-radius:12px!important;
 border-color:color-mix(in srgb, var(--consumer-border-strong) 72%, rgba(255,255,255,0.08))!important;
 background:linear-gradient(145deg, color-mix(in srgb, var(--ink-black) 18%, var(--consumer-subpanel)) 0%, color-mix(in srgb, var(--consumer-panel) 95%, transparent) 100%)!important;
 box-shadow:inset 0 1px 0 rgba(255,255,255,0.055)!important;
 }
 [data-testid="today-full-workout"] > div > div:first-child{
 border-radius:8px!important;
 box-shadow:0 0 18px color-mix(in srgb, var(--instrument-cyan) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)!important;
 }
 [data-testid="program-roadmap-grid"]{
 position:relative;
 }
 [data-testid="program-roadmap-grid"]::before{
 content:"";
 position:absolute;
 left:0.5rem;
 right:0.5rem;
 top:1.05rem;
 height:2px;
 background:linear-gradient(90deg, color-mix(in srgb, var(--instrument-cyan) 72%, transparent), color-mix(in srgb, var(--instrument-green) 62%, transparent), color-mix(in srgb, var(--instrument-amber) 58%, transparent));
 opacity:0.64;
 box-shadow:0 0 16px color-mix(in srgb, var(--instrument-cyan) 18%, transparent);
 pointer-events:none;
 }
 [data-testid^="program-roadmap-week-"]{
 position:relative;
 padding-top:1.35rem!important;
 }
 [data-testid^="program-roadmap-week-"]::before{
 content:"";
 position:absolute;
 top:0.78rem;
 left:0.75rem;
 width:0.46rem;
 height:0.46rem;
 border-radius:999px;
 background:var(--instrument-cyan);
 box-shadow:0 0 0 4px color-mix(in srgb, var(--instrument-cyan) 12%, transparent), 0 0 16px color-mix(in srgb, var(--instrument-cyan) 34%, transparent);
 }
 [data-testid^="program-current-week-cell-"]{
 overflow:hidden;
 }
 [data-testid^="program-current-week-cell-"][data-current-day="true"]{
 border-color:color-mix(in srgb, var(--instrument-cyan) 48%, var(--border-strong))!important;
 background:linear-gradient(145deg, color-mix(in srgb, var(--instrument-cyan) 16%, var(--consumer-panel-strong)) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)!important;
 box-shadow:0 0 0 1px color-mix(in srgb, var(--instrument-cyan) 18%, transparent), 0 14px 30px rgba(0,0,0,0.18)!important;
 }
 [data-testid="nutrition-execution-plan-header"] > div:nth-child(2) > div,
 [data-testid="nutrition-plan-objectives"] > div:last-child > div{
 border-radius:10px!important;
 border-color:color-mix(in srgb, var(--instrument-cyan) 20%, #22324a)!important;
 background:linear-gradient(180deg, color-mix(in srgb, #0f172a 70%, var(--ink-black)) 0%, color-mix(in srgb, #0b1321 92%, transparent) 100%)!important;
 }
 [data-testid="nutrition-execution-plan-meals"] > div:nth-child(2) > div{
 position:relative;
 padding-left:0.94rem!important;
 }
 [data-testid="nutrition-execution-plan-meals"] > div:nth-child(2) > div::before{
 content:"";
 position:absolute;
 left:0.48rem;
 top:0.66rem;
 bottom:0.66rem;
 width:2px;
 border-radius:999px;
 background:linear-gradient(180deg, var(--instrument-amber), color-mix(in srgb, var(--instrument-green) 70%, transparent));
 opacity:0.76;
 }
 [data-testid="nutrition-weekly-meal-calendar"]{
 overflow:hidden;
 }
 [data-testid^="nutrition-meal-calendar-day-"]{
 align-content:start;
 }
 [data-testid^="nutrition-meal-calendar-slot-"]{
 border-radius:9px!important;
 }
 [data-testid="nutrition-execution-rules"]{
 border-style:dashed!important;
 }
 [data-testid="nutrition-quick-log"]{
 background:linear-gradient(135deg, color-mix(in srgb, var(--instrument-green) 10%, #0d1410) 0%, color-mix(in srgb, var(--ink-black) 12%, #0d1410) 100%)!important;
 }
 [data-testid="log-detailed-entry"] > .surface-card:first-child{
 border-color:color-mix(in srgb, var(--instrument-cyan) 20%, var(--border-strong))!important;
 background:linear-gradient(145deg, color-mix(in srgb, var(--consumer-panel-strong) 82%, var(--ink-black)) 0%, color-mix(in srgb, var(--consumer-panel) 96%, transparent) 100%)!important;
 }
 [data-testid="planned-session-plan"]{
 border-radius:14px!important;
 }
 [data-testid="program-trajectory-header"]{
 border-radius:var(--radius-lg)!important;
 border-color:var(--lux-border)!important;
 background:linear-gradient(135deg, color-mix(in srgb, var(--ink-black) 34%, var(--consumer-panel-strong)) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 56%, color-mix(in srgb, var(--instrument-cyan) 5%, transparent) 100%)!important;
 }
 [data-testid="program-trajectory-header"] .surface-title-hero{
 font-size:1.42rem!important;
 font-weight:850!important;
 letter-spacing:0!important;
 }
 [data-testid="program-current-day-context"]{
 border-radius:14px!important;
 border-color:color-mix(in srgb, var(--instrument-cyan) 18%, var(--consumer-border))!important;
 background:linear-gradient(180deg, color-mix(in srgb, var(--ink-black) 14%, var(--consumer-panel)) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)!important;
 }
 [data-testid="program-this-week"] > div:nth-child(3) > div:nth-child(2){
 border:1px solid color-mix(in srgb, var(--instrument-green) 14%, var(--consumer-border));
 border-radius:14px;
 padding:0.74rem;
 background:linear-gradient(145deg, color-mix(in srgb, var(--ink-black) 18%, var(--consumer-panel)) 0%, color-mix(in srgb, var(--consumer-subpanel) 86%, transparent) 100%);
 min-height:9.6rem;
 }
 .settings-surface-nav-grid{
 grid-template-columns:repeat(auto-fit,minmax(148px,1fr))!important;
 }
 [data-testid="settings-surface-nav"] button{
 border-radius:10px!important;
 box-shadow:none!important;
 letter-spacing:0!important;
 }
 [data-testid="settings-surface-nav"] button[data-active="true"]{
 border-color:color-mix(in srgb, var(--instrument-cyan) 46%, var(--border-strong))!important;
 background:linear-gradient(135deg, color-mix(in srgb, var(--instrument-cyan) 13%, var(--surface-2)) 0%, color-mix(in srgb, var(--surface-1) 94%, transparent) 100%)!important;
 box-shadow:inset 2px 0 0 color-mix(in srgb, var(--instrument-cyan) 88%, transparent), 0 10px 24px rgba(0,0,0,0.14)!important;
 }
 @media (min-width:860px){
 [data-testid="program-trajectory-header"] > .surface-stack{
 display:grid!important;
 grid-template-columns:minmax(0,0.74fr) minmax(360px,1fr)!important;
 gap:0.72rem 0.95rem!important;
 align-items:stretch;
 }
 [data-testid="program-trajectory-header"] .surface-hero-header{
 grid-column:1;
 display:grid!important;
 gap:0.7rem!important;
 align-content:start;
 }
 [data-testid="program-current-day-context"]{
 grid-column:2;
 grid-row:1 / span 5;
 align-content:start;
 min-height:100%;
 padding:0.86rem!important;
 }
 [data-testid="program-trajectory-header"] > .surface-stack > :nth-child(3),
 [data-testid="program-trajectory-header"] > .surface-stack > :nth-child(4),
 [data-testid="program-trajectory-header"] > .surface-stack > :nth-child(5){
 grid-column:1;
 }
 [data-testid="today-session-card"]{
 grid-template-columns:minmax(0,0.78fr) minmax(360px,1.08fr)!important;
 gap:0.92rem 1.05rem!important;
 align-items:start;
 padding:1rem 1.05rem 1rem 1.12rem!important;
 }
 [data-testid="today-session-card"] > :nth-child(1),
 [data-testid="today-session-card"] > :nth-child(2),
 [data-testid="today-session-card"] > :nth-child(3),
 [data-testid="today-session-card"] > :nth-child(4),
 [data-testid="today-session-card"] > :nth-child(6){
 grid-column:1;
 }
 [data-testid="today-session-card"] > :nth-child(5){
 grid-column:2;
 grid-row:1 / span 6;
 align-self:stretch;
 display:grid;
 align-content:start;
 gap:0.52rem!important;
 padding:0.72rem;
 border:1px solid color-mix(in srgb, var(--instrument-cyan) 18%, var(--consumer-border));
 border-radius:16px;
 background:linear-gradient(180deg, color-mix(in srgb, var(--ink-black) 18%, var(--consumer-panel)) 0%, color-mix(in srgb, var(--consumer-subpanel) 90%, transparent) 100%);
 box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);
 }
 [data-testid="today-full-workout"]{
 gap:0.42rem!important;
 }
 [data-testid="program-roadmap-grid"]{
 grid-template-columns:repeat(4,minmax(0,1fr))!important;
 gap:0.52rem!important;
 }
 [data-testid="program-current-week-grid"]{
 grid-template-columns:repeat(7,minmax(0,1fr))!important;
 gap:0.32rem!important;
 }
 [data-testid="program-this-week"] > div:nth-child(3){
 grid-template-columns:minmax(420px,0.95fr) minmax(300px,1.05fr)!important;
 align-items:start;
 }
 [data-testid^="program-current-week-cell-"]{
 min-height:128px!important;
 }
 [data-testid="nutrition-execution-plan-header"]{
 padding:0.95rem 1rem!important;
 }
 [data-testid="nutrition-execution-plan-meals"] > div:nth-child(2){
 grid-template-columns:repeat(2,minmax(0,1fr))!important;
 align-items:start;
 }
 [data-testid="nutrition-weekly-meal-calendar"] > div:nth-child(2){
 grid-template-columns:repeat(7,minmax(150px,1fr))!important;
 overflow-x:auto;
 padding-bottom:0.2rem;
 }
 [data-testid="settings-tab"] > .card.card-subtle > div:nth-child(2){
 grid-template-columns:220px minmax(0,1fr)!important;
 align-items:start;
 gap:0.92rem!important;
 }
 .settings-surface-nav{
 position:sticky;
 top:0.8rem;
 }
 .settings-surface-nav-grid{
 grid-template-columns:1fr!important;
 gap:0.28rem!important;
 }
 [data-testid="settings-surface-nav"] button{
 min-height:2.75rem!important;
 justify-items:start;
 }
 }
 @media (max-width:859px){
 [data-testid="today-session-card"],
 [data-testid="program-roadmap"],
 [data-testid="program-this-week"],
 [data-testid="nutrition-execution-plan-header"],
 [data-testid="nutrition-execution-plan-meals"],
 [data-testid="settings-tab"] > .card.card-subtle{
 border-radius:16px!important;
 }
 [data-testid="program-roadmap-grid"]::before{
 display:none;
 }
 }
 details > summary{
 list-style:none;
 min-height:44px;
 display:flex;
 align-items:center;
 width:100%;
 padding:0.45rem 0;
 touch-action:manipulation;
 -webkit-tap-highlight-color:transparent;
 scroll-margin-top:calc(var(--safe-area-top) + 1.25rem);
 scroll-margin-bottom:calc(var(--safe-area-bottom) + 7rem);
 }
 details > summary::-webkit-details-marker{display:none}
 details[open]{animation:fi 0.18s ease}
 @media (max-width:640px){
 html{font-size:18px}
 :root{
 --space-4:1rem;
 --space-5:1.35rem;
 --control-height:2.95rem;
 --control-height-sm:2.75rem;
 --pill-height:2rem;
 }
 }
 @media (prefers-reduced-motion: reduce){
 *, *::before, *::after{
 animation-duration:0.01ms!important;
 animation-iteration-count:1!important;
 transition-duration:0.01ms!important;
 scroll-behavior:auto!important;
 }
 .fi,.completion-pop,.pulse-ring,.coach-fade{animation:none!important}
 .btn:hover,.card:hover{transform:none!important}
 }
 `}</style>

 {!onboardingComplete ? (
 <OnboardingCoach onComplete={finishOnboarding} startingFresh={Boolean(personalization?.planResetUndo?.startedAt)} existingMemory={personalization?.coachMemory?.longTermMemory || []} personalization={personalization} onTrackFrictionEvent={trackFrictionEvent} />
 ) : (
 <div data-testid="app-shell" className="app-shell-frame">

 {/* HEADER BAR */}
<div data-testid="app-header-bar" className="app-shell-header">
<div data-testid="app-brand-lockup" style={{ display:"flex", alignItems:"center", gap:"0.9rem", minWidth:0 }}>
<div className="app-brand-mark">
{PRODUCT_BRAND.mark}
</div>
<div style={{ minWidth:0 }}>
<div style={{ display:"flex", alignItems:"center", gap:"0.5rem", flexWrap:"wrap" }}>
<h1 data-testid="app-brand-wordmark" style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"clamp(1.32rem, 5vw, 1.92rem)", letterSpacing:"0.05em", color:"var(--heading-start)", lineHeight:1, margin:0 }}>
{PRODUCT_BRAND.name}
</h1>
 </div>
 <div style={{ fontFamily:"var(--font-body)", fontSize:"0.58rem", color:"var(--text-soft)", letterSpacing:"0.06em", marginTop:6, lineHeight:1.55, textTransform:"uppercase" }}>
 {joinDisplayParts([fmtDate(today).toUpperCase(), `Week ${currentWeek}`])}
 </div>
 </div>
 </div>
 <button data-testid="app-tab-settings" className="btn app-settings-button" onPointerDown={warmSecondaryTabs} onClick={()=>{ setSettingsFocus(""); setTab(5); }} aria-label="Open settings" title="Settings">
 <SettingsIcon size={18} />
 </button>
 </div>
 {undoBanner && (
 <div className="card card-soft" style={{ marginBottom:"0.75rem", borderColor:C.amber+"35", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.5rem", padding:"0.45rem 0.55rem" }}>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>New plan started {undoBanner.startedDate}. <button className="btn" onClick={undoStartFresh} style={{ marginLeft:"0.2rem", fontSize:"0.52rem", color:C.amber, borderColor:C.amber+"45" }}>Undo</button></div>
 </div>
 )}
 {/* TABS */}
 <div className="app-tab-strip">
 {TABS.map((t,i) => (
 <button key={t.id} data-testid={`app-tab-${t.id}`} className="btn app-tab-button" data-active={tab===i?"true":"false"} onPointerDown={i >= 1 ? warmSecondaryTabs : undefined} onClick={()=>setTab(i)}>
 {t.label}
 </button>
 ))}
 </div>

 {/* TODAY */}
 {tab === 0 && <TodayTab planDay={planDay} surfaceModel={planDaySurfaceModels?.today || null} todayWorkout={planDay?.resolved?.training} plannedWorkout={planDay?.base?.training} currentWeek={currentWeek} rollingHorizon={rollingHorizon} logs={logs} bodyweights={bodyweights} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} analyzing={analyzing} getZones={getZones} personalization={personalization} athleteProfile={canonicalAthlete} momentum={momentum} strengthLayer={strengthLayer} dailyStory={dailyStory} behaviorLoop={behaviorLoop} proactiveTriggers={proactiveTriggers} onDismissTrigger={dismissTriggerForToday} onApplyTrigger={applyProactiveNudge} applyDayContextOverride={applyDayContextOverride} shiftTodayWorkout={shiftTodayWorkout} restoreShiftTodayWorkout={restoreShiftTodayWorkout} setEnvironmentMode={setEnvironmentMode} environmentSelection={environmentSelection} injuryRule={injuryRule} setInjuryState={setInjuryState} dailyCheckins={dailyCheckins} saveDailyCheckin={saveDailyCheckin} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} saveBodyweights={saveBodyweights} coachPlanAdjustments={coachPlanAdjustments} onGoProgram={()=>setTab(2)} onDismissPostIntakeReady={dismissWeekOneReady} loading={loading} storageStatus={storageStatus} syncStateModel={displayedSyncStateModel} syncSurfaceModel={syncSurfaceModels?.today || null} authError={authError} />}

 {/* LOG */}
 {tab === 1 && (
 <LazySurfaceSlot
  surface={FORMA_LAZY_MODULES.logTab}
  active={tab === 1}
  runtime={secondarySurfaceRuntime}
  loadingTitle="Loading Log"
  loadingDetail="Bringing in the prescribed session and execution journal."
  dataTestId="log-lazy-loading"
  onFallbackBack={() => setTab(0)}
  surfaceProps={{ planDay, surfaceModel: planDaySurfaceModels?.log || null, logs, dailyCheckins, plannedDayRecords, planWeekRecords, weeklyCheckins, nutritionActualLogs, saveLogs, bodyweights, saveBodyweights, personalization, athleteProfile: canonicalAthlete, saveManualProgressInputs, currentWeek, todayWorkout: planDay?.resolved?.training, planArchives: personalization?.planArchives || [], planStartDate: canonicalGoalState?.planStartDate || "", syncStateModel: displayedSyncStateModel, syncSurfaceModel: syncSurfaceModels?.log || null }}
 />
 )}

 {/* PROGRAM */}
 {tab === 2 && (
 <LazySurfaceSlot
  surface={FORMA_LAZY_MODULES.planTab}
  active={tab === 2}
  runtime={secondarySurfaceRuntime}
  loadingTitle="Loading Plan"
  loadingDetail="Bringing in weekly structure and preview context."
  dataTestId="program-lazy-loading"
  onFallbackBack={() => setTab(0)}
  surfaceProps={{ planDay, surfaceModel: planDaySurfaceModels?.program || null, currentPlanWeek, currentWeek, logs, bodyweights, dailyCheckins, personalization, athleteProfile: canonicalAthlete, setGoals, momentum, strengthLayer, weeklyReview, expectations, memoryInsights, recalibration, patterns, getZones, weekNotes, paceOverrides, setPaceOverrides, learningLayer, salvageLayer, failureMode, planComposer, rollingHorizon, horizonAnchor, planWeekRecords, weeklyCheckins, saveWeeklyCheckin, environmentSelection, setEnvironmentMode, saveEnvironmentSchedule, deviceSyncAudit, syncSurfaceModel: syncSurfaceModels?.program || null, previewGoalChange, applyGoalChange, saveGoalReview, saveBodyweights, saveManualProgressInputs, saveProgramSelection, todayWorkout: planDay?.resolved?.training, onManagePlan:(focus = "plan")=>{ setSettingsFocus(focus); setTab(5); }, onOpenToday:() => setTab(0), onOpenLog:() => setTab(1) }}
 />
 )}

 {/* NUTRITION */}
 {tab === 3 && (
 <LazySurfaceSlot
  surface={FORMA_LAZY_MODULES.nutritionTab}
  active={tab === 3}
  runtime={secondarySurfaceRuntime}
  loadingTitle="Loading Nutrition"
  loadingDetail="Bringing in today's fueling plan and weekly grocery context."
  dataTestId="nutrition-lazy-loading"
  onFallbackBack={() => setTab(0)}
  surfaceProps={{ planDay, surfaceModel: planDaySurfaceModels?.nutrition || null, todayWorkout: planDay?.resolved?.training, currentWeek, logs, personalization, athleteProfile: canonicalAthlete, momentum, bodyweights, learningLayer, nutritionLayer: planDay?.resolved?.nutrition?.prescription, realWorldNutrition: planDay?.resolved?.nutrition?.reality, nutritionActualLogs, nutritionFavorites, weeklyNutritionReview, saveNutritionFavorites, saveNutritionActualLog, syncStateModel: displayedSyncStateModel, syncSurfaceModel: syncSurfaceModels?.nutrition || null }}
 />
 )}

 {/* COACH */}
 {tab === 4 && (
 <LazySurfaceSlot
  surface={FORMA_LAZY_MODULES.coachTab}
  active={tab === 4}
  runtime={secondarySurfaceRuntime}
  loadingTitle="Loading Coach"
  loadingDetail="Bringing in coaching actions, preview logic, and trust context."
  dataTestId="coach-lazy-loading"
  onFallbackBack={() => setTab(0)}
  surfaceProps={{ planDay, surfaceModel: planDaySurfaceModels?.coach || null, logs, dailyCheckins, currentWeek, todayWorkout: planDay?.resolved?.training, bodyweights, personalization, athleteProfile: canonicalAthlete, goals: goalsModel, momentum, arbitration, expectations, memoryInsights, compoundingCoachMemory, recalibration, strengthLayer, patterns, proactiveTriggers, onApplyTrigger: applyProactiveNudge, learningLayer, salvageLayer, validationLayer, optimizationLayer, failureMode, planComposer, nutritionLayer: planDay?.resolved?.nutrition?.prescription, realWorldNutrition: planDay?.resolved?.nutrition?.reality, nutritionActualLogs, weeklyNutritionReview, setPersonalization, coachActions, setCoachActions, coachPlanAdjustments, setCoachPlanAdjustments, weekNotes, setWeekNotes, planAlerts, setPlanAlerts, onOpenSettings:()=>{ setSettingsFocus("advanced"); setTab(5); }, onTrackFrictionEvent: trackFrictionEvent, onRecordAdaptiveLearningEvent: recordAdaptiveLearningEvent, syncStateModel: displayedSyncStateModel, syncSurfaceModel: syncSurfaceModels?.coach || null, onPersist: async (nextPersonalization, nextCoachActions, nextCoachPlanAdjustments = coachPlanAdjustments, nextWeekNotes = weekNotes, nextPlanAlerts = planAlerts) => {
 setPersonalization(nextPersonalization);
 setCoachActions(nextCoachActions);
 setCoachPlanAdjustments(nextCoachPlanAdjustments);
 setWeekNotes(nextWeekNotes);
 setPlanAlerts(nextPlanAlerts);
 await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, nextPlanAlerts, nextPersonalization, nextCoachActions, nextCoachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 } }}
 />
 )}

 {/* SETTINGS */}
 {tab === 5 && (
 <LazySurfaceSlot
  surface={FORMA_LAZY_MODULES.settingsTab}
  active={tab === 5}
  runtime={secondarySurfaceRuntime}
  loadingTitle="Loading Settings"
  loadingDetail="Bringing in the account and plan-management workspace."
  dataTestId="settings-lazy-loading"
  onFallbackBack={() => setTab(0)}
  surfaceProps={{ onStartFresh:()=>setStartFreshConfirmOpen(true), personalization, setPersonalization, exportData, importData, authSession, onReloadCloudData: sbLoad, storageStatus, syncStateModel: displayedSyncStateModel, syncSurfaceModel: syncSurfaceModels?.settings || null, syncDiagnostics, deviceSyncAudit, athleteProfile: canonicalAthlete, planComposer, adaptiveLearningSnapshot: adaptiveLearningStore?.buildPersistenceSnapshot?.() || null, saveProgramSelection, saveManualProgressInputs, logs, bodyweights, planHistoryReviews: planHistoryReportReviews, planHistoryWeekSummaries, previewGoalChange, applyGoalChange, previewGoalManagementChange, applyGoalManagementChange, onDeleteAccount: handleDeleteAccount, onLogout: handleSignOut, onResetThisDevice: handleResetThisDevice, onOpenPlan:()=>setTab(2), passwordResetBusy: authPasswordResetBusy, passwordResetMessage: authNotice, onRequestPasswordReset:() => handleForgotPassword({
 source: "settings_account",
 emailOverride: authSession?.user?.email || "",
 }), onOpenAuthGate:() => {
 setAuthMode("signin");
 setAuthError("");
 setAuthNotice("");
 setStartupLocalResumeAccepted(false);
 }, focusSection: settingsFocus, frictionDashboard, onTrackFrictionEvent: trackFrictionEvent, onPersist: async (nextPersonalization) => {
 setPersonalization(nextPersonalization);
 await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
 } }}
 />
 )}
 {showAppleHealthFirstLaunch && (
 <div style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.74)", display:"grid", placeItems:"center", zIndex:56, padding:"1rem" }}>
 <div className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"var(--border)", background:"var(--panel)", padding:"0.9rem" }}>
 <div style={{ fontSize:"0.62rem", color:"var(--text)", lineHeight:1.7, marginBottom:"0.6rem" }}>
 {PRODUCT_BRAND.name} can read Apple Health workouts and device context that some recommendations use. We never share this data. You can revoke access anytime in iOS Settings.
 </div>
 <button className="btn btn-primary" onClick={requestAppleHealthPermissions} style={{ width:"100%", marginBottom:"0.45rem" }}>Connect Apple Health</button>
 <button className="btn" onClick={async ()=>{ await updateAppleHealthState({ skipped: true }); setShowAppleHealthFirstLaunch(false); }} style={{ width:"100%", fontSize:"0.52rem", color:"var(--muted)", borderColor:"var(--border)" }}>
 Skip for now
 </button>
 </div>
 </div>
 )}
 {startFreshConfirmOpen && (
 <div style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.74)", display:"grid", placeItems:"center", zIndex:50, padding:"1rem" }}>
 <div className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"var(--border)", background:"var(--panel)", padding:"0.9rem" }}>
 <div style={{ fontSize:"0.62rem", color:"var(--text)", lineHeight:1.7, marginBottom:"0.6rem" }}>
 This will archive your current plan and start a new intake from today. Your history stays saved, your coach memory carries forward, and you can rebuild around new priorities. This cannot be reversed automatically - but you have 7 days to undo it.
 </div>
 <div style={{ display:"flex", justifyContent:"flex-end", gap:"0.45rem" }}>
 <button className="btn btn-primary" onClick={()=>setStartFreshConfirmOpen(false)} style={{ fontSize:"0.56rem" }}>Cancel</button>
 <button className="btn" onClick={startFreshPlan} style={{ fontSize:"0.56rem", color:"var(--muted)", borderColor:"var(--border)", background:"transparent" }}>Yes, start fresh</button>
 </div>
 </div>
 </div>
 )}
{TRUSTED_DEBUG_MODE && runtimeDebugSnapshot && <RuntimeInspector snapshot={runtimeDebugSnapshot} />}
 </div>
 )}
 </div>
 );
}

function RuntimeInspector({ snapshot }) {
 const copySnapshot = async () => {
 try {
 if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
 await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
 }
 } catch {}
 };
 const line = (label, value, tone = "var(--muted)") => (
 <div style={{ fontSize:"0.52rem", color:tone, lineHeight:1.6 }}>
 <span style={{ color:"var(--text)" }}>{label}:</span> {value || "none"}
 </div>
 );
 const compactList = (items) => (Array.isArray(items) && items.length ? items.join(" - ") : "none");
 return (
 <details style={{ position:"fixed", right:14, bottom:14, width:"min(420px, calc(100vw - 28px))", zIndex:70 }}>
 <summary className="btn" style={{ width:"100%", justifyContent:"space-between", background:"var(--panel-2)", borderColor:"var(--border-strong)", color:"var(--text)", fontSize:"0.56rem", boxShadow:"var(--shadow-1)" }}>
 Runtime Inspector
 <span style={{ color:"var(--muted)", fontSize:"0.5rem" }}>{snapshot?.storage?.label || "UNKNOWN"}</span>
 </summary>
 <div className="card card-soft" style={{ marginTop:"0.35rem", background:"var(--panel-2)", borderColor:"var(--border)", backdropFilter:"blur(12px)", maxHeight:"70vh", overflowY:"auto" }}>
 <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.45rem", gap:"0.45rem" }}>
 <div style={{ fontSize:"0.48rem", color:"var(--muted)" }}>Canonical runtime snapshot</div>
 <button className="btn" onClick={copySnapshot} style={{ fontSize:"0.48rem", padding:"0.24rem 0.5rem", minHeight:0 }}>Copy JSON</button>
 </div>
 <div style={{ display:"grid", gap:"0.6rem" }}>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>PlanDay</div>
 {line("Date", snapshot?.planDay?.dateKey)}
 {line("Session", snapshot?.planDay?.label)}
 {line("Decision", `${snapshot?.planDay?.decisionMode || "unknown"} / ${snapshot?.planDay?.confidence || "unknown"}`)}
 {line("Modified", snapshot?.planDay?.modifiedFromBase ? "yes" : "no", snapshot?.planDay?.modifiedFromBase ? C.amber : "var(--muted)")}
 {line("Why", snapshot?.planDay?.provenanceSummary)}
 {line("Drivers", compactList(snapshot?.planDay?.keyDrivers))}
 </div>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>PlanWeek</div>
 {line("Week", `${snapshot?.planWeek?.weekNumber || "?"} - ${snapshot?.planWeek?.label || snapshot?.planWeek?.phase || "unlabeled"}`)}
 {line("Focus", snapshot?.planWeek?.focus)}
 {line("Biases", [snapshot?.planWeek?.aggressionLevel, snapshot?.planWeek?.recoveryBias, snapshot?.planWeek?.volumeBias, snapshot?.planWeek?.performanceBias].filter(Boolean).join(" - "))}
 {line("Nutrition", snapshot?.planWeek?.nutritionEmphasis)}
 {line("Constraints", compactList(snapshot?.planWeek?.constraints))}
 {line("Status", `${snapshot?.planWeek?.status || "planned"}${snapshot?.planWeek?.adjusted ? " - adjusted" : ""}`)}
 </div>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Readiness</div>
 {line("State", snapshot?.readiness?.stateLabel || snapshot?.readiness?.state)}
 {line("Source", `${snapshot?.readiness?.source || "unknown"}${snapshot?.readiness?.inputDriven ? " - input-driven" : ""}`)}
 {line("Summary", snapshot?.readiness?.userVisibleLine)}
 {line("Factors", compactList(snapshot?.readiness?.factors))}
 </div>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Nutrition</div>
 {line("Day type", snapshot?.nutrition?.dayType)}
 {line("Actual logged", snapshot?.nutrition?.actualLogged ? "yes" : "no", snapshot?.nutrition?.actualLogged ? C.green : "var(--muted)")}
 {line("Compliance", snapshot?.nutrition?.compliance)}
 {line("Deviation", snapshot?.nutrition?.deviationKind)}
 {line("Comparison", `${snapshot?.nutrition?.comparisonStatus || "unknown"}${snapshot?.nutrition?.comparisonImpact ? ` - ${snapshot.nutrition.comparisonImpact}` : ""}`)}
 {line("Summary", snapshot?.nutrition?.comparisonSummary)}
 </div>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Logging And History</div>
 {line("Session status", snapshot?.logging?.sessionStatus)}
 {line("Check-in", `${snapshot?.logging?.checkinStatus || "none"}${snapshot?.logging?.hasCheckin ? " - saved" : ""}`)}
 {line("Nutrition log", snapshot?.logging?.hasNutritionLog ? "saved" : "missing")}
 {line("Plan history", `rev ${snapshot?.prescribedHistory?.revisionNumber || 0} of ${snapshot?.prescribedHistory?.revisionCount || 0}`)}
 {line("Snapshot source", `${snapshot?.prescribedHistory?.sourceType || "none"}${snapshot?.prescribedHistory?.durability ? ` - ${snapshot.prescribedHistory.durability}` : ""}`)}
 </div>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Surface Audit</div>
 {line("Status", snapshot?.surfaceAudit?.ok ? "aligned" : `mismatch (${snapshot?.surfaceAudit?.mismatchCount || 0})`, snapshot?.surfaceAudit?.ok ? C.green : C.amber)}
 {line("Fields", compactList(snapshot?.surfaceAudit?.comparedFields))}
 {Object.entries(snapshot?.surfaceAudit?.surfaces || {}).map(([surfaceKey, surfaceSnapshot]) => (
 <div key={surfaceKey} style={{ marginTop:"0.18rem" }}>
 {line(surfaceKey, `${surfaceSnapshot?.sessionLabel || "unknown"}${surfaceSnapshot?.preferenceAndAdaptationLine ? ` - ${surfaceSnapshot.preferenceAndAdaptationLine}` : ""}`)}
 </div>
 ))}
 {(snapshot?.surfaceAudit?.mismatches || []).slice(0, 4).map((mismatch, index) => (
 <div key={`${mismatch.surface}_${mismatch.field}_${index}`} style={{ fontSize:"0.49rem", color:C.amber, lineHeight:1.45 }}>
 {`${mismatch.surface} ${mismatch.field}: expected "${mismatch.expected || "none"}" but rendered "${mismatch.actual || "none"}"`}
 </div>
 ))}
 </div>
 <div>
 <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>AI Boundary</div>
 {line("Analyzing", snapshot?.ai?.analyzing ? "yes" : "no", snapshot?.ai?.analyzing ? C.amber : "var(--muted)")}
 {line("Plan proposal", snapshot?.ai?.latestAcceptedPlanProposal ? `${snapshot.ai.latestAcceptedPlanProposal.type || "accepted"} - ${snapshot.ai.latestAcceptedPlanProposal.acceptedBy || "gate"}` : "none accepted")}
 {line("Plan packet", snapshot?.ai?.latestAcceptedPlanProposal ? `${snapshot.ai.latestAcceptedPlanProposal.packetIntent || "unknown"} - ${snapshot.ai.latestAcceptedPlanProposal.packetVersion || ""}` : "none")}
 {line("Coach action", snapshot?.ai?.latestAcceptedCoachAction ? `${snapshot.ai.latestAcceptedCoachAction.type || "accepted"} - ${snapshot.ai.latestAcceptedCoachAction.acceptedBy || "gate"}` : "none accepted")}
 {line("Coach source", snapshot?.ai?.latestAcceptedCoachAction ? `${snapshot.ai.latestAcceptedCoachAction.proposalSource || "unknown"} - ${snapshot.ai.latestAcceptedCoachAction.acceptancePolicy || "unknown"}` : "none")}
 </div>
 </div>
 </div>
 </details>
 );
}

function OnboardingCoach({ onComplete, startingFresh = false, existingMemory = [], personalization = {}, onTrackFrictionEvent = () => {} }) {
 const initialPrompt = startingFresh
 ? "Starting fresh. I still remember everything from before - I'm just building a new plan from today. What do you want from this next plan? Exact or vague is fine."
 : "Hey. I'm going to ask you a few questions before I build your plan. Start with what you want from this plan - exact or vague both work.";
 const restoredIntakeSessionRef = useRef(null);
 if (restoredIntakeSessionRef.current === null) {
 restoredIntakeSessionRef.current = readPersistedIntakeSessionSnapshot({
 startingFresh,
 });
 }
 const restoredIntakeSession = restoredIntakeSessionRef.current;
 const BUILD_STAGES = [
 "Mapping your training blocks...",
 "Calibrating intensity to your baseline...",
 "Setting up your nutrition targets...",
 "Almost ready...",
 ];
 const messagesRef = useRef(restoredIntakeSession?.messages || []);
 const scrollRef = useRef(null);
 const composerRef = useRef(null);
 const nextMessageIdRef = useRef(Math.max(1, Number(restoredIntakeSession?.nextMessageId) || 1));
 const nextIntakeEventIdRef = useRef(Math.max(1, Number(restoredIntakeSession?.nextIntakeEventId) || 1));
 const latestAssessmentRequestIdRef = useRef(0);
 const confirmBuildLockRef = useRef(false);
 const activeCommitSnapshotIdRef = useRef("");
 const committedCommitSnapshotIdsRef = useRef(new Set());
 const processedIntakeMessageKeysRef = useRef(new Set(restoredIntakeSession?.processedMessageKeys || []));
 const processedTranscriptIdempotencyKeysRef = useRef(new Set(restoredIntakeSession?.processedTranscriptKeys || []));
 const secondaryGoalAddedMessageKeysRef = useRef(new Set(restoredIntakeSession?.secondaryGoalAddedMessageKeys || []));
 const anchorCollectionGapRecoveryKeyRef = useRef("");
 const sessionPersistenceDisabledRef = useRef(false);
 const startedRef = useRef(Boolean(restoredIntakeSession?.messages?.length));
 const seededInitialAnswers = useMemo(() => buildSeededIntakeAnswers({
 baseAnswers: restoredIntakeSession?.answers || {},
 personalization,
 }), [personalization, restoredIntakeSession?.answers]);
 const [messages, setMessages] = useState(() => restoredIntakeSession?.messages || []);
 const [answers, setAnswers] = useState(() => seededInitialAnswers);
 const [stepIndex, setStepIndex] = useState(() => Math.max(0, Number(restoredIntakeSession?.stepIndex) || 0));
const [draft, setDraft] = useState(() => String(restoredIntakeSession?.draft || ""));
const [extraGoalDraft, setExtraGoalDraft] = useState("");
const [selectedGoalSelections, setSelectedGoalSelections] = useState(() => buildGoalTemplateSelectionsFromAnswers({
answers: restoredIntakeSession?.answers || {},
}));
const [pendingGoalSelection, setPendingGoalSelection] = useState(null);
const [selectedStarterGoalTypeId, setSelectedStarterGoalTypeId] = useState(() => inferIntakeStarterGoalTypeId({
selection: buildGoalTemplateSelectionsFromAnswers({ answers: restoredIntakeSession?.answers || {} })[0] || null,
answers: restoredIntakeSession?.answers || {},
}));
const [showCustomGoalComposer, setShowCustomGoalComposer] = useState(false);
 const [goalMetricValues, setGoalMetricValues] = useState({});
 const [goalMetricFieldErrors, setGoalMetricFieldErrors] = useState({});
 const [goalMetricFormError, setGoalMetricFormError] = useState("");
 const [equipmentSelection, setEquipmentSelection] = useState([]);
 const [equipmentOther, setEquipmentOther] = useState("");
 const [phase, setPhase] = useState(() => (
 restoredIntakeSession?.phase === INTAKE_UI_PHASES.confirm
 ? INTAKE_UI_PHASES.clarify
 : restoredIntakeSession?.phase || INTAKE_UI_PHASES.goals
 ));
 const [assessmentText, setAssessmentText] = useState(() => String(restoredIntakeSession?.assessmentText || ""));
 const [assessmentBoundary, setAssessmentBoundary] = useState(() => restoredIntakeSession?.assessmentBoundary || { typedIntakePacket: null, aiInterpretationProposal: null, transition_id: "" });
 const [assessmentPreview, setAssessmentPreview] = useState(() => restoredIntakeSession?.assessmentPreview || { goalResolution: null, goalFeasibility: null, arbitration: null, orderedResolvedGoals: [], reviewModel: null });
 const [goalStackConfirmation, setGoalStackConfirmation] = useState(() => restoredIntakeSession?.goalStackConfirmation || null);
 const [askedClarifyingQuestions, setAskedClarifyingQuestions] = useState(() => restoredIntakeSession?.askedClarifyingQuestions || []);
 const [pendingClarifyingQuestion, setPendingClarifyingQuestion] = useState(() => restoredIntakeSession?.pendingClarifyingQuestion || null);
 const [pendingSecondaryGoalPrompt, setPendingSecondaryGoalPrompt] = useState(() => restoredIntakeSession?.pendingSecondaryGoalPrompt || null);
 const [secondaryGoalEntries, setSecondaryGoalEntries] = useState(() => readAdditionalGoalEntries({
 answers: restoredIntakeSession?.answers || {},
 }));
 const [showSecondaryGoalCustomInput, setShowSecondaryGoalCustomInput] = useState(() => Boolean(restoredIntakeSession?.showSecondaryGoalCustomInput));
 const [clarificationValues, setClarificationValues] = useState({});
 const [clarificationFieldErrors, setClarificationFieldErrors] = useState({});
 const [clarificationFormError, setClarificationFormError] = useState("");
 const [naturalAnchorDraft, setNaturalAnchorDraft] = useState("");
 const [anchorEntryMode, setAnchorEntryMode] = useState("structured");
 const [naturalAnchorSubmitting, setNaturalAnchorSubmitting] = useState(false);
 const [anchorCapturePreview, setAnchorCapturePreview] = useState(null);
 const [coachVoicePhrasingByAnchorKey, setCoachVoicePhrasingByAnchorKey] = useState({});
 const [currentAnchorBindingTarget, setCurrentAnchorBindingTarget] = useState(null);
 const [adjustmentTargetGoal, setAdjustmentTargetGoal] = useState(() => restoredIntakeSession?.adjustmentTargetGoal || null);
 const [confirmBuildError, setConfirmBuildError] = useState("");
 const [confirmBuildSubmitting, setConfirmBuildSubmitting] = useState(false);
 const [assessing, setAssessing] = useState(false);
 const [reviewRefreshPending, setReviewRefreshPending] = useState(false);
 const [streamTargetId, setStreamTargetId] = useState(null);
 const [buildingStageIndex, setBuildingStageIndex] = useState(0);
 const [intakeMachine, setIntakeMachine] = useState(() => restoredIntakeSession?.intakeMachine || createIntakeMachineState());
 const intakeMachineRef = useRef(intakeMachine);
 const coachVoiceRequestKeysRef = useRef(new Set());
 const goalIntentDraftRef = useRef(String(restoredIntakeSession?.answers?.goal_intent || ""));
 const stageAnalyticsRef = useRef({
 phase: restoredIntakeSession?.phase || INTAKE_UI_PHASES.goals,
 stage: restoredIntakeSession?.intakeMachine?.stage || createIntakeMachineState().stage,
 enteredAt: Date.now(),
 continueClicks: 0,
 initialized: false,
 });

 const recordIntakeStageView = ({ nextPhase = "", nextStage = "" } = {}) => {
 onTrackFrictionEvent({
 flow: "intake",
 action: "stage_view",
 outcome: "viewed",
 props: {
 phase: nextPhase || phase,
 stage: nextStage || intakeMachine?.stage || "",
 starting_fresh: startingFresh,
 },
 });
 };

 const recordIntakeStageExit = ({ outcome = "progressed", nextPhase = "", nextStage = "", reason = "" } = {}) => {
 const currentStage = stageAnalyticsRef.current;
 if (!currentStage?.initialized) return;
 onTrackFrictionEvent({
 flow: "intake",
 action: "stage_exit",
 outcome,
 props: {
 phase: currentStage.phase,
 stage: currentStage.stage,
 next_phase: nextPhase,
 next_stage: nextStage,
 duration_ms: Date.now() - Number(currentStage.enteredAt || Date.now()),
 continue_clicks: Number(currentStage.continueClicks || 0),
 reason,
 },
 });
 };

 const buildFlow = (currentAnswers = {}) => {
 const injuryQuestionContext = buildIntakeInjuryConstraintContext({
 injuryText: currentAnswers.injury_text,
 injuryImpact: currentAnswers.injury_impact,
 injuryArea: currentAnswers.injury_area,
 injurySide: currentAnswers.injury_side,
 injuryLimitations: currentAnswers.injury_limitations,
 });
 return [
 {
 key: "goal_intent",
 type: "text",
 message: initialPrompt,
 placeholder: "Examples: run a 1:45 half, look athletic again, get abs by summer, lose fat but keep strength",
 },
 { key: "experience_level", type: "buttons", message: "Got it. What's your training experience level?", options: EXPERIENCE_LEVEL_OPTIONS.map(k => EXPERIENCE_LEVEL_LABELS[k]), valueMap: Object.fromEntries(EXPERIENCE_LEVEL_OPTIONS.map(k => [EXPERIENCE_LEVEL_LABELS[k], k])) },
 { key: "training_days", type: "buttons", message: "How many days a week can you realistically train? Think about your average week - not your best one.", options: ["2", "3", "4", "5", "6+"] },
 { key: "session_length", type: "buttons", message: "How much time do you have per session?", options: SESSION_LENGTH_OPTIONS.map(k => SESSION_LENGTH_LABELS[k]), valueMap: Object.fromEntries(SESSION_LENGTH_OPTIONS.map(k => [SESSION_LENGTH_LABELS[k], k])) },
 { key: "training_location", type: "buttons", message: "Where do you usually work out?", options: ["Home", "Gym", "Outdoor", "Both", "Varies a lot"] },
 ...(["Home", "Both"].includes(currentAnswers.training_location || "") ? [{
 key: "home_equipment",
 type: "multiselect",
 message: "What do you have available at home?",
 options: ["Dumbbells", "Resistance bands", "Pull-up bar", "Bodyweight only", "Other"],
 }] : []),
 { key: "injury_text", type: "text_optional", message: "Do you have any injuries or physical limitations I need to plan around?", placeholder: "Anything current?", skipLabel: "Nothing current", skipValue: "Nothing current" },
 ...(injuryQuestionContext.hasCurrentIssue ? [{
 key: "injury_impact",
 type: "buttons",
 message: "How is that affecting training most right now?",
 options: [...INTAKE_INJURY_IMPACT_OPTIONS],
 }] : []),
 { key: "coaching_style", type: "buttons", message: "Last one - how do you want to be coached?", options: ["Keep me consistent", "Balanced coaching", "Push me (with guardrails)"] },
 ];
 };
 const flow = useMemo(() => buildFlow(answers), [
 answers.training_location,
 answers.injury_text,
 answers.injury_impact,
 answers.injury_area,
 answers.injury_side,
 Array.isArray(answers.injury_limitations) ? answers.injury_limitations.join("|") : "",
 initialPrompt,
 ]);
 const currentPrompt = flow[stepIndex] || null;
 const isCoachStreaming = Boolean(streamTargetId);

 useEffect(() => {
 messagesRef.current = messages;
 if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }, [messages]);

 useEffect(() => {
 intakeMachineRef.current = intakeMachine;
 }, [intakeMachine]);

 useEffect(() => {
 goalIntentDraftRef.current = String(answers?.goal_intent || "");
 }, [answers?.goal_intent]);

 useEffect(() => {
 if (startedRef.current) return;
 startedRef.current = true;
 const id = nextMessageIdRef.current++;
 setMessages([{ id, role: "coach", text: sanitizeIntakeText(initialPrompt), displayedText: "" }]);
 setStreamTargetId(id);
 }, [initialPrompt]);

 useEffect(() => {
 if (!restoredIntakeSession) return;
 onTrackFrictionEvent({
 flow: "intake",
 action: "session_restore",
 outcome: "restored",
 props: {
 phase: restoredIntakeSession.phase || INTAKE_UI_PHASES.goals,
 stage: restoredIntakeSession?.intakeMachine?.stage || "",
 starting_fresh: restoredIntakeSession.startingFresh,
 },
 });
 }, [onTrackFrictionEvent, restoredIntakeSession]);

 useEffect(() => {
 const nextPhase = phase;
 const nextStage = intakeMachine?.stage || "";
 const previous = stageAnalyticsRef.current;
 if (!previous.initialized) {
 stageAnalyticsRef.current = {
 phase: nextPhase,
 stage: nextStage,
 enteredAt: Date.now(),
 continueClicks: 0,
 initialized: true,
 };
 recordIntakeStageView({ nextPhase, nextStage });
 return;
 }
 if (previous.phase === nextPhase && previous.stage === nextStage) return;
 recordIntakeStageExit({ outcome: "progressed", nextPhase, nextStage });
 stageAnalyticsRef.current = {
 phase: nextPhase,
 stage: nextStage,
 enteredAt: Date.now(),
 continueClicks: 0,
 initialized: true,
 };
 recordIntakeStageView({ nextPhase, nextStage });
 }, [intakeMachine?.stage, phase]);

 useEffect(() => {
 if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
 const handlePageHide = () => {
 if (sessionPersistenceDisabledRef.current) return;
 recordIntakeStageExit({ outcome: "abandoned", reason: "pagehide" });
 };
 window.addEventListener("pagehide", handlePageHide);
 return () => window.removeEventListener("pagehide", handlePageHide);
 }, []);

 useEffect(() => {
 if (typeof window === "undefined") return;
 if (sessionPersistenceDisabledRef.current) {
 safeStorageRemove(sessionStorage, INTAKE_SESSION_STORAGE_KEY);
 return;
 }
 const hasMeaningfulIntakeState = Boolean(
 messages.length
 || Object.keys(answers || {}).length
 || String(draft || "").trim()
 || String(extraGoalDraft || "").trim()
 || phase !== INTAKE_UI_PHASES.goals
 || stepIndex > 0
 || intakeMachine?.stage !== INTAKE_MACHINE_STATES.FREEFORM_GOALS
 );
 if (!hasMeaningfulIntakeState) {
 safeStorageRemove(sessionStorage, INTAKE_SESSION_STORAGE_KEY);
 return;
 }
 const snapshot = buildPersistableIntakeSession({
 messages,
 answers,
 stepIndex,
 draft,
 phase,
 assessmentText,
 assessmentBoundary,
 assessmentPreview,
 goalStackConfirmation,
 askedClarifyingQuestions,
 pendingClarifyingQuestion,
 pendingSecondaryGoalPrompt,
 secondaryGoalEntries,
 showSecondaryGoalCustomInput,
 intakeMachine,
 adjustmentTargetGoal,
 nextMessageId: nextMessageIdRef.current,
 nextIntakeEventId: nextIntakeEventIdRef.current,
 secondaryGoalAddedMessageKeys: [...secondaryGoalAddedMessageKeysRef.current],
 startingFresh,
 });
 safeStorageSet(sessionStorage, INTAKE_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
 }, [
 adjustmentTargetGoal,
 answers,
 assessmentBoundary,
 assessmentPreview,
 askedClarifyingQuestions,
 draft,
 goalStackConfirmation,
 intakeMachine,
 messages,
 pendingClarifyingQuestion,
 pendingSecondaryGoalPrompt,
 phase,
 extraGoalDraft,
 secondaryGoalEntries,
 showSecondaryGoalCustomInput,
 startingFresh,
 stepIndex,
 assessmentText,
 ]);

 useEffect(() => {
 if (streamTargetId || phase === INTAKE_UI_PHASES.building) return;
 const nextStream = messagesRef.current.find((message) => message.role === "coach" && message.displayedText !== message.text);
 if (nextStream) setStreamTargetId(nextStream.id);
 }, [messages, streamTargetId, phase]);

 useEffect(() => {
 if (!streamTargetId) return;
 const target = messagesRef.current.find((message) => message.id === streamTargetId);
 if (!target) {
 setStreamTargetId(null);
 return;
 }
 const tokens = target.text.match(/\S+\s*/g) || [target.text];
 let index = 0;
 let cancelled = false;
 const tick = () => {
 if (cancelled) return;
 index += 1;
 const nextText = tokens.slice(0, index).join("");
 setMessages((prev) => prev.map((message) => (
 message.id === streamTargetId ? { ...message, displayedText: nextText } : message
 )));
 if (index < tokens.length) {
 setTimeout(tick, index < 10 ? 55 : 28);
 } else {
 setStreamTargetId(null);
 }
 };
 const timer = setTimeout(tick, 120);
 return () => {
 cancelled = true;
 clearTimeout(timer);
 };
 }, [streamTargetId]);

 useEffect(() => {
 if (currentPrompt?.key === "home_equipment") {
 setEquipmentSelection(Array.isArray(answers.home_equipment) ? answers.home_equipment : []);
 setEquipmentOther(String(answers.home_equipment_other || ""));
 } else {
 setEquipmentSelection([]);
 setEquipmentOther("");
 }
 }, [currentPrompt?.key]);

 const activeMachineAnchor = intakeMachine?.draft?.missingAnchorsEngine?.currentAnchor || null;
 const activeAnchorCoachVoiceKey = [
 String(intakeMachine?.transition_id || "").trim(),
 String(activeMachineAnchor?.anchor_id || "").trim(),
 String(activeMachineAnchor?.field_id || "").trim(),
 ].filter(Boolean).join(":");
 const activeAnchorCoachVoicePhrasing = activeAnchorCoachVoiceKey
 ? coachVoicePhrasingByAnchorKey?.[activeAnchorCoachVoiceKey]?.phrasing || null
 : null;
 const activeAnchorDisplayCopy = useMemo(() => resolveCoachVoiceDisplayCopy({
 anchor: activeMachineAnchor,
 phrasing: activeAnchorCoachVoicePhrasing,
 }), [activeMachineAnchor, activeAnchorCoachVoicePhrasing]);
 const buildCoachVoiceContext = () => {
 const goalSummary = String(intakeMachine?.draft?.reviewModel?.primarySummary || "").trim();
 const remainingCount = Array.isArray(intakeMachine?.draft?.missingAnchorsEngine?.missingAnchors)
 ? intakeMachine.draft.missingAnchorsEngine.missingAnchors.length
 : 0;
 return [
 goalSummary ? `Goal: ${goalSummary}` : "",
 remainingCount > 0 ? `${remainingCount} required ${remainingCount === 1 ? "detail" : "details"} left.` : "",
 ].filter(Boolean).join(" ");
 };
 const parseStrengthTopSetDraft = (value = "") => {
 const normalized = String(value || "").trim().replace(/[x]/g, "x");
 if (!normalized) return { mode: "top_set", weight: "", reps: "" };
 const topSetMatch = normalized.match(/(\d{2,4}(?:\.\d+)?)\s*x\s*(\d{1,2})\b/i);
 if (topSetMatch?.[1]) {
 return {
 mode: "top_set",
 weight: String(topSetMatch[1]).trim(),
 reps: String(topSetMatch[2]).trim(),
 };
 }
 const singleMatch = normalized.match(/(\d{2,4}(?:\.\d+)?)/);
 if (singleMatch?.[1]) {
 return {
 mode: /single|1rm|max/i.test(normalized) ? "estimated_max" : "top_set",
 weight: String(singleMatch[1]).trim(),
 reps: "",
 };
 }
 return { mode: "top_set", weight: "", reps: "" };
 };
 const applyStrengthStructuredValue = (fieldId, { mode = "top_set", weight = "", reps = "" } = {}) => {
 setClarificationValues((prev) => ({
 ...prev,
 [`${fieldId}__mode`]: String(mode || "top_set"),
 [`${fieldId}__weight`]: String(weight || "").trim(),
 [`${fieldId}__reps`]: String(reps || "").trim(),
 }));
 setClarificationFieldErrors((prev) => {
 if (!prev) return prev;
 const next = { ...(prev || {}) };
 delete next[fieldId];
 return next;
 });
 if (clarificationFormError) setClarificationFormError("");
 };

 useEffect(() => {
 if (phase !== INTAKE_UI_PHASES.clarify || !activeMachineAnchor?.field_id || !activeMachineAnchor?.anchor_id || !activeAnchorCoachVoiceKey) return;
 if (coachVoiceRequestKeysRef.current.has(activeAnchorCoachVoiceKey)) return;
 if (coachVoicePhrasingByAnchorKey?.[activeAnchorCoachVoiceKey]) return;
 coachVoiceRequestKeysRef.current.add(activeAnchorCoachVoiceKey);
 let cancelled = false;
 setCoachVoicePhrasingByAnchorKey((prev) => ({
 ...(prev || {}),
 [activeAnchorCoachVoiceKey]: {
 status: "loading",
 phrasing: null,
 },
 }));
 (async () => {
 const runtime = await runIntakeCoachVoiceRuntime({
 safeFetchWithTimeout,
 anchor: activeMachineAnchor,
 statePacket: intakeMachine?.draft?.typedIntakePacket || assessmentBoundary?.typedIntakePacket || null,
 briefContext: buildCoachVoiceContext(),
 tone: "supportive_trainer",
 });
 if (cancelled) return;
 setCoachVoicePhrasingByAnchorKey((prev) => ({
 ...(prev || {}),
 [activeAnchorCoachVoiceKey]: {
 status: runtime?.ok ? "ready" : "failed",
 phrasing: runtime?.ok ? runtime.phrasing : null,
 },
 }));
 })();
 return () => {
 cancelled = true;
 };
 }, [
 phase,
 activeMachineAnchor,
 activeAnchorCoachVoiceKey,
 coachVoicePhrasingByAnchorKey,
 intakeMachine?.draft?.typedIntakePacket,
 assessmentBoundary?.typedIntakePacket,
 ]);

 useEffect(() => {
 const isStructuredQuestion = isStructuredIntakeCompletenessQuestion(pendingClarifyingQuestion);
 if (phase !== INTAKE_UI_PHASES.clarify) {
 setCurrentAnchorBindingTarget(null);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setAnchorEntryMode("structured");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 return;
 }
 if (activeMachineAnchor?.field_id) {
 setCurrentAnchorBindingTarget({
 anchor_id: String(activeMachineAnchor?.anchor_id || "").trim(),
 field_id: String(activeMachineAnchor?.field_id || "").trim(),
 });
 const fieldId = activeMachineAnchor.field_id;
 const nextValues = activeMachineAnchor?.draftValue
 ? { [fieldId]: activeMachineAnchor.draftValue }
 : {};
 if (activeMachineAnchor?.input_type === "number_with_unit") {
 nextValues[`${fieldId}__unit`] = activeMachineAnchor?.unit
 || activeMachineAnchor?.unit_options?.[0]?.value
 || "";
 }
 if (activeMachineAnchor?.input_type === "date_or_month") {
 const storedMode = /^\d{4}-\d{2}-\d{2}$/.test(String(activeMachineAnchor?.draftValue || ""))
 ? "date"
 : /^\d{4}-\d{2}$/.test(String(activeMachineAnchor?.draftValue || ""))
 ? "month"
 : "month";
 nextValues[`${fieldId}__mode`] = storedMode;
 }
 if (activeMachineAnchor?.input_type === "strength_top_set") {
 const parsedStrengthDraft = parseStrengthTopSetDraft(activeMachineAnchor?.draftValue || "");
 nextValues[`${fieldId}__mode`] = parsedStrengthDraft.mode;
 nextValues[`${fieldId}__weight`] = parsedStrengthDraft.weight;
 nextValues[`${fieldId}__reps`] = parsedStrengthDraft.reps;
 }
 setClarificationValues(nextValues);
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setAnchorEntryMode("structured");
 setDraft("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 return;
 }
 if (!isStructuredQuestion) {
 setCurrentAnchorBindingTarget(null);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setAnchorEntryMode("structured");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 return;
 }
 setClarificationValues(buildIntakeCompletenessDraft({
 question: pendingClarifyingQuestion,
 answers,
 }));
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setAnchorEntryMode("structured");
 setDraft("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 }, [phase, activeMachineAnchor?.anchor_id, pendingClarifyingQuestion?.key, pendingClarifyingQuestion?.prompt, answers]);

 useEffect(() => {
 const nextGoalEntries = readAdditionalGoalEntries({ answers });
 setSecondaryGoalEntries((prev) => {
 const prevSignature = (Array.isArray(prev) ? prev : []).join("|");
 const nextSignature = nextGoalEntries.join("|");
 return prevSignature === nextSignature ? prev : nextGoalEntries;
 });
 }, [phase, answers]);

 useEffect(() => {
 setShowSecondaryGoalCustomInput(false);
 }, [phase]);

 useEffect(() => {
 if (phase !== INTAKE_UI_PHASES.building) return undefined;
 setBuildingStageIndex(0);
 const interval = setInterval(() => {
 setBuildingStageIndex((prev) => (prev + 1) % BUILD_STAGES.length);
 }, 900);
 return () => clearInterval(interval);
 }, [phase]);

 useEffect(() => {
 if (!isCoachStreaming && composerRef.current) composerRef.current.focus();
 }, [isCoachStreaming, currentPrompt?.key, phase]);

 const reviewGoals = assessmentPreview?.orderedResolvedGoals || [];
 const reviewGoalSignature = useMemo(
 () => reviewGoals.map((goal) => `${goal?.id || ""}:${goal?.summary || ""}:${goal?.planningPriority || ""}`).join("|"),
 [reviewGoals]
 );
 const derivedReviewModel = useMemo(() => buildIntakeGoalReviewModel({
 goalResolution: assessmentPreview?.goalResolution || null,
 orderedResolvedGoals: reviewGoals,
 goalFeasibility: assessmentPreview?.goalFeasibility || null,
 arbitration: assessmentPreview?.arbitration || null,
 aiInterpretationProposal: assessmentBoundary?.aiInterpretationProposal || null,
 answers,
 goalStackConfirmation,
 }), [
 assessmentPreview?.goalResolution,
 assessmentPreview?.goalFeasibility,
 assessmentPreview?.arbitration,
 reviewGoalSignature,
 assessmentBoundary?.aiInterpretationProposal,
 answers,
 goalStackConfirmation,
 ]);
 const derivedConfirmationState = useMemo(() => deriveIntakeConfirmationState({
 reviewModel: derivedReviewModel,
 }), [derivedReviewModel]);
 const activeReviewModel = intakeMachine?.draft?.reviewModel || derivedReviewModel;
 const activeConfirmationState = intakeMachine?.draft?.confirmationState || derivedConfirmationState;
 const activeReviewGoals = Array.isArray(intakeMachine?.draft?.orderedResolvedGoals) && intakeMachine.draft.orderedResolvedGoals.length
 ? intakeMachine.draft.orderedResolvedGoals
 : reviewGoals;
 const activeGoalResolution = intakeMachine?.draft?.goalResolution || assessmentPreview?.goalResolution || null;
 const activeGoalFeasibility = intakeMachine?.draft?.goalFeasibility || assessmentPreview?.goalFeasibility || null;
 const activePrimaryResolvedGoal = Array.isArray(activeReviewModel?.activeResolvedGoals) && activeReviewModel.activeResolvedGoals.length
 ? activeReviewModel.activeResolvedGoals[0]
 : null;
 const milestoneDecisionModel = useMemo(() => buildIntakeMilestoneDecisionModel({
 reviewModel: activeReviewModel,
 goalFeasibility: activeGoalFeasibility,
 goalStackConfirmation,
 }), [activeReviewModel, activeGoalFeasibility, goalStackConfirmation]);
 const confirmationStatusLabel = activeConfirmationState?.status === "incomplete"
 ? "Need one more detail"
 : activeConfirmationState?.status === "block"
 ? "Start with a smaller milestone"
 : activeConfirmationState?.status === "warn"
 ? "Target is ambitious"
 : "Ready to build";
 const confirmationHeadline = activeConfirmationState?.status === "incomplete"
 ? "I need one more detail before I build this."
 : activeConfirmationState?.status === "block"
 ? "Start with a smaller milestone first."
 : activeConfirmationState?.status === "warn"
 ? "Target is ambitious, but still workable."
 : "This looks realistic from where you're starting.";
 const confirmationNeedsList = useMemo(() => {
 return buildIntakeConfirmationNeedsList({
 reviewModel: activeReviewModel,
 machineState: intakeMachine,
 confirmationState: activeConfirmationState,
 maxItems: 3,
 });
 }, [activeReviewModel, intakeMachine, activeConfirmationState]);
 const confirmationAllowsProceed = activeConfirmationState?.status === "proceed" || activeConfirmationState?.status === "warn";
 const confirmCtaEnabled = Boolean(
 confirmationAllowsProceed
 && activeConfirmationState?.canConfirm
 );
 const confirmationTone = activeConfirmationState?.status === "block" || activeConfirmationState?.status === "incomplete"
 ? C.amber
 : activeConfirmationState?.status === "warn"
 ? "#dbe7f6"
 : "#8fa5c8";
 const selectedMilestoneLongTermTarget = String(
 activePrimaryResolvedGoal?.milestonePath?.longTermTargetSummary
 || milestoneDecisionModel?.longTermTargetSummary
 || ""
 ).trim();
 const derivedGoalStackConfirmation = useMemo(() => buildIntakeGoalStackConfirmation({
 resolvedGoals: activeReviewGoals,
 goalStackConfirmation,
 goalFeasibility: activeGoalFeasibility,
 }), [activeReviewGoals, goalStackConfirmation, activeGoalFeasibility]);
 const goalStackConfirmationNeedsSync = JSON.stringify(goalStackConfirmation || null) !== JSON.stringify(derivedGoalStackConfirmation || null);
 const anchorCollectionGap = intakeMachine?.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION && !activeMachineAnchor?.field_id;
 const reviewStatePending = reviewRefreshPending || goalStackConfirmationNeedsSync || anchorCollectionGap;

 useEffect(() => {
 if (!goalStackConfirmationNeedsSync) return;
 setGoalStackConfirmation(derivedGoalStackConfirmation);
 if (assessing) return;
 const hasTypedPacket = Boolean(
 intakeMachineRef.current?.draft?.typedIntakePacket
 || assessmentBoundary?.typedIntakePacket
 );
 if (!hasTypedPacket) return;
 const refreshedState = refreshReviewMachineState({
 nextGoalStackConfirmation: derivedGoalStackConfirmation,
 });
 if (phase === INTAKE_UI_PHASES.clarify || phase === INTAKE_UI_PHASES.confirm) {
 routeFromRefreshedReviewState({
 refreshedState,
 answersOverride: refreshedState?.draft?.answers || answers,
 });
 }
 }, [goalStackConfirmationNeedsSync, derivedGoalStackConfirmation, assessing, assessmentBoundary?.typedIntakePacket, phase, answers]);
 useEffect(() => {
 if (!anchorCollectionGap) {
 anchorCollectionGapRecoveryKeyRef.current = "";
 return;
 }
 if (assessing) return;
 const hasTypedPacket = Boolean(
 intakeMachineRef.current?.draft?.typedIntakePacket
 || assessmentBoundary?.typedIntakePacket
 );
 if (!hasTypedPacket) return;
 const recoveryKey = `${String(intakeMachine?.transition_id || "").trim()}::${JSON.stringify(goalStackConfirmation || null)}`;
 if (anchorCollectionGapRecoveryKeyRef.current === recoveryKey) return;
 anchorCollectionGapRecoveryKeyRef.current = recoveryKey;
 const refreshedState = refreshReviewMachineState();
 if (phase === INTAKE_UI_PHASES.clarify || phase === INTAKE_UI_PHASES.confirm) {
 routeFromRefreshedReviewState({
 refreshedState,
 answersOverride: refreshedState?.draft?.answers || answers,
 });
 }
 }, [anchorCollectionGap, assessing, assessmentBoundary?.typedIntakePacket, intakeMachine?.transition_id, goalStackConfirmation, phase, answers]);

 const appendCoachMessages = (texts) => {
 const queue = queueCoachTranscriptMessages({
 texts: (Array.isArray(texts) ? texts : [texts]).map((item) => (
 item && typeof item === "object" && !Array.isArray(item)
 ? {
 ...item,
 text: sanitizeIntakeText(item?.text || ""),
 }
 : sanitizeIntakeText(item)
 )),
 nextMessageId: nextMessageIdRef.current,
 seenMessageKeys: [...processedTranscriptIdempotencyKeysRef.current],
 seenIdempotencyKeys: [...processedTranscriptIdempotencyKeysRef.current],
 activeTransitionId: intakeMachineRef.current?.transition_id || "",
 });
 nextMessageIdRef.current = queue.nextMessageId;
 queue.acceptedMessageKeys.forEach((key) => processedTranscriptIdempotencyKeysRef.current.add(key));
 if (queue.entries.length === 0) return [];
 setMessages((prev) => [...prev, ...queue.entries]);
 setStreamTargetId((prev) => resolveNextCoachStreamTargetId({
 currentStreamTargetId: prev,
 queuedEntries: queue.entries,
 }));
 return queue.entries.map((entry) => entry.id);
 };
 const appendCoachMessage = (text) => appendCoachMessages([text])[0] || null;
 const buildIntakeEventId = (prefix = "intake") => `${prefix}_${String(nextIntakeEventIdRef.current++).padStart(6, "0")}`;
 const dispatchIntakeMachineEvent = (type, payload = {}) => {
 const nextEvent = {
 event_id: payload?.event_id || buildIntakeEventId(String(type || "intake").toLowerCase()),
 type,
 timestamp: new Date().toISOString(),
 payload,
 };
 const previousState = intakeMachineRef.current || intakeMachine || createIntakeMachineState();
 const nextState = intakeReducer(previousState, nextEvent);
 intakeMachineRef.current = nextState;
 setIntakeMachine(nextState);
 return nextState;
 };
 const settleIntakeMachine = (machineState = null) => {
 let nextState = machineState || intakeMachineRef.current;
 let guard = 0;
 while (nextState && guard < 4) {
 if (nextState.stage === INTAKE_MACHINE_STATES.REALISM_GATE) {
 nextState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.REALISM_RESULT, {
 now: new Date().toISOString(),
 });
 guard += 1;
 continue;
 }
 if (nextState.stage === INTAKE_MACHINE_STATES.GOAL_ARBITRATION) {
 nextState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.ARBITRATION_RESULT, {
 now: new Date().toISOString(),
 });
 guard += 1;
 continue;
 }
 break;
 }
 return nextState || machineState || intakeMachineRef.current;
 };
 const syncMachineDraftToIntakeView = (machineState = null) => {
 const draftState = machineState?.draft || null;
 if (!draftState) return;
 setAnswers(draftState.answers || {});
 setAssessmentBoundary({
 typedIntakePacket: draftState.typedIntakePacket || null,
 aiInterpretationProposal: draftState.aiInterpretationProposal || null,
 transition_id: machineState?.transition_id || "",
 });
 setAssessmentPreview({
 goalResolution: draftState.goalResolution || null,
 goalFeasibility: draftState.goalFeasibility || null,
 arbitration: draftState.arbitration || null,
 orderedResolvedGoals: draftState.orderedResolvedGoals || [],
 reviewModel: draftState.reviewModel || null,
 });
 };
 const resolveSecondaryGoalPrompt = ({
 machineState = null,
 reviewModelOverride = null,
 answersOverride = null,
 } = {}) => {
 return null;
 };
 const refreshReviewMachineState = ({
 nextAnswers = intakeMachineRef.current?.draft?.answers || answers,
 nextGoalStackConfirmation = goalStackConfirmation,
 } = {}) => {
 const typedIntakePacket = intakeMachineRef.current?.draft?.typedIntakePacket || assessmentBoundary?.typedIntakePacket || null;
 if (!typedIntakePacket) {
 setReviewRefreshPending(false);
 return intakeMachineRef.current;
 }
 setReviewRefreshPending(true);
 const refreshedState = settleIntakeMachine(dispatchIntakeMachineEvent(
 INTAKE_MACHINE_EVENTS.INTERPRETATION_READY,
 {
 assessment: {
 typedIntakePacket,
 aiInterpretationProposal: intakeMachineRef.current?.draft?.aiInterpretationProposal || assessmentBoundary?.aiInterpretationProposal || null,
 text: assessmentText,
 },
 answers: nextAnswers,
 goalStackConfirmation: nextGoalStackConfirmation,
 suppress_transcript: true,
 now: new Date().toISOString(),
 }
 ));
 syncMachineDraftToIntakeView(refreshedState);
 return refreshedState;
 };
 useEffect(() => {
 if (!reviewRefreshPending) return;
 const timer = setTimeout(() => setReviewRefreshPending(false), 0);
 return () => clearTimeout(timer);
 }, [reviewRefreshPending]);
 const clearReviewEditingState = () => {
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 setShowSecondaryGoalCustomInput(false);
 setDraft("");
 };
 const routeFromRefreshedReviewState = ({
 refreshedState = null,
 answersOverride = answers,
 } = {}) => {
 if (refreshedState?.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION) {
 setPendingSecondaryGoalPrompt(null);
 setPhase(INTAKE_UI_PHASES.clarify);
 return;
 }
 setPendingSecondaryGoalPrompt(null);
 setPhase(INTAKE_UI_PHASES.clarify);
 };
 const applyGoalStackConfirmationUpdate = (nextGoalStackConfirmation = null) => {
 setConfirmBuildError("");
 clearReviewEditingState();
 setGoalStackConfirmation(nextGoalStackConfirmation);
 const refreshedState = refreshReviewMachineState({
 nextGoalStackConfirmation,
 });
 routeFromRefreshedReviewState({
 refreshedState,
 answersOverride: refreshedState?.draft?.answers || answers,
 });
 return refreshedState;
 };
 const resetIntakeForGoalEdit = (nextAnswers = answers) => {
 const editedState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.USER_EDITED, {
 answers: nextAnswers,
 now: new Date().toISOString(),
 });
 syncMachineDraftToIntakeView(editedState);
 coachVoiceRequestKeysRef.current = new Set();
 setCoachVoicePhrasingByAnchorKey({});
 setAssessmentText("");
 setGoalStackConfirmation(null);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setAskedClarifyingQuestions([]);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 return editedState;
 };
const syncGoalStackDraftToAnswers = ({
  baseAnswers = answers,
  primaryGoalText = goalIntentDraftRef.current || baseAnswers?.goal_intent || "",
  additionalGoals = secondaryGoalEntries,
  goalSelections = selectedGoalSelections,
  preserveFoundation = true,
  clearCompatibilityPrimaryGoal = false,
} = {}) => {
 const normalizedSelections = (Array.isArray(goalSelections) ? goalSelections : [])
.map((selection) => buildGoalTemplateSelection({
 templateId: selection?.legacyTemplateId || selection?.templateId || "",
 customGoalText: !selection?.templateId ? selection?.goalText || selection?.summary || "" : "",
 customSummary: selection?.summary || "",
}))
 .filter(Boolean);
 const selectedGoalTexts = normalizedSelections.map((selection) => normalizeIntakeGoalEntry(selection?.goalText || "", 320)).filter(Boolean);
 const selectedPrimaryGoal = selectedGoalTexts[0] || "";
 const selectedAdditionalGoals = selectedGoalTexts.slice(1);
 const derivedGoalStack = selectedPrimaryGoal || selectedAdditionalGoals.length
 ? { primaryGoalText: selectedPrimaryGoal, additionalGoals: selectedAdditionalGoals }
 : splitPrimaryGoalEntryIntoStack(primaryGoalText);
 const normalizedPrimaryGoal = derivedGoalStack.primaryGoalText;
 const normalizedAdditionalGoals = dedupeIntakeGoalEntries([
 ...derivedGoalStack.additionalGoals,
 ...(selectedPrimaryGoal || selectedAdditionalGoals.length ? [] : additionalGoals),
 ])
 .filter((goalText) => goalText.toLowerCase() !== normalizedPrimaryGoal.toLowerCase())
 .slice(0, 7);
 const currentGoalStackSignature = JSON.stringify({
 primaryGoalText: normalizeIntakeGoalEntry(baseAnswers?.goal_intent || "", 320),
 additionalGoals: dedupeIntakeGoalEntries(baseAnswers?.additional_goals_list || []),
 templateIds: buildGoalTemplateSelectionsFromAnswers({ answers: baseAnswers }).map((selection) => selection?.templateId || selection?.goalText || ""),
 });
 const nextGoalStackSignature = JSON.stringify({
 primaryGoalText: normalizedPrimaryGoal,
 additionalGoals: normalizedAdditionalGoals,
 templateIds: normalizedSelections.map((selection) => selection?.templateId || selection?.goalText || ""),
 });
 const goalStackChanged = currentGoalStackSignature !== nextGoalStackSignature;
  const nextAnswers = {
    ...baseAnswers,
    goal_intent: normalizedPrimaryGoal,
    additional_goals_list: normalizedAdditionalGoals,
    other_goals: normalizedAdditionalGoals.join(". "),
    goal_template_stack: normalizedSelections,
    goal_lock_confirmed: goalStackChanged ? false : baseAnswers?.goal_lock_confirmed || false,
    secondary_goal_prompt_answered: normalizedAdditionalGoals.length > 0,
    ...(clearCompatibilityPrimaryGoal ? { primary_goal: "" } : {}),
    ...(preserveFoundation && normalizedPrimaryGoal
    ? { primary_goal: baseAnswers?.primary_goal || "" }
    : {}),
  };
 goalIntentDraftRef.current = normalizedPrimaryGoal;
 setAnswers(nextAnswers);
 setSecondaryGoalEntries(normalizedAdditionalGoals);
 setSelectedGoalSelections(normalizedSelections);
 return nextAnswers;
 };
 const addGoalSelectionToStack = (selection = null, { baseAnswers = answers } = {}) => {
 if (!selection?.goalText) return null;
 const baseSelections = selectedGoalSelections.length
 ? selectedGoalSelections
 : buildGoalTemplateSelectionsFromAnswers({ answers: baseAnswers });
 const nextSelections = [
 ...baseSelections.filter((item) => String(item?.goalText || "").toLowerCase() !== String(selection.goalText || "").toLowerCase()),
 selection,
 ];
 return syncGoalStackDraftToAnswers({
 baseAnswers,
 goalSelections: nextSelections,
 primaryGoalText: goalIntentDraftRef.current || baseAnswers?.goal_intent || "",
 additionalGoals: secondaryGoalEntries,
 });
 };
const setPrimaryGoalSelection = (selection = null) => {
  if (!selection?.goalText) return null;
  const baseSelections = selectedGoalSelections.length
  ? selectedGoalSelections
  : buildGoalTemplateSelectionsFromAnswers({ answers });
  const dedupedSelections = baseSelections
  .slice(1)
  .filter((item) => String(item?.goalText || "").toLowerCase() !== String(selection.goalText || "").toLowerCase());
  const nextAnswers = syncGoalStackDraftToAnswers({
    goalSelections: [selection, ...dedupedSelections],
    primaryGoalText: selection.goalText,
 additionalGoals: secondaryGoalEntries,
 });
 setShowCustomGoalComposer(false);
 setGoalMetricFieldErrors({});
setGoalMetricFormError("");
return nextAnswers;
};
const queueGoalSelection = (selection = null) => {
if (!selection?.goalText) return null;
setPendingGoalSelection(selection);
setGoalMetricFieldErrors({});
setGoalMetricFormError("");
return selection;
};
const commitPendingGoalSelection = () => {
if (!pendingGoalSelection?.goalText) return null;
const pendingGoalText = normalizeIntakeGoalEntry(pendingGoalSelection.goalText, 320).toLowerCase();
if (!pendingGoalText) return null;
const alreadyAdded = intakeGoalSelections.some((selection) => normalizeIntakeGoalEntry(selection?.goalText || "", 320).toLowerCase() === pendingGoalText);
if (alreadyAdded) {
setPendingGoalSelection(null);
return null;
}
const metricOutcome = applyIntakeStarterMetrics({
answers,
goalTypeId: pendingGoalSelection?.familyId || pendingGoalSelection?.templateCategoryId || selectedStarterGoalTypeId,
selection: pendingGoalSelection,
values: goalMetricValues,
questions: pendingGoalMetricQuestions,
requireAll: false,
});
if (!metricOutcome.isValid) {
setGoalMetricFieldErrors(metricOutcome.fieldErrors || {});
setGoalMetricFormError(metricOutcome.formErrors?.[0] || "Choose the goal details above before you save this goal.");
return null;
}
setGoalMetricFieldErrors({});
setGoalMetricFormError("");
const nextAnswers = addGoalSelectionToStack(pendingGoalSelection, {
baseAnswers: metricOutcome.answers,
});
setPendingGoalSelection(null);
return nextAnswers;
};
const selectStarterGoalType = (goalTypeId = "") => {
const normalizedGoalTypeId = String(goalTypeId || "").trim() || "running";
setSelectedStarterGoalTypeId(normalizedGoalTypeId);
setPendingGoalSelection(null);
setGoalMetricFieldErrors({});
setGoalMetricFormError("");
setAnswers((prev) => (
prev?.goal_lock_confirmed
? { ...prev, goal_lock_confirmed: false }
 : prev
 ));
 if (normalizedGoalTypeId === "custom") {
 setShowCustomGoalComposer(true);
 return;
 }
 setShowCustomGoalComposer(false);
 };
 const updateGoalMetricValue = (fieldKey = "", value = "") => {
 if (!fieldKey) return;
 setGoalMetricValues((prev) => ({
 ...(prev || {}),
 [fieldKey]: value,
 }));
 setAnswers((prev) => (
 prev?.goal_lock_confirmed
 ? { ...prev, goal_lock_confirmed: false }
 : prev
 ));
 setGoalMetricFieldErrors((prev) => {
 if (!prev?.[fieldKey]) return prev || {};
 const nextErrors = { ...(prev || {}) };
 delete nextErrors[fieldKey];
 return nextErrors;
 });
 setGoalMetricFormError("");
 };
 const addGoalToStack = () => {
 const cleanGoalText = normalizeIntakeGoalEntry(extraGoalDraft);
 if (!cleanGoalText) return null;
 if (pendingGoalSelection?.goalText) {
 setGoalMetricFormError("Save or clear the goal in progress before you add another one.");
 return null;
 }
 const selection = buildGoalTemplateSelection({
 customGoalText: cleanGoalText,
 });
 setShowCustomGoalComposer(false);
 setExtraGoalDraft("");
 return queueGoalSelection(selection);
 };
const removeGoalFromStack = (goalText = "") => {
  const cleanGoalText = normalizeIntakeGoalEntry(goalText);
  if (!cleanGoalText) return;
  const baseSelections = selectedGoalSelections.length
  ? selectedGoalSelections
  : buildGoalTemplateSelectionsFromAnswers({ answers });
  const nextSelections = baseSelections.filter((item) => normalizeIntakeGoalEntry(item?.goalText || "", 320).toLowerCase() !== cleanGoalText.toLowerCase());
  syncGoalStackDraftToAnswers({
    goalSelections: nextSelections,
    primaryGoalText: nextSelections[0]?.goalText || "",
    additionalGoals: nextSelections.slice(1).map((item) => item?.goalText || "").filter(Boolean),
    clearCompatibilityPrimaryGoal: nextSelections.length === 0,
  });
};
 const moveSelectedGoalInStack = (goalText = "", direction = -1) => {
 const cleanGoalText = normalizeIntakeGoalEntry(goalText, 320).toLowerCase();
 if (!cleanGoalText) return;
 const currentSelections = [
 ...(selectedGoalSelections.length
 ? selectedGoalSelections
 : buildGoalTemplateSelectionsFromAnswers({ answers }))
 ];
 const currentIndex = currentSelections.findIndex((item) => normalizeIntakeGoalEntry(item?.goalText || "", 320).toLowerCase() === cleanGoalText);
 if (currentIndex < 0) return;
 const nextIndex = direction < 0 ? Math.max(0, currentIndex - 1) : Math.min(currentSelections.length - 1, currentIndex + 1);
 if (currentIndex === nextIndex) return;
 const nextSelections = [...currentSelections];
 const [moved] = nextSelections.splice(currentIndex, 1);
 nextSelections.splice(nextIndex, 0, moved);
 syncGoalStackDraftToAnswers({
 goalSelections: nextSelections,
 primaryGoalText: goalIntentDraftRef.current || answers?.goal_intent || "",
 additionalGoals: secondaryGoalEntries,
 });
 };
 const buildFoundationPlanAnswers = () => {
 const baseAnswers = syncGoalStackDraftToAnswers({
 primaryGoalText: "",
 additionalGoals: [],
 goalSelections: [],
 });
 return {
 ...baseAnswers,
 primary_goal: "general_fitness",
 experience_level: baseAnswers?.experience_level || "beginner",
 training_days: baseAnswers?.training_days || "3",
 session_length: baseAnswers?.session_length || "30",
 coaching_style: baseAnswers?.coaching_style || "Balanced coaching",
 };
 };
 const startFoundationPlanFlow = async () => {
 if (confirmBuildSubmitting || confirmBuildLockRef.current || phase === INTAKE_UI_PHASES.building) return;
 confirmBuildLockRef.current = true;
 onTrackFrictionEvent({
 flow: "intake",
 action: "foundation_plan",
 outcome: "selected",
 props: {
 phase,
 stage: intakeMachineRef.current?.stage || intakeMachine?.stage || "",
 },
 });
 const foundationAnswers = buildFoundationPlanAnswers();
 const missingDefaults = [];
 if (!answers?.experience_level) missingDefaults.push("beginner training background");
 if (!answers?.training_days) missingDefaults.push("3 training days per week");
 if (!answers?.session_length) missingDefaults.push("30-minute sessions");
 if (!answers?.coaching_style) missingDefaults.push("balanced coaching");
 if (!answers?.training_location) missingDefaults.push("environment left unconfirmed");
 const foundationAssessmentLine = missingDefaults.length
    ? `Quick-start plan built without goal setup. Defaults used: ${missingDefaults.join(", ")}.`
    : "Quick-start plan built without goal setup using the details already on this page.";
 setAnswers(foundationAnswers);
 setAskedClarifyingQuestions([]);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setAssessmentText(foundationAssessmentLine);
 setConfirmBuildError("");
 setPhase(INTAKE_UI_PHASES.building);
 setConfirmBuildSubmitting(true);
 try {
 await onComplete({
 ...foundationAnswers,
 timeline_assessment: foundationAssessmentLine,
 starting_fresh: startingFresh,
 });
 sessionPersistenceDisabledRef.current = true;
 safeStorageRemove(sessionStorage, INTAKE_SESSION_STORAGE_KEY);
 } catch (error) {
 const failureMessage = sanitizeIntakeText(
 error?.message
 ? `I hit a problem while building the foundation plan: ${error.message}`
 : "I hit a problem while building the foundation plan. Please try again."
 );
 setConfirmBuildError(failureMessage);
 setPhase(INTAKE_UI_PHASES.goals);
 appendCoachMessage(failureMessage);
 } finally {
 confirmBuildLockRef.current = false;
 setConfirmBuildSubmitting(false);
 }
 };
 const submitGoalsStage = async () => {
 if (pendingGoalSelection?.goalText) {
 setGoalMetricFormError("Save or clear the selected goal before continuing.");
 return;
 }
 const stagedAnswers = syncGoalStackDraftToAnswers({
 primaryGoalText: answers?.goal_intent || "",
 additionalGoals: secondaryGoalEntries,
 });
 let nextMetricAnswers = {
 ...stagedAnswers,
 coaching_style: stagedAnswers?.coaching_style || "Balanced coaching",
 };
 const aggregatedFieldErrors = {};
 let starterMetricFormError = "";
intakeGoalSelections.forEach((selection) => {
const metricOutcome = applyIntakeStarterMetrics({
answers: nextMetricAnswers,
goalTypeId: selection?.familyId || selection?.templateCategoryId || selectedStarterGoalTypeId,
selection,
values: goalMetricValues,
requireAll: false,
});
if (!metricOutcome.isValid) {
Object.assign(aggregatedFieldErrors, metricOutcome.fieldErrors || {});
starterMetricFormError = starterMetricFormError || metricOutcome.formErrors?.[0] || "";
 return;
 }
 nextMetricAnswers = metricOutcome.answers;
 });
 if (Object.keys(aggregatedFieldErrors).length > 0) {
 setGoalMetricFieldErrors(aggregatedFieldErrors);
 setGoalMetricFormError(starterMetricFormError || "Tighten up the highlighted field before continuing.");
 onTrackFrictionEvent({
 flow: "intake",
 action: "continue",
 outcome: "blocked",
 props: {
 phase: INTAKE_UI_PHASES.goals,
 stage: intakeMachineRef.current?.stage || intakeMachine?.stage || "",
 reason: "starter_metric_validation",
 },
 });
 return;
}
const nextAnswers = {
...nextMetricAnswers,
coaching_style: nextMetricAnswers?.coaching_style || "Balanced coaching",
goal_lock_confirmed: true,
};
setAnswers(nextAnswers);
setGoalMetricFieldErrors({});
setGoalMetricFormError("");
 if (!String(nextAnswers?.goal_intent || "").trim() && !(nextAnswers?.additional_goals_list || []).length) {
 onTrackFrictionEvent({
 flow: "intake",
 action: "continue",
 outcome: "blocked",
 props: {
 phase: INTAKE_UI_PHASES.goals,
 stage: intakeMachineRef.current?.stage || intakeMachine?.stage || "",
 reason: "missing_goal_selection",
 },
 });
 return;
}
setAskedClarifyingQuestions([]);
setPendingClarifyingQuestion(null);
setPendingSecondaryGoalPrompt(null);
await runAssessment({ updatedAnswers: nextAnswers, askedQuestions: [] });
await finalizePlan();
};
 const continueFromInterpretation = () => {
 if (assessing) return;
 const activeStage = intakeMachineRef.current?.stage || intakeMachine?.stage || "";
 if (activeStage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION) {
 setPhase(INTAKE_UI_PHASES.clarify);
 return;
 }
 setPhase(INTAKE_UI_PHASES.clarify);
 };
 const reopenLastAnsweredDetail = () => {
 if (!Array.isArray(intakeMachine?.anchorBindingLog) || intakeMachine.anchorBindingLog.length === 0) {
 setPhase(INTAKE_UI_PHASES.goals);
 return;
 }
 const nextMachineState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.USER_BACK, {
 edit_last_anchor: true,
 now: new Date().toISOString(),
 });
 syncMachineDraftToIntakeView(nextMachineState);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 setDraft("");
 setPhase(nextMachineState?.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION
 ? INTAKE_UI_PHASES.clarify
 : INTAKE_UI_PHASES.clarify);
 };
 const appendUserMessage = (text) => {
 const clean = String(text || "").trim();
 if (!clean) return;
 const id = nextMessageIdRef.current++;
 setMessages((prev) => [...prev, { id, role: "user", text: clean, displayedText: clean }]);
 };
 useEffect(() => {
 const pendingMessages = (Array.isArray(intakeMachine?.outbox) ? intakeMachine.outbox : [])
 .filter((message) => {
 const messageKey = message?.message_key || message?.idempotency_key || message?.key;
 return messageKey && !processedIntakeMessageKeysRef.current.has(messageKey);
 });
 if (pendingMessages.length === 0) return;
 pendingMessages.forEach((message) => {
 const messageKey = message?.message_key || message?.idempotency_key || message?.key;
 if (messageKey) processedIntakeMessageKeysRef.current.add(messageKey);
 });
 appendCoachMessages(pendingMessages.map((message) => ({
 text: message.text,
 message_key: message.message_key || message.idempotency_key || message.key,
 key: message.message_key || message.idempotency_key || message.key,
 idempotency_key: message.message_key || message.idempotency_key || message.key,
 transition_id: message.transition_id,
 stage: message.stage,
 anchor_id: message.anchor_id,
 message_kind: message.message_kind,
 intent: message.intent,
 packet_version: message.packet_version,
 })));
 }, [intakeMachine?.outbox]);
 const updateClarificationValue = (fieldKey, value) => {
 const rootFieldKey = String(fieldKey || "").split("__")[0] || String(fieldKey || "");
 setClarificationValues((prev) => ({
 ...prev,
 [fieldKey]: value,
 }));
 setClarificationFieldErrors((prev) => {
 if (!prev?.[fieldKey] && !prev?.[rootFieldKey]) return prev;
 const next = { ...(prev || {}) };
 delete next[fieldKey];
 delete next[rootFieldKey];
 return next;
 });
 if (clarificationFormError) setClarificationFormError("");
 };
 const hydrateClarificationValuesFromAiCandidate = (anchor, candidate) => {
 if (!anchor?.field_id || !candidate) return;
 const fieldId = anchor.field_id;
 const nextValues = {};
 if (anchor.input_type === "choice_chips") {
 nextValues[fieldId] = String(candidate?.answer_value?.value || candidate?.raw_text || "").trim();
 } else if (anchor.input_type === "date_or_month") {
 nextValues[fieldId] = String(candidate?.answer_value?.value || "").trim();
 nextValues[`${fieldId}__mode`] = String(candidate?.answer_value?.mode || "month").trim().toLowerCase() || "month";
 } else if (anchor.input_type === "number_with_unit") {
 nextValues[fieldId] = String(candidate?.answer_value?.value ?? "").trim();
 nextValues[`${fieldId}__unit`] = String(candidate?.answer_value?.unit || anchor?.unit || anchor?.unit_options?.[0]?.value || "").trim();
 } else {
 nextValues[fieldId] = String(candidate?.answer_value?.raw || candidate?.raw_text || candidate?.capturePreviewText || "").trim();
 }
 setClarificationValues((prev) => ({
 ...prev,
 ...nextValues,
 }));
 };
 const formatMonthInputLabel = (value = "") => {
 const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
 if (!match) return String(value || "").trim();
 const [, year, month] = match;
 const monthIndex = Math.max(0, Math.min(11, Number(month) - 1));
 const monthLabel = [
 "January", "February", "March", "April", "May", "June",
 "July", "August", "September", "October", "November", "December",
 ][monthIndex] || month;
 return `${monthLabel} ${year}`;
 };
 const buildAnchorSubmissionPayload = (anchor = null) => {
 if (!anchor?.field_id) return null;
 const fieldId = anchor.field_id;
 const rawValue = clarificationValues?.[fieldId];
 if (anchor.input_type === "choice_chips") {
 const selectedValue = String(rawValue || "").trim();
 const selectedOption = (Array.isArray(anchor.options) ? anchor.options : []).find((option) => option?.value === selectedValue) || null;
 if (!selectedValue) return null;
 return {
 answer_value: {
 value: selectedValue,
 raw: selectedOption?.label || selectedValue,
 },
 raw_text: selectedOption?.label || selectedValue,
 };
 }
 if (anchor.input_type === "date_or_month") {
 const modeKey = `${fieldId}__mode`;
 const mode = String(clarificationValues?.[modeKey] || "month").trim().toLowerCase() || "month";
 if (mode === OPEN_ENDED_TIMING_VALUE) {
 return {
 answer_value: {
 mode,
 value: OPEN_ENDED_TIMING_VALUE,
 raw: "Open-ended",
 },
 raw_text: "Open-ended",
 };
 }
 const selectedValue = String(rawValue || "").trim();
 if (!selectedValue) return null;
 const displayValue = mode === "month" ? formatMonthInputLabel(selectedValue) : selectedValue;
 return {
 answer_value: {
 mode,
 value: selectedValue,
 raw: displayValue,
 },
 raw_text: displayValue,
 };
 }
 if (anchor.input_type === "number_with_unit") {
 const unitKey = `${fieldId}__unit`;
 const numericValue = String(rawValue || "").trim();
 const selectedUnit = String(
 clarificationValues?.[unitKey]
 || anchor?.unit
 || (Array.isArray(anchor?.unit_options) ? anchor.unit_options[0]?.value : "")
 || ""
 ).trim();
 if (!numericValue) return null;
 return {
 answer_value: {
 value: numericValue,
 unit: selectedUnit,
 raw: selectedUnit ? `${numericValue} ${selectedUnit}` : numericValue,
 },
 raw_text: selectedUnit ? `${numericValue} ${selectedUnit}` : numericValue,
 };
 }
 if (anchor.input_type === "strength_top_set") {
 const modeKey = `${fieldId}__mode`;
 const weightKey = `${fieldId}__weight`;
 const repsKey = `${fieldId}__reps`;
 const selectedMode = String(clarificationValues?.[modeKey] || "top_set").trim().toLowerCase() || "top_set";
 const weightValue = String(clarificationValues?.[weightKey] || "").trim();
 const repsValue = String(clarificationValues?.[repsKey] || "").trim();
 if (!weightValue) return null;
 if (selectedMode === "top_set" && !repsValue) return null;
 const rawText = selectedMode === "estimated_max"
 ? `${weightValue} estimated max`
 : `${weightValue}x${repsValue}`;
 return {
 answer_value: {
 mode: selectedMode,
 weight: weightValue,
 reps: selectedMode === "top_set" ? repsValue : "",
 raw: rawText,
 value: weightValue,
 },
 raw_text: rawText,
 };
 }
 const cleanValue = String(rawValue || "").trim();
 if (!cleanValue) return null;
 return {
 answer_value: cleanValue,
 raw_text: cleanValue,
 };
 };
 const buildNaturalAnchorExtractionContext = () => ({
 safeFetchWithTimeout,
 typedIntakePacket: intakeMachineRef.current?.draft?.typedIntakePacket || assessmentBoundary?.typedIntakePacket || null,
 answers: intakeMachineRef.current?.draft?.answers || answers,
 });
 const resolvePostAssessmentPhase = (machineState = null) => (
 machineState?.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION
 ? INTAKE_UI_PHASES.clarify
 : INTAKE_UI_PHASES.clarify
 );
 const finalizeAssessmentState = ({
 assessment = null,
 updatedAnswers = {},
 askedQuestions = [],
 } = {}) => {
 setConfirmBuildError("");
 const cleanTimeline = sanitizeIntakeText(assessment?.text || "");
 const interpretedMachineState = settleIntakeMachine(dispatchIntakeMachineEvent(
 INTAKE_MACHINE_EVENTS.INTERPRETATION_READY,
 {
 assessment,
 answers: updatedAnswers,
 goalStackConfirmation,
 now: new Date().toISOString(),
 }
 ));
 syncMachineDraftToIntakeView(interpretedMachineState);
 const reviewModelForAssessment = interpretedMachineState?.draft?.reviewModel || buildIntakeGoalReviewModel({
 goalResolution: assessment?.goalResolution || null,
 orderedResolvedGoals: assessment?.orderedResolvedGoals || [],
 goalFeasibility: assessment?.goalFeasibility || null,
 arbitration: interpretedMachineState?.draft?.arbitration || assessmentPreview?.arbitration || null,
 aiInterpretationProposal: assessment?.aiInterpretationProposal || null,
 answers: updatedAnswers,
 goalStackConfirmation,
 });
 void reviewModelForAssessment;
 setAssessmentText(cleanTimeline);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setPhase(resolvePostAssessmentPhase(interpretedMachineState));
 };
 const runAssessment = async ({
 updatedAnswers = {},
 askedQuestions = [],
 } = {}) => {
 setAssessing(true);
 const requestId = latestAssessmentRequestIdRef.current + 1;
 latestAssessmentRequestIdRef.current = requestId;
 const goalSubmitState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.GOALS_SUBMITTED, {
 answers: updatedAnswers,
 askedQuestions,
 now: new Date().toISOString(),
 });
 const requestedTransitionId = goalSubmitState?.transition_id || intakeMachineRef.current?.transition_id || "";
 try {
 const assessment = await buildTypedIntakeAssessment({ answers: updatedAnswers, existingMemory });
 const activeTransitionId = intakeMachineRef.current?.transition_id || "";
 if (latestAssessmentRequestIdRef.current !== requestId) return;
 if (requestedTransitionId && activeTransitionId && requestedTransitionId !== activeTransitionId) return;
 finalizeAssessmentState({
 assessment,
 updatedAnswers,
 askedQuestions,
 });
 } finally {
 if (latestAssessmentRequestIdRef.current === requestId) {
 setAssessing(false);
 }
 }
 };
 const advanceConversation = async (updatedAnswers) => {
 const nextIndex = stepIndex + 1;
 setAnswers(updatedAnswers);
 setDraft("");
 const nextFlow = buildFlow(updatedAnswers);
 if (nextIndex < nextFlow.length) {
 setStepIndex(nextIndex);
 appendCoachMessage(nextFlow[nextIndex].message);
 return;
 }
 setAskedClarifyingQuestions([]);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 await runAssessment({ updatedAnswers, askedQuestions: [] });
 };
 const submitCurrentAnswer = async (value, explicitKey = currentPrompt?.key) => {
 const clean = String(value || "").trim();
 if (!explicitKey) return;
 if (!clean && currentPrompt?.type === "text") return;
 appendUserMessage(clean);
 const storedValue = currentPrompt?.valueMap?.[clean] ?? clean;
 await advanceConversation({ ...answers, [explicitKey]: storedValue });
 };
 const submitFoundationStart = async () => {
appendUserMessage("Quick start plan");
 await advanceConversation({
 ...answers,
 goal_intent: "",
 primary_goal: "general_fitness",
 });
 };
 const submitEquipmentAnswer = async () => {
 const equipmentResponse = normalizeHomeEquipmentResponse({
 selection: equipmentSelection,
 otherText: equipmentOther,
 });
 if (equipmentResponse.normalized.length === 0 && !equipmentResponse.otherText) return;
 appendUserMessage(equipmentResponse.display);
 await advanceConversation({
 ...answers,
 home_equipment: equipmentResponse.normalized,
 home_equipment_other: equipmentResponse.otherText,
 });
 };
 const requestAdjustment = ({ goalSummary = "", goalId = "" } = {}) => {
 const cleanGoalSummary = sanitizeIntakeText(goalSummary || "");
 setConfirmBuildError("");
 setAdjustmentTargetGoal(cleanGoalSummary ? { id: goalId || "", summary: cleanGoalSummary } : null);
 resetIntakeForGoalEdit(answers);
 appendUserMessage(cleanGoalSummary ? `Revise goal: ${cleanGoalSummary}` : "Revise goal");
 setPhase(INTAKE_UI_PHASES.adjust);
 setDraft("");
 appendCoachMessage(
 cleanGoalSummary
 ? `Describe the change for "${cleanGoalSummary}".`
 : "Describe the change."
 );
 };
 const submitAdjustment = async () => {
 const clean = String(draft || "").trim();
 if (!clean) return;
 setConfirmBuildError("");
 setAdjustmentTargetGoal(null);
 appendUserMessage(clean);
 setDraft("");
 const adjustmentOutcome = applyIntakeGoalAdjustment({
 answers,
 adjustmentText: clean,
 currentResolvedGoal: assessmentPreview?.orderedResolvedGoals?.[0] || null,
 currentPrimaryGoalKey: answers.primary_goal || "",
 now: new Date(),
 });
 const updatedAnswers = adjustmentOutcome.answers;
 setAskedClarifyingQuestions([]);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 await runAssessment({ updatedAnswers, askedQuestions: [] });
 };
 const submitClarification = async () => {
 if (!activeMachineAnchor?.field_id && !pendingClarifyingQuestion?.prompt) return;
 setConfirmBuildError("");
 if (activeMachineAnchor?.field_id) {
 const activeBindingTarget = (
 currentAnchorBindingTarget?.anchor_id
 && currentAnchorBindingTarget?.field_id
 )
 ? currentAnchorBindingTarget
 : null;
 if (!activeBindingTarget && !multiAnchorCollectionMode) {
 setClarificationFormError("The current anchor lost its binding target. Please try the active card again.");
 return;
 }
 if (multiAnchorCollectionMode) {
 const visibleAnchors = visibleMachineAnchorCards.filter((anchor) => anchor?.field_id);
 const fieldErrors = {};
 const answeredLines = [];
 visibleAnchors.forEach((anchor) => {
 const submissionPayload = buildAnchorSubmissionPayload(anchor);
 if (!submissionPayload?.raw_text) {
 fieldErrors[anchor.field_id] = anchor?.validation?.message || "Add this detail before continuing.";
 }
 });
 if (Object.keys(fieldErrors).length > 0) {
 setClarificationFieldErrors(fieldErrors);
 setClarificationFormError("Add the remaining highlighted details before continuing.");
 return;
 }
 let latestMachineState = intakeMachineRef.current;
 for (const anchor of visibleAnchors) {
 const submissionPayload = buildAnchorSubmissionPayload(anchor);
 const bindingTarget = {
 anchor_id: String(anchor?.anchor_id || "").trim(),
 field_id: String(anchor?.field_id || "").trim(),
 };
 latestMachineState = settleIntakeMachine(dispatchIntakeMachineEvent(
 INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
 {
 anchor,
 binding_target: bindingTarget,
 anchor_id: bindingTarget.anchor_id,
 field_id: bindingTarget.field_id,
 answer_value: submissionPayload.answer_value,
 raw_text: submissionPayload.raw_text,
 source: "user",
 now: new Date().toISOString(),
 }
 ));
 if (latestMachineState?.ui?.lastParseError) {
 setClarificationFieldErrors({ [anchor.field_id]: latestMachineState.ui.lastParseError });
 setClarificationFormError(latestMachineState.ui.lastParseError);
 return;
 }
 answeredLines.push(`${anchor.label || anchor.question || anchor.field_id}: ${submissionPayload.raw_text}`);
 }
 if (answeredLines.length > 0) {
 appendUserMessage(answeredLines.join(" | "));
 }
 syncMachineDraftToIntakeView(latestMachineState);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 setPendingClarifyingQuestion(null);
 const refreshedState = refreshReviewMachineState({
 nextAnswers: latestMachineState?.draft?.answers || answers,
 });
 routeFromRefreshedReviewState({
 refreshedState,
 answersOverride: refreshedState?.draft?.answers || latestMachineState?.draft?.answers || answers,
 });
 return;
 }
 const naturalReply = anchorEntryMode === "natural" && !activeAnchorStrictMode
 ? String(naturalAnchorDraft || "").trim()
 : "";
 if (naturalReply) {
 appendUserMessage(naturalReply);
 setNaturalAnchorSubmitting(true);
 setAnchorCapturePreview(null);
 setClarificationFieldErrors({});
 setClarificationFormError("");
 const extraction = await aiExtractForMissingFields({
 utterance: naturalReply,
 missing_fields: [activeMachineAnchor],
 context: buildNaturalAnchorExtractionContext(),
 });
 setNaturalAnchorSubmitting(false);
 if (extraction?.status === "ready_to_persist" && extraction?.validatedCandidates?.[0]) {
 const extractedCandidate = extraction.validatedCandidates[0];
 const nextMachineState = settleIntakeMachine(dispatchIntakeMachineEvent(
 INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
 {
 anchor: activeMachineAnchor,
 binding_target: activeBindingTarget,
 anchor_id: activeBindingTarget.anchor_id,
 field_id: activeBindingTarget.field_id,
 answer_value: extractedCandidate.answer_value,
 raw_text: extractedCandidate.raw_text,
 source: "user",
 capture_label: `Here's what I captured: ${extractedCandidate.capturePreviewText}.`,
 now: new Date().toISOString(),
 }
 ));
 if (nextMachineState?.ui?.lastParseError) {
 setClarificationFieldErrors({ [activeMachineAnchor.field_id]: nextMachineState.ui.lastParseError });
 setClarificationFormError(nextMachineState.ui.lastParseError);
 setAnchorCapturePreview({
 field_id: activeMachineAnchor.field_id,
 captureText: extractedCandidate.capturePreviewText,
 question: "",
 evidenceSpans: extractedCandidate.evidence_spans || [],
 });
 return;
 }
 syncMachineDraftToIntakeView(nextMachineState);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 setPendingClarifyingQuestion(null);
 if (nextMachineState?.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION) {
 setPendingSecondaryGoalPrompt(null);
 setPhase(INTAKE_UI_PHASES.clarify);
 return;
 }
 const refreshedState = refreshReviewMachineState({
 nextAnswers: nextMachineState?.draft?.answers || answers,
 });
 routeFromRefreshedReviewState({
 refreshedState,
 answersOverride: refreshedState?.draft?.answers || nextMachineState?.draft?.answers || answers,
 });
 return;
 }

 if (extraction?.status === "needs_clarification" && extraction?.validatedCandidates?.[0]) {
 const extractedCandidate = extraction.validatedCandidates[0];
 hydrateClarificationValuesFromAiCandidate(activeMachineAnchor, extractedCandidate);
 setNaturalAnchorDraft("");
 setAnchorCapturePreview({
 field_id: activeMachineAnchor.field_id,
 captureText: extractedCandidate.capturePreviewText,
 question: extractedCandidate.clarifyingQuestion || extraction.userFacingError,
 evidenceSpans: extractedCandidate.evidence_spans || [],
 });
 const failedState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.ANCHOR_PARSE_FAILED, {
 field_id: activeMachineAnchor.field_id,
 formError: extractedCandidate.clarifyingQuestion || extraction.userFacingError || "Can you confirm that before I save it?",
 now: new Date().toISOString(),
 });
 setClarificationFieldErrors({});
 setClarificationFormError(failedState?.ui?.lastParseError || extractedCandidate.clarifyingQuestion || extraction.userFacingError || "Can you confirm that before I save it?");
 return;
 }

 if (extraction?.status === "runtime_failed" || extraction?.status === "no_response") {
 setAnchorEntryMode("structured");
 setAnchorCapturePreview(null);
 setClarificationFieldErrors({});
 setClarificationFormError("Natural capture is unavailable right now. Use the guided field above instead.");
 return;
 }

 const failedState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.ANCHOR_PARSE_FAILED, {
 field_id: activeMachineAnchor.field_id,
 formError: extraction?.userFacingError || "I couldn't confidently bind that to the current field.",
 now: new Date().toISOString(),
 });
 setAnchorCapturePreview(null);
 setClarificationFieldErrors({});
 setClarificationFormError(failedState?.ui?.lastParseError || extraction?.userFacingError || "I couldn't confidently bind that to the current field.");
 return;
 }

 const submissionPayload = buildAnchorSubmissionPayload(activeMachineAnchor);
 if (!submissionPayload?.raw_text) return;
 const nextMachineState = settleIntakeMachine(dispatchIntakeMachineEvent(
 INTAKE_MACHINE_EVENTS.ANCHOR_ANSWERED,
 {
 anchor: activeMachineAnchor,
 binding_target: activeBindingTarget,
 anchor_id: activeBindingTarget.anchor_id,
 field_id: activeBindingTarget.field_id,
 answer_value: submissionPayload.answer_value,
 raw_text: submissionPayload.raw_text,
 source: "user",
 now: new Date().toISOString(),
 }
 ));
 appendUserMessage(submissionPayload.raw_text);
 if (nextMachineState?.ui?.lastParseError) {
 setClarificationFieldErrors({ [activeMachineAnchor.field_id]: nextMachineState.ui.lastParseError });
 setClarificationFormError(nextMachineState.ui.lastParseError);
 return;
 }
 syncMachineDraftToIntakeView(nextMachineState);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 setPendingClarifyingQuestion(null);
 if (nextMachineState?.stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION) {
 setPendingSecondaryGoalPrompt(null);
 setPhase(INTAKE_UI_PHASES.clarify);
 return;
 }
 const refreshedState = refreshReviewMachineState({
 nextAnswers: nextMachineState?.draft?.answers || answers,
 });
 routeFromRefreshedReviewState({
 refreshedState,
 answersOverride: refreshedState?.draft?.answers || nextMachineState?.draft?.answers || answers,
 });
 return;
 }
 const questionSource = String(pendingClarifyingQuestion?.source || "").trim().toLowerCase();
 const currentResolvedGoals = Array.isArray(assessmentPreview?.orderedResolvedGoals) ? assessmentPreview.orderedResolvedGoals : [];

 if (questionSource === "completeness") {
 if (isStructuredIntakeCompletenessQuestion(pendingClarifyingQuestion)) {
 const validation = validateIntakeCompletenessAnswer({
 question: pendingClarifyingQuestion,
 answerValues: clarificationValues,
 });
 if (!validation.isValid) {
 setClarificationFieldErrors(validation.fieldErrors || {});
 setClarificationFormError(validation.formError || pendingClarifyingQuestion?.validation?.message || "Add the detail I asked for before continuing.");
 return;
 }
 const transcriptSummary = validation.summaryText || pendingClarifyingQuestion.prompt;
 appendUserMessage(transcriptSummary);
 const structuredAnswer = applyIntakeCompletenessAnswer({
 answers,
 question: pendingClarifyingQuestion,
 answerValues: clarificationValues,
 });
 const timelineFieldStored = structuredAnswer.storedFieldKeys.includes("target_timeline");
 const updatedAnswers = {
 ...structuredAnswer.answers,
 timeline_feedback: pendingClarifyingQuestion?.affectsTimeline && timelineFieldStored
 ? transcriptSummary
 : (structuredAnswer.answers.timeline_feedback || ""),
 };
 const completenessAfterAnswer = deriveIntakeCompletenessState({
 resolvedGoals: currentResolvedGoals,
 answers: updatedAnswers,
 });
 const currentQuestionStillMissing = completenessAfterAnswer.missingRequired.some(
 (item) => item?.key === pendingClarifyingQuestion?.key
 );

 if (!currentQuestionStillMissing) {
 const nextAskedQuestions = [...askedClarifyingQuestions, pendingClarifyingQuestion.key || pendingClarifyingQuestion.prompt];
 setAskedClarifyingQuestions(nextAskedQuestions);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 await runAssessment({ updatedAnswers, askedQuestions: nextAskedQuestions });
 return;
 }

 setClarificationFieldErrors({});
 setClarificationFormError("I still need one more piece of this answer before I can move on.");
 return;
 }

 const clean = String(draft || "").trim();
 if (!clean) return;
 appendUserMessage(clean);
 setDraft("");
 const structuredAnswer = applyIntakeCompletenessAnswer({
 answers,
 question: pendingClarifyingQuestion,
 answerText: clean,
 });
 const timelineFieldStored = structuredAnswer.storedFieldKeys.includes("target_timeline");
 const updatedAnswers = {
 ...structuredAnswer.answers,
 timeline_feedback: pendingClarifyingQuestion?.affectsTimeline && timelineFieldStored
 ? clean
 : (structuredAnswer.answers.timeline_feedback || ""),
 };
 const completenessAfterAnswer = deriveIntakeCompletenessState({
 resolvedGoals: currentResolvedGoals,
 answers: updatedAnswers,
 });
 const currentQuestionStillMissing = completenessAfterAnswer.missingRequired.some(
 (item) => item?.key === pendingClarifyingQuestion?.key
 );

 if (!currentQuestionStillMissing) {
 const nextAskedQuestions = [...askedClarifyingQuestions, pendingClarifyingQuestion.key || pendingClarifyingQuestion.prompt];
 setAskedClarifyingQuestions(nextAskedQuestions);
 await runAssessment({ updatedAnswers, askedQuestions: nextAskedQuestions });
 return;
 }

 const adjustmentOutcome = applyIntakeGoalAdjustment({
 answers,
 adjustmentText: clean,
 currentResolvedGoal: currentResolvedGoals[0] || null,
 currentPrimaryGoalKey: answers.primary_goal || "",
 now: new Date(),
 allowImplicitGoalReplacement: false,
 });
 if (adjustmentOutcome.kind === "goal_replacement") {
 resetIntakeForGoalEdit(adjustmentOutcome.answers);
 await runAssessment({ updatedAnswers: adjustmentOutcome.answers, askedQuestions: [] });
 return;
 }

 await runAssessment({ updatedAnswers, askedQuestions: askedClarifyingQuestions });
 return;
 }

 const clean = String(draft || "").trim();
 if (!clean) return;
 appendUserMessage(clean);
 setDraft("");
 const adjustmentOutcome = applyIntakeGoalAdjustment({
 answers,
 adjustmentText: clean,
 currentResolvedGoal: currentResolvedGoals[0] || null,
 currentPrimaryGoalKey: answers.primary_goal || "",
 now: new Date(),
 allowImplicitGoalReplacement: true,
 });
 if (adjustmentOutcome.kind === "goal_replacement") {
 resetIntakeForGoalEdit(adjustmentOutcome.answers);
 await runAssessment({ updatedAnswers: adjustmentOutcome.answers, askedQuestions: [] });
 return;
 }
 const structuredAnswer = applyIntakeCompletenessAnswer({
 answers,
 question: pendingClarifyingQuestion,
 answerText: clean,
 });
 const nextAskedQuestions = [...askedClarifyingQuestions, pendingClarifyingQuestion.key || pendingClarifyingQuestion.prompt];
 const updatedAnswers = {
 ...structuredAnswer.answers,
 goal_clarification_notes: [
 ...(Array.isArray(structuredAnswer.answers.goal_clarification_notes) ? structuredAnswer.answers.goal_clarification_notes : []),
 {
 question: pendingClarifyingQuestion.prompt,
 answer: clean,
 source: pendingClarifyingQuestion?.source || "review",
 questionKey: pendingClarifyingQuestion?.key || "",
 fieldKeys: Array.isArray(pendingClarifyingQuestion?.fieldKeys) ? pendingClarifyingQuestion.fieldKeys : [],
 },
 ],
 timeline_feedback: pendingClarifyingQuestion?.affectsTimeline ? clean : (structuredAnswer.answers.timeline_feedback || ""),
 };
 setAskedClarifyingQuestions(nextAskedQuestions);
 await runAssessment({ updatedAnswers, askedQuestions: nextAskedQuestions });
 };
 const editLastAnchorAnswer = () => {
 if (!activeMachineAnchor?.field_id || !Array.isArray(intakeMachine?.anchorBindingLog) || intakeMachine.anchorBindingLog.length === 0) return;
 setConfirmBuildError("");
 const nextMachineState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.USER_BACK, {
 edit_last_anchor: true,
 now: new Date().toISOString(),
 });
 syncMachineDraftToIntakeView(nextMachineState);
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setClarificationValues({});
 setClarificationFieldErrors({});
 setClarificationFormError("");
 setNaturalAnchorDraft("");
 setAnchorCapturePreview(null);
 setDraft("");
 setPhase(INTAKE_UI_PHASES.clarify);
 };
 const submitSecondaryGoalResponse = async (response = null) => {
 const customText = String(draft || "").trim();
 const responseKey = String(response?.key || "").trim();
 const isCustomEntryResponse = responseKey === SECONDARY_GOAL_RESPONSE_KEYS.addGoal || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.custom;
 const isPresetEntryResponse = responseKey === SECONDARY_GOAL_RESPONSE_KEYS.maintainStrength || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.maintainMobility;
 const isSkipResponse = responseKey === SECONDARY_GOAL_RESPONSE_KEYS.skip || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.primaryOnly;
 const isDoneResponse = responseKey === SECONDARY_GOAL_RESPONSE_KEYS.done || responseKey === SECONDARY_GOAL_RESPONSE_KEYS.keepInferred;
 if (!responseKey) return;
 if (isCustomEntryResponse && !customText) return;
 setConfirmBuildError("");
 const stagedEntries = isCustomEntryResponse
 ? Array.from(new Set([...secondaryGoalEntries, customText.trim()])).filter(Boolean)
 : secondaryGoalEntries;
 if (isSkipResponse) {
 appendUserMessage("Skip");
 } else if (isDoneResponse) {
 appendUserMessage(stagedEntries.length ? `Also: ${stagedEntries.join("; ")}` : "No extra goals");
 }
 const outcome = applyIntakeSecondaryGoalResponse({
 answers: {
 ...answers,
 additional_goals_list: secondaryGoalEntries,
 other_goals: secondaryGoalEntries.join(". "),
 },
 response,
 customText,
 resolvedGoals: reviewGoals,
 goalStackConfirmation,
 goalFeasibility: assessmentPreview?.goalFeasibility || null,
 });
 setAnswers(outcome.answers);
 setSecondaryGoalEntries(readAdditionalGoalEntries({ answers: outcome.answers }));
 if (responseKey === SECONDARY_GOAL_RESPONSE_KEYS.addGoal && outcome.keepCollecting) {
 setDraft("");
 const goalMessageKey = String(customText || "").trim().toLowerCase();
 if (goalMessageKey && !secondaryGoalAddedMessageKeysRef.current.has(goalMessageKey)) {
 const addedTranscriptMessageKey = `goal_added:${goalMessageKey}`;
 secondaryGoalAddedMessageKeysRef.current.add(goalMessageKey);
 processedIntakeMessageKeysRef.current.add(addedTranscriptMessageKey);
 appendCoachMessage({
 text: `Added ${customText.trim()}. Add another goal or continue.`,
 message_key: addedTranscriptMessageKey,
 idempotency_key: addedTranscriptMessageKey,
 message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
 transition_id: intakeMachineRef.current?.transition_id || "",
 stage: intakeMachineRef.current?.stage || "",
 });
 }
 return;
 }
 if ((responseKey === SECONDARY_GOAL_RESPONSE_KEYS.custom || isPresetEntryResponse) && outcome.keepCollecting) {
 setDraft("");
 if (responseKey !== SECONDARY_GOAL_RESPONSE_KEYS.custom) {
 setShowSecondaryGoalCustomInput(false);
 }
 return;
 }
 setDraft("");
 setShowSecondaryGoalCustomInput(false);
 setPendingSecondaryGoalPrompt(null);
 setPendingClarifyingQuestion(null);
 if (!outcome.rerunAssessment) {
 setGoalStackConfirmation(outcome.goalStackConfirmation);
 setPhase(INTAKE_UI_PHASES.clarify);
 appendCoachMessage(
 isSkipResponse
 ? "Main goal kept as the focus."
 : stagedEntries.length
 ? "Extra goals added to the review draft."
 : "Review draft stays centered on the main goal."
 );
 return;
 }
 setGoalStackConfirmation(outcome.goalStackConfirmation);
 setAskedClarifyingQuestions([]);
 await runAssessment({ updatedAnswers: outcome.answers, askedQuestions: [] });
 };
 const handleSecondaryGoalQuickOption = async (option = null) => {
 if (!option?.key) return;
 if (option.key === SECONDARY_GOAL_RESPONSE_KEYS.custom) {
 if (showSecondaryGoalCustomInput) {
 setDraft("");
 }
 setShowSecondaryGoalCustomInput((prev) => !prev);
 return;
 }
 await submitSecondaryGoalResponse(option);
 };
 const jumpToNextRequiredDetail = () => {
 setConfirmBuildError("");
 const refreshedState = refreshReviewMachineState();
 const refreshedConfirmation = refreshedState?.draft?.confirmationState || activeConfirmationState || null;
 const nextAnchor = refreshedState?.draft?.missingAnchorsEngine?.currentAnchor || null;
 if (nextAnchor?.field_id) {
 setPendingClarifyingQuestion(null);
 setPendingSecondaryGoalPrompt(null);
 setPhase(INTAKE_UI_PHASES.clarify);
 return;
 }
 if (refreshedConfirmation?.reason) {
 setConfirmBuildError(refreshedConfirmation.reason);
 }
 };
 const finalizePlan = async () => {
 if (confirmBuildSubmitting || confirmBuildLockRef.current) return;
 setConfirmBuildError("");
 const refreshedState = refreshReviewMachineState();
 const latestConfirmationState = refreshedState?.draft?.confirmationState || activeConfirmationState || null;
 const latestAllowsProceed = latestConfirmationState?.status === "proceed" || latestConfirmationState?.status === "warn";
 const latestCanConfirm = Boolean(latestConfirmationState?.canConfirm);
 if ((!latestAllowsProceed || !latestCanConfirm) && latestConfirmationState?.next_required_field) {
 onTrackFrictionEvent({
 flow: "intake",
 action: "plan_build",
 outcome: "blocked",
 props: {
 phase,
 stage: intakeMachineRef.current?.stage || intakeMachine?.stage || "",
 reason: latestConfirmationState?.next_required_field || "missing_required_field",
 },
 });
 jumpToNextRequiredDetail();
 return;
 }
 if (!latestAllowsProceed || !latestCanConfirm) {
 const blockedReason = latestConfirmationState?.reason || "I still need a little more grounded context before I can build your plan.";
 const blockedTopic = `confirm_blocked_${String(latestConfirmationState?.next_required_field || latestConfirmationState?.status || "generic").replace(/\W+/g, "_").toLowerCase() || "generic"}`;
 const blockedMessageKey = `review_note:${blockedTopic}`;
 const currentTransitionId = intakeMachineRef.current?.transition_id || refreshedState?.transition_id || "";
 const currentStage = intakeMachineRef.current?.stage || refreshedState?.stage || INTAKE_MACHINE_STATES.REVIEW_CONFIRM;
 setConfirmBuildError(blockedReason);
 setPhase(INTAKE_UI_PHASES.clarify);
 appendCoachMessage({
 text: blockedReason,
 message_kind: TRANSCRIPT_MESSAGE_KINDS.systemNote,
 transition_id: currentTransitionId,
 stage: currentStage,
 message_key: blockedMessageKey,
 idempotency_key: blockedMessageKey,
 });
 onTrackFrictionEvent({
 flow: "intake",
 action: "plan_build",
 outcome: "blocked",
 props: {
 phase,
 stage: currentStage,
 reason: latestConfirmationState?.status || "confirmation_blocked",
 },
 });
 return;
 }
 confirmBuildLockRef.current = true;
 setConfirmBuildSubmitting(true);
 const confirmedState = dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.USER_CONFIRMED, {
 now: new Date().toISOString(),
 });
appendUserMessage("Create my plan");
 if (confirmedState?.draft?.commitRequested) {
 setPhase(INTAKE_UI_PHASES.building);
 return;
 }
 confirmBuildLockRef.current = false;
 setConfirmBuildSubmitting(false);
 setPhase(INTAKE_UI_PHASES.clarify);
 setConfirmBuildError(confirmedState?.ui?.clearReason || "I couldn't lock the confirmed priority order yet.");
 };
 useEffect(() => {
 const commitValidation = validateIntakeCommitRequest(intakeMachine?.draft?.commitRequest || null);
 if (!Boolean(intakeMachine?.draft?.commitRequested)) return;
 if (!commitValidation.ok || !commitValidation.commitRequest) {
 confirmBuildLockRef.current = false;
 setConfirmBuildSubmitting(false);
 setPhase(INTAKE_UI_PHASES.clarify);
 if (commitValidation.reason) setConfirmBuildError(commitValidation.reason);
 return;
 }
 const snapshotId = commitValidation.confirmation_snapshot_id;
 if (!snapshotId) return;
 if (committedCommitSnapshotIdsRef.current.has(snapshotId)) return;
 if (activeCommitSnapshotIdRef.current === snapshotId) return;
 activeCommitSnapshotIdRef.current = snapshotId;

 const runCommit = async () => {
 const payload = {
 ...answers,
 intake_commit: commitValidation.commitRequest,
 goal_stack_confirmation: commitValidation.commitRequest?.goalStackConfirmation || goalStackConfirmation,
 typedIntakePacket: commitValidation.commitRequest?.typedIntakePacket || assessmentBoundary?.typedIntakePacket || null,
 aiInterpretationProposal: commitValidation.commitRequest?.aiInterpretationProposal || null,
 timeline_assessment: assessmentText,
 confirmation_snapshot_id: snapshotId,
 starting_fresh: startingFresh,
 };
 try {
 if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
 window.dispatchEvent(new window.CustomEvent("trainer:intake-commit", {
 detail: {
 phase: "start",
 confirmationSnapshotId: snapshotId,
 },
 }));
 }
 onTrackFrictionEvent({
 flow: "intake",
 action: "plan_build",
 outcome: "requested",
 props: {
 confirmation_snapshot_id: snapshotId,
 phase: INTAKE_UI_PHASES.building,
 },
 });
 await new Promise((resolve) => setTimeout(resolve, 3200));
 await onComplete(payload);
 sessionPersistenceDisabledRef.current = true;
 safeStorageRemove(sessionStorage, INTAKE_SESSION_STORAGE_KEY);
 committedCommitSnapshotIdsRef.current.add(snapshotId);
 if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
 window.dispatchEvent(new window.CustomEvent("trainer:intake-commit", {
 detail: {
 phase: "success",
 confirmationSnapshotId: snapshotId,
 },
 }));
 }
 onTrackFrictionEvent({
 flow: "intake",
 action: "plan_build",
 outcome: "completed",
 props: {
 confirmation_snapshot_id: snapshotId,
 },
 });
 dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.COMMIT_COMPLETED, {
 confirmation_snapshot_id: snapshotId,
 now: new Date().toISOString(),
 });
 confirmBuildLockRef.current = false;
 setConfirmBuildSubmitting(false);
 } catch (error) {
 const failureMessage = sanitizeIntakeText(
 error?.message
 ? `I hit a problem while finishing onboarding: ${error.message}`
 : "I hit a problem while finishing onboarding. Please try again."
 );
 if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
 window.dispatchEvent(new window.CustomEvent("trainer:intake-commit", {
 detail: {
 phase: "failure",
 confirmationSnapshotId: snapshotId,
 message: failureMessage,
 },
 }));
 }
 onTrackFrictionEvent({
 flow: "intake",
 action: "plan_build",
 outcome: "error",
 props: {
 confirmation_snapshot_id: snapshotId,
 },
 });
 dispatchIntakeMachineEvent(INTAKE_MACHINE_EVENTS.COMMIT_FAILED, {
 confirmation_snapshot_id: snapshotId,
 error: failureMessage,
 now: new Date().toISOString(),
 });
 confirmBuildLockRef.current = false;
 setConfirmBuildError(failureMessage);
 setConfirmBuildSubmitting(false);
 setPhase(INTAKE_UI_PHASES.clarify);
 appendCoachMessage(failureMessage);
 } finally {
 if (activeCommitSnapshotIdRef.current === snapshotId) {
 activeCommitSnapshotIdRef.current = "";
 }
 }
 };

 runCommit();
 }, [
 answers,
 assessmentBoundary?.typedIntakePacket,
 assessmentText,
 goalStackConfirmation,
 intakeMachine?.draft?.commitRequest,
 intakeMachine?.draft?.commitRequested,
 onComplete,
 startingFresh,
 ]);
 const goalStackReview = buildIntakeGoalStackReviewModel({
 resolvedGoals: activeReviewGoals,
 goalResolution: activeGoalResolution,
 goalFeasibility: activeGoalFeasibility,
 goalStackConfirmation,
 });
 const goalReviewContract = goalStackReview?.reviewContract || activeReviewModel?.reviewContract || null;
 const orderedGoalStackItems = Array.isArray(goalStackReview?.orderedGoalStack?.items)
 ? goalStackReview.orderedGoalStack.items
 : Array.isArray(goalReviewContract?.ordered_goal_stack?.items)
 ? goalReviewContract.ordered_goal_stack.items
 : [];
 const heardGoalRows = useMemo(() => {
 const prioritizedGoals = [
 ...orderedGoalStackItems,
 ];
 const seenGoalIds = new Set();
 const rows = prioritizedGoals
 .filter((goal) => {
 const goalId = String(goal?.id || "").trim();
 const goalSummary = sanitizeIntakeText(goal?.summary || "");
 const dedupeKey = goalId || goalSummary.toLowerCase();
 if (!dedupeKey || seenGoalIds.has(dedupeKey)) return false;
 seenGoalIds.add(dedupeKey);
 return Boolean(goalSummary);
 })
 .map((goal, index) => ({
 id: String(goal?.id || `heard_goal_${index}`).trim(),
 summary: sanitizeIntakeText(goal?.summary || ""),
 detail: joinDisplayParts([
 sanitizeIntakeText(goal?.priorityLabel || buildVisibleGoalPriorityLabel(index)),
 sanitizeIntakeText(goal?.goalTypeLabel || "Goal"),
 ]),
 }));
 const canRemove = rows.length > 1;
 return rows.map((row) => ({
 ...row,
 canRemove,
 }));
 }, [orderedGoalStackItems]);
const displayedPrimaryGoal = goalReviewContract?.lead_goal || goalStackReview?.activeGoals?.[0] || null;
const displayedTrackingLabels = Array.from(new Set(
(goalStackReview?.activeGoals || []).flatMap((goal) => goal.trackingLabels || [])
));
const starterGoalTypes = useMemo(() => buildIntakeStarterGoalTypes(), []);
const intakeGoalSelections = useMemo(() => (
selectedGoalSelections.length
? selectedGoalSelections
: buildGoalTemplateSelectionsFromAnswers({ answers })
 ), [answers, selectedGoalSelections]);
 const primaryIntakeGoalSelection = intakeGoalSelections[0] || null;
 const activeStarterGoalType = useMemo(
 () => starterGoalTypes.find((item) => item.id === selectedStarterGoalTypeId) || starterGoalTypes[0] || null,
 [selectedStarterGoalTypeId, starterGoalTypes]
 );
 const featuredStarterGoalTemplates = useMemo(() => listFeaturedIntakeGoalTemplates({
 goalTypeId: selectedStarterGoalTypeId,
 }), [selectedStarterGoalTypeId]);
const selectedGoalTextSet = useMemo(() => new Set(
intakeGoalSelections.map((selection) => String(selection?.goalText || "").toLowerCase()).filter(Boolean)
), [intakeGoalSelections]);
const intakeGoalSelectionSignature = useMemo(() => (
intakeGoalSelections
 .map((selection) => `${selection?.id || ""}:${selection?.templateId || ""}:${selection?.goalText || ""}`)
 .join("|")
), [intakeGoalSelections]);
const normalizedPendingGoalText = normalizeIntakeGoalEntry(pendingGoalSelection?.goalText || "", 320).toLowerCase();
const pendingGoalAlreadyAdded = normalizedPendingGoalText
? selectedGoalTextSet.has(normalizedPendingGoalText)
: false;
const pendingGoalSelectionSignature = pendingGoalSelection
? `${pendingGoalSelection?.id || ""}:${pendingGoalSelection?.templateId || ""}:${pendingGoalSelection?.goalText || ""}`
: "";
const pendingGoalCaptureModel = useMemo(() => buildIntakeGoalCaptureModel({
goalTypeId: pendingGoalSelection?.familyId || pendingGoalSelection?.templateCategoryId || selectedStarterGoalTypeId,
selection: pendingGoalSelection,
}), [pendingGoalSelectionSignature, selectedStarterGoalTypeId]);
const pendingGoalMetricQuestions = pendingGoalCaptureModel?.questions || [];
const pendingGoalHasDetails = pendingGoalCaptureModel?.supportsMetricEditing || false;
const stackStarterMetricQuestionEntries = useMemo(() => {
const seenQuestionKeys = new Set();
return intakeGoalSelections.flatMap((selection, priorityIndex) => (
 buildIntakeStarterMetricQuestions({
 goalTypeId: selection?.familyId || selection?.templateCategoryId || selectedStarterGoalTypeId,
 selection,
 })
 .map((question) => {
 const questionKey = String(question?.key || question?.title || "").trim();
 if (!questionKey || seenQuestionKeys.has(questionKey)) return null;
 seenQuestionKeys.add(questionKey);
 return {
 selection,
 priorityIndex,
 question,
 };
 })
.filter(Boolean)
));
}, [intakeGoalSelectionSignature, selectedStarterGoalTypeId]);
const pendingGoalCommitLabel = pendingGoalCaptureModel?.commitLabel || "Save goal";
const normalizedGoalText = normalizeIntakeGoalEntry(answers?.goal_intent || "", 320);
 const intakePreviewTodayKey = new Date().toISOString().split("T")[0];
 const intakePreviewDayOfWeek = getDayOfWeek();
 const intakePreviewBaseWeek = WEEKS[0] || {};
 const intakeMemorySignature = Array.isArray(personalization?.coachMemory?.longTermMemory)
 ? personalization.coachMemory.longTermMemory.join("|")
 : "";
 const liveDraftPreviewBundle = useMemo(() => {
 if (!normalizedGoalText && intakeGoalSelections.length === 0 && secondaryGoalEntries.length === 0) return null;
 const packetArgs = buildIntakePacketArgsFromAnswers({
 answers,
 existingMemory: Array.isArray(personalization?.coachMemory?.longTermMemory)
 ? personalization.coachMemory.longTermMemory
 : [],
 });
 return buildPreviewGoalResolutionBundle({
 intakeContext: packetArgs.intakeContext,
 aiInterpretationProposal: assessmentBoundary?.aiInterpretationProposal || null,
 answers,
 now: new Date(),
 });
 }, [
 answers,
 normalizedGoalText,
 intakeGoalSelections.length,
 secondaryGoalEntries.join("|"),
 intakeMemorySignature,
 assessmentBoundary?.aiInterpretationProposal,
 ]);
 const liveDraftGoalSignature = Array.isArray(liveDraftPreviewBundle?.orderedResolvedGoals)
 ? liveDraftPreviewBundle.orderedResolvedGoals.map((goal) => `${goal?.id || ""}:${goal?.summary || ""}:${goal?.planningPriority || ""}`).join("|")
 : "";
 const liveDraftReviewModel = useMemo(() => buildIntakeGoalReviewModel({
 goalResolution: liveDraftPreviewBundle?.goalResolution || null,
 orderedResolvedGoals: liveDraftPreviewBundle?.orderedResolvedGoals || [],
 goalFeasibility: liveDraftPreviewBundle?.goalFeasibility || null,
 arbitration: null,
 aiInterpretationProposal: assessmentBoundary?.aiInterpretationProposal || null,
 answers,
 goalStackConfirmation,
 }), [
 liveDraftPreviewBundle?.goalResolution,
 liveDraftPreviewBundle?.goalFeasibility,
 liveDraftGoalSignature,
 assessmentBoundary?.aiInterpretationProposal,
 answers,
 goalStackConfirmation,
 ]);
 const visibleIntakeReviewModel = Array.isArray(activeReviewModel?.orderedResolvedGoals) && activeReviewModel.orderedResolvedGoals.length
 ? activeReviewModel
 : liveDraftReviewModel;
 const intakeSummaryRail = useMemo(() => buildIntakeSummaryRailModel({
 answers,
 reviewModel: visibleIntakeReviewModel,
 draftPrimaryGoal: answers?.goal_intent || "",
 draftAdditionalGoals: secondaryGoalEntries,
 }), [answers, visibleIntakeReviewModel, secondaryGoalEntries]);
 const interpretedGoalCards = orderedGoalStackItems.length
 ? orderedGoalStackItems
 : Array.isArray(intakeSummaryRail?.interpretedGoals)
 ? intakeSummaryRail.interpretedGoals
 : [];
 const intakePlanPreviewModel = useMemo(() => buildIntakePlanPreviewModel({
 orderedResolvedGoals: Array.isArray(visibleIntakeReviewModel?.orderedResolvedGoals) ? visibleIntakeReviewModel.orderedResolvedGoals : [],
 answers,
 personalization,
 goalSlots: DEFAULT_MULTI_GOALS,
 profileDefaults: PROFILE,
 weekTemplates: WEEKS,
 baseWeek: intakePreviewBaseWeek,
 todayKey: intakePreviewTodayKey,
 dayOfWeek: intakePreviewDayOfWeek,
 }), [
 visibleIntakeReviewModel,
 answers,
 personalization,
 intakePreviewTodayKey,
 intakePreviewDayOfWeek,
 intakePreviewBaseWeek,
 ]);
 const intakeInjuryContext = useMemo(() => buildIntakeInjuryConstraintContext({
 injuryText: answers?.injury_text,
 injuryImpact: answers?.injury_impact,
 injuryArea: answers?.injury_area,
 injurySide: answers?.injury_side,
 injuryLimitations: answers?.injury_limitations,
 }), [answers?.injury_text, answers?.injury_impact, answers?.injury_area, answers?.injury_side, Array.isArray(answers?.injury_limitations) ? answers.injury_limitations.join("|") : ""]);
 const trainingLocationValue = String(answers?.training_location || "").trim();
 const homeEquipmentSelection = Array.isArray(answers?.home_equipment) ? answers.home_equipment : [];
 const needsHomeEquipment = trainingLocationValue === "Home" || trainingLocationValue === "Both";
const goalsStageNeeds = [
pendingGoalSelection?.goalText ? "Save or clear the goal in progress before continuing." : "",
!normalizedGoalText && secondaryGoalEntries.length === 0 && String(answers?.primary_goal || "").trim() !== "general_fitness"
? "Add at least one goal."
: "",
!answers?.experience_level ? "Pick your training background." : "",
!answers?.training_days ? "Pick your training days." : "",
 !answers?.session_length ? "Pick your session length." : "",
 !trainingLocationValue ? "Pick where you train." : "",
 needsHomeEquipment && homeEquipmentSelection.length === 0 && !String(answers?.home_equipment_other || "").trim()
 ? "Choose your home setup."
 : "",
 intakeInjuryContext.hasCurrentIssue && !answers?.injury_impact && !(Array.isArray(answers?.injury_limitations) && answers.injury_limitations.length > 0)
 ? "Mark what training is limited right now."
 : "",
 ].filter(Boolean);
 const goalsStageCanContinue = goalsStageNeeds.length === 0;
 useEffect(() => {
 const syncedSelections = buildGoalTemplateSelectionsFromAnswers({ answers });
 const currentSerialized = JSON.stringify(intakeGoalSelections);
 const nextSerialized = JSON.stringify(syncedSelections);
 if (currentSerialized !== nextSerialized) {
 setSelectedGoalSelections(syncedSelections);
 }
 }, [answers]);
 useEffect(() => {
 if (intakeGoalSelections.length > 0 || pendingGoalSelection?.goalText) return;
 const inferredGoalTypeId = inferIntakeStarterGoalTypeId({
 selection: primaryIntakeGoalSelection,
 answers,
 });
 if (inferredGoalTypeId && inferredGoalTypeId !== selectedStarterGoalTypeId && primaryIntakeGoalSelection) {
 setSelectedStarterGoalTypeId(inferredGoalTypeId);
 }
 }, [answers, intakeGoalSelections.length, pendingGoalSelection?.goalText, primaryIntakeGoalSelection, selectedStarterGoalTypeId]);
 useEffect(() => {
 const metricSelections = [
 ...intakeGoalSelections,
 ...(pendingGoalSelection?.goalText && !pendingGoalAlreadyAdded ? [pendingGoalSelection] : []),
 ];
 const relevantFieldKeys = new Set();
 const nextDraft = metricSelections.reduce((draft, selection) => {
 const selectionQuestions = buildIntakeStarterMetricQuestions({
 goalTypeId: selection?.familyId || selection?.templateCategoryId || selectedStarterGoalTypeId,
 selection,
 });
 selectionQuestions.forEach((question) => {
 (Array.isArray(question?.inputFields) ? question.inputFields : []).forEach((field) => {
 const fieldKey = String(field?.key || "").trim();
 if (fieldKey) relevantFieldKeys.add(fieldKey);
 });
 });
 return {
 ...draft,
 ...buildIntakeStarterMetricDraft({
 goalTypeId: selection?.familyId || selection?.templateCategoryId || selectedStarterGoalTypeId,
 selection,
 answers,
 }),
 };
 }, {});
 setGoalMetricValues((current) => {
 const preservedEntries = Object.fromEntries(
 Object.entries(current || {}).filter(([fieldKey]) => relevantFieldKeys.has(fieldKey))
 );
 return {
 ...nextDraft,
 ...preservedEntries,
 };
 });
 setGoalMetricFieldErrors({});
 setGoalMetricFormError("");
 }, [answers?.intake_completeness, intakeGoalSelectionSignature, pendingGoalSelectionSignature, pendingGoalAlreadyAdded, selectedStarterGoalTypeId]);
const stageProgressIndex = phase === INTAKE_UI_PHASES.building
? 2
: phase === INTAKE_UI_PHASES.clarify || phase === INTAKE_UI_PHASES.interpretation || phase === INTAKE_UI_PHASES.adjust || phase === INTAKE_UI_PHASES.confirm
? 1
: 0;
 const intakeWideLayout = useResponsiveMediaQuery("(min-width: 1040px)");
 const updateSimpleAnswer = (fieldKey, value) => {
 setAnswers((prev) => ({
 ...prev,
 [fieldKey]: value,
 }));
 };
 const updateTrainingLocationAnswer = (value) => {
 setAnswers((prev) => ({
 ...prev,
 training_location: value,
 ...((value === "Home" || value === "Both")
 ? {}
 : {
 home_equipment: [],
 home_equipment_other: "",
 }),
 }));
 };
 const toggleAvailableTrainingDay = (option) => {
 setAnswers((prev) => {
 const currentSelection = normalizeTrainingWeekdayAvailability(prev?.available_training_days || []);
 const nextSelection = currentSelection.includes(option)
 ? currentSelection.filter((item) => item !== option)
 : [...currentSelection, option];
 return {
 ...prev,
 available_training_days: normalizeTrainingWeekdayAvailability(nextSelection),
 };
 });
 };
 const toggleHomeEquipmentOption = (option) => {
 setAnswers((prev) => {
 const currentSelection = Array.isArray(prev?.home_equipment) ? prev.home_equipment : [];
 const nextSelection = currentSelection.includes(option)
 ? currentSelection.filter((item) => item !== option)
 : [...currentSelection, option];
 return {
 ...prev,
 home_equipment: nextSelection,
 ...(option === "Other" || nextSelection.includes("Other")
 ? {}
 : { home_equipment_other: "" }),
 };
 });
 };
 const toggleIntakeInjuryLimitationOption = (option) => {
 setAnswers((prev) => {
 const currentSelection = Array.isArray(prev?.injury_limitations) ? prev.injury_limitations : [];
 const nextSelection = currentSelection.includes(option)
 ? currentSelection.filter((item) => item !== option)
 : [...currentSelection, option];
 return {
 ...prev,
 injury_limitations: nextSelection,
 };
 });
 };
 const goBackFromClarify = () => {
 if (Array.isArray(intakeMachine?.anchorBindingLog) && intakeMachine.anchorBindingLog.length > 0) {
 reopenLastAnsweredDetail();
 return;
 }
 setPhase(INTAKE_UI_PHASES.goals);
 };
 const goBackFromConfirm = () => {
 if (Array.isArray(intakeMachine?.anchorBindingLog) && intakeMachine.anchorBindingLog.length > 0) {
 reopenLastAnsweredDetail();
 return;
 }
 setPhase(INTAKE_UI_PHASES.goals);
 };
const anchorCollectionViewModel = useMemo(() => buildAnchorCollectionViewModel({
 machineState: intakeMachine,
 maxVisibleCards: 3,
}), [intakeMachine]);
const visibleMachineAnchorCards = phase === INTAKE_UI_PHASES.clarify && anchorCollectionViewModel?.isVisible
 ? (Array.isArray(anchorCollectionViewModel?.visibleCards) ? anchorCollectionViewModel.visibleCards : [])
 : [];
 const multiAnchorCollectionMode = visibleMachineAnchorCards.length > 1;
 const isMachineAnchorClarification = phase === INTAKE_UI_PHASES.clarify && Boolean(anchorCollectionViewModel?.isVisible);
 const activeAnchorFailureCount = isMachineAnchorClarification
 ? Number(intakeMachine?.anchorFailureCounts?.[activeMachineAnchor?.field_id] || 0)
 : 0;
 const activeAnchorStrictMode = isMachineAnchorClarification && activeAnchorFailureCount >= 2;
 const allowNaturalAnchorMode = isMachineAnchorClarification && !activeAnchorStrictMode && activeMachineAnchor?.input_type !== "choice_chips";
 const canEditLastAnchorAnswer = Boolean(
 isMachineAnchorClarification
 && Array.isArray(intakeMachine?.anchorBindingLog)
 && intakeMachine.anchorBindingLog.length > 0
 );
 const isStructuredClarification = isMachineAnchorClarification || (phase === INTAKE_UI_PHASES.clarify && isStructuredIntakeCompletenessQuestion(pendingClarifyingQuestion));
 const activeMachineAnchorSubmission = isMachineAnchorClarification ? buildAnchorSubmissionPayload(activeMachineAnchor) : null;
 const clarificationInputFields = isMachineAnchorClarification
 ? []
 : (Array.isArray(pendingClarifyingQuestion?.inputFields) ? pendingClarifyingQuestion.inputFields : []);
const clarificationPromptText = activeMachineAnchor?.field_id
 ? (activeAnchorDisplayCopy?.questionText || activeMachineAnchor?.question || "")
 : (pendingClarifyingQuestion?.prompt || "");
const clarificationValidationMessage = activeMachineAnchor?.validation?.message || pendingClarifyingQuestion?.validation?.message || "";
const readPriorityOrderedGoalIds = () => {
 const currentOrderedGoalIds = Array.isArray(goalStackReview?.orderedGoalIds)
 ? goalStackReview.orderedGoalIds
 : Array.isArray(goalStackConfirmation?.orderedGoalIds)
 ? goalStackConfirmation.orderedGoalIds
 : interpretedGoalCards.map((goal) => String(goal?.id || "").trim()).filter(Boolean);
 return currentOrderedGoalIds.filter(Boolean);
 };
 const moveGoalInPriorityStack = (goalId, direction = -1) => {
 const cleanGoalId = String(goalId || "").trim();
 if (!cleanGoalId) return;
 const currentOrderedGoalIds = readPriorityOrderedGoalIds();
 const currentIndex = currentOrderedGoalIds.indexOf(cleanGoalId);
 if (currentIndex < 0) return;
 const nextIndex = direction < 0
 ? Math.max(0, currentIndex - 1)
 : Math.min(currentOrderedGoalIds.length - 1, currentIndex + 1);
 if (nextIndex === currentIndex) return;
 const nextOrderedGoalIds = [...currentOrderedGoalIds];
 const [movedGoalId] = nextOrderedGoalIds.splice(currentIndex, 1);
 nextOrderedGoalIds.splice(nextIndex, 0, movedGoalId);
 const nextGoalStackConfirmation = buildIntakeGoalStackConfirmation({
 resolvedGoals: reviewGoals,
 goalFeasibility: assessmentPreview?.goalFeasibility || null,
 goalStackConfirmation: {
 ...(goalStackConfirmation || {}),
 orderedGoalIds: nextOrderedGoalIds,
 removedGoalIds: (Array.isArray(goalStackConfirmation?.removedGoalIds) ? goalStackConfirmation.removedGoalIds : []).filter((id) => id !== cleanGoalId),
 },
 });
 applyGoalStackConfirmationUpdate(nextGoalStackConfirmation);
 };
 const removeHeardGoal = (goalId = "") => {
 const cleanGoalId = String(goalId || "").trim();
 if (!cleanGoalId || heardGoalRows.length <= 1) return;
 const removedGoalIds = new Set(Array.isArray(goalStackConfirmation?.removedGoalIds) ? goalStackConfirmation.removedGoalIds : []);
 removedGoalIds.add(cleanGoalId);
 const nextGoalStackConfirmation = buildIntakeGoalStackConfirmation({
 resolvedGoals: reviewGoals,
 goalFeasibility: assessmentPreview?.goalFeasibility || null,
 goalStackConfirmation: {
 ...(goalStackConfirmation || {}),
 orderedGoalIds: readPriorityOrderedGoalIds().filter((id) => id !== cleanGoalId),
 removedGoalIds: [...removedGoalIds],
 },
 });
 applyGoalStackConfirmationUpdate(nextGoalStackConfirmation);
 };
 const toggleBackgroundPriority = () => {
 const nextGoalStackConfirmation = buildIntakeGoalStackConfirmation({
 resolvedGoals: reviewGoals,
 goalFeasibility: assessmentPreview?.goalFeasibility || null,
 goalStackConfirmation: {
 ...(goalStackConfirmation || {}),
 keepResiliencePriority: goalStackConfirmation?.keepResiliencePriority === false,
 },
 });
 applyGoalStackConfirmationUpdate(nextGoalStackConfirmation);
 };
 const selectMilestonePath = (goalId = "", strategy = INTAKE_MILESTONE_PATHS.keepTarget) => {
 const cleanGoalId = String(goalId || "").trim();
 if (!cleanGoalId) return;
 const nextMilestonePlanByGoalId = {
 ...(goalStackConfirmation?.milestonePlanByGoalId || {}),
 };
 if (strategy === INTAKE_MILESTONE_PATHS.milestoneFirst) {
 const sourceGoal = (Array.isArray(activeReviewGoals) ? activeReviewGoals : []).find((goal) => String(goal?.id || "").trim() === cleanGoalId)
 || (Array.isArray(reviewGoals) ? reviewGoals : []).find((goal) => String(goal?.id || "").trim() === cleanGoalId)
 || null;
 const goalAssessment = (Array.isArray(activeGoalFeasibility?.goalAssessments) ? activeGoalFeasibility.goalAssessments : []).find((item) => String(item?.goalId || "").trim() === cleanGoalId)
 || null;
 const milestoneRecord = createIntakeMilestoneSelectionRecord({
 goal: sourceGoal,
 goalAssessment,
 });
 if (!milestoneRecord) return;
 nextMilestonePlanByGoalId[cleanGoalId] = milestoneRecord;
 } else {
 delete nextMilestonePlanByGoalId[cleanGoalId];
 }
 const nextGoalStackConfirmation = buildIntakeGoalStackConfirmation({
 resolvedGoals: activeReviewGoals,
 goalFeasibility: activeGoalFeasibility || assessmentPreview?.goalFeasibility || null,
 goalStackConfirmation: {
 ...(goalStackConfirmation || {}),
 milestonePlanByGoalId: nextMilestonePlanByGoalId,
 },
 });
 applyGoalStackConfirmationUpdate(nextGoalStackConfirmation);
 };
 const renderChoiceChips = ({
 items = [],
 selectedValue = "",
 selectedValues = [],
 onSelect = () => {},
 testIdPrefix = "intake-chip",
 multi = false,
 } = {}) => (
 <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
 {items.map((item) => {
 const value = typeof item === "string" ? item : item?.value;
 const label = typeof item === "string" ? item : item?.label || item?.value || "";
 const selected = multi
 ? (Array.isArray(selectedValues) ? selectedValues : []).includes(value)
 : String(selectedValue || "") === String(value || "");
 return (
 <button
 key={`${testIdPrefix}-${value}`}
 data-testid={`${testIdPrefix}-${toTestIdFragment(value || label)}`}
 className={selected ? "btn btn-primary" : "btn"}
 onClick={() => onSelect(value)}
 style={{
 minHeight:44,
 fontSize:"0.68rem",
 color:selected ? "#08111d" : "#dbe7f6",
 borderColor:selected ? "#dbe7f6" : "#324961",
 background:selected ? "#dbe7f6" : "transparent",
 }}
 >
 {label}
 </button>
 );
 })}
 </div>
 );
 const renderStructuredInjuryFields = ({ testIdPrefix = "injury-structure" } = {}) => (
 <div style={{ display:"grid", gap:"0.42rem", padding:"0.65rem", border:"1px solid rgba(111,148,198,0.12)", borderRadius:16, background:"rgba(4,10,18,0.5)" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
<div style={{ fontSize:"0.48rem", color:"#dbe7f6", lineHeight:1.45 }}>Quick picks work best here.</div>
<div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>Pick the area and the movements that feel limited. Use the note only for extra context.</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:"0.45rem" }}>
 <label style={{ display:"grid", gap:"0.18rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>AREA</span>
 <select
 data-testid={`${testIdPrefix}-area`}
 value={answers?.injury_area || ""}
 onChange={(e) => updateSimpleAnswer("injury_area", e.target.value)}
 >
 <option value="">No current issue</option>
 {AFFECTED_AREAS.map((area) => <option key={`${testIdPrefix}-area-${area}`} value={area}>{area}</option>)}
 </select>
 </label>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>SIDE</span>
 {renderChoiceChips({
 items: INJURY_SIDE_OPTIONS,
 selectedValue: answers?.injury_side || "unspecified",
 onSelect: (value) => updateSimpleAnswer("injury_side", value),
 testIdPrefix: `${testIdPrefix}-side`,
 })}
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>LIMITED RIGHT NOW</span>
 {renderChoiceChips({
 items: INJURY_LIMITATION_OPTIONS,
 selectedValues: Array.isArray(answers?.injury_limitations) ? answers.injury_limitations : [],
 onSelect: (value) => toggleIntakeInjuryLimitationOption(value),
 testIdPrefix: `${testIdPrefix}-limits`,
 multi: true,
 })}
 </div>
 </div>
 );
 const renderSectionLabel = (eyebrow = "", title = "", supporting = "") => (
 <SurfaceHeading
 eyebrow={eyebrow}
 title={title}
 supporting={supporting}
 eyebrowColor="#8fa5c8"
 titleColor="#f8fbff"
 supportingColor="#9fb4d3"
 titleSize="hero"
 />
 );
 const renderGoalMetricField = (field = {}) => {
 const fieldKey = String(field?.key || "").trim();
 if (!fieldKey) return null;
 const fieldError = goalMetricFieldErrors?.[fieldKey] || "";
 const value = goalMetricValues?.[fieldKey] ?? "";
 const choiceOptions = Array.isArray(field?.choiceOptions) ? field.choiceOptions : [];
 const fieldLabel = field?.label || fieldKey.replace(/_/g, " ");
 if (field?.inputType === "choice_chips") {
 return (
 <div key={fieldKey} style={{ display:"grid", gap:"0.32rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{fieldLabel}</div>
 {renderChoiceChips({
 items: choiceOptions.map((option) => ({
 value: option?.value,
 label: option?.label || option?.value || "",
 })),
 selectedValue: value,
 onSelect: (nextValue) => updateGoalMetricValue(fieldKey, String(nextValue || "")),
 testIdPrefix: `intake-goal-metric-${fieldKey}`,
 })}
 {field?.helperText ? (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>{field.helperText}</div>
 ) : null}
 {fieldError ? (
 <div style={{ fontSize:"0.5rem", color:"#ffd7d7", lineHeight:1.45 }}>{fieldError}</div>
 ) : null}
 </div>
 );
 }
 return (
 <label key={fieldKey} style={{ display:"grid", gap:"0.3rem" }}>
 <div style={{ display:"flex", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{fieldLabel}</div>
 {field?.unit ? (
 <div style={{ fontSize:"0.46rem", color:"#8fa5c8", border:"1px solid rgba(111,148,198,0.16)", borderRadius:999, padding:"0.12rem 0.38rem" }}>
 {field.unit}
 </div>
 ) : null}
 </div>
 <input
 data-testid={`intake-goal-metric-${toTestIdFragment(fieldKey)}`}
 type={field?.inputType === "number" ? "number" : "text"}
 inputMode={field?.inputType === "number" ? "decimal" : undefined}
 min={field?.min}
 max={field?.max}
 value={value}
 onChange={(e) => updateGoalMetricValue(fieldKey, e.target.value)}
 placeholder={field?.placeholder || ""}
 style={{
 borderColor: fieldError ? "rgba(255,123,123,0.55)" : "rgba(111,148,198,0.18)",
 background:"rgba(4,10,18,0.62)",
 }}
 />
 {field?.helperText ? (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>{field.helperText}</div>
 ) : null}
 {fieldError ? (
 <div style={{ fontSize:"0.5rem", color:"#ffd7d7", lineHeight:1.45 }}>{fieldError}</div>
 ) : null}
 </label>
 );
 };
const renderGoalMetricQuestionCard = (question = null, { contextLabel = "" } = {}) => {
 if (!question) return null;
 return (
 <div
 key={question.key || question.title}
 data-testid={`intake-goal-metric-card-${toTestIdFragment(question.key || question.title)}`}
 style={{
 display:"grid",
 gap:"0.65rem",
 border:"1px solid rgba(111,148,198,0.16)",
 borderRadius:18,
 padding:"0.85rem",
 background:"rgba(6,12,22,0.72)",
 }}
 >
 <div style={{ display:"grid", gap:"0.18rem" }}>
 {contextLabel ? (
 <div style={{ fontSize:"0.46rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>{contextLabel}</div>
 ) : null}
 <div style={{ fontSize:"0.52rem", color:"#dbe7f6", lineHeight:1.45, fontWeight:600 }}>{question.title || question.prompt}</div>
 {question.helper ? (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>{question.helper}</div>
 ) : null}
 </div>
 <div style={{ display:"grid", gap:"0.7rem", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))" }}>
 {(Array.isArray(question?.inputFields) ? question.inputFields : []).map((field) => renderGoalMetricField(field))}
 </div>
 </div>
);
};
const renderPendingGoalSelectionCard = () => {
if (!pendingGoalSelection?.goalText) return null;
return (
<div
data-testid="intake-goal-selection-draft"
style={{
display:"grid",
gap:"0.45rem",
border:"1px solid rgba(0,194,255,0.2)",
borderRadius:18,
padding:"0.85rem",
background:"rgba(6,17,31,0.82)",
}}
>
<div style={{ display:"grid", gap:"0.14rem" }}>
<div style={{ fontSize:"0.48rem", color:"#b9ecff", letterSpacing:"0.12em" }}>GOAL DETAILS</div>
<div style={{ fontSize:"0.62rem", color:"#f8fbff", lineHeight:1.45, fontWeight:600 }}>
{pendingGoalSelection.summary || pendingGoalSelection.goalText}
</div>
<div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
{pendingGoalAlreadyAdded
? "This goal is already in your stack."
: pendingGoalCaptureModel?.helper || "Save this goal when it looks right."}
</div>
</div>
{pendingGoalHasDetails ? (
<div style={{ display:"grid", gap:"0.45rem" }}>
<div style={{ display:"grid", gap:"0.6rem" }}>
{pendingGoalMetricQuestions.map((question) => renderGoalMetricQuestionCard(question, {
contextLabel: "Finish this goal",
}))}
</div>
</div>
) : null}
{goalMetricFormError ? (
<div style={{ fontSize:"0.52rem", color:"#ffd7d7", lineHeight:1.45 }}>{goalMetricFormError}</div>
) : null}
<div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap", alignItems:"center" }}>
<button
type="button"
className={pendingGoalAlreadyAdded ? "btn" : "btn btn-primary"}
data-testid="intake-goal-selection-commit"
onClick={commitPendingGoalSelection}
disabled={pendingGoalAlreadyAdded}
style={pendingGoalAlreadyAdded ? { color:"#9fb4d3", borderColor:"#324961" } : {}}
>
{pendingGoalAlreadyAdded ? "Already added" : pendingGoalCommitLabel}
</button>
<button
type="button"
className="btn"
data-testid="intake-goal-selection-clear"
onClick={() => setPendingGoalSelection(null)}
style={{ color:"#dbe7f6", borderColor:"#324961" }}
>
Clear
</button>
</div>
</div>
);
};
const renderGoalCard = (goal = null, { mode = "proposal" } = {}) => {
 if (!goal) return null;
 const priorityMeta = resolveGoalPriorityCardMeta(goal?.priorityIndex);
 const canReorder = Boolean(goal?.id && mode === "confirm");
 const allowRemoveGoal = Boolean(goal?.id && interpretedGoalCards.length > 1);
 const canMoveEarlier = canReorder && Number(goal?.priorityIndex || 0) > 0;
 const canMoveLater = canReorder && Number(goal?.priorityIndex || 0) < interpretedGoalCards.length - 1;
 return (
 <div
 key={`${mode}:${goal.id || goal.summary}`}
 data-testid={mode === "confirm" ? "intake-confirm-goal-card" : "intake-goal-proposal-card"}
 data-goal-id={goal.id || ""}
 style={{ display:"grid", gap:"0.55rem", border:"1px solid rgba(111,148,198,0.16)", borderRadius:18, padding:"0.9rem", background:"rgba(8,14,25,0.78)" }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.6rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.2rem", flex:"1 1 240px" }}>
 <div data-testid="intake-goal-card-summary" style={{ fontSize:"0.76rem", color:"#f8fbff", lineHeight:1.35, fontWeight:600 }}>{goal.summary}</div>
 <div style={{ fontSize:"0.52rem", color:"#9fb4d3", lineHeight:1.5 }}>{goal.priorityHelper || priorityMeta.helper}</div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 <div data-testid="intake-goal-card-priority" style={{ fontSize:"0.48rem", color:priorityMeta.tint, border:`1px solid ${priorityMeta.tint}35`, borderRadius:999, padding:"0.18rem 0.44rem", background:`${priorityMeta.tint}14` }}>
 {goal.priorityLabel || buildVisibleGoalPriorityLabel(goal?.priorityIndex)}
 </div>
 {goal.goalTypeLabel ? (
 <div style={{ fontSize:"0.48rem", color:"#dbe7f6", border:"1px solid rgba(111,148,198,0.16)", borderRadius:999, padding:"0.18rem 0.44rem", background:"rgba(15,23,42,0.72)" }}>
 {goal.goalTypeLabel}
 </div>
 ) : null}
 </div>
 </div>
 <button
 data-testid={`intake-goal-edit-${toTestIdFragment(goal.id || goal.summary)}`}
 className="btn"
 onClick={() => requestAdjustment({ goalSummary: goal.summary, goalId: goal.id })}
 style={{ fontSize:"0.52rem", color:"#dbe7f6", borderColor:"#324961" }}
 >
 Edit
 </button>
 </div>
 {goal.timingLabel ? (
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.52rem", color:"#dbe7f6", lineHeight:1.5 }}>{goal.timingLabel}</div>
 {goal.timingDetail ? (
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>{goal.timingDetail}</div>
 ) : null}
 </div>
 ) : null}
 {goal.firstThirtyDayWin ? (
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>
 First 30 days: {goal.firstThirtyDayWin}
 </div>
 ) : null}
 {goal.trackingLabels?.length ? (
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 {goal.trackingLabels.map((label) => (
 <div key={`${goal.id || goal.summary}:${label}`} style={{ fontSize:"0.48rem", color:"#9fb4d3", border:"1px solid rgba(111,148,198,0.14)", borderRadius:999, padding:"0.18rem 0.44rem", background:"rgba(15,23,42,0.68)" }}>
 {label}
 </div>
 ))}
 </div>
 ) : null}
 {goal.rationale ? (
 <div style={{ fontSize:"0.54rem", color:"#8fa5c8", lineHeight:1.55 }}>{goal.rationale}</div>
 ) : null}
 {mode === "proposal" && allowRemoveGoal ? (
 <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
 <button
 data-testid={`intake-goal-remove-${toTestIdFragment(goal.id || goal.summary)}`}
 className="btn"
 onClick={() => removeHeardGoal(goal.id)}
 style={{ fontSize:"0.5rem", color:"#9fb4d3", borderColor:"#324961" }}
 >
 Remove
 </button>
 </div>
 ) : null}
 {mode === "confirm" && canReorder ? (
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 {canMoveEarlier ? (
 <button
 data-testid={`intake-confirm-priority-up-${toTestIdFragment(goal.id || goal.summary)}`}
 className="btn"
 onClick={() => moveGoalInPriorityStack(goal.id, -1)}
 style={{ fontSize:"0.5rem", color:C.green, borderColor:`${C.green}40` }}
 >
 Move earlier
 </button>
 ) : null}
 {canMoveLater ? (
 <button
 data-testid={`intake-confirm-priority-down-${toTestIdFragment(goal.id || goal.summary)}`}
 className="btn"
 onClick={() => moveGoalInPriorityStack(goal.id, 1)}
 style={{ fontSize:"0.5rem", color:"#dbe7f6", borderColor:"#324961" }}
 >
 Move later
 </button>
 ) : null}
 {allowRemoveGoal ? (
 <button
 data-testid={`intake-confirm-priority-remove-${toTestIdFragment(goal.id || goal.summary)}`}
 className="btn"
 onClick={() => removeHeardGoal(goal.id)}
 style={{ fontSize:"0.5rem", color:"#9fb4d3", borderColor:"#324961" }}
 >
 Remove
 </button>
 ) : null}
 </div>
 ) : null}
 </div>
 );
 };
 const renderGoalCardStack = (goals = [], { mode = "proposal" } = {}) => {
 const orderedGoals = Array.isArray(goals) ? goals : [];
 const priorityGoals = orderedGoals.slice(0, 3);
 const additionalGoals = orderedGoals.slice(3);
 return (
 <div style={{ display:"grid", gap:"0.7rem" }}>
 {priorityGoals.map((goal) => renderGoalCard(goal, { mode }))}
 {additionalGoals.length > 0 ? (
 <div
 data-testid={mode === "confirm" ? "intake-confirm-additional-goals" : "intake-proposal-additional-goals"}
 style={{ display:"grid", gap:"0.55rem" }}
 >
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>PRIORITIES 4+</div>
 <div style={{ display:"grid", gap:"0.7rem" }}>
 {additionalGoals.map((goal) => renderGoalCard(goal, { mode }))}
 </div>
 </div>
 ) : null}
 </div>
 );
 };
const renderGoalSelectionSurface = () => (
 <div data-testid="intake-goal-selection-surface" style={{ display:"grid", gap:"0.8rem", border:"1px solid rgba(111,148,198,0.16)", borderRadius:24, padding:"1rem", background:"rgba(8,14,25,0.82)" }}>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>GOAL CATEGORY</div>
 <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.5 }}>{activeStarterGoalType?.helper || "Structured first. Custom stays secondary."}</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.45rem" }}>
 {starterGoalTypes.map((goalType) => {
 const selected = selectedStarterGoalTypeId === goalType.id;
 return (
 <button
 key={goalType.id}
 type="button"
 className="btn"
 data-testid={`intake-goal-type-${goalType.id}`}
 onClick={() => selectStarterGoalType(goalType.id)}
 style={{
 display:"grid",
 gap:"0.18rem",
 textAlign:"left",
 minHeight:102,
 padding:"0.8rem",
 borderRadius:18,
 border:selected ? "1px solid rgba(0,194,255,0.34)" : "1px solid rgba(111,148,198,0.16)",
 background:selected ? "linear-gradient(180deg, rgba(0,194,255,0.14), rgba(7,12,21,0.94))" : "rgba(4,10,18,0.58)",
 boxShadow:selected ? "0 14px 30px rgba(0,194,255,0.1)" : "none",
 }}
 >
 <div style={{ fontSize:"0.45rem", color:selected ? "#b9ecff" : "#8fa5c8", letterSpacing:"0.12em" }}>{goalType.eyebrow.toUpperCase()}</div>
 <div style={{ fontSize:"0.68rem", color:"#f8fbff", lineHeight:1.35, fontWeight:600 }}>{goalType.label}</div>
 <div style={{ fontSize:"0.5rem", color:selected ? "#dbe7f6" : "#8fa5c8", lineHeight:1.45 }}>{goalType.helper}</div>
 </button>
 );
 })}
 </div>

 {selectedStarterGoalTypeId !== "custom" ? (
 <div style={{ display:"grid", gap:"0.55rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>EXAMPLES THAT FIT</div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>Pick the closest fit fast. Exact metrics can stay blank for now.</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.45rem" }}>
 {featuredStarterGoalTemplates.map((template) => {
 const selectedPrimary = String(primaryIntakeGoalSelection?.templateId || "").trim() === template.id;
 const added = selectedGoalTextSet.has(String(template.goalText || "").toLowerCase());
 const selectedForDraft = String(pendingGoalSelection?.templateId || "").trim() === template.id;
 return (
 <button
 key={template.id}
 type="button"
 className="btn"
 data-testid={`intake-featured-goal-${template.id}`}
 onClick={() => queueGoalSelection(buildGoalTemplateSelection({ templateId: template.id }))}
 disabled={added}
 style={{
 textAlign:"left",
 borderColor:selectedPrimary || selectedForDraft ? "rgba(0,194,255,0.38)" : added ? "rgba(147,197,253,0.55)" : "#22324a",
 background:selectedPrimary || selectedForDraft ? "linear-gradient(180deg, rgba(0,194,255,0.12), rgba(9,16,29,0.92))" : added ? "rgba(147,197,253,0.12)" : "rgba(11,18,32,0.8)",
 padding:"0.82rem",
 borderRadius:18,
 display:"grid",
 gap:"0.24rem",
 opacity: added ? 0.82 : 1,
 }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start" }}>
 <div style={{ fontSize:"0.6rem", color:"#f8fbff", lineHeight:1.4, fontWeight:600 }}>{template.title}</div>
 <div style={{ fontSize:"0.44rem", color:selectedPrimary || selectedForDraft ? "#b9ecff" : added ? "#bfdbfe" : "#8fa5c8" }}>
 {selectedPrimary ? "Priority 1" : added ? "Added" : selectedForDraft ? "Selected" : "Select"}
 </div>
 </div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>{template.helper}</div>
 </button>
 );
 })}
 </div>
 </div>
 ) : (
 <div style={{ border:"1px dashed rgba(111,148,198,0.16)", borderRadius:18, padding:"0.9rem", background:"rgba(4,10,18,0.4)", fontSize:"0.56rem", color:"#8fa5c8", lineHeight:1.5 }}>
 Custom goals skip the template grid. Use the fallback card below.
 </div>
 )}

 {pendingGoalSelection ? renderPendingGoalSelectionCard() : null}

 <div data-testid="intake-custom-goal-card" style={{ display:"grid", gap:"0.45rem", border:"1px dashed rgba(111,148,198,0.18)", borderRadius:18, padding:"0.9rem", background:"rgba(4,10,18,0.35)" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>CUSTOM GOAL</div>
 <div style={{ fontSize:"0.54rem", color:"#8fa5c8", lineHeight:1.45 }}>Use this only when the mapped templates still miss the real target.</div>
 </div>
 <button
 type="button"
 className="btn"
 data-testid="intake-goals-toggle-custom"
 onClick={() => {
 setShowCustomGoalComposer((current) => {
 const nextValue = !current;
 if (nextValue) setSelectedStarterGoalTypeId("custom");
 return nextValue;
 });
 }}
 style={{ fontSize:"0.48rem", color:"#dbe7f6", borderColor:"#324961" }}
 >
 {showCustomGoalComposer || selectedStarterGoalTypeId === "custom" ? "Hide custom" : "Add custom goal"}
 </button>
 </div>
 {showCustomGoalComposer || selectedStarterGoalTypeId === "custom" ? (
 <div style={{ display:"grid", gap:"0.45rem" }}>
 <textarea
 data-testid="intake-goals-primary-input"
 ref={composerRef}
 value={extraGoalDraft}
 onChange={(e) => setExtraGoalDraft(e.target.value)}
 placeholder="Return to soccer without calf pain. Train for a ruck test. Rebuild after a long layoff."
 rows={3}
 style={{ minHeight:92, resize:"vertical", fontSize:"0.86rem", lineHeight:1.5 }}
 />
 <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap", alignItems:"center" }}>
 <button
 data-testid="intake-goals-add"
 className="btn btn-primary"
 onClick={addGoalToStack}
 disabled={!normalizeIntakeGoalEntry(extraGoalDraft)}
 >
 Use custom goal
 </button>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>
 We only fall back to parsing after you save the custom goal.
 </div>
 </div>
 </div>
 ) : null}
 </div>

 <div data-testid="intake-selected-goals" style={{ display:"grid", gap:"0.42rem", border:"1px solid rgba(111,148,198,0.12)", borderRadius:16, padding:"0.8rem", background:"rgba(4,10,18,0.55)" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>PRIORITY ORDER</div>
 <div style={{ fontSize:"0.54rem", color:"#8fa5c8", lineHeight:1.45 }}>Save each goal cleanly, then move the stack until the order feels right.</div>
 </div>
 {intakeGoalSelections.length > 0 ? (
 <div style={{ display:"grid", gap:"0.42rem" }}>
 {intakeGoalSelections.map((selection, index) => (
 <div
 key={selection.id || selection.goalText}
 data-testid={`intake-selected-goal-${toTestIdFragment(selection.goalText || selection.summary)}`}
 style={{ border:"1px solid rgba(111,148,198,0.14)", borderRadius:14, padding:"0.7rem", background:"rgba(8,14,25,0.76)", display:"grid", gap:"0.35rem" }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.45rem", alignItems:"flex-start" }}>
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>
 {index === 0 ? "PRIORITY 1" : index < 3 ? `PRIORITY ${index + 1}` : "ADDITIONAL GOAL"}
 </div>
 <div style={{ fontSize:"0.6rem", color:"#f8fbff", lineHeight:1.42, fontWeight:600 }}>{selection.summary || selection.goalText}</div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>{selection.helper || "Custom goal"}</div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
 <button
 type="button"
 className="btn"
 data-testid={`intake-selected-goal-up-${toTestIdFragment(selection.goalText || selection.summary)}`}
 onClick={() => moveSelectedGoalInStack(selection.goalText || selection.summary, -1)}
 disabled={index === 0}
 style={{ fontSize:"0.47rem", color:"#dbe7f6", borderColor:"#324961" }}
 >
 Earlier
 </button>
 <button
 type="button"
 className="btn"
 data-testid={`intake-selected-goal-down-${toTestIdFragment(selection.goalText || selection.summary)}`}
 onClick={() => moveSelectedGoalInStack(selection.goalText || selection.summary, 1)}
 disabled={index === intakeGoalSelections.length - 1}
 style={{ fontSize:"0.47rem", color:"#dbe7f6", borderColor:"#324961" }}
 >
 Later
 </button>
 <button
 type="button"
 className="btn"
 data-testid={`intake-selected-goal-remove-${toTestIdFragment(selection.goalText || selection.summary)}`}
 onClick={() => removeGoalFromStack(selection.goalText || selection.summary)}
 style={{ fontSize:"0.47rem", color:"#9fb4d3", borderColor:"#324961" }}
 >
 Remove
 </button>
 </div>
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div style={{ fontSize:"0.56rem", color:"#8fa5c8", lineHeight:1.5 }}>Choose a template above, save it, then add another goal if you need one.</div>
 )}
 </div>

 {!pendingGoalSelection?.goalText && stackStarterMetricQuestionEntries.length > 0 ? (
 <div style={{ display:"grid", gap:"0.55rem", border:"1px solid rgba(111,148,198,0.16)", borderRadius:20, padding:"1rem", background:"rgba(8,14,25,0.78)" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>OPTIONAL TARGET EDITS</div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>Tighten the saved goal details here if you want. Unknown numbers can stay blank.</div>
 </div>
 <div style={{ display:"grid", gap:"0.6rem" }}>
 {stackStarterMetricQuestionEntries.map(({ selection, priorityIndex, question }) => renderGoalMetricQuestionCard(question, {
 contextLabel: `${priorityIndex === 0 ? "Priority 1" : `Priority ${priorityIndex + 1}`}: ${selection?.summary || selection?.goalText || "Goal"}`,
 }))}
 </div>
 {goalMetricFormError && !pendingGoalSelection?.goalText ? (
 <div style={{ fontSize:"0.52rem", color:"#ffd7d7", lineHeight:1.45 }}>{goalMetricFormError}</div>
 ) : null}
 </div>
 ) : null}
 </div>
);
const renderPlanningRealitySurface = () => (
 <div data-testid="intake-reality-surface" style={{ display:"grid", gap:"0.75rem", alignSelf:"start", border:"1px solid rgba(111,148,198,0.16)", borderRadius:24, padding:"1rem", background:"rgba(8,14,25,0.82)" }}>
 {renderSectionLabel("Reality", "Weekly reality", "Availability, equipment, and constraints that materially change week one.")}
 <div style={{ display:"grid", gap:"0.7rem", alignItems:"start", gridTemplateColumns:intakeWideLayout ? "repeat(2, minmax(0, 1fr))" : "1fr" }}>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>EXPERIENCE</div>
 {renderChoiceChips({
 items: EXPERIENCE_LEVEL_OPTIONS.map((value) => ({ value, label: EXPERIENCE_LEVEL_LABELS[value] })),
 selectedValue: answers?.experience_level || "",
 onSelect: (value) => updateSimpleAnswer("experience_level", value),
 testIdPrefix: "intake-goals-option-experience-level",
 })}
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>TRAINING DAYS</div>
 {renderChoiceChips({
 items: ["2", "3", "4", "5", "6+"],
 selectedValue: answers?.training_days || "",
 onSelect: (value) => updateSimpleAnswer("training_days", value),
 testIdPrefix: "intake-goals-option-training-days",
 })}
 </div>
 <div style={{ display:"grid", gap:"0.35rem", ...(intakeWideLayout ? { gridColumn:"1 / -1" } : {}) }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>DAYS YOU CAN TRAIN</div>
 <div style={{ fontSize:"0.5rem", color:"#9fb4d3", lineHeight:1.45 }}>Pick the days that are usually realistic. We'll keep off-days lighter, not dead empty.</div>
 </div>
 {renderChoiceChips({
 items: TRAINING_WEEKDAY_CHIP_ITEMS,
 selectedValues: Array.isArray(answers?.available_training_days) ? answers.available_training_days : [],
 onSelect: (value) => toggleAvailableTrainingDay(value),
 testIdPrefix: "intake-goals-option-available-days",
 multi: true,
 })}
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>SESSION LENGTH</div>
 {renderChoiceChips({
 items: SESSION_LENGTH_OPTIONS.map((value) => ({ value, label: SESSION_LENGTH_LABELS[value] })),
 selectedValue: answers?.session_length || "",
 onSelect: (value) => updateSimpleAnswer("session_length", value),
 testIdPrefix: "intake-goals-option-session-length",
 })}
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>WHERE YOU TRAIN</div>
 {renderChoiceChips({
 items: ["Home", "Gym", "Outdoor", "Both", "Varies a lot"],
 selectedValue: trainingLocationValue,
 onSelect: (value) => updateTrainingLocationAnswer(value),
 testIdPrefix: "intake-goals-option-training-location",
 })}
 </div>
 {needsHomeEquipment ? (
 <div style={{ display:"grid", gap:"0.35rem", ...(intakeWideLayout ? { gridColumn:"1 / -1" } : {}) }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>HOME SETUP</div>
 {renderChoiceChips({
 items: ["Dumbbells", "Resistance bands", "Pull-up bar", "Bodyweight only", "Other"],
 selectedValues: homeEquipmentSelection,
 onSelect: (value) => toggleHomeEquipmentOption(value),
 testIdPrefix: "intake-goals-option-home-equipment",
 multi: true,
 })}
 {homeEquipmentSelection.includes("Other") ? (
 <input
 data-testid="intake-goals-input-home-equipment-other"
 value={answers?.home_equipment_other || ""}
 onChange={(e) => updateSimpleAnswer("home_equipment_other", e.target.value)}
 placeholder="Other home setup"
 />
 ) : null}
 </div>
 ) : null}
 <div style={{ display:"grid", gap:"0.35rem", ...(intakeWideLayout ? { gridColumn:"1 / -1" } : {}) }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>CURRENT ISSUES</div>
 {renderStructuredInjuryFields({ testIdPrefix: "intake-goals-compact-injury-structured" })}
 <textarea
 data-testid="intake-goals-input-injury-text"
 value={answers?.injury_text || ""}
 onChange={(e) => updateSimpleAnswer("injury_text", e.target.value)}
 placeholder="Optional extra context. Example: sharpest with downhill running or benching."
 rows={2}
 style={{ minHeight:82, resize:"vertical", fontSize:"0.86rem", lineHeight:1.5 }}
 />
 {(intakeInjuryContext.hasCurrentIssue || (Array.isArray(answers?.injury_limitations) && answers.injury_limitations.length > 0) || String(answers?.injury_area || "").trim()) ? renderChoiceChips({
 items: INTAKE_INJURY_IMPACT_OPTIONS,
 selectedValue: answers?.injury_impact || "",
 onSelect: (value) => updateSimpleAnswer("injury_impact", value),
 testIdPrefix: "intake-goals-option-injury-impact",
 }) : null}
 </div>
 <div style={{ display:"grid", gap:"0.35rem", borderTop:"1px solid rgba(111,148,198,0.12)", paddingTop:"0.75rem", ...(intakeWideLayout ? { gridColumn:"1 / -1" } : {}) }}>
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>COACHING TONE</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>Optional. If you skip it, we use Balanced coaching.</div>
 </div>
 {renderChoiceChips({
 items: ["Keep me consistent", "Balanced coaching", "Push me (with guardrails)"],
 selectedValue: answers?.coaching_style || "Balanced coaching",
 onSelect: (value) => updateSimpleAnswer("coaching_style", value),
 testIdPrefix: "intake-goals-option-coaching-style",
 })}
 </div>
 {goalsStageNeeds.length > 0 ? (
 <div data-testid="intake-goals-needs" style={{ display:"grid", gap:"0.28rem", ...(intakeWideLayout ? { gridColumn:"1 / -1" } : {}) }}>
 {goalsStageNeeds.map((item) => (
 <div key={item} style={{ fontSize:"0.54rem", color:"#9fb4d3", lineHeight:1.5 }}>{item}</div>
 ))}
 </div>
 ) : (
 <div data-testid="intake-goals-needs" style={{ fontSize:"0.54rem", color:"#9fe8c7", lineHeight:1.5, ...(intakeWideLayout ? { gridColumn:"1 / -1" } : {}) }}>
 Enough to shape week one. The main action will try to build right from here.
 </div>
 )}
 </div>
 </div>
 );
const renderGoalsStage = () => (
 <div data-testid="intake-goals-step" style={{ display:"grid", gap:"0.95rem" }}>
{renderSectionLabel("Setup", "Capture goals fast", "Structured first, custom second, and only the details that change week one.")}
 <div style={{ display:"grid", gridTemplateColumns:intakeWideLayout ? "minmax(0, 1.08fr) minmax(320px, 0.92fr)" : "1fr", gap:"0.95rem", alignItems:"start" }}>
 {renderGoalSelectionSurface()}
 {renderPlanningRealitySurface()}
 </div>
 </div>
 );
const renderInterpretationStage = () => (
 <div data-testid="intake-interpretation-step" style={{ display:"grid", gap:"0.95rem" }}>
 {renderSectionLabel("Draft", "Your setup draft", assessing ? INTAKE_COPY_DECK.interpretation.assessingHelper : "Priority order, tracking, and the first plan shape are taking form now.")}
 <div style={{ display:"grid", gap:"0.75rem", border:"1px solid rgba(0,194,255,0.18)", borderRadius:20, padding:"1rem", background:"linear-gradient(180deg, rgba(0,194,255,0.08), rgba(8,14,25,0.78))" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.52rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>{INTAKE_COPY_DECK.interpretation.bannerEyebrow}</div>
 <div style={{ fontSize:"0.54rem", color:"#dbe7f6" }}>{INTAKE_COPY_DECK.interpretation.bannerHelper}</div>
 </div>
 <div style={{ fontSize:"0.64rem", color:"#f8fbff", lineHeight:1.55 }}>
 {assessing
 ? "Resolving your goals, tradeoffs, and first tracking markers."
 : assessmentText || INTAKE_COPY_DECK.interpretation.emptyState}
 </div>
 </div>
 {assessing ? (
 <div style={{ display:"grid", gap:"0.55rem" }}>
 {[0, 1].map((index) => (
 <div key={index} style={{ height:92, borderRadius:18, border:"1px solid rgba(111,148,198,0.12)", background:"linear-gradient(90deg, rgba(15,23,42,0.78), rgba(30,41,59,0.46), rgba(15,23,42,0.78))" }} />
 ))}
 </div>
 ) : interpretedGoalCards.length > 0 ? (
 renderGoalCardStack(interpretedGoalCards, { mode: "proposal" })
 ) : (
 <div style={{ border:"1px solid rgba(111,148,198,0.14)", borderRadius:18, padding:"0.95rem", background:"rgba(8,14,25,0.78)", fontSize:"0.6rem", color:"#9fb4d3", lineHeight:1.55 }}>
 {INTAKE_COPY_DECK.interpretation.emptyState}
 </div>
 )}
 </div>
 );
 const renderMachineAnchorStructuredInput = (anchor = null) => {
 const fieldId = String(anchor?.field_id || "").trim();
 if (!fieldId) return null;
 const fieldFragment = toTestIdFragment(fieldId);
 if (anchor?.input_type === "choice_chips") {
 return renderChoiceChips({
 items: (Array.isArray(anchor?.options) ? anchor.options : []).map((option) => ({ value: option.value, label: option.label })),
 selectedValue: clarificationValues?.[fieldId] || "",
 onSelect: (value) => updateClarificationValue(fieldId, value),
 testIdPrefix: `intake-anchor-choice-${fieldFragment}`,
 });
 }
 if (anchor?.input_type === "date_or_month") {
 return (
 <div style={{ display:"grid", gap:"0.5rem" }}>
 <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
 {[
 { value: "month", label: "Target month" },
 { value: "date", label: "Exact date" },
 ...(anchor?.allow_open_ended ? [{ value: OPEN_ENDED_TIMING_VALUE, label: "Open-ended" }] : []),
 ].map((modeOption) => (
 <button
 key={modeOption.value}
 data-testid={`intake-anchor-mode-${fieldFragment}-${toTestIdFragment(modeOption.value)}`}
 className={String(clarificationValues?.[`${fieldId}__mode`] || "month") === modeOption.value ? "btn btn-primary" : "btn"}
 onClick={() => updateClarificationValue(`${fieldId}__mode`, modeOption.value)}
 style={{ fontSize:"0.5rem", color:String(clarificationValues?.[`${fieldId}__mode`] || "month") === modeOption.value ? "#08111d" : "#dbe7f6", borderColor:String(clarificationValues?.[`${fieldId}__mode`] || "month") === modeOption.value ? "#dbe7f6" : "#324961", background:String(clarificationValues?.[`${fieldId}__mode`] || "month") === modeOption.value ? "#dbe7f6" : "transparent" }}
 >
 {modeOption.label}
 </button>
 ))}
 </div>
 {String(clarificationValues?.[`${fieldId}__mode`] || "month") === OPEN_ENDED_TIMING_VALUE ? (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
 No fixed deadline. We will treat this as an ongoing goal and show the next phase in the visible plan.
 </div>
 ) : (
 <input
 data-testid={`intake-anchor-input-${fieldFragment}`}
 type={String(clarificationValues?.[`${fieldId}__mode`] || "month") === "date" ? "date" : "month"}
 value={clarificationValues?.[fieldId] || ""}
 onChange={(e) => updateClarificationValue(fieldId, e.target.value)}
 />
 )}
 </div>
 );
 }
 if (anchor?.input_type === "number_with_unit") {
 return (
 <div style={{ display:"grid", gap:"0.5rem" }}>
 <input
 data-testid={`intake-anchor-input-${fieldFragment}`}
 type="number"
 value={clarificationValues?.[fieldId] || ""}
 onChange={(e) => updateClarificationValue(fieldId, e.target.value)}
 placeholder={anchor?.placeholder || ""}
 />
 {renderChoiceChips({
 items: (Array.isArray(anchor?.unit_options) ? anchor.unit_options : []).map((option) => ({ value: option.value, label: option.label || option.value })),
 selectedValue: clarificationValues?.[`${fieldId}__unit`] || anchor?.unit || "",
 onSelect: (value) => updateClarificationValue(`${fieldId}__unit`, value),
 testIdPrefix: `intake-anchor-unit-${fieldFragment}`,
 })}
 </div>
 );
 }
 if (anchor?.input_type === "strength_top_set") {
 return (
 <div style={{ display:"grid", gap:"0.5rem" }}>
 <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
 {[
 { value: "top_set", label: "Top set" },
 { value: "estimated_max", label: "Estimated max" },
 ].map((modeOption) => (
 <button
 key={modeOption.value}
 data-testid={`intake-anchor-mode-${fieldFragment}-${toTestIdFragment(modeOption.label)}`}
 className={String(clarificationValues?.[`${fieldId}__mode`] || "top_set") === modeOption.value ? "btn btn-primary" : "btn"}
 onClick={() => updateClarificationValue(`${fieldId}__mode`, modeOption.value)}
 style={{ fontSize:"0.5rem", color:String(clarificationValues?.[`${fieldId}__mode`] || "top_set") === modeOption.value ? "#08111d" : "#dbe7f6", borderColor:String(clarificationValues?.[`${fieldId}__mode`] || "top_set") === modeOption.value ? "#dbe7f6" : "#324961", background:String(clarificationValues?.[`${fieldId}__mode`] || "top_set") === modeOption.value ? "#dbe7f6" : "transparent" }}
 >
 {modeOption.label}
 </button>
 ))}
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:"0.5rem" }}>
 <input
 data-testid={`intake-anchor-input-${fieldFragment}-weight`}
 type="number"
 value={clarificationValues?.[`${fieldId}__weight`] || ""}
 onChange={(e) => updateClarificationValue(`${fieldId}__weight`, e.target.value)}
 placeholder="Weight"
 />
 {String(clarificationValues?.[`${fieldId}__mode`] || "top_set") === "estimated_max" ? (
 <div />
 ) : (
 <input
 data-testid={`intake-anchor-input-${fieldFragment}-reps`}
 type="number"
 value={clarificationValues?.[`${fieldId}__reps`] || ""}
 onChange={(e) => updateClarificationValue(`${fieldId}__reps`, e.target.value)}
 placeholder="Reps"
 />
 )}
 </div>
 </div>
 );
 }
 return (
 <input
 data-testid={`intake-anchor-input-${fieldFragment}`}
 value={clarificationValues?.[fieldId] || ""}
 onChange={(e) => updateClarificationValue(fieldId, e.target.value)}
 placeholder={anchor?.placeholder || ""}
 />
 );
 };
 const renderMachineAnchorCard = (anchor = null, { isPrimary = false } = {}) => {
 if (!anchor?.field_id) return null;
 const displayCopy = isPrimary ? activeAnchorDisplayCopy : resolveCoachVoiceDisplayCopy({ anchor, phrasing: null });
 const canUseNaturalMode = isPrimary && allowNaturalAnchorMode && !multiAnchorCollectionMode;
 const fieldError = clarificationFieldErrors?.[anchor.field_id] || "";
 return (
 <div
 key={anchor.anchor_id || anchor.field_id}
 data-testid={isPrimary ? "intake-anchor-card-active" : "intake-anchor-card"}
 data-field-id={anchor.field_id || ""}
 data-anchor-id={anchor.anchor_id || ""}
 style={{
 display:"grid",
 gap:"0.6rem",
 border:`1px solid ${isPrimary ? "rgba(0,194,255,0.24)" : "rgba(111,148,198,0.16)"}`,
 borderRadius:18,
 padding:"0.85rem",
 background:isPrimary ? "rgba(7,18,33,0.92)" : "rgba(8,14,25,0.82)",
 }}
 >
 <div style={{ display:"grid", gap:"0.24rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.48rem", color:isPrimary ? "#dbe7f6" : "#8fa5c8", letterSpacing:"0.12em" }}>{anchor.status_label || (isPrimary ? "REQUIRED NOW" : "ALSO REQUIRED")}</div>
 <div data-testid="intake-anchor-provenance" style={{ fontSize:"0.46rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {INTAKE_COPY_DECK.clarify.baselineNote}
 </div>
 </div>
 <div style={{ fontSize:"0.62rem", color:"#f8fbff", lineHeight:1.45 }}>{displayCopy?.questionText || anchor?.question || anchor?.label}</div>
 {(displayCopy?.helperText || anchor?.why_it_matters) ? (
 <div data-testid="intake-anchor-why-it-matters" style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.5 }}>
 {displayCopy?.helperText || anchor?.why_it_matters}
 </div>
 ) : null}
 {displayCopy?.reassuranceLine ? (
 <div data-testid="intake-anchor-context-line" style={{ fontSize:"0.46rem", color:"#8fa5c8", lineHeight:1.45 }}>{displayCopy.reassuranceLine}</div>
 ) : null}
 </div>
 {canUseNaturalMode ? (
 <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
 <button
 data-testid="intake-anchor-toggle-structured"
 className={anchorEntryMode === "structured" ? "btn btn-primary" : "btn"}
 onClick={() => setAnchorEntryMode("structured")}
 style={{ fontSize:"0.5rem", color:anchorEntryMode === "structured" ? "#08111d" : "#dbe7f6", borderColor:anchorEntryMode === "structured" ? "#dbe7f6" : "#324961", background:anchorEntryMode === "structured" ? "#dbe7f6" : "transparent" }}
 >
 {INTAKE_COPY_DECK.clarify.structuredToggle}
 </button>
 <button
 data-testid="intake-anchor-toggle-natural"
 className={anchorEntryMode === "natural" ? "btn btn-primary" : "btn"}
 onClick={() => setAnchorEntryMode("natural")}
 style={{ fontSize:"0.5rem", color:anchorEntryMode === "natural" ? "#08111d" : "#dbe7f6", borderColor:anchorEntryMode === "natural" ? "#dbe7f6" : "#324961", background:anchorEntryMode === "natural" ? "#dbe7f6" : "transparent" }}
 >
 {INTAKE_COPY_DECK.clarify.naturalToggle}
 </button>
 </div>
 ) : null}
 {canUseNaturalMode && anchorEntryMode === "natural" ? (
 <textarea
 data-testid="intake-anchor-natural-input"
 value={naturalAnchorDraft}
 onChange={(e) => setNaturalAnchorDraft(e.target.value)}
 placeholder={anchor?.placeholder || INTAKE_COPY_DECK.clarify.naturalPlaceholder}
 rows={3}
 style={{ minHeight:88, resize:"vertical", fontSize:"0.88rem", lineHeight:1.55 }}
 />
 ) : renderMachineAnchorStructuredInput(anchor)}
 {isPrimary && anchorCapturePreview?.captureText ? (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
 {anchorCapturePreview.captureText}
 {anchorCapturePreview.question ? ` ${anchorCapturePreview.question}` : ""}
 </div>
 ) : null}
 {fieldError ? (
 <div style={{ fontSize:"0.52rem", color:C.amber, lineHeight:1.5 }}>{fieldError}</div>
 ) : null}
 </div>
 );
 };
 const renderStructuredClarificationField = (field = null) => {
 const fieldKey = String(field?.key || "").trim();
 if (!fieldKey) return null;
 const fieldError = clarificationFieldErrors?.[fieldKey] || "";
 if (field?.inputType === "choice_chips") {
 return (
 <div key={fieldKey} style={{ display:"grid", gap:"0.38rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45, fontWeight:600 }}>{field.label || fieldKey}</div>
 {field?.helperText ? (
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>{field.helperText}</div>
 ) : null}
 {renderChoiceChips({
 items: (Array.isArray(field?.choiceOptions) ? field.choiceOptions : []).map((option) => ({
 value: option?.value || option,
 label: option?.label || option?.value || option,
 })),
 selectedValue: clarificationValues?.[fieldKey] || "",
 onSelect: (value) => updateClarificationValue(fieldKey, value),
 testIdPrefix: `intake-clarify-field-${toTestIdFragment(fieldKey)}`,
 })}
 {fieldError ? (
 <div style={{ fontSize:"0.48rem", color:"#ffd7d7", lineHeight:1.45 }}>{fieldError}</div>
 ) : null}
 </div>
 );
 }
 return (
 <label key={fieldKey} style={{ display:"grid", gap:"0.32rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45, fontWeight:600 }}>{field.label || fieldKey}</div>
 <input
 data-testid={`intake-clarify-field-${toTestIdFragment(fieldKey)}`}
 type={field?.inputType === "number" ? "number" : "text"}
 inputMode={field?.inputType === "number" ? "decimal" : undefined}
 min={field?.min}
 max={field?.max}
 value={clarificationValues?.[fieldKey] || ""}
 onChange={(e) => updateClarificationValue(fieldKey, e.target.value)}
 placeholder={field?.placeholder || ""}
 style={{
 borderColor: fieldError ? "rgba(255,123,123,0.55)" : "rgba(111,148,198,0.18)",
 background:"rgba(4,10,18,0.62)",
 }}
 />
 {field?.helperText ? (
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>{field.helperText}</div>
 ) : null}
 {fieldError ? (
 <div style={{ fontSize:"0.48rem", color:"#ffd7d7", lineHeight:1.45 }}>{fieldError}</div>
 ) : null}
 </label>
 );
 };
 const renderReadyToBuildPanel = () => (
 <div data-testid="intake-confirm-step" style={{ display:"grid", gap:"0.95rem" }}>
 <div data-testid="intake-review" style={{ display:"grid", gap:"0.7rem" }}>
 <div style={{ border:"1px solid rgba(111,148,198,0.14)", borderRadius:18, padding:"0.9rem", background:"rgba(8,14,25,0.78)" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", letterSpacing:"0.12em", marginBottom:"0.22rem" }}>GOAL PRIORITY ORDER</div>
 <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.55 }}>
 Reorder directly here. The plan gives more weight to higher priorities while still balancing the rest where they fit cleanly.
 </div>
 </div>
 {interpretedGoalCards.length > 0 ? renderGoalCardStack(interpretedGoalCards, { mode: "confirm" }) : null}
 {goalStackReview.backgroundPriority ? (
 <div style={{ border:"1px solid rgba(111,148,198,0.14)", borderRadius:18, padding:"0.9rem", background:"rgba(8,14,25,0.78)" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"center", flexWrap:"wrap" }}>
 <div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", letterSpacing:"0.12em", marginBottom:"0.18rem" }}>RECOVERY POSTURE</div>
 <div style={{ fontSize:"0.62rem", color:"#f8fbff", lineHeight:1.45 }}>{goalStackReview.backgroundPriority.label}</div>
 </div>
 <button
 data-testid="intake-confirm-toggle-recovery"
 className="btn"
 onClick={toggleBackgroundPriority}
 style={{ fontSize:"0.5rem", color:"#dbe7f6", borderColor:"#324961" }}
 >
 {goalStackReview.backgroundPriority.enabled ? "Let recovery flex" : "Keep recovery protected"}
 </button>
 </div>
 <div style={{ fontSize:"0.54rem", color:"#8fa5c8", marginTop:"0.22rem", lineHeight:1.5 }}>{goalStackReview.backgroundPriority.summary}</div>
 </div>
 ) : null}
 {goalReviewContract?.tradeoff_statement ? (
 <div data-testid="intake-tradeoff-statement" style={{ border:"1px solid rgba(255,138,0,0.18)", borderRadius:18, padding:"0.9rem", background:"rgba(8,14,25,0.78)" }}>
 <div style={{ fontSize:"0.48rem", color:C.amber, letterSpacing:"0.12em", marginBottom:"0.22rem" }}>BALANCING NOTES</div>
 <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.55 }}>{goalReviewContract.tradeoff_statement}</div>
 </div>
 ) : null}
 <div style={{ border:"1px solid rgba(111,148,198,0.14)", borderRadius:18, padding:"0.9rem", background:"rgba(8,14,25,0.78)", display:"grid", gap:"0.45rem" }}>
<div style={{ fontSize:"0.48rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>READY TO GO</div>
 <div style={{ fontSize:"0.66rem", color:reviewStatePending ? "#8fa5c8" : confirmationTone, lineHeight:1.45 }}>
 {reviewStatePending ? "Updating the remaining build details." : confirmationHeadline}
 </div>
 {reviewStatePending ? (
 <div data-testid="intake-review-refreshing" style={{ fontSize:"0.54rem", color:"#8fa5c8", lineHeight:1.5 }}>
 Checking whether any week-one anchors still need to come back into view before build.
 </div>
 ) : null}
 {!reviewStatePending && confirmationNeedsList.length > 0 ? (
 <div style={{ display:"grid", gap:"0.24rem" }}>
 {confirmationNeedsList.map((item) => (
 <div key={item} style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.5 }}>{item}</div>
 ))}
 </div>
 ) : null}
 {!reviewStatePending && milestoneDecisionModel ? (
 <div data-testid="intake-target-shape" style={{ border:"1px solid rgba(111,148,198,0.14)", borderRadius:16, padding:"0.75rem", background:"rgba(15,23,42,0.72)", display:"grid", gap:"0.45rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", letterSpacing:"0.12em" }}>TIMING</div>
 <div data-testid="intake-target-shape-headline" style={{ fontSize:"0.62rem", color:"#f8fbff", lineHeight:1.45 }}>{milestoneDecisionModel.headline}</div>
 {milestoneDecisionModel.supportingText ? (
 <div data-testid="intake-target-shape-supporting" style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.55 }}>
 {milestoneDecisionModel.supportingText}
 </div>
 ) : null}
 {selectedMilestoneLongTermTarget ? (
 <div data-testid="intake-target-shape-long-term" style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
 Longer-term target: {selectedMilestoneLongTermTarget}
 </div>
 ) : null}
 <div style={{ display:"grid", gap:"0.38rem" }}>
 {(Array.isArray(milestoneDecisionModel.choices) ? milestoneDecisionModel.choices : []).map((choice) => {
 const selected = String(milestoneDecisionModel.selectedKey || "") === String(choice?.key || "");
 return (
 <button
 key={choice?.key || choice?.label}
 type="button"
 data-testid={`intake-target-path-${String(choice?.key || "").trim()}`}
 className="btn"
 onClick={() => selectMilestonePath(milestoneDecisionModel.goalId, choice?.key || "")}
 style={{
 display:"grid",
 gap:"0.16rem",
 textAlign:"left",
 padding:"0.7rem 0.75rem",
 borderRadius:14,
 borderColor:selected ? "#dbe7f6" : "#324961",
 background:selected ? "rgba(219,231,246,0.08)" : "transparent",
 color:"#dbe7f6",
 }}
 >
 <span style={{ fontSize:"0.56rem", color:selected ? "#f8fbff" : "#dbe7f6", lineHeight:1.45 }}>{choice?.label}</span>
 <span style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>{choice?.summary}</span>
 {selected ? (
 <span style={{ fontSize:"0.46rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>CURRENT PATH</span>
 ) : null}
 </button>
 );
 })}
 </div>
 </div>
 ) : null}
 {!reviewStatePending && (activeConfirmationState?.reason || confirmBuildError) ? (
 <div data-testid="intake-confirmation-message" style={{ fontSize:"0.54rem", color:confirmationTone, lineHeight:1.5 }}>
 {confirmBuildError || activeConfirmationState?.reason}
 </div>
 ) : null}
 {!reviewStatePending && (activeConfirmationState?.status === "block" || activeConfirmationState?.status === "incomplete") && activeConfirmationState?.next_required_field ? (
 <div>
 <button
 data-testid="intake-go-next-detail"
 className="btn"
 onClick={jumpToNextRequiredDetail}
 style={{ color:"#dbe7f6", borderColor:"#324961" }}
 >
 Go to the next detail
 </button>
 </div>
 ) : null}
 </div>
 </div>
 </div>
 );
const renderClarifyStage = () => (
 <div data-testid="intake-clarify-step" style={{ display:"grid", gap:"0.95rem" }}>
 {renderSectionLabel("Draft", "Tighten the first plan", "Answer only the details that still change week one or the starting dose.")}
 {heardGoalRows.length > 0 ? (
 <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
 {heardGoalRows.map((goal) => (
 <div key={goal.id} style={{ fontSize:"0.5rem", color:"#dbe7f6", border:"1px solid rgba(111,148,198,0.16)", borderRadius:999, padding:"0.22rem 0.5rem", background:"rgba(15,23,42,0.72)" }}>
 {goal.summary}
 </div>
 ))}
 </div>
 ) : null}
 <div style={{ display:"grid", gap:"0.75rem", border:"1px solid rgba(111,148,198,0.16)", borderRadius:20, padding:"1rem", background:"rgba(8,14,25,0.78)" }}>
 <div style={{ fontSize:"0.56rem", color:"#f8fbff", lineHeight:1.55 }}>
 {clarificationPromptText || "Everything important for week one is on this page. Add whatever is still missing, then continue."}
 </div>
 {clarificationValidationMessage ? (
 <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.5 }}>{clarificationValidationMessage}</div>
 ) : null}
 {isMachineAnchorClarification ? (
 <div data-testid="intake-anchor-sheet" style={{ display:"grid", gap:"0.65rem" }}>
 {visibleMachineAnchorCards.map((anchor, index) => renderMachineAnchorCard(anchor, { isPrimary: index === 0 }))}
 </div>
 ) : isStructuredClarification ? (
 <div style={{ display:"grid", gap:"0.55rem" }}>
 <div style={{ display:"grid", gap:"0.7rem", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))" }}>
 {clarificationInputFields.map((field) => renderStructuredClarificationField(field))}
 </div>
 {clarificationFormError ? (
 <div style={{ fontSize:"0.52rem", color:C.amber, lineHeight:1.5 }}>{clarificationFormError}</div>
 ) : null}
 </div>
 ) : pendingClarifyingQuestion?.prompt ? (
 <div style={{ display:"grid", gap:"0.55rem" }}>
 <textarea
 data-testid="intake-clarify-input"
 value={draft}
 onChange={(e) => setDraft(e.target.value)}
 placeholder={INTAKE_COPY_DECK.clarify.genericPlaceholder}
 rows={3}
 style={{ minHeight:92, resize:"vertical", fontSize:"0.88rem", lineHeight:1.55 }}
 />
 {clarificationFormError ? (
 <div style={{ fontSize:"0.52rem", color:C.amber, lineHeight:1.5 }}>{clarificationFormError}</div>
 ) : null}
 </div>
 ) : (
 <div style={{ fontSize:"0.54rem", color:"#9fe8c7", lineHeight:1.5 }}>
 No extra detail is required right now. Review the stack below and continue when it looks right.
 </div>
 )}
 {!isMachineAnchorClarification && clarificationFormError ? (
 <div style={{ fontSize:"0.52rem", color:C.amber, lineHeight:1.5 }}>{clarificationFormError}</div>
 ) : null}
 </div>
 {renderReadyToBuildPanel()}
 </div>
 );
 const renderConfirmStage = () => renderClarifyStage();
 const renderAdjustStage = () => (
 <div data-testid="intake-adjust-step" style={{ display:"grid", gap:"0.95rem" }}>
{renderSectionLabel("Change", INTAKE_COPY_DECK.adjust.title, adjustmentTargetGoal?.summary ? `Describe what should change about "${adjustmentTargetGoal.summary}".` : INTAKE_COPY_DECK.adjust.helper)}
 <div style={{ display:"grid", gap:"0.6rem", border:"1px solid rgba(111,148,198,0.16)", borderRadius:20, padding:"1rem", background:"rgba(8,14,25,0.78)" }}>
 <textarea
 data-testid="intake-adjust-input"
 ref={composerRef}
 value={draft}
 onChange={(e) => setDraft(e.target.value)}
 placeholder={adjustmentTargetGoal?.summary ? `Revise "${adjustmentTargetGoal.summary}"...` : INTAKE_COPY_DECK.adjust.placeholder}
 rows={4}
 style={{ minHeight:110, resize:"vertical", fontSize:"0.9rem", lineHeight:1.55 }}
 />
 </div>
 </div>
 );
 const renderBuildingStage = () => (
 <div data-testid="intake-building" style={{ display:"grid", gap:"0.8rem" }}>
{renderSectionLabel("Stage 3", "Your plan", INTAKE_COPY_DECK.build.helper)}
 <div style={{ display:"grid", gap:"0.55rem", border:"1px solid rgba(111,148,198,0.16)", borderRadius:20, padding:"1rem", background:"rgba(8,14,25,0.78)" }}>
 <div style={{ fontSize:"0.9rem", color:"#f8fbff" }}>{INTAKE_COPY_DECK.build.status}</div>
 <div data-testid="intake-building-stage" style={{ fontSize:"0.72rem", color:"#9fb4d3" }}>{BUILD_STAGES[buildingStageIndex]}</div>
 <div style={{ width:"100%", height:6, borderRadius:999, background:"rgba(111,148,198,0.14)", overflow:"hidden" }}>
 <div style={{ width:`${((buildingStageIndex + 1) / BUILD_STAGES.length) * 100}%`, height:"100%", borderRadius:999, background:"linear-gradient(90deg, #00c2ff, #27f59a)", transition:"width 0.45s ease" }} />
 </div>
 </div>
 </div>
 );
 const renderActiveStage = () => {
 if (phase === INTAKE_UI_PHASES.building) return renderBuildingStage();
 if (phase === INTAKE_UI_PHASES.adjust) return renderAdjustStage();
 if (phase === INTAKE_UI_PHASES.confirm) return renderConfirmStage();
 if (phase === INTAKE_UI_PHASES.clarify) return renderClarifyStage();
 if (phase === INTAKE_UI_PHASES.interpretation) return renderInterpretationStage();
 return renderGoalsStage();
 };
 const handleFooterBack = () => {
 if (phase === INTAKE_UI_PHASES.interpretation) {
 setPhase(INTAKE_UI_PHASES.goals);
 return;
 }
 if (phase === INTAKE_UI_PHASES.clarify) {
 goBackFromClarify();
 return;
 }
 if (phase === INTAKE_UI_PHASES.confirm) {
 goBackFromConfirm();
 return;
 }
 if (phase === INTAKE_UI_PHASES.adjust) {
 setPhase(activeReviewModel?.orderedResolvedGoals?.length ? INTAKE_UI_PHASES.clarify : INTAKE_UI_PHASES.goals);
 }
 };
 const clarifyReadyToBuild = phase === INTAKE_UI_PHASES.clarify
 && !reviewStatePending
 && !isMachineAnchorClarification
 && !pendingClarifyingQuestion?.prompt
 && !pendingSecondaryGoalPrompt
 && confirmCtaEnabled;
 const multiAnchorSheetComplete = multiAnchorCollectionMode
 && visibleMachineAnchorCards.every((anchor) => Boolean(buildAnchorSubmissionPayload(anchor)?.raw_text));
const handleFooterPrimaryAction = async () => {
 const nextAttempt = Number(stageAnalyticsRef.current?.continueClicks || 0) + 1;
 stageAnalyticsRef.current = {
 ...(stageAnalyticsRef.current || {}),
 continueClicks: nextAttempt,
 phase,
 stage: intakeMachineRef.current?.stage || intakeMachine?.stage || "",
 initialized: true,
 enteredAt: Number(stageAnalyticsRef.current?.enteredAt || Date.now()),
 };
 onTrackFrictionEvent({
 flow: "intake",
 action: "continue",
 outcome: "requested",
 props: {
 phase,
 stage: intakeMachineRef.current?.stage || intakeMachine?.stage || "",
 attempt_in_stage: nextAttempt,
 },
 });
 if (phase === INTAKE_UI_PHASES.goals) {
 await submitGoalsStage();
 return;
 }
 if (phase === INTAKE_UI_PHASES.interpretation) {
 continueFromInterpretation();
 return;
 }
 if (phase === INTAKE_UI_PHASES.clarify) {
 if (clarifyReadyToBuild) {
 await finalizePlan();
 return;
 }
 await submitClarification();
 return;
 }
 if (phase === INTAKE_UI_PHASES.confirm) {
 await finalizePlan();
 return;
 }
if (phase === INTAKE_UI_PHASES.adjust) {
await submitAdjustment();
}
};
const intakeHeroProgressLabel = pendingGoalSelection?.goalText
? "Finish current goal"
: intakeGoalSelections.length > 0
? `${intakeGoalSelections.length} goal${intakeGoalSelections.length === 1 ? "" : "s"} saved`
: "Add your first goal";
const footerPrimaryLabel = phase === INTAKE_UI_PHASES.confirm
? (confirmBuildSubmitting ? "Continuing..." : "Continue")
: phase === INTAKE_UI_PHASES.clarify
? (clarifyReadyToBuild
? (confirmBuildSubmitting ? "Continuing..." : "Continue")
: naturalAnchorSubmitting
? "Capturing..."
: "Continue")
: phase === INTAKE_UI_PHASES.adjust
? "Update goal"
: phase === INTAKE_UI_PHASES.goals
? (assessing ? "Building week one..." : "Build week one")
: "Continue";
 const footerPrimaryDisabled = phase === INTAKE_UI_PHASES.building
 ? true
 : phase === INTAKE_UI_PHASES.goals
 ? !goalsStageCanContinue || assessing
 : phase === INTAKE_UI_PHASES.interpretation
 ? assessing || !assessmentBoundary?.typedIntakePacket
 : phase === INTAKE_UI_PHASES.clarify
 ? (reviewStatePending
 ? true
 : clarifyReadyToBuild
 ? !confirmCtaEnabled || assessing || isCoachStreaming || confirmBuildSubmitting
 : isMachineAnchorClarification
 ? (multiAnchorCollectionMode
 ? !multiAnchorSheetComplete || naturalAnchorSubmitting
 : !(anchorEntryMode === "natural" ? String(naturalAnchorDraft || "").trim() : activeMachineAnchorSubmission?.raw_text) || naturalAnchorSubmitting)
 : isStructuredClarification
 ? clarificationInputFields.every((field) => !String(clarificationValues?.[field.key] || "").trim())
 : !draft.trim())
 : phase === INTAKE_UI_PHASES.confirm
 ? !confirmCtaEnabled || assessing || isCoachStreaming || confirmBuildSubmitting
 : phase === INTAKE_UI_PHASES.adjust
 ? !draft.trim()
 : false;
 const showFooterBack = ![INTAKE_UI_PHASES.goals, INTAKE_UI_PHASES.building].includes(phase);
 const showFoundationButton = phase === INTAKE_UI_PHASES.goals;
const intakeHeroModeLabel = phase === INTAKE_UI_PHASES.goals
? "Building your setup"
: phase === INTAKE_UI_PHASES.building
? "Building week one"
: phase === INTAKE_UI_PHASES.adjust
? "Updating the draft"
: clarifyReadyToBuild
? "Ready to continue"
: "Tightening the draft";
const intakeHeroSupport = phase === INTAKE_UI_PHASES.goals
? "Pick the goals fast, add only the details that matter, and build when the week looks right."
: phase === INTAKE_UI_PHASES.building
? "Turning the draft into your first live week now."
: "Answer only the details that change week one, then continue when it looks right.";

 return (
 <div
 data-testid="intake-root"
 data-intake-phase={phase}
 data-intake-stage={String(intakeMachine?.stage || "")}
 data-current-question-key={String(currentPrompt?.key || "")}
 data-current-field-id={String(activeMachineAnchor?.field_id || "")}
 data-current-anchor-id={String(activeMachineAnchor?.anchor_id || "")}
 data-confirmation-status={String(activeConfirmationState?.status || "")}
 data-review-refresh-pending={reviewStatePending ? "true" : "false"}
 style={{ minHeight:"100vh", display:"flex", justifyContent:"center", background:"radial-gradient(120% 120% at 10% 0%, rgba(0,194,255,0.14), transparent 38%), radial-gradient(110% 110% at 100% 0%, rgba(255,138,0,0.12), transparent 36%), linear-gradient(180deg,#05080f 0%, #0a1322 55%, #0d182b 100%)", padding:"clamp(0.9rem, 2.6vw, 1.5rem)" }}
 style={{ minHeight:"100vh", display:"flex", justifyContent:"center", background:"radial-gradient(120% 120% at 10% 0%, color-mix(in srgb, var(--brand-accent-soft) 78%, transparent), transparent 40%), radial-gradient(110% 110% at 100% 0%, rgba(255,190,118,0.08), transparent 34%), var(--bg)", padding:"clamp(0.9rem, 2.6vw, 1.5rem)" }}
 >
 <div style={{ width:"100%", maxWidth:1180, display:"grid", gap:"1rem", minHeight:"calc(100vh - 2rem)" }}>
 <SurfaceHero
 accentColor={C.blue}
 style={{
 background:"linear-gradient(180deg, color-mix(in srgb, var(--panel-3) 78%, transparent) 0%, color-mix(in srgb, var(--panel-2) 92%, transparent) 100%)",
 borderColor:"color-mix(in srgb, var(--border-strong) 86%, rgba(255,255,255,0.05))",
 boxShadow:"var(--shadow-2)",
 }}
 >
 <SurfaceHeroHeader>
 <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", minWidth:0, flex:"1 1 320px" }}>
 <div style={{ width:48, height:48, borderRadius:18, display:"grid", placeItems:"center", background:"linear-gradient(135deg, color-mix(in srgb, var(--brand-accent-soft) 88%, transparent), color-mix(in srgb, var(--panel-2) 96%, transparent))", border:"1px solid color-mix(in srgb, var(--border-strong) 82%, rgba(255,255,255,0.05))", fontFamily:"var(--font-display)", fontWeight:700, letterSpacing:"0.08em", color:"var(--text-strong)", flexShrink:0, boxShadow:"var(--shadow-1)" }}>
 {PRODUCT_BRAND.mark}
 </div>
 <SurfaceHeroCopy>
 <div data-testid="intake-shell-title" className="surface-title surface-title-hero" style={{ color:"var(--text-strong)" }}>{PRODUCT_BRAND.name} {INTAKE_COPY_DECK.shell.title}</div>
 <div data-testid="intake-shell-subtitle" className="surface-support" style={{ color:"var(--text-soft)" }}>
 {intakeHeroSupport} {INTAKE_COPY_DECK.shell.progressSuffix}
 </div>
 </SurfaceHeroCopy>
 </div>
 <SurfaceMetaRow style={{ justifyContent: intakeWideLayout ? "flex-end" : "flex-start" }}>
<SurfacePill style={{ color:"var(--text-strong)", background:"color-mix(in srgb, var(--brand-accent-soft) 82%, transparent)", borderColor:"color-mix(in srgb, var(--brand-accent) 24%, var(--border-strong))" }}>
{intakeHeroModeLabel}
</SurfacePill>
<SurfacePill style={{ color:"var(--text-soft)", background:"color-mix(in srgb, var(--surface-2) 94%, transparent)", borderColor:"color-mix(in srgb, var(--border) 90%, rgba(255,255,255,0.04))" }}>
{intakeHeroProgressLabel}
</SurfacePill>
</SurfaceMetaRow>
 </SurfaceHeroHeader>
 <div style={{ fontSize:"0.54rem", color:"var(--text)", lineHeight:1.58, maxWidth:760 }}>
 {phase === INTAKE_UI_PHASES.goals
 ? "Choose the goal, add the few details that change the first plan, and keep the live summary in view the whole time."
 : "The goal draft, first-week shape, tracking focus, and open details stay visible while you tighten the setup."}
 </div>
 </SurfaceHero>

 <div style={{ display:"grid", gap:"1rem", alignItems:"start", gridTemplateColumns: intakeWideLayout ? "minmax(0, 1.18fr) minmax(320px, 0.82fr)" : "1fr" }}>
 <section style={{ minWidth:0, display:"grid", gap:"1rem" }}>
 <SurfaceCard variant="elevated" style={{ border:"1px solid color-mix(in srgb, var(--border-strong) 84%, rgba(255,255,255,0.05))", borderRadius:30, background:"linear-gradient(180deg, color-mix(in srgb, var(--panel-2) 96%, transparent) 0%, color-mix(in srgb, var(--panel) 98%, transparent) 100%)", boxShadow:"var(--shadow-2)", padding:"clamp(1rem, 2.8vw, 1.35rem)", backdropFilter:"blur(16px)" }}>
 {renderActiveStage()}
 </SurfaceCard>
 </section>
 <aside style={{ minWidth:0 }}>
 <IntakeSummaryRail
 summaryRail={intakeSummaryRail}
 previewModel={intakePlanPreviewModel}
 phase={phase}
 confirmationStatusLabel={confirmationStatusLabel}
 />
 </aside>
 </div>

 <div style={{ position:"sticky", bottom:0, paddingBottom:"max(0.2rem, env(safe-area-inset-bottom))" }}>
 <div style={{ border:"1px solid color-mix(in srgb, var(--border) 90%, rgba(255,255,255,0.05))", borderRadius:26, background:"linear-gradient(180deg, color-mix(in srgb, var(--panel-2) 90%, transparent) 0%, color-mix(in srgb, var(--panel) 96%, transparent) 100%)", boxShadow:"var(--shadow-2)", backdropFilter:"blur(16px)", padding:"0.9rem 1rem", display:"flex", justifyContent:"space-between", gap:"0.75rem", alignItems:"center", flexWrap:"wrap" }}>
<div style={{ fontSize:"0.54rem", color:"var(--text-soft)", lineHeight:1.55, flex:"1 1 240px" }}>
{phase === INTAKE_UI_PHASES.goals
? "Add at least one goal, set the weekly reality, and the main action will try to build from here."
: phase === INTAKE_UI_PHASES.interpretation
? INTAKE_COPY_DECK.footer.interpretation
: phase === INTAKE_UI_PHASES.clarify
 ? INTAKE_COPY_DECK.footer.clarify
 : phase === INTAKE_UI_PHASES.confirm
 ? INTAKE_COPY_DECK.footer.confirm
 : phase === INTAKE_UI_PHASES.building
 ? INTAKE_COPY_DECK.footer.building
 : INTAKE_COPY_DECK.footer.adjust}
 </div>
 <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
 {showFooterBack ? (
 <button
 data-testid="intake-footer-back"
 className="btn"
 onClick={handleFooterBack}
 disabled={confirmBuildSubmitting || naturalAnchorSubmitting}
 style={{ color:"#dbe7f6", borderColor:"#324961" }}
 >
 Back
 </button>
 ) : null}
 {showFoundationButton ? (
 <button
 data-testid="intake-footer-foundation"
 className="btn"
 onClick={startFoundationPlanFlow}
 disabled={assessing || confirmBuildSubmitting}
 style={{ color:"#dbe7f6", borderColor:"#324961" }}
 >
Quick start plan
 </button>
 ) : null}
 {phase !== INTAKE_UI_PHASES.building ? (
 <button
 data-testid={phase === INTAKE_UI_PHASES.confirm || clarifyReadyToBuild ? "intake-confirm-build" : "intake-footer-continue"}
 className="btn btn-primary"
 onClick={handleFooterPrimaryAction}
 disabled={footerPrimaryDisabled}
 >
 {phase === INTAKE_UI_PHASES.confirm || clarifyReadyToBuild
 ? (confirmBuildSubmitting ? "Continuing..." : "Continue")
 : footerPrimaryLabel}
 </button>
 ) : null}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}

function ThemePreviewAction({ label, primary = false, tokens = {}, chrome = {} }) {
 return (
 <div
 style={{
 minWidth:0,
 borderRadius:chrome.radiusSm || 10,
 border:primary ? `1px solid ${tokens.ctaBorder || tokens.border}` : `1px solid ${tokens.border}`,
 background:primary ? (tokens.ctaBg || tokens.accent) : (tokens.surface2 || tokens.panel2),
 color:primary ? (tokens.ctaText || tokens.accentContrast || tokens.textStrong) : (tokens.text || tokens.textStrong),
 fontFamily:tokens.fontBody,
 fontSize:"0.39rem",
 fontWeight:700,
 letterSpacing:"0.04em",
 textTransform:"uppercase",
 textAlign:"center",
 padding:"0.22rem 0.4rem",
 boxShadow:primary ? (tokens.shadow1 || "none") : "none",
 whiteSpace:"nowrap",
 }}
 >
 {label}
 </div>
 );
}

function ThemePreviewSurface({ previewModel = null }) {
 const tokens = previewModel?.tokens || {};
 const chrome = previewModel?.chrome || {};
 const listItems = Array.isArray(previewModel?.listItems) ? previewModel.listItems.slice(0, 2) : [];
 const swatches = Array.isArray(previewModel?.swatches) && previewModel.swatches.length
 ? previewModel.swatches
 : [tokens.surface1, tokens.accent, tokens.textStrong, tokens.badgeText];
 const shellPanelStyle = {
 minWidth:0,
 minHeight:168,
 overflow:"hidden",
 border:`1px solid ${tokens.border || "rgba(255,255,255,0.12)"}`,
 borderRadius:chrome.radiusLg || 18,
 padding:"0.66rem",
 background:tokens.background || tokens.panel,
 boxShadow:tokens.shadow1 || "none",
 display:"grid",
 gap:"0.38rem",
 color:tokens.text || "#fff",
 };
 const cardStyle = {
 minWidth:0,
 border:`1px solid ${tokens.border || "rgba(255,255,255,0.12)"}`,
 borderRadius:chrome.radiusMd || 14,
 background:tokens.panel || tokens.surface1,
 padding:"0.42rem",
 display:"grid",
 gap:"0.24rem",
 };
 const smallCardStyle = {
 ...cardStyle,
 padding:"0.36rem",
 background:tokens.panel2 || tokens.surface2 || tokens.panel,
 };
 const metaStyle = {
 fontSize:"0.38rem",
 letterSpacing:"0.08em",
 textTransform:"uppercase",
 color:tokens.textSoft || tokens.text,
 };
 const badgeStyle = {
 fontSize:"0.39rem",
 color:tokens.badgeText,
 background:tokens.badgeBg,
 border:`1px solid ${tokens.badgeBorder}`,
 borderRadius:999,
 padding:"0.1rem 0.32rem",
 whiteSpace:"nowrap",
 };
 const chartStops = [
 tokens.ctaBg || swatches[1] || tokens.accent,
 swatches[2] || tokens.accent,
 swatches[3] || tokens.textStrong,
 ];

 return (
 <div style={shellPanelStyle}>
 <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.35rem", minWidth:0 }}>
 <div style={{ minWidth:0, display:"grid", gap:"0.08rem" }}>
 <div style={{ fontFamily:tokens.fontDisplay, fontSize:"0.66rem", color:tokens.textStrong, lineHeight:1.05 }}>{PRODUCT_BRAND.name}</div>
 <div style={metaStyle}>{previewModel.subtitle || previewModel.eyebrow}</div>
 </div>
 <div style={badgeStyle}>
 {previewModel.modeLabel}
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.2fr) minmax(88px,0.8fr)", gap:"0.32rem", alignItems:"stretch" }}>
 <div style={cardStyle}>
 <div style={{ ...metaStyle, color:tokens.accent }}>{previewModel.label}</div>
 <div style={{ fontFamily:tokens.fontDisplay, fontSize:"0.72rem", color:tokens.textStrong, lineHeight:1.08, overflowWrap:"anywhere" }}>{previewModel.headline}</div>
 <div style={{ fontSize:"0.42rem", color:tokens.text, lineHeight:1.45 }}>{previewModel.body}</div>
 <div style={{ display:"flex", gap:"0.24rem", flexWrap:"wrap" }}>
 <ThemePreviewAction label={previewModel.accentLabel || "Primary"} primary tokens={tokens} chrome={chrome} />
 <ThemePreviewAction label="Secondary" tokens={tokens} chrome={chrome} />
 </div>
 </div>
 <div style={{ ...smallCardStyle, alignContent:"space-between" }}>
 <div style={metaStyle}>{previewModel.metricLabel}</div>
 <div style={{ fontFamily:tokens.fontDisplay, fontSize:"0.72rem", color:tokens.textStrong, lineHeight:1 }}>{previewModel.metricValue}</div>
 <div style={{ fontSize:"0.4rem", color:tokens.textSoft, lineHeight:1.35, overflowWrap:"anywhere", textTransform:"capitalize" }}>
 {previewModel.hueFamily || previewModel.previewFamily}
 </div>
 </div>
 </div>
 <div style={{ ...cardStyle, background:tokens.panel2 || tokens.surface2 || tokens.panel }}>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:"0.22rem", alignItems:"end" }}>
 {chartStops.map((color, index) => (
 <div key={`${previewModel.id}_chart_${index}`} style={{ display:"grid", gap:"0.12rem" }}>
 <div
 style={{
 height:14 + (index * 8),
 borderRadius:999,
 background:color,
 border:`1px solid ${index === 0 ? (tokens.ctaBorder || tokens.border) : tokens.border}`,
 }}
 />
 <div style={{ height:4, borderRadius:999, background:swatches[index] || tokens.surface1, opacity:index === 2 ? 0.72 : 1 }} />
 </div>
 ))}
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 96px),1fr))", gap:"0.24rem" }}>
 {listItems.map((item) => (
 <div key={`${previewModel.id}_${item}`} style={{ ...smallCardStyle, gap:"0.1rem" }}>
 <div style={{ ...metaStyle, color:tokens.textSoft }}>{previewModel.listLabel}</div>
 <div style={{ fontSize:"0.41rem", color:tokens.text, lineHeight:1.42 }}>{item}</div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}

function AppearanceThemeSection({ appearance = {}, onPatchAppearance = null }) {
 const normalizedAppearance = normalizeAppearanceSettings(appearance);
 const previewItems = useMemo(() => (
 BRAND_THEME_OPTIONS.map((themeOption) => {
 const previewTheme = buildBrandThemeState({
 appearance: { theme: themeOption.id, mode: normalizedAppearance.mode },
 });
 return {
 id: themeOption.id,
 themeOption,
 previewTheme,
 previewModel: buildBrandThemePreviewModel({ brandThemeState: previewTheme }),
 };
 })
 ), [normalizedAppearance.mode]);
 const handleThemeChange = (themeId) => {
 if (typeof onPatchAppearance !== "function") return;
 onPatchAppearance({
 ...appearance,
 theme: themeId,
 mode: normalizedAppearance.mode,
 });
 };
 const handleModeChange = (mode) => {
 if (typeof onPatchAppearance !== "function") return;
 onPatchAppearance({
 ...appearance,
 theme: normalizedAppearance.theme,
 mode,
 });
 };

 return (
 <div data-testid="settings-appearance-section" style={{ display:"grid", gap:"0.82rem", minWidth:0 }}>
 <SurfaceCard variant="subtle" style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.58rem", color:"var(--text)", lineHeight:1.55 }}>
 Choose from {BRAND_THEME_OPTIONS.length} named palettes designed to feel distinct on canvas, emphasis, and rhythm before anything else.
 </div>
 <details data-testid="settings-theme-helper">
 <summary style={{ cursor:"pointer", fontSize:"0.52rem", color:"var(--text-soft)" }}>
 Compare light, dark, and legacy aliases
 </summary>
 <div style={{ marginTop:"0.3rem", fontSize:"0.5rem", color:"var(--text-soft)", lineHeight:1.5 }}>
 `System` follows the live OS scheme. Retired themes still load through automatic aliases so older saved preferences keep a clear successor palette.
 </div>
 </details>
 </SurfaceCard>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 132px),1fr))", gap:"0.32rem" }}>
 {BRAND_THEME_MODES.map((mode) => {
 const selected = normalizedAppearance.mode === mode;
 return (
 <button
 key={mode}
 type="button"
 data-testid={`settings-theme-mode-${toTestIdFragment(mode)}`}
 aria-pressed={selected}
 className="btn"
 onClick={() => handleModeChange(mode)}
 style={{
 minWidth:0,
 justifyContent:"space-between",
 display:"grid",
 gap:"0.14rem",
 textAlign:"left",
 fontSize:"0.54rem",
 color:selected ? "var(--tab-active-text)" : "var(--text)",
 borderColor:selected ? "var(--border-strong)" : "color-mix(in srgb, var(--border) 90%, rgba(255,255,255,0.04))",
 background:selected ? "linear-gradient(180deg, color-mix(in srgb, var(--tab-active-bg) 100%, transparent) 0%, color-mix(in srgb, var(--surface-1) 72%, transparent) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 98%, transparent) 0%, color-mix(in srgb, var(--surface-1) 94%, transparent) 100%)",
 boxShadow:selected ? "var(--shadow-1)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
 }}
 >
 <span style={{ fontWeight:700 }}>{mode}</span>
 <span style={{ fontSize:"0.46rem", color:selected ? "var(--tab-active-text)" : "var(--text-soft)", lineHeight:1.4 }}>
 {mode === "System" ? "Follows your device live" : `${mode} stays fixed`}
 </span>
 </button>
 );
 })}
 </div>
 <div data-testid="settings-theme-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 248px),1fr))", gap:"0.65rem", alignItems:"stretch", minWidth:0 }}>
 {previewItems.map(({ id, themeOption, previewModel }) => {
 const selected = normalizedAppearance.theme === themeOption.id;
 return (
 <button
 key={themeOption.id}
 type="button"
 data-testid={`settings-theme-${toTestIdFragment(themeOption.id)}`}
 data-selected={selected ? "true" : "false"}
 aria-pressed={selected}
 className="btn"
 onClick={() => handleThemeChange(themeOption.id)}
 style={{
 minWidth:0,
 padding:"0.88rem",
 textAlign:"left",
 display:"grid",
 gap:"0.56rem",
 alignContent:"start",
 background:selected ? "linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 100%, transparent) 0%, color-mix(in srgb, var(--surface-2) 86%, transparent) 100%)" : "linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 98%, transparent) 0%, color-mix(in srgb, var(--surface-1) 94%, transparent) 100%)",
 borderColor:selected ? "var(--border-strong)" : "color-mix(in srgb, var(--border) 90%, rgba(255,255,255,0.04))",
 boxShadow:selected ? "var(--shadow-2)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
 }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.45rem", minWidth:0 }}>
 <div style={{ minWidth:0 }}>
 <div style={{ fontFamily:"var(--font-display)", fontSize:"0.76rem", color:"var(--text-strong)", overflowWrap:"anywhere" }}>{themeOption.label}</div>
 <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", marginTop:"0.1rem", lineHeight:1.42, textTransform:"uppercase", letterSpacing:"0.08em" }}>
 {themeOption.subtitle} / {themeOption.hueFamily}
 </div>
 </div>
 <div style={{ display:"flex", gap:"0.22rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
 <span className="tag" style={{ fontSize:"0.4rem", textTransform:"capitalize" }}>{themeOption.hueFamily}</span>
 {selected && <span className="tag" style={{ fontSize:"0.4rem", background:"var(--accent-soft)", color:"var(--text-strong)", borderColor:"var(--border-strong)" }}>Selected</span>}
 </div>
 </div>
 <div
 data-testid={`settings-theme-preview-${toTestIdFragment(id)}`}
 style={{
 minWidth:0,
 overflow:"hidden",
 borderRadius:previewModel.chrome?.radiusLg || 18,
 }}
 >
 <ThemePreviewSurface previewModel={previewModel} />
 </div>
 <div style={{ display:"grid", gap:"0.18rem", minWidth:0 }}>
 <div style={{ fontSize:"0.5rem", color:"var(--text)", lineHeight:1.5 }}>{previewModel.description}</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:"0.24rem" }}>
 {previewModel.swatches.map((swatch, index) => (
 <div key={`${themeOption.id}_${index}`} style={{ height:13, borderRadius:999, background:swatch, border:"1px solid rgba(255,255,255,0.08)" }} />
 ))}
 </div>
 </div>
 </button>
 );
 })}
 </div>
 <div style={{ fontSize:"0.5rem", color:"var(--text-soft)", lineHeight:1.5 }}>
 {PRODUCT_BRAND.name} keeps the appearance system intentionally tight: a small set of differentiated palettes, plus light, dark, or live system mode.
 </div>
 </div>
 );
}

function MetricsBaselinesSection({
 athleteProfile = null,
 personalization = {},
 logs = {},
 bodyweights = [],
 onPatchProfile = async () => null,
 saveManualProgressInputs = async () => null,
 onSaveTrainingContext = async () => null,
 onSaved = () => {},
}) {
 const todayKey = new Date().toISOString().split("T")[0];
 const model = useMemo(() => buildMetricsBaselinesModel({
 athleteProfile,
 personalization,
 bodyweights,
 logs,
 }), [athleteProfile, personalization, bodyweights, logs]);
 const supportTier = useMemo(() => buildSupportTierModel({
 goals: athleteProfile?.goals || [],
 domainAdapterId: athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || "",
 goalCapabilityStack: athleteProfile?.goalCapabilityStack || null,
 }), [athleteProfile]);
 const relevantCardIds = useMemo(
 () => new Set((model.cards || []).map((card) => String(card?.id || "").trim()).filter(Boolean)),
 [model.cards]
 );
 const orderedCards = useMemo(() => [...(model.cards || [])].sort((left, right) => {
 const leftMissing = left?.missing ? 1 : 0;
 const rightMissing = right?.missing ? 1 : 0;
 const leftRequired = left?.requiredNow ? 1 : 0;
 const rightRequired = right?.requiredNow ? 1 : 0;
 return (
 (rightMissing + rightRequired) - (leftMissing + leftRequired)
 || rightRequired - leftRequired
 || rightMissing - leftMissing
 || String(left?.label || "").localeCompare(String(right?.label || ""))
 );
 }), [model.cards]);
 const [drafts, setDrafts] = useState({
 bodyweight: "",
 waist: "",
 liftExercise: "",
 liftWeight: "",
 liftReps: "",
 runDistance: "",
 runDuration: "",
 runPace: "",
 swimDistance: "",
 swimDistanceUnit: "yd",
 swimDuration: "",
 swimAccessReality: "",
 startingCapacity: "",
 jumpValue: "",
 jumpUnit: "in",
 });
 const liftBenchmarkOptions = useMemo(() => ([
 { value: "Bench Press", label: "Bench Press" },
 { value: "Back Squat", label: "Back Squat" },
 { value: "Deadlift", label: "Deadlift" },
 { value: "Overhead Press", label: "Overhead Press" },
 { value: "Trap Bar Deadlift", label: "Trap Bar Deadlift" },
 { value: "Pull-Up", label: "Pull-Up" },
 ]), []);
 const [savingKey, setSavingKey] = useState("");
 const trainingContext = useMemo(
 () => athleteProfile?.userProfile?.trainingContext || deriveTrainingContextFromPersonalization({ personalization }),
 [athleteProfile?.userProfile?.trainingContext, personalization]
 );
 const buildContextDraft = useCallback(() => ({
 mode: trainingEnvironmentToDisplayMode(trainingContext?.environment?.value) || "Unknown",
 equipment: trainingEquipmentToEnvironmentCode(trainingContext?.equipmentAccess?.value) || "unknown",
 equipmentItems: Array.isArray(trainingContext?.equipmentAccess?.items) ? trainingContext.equipmentAccess.items.join(", ") : "",
 time: trainingContext?.sessionDuration?.confirmed ? String(trainingContext.sessionDuration.value || "").trim() || "unknown" : "unknown",
 availableDays: trainingContext?.weekdayAvailability?.confirmed ? (trainingContext.weekdayAvailability.value || []) : [],
 }), [trainingContext]);
 const [contextDraft, setContextDraft] = useState(buildContextDraft);
 const requiredNowCards = useMemo(
 () => orderedCards.filter((card) => card?.requiredNow),
 [orderedCards]
 );
 const requiredNowMissingCards = useMemo(
 () => requiredNowCards.filter((card) => card?.missing),
 [requiredNowCards]
 );
 useEffect(() => {
 setContextDraft(buildContextDraft());
 }, [buildContextDraft]);

 const updateDraft = (key, value) => setDrafts((current) => ({ ...current, [key]: value }));
 const updateContextDraft = (key, value) => setContextDraft((current) => ({ ...current, [key]: value }));
 const toggleContextAvailableDay = (value = "") => setContextDraft((current) => {
 const selection = normalizeTrainingWeekdayAvailability(current?.availableDays || []);
 const normalizedValue = normalizeTrainingWeekdayKey(value);
 if (!normalizedValue) return current;
 const nextSelection = selection.includes(normalizedValue)
 ? selection.filter((entry) => entry !== normalizedValue)
 : [...selection, normalizedValue];
 return {
 ...current,
 availableDays: normalizeTrainingWeekdayAvailability(nextSelection),
 };
 });
 const renderMetricsChoiceChips = ({
 items = [],
 selectedValue = "",
 selectedValues = [],
 onSelect = () => {},
 testIdPrefix = "metrics-chip",
 multi = false,
 } = {}) => (
 <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
 {items.map((item) => {
 const value = typeof item === "string" ? item : item?.value;
 const label = typeof item === "string" ? item : item?.label || item?.value || "";
 const selected = multi
 ? (Array.isArray(selectedValues) ? selectedValues : []).includes(value)
 : String(selectedValue || "") === String(value || "");
 return (
 <button
 key={`${testIdPrefix}-${value}`}
 data-testid={`${testIdPrefix}-${toTestIdFragment(value || label)}`}
 className={selected ? "btn btn-primary" : "btn"}
 onClick={() => onSelect(value)}
 style={{
 minHeight:44,
 fontSize:"0.68rem",
 color:selected ? "#08111d" : "#dbe7f6",
 borderColor:selected ? "#dbe7f6" : "#324961",
 background:selected ? "#dbe7f6" : "transparent",
 }}
 >
 {label}
 </button>
 );
 })}
 </div>
 );
 const parseEquipmentItems = (value = "") => String(value || "")
 .split(/[,/]/)
 .map((item) => item.trim())
 .filter(Boolean);
 const upsertMetricSeries = (rows = [], nextRow = {}, meta = null) => {
 const safeDate = String(nextRow?.date || todayKey).trim() || todayKey;
 return [
 ...(Array.isArray(rows) ? rows : []).filter((row) => String(row?.date || "") !== safeDate),
 {
 ...nextRow,
 date: safeDate,
 source: meta?.source || "user_override",
 note: meta?.note || nextRow?.note || "",
 provenance: meta?.provenance || nextRow?.provenance || null,
 },
 ].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
 };
 const saveEntry = async (key, runSave, nextDraftPatch = null) => {
 setSavingKey(key);
 try {
 const saveMessage = await runSave();
 if (nextDraftPatch && typeof nextDraftPatch === "object") {
 setDrafts((current) => ({ ...current, ...nextDraftPatch }));
 }
 onSaved(typeof saveMessage === "string" && saveMessage.trim()
 ? saveMessage
 : "Saved. Future plans can use this baseline without rewriting history.");
 } finally {
 setSavingKey("");
 }
 };
 const getCardTone = (card = null) => {
 if (card?.missing && card?.requiredNow) {
 return {
 border: `${C.amber}55`,
 background: "linear-gradient(180deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.92))",
 accent: C.amber,
 };
 }
 if (card?.source === TRAINING_CONTEXT_SOURCES.staleCarryover) {
 return {
 border: `${C.blue}45`,
 background: "linear-gradient(180deg, rgba(96, 165, 250, 0.08), rgba(15, 23, 42, 0.92))",
 accent: C.blue,
 };
 }
 if (card?.missing) {
 return {
 border: "#30445f",
 background: "#0f172a",
 accent: "#8fa5c8",
 };
 }
 return {
 border: "#22324a",
 background: "#0f172a",
 accent: C.green,
 };
 };
 const renderBadge = (label, { color = "#8fa5c8", background = "#111827", borderColor = "#23344d" } = {}) => (
 <span style={{ fontSize:"0.44rem", color, background, border:`1px solid ${borderColor}`, padding:"0.12rem 0.32rem", borderRadius:999 }}>
 {label}
 </span>
 );
 const renderEditorBlock = (title, supporting, children, testId = "") => (
 <div data-testid={testId || undefined} style={{ border:"1px solid #22324a", borderRadius:14, background:"#0b1220", padding:"0.62rem", display:"grid", gap:"0.38rem" }}>
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#e2e8f0", lineHeight:1.45 }}>{title}</div>
 <div style={{ fontSize:"0.46rem", color:"#8fa5c8", lineHeight:1.45 }}>{supporting}</div>
 </div>
 {children}
 </div>
 );

 return (
 <div data-testid="metrics-baselines-section" style={{ display:"grid", gap:"0.45rem", marginTop:"0.45rem" }}>
 <div style={{ border:"1px solid #22324a", borderRadius:16, background:"linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(11, 18, 32, 0.98))", padding:"0.7rem", display:"grid", gap:"0.36rem" }}>
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#8fa5c8", letterSpacing:"0.08em" }}>PLAN INPUTS</div>
 <div style={{ fontSize:"0.56rem", color:"#e2e8f0", lineHeight:1.45 }}>
 {supportTier.headline}. {supportTier.basisLine}
 </div>
 <div style={{ fontSize:"0.48rem", color:"#9fb2d2", lineHeight:1.45 }}>
 Add what the planner needs now. The rest can wait until later without disrupting the current plan.
 </div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap" }}>
 {renderBadge(`${orderedCards.length} input${orderedCards.length === 1 ? "" : "s"} tracked`, {
 color: "#dbe7f6",
 background: "#111827",
 borderColor: "#22324a",
 })}
 {renderBadge(`${model.missingCards.length} missing`, {
 color: model.missingCards.length ? C.amber : C.green,
 background: model.missingCards.length ? `${C.amber}12` : `${C.green}12`,
 borderColor: model.missingCards.length ? `${C.amber}30` : `${C.green}30`,
 })}
{renderBadge(`${requiredNowMissingCards.length} to add now`, {
 color: requiredNowMissingCards.length ? "#f8d79b" : "#9fb2d2",
 background: requiredNowMissingCards.length ? `${C.amber}16` : "#111827",
 borderColor: requiredNowMissingCards.length ? `${C.amber}35` : "#22324a",
 })}
 </div>
 {requiredNowMissingCards.length ? (
 <div data-testid="metrics-required-summary" style={{ fontSize:"0.48rem", color:C.amber, lineHeight:1.45 }}>
 Needed now: {requiredNowMissingCards.map((card) => card.label).join(", ")}. {model.requiredNowCopy}
 </div>
 ) : (
 <div style={{ fontSize:"0.48rem", color:C.green, lineHeight:1.45 }}>
 The current anchors are strong enough to keep the next block specific without sending you into Settings cleanup first.
 </div>
 )}
 {model.lowConfidenceCount > 0 ? (
 <div style={{ fontSize:"0.46rem", color:"#8fa5c8", lineHeight:1.45 }}>
 A few optional inputs can still make future adjustments smarter, but they are not blocking the plan.
 </div>
 ) : null}
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 {orderedCards.map((card) => {
 const tone = getCardTone(card);
 return (
 <div
 key={card.id}
 data-testid={`metrics-card-${card.id}`}
 style={{ border:`1px solid ${tone.border}`, borderRadius:14, background:tone.background, padding:"0.62rem", display:"grid", gap:"0.28rem" }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.54rem", color:"#e2e8f0", lineHeight:1.4 }}>{card.label}</div>
 <div style={{ fontSize:"0.6rem", color:card.missing ? "#f8d79b" : "#dbe7f6", lineHeight:1.4 }}>
 {card.value}
 </div>
 </div>
 <div style={{ display:"flex", gap:"0.24rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
 {renderBadge(
 card.missing
 ? (card.requiredNow ? "Needed now" : "Nice to add")
 : card?.source === TRAINING_CONTEXT_SOURCES.staleCarryover
 ? "Carry-over"
 : card?.source === TRAINING_CONTEXT_SOURCES.defaultPlaceholder
 ? "Approximate"
 : "Saved",
 {
 color: card.requiredNow ? "#f8d79b" : "#8fa5c8",
 background: card.requiredNow ? `${C.amber}12` : "#111827",
 borderColor: card.requiredNow ? `${C.amber}30` : "#23344d",
 })}
 {renderBadge(card.sourceLabel, {
 color: card.missing ? tone.accent : "#9fb2d2",
 background: card.missing ? `${tone.accent}12` : "#172233",
 borderColor: card.missing ? `${tone.accent}25` : "#23344d",
 })}
 </div>
 </div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>{card.detail}</div>
 <div style={{ fontSize:"0.47rem", color:"#dbe7f6", lineHeight:1.45 }}>
 Why it matters: {card.whyItMatters}
 </div>
 <div style={{ fontSize:"0.46rem", color:card.missing ? tone.accent : "#94a3b8", lineHeight:1.45 }}>
 {card.missing
 ? `If still missing: ${card.missingImpact || card.planningImpact}`
 : `Planning effect: ${card.planningImpact}`}
 </div>
 <div data-testid={`metrics-card-provenance-${card.id}`} style={{ fontSize:"0.45rem", color:"#9fb2d2", lineHeight:1.4 }}>
 {card.provenanceSummary}
 </div>
 <details data-testid={`metrics-card-audit-${card.id}`} style={{ marginTop:"0.04rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.46rem", color:"#8fa5c8" }}>Details</summary>
 <div style={{ display:"grid", gap:"0.18rem", marginTop:"0.3rem" }}>
 {card.lastUpdatedLabel ? (
 <div style={{ fontSize:"0.45rem", color:"#dbe7f6", lineHeight:1.4 }}>
 Active baseline updated {card.lastUpdatedLabel}.
 </div>
 ) : null}
 <div style={{ fontSize:"0.45rem", color:"#8fa5c8", lineHeight:1.4 }}>
 {card.missing ? "No saved input yet, so the planner is using a safer default for now." : "This row shapes future plan updates only."}
 </div>
 <div style={{ fontSize:"0.45rem", color:"#8fa5c8", lineHeight:1.4 }}>{card.planningImpact}</div>
 </div>
 </details>
 </SurfaceCard>
 );
 })}
 </div>
 <div style={{ display:"grid", gap:"0.42rem", border:"1px solid #22324a", borderRadius:16, background:"#0f172a", padding:"0.68rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>Save or update plan inputs</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>
 These edits shape future plans only. Past plans and logged work stay untouched.
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.42rem" }}>
 {relevantCardIds.has("bodyweight") && renderEditorBlock(
 "Current bodyweight",
 "Save a usable bodyweight baseline now. This updates future planning without touching historical logs.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
 <input data-testid="metrics-input-bodyweight" value={drafts.bodyweight} onChange={(e)=>updateDraft("bodyweight", e.target.value)} placeholder="Current bodyweight" />
 <button
 data-testid="metrics-save-bodyweight"
 className="btn"
 onClick={() => saveEntry("bodyweight", async () => saveManualProgressInputs(
 (current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.bodyweight,
 entry: {
 date: todayKey,
 value: drafts.bodyweight,
 unit: "lb",
 note: "Saved from Metrics / Baselines",
 },
 }),
 {
 profilePatch: {
 weight: drafts.bodyweight === "" ? "" : Number(drafts.bodyweight) || "",
 bodyweight: drafts.bodyweight === "" ? "" : Number(drafts.bodyweight) || "",
 },
 }
 ), { bodyweight: "" })}
 disabled={!String(drafts.bodyweight || "").trim() || savingKey === "bodyweight"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "bodyweight" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-bodyweight"
 )}

 {relevantCardIds.has("waist") && renderEditorBlock(
 "Waist proxy",
 "Useful when appearance or physique goals need a clean non-scale proxy.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
 <input data-testid="metrics-input-waist" value={drafts.waist} onChange={(e)=>updateDraft("waist", e.target.value)} placeholder="Waist (inches)" />
 <button
 data-testid="metrics-save-waist"
 className="btn"
 onClick={() => saveEntry(
 "waist",
 async () => saveManualProgressInputs((current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.waist,
 entry: { date: todayKey, value: drafts.waist, note: "Saved from Metrics / Baselines" },
 })),
 { waist: "" }
 )}
 disabled={!String(drafts.waist || "").trim() || savingKey === "waist"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "waist" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-waist"
 )}

 {relevantCardIds.has("lift_benchmark") && renderEditorBlock(
 "Lift benchmark",
 "One top set or recent benchmark lets the planner stop guessing on strength dose.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr 0.6fr auto", gap:"0.35rem" }}>
 <select data-testid="metrics-input-lift-exercise" value={drafts.liftExercise} onChange={(e)=>updateDraft("liftExercise", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="">Choose lift</option>
 {liftBenchmarkOptions.map((option) => (
 <option key={option.value} value={option.value}>{option.label}</option>
 ))}
 </select>
 <input data-testid="metrics-input-lift-weight" value={drafts.liftWeight} onChange={(e)=>updateDraft("liftWeight", e.target.value)} placeholder="Weight" />
 <input data-testid="metrics-input-lift-reps" value={drafts.liftReps} onChange={(e)=>updateDraft("liftReps", e.target.value)} placeholder="Reps" />
 <button
 data-testid="metrics-save-lift"
 className="btn"
 onClick={() => saveEntry(
 "lift",
 async () => saveManualProgressInputs((current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.liftBenchmark,
 entry: {
 date: todayKey,
 exercise: drafts.liftExercise || "Lift benchmark",
 weight: drafts.liftWeight,
 reps: drafts.liftReps,
 sets: 1,
 note: "Saved from Metrics / Baselines",
 },
 })),
 { liftExercise: "", liftWeight: "", liftReps: "" }
 )}
 disabled={!drafts.liftExercise || !drafts.liftWeight || !drafts.liftReps || savingKey === "lift"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "lift" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-lift"
 )}

 {relevantCardIds.has("run_benchmark") && renderEditorBlock(
 "Recent run anchor",
 "Distance, time, pace, or any mix of the three works.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"0.7fr 0.8fr 0.8fr auto", gap:"0.35rem" }}>
 <input data-testid="metrics-input-run-distance" value={drafts.runDistance} onChange={(e)=>updateDraft("runDistance", e.target.value)} placeholder="Miles" />
 <input data-testid="metrics-input-run-duration" value={drafts.runDuration} onChange={(e)=>updateDraft("runDuration", e.target.value)} placeholder="Duration" />
 <input data-testid="metrics-input-run-pace" value={drafts.runPace} onChange={(e)=>updateDraft("runPace", e.target.value)} placeholder="Pace" />
 <button
 data-testid="metrics-save-run"
 className="btn"
 onClick={() => saveEntry(
 "run",
 async () => saveManualProgressInputs((current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.runBenchmark,
 entry: {
 date: todayKey,
 distanceMiles: drafts.runDistance,
 durationMinutes: drafts.runDuration,
 paceText: drafts.runPace,
 note: "Saved from Metrics / Baselines",
 },
 })),
 { runDistance: "", runDuration: "", runPace: "" }
 )}
 disabled={(!drafts.runDistance && !drafts.runDuration && !drafts.runPace) || savingKey === "run"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "run" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-run"
 )}

 {relevantCardIds.has("swim_benchmark") && renderEditorBlock(
 "Recent swim anchor",
 "One recent swim distance or time anchor is enough.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"0.7fr 0.5fr 0.8fr auto", gap:"0.35rem" }}>
 <input data-testid="metrics-input-swim-distance" value={drafts.swimDistance} onChange={(e)=>updateDraft("swimDistance", e.target.value)} placeholder="Distance" />
 <select value={drafts.swimDistanceUnit} onChange={(e)=>updateDraft("swimDistanceUnit", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="yd">yd</option>
 <option value="m">m</option>
 </select>
 <input data-testid="metrics-input-swim-duration" value={drafts.swimDuration} onChange={(e)=>updateDraft("swimDuration", e.target.value)} placeholder="Duration" />
 <button
 data-testid="metrics-save-swim"
 className="btn"
 onClick={() => saveEntry(
 "swim",
 async () => saveManualProgressInputs((current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.swimBenchmark,
 entry: {
 date: todayKey,
 distance: drafts.swimDistance,
 distanceUnit: drafts.swimDistanceUnit,
 duration: drafts.swimDuration,
 note: "Saved from Metrics / Baselines",
 },
 })),
 { swimDistance: "", swimDuration: "" }
 )}
 disabled={(!drafts.swimDistance && !drafts.swimDuration) || savingKey === "swim"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "swim" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-swim"
 )}

 {relevantCardIds.has("swim_access_reality") && renderEditorBlock(
 "Pool / open-water reality",
 "This keeps swim structure honest about where you can actually train.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
 <select data-testid="metrics-input-swim-access-reality" value={drafts.swimAccessReality} onChange={(e)=>updateDraft("swimAccessReality", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="">Choose one</option>
 <option value={SWIM_ACCESS_REALITY_VALUES.pool}>Pool</option>
 <option value={SWIM_ACCESS_REALITY_VALUES.openWater}>Open water</option>
 <option value={SWIM_ACCESS_REALITY_VALUES.both}>Both</option>
 </select>
 <button
 data-testid="metrics-save-swim-access-reality"
 className="btn"
 onClick={() => saveEntry(
 "swim_access_reality",
 async () => saveManualProgressInputs((current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.swimAccessReality,
 entry: { date: todayKey, value: drafts.swimAccessReality, note: "Saved from Metrics / Baselines" },
 })),
 { swimAccessReality: "" }
 )}
 disabled={!drafts.swimAccessReality || savingKey === "swim_access_reality"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "swim_access_reality" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-swim-reality"
 )}

 {relevantCardIds.has("starting_capacity") && renderEditorBlock(
 "Safe starting capacity",
 "Use the repeatable truth so the next block starts at the right dose.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
 <select data-testid="metrics-input-starting-capacity" value={drafts.startingCapacity} onChange={(e)=>updateDraft("startingCapacity", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="">Choose one</option>
 <option value={STARTING_CAPACITY_VALUES.walkOnly}>{STARTING_CAPACITY_META[STARTING_CAPACITY_VALUES.walkOnly]?.label || "Walks / very short efforts"}</option>
 <option value={STARTING_CAPACITY_VALUES.easyTen}>{STARTING_CAPACITY_META[STARTING_CAPACITY_VALUES.easyTen]?.label || "About 10 easy minutes"}</option>
 <option value={STARTING_CAPACITY_VALUES.steadyTwenty}>{STARTING_CAPACITY_META[STARTING_CAPACITY_VALUES.steadyTwenty]?.label || "About 20 to 30 minutes"}</option>
 <option value={STARTING_CAPACITY_VALUES.durableThirty}>{STARTING_CAPACITY_META[STARTING_CAPACITY_VALUES.durableThirty]?.label || "30+ minutes feels repeatable"}</option>
 </select>
 <button
 data-testid="metrics-save-starting-capacity"
 className="btn"
 onClick={() => saveEntry(
 "starting_capacity",
 async () => saveManualProgressInputs((current) => upsertGoalAnchorQuickEntry({
 manualProgressInputs: current,
 type: GOAL_ANCHOR_QUICK_ENTRY_TYPES.startingCapacity,
 entry: { date: todayKey, value: drafts.startingCapacity, note: "Saved from Metrics / Baselines" },
 })),
 { startingCapacity: "" }
 )}
 disabled={!drafts.startingCapacity || savingKey === "starting_capacity"}
 style={{ fontSize:"0.5rem" }}
 >
 {savingKey === "starting_capacity" ? "Saving..." : "Save"}
 </button>
 </div>
 </>,
 "metrics-editor-starting-capacity"
 )}

 {relevantCardIds.has("power_benchmark") && renderEditorBlock(
 "Jump / power anchor",
 "Use one recent jump anchor if power progression should be tighter.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"1fr 90px auto", gap:"0.35rem" }}>
 <input data-testid="metrics-input-jump" value={drafts.jumpValue} onChange={(e)=>updateDraft("jumpValue", e.target.value)} placeholder="Vertical jump" />
 <select value={drafts.jumpUnit} onChange={(e)=>updateDraft("jumpUnit", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="in">in</option>
 <option value="cm">cm</option>
 </select>
 <button data-testid="metrics-save-jump" className="btn" onClick={() => saveEntry("jump", async () => saveManualProgressInputs((current) => ({
 ...(current || {}),
 measurements: { ...(current?.measurements || {}) },
 benchmarks: { ...(current?.benchmarks || {}) },
 metrics: {
 ...(current?.metrics || {}),
 vertical_jump: upsertMetricSeries(
 current?.metrics?.vertical_jump || [],
 {
 date: todayKey,
 value: drafts.jumpValue === "" ? null : Number(drafts.jumpValue) || null,
 unit: drafts.jumpUnit,
 },
 createBaselineSaveMeta({
 fieldId: "vertical_jump",
 note: "Saved from Metrics / Baselines",
 })
 ),
 },
 })), { jumpValue: "" })} disabled={!drafts.jumpValue || savingKey === "jump"} style={{ fontSize:"0.5rem" }}>{savingKey === "jump" ? "Saving..." : "Save"}</button>
 </div>
 </>,
 "metrics-editor-jump"
 )}

 {relevantCardIds.has("environment") && renderEditorBlock(
 "Training setup",
 "Set the setup you actually have this week so future plans stop relying on old carry-over assumptions.",
 <>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:"0.35rem" }}>
 <select data-testid="metrics-input-environment-mode" value={contextDraft.mode || "Unknown"} onChange={(e)=>updateContextDraft("mode", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="Unknown">Where you train</option>
 <option value="Home">Home</option>
 <option value="Gym">Gym</option>
 <option value="Outdoor">Outdoor</option>
 <option value="Travel">Travel / mixed</option>
 </select>
 <select data-testid="metrics-input-environment-equipment" value={contextDraft.equipment || "unknown"} onChange={(e)=>updateContextDraft("equipment", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="unknown">Equipment access</option>
 <option value="none">Bodyweight / no equipment</option>
 <option value="dumbbells">Dumbbells</option>
 <option value="basic_gym">Basic gym</option>
 <option value="full_gym">Full gym</option>
 <option value="mixed">Mixed setup</option>
 </select>
 <select data-testid="metrics-input-environment-time" value={contextDraft.time || "unknown"} onChange={(e)=>updateContextDraft("time", e.target.value)} style={{ fontSize:"0.54rem" }}>
 <option value="unknown">Session window</option>
 <option value="20">20 min</option>
 <option value="30">30 min</option>
 <option value="45">45 min</option>
 <option value="60+">60+ min</option>
 </select>
 </div>
 <div style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>Usual training days</div>
 {renderMetricsChoiceChips({
 items: TRAINING_WEEKDAY_CHIP_ITEMS,
 selectedValues: Array.isArray(contextDraft?.availableDays) ? contextDraft.availableDays : [],
 onSelect: (value) => toggleContextAvailableDay(value),
 testIdPrefix: "metrics-input-environment-available-days",
 multi: true,
 })}
 <div style={{ fontSize:"0.45rem", color:"#94a3b8", lineHeight:1.45 }}>
 Anchor key work to the days that are usually realistic. The other days can stay lighter or optional.
 </div>
 </div>
 <input
 data-testid="metrics-input-environment-items"
 value={contextDraft.equipmentItems || ""}
 onChange={(e)=>updateContextDraft("equipmentItems", e.target.value)}
 placeholder="Equipment list, separated by commas"
 />
 <button
 data-testid="metrics-save-environment"
 className="btn"
 onClick={() => saveEntry(
 "training_context",
 async () => {
 await onSaveTrainingContext({
 mode: contextDraft.mode,
 equipment: contextDraft.equipment,
 equipmentItems: parseEquipmentItems(contextDraft.equipmentItems),
 availableDays: normalizeTrainingWeekdayAvailability(contextDraft.availableDays || []),
 time: contextDraft.time,
 });
 return "Saved. Future planning now uses your current setup.";
 },
 null
 )}
 disabled={
 savingKey === "training_context"
 || !String(contextDraft.mode || "").trim()
 || String(contextDraft.mode || "").trim().toLowerCase() === "unknown"
 }
 style={{ width:"fit-content", fontSize:"0.5rem" }}
 >
 {savingKey === "training_context" ? "Saving..." : "Save setup"}
 </button>
 </>,
 "metrics-editor-environment"
 )}
 </div>
 </div>
 </div>
 );
}

function TodayTab({ planDay = null, surfaceModel = null, todayWorkout: legacyTodayWorkout, dailyStory = null, setEnvironmentMode = async () => null, environmentSelection = null, onGoProgram = () => {}, onDismissPostIntakeReady = () => {}, syncSurfaceModel = null, authError = "", ..._unusedTodayProps }) {
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout || null;
 const plannedWorkout = planDay?.base?.training || legacyTodayWorkout || null;
 const todayTraining = todayWorkout || plannedWorkout || null;
 const todayKey = new Date().toISOString().split("T")[0];
 const todaySessionCardRef = useRef(null);
 const [adjustTodayOpen, setAdjustTodayOpen] = useState(false);
 const [todayAdjustmentState, setTodayAdjustmentState] = useState(() => {
  if (typeof window === "undefined") return { ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS };
  try {
   const raw = window.sessionStorage.getItem(`today_prescription_adjustments_${todayKey}`);
   const parsed = raw ? JSON.parse(raw) : null;
   return {
    ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
    ...(parsed || {}),
   };
  } catch {
   return { ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS };
  }
 });

 useEffect(() => {
  setAdjustTodayOpen(false);
  if (typeof window === "undefined") {
   setTodayAdjustmentState({ ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS });
   return;
  }
  try {
   const raw = window.sessionStorage.getItem(`today_prescription_adjustments_${todayKey}`);
   const parsed = raw ? JSON.parse(raw) : null;
   setTodayAdjustmentState({
    ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
    ...(parsed || {}),
   });
  } catch {
   setTodayAdjustmentState({ ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS });
  }
 }, [todayKey, todayTraining?.label, todayTraining?.type]);

 useEffect(() => {
  if (typeof window === "undefined") return;
  try {
   window.sessionStorage.setItem(
    `today_prescription_adjustments_${todayKey}`,
    JSON.stringify(todayAdjustmentState)
   );
  } catch {}
 }, [todayAdjustmentState, todayKey]);

 const prescribedExercises = buildStrengthPrescriptionEntriesForLogging(todayTraining);
 const todayPrescriptionSummary = useMemo(() => (
  surfaceModel?.display || buildDayPrescriptionDisplay({
   training: todayTraining,
   includeWhy: false,
   prescribedExercises,
  })
 ), [surfaceModel?.display, todayTraining, prescribedExercises]);

 const todayPrescriptionModel = useMemo(() => buildTodayPrescriptionSurfaceModel({
  dateKey: todayKey,
  training: todayTraining,
  summary: todayPrescriptionSummary,
  surfaceModel,
  whyNowLine: dailyStory?.brief || dailyStory?.focus || "",
  prescribedExercises,
  adjustments: todayAdjustmentState,
  environmentSelection,
 }), [
  todayKey,
  todayTraining,
  todayPrescriptionSummary,
  surfaceModel,
  dailyStory?.brief,
  dailyStory?.focus,
  prescribedExercises,
  todayAdjustmentState,
  environmentSelection,
 ]);

 const todayFocusLine = todayPrescriptionModel?.focusLine || "Today's work, kept simple.";
 const todayVisibleWhyLine = sanitizeDisplayText(
  todayPrescriptionModel?.whyLine
  || surfaceModel?.changeSummaryLine
  || surfaceModel?.preferenceAndAdaptationLine
  || surfaceModel?.canonicalReasonLine
  || "Today moves the week forward without adding unnecessary fatigue."
 );
 const todayTrustModel = todayPrescriptionModel?.trustModel || null;
 const todayBlocks = Array.isArray(todayPrescriptionModel?.blocks) ? todayPrescriptionModel.blocks : [];
 const todayRules = Array.isArray(todayPrescriptionModel?.rules) ? todayPrescriptionModel.rules : [];
 const sessionVariant = String(todayAdjustmentState?.time || "standard");
 const showStorageBanner = Boolean(syncSurfaceModel?.showFullCard);
 const showQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");
 const cardColor = dayColors[todayTraining?.type] || (
  todayPrescriptionModel?.family === "strength"
   ? C.blue
   : todayPrescriptionModel?.family === "hybrid"
   ? C.blue
   : todayPrescriptionModel?.family === "recovery"
   ? "var(--consumer-text-muted)"
   : C.green
 );
 const canonicalTodayLabel = resolveCanonicalSurfaceSessionLabel({
  sessionType: todayPrescriptionSummary?.sessionType || surfaceModel?.display?.sessionType || todayTraining?.type || "",
  sessionLabel: todayPrescriptionSummary?.sessionLabel || todayPrescriptionModel?.sessionLabel || surfaceModel?.display?.sessionLabel || todayTraining?.label || "",
  fallback: "Today's session",
  isHybrid: todayPrescriptionModel?.family === "hybrid",
 });
 const todayAdjustmentIntroLine = environmentSelection?.scope === "today" && sanitizeDisplayText(environmentSelection?.mode || "")
  ? `Active now: ${sanitizeDisplayText(environmentSelection.mode)} setup. Adjustments only change today's displayed prescription.`
  : "Use this only when real-world constraints change today's session.";

 const setTodayAdjustmentField = (fieldKey, nextValue) => {
  setTodayAdjustmentState((current) => ({
   ...current,
   [fieldKey]: nextValue,
  }));
 };
 const toggleTodayTimeVariant = (value) => {
  setTodayAdjustmentField("time", todayAdjustmentState?.time === value ? "standard" : value);
 };
 const toggleTodayRecovery = () => {
  setTodayAdjustmentField("recovery", todayAdjustmentState?.recovery === "low_energy" ? "standard" : "low_energy");
 };
 const toggleTodaySoreness = (value) => {
  setTodayAdjustmentField("soreness", todayAdjustmentState?.soreness === value ? "none" : value);
 };
 const toggleTodayLowImpact = () => {
  setTodayAdjustmentField("impact", todayAdjustmentState?.impact === "low_impact" ? "normal" : "low_impact");
 };
 const toggleTodayCardioSwap = (value) => {
  setTodayAdjustmentField("cardioSwap", todayAdjustmentState?.cardioSwap === value ? "as_planned" : value);
 };
 const toggleTodayExerciseSwap = () => {
  setTodayAdjustmentField("swapExercises", !todayAdjustmentState?.swapExercises);
 };
 const resetTodayAdjustmentState = () => {
  setTodayAdjustmentState({ ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS });
 };
 const buildTodayAdjustmentButtonStyle = (selected, accentColor) => ({
  minHeight: 46,
  borderRadius: 18,
  justifyContent: "center",
  fontSize: "0.5rem",
  color: selected ? "var(--accent-contrast)" : "var(--consumer-text)",
  background: selected ? accentColor : "linear-gradient(180deg, color-mix(in srgb, var(--consumer-subpanel) 96%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 92%, transparent) 100%)",
  borderColor: selected ? accentColor : "color-mix(in srgb, var(--consumer-border-strong) 88%, rgba(255,255,255,0.04))",
  boxShadow: selected ? "var(--shadow-1)" : "none",
 });

 return (
 <div className="fi" data-testid="today-tab" style={{ display:"grid", gap:"0.75rem" }}>
 {authError && (
 <div className="card card-soft" style={{ borderColor:C.amber+"35", fontSize:"0.54rem", color:C.amber }}>
 {authError}
 </div>
 )}
 {showStorageBanner && (
 <SyncStateCallout
 model={syncSurfaceModel}
 dataTestId="today-sync-status"
 compact
 style={{ background:"rgba(11, 20, 32, 0.76)" }}
 />
 )}

 <SurfaceCard
 ref={todaySessionCardRef}
 data-testid="today-session-card"
 variant="elevated"
 style={{
 display:"grid",
 gap:"0.92rem",
 padding:"1rem 1.05rem",
 borderRadius:28,
 borderColor:`${cardColor}2b`,
 background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel-strong) 96%, transparent), color-mix(in srgb, var(--consumer-panel) 98%, transparent))",
 boxShadow:"var(--shadow-2)",
 }}
 >
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.48rem", color:cardColor, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:700 }}>
 {todayPrescriptionModel?.dateLabel || "Today"}
 </div>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.45rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.12rem", minWidth:0 }}>
 <div style={{ fontFamily:"var(--font-display)", fontSize:"1.02rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.08 }}>
 {todayPrescriptionModel?.headerTitle || "Today's Plan"}
 </div>
 <div data-testid="today-canonical-session-label" style={{ fontSize:"0.58rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {todayPrescriptionModel?.sessionLabel || canonicalTodayLabel}
 </div>
 </div>
 {showQuietSyncChip && (
 <div style={{ minWidth:210 }}>
 <CompactSyncStatus
 model={syncSurfaceModel}
 dataTestId="today-sync-status"
 style={{
 background:"rgba(11, 20, 32, 0.32)",
 opacity:0.88,
 }}
 />
 </div>
 )}
 </div>
 </div>

 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Focus
 </div>
 <div data-testid="today-focus-line" style={{ fontSize:"0.68rem", color:"var(--consumer-text)", lineHeight:1.38, fontWeight:600 }}>
 {todayFocusLine}
 </div>
 </div>

 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Why today
 </div>
 <div data-testid="today-change-summary" style={{ fontSize:"0.56rem", color:"var(--consumer-text-soft)", lineHeight:1.55 }}>
 {todayVisibleWhyLine}
 </div>
 </div>

 <CompactTrustRow model={todayTrustModel} dataTestId="today-trust-row" />

 <div data-testid="today-session-plan" style={{ display:"grid", gap:"0.5rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Workout
 </div>
 <div data-testid="today-full-workout" style={{ display:"grid", gap:"0.3rem" }}>
 {todayBlocks.map((block) => (
 <div
 key={block.key || block.number}
 style={{
 display:"grid",
 gridTemplateColumns:"auto 1fr",
 gap:"0.58rem",
 alignItems:"flex-start",
 border:"1px solid color-mix(in srgb, var(--consumer-border) 88%, rgba(255,255,255,0.04))",
 borderRadius:20,
 padding:"0.72rem 0.76rem",
 background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-subpanel) 96%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)",
 boxShadow:"inset 0 1px 0 rgba(255,255,255,0.03)",
 }}
 >
 <div
 style={{
 width:28,
 height:28,
 borderRadius:999,
 border:`1px solid ${cardColor}34`,
 background:`${cardColor}15`,
 color:cardColor,
 display:"inline-flex",
 alignItems:"center",
 justifyContent:"center",
 fontSize:"0.54rem",
 fontWeight:800,
 }}
 >
 {block.number}
 </div>
 <div style={{ display:"grid", gap:"0.18rem", minWidth:0 }}>
 <div style={{ fontSize:"0.6rem", color:"var(--consumer-text)", fontWeight:700, lineHeight:1.35 }}>
 {block.title}
 </div>
 <div style={{ fontSize:"0.53rem", color:"var(--consumer-text-soft)", lineHeight:1.56 }}>
 {block.prescription}
 </div>
 {!!block.effort && (
 <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 Effort: {block.effort}
 </div>
 )}
 {!!block.variant && (
 <div style={{ fontSize:"0.47rem", color:"var(--consumer-text-muted)", lineHeight:1.45 }}>
 {block.variant}
 </div>
 )}
 <ExerciseHowDisclosure
 dataTestId={`today-exercise-help-${block.key || block.number}`}
 query={block.guidanceSource || ""}
 />
 </div>
 </div>
 ))}
 </div>
 </div>

 {!!todayRules.length && (
 <div data-testid="today-rules" style={{ display:"grid", gap:"0.22rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Rules for today
 </div>
 <ul style={{ margin:0, paddingLeft:"1rem", display:"grid", gap:"0.18rem", color:"var(--consumer-text-soft)", fontSize:"0.52rem", lineHeight:1.5 }}>
 {todayRules.map((rule, index) => (
 <li key={`today-rule-${index}`}>{rule}</li>
 ))}
 </ul>
 </div>
 )}
 </SurfaceCard>

 <SurfaceCard
 data-testid="today-adjust-section"
 variant="subtle"
 style={{
 display:"grid",
 gap:"0.6rem",
 padding:"0.78rem 0.84rem",
 borderRadius:24,
 borderColor:"color-mix(in srgb, var(--consumer-border-strong) 88%, rgba(255,255,255,0.04))",
 background:"linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 92%, transparent) 100%)",
 }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.6rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.18rem", minWidth:0, flex:"1 1 280px" }}>
 <div style={{ fontSize:"0.52rem", color:"var(--consumer-text)", fontWeight:700 }}>
 Adjust Today
 </div>
 <div style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", lineHeight:1.5 }}>
 {todayAdjustmentIntroLine}
 </div>
 </div>
 <button
 type="button"
 data-testid="today-primary-cta"
 className={adjustTodayOpen ? "btn" : "btn btn-primary"}
 onClick={() => setAdjustTodayOpen((current) => !current)}
 style={{
 fontSize:"0.5rem",
 minHeight:42,
 color:adjustTodayOpen ? "var(--consumer-text-muted)" : undefined,
 borderColor:adjustTodayOpen ? "var(--consumer-border-strong)" : undefined,
 }}
 >
 {adjustTodayOpen ? "Hide adjustments" : "Adjust today"}
 </button>
 </div>

 {adjustTodayOpen && (
 <div data-testid="today-adjust-panel" style={{ display:"grid", gap:"0.6rem" }}>
 <div style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Time and recovery
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"0.35rem" }}>
 <button type="button" className="btn" onClick={() => toggleTodayTimeVariant("short")} style={buildTodayAdjustmentButtonStyle(sessionVariant === "short", C.green)}>
 Short on time
 </button>
 <button type="button" className="btn" onClick={() => toggleTodayTimeVariant("extended")} style={buildTodayAdjustmentButtonStyle(sessionVariant === "extended", C.amber)}>
 Push a little harder
 </button>
 <button type="button" className="btn" onClick={toggleTodayRecovery} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.recovery === "low_energy", C.blue)}>
 Low energy
 </button>
 </div>
 </div>

 <div style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Soreness and impact
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"0.35rem" }}>
 <button type="button" className="btn" onClick={() => toggleTodaySoreness("legs")} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.soreness === "legs", C.amber)}>
 Legs sore
 </button>
 <button type="button" className="btn" onClick={() => toggleTodaySoreness("upper")} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.soreness === "upper", C.amber)}>
 Upper body sore
 </button>
 <button type="button" className="btn" onClick={toggleTodayLowImpact} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.impact === "low_impact", C.blue)}>
 Need low impact
 </button>
 </div>
 </div>

 <div style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Cardio and swap
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"0.35rem" }}>
 <button type="button" className="btn" onClick={() => toggleTodayCardioSwap("treadmill")} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.cardioSwap === "treadmill", C.blue)}>
 Treadmill
 </button>
 <button type="button" className="btn" onClick={() => toggleTodayCardioSwap("bike")} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.cardioSwap === "bike", C.blue)}>
 Bike
 </button>
 <button type="button" className="btn" onClick={() => toggleTodayCardioSwap("elliptical")} style={buildTodayAdjustmentButtonStyle(todayAdjustmentState?.cardioSwap === "elliptical", C.blue)}>
 Elliptical
 </button>
 <button type="button" className="btn" onClick={toggleTodayExerciseSwap} style={buildTodayAdjustmentButtonStyle(Boolean(todayAdjustmentState?.swapExercises), C.green)}>
 Swap exercise
 </button>
 </div>
 </div>

 <div style={{ display:"grid", gap:"0.28rem" }}>
 <div style={{ fontSize:"0.45rem", color:"var(--consumer-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 Setup
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"0.35rem" }}>
 {[
 { label: "Home only", mode: "Home" },
 { label: "Gym", mode: "Gym" },
 { label: "Outdoor", mode: "Outdoor" },
 { label: "Travel", mode: "Travel" },
 ].map((option) => {
 const selected = environmentSelection?.scope === "today" && String(environmentSelection?.mode || "").toLowerCase() === option.mode.toLowerCase();
 return (
 <button
 key={`today-adjust-mode-${option.mode}`}
 type="button"
 className="btn"
 onClick={async () => setEnvironmentMode({ mode: option.mode, scope:"today" })}
 style={buildTodayAdjustmentButtonStyle(selected, C.blue)}
 >
 {option.label}
 </button>
 );
 })}
 </div>
 </div>

 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
 {environmentSelection?.scope === "today" && (
 <button
 type="button"
 className="btn"
 onClick={async () => setEnvironmentMode({ scope:"today", clearTodayOverride:true })}
 style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", borderColor:"var(--consumer-border-strong)" }}
 >
 Use default setup
 </button>
 )}
 <button
 type="button"
 className="btn"
 onClick={async () => {
 resetTodayAdjustmentState();
 if (environmentSelection?.scope === "today") {
 await setEnvironmentMode({ scope:"today", clearTodayOverride:true });
 }
 }}
 style={{ fontSize:"0.5rem", color:"var(--consumer-text-muted)", borderColor:"var(--consumer-border-strong)" }}
 >
 Reset adjustments
 </button>
 </div>
 </div>
 )}
 </SurfaceCard>
 </div>
 );
}







