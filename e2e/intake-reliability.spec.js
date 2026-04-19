const { test, expect } = require("@playwright/test");

const { commitPendingGoalSelection, gotoIntakeInLocalMode } = require("./intake-test-utils.js");
const {
  SUPABASE_KEY,
  SUPABASE_URL,
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
} = require("./auth-runtime-test-helpers.js");

async function completeSetupReality(page) {
  await page.getByTestId("intake-goals-option-experience-level-intermediate").click();
  await page.getByTestId("intake-goals-option-training-days-4").click();
  await page.getByTestId("intake-goals-option-session-length-45").click();
  await page.getByTestId("intake-goals-option-training-location-gym").click();
}

async function fillBigLiftSaveFields(page) {
  await page.getByTestId("intake-goal-metric-lift_focus-bench").click();
}

async function fillBigLiftDetails(page) {
  await page.getByTestId("intake-goal-metric-lift-target-weight").fill("245");
  await page.getByTestId("intake-goal-metric-target-timeline").fill("12 weeks");
}

async function fillBigLiftBaseline(page) {
  await page.getByTestId("intake-goal-metric-current-strength-baseline-weight").fill("205");
  await page.getByTestId("intake-goal-metric-current-strength-baseline-reps").fill("5");
}

async function fillLeanerDetails(page) {
  await page.getByTestId("intake-goal-metric-body_comp_tempo-steady").click();
  await page.getByTestId("intake-goal-metric-muscle_retention_priority-high").click();
  await page.getByTestId("intake-goal-metric-cardio_preference-walks").click();
}

async function fillGeneralStrengthDetails(page) {
  await page.getByTestId("intake-goal-metric-equipment_profile-full-gym").click();
  await page.getByTestId("intake-goal-metric-training_age-intermediate").click();
  await page.getByTestId("intake-goal-metric-progression_posture-standard").click();
}

async function openGoalFamilyAndSelectStack(page) {
  await expect(page.getByTestId("intake-goals-step")).toBeVisible();

  await page.getByTestId("intake-goal-type-strength").click();
  await page.getByTestId("intake-featured-goal-improve_big_lifts").click();
  await fillBigLiftSaveFields(page);
  await commitPendingGoalSelection(page);
  await fillBigLiftDetails(page);
  await expect(page.getByTestId("intake-selected-goals")).toContainText(/improve a big lift/i);

  await page.getByTestId("intake-goal-library-toggle").click();
  await expect(page.getByTestId("intake-goal-library-grid")).toBeVisible();
  await page.getByTestId("intake-goal-category-physique").click();
  await page.getByTestId("intake-goal-template-get_leaner").click();
  await commitPendingGoalSelection(page);
  await fillLeanerDetails(page);
  await expect(page.getByTestId("intake-selected-goals")).toContainText(/get leaner/i);
  await fillBigLiftBaseline(page);
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

  test("mobile intake keeps goal-family switching and continue usable after picking a first goal", async ({ page }) => {
    await gotoIntakeInLocalMode(page);

    await openGoalFamilyAndSelectStack(page);
    await completeSetupReality(page);

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toBe("clarify");
  });

  test("mobile intake lets the user remove a mistaken first goal, switch cleanly, and keep sensible defaults", async ({ page }) => {
    await gotoIntakeInLocalMode(page);

    await page.getByTestId("intake-goal-type-strength").click();
    await page.getByTestId("intake-featured-goal-get_stronger").click();
    await commitPendingGoalSelection(page);
    await fillGeneralStrengthDetails(page);
    await expect(page.getByTestId("intake-selected-goals")).toContainText(/get stronger/i);

    await page.getByTestId("intake-selected-goal-remove-get-stronger").click();
    await expect(page.getByTestId("intake-selected-goals")).not.toContainText(/get stronger/i);

    await page.getByTestId("intake-featured-goal-improve_big_lifts").click();
    await fillBigLiftSaveFields(page);
    await commitPendingGoalSelection(page);
    await fillBigLiftDetails(page);
    await expect(page.getByTestId("intake-selected-goals")).toContainText(/improve a big lift/i);
    await expect(page.getByTestId("intake-selected-goals")).not.toContainText(/get stronger/i);
    await fillBigLiftBaseline(page);

    await expect(page.getByTestId("intake-goals-option-experience-level-beginner")).toHaveClass(/btn-primary/);
    await expect(page.getByTestId("intake-goals-option-training-days-3")).toHaveClass(/btn-primary/);
    await expect(page.getByTestId("intake-goals-option-session-length-30")).toHaveClass(/btn-primary/);
    await expect(page.getByTestId("intake-goals-option-coaching-style-balanced-coaching")).toHaveClass(/btn-primary/);

    await page.getByTestId("intake-goals-option-training-location-gym").click();

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toBe("clarify");
    await expect(page.getByTestId("intake-review")).toContainText(/big lift|bench|squat|deadlift|press|pull-up/i);
  });

  test("signed-in intake still reaches clarify and does not depend on cloud writes before onboarding finishes", async ({ page }) => {
    const runtime = await installSignedInIntakeRuntime(page);

    await expect(page.getByTestId("intake-root")).toBeVisible();
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "false");

    await openGoalFamilyAndSelectStack(page);
    await completeSetupReality(page);

    const continueButton = page.getByTestId("intake-footer-continue");
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toBe("clarify");
    expect(runtime.trainerDataGets).toBeGreaterThan(0);
    expect(runtime.trainerDataPosts).toHaveLength(0);
  });
});
