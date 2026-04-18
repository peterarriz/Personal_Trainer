import {
  applyCanonicalRuntimeStateSetters,
  buildCanonicalRuntimeStateFromStorage,
  buildPersistedTrainerPayload,
  DEFAULT_COACH_PLAN_ADJUSTMENTS,
  DEFAULT_NUTRITION_FAVORITES,
} from "./services/persistence-adapter-service.js";
import {
  sanitizeExercisePerformanceRowsForRest,
  sanitizeGoalRowsForRest,
  sanitizeTrainerDataPayloadForRest,
} from "./services/persistence-contract-service.js";
import { buildLegacyStrengthPerformanceFromRecords, getExercisePerformanceRecordsForLog } from "./services/performance-record-service.js";
import { SYNC_DIAGNOSTIC_EVENT_TYPES } from "./services/sync-diagnostics-service.js";

export const SB_ROW = "trainer_v1";
export const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
export const AUTH_CACHE_KEY = "trainer_auth_session_v1";
export const AUTH_RECOVERY_CACHE_KEY = "trainer_auth_recovery_v1";
export const AUTH_REQUIRED = "AUTH_REQUIRED";
export const AUTH_TRANSIENT = "AUTH_TRANSIENT";
export const AUTH_PROVIDER_UNAVAILABLE = "AUTH_PROVIDER_UNAVAILABLE";
export const AUTH_DATA_INCOMPATIBLE = "AUTH_DATA_INCOMPATIBLE";
export const AUTH_DELETE_NOT_CONFIGURED = "AUTH_DELETE_NOT_CONFIGURED";
export const TRANSIENT_PERSIST_RETRY_COOLDOWN_MS = 15000;

export const STORAGE_STATUS_REASONS = {
  notSignedIn: "not_signed_in",
  signedOut: "signed_out",
  accountDeleted: "account_deleted",
  deviceReset: "device_reset",
  setupDeferred: "setup_deferred",
  authRequired: "auth_required",
  transient: "sync_temporarily_failed",
  providerUnavailable: "provider_unavailable",
  dataIncompatible: "data_incompatible",
  synced: "synced",
  unknown: "unknown",
};

export const buildStorageStatus = ({
  mode = "local",
  label = "LOCAL MODE",
  reason = STORAGE_STATUS_REASONS.unknown,
  detail = "",
} = {}) => ({
  mode,
  label,
  reason,
  detail,
});

const applyStorageStatusUpdate = (setStorageStatus, nextStatus) => {
  if (typeof setStorageStatus !== "function" || !nextStatus) return;
  setStorageStatus(nextStatus);
};

const buildStructuredError = (message, details = {}) => {
  const error = new Error(String(message || "Unknown auth lifecycle failure."));
  Object.assign(error, details || {});
  return error;
};

const isTransientStorageMessage = (message = "") => (
  /auth_transient|fetch_timeout|fetch_network|timeout|timed out|abort|aborted|failed to fetch|networkerror|network request failed|load failed 5\d\d|load failed 429|temporarily unavailable/i.test(String(message || ""))
);

const isTerminalRefreshFailure = (error = null) => {
  const code = String(error?.supabaseErrorCode || error?.code || "").trim().toLowerCase();
  const status = Number(error?.httpStatus || 0);
  const message = String(error?.message || error || "").trim().toLowerCase();
  if (code === "invalid_grant" || code === "refresh_token_not_found" || code === "session_not_found") return true;
  if (status === 400 || status === 401) return true;
  return /invalid refresh token|refresh token.+expired|session.+expired|jwt expired|token.+revoked/.test(message);
};

const classifyRefreshFailureKind = (error = null) => {
  if (String(error?.message || "") === AUTH_PROVIDER_UNAVAILABLE) return "provider_unavailable";
  if (isTerminalRefreshFailure(error)) return "terminal";
  const status = Number(error?.httpStatus || 0);
  const message = String(error?.message || error || "");
  if (status === 429 || status >= 500 || isTransientStorageMessage(message)) return "transient";
  return "transient";
};

export const classifyStorageError = (error) => {
  const message = String(error?.message || error || "");
  if (message === AUTH_REQUIRED) {
    return buildStorageStatus({
      mode: "local",
      label: "SIGN IN REQUIRED",
      reason: STORAGE_STATUS_REASONS.authRequired,
      detail: "Your session expired or is no longer valid. Sign in again to resume cloud sync.",
    });
  }
  if (message === AUTH_TRANSIENT) {
    return buildStorageStatus({
      mode: "local",
      label: "SYNC RETRYING",
      reason: STORAGE_STATUS_REASONS.transient,
      detail: "Cloud sync failed temporarily. Local changes are still being kept safely.",
    });
  }
  if (isTransientStorageMessage(message)) {
    const timeoutLike = /fetch_timeout|timeout|timed out|abort|aborted/i.test(message);
    return buildStorageStatus({
      mode: "local",
      label: "SYNC RETRYING",
      reason: STORAGE_STATUS_REASONS.transient,
      detail: timeoutLike
        ? "Cloud sync timed out. Local changes are still saved safely on this device."
        : "Cloud sync is temporarily unreachable. Local changes are still saved safely on this device.",
    });
  }
  if (message === AUTH_PROVIDER_UNAVAILABLE || /Missing Supabase|Malformed Supabase|anon key|Supabase URL/i.test(message)) {
    return buildStorageStatus({
      mode: "local",
      label: "PROVIDER ERROR",
      reason: STORAGE_STATUS_REASONS.providerUnavailable,
      detail: "Cloud sync provider is unavailable or misconfigured.",
    });
  }
  if (message === AUTH_DATA_INCOMPATIBLE || /data payload invalid|Cannot read properties|Unexpected token|JSON/i.test(message)) {
    return buildStorageStatus({
      mode: "local",
      label: "DATA ERROR",
      reason: STORAGE_STATUS_REASONS.dataIncompatible,
      detail: "Cloud data could not be read safely, so the app is using local data.",
    });
  }
  return buildStorageStatus({
    mode: "local",
    label: "SYNC RETRYING",
    reason: STORAGE_STATUS_REASONS.transient,
    detail: "Still trying to sync to your account. Your changes are saved on this device.",
  });
};

const stableSortValue = (value) => {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableSortValue(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const createStableFingerprint = (value) => {
  try {
    return JSON.stringify(stableSortValue(value));
  } catch {
    return String(value ?? "");
  }
};

const normalizeSyncMetaNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const stripSyncMeta = (payload = {}) => {
  if (!payload || typeof payload !== "object") return {};
  const { syncMeta, ...rest } = payload;
  return rest;
};

const stripFingerprintNoise = (payload = {}) => {
  const normalized = stripSyncMeta(payload || {});
  if (!normalized || typeof normalized !== "object") return {};
  const { ts, ...rest } = normalized;
  return rest;
};

const createPersistedPayloadFingerprint = (payload = {}) => createStableFingerprint(
  stripFingerprintNoise(payload || {})
);

const shouldDeferCloudWrite = (payload = {}) => !Boolean(payload?.personalization?.profile?.onboardingComplete);

const buildLocalCachePayload = ({
  payload = {},
  pendingCloudWrite = false,
  syncedAt = null,
  previousSyncMeta = null,
} = {}) => {
  const localTs = normalizeSyncMetaNumber(payload?.ts) || Date.now();
  const previous = previousSyncMeta && typeof previousSyncMeta === "object" ? previousSyncMeta : {};
  const nextSyncMeta = {
    pendingCloudWrite: Boolean(pendingCloudWrite),
    lastLocalMutationTs: localTs,
    lastCloudSyncTs: Boolean(pendingCloudWrite)
      ? normalizeSyncMetaNumber(previous?.lastCloudSyncTs)
      : normalizeSyncMetaNumber(syncedAt)
        || normalizeSyncMetaNumber(previous?.lastCloudSyncTs)
        || localTs,
  };
  return {
    ...(payload || {}),
    syncMeta: nextSyncMeta,
  };
};

const shouldPreferPendingLocalCache = ({
  localPayload = null,
  cloudPayload = null,
} = {}) => {
  const localTs = normalizeSyncMetaNumber(localPayload?.ts);
  const cloudTs = normalizeSyncMetaNumber(cloudPayload?.ts);
  if (!Boolean(localPayload?.syncMeta?.pendingCloudWrite)) return false;
  const localFingerprint = createPersistedPayloadFingerprint(localPayload || {});
  const cloudFingerprint = createPersistedPayloadFingerprint(cloudPayload || {});
  if (localFingerprint !== cloudFingerprint) return true;
  return Boolean(localTs) && (!cloudTs || localTs > cloudTs);
};

export const decodeJwtPayload = (token) => {
  try {
    const [, payload = ""] = String(token || "").split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const getTokenExpiryMs = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return Number(payload.exp) * 1000;
};

export const getClientCloudConfigDiagnostics = () => {
  if (typeof window === "undefined") {
    return {
      supabaseUrlConfigured: false,
      supabaseAnonKeyConfigured: false,
      supabaseUrlSource: "",
      supabaseAnonKeySource: "",
      supabaseUrlHost: "",
      configError: "",
    };
  }
  const config = window.__FORMA_CLIENT_CONFIG__ || {};
  const rawSupabaseUrl = String(window.__SUPABASE_URL || "").trim();
  let urlHost = String(config?.supabaseUrlHost || "").trim();
  if (!urlHost && rawSupabaseUrl) {
    try {
      urlHost = new URL(rawSupabaseUrl).host;
    } catch {
      urlHost = "";
    }
  }
  return {
    supabaseUrlConfigured: Boolean(rawSupabaseUrl),
    supabaseAnonKeyConfigured: Boolean(String(window.__SUPABASE_ANON_KEY || "").trim()),
    supabaseUrlSource: String(config?.supabaseUrlSource || "").trim(),
    supabaseAnonKeySource: String(config?.supabaseAnonKeySource || "").trim(),
    supabaseUrlHost: urlHost,
    configError: String(config?.configError || "").trim(),
  };
};

export const normalizeSession = (session, fallback = null) => {
  if (!session?.access_token || !(session?.user?.id || fallback?.user?.id)) return null;
  const expiresAt = getTokenExpiryMs(session.access_token) || Number(session.expires_at || 0) * 1000 || null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token || fallback?.refresh_token || "",
    user: session.user || fallback?.user || null,
    expires_at: expiresAt ? Math.floor(expiresAt / 1000) : null,
  };
};

export function createAuthStorageModule({ safeFetchWithTimeout, logDiag, mergePersonalization, normalizeGoals, DEFAULT_PERSONALIZATION, DEFAULT_MULTI_GOALS, analytics = null, reportSyncDiagnostic = null }) {
  const rawSupabaseUrl = (typeof window !== "undefined" ? (window.__SUPABASE_URL || "") : "").trim();
  const SB_URL = rawSupabaseUrl.replace(/\/+$/, "");
  const SB_KEY = (typeof window !== "undefined" ? (window.__SUPABASE_ANON_KEY || "") : "").trim();
  let hasValidSupabaseUrl = false;
  try {
    const parsed = new URL(SB_URL || "https://invalid.local");
    hasValidSupabaseUrl = parsed.protocol === "https:" && !!parsed.hostname;
  } catch {
    hasValidSupabaseUrl = false;
  }
  const persistenceWarningSink = (message, details = {}) => {
    try { logDiag?.(message, JSON.stringify(details || {})); } catch {}
  };
  const pushSyncDiagnostic = (event = {}) => {
    try {
      reportSyncDiagnostic?.(event);
    } catch {}
  };
  let lastSyncedGoalsFingerprint = "";
  let lastSyncedCoachMemoryFingerprint = "";
  let lastPersistedPayloadFingerprint = "";
  let lastPersistedUserId = "";
  let lastTransientPersistFailureAt = 0;
  let lastTransientPersistFailureUserId = "";
  let activePersistPromise = null;
  let activePersistUserId = "";
  const trackAnalytics = ({ flow = "sync", action = "storage", outcome = "observed", props = {} } = {}) => {
    try {
      analytics?.track?.({ flow, action, outcome, props });
    } catch {}
  };
  const classifyAnalyticsErrorCode = (error = null) => {
    const code = String(error?.code || "").trim();
    if (code) return code;
    const message = String(error?.message || error || "").trim();
    if (!message) return "unknown";
    if (message === AUTH_REQUIRED) return "auth_required";
    if (message === AUTH_TRANSIENT) return "auth_transient";
    if (message === AUTH_PROVIDER_UNAVAILABLE) return "provider_unavailable";
    if (message === AUTH_DATA_INCOMPATIBLE) return "data_incompatible";
    if (message === AUTH_DELETE_NOT_CONFIGURED) return "delete_account_not_configured";
    return message.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";
  };
  const resetTransientPersistCooldown = () => {
    lastTransientPersistFailureAt = 0;
    lastTransientPersistFailureUserId = "";
  };
  const markTransientPersistFailure = (userId = "") => {
    lastTransientPersistFailureAt = Date.now();
    lastTransientPersistFailureUserId = String(userId || "");
  };
  const isWithinTransientPersistCooldown = (userId = "") => {
    if (!lastTransientPersistFailureAt) return false;
    if (String(userId || "") !== lastTransientPersistFailureUserId) return false;
    return (Date.now() - lastTransientPersistFailureAt) < TRANSIENT_PERSIST_RETRY_COOLDOWN_MS;
  };
  const SB_CONFIG_ERROR = !SB_URL
    ? "Missing Supabase URL. Set VITE_SUPABASE_URL or SUPABASE_URL for the client build."
    : !hasValidSupabaseUrl
    ? `Malformed Supabase URL: ${SB_URL}`
    : !SB_KEY
    ? "Missing Supabase anon key. Set VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY for the client build."
    : "";
  if (typeof window !== "undefined" && window.__FORMA_CLIENT_CONFIG__) {
    window.__FORMA_CLIENT_CONFIG__.configError = SB_CONFIG_ERROR || "";
  }

  const sbH = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
  const sbUserHeaders = (token) => ({ "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + token });

  const emitLocalCacheDiagnostics = (payload = null, at = Date.now()) => {
    pushSyncDiagnostic({
      type: SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheState,
      at,
      hasPendingWrites: Boolean(payload?.syncMeta?.pendingCloudWrite),
      lastLocalMutationTs: normalizeSyncMetaNumber(payload?.syncMeta?.lastLocalMutationTs),
      lastCloudSyncTs: normalizeSyncMetaNumber(payload?.syncMeta?.lastCloudSyncTs),
    });
  };

  const decorateFetchError = (error, {
    endpoint = "",
    method = "GET",
  } = {}) => {
    if (!error || typeof error !== "object") return error;
    if (!error.endpoint) error.endpoint = endpoint;
    if (!error.method) error.method = method;
    if (!error.supabaseErrorCode && error.code) error.supabaseErrorCode = String(error.code || "");
    return error;
  };

  const buildResponseError = async ({
    res,
    endpoint = "",
    method = "GET",
    fallbackMessage = "Cloud request failed.",
  } = {}) => {
    const text = await res.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const message = String(
      json?.message
      || json?.error_description
      || json?.error
      || text
      || fallbackMessage
    ).trim() || fallbackMessage;
    return buildStructuredError(message, {
      endpoint,
      method,
      httpStatus: Number(res?.status || 0) || null,
      supabaseErrorCode: String(json?.code || json?.error_code || json?.error || "").trim(),
      responseText: String(text || "").slice(0, 400),
      code: String(json?.code || json?.error_code || "").trim(),
    });
  };

  const localLoad = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const localSave = (payload) => {
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload));
      emitLocalCacheDiagnostics(payload, Date.now());
    } catch {}
  };

  const clearLocalCache = () => {
    try {
      if (typeof localStorage?.removeItem === "function") {
        localStorage.removeItem(LOCAL_CACHE_KEY);
      } else {
        localStorage.setItem(LOCAL_CACHE_KEY, "null");
      }
      emitLocalCacheDiagnostics(null, Date.now());
    } catch {}
  };

  const loadAuthSession = () => {
    try {
      const raw = localStorage.getItem(AUTH_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const saveAuthSession = (session) => {
    try { localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(session || null)); } catch {}
  };

  const clearCachedAuthSession = () => {
    try {
      if (typeof localStorage?.removeItem === "function") {
        localStorage.removeItem(AUTH_CACHE_KEY);
      } else {
        localStorage.setItem(AUTH_CACHE_KEY, "null");
      }
    } catch {}
  };
  const loadPasswordRecoverySession = () => {
    try {
      const raw = localStorage.getItem(AUTH_RECOVERY_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const savePasswordRecoverySession = (session) => {
    try {
      localStorage.setItem(AUTH_RECOVERY_CACHE_KEY, JSON.stringify(session || null));
    } catch {}
  };
  const clearPasswordRecoverySession = () => {
    try {
      if (typeof localStorage?.removeItem === "function") {
        localStorage.removeItem(AUTH_RECOVERY_CACHE_KEY);
      } else {
        localStorage.setItem(AUTH_RECOVERY_CACHE_KEY, "null");
      }
    } catch {}
  };
  const authRequest = async (path, options = {}) => {
    if (SB_CONFIG_ERROR) throw new Error(AUTH_PROVIDER_UNAVAILABLE);
    const method = String(options?.method || "GET").toUpperCase();
    const endpoint = `auth/v1/${path}`;
    let res = null;
    try {
      res = await safeFetchWithTimeout(`${SB_URL}/${endpoint}`, {
        ...options,
        headers: { "Content-Type": "application/json", "apikey": SB_KEY, ...(options.headers || {}) }
      });
    } catch (error) {
      throw decorateFetchError(error, { endpoint, method });
    }
    if (!res.ok) throw await buildResponseError({ res, endpoint, method, fallbackMessage: "Auth request failed." });
    return res.status === 204 ? {} : res.json();
  };

  const checkDeleteAccountAvailability = async (authToken = "") => {
    const startedAt = Date.now();
    const res = await safeFetchWithTimeout("/api/auth/delete-account", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw buildStructuredError(
        String(data?.message || "Delete-account diagnostics could not be loaded."),
        {
          code: String(data?.code || "delete_account_diagnostics_failed"),
          detail: String(data?.detail || ""),
          fix: String(data?.fix || ""),
          configured: data?.configured,
          missing: Array.isArray(data?.missing) ? data.missing : [],
          required: Array.isArray(data?.required) ? data.required : [],
        }
      );
    }
    trackAnalytics({
      flow: "settings",
      action: "delete_diagnostics",
      outcome: data?.configured ? "success" : "blocked",
      props: {
        duration_ms: Date.now() - startedAt,
        configured: Boolean(data?.configured),
        missing_count: Array.isArray(data?.missing) ? data.missing.length : 0,
      },
    });
    return {
      configured: Boolean(data?.configured),
      code: String(data?.code || (data?.configured ? "delete_account_configured" : "delete_account_not_configured")),
      message: String(data?.message || ""),
      detail: String(data?.detail || ""),
      fix: String(data?.fix || ""),
      missing: Array.isArray(data?.missing) ? data.missing : [],
      required: Array.isArray(data?.required) ? data.required : [],
    };
  };

  const refreshSession = async (refreshToken, fallbackSession = null) => {
    if (!refreshToken) return null;
    const endpoint = "auth/v1/token?grant_type=refresh_token";
    pushSyncDiagnostic({
      type: SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshAttempt,
      endpoint,
      method: "POST",
      source: "refresh_session",
      at: Date.now(),
    });
    try {
      const data = await authRequest("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) });
      const normalized = normalizeSession({ ...data, refresh_token: data?.refresh_token || refreshToken }, fallbackSession);
      if (!normalized?.access_token || !normalized?.user?.id) return null;
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshResult,
        ok: true,
        endpoint,
        method: "POST",
        source: "refresh_session",
        httpStatus: 200,
        at: Date.now(),
      });
      return normalized;
    } catch (e) {
      logDiag("auth.refresh.failed", e?.message || "unknown");
      const failureKind = classifyRefreshFailureKind(e);
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshResult,
        ok: false,
        endpoint,
        method: "POST",
        source: "refresh_session",
        httpStatus: e?.httpStatus,
        supabaseErrorCode: e?.supabaseErrorCode || e?.code || "",
        errorMessage: e?.message || "",
        retryEligible: failureKind === "transient",
        at: Date.now(),
      });
      if (failureKind === "terminal") {
        return null;
      }
      const propagatedMessage = failureKind === "provider_unavailable" ? AUTH_PROVIDER_UNAVAILABLE : AUTH_TRANSIENT;
      throw buildStructuredError(propagatedMessage, {
        endpoint,
        method: "POST",
        httpStatus: e?.httpStatus || null,
        supabaseErrorCode: String(e?.supabaseErrorCode || e?.code || "").trim(),
        responseText: String(e?.responseText || "").slice(0, 400),
        detail: String(e?.message || "").trim(),
      });
    }
  };

  const ensureValidSession = async (session, { reason = "unspecified" } = {}) => {
    const normalized = normalizeSession(session);
    if (!normalized?.access_token || !normalized?.user?.id) {
      logDiag("auth.ensure.missing", reason);
      return { session: null, status: "missing" };
    }
    const now = Date.now();
    const expiresAtMs = normalized.expires_at ? Number(normalized.expires_at) * 1000 : getTokenExpiryMs(normalized.access_token);
    if (expiresAtMs && expiresAtMs - now > 120000) {
      return { session: normalized, status: "ok" };
    }
    if (!normalized?.refresh_token) {
      logDiag("auth.ensure.no_refresh", reason);
      return { session: null, status: "refresh_missing" };
    }
    try {
      const refreshed = await refreshSession(normalized.refresh_token, normalized);
      if (refreshed?.access_token) {
        logDiag("auth.ensure.refreshed", reason);
        return { session: normalizeSession(refreshed, normalized), status: "refreshed" };
      }
      logDiag("auth.ensure.refresh_failed", reason);
      return { session: null, status: "refresh_failed" };
    } catch (e) {
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        logDiag("auth.ensure.provider_unavailable", reason, e?.detail || e?.message || "unknown");
        return { session: normalized, status: "provider_unavailable" };
      }
      logDiag("auth.ensure.transient", reason, e?.message || "unknown");
      return { session: normalized, status: "transient" };
    }
  };

  const buildRecoverySessionFromTokens = ({
    accessToken = "",
    refreshToken = "",
  } = {}) => {
    const normalizedAccessToken = String(accessToken || "").trim();
    if (!normalizedAccessToken) return null;
    const tokenPayload = decodeJwtPayload(normalizedAccessToken) || {};
    const fallbackUser = tokenPayload?.sub
      ? {
          id: String(tokenPayload.sub || "").trim(),
          email: String(tokenPayload.email || "").trim(),
        }
      : null;
    return normalizeSession(
      {
        access_token: normalizedAccessToken,
        refresh_token: String(refreshToken || "").trim(),
        user: fallbackUser,
        expires_at: Number(tokenPayload?.exp || 0) || null,
      },
      fallbackUser
        ? {
            refresh_token: String(refreshToken || "").trim(),
            user: fallbackUser,
            expires_at: Number(tokenPayload?.exp || 0) || null,
          }
        : null
    );
  };

  const stripRecoveryParamsFromUrl = () => {
    if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
    const url = new URL(window.location.href);
    [
      "type",
      "token_hash",
      "access_token",
      "refresh_token",
      "expires_at",
      "expires_in",
      "code",
    ].forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const resolvePasswordRecoverySession = async () => {
    const cachedRecoverySession = loadPasswordRecoverySession();
    const cachedSession = normalizeSession(cachedRecoverySession, cachedRecoverySession);
    if (typeof window === "undefined") {
      return cachedSession?.access_token
        ? { ok: true, session: cachedSession, source: "cache", strippedUrl: false }
        : { ok: false, session: null, source: "missing", strippedUrl: false };
    }
    const searchParams = new URLSearchParams(window.location.search || "");
    const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const recoveryType = String(
      hashParams.get("type")
      || searchParams.get("type")
      || ""
    ).trim().toLowerCase();
    const accessToken = String(hashParams.get("access_token") || searchParams.get("access_token") || "").trim();
    const refreshToken = String(hashParams.get("refresh_token") || searchParams.get("refresh_token") || "").trim();
    const tokenHash = String(searchParams.get("token_hash") || hashParams.get("token_hash") || "").trim();
    const hasRecoveryUrlState = Boolean(
      recoveryType === "recovery"
      || accessToken
      || refreshToken
      || tokenHash
      || searchParams.get("code")
    );
    let strippedUrl = false;
    try {
      if (recoveryType === "recovery" && accessToken) {
        const session = buildRecoverySessionFromTokens({ accessToken, refreshToken });
        if (session?.access_token && session?.user?.id) {
          savePasswordRecoverySession(session);
          stripRecoveryParamsFromUrl();
          strippedUrl = hasRecoveryUrlState;
          return { ok: true, session, source: "link_tokens", strippedUrl };
        }
      }
      if (recoveryType === "recovery" && tokenHash) {
        const verified = await authRequest("verify", {
          method: "POST",
          body: JSON.stringify({
            type: "recovery",
            token_hash: tokenHash,
          }),
        });
        const verifiedSession = verified?.session || verified;
        const session = normalizeSession(verifiedSession, verifiedSession);
        if (session?.access_token && session?.user?.id) {
          savePasswordRecoverySession(session);
          stripRecoveryParamsFromUrl();
          strippedUrl = hasRecoveryUrlState;
          return { ok: true, session, source: "verify_token_hash", strippedUrl };
        }
      }
      if (cachedSession?.access_token && cachedSession?.user?.id) {
        return { ok: true, session: cachedSession, source: "cache", strippedUrl };
      }
      if (hasRecoveryUrlState) {
        clearPasswordRecoverySession();
        stripRecoveryParamsFromUrl();
        strippedUrl = true;
      }
      return { ok: false, session: null, source: hasRecoveryUrlState ? "invalid" : "missing", strippedUrl };
    } catch (error) {
      if (hasRecoveryUrlState) {
        clearPasswordRecoverySession();
        stripRecoveryParamsFromUrl();
        strippedUrl = true;
      }
      if (cachedSession?.access_token && cachedSession?.user?.id) {
        return {
          ok: true,
          session: cachedSession,
          source: "cache_after_error",
          strippedUrl,
          error,
        };
      }
      return {
        ok: false,
        session: null,
        source: "error",
        strippedUrl,
        error,
      };
    }
  };

  const handleSignIn = async ({ authEmail, authPassword, setAuthError, setAuthSession }) => {
    setAuthError("");
    const startedAt = Date.now();
    try {
      const data = await authRequest("token?grant_type=password", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) });
      const session = normalizeSession(data);
      if (!session?.access_token || !session?.user?.id) throw new Error("Invalid auth response");
      setAuthSession(session);
      saveAuthSession(session);
      logDiag("auth.signin.success", session.user.id);
      trackAnalytics({
        flow: "auth",
        action: "sign_in",
        outcome: "success",
        props: {
          duration_ms: Date.now() - startedAt,
          had_cached_session: Boolean(loadAuthSession()?.access_token),
        },
      });
    } catch (e) {
      trackAnalytics({
        flow: "auth",
        action: "sign_in",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          error_code: classifyAnalyticsErrorCode(e),
        },
      });
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        setAuthError("Cloud auth provider is unavailable or misconfigured.");
        return;
      }
      setAuthError("Sign in failed. Check email/password.");
    }
  };

  const handleSignUp = async ({
    authEmail,
    authPassword,
    authProfile = {},
    setAuthError,
    setAuthSession,
  }) => {
    setAuthError("");
    const startedAt = Date.now();
    try {
      const profilePayload = {
        display_name: String(authProfile?.displayName || "").trim(),
        preferred_units: String(authProfile?.units || "").trim().toLowerCase(),
        timezone: String(authProfile?.timezone || "").trim(),
      };
      const data = await authRequest("signup", {
        method: "POST",
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          data: Object.fromEntries(Object.entries(profilePayload).filter(([, value]) => value)),
        }),
      });
      if (data?.access_token && data?.user) {
        const session = normalizeSession(data);
        setAuthSession(session);
        saveAuthSession(session);
        trackAnalytics({
          flow: "auth",
          action: "sign_up",
          outcome: "success",
          props: {
            duration_ms: Date.now() - startedAt,
            auto_signed_in: true,
          },
        });
        return { ok: true, session, needsEmailConfirmation: false };
      } else {
        setAuthError("Account created. Confirm email, then sign in.");
        trackAnalytics({
          flow: "auth",
          action: "sign_up",
          outcome: "confirmation_required",
          props: {
            duration_ms: Date.now() - startedAt,
            auto_signed_in: false,
          },
        });
        return { ok: true, session: null, needsEmailConfirmation: true };
      }
    } catch (e) {
      trackAnalytics({
        flow: "auth",
        action: "sign_up",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          error_code: classifyAnalyticsErrorCode(e),
        },
      });
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        setAuthError("Cloud auth provider is unavailable or misconfigured.");
        return { ok: false, error: AUTH_PROVIDER_UNAVAILABLE };
      }
      setAuthError("Sign up failed.");
      return { ok: false, error: e?.message || "signup_failed" };
    }
  };

  const handleForgotPassword = async ({
    authEmail,
    setAuthError,
    setAuthNotice,
    redirectTo = "",
  }) => {
    const email = String(authEmail || "").trim();
    setAuthError("");
    if (typeof setAuthNotice === "function") setAuthNotice("");
    if (!email) {
      setAuthError("Enter your email first to receive a password reset link.");
      return { ok: false, error: "missing_email" };
    }
    const startedAt = Date.now();
    try {
      const body = {
        email,
      };
      if (String(redirectTo || "").trim()) body.redirect_to = String(redirectTo).trim();
      const res = await safeFetchWithTimeout("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw buildStructuredError(
          String(data?.message || "Password reset request failed."),
          {
            code: String(data?.code || "forgot_password_failed"),
            detail: String(data?.detail || ""),
            fix: String(data?.fix || ""),
          }
        );
      }
      if (typeof setAuthNotice === "function") {
        setAuthNotice(String(data?.message || "If that email can receive recovery mail, a reset link will arrive shortly."));
      }
      trackAnalytics({
        flow: "auth",
        action: "forgot_password",
        outcome: "success",
        props: {
          duration_ms: Date.now() - startedAt,
        },
      });
      return { ok: true };
    } catch (e) {
      trackAnalytics({
        flow: "auth",
        action: "forgot_password",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          error_code: classifyAnalyticsErrorCode(e),
        },
      });
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        setAuthError("Cloud auth provider is unavailable or misconfigured.");
        return { ok: false, error: AUTH_PROVIDER_UNAVAILABLE };
      }
      if (e?.code === "rate_limited") {
        setAuthError("Password reset is temporarily rate limited. Try again in a few minutes.");
        return { ok: false, error: "rate_limited" };
      }
      setAuthError("Password reset request failed. Try again in a moment.");
      return { ok: false, error: e?.message || "forgot_password_failed" };
    }
  };

  const handlePasswordRecoveryUpdate = async ({
    recoverySession,
    nextPassword,
    setAuthError,
  }) => {
    if (typeof setAuthError === "function") setAuthError("");
    const normalizedRecoverySession = normalizeSession(recoverySession, recoverySession);
    if (!normalizedRecoverySession?.access_token || !normalizedRecoverySession?.user?.id) {
      clearPasswordRecoverySession();
      if (typeof setAuthError === "function") {
        setAuthError("This reset link is no longer valid. Request a new one.");
      }
      return { ok: false, error: "missing_recovery_session" };
    }
    const startedAt = Date.now();
    try {
      await authRequest("user", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${normalizedRecoverySession.access_token}`,
        },
        body: JSON.stringify({
          password: String(nextPassword || ""),
        }),
      });
      clearPasswordRecoverySession();
      trackAnalytics({
        flow: "auth",
        action: "password_recovery_update",
        outcome: "success",
        props: {
          duration_ms: Date.now() - startedAt,
        },
      });
      return { ok: true };
    } catch (e) {
      trackAnalytics({
        flow: "auth",
        action: "password_recovery_update",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          error_code: classifyAnalyticsErrorCode(e),
        },
      });
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        if (typeof setAuthError === "function") {
          setAuthError("Cloud auth provider is unavailable or misconfigured.");
        }
        return { ok: false, error: AUTH_PROVIDER_UNAVAILABLE };
      }
      const message = String(e?.message || "");
      if (/password|weak/i.test(message)) {
        if (typeof setAuthError === "function") {
          setAuthError(message);
        }
        return { ok: false, error: "weak_password" };
      }
      if (typeof setAuthError === "function") {
        setAuthError("Password update failed. Request a fresh reset link and try again.");
      }
      return { ok: false, error: e?.message || "password_recovery_update_failed" };
    }
  };

  const handleSignOut = async ({ authSession, setAuthSession, setStorageStatus }) => {
    const startedAt = Date.now();
    setAuthSession(null);
    lastSyncedGoalsFingerprint = "";
    lastSyncedCoachMemoryFingerprint = "";
    lastPersistedPayloadFingerprint = "";
    lastPersistedUserId = "";
    saveAuthSession(null);
    setStorageStatus(buildStorageStatus({
      mode: "local",
      label: "SIGNED OUT",
      reason: STORAGE_STATUS_REASONS.signedOut,
      detail: "You are signed out, so cloud sync is paused until you sign back in.",
    }));
    try {
      if (authSession?.access_token) {
        await authRequest("logout", { method: "POST", headers: { "Authorization": `Bearer ${authSession.access_token}` } });
      }
      trackAnalytics({
        flow: "auth",
        action: "sign_out",
        outcome: "success",
        props: {
          duration_ms: Date.now() - startedAt,
          had_remote_session: Boolean(authSession?.access_token),
        },
      });
    } catch (error) {
      trackAnalytics({
        flow: "auth",
        action: "sign_out",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          had_remote_session: Boolean(authSession?.access_token),
          error_code: classifyAnalyticsErrorCode(error),
        },
      });
    }
  };

  const handleDeleteAccount = async ({
    authSession,
    setAuthSession,
    setStorageStatus,
    setAuthError = () => {},
    clearLocalData = async () => {},
  }) => {
    setAuthError("");
    const startedAt = Date.now();
    const { ensured, validSession } = await withFreshSession({
      authSession,
      setAuthSession,
      reason: "delete_account",
    });
    if (!validSession?.access_token) {
      if (ensured?.status === "transient") throw new Error(AUTH_TRANSIENT);
      throw new Error(AUTH_REQUIRED);
    }
    const diagnostics = await checkDeleteAccountAvailability(validSession.access_token);
    if (!diagnostics?.configured) {
      trackAnalytics({
        flow: "auth",
        action: "delete_account",
        outcome: "blocked",
        props: {
          duration_ms: Date.now() - startedAt,
          configured: false,
          missing_count: Array.isArray(diagnostics?.missing) ? diagnostics.missing.length : 0,
        },
      });
      throw buildStructuredError(
        diagnostics?.message || "Account deletion is not configured on this deployment yet.",
        {
          code: diagnostics?.code || "delete_account_not_configured",
          detail: diagnostics?.detail || "",
          fix: diagnostics?.fix || "",
          missing: diagnostics?.missing || [],
          required: diagnostics?.required || [],
          configured: diagnostics?.configured,
        }
      );
    }

    const res = await safeFetchWithTimeout("/api/auth/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validSession.access_token}`,
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      trackAnalytics({
        flow: "auth",
        action: "delete_account",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          configured: Boolean(data?.configured),
          error_code: classifyAnalyticsErrorCode(data || new Error("delete_account_failed")),
        },
      });
      throw buildStructuredError(
        String(data?.message || "Account deletion failed."),
        {
          code: String(data?.code || "delete_account_failed"),
          detail: String(data?.detail || ""),
          fix: String(data?.fix || ""),
          missing: Array.isArray(data?.missing) ? data.missing : [],
          required: Array.isArray(data?.required) ? data.required : [],
          configured: data?.configured,
        }
      );
    }

    try {
      await clearLocalData();
    } catch (error) {
      logDiag("auth.delete.clear_local_failed", error?.message || "unknown");
    }
    setAuthSession(null);
    lastSyncedGoalsFingerprint = "";
    lastSyncedCoachMemoryFingerprint = "";
    clearCachedAuthSession();
    clearLocalCache();
    applyStorageStatusUpdate(setStorageStatus, buildStorageStatus({
      mode: "local",
      label: "ACCOUNT DELETED",
      reason: STORAGE_STATUS_REASONS.accountDeleted,
      detail: "Your account and local data were removed from this device.",
    }));
    trackAnalytics({
      flow: "auth",
      action: "delete_account",
      outcome: "success",
      props: {
        duration_ms: Date.now() - startedAt,
        configured: true,
      },
    });
    return data || { ok: true };
  };

  const withFreshSession = async ({ authSession, setAuthSession, reason }) => {
    const ensured = await ensureValidSession(authSession, { reason });
    const validSession = ensured?.session || null;
    if (ensured?.status === "refreshed" && validSession?.access_token !== authSession?.access_token) {
      if (setAuthSession) setAuthSession(validSession);
      saveAuthSession(validSession);
    }
    return { ensured, validSession };
  };

  const authFetchWithRetry = async ({ path, method = "GET", body, authSession, setAuthSession, reason = "rest_call" }) => {
    if (SB_CONFIG_ERROR) throw new Error(AUTH_PROVIDER_UNAVAILABLE);
    const { ensured, validSession } = await withFreshSession({ authSession, setAuthSession, reason });
    if (!validSession?.user?.id || !validSession?.access_token) {
      if (ensured?.status === "transient") throw new Error(AUTH_TRANSIENT);
      throw new Error(AUTH_REQUIRED);
    }
    const normalizedMethod = String(method || "GET").toUpperCase();
    const endpoint = `rest/v1/${path}`;
    const request = async (sessionToUse) => {
      try {
        return await safeFetchWithTimeout(`${SB_URL}/${endpoint}`, {
          method: normalizedMethod,
          headers: { ...sbUserHeaders(sessionToUse.access_token), ...(normalizedMethod !== "GET" ? { "Prefer": "resolution=merge-duplicates" } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        throw decorateFetchError(error, {
          endpoint,
          method: normalizedMethod,
        });
      }
    };
    let res = await request(validSession);
    if (res.status !== 401) return { res, sessionUsed: validSession };
    logDiag("auth.rest.401", reason);
    trackAnalytics({
      flow: "sync",
      action: "rest_retry",
      outcome: "retry",
      props: {
        reason,
        method,
      },
    });
    if (!validSession?.refresh_token) throw new Error(AUTH_REQUIRED);
    const refreshed = await refreshSession(validSession.refresh_token, validSession);
    if (!refreshed?.access_token) throw new Error(AUTH_REQUIRED);
    if (setAuthSession) setAuthSession(refreshed);
    saveAuthSession(refreshed);
    res = await request(refreshed);
    return { res, sessionUsed: refreshed };
  };

  const toFiniteNumber = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toFiniteInteger = (value) => {
    const parsed = toFiniteNumber(value);
    return parsed === null ? null : Math.round(parsed);
  };

  const toJsonDate = (value) => {
    const dateKey = String(value || "").split("T")[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
  };

  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());

  const inferGoalPriority = (goal = {}, idx = 0) => {
    const explicitPriority = toFiniteInteger(goal?.priority)
      || toFiniteInteger(goal?.resolvedGoal?.planningPriority)
      || toFiniteInteger(goal?.planningPriority);
    if (explicitPriority) return explicitPriority;
    const role = String(
      goal?.intakeConfirmedRole
      || goal?.goalArbitrationRole
      || goal?.goalRole
      || goal?.resolvedGoal?.intakeConfirmedRole
      || ""
    ).trim().toLowerCase();
    if (role === "primary") return 1;
    if (role === "maintained") return Math.max(2, idx + 1);
    if (role === "background") return Math.max(3, idx + 1);
    if (role === "deferred") return Math.max(4, idx + 1);
    return idx + 1;
  };

  const encodeCoachMemoryField = (value) => {
    try {
      return JSON.stringify(value ?? null);
    } catch {
      return JSON.stringify(null);
    }
  };

  const normalizeGoalRow = (goal = {}, idx = 0) => {
    const targetValue = toFiniteNumber(goal?.targetValue);
    const currentValue = toFiniteNumber(goal?.currentValue);
    return {
      id: isUuid(goal?.id) ? String(goal.id).trim() : undefined,
      type: goal?.type || (goal?.targetDate ? "time_bound" : "ongoing"),
      category: goal?.category || "running",
      title: String(goal?.title || goal?.name || `Goal ${idx + 1}`),
      target_value: targetValue,
      current_value: currentValue,
      target_date: toJsonDate(goal?.targetDate),
      priority: inferGoalPriority(goal, idx),
      status: goal?.active === false ? "archived" : String(goal?.status || "active"),
    };
  };

  const syncExercisePerformanceForDate = async ({ dateKey, rows = [], authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    const safeDateKey = toJsonDate(dateKey);
    if (!userId || !safeDateKey) throw new Error(AUTH_REQUIRED);
    const startedAt = Date.now();

    const sanitizedRows = sanitizeExercisePerformanceRowsForRest({
      rows,
      userId,
      dateKey: safeDateKey,
      warningSink: persistenceWarningSink,
    });

    const { res: deleteRes } = await authFetchWithRetry({
      path: `exercise_performance?user_id=eq.${userId}&date=eq.${safeDateKey}`,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "sync_exercise_performance_delete",
    });
    if (!deleteRes.ok) throw new Error("Exercise performance delete failed");
    if (!sanitizedRows.length) {
      trackAnalytics({
        flow: "sync",
        action: "entity_sync",
        outcome: "success",
        props: {
          entity: "exercise_performance",
          operation: "delete_only",
          duration_ms: Date.now() - startedAt,
          row_count: 0,
        },
      });
      return;
    }

    const { res } = await authFetchWithRetry({
      path: "exercise_performance",
      method: "POST",
      body: sanitizedRows,
      authSession,
      setAuthSession,
      reason: "sync_exercise_performance_upsert",
    });
    if (!res.ok) throw new Error("Exercise performance upsert failed");
    trackAnalytics({
      flow: "sync",
      action: "entity_sync",
      outcome: "success",
      props: {
        entity: "exercise_performance",
        operation: "upsert",
        duration_ms: Date.now() - startedAt,
        row_count: sanitizedRows.length,
      },
    });
  };

  const syncSessionLogForDate = async ({ dateKey, entry = null, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    const safeDateKey = toJsonDate(dateKey);
    if (!userId || !safeDateKey) throw new Error(AUTH_REQUIRED);
    const startedAt = Date.now();

    const { res: deleteRes } = await authFetchWithRetry({
      path: `session_logs?user_id=eq.${userId}&date=eq.${safeDateKey}`,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "sync_session_log_delete",
    });
    if (!deleteRes.ok) throw new Error("Session log delete failed");
    if (!entry) {
      trackAnalytics({
        flow: "sync",
        action: "entity_sync",
        outcome: "success",
        props: {
          entity: "session_logs",
          operation: "delete_only",
          duration_ms: Date.now() - startedAt,
        },
      });
      return;
    }

    const exerciseRecords = getExercisePerformanceRecordsForLog(entry || {}, { dateKey: safeDateKey });
    const sessionLogRow = {
      user_id: userId,
      date: safeDateKey,
      completion_status: entry?.actualSession?.status ? String(entry.actualSession.status) : (entry?.checkin?.status ? String(entry.checkin.status) : null),
      feel_rating: toFiniteInteger(entry?.feel ?? entry?.checkin?.feelRating),
      note: entry?.notes ? String(entry.notes) : null,
      distance_mi: toFiniteNumber(entry?.miles),
      duration_min: toFiniteNumber(entry?.runTime),
      avg_hr: toFiniteInteger(entry?.healthMetrics?.avgHr),
      exercises: buildLegacyStrengthPerformanceFromRecords(exerciseRecords),
    };

    const { res } = await authFetchWithRetry({
      path: "session_logs",
      method: "POST",
      body: sessionLogRow,
      authSession,
      setAuthSession,
      reason: "sync_session_log_upsert",
    });
    if (!res.ok) throw new Error("Session log upsert failed");
    trackAnalytics({
      flow: "sync",
      action: "entity_sync",
      outcome: "success",
      props: {
        entity: "session_logs",
        operation: "upsert",
        duration_ms: Date.now() - startedAt,
      },
    });
  };

  const syncGoals = async ({ goals = [], authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);

    const { res: deleteRes } = await authFetchWithRetry({
      path: `goals?user_id=eq.${userId}`,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "sync_goals_delete",
    });
    if (!deleteRes.ok) throw new Error("Goals reset failed");

    const normalizedGoals = sanitizeGoalRowsForRest({
      goals: (goals || []).map((goal, idx) => normalizeGoalRow(goal, idx)),
      userId,
      warningSink: persistenceWarningSink,
    });

    if (!normalizedGoals.length) return;

    const { res } = await authFetchWithRetry({
      path: "goals",
      method: "POST",
      body: normalizedGoals,
      authSession,
      setAuthSession,
      reason: "sync_goals_insert",
    });
    if (!res.ok) throw new Error("Goals insert failed");
  };

  const syncCoachMemory = async ({ personalization = {}, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);

    const memory = personalization?.coachMemory || {};
    const row = {
      user_id: userId,
      field_1: encodeCoachMemoryField({
        wins: memory?.wins || [],
        constraints: memory?.constraints || [],
        failurePatterns: memory?.failurePatterns || [],
        commonBarriers: memory?.commonBarriers || [],
        preferredFoodPatterns: memory?.preferredFoodPatterns || [],
      }),
      field_2: encodeCoachMemoryField({
        longTermMemory: memory?.longTermMemory || [],
        compounding: memory?.compounding || {},
        sundayReviews: memory?.sundayReviews || [],
      }),
      field_3: encodeCoachMemoryField({
        pushResponse: memory?.pushResponse || "",
        protectResponse: memory?.protectResponse || "",
        scheduleConstraints: memory?.scheduleConstraints || [],
        simplicityVsVariety: memory?.simplicityVsVariety || "",
        lastAdjustment: memory?.lastAdjustment || "",
        lastSundayPushWeek: memory?.lastSundayPushWeek || "",
      }),
    };

    const { res: deleteRes } = await authFetchWithRetry({
      path: `coach_memory?user_id=eq.${userId}`,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "sync_coach_memory_delete",
    });
    if (!deleteRes.ok) throw new Error("Coach memory reset failed");

    const { res } = await authFetchWithRetry({
      path: "coach_memory",
      method: "POST",
      body: row,
      authSession,
      setAuthSession,
      reason: "sync_coach_memory_insert",
    });
    if (!res.ok) throw new Error("Coach memory insert failed");
  };

  const sbSave = async ({ payload, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);
    const safePayload = sanitizeTrainerDataPayloadForRest({
      payload,
      warningSink: persistenceWarningSink,
    });
    const body = { id: `${SB_ROW}_${userId}`, user_id: userId, data: safePayload, updated_at: new Date().toISOString() };
    const endpoint = "rest/v1/trainer_data";
    pushSyncDiagnostic({
      type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveAttempt,
      endpoint,
      method: "POST",
      source: "sb_save",
      pendingLocalWrites: true,
      at: Date.now(),
    });
    try {
      const { res } = await authFetchWithRetry({
        path: "trainer_data",
        method: "POST",
        body,
        authSession,
        setAuthSession,
        reason: "sb_save",
      });
      if (!res.ok) throw await buildResponseError({
        res,
        endpoint,
        method: "POST",
        fallbackMessage: `Save failed ${res.status}.`,
      });
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveResult,
        ok: true,
        endpoint,
        method: "POST",
        source: "sb_save",
        httpStatus: res.status,
        pendingLocalWrites: false,
        at: Date.now(),
      });
    } catch (error) {
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveResult,
        ok: false,
        endpoint,
        method: "POST",
        source: "sb_save",
        httpStatus: error?.httpStatus,
        supabaseErrorCode: error?.supabaseErrorCode || error?.code || "",
        errorMessage: error?.message || "",
        retryEligible: classifyStorageError(error)?.reason === STORAGE_STATUS_REASONS.transient,
        pendingLocalWrites: true,
        at: Date.now(),
      });
      throw error;
    }
  };

  const sbLoad = async ({ authSession, setters, persistAll, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);
    const endpoint = `rest/v1/trainer_data?user_id=eq.${userId}`;
    pushSyncDiagnostic({
      type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadAttempt,
      endpoint,
      method: "GET",
      source: "sb_load",
      at: Date.now(),
    });
    let res = null;
    let sessionUsed = normalized;
    try {
      const loadResponse = await authFetchWithRetry({
        path: "trainer_data?user_id=eq." + userId,
        method: "GET",
        authSession,
        setAuthSession,
        reason: "sb_load",
      });
      res = loadResponse.res;
      sessionUsed = loadResponse.sessionUsed;
      if (!res.ok) throw await buildResponseError({
        res,
        endpoint,
        method: "GET",
        fallbackMessage: `Load failed ${res.status}.`,
      });
    } catch (error) {
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadResult,
        ok: false,
        endpoint,
        method: "GET",
        source: "sb_load",
        httpStatus: error?.httpStatus,
        supabaseErrorCode: error?.supabaseErrorCode || error?.code || "",
        errorMessage: error?.message || "",
        retryEligible: classifyStorageError(error)?.reason === STORAGE_STATUS_REASONS.transient,
        pendingLocalWrites: Boolean(localLoad()?.syncMeta?.pendingCloudWrite),
        at: Date.now(),
      });
      throw error;
    }
    const rows = await res.json();
    const cache = localLoad();
    emitLocalCacheDiagnostics(cache, Date.now());
    if (rows && rows.length > 0 && rows[0].data) {
      const cloudPayload = rows[0].data;
      const preferPendingLocalCache = shouldPreferPendingLocalCache({
        localPayload: cache,
        cloudPayload,
      });
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheDecision,
        decision: preferPendingLocalCache ? "prefer_pending_local" : "cloud_authoritative",
        reason: preferPendingLocalCache
          ? "pending local cache is newer than the cloud copy"
          : "cloud copy accepted as current authority",
        localTs: normalizeSyncMetaNumber(cache?.ts),
        cloudTs: normalizeSyncMetaNumber(cloudPayload?.ts),
        at: Date.now(),
      });
      const effectivePayload = preferPendingLocalCache ? cache : cloudPayload;
      try {
        lastSyncedGoalsFingerprint = createStableFingerprint(effectivePayload?.goals || []);
        lastSyncedCoachMemoryFingerprint = createStableFingerprint(effectivePayload?.personalization?.coachMemory || {});
        resetTransientPersistCooldown();
        const runtimeState = buildCanonicalRuntimeStateFromStorage({
          storedPayload: effectivePayload,
          mergePersonalization,
          DEFAULT_PERSONALIZATION,
          normalizeGoals,
          DEFAULT_MULTI_GOALS,
        });
        applyCanonicalRuntimeStateSetters({
          runtimeState,
          setters,
        });
        if (!preferPendingLocalCache) {
          localSave(buildLocalCachePayload({
            payload: effectivePayload,
            pendingCloudWrite: false,
            syncedAt: Date.now(),
            previousSyncMeta: cache?.syncMeta || null,
          }));
        }
      } catch (e) {
        logDiag("cloud.load.data_incompatible", e?.message || "unknown");
        throw new Error(AUTH_DATA_INCOMPATIBLE);
      }
      if (preferPendingLocalCache) {
        if (shouldDeferCloudWrite(effectivePayload)) {
          localSave(buildLocalCachePayload({
            payload: effectivePayload,
            pendingCloudWrite: true,
            previousSyncMeta: effectivePayload?.syncMeta || null,
          }));
        } else {
          try {
          await sbSave({
            payload: stripSyncMeta(effectivePayload),
            authSession: sessionUsed || normalized,
            setAuthSession,
          });
          resetTransientPersistCooldown();
          lastPersistedPayloadFingerprint = createPersistedPayloadFingerprint(effectivePayload);
          lastPersistedUserId = String(userId || "");
          localSave(buildLocalCachePayload({
            payload: effectivePayload,
            pendingCloudWrite: false,
              syncedAt: Date.now(),
              previousSyncMeta: effectivePayload?.syncMeta || null,
            }));
          } catch (e) {
            localSave(buildLocalCachePayload({
              payload: effectivePayload,
              pendingCloudWrite: true,
            previousSyncMeta: effectivePayload?.syncMeta || null,
          }));
            throw e;
          }
        }
      }
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadResult,
        ok: true,
        endpoint,
        method: "GET",
        source: "sb_load",
        httpStatus: res.status,
        pendingLocalWrites: Boolean(localLoad()?.syncMeta?.pendingCloudWrite),
        at: Date.now(),
      });
    } else {
      if (cache && typeof cache === "object") {
          pushSyncDiagnostic({
            type: SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheDecision,
            decision: "seed_cloud_from_local_cache",
            reason: "cloud row missing, so local cache is being promoted",
            localTs: normalizeSyncMetaNumber(cache?.ts),
            cloudTs: 0,
            at: Date.now(),
          });
          lastSyncedGoalsFingerprint = createStableFingerprint(cache?.goals || []);
          lastSyncedCoachMemoryFingerprint = createStableFingerprint(cache?.personalization?.coachMemory || {});
          const cachedRuntimeState = buildCanonicalRuntimeStateFromStorage({
            storedPayload: cache,
          mergePersonalization,
          DEFAULT_PERSONALIZATION,
          normalizeGoals,
          DEFAULT_MULTI_GOALS,
        });
        if (shouldDeferCloudWrite(cache)) {
          localSave(buildLocalCachePayload({
            payload: cache,
            pendingCloudWrite: true,
            previousSyncMeta: cache?.syncMeta || null,
          }));
        } else {
          await sbSave({
            payload: buildPersistedTrainerPayload({ runtimeState: cachedRuntimeState }),
            authSession: sessionUsed || normalized,
            setAuthSession,
          });
          resetTransientPersistCooldown();
        }
      } else {
        await persistAll(
          {},
          [],
          {},
          {},
          [],
          DEFAULT_PERSONALIZATION,
          [],
          DEFAULT_COACH_PLAN_ADJUSTMENTS,
          DEFAULT_MULTI_GOALS,
          {},
          {},
          DEFAULT_NUTRITION_FAVORITES,
          {},
          {}
        );
      }
      pushSyncDiagnostic({
        type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataLoadResult,
        ok: true,
        endpoint,
        method: "GET",
        source: "sb_load",
        httpStatus: res.status,
        pendingLocalWrites: Boolean(localLoad()?.syncMeta?.pendingCloudWrite),
        at: Date.now(),
      });
    }
    return {
      ok: true,
      synced: true,
      session: sessionUsed || normalized,
    };
  };

  const persistAll = async ({
    payload,
    authSession,
    setStorageStatus,
    setAuthSession,
  }) => {
    const startedAt = Date.now();
    const previousLocalPayload = localLoad();
    const localPayload = buildLocalCachePayload({
      payload,
      pendingCloudWrite: Boolean(authSession?.user?.id),
      previousSyncMeta: previousLocalPayload?.syncMeta || null,
    });
    localSave(localPayload);
    if (!authSession?.user?.id) {
      lastPersistedPayloadFingerprint = "";
      lastPersistedUserId = "";
      resetTransientPersistCooldown();
      const localOnlyStatus = SB_CONFIG_ERROR
        ? buildStorageStatus({
            mode: "local",
            label: "PROVIDER ERROR",
            reason: STORAGE_STATUS_REASONS.providerUnavailable,
            detail: "Cloud sync provider is unavailable or misconfigured.",
          })
        : buildStorageStatus({
            mode: "local",
            label: "NOT SIGNED IN",
            reason: STORAGE_STATUS_REASONS.notSignedIn,
            detail: "You are using local data because no signed-in cloud session is active.",
          });
      applyStorageStatusUpdate(setStorageStatus, localOnlyStatus);
      trackAnalytics({
        flow: "sync",
        action: "persist_all",
        outcome: "skipped",
        props: {
          mode: "local",
          reason: SB_CONFIG_ERROR ? "provider_unavailable" : "not_signed_in",
          duration_ms: Date.now() - startedAt,
        },
      });
      return {
        ok: true,
        synced: false,
        skipped: true,
        status: localOnlyStatus,
      };
    }
    if (shouldDeferCloudWrite(payload)) {
      lastPersistedPayloadFingerprint = "";
      lastPersistedUserId = "";
      resetTransientPersistCooldown();
      const deferredStatus = buildStorageStatus({
        mode: "local",
        label: "SETUP LOCAL",
        reason: STORAGE_STATUS_REASONS.setupDeferred,
        detail: "Setup is still in progress. Changes stay on this device until onboarding finishes.",
      });
      applyStorageStatusUpdate(setStorageStatus, deferredStatus);
      trackAnalytics({
        flow: "sync",
        action: "persist_all",
        outcome: "skipped",
        props: {
          mode: "local_setup",
          reason: "setup_deferred",
          duration_ms: Date.now() - startedAt,
        },
      });
      return {
        ok: true,
        synced: false,
        skipped: true,
        deferred: true,
        status: deferredStatus,
        reason: "setup_deferred",
      };
    }
    try {
      const payloadFingerprint = createPersistedPayloadFingerprint(payload || {});
      const currentUserId = String(authSession?.user?.id || "");
      while (activePersistPromise && currentUserId === activePersistUserId) {
        try {
          await activePersistPromise;
        } catch {}
      }
      let persistOperation = null;
      activePersistUserId = currentUserId;
      persistOperation = (async () => {
        if (isWithinTransientPersistCooldown(currentUserId)) {
          const cooldownStatus = buildStorageStatus({
            mode: "local",
            label: "SYNC RETRYING",
            reason: STORAGE_STATUS_REASONS.transient,
            detail: "Still trying to sync to your account. Your changes are saved on this device.",
          });
          applyStorageStatusUpdate(setStorageStatus, cooldownStatus);
          trackAnalytics({
            flow: "sync",
            action: "persist_all",
            outcome: "skipped",
            props: {
              mode: "local_retry_cooldown",
              reason: "retry_cooldown",
              duration_ms: Date.now() - startedAt,
            },
          });
          return {
            ok: false,
            synced: false,
            skipped: true,
            cooldown: true,
            status: cooldownStatus,
            error: new Error(AUTH_TRANSIENT),
          };
        }
        if (payloadFingerprint === lastPersistedPayloadFingerprint && currentUserId === lastPersistedUserId) {
          resetTransientPersistCooldown();
          const alreadyCurrentStatus = buildStorageStatus({
            mode: "cloud",
            label: "SYNCED",
            reason: STORAGE_STATUS_REASONS.synced,
            detail: "Cloud state is already current.",
          });
          localSave(buildLocalCachePayload({
            payload,
            pendingCloudWrite: false,
            syncedAt: Date.now(),
            previousSyncMeta: localPayload?.syncMeta || null,
          }));
          applyStorageStatusUpdate(setStorageStatus, alreadyCurrentStatus);
          trackAnalytics({
            flow: "sync",
            action: "persist_all",
            outcome: "success",
            props: {
              mode: "cloud",
              reason: "already_current",
              duration_ms: Date.now() - startedAt,
            },
          });
          return {
            ok: true,
            synced: true,
            status: alreadyCurrentStatus,
            reason: "already_current",
          };
        }
        await sbSave({ payload, authSession, setAuthSession });
        lastPersistedPayloadFingerprint = payloadFingerprint;
        lastPersistedUserId = currentUserId;
        resetTransientPersistCooldown();
        localSave(buildLocalCachePayload({
          payload,
          pendingCloudWrite: false,
          syncedAt: Date.now(),
          previousSyncMeta: localPayload?.syncMeta || null,
        }));
        const nextGoalsFingerprint = createStableFingerprint(payload?.goals || []);
        const nextCoachMemoryFingerprint = createStableFingerprint((payload?.personalization || DEFAULT_PERSONALIZATION)?.coachMemory || {});
        try {
          if (nextGoalsFingerprint !== lastSyncedGoalsFingerprint) {
            await syncGoals({ goals: payload?.goals || [], authSession, setAuthSession });
            lastSyncedGoalsFingerprint = nextGoalsFingerprint;
          }
        } catch (e) {
          logDiag("goals sync failed", e?.message || "unknown");
        }
        try {
          if (nextCoachMemoryFingerprint !== lastSyncedCoachMemoryFingerprint) {
            await syncCoachMemory({ personalization: payload?.personalization || DEFAULT_PERSONALIZATION, authSession, setAuthSession });
            lastSyncedCoachMemoryFingerprint = nextCoachMemoryFingerprint;
          }
        } catch (e) {
          logDiag("coach memory sync failed", e?.message || "unknown");
        }
        const syncedStatus = buildStorageStatus({
          mode: "cloud",
          label: "SYNCED",
          reason: STORAGE_STATUS_REASONS.synced,
          detail: "Cloud sync is working normally.",
        });
        applyStorageStatusUpdate(setStorageStatus, syncedStatus);
        trackAnalytics({
          flow: "sync",
          action: "persist_all",
          outcome: "success",
          props: {
            mode: "cloud",
            reason: "synced",
            duration_ms: Date.now() - startedAt,
          },
        });
        return {
          ok: true,
          synced: true,
          status: syncedStatus,
          reason: "synced",
        };
      })();
      let guardedPersistPromise = null;
      guardedPersistPromise = persistOperation.finally(() => {
        if (activePersistPromise === guardedPersistPromise) {
          activePersistPromise = null;
          activePersistUserId = "";
        }
      });
      activePersistPromise = guardedPersistPromise;
      return await guardedPersistPromise;
    } catch (e) {
      if (e?.message === AUTH_TRANSIENT) {
        logDiag("cloud.save.transient", "falling back to local while preserving session");
      }
      lastPersistedPayloadFingerprint = "";
      logDiag("Cloud save failed, local fallback active:", e.message);
      const fallbackStatus = classifyStorageError(e);
      const currentUserId = String(authSession?.user?.id || "");
      if (fallbackStatus?.reason === STORAGE_STATUS_REASONS.transient) {
        markTransientPersistFailure(currentUserId);
      } else {
        resetTransientPersistCooldown();
      }
      applyStorageStatusUpdate(setStorageStatus, fallbackStatus);
      trackAnalytics({
        flow: "sync",
        action: "persist_all",
        outcome: "error",
        props: {
          mode: "local_fallback",
          reason: classifyAnalyticsErrorCode(e),
          duration_ms: Date.now() - startedAt,
        },
      });
      return {
        ok: false,
        synced: false,
        status: fallbackStatus,
        error: e,
      };
    }
  };

  return {
    SB_URL,
    SB_KEY,
    SB_CONFIG_ERROR,
    sbH,
    localLoad,
    localSave,
    clearLocalCache,
    loadAuthSession,
    saveAuthSession,
    clearCachedAuthSession,
    loadPasswordRecoverySession,
    savePasswordRecoverySession,
    clearPasswordRecoverySession,
    getClientCloudConfigDiagnostics,
    authRequest,
    ensureValidSession,
    resolvePasswordRecoverySession,
    handleSignIn,
    handleSignUp,
    handleForgotPassword,
    handlePasswordRecoveryUpdate,
    handleSignOut,
    handleDeleteAccount,
    checkDeleteAccountAvailability,
    sbLoad,
    sbSave,
    syncExercisePerformanceForDate,
    syncSessionLogForDate,
    syncGoals,
    syncCoachMemory,
    persistAll,
  };
}
