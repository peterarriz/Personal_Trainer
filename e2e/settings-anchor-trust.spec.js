const { test, expect } = require("@playwright/test");

require("sucrase/register");

const { normalizeSurfaceText } = require("./adversarial-test-helpers.js");
const { LOCAL_CACHE_KEY, readLocalCache } = require("./intake-test-utils.js");
const {
  SUPABASE_KEY,
  SUPABASE_URL,
  makeSession,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const {
  buildPersistedTrainerPayload,
  DEFAULT_COACH_PLAN_ADJUSTMENTS,
  DEFAULT_NUTRITION_FAVORITES,
} = require("../src/services/persistence-adapter-service.js");
const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const { createPrescribedDayHistoryEntry } = require("../src/services/prescribed-day-history-service.js");

const VIEWPORT = { width: 1366, height: 960 };
const DEFAULT_FIXED_ISO = "2026-04-16T12:00:00.000Z";

const buildGoal = ({
  runtimeId,
  recordId,
  summary,
  category = "strength",
  goalFamily = "strength",
  priority = 1,
  targetDate = "",
  targetHorizonWeeks = null,
  primaryMetric = null,
  proxyMetrics = [],
} = {}) => ({
  id: runtimeId,
  goalRecordId: recordId,
  name: summary,
  category,
  priority,
  active: true,
  status: "active",
  targetDate,
  targetHorizonWeeks,
  measurableTarget: primaryMetric?.targetValue ? `${primaryMetric.label} ${primaryMetric.targetValue}` : summary,
  primaryMetric,
  proxyMetrics,
  tracking: category === "running"
    ? { mode: "progress_tracker", metricKey: primaryMetric?.key || proxyMetrics?.[0]?.key || "" }
    : category === "body_comp"
    ? { mode: "weekly_checkin", metricKey: proxyMetrics?.[0]?.key || primaryMetric?.key || "", unit: proxyMetrics?.[0]?.unit || "lb" }
    : { mode: "logged_lifts", metricKey: primaryMetric?.key || "", unit: primaryMetric?.unit || "lb" },
  resolvedGoal: {
    id: recordId,
    summary,
    planningCategory: category,
    goalFamily,
    planningPriority: priority,
    targetDate,
    targetHorizonWeeks,
    primaryMetric,
    proxyMetrics,
    confirmedByUser: true,
    confirmationSource: "e2e_seed",
    confidence: "medium",
    measurabilityTier: primaryMetric?.targetValue ? "fully_measurable" : proxyMetrics.length ? "proxy_measurable" : "exploratory_fuzzy",
    tradeoffs: category === "strength" ? ["Strength focus can steal some recovery from running."] : [],
    unresolvedGaps: [],
    reviewCadence: "weekly",
    refinementTrigger: "30_day_resolution_review",
  },
});

const buildHistoricalPlanEntry = (historyDateKey = "2026-04-14") => {
  const plannedDayRecord = buildPlannedDayRecord({
    id: `plan_day_${historyDateKey}`,
    dateKey: historyDateKey,
    week: { number: 8, phase: "BUILD" },
    base: {
      training: {
        label: "Tempo Intervals",
        type: "hard-run",
        run: { t: "Tempo", d: "3 x 8 min" },
      },
      nutrition: {
        prescription: { dayType: "hardRun", targets: { cal: 2700, c: 280, p: 190, f: 68 } },
      },
      recovery: null,
      supplements: null,
    },
    resolved: {
      training: {
        label: "Tempo Intervals",
        type: "hard-run",
        run: { t: "Tempo", d: "3 x 8 min" },
      },
      nutrition: {
        prescription: { dayType: "hardRun", targets: { cal: 2700, c: 280, p: 190, f: 68 } },
      },
      recovery: { state: "ready" },
      supplements: null,
    },
    decision: { mode: "progression_ready", modifiedFromBase: false },
    provenance: { summary: `Tempo Intervals was the saved plan for ${historyDateKey}.`, keyDrivers: ["weekly intent"], events: [] },
    flags: {},
  });

  return createPrescribedDayHistoryEntry({
    plannedDayRecord,
    capturedAt: Date.parse(`${historyDateKey}T12:00:00.000Z`),
    reason: "daily_decision_capture",
  });
};

const buildSeedPayload = ({
  primaryMode = "running",
  historyDateKey = "2026-04-14",
} = {}) => buildPersistedTrainerPayload({
  runtimeState: {
    bodyweights: [],
    goals: [
      buildGoal({
        runtimeId: "goal_running",
        recordId: "goal_running_record",
        summary: "Run a half marathon in 1:45:00",
        category: "running",
        goalFamily: "performance",
        priority: primaryMode === "strength" ? 2 : 1,
        primaryMetric: { key: "half_marathon_time", label: "Half marathon time", targetValue: "1:45:00", unit: "time" },
      }),
      buildGoal({
        runtimeId: "goal_bench",
        recordId: "goal_bench_record",
        summary: "Bench press 225 lb",
        category: "strength",
        goalFamily: "strength",
        priority: primaryMode === "strength" ? 1 : 2,
        targetHorizonWeeks: 16,
        primaryMetric: { key: "bench_press_weight", label: "Bench 1RM", targetValue: "225", unit: "lb" },
      }),
      buildGoal({
        runtimeId: "goal_cut",
        recordId: "goal_cut_record",
        summary: "Get lean for summer",
        category: "body_comp",
        goalFamily: "body_comp",
        priority: 3,
        targetDate: "2026-07-01",
        proxyMetrics: [{ key: "waist", label: "Waist trend", unit: "in" }],
      }),
      {
        id: "g_resilience",
        name: "Resilience & injury prevention",
        category: "injury_prevention",
        priority: 4,
        active: true,
        status: "active",
        resolvedGoal: null,
        tracking: { mode: "progress_tracker" },
      },
    ],
    plannedDayRecords: {
      [historyDateKey]: buildHistoricalPlanEntry(historyDateKey),
    },
    personalization: {
      profile: {
        name: "Taylor",
        timezone: "America/Chicago",
        birthYear: 1994,
        age: 32,
        weight: 188,
        bodyweight: 188,
        height: "6'0\"",
        trainingAgeYears: 3,
        onboardingComplete: true,
        profileSetupComplete: true,
      },
      settings: {
        units: { weight: "lbs", height: "ft_in", distance: "miles" },
        trainingPreferences: { intensityPreference: "Standard", defaultEnvironment: "Gym" },
        appearance: { theme: "System" },
      },
      trainingContext: {
        environment: { value: "gym", confirmed: true, source: "e2e_seed" },
        equipmentAccess: {
          value: "full_gym",
          confirmed: true,
          source: "e2e_seed",
          items: ["barbell", "rack", "bench"],
        },
        sessionDuration: { value: "45", confirmed: true, source: "e2e_seed" },
        intensityPosture: { value: "standard", confirmed: true, source: "e2e_seed" },
      },
      goalManagement: {
        version: 1,
        archivedGoals: [],
        history: [],
      },
    },
    coachPlanAdjustments: DEFAULT_COACH_PLAN_ADJUSTMENTS,
    nutritionFavorites: DEFAULT_NUTRITION_FAVORITES,
  },
});

async function createFrozenPage(browser, {
  fixedIsoString = DEFAULT_FIXED_ISO,
  localCacheSeed = null,
  authSessionSeed = null,
} = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(({ nextFixedIsoString, localCacheKey, payloadSeed, authSession, supabaseUrl, supabaseKey }) => {
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
      window.localStorage.removeItem("trainer_auth_session_v1");
      window.localStorage.removeItem(localCacheKey);
      if (authSession) {
        window.localStorage.setItem("trainer_auth_session_v1", JSON.stringify(authSession));
      }
      if (payloadSeed) {
        window.localStorage.setItem(localCacheKey, JSON.stringify(payloadSeed));
      }
    } catch {}
  }, {
    nextFixedIsoString: fixedIsoString,
    localCacheKey: LOCAL_CACHE_KEY,
    payloadSeed: localCacheSeed,
    authSession: authSessionSeed,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  const page = await context.newPage();
  return { context, page };
}

async function openSeededApp(browser, {
  localCacheSeed,
  fixedIsoString = DEFAULT_FIXED_ISO,
} = {}) {
  const authSessionSeed = makeSession({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "tester@example.com",
  });
  const runtime = await createFrozenPage(browser, {
    localCacheSeed,
    fixedIsoString,
    authSessionSeed,
  });
  const { page } = runtime;
  await mockSupabaseRuntime(page, {
    session: authSessionSeed,
    payload: localCacheSeed,
  });
  await page.goto(`/?e2e=${Date.now()}`);

  const continueLocalMode = page.getByTestId("continue-local-mode");
  if (await continueLocalMode.isVisible().catch(() => false)) {
    await continueLocalMode.click();
  }

  const skipAppleHealth = page.getByRole("button", { name: "Skip for now" });
  if (await skipAppleHealth.isVisible().catch(() => false)) {
    await skipAppleHealth.click({ force: true });
  }

  await expect(page.getByTestId("today-session-card")).toBeVisible();
  return runtime;
}

async function openSettingsBaselines(page) {
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await page.getByTestId("settings-surface-baselines").click();
  await expect(page.getByTestId("settings-baselines-section")).toBeVisible();
  await expect(page.getByTestId("settings-metrics-baselines")).toBeVisible();
}

function currentWeekDayRow(page, dayLabel) {
  return page
    .getByTestId("program-this-week")
    .locator("[data-testid^='program-this-week-session-item-']")
    .filter({ hasText: new RegExp(`\\b${dayLabel}\\b`, "i") })
    .first();
}

function hydrationButton(page) {
  return page.locator(".card").filter({ hasText: "HYDRATION" }).getByRole("button").first();
}

async function readHydrationNumbers(page) {
  const text = await hydrationButton(page).innerText();
  const match = text.match(/(\d+)\s+oz logged[\s\S]*?(?:Target|Suggested)\s+(\d+)\s+oz/i);
  if (!match) {
    throw new Error(`Could not parse hydration text: ${text}`);
  }
  return {
    loggedOz: Number(match[1]),
    targetOz: Number(match[2]),
  };
}

async function expectPersistedAnchor(page, selectPersistedValue, expectedValue) {
  await expect.poll(async () => {
    const cache = await readLocalCache(page);
    return selectPersistedValue(cache);
  }).toEqual(expectedValue);
}

async function saveAnchorEdits(page) {
  await openSettingsBaselines(page);

  await page.getByTestId("metrics-input-bodyweight").fill("182");
  await page.getByTestId("metrics-save-bodyweight").click();
  await expectPersistedAnchor(page, (cache) => ({
    weight: cache?.personalization?.profile?.weight ?? null,
    bodyweight: cache?.personalization?.profile?.bodyweight ?? null,
    value: cache?.personalization?.manualProgressInputs?.measurements?.bodyweight_baseline?.[0]?.value ?? null,
  }), {
    weight: 182,
    bodyweight: 182,
    value: 182,
  });

  await page.getByTestId("metrics-input-waist").fill("33");
  await page.getByTestId("metrics-save-waist").click();
  await expectPersistedAnchor(page, (cache) => (
    cache?.personalization?.manualProgressInputs?.measurements?.waist_circumference?.[0]?.value ?? null
  ), 33);

  await page.getByTestId("metrics-input-lift-exercise").fill("Bench Press");
  await page.getByTestId("metrics-input-lift-weight").fill("225");
  await page.getByTestId("metrics-input-lift-reps").fill("1");
  await page.getByTestId("metrics-save-lift").click();
  await expectPersistedAnchor(page, (cache) => ({
    exercise: cache?.personalization?.manualProgressInputs?.benchmarks?.lift_results?.[0]?.exercise || "",
    weight: cache?.personalization?.manualProgressInputs?.benchmarks?.lift_results?.[0]?.weight ?? null,
    reps: cache?.personalization?.manualProgressInputs?.benchmarks?.lift_results?.[0]?.reps ?? null,
    sets: cache?.personalization?.manualProgressInputs?.benchmarks?.lift_results?.[0]?.sets ?? null,
  }), {
    exercise: "Bench Press",
    weight: 225,
    reps: 1,
    sets: 1,
  });

  await page.getByTestId("metrics-input-run-distance").fill("9");
  await page.getByTestId("metrics-input-run-duration").fill("78");
  await page.getByTestId("metrics-input-run-pace").fill("8:40");
  await page.getByTestId("metrics-save-run").click();
  await expectPersistedAnchor(page, (cache) => ({
    distanceMiles: cache?.personalization?.manualProgressInputs?.benchmarks?.run_results?.[0]?.distanceMiles ?? null,
    durationMinutes: cache?.personalization?.manualProgressInputs?.benchmarks?.run_results?.[0]?.durationMinutes || "",
    paceText: cache?.personalization?.manualProgressInputs?.benchmarks?.run_results?.[0]?.paceText || "",
  }), {
    distanceMiles: 9,
    durationMinutes: "78",
    paceText: "8:40",
  });

  return readLocalCache(page);
}

async function openPastSavedDayReview(page, dateKey) {
  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
  const reviewDisclosure = page.getByTestId("log-day-review-disclosure");
  await reviewDisclosure.getByText("Saved day review", { exact: true }).click();
  await reviewDisclosure.locator("select").selectOption(dateKey);
  const reviewCard = reviewDisclosure.locator("[data-testid='history-day-review-card']").first();
  await expect(reviewCard).toBeVisible();
  return reviewCard;
}

test.describe("settings anchor trust path", () => {
  test("running-focused anchor edits change future run and nutrition prescriptions without rewriting history", async ({ browser }) => {
    const fixedIsoString = "2026-04-16T12:00:00.000Z";
    const historyDateKey = "2026-04-14";
    const originalPayload = buildSeedPayload({ primaryMode: "running", historyDateKey });
    const originalHistoryEntry = originalPayload.plannedDayRecords[historyDateKey];

    const baselineRuntime = await openSeededApp(browser, { localCacheSeed: originalPayload, fixedIsoString });
    const { page: baselinePage } = baselineRuntime;

    await baselinePage.getByTestId("app-tab-program").click();
    await expect(baselinePage.getByTestId("program-tab")).toBeVisible();
    const baselineSatRow = currentWeekDayRow(baselinePage, "Sat");
    await expect(baselineSatRow).toBeVisible();
    const baselineSatText = normalizeSurfaceText(await baselineSatRow.innerText());
    expect(baselineSatText).toMatch(/long run build/i);
    expect(baselineSatText).toMatch(/35-45 min/i);

    await baselinePage.getByTestId("app-tab-nutrition").click();
    await expect(baselinePage.getByTestId("nutrition-tab")).toBeVisible();
    const baselineHydration = await readHydrationNumbers(baselinePage);

    const editedPayload = await saveAnchorEdits(baselinePage);
    await baselineRuntime.context.close();

    const reopenedRuntime = await openSeededApp(browser, { localCacheSeed: editedPayload, fixedIsoString });
    const { page } = reopenedRuntime;

    await openSettingsBaselines(page);
    await expect(page.getByTestId("metrics-card-bodyweight")).toContainText(/182\.0 lb/i);
    await expect(page.getByTestId("metrics-card-bodyweight")).toContainText(/saved by you/i);
    await expect(page.getByTestId("metrics-card-provenance-bodyweight")).toContainText(/manual baseline edit/i);
    await expect(page.getByTestId("metrics-card-waist")).toContainText(/33\.0 in/i);
    await expect(page.getByTestId("metrics-card-waist")).toContainText(/saved by you/i);
    await expect(page.getByTestId("metrics-card-provenance-waist")).toContainText(/manual baseline edit/i);
    await expect(page.getByTestId("metrics-card-lift_benchmark")).toContainText(/Bench Press/i);
    await expect(page.getByTestId("metrics-card-lift_benchmark")).toContainText(/225 x 1/i);
    await expect(page.getByTestId("metrics-card-lift_benchmark")).toContainText(/saved by you/i);
    await expect(page.getByTestId("metrics-card-provenance-lift_benchmark")).toContainText(/current strength baseline/i);
    await expect(page.getByTestId("metrics-card-run_benchmark")).toContainText(/9 mi/i);
    await expect(page.getByTestId("metrics-card-run_benchmark")).toContainText(/8:40/i);
    await expect(page.getByTestId("metrics-card-run_benchmark")).toContainText(/saved by you/i);
    await expect(page.getByTestId("metrics-card-provenance-run_benchmark")).toContainText(/running baseline/i);

    const reopenedCache = await readLocalCache(page);
    expect(reopenedCache?.personalization?.profile?.weight).toBe(182);
    expect(reopenedCache?.personalization?.profile?.bodyweight).toBe(182);
    expect(reopenedCache?.plannedDayRecords?.[historyDateKey]).toEqual(originalHistoryEntry);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    const adaptedSatRow = currentWeekDayRow(page, "Sat");
    await expect(adaptedSatRow).toBeVisible();
    const adaptedSatText = normalizeSurfaceText(await adaptedSatRow.innerText());

    expect(adaptedSatText).not.toBe(baselineSatText);
    expect(adaptedSatText).toMatch(/\blong run\b/i);
    expect(adaptedSatText).not.toMatch(/build/i);
    expect(adaptedSatText).toMatch(/60-80 min/i);

    await adaptedSatRow.locator("[data-testid^='program-this-week-session-button-']").click();
    await expect(page.getByTestId("program-this-week-session-detail-panel")).toContainText(/60-80 min/i);

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();
    const adaptedHydration = await readHydrationNumbers(page);
    expect(adaptedHydration.targetOz).toBeLessThan(baselineHydration.targetOz);

    const dayReview = await openPastSavedDayReview(page, historyDateKey);
    await expect(dayReview.getByTestId("history-day-review-primary")).toContainText("Tempo Intervals");
    await expect(dayReview.getByTestId("history-day-review-primary")).toContainText("3 x 8 min");
    await expect(dayReview).toContainText("Tempo Intervals");

    await reopenedRuntime.context.close();
  });

  test("strength-focused anchor edits change future strength dosing without rewriting history", async ({ browser }) => {
    const fixedIsoString = "2026-04-15T12:00:00.000Z";
    const historyDateKey = "2026-04-13";
    const originalPayload = buildSeedPayload({ primaryMode: "strength", historyDateKey });
    const originalHistoryEntry = originalPayload.plannedDayRecords[historyDateKey];

    const baselineRuntime = await openSeededApp(browser, { localCacheSeed: originalPayload, fixedIsoString });
    const { page: baselinePage } = baselineRuntime;

    await baselinePage.getByTestId("app-tab-program").click();
    await expect(baselinePage.getByTestId("program-tab")).toBeVisible();
    const baselineFutureWeekCard = baselinePage.getByTestId("program-future-weeks")
      .locator("div[data-testid^='program-future-week-card-']")
      .first();
    await baselineFutureWeekCard.locator("[data-testid^='program-future-week-toggle-']").click();
    const baselineFutureRows = baselineFutureWeekCard.locator("[data-testid^='program-future-week-session-item-']");
    await expect(baselineFutureRows.first()).toBeVisible();
    const baselineFutureFirstButton = baselineFutureRows.first().locator("[data-testid^='program-future-week-session-button-']");
    await baselineFutureFirstButton.click();
    const baselineFutureDetail = baselineFutureWeekCard.getByTestId("program-future-week-session-detail-panel");
    await expect(baselineFutureDetail.getByTestId("planned-session-plan")).toBeVisible();
    const baselineFutureText = normalizeSurfaceText(await baselineFutureDetail.innerText());
    expect(baselineFutureText).toMatch(/30-40 min/i);

    const editedPayload = await saveAnchorEdits(baselinePage);
    await baselineRuntime.context.close();

    const reopenedRuntime = await openSeededApp(browser, { localCacheSeed: editedPayload, fixedIsoString });
    const { page } = reopenedRuntime;

    await openSettingsBaselines(page);
    await expect(page.getByTestId("metrics-card-lift_benchmark")).toContainText(/Bench Press/i);
    await expect(page.getByTestId("metrics-card-lift_benchmark")).toContainText(/225 x 1/i);
    await expect(page.getByTestId("metrics-card-lift_benchmark")).toContainText(/saved by you/i);
    await expect(page.getByTestId("metrics-card-provenance-lift_benchmark")).toContainText(/current strength baseline/i);

    const reopenedCache = await readLocalCache(page);
    expect(reopenedCache?.plannedDayRecords?.[historyDateKey]).toEqual(originalHistoryEntry);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    const adaptedFutureWeekCard = page.getByTestId("program-future-weeks")
      .locator("div[data-testid^='program-future-week-card-']")
      .first();
    await adaptedFutureWeekCard.locator("[data-testid^='program-future-week-toggle-']").click();
    const adaptedFutureRows = adaptedFutureWeekCard.locator("[data-testid^='program-future-week-session-item-']");
    await expect(adaptedFutureRows.first()).toBeVisible();
    const adaptedFutureFirstButton = adaptedFutureRows.first().locator("[data-testid^='program-future-week-session-button-']");
    await adaptedFutureFirstButton.click();
    const adaptedFutureDetail = adaptedFutureWeekCard.getByTestId("program-future-week-session-detail-panel");
    await expect(adaptedFutureDetail.getByTestId("planned-session-plan")).toBeVisible();
    const adaptedFutureText = normalizeSurfaceText(await adaptedFutureDetail.innerText());
    expect(adaptedFutureText).not.toBe(baselineFutureText);
    expect(adaptedFutureText).toMatch(/45-60 min/i);
    await expect(adaptedFutureDetail).toContainText(/45-60 min top set \+ backoff strength/i);

    const dayReview = await openPastSavedDayReview(page, historyDateKey);
    await expect(dayReview.getByTestId("history-day-review-primary")).toContainText("Tempo Intervals");

    await reopenedRuntime.context.close();
  });
});
