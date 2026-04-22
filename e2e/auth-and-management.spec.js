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

  test("signup confirmation flow keeps the user oriented and can resend the email", async ({ page }) => {
    const stats = await mockSupabaseRuntime(page, {
      signUpBody: {
        user: {
          id: "33333333-3333-4333-8333-333333333333",
          email: "confirm-athlete@example.com",
        },
      },
      trainerDataRows: [],
    });

    await bootAppWithSupabaseSeeds(page);
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await page.getByTestId("auth-mode-signup").click();
    await page.getByTestId("auth-signup-name").fill("Taylor");
    await page.getByTestId("auth-signup-units").selectOption("imperial");
    await page.getByTestId("auth-signup-timezone").fill("America/Chicago");
    await page.getByTestId("auth-email").fill("confirm-athlete@example.com");
    await page.getByTestId("auth-password").fill("correct horse battery");
    await page.getByTestId("auth-submit").click();

    await expect(page.getByTestId("auth-notice")).toContainText(/check your email to confirm/i);
    await expect(page.getByTestId("auth-resend-confirmation")).toBeVisible();
    await page.getByTestId("auth-resend-confirmation").click();

    await expect.poll(() => stats.resendConfirmationRequests).toBe(1);
    await expect.poll(() => stats.lastResendConfirmationBody?.email || "").toBe("confirm-athlete@example.com");
    await expect.poll(() => {
      const redirectTo = String(stats.lastResendConfirmationBody?.redirect_to || "");
      if (!redirectTo) return "";
      try {
        return new URL(redirectTo).pathname;
      } catch {
        return "";
      }
    }).toBe("/");
    await expect(page.getByTestId("auth-notice")).toContainText(/confirmation email resent/i);
  });

  test("logout returns the user to the account gate while preserving the saved local copy", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-account").click();
    await page.getByTestId("settings-logout").click();

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toHaveCount(0);
    await expect(page.getByText(/sign in to reopen your plan/i)).toBeVisible();
  });

  test("delete account stays blocked locally and leaves clear fallback actions", async ({ page }) => {
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
    await expect(page.getByTestId("settings-delete-account-status")).toContainText(/local build|not available/i);
    await expect(page.getByTestId("settings-delete-account-help")).toContainText(/sign out|reset this device/i);
    await expect(page.getByTestId("settings-delete-account")).toBeDisabled();
    await expect(page.getByTestId("settings-reset-device")).toBeVisible();
    await expect(page.getByTestId("settings-logout")).toBeVisible();
  });

  test("nutrition stays focused and theme switching changes the real UI tokens", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-execution-plan-header")).toBeVisible();
    await expect(page.getByTestId("nutrition-execution-plan-meals")).toBeVisible();
    await expect(page.getByTestId("nutrition-execution-rules")).toBeVisible();
    const firstMealRecipe = page.locator("[data-testid^='nutrition-meal-recipe-']").first();
    await expect(firstMealRecipe).toBeVisible();
    await firstMealRecipe.locator("summary").click();
    await expect(firstMealRecipe).toContainText(/1\./);
    await expect(page.getByTestId("nutrition-weekly-grocery-list")).toBeVisible();
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
