import { STORAGE_STATUS_REASONS } from "../modules-auth-storage.js";

export const SYNC_STATE_IDS = Object.freeze({
  synced: "synced",
  syncing: "syncing",
  retrying: "retrying",
  offlineLocal: "offline-local",
  conflictNeedsResolution: "conflict-needs-resolution",
  staleCloud: "stale-cloud",
  fatalError: "fatal-error",
});

export const SYNC_STATE_TONES = Object.freeze({
  healthy: "healthy",
  neutral: "neutral",
  caution: "caution",
  critical: "critical",
});

export const SYNC_SURFACE_KEYS = Object.freeze({
  today: "today",
  program: "program",
  settings: "settings",
  auth: "auth",
});

export const SYNC_TRANSIENT_MIN_DWELL_MS = 10_000;
export const SYNC_TRANSIENT_COOLDOWN_MS = 30_000;

export const SYNC_RUNTIME_EVENT_TYPES = Object.freeze({
  onlineStatusChanged: "online_status_changed",
  cloudSyncStarted: "cloud_sync_started",
  cloudSyncSucceeded: "cloud_sync_succeeded",
  cloudSyncFailed: "cloud_sync_failed",
  localMutationRecorded: "local_mutation_recorded",
  realtimeInterrupted: "realtime_interrupted",
  realtimeResumed: "realtime_resumed",
  authStateChanged: "auth_state_changed",
});

export const STALE_CLOUD_AFTER_MS = 75_000;

const TRANSIENT_SYNC_STATE_IDS = new Set([
  SYNC_STATE_IDS.syncing,
  SYNC_STATE_IDS.retrying,
  SYNC_STATE_IDS.staleCloud,
]);

const CONFIRMED_RISK_SYNC_STATE_IDS = new Set([
  SYNC_STATE_IDS.fatalError,
  SYNC_STATE_IDS.conflictNeedsResolution,
]);

const normalizeTimestamp = (value, fallback = Date.now()) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sanitizeCopy = (value = "", maxLen = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);

const coerceBoolean = (value, fallback = false) => (value == null ? fallback : Boolean(value));

const pruneTransientCooldowns = (cooldowns = {}, now = Date.now()) => {
  const currentTime = normalizeTimestamp(now);
  return Object.entries(cooldowns || {}).reduce((next, [stateId, exitedAt]) => {
    const normalizedExitAt = normalizeTimestamp(exitedAt, 0);
    if (!normalizedExitAt) return next;
    if ((currentTime - normalizedExitAt) >= SYNC_TRANSIENT_COOLDOWN_MS) return next;
    next[stateId] = normalizedExitAt;
    return next;
  }, {});
};

export const isTransientSyncState = (stateId = "") => TRANSIENT_SYNC_STATE_IDS.has(String(stateId || "").trim());

export const isConfirmedRiskSyncState = (stateId = "") => CONFIRMED_RISK_SYNC_STATE_IDS.has(String(stateId || "").trim());

const inferRetryReasonKey = ({ storageStatus = null, syncRuntime = null } = {}) => {
  const rawError = [
    syncRuntime?.lastErrorCode,
    syncRuntime?.lastErrorMessage,
    storageStatus?.detail,
  ]
    .map((value) => sanitizeCopy(value, 240).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (/timeout|timed out|abort|aborted/.test(rawError)) return "timeout";
  if (/network|offline|failed_to_fetch|request_failed|fetch_network/.test(rawError)) return "network";
  return "transient";
};

const deriveOfflineReasonKey = ({
  storageReason = "",
  hasAuthSession = false,
  isOnline = true,
  hasLocalCache = false,
} = {}) => {
  if (!isOnline) return hasLocalCache ? "browser_offline_with_cache" : "browser_offline";
  if (storageReason === STORAGE_STATUS_REASONS.signedOut) return "signed_out";
  if (storageReason === STORAGE_STATUS_REASONS.authRequired) return "session_expired";
  if (storageReason === STORAGE_STATUS_REASONS.deviceReset) return "device_reset";
  if (storageReason === STORAGE_STATUS_REASONS.accountDeleted) return "account_deleted";
  if (storageReason === STORAGE_STATUS_REASONS.notSignedIn || !hasAuthSession) {
    return hasLocalCache ? "local_only_with_cache" : "local_only_blank";
  }
  return "offline_local";
};

export const createInitialSyncRuntimeState = ({
  isOnline = true,
  now = Date.now(),
} = {}) => ({
  isOnline: coerceBoolean(isOnline, true),
  cloudSyncInFlight: false,
  activeSource: "",
  lastCloudAttemptAt: 0,
  lastCloudSuccessAt: 0,
  lastCloudFailureAt: 0,
  lastErrorCode: "",
  lastErrorMessage: "",
  retryEligible: false,
  pendingLocalWrites: false,
  realtimeInterrupted: false,
  realtimeInterruptedAt: 0,
  conflictDetected: false,
  fatalErrorCode: "",
  updatedAt: normalizeTimestamp(now),
});

export const reduceSyncRuntimeState = (currentState = createInitialSyncRuntimeState(), event = {}) => {
  const state = {
    ...createInitialSyncRuntimeState({
      isOnline: currentState?.isOnline,
      now: currentState?.updatedAt || Date.now(),
    }),
    ...(currentState || {}),
  };
  const type = String(event?.type || "").trim();
  const at = normalizeTimestamp(event?.at, Date.now());

  if (!type) return state;

  if (type === SYNC_RUNTIME_EVENT_TYPES.onlineStatusChanged) {
    return {
      ...state,
      isOnline: coerceBoolean(event?.isOnline, state.isOnline),
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.cloudSyncStarted) {
    return {
      ...state,
      cloudSyncInFlight: true,
      activeSource: sanitizeCopy(event?.source || "sync", 60),
      lastCloudAttemptAt: at,
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.cloudSyncSucceeded) {
    return {
      ...state,
      cloudSyncInFlight: false,
      activeSource: "",
      lastCloudAttemptAt: state.lastCloudAttemptAt || at,
      lastCloudSuccessAt: at,
      lastCloudFailureAt: 0,
      lastErrorCode: "",
      lastErrorMessage: "",
      retryEligible: false,
      pendingLocalWrites: false,
      conflictDetected: false,
      fatalErrorCode: "",
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.cloudSyncFailed) {
    return {
      ...state,
      cloudSyncInFlight: false,
      activeSource: "",
      lastCloudAttemptAt: state.lastCloudAttemptAt || at,
      lastCloudFailureAt: at,
      lastErrorCode: sanitizeCopy(event?.errorCode || "", 80),
      lastErrorMessage: sanitizeCopy(event?.errorMessage || "", 240),
      retryEligible: coerceBoolean(event?.retryEligible, false),
      pendingLocalWrites: coerceBoolean(event?.pendingLocalWrites, state.pendingLocalWrites),
      conflictDetected: coerceBoolean(event?.conflictDetected, state.conflictDetected),
      fatalErrorCode: sanitizeCopy(event?.fatalErrorCode || "", 80),
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.localMutationRecorded) {
    return {
      ...state,
      pendingLocalWrites: coerceBoolean(event?.signedIn, false),
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.realtimeInterrupted) {
    return {
      ...state,
      realtimeInterrupted: true,
      realtimeInterruptedAt: at,
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.realtimeResumed) {
    return {
      ...state,
      realtimeInterrupted: false,
      realtimeInterruptedAt: 0,
      updatedAt: at,
    };
  }

  if (type === SYNC_RUNTIME_EVENT_TYPES.authStateChanged) {
    const hasAuthSession = coerceBoolean(event?.hasAuthSession, false);
    if (hasAuthSession) {
      return {
        ...state,
        updatedAt: at,
      };
    }
    return {
      ...state,
      cloudSyncInFlight: false,
      activeSource: "",
      pendingLocalWrites: false,
      realtimeInterrupted: false,
      realtimeInterruptedAt: 0,
      retryEligible: false,
      updatedAt: at,
    };
  }

  return state;
};

const buildBaseStatePresentation = ({
  id = SYNC_STATE_IDS.synced,
  reasonKey = "synced",
  tone = SYNC_STATE_TONES.neutral,
  chipLabel = "Synced",
  headline = "Cloud and device are aligned",
  detail = "",
  assurance = "",
  nextStep = "",
} = {}) => ({
  id,
  reasonKey,
  tone,
  chipLabel,
  headline,
  detail,
  assurance,
  nextStep,
  needsAttention: tone !== SYNC_STATE_TONES.healthy,
});

export const buildSyncStateModel = ({
  storageStatus = null,
  authSession = null,
  syncRuntime = null,
  authError = "",
  hasLocalCache = false,
  authInitializing = false,
  appLoading = false,
  now = Date.now(),
} = {}) => {
  const runtime = {
    ...createInitialSyncRuntimeState({
      isOnline: syncRuntime?.isOnline,
      now: syncRuntime?.updatedAt || now,
    }),
    ...(syncRuntime || {}),
  };
  const hasAuthSession = Boolean(authSession?.user?.id);
  const storageReason = String(storageStatus?.reason || "").trim();
  const detail = sanitizeCopy(storageStatus?.detail || "", 260);
  const authErrorText = sanitizeCopy(authError || "", 260);
  const authProviderUnavailable = /provider unavailable|missing supabase|malformed supabase|anon key|supabase url|cloud sync is unavailable/i.test(authErrorText.toLowerCase());
  const currentTime = normalizeTimestamp(now, runtime.updatedAt || Date.now());
  const browserOnline = runtime.isOnline !== false;
  const staleFailure = runtime.lastCloudFailureAt > 0 && (currentTime - runtime.lastCloudFailureAt) >= STALE_CLOUD_AFTER_MS;
  const shouldFavorRetryingState = (
    runtime.retryEligible
    && runtime.lastCloudFailureAt > 0
    && (
      runtime.cloudSyncInFlight
      || storageReason === STORAGE_STATUS_REASONS.transient
      || storageStatus?.mode === "syncing"
    )
  );
  const unknownWhileSignedOut = !hasAuthSession && !authInitializing && !appLoading && !storageReason;
  const unknownBootState = (authInitializing || appLoading) && !storageReason;
  const unknownInitialLocalState = !hasAuthSession && !authInitializing && !appLoading && storageReason === STORAGE_STATUS_REASONS.unknown;

  if ((runtime.cloudSyncInFlight || storageStatus?.mode === "syncing" || unknownBootState) && !shouldFavorRetryingState) {
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.syncing,
      reasonKey: "syncing",
      tone: SYNC_STATE_TONES.neutral,
      chipLabel: "Syncing",
      headline: "Syncing in background",
      detail: detail || "Cloud copy is updating in the background.",
    });
  }

  if (runtime.fatalErrorCode || storageReason === STORAGE_STATUS_REASONS.providerUnavailable || authProviderUnavailable) {
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.fatalError,
      reasonKey: "provider_unavailable",
      tone: SYNC_STATE_TONES.critical,
      chipLabel: "Cloud unavailable",
      headline: "Cloud sync is unavailable",
      detail: detail || authErrorText || "The cloud provider is unavailable or misconfigured, so FORMA is staying local on this device.",
      assurance: "Local training data remains usable on this device.",
      nextStep: "Keep using this device locally for now. Cloud features return once the deployment is fixed.",
    });
  }

  if (runtime.conflictDetected || storageReason === STORAGE_STATUS_REASONS.dataIncompatible) {
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.conflictNeedsResolution,
      reasonKey: "data_incompatible",
      tone: SYNC_STATE_TONES.critical,
      chipLabel: "Needs review",
      headline: "Sync needs review before cloud data can replace this device",
      detail: detail || "Cloud data could not be applied safely, so FORMA kept local data active instead of guessing.",
      assurance: "The current local copy remains the authoritative state on this device.",
      nextStep: "Review the deployment data and reload cloud data when ready.",
    });
  }

  if ((runtime.realtimeInterrupted || staleFailure) && hasAuthSession && browserOnline) {
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.staleCloud,
      reasonKey: runtime.realtimeInterrupted ? "realtime_interrupted" : "stale_after_retry",
      tone: SYNC_STATE_TONES.caution,
      chipLabel: "Cloud behind",
      headline: "Cloud slightly behind",
      detail: runtime.realtimeInterrupted
        ? "Cloud copy may be a little behind this device right now."
        : "Cloud copy may be a little behind this device right now.",
    });
  }

  if (storageReason === STORAGE_STATUS_REASONS.transient || runtime.retryEligible) {
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.retrying,
      reasonKey: inferRetryReasonKey({ storageStatus, syncRuntime: runtime }),
      tone: SYNC_STATE_TONES.caution,
      chipLabel: "Retrying",
      headline: "Retrying cloud sync",
      detail: "Cloud sync is retrying in the background.",
    });
  }

  if (
    !browserOnline
    || storageReason === STORAGE_STATUS_REASONS.notSignedIn
    || storageReason === STORAGE_STATUS_REASONS.signedOut
    || storageReason === STORAGE_STATUS_REASONS.authRequired
    || storageReason === STORAGE_STATUS_REASONS.deviceReset
    || storageReason === STORAGE_STATUS_REASONS.accountDeleted
    || unknownWhileSignedOut
    || unknownInitialLocalState
  ) {
    const reasonKey = deriveOfflineReasonKey({
      storageReason,
      hasAuthSession,
      isOnline: browserOnline,
      hasLocalCache,
    });
    const detailByReason = {
      browser_offline: "Internet is offline, so FORMA is running from local data only for now.",
      browser_offline_with_cache: "Internet is offline, so FORMA is using the training data already saved on this device.",
      signed_out: "Cloud sync is paused until you sign back in.",
      session_expired: "Your cloud session ended, so FORMA stayed on local data instead of discarding work.",
      device_reset: "This device was cleared locally. Sign in to reload cloud data or keep going with a blank local start.",
      account_deleted: "The cloud account was removed from this device. Local storage is now in a device-only state.",
      local_only_with_cache: "This device has a local training copy available even without cloud sign-in.",
      local_only_blank: "This device is ready to start locally even before cloud sign-in is active.",
      offline_local: "FORMA is staying local on this device until cloud access returns.",
    };
    const nextStepByReason = {
      browser_offline: "Reconnect when you want cloud sync back.",
      browser_offline_with_cache: "Reconnect when you want cloud sync back.",
      signed_out: "Sign in when you want sync, backup, and account recovery back.",
      session_expired: "Sign in again when you want cloud sync back.",
      device_reset: "Choose sign-in if you want the cloud copy, or continue locally to start fresh.",
      account_deleted: "Create a new account if you want cloud sync again.",
      local_only_with_cache: "Sign in when you want sync, backup, and account recovery back.",
      local_only_blank: "Create or sign in to a cloud account when you want sync and recovery.",
      offline_local: "Sign in when cloud sync should resume.",
    };
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.offlineLocal,
      reasonKey,
      tone: SYNC_STATE_TONES.neutral,
      chipLabel: "Device-only",
      headline: "This device is running locally without cloud sync",
      detail: detailByReason[reasonKey] || detail || "FORMA is staying local on this device for now.",
      assurance: "Local resilience stays active unless you explicitly clear this device.",
      nextStep: nextStepByReason[reasonKey] || "Sign in when you want cloud sync back.",
    });
  }

  if (storageReason === STORAGE_STATUS_REASONS.synced || storageStatus?.mode === "cloud") {
    return buildBaseStatePresentation({
      id: SYNC_STATE_IDS.synced,
      reasonKey: "synced",
      tone: SYNC_STATE_TONES.healthy,
      chipLabel: "Synced",
      headline: "Cloud and device are aligned",
      detail: detail || "Cloud sync is current and this device still keeps a local copy for resilience.",
      assurance: "You can keep training if the connection drops later.",
      nextStep: "No action needed.",
    });
  }

  return buildBaseStatePresentation({
    id: SYNC_STATE_IDS.offlineLocal,
    reasonKey: "offline_local",
    tone: SYNC_STATE_TONES.neutral,
    chipLabel: "Device-only",
    headline: "This device is running locally without cloud sync",
    detail: detail || "FORMA is keeping this device active locally while cloud status settles.",
    assurance: "Local resilience stays active unless you explicitly clear this device.",
    nextStep: "Sign in when you want cloud sync back.",
  });
};

export const createInitialSyncPresentationState = ({
  syncState = null,
  now = Date.now(),
} = {}) => ({
  displayedState: syncState || buildSyncStateModel(),
  enteredAt: normalizeTimestamp(now),
  transientCooldowns: {},
  nextUpdateAt: 0,
});

const transitionSyncPresentationState = ({
  currentPresentation = null,
  targetState = null,
  now = Date.now(),
} = {}) => {
  const currentTime = normalizeTimestamp(now);
  const activePresentation = currentPresentation || createInitialSyncPresentationState({
    syncState: targetState,
    now: currentTime,
  });
  const currentState = activePresentation.displayedState || targetState || buildSyncStateModel();
  const nextCooldowns = pruneTransientCooldowns(activePresentation.transientCooldowns, currentTime);

  if (currentState?.id && currentState.id !== targetState?.id && isTransientSyncState(currentState.id)) {
    nextCooldowns[currentState.id] = currentTime;
  }

  return {
    displayedState: targetState || buildSyncStateModel(),
    enteredAt: currentTime,
    transientCooldowns: pruneTransientCooldowns(nextCooldowns, currentTime),
    nextUpdateAt: 0,
  };
};

export const stabilizeSyncStatePresentation = ({
  currentPresentation = null,
  syncState = null,
  now = Date.now(),
} = {}) => {
  const currentTime = normalizeTimestamp(now);
  const targetState = syncState || buildSyncStateModel();
  if (!currentPresentation?.displayedState?.id) {
    return createInitialSyncPresentationState({
      syncState: targetState,
      now: currentTime,
    });
  }

  const activePresentation = {
    ...createInitialSyncPresentationState({
      syncState: currentPresentation.displayedState,
      now: currentPresentation.enteredAt || currentTime,
    }),
    ...(currentPresentation || {}),
    transientCooldowns: pruneTransientCooldowns(currentPresentation.transientCooldowns, currentTime),
  };
  const currentState = activePresentation.displayedState || targetState;

  if (currentState.id === targetState.id) {
    return {
      ...activePresentation,
      displayedState: targetState,
      nextUpdateAt: 0,
    };
  }

  if (isConfirmedRiskSyncState(targetState.id) || isConfirmedRiskSyncState(currentState.id)) {
    return transitionSyncPresentationState({
      currentPresentation: activePresentation,
      targetState,
      now: currentTime,
    });
  }

  if (isTransientSyncState(currentState.id)) {
    const dwellUntil = normalizeTimestamp(activePresentation.enteredAt, currentTime) + SYNC_TRANSIENT_MIN_DWELL_MS;
    if (dwellUntil > currentTime) {
      return {
        ...activePresentation,
        nextUpdateAt: dwellUntil,
      };
    }
  }

  if (isTransientSyncState(targetState.id)) {
    const lastExitedAt = normalizeTimestamp(activePresentation.transientCooldowns?.[targetState.id], 0);
    const mostRecentTransientExitAt = Object.values(activePresentation.transientCooldowns || {}).reduce(
      (latest, value) => Math.max(latest, normalizeTimestamp(value, 0)),
      0
    );
    const cooldownUntil = Math.max(lastExitedAt, mostRecentTransientExitAt) + (Math.max(lastExitedAt, mostRecentTransientExitAt) ? SYNC_TRANSIENT_COOLDOWN_MS : 0);
    if (cooldownUntil > currentTime) {
      return {
        ...activePresentation,
        nextUpdateAt: cooldownUntil,
      };
    }
  }

  return transitionSyncPresentationState({
    currentPresentation: activePresentation,
    targetState,
    now: currentTime,
  });
};

const createSurfaceModel = ({
  syncState = null,
  surface = SYNC_SURFACE_KEYS.today,
} = {}) => {
  const state = syncState || buildSyncStateModel();
  const compact = surface === SYNC_SURFACE_KEYS.today || surface === SYNC_SURFACE_KEYS.program;
  const confirmedRisk = isConfirmedRiskSyncState(state.id);
  const transient = isTransientSyncState(state.id);
  const showFullCard = surface === SYNC_SURFACE_KEYS.settings
    ? true
    : surface === SYNC_SURFACE_KEYS.auth
    ? true
    : confirmedRisk;
  const showInline = false;
  const showCompactChip = compact && !confirmedRisk;
  const eyebrow = surface === SYNC_SURFACE_KEYS.settings
    ? "SYNC STATE"
    : surface === SYNC_SURFACE_KEYS.auth
    ? "DEVICE + CLOUD"
    : "SYNC";
  const title = transient && showFullCard
    ? state.detail || state.headline
    : state.headline;
  const detail = transient && showFullCard
    ? ""
    : state.detail;
  const support = transient
    ? ""
    : surface === SYNC_SURFACE_KEYS.settings
    ? state.nextStep
    : confirmedRisk
    ? state.assurance
    : "";
  const compactMessage = transient
    ? state.detail || state.headline
    : state.headline || state.detail;
  const compactDetail = confirmedRisk ? detail : compactMessage;
  return {
    surface,
    tone: state.tone,
    stateId: state.id,
    reasonKey: state.reasonKey,
    showFullCard,
    showInline,
    showCompactChip,
    eyebrow,
    chipLabel: state.chipLabel,
    title,
    detail,
    support,
    compactDetail,
    compactMessage,
    nextStep: state.nextStep,
  };
};

export const buildSyncSurfaceModel = createSurfaceModel;
