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

const enableSyncTestHarness = async (page) => {
  await page.addInitScript(() => {
    window.__E2E_SYNC_TEST = true;
  });
};

const readSyncSnapshot = async (page) => page.evaluate(() => window.__TRAINER_SYNC_TEST_HELPERS?.snapshot?.() || null);

const applySyncPreset = async (page, preset, at = Date.now()) => {
  await page.evaluate(({ nextPreset, timestamp }) => {
    window.__TRAINER_SYNC_TEST_HELPERS?.applyPreset?.(nextPreset, timestamp);
  }, { nextPreset: preset, timestamp: at });
};

const reconcileSyncPresentation = async (page, offsetMs = 0) => {
  await page.evaluate((offset) => {
    window.__TRAINER_SYNC_TEST_HELPERS?.reconcilePresentation?.(offset);
  }, offsetMs);
};

const readCompactSurfaceMetrics = async (page, { statusTestId, anchorTestId }) => {
  const status = await page.getByTestId(statusTestId).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      height: Math.round(rect.height),
      width: Math.round(rect.width),
    };
  });
  const anchor = await page.getByTestId(anchorTestId).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
    };
  });
  return {
    status,
    anchor,
  };
};

const expectStableCompactMetrics = (baseline, samples) => {
  samples.forEach((sample) => {
    expect(Math.abs(sample.status.top - baseline.status.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.status.height - baseline.status.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.anchor.top - baseline.anchor.top)).toBeLessThanOrEqual(1);
  });
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

    await expect(page.getByTestId("settings-sync-status")).toContainText("Retrying");
    await expect(page.getByTestId("settings-sync-status")).toContainText("Cloud sync is retrying in the background");

    await page.getByTestId("app-tab-today").click();
    await expect(page.getByTestId("today-sync-status")).toContainText("Retrying");
    await expect(page.getByTestId("today-sync-status")).toContainText("Cloud sync is retrying in the background");

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-sync-status")).toContainText("Retrying");
    await expect(page.getByTestId("program-sync-status")).toContainText("Cloud sync is retrying in the background");
  });

  test("signed-out devices resume the last usable local state before showing auth choices", async ({ page }) => {
    const payload = makeSignedInPayload();

    await bootAppWithSupabaseSeeds(page, { session: null, payload });

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-sync-status")).toContainText("Device-only");
    await expect(page.getByTestId("today-sync-status")).toContainText("running locally without cloud sync");

    await openSettingsAccountSurface(page);
    await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible();
    await page.getByTestId("settings-open-auth-gate").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
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
    await expect(page.getByTestId("settings-sync-status")).toContainText("Keep using this device locally for now");
  });

  test("rapid compact-surface sync transitions keep one chip mounted with zero layout shift", async ({ page }) => {
    await enableSyncTestHarness(page);
    const session = makeSession();
    const payload = makeSignedInPayload();

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await expect.poll(async () => Boolean((await readSyncSnapshot(page))?.displayedStateId)).toBe(true);

    const assertSurfaceStable = async ({
      openSurface,
      statusTestId,
      anchorTestId,
    }) => {
      await openSurface();
      await applySyncPreset(page, "synced", 900);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("synced");
      await expect.poll(async () => (await readSyncSnapshot(page))?.displayedStateId).toBe("synced");
      await expect(page.getByTestId(statusTestId)).toBeVisible();
      await expect(page.getByTestId(`${statusTestId}-inline`)).toHaveCount(0);
      const metrics = [];
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await applySyncPreset(page, "syncing", 1000);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("syncing");
      await expect(page.getByTestId(statusTestId)).toBeVisible();
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await applySyncPreset(page, "retrying", 1100);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("retrying");
      await expect(page.getByTestId(statusTestId)).toBeVisible();
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await applySyncPreset(page, "syncing", 1200);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("syncing");
      await expect(page.getByTestId(statusTestId)).toBeVisible();
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await applySyncPreset(page, "stale", 1300);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("stale-cloud");
      await expect(page.getByTestId(statusTestId)).toBeVisible();
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await reconcileSyncPresentation(page, 10_500);
      await expect(page.getByTestId(statusTestId)).toBeVisible();
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await applySyncPreset(page, "synced", 1400);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("synced");
      await reconcileSyncPresentation(page, 21_000);
      await expect.poll(async () => (await readSyncSnapshot(page))?.displayedStateId).toBe("synced");
      await expect(page.getByTestId(statusTestId)).toContainText("Synced");
      metrics.push(await readCompactSurfaceMetrics(page, { statusTestId, anchorTestId }));

      await expect(page.getByTestId(statusTestId)).toHaveCount(1);
      expectStableCompactMetrics(metrics[0], metrics.slice(1));
    };

    await assertSurfaceStable({
      openSurface: async () => {
        await page.getByTestId("app-tab-today").click();
        await expect(page.getByTestId("today-tab")).toBeVisible();
      },
      statusTestId: "today-sync-status",
      anchorTestId: "today-canonical-session-label",
    });

    await assertSurfaceStable({
      openSurface: async () => {
        await page.getByTestId("app-tab-program").click();
        await expect(page.getByTestId("program-tab")).toBeVisible();
      },
      statusTestId: "program-sync-status",
      anchorTestId: "program-canonical-session-label",
    });
  });
});
