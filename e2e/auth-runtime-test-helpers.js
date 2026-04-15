const SUPABASE_URL = "https://forma.example.supabase.co";
const SUPABASE_KEY = "test-anon-key";

const makeJwt = (payload) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
};

const makeSession = ({ userId = "11111111-1111-4111-8111-111111111111", email = "athlete@example.com" } = {}) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: makeJwt({ sub: userId, exp, email }),
    refresh_token: "refresh-token",
    user: { id: userId, email },
    expires_at: exp,
  };
};

const makeSignedInPayload = () => ({
  logs: {},
  bw: [],
  paceOverrides: {},
  weekNotes: {},
  planAlerts: [],
  personalization: {
    profile: {
      name: "Athlete",
      timezone: "America/Chicago",
      birthYear: 1992,
      age: 34,
      height: "5'10\"",
      weight: 182,
      bodyweight: 182,
      trainingAgeYears: 3,
      onboardingComplete: true,
      profileSetupComplete: true,
    },
    settings: {
      units: { weight: "lbs", height: "ft_in", distance: "miles" },
      trainingPreferences: { intensityPreference: "Standard", defaultEnvironment: "Gym" },
      appearance: { theme: "Atlas", mode: "System" },
    },
  },
  goals: [
    {
      id: "goal_1",
      name: "Run a stronger half marathon",
      category: "running",
      active: true,
      priority: 1,
      targetDate: "2026-10-10",
    },
  ],
  coachActions: [],
  coachPlanAdjustments: { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} },
  dailyCheckins: {},
  plannedDayRecords: {},
  planWeekRecords: {},
  weeklyCheckins: {},
  nutritionFavorites: { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] },
  nutritionActualLogs: {},
  v: 6,
  contractVersion: "runtime_storage_v1",
  ts: Date.now(),
});

const bootAppWithSupabaseSeeds = async (page, { session = null, payload = null } = {}) => {
  await page.addInitScript(({ sessionSeed, payloadSeed, supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_local_cache_v4");
    if (sessionSeed) {
      localStorage.setItem("trainer_auth_session_v1", JSON.stringify(sessionSeed));
    }
    if (payloadSeed) {
      localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
    }
  }, {
    sessionSeed: session,
    payloadSeed: payload,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  await page.goto("/");
};

const defaultDeleteDiagnostics = () => ({
  ok: true,
  code: "delete_account_configured",
  configured: true,
  required: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  missing: [],
  message: "Account deletion is configured for this deployment.",
  detail: "The server can resolve the signed-in user and issue an admin delete.",
  fix: "",
});

const mockSupabaseRuntime = async (page, {
  session = makeSession(),
  payload = makeSignedInPayload(),
  signInStatus = 200,
  signInBody = null,
  signUpStatus = 200,
  trainerDataRows = null,
  logoutDelayMs = 0,
  deleteDiagnosticsStatus = 200,
  deleteDiagnosticsBody = null,
  deletePostStatus = 200,
  deletePostBody = null,
} = {}) => {
  const stats = {
    deleteGetRequests: 0,
    deletePostRequests: 0,
    logoutRequests: 0,
  };

  const resolvedDeleteDiagnostics = deleteDiagnosticsBody || defaultDeleteDiagnostics();
  const resolvedDeletePostBody = deletePostBody || {
    ok: true,
    code: "delete_account_deleted",
    userId: session?.user?.id || "11111111-1111-4111-8111-111111111111",
    message: "Account deleted.",
  };

  await page.route("**/auth/v1/signup**", async (route) => {
    if (signUpStatus >= 400) {
      await route.fulfill({ status: signUpStatus, contentType: "application/json", body: JSON.stringify({ message: "signup failed" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
  });

  await page.route("**/auth/v1/token**", async (route) => {
    const body = signInBody || { message: "Invalid login credentials" };
    await route.fulfill({
      status: signInStatus,
      contentType: "application/json",
      body: JSON.stringify(signInStatus >= 400 ? body : session),
    });
  });

  await page.route("**/auth/v1/logout", async (route) => {
    stats.logoutRequests += 1;
    if (logoutDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, logoutDelayMs));
    }
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/auth/delete-account", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      stats.deleteGetRequests += 1;
      await route.fulfill({
        status: deleteDiagnosticsStatus,
        contentType: "application/json",
        body: JSON.stringify(resolvedDeleteDiagnostics),
      });
      return;
    }

    if (method === "POST") {
      stats.deletePostRequests += 1;
      await route.fulfill({
        status: deletePostStatus,
        contentType: "application/json",
        body: JSON.stringify(resolvedDeletePostBody),
      });
      return;
    }

    await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "Method not allowed" }) });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/trainer_data")) {
      if (route.request().method() === "GET") {
        const rows = Array.isArray(trainerDataRows)
          ? trainerDataRows
          : [{ id: "trainer_v1_user", user_id: session.user.id, data: payload }];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(rows),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  return stats;
};

module.exports = {
  SUPABASE_KEY,
  SUPABASE_URL,
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
};
