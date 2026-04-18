const { test, expect } = require("@playwright/test");
const {
  gotoIntakeInLocalMode,
  completeIntroQuestionnaire,
  completeAnchors,
  waitForReview,
  confirmIntakeBuild,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

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
    target_timeline: { type: "date_or_month", value: "2026-10" },
    current_run_frequency: { type: "number", value: "3" },
    running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
    longest_recent_run: { type: "number", value: "7" },
    recent_pace_baseline: { type: "natural", value: "8:55 pace" },
  });
  await waitForReview(page);
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
}

test.describe("auth and management hardening", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("signup captures account metadata, then lands in the merged intake setup", async ({ page }) => {
    const session = makeSession({
      userId: "22222222-2222-4222-8222-222222222222",
      email: "new-athlete@example.com",
    });
    await mockSupabaseRuntime(page, {
      session,
      payload: makeSignedInPayload(),
      trainerDataRows: [],
    });

    await bootAppWithSupabaseSeeds(page);
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await page.getByTestId("auth-mode-signup").click();
    await page.getByTestId("auth-signup-name").fill("Taylor");
    await page.getByTestId("auth-signup-units").selectOption("imperial");
    await page.getByTestId("auth-signup-timezone").fill("America/Chicago");
    await page.getByTestId("auth-email").fill("new-athlete@example.com");
    await page.getByTestId("auth-password").fill("correct horse battery");
    await page.getByTestId("auth-submit").click();

    await expect(page.getByTestId("intake-root")).toBeVisible();
    await expect(page.getByTestId("intake-goals-step")).toBeVisible();
  });

  test("logout keeps the device in local mode until the user explicitly reopens sign-in", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-account").click();
    await page.getByTestId("settings-logout").click();

    await expect(page.getByTestId("settings-account-section")).toBeVisible();
    await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible();
    await expect(page.getByTestId("settings-sync-status")).toContainText(/saved local copy|This device only/i);
    await expect(page.getByTestId("auth-gate")).toHaveCount(0);
    await page.getByTestId("settings-open-auth-gate").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
  });

  test("delete account clears local identity and a later sign-in attempt fails cleanly", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, {
      session,
      payload,
      signInStatus: 400,
      signInBody: { message: "Invalid login credentials" },
    });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-account").click();
    await page.getByTestId("settings-account-advanced").locator("summary").click();
    await page.getByTestId("settings-delete-account").click();
    await page.getByTestId("settings-delete-account-export").click();
    await page.getByTestId("settings-delete-account-confirm").fill("DELETE");
    await page.getByTestId("settings-delete-account-submit").click();

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      auth: localStorage.getItem("trainer_auth_session_v1"),
      cache: localStorage.getItem("trainer_local_cache_v4"),
    }))).toEqual({ auth: null, cache: null });

    await page.getByTestId("auth-email").fill("athlete@example.com");
    await page.getByTestId("auth-password").fill("wrong-password");
    await page.getByTestId("auth-submit").click();
    await expect(page.getByText(/Sign in failed/i)).toBeVisible();
  });

  test("nutrition stays focused and theme switching changes the real UI tokens", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-daily-target")).toBeVisible();
    await expect(page.getByTestId("nutrition-weekly-planning")).toHaveCount(0);
    await expect(page.getByTestId("nutrition-performance-guidance")).toBeVisible();

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-preferences").click();
    await expect(page.getByTestId("settings-preferences-section")).toBeVisible();
    await expect(page.getByTestId("settings-theme-grid")).toBeVisible();
    const before = await page.locator("[data-testid='app-root']").evaluate((node) => getComputedStyle(node).getPropertyValue("--brand-accent"));
    await page.getByTestId("settings-theme-circuit").click();
    const after = await page.locator("[data-testid='app-root']").evaluate((node) => getComputedStyle(node).getPropertyValue("--brand-accent"));

    expect(before.trim()).not.toBe(after.trim());
  });
});
