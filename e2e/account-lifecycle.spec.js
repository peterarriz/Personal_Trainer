const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const openSettingsAccountSurface = async (page) => {
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await page.getByTestId("settings-surface-account").click();
  await expect(page.getByTestId("settings-account-section")).toBeVisible();
};

const openSettingsAccountAdvanced = async (page) => {
  await page.getByTestId("settings-account-advanced").locator("summary").click();
};

test.describe("account lifecycle settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

test("settings keeps reload and sign-out primary while recovery actions stay in the advanced panel", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, { session, payload });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await openSettingsAccountSurface(page);

    await expect(page.getByRole("button", { name: "Reload cloud data" })).toBeVisible();
    await expect(page.getByTestId("settings-logout")).toBeVisible();
    await expect(page.getByTestId("settings-reset-device")).not.toBeVisible();
    await expect(page.getByTestId("settings-delete-account")).not.toBeVisible();
    await openSettingsAccountAdvanced(page);
    await expect(page.getByTestId("settings-reset-device")).toBeVisible();
    await expect(page.getByTestId("settings-delete-account")).toBeVisible();
    await expect(page.getByTestId("settings-delete-account-status")).toContainText("configured");
    await expect(page.getByTestId("settings-delete-account")).toBeEnabled();
    await expect.poll(() => stats.deleteGetRequests).toBeGreaterThan(0);
  });

  test("sign out falls back to local mode before a slow remote logout finishes and preserves local resume", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, {
      session,
      payload,
      logoutDelayMs: 1500,
    });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await openSettingsAccountSurface(page);

    const startedAt = Date.now();
    await page.getByTestId("settings-logout").click();

    await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible({ timeout: 1000 });
    expect(Date.now() - startedAt).toBeLessThan(1200);
    await expect(page.getByTestId("auth-gate")).toHaveCount(0);
    await expect(page.getByTestId("settings-sync-status")).toContainText(/saved local copy|This device only/i);
    await expect(page.getByTestId("settings-account-action-message")).toContainText("Local data stays on this device");
    await expect.poll(() => page.evaluate(() => ({
      auth: localStorage.getItem("trainer_auth_session_v1"),
      hasCache: Boolean(localStorage.getItem("trainer_local_cache_v4")),
    }))).toEqual({
      auth: "null",
      hasCache: true,
    });
    await expect.poll(() => stats.logoutRequests).toBe(1);
    await page.getByTestId("settings-open-auth-gate").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();
    await expect(page.getByTestId("auth-local-cta-description")).toContainText(/last usable training state|keep going locally/i);
    await page.waitForTimeout(1600);
  });

  test("device reset clears this browser and removes the local resume path", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, { session, payload });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await openSettingsAccountSurface(page);
    await openSettingsAccountAdvanced(page);

    await page.getByTestId("settings-reset-device").click();
    await page.getByTestId("settings-reset-device-confirm").fill("RESET");
    await page.getByTestId("settings-reset-device-submit").click();

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();
    await expect(page.getByTestId("auth-local-cta-description")).toContainText(/local fallback|need this device right away/i);
    await expect.poll(() => page.evaluate(() => ({
      auth: localStorage.getItem("trainer_auth_session_v1"),
      cache: localStorage.getItem("trainer_local_cache_v4"),
    }))).toEqual({
      auth: null,
      cache: null,
    });
    await expect.poll(() => stats.logoutRequests).toBe(1);
  });

  test("delete account stays blocked with clear fallback paths when the deployment is not configured", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, {
      session,
      payload,
      deleteDiagnosticsBody: {
        ok: true,
        code: "delete_account_not_configured",
        configured: false,
        required: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
        missing: ["SUPABASE_SERVICE_ROLE_KEY"],
        message: "Account deletion is not configured on this deployment yet.",
        detail: "The deployment is missing one or more server-side Supabase settings required for auth-user deletion.",
        fix: "Set SUPABASE_SERVICE_ROLE_KEY on the server deployment and redeploy before enabling permanent account deletion.",
      },
      deletePostStatus: 503,
      deletePostBody: {
        ok: false,
        code: "delete_account_not_configured",
        configured: false,
        missing: ["SUPABASE_SERVICE_ROLE_KEY"],
        required: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
        message: "Account deletion is not configured on this deployment yet.",
        detail: "Permanent account deletion needs server-side Supabase configuration.",
        fix: "Set SUPABASE_SERVICE_ROLE_KEY on the server deployment and redeploy.",
      },
    });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await openSettingsAccountSurface(page);
    await openSettingsAccountAdvanced(page);

    await expect(page.getByTestId("settings-delete-account-status")).toContainText("not configured");
    await expect(page.getByTestId("settings-delete-account-help")).toContainText("sign out or reset this device");
    await expect(page.getByTestId("settings-delete-account-diagnostics")).toHaveCount(0);
    await expect(page.getByTestId("settings-delete-account-missing-envs")).toHaveCount(0);
    await expect(page.getByTestId("settings-delete-account")).toBeDisabled();
    await expect(page.getByTestId("settings-reset-device")).toBeVisible();
    await expect.poll(() => stats.deleteGetRequests).toBeGreaterThan(0);
    expect(stats.deletePostRequests).toBe(0);
  });
});
