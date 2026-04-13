const { test, expect } = require("@playwright/test");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  gotoIntakeInLocalMode,
  waitForReview,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");

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

test.describe("mobile surface simplification", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("today is action-first, program is read-first, and settings owns plan management", async ({ page }) => {
    await completeRunningOnboarding(page);

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-session-card")).toBeVisible();
    await expect(page.getByTestId("today-quick-log")).toBeVisible();
    await expect(page.getByTestId("today-save-log")).toBeVisible();

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-this-week")).toBeVisible();
    await expect(page.getByTestId("program-future-weeks")).toBeVisible();
    await expect(page.getByText("Manage plan settings")).toBeVisible();
    await expect(page.getByText("PROGRAMS + STYLES").first()).not.toBeVisible();
    await expect(page.getByText("Refine Current Goal").first()).not.toBeVisible();
    await expect(page.getByText("Start New Goal Arc").first()).not.toBeVisible();

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await expect(page.getByTestId("settings-plan-management")).toBeVisible();
    await expect(page.getByText("Programs and styles")).toBeVisible();
    await expect(page.getByText("Goal changes", { exact: true })).toBeVisible();
    await expect(page.getByText("Integrations and imports")).toBeVisible();
    await expect(page.getByText("Apple Health").first()).not.toBeVisible();
    await expect(page.getByText("Garmin Connect").first()).not.toBeVisible();
  });

  test("workout and nutrition logging show strong saved state on mobile", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();
    await page.getByTestId("log-complete-prescribed").click();
    await expect(page.getByTestId("log-save-status")).toContainText("Saved");

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();
    await page.getByTestId("nutrition-save-quick").click();
    await expect(page.getByTestId("nutrition-save-status")).toContainText("Saved");
  });

  test("training preference changes are visible on Program and Today", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByRole("button", { name: /Aggressive/i }).first().click();

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-change-summary")).toContainText("Aggressive preference");

    await page.getByTestId("app-tab-today").click();
    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-change-summary")).toContainText("Aggressive preference");
  });

  test("coach stays focused on conversation and decisions, not configuration", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-coach").click();
    await expect(page.getByTestId("coach-tab")).toBeVisible();
    await expect(page.getByTestId("coach-primary-entry")).toBeVisible();
    await expect(page.getByText("Open advanced settings")).toBeVisible();
    await expect(page.getByPlaceholder("Anthropic key (optional)").first()).not.toBeVisible();
    await expect(page.getByPlaceholder("Failure patterns").first()).not.toBeVisible();

    await page.getByText("I'm traveling today").click();
    await expect.poll(async () => {
      return page.locator("[data-testid='coach-primary-entry'] .coach-copy").count();
    }).toBeGreaterThan(0);
  });
});
