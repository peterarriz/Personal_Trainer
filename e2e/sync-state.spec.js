const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const openSettingsAccountSurface = async (page) => {
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await page.getByTestId("settings-surface-account").click();
  await expect(page.getByTestId("settings-account-section")).toBeVisible();
};

test.describe("shared sync state rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("load retry state stays aligned across Today, Program, and Settings", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await expect(page.getByTestId("today-tab")).toBeVisible();

    await page.route("**/rest/v1/trainer_data", async (route) => {
      if (route.request().method() === "POST") {
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
        body: JSON.stringify([{ id: "trainer_v1_user", user_id: session.user.id, data: payload }]),
      });
    });

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-profile").click();
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByTestId("settings-surface-account").click();

    await expect(page.getByTestId("settings-sync-status")).toContainText("Retrying cloud sync");
    await expect(page.getByTestId("settings-sync-status")).toContainText("reload cloud data");

    await page.getByTestId("app-tab-today").click();
    await expect(page.getByTestId("today-sync-status")).toContainText("Retrying cloud sync");
    await expect(page.getByTestId("today-sync-status")).toContainText("Local changes stay saved");

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-sync-status")).toContainText("Retrying cloud sync");
  });

  test("signed-out auth gate explains the device-only state instead of pretending sync is active", async ({ page }) => {
    const payload = makeSignedInPayload();

    await bootAppWithSupabaseSeeds(page, { session: null, payload });

    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("auth-sync-status")).toContainText("Device-only");
    await expect(page.getByTestId("auth-sync-status")).toContainText("running without active cloud sync");
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();
  });

  test("provider outage surfaces a fatal sync state instead of a vague broken local mode", async ({ page }) => {
    const payload = makeSignedInPayload();

    await page.addInitScript(({ payloadSeed }) => {
      window.__SUPABASE_URL = "";
      window.__SUPABASE_ANON_KEY = "";
      localStorage.removeItem("trainer_auth_session_v1");
      localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
    }, {
      payloadSeed: payload,
    });

    await page.goto("/");

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-sync-status")).toContainText("Cloud sync is unavailable");
    await expect(page.getByTestId("today-sync-status")).toContainText("Local training data remains usable on this device");

    await openSettingsAccountSurface(page);
    await expect(page.getByTestId("settings-sync-status")).toContainText("Cloud sync is unavailable");
    await expect(page.getByTestId("settings-sync-status")).toContainText("Admin action is required");
  });
});
