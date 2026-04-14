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

test.describe("program inline session detail", () => {
  test("program labels the visible planning window as the next 3 months", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    await expect(page.getByTestId("program-future-weeks")).toContainText("NEXT 3 MONTHS");
    await expect(page.getByTestId("program-future-weeks")).toContainText("visible planning window");
    await expect(page.getByTestId("program-future-weeks")).toContainText("not the deadline for every goal");
    await expect(page.getByText(/saved week snapshot.*next 3 months stay projected/i)).toBeVisible();
  });

  test("current week opens detail inline and keeps only one row expanded", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const thisWeek = page.getByTestId("program-this-week");
    const rows = thisWeek.locator("[data-testid^='program-this-week-session-item-']");
    expect(await rows.count()).toBeGreaterThan(1);

    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);
    const firstButton = firstRow.locator("[data-testid^='program-this-week-session-button-']");
    const secondButton = secondRow.locator("[data-testid^='program-this-week-session-button-']");

    await firstButton.focus();
    await firstButton.press("Enter");
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow).toHaveAttribute("data-session-selected", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toBeVisible();
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(1);

    await secondButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstRow).toHaveAttribute("data-session-selected", "false");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(secondRow).toHaveAttribute("data-session-selected", "true");
    await expect(secondRow.getByTestId("planned-session-plan")).toBeVisible();
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(1);

    await secondButton.click();
    await expect(secondButton).toHaveAttribute("aria-expanded", "false");
    await expect(secondRow).toHaveAttribute("data-session-selected", "false");
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(0);
  });

  test("future week preview expands detail under the selected row", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const futureWeeks = page.getByTestId("program-future-weeks");
    const futureWeekCard = futureWeeks.locator("div[data-testid^='program-future-week-card-']").first();
    await futureWeekCard.locator("[data-testid^='program-future-week-toggle-']").click();

    const rows = futureWeekCard.locator("[data-testid^='program-future-week-session-item-']");
    expect(await rows.count()).toBeGreaterThan(1);

    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);
    const firstButton = firstRow.locator("[data-testid^='program-future-week-session-button-']");
    const secondButton = secondRow.locator("[data-testid^='program-future-week-session-button-']");

    await firstButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toBeVisible();
    await expect(secondRow.getByTestId("planned-session-plan")).toHaveCount(0);

    await secondButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(secondRow.getByTestId("planned-session-plan")).toBeVisible();

    await secondButton.click();
    await expect(secondButton).toHaveAttribute("aria-expanded", "false");
    await expect(futureWeekCard.getByTestId("planned-session-plan")).toHaveCount(0);
  });
});
