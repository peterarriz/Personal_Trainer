const { test, expect } = require("@playwright/test");
const {
  gotoIntakeInLocalMode,
  completeIntroQuestionnaire,
  completeAnchors,
  waitForReview,
  confirmIntakeBuild,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");

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

const mockSupabaseRuntime = async (page, {
  session = makeSession(),
  payload = makeSignedInPayload(),
  signInStatus = 200,
  signInBody = null,
  signUpStatus = 200,
  trainerDataRows = null,
} = {}) => {
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
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/auth/delete-account", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
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
};

async function completeRunningOnboarding(page) {
  await gotoIntakeInLocalMode(page);
  await completeIntroQuestionnaire(page, {
    goalText: "run a 1:45 half marathon",
    experienceLevel: "Intermediate",
    trainingDays: "3",
    sessionLength: "45 min",
    trainingLocation: "Gym",
    coachingStyle: "Balanced coaching",
  });
  await completeAnchors(page, {
    target_timeline: { type: "date_or_month", value: "2026-10" },
    current_run_frequency: { type: "number", value: "3" },
    running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
    longest_recent_run: { type: "number", value: "7" },
    recent_pace_baseline: { type: "natural", value: "8:55 pace" },
  });
  await waitForReview(page);
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
}

test.describe("auth and management hardening", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("signup captures account metadata, then requires profile setup before intake", async ({ page }) => {
    const session = makeSession({
      userId: "22222222-2222-4222-8222-222222222222",
      email: "new-athlete@example.com",
    });
    await mockSupabaseRuntime(page, {
      session,
      payload: makeSignedInPayload(),
      trainerDataRows: [],
    });

    await bootAppWithSupabaseSeeds(page);
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await page.getByTestId("auth-mode-signup").click();
    await page.getByTestId("auth-signup-name").fill("Taylor");
    await page.getByTestId("auth-signup-units").selectOption("imperial");
    await page.getByTestId("auth-signup-timezone").fill("America/Chicago");
    await page.getByTestId("auth-email").fill("new-athlete@example.com");
    await page.getByTestId("auth-password").fill("correct horse battery");
    await page.getByTestId("auth-submit").click();

    await expect(page.getByTestId("profile-setup-gate")).toBeVisible();
    await page.getByTestId("profile-setup-name").fill("Taylor");
    await page.getByTestId("profile-setup-timezone").fill("America/Chicago");
    await page.getByTestId("profile-setup-units").selectOption("imperial");
    await page.getByTestId("profile-setup-birth-year").fill("1994");
    await page.getByTestId("profile-setup-height").fill("5'10\"");
    await page.getByTestId("profile-setup-weight").fill("178");
    await page.getByTestId("profile-setup-training-age").fill("2");
    await page.getByTestId("profile-setup-environment").selectOption("Gym");
    await page.getByTestId("profile-setup-equipment").selectOption("full_gym");
    await page.getByTestId("profile-setup-session-length").selectOption("45");
    await page.getByTestId("profile-setup-save").click();

    await expect(page.getByTestId("intake-root")).toBeVisible();
  });

  test("logout returns the signed-in user to the auth gate", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-logout").click();

    await expect(page.getByTestId("auth-gate")).toBeVisible();
  });

  test("delete account clears local identity and a later sign-in attempt fails cleanly", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, {
      session,
      payload,
      signInStatus: 400,
      signInBody: { message: "Invalid login credentials" },
    });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-delete-account").click();
    await page.getByTestId("settings-delete-account-export").click();
    await page.getByTestId("settings-delete-account-confirm").fill("DELETE");
    await page.getByTestId("settings-delete-account-submit").click();

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      auth: localStorage.getItem("trainer_auth_session_v1"),
      cache: localStorage.getItem("trainer_local_cache_v4"),
    }))).toEqual({ auth: null, cache: null });

    await page.getByTestId("auth-email").fill("athlete@example.com");
    await page.getByTestId("auth-password").fill("wrong-password");
    await page.getByTestId("auth-submit").click();
    await expect(page.getByText(/Sign in failed/i)).toBeVisible();
  });

  test("weekly nutrition planning stays visible and theme switching changes the real UI tokens", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-daily-target")).toBeVisible();
    await expect(page.getByTestId("nutrition-weekly-planning")).toBeVisible();
    await page.getByTestId("nutrition-weekly-planning").locator("summary").click();
    await expect(page.getByTestId("nutrition-grocery-support")).toBeVisible();

    await page.getByTestId("app-tab-settings").click();
    const before = await page.locator("[data-testid='app-root']").evaluate((node) => getComputedStyle(node).getPropertyValue("--brand-accent"));
    await page.getByTestId("settings-theme-circuit").click();
    const after = await page.locator("[data-testid='app-root']").evaluate((node) => getComputedStyle(node).getPropertyValue("--brand-accent"));

    expect(before.trim()).not.toBe(after.trim());
  });
});
