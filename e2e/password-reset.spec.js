const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

test.describe("password reset recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("auth gate can request a password reset email without entering local mode", async ({ page }) => {
    const stats = await mockSupabaseRuntime(page);
    await bootAppWithSupabaseSeeds(page);

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await page.getByTestId("auth-email").fill("reset-athlete@example.com");
    await page.getByTestId("auth-forgot-password").click();

    await expect(page.getByTestId("auth-notice")).toContainText(/reset link will arrive shortly/i);
    await expect.poll(() => stats.recoverRequests).toBe(1);
    await expect.poll(() => stats.lastRecoverBody?.email || "").toBe("reset-athlete@example.com");
  });

  test("settings account can email a password reset link to the signed-in athlete", async ({ page }) => {
    const session = makeSession({ email: "athlete@example.com" });
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, { session, payload });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-account").click();
    await expect(page.getByTestId("settings-account-section")).toBeVisible();

    await page.getByTestId("settings-send-password-reset").click();

    await expect(page.getByTestId("settings-password-reset-message")).toContainText(/reset link will arrive shortly/i);
    await expect.poll(() => stats.recoverRequests).toBe(1);
    await expect.poll(() => stats.lastRecoverBody?.email || "").toBe("athlete@example.com");
  });
});
