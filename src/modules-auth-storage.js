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

export const SB_ROW = "trainer_v1";
export const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
export const AUTH_CACHE_KEY = "trainer_auth_session_v1";
export const AUTH_REQUIRED = "AUTH_REQUIRED";
export const AUTH_TRANSIENT = "AUTH_TRANSIENT";
export const AUTH_PROVIDER_UNAVAILABLE = "AUTH_PROVIDER_UNAVAILABLE";
export const AUTH_DATA_INCOMPATIBLE = "AUTH_DATA_INCOMPATIBLE";
export const AUTH_DELETE_NOT_CONFIGURED = "AUTH_DELETE_NOT_CONFIGURED";

export const STORAGE_STATUS_REASONS = {
  notSignedIn: "not_signed_in",
  signedOut: "signed_out",
  accountDeleted: "account_deleted",
  deviceReset: "device_reset",
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
    detail: "Cloud sync is still retrying in the background. Local changes remain saved on this device.",
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

export function createAuthStorageModule({ safeFetchWithTimeout, logDiag, mergePersonalization, normalizeGoals, DEFAULT_PERSONALIZATION, DEFAULT_MULTI_GOALS, analytics = null }) {
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
  let lastSyncedGoalsFingerprint = "";
  let lastSyncedCoachMemoryFingerprint = "";
  let lastPersistedPayloadFingerprint = "";
  let lastPersistedUserId = "";
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
  const SB_CONFIG_ERROR = !SB_URL
    ? "Missing Supabase URL. Set VITE_SUPABASE_URL."
    : !hasValidSupabaseUrl
    ? `Malformed Supabase URL: ${SB_URL}`
    : !SB_KEY
    ? "Missing Supabase anon key. Set VITE_SUPABASE_ANON_KEY."
    : "";

  const sbH = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
  const sbUserHeaders = (token) => ({ "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + token });

  const localLoad = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const localSave = (payload) => {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload)); } catch {}
  };

  const clearLocalCache = () => {
    try {
      if (typeof localStorage?.removeItem === "function") {
        localStorage.removeItem(LOCAL_CACHE_KEY);
      } else {
        localStorage.setItem(LOCAL_CACHE_KEY, "null");
      }
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
  const authRequest = async (path, options = {}) => {
    if (SB_CONFIG_ERROR) throw new Error(AUTH_PROVIDER_UNAVAILABLE);
    const res = await safeFetchWithTimeout(`${SB_URL}/auth/v1/${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "apikey": SB_KEY, ...(options.headers || {}) }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? {} : res.json();
  };

  const checkDeleteAccountAvailability = async () => {
    const startedAt = Date.now();
    const res = await safeFetchWithTimeout("/api/auth/delete-account", {
      method: "GET",
      headers: {
        "Accept": "application/json",
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
    try {
      const data = await authRequest("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) });
      const normalized = normalizeSession({ ...data, refresh_token: data?.refresh_token || refreshToken }, fallbackSession);
      if (!normalized?.access_token || !normalized?.user?.id) return null;
      return normalized;
    } catch (e) {
      logDiag("auth.refresh.failed", e?.message || "unknown");
      return null;
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
      logDiag("auth.ensure.transient", reason, e?.message || "unknown");
      return { session: normalized, status: "transient" };
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
    const diagnostics = await checkDeleteAccountAvailability();
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

    const { ensured, validSession } = await withFreshSession({
      authSession,
      setAuthSession,
      reason: "delete_account",
    });
    if (!validSession?.access_token) {
      if (ensured?.status === "transient") throw new Error(AUTH_TRANSIENT);
      throw new Error(AUTH_REQUIRED);
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
    const request = async (sessionToUse) => safeFetchWithTimeout(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: { ...sbUserHeaders(sessionToUse.access_token), ...(method !== "GET" ? { "Prefer": "resolution=merge-duplicates" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
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
    const { res } = await authFetchWithRetry({
      path: "trainer_data",
      method: "POST",
      body,
      authSession,
      setAuthSession,
      reason: "sb_save",
    });
    if (!res.ok) throw new Error("Save failed " + res.status + ": " + await res.text());
  };

  const sbLoad = async ({ authSession, setters, persistAll, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);
    const { res, sessionUsed } = await authFetchWithRetry({
      path: "trainer_data?user_id=eq." + userId,
      method: "GET",
      authSession,
      setAuthSession,
      reason: "sb_load",
    });
    if (!res.ok) throw new Error("Load failed " + res.status + ": " + await res.text());
    const rows = await res.json();
    if (rows && rows.length > 0 && rows[0].data) {
      try {
        lastSyncedGoalsFingerprint = createStableFingerprint(rows[0].data?.goals || []);
        lastSyncedCoachMemoryFingerprint = createStableFingerprint(rows[0].data?.personalization?.coachMemory || {});
        const runtimeState = buildCanonicalRuntimeStateFromStorage({
          storedPayload: rows[0].data,
          mergePersonalization,
          DEFAULT_PERSONALIZATION,
          normalizeGoals,
          DEFAULT_MULTI_GOALS,
        });
        applyCanonicalRuntimeStateSetters({
          runtimeState,
          setters,
        });
      } catch (e) {
        logDiag("cloud.load.data_incompatible", e?.message || "unknown");
        throw new Error(AUTH_DATA_INCOMPATIBLE);
      }
      } else {
        const cache = localLoad();
        if (cache && typeof cache === "object") {
          lastSyncedGoalsFingerprint = createStableFingerprint(cache?.goals || []);
          lastSyncedCoachMemoryFingerprint = createStableFingerprint(cache?.personalization?.coachMemory || {});
          const cachedRuntimeState = buildCanonicalRuntimeStateFromStorage({
            storedPayload: cache,
            mergePersonalization,
          DEFAULT_PERSONALIZATION,
          normalizeGoals,
          DEFAULT_MULTI_GOALS,
        });
        await sbSave({
          payload: buildPersistedTrainerPayload({ runtimeState: cachedRuntimeState }),
          authSession: sessionUsed || normalized,
          setAuthSession,
        });
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
    localSave(payload);
    if (!authSession?.user?.id) {
      lastPersistedPayloadFingerprint = "";
      lastPersistedUserId = "";
      const localOnlyStatus = buildStorageStatus({
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
          reason: "not_signed_in",
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
    try {
      const payloadFingerprint = createStableFingerprint(payload || {});
      const currentUserId = String(authSession?.user?.id || "");
      if (payloadFingerprint === lastPersistedPayloadFingerprint && currentUserId === lastPersistedUserId) {
        const alreadyCurrentStatus = buildStorageStatus({
          mode: "cloud",
          label: "SYNCED",
          reason: STORAGE_STATUS_REASONS.synced,
          detail: "Cloud state is already current.",
        });
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
      const nextGoalsFingerprint = createStableFingerprint(payload?.goals || []);
      const nextCoachMemoryFingerprint = createStableFingerprint((payload?.personalization || DEFAULT_PERSONALIZATION)?.coachMemory || {});
      const shadowSyncs = [];
      if (nextGoalsFingerprint !== lastSyncedGoalsFingerprint) {
        shadowSyncs.push(
          syncGoals({ goals: payload?.goals || [], authSession, setAuthSession })
            .then(() => { lastSyncedGoalsFingerprint = nextGoalsFingerprint; })
            .catch((e) => { logDiag("goals sync failed", e?.message || "unknown"); })
        );
      }
      if (nextCoachMemoryFingerprint !== lastSyncedCoachMemoryFingerprint) {
        shadowSyncs.push(
          syncCoachMemory({ personalization: payload?.personalization || DEFAULT_PERSONALIZATION, authSession, setAuthSession })
            .then(() => { lastSyncedCoachMemoryFingerprint = nextCoachMemoryFingerprint; })
            .catch((e) => { logDiag("coach memory sync failed", e?.message || "unknown"); })
        );
      }
      if (shadowSyncs.length) await Promise.allSettled(shadowSyncs);
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
    } catch (e) {
      if (e?.message === AUTH_TRANSIENT) {
        logDiag("cloud.save.transient", "falling back to local while preserving session");
      }
      lastPersistedPayloadFingerprint = "";
      logDiag("Cloud save failed, local fallback active:", e.message);
      const fallbackStatus = classifyStorageError(e);
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
    authRequest,
    ensureValidSession,
      handleSignIn,
    handleSignUp,
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
