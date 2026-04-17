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

const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
const VIEWPORT = { width: 1366, height: 960 };

async function createFrozenPage(browser, { fixedIsoString, localCacheSeed = null } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(({ fixedIsoString: nextFixedIsoString, localCacheKey, payloadSeed }) => {
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

    try {
      window.localStorage.removeItem(localCacheKey);
      if (payloadSeed) {
        window.localStorage.setItem(localCacheKey, JSON.stringify(payloadSeed));
      }
    } catch {}
  }, {
    fixedIsoString,
    localCacheKey: LOCAL_CACHE_KEY,
    payloadSeed: localCacheSeed,
  });
  const page = await context.newPage();
  return { context, page };
}

async function openSeededApp(browser, { fixedIsoString, localCacheSeed }) {
  const runtime = await createFrozenPage(browser, { fixedIsoString, localCacheSeed });
  const { page } = runtime;
  await page.goto(`/?e2e=${Date.now()}`);

  const continueLocalMode = page.getByTestId("continue-local-mode");
  if (await continueLocalMode.isVisible().catch(() => false)) {
    await continueLocalMode.click();
  }

  await expect(page.getByTestId("today-session-card")).toBeVisible();
  return runtime;
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
  expectedStatusText = /saved/i,
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
  await expect(page.getByTestId("today-save-status")).toContainText(expectedStatusText);
}

async function expectPersistedWorkoutLog(page, {
  dateKey,
  status,
  feel = null,
  note = "",
} = {}) {
  await expect.poll(async () => {
    const cache = await readLocalCache(page);
    return {
      dailyStatus: cache?.dailyCheckins?.[dateKey]?.status || "",
      dailyFeel: cache?.dailyCheckins?.[dateKey]?.sessionFeel || "",
      dailyNote: cache?.dailyCheckins?.[dateKey]?.note || "",
      logStatus: cache?.logs?.[dateKey]?.actualSession?.status || "",
      logFeel: cache?.logs?.[dateKey]?.checkin?.sessionFeel || "",
      logNote: cache?.logs?.[dateKey]?.checkin?.note || "",
    };
  }).toEqual({
    dailyStatus: status,
    dailyFeel: feel || "",
    dailyNote: note,
    logStatus: status,
    logFeel: feel || "",
    logNote: note,
  });
}

async function expectQuickLogNote(page, note) {
  await page.getByTestId("app-tab-today").click();
  await expect(page.getByTestId("today-quick-log").getByPlaceholder("Optional note")).toHaveValue(note);
}

async function openDetailedWorkoutLog(page) {
  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
  await page.getByRole("button", { name: /open full detail entry/i }).click();
  await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
}

async function expectReasonAcrossSurfaces(page, pattern) {
  await page.getByTestId("app-tab-today").click();
  await expect(page.getByTestId("today-change-summary")).toContainText(pattern);

  await page.getByTestId("app-tab-program").click();
  await expect(page.getByTestId("program-change-summary")).toContainText(pattern);

  await openDetailedWorkoutLog(page);
  await expect(page.getByTestId("log-canonical-reason")).toContainText(pattern);

  await page.getByTestId("app-tab-nutrition").click();
  await expect(page.getByTestId("nutrition-canonical-reason")).toContainText(pattern);

  await page.getByTestId("app-tab-coach").click();
  await expect(page.getByTestId("coach-canonical-reason")).toContainText(pattern);
}

function currentWeekDayRow(page, dayLabel) {
  return page
    .getByTestId("program-this-week")
    .locator("[data-testid^='program-this-week-session-item-']")
    .filter({ hasText: new RegExp(`\\b${dayLabel}\\b`, "i") })
    .first();
}

async function readCurrentWeekRowTexts(page) {
  const rows = page.getByTestId("program-this-week").locator("[data-testid^='program-this-week-session-item-']");
  const count = await rows.count();
  const texts = [];
  for (let index = 0; index < count; index += 1) {
    texts.push(normalizeSurfaceText(await rows.nth(index).innerText()));
  }
  return texts;
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("workout adaptation persistence", () => {
  test("a skipped key session is carried forward after persistence and reopen", async ({ browser }) => {
    const onboardingRuntime = await createFrozenPage(browser, { fixedIsoString: "2026-04-15T12:00:00.000Z" });
    const { page: onboardingPage } = onboardingRuntime;

    await completeRunningOnboarding(onboardingPage);
    const baselinePayload = await readLocalCache(onboardingPage);

    await onboardingPage.getByTestId("app-tab-program").click();
    const initialRows = await readCurrentWeekRowTexts(onboardingPage);
    expect(initialRows).toEqual(expect.arrayContaining([
      expect.stringMatching(/mon .*easy aerobic run/i),
      expect.stringMatching(/wed .*tempo run/i),
      expect.stringMatching(/sat .*long run/i),
    ]));

    const skipNote = "Skipped tempo because travel ran long";
    await saveTodayQuickLog(onboardingPage, {
      statusLabel: "skipped",
      note: skipNote,
      expectedStatusText: /marked skipped/i,
    });
    await expectPersistedWorkoutLog(onboardingPage, {
      dateKey: "2026-04-15",
      status: "skipped",
      note: skipNote,
    });
    const skippedPayload = await readLocalCache(onboardingPage);
    await onboardingRuntime.context.close();

    const sameDayRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-15T12:00:00.000Z",
      localCacheSeed: skippedPayload,
    });
    await expectPersistedWorkoutLog(sameDayRuntime.page, {
      dateKey: "2026-04-15",
      status: "skipped",
      note: skipNote,
    });
    await expectQuickLogNote(sameDayRuntime.page, skipNote);
    await sameDayRuntime.context.close();

    const baselineFutureRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      localCacheSeed: baselinePayload,
    });
    await baselineFutureRuntime.page.getByTestId("app-tab-program").click();
    const baselineFutureRows = await readCurrentWeekRowTexts(baselineFutureRuntime.page);
    expect(baselineFutureRows).toEqual(expect.arrayContaining([
      expect.stringMatching(/wed .*tempo run/i),
      expect.stringMatching(/sat .*long run/i),
    ]));
    await baselineFutureRuntime.context.close();

    const adaptedFutureRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      localCacheSeed: skippedPayload,
    });
    const { page } = adaptedFutureRuntime;
    await expectPersistedWorkoutLog(page, {
      dateKey: "2026-04-15",
      status: "skipped",
      note: skipNote,
    });
    await expectReasonAcrossSurfaces(page, /carried forward/i);

    await page.getByTestId("app-tab-program").click();
    const adaptedRows = await readCurrentWeekRowTexts(page);
    expect(adaptedRows).toEqual(expect.arrayContaining([
      expect.stringMatching(/fri .*tempo run/i),
      expect.stringMatching(/sat .*long run/i),
    ]));
    expect(adaptedRows.join(" | ")).not.toMatch(/wed .*tempo run/i);
    expect(adaptedRows).not.toEqual(baselineFutureRows);

    const carriedForwardRow = currentWeekDayRow(page, "Fri");
    await expect(carriedForwardRow).toContainText(/tempo run/i);
    await carriedForwardRow.locator("[data-testid^='program-this-week-session-button-']").click();
    await expect(page.getByTestId("program-this-week-session-detail-panel")).toContainText(/tempo|quality/i);

    await adaptedFutureRuntime.context.close();
  });

  test("repeated harder-than-expected sessions persist and cap the next exposure", async ({ browser }) => {
    const onboardingRuntime = await createFrozenPage(browser, { fixedIsoString: "2026-04-08T12:00:00.000Z" });
    const { page: onboardingPage } = onboardingRuntime;

    await completeRunningOnboarding(onboardingPage);
    const baselinePayload = await readLocalCache(onboardingPage);

    const firstHardNote = "Session had to be shortened after the quality work";
    await saveTodayQuickLog(onboardingPage, {
      statusLabel: "completed modified",
      feelLabel: "harder than expected",
      note: firstHardNote,
      expectedStatusText: /marked complete with changes/i,
    });
    await expectPersistedWorkoutLog(onboardingPage, {
      dateKey: "2026-04-08",
      status: "completed_modified",
      feel: "harder_than_expected",
      note: firstHardNote,
    });
    const firstHardPayload = await readLocalCache(onboardingPage);
    await onboardingRuntime.context.close();

    const firstSameDayRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-08T12:00:00.000Z",
      localCacheSeed: firstHardPayload,
    });
    await expectPersistedWorkoutLog(firstSameDayRuntime.page, {
      dateKey: "2026-04-08",
      status: "completed_modified",
      feel: "harder_than_expected",
      note: firstHardNote,
    });
    await expectQuickLogNote(firstSameDayRuntime.page, firstHardNote);
    await firstSameDayRuntime.context.close();

    const secondLogRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-11T12:00:00.000Z",
      localCacheSeed: firstHardPayload,
    });
    const secondHardNote = "Long run got cut back because the legs never came around";
    await saveTodayQuickLog(secondLogRuntime.page, {
      statusLabel: "completed modified",
      feelLabel: "harder than expected",
      note: secondHardNote,
      expectedStatusText: /marked complete with changes/i,
    });
    await expectPersistedWorkoutLog(secondLogRuntime.page, {
      dateKey: "2026-04-11",
      status: "completed_modified",
      feel: "harder_than_expected",
      note: secondHardNote,
    });
    const repeatedHardPayload = await readLocalCache(secondLogRuntime.page);
    await secondLogRuntime.context.close();

    const secondSameDayRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-11T12:00:00.000Z",
      localCacheSeed: repeatedHardPayload,
    });
    await expectPersistedWorkoutLog(secondSameDayRuntime.page, {
      dateKey: "2026-04-11",
      status: "completed_modified",
      feel: "harder_than_expected",
      note: secondHardNote,
    });
    await expectQuickLogNote(secondSameDayRuntime.page, secondHardNote);
    await secondSameDayRuntime.context.close();

    const baselineFutureRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-14T12:00:00.000Z",
      localCacheSeed: baselinePayload,
    });
    await baselineFutureRuntime.page.getByTestId("app-tab-program").click();
    const baselineWednesdayRow = currentWeekDayRow(baselineFutureRuntime.page, "Wed");
    const baselineWednesdayText = normalizeSurfaceText(await baselineWednesdayRow.innerText());
    expect(baselineWednesdayText).toMatch(/tempo run/i);
    expect(baselineWednesdayText).not.toMatch(/capped/i);
    await expect(baselineFutureRuntime.page.getByTestId("program-change-summary")).not.toContainText(/volume was capped/i);
    await baselineFutureRuntime.context.close();

    const adaptedFutureRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-14T12:00:00.000Z",
      localCacheSeed: repeatedHardPayload,
    });
    const { page } = adaptedFutureRuntime;
    await expectPersistedWorkoutLog(page, {
      dateKey: "2026-04-08",
      status: "completed_modified",
      feel: "harder_than_expected",
      note: firstHardNote,
    });
    await expectPersistedWorkoutLog(page, {
      dateKey: "2026-04-11",
      status: "completed_modified",
      feel: "harder_than_expected",
      note: secondHardNote,
    });
    await expectReasonAcrossSurfaces(page, /volume was capped/i);

    await page.getByTestId("app-tab-program").click();
    const adaptedWednesdayRow = currentWeekDayRow(page, "Wed");
    const adaptedWednesdayText = normalizeSurfaceText(await adaptedWednesdayRow.innerText());
    expect(adaptedWednesdayText).toMatch(/steady run \(capped\)/i);
    expect(adaptedWednesdayText).not.toBe(baselineWednesdayText);

    await adaptedWednesdayRow.locator("[data-testid^='program-this-week-session-button-']").click();
    await expect(page.getByTestId("program-this-week-session-detail-panel")).toContainText(/hold intensity below threshold until recovery stabilizes/i);

    await adaptedFutureRuntime.context.close();
  });
});
