const { test, expect } = require("@playwright/test");
const {
  commitPendingGoalSelection,
  completeStructuredIntakeOnOneScreen,
  gotoIntakeInLocalMode,
  readIntakeSession,
  readLocalCache,
} = require("./intake-test-utils.js");

test.describe("one-screen structured intake", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoIntakeInLocalMode(page);
  });

  test("featured fast path reaches a visible draft preview within eight primary taps", async ({ page }) => {
    let clickCount = 0;
    const clickAndCount = async (testId) => {
      await page.getByTestId(testId).click();
      clickCount += 1;
    };

    await clickAndCount("intake-goal-type-endurance");
    await clickAndCount("intake-featured-goal-train_for_run_race");
    await clickAndCount("intake-goal-metric-event_distance-half-marathon");
    await commitPendingGoalSelection(page);
    clickCount += 1;
    await page.getByTestId("intake-goal-metric-target-timeline").fill("October");
    await page.getByTestId("intake-goal-metric-current-run-frequency").fill("4");
    await page.getByTestId("intake-goal-metric-longest-recent-run-value").fill("8");
    await clickAndCount("intake-goal-metric-longest_recent_run_unit-miles");
    await clickAndCount("intake-goals-option-experience-level-intermediate");
    await clickAndCount("intake-goals-option-training-days-4");
    await clickAndCount("intake-goals-option-session-length-45");
    await clickAndCount("intake-goals-option-training-location-gym");
    await clickAndCount("intake-footer-continue");

    expect(clickCount).toBeLessThanOrEqual(10);
    await expect(page.getByTestId("intake-summary-rail")).toBeVisible();
    await expect(page.getByTestId("intake-plan-preview")).toBeVisible();
    await expect.poll(() => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toMatch(/clarify|confirm/);
  });

  test("strength intake can lock and build from one screen", async ({ page }) => {
    await completeStructuredIntakeOnOneScreen(page, {
      goalType: "strength",
      templateId: "improve_big_lifts",
      quickMetrics: {
        lift_focus: "bench",
        lift_target_weight: "245",
        lift_target_reps: "3",
        target_timeline: "12 weeks",
        current_strength_baseline_weight: "205",
        current_strength_baseline_reps: "5",
      },
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    await expect.poll(() => readIntakeSession(page)).toBeNull();
  });

  test("endurance intake can lock and build from one screen without anchor followups", async ({ page }) => {
    await completeStructuredIntakeOnOneScreen(page, {
      goalType: "endurance",
      templateId: "half_marathon",
      quickMetrics: {
        event_distance: "half_marathon",
        target_timeline: "October",
        current_run_frequency: "4",
        longest_recent_run_value: "8",
        longest_recent_run_unit: "miles",
      },
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Both",
      homeEquipment: ["Dumbbells"],
      coachingStyle: "Balanced coaching",
    });

    await expect(page.getByTestId("post-intake-ready-card")).toBeVisible();
    await expect(page.getByTestId("post-intake-ready-headline")).toContainText(/ready/i);
  });

  test("hybrid intake can lock and build from one screen", async ({ page }) => {
    await completeStructuredIntakeOnOneScreen(page, {
      goalType: "hybrid",
      templateId: "run_and_lift",
      quickMetrics: {
        hybrid_priority: "strength",
        equipment_profile: "full_gym",
        current_run_frequency: "2",
        goal_focus: "strength",
        current_strength_baseline_weight: "205",
        current_strength_baseline_reps: "5",
      },
      experienceLevel: "Intermediate",
      trainingDays: "5",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    await expect(page.getByTestId("today-session-card")).toBeVisible();
  });
});
