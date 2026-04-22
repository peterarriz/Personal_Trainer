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

const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
const AUTH_CACHE_KEY = "trainer_auth_session_v1";
const VIEWPORT = { width: 1366, height: 960 };

async function createFrozenPage(browser, {
  fixedIsoString,
  sessionSeed = null,
  localCacheSeed = null,
} = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(({
    fixedIsoString: nextFixedIsoString,
    localCacheKey,
    authCacheKey,
    payloadSeed,
    authSeed,
    supabaseUrl,
    supabaseKey,
  }) => {
    const fixedNow = new Date(nextFixedIsoString).getTime();
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

    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;

    try {
      window.localStorage.removeItem(localCacheKey);
      window.localStorage.removeItem(authCacheKey);
      if (payloadSeed) {
        window.localStorage.setItem(localCacheKey, JSON.stringify(payloadSeed));
      }
      if (authSeed) {
        window.localStorage.setItem(authCacheKey, JSON.stringify(authSeed));
      }
    } catch {}
  }, {
    fixedIsoString,
    localCacheKey: LOCAL_CACHE_KEY,
    authCacheKey: AUTH_CACHE_KEY,
    payloadSeed: localCacheSeed,
    authSeed: sessionSeed,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  const page = await context.newPage();
  return { context, page };
}

async function openSeededApp(browser, {
  fixedIsoString,
  sessionSeed = null,
  localCacheSeed = null,
  runtimeState,
  session,
  expectedSurface = "app",
} = {}) {
  const runtime = await createFrozenPage(browser, {
    fixedIsoString,
    sessionSeed,
    localCacheSeed,
  });
  await installMutableSupabaseRuntime(runtime.page, {
    session,
    runtimeState,
  });
  await runtime.page.goto(`/?e2e=${Date.now()}`);

  const continueLocalMode = runtime.page.getByTestId("continue-local-mode");
  if (await continueLocalMode.isVisible().catch(() => false)) {
    await continueLocalMode.click();
  }
  const authGate = runtime.page.getByTestId("auth-gate");
  if (expectedSurface === "intake" && await authGate.isVisible().catch(() => false)) {
    await signInThroughAuthGate(runtime.page);
  }

  if (expectedSurface === "none") {
    return runtime;
  }
  if (expectedSurface === "intake") {
    await expect.poll(async () => {
      const intakeVisible = await runtime.page.getByTestId("intake-root").isVisible().catch(() => false);
      const todayVisible = await runtime.page.getByTestId("today-session-card").isVisible().catch(() => false);
      return intakeVisible || todayVisible;
    }).toBe(true);
  } else {
    await expect(runtime.page.getByTestId("today-session-card")).toBeVisible();
  }
  return runtime;
}

async function installMutableSupabaseRuntime(page, {
  session,
  runtimeState,
} = {}) {
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
          body: JSON.stringify(runtimeState.trainerDataRows),
        });
        return;
      }

      const requestBody = JSON.parse(route.request().postData() || "{}");
      runtimeState.trainerDataPosts.push(requestBody);

      if (runtimeState.failTrainerDataPosts) {
        await route.fulfill({
          status: 504,
          contentType: "text/plain",
          body: "gateway timeout",
        });
        return;
      }

      runtimeState.trainerDataRows = [{
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
  const openAuthGate = page.getByTestId("settings-open-auth-gate");
  if (!await openAuthGate.isVisible().catch(() => false)) return;
  await openAuthGate.click();
  await signInThroughAuthGate(page, { email, password });
}

async function signInThroughAuthGate(page, {
  email = "athlete@example.com",
  password = "correct horse battery",
} = {}) {
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

async function reloadCloudDataFromSettings(page) {
  await openSettingsAccountSurface(page);
  await page.getByRole("button", { name: /Refresh from account|Reload cloud data/i }).click();
  await expect.poll(async () => {
    const actionMessage = await page.getByTestId("settings-account-action-message").innerText().catch(() => "");
    if (actionMessage) return actionMessage;
    const syncStatus = await page.getByTestId("settings-sync-status").innerText().catch(() => "");
    return syncStatus || "";
  }).toMatch(/Reloaded cloud data|Cloud data was reloaded for the signed-in account|Cloud data could not be reloaded right now|Everything is saved|Up to date/i);
}

async function saveTodayQuickLog(page, {
  statusLabel,
  feelLabel = "",
  note = "",
} = {}) {
  await openDetailedWorkoutLog(page);
  const normalizedStatus = String(statusLabel || "").trim().toLowerCase();
  const completionTestId = normalizedStatus.includes("skipped")
    ? "log-completion-skipped"
    : normalizedStatus.includes("swapped")
    ? "log-completion-swapped"
    : normalizedStatus.includes("partial")
    ? "log-completion-partial"
    : "log-completion-completed";
  await page.getByTestId(completionTestId).click();
  if (feelLabel) {
    const normalizedFeel = String(feelLabel || "").trim().toLowerCase();
    const feelChip = normalizedFeel.includes("harder")
      ? "log-feel-chip-2"
      : normalizedFeel.includes("easier")
      ? "log-feel-chip-4"
      : normalizedFeel.includes("best")
      ? "log-feel-chip-5"
      : normalizedFeel.includes("rough")
      ? "log-feel-chip-1"
      : "log-feel-chip-3";
    await page.getByTestId(feelChip).click();
  }
  if (normalizedStatus.includes("modified")) {
    const runDuration = page.getByTestId("log-run-duration");
    if (await runDuration.count()) {
      const currentValue = Number.parseFloat(await runDuration.inputValue()) || 0;
      await runDuration.fill(String(Math.max(1, currentValue + 2)));
    } else if (await page.getByTestId("log-strength-row-reps-0").count()) {
      const repsField = page.getByTestId("log-strength-row-reps-0");
      const currentValue = Number.parseInt(await repsField.inputValue(), 10) || 0;
      await repsField.fill(String(Math.max(0, currentValue - 1)));
    }
  }
  const advancedFields = page.getByTestId("log-advanced-fields");
  if (!await advancedFields.evaluate((node) => node.open)) {
    await advancedFields.locator("summary").click();
  }
  if (note) {
    await page.getByLabel("Session note").fill(note);
  }
  await expect(page.getByTestId("log-save-quick")).toBeVisible();
  await page.getByTestId("log-save-quick").evaluate((button) => button.click());
  await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);
}

async function logUnderFueledDay(page, dateKey, note) {
  await page.getByTestId("app-tab-nutrition").click();
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Under-fueled" }).click();
  await page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Hunger" }).click();
  await page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)").fill(note);
  await expect(page.getByTestId("nutrition-save-quick")).toBeVisible();
  await page.getByTestId("nutrition-save-quick").evaluate((button) => button.click());
  await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);
}

async function expectTodayQuickLogNote(page, expectedValue) {
  await openDetailedWorkoutLog(page);
  const advancedFields = page.getByTestId("log-advanced-fields");
  if (!await advancedFields.evaluate((node) => node.open)) {
    await advancedFields.locator("summary").click();
  }
  await expect(page.getByLabel("Session note")).toHaveValue(expectedValue);
}

async function expectNutritionQuickLogNote(page, { dateKey, expectedValue }) {
  await page.getByTestId("app-tab-nutrition").click();
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await expect(
    page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
  ).toHaveValue(expectedValue);
}

async function openDetailedWorkoutLog(page) {
  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
  await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
}

async function expectWorkoutReasonAcrossSurfaces(page, pattern) {
  const matches = [];

  await page.getByTestId("app-tab-today").click();
  const todayReason = await page.getByTestId("today-change-summary").innerText().catch(() => "");
  if (pattern.test(todayReason)) matches.push("today");

  await page.getByTestId("app-tab-program").click();
  const programReason = await page.getByTestId("program-change-summary").innerText().catch(() => "");
  if (pattern.test(programReason)) matches.push("program");

  await page.getByTestId("app-tab-nutrition").click();
  const nutritionReason = await page.getByTestId("nutrition-canonical-reason").innerText().catch(() => "");
  if (pattern.test(nutritionReason)) matches.push("nutrition");

  await page.getByTestId("app-tab-coach").click();
  const coachReason = await page.getByTestId("coach-canonical-reason").innerText().catch(() => "");
  if (pattern.test(coachReason)) matches.push("coach");

  expect(matches.length).toBeGreaterThanOrEqual(1);
}

async function expectNutritionReasonAcrossSurfaces(page, pattern) {
  const matches = [];

  await page.getByTestId("app-tab-today").click();
  const todayReason = await page.getByTestId("today-change-summary").innerText().catch(() => "");
  if (pattern.test(todayReason)) matches.push("today");

  await page.getByTestId("app-tab-program").click();
  const programReason = await page.getByTestId("program-change-summary").innerText().catch(() => "");
  if (pattern.test(programReason)) matches.push("program");

  await page.getByTestId("app-tab-nutrition").click();
  const nutritionReason = await page.getByTestId("nutrition-canonical-reason").innerText().catch(() => "");
  if (pattern.test(nutritionReason)) matches.push("nutrition");

  await page.getByTestId("app-tab-coach").click();
  const coachReason = await page.getByTestId("coach-canonical-reason").innerText().catch(() => "");
  if (pattern.test(coachReason)) matches.push("coach");

  expect(matches.length).toBeGreaterThanOrEqual(1);
}

function currentWeekDayRow(page, dayLabel) {
  return page
    .getByTestId("program-this-week")
    .locator("[data-testid^='program-this-week-session-item-']")
    .filter({ hasText: new RegExp(`\\b${dayLabel}\\b`, "i") })
    .first();
}

async function countCurrentWeekRowsMatching(page, pattern) {
  const rows = page.getByTestId("program-this-week").locator("[data-testid^='program-this-week-session-item-']");
  const count = await rows.count();
  let matches = 0;
  for (let index = 0; index < count; index += 1) {
    const text = normalizeSurfaceText(await rows.nth(index).innerText());
    if (pattern.test(text)) matches += 1;
  }
  return matches;
}

async function captureProgramWeekSnapshot(page) {
  await page.getByTestId("app-tab-program").click();
  await expect(page.getByTestId("program-this-week")).toBeVisible();
  const rows = page.getByTestId("program-this-week").locator("[data-testid^='program-this-week-session-item-']");
  const count = await rows.count();
  const rowTexts = [];
  for (let index = 0; index < count; index += 1) {
    rowTexts.push(normalizeSurfaceText(await rows.nth(index).innerText()));
  }
  return {
    changeSummary: normalizeSurfaceText(await page.getByTestId("program-change-summary").innerText()),
    rowTexts,
  };
}

async function readAuthSession(page) {
  return page.evaluate((authKey) => {
    const raw = window.localStorage.getItem(authKey);
    return raw ? JSON.parse(raw) : null;
  }, AUTH_CACHE_KEY);
}

function extractMutationIntegritySnapshot(source = {}, {
  workoutDateKey = "",
  nutritionDateKeys = [],
} = {}) {
  const safeNutritionKeys = Array.isArray(nutritionDateKeys) ? nutritionDateKeys : [];
  return {
    workout: {
      dateKey: workoutDateKey,
      note: source?.dailyCheckins?.[workoutDateKey]?.note || "",
      status: source?.logs?.[workoutDateKey]?.actualSession?.status || "",
    },
    nutrition: Object.fromEntries(
      safeNutritionKeys.map((dateKey) => [
        dateKey,
        {
          note: source?.nutritionActualLogs?.[dateKey]?.note || "",
          deviationKind: source?.nutritionActualLogs?.[dateKey]?.deviationKind || "",
          issue: source?.nutritionActualLogs?.[dateKey]?.issue || "",
        },
      ])
    ),
  };
}

test.describe("signed-in adaptation trust", () => {
  test.describe.configure({ timeout: 120000 });

  test("blank-cloud sign-in preserves exact local workout and nutrition logs without loss, duplication, or reinterpretation", async ({ browser }) => {
    const sharedRuntime = {
      trainerDataRows: [],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const session = makeSession();
    const workoutDateKey = "2026-04-16";
    const workoutNote = "Skipped locally before sign-in because meetings ran long";
    const nutritionNotes = {
      "2026-04-13": "Local-first fuel note 13",
      "2026-04-14": "Local-first fuel note 14",
      "2026-04-15": "Local-first fuel note 15",
    };
    const nutritionDateKeys = Object.keys(nutritionNotes);

    const initialRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "intake",
    });
    const { page: initialPage } = initialRuntime;

    await completeRunningOnboarding(initialPage);
    await saveTodayQuickLog(initialPage, {
      statusLabel: "skipped",
      note: workoutNote,
    });
    for (const [dateKey, note] of Object.entries(nutritionNotes)) {
      await logUnderFueledDay(initialPage, dateKey, note);
    }

    const expectedSnapshot = extractMutationIntegritySnapshot(await readLocalCache(initialPage), {
      workoutDateKey,
      nutritionDateKeys,
    });
    expect(expectedSnapshot).toEqual({
      workout: {
        dateKey: workoutDateKey,
        note: workoutNote,
        status: "skipped",
      },
      nutrition: {
        "2026-04-13": { note: nutritionNotes["2026-04-13"], deviationKind: "under_fueled", issue: "hunger" },
        "2026-04-14": { note: nutritionNotes["2026-04-14"], deviationKind: "under_fueled", issue: "hunger" },
        "2026-04-15": { note: nutritionNotes["2026-04-15"], deviationKind: "under_fueled", issue: "hunger" },
      },
    });

    await signInFromSettings(initialPage);

    await expect.poll(() => extractMutationIntegritySnapshot(sharedRuntime.trainerDataRows[0]?.data || {}, {
      workoutDateKey,
      nutritionDateKeys,
    })).toEqual(expectedSnapshot);

    const latestUploadedSnapshot = extractMutationIntegritySnapshot(
      sharedRuntime.trainerDataPosts[sharedRuntime.trainerDataPosts.length - 1]?.data || {},
      {
        workoutDateKey,
        nutritionDateKeys,
      }
    );
    expect(latestUploadedSnapshot).toEqual(expectedSnapshot);
    expect(
      Object.keys(sharedRuntime.trainerDataRows[0]?.data?.nutritionActualLogs || {})
        .filter((dateKey) => nutritionDateKeys.includes(dateKey))
    ).toHaveLength(nutritionDateKeys.length);

    const authSession = await readAuthSession(initialPage);
    const localCache = await readLocalCache(initialPage);
    await initialRuntime.context.close();

    const reopenedRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: authSession,
      localCacheSeed: localCache,
      runtimeState: sharedRuntime,
      session,
    });
    const { page } = reopenedRuntime;

    await expect.poll(async () => extractMutationIntegritySnapshot(await readLocalCache(page), {
      workoutDateKey,
      nutritionDateKeys,
    })).toEqual(expectedSnapshot);

    await expectTodayQuickLogNote(page, workoutNote);
    for (const [dateKey, note] of Object.entries(nutritionNotes)) {
      await page.getByTestId("app-tab-nutrition").click();
      await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
      await expect(
        page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
      ).toHaveValue(note);
    }

    await reopenedRuntime.context.close();
  });

  test("blank-cloud sign-in keeps workout-driven adaptation across signed-in same-device reopen", async ({ browser }) => {
    const sharedRuntime = {
      trainerDataRows: [],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const session = makeSession();

    const initialRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-15T12:00:00.000Z",
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "intake",
    });
    const { page: initialPage } = initialRuntime;

    await completeRunningOnboarding(initialPage);
    const workoutNote = "Skipped before cloud sign-in because travel ran long";
    await saveTodayQuickLog(initialPage, {
      statusLabel: "skipped",
      note: workoutNote,
    });

    await signInFromSettings(initialPage);
    await expect.poll(() => {
      const data = sharedRuntime.trainerDataRows[0]?.data || {};
      return data?.dailyCheckins?.["2026-04-15"]?.note || "";
    }).toBe(workoutNote);

    const authSession = await readAuthSession(initialPage);
    const localCache = await readLocalCache(initialPage);
    await initialRuntime.context.close();

    const reopenedRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: authSession,
      localCacheSeed: localCache,
      runtimeState: sharedRuntime,
      session,
    });
    const { page } = reopenedRuntime;

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        note: cache?.dailyCheckins?.["2026-04-15"]?.note || "",
        status: cache?.logs?.["2026-04-15"]?.actualSession?.status || "",
      };
    }).toEqual({
      note: workoutNote,
      status: "skipped",
    });

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-this-week")).toBeVisible();
    await expect(page.getByTestId("program-this-week")).toContainText(/tempo|run|recovery|adjusted/i);

    await reopenedRuntime.context.close();
  });

  test("blank-cloud sign-in keeps nutrition-driven adaptation across signed-in same-device reopen", async ({ browser }) => {
    const sharedRuntime = {
      trainerDataRows: [],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const session = makeSession();

    const initialRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "intake",
    });
    const { page: initialPage } = initialRuntime;

    await completeRunningOnboarding(initialPage);
    const notesByDate = {
      "2026-04-13": "Cloud sign-in nutrition note 13",
      "2026-04-14": "Cloud sign-in nutrition note 14",
      "2026-04-15": "Cloud sign-in nutrition note 15",
    };

    for (const [dateKey, note] of Object.entries(notesByDate)) {
      await logUnderFueledDay(initialPage, dateKey, note);
    }

    await signInFromSettings(initialPage);
    await expect.poll(() => {
      const data = sharedRuntime.trainerDataRows[0]?.data || {};
      return data?.nutritionActualLogs?.["2026-04-15"]?.note || "";
    }).toBe(notesByDate["2026-04-15"]);

    const authSession = await readAuthSession(initialPage);
    const localCache = await readLocalCache(initialPage);
    await initialRuntime.context.close();

    const reopenedRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: authSession,
      localCacheSeed: localCache,
      runtimeState: sharedRuntime,
      session,
    });
    const { page } = reopenedRuntime;

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return Object.fromEntries(
        Object.keys(notesByDate).map((dateKey) => [
          dateKey,
          cache?.nutritionActualLogs?.[dateKey]?.note || "",
        ])
      );
    }).toEqual(notesByDate);

    await expectNutritionReasonAcrossSurfaces(page, /fueling stabilizes/i);
    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-this-week")).toBeVisible();
    await expect(page.getByTestId("program-this-week")).toContainText(/run|recovery|steady|adjusted/i);

    await reopenedRuntime.context.close();
  });

  test("transient cloud-save cooldown prevents request storms across passive navigation and successive mutations", async ({ browser }) => {
    const session = makeSession();
    const seededPayload = makeSignedInPayload();
    const sharedRuntime = {
      trainerDataRows: [{
        id: `trainer_v1_${session.user.id}`,
        user_id: session.user.id,
        data: seededPayload,
      }],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const workoutDateKey = "2026-04-16";
    const workoutNote = "Cooldown path workout note";
    const nutritionDateKey = "2026-04-15";
    const nutritionNote = "Cooldown path nutrition note";

    const runtime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: session,
      localCacheSeed: seededPayload,
      runtimeState: sharedRuntime,
      session,
    });
    const { page } = runtime;
    const baselinePostCount = sharedRuntime.trainerDataPosts.length;

    sharedRuntime.failTrainerDataPosts = true;
    await saveTodayQuickLog(page, {
      statusLabel: "skipped",
      note: workoutNote,
    });

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        workoutNote: cache?.dailyCheckins?.[workoutDateKey]?.note || "",
        workoutStatus: cache?.logs?.[workoutDateKey]?.actualSession?.status || "",
      };
    }).toEqual({
      pending: true,
      workoutNote,
      workoutStatus: "skipped",
    });

    const failedPostCount = sharedRuntime.trainerDataPosts.length;
    expect(failedPostCount - baselinePostCount).toBe(1);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();
    await page.getByTestId("app-tab-coach").click();
    await expect(page.getByTestId("coach-tab")).toBeVisible();

    await expect.poll(() => sharedRuntime.trainerDataPosts.length).toBe(failedPostCount);

    await logUnderFueledDay(page, nutritionDateKey, nutritionNote);

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        workoutNote: cache?.dailyCheckins?.[workoutDateKey]?.note || "",
        workoutStatus: cache?.logs?.[workoutDateKey]?.actualSession?.status || "",
        nutritionNote: cache?.nutritionActualLogs?.[nutritionDateKey]?.note || "",
      };
    }).toEqual({
      pending: true,
      workoutNote,
      workoutStatus: "skipped",
      nutritionNote,
    });

    await expect.poll(() => sharedRuntime.trainerDataPosts.length).toBe(failedPostCount);

    await runtime.context.close();
  });

  test("retrying workout logs survive explicit recovery once cloud sync returns", async ({ browser }) => {
    const session = makeSession();
    const seededPayload = makeSignedInPayload();
    const sharedRuntime = {
      trainerDataRows: [{
        id: `trainer_v1_${session.user.id}`,
        user_id: session.user.id,
        data: seededPayload,
      }],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const workoutDateKey = "2026-04-15";
    const workoutNote = "Retry path workout note";

    const runtime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-15T12:00:00.000Z",
      sessionSeed: session,
      localCacheSeed: seededPayload,
      runtimeState: sharedRuntime,
      session,
    });
    const { page } = runtime;

    sharedRuntime.failTrainerDataPosts = true;
    await saveTodayQuickLog(page, {
      statusLabel: "skipped",
      note: workoutNote,
    });

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        note: cache?.dailyCheckins?.[workoutDateKey]?.note || "",
        status: cache?.logs?.[workoutDateKey]?.actualSession?.status || "",
      };
    }).toEqual({
      pending: true,
      note: workoutNote,
      status: "skipped",
    });
    const failedPostCount = sharedRuntime.trainerDataPosts.length;

    sharedRuntime.failTrainerDataPosts = false;
    await reloadCloudDataFromSettings(page);

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        note: cache?.dailyCheckins?.[workoutDateKey]?.note || "",
        status: cache?.logs?.[workoutDateKey]?.actualSession?.status || "",
      };
    }).toEqual({
      pending: false,
      note: workoutNote,
      status: "skipped",
    });
    await expect.poll(() => extractMutationIntegritySnapshot(sharedRuntime.trainerDataRows[0]?.data || {}, {
      workoutDateKey,
      nutritionDateKeys: [],
    })).toEqual({
      workout: {
        dateKey: workoutDateKey,
        note: workoutNote,
        status: "skipped",
      },
      nutrition: {},
    });
    expect(sharedRuntime.trainerDataPosts.length).toBeGreaterThan(failedPostCount);
    await expectTodayQuickLogNote(page, workoutNote);

    await runtime.context.close();
  });

  test("retrying nutrition logs survive explicit recovery once cloud sync returns", async ({ browser }) => {
    const session = makeSession();
    const seededPayload = makeSignedInPayload();
    const sharedRuntime = {
      trainerDataRows: [{
        id: `trainer_v1_${session.user.id}`,
        user_id: session.user.id,
        data: seededPayload,
      }],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const notesByDate = {
      "2026-04-13": "Retry recovery nutrition note 13",
      "2026-04-14": "Retry recovery nutrition note 14",
      "2026-04-15": "Retry recovery nutrition note 15",
    };
    const nutritionDateKeys = Object.keys(notesByDate);

    const runtime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: session,
      localCacheSeed: seededPayload,
      runtimeState: sharedRuntime,
      session,
    });
    const { page } = runtime;

    sharedRuntime.failTrainerDataPosts = true;
    for (const [dateKey, note] of Object.entries(notesByDate)) {
      await logUnderFueledDay(page, dateKey, note);
    }

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        notes: Object.fromEntries(
          nutritionDateKeys.map((dateKey) => [
            dateKey,
            cache?.nutritionActualLogs?.[dateKey]?.note || "",
          ])
        ),
      };
    }).toEqual({
      pending: true,
      notes: notesByDate,
    });

    await expectNutritionReasonAcrossSurfaces(page, /fueling stabilizes/i);

    sharedRuntime.failTrainerDataPosts = false;
    await reloadCloudDataFromSettings(page);

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        notes: Object.fromEntries(
          nutritionDateKeys.map((dateKey) => [
            dateKey,
            cache?.nutritionActualLogs?.[dateKey]?.note || "",
          ])
        ),
      };
    }).toEqual({
      pending: false,
      notes: notesByDate,
    });
    await expectNutritionQuickLogNote(page, {
      dateKey: "2026-04-14",
      expectedValue: notesByDate["2026-04-14"],
    });
    await expect.poll(() => extractMutationIntegritySnapshot(sharedRuntime.trainerDataRows[0]?.data || {}, {
      workoutDateKey: "",
      nutritionDateKeys,
    })).toEqual({
      workout: {
        dateKey: "",
        note: "",
        status: "",
      },
      nutrition: Object.fromEntries(
        nutritionDateKeys.map((dateKey) => [
          dateKey,
          {
            note: notesByDate[dateKey],
            deviationKind: "under_fueled",
            issue: "hunger",
          },
        ])
      ),
    });

    await runtime.context.close();
  });

  test("signed-in degraded-sync workout reopen keeps pending local workout detail visible", async ({ browser }) => {
    const sharedRuntime = {
      trainerDataRows: [],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const session = makeSession();

    const signedInRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-15T12:00:00.000Z",
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "intake",
    });
    const { page: initialPage } = signedInRuntime;

    await completeRunningOnboarding(initialPage);
    await signInFromSettings(initialPage);
    await expect.poll(() => sharedRuntime.trainerDataRows.length).toBe(1);

    sharedRuntime.failTrainerDataPosts = true;
    const workoutNote = "Retry path skipped workout";
    await saveTodayQuickLog(initialPage, {
      statusLabel: "skipped",
      note: workoutNote,
    });

    await expect.poll(async () => {
      const cache = await readLocalCache(initialPage);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        note: cache?.dailyCheckins?.["2026-04-15"]?.note || "",
        status: cache?.logs?.["2026-04-15"]?.actualSession?.status || "",
      };
    }).toEqual({
      pending: true,
      note: workoutNote,
      status: "skipped",
    });

    const authSession = await readAuthSession(initialPage);
    const localCache = await readLocalCache(initialPage);
    await signedInRuntime.context.close();

    const pendingReopenRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-15T12:00:00.000Z",
      sessionSeed: authSession,
      localCacheSeed: localCache,
      runtimeState: sharedRuntime,
      session,
    });
    const { page: pendingPage } = pendingReopenRuntime;

    await expect.poll(async () => {
      const cache = await readLocalCache(pendingPage);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        note: cache?.dailyCheckins?.["2026-04-15"]?.note || "",
      };
    }).toEqual({
      pending: true,
      note: workoutNote,
    });
    await expectTodayQuickLogNote(pendingPage, workoutNote);
    await pendingReopenRuntime.context.close();
  });

  test("signed-in degraded-sync nutrition reopen keeps pending local nutrition detail visible", async ({ browser }) => {
    const sharedRuntime = {
      trainerDataRows: [],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const session = makeSession();
    const nutritionDateKey = "2026-04-15";
    const nutritionNote = "Retry path nutrition note";

    const signedInRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "intake",
    });
    const { page: initialPage } = signedInRuntime;

    await completeRunningOnboarding(initialPage);
    await signInFromSettings(initialPage);
    await expect.poll(() => sharedRuntime.trainerDataRows.length).toBe(1);

    sharedRuntime.failTrainerDataPosts = true;
    await logUnderFueledDay(initialPage, nutritionDateKey, nutritionNote);

    await expect.poll(async () => {
      const cache = await readLocalCache(initialPage);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        note: cache?.nutritionActualLogs?.[nutritionDateKey]?.note || "",
        deviationKind: cache?.nutritionActualLogs?.[nutritionDateKey]?.deviationKind || "",
      };
    }).toEqual({
      pending: true,
      note: nutritionNote,
      deviationKind: "under_fueled",
    });

    const authSession = await readAuthSession(initialPage);
    const localCache = await readLocalCache(initialPage);
    await signedInRuntime.context.close();

    const pendingReopenRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: authSession,
      localCacheSeed: localCache,
      runtimeState: sharedRuntime,
      session,
    });
    const { page: pendingPage } = pendingReopenRuntime;

    await expect.poll(async () => {
      const cache = await readLocalCache(pendingPage);
      return {
        pending: cache?.syncMeta?.pendingCloudWrite || false,
        note: cache?.nutritionActualLogs?.[nutritionDateKey]?.note || "",
      };
    }).toEqual({
      pending: true,
      note: nutritionNote,
    });
    await expectNutritionQuickLogNote(pendingPage, {
      dateKey: nutritionDateKey,
      expectedValue: nutritionNote,
    });
    await pendingReopenRuntime.context.close();
  });

  test("cloud-only reopen after blank-cloud sign-in now restores the signed-in shell from cloud data", async ({ browser }) => {
    const sharedRuntime = {
      trainerDataRows: [],
      trainerDataPosts: [],
      failTrainerDataPosts: false,
    };
    const session = makeSession();

    const initialRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-15T12:00:00.000Z",
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "intake",
    });
    const { page: initialPage } = initialRuntime;

    await completeRunningOnboarding(initialPage);
    await saveTodayQuickLog(initialPage, {
      statusLabel: "skipped",
      note: "Workout saved before cloud-only reopen check",
    });
    await signInFromSettings(initialPage);
    await expect.poll(() => {
      const data = sharedRuntime.trainerDataRows[0]?.data || {};
      return data?.dailyCheckins?.["2026-04-15"]?.note || "";
    }).toBe("Workout saved before cloud-only reopen check");

    const authSession = await readAuthSession(initialPage);
    await initialRuntime.context.close();

    const cloudOnlyRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      sessionSeed: authSession,
      runtimeState: sharedRuntime,
      session,
      expectedSurface: "none",
    });
    const { page } = cloudOnlyRuntime;

    await expect(page.getByTestId("today-session-card")).toBeVisible();
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");

    await cloudOnlyRuntime.context.close();
  });
});
