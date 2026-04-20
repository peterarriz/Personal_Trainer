const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "allow" });

test("service worker controls the repeat visit and caches the auth shell", async ({ page }) => {
  await page.addInitScript(() => {
    window.__SUPABASE_URL = "https://example.supabase.co";
    window.__SUPABASE_ANON_KEY = "anon-key";
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_local_cache_v4");
  });

  await page.goto("/");
  await expect(page.getByTestId("auth-gate")).toBeVisible();

  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready, null, { timeout: 30_000 });
  await page.reload({ waitUntil: "load" });
  await expect.poll(async () => (
    page.evaluate(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller))
  )).toBe(true);

  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await expect(page.getByText("BUILD ERROR")).toHaveCount(0);

  const cacheState = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cachedIndex = await caches.match("/index.html");
    const cachedRoot = await caches.match("/");
    return {
      cacheKeys: keys,
      hasCachedIndex: Boolean(cachedIndex),
      hasCachedRoot: Boolean(cachedRoot),
    };
  });
  expect(cacheState.cacheKeys.length).toBeGreaterThan(0);
  expect(cacheState.hasCachedIndex || cacheState.hasCachedRoot).toBe(true);

  const bootMetrics = await page.evaluate(() => window.__FORMA_BOOT_METRICS__ || {});
  expect(Number(bootMetrics.interactiveAt || 0)).toBeGreaterThan(0);
  expect(Boolean(bootMetrics.serviceWorkerControlled)).toBe(true);
});
