const { test, expect } = require("@playwright/test");
const {
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
