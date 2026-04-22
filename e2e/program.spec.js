const { test, expect } = require("@playwright/test");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  dismissAppleHealthPromptIfVisible,
  gotoIntakeInLocalMode,
  waitForReview,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");
const {
  bootAppWithSupabaseSeeds,
  makeSignedInPayload,
  makeSession,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

async function completeRunningOnboarding(page) {
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

async function bootSignedInPlanSurface(page, payload = null) {
  const session = makeSession();
  const seededPayload = payload || makeSignedInPayload();
  await mockSupabaseRuntime(page, { session, payload: seededPayload });
  await bootAppWithSupabaseSeeds(page, { session, payload: seededPayload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("today-tab")).toBeVisible();
}

test.describe("plan surface regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("plan keeps a compact committed-week brief instead of duplicating Today", async ({ page }) => {
    await bootSignedInPlanSurface(page);
    await page.getByTestId("app-tab-program").click({ force: true });

    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-trajectory-header")).toBeVisible();
    await expect(page.getByTestId("program-current-day-context")).toBeVisible();
    await expect(page.getByTestId("program-header-trust-row")).toBeVisible();
    await expect(page.getByTestId("program-roadmap-grid").locator("[data-testid^='program-roadmap-week-']")).toHaveCount(4);
    await expect(page.getByTestId("program-current-week-grid").locator("[data-testid^='program-current-week-cell-']")).toHaveCount(7);
    await expect(page.getByTestId("program-upcoming-key-sessions")).toBeVisible();
    await expect(page.getByTestId("program-future-weeks")).toBeVisible();
    await expect(page.getByTestId("program-primary-cta")).toHaveText("Open Today");
    await expect(page.getByTestId("program-secondary-cta")).toHaveText("Open Log");
    await expect(page.getByTestId("program-tab")).not.toContainText("Rules for today");
    await expect(page.getByTestId("program-tab")).not.toContainText("Effort:");
  });

  test("current-week selection stays anchored in one detail panel", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const thisWeek = page.getByTestId("program-this-week");
    const detailPanel = thisWeek.getByTestId("program-this-week-session-detail-panel");
    const rows = thisWeek.locator("[data-testid^='program-this-week-session-item-']");
    await expect.poll(() => rows.count()).toBeGreaterThan(1);

    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);
    const firstButton = firstRow.locator("[data-testid^='program-this-week-session-button-']");
    const secondButton = secondRow.locator("[data-testid^='program-this-week-session-button-']");

    await expect(detailPanel).toContainText(/choose a day in this week/i);

    await firstButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow).toHaveAttribute("data-session-selected", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(1);

    await secondButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstRow).toHaveAttribute("data-session-selected", "false");
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(secondRow).toHaveAttribute("data-session-selected", "true");
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(1);

    await secondButton.click();
    await expect(secondButton).toHaveAttribute("aria-expanded", "false");
    await expect(detailPanel.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel).toContainText(/choose a day in this week/i);
  });

  test("hybrid goals keep mixed-modality intent visible", async ({ page }) => {
    const payload = makeSignedInPayload();
    payload.goals = [
      {
        id: "goal_run",
        name: "Run a stronger half marathon",
        category: "running",
        active: true,
        priority: 1,
        targetDate: "2026-10-10",
      },
      {
        id: "goal_strength",
        name: "Bench 225",
        category: "strength",
        active: true,
        priority: 2,
      },
      {
        id: "goal_physique",
        name: "Visible abs",
        category: "body_comp",
        active: true,
        priority: 3,
      },
    ];

    await bootSignedInPlanSurface(page, payload);
    await page.getByTestId("app-tab-program").click({ force: true });

    await expect(page.getByTestId("program-tab")).toContainText(/Goal alignment/i);
    await expect(page.getByTestId("program-tab")).toContainText(/Bench 225/i);
    await expect(page.getByTestId("program-tab")).toContainText(/half marathon/i);
    await expect(page.getByTestId("program-upcoming-key-sessions")).toContainText(/strength|run|tempo|long/i);
  });

  test("strength-first plan still keeps preview context and current-week structure readable", async ({ page }) => {
    const payload = makeSignedInPayload();
    payload.goals = [
      {
        id: "goal_strength",
        name: "Bench 225",
        category: "strength",
        active: true,
        priority: 1,
      },
      {
        id: "goal_run",
        name: "Run a 1:45 half marathon",
        category: "running",
        active: true,
        priority: 2,
        targetDate: "2026-10-10",
      },
    ];

    await bootSignedInPlanSurface(page, payload);
    await page.getByTestId("app-tab-program").click({ force: true });

    await expect(page.getByTestId("program-trajectory-title")).toBeVisible();
    await expect(page.getByTestId("program-current-week-grid")).toBeVisible();
    await expect(page.getByTestId("program-future-weeks")).toBeVisible();
    await expect(page.getByTestId("program-tab")).toContainText(/strength|bench|press/i);
    await expect(page.getByTestId("program-tab")).toContainText(/preview|next/i);
  });
});
