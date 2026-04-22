const { test, expect } = require("@playwright/test");

const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  dismissAppleHealthPromptIfVisible,
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
  await dismissAppleHealthPromptIfVisible(page);
}

test.describe("nutrition meal planning preferences", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
    await freezeBrowserDate(page, "2026-04-16T12:00:00.000Z");
  });

  test("thumbs up/down and weekly meal rotations persist cleanly", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();

    await page.getByTestId("nutrition-like-meal-breakfast").click();
    await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);

    await page.getByTestId("nutrition-dislike-meal-lunch").click();
    await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);

    const firstRotateButton = page.locator('[data-testid^="nutrition-meal-calendar-rotate-"]').first();
    const rotateTestId = await firstRotateButton.getAttribute("data-testid");
    await firstRotateButton.click();
    await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);

    const cache = await readLocalCache(page);
    const mealPatternFeedbackValues = Object.values(cache?.nutritionFavorites?.mealPatternFeedback || {});
    expect(mealPatternFeedbackValues).toContain("liked");
    expect(mealPatternFeedbackValues).toContain("disliked");
    expect(Object.keys(cache?.nutritionFavorites?.mealCalendarOverrides || {}).length).toBeGreaterThan(0);

    await page.reload();
    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();
    await expect(page.getByTestId("nutrition-like-meal-breakfast")).toContainText(/liked/i);
    const reloadedCache = await readLocalCache(page);
    const reloadedFeedbackValues = Object.values(reloadedCache?.nutritionFavorites?.mealPatternFeedback || {});
    expect(reloadedFeedbackValues).toContain("liked");
    expect(reloadedFeedbackValues).toContain("disliked");
    if (rotateTestId) {
      const rotatedRowTestId = rotateTestId.replace("rotate", "slot");
      await expect(page.getByTestId(rotatedRowTestId)).toContainText(/rotated/i);
    }
  });
});
