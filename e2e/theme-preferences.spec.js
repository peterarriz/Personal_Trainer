const { createHash } = require("node:crypto");
const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const FLAGSHIP_THEME_TEST_IDS = Object.freeze([
  "redwood",
  "ember",
  "voltage",
  "fieldhouse",
  "atlas",
  "circuit",
  "solstice",
  "pulse",
]);

const hashScreenshot = (buffer) => createHash("sha256").update(buffer).digest("hex");

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

const readStackMetrics = async (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return {
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    children: Array.from(node.children).map((child) => {
      const childRect = child.getBoundingClientRect();
      return {
        left: childRect.left,
        right: childRect.right,
        top: childRect.top,
        bottom: childRect.bottom,
        scrollWidth: child.scrollWidth,
        clientWidth: child.clientWidth,
        scrollHeight: child.scrollHeight,
        clientHeight: child.clientHeight,
      };
    }),
  };
});

test.describe("theme preferences surface", () => {
  test("appearance previews stay readable and unclipped at laptop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1180 });
    await openAppearancePreferences(page, { theme: "Atlas", mode: "Dark", colorScheme: "dark" });

    const metrics = await readThemeGridMetrics(page);

    expect(metrics.cardCount).toBe(8);
    expect(metrics.previewCount).toBe(8);
    expect(metrics.gridScrollWidth).toBeLessThanOrEqual(metrics.gridClientWidth + 2);
    metrics.cards.forEach((card) => {
      expect(card.width).toBeGreaterThan(220);
      expect(card.height).toBeGreaterThan(240);
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

    await page.getByTestId("settings-theme-solstice").click();
    await expect(page.getByTestId("settings-theme-solstice")).toHaveAttribute("data-selected", "true");

    const beforeNav = await page.locator("[data-testid='app-root']").evaluate((node) => ({
      fontDisplay: getComputedStyle(node).getPropertyValue("--font-display").trim(),
      radiusLg: getComputedStyle(node).getPropertyValue("--radius-lg").trim(),
    }));

    await page.getByTestId("app-tab-program").click();
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-preferences").click();

    await expect(page.getByTestId("settings-theme-solstice")).toHaveAttribute("data-selected", "true");
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

    await expect(page.getByTestId("settings-theme-preview-voltage")).toContainText("System / Light");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await enterAppShell(page);
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-preferences").click();

    await expect(page.getByTestId("settings-theme-preview-voltage")).toContainText("System / Dark");
  });

  test("flagship previews stay screenshot-distinct and the lower preferences stack stays unclipped", async ({ page }) => {
    await page.setViewportSize({ width: 1120, height: 980 });
    await openAppearancePreferences(page, { theme: "Atlas", mode: "Dark", colorScheme: "dark" });

    const previewHashes = [];
    for (const themeId of FLAGSHIP_THEME_TEST_IDS) {
      const previewBuffer = await page.getByTestId(`settings-theme-preview-${themeId}`).screenshot({
        animations: "disabled",
        caret: "hide",
      });
      previewHashes.push(hashScreenshot(previewBuffer));
    }
    expect(new Set(previewHashes).size).toBe(FLAGSHIP_THEME_TEST_IDS.length);

    const lowerHashes = [];
    for (const themeId of FLAGSHIP_THEME_TEST_IDS) {
      await page.getByTestId(`settings-theme-${themeId}`).click();
      await expect(page.getByTestId(`settings-theme-${themeId}`)).toHaveAttribute("data-selected", "true");

      const lowerSection = page.getByTestId("settings-preferences-lower");
      const notificationsSection = page.getByTestId("settings-notifications-section");
      await lowerSection.scrollIntoViewIfNeeded();

      const lowerMetrics = await readStackMetrics(lowerSection);
      const notificationMetrics = await readStackMetrics(notificationsSection);

      expect(lowerMetrics.scrollWidth).toBeLessThanOrEqual(lowerMetrics.clientWidth + 2);
      expect(lowerMetrics.scrollHeight).toBeLessThanOrEqual(lowerMetrics.clientHeight + 2);
      lowerMetrics.children.forEach((child, index) => {
        expect(child.left).toBeGreaterThanOrEqual(lowerMetrics.left - 1);
        expect(child.right).toBeLessThanOrEqual(lowerMetrics.right + 1);
        expect(child.scrollWidth).toBeLessThanOrEqual(child.clientWidth + 2);
        if (index > 0) {
          expect(child.top).toBeGreaterThanOrEqual(lowerMetrics.children[index - 1].bottom - 1);
        }
      });

      expect(notificationMetrics.scrollWidth).toBeLessThanOrEqual(notificationMetrics.clientWidth + 2);
      expect(notificationMetrics.scrollHeight).toBeLessThanOrEqual(notificationMetrics.clientHeight + 2);
      notificationMetrics.children.forEach((child, index) => {
        expect(child.left).toBeGreaterThanOrEqual(notificationMetrics.left - 1);
        expect(child.right).toBeLessThanOrEqual(notificationMetrics.right + 1);
        expect(child.scrollWidth).toBeLessThanOrEqual(child.clientWidth + 2);
        if (index > 0) {
          expect(child.top).toBeGreaterThanOrEqual(notificationMetrics.children[index - 1].bottom - 1);
        }
      });

      const lowerBuffer = await lowerSection.screenshot({
        animations: "disabled",
        caret: "hide",
      });
      lowerHashes.push(hashScreenshot(lowerBuffer));
    }
    expect(new Set(lowerHashes).size).toBe(FLAGSHIP_THEME_TEST_IDS.length);
  });
});
