const { test, expect } = require("@playwright/test");

const { normalizeSurfaceText } = require("./adversarial-test-helpers.js");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  dismissAppleHealthPromptIfVisible,
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

async function domClick(locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((node) => node.click());
}

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

async function seedSignedInContext(context, {
  session = makeSession(),
  payload = makeSignedInPayload(),
  debug = false,
} = {}) {
  await context.addInitScript(({ sessionSeed, payloadSeed, supabaseUrl, supabaseKey, debugMode }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    if (!localStorage.getItem("trainer_auth_session_v1")) {
      localStorage.setItem("trainer_auth_session_v1", JSON.stringify(sessionSeed));
    }
    if (payloadSeed && !localStorage.getItem("trainer_local_cache_v4")) {
      localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
    }
    if (debugMode) localStorage.setItem("trainer_debug", "1");
  }, {
    sessionSeed: session,
    payloadSeed: payload,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    debugMode: debug,
  });
}

async function installSharedSupabaseRuntime(context, {
  session = makeSession(),
  serverState,
} = {}) {
  await context.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });

  await context.route("**/auth/v1/logout", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await context.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/rest/v1/trainer_data")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(serverState.trainerDataRows),
        });
        return;
      }

      const requestBody = JSON.parse(route.request().postData() || "{}");
      serverState.trainerDataPosts.push(requestBody);
      serverState.trainerDataRows = [{
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
  await dismissAppleHealthPromptIfVisible(page);
}

async function saveTodayQuickLog(page, {
  statusLabel,
  feelLabel = "",
  note = "",
} = {}) {
  await domClick(page.getByTestId("app-tab-today"));
  await domClick(page.getByTestId("today-primary-cta"));
  const quickLog = page.getByTestId("today-quick-log");
  await expect(quickLog).toBeVisible();
  await domClick(quickLog.getByRole("button", { name: new RegExp(`^${escapeRegExp(statusLabel)}$`, "i") }));
  if (feelLabel) {
    await domClick(quickLog.getByRole("button", { name: new RegExp(`^${escapeRegExp(feelLabel)}$`, "i") }));
  }
  if (note) {
    await quickLog.getByPlaceholder("Optional note").fill(note);
  }
  await domClick(page.getByTestId("today-save-log"));
  await expect(page.getByTestId("today-save-status")).toContainText(/saved|marked/i);
}

async function logUnderFueledDay(page, dateKey, note) {
  await domClick(page.getByTestId("app-tab-nutrition"));
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await domClick(page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Under-fueled" }));
  await domClick(page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Hunger" }));
  await page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)").fill(note);
  await domClick(page.getByTestId("nutrition-save-quick"));
  await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);
}

async function openSettingsAccountSurface(page) {
  await domClick(page.getByTestId("app-tab-settings"));
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await domClick(page.getByTestId("settings-surface-account"));
  await expect(page.getByTestId("settings-account-section")).toBeVisible();
}

async function signInFromSettings(page, {
  email = "athlete@example.com",
  password = "correct horse battery",
} = {}) {
  await openSettingsAccountSurface(page);
  await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible();
  await domClick(page.getByTestId("settings-open-auth-gate"));
  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await domClick(page.getByTestId("auth-submit"));

  await expect.poll(async () => {
    const raw = await page.evaluate((authKey) => window.localStorage.getItem(authKey), AUTH_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.user?.id || "";
  }).not.toBe("");
  await expect(page.getByTestId("auth-gate")).toHaveCount(0);
}

async function expectTodayQuickLogNote(page, expectedValue) {
  await domClick(page.getByTestId("app-tab-today"));
  await domClick(page.getByTestId("today-primary-cta"));
  await expect(page.getByTestId("today-quick-log").getByPlaceholder("Optional note")).toHaveValue(expectedValue);
}

async function expectNutritionQuickLogNote(page, { dateKey, expectedValue }) {
  await domClick(page.getByTestId("app-tab-nutrition"));
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await expect(
    page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
  ).toHaveValue(expectedValue);
}

async function openSettingsSurface(page, surfaceTestId, expectedSectionTestId) {
  await domClick(page.getByTestId("app-tab-settings"));
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await domClick(page.getByTestId(surfaceTestId));
  await expect(page.getByTestId(expectedSectionTestId)).toBeVisible();
}

async function saveProfileName(page, nextName) {
  await openSettingsSurface(page, "settings-surface-profile", "settings-profile-section");
  await page.getByPlaceholder("Display name").fill(nextName);
  await domClick(page.getByRole("button", { name: "Save profile" }));
}

async function addSwimGoal(page) {
  await openSettingsSurface(page, "settings-surface-goals", "settings-goals-section");
  await domClick(page.getByTestId("settings-goals-add"));
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await domClick(page.getByTestId("settings-goal-editor-template-swim_better"));
  await domClick(page.getByTestId("settings-goal-editor-preview"));
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/Swim better|swim/i);
  await domClick(page.getByTestId("settings-goals-confirm-preview"));
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
  test.describe.configure({ timeout: 120000 });
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

  test("reload during retry keeps the pending marker and preserves the unsynced nutrition detail", async ({ page }) => {
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
      notes: notesByDate,
    });

    await page.getByTestId("app-tab-nutrition").click();
    await page.getByTestId("nutrition-log-date-select").selectOption("2026-04-14");
    await expect(
      page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
    ).toHaveValue(notesByDate["2026-04-14"]);
  });

  test("profile, goals, workout logs, and nutrition logs sync across two signed-in devices and survive hard refresh", async ({ browser }) => {
    test.setTimeout(120000);
    const session = makeSession();
    const payload = makeSignedInPayload();
    const serverState = {
      trainerDataRows: [{ id: "trainer_v1_user", user_id: session.user.id, data: payload }],
      trainerDataPosts: [],
    };
    const deviceOne = await browser.newContext({ viewport: { width: 1366, height: 960 } });
    const deviceTwo = await browser.newContext({ viewport: { width: 1366, height: 960 } });

    try {
      await seedSignedInContext(deviceOne, { session, payload });
      await installSharedSupabaseRuntime(deviceOne, { session, serverState });

      const pageOne = await deviceOne.newPage();
      await freezeBrowserDate(pageOne, "2026-04-17T12:00:00.000Z");
      await pageOne.goto("/");
      await expect(pageOne.getByTestId("today-tab")).toBeVisible();

      const syncedName = "Synced Across Devices";
      const workoutNote = "Device one skipped this benchmark lift";
      const nutritionNote = "Device one under-fueled the day";

      await saveProfileName(pageOne, syncedName);
      await expect.poll(() => serverState.trainerDataRows[0]?.data?.personalization?.profile?.name || "").toBe(syncedName);
      await addSwimGoal(pageOne);
      await expect.poll(() => JSON.stringify(serverState.trainerDataRows[0]?.data?.goals || [])).toMatch(/swim/i);
      await saveTodayQuickLog(pageOne, {
        statusLabel: "skipped",
        note: workoutNote,
      });
      await expect.poll(() => serverState.trainerDataRows[0]?.data?.dailyCheckins?.["2026-04-17"]?.note || "").toBe(workoutNote);
      await logUnderFueledDay(pageOne, "2026-04-16", nutritionNote);
      await expect.poll(() => serverState.trainerDataRows[0]?.data?.nutritionActualLogs?.["2026-04-16"]?.note || "").toBe(nutritionNote);

      await expect.poll(() => serverState.trainerDataPosts.length).toBeGreaterThanOrEqual(4);
      await pageOne.reload();
      await expect(pageOne.getByTestId("today-session-card")).toBeVisible();

      await seedSignedInContext(deviceTwo, { session, payload: null });
      await installSharedSupabaseRuntime(deviceTwo, { session, serverState });
      const pageTwo = await deviceTwo.newPage();
      await freezeBrowserDate(pageTwo, "2026-04-17T12:00:00.000Z");
      await pageTwo.goto("/");
      await expect(pageTwo.getByTestId("today-session-card")).toBeVisible();
      await pageTwo.reload();
      await expect(pageTwo.getByTestId("today-session-card")).toBeVisible();
      await expect.poll(async () => {
        const cache = await readLocalCache(pageTwo);
        return {
          name: cache?.personalization?.profile?.name || "",
          hasSwimGoal: JSON.stringify(cache?.goals || []).toLowerCase().includes("swim"),
          workoutNote: cache?.dailyCheckins?.["2026-04-17"]?.note || "",
          nutritionNote: cache?.nutritionActualLogs?.["2026-04-16"]?.note || "",
        };
      }).toEqual({
        name: syncedName,
        hasSwimGoal: true,
        workoutNote,
        nutritionNote,
      });

      await openSettingsSurface(pageTwo, "settings-surface-profile", "settings-profile-section");
      await expect(pageTwo.getByPlaceholder("Display name")).toHaveValue(syncedName);

      await openSettingsSurface(pageTwo, "settings-surface-goals", "settings-goals-section");
      await expect(pageTwo.getByTestId("settings-goals-management")).toContainText(/Swim better|swim/i);

      await expectTodayQuickLogNote(pageTwo, workoutNote);
      await expectNutritionQuickLogNote(pageTwo, {
        dateKey: "2026-04-16",
        expectedValue: nutritionNote,
      });
    } finally {
      await Promise.allSettled([
        deviceOne.close(),
        deviceTwo.close(),
      ]);
    }
  });
});
