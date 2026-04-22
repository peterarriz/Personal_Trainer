const { test, expect } = require("@playwright/test");

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
      window.localStorage.setItem("trainer_debug", "1");
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

async function openDetailedWorkoutLog(page) {
  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
  await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
}

async function saveWorkoutLog(page, {
  outcome = "completed",
  feelChip = "",
  note = "",
  makeRunChange = false,
} = {}) {
  await openDetailedWorkoutLog(page);
  await page.getByTestId(`log-completion-${outcome}`).click();
  if (feelChip) {
    await page.getByTestId(feelChip).click();
  }
  if (makeRunChange && await page.getByTestId("log-run-duration").count()) {
    const runDuration = page.getByTestId("log-run-duration");
    const currentValue = Number.parseFloat(await runDuration.inputValue()) || 0;
    await runDuration.fill(String(Math.max(1, currentValue + 2)));
  }
  const advancedFields = page.getByTestId("log-advanced-fields");
  if (!await advancedFields.evaluate((node) => node.open)) {
    await advancedFields.locator("summary").click();
  }
  if (note) {
    await page.getByLabel("Session note").fill(note);
  }
  await page.getByTestId("log-save-quick").click();
  await expect(page.getByTestId("log-save-status")).toContainText(/saved/i);
}

async function expectWorkoutLogNote(page, note) {
  await openDetailedWorkoutLog(page);
  const advancedFields = page.getByTestId("log-advanced-fields");
  if (!await advancedFields.evaluate((node) => node.open)) {
    await advancedFields.locator("summary").click();
  }
  await expect(page.getByLabel("Session note")).toHaveValue(note);
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

test.describe("workout log persistence across reopen", () => {
  test("skipped workout stays intact across same-day and next-day reopen", async ({ browser }) => {
    const onboardingRuntime = await createFrozenPage(browser, { fixedIsoString: "2026-04-16T12:00:00.000Z" });
    const { page: onboardingPage } = onboardingRuntime;

    await completeRunningOnboarding(onboardingPage);

    const skipNote = "Skipped because travel ran long";
    await saveWorkoutLog(onboardingPage, {
      outcome: "skipped",
      note: skipNote,
    });
    await expectPersistedWorkoutLog(onboardingPage, {
      dateKey: "2026-04-16",
      status: "skipped",
      feel: "about_right",
      note: skipNote,
    });
    const skippedPayload = await readLocalCache(onboardingPage);
    await onboardingRuntime.context.close();

    const sameDayRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-16T12:00:00.000Z",
      localCacheSeed: skippedPayload,
    });
    await expectPersistedWorkoutLog(sameDayRuntime.page, {
      dateKey: "2026-04-16",
      status: "skipped",
      feel: "about_right",
      note: skipNote,
    });
    await expectWorkoutLogNote(sameDayRuntime.page, skipNote);
    await sameDayRuntime.context.close();

    const nextDayRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-17T12:00:00.000Z",
      localCacheSeed: skippedPayload,
    });
    const { page } = nextDayRuntime;
    await expectPersistedWorkoutLog(page, {
      dateKey: "2026-04-16",
      status: "skipped",
      feel: "about_right",
      note: skipNote,
    });
    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-this-week")).toContainText(/Missed|Adjusted|Recovery|Long Run/i);
    const missedRow = page
      .getByTestId("program-this-week")
      .locator("[data-testid^='program-this-week-session-item-']")
      .filter({ hasText: /Missed/i })
      .first();
    if (await missedRow.count()) {
      await missedRow.locator("[data-testid^='program-this-week-session-button-']").click();
      await expect(page.getByTestId("program-this-week-session-detail-panel")).toContainText(/Missed|Open Log/i);
    }
    await nextDayRuntime.context.close();
  });

  test("modified harder-than-expected logs survive reloads without losing either day", async ({ browser }) => {
    const firstRuntime = await createFrozenPage(browser, { fixedIsoString: "2026-04-08T12:00:00.000Z" });
    const { page: firstPage } = firstRuntime;

    await completeRunningOnboarding(firstPage);

    const firstHardNote = "Session had to be shortened after the quality work";
    await saveWorkoutLog(firstPage, {
      outcome: "completed",
      feelChip: "log-feel-chip-2",
      note: firstHardNote,
    });
    const firstPayload = await readLocalCache(firstPage);
    const firstStatus = firstPayload?.dailyCheckins?.["2026-04-08"]?.status || "";
    await expectPersistedWorkoutLog(firstPage, {
      dateKey: "2026-04-08",
      status: firstStatus,
      feel: "harder_than_expected",
      note: firstHardNote,
    });
    await firstRuntime.context.close();

    const secondRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-11T12:00:00.000Z",
      localCacheSeed: firstPayload,
    });
    const secondHardNote = "Long run got cut back because the legs never came around";
    await saveWorkoutLog(secondRuntime.page, {
      outcome: "completed",
      feelChip: "log-feel-chip-2",
      note: secondHardNote,
      makeRunChange: true,
    });
    const repeatedHardPayload = await readLocalCache(secondRuntime.page);
    const secondStatus = repeatedHardPayload?.dailyCheckins?.["2026-04-11"]?.status || "";
    await expectPersistedWorkoutLog(secondRuntime.page, {
      dateKey: "2026-04-11",
      status: secondStatus,
      feel: "harder_than_expected",
      note: secondHardNote,
    });
    await secondRuntime.context.close();

    const futureRuntime = await openSeededApp(browser, {
      fixedIsoString: "2026-04-14T12:00:00.000Z",
      localCacheSeed: repeatedHardPayload,
    });
    const { page } = futureRuntime;
    await expectPersistedWorkoutLog(page, {
      dateKey: "2026-04-08",
      status: firstStatus,
      feel: "harder_than_expected",
      note: firstHardNote,
    });
    await expectPersistedWorkoutLog(page, {
      dateKey: "2026-04-11",
      status: secondStatus,
      feel: "harder_than_expected",
      note: secondHardNote,
    });

    await openDetailedWorkoutLog(page);
    await expect(page.getByTestId("planned-session-plan")).toBeVisible();

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-this-week")).toBeVisible();
    const rows = page.getByTestId("program-this-week").locator("[data-testid^='program-this-week-session-item-']");
    expect(await rows.count()).toBeGreaterThan(3);
    await expect(page.getByTestId("program-change-summary")).toBeVisible();
    await expect(page.getByTestId("program-change-summary")).not.toHaveText("");
    await futureRuntime.context.close();
  });
});
