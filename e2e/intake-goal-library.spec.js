const { test, expect } = require("@playwright/test");
const {
  completeGoalLibraryIntakeStep,
  completeIntroQuestionnaire,
  confirmIntakeBuild,
  gotoIntakeInLocalMode,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");

test.describe("goal-library intake paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1120 });
  });

  test("running path can reach review from the featured library card", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeGoalLibraryIntakeStep(page, {
      goalType: "running",
      templateId: "run_first_5k",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      quickMetrics: {
        target_timeline: "October",
        current_run_frequency: 3,
        longest_recent_run: "4 miles",
      },
    });

    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("swim path can reach review from the featured library card", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeGoalLibraryIntakeStep(page, {
      goalType: "swim",
      templateId: "open_water_swim",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      quickMetrics: {
        recent_swim_anchor: "1000 yd in 22:30",
        swim_access_reality: "open_water",
      },
    });

    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("strength path can reach review from the featured library card", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeGoalLibraryIntakeStep(page, {
      goalType: "strength",
      templateId: "bench_225",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      quickMetrics: {
        current_strength_baseline_weight: 185,
        current_strength_baseline_reps: 5,
        target_timeline: "July",
      },
    });

    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("fat-loss path can reach review from the featured library card", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeGoalLibraryIntakeStep(page, {
      goalType: "fat_loss",
      templateId: "lose_10_lb",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      quickMetrics: {
        current_bodyweight: 205,
      },
    });

    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("general-fitness path can reach review from the featured library card", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeGoalLibraryIntakeStep(page, {
      goalType: "general_fitness",
      templateId: "get_back_in_shape",
      experienceLevel: "Beginner",
      trainingDays: "3",
      sessionLength: "30 min",
      trainingLocation: "Gym",
      quickMetrics: {
        starting_capacity_anchor: "10_easy_minutes",
      },
    });

    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("custom goal path still completes without the featured library", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "gain muscle",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });
});
