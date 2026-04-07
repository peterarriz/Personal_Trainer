export const SB_ROW = "trainer_v1";
export const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
export const AUTH_CACHE_KEY = "trainer_auth_session_v1";
export const AUTH_REQUIRED = "AUTH_REQUIRED";
export const AUTH_TRANSIENT = "AUTH_TRANSIENT";

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

export function createAuthStorageModule({ safeFetchWithTimeout, logDiag, mergePersonalization, DEFAULT_PERSONALIZATION, DEFAULT_MULTI_GOALS }) {
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

  const loadAuthSession = () => {
    try {
      const raw = localStorage.getItem(AUTH_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const saveAuthSession = (session) => {
    try { localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(session || null)); } catch {}
  };
  const authRequest = async (path, options = {}) => {
    if (SB_CONFIG_ERROR) throw new Error(SB_CONFIG_ERROR);
    const res = await safeFetchWithTimeout(`${SB_URL}/auth/v1/${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "apikey": SB_KEY, ...(options.headers || {}) }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? {} : res.json();
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
    try {
      const data = await authRequest("token?grant_type=password", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) });
      const session = normalizeSession(data);
      if (!session?.access_token || !session?.user?.id) throw new Error("Invalid auth response");
      setAuthSession(session);
      saveAuthSession(session);
      logDiag("auth.signin.success", session.user.id);
    } catch (e) { setAuthError("Sign in failed. Check email/password."); }
  };

  const handleSignUp = async ({ authEmail, authPassword, setAuthError, setAuthSession }) => {
    setAuthError("");
    try {
      const data = await authRequest("signup", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) });
      if (data?.access_token && data?.user) {
        const session = normalizeSession(data);
        setAuthSession(session);
        saveAuthSession(session);
      } else {
        setAuthError("Account created. Confirm email, then sign in.");
      }
    } catch (e) { setAuthError("Sign up failed."); }
  };

  const handleSignOut = async ({ authSession, setAuthSession, setStorageStatus }) => {
    try {
      if (authSession?.access_token) {
        await authRequest("logout", { method: "POST", headers: { "Authorization": `Bearer ${authSession.access_token}` } });
      }
    } catch {}
    setAuthSession(null);
    saveAuthSession(null);
    setStorageStatus({ mode: "local", label: "SIGNED OUT" });
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
    if (SB_CONFIG_ERROR) throw new Error(SB_CONFIG_ERROR);
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
    if (!validSession?.refresh_token) throw new Error(AUTH_REQUIRED);
    const refreshed = await refreshSession(validSession.refresh_token, validSession);
    if (!refreshed?.access_token) throw new Error(AUTH_REQUIRED);
    if (setAuthSession) setAuthSession(refreshed);
    saveAuthSession(refreshed);
    res = await request(refreshed);
    return { res, sessionUsed: refreshed };
  };

  const sbSave = async ({ payload, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);
    const body = { id: `${SB_ROW}_${userId}`, user_id: userId, data: payload, updated_at: new Date().toISOString() };
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
      const d = rows[0].data;
      if (d.logs) setters.setLogs(d.logs);
      if (d.bw) setters.setBodyweights(d.bw);
      if (d.paceOverrides) setters.setPaceOverrides(d.paceOverrides);
      if (d.weekNotes) setters.setWeekNotes(d.weekNotes);
      if (d.planAlerts) setters.setPlanAlerts(d.planAlerts);
      if (d.personalization) setters.setPersonalization(mergePersonalization(DEFAULT_PERSONALIZATION, d.personalization));
      if (d.goals) setters.setGoals(d.goals);
      if (d.coachActions) setters.setCoachActions(d.coachActions);
      if (d.coachPlanAdjustments) setters.setCoachPlanAdjustments(d.coachPlanAdjustments);
      if (d.dailyCheckins) setters.setDailyCheckins(d.dailyCheckins);
      if (d.weeklyCheckins) setters.setWeeklyCheckins(d.weeklyCheckins);
      if (d.nutritionFavorites) setters.setNutritionFavorites(d.nutritionFavorites);
      if (d.nutritionFeedback) setters.setNutritionFeedback(d.nutritionFeedback);
    } else {
      const cache = localLoad();
      if (cache?.v) {
        await sbSave({ payload: cache, authSession: sessionUsed || normalized, setAuthSession });
      } else {
        await persistAll({}, [], {}, {}, [], DEFAULT_PERSONALIZATION, [], { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} }, DEFAULT_MULTI_GOALS, {}, {}, { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] }, {});
      }
    }
  };

  const persistAll = async ({
    payload,
    authSession,
    setStorageStatus,
    setAuthSession,
  }) => {
    localSave(payload);
    if (!authSession?.user?.id) {
      setStorageStatus({ mode: "local", label: "LOCAL MODE" });
      return;
    }
    try {
      await sbSave({ payload, authSession, setAuthSession });
      try {
        await syncGoals({ goals: payload?.goals || [], authSession, setAuthSession });
      } catch (e) {
        logDiag("goals sync failed", e?.message || "unknown");
      }
      try {
        await syncCoachMemory({ personalization: payload?.personalization || DEFAULT_PERSONALIZATION, authSession, setAuthSession });
      } catch (e) {
        logDiag("coach memory sync failed", e?.message || "unknown");
      }
      setStorageStatus({ mode: "cloud", label: "SYNCED" });
    } catch (e) {
      if (e?.message === AUTH_REQUIRED) {
        setStorageStatus({ mode: "local", label: "AUTH REQUIRED" });
        return;
      }
      if (e?.message === AUTH_TRANSIENT) {
        logDiag("cloud.save.transient", "falling back to local while preserving session");
        setStorageStatus({ mode: "local", label: "LOCAL MODE" });
        return;
      }
      logDiag("Cloud save failed, local fallback active:", e.message);
      setStorageStatus({ mode: "local", label: "LOCAL MODE" });
    }
  };

  return {
    SB_URL,
    SB_KEY,
    SB_CONFIG_ERROR,
    sbH,
    localLoad,
    localSave,
    loadAuthSession,
    saveAuthSession,
    authRequest,
    ensureValidSession,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    sbLoad,
    sbSave,
    syncExercisePerformanceForDate,
    syncSessionLogForDate,
    syncGoals,
    syncCoachMemory,
    persistAll,
  };
}
