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

  const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const toDurationMinutes = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const direct = Number(raw);
    if (Number.isFinite(direct)) return direct;
    const clock = raw.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (!clock) return null;
    const hours = clock[3] !== undefined ? Number(clock[1]) : 0;
    const minutes = clock[3] !== undefined ? Number(clock[2]) : Number(clock[1]);
    const seconds = clock[3] !== undefined ? Number(clock[3]) : Number(clock[2]);
    return Math.round(((hours * 3600) + (minutes * 60) + seconds) / 60);
  };

  const extractNumericGoalValue = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const match = String(value).match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

  const buildSessionLogBody = (dateKey, entry = {}) => {
    const exercises = Array.isArray(entry?.strengthPerformance) ? entry.strengthPerformance : [];
    const completionStatus = entry?.checkin?.status || (exercises.length || entry?.miles || entry?.runTime || entry?.notes ? "completed_modified" : "not_logged");
    return {
      date: dateKey,
      completion_status: completionStatus,
      feel_rating: toOptionalNumber(entry?.feel ?? entry?.checkin?.feelRating),
      note: String(entry?.notes || entry?.note || "").trim() || null,
      distance_mi: toOptionalNumber(entry?.miles),
      duration_min: toDurationMinutes(entry?.runTime),
      avg_hr: toOptionalNumber(entry?.healthMetrics?.avgHr),
      exercises,
    };
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

  const syncExercisePerformanceForDate = async ({ dateKey, rows = [], authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId || !dateKey) throw new Error(AUTH_REQUIRED);

    const deletePath = `exercise_performance?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(dateKey)}`;
    const { res: deleteRes } = await authFetchWithRetry({
      path: deletePath,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "exercise_performance_delete",
    });
    if (!deleteRes.ok) {
      throw new Error("Exercise performance delete failed " + deleteRes.status + ": " + await deleteRes.text());
    }

    if (!Array.isArray(rows) || rows.length === 0) return;

    const body = rows.map((row) => ({
      user_id: userId,
      exercise_name: row?.exercise_name || "",
      date: row?.date || dateKey,
      prescribed_weight: row?.prescribed_weight ?? null,
      actual_weight: row?.actual_weight ?? null,
      prescribed_reps: row?.prescribed_reps ?? null,
      actual_reps: row?.actual_reps ?? null,
      prescribed_sets: row?.prescribed_sets ?? null,
      actual_sets: row?.actual_sets ?? null,
      band_tension: row?.band_tension ?? null,
      bodyweight_only: Boolean(row?.bodyweight_only),
      feel_this_session: row?.feel_this_session ?? null,
    }));
    const { res } = await authFetchWithRetry({
      path: "exercise_performance",
      method: "POST",
      body,
      authSession,
      setAuthSession,
      reason: "exercise_performance_upsert",
    });
    if (!res.ok) {
      throw new Error("Exercise performance save failed " + res.status + ": " + await res.text());
    }
  };

  const syncSessionLogForDate = async ({ dateKey, entry = null, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId || !dateKey) throw new Error(AUTH_REQUIRED);

    const deletePath = `session_logs?user_id=eq.${encodeURIComponent(userId)}&date=eq.${encodeURIComponent(dateKey)}`;
    const { res: deleteRes } = await authFetchWithRetry({
      path: deletePath,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "session_logs_delete",
    });
    if (!deleteRes.ok) {
      throw new Error("Session log delete failed " + deleteRes.status + ": " + await deleteRes.text());
    }

    if (!entry) return;

    const body = [{
      user_id: userId,
      ...buildSessionLogBody(dateKey, entry),
    }];
    const { res } = await authFetchWithRetry({
      path: "session_logs",
      method: "POST",
      body,
      authSession,
      setAuthSession,
      reason: "session_logs_upsert",
    });
    if (!res.ok) {
      throw new Error("Session log save failed " + res.status + ": " + await res.text());
    }
  };

  const syncGoals = async ({ goals = [], authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);

    const deletePath = `goals?user_id=eq.${encodeURIComponent(userId)}`;
    const { res: deleteRes } = await authFetchWithRetry({
      path: deletePath,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "goals_delete",
    });
    if (!deleteRes.ok) {
      throw new Error("Goal sync delete failed " + deleteRes.status + ": " + await deleteRes.text());
    }

    if (!Array.isArray(goals) || goals.length === 0) return;

    const body = goals.map((goal, idx) => ({
      user_id: userId,
      type: goal?.type || (goal?.targetDate ? "time_bound" : "ongoing"),
      category: goal?.category || "running",
      title: String(goal?.title || goal?.name || `Goal ${idx + 1}`),
      target_value: extractNumericGoalValue(goal?.target_value ?? goal?.targetValue ?? goal?.measurableTarget),
      current_value: extractNumericGoalValue(goal?.current_value ?? goal?.currentValue),
      target_date: goal?.target_date || goal?.targetDate || null,
      priority: Number(goal?.priority || (idx + 1)),
      status: goal?.status || (goal?.active === false ? "archived" : "active"),
    }));
    const { res } = await authFetchWithRetry({
      path: "goals",
      method: "POST",
      body,
      authSession,
      setAuthSession,
      reason: "goals_upsert",
    });
    if (!res.ok) {
      throw new Error("Goal sync save failed " + res.status + ": " + await res.text());
    }
  };

  const syncCoachMemory = async ({ personalization, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    if (!userId) throw new Error(AUTH_REQUIRED);

    const deletePath = `coach_memory?user_id=eq.${encodeURIComponent(userId)}`;
    const { res: deleteRes } = await authFetchWithRetry({
      path: deletePath,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "coach_memory_delete",
    });
    if (!deleteRes.ok) {
      throw new Error("Coach memory delete failed " + deleteRes.status + ": " + await deleteRes.text());
    }

    const memory = personalization?.coachMemory || {};
    const body = [{
      user_id: userId,
      field_1: JSON.stringify(memory?.longTermMemory || []).slice(0, 12000),
      field_2: JSON.stringify(memory?.compounding || {}).slice(0, 12000),
      field_3: JSON.stringify({
        wins: memory?.wins || [],
        constraints: memory?.constraints || [],
        failurePatterns: memory?.failurePatterns || [],
        commonBarriers: memory?.commonBarriers || [],
      }).slice(0, 12000),
    }];
    const { res } = await authFetchWithRetry({
      path: "coach_memory",
      method: "POST",
      body,
      authSession,
      setAuthSession,
      reason: "coach_memory_upsert",
    });
    if (!res.ok) {
      throw new Error("Coach memory save failed " + res.status + ": " + await res.text());
    }
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
