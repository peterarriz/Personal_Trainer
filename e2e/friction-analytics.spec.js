const { test, expect } = require("@playwright/test");

const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  dismissAppleHealthPromptIfVisible,
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

async function completeCoachReadyOnboarding(page) {
  await gotoIntakeInLocalMode(page);
  await completeIntroQuestionnaire(page, {
    goalText: "run a 1:45 half marathon",
    experienceLevel: "Intermediate",
    trainingDays: "3",
    sessionLength: "45 min",
    trainingLocation: "Gym",
    coachingStyle: "Balanced coaching",
  });

  await completeAnchors(page, {
    target_timeline: { type: "natural", value: "October" },
    current_run_frequency: { type: "natural", value: "3 runs/week" },
    running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
    longest_recent_run: { type: "natural", value: "7 miles" },
    recent_pace_baseline: { type: "natural", value: "8:55 pace" },
  });

  await waitForReview(page);
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
  await dismissAppleHealthPromptIfVisible(page);
}

async function openCoachTab(page) {
  await expect(page.getByTestId("app-tab-coach")).toBeVisible();
  await page.getByTestId("app-tab-coach").click({ force: true });
  await dismissAppleHealthPromptIfVisible(page);
  await expect(page.getByTestId("coach-tab")).toBeVisible();
}

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
    await page.getByTestId("log-save-quick").click();
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
    await page.getByTestId("settings-goal-editor-category-endurance").click();
    await page.getByTestId("settings-goal-editor-template-swim_better").click();
    await page.getByTestId("settings-goal-editor-preview").click();
    await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/Improve swim fitness|Swim better/i);
    await page.getByTestId("settings-goals-confirm-preview").evaluate((node) => node.click());

    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "goals.management_preview.requested").length;
    }).toBe(1);
    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "goals.management_apply.success").length;
    }).toBe(1);
  });

  test("account sign out emits requested and success analytics once while the device stays in local mode", async ({ page }) => {
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
    await expect(page.getByTestId("auth-gate")).toContainText(/saved local copy|This device only/i);
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

  test("coach accept emits the deterministic accept event", async ({ page }) => {
    await installAppEventCapture(page);
    await completeCoachReadyOnboarding(page);

    await openCoachTab(page);
    await page.getByTestId("coach-mode-button-adjust_week").click();
    const beforeCount = (await getAnalyticsNames(page)).filter((name) => name === "coach.plan_accept.success").length;
    await page.getByTestId("coach-preview-adjust-week").click();
    await expect(page.getByTestId("coach-preview-card")).toBeVisible();
    await page.getByTestId("coach-preview-accept").click();

    await expect.poll(async () => {
      const analyticsNames = await getAnalyticsNames(page);
      return analyticsNames.filter((name) => name === "coach.plan_accept.success").length - beforeCount;
    }).toBeGreaterThan(0);
  });
});
