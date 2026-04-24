const { test, expect } = require("@playwright/test");

require("sucrase/register");

const {
  SUPABASE_KEY,
  SUPABASE_URL,
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const makeAuthGatePayload = () => ({
  logs: {},
  bw: [],
  paceOverrides: {},
  weekNotes: {},
  planAlerts: [],
  personalization: {
    profile: {
      name: "Athlete",
      timezone: "America/Chicago",
      onboardingComplete: false,
      profileSetupComplete: false,
    },
    settings: {
      units: { weight: "lbs", height: "ft_in", distance: "miles" },
      trainingPreferences: { intensityPreference: "Standard", defaultEnvironment: "Gym" },
      appearance: { theme: "Circuit", mode: "Dark" },
    },
  },
  goals: [],
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

const bootAuthGate = async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(({ payloadSeed, supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_auth_recovery_v1");
    localStorage.setItem("trainer_debug", "1");
    localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
  }, {
    payloadSeed: makeAuthGatePayload(),
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  await page.goto("/");
  await expect(page.getByTestId("auth-gate")).toBeVisible();
};

const trustedMouseClick = async (page, locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
};

test.describe("interaction freeze regression", () => {
  test("auth mode switch accepts trusted mouse input without freezing the page", async ({ page }) => {
    await bootAuthGate(page);

    await trustedMouseClick(page, page.getByTestId("auth-mode-signup"));
    await expect(page.getByTestId("auth-signup-name")).toBeVisible();
    await expect(page.evaluate(() => document.body.innerText.includes("Create your account"))).resolves.toBe(true);

    await trustedMouseClick(page, page.getByTestId("auth-mode-signin"));
    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.evaluate(() => document.body.innerText.includes("Sign in"))).resolves.toBe(true);
  });

  test("signed-in shell remains clickable across lazy-loaded surfaces", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toBeVisible();

    const surfaces = [
      ["app-tab-log", "log-detailed-entry"],
      ["app-tab-program", "program-trajectory-header"],
      ["app-tab-nutrition", "nutrition-execution-plan-header"],
      ["app-tab-coach", "coach-tab"],
      ["app-tab-settings", "settings-tab"],
      ["app-tab-today", "today-session-card"],
    ];

    for (const [tabTestId, surfaceTestId] of surfaces) {
      await page.getByTestId(tabTestId).click();
      await expect(page.getByTestId(surfaceTestId)).toBeVisible();
    }
  });
});
