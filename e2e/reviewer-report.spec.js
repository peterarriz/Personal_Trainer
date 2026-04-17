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
  const quickLog = page.getByTestId("today-quick-log");
  await page.getByTestId("app-tab-today").click();
  await expect(quickLog).toBeVisible();
  await quickLog.getByRole("button", { name: new RegExp(`^${String(statusLabel || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).click();
  if (note) {
    await quickLog.getByPlaceholder("Optional note").fill(note);
  }
  await page.getByTestId("today-save-log").click();
  await expect(page.getByTestId("today-save-status")).toContainText(/saved|marked/i);
}

test.describe("reviewer report export", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("settings generates a user-facing reviewer report with week summaries and plan evolution fields", async ({ page }) => {
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
    await page.getByTestId("settings-account-advanced").locator("summary").click();

    await expect(page.getByTestId("settings-reviewer-report-card")).toBeVisible();
    await page.getByTestId("settings-reviewer-report-generate").click();
    await expect(page.getByTestId("settings-reviewer-report-status")).toContainText(/Generated/i);

    const markdown = await page.getByTestId("settings-reviewer-report-textarea").inputValue();
    expect(markdown).toContain("# Plan History Reviewer Report");
    expect(markdown).toContain("## Week Summaries");
    expect(markdown).toContain("Planned summary:");
    expect(markdown).toContain("## Day-Level Plan Evolution");
    expect(markdown).toContain("Original prescription:");
    expect(markdown).toContain("Latest prescription:");
    expect(markdown).toContain("Actual log:");
    expect(markdown).toContain("Revision count:");
  });
});
