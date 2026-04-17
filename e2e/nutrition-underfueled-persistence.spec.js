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

async function logUnderFueledDay(page, dateKey) {
  const note = `Under-fueled e2e ${dateKey}`;
  const quickLog = page.getByTestId("nutrition-quick-log");

  await page.getByTestId("nutrition-log-date-select").selectOption(dateKey);
  await expect(page.getByTestId("nutrition-log-date-label")).toContainText(/\w{3}, \w{3} \d{1,2}/);

  await quickLog.getByRole("button", { name: "Under-fueled" }).click();
  await quickLog.getByRole("button", { name: "Hunger" }).click();
  await quickLog.getByPlaceholder("Quick note (optional)").fill(note);
  await page.getByTestId("nutrition-save-quick").click();

  await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);
  await expect.poll(async () => {
    const cache = await readLocalCache(page);
    return {
      deviationKind: cache?.nutritionActualLogs?.[dateKey]?.deviationKind || "",
      issue: cache?.nutritionActualLogs?.[dateKey]?.issue || "",
      note: cache?.nutritionActualLogs?.[dateKey]?.note || "",
    };
  }).toEqual({
    deviationKind: "under_fueled",
    issue: "hunger",
    note,
  });

  return note;
}

function currentWeekDayRow(page, dayLabel) {
  return page
    .getByTestId("program-this-week")
    .locator("[data-testid^='program-this-week-session-item-']")
    .filter({ hasText: new RegExp(`\\b${dayLabel}\\b`, "i") })
    .first();
}

test.describe("nutrition persistence and fuel protection", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
    await freezeBrowserDate(page, "2026-04-16T12:00:00.000Z");
  });

  test("under-fueled days persist across reload and soften the next quality session with one consistent reason line", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();

    const baselineSaturdayRow = currentWeekDayRow(page, "Sat");
    await expect(baselineSaturdayRow).toBeVisible();
    const baselineSaturdayText = normalizeSurfaceText(await baselineSaturdayRow.innerText());
    expect(baselineSaturdayText).not.toMatch(/capped/i);
    await expect(page.getByTestId("program-change-summary")).not.toContainText(/fueling stabilizes/i);

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();

    const loggedNotes = {};
    for (const dateKey of ["2026-04-13", "2026-04-14", "2026-04-15"]) {
      loggedNotes[dateKey] = await logUnderFueledDay(page, dateKey);
    }

    await page.reload();
    await expect(page.getByTestId("today-session-card")).toBeVisible();

    const persistedCache = await readLocalCache(page);
    for (const dateKey of Object.keys(loggedNotes)) {
      expect(persistedCache?.nutritionActualLogs?.[dateKey]?.deviationKind).toBe("under_fueled");
      expect(persistedCache?.nutritionActualLogs?.[dateKey]?.issue).toBe("hunger");
      expect(persistedCache?.nutritionActualLogs?.[dateKey]?.note).toBe(loggedNotes[dateKey]);
    }

    await page.getByTestId("app-tab-nutrition").click();
    await page.getByTestId("nutrition-log-date-select").selectOption("2026-04-14");
    await expect(
      page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
    ).toHaveValue(loggedNotes["2026-04-14"]);

    await page.getByTestId("app-tab-today").click();
    const todayReason = normalizeSurfaceText(await page.getByTestId("today-change-summary").innerText());
    expect(todayReason).toMatch(/fueling stabilizes/i);

    await page.getByTestId("app-tab-program").click();
    const programReason = normalizeSurfaceText(await page.getByTestId("program-change-summary").innerText());
    expect(programReason).toBe(todayReason);

    const adaptedSaturdayRow = currentWeekDayRow(page, "Sat");
    await expect(adaptedSaturdayRow).toBeVisible();
    const adaptedSaturdayText = normalizeSurfaceText(await adaptedSaturdayRow.innerText());
    expect(adaptedSaturdayText).not.toBe(baselineSaturdayText);
    expect(adaptedSaturdayText).toMatch(/capped|steady/i);

    await adaptedSaturdayRow.locator("[data-testid^='program-this-week-session-button-']").click();
    await expect(page.getByTestId("program-this-week-session-detail-panel")).toContainText(/long run \(capped\)|keep the run fully aerobic/i);

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();
    await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
    const logReason = normalizeSurfaceText(await page.getByTestId("log-canonical-reason").innerText());
    expect(logReason).toBe(todayReason);

    await page.getByTestId("app-tab-nutrition").click();
    const nutritionReason = normalizeSurfaceText(await page.getByTestId("nutrition-canonical-reason").innerText());
    expect(nutritionReason).toBe(todayReason);

    await page.getByTestId("app-tab-coach").click();
    const coachReason = normalizeSurfaceText(await page.getByTestId("coach-canonical-reason").innerText());
    expect(coachReason).toBe(todayReason);
  });
});
