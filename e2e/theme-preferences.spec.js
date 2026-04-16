const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const enterAppShell = async (page) => {
  const authGate = page.getByTestId("auth-gate");
  if (await authGate.isVisible().catch(() => false)) {
    await page.getByTestId("continue-local-mode").click();
  }
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("app-tab-settings")).toBeVisible();
};

const openAppearancePreferences = async (page, {
  theme = "Atlas",
  mode = "Dark",
  colorScheme = "dark",
} = {}) => {
  await page.emulateMedia({ colorScheme });
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings.appearance = { theme, mode };
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await enterAppShell(page);
  await page.getByTestId("app-tab-settings").click();
  await page.getByTestId("settings-surface-preferences").click();
  await expect(page.getByTestId("settings-preferences-section")).toBeVisible();
  await expect(page.getByTestId("settings-appearance-section")).toBeVisible();
};

const readThemeGridMetrics = async (page) => page.getByTestId("settings-theme-grid").evaluate((node) => {
  const gridRect = node.getBoundingClientRect();
  const cards = Array.from(node.querySelectorAll("button[data-selected]"));
  const previews = Array.from(node.querySelectorAll("[data-testid^='settings-theme-preview-']"));

  return {
    gridClientWidth: node.clientWidth,
    gridScrollWidth: node.scrollWidth,
    cardCount: cards.length,
    previewCount: previews.length,
    cards: cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
      };
    }),
    previews: previews.map((preview) => {
      const rect = preview.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        scrollWidth: preview.scrollWidth,
        clientWidth: preview.clientWidth,
      };
    }),
    gridRight: gridRect.right,
    gridBottom: gridRect.bottom,
  };
});

test.describe("theme preferences surface", () => {
  test("appearance previews stay readable and unclipped at laptop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1180 });
    await openAppearancePreferences(page, { theme: "Atlas", mode: "Dark", colorScheme: "dark" });

    const metrics = await readThemeGridMetrics(page);

    expect(metrics.cardCount).toBe(12);
    expect(metrics.previewCount).toBe(12);
    expect(metrics.gridScrollWidth).toBeLessThanOrEqual(metrics.gridClientWidth + 2);
    metrics.cards.forEach((card) => {
      expect(card.width).toBeGreaterThan(220);
      expect(card.height).toBeGreaterThan(250);
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 2);
      expect(card.right).toBeLessThanOrEqual(metrics.gridRight + 2);
      expect(card.bottom).toBeLessThanOrEqual(metrics.gridBottom + 240);
    });
    metrics.previews.forEach((preview) => {
      expect(preview.width).toBeGreaterThan(180);
      expect(preview.height).toBeGreaterThan(150);
      expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth + 2);
    });
  });

  test("appearance previews stay visible on mobile and selected theme persists across rerenders", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAppearancePreferences(page, { theme: "Atlas", mode: "Dark", colorScheme: "dark" });

    await page.getByTestId("settings-theme-canvas").click();
    await expect(page.getByTestId("settings-theme-canvas")).toHaveAttribute("data-selected", "true");

    const beforeNav = await page.locator("[data-testid='app-root']").evaluate((node) => ({
      fontDisplay: getComputedStyle(node).getPropertyValue("--font-display").trim(),
      radiusLg: getComputedStyle(node).getPropertyValue("--radius-lg").trim(),
    }));

    await page.getByTestId("app-tab-program").click();
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-preferences").click();

    await expect(page.getByTestId("settings-theme-canvas")).toHaveAttribute("data-selected", "true");
    const afterNav = await page.locator("[data-testid='app-root']").evaluate((node) => ({
      fontDisplay: getComputedStyle(node).getPropertyValue("--font-display").trim(),
      radiusLg: getComputedStyle(node).getPropertyValue("--radius-lg").trim(),
    }));

    expect(afterNav.fontDisplay).toBe(beforeNav.fontDisplay);
    expect(afterNav.radiusLg).toBe(beforeNav.radiusLg);

    const metrics = await readThemeGridMetrics(page);
    expect(metrics.gridScrollWidth).toBeLessThanOrEqual(metrics.gridClientWidth + 2);
    metrics.previews.forEach((preview) => {
      expect(preview.height).toBeGreaterThan(140);
      expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth + 2);
    });
  });

  test("system mode previews resolve against the live device scheme", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1040 });
    await openAppearancePreferences(page, { theme: "Voltage", mode: "System", colorScheme: "light" });

    await expect(page.getByTestId("settings-theme-preview-voltage")).toContainText("System · Light");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await enterAppShell(page);
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-preferences").click();

    await expect(page.getByTestId("settings-theme-preview-voltage")).toContainText("System · Dark");
  });
});
