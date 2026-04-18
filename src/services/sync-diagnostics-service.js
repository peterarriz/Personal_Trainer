const normalizeTimestamp = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeHttpStatus = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sanitizeCopy = (value = "", maxLen = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);

const createOperationState = () => ({
  attempts: 0,
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  lastFailureAt: 0,
  lastStatus: "idle",
  lastEndpoint: "",
  lastMethod: "",
  lastSource: "",
  lastHttpStatus: null,
  lastSupabaseErrorCode: "",
  lastErrorMessage: "",
});

export const SYNC_DIAGNOSTIC_EVENT_TYPES = Object.freeze({
  trainerDataSaveAttempt: "trainer_data_save_attempt",
  trainerDataSaveResult: "trainer_data_save_result",
  trainerDataLoadAttempt: "trainer_data_load_attempt",
  trainerDataLoadResult: "trainer_data_load_result",
  clientConfigState: "client_config_state",
  authSessionState: "auth_session_state",
  authRefreshAttempt: "auth_refresh_attempt",
  authRefreshResult: "auth_refresh_result",
  realtimeStatus: "realtime_status",
  realtimeAuthResult: "realtime_auth_result",
  realtimeResyncAttempt: "realtime_resync_attempt",
  realtimeResyncResult: "realtime_resync_result",
  localCacheState: "local_cache_state",
  localCacheDecision: "local_cache_decision",
});

export const createInitialSyncDiagnosticsState = ({ now = Date.now() } = {}) => ({
  updatedAt: normalizeTimestamp(now, Date.now()),
  lastSyncAttemptAt: 0,
  lastSyncSource: "",
  lastEndpoint: "",
  lastMethod: "",
  lastFailingEndpoint: "",
  lastFailingMethod: "",
  lastHttpStatus: null,
  lastSupabaseErrorCode: "",
  lastErrorMessage: "",
  retryEligible: false,
  retryReasonKey: "",
  pendingLocalWrites: false,
  clientConfig: {
    supabaseUrlConfigured: false,
    supabaseAnonKeyConfigured: false,
    supabaseUrlSource: "",
    supabaseAnonKeySource: "",
    supabaseUrlHost: "",
    configError: "",
  },
  authState: {
    hasSession: false,
    userId: "",
    email: "",
    hasRefreshToken: false,
    expiresAt: 0,
    lastEnsureStatus: "",
    source: "",
  },
  trainerDataSave: createOperationState(),
  trainerDataLoad: createOperationState(),
  authRefresh: createOperationState(),
  realtime: {
    lastStatus: "idle",
    lastStatusAt: 0,
    interrupted: false,
    reconnectAttempts: 0,
    lastReconnectReason: "",
    lastReconnectAt: 0,
    lastResyncStatus: "idle",
    lastResyncAt: 0,
    lastResyncErrorCode: "",
    lastResyncHttpStatus: null,
    lastAuthStatus: "idle",
    lastAuthAt: 0,
    lastAuthErrorCode: "",
    lastAuthHttpStatus: null,
  },
  localCache: {
    hasPendingWrites: false,
    lastObservedAt: 0,
    lastLocalMutationTs: 0,
    lastCloudSyncTs: 0,
    authorityDecision: "none",
    authorityReason: "",
    authorityAt: 0,
    localTs: 0,
    cloudTs: 0,
  },
});

const inferRetryReasonKey = (event = {}) => {
  const raw = [
    event?.retryReasonKey,
    event?.errorCode,
    event?.supabaseErrorCode,
    event?.errorMessage,
  ]
    .map((value) => sanitizeCopy(value, 240).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (/timeout|timed out|abort|aborted/.test(raw)) return "timeout";
  if (/network|offline|failed_to_fetch|request_failed|fetch_network/.test(raw)) return "network";
  if (/provider_unavailable|missing supabase|malformed supabase|anon key|supabase url/.test(raw)) return "provider_unavailable";
  if (/auth_required|jwt|expired|refresh/.test(raw)) return "auth";
  return sanitizeCopy(event?.retryReasonKey || "", 80) || "transient";
};

const applyAttemptToOperation = (operation = createOperationState(), event = {}, at = Date.now()) => ({
  ...operation,
  attempts: Number(operation.attempts || 0) + 1,
  lastAttemptAt: at,
  lastStatus: "attempting",
  lastEndpoint: sanitizeCopy(event?.endpoint || operation.lastEndpoint || "", 120),
  lastMethod: sanitizeCopy(event?.method || operation.lastMethod || "", 12),
  lastSource: sanitizeCopy(event?.source || operation.lastSource || "", 60),
});

const applyResultToOperation = (operation = createOperationState(), event = {}, at = Date.now()) => {
  const success = event?.ok !== false;
  return {
    ...operation,
    lastStatus: success ? "success" : "failed",
    lastSuccessAt: success ? at : operation.lastSuccessAt,
    lastFailureAt: success ? operation.lastFailureAt : at,
    lastEndpoint: sanitizeCopy(event?.endpoint || operation.lastEndpoint || "", 120),
    lastMethod: sanitizeCopy(event?.method || operation.lastMethod || "", 12),
    lastSource: sanitizeCopy(event?.source || operation.lastSource || "", 60),
    lastHttpStatus: normalizeHttpStatus(event?.httpStatus) ?? operation.lastHttpStatus,
    lastSupabaseErrorCode: sanitizeCopy(event?.supabaseErrorCode || "", 80),
    lastErrorMessage: sanitizeCopy(event?.errorMessage || "", 240),
  };
};

const applyGlobalFailure = (state, event, at) => ({
  ...state,
  updatedAt: at,
  lastFailingEndpoint: sanitizeCopy(event?.endpoint || "", 120),
  lastFailingMethod: sanitizeCopy(event?.method || "", 12),
  lastHttpStatus: normalizeHttpStatus(event?.httpStatus),
  lastSupabaseErrorCode: sanitizeCopy(event?.supabaseErrorCode || "", 80),
  lastErrorMessage: sanitizeCopy(event?.errorMessage || "", 240),
  retryEligible: Boolean(event?.retryEligible),
  retryReasonKey: Boolean(event?.retryEligible) ? inferRetryReasonKey(event) : state.retryReasonKey,
  pendingLocalWrites: event?.pendingLocalWrites == null ? state.pendingLocalWrites : Boolean(event.pendingLocalWrites),
});

export const reduceSyncDiagnosticsState = (
  currentState = createInitialSyncDiagnosticsState(),
  event = {},
) => {
  const state = {
    ...createInitialSyncDiagnosticsState({
      now: currentState?.updatedAt || Date.now(),
    }),
    ...(currentState || {}),
  };
  const type = String(event?.type || "").trim();
  const at = normalizeTimestamp(event?.at, Date.now());

  if (!type) return state;

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveAttempt) {
    return {
      ...state,
      updatedAt: at,
      lastSyncAttemptAt: at,
      lastSyncSource: sanitizeCopy(event?.source || "persist_all", 60),
      lastEndpoint: sanitizeCopy(event?.endpoint || "trainer_data", 120),
      lastMethod: sanitizeCopy(event?.method || "POST", 12),
      pendingLocalWrites: event?.pendingLocalWrites == null ? state.pendingLocalWrites : Boolean(event.pendingLocalWrites),
      trainerDataSave: applyAttemptToOperation(state.trainerDataSave, event, at),
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveResult) {
    const nextState = {
      ...state,
      updatedAt: at,
      pendingLocalWrites: event?.pendingLocalWrites == null ? state.pendingLocalWrites : Boolean(event.pendingLocalWrites),
      retryEligible: event?.retryEligible == null ? state.retryEligible : Boolean(event.retryEligible),
      retryReasonKey: event?.ok === false
        ? inferRetryReasonKey(event)
        : state.retryReasonKey,
      trainerDataSave: applyResultToOperation(state.trainerDataSave, event, at),
    };
    return event?.ok === false ? applyGlobalFailure(nextState, event, at) : nextState;
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadAttempt) {
    return {
      ...state,
      updatedAt: at,
      lastSyncAttemptAt: at,
      lastSyncSource: sanitizeCopy(event?.source || "cloud_reload", 60),
      lastEndpoint: sanitizeCopy(event?.endpoint || "trainer_data", 120),
      lastMethod: sanitizeCopy(event?.method || "GET", 12),
      trainerDataLoad: applyAttemptToOperation(state.trainerDataLoad, event, at),
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadResult) {
    const nextState = {
      ...state,
      updatedAt: at,
      retryEligible: event?.retryEligible == null ? state.retryEligible : Boolean(event.retryEligible),
      retryReasonKey: event?.ok === false
        ? inferRetryReasonKey(event)
        : state.retryReasonKey,
      pendingLocalWrites: event?.pendingLocalWrites == null ? state.pendingLocalWrites : Boolean(event.pendingLocalWrites),
      trainerDataLoad: applyResultToOperation(state.trainerDataLoad, event, at),
    };
    return event?.ok === false ? applyGlobalFailure(nextState, event, at) : nextState;
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.clientConfigState) {
    return {
      ...state,
      updatedAt: at,
      clientConfig: {
        supabaseUrlConfigured: Boolean(event?.supabaseUrlConfigured),
        supabaseAnonKeyConfigured: Boolean(event?.supabaseAnonKeyConfigured),
        supabaseUrlSource: sanitizeCopy(event?.supabaseUrlSource || "", 60),
        supabaseAnonKeySource: sanitizeCopy(event?.supabaseAnonKeySource || "", 60),
        supabaseUrlHost: sanitizeCopy(event?.supabaseUrlHost || "", 120),
        configError: sanitizeCopy(event?.configError || "", 240),
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.authSessionState) {
    return {
      ...state,
      updatedAt: at,
      authState: {
        hasSession: Boolean(event?.hasSession),
        userId: sanitizeCopy(event?.userId || "", 80),
        email: sanitizeCopy(event?.email || "", 120),
        hasRefreshToken: Boolean(event?.hasRefreshToken),
        expiresAt: normalizeTimestamp(event?.expiresAt, 0),
        lastEnsureStatus: sanitizeCopy(event?.lastEnsureStatus || "", 60),
        source: sanitizeCopy(event?.source || "", 60),
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshAttempt) {
    return {
      ...state,
      updatedAt: at,
      authRefresh: applyAttemptToOperation(state.authRefresh, event, at),
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshResult) {
    const nextState = {
      ...state,
      updatedAt: at,
      authRefresh: applyResultToOperation(state.authRefresh, event, at),
    };
    return event?.ok === false ? applyGlobalFailure(nextState, event, at) : nextState;
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeStatus) {
    const status = sanitizeCopy(event?.status || "idle", 60);
    const interrupted = ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status);
    return {
      ...state,
      updatedAt: at,
      realtime: {
        ...(state.realtime || {}),
        lastStatus: status,
        lastStatusAt: at,
        interrupted,
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeAuthResult) {
    return {
      ...state,
      updatedAt: at,
      realtime: {
        ...(state.realtime || {}),
        lastAuthStatus: event?.ok === false ? "failed" : "success",
        lastAuthAt: at,
        lastAuthErrorCode: sanitizeCopy(event?.supabaseErrorCode || event?.errorCode || "", 80),
        lastAuthHttpStatus: normalizeHttpStatus(event?.httpStatus),
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncAttempt) {
    return {
      ...state,
      updatedAt: at,
      realtime: {
        ...(state.realtime || {}),
        reconnectAttempts: Number(state?.realtime?.reconnectAttempts || 0) + 1,
        lastReconnectReason: sanitizeCopy(event?.reason || "", 120),
        lastReconnectAt: at,
        lastResyncStatus: "attempting",
        lastResyncAt: at,
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncResult) {
    return {
      ...state,
      updatedAt: at,
      realtime: {
        ...(state.realtime || {}),
        lastResyncStatus: event?.ok === false ? "failed" : "success",
        lastResyncAt: at,
        lastResyncErrorCode: sanitizeCopy(event?.supabaseErrorCode || event?.errorCode || "", 80),
        lastResyncHttpStatus: normalizeHttpStatus(event?.httpStatus),
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheState) {
    return {
      ...state,
      updatedAt: at,
      pendingLocalWrites: event?.hasPendingWrites == null ? state.pendingLocalWrites : Boolean(event.hasPendingWrites),
      localCache: {
        ...(state.localCache || {}),
        hasPendingWrites: Boolean(event?.hasPendingWrites),
        lastObservedAt: at,
        lastLocalMutationTs: normalizeTimestamp(event?.lastLocalMutationTs, 0),
        lastCloudSyncTs: normalizeTimestamp(event?.lastCloudSyncTs, 0),
      },
    };
  }

  if (type === SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheDecision) {
    return {
      ...state,
      updatedAt: at,
      localCache: {
        ...(state.localCache || {}),
        authorityDecision: sanitizeCopy(event?.decision || "none", 80),
        authorityReason: sanitizeCopy(event?.reason || "", 160),
        authorityAt: at,
        localTs: normalizeTimestamp(event?.localTs, 0),
        cloudTs: normalizeTimestamp(event?.cloudTs, 0),
      },
    };
  }

  return state;
};

export const formatSyncDiagnosticTimestamp = (value) => {
  const timestamp = normalizeTimestamp(value, 0);
  if (!timestamp) return "never";
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return "never";
  }
};
