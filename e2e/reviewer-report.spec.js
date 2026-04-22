const { test, expect } = require("@playwright/test");

const {
  gotoIntakeInLocalMode,
  completeIntroQuestionnaire,
  completeAnchors,
  waitForReview,
  confirmIntakeBuild,
  waitForPostOnboarding,
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

async function saveTodayQuickLog(page, {
  statusLabel,
  note = "",
} = {}) {
  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
  const normalizedStatus = String(statusLabel || "").trim().toLowerCase();
  const completionTestId = normalizedStatus.includes("skipped")
    ? "log-completion-skipped"
    : normalizedStatus.includes("swapped")
    ? "log-completion-swapped"
    : normalizedStatus.includes("partial")
    ? "log-completion-partial"
    : "log-completion-completed";
  await page.getByTestId(completionTestId).click();
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

test.describe("history export tooling", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("consumer settings do not expose internal history export tooling", async ({ page }) => {
    await freezeBrowserDate(page, "2026-04-17T12:00:00.000Z");
    await completeRunningOnboarding(page);
    await saveTodayQuickLog(page, {
      statusLabel: "skipped",
      note: "Travel ran long",
    });

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-account").click();
    await expect(page.getByTestId("settings-account-section")).toBeVisible();
    await page.getByTestId("settings-account-advanced").locator("summary").first().click();
    await expect(page.getByTestId("settings-reviewer-report-card")).toHaveCount(0);
  });
});
