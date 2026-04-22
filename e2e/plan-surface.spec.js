const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSignedInPayload,
  makeSession,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const bootSignedInPlanSurface = async (page, payload = null) => {
  const session = makeSession();
  const seededPayload = payload || makeSignedInPayload();
  await mockSupabaseRuntime(page, { session, payload: seededPayload });
  await bootAppWithSupabaseSeeds(page, { session, payload: seededPayload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("today-tab")).toBeVisible();
};

test.describe("plan surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("loads a compact committed week with preview context instead of duplicating Today", async ({ page }) => {
    await bootSignedInPlanSurface(page);
    await page.getByTestId("app-tab-program").click({ force: true });

    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-trajectory-header")).toBeVisible();
    await expect(page.getByTestId("program-trajectory-title")).toBeVisible();
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

  test("shows mixed-modality weeks coherently for hybrid goals", async ({ page }) => {
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
    await expect(page.getByTestId("program-tab")).toContainText(/strength day|run day|long run/i);
    await expect(page.getByTestId("program-upcoming-key-sessions")).toContainText(/strength|run|tempo|long/i);
  });

  test("shows exact goal distance rails without faking percent bars for proxy goals", async ({ page }) => {
    const payload = makeSignedInPayload();
    payload.goals = [
      {
        id: "goal_bench",
        name: "Bench 225",
        category: "strength",
        active: true,
        priority: 1,
        resolvedGoal: {
          id: "resolved_goal_bench",
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          planningPriority: 1,
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
        },
      },
      {
        id: "goal_abs",
        name: "Visible abs",
        category: "body_comp",
        active: true,
        priority: 2,
        resolvedGoal: {
          id: "resolved_goal_abs",
          summary: "Visible abs",
          planningCategory: "body_comp",
          goalFamily: "appearance",
          planningPriority: 2,
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [
            { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
            { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", kind: "proxy" },
          ],
          reviewCadence: "weekly",
        },
      },
    ];
    payload.logs = {
      "2026-04-01": {
        checkin: { status: "completed_as_planned" },
        performanceRecords: [
          {
            scope: "exercise",
            exercise: "Bench Press",
            actualWeight: 185,
            actualReps: 5,
            actualSets: 3,
            prescribedWeight: 185,
            prescribedReps: 5,
            prescribedSets: 3,
          },
        ],
      },
      "2026-04-08": {
        checkin: { status: "completed_as_planned" },
        performanceRecords: [
          {
            scope: "exercise",
            exercise: "Bench Press",
            actualWeight: 195,
            actualReps: 3,
            actualSets: 2,
            prescribedWeight: 195,
            prescribedReps: 3,
            prescribedSets: 2,
          },
        ],
      },
    };

    await bootSignedInPlanSurface(page, payload);
    await page.getByTestId("app-tab-program").click({ force: true });

    const goalDistance = page.getByTestId("program-goal-distance");
    await expect(goalDistance).toBeVisible();
    const benchRail = goalDistance.locator("[data-testid^='program-goal-distance-item-']").filter({ hasText: /Bench 225/i }).first();
    await expect(benchRail).toContainText(/Bench 225/i);
    await expect(benchRail).toContainText(/30 lb to goal/i);
    await expect(benchRail).toContainText(/195 lb current/i);

    const absStatus = goalDistance.locator("[data-testid^='program-goal-distance-item-']").filter({ hasText: /Visible abs/i }).first();
    await expect(absStatus).toContainText(/Visible abs/i);
    await expect(absStatus).toContainText(/Building through proxies/i);
    await expect(absStatus).not.toContainText(/to goal/i);
  });

  test("handles an adjusted day without breaking the weekly layout or trust cues", async ({ page }) => {
    const payload = makeSignedInPayload();
    const todayKey = new Date().toISOString().split("T")[0];
    payload.logs = {
      [todayKey]: {
        actualSession: {
          status: "completed_modified",
          sessionLabel: "Modified session",
          sessionType: "easy-run",
        },
      },
    };
    payload.dailyCheckins = {
      [todayKey]: {
        status: "completed_modified",
      },
    };

    await bootSignedInPlanSurface(page, payload);
    await page.getByTestId("app-tab-program").click({ force: true });

    const todayCell = page.getByTestId("program-current-week-grid").locator("[data-current-day='true']").first();
    await expect(todayCell).toContainText("Adjusted");
    await todayCell.click();

    const detailPanel = page.getByTestId("program-this-week-session-detail-panel");
    await expect(detailPanel).toContainText(/modified session|adjusted/i);
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    await expect(detailPanel.getByTestId("program-day-trust-row")).toContainText(/Adaptive day|Adjusted/i);
    await expect(detailPanel.getByRole("button", { name: "Open Today" })).toBeVisible();
    await expect(detailPanel.getByRole("button", { name: "Open Log" })).toBeVisible();
    await expect(page.getByTestId("program-current-week-grid").locator("[data-testid^='program-current-week-cell-']")).toHaveCount(7);
  });
});
