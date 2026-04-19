const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const domClick = async (locator) => {
  await expect(locator).toBeVisible();
  await locator.evaluate((node) => node.click());
};

const openSettingsAccountSurface = async (page) => {
  await domClick(page.getByTestId("app-tab-settings"));
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await domClick(page.getByTestId("settings-surface-account"));
  await expect(page.getByTestId("settings-account-section")).toBeVisible();
};

const enableSyncTestHarness = async (page) => {
  await page.addInitScript(() => {
    window.__E2E_SYNC_TEST = true;
  });
};

const enableDeveloperDiagnostics = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("trainer_debug", "1");
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

const readAnchorTop = async (page, anchorTestId) => (
  page.getByTestId(anchorTestId).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return Math.round(rect.top);
  })
);

const expectStableCompactMetrics = (baseline, samples) => {
  samples.forEach((sample) => {
    expect(Math.abs(sample.status.top - baseline.status.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.status.height - baseline.status.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.anchor.top - baseline.anchor.top)).toBeLessThanOrEqual(1);
  });
};

const expectSingleCompactStatus = async (page, statusTestId) => {
  await expect(page.getByTestId(statusTestId)).toHaveCount(1);
  await expect(page.getByTestId(`${statusTestId}-inline`)).toHaveCount(0);
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

    await domClick(page.getByTestId("app-tab-settings"));
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await domClick(page.getByTestId("settings-surface-profile"));
    await domClick(page.getByRole("button", { name: "Save profile" }));
    await domClick(page.getByTestId("settings-surface-account"));

    await expect(page.getByTestId("settings-sync-status")).toContainText("Saved here");
    await expect(page.getByTestId("settings-sync-status")).toContainText("sending");

    await domClick(page.getByTestId("app-tab-today"));
    await expect(page.getByTestId("today-sync-status")).toContainText("Saved here");
    await expect(page.getByTestId("today-sync-status")).toContainText("sending");

    await domClick(page.getByTestId("app-tab-program"));
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-sync-status")).toContainText("Saved here");
    await expect(page.getByTestId("program-sync-status")).toContainText("sending");
  });

  test("developer diagnostics expose the exact trainer_data retry failure behind the generic sync state", async ({ page }) => {
    await enableDeveloperDiagnostics(page);
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

    await domClick(page.getByTestId("app-tab-settings"));
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await domClick(page.getByTestId("settings-surface-profile"));
    await domClick(page.getByRole("button", { name: "Save profile" }));
    await domClick(page.getByTestId("settings-surface-account"));

    await expect(page.getByTestId("settings-sync-status")).toContainText("Saved here");
    await page.getByTestId("settings-account-advanced").evaluate((node) => {
      node.open = true;
    });
    await page.getByTestId("settings-sync-diagnostics").evaluate((node) => {
      node.open = true;
    });

    await expect(page.getByTestId("settings-sync-diagnostics-last-attempt")).toContainText("rest/v1/trainer_data");
    await expect(page.getByTestId("settings-sync-diagnostics-last-attempt")).toContainText("POST");
    await expect(page.getByTestId("settings-sync-diagnostics-last-failure")).toContainText("HTTP 504");
    await expect(page.getByTestId("settings-sync-diagnostics-last-failure")).toContainText("retry eligible Yes");
    await expect(page.getByTestId("settings-sync-diagnostics-last-failure")).toContainText("pending local writes Yes");
    await expect(page.getByTestId("settings-sync-diagnostics-local-cache")).toContainText("pending writes Yes");
  });

  test("signed-out devices resume the last usable local state before showing auth choices", async ({ page }) => {
    const payload = makeSignedInPayload();

    await bootAppWithSupabaseSeeds(page, { session: null, payload });

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-sync-status")).toContainText("This device only");
    await expect(page.getByTestId("today-sync-status")).toContainText("saved local copy");

    await openSettingsAccountSurface(page);
    await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible();
    await page.getByTestId("settings-open-auth-gate").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();
  });

  test("provider outage surfaces a fatal sync state instead of a vague broken local mode", async ({ page }) => {
    const payload = makeSignedInPayload();

    await page.addInitScript(({ payloadSeed }) => {
      window.__SUPABASE_URL = "malformed-supabase-url";
      window.__SUPABASE_ANON_KEY = "test-key";
      localStorage.removeItem("trainer_auth_session_v1");
      localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
    }, {
      payloadSeed: payload,
    });

    await page.goto("/");

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-sync-status")).toContainText("Account sync is unavailable");
    await expect(page.getByTestId("today-sync-status")).toContainText("local training copy is still usable here");

    await openSettingsAccountSurface(page);
    await expect(page.getByTestId("settings-sync-status")).toContainText("Account sync is unavailable");
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
      const captureMetricsIfStatusVisible = async () => {
        const status = page.getByTestId(statusTestId);
        await expect.poll(async () => {
          const count = await status.count();
          const displayedStateId = (await readSyncSnapshot(page))?.displayedStateId;
          if (count > 0) return "visible";
          if (displayedStateId === "synced") return "hidden";
          return "";
        }, { timeout: 12_000 }).toMatch(/visible|hidden/);
        const count = await status.count();
        if (!count) return null;
        await expect(status).toBeVisible();
        await expectSingleCompactStatus(page, statusTestId);
        return readCompactSurfaceMetrics(page, { statusTestId, anchorTestId });
      };
      const captureAnchorStability = async (samples) => {
        const status = page.getByTestId(statusTestId);
        expect(await status.count()).toBeLessThanOrEqual(1);
        samples.push(await readAnchorTop(page, anchorTestId));
      };
      await openSurface();
      await applySyncPreset(page, "retrying", 900);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("retrying");
      await reconcileSyncPresentation(page, 10_500);
      const metrics = [];
      const anchorSamples = [await readAnchorTop(page, anchorTestId)];
      const retryingMetrics = await captureMetricsIfStatusVisible();
      if (retryingMetrics) metrics.push(retryingMetrics);
      await captureAnchorStability(anchorSamples);

      await applySyncPreset(page, "syncing", 1000);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("syncing");
      const syncingMetrics = await captureMetricsIfStatusVisible();
      if (syncingMetrics) metrics.push(syncingMetrics);
      await captureAnchorStability(anchorSamples);

      await applySyncPreset(page, "retrying", 1100);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("retrying");
      const retryingAgainMetrics = await captureMetricsIfStatusVisible();
      if (retryingAgainMetrics) metrics.push(retryingAgainMetrics);
      await captureAnchorStability(anchorSamples);

      await applySyncPreset(page, "syncing", 1200);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("syncing");
      const syncingAgainMetrics = await captureMetricsIfStatusVisible();
      if (syncingAgainMetrics) metrics.push(syncingAgainMetrics);
      await captureAnchorStability(anchorSamples);

      await applySyncPreset(page, "stale", 1300);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("stale-cloud");
      const staleMetrics = await captureMetricsIfStatusVisible();
      if (staleMetrics) metrics.push(staleMetrics);
      await captureAnchorStability(anchorSamples);

      await reconcileSyncPresentation(page, 10_500);
      const reconciledMetrics = await captureMetricsIfStatusVisible();
      if (reconciledMetrics) metrics.push(reconciledMetrics);
      await captureAnchorStability(anchorSamples);

      await applySyncPreset(page, "synced", 1400);
      await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("synced");
      await reconcileSyncPresentation(page, 21_000);
      await expect.poll(async () => (await readSyncSnapshot(page))?.displayedStateId).toBe("synced");
      await expect(page.getByTestId(statusTestId)).toHaveCount(0);
      const anchorBaseline = anchorSamples[0];
      anchorSamples.slice(1).forEach((anchorTop) => {
        expect(Math.abs(anchorTop - anchorBaseline)).toBeLessThanOrEqual(1);
      });
      if (metrics.length >= 2) {
        expectStableCompactMetrics(metrics[0], metrics.slice(1));
      }
    };

    await assertSurfaceStable({
      openSurface: async () => {
        await domClick(page.getByTestId("app-tab-today"));
        await expect(page.getByTestId("today-tab")).toBeVisible();
      },
      statusTestId: "today-sync-status",
      anchorTestId: "today-canonical-session-label",
    });

    await assertSurfaceStable({
      openSurface: async () => {
        await domClick(page.getByTestId("app-tab-program"));
        await expect(page.getByTestId("program-tab")).toBeVisible();
      },
      statusTestId: "program-sync-status",
      anchorTestId: "program-canonical-session-label",
    });
  });

  test("flapping retry pulses never duplicate the Today sync chip or shift the header", async ({ page }) => {
    await enableSyncTestHarness(page);
    const session = makeSession();
    const payload = makeSignedInPayload();

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await domClick(page.getByTestId("app-tab-today"));
    await expect(page.getByTestId("today-tab")).toBeVisible();

    await applySyncPreset(page, "retrying", 1000);
    await expect.poll(async () => (await readSyncSnapshot(page))?.displayedStateId).toBe("retrying");
    const metrics = [
      await readCompactSurfaceMetrics(page, {
        statusTestId: "today-sync-status",
        anchorTestId: "today-canonical-session-label",
      }),
    ];

    for (const [preset, at] of [
      ["retrying", 1100],
      ["retrying", 1200],
      ["syncing", 1300],
      ["retrying", 1400],
      ["stale", 1500],
      ["retrying", 1600],
    ]) {
      await applySyncPreset(page, preset, at);
      await expect(page.getByTestId("today-sync-status")).toBeVisible();
      await expectSingleCompactStatus(page, "today-sync-status");
      metrics.push(await readCompactSurfaceMetrics(page, {
        statusTestId: "today-sync-status",
        anchorTestId: "today-canonical-session-label",
      }));
    }

    await applySyncPreset(page, "synced", 1700);
    await reconcileSyncPresentation(page, 21_000);
    await expect.poll(async () => (await readSyncSnapshot(page))?.displayedStateId).toBe("synced");
    await expect(page.getByTestId("today-sync-status")).toHaveCount(0);

    expectStableCompactMetrics(metrics[0], metrics.slice(1));
  });

  test("stale cloud recovery replaces provisional settings copy once reconnect succeeds", async ({ page }) => {
    await enableSyncTestHarness(page);
    const session = makeSession();
    const payload = makeSignedInPayload();

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await openSettingsAccountSurface(page);

    await applySyncPreset(page, "stale", 2000);
    await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("stale-cloud");
    await expect(page.getByTestId("settings-sync-status")).toContainText("Cloud behind");

    await applySyncPreset(page, "syncing", 2100);
    await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("syncing");
    await expect(page.getByTestId("settings-sync-status")).toHaveCount(1);

    await applySyncPreset(page, "synced", 2200);
    await expect.poll(async () => (await readSyncSnapshot(page))?.rawStateId).toBe("synced");
    await reconcileSyncPresentation(page, 21_000);
    await expect.poll(async () => (await readSyncSnapshot(page))?.displayedStateId).toBe("synced");
    await expect(page.getByTestId("settings-sync-status")).toContainText("Everything is saved");

    const statusText = await page.getByTestId("settings-sync-status").innerText();
    expect(statusText).not.toMatch(/step behind|saved here/i);
  });
});
