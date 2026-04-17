const { test, expect } = require("@playwright/test");

const { normalizeSurfaceText } = require("./adversarial-test-helpers.js");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  gotoIntakeInLocalMode,
  readLocalCache,
  waitForPostOnboarding,
  waitForReview,
} = require("./intake-test-utils.js");
const {
  SUPABASE_KEY,
  SUPABASE_URL,
  makeSession,
  makeSignedInPayload,
} = require("./auth-runtime-test-helpers.js");

const AUTH_CACHE_KEY = "trainer_auth_session_v1";

async function freezeBrowserDate(page, isoString) {
  await page.addInitScript(({ fixedIsoString }) => {
    const fixedNow = new Date(fixedIsoString).getTime();
    const OriginalDate = Date;
    function MockDate(...args) {
      if (this instanceof MockDate) {
        return args.length === 0 ? new OriginalDate(fixedNow) : new OriginalDate(...args);
      }
      return OriginalDate(...args);
    }
    MockDate.now = () => fixedNow;
    MockDate.parse = OriginalDate.parse;
    MockDate.UTC = OriginalDate.UTC;
    MockDate.prototype = OriginalDate.prototype;
    globalThis.Date = MockDate;
    window.Date = MockDate;
  }, { fixedIsoString: isoString });
}

async function installSupabaseConfig(page) {
  await page.addInitScript(({ supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
  }, {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
}

async function installMutableSupabaseRuntime(page, {
  session = makeSession(),
  initialTrainerDataRows = [],
} = {}) {
  const state = {
    trainerDataRows: Array.isArray(initialTrainerDataRows)
      ? initialTrainerDataRows.map((row) => JSON.parse(JSON.stringify(row)))
      : [],
    trainerDataPosts: [],
    failTrainerDataPosts: false,
  };

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });

  await page.route("**/auth/v1/logout", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/rest/v1/trainer_data")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(state.trainerDataRows),
        });
        return;
      }

      const requestBody = JSON.parse(route.request().postData() || "{}");
      state.trainerDataPosts.push(requestBody);

      if (state.failTrainerDataPosts) {
        await route.fulfill({
          status: 504,
          contentType: "text/plain",
          body: "gateway timeout",
        });
        return;
      }

      state.trainerDataRows = [{
        id: requestBody.id || `trainer_v1_${session.user.id}`,
        user_id: requestBody.user_id || session.user.id,
        data: requestBody.data || {},
      }];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  return state;
}

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
    target_timeline: { type: "natural", value: "October" },
    current_run_frequency: { type: "natural", value: "3 runs/week" },
    running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
    longest_recent_run: { type: "natural", value: "7 miles" },
    recent_pace_baseline: { type: "natural", value: "8:55 pace" },
  });
  await waitForReview(page);
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
}

async function saveTodayQuickLog(page, {
  statusLabel,
  feelLabel = "",
  note = "",
} = {}) {
  const quickLog = page.getByTestId("today-quick-log");
  await page.getByTestId("app-tab-today").click();
  await expect(quickLog).toBeVisible();
  await quickLog.getByRole("button", { name: new RegExp(`^${escapeRegExp(statusLabel)}$`, "i") }).click();
  if (feelLabel) {
    await quickLog.getByRole("button", { name: new RegExp(`^${escapeRegExp(feelLabel)}$`, "i") }).click();
  }
  if (note) {
    await quickLog.getByPlaceholder("Optional note").fill(note);
  }
  await page.getByTestId("today-save-log").click();
  await expect(page.getByTestId("today-save-status")).toContainText(/saved|marked/i);
}

async function logUnderFueledDay(page, dateKey, note) {
  await page.getByTestId("app-tab-nutrition").click();
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Under-fueled" }).click();
  await page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Hunger" }).click();
  await page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)").fill(note);
  await page.getByTestId("nutrition-save-quick").click();
  await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);
}

async function openSettingsAccountSurface(page) {
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await page.getByTestId("settings-surface-account").click();
  await expect(page.getByTestId("settings-account-section")).toBeVisible();
}

async function signInFromSettings(page, {
  email = "athlete@example.com",
  password = "correct horse battery",
} = {}) {
  await openSettingsAccountSurface(page);
  await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible();
  await page.getByTestId("settings-open-auth-gate").click();
  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect.poll(async () => {
    const raw = await page.evaluate((authKey) => window.localStorage.getItem(authKey), AUTH_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.user?.id || "";
  }).not.toBe("");
  await expect(page.getByTestId("auth-gate")).toHaveCount(0);
}

async function expectTodayQuickLogNote(page, expectedValue) {
  await page.getByTestId("app-tab-today").click();
  await expect(page.getByTestId("today-quick-log").getByPlaceholder("Optional note")).toHaveValue(expectedValue);
}

async function expectNutritionQuickLogNote(page, { dateKey, expectedValue }) {
  await page.getByTestId("app-tab-nutrition").click();
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await expect(
    page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
  ).toHaveValue(expectedValue);
}

function currentWeekDayRow(page, dayLabel) {
  return page
    .getByTestId("program-this-week")
    .locator("[data-testid^='program-this-week-session-item-']")
    .filter({ hasText: new RegExp(`\\b${dayLabel}\\b`, "i") })
    .first();
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("local-first and sync trust paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("blank cloud sign-in promotes local workout and nutrition logs instead of dropping them", async ({ page }) => {
    await freezeBrowserDate(page, "2026-04-16T12:00:00.000Z");
    await installSupabaseConfig(page);
    const session = makeSession();
    const runtime = await installMutableSupabaseRuntime(page, {
      session,
      initialTrainerDataRows: [],
    });

    await completeRunningOnboarding(page);

    const workoutNote = "Skipped because travel ran long";
    const nutritionNote = "Under-fueled before sign-in";
    await saveTodayQuickLog(page, {
      statusLabel: "skipped",
      note: workoutNote,
    });
    await logUnderFueledDay(page, "2026-04-15", nutritionNote);

    await signInFromSettings(page);
    await expect.poll(() => runtime.trainerDataPosts.length).not.toBe(0);
    await page.reload();
    await expect(page.getByTestId("today-session-card")).toBeVisible();

    const cache = await readLocalCache(page);
    expect(cache?.dailyCheckins?.["2026-04-16"]?.note).toBe(workoutNote);
    expect(cache?.logs?.["2026-04-16"]?.actualSession?.status).toBe("skipped");
    expect(cache?.nutritionActualLogs?.["2026-04-15"]?.note).toBe(nutritionNote);
    expect(cache?.nutritionActualLogs?.["2026-04-15"]?.deviationKind).toBe("under_fueled");

    await expectTodayQuickLogNote(page, workoutNote);
    await expectNutritionQuickLogNote(page, {
      dateKey: "2026-04-15",
      expectedValue: nutritionNote,
    });

    const uploadedTrainerBlob = runtime.trainerDataPosts[runtime.trainerDataPosts.length - 1];
    expect(uploadedTrainerBlob?.data?.dailyCheckins?.["2026-04-16"]?.note).toBe(workoutNote);
    expect(uploadedTrainerBlob?.data?.nutritionActualLogs?.["2026-04-15"]?.note).toBe(nutritionNote);
  });

  test("signing into a populated cloud account does not merge local-only workout logs", async ({ page }) => {
    await freezeBrowserDate(page, "2026-04-16T12:00:00.000Z");
    await installSupabaseConfig(page);
    const session = makeSession();
    const cloudPayload = makeSignedInPayload();
    const runtime = await installMutableSupabaseRuntime(page, {
      session,
      initialTrainerDataRows: [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
    });

    await completeRunningOnboarding(page);

    const localOnlyWorkoutNote = "Local-only skipped session before sign-in";
    await saveTodayQuickLog(page, {
      statusLabel: "skipped",
      note: localOnlyWorkoutNote,
    });
    const localCacheBeforeSignIn = await readLocalCache(page);
    expect(localCacheBeforeSignIn?.dailyCheckins?.["2026-04-16"]?.note).toBe(localOnlyWorkoutNote);

    await signInFromSettings(page);

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return cache?.dailyCheckins?.["2026-04-16"]?.note || "";
    }).toBe("");

    await expectTodayQuickLogNote(page, "");
    const postedLocalNotes = runtime.trainerDataPosts
      .map((body) => body?.data?.dailyCheckins?.["2026-04-16"]?.note || body?.data?.logs?.["2026-04-16"]?.checkin?.note || "")
      .filter(Boolean);
    expect(postedLocalNotes).not.toContain(localOnlyWorkoutNote);
  });

  test("reload during retry currently keeps the pending marker but drops the unsynced nutrition detail", async ({ page }) => {
    await freezeBrowserDate(page, "2026-04-16T12:00:00.000Z");
    await installSupabaseConfig(page);
    const session = makeSession();
    const runtime = await installMutableSupabaseRuntime(page, {
      session,
      initialTrainerDataRows: [],
    });

    await completeRunningOnboarding(page);
    await signInFromSettings(page);

    runtime.failTrainerDataPosts = true;

    const notesByDate = {
      "2026-04-13": "Retry trust fuel note 13",
      "2026-04-14": "Retry trust fuel note 14",
      "2026-04-15": "Retry trust fuel note 15",
    };

    for (const [dateKey, note] of Object.entries(notesByDate)) {
      await logUnderFueledDay(page, dateKey, note);
    }

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return cache?.syncMeta?.pendingCloudWrite || false;
    }).toBe(true);

    await page.getByTestId("app-tab-program").click();
    const baselineReason = normalizeSurfaceText(await page.getByTestId("program-change-summary").innerText());
    expect(baselineReason).toMatch(/fueling stabilizes/i);

    await page.reload();
    await expect(page.getByTestId("today-session-card")).toBeVisible();
    await page.getByTestId("app-tab-program").click();

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        notes: Object.fromEntries(
          Object.keys(notesByDate).map((dateKey) => [
            dateKey,
            cache?.nutritionActualLogs?.[dateKey]?.note || "",
          ])
        ),
      };
    }).toEqual({
      pending: true,
      notes: {
        "2026-04-13": "",
        "2026-04-14": "",
        "2026-04-15": "",
      },
    });

    await page.getByTestId("app-tab-nutrition").click();
    await page.getByTestId("nutrition-log-date-select").selectOption("2026-04-14");
    await expect(
      page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
    ).toHaveValue("");
  });
});
