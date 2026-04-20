const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const bootWithTheme = async (page, theme) => {
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings.appearance = { theme, mode: "Dark" };
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
};

const readAppAccent = async (page) => page.getByTestId("app-root").evaluate((node) => (
  getComputedStyle(node).getPropertyValue("--brand-accent").trim()
));

const verifySurfaceAccent = async (page, tabTestId, expectedAccent) => {
  await page.getByTestId(tabTestId).click();
  await expect.poll(() => readAppAccent(page)).toBe(expectedAccent);
};

test.describe("theme coverage across consumer surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("Burnt Orange stays active across app tabs and the auth gate", async ({ page }) => {
    await bootWithTheme(page, "Ember");

    const expectedAccent = "#e08c5a";
    await expect.poll(() => readAppAccent(page)).toBe(expectedAccent);
    await verifySurfaceAccent(page, "app-tab-today", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-program", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-log", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-nutrition", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-coach", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-settings", expectedAccent);

    await page.getByTestId("settings-surface-account").click();
    await page.getByTestId("settings-logout").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect.poll(() => page.getByTestId("auth-gate").evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--auth-accent").trim()
    ))).toBe(expectedAccent);
  });

  test("Punch Pink stays active across app tabs and the auth gate", async ({ page }) => {
    await bootWithTheme(page, "Pulse");

    const expectedAccent = "#ff66c4";
    await expect.poll(() => readAppAccent(page)).toBe(expectedAccent);
    await verifySurfaceAccent(page, "app-tab-today", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-program", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-log", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-nutrition", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-coach", expectedAccent);
    await verifySurfaceAccent(page, "app-tab-settings", expectedAccent);

    await page.getByTestId("settings-surface-account").click();
    await page.getByTestId("settings-logout").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect.poll(() => page.getByTestId("auth-gate").evaluate((node) => (
      getComputedStyle(node).getPropertyValue("--auth-accent").trim()
    ))).toBe(expectedAccent);
  });
});
