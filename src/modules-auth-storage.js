export const SB_ROW = "trainer_v1";
export const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
export const AUTH_CACHE_KEY = "trainer_auth_session_v1";

export function createAuthStorageModule({ safeFetchWithTimeout, logDiag, mergePersonalization, DEFAULT_PERSONALIZATION, DEFAULT_MULTI_GOALS }) {
  const SB_URL = (typeof window !== "undefined" ? (window.__SUPABASE_URL || "") : "").trim();
  const SB_KEY = (typeof window !== "undefined" ? (window.__SUPABASE_ANON_KEY || "") : "").trim();
  const SB_CONFIG_ERROR = !SB_URL
    ? "Missing Supabase URL. Set VITE_SUPABASE_URL."
    : !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SB_URL)
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

  const handleSignIn = async ({ authEmail, authPassword, setAuthError, setAuthSession }) => {
    setAuthError("");
    try {
      const data = await authRequest("token?grant_type=password", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) });
      if (!data?.access_token || !data?.user) throw new Error("Invalid auth response");
      const session = { access_token: data.access_token, user: data.user };
      setAuthSession(session);
      saveAuthSession(session);
    } catch (e) { setAuthError("Sign in failed. Check email/password."); }
  };

  const handleSignUp = async ({ authEmail, authPassword, setAuthError, setAuthSession }) => {
    setAuthError("");
    try {
      const data = await authRequest("signup", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) });
      if (data?.access_token && data?.user) {
        const session = { access_token: data.access_token, user: data.user };
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

  const sbSave = async ({ payload, authSession }) => {
    if (SB_CONFIG_ERROR) throw new Error(SB_CONFIG_ERROR);
    if (!authSession?.user?.id || !authSession?.access_token) throw new Error("No authenticated user");
    const h = sbUserHeaders(authSession.access_token);
    const res = await safeFetchWithTimeout(SB_URL + "/rest/v1/trainer_data", {
      method: "POST",
      headers: { ...h, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id: `${SB_ROW}_${authSession.user.id}`, user_id: authSession.user.id, data: payload, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error("Save failed " + res.status + ": " + await res.text());
  };

  const sbLoad = async ({ authSession, setters, persistAll }) => {
    if (SB_CONFIG_ERROR) throw new Error(SB_CONFIG_ERROR);
    if (!authSession?.user?.id || !authSession?.access_token) throw new Error("No authenticated user");
    const h = sbUserHeaders(authSession.access_token);
    const res = await safeFetchWithTimeout(SB_URL + "/rest/v1/trainer_data?user_id=eq." + authSession.user.id, { headers: h });
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
        await sbSave({ payload: cache, authSession });
      } else {
        await persistAll({}, [], {}, {}, [], DEFAULT_PERSONALIZATION, [], { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} }, DEFAULT_MULTI_GOALS, {}, {}, { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] }, {});
      }
    }
  };

  const persistAll = async ({
    payload,
    authSession,
    setStorageStatus,
  }) => {
    localSave(payload);
    if (!authSession?.user?.id) {
      setStorageStatus({ mode: "local", label: "LOCAL MODE" });
      return;
    }
    try {
      await sbSave({ payload, authSession });
      setStorageStatus({ mode: "cloud", label: "SYNCED" });
    } catch (e) {
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
    handleSignIn,
    handleSignUp,
    handleSignOut,
    sbLoad,
    sbSave,
    persistAll,
  };
}
