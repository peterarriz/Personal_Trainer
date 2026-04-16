const { test, expect } = require("@playwright/test");

const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  getAppEvents: getIntakeAppEvents,
  gotoIntakeInLocalMode,
  waitForPostOnboarding,
  waitForReview,
} = require("./intake-test-utils.js");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const {
  getAppEvents,
  installAppEventCapture,
} = require("./app-event-test-helpers.js");

const getAnalyticsNames = async (page, reader = getAppEvents) => {
  const events = await reader(page);
  return events
    .filter((entry) => entry?.type === "trainer:analytics")
    .map((entry) => entry?.detail?.name)
    .filter(Boolean);
};

test.describe("friction analytics smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 980 });
  });

  test("intake build and quick logging fire the canonical analytics events once", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "bench 225",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await completeAnchors(page, {
      target_timeline: { type: "natural", value: "next year" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
    }, { maxSteps: 3 });

    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();
    await page.getByTestId("log-complete-prescribed").click();
    await expect(page.getByTestId("log-save-status")).toContainText("Saved");

    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page, getIntakeAppEvents);
      return analyticsNames.filter((name) => name === "intake.plan_build.requested").length;
    }).toBe(1);
    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page, getIntakeAppEvents);
      return analyticsNames.filter((name) => name === "intake.plan_build.completed").length;
    }).toBe(1);
    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page, getIntakeAppEvents);
      return analyticsNames.filter((name) => name === "logging.workout_log.success").length;
    }).toBe(1);
  });

  test("settings goal preview and apply emit exactly one analytics event each", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await installAppEventCapture(page);
    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-goals").click();
    await expect(page.getByTestId("settings-goals-section")).toBeVisible();

    await page.getByTestId("settings-goals-add").click();
    await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
    await page.getByTestId("settings-goal-editor-category-swim").click();
    await page.getByTestId("settings-goal-editor-template-swim_faster_mile").click();
    await page.getByTestId("settings-goal-editor-preview").click();
    await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("Swim a faster mile");
    await page.getByTestId("settings-goals-confirm-preview").click();

    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "goals.management_preview.requested").length;
    }).toBe(1);
    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "goals.management_apply.success").length;
    }).toBe(1);
  });

  test("account sign out emits requested and success analytics once", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, { session, payload, logoutDelayMs: 400 });
    await installAppEventCapture(page);
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-account").click();
    await expect(page.getByTestId("settings-account-section")).toBeVisible();
    await page.getByTestId("settings-logout").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect.poll(() => stats.logoutRequests).toBe(1);

    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "auth.sign_out.requested").length;
    }).toBe(1);
    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "auth.sign_out.success").length;
    }).toBe(1);
  });

  test("coach preview emits the deterministic preview event once", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await installAppEventCapture(page);
    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await page.getByTestId("app-tab-coach").click();
    await expect(page.getByTestId("coach-tab")).toBeVisible();
    await page.getByTestId("coach-mode-button-change_plan").click();
    await page.locator("[data-testid^='coach-change-action-']").first().click();

    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "coach.plan_preview.requested").length;
    }).toBe(1);
  });
});
