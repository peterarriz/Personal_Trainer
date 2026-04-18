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
    await expect.poll(() => {
      const redirectTo = String(stats.lastRecoverBody?.redirect_to || "");
      if (!redirectTo) return "";
      try {
        return new URL(redirectTo).pathname;
      } catch {
        return "";
      }
    }).toBe("/");
  });

  test("recovery link opens a reset form and saves the new password", async ({ page }) => {
    const recoverySession = makeSession({ email: "reset-athlete@example.com" });
    const stats = await mockSupabaseRuntime(page, { session: recoverySession });
    const recoveryPath = `/?password-reset=1#type=recovery&access_token=${encodeURIComponent(recoverySession.access_token)}&refresh_token=${encodeURIComponent(recoverySession.refresh_token)}`;

    await bootAppWithSupabaseSeeds(page, { path: recoveryPath });

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("auth-recovery-email")).toHaveValue("reset-athlete@example.com");
    await page.getByTestId("auth-password").fill("new-password-123");
    await page.getByTestId("auth-password-confirm").fill("new-password-123");
    await page.getByTestId("auth-submit").click();

    await expect.poll(() => stats.passwordUpdateRequests).toBe(1);
    await expect.poll(() => stats.lastPasswordUpdateBody?.password || "").toBe("new-password-123");
    await expect(page.getByTestId("auth-notice")).toContainText(/password updated/i);
    await expect(page.getByTestId("auth-email")).toHaveValue("reset-athlete@example.com");
    await expect(page).toHaveURL(/^(?!.*access_token).*$/);
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
