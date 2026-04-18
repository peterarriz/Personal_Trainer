const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const { measureContrast } = require("./adversarial-test-helpers.js");

const parseDurationMs = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (text.endsWith("ms")) return Number.parseFloat(text) || 0;
  if (text.endsWith("s")) return (Number.parseFloat(text) || 0) * 1000;
  return Number.parseFloat(text) || 0;
};

const readTapTarget = async (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
});

const readFontSize = async (locator) => locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize || "0") || 0);

async function bootSignedInSurface(page, {
  theme = "Atlas",
  mode = "Light",
  colorScheme = "light",
  reducedMotion,
} = {}) {
  const media = { colorScheme };
  if (reducedMotion) media.reducedMotion = reducedMotion;
  await page.emulateMedia(media);
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings.appearance = { theme, mode };
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("today-tab")).toBeVisible();
}

test.describe("mobile accessibility pass", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
  });

  test("small-phone controls keep touch targets and labeled inputs usable", async ({ page }) => {
    await bootSignedInSurface(page, { mode: "Light", colorScheme: "light" });

    const shellTargets = [
      page.getByTestId("app-tab-today"),
      page.getByTestId("app-tab-program"),
      page.getByTestId("app-tab-log"),
      page.getByTestId("app-tab-nutrition"),
      page.getByTestId("app-tab-coach"),
      page.getByTestId("app-tab-settings"),
    ];
    for (const locator of shellTargets) {
      const metrics = await readTapTarget(locator);
      expect(metrics.width).toBeGreaterThanOrEqual(44);
      expect(metrics.height).toBeGreaterThanOrEqual(44);
    }

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();

    const logTargets = [
      page.locator("summary").filter({ hasText: "Full session details" }).first(),
      page.locator("summary").filter({ hasText: "Notes, feel, and context" }).first(),
      page.getByTestId("log-save-quick"),
      page.getByTestId("log-day-review-disclosure").locator("summary").first(),
      page.locator("summary").filter({ hasText: "Recent history" }).first(),
    ];
    for (const locator of logTargets) {
      const metrics = await readTapTarget(locator);
      expect(metrics.height).toBeGreaterThanOrEqual(44);
    }

    await page.locator("summary").filter({ hasText: "Notes, feel, and context" }).first().click();

    const alwaysVisibleLogFields = [
      page.getByLabel("How the session felt"),
      page.getByLabel("Session note"),
    ];
    for (const locator of alwaysVisibleLogFields) {
      await expect(locator).toBeVisible();
      expect(await readFontSize(locator)).toBeGreaterThanOrEqual(16);
    }

    const workoutSpecificLogFields = [
      page.getByLabel("Run distance"),
      page.getByLabel("Run duration"),
      page.getByLabel("Run pace"),
      page.getByLabel("Session reps"),
      page.getByLabel("Session weight"),
      page.getByLabel("Exercise 1 name"),
    ];
    let visibleWorkoutField = false;
    for (const locator of workoutSpecificLogFields) {
      if (await locator.count()) {
        await expect(locator.first()).toBeVisible();
        expect(await readFontSize(locator.first())).toBeGreaterThanOrEqual(16);
        visibleWorkoutField = true;
        break;
      }
    }
    expect(visibleWorkoutField).toBeTruthy();

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    const backupRestore = page.getByTestId("settings-account-section").locator('textarea[aria-label="Backup code to restore"]').first();
    await expect(backupRestore).toHaveCount(1);
    expect(await readFontSize(backupRestore)).toBeGreaterThanOrEqual(16);
  });

  test("light mode keeps today and history copy readable on mobile", async ({ page }) => {
    await bootSignedInSurface(page, { mode: "Light", colorScheme: "light" });

    const todayLabelContrast = await measureContrast(page.getByTestId("today-canonical-session-label"));
    const todaySummaryContrast = await measureContrast(page.getByTestId("today-change-summary"));
    expect(todayLabelContrast.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(todaySummaryContrast.contrastRatio).toBeGreaterThanOrEqual(4.5);

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();

    const logLabelContrast = await measureContrast(page.getByTestId("log-canonical-session-label"));
    const reviewSummaryContrast = await measureContrast(page.getByTestId("log-day-review-disclosure").locator("summary").first());
    const historySummaryContrast = await measureContrast(page.locator("summary").filter({ hasText: "Recent history" }).first());
    expect(logLabelContrast.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(reviewSummaryContrast.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(historySummaryContrast.contrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  test("reduced motion disables decorative entry animation on mobile", async ({ page }) => {
    await bootSignedInSurface(page, { mode: "Dark", colorScheme: "dark", reducedMotion: "reduce" });

    const todayMotion = await page.getByTestId("today-tab").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
      };
    });
    const buttonMotion = await page.getByTestId("app-tab-log").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        transitionDuration: style.transitionDuration,
      };
    });

    expect(todayMotion.animationName === "none" || parseDurationMs(todayMotion.animationDuration) <= 1).toBe(true);
    expect(parseDurationMs(buttonMotion.transitionDuration)).toBeLessThanOrEqual(1);
  });

  test("slow mobile boot still lands on a usable first screen", async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 250,
      downloadThroughput: 90 * 1024,
      uploadThroughput: 40 * 1024,
      connectionType: "cellular3g",
    });
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await bootSignedInSurface(page, { mode: "Dark", colorScheme: "dark" });

    await expect(page.getByTestId("today-session-card")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("today-canonical-session-label")).toBeVisible();
    await expect(page.getByTestId("today-change-summary")).toBeVisible();
  });
});
