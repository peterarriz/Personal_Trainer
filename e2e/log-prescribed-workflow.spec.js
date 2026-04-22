const { test, expect } = require("@playwright/test");

require("sucrase/register");

const {
  buildPersistedTrainerPayload,
  DEFAULT_COACH_PLAN_ADJUSTMENTS,
  DEFAULT_NUTRITION_FAVORITES,
} = require("../src/services/persistence-adapter-service.js");
const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const { createPrescribedDayHistoryEntry } = require("../src/services/prescribed-day-history-service.js");
const { getExercisePerformanceRecordsForLog } = require("../src/services/performance-record-service.js");
const {
  SUPABASE_KEY,
  SUPABASE_URL,
  makeSession,
} = require("./auth-runtime-test-helpers.js");

const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
const LOG_OVERRIDE_KEY = "trainer_e2e_log_plan_override_v1";
const FIXED_ISO = "2026-04-17T12:00:00.000Z";
const VIEWPORT = { width: 1366, height: 960 };

const buildTrainingForMode = (mode = "run") => {
  if (mode === "strength") {
    return {
      label: "Strength B",
      type: "strength+prehab",
      prescribedExercises: [
        { ex: "Barbell Bench Press", sets: "4x6", weight: 185 },
        { ex: "Cable Row", sets: "3x10" },
      ],
    };
  }
  if (mode === "mixed") {
    return {
      label: "Tempo + Strength",
      type: "run+strength",
      run: { t: "Tempo", d: "10 min easy + 15 min tempo + 10 min easy" },
      prescribedExercises: [
        { ex: "Goblet Squat", sets: "3x10" },
      ],
    };
  }
  return {
    label: "Tempo Run",
    type: "hard-run",
    run: { t: "Tempo", d: "10 min easy + 20 min tempo + 10 min easy" },
  };
};

const buildSeedPayload = ({ mode = "run" } = {}) => {
  const todayKey = FIXED_ISO.split("T")[0];
  const training = buildTrainingForMode(mode);
  const plannedDayRecord = buildPlannedDayRecord({
    id: `plan_day_${todayKey}_${mode}`,
    dateKey: todayKey,
    week: { number: 6, phase: "BUILD" },
    base: {
      training,
      nutrition: {
        prescription: { dayType: mode === "strength" ? "strength" : "run_quality", targets: { cal: 2600, c: 260, p: 190, f: 70 } },
      },
      recovery: { state: "ready" },
      supplements: null,
    },
    resolved: {
      training,
      nutrition: {
        prescription: { dayType: mode === "strength" ? "strength" : "run_quality", targets: { cal: 2600, c: 260, p: 190, f: 70 } },
      },
      recovery: { state: "ready" },
      supplements: null,
    },
    decision: { mode: "steady", modifiedFromBase: false },
    provenance: { summary: `${training.label} was the saved plan for ${todayKey}.`, keyDrivers: ["e2e_seed"], events: [] },
    flags: {},
  });

  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord,
    capturedAt: Date.parse(`${todayKey}T12:00:00.000Z`),
    reason: "daily_decision_capture",
  });

  return {
    payload: buildPersistedTrainerPayload({
      runtimeState: {
        goals: [{
          id: `goal_${mode}`,
          name: training.label,
          category: mode === "strength" ? "strength" : "running",
          priority: 1,
          active: true,
          status: "active",
          tracking: { mode: "progress_tracker" },
        }],
        plannedDayRecords: {
          [todayKey]: historyEntry,
        },
        personalization: {
          profile: {
            name: "Taylor",
            age: 32,
            weight: 186,
            bodyweight: 186,
            height: "6'0\"",
            onboardingComplete: true,
            profileSetupComplete: true,
          },
          settings: {
            appearance: { theme: "System" },
          },
          trainingContext: {
            environment: { value: "gym", confirmed: true, source: "e2e_seed" },
            equipmentAccess: { value: "full_gym", confirmed: true, source: "e2e_seed", items: ["barbell", "rack", "bench"] },
          },
        },
        coachPlanAdjustments: DEFAULT_COACH_PLAN_ADJUSTMENTS,
        nutritionFavorites: DEFAULT_NUTRITION_FAVORITES,
      },
    }),
    todayHistoryEntry: historyEntry,
  };
};

async function openSeededLog(page, { mode = "run" } = {}) {
  const { payload, todayHistoryEntry } = buildSeedPayload({ mode });
  const session = makeSession();
  await page.addInitScript(({ fixedIsoString, localCacheKey, logOverrideKey, seedPayload, todayOverride, sessionSeed, supabaseUrl, supabaseKey }) => {
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
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;

    try {
      if (!window.localStorage.getItem("trainer_auth_session_v1")) {
        window.localStorage.setItem("trainer_auth_session_v1", JSON.stringify(sessionSeed));
      }
      if (!window.localStorage.getItem(localCacheKey)) {
        window.localStorage.setItem(localCacheKey, JSON.stringify(seedPayload));
      }
      if (!window.localStorage.getItem(logOverrideKey)) {
        window.localStorage.setItem(logOverrideKey, JSON.stringify(todayOverride));
      }
    } catch {}
  }, {
    fixedIsoString: FIXED_ISO,
    localCacheKey: LOCAL_CACHE_KEY,
    logOverrideKey: LOG_OVERRIDE_KEY,
    seedPayload: payload,
    todayOverride: todayHistoryEntry,
    sessionSeed: session,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });

  await page.setViewportSize(VIEWPORT);
  await page.goto(`/?e2e=${Date.now()}`);

  const continueLocalMode = page.getByTestId("continue-local-mode");
  if (await continueLocalMode.isVisible().catch(() => false)) {
    await continueLocalMode.click();
  }

  const skipAppleHealth = page.getByRole("button", { name: "Skip for now" });
  if (await skipAppleHealth.isVisible().catch(() => false)) {
    await skipAppleHealth.click({ force: true });
  }

  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
}

async function readSavedLog(page) {
  return page.evaluate((localCacheKey) => {
    try {
      return JSON.parse(window.localStorage.getItem(localCacheKey) || "{}")?.logs || {};
    } catch {
      return {};
    }
  }, LOCAL_CACHE_KEY);
}

async function readSavedTrainerCache(page) {
  return page.evaluate((localCacheKey) => {
    try {
      return JSON.parse(window.localStorage.getItem(localCacheKey) || "{}") || {};
    } catch {
      return {};
    }
  }, LOCAL_CACHE_KEY);
}

async function domClick(locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((node) => node.click());
}

async function expectMinTouchHeight(locator, minimumHeight = 48) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(minimumHeight);
}

test.describe("log prescribed workflow", () => {
  test("baseline log rendering keeps one prescribed card, one completion selector, and one save path", async ({ page }) => {
    await openSeededLog(page, { mode: "run" });

    const logTab = page.getByTestId("log-tab");
    await expect(logTab.getByRole("button", { name: /open full detail entry/i })).toHaveCount(0);
    await expect(logTab.getByTestId("planned-session-plan")).toHaveCount(1);
    await expect(logTab.getByTestId("log-trust-row")).toContainText(/Prescribed loaded/i);
    await expect(logTab.getByTestId("log-trust-row")).toContainText(/Used later/i);
    await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
    await expect(page.getByTestId("log-completion-selector")).toBeVisible();
    await expect(page.getByTestId("log-completion-completed")).toBeVisible();
    await expect(page.getByTestId("log-save-support-line")).toContainText(/loaded/i);
    await expect(page.getByTestId("log-run-modality")).toHaveValue("run");
    await expect(page.getByTestId("log-run-duration")).toBeVisible();
    await expect(page.getByTestId("log-run-duration")).toHaveValue("40");
    await expect(page.getByTestId("log-extra-exercises")).toHaveCount(0);
    await expect(page.getByTestId("log-advanced-fields")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-day-review-disclosure")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-recent-history-disclosure")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-save-quick")).toBeEnabled();
    await expect(page.getByTestId("log-save-detailed")).toHaveCount(0);
    await expectMinTouchHeight(page.getByTestId("log-save-quick"));
    await expectMinTouchHeight(page.getByTestId("log-feel-chip-3"));
    await expectMinTouchHeight(page.getByTestId("log-run-duration-stepper"));

    await domClick(page.getByTestId("log-save-quick"));
    await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);
    await expect(page.getByTestId("log-save-support-line")).toContainText(/saved/i);

    const cache = await readSavedTrainerCache(page);
    expect(cache?.logs?.["2026-04-17"]?.checkin?.status).toBe("completed_as_planned");
    expect(cache?.dailyCheckins?.["2026-04-17"]?.status).toBe("completed_as_planned");
  });

  test("logging a fully completed strength workout preserves prescribed lift actuals", async ({ page }) => {
    await openSeededLog(page, { mode: "strength" });

    const logTab = page.getByTestId("log-tab");
    await expect(logTab.getByRole("button", { name: /open full detail entry/i })).toHaveCount(0);
    await expect(logTab.getByTestId("planned-session-plan")).toHaveCount(1);
    await expect(page.getByTestId("log-strength-execution-card-0")).toBeVisible();
    await expect(page.getByTestId("log-strength-help-0")).toBeVisible();
    await page.getByTestId("log-strength-help-0").locator("summary").click();
    await expect(page.getByTestId("log-strength-help-0-link")).toBeVisible();
    await expect(page.getByTestId("log-strength-row-sets-0")).toHaveValue("4");
    await expect(page.getByTestId("log-strength-row-reps-0")).toHaveValue("6");
    await expect(page.getByTestId("log-strength-row-weight-0")).toHaveValue("185");
    await expect(page.getByTestId("log-advanced-fields")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-day-review-disclosure")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-recent-history-disclosure")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-save-detailed")).toHaveCount(0);
    await expect(page.getByTestId("log-extra-exercises")).toBeVisible();
    await expect(page.getByTestId("log-extra-exercises")).toHaveJSProperty("open", false);
    await expectMinTouchHeight(page.getByTestId("log-strength-complete-set-0"));

    await domClick(page.getByTestId("log-save-quick"));
    await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);

    const cache = await readSavedTrainerCache(page);
    expect(cache?.logs?.["2026-04-17"]?.strengthPerformance?.[0]?.actualSets).toBe(4);
    expect(cache?.logs?.["2026-04-17"]?.strengthPerformance?.[0]?.actualReps).toBe(6);
    expect(cache?.logs?.["2026-04-17"]?.strengthPerformance?.[0]?.actualWeight).toBe(185);
    expect(cache?.dailyCheckins?.["2026-04-17"]?.status).toBe("completed_as_planned");
  });

  test("logging a shortened modified workout keeps prescribed and actual separate", async ({ page }) => {
    await openSeededLog(page, { mode: "mixed" });

    const logTab = page.getByTestId("log-tab");
    await expect(logTab.getByTestId("planned-session-plan")).toHaveCount(1);
    await expect(page.getByTestId("log-run-duration")).toBeVisible();
    await expect(page.getByTestId("log-run-duration")).toHaveValue("35");
    await expect(page.getByTestId("log-strength-execution-card-0")).toBeVisible();
    await expect(page.getByTestId("log-strength-row-sets-0")).toHaveValue("3");
    await expect(page.getByTestId("log-strength-row-reps-0")).toHaveValue("10");
    await expect(page.getByTestId("log-day-review-disclosure")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-recent-history-disclosure")).toHaveJSProperty("open", false);
    await expect(page.getByTestId("log-extra-exercises")).toBeVisible();

    await page.getByTestId("log-run-duration").fill("42");
    await page.getByTestId("log-strength-row-reps-0-stepper").getByRole("button", { name: "-1" }).click();
    await page.getByTestId("log-strength-row-reps-0-stepper").getByRole("button", { name: "-1" }).click();
    await expect(page.getByTestId("log-run-duration")).toHaveValue("42");
    await expect(page.getByTestId("log-strength-row-reps-0")).toHaveValue("8");
    await page.getByTestId("log-run-duration").press("Tab");
    await domClick(page.getByTestId("log-save-quick"));
    await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);
    await expect(logTab.getByText(/planned time 35 min/i)).toBeVisible();
    await expect(page.getByTestId("log-run-duration")).toHaveValue("42");
    await expect(page.getByTestId("log-strength-row-sets-0")).toHaveValue("3");
    await expect(page.getByTestId("log-strength-row-reps-0")).toHaveValue("8");
  });

  test("logging a cardio substitute marks the day as swapped instead of faking a run", async ({ page }) => {
    await openSeededLog(page, { mode: "run" });

    await page.getByTestId("log-completion-swapped").click();
    await expect(page.getByTestId("log-swap-card")).toBeVisible();
    await page.getByTestId("log-swap-modality").selectOption("bike");
    await page.getByTestId("log-swap-label").fill("Bike substitute");
    await page.getByTestId("log-run-duration").fill("45");
    await page.getByTestId("log-run-distance").fill("14");

    await domClick(page.getByTestId("log-save-quick"));
    await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);

    const cache = await readSavedTrainerCache(page);
    expect(cache?.logs?.["2026-04-17"]?.actualSession?.swapFromPlan).toBe(true);
    expect(cache?.logs?.["2026-04-17"]?.actualSession?.modality).toBe("bike");
    expect(cache?.logs?.["2026-04-17"]?.actualSession?.completionKind).toBe("custom_session");
    expect(cache?.logs?.["2026-04-17"]?.checkin?.status).toBe("completed_modified");
    expect(cache?.dailyCheckins?.["2026-04-17"]?.status).toBe("completed_modified");
  });

  test("reopening the day keeps the saved log state intact", async ({ page }) => {
    await openSeededLog(page, { mode: "run" });

    await page.getByTestId("log-run-duration").fill("44");
    await page.getByTestId("log-advanced-fields").locator("summary").click();
    await page.getByTestId("log-body-status").selectOption("legs_sore");
    await page.getByTestId("log-recovery-state").selectOption("low");
    await page.getByTestId("log-blocker").selectOption("fatigue");
    await page.getByLabel("Session note").fill("Shortened after work ran late.");
    await domClick(page.getByTestId("log-save-quick"));
    await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);

    await page.reload();
    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();
    await expect(page.getByTestId("log-run-duration")).toHaveValue("44");
    await expect(page.getByTestId("log-advanced-fields")).toHaveJSProperty("open", false);
    await page.getByTestId("log-advanced-fields").locator("summary").click();
    await expect(page.getByTestId("log-body-status")).toHaveValue("legs_sore");
    await expect(page.getByTestId("log-recovery-state")).toHaveValue("low");
    await expect(page.getByTestId("log-blocker")).toHaveValue("fatigue");
    await expect(page.getByLabel("Session note")).toHaveValue("Shortened after work ran late.");
  });
});
