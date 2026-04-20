const { test, expect } = require("@playwright/test");
const {
  completeAnchors,
  completeIntroQuestionnaire,
  confirmIntakeBuild,
  getCurrentFieldId,
  gotoIntakeInLocalMode,
  readLocalCache,
  waitForPostOnboarding,
  waitForReview,
} = require("./intake-test-utils.js");

test.describe("synthetic athlete browser probe", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1120 });
  });

  test("obese beginner flow keeps baseline capture inline and trust-critical surfaces discoverable after build", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "learn how to work out without getting hurt",
      experienceLevel: "Beginner",
      trainingDays: "3",
      sessionLength: "30 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toBe("starting_capacity_anchor");
    await completeAnchors(page, {
      starting_capacity_anchor: { type: "choice", value: "10_easy_minutes" },
    }, { maxSteps: 3 });

    await waitForReview(page);
    await expect(page.getByTestId("intake-summary-section-still-open")).toContainText(/30-day|baseline|consistency/i);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-goals").click();
    await expect(page.getByTestId("settings-goals-management")).toBeVisible();
    await page.getByTestId("settings-surface-baselines").click();
    await expect(page.getByTestId("settings-metrics-baselines")).toBeVisible();
    await expect(page.getByTestId("metrics-baselines-section")).toContainText(/why it matters|provenance|captured/i);

    await page.getByTestId("app-tab-coach").click();
    await page.getByTestId("coach-mode-button-ask_coach").click();
    await expect(page.getByTestId("coach-mode-panel-ask_coach")).toBeVisible();
    await expect(page.getByTestId("coach-advisory-boundary")).toContainText(/never changes your plan|advisory/i);
  });

  test("exact strength plus aesthetics flow keeps both goals visible and coach ask-anything stays non-mutating", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "Bench 225 by July and look bigger through my chest and shoulders",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
      stopAtInterpretation: true,
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toMatch(/target_timeline|current_strength_baseline/);
    await expect(page.locator("[data-testid='intake-confirm-goal-card']")).toHaveCount(2);
    await expect(page.getByTestId("intake-summary-section-optimize-first")).toContainText(/bench|chest|shoulders/i);

    await completeAnchors(page, {
      target_timeline: { type: "natural", value: "July" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
    }, { maxSteps: 4 });

    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    await page.getByTestId("app-tab-coach").click();
    const beforeCache = await readLocalCache(page);
    await page.getByTestId("coach-mode-button-ask_coach").click();
    await expect(page.getByTestId("coach-mode-panel-ask_coach")).toBeVisible();
    await expect(page.getByTestId("coach-advisory-boundary")).toContainText(/never changes your plan|advisory/i);
    await expect(page.getByTestId("coach-preview-accept")).toHaveCount(0);

    const afterCache = await readLocalCache(page);
    expect(afterCache?.coachActions || []).toEqual(beforeCache?.coachActions || []);
  });

  test("swim flow keeps swim anchors inline and exposes swim provenance after build", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "swim a faster mile",
      experienceLevel: "Intermediate",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toBe("recent_swim_anchor");
    await completeAnchors(page, {
      recent_swim_anchor: { type: "natural", value: "1000 yd in 22:30" },
      swim_access_reality: { type: "choice", value: "pool" },
    }, { maxSteps: 4 });

    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-baselines").click();
    await expect(page.getByTestId("metrics-baselines-section")).toContainText(/pool|swim/i);
    await expect(page.getByTestId("metrics-baselines-section")).toContainText(/captured|provenance|why it matters/i);
  });
});
