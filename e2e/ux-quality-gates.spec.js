const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const {
  completeGoalLibraryIntakeStep,
  gotoIntakeInLocalMode,
} = require("./intake-test-utils.js");

const enableTapCounter = async (page) => {
  await page.addInitScript(() => {
    window.__E2E_TAP_COUNTER = { count: 0 };
    window.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      window.__E2E_TAP_COUNTER.count += 1;
    }, true);
  });
};

const resetTapCounter = async (page) => {
  await page.evaluate(() => {
    if (!window.__E2E_TAP_COUNTER) window.__E2E_TAP_COUNTER = { count: 0 };
    window.__E2E_TAP_COUNTER.count = 0;
  });
};

const readTapCounter = async (page) => page.evaluate(() => {
  const counter = window.__E2E_TAP_COUNTER;
  return counter && typeof counter.count === "number" ? counter.count : 0;
});

test.describe("UX quality gates", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("featured-goal intake reaches review inside the tap budget", async ({ page }) => {
    await enableTapCounter(page);
    await gotoIntakeInLocalMode(page, {}, { freshStart: true });

    await resetTapCounter(page);
    const phase = await completeGoalLibraryIntakeStep(page, {
      goalType: "running",
      templateId: "run_first_5k",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      quickMetrics: {
        target_timeline: "October",
        current_run_frequency: 3,
        longest_recent_run: "4 miles",
      },
    });

    if (phase === "completed") {
      await expect(page.getByTestId("today-session-card")).toBeVisible();
    } else {
      await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    }
    expect(await readTapCounter(page)).toBeLessThanOrEqual(12);
  });

  test("profile save stays inside the settings tap budget", async ({ page }) => {
    await enableTapCounter(page);
    const session = makeSession();
    const payload = makeSignedInPayload();

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await resetTapCounter(page);

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-profile").click();
    await expect(page.getByTestId("settings-profile-section")).toBeVisible();
    await page.getByRole("button", { name: "Save profile" }).click();

    expect(await readTapCounter(page)).toBeLessThanOrEqual(3);
  });
});
