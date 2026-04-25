const { test, expect } = require("@playwright/test");
const {
  commitPendingGoalSelection,
  completeStructuredIntakeOnOneScreen,
  domClick,
  domFill,
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
      await domClick(page.getByTestId(testId));
      clickCount += 1;
    };

    await clickAndCount("intake-goal-type-endurance");
    await clickAndCount("intake-featured-goal-train_for_run_race");
    await clickAndCount("intake-goal-metric-event_distance-half-marathon");
    await domFill(page.getByTestId("intake-goal-metric-target-timeline"), "October");
    await domFill(page.getByTestId("intake-goal-metric-current-run-frequency"), "4");
    await domFill(page.getByTestId("intake-goal-metric-longest-recent-run-value"), "8");
    await clickAndCount("intake-goal-metric-longest_recent_run_unit-miles");
    await commitPendingGoalSelection(page);
    clickCount += 1;
    await clickAndCount("intake-goals-option-experience-level-intermediate");
    await clickAndCount("intake-goals-option-training-days-4");
    await clickAndCount("intake-goals-option-session-length-45");
    await clickAndCount("intake-goals-option-training-location-gym");
    await expect(page.getByTestId("intake-summary-rail")).toBeVisible();
    await expect(page.getByTestId("intake-plan-preview")).toBeVisible();
    await clickAndCount("intake-footer-continue");

    expect(clickCount).toBeLessThanOrEqual(10);
    await expect.poll(() => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
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

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    await expect(page.getByTestId("today-session-card")).toBeVisible();
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

  test("physique intake can lock and build from one screen after proxy anchors", async ({ page }) => {
    await completeStructuredIntakeOnOneScreen(page, {
      goalType: "physique",
      templateId: "get_leaner",
      quickMetrics: {
        body_comp_tempo: "steady",
        muscle_retention_priority: "high",
        cardio_preference: "walks",
      },
      experienceLevel: "Intermediate",
      trainingDays: "5",
      sessionLength: "45 min",
      trainingLocation: "Both",
      homeEquipment: ["Bodyweight only"],
      coachingStyle: "Push me (with guardrails)",
    });

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    await expect(page.getByTestId("today-session-card")).toBeVisible();
  });

  test("re-entry intake can lock and build from one screen after safe-capacity anchors", async ({ page }) => {
    await completeStructuredIntakeOnOneScreen(page, {
      goalType: "re_entry",
      templateId: "restart_safely",
      quickMetrics: {},
      experienceLevel: "Beginner",
      trainingDays: "3",
      sessionLength: "20 min",
      trainingLocation: "Home",
      homeEquipment: ["Resistance bands"],
      coachingStyle: "Keep me consistent",
    });

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    await expect(page.getByTestId("today-session-card")).toBeVisible();
  });

  test("swim intake can lock and build from one screen after swim-context anchors", async ({ page }) => {
    await completeStructuredIntakeOnOneScreen(page, {
      goalType: "endurance",
      templateId: "swim_better",
      quickMetrics: {
        goal_focus: "endurance",
      },
      experienceLevel: "Advanced",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    await expect(page.getByTestId("today-session-card")).toBeVisible();
  });

  test("weekday availability selections persist into the saved training context", async ({ page }) => {
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
      trainingDays: "4",
      availableTrainingDays: ["Tue", "Thu", "Sun"],
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.trainingContext?.weekdayAvailability?.value).toEqual(["tue", "thu", "sun"]);
    expect(cache?.personalization?.userGoalProfile?.available_days).toEqual(["tue", "thu", "sun"]);
  });

  test("post-onboarding settings edits can update weekday availability and persist after reload", async ({ page }) => {
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
      trainingDays: "4",
      availableTrainingDays: ["Tue", "Thu", "Sun"],
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    await domClick(page.getByTestId("app-tab-settings"));
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await domClick(page.getByTestId("settings-surface-baselines"));
    await expect(page.getByTestId("metrics-baselines-section")).toBeVisible();

    for (const day of ["Tue", "Thu", "Sun"]) {
      await domClick(page.getByTestId(`metrics-input-environment-available-days-${day.toLowerCase()}`));
    }
    for (const day of ["Mon", "Wed", "Fri"]) {
      await domClick(page.getByTestId(`metrics-input-environment-available-days-${day.toLowerCase()}`));
    }

    await domClick(page.getByTestId("metrics-save-environment"));
    await expect(page.getByTestId("settings-save-status")).toContainText(/training setup|future planning/i);

    let cache = await readLocalCache(page);
    expect(cache?.personalization?.trainingContext?.weekdayAvailability?.value).toEqual(["mon", "wed", "fri"]);
    expect(cache?.personalization?.userGoalProfile?.available_days).toEqual(["mon", "wed", "fri"]);

    await page.reload();
    await expect(page.getByTestId("today-session-card")).toBeVisible();

    await domClick(page.getByTestId("app-tab-settings"));
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await domClick(page.getByTestId("settings-surface-baselines"));
    await expect(page.getByTestId("metrics-baselines-section")).toBeVisible();

    await expect(page.getByTestId("metrics-input-environment-available-days-mon")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("metrics-input-environment-available-days-wed")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("metrics-input-environment-available-days-fri")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("metrics-input-environment-available-days-tue")).not.toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("metrics-input-environment-available-days-thu")).not.toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("metrics-input-environment-available-days-sun")).not.toHaveAttribute("data-selected", "true");

    cache = await readLocalCache(page);
    expect(cache?.personalization?.trainingContext?.weekdayAvailability?.value).toEqual(["mon", "wed", "fri"]);
    expect(cache?.personalization?.userGoalProfile?.available_days).toEqual(["mon", "wed", "fri"]);
  });
});
