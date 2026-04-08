export const SB_ROW = "trainer_v1";
export const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
export const AUTH_CACHE_KEY = "trainer_auth_session_v1";
export const AUTH_REQUIRED = "AUTH_REQUIRED";
export const AUTH_TRANSIENT = "AUTH_TRANSIENT";
export const AUTH_PROVIDER_UNAVAILABLE = "AUTH_PROVIDER_UNAVAILABLE";
export const AUTH_DATA_INCOMPATIBLE = "AUTH_DATA_INCOMPATIBLE";

export const STORAGE_STATUS_REASONS = {
  notSignedIn: "not_signed_in",
  signedOut: "signed_out",
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
    label: "LOCAL MODE",
    reason: STORAGE_STATUS_REASONS.transient,
    detail: "Cloud sync failed and the app safely fell back to local data.",
  });
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
    if (SB_CONFIG_ERROR) throw new Error(AUTH_PROVIDER_UNAVAILABLE);
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
    } catch (e) {
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        setAuthError("Cloud auth provider is unavailable or misconfigured.");
        return;
      }
      setAuthError("Sign in failed. Check email/password.");
    }
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
    } catch (e) {
      if (e?.message === AUTH_PROVIDER_UNAVAILABLE) {
        setAuthError("Cloud auth provider is unavailable or misconfigured.");
        return;
      }
      setAuthError("Sign up failed.");
    }
  };

  const handleSignOut = async ({ authSession, setAuthSession, setStorageStatus }) => {
    try {
      if (authSession?.access_token) {
        await authRequest("logout", { method: "POST", headers: { "Authorization": `Bearer ${authSession.access_token}` } });
      }
    } catch {}
    setAuthSession(null);
    saveAuthSession(null);
    setStorageStatus(buildStorageStatus({
      mode: "local",
      label: "SIGNED OUT",
      reason: STORAGE_STATUS_REASONS.signedOut,
      detail: "You are signed out, so cloud sync is paused until you sign back in.",
    }));
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
      id: goal?.id || undefined,
      type: goal?.type || (goal?.targetDate ? "time_bound" : "ongoing"),
      category: goal?.category || "running",
      title: String(goal?.title || goal?.name || `Goal ${idx + 1}`),
      target_value: targetValue,
      current_value: currentValue,
      target_date: toJsonDate(goal?.targetDate),
      priority: toFiniteInteger(goal?.priority) || (idx + 1),
      status: goal?.active === false ? "archived" : String(goal?.status || "active"),
    };
  };

  const syncExercisePerformanceForDate = async ({ dateKey, rows = [], authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    const safeDateKey = toJsonDate(dateKey);
    if (!userId || !safeDateKey) throw new Error(AUTH_REQUIRED);

    const sanitizedRows = (rows || []).map((row) => ({
      user_id: userId,
      exercise_name: String(row?.exercise_name || row?.exercise || "").trim(),
      date: safeDateKey,
      prescribed_weight: toFiniteNumber(row?.prescribed_weight),
      actual_weight: toFiniteNumber(row?.actual_weight),
      prescribed_reps: toFiniteInteger(row?.prescribed_reps),
      actual_reps: toFiniteInteger(row?.actual_reps),
      prescribed_sets: toFiniteInteger(row?.prescribed_sets),
      actual_sets: toFiniteInteger(row?.actual_sets),
      band_tension: row?.band_tension ? String(row.band_tension) : null,
      bodyweight_only: Boolean(row?.bodyweight_only),
      feel_this_session: toFiniteInteger(row?.feel_this_session),
    })).filter((row) => row.exercise_name);

    const { res: deleteRes } = await authFetchWithRetry({
      path: `exercise_performance?user_id=eq.${userId}&date=eq.${safeDateKey}`,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "sync_exercise_performance_delete",
    });
    if (!deleteRes.ok) throw new Error("Exercise performance delete failed");
    if (!sanitizedRows.length) return;

    const { res } = await authFetchWithRetry({
      path: "exercise_performance",
      method: "POST",
      body: sanitizedRows,
      authSession,
      setAuthSession,
      reason: "sync_exercise_performance_upsert",
    });
    if (!res.ok) throw new Error("Exercise performance upsert failed");
  };

  const syncSessionLogForDate = async ({ dateKey, entry = null, authSession, setAuthSession }) => {
    const normalized = normalizeSession(authSession);
    const userId = normalized?.user?.id || authSession?.user?.id;
    const safeDateKey = toJsonDate(dateKey);
    if (!userId || !safeDateKey) throw new Error(AUTH_REQUIRED);

    const { res: deleteRes } = await authFetchWithRetry({
      path: `session_logs?user_id=eq.${userId}&date=eq.${safeDateKey}`,
      method: "DELETE",
      authSession,
      setAuthSession,
      reason: "sync_session_log_delete",
    });
    if (!deleteRes.ok) throw new Error("Session log delete failed");
    if (!entry) return;

    const sessionLogRow = {
      user_id: userId,
      date: safeDateKey,
      completion_status: entry?.actualSession?.status ? String(entry.actualSession.status) : (entry?.checkin?.status ? String(entry.checkin.status) : null),
      feel_rating: toFiniteInteger(entry?.feel ?? entry?.checkin?.feelRating),
      note: entry?.notes ? String(entry.notes) : null,
      distance_mi: toFiniteNumber(entry?.miles),
      duration_min: toFiniteNumber(entry?.runTime),
      avg_hr: toFiniteInteger(entry?.healthMetrics?.avgHr),
      exercises: Array.isArray(entry?.strengthPerformance) ? entry.strengthPerformance : [],
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

    const normalizedGoals = (goals || []).map((goal, idx) => ({
      user_id: userId,
      ...normalizeGoalRow(goal, idx),
    })).filter((goal) => goal.title);

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
      if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error(AUTH_DATA_INCOMPATIBLE);
      try {
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
        if (d.plannedDayRecords) setters.setPlannedDayRecords(d.plannedDayRecords);
        if (d.weeklyCheckins) setters.setWeeklyCheckins(d.weeklyCheckins);
        if (d.nutritionFavorites) setters.setNutritionFavorites(d.nutritionFavorites);
        if (d.nutritionFeedback) setters.setNutritionFeedback(d.nutritionFeedback);
      } catch (e) {
        logDiag("cloud.load.data_incompatible", e?.message || "unknown");
        throw new Error(AUTH_DATA_INCOMPATIBLE);
      }
    } else {
      const cache = localLoad();
      if (cache?.v) {
        await sbSave({ payload: cache, authSession: sessionUsed || normalized, setAuthSession });
      } else {
        await persistAll({}, [], {}, {}, [], DEFAULT_PERSONALIZATION, [], { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} }, DEFAULT_MULTI_GOALS, {}, {}, { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] }, {}, {});
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
      setStorageStatus(buildStorageStatus({
        mode: "local",
        label: "NOT SIGNED IN",
        reason: STORAGE_STATUS_REASONS.notSignedIn,
        detail: "You are using local data because no signed-in cloud session is active.",
      }));
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
      setStorageStatus(buildStorageStatus({
        mode: "cloud",
        label: "SYNCED",
        reason: STORAGE_STATUS_REASONS.synced,
        detail: "Cloud sync is working normally.",
      }));
    } catch (e) {
      if (e?.message === AUTH_TRANSIENT) {
        logDiag("cloud.save.transient", "falling back to local while preserving session");
      }
      logDiag("Cloud save failed, local fallback active:", e.message);
      setStorageStatus(classifyStorageError(e));
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
