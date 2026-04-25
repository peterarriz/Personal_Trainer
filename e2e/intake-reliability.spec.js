const { test, expect } = require("@playwright/test");

const {
  commitPendingGoalSelection,
  domClick,
  domFill,
  gotoIntakeInLocalMode,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");
const {
  SUPABASE_KEY,
  SUPABASE_URL,
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
} = require("./auth-runtime-test-helpers.js");

async function completeSetupReality(page) {
  await domClick(page.getByTestId("intake-goals-option-experience-level-intermediate"));
  await domClick(page.getByTestId("intake-goals-option-training-days-4"));
  await domClick(page.getByTestId("intake-goals-option-session-length-45"));
  await domClick(page.getByTestId("intake-goals-option-training-location-gym"));
}

async function fillBigLiftSaveFields(page) {
  await domClick(page.getByTestId("intake-goal-metric-lift_focus-bench"));
  await domFill(page.getByTestId("intake-goal-metric-lift-target-weight"), "245");
  await domFill(page.getByTestId("intake-goal-metric-target-timeline"), "12 weeks");
  await domFill(page.getByTestId("intake-goal-metric-current-strength-baseline-weight"), "205");
  await domFill(page.getByTestId("intake-goal-metric-current-strength-baseline-reps"), "5");
}

async function fillLeanerDetails(page) {
  await domClick(page.getByTestId("intake-goal-metric-body_comp_tempo-steady"));
  await domClick(page.getByTestId("intake-goal-metric-muscle_retention_priority-high"));
  await domClick(page.getByTestId("intake-goal-metric-cardio_preference-walks"));
}

async function fillGeneralStrengthDetails(page) {
  await domClick(page.getByTestId("intake-goal-metric-equipment_profile-full-gym"));
  await domClick(page.getByTestId("intake-goal-metric-training_age-intermediate"));
  await domClick(page.getByTestId("intake-goal-metric-progression_posture-standard"));
}

async function openGoalFamilyAndSelectStack(page) {
  await expect(page.getByTestId("intake-goals-step")).toBeVisible();

  await domClick(page.getByTestId("intake-goal-type-strength"));
  await domClick(page.getByTestId("intake-featured-goal-improve_big_lifts"));
  await fillBigLiftSaveFields(page);
  await commitPendingGoalSelection(page);
  await expect(page.getByTestId("intake-selected-goals")).toContainText(/improve a big lift/i);

  await domClick(page.getByTestId("intake-goal-type-physique"));
  await domClick(page.getByTestId("intake-featured-goal-get_leaner"));
  await fillLeanerDetails(page);
  await commitPendingGoalSelection(page);
  await expect(page.getByTestId("intake-selected-goals")).toContainText(/get leaner/i);
}

async function installSignedInIntakeRuntime(page) {
  const session = makeSession({
    userId: "33333333-3333-4333-8333-333333333333",
    email: "intake-athlete@example.com",
  });
  const payload = makeSignedInPayload();
  payload.personalization = {
    ...payload.personalization,
    profile: {
      ...payload.personalization.profile,
      onboardingComplete: false,
      profileSetupComplete: true,
    },
  };
  payload.goals = [];
  payload.logs = {};
  payload.dailyCheckins = {};
  payload.nutritionActualLogs = {};
  payload.planWeekRecords = {};
  payload.plannedDayRecords = {};
  payload.weeklyCheckins = {};

  const runtime = {
    trainerDataGets: 0,
    trainerDataPosts: [],
  };

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });

  await page.route("**/auth/v1/logout", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/rest/v1/trainer_data")) {
      if (method === "GET") {
        runtime.trainerDataGets += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{
            id: "trainer_v1_intake_user",
            user_id: session.user.id,
            data: payload,
          }]),
        });
        return;
      }

      runtime.trainerDataPosts.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        status: 504,
        contentType: "text/plain",
        body: "gateway timeout",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.addInitScript(({ supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
  }, {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });

  await bootAppWithSupabaseSeeds(page, { session, payload });
  return runtime;
}

test.describe("intake reliability", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("desktop intake stacks setup panels without horizontal overlap", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await gotoIntakeInLocalMode(page);
    await expect(page.getByTestId("intake-goals-step")).toBeVisible();

    const goalBox = await page.getByTestId("intake-goal-selection-surface").boundingBox();
    const realityBox = await page.getByTestId("intake-reality-surface").boundingBox();

    expect(goalBox).toBeTruthy();
    expect(realityBox).toBeTruthy();
    expect((realityBox?.y || 0)).toBeGreaterThan((goalBox?.y || 0) + (goalBox?.height || 0) - 2);
    expect(Math.abs((goalBox?.x || 0) - (realityBox?.x || 0))).toBeLessThan(2);
    expect((goalBox?.x || 0) + (goalBox?.width || 0)).toBeLessThanOrEqual((realityBox?.x || 0) + (realityBox?.width || 0) + 2);
  });

  test("laptop intake accepts an exact race date and keeps save action readable", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message || String(error)));
    await gotoIntakeInLocalMode(page);
    await expect(page.getByTestId("intake-goals-step")).toBeVisible();

    await domClick(page.getByTestId("intake-goal-type-endurance"));
    await domClick(page.getByTestId("intake-featured-goal-train_for_run_race"));
    await expect(page.getByTestId("intake-goal-selection-draft")).toContainText(/running race/i);

    await domClick(page.getByTestId("intake-goal-metric-event_distance-half-marathon"));
    await domFill(page.getByTestId("intake-goal-metric-target-timeline"), "10/12/2026");
    await domFill(page.getByTestId("intake-goal-metric-current-run-frequency"), "4");
    await domFill(page.getByTestId("intake-goal-metric-longest-recent-run-value"), "8");
    await domClick(page.getByTestId("intake-goal-metric-longest_recent_run_unit-miles"));

    const commitButton = page.getByTestId("intake-goal-selection-commit");
    await expect(commitButton).toBeVisible();
    await expect(commitButton).toContainText(/save goal/i);
    const commitBox = await commitButton.boundingBox();
    expect(commitBox).toBeTruthy();
    expect(commitBox.width).toBeGreaterThan(120);

    await commitPendingGoalSelection(page);
    await expect(page.getByTestId("intake-selected-goals")).toContainText(/running race/i);
    expect(pageErrors).toEqual([]);
  });

  test("saved goal state and smart defaults make the first build path obvious", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoIntakeInLocalMode(page);
    await expect(page.getByTestId("intake-goals-step")).toBeVisible();

    await domClick(page.getByTestId("intake-goal-type-strength"));
    await domClick(page.getByTestId("intake-featured-goal-improve_big_lifts"));
    await expect(page.getByTestId("intake-goal-selection-draft")).toBeVisible();
    await fillBigLiftSaveFields(page);

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toContainText(/save goal/i);
    await expect(continueButton).toBeEnabled();
    await domClick(continueButton);

    await expect(page.getByTestId("intake-selected-goals")).toContainText(/improve a big lift/i);
    await expect(page.getByTestId("intake-goal-saved-status")).toContainText(/saved/i);
    await expect(page.getByTestId("intake-goals-needs")).toContainText(/ready with smart defaults/i);
    await expect(continueButton).toContainText(/build with defaults/i);
    await expect(continueButton).toBeEnabled();

    await domClick(continueButton);
    await expect.poll(async () => {
      const phase = await page.getByTestId("intake-root").getAttribute("data-intake-phase").catch(() => "");
      const todayVisible = await page.getByTestId("today-session-card").isVisible().catch(() => false);
      return todayVisible ? "completed" : phase || "pending";
    }, { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
  });

  test("mobile intake keeps goal-family switching and continue usable after picking a first goal", async ({ page }) => {
    await gotoIntakeInLocalMode(page);

    await openGoalFamilyAndSelectStack(page);
    await completeSetupReality(page);

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toBeEnabled();
    await domClick(continueButton);

    await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
  });

  test("mobile intake lets the user remove a mistaken first goal, switch cleanly, and keep sensible defaults", async ({ page }) => {
    await gotoIntakeInLocalMode(page);

    await domClick(page.getByTestId("intake-goal-type-strength"));
    await domClick(page.getByTestId("intake-featured-goal-get_stronger"));
    await fillGeneralStrengthDetails(page);
    await commitPendingGoalSelection(page);
    await expect(page.getByTestId("intake-selected-goals")).toContainText(/get stronger/i);

    await domClick(page.getByTestId("intake-selected-goal-remove-get-stronger"));
    await expect(page.getByTestId("intake-selected-goals")).not.toContainText(/get stronger/i);

    await domClick(page.getByTestId("intake-featured-goal-improve_big_lifts"));
    await fillBigLiftSaveFields(page);
    await commitPendingGoalSelection(page);
    await expect(page.getByTestId("intake-selected-goals")).toContainText(/improve a big lift/i);
    await expect(page.getByTestId("intake-selected-goals")).not.toContainText(/get stronger/i);

    await expect(page.getByTestId("intake-goals-option-experience-level-beginner")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("intake-goals-option-training-days-3")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("intake-goals-option-session-length-30")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("intake-goals-option-coaching-style-balanced-coaching")).toHaveAttribute("data-selected", "true");

    await domClick(page.getByTestId("intake-goals-option-training-location-gym"));

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toBeEnabled();
    await domClick(continueButton);

    await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
    const phase = await page.getByTestId("intake-root").getAttribute("data-intake-phase");
    if (/clarify|confirm/.test(phase || "")) {
      await expect(page.getByTestId("intake-review")).toContainText(/big lift|bench|squat|deadlift|press|pull-up/i);
      return;
    }
    await waitForPostOnboarding(page);
    await expect(page.getByTestId("today-session-card")).toBeVisible();
  });

  test("signed-in intake still reaches clarify and does not depend on cloud writes before onboarding finishes", async ({ page }) => {
    const runtime = await installSignedInIntakeRuntime(page);

    await expect(page.getByTestId("intake-root")).toBeVisible();
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "false");

    await openGoalFamilyAndSelectStack(page);
    await completeSetupReality(page);

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toBeEnabled();
    await domClick(continueButton);

    await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
    expect(runtime.trainerDataGets).toBeGreaterThan(0);
    expect(runtime.trainerDataPosts).toHaveLength(0);
  });
});
