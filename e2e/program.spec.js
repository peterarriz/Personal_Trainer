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

function buildResolvedGoal({
  summary,
  planningCategory,
  goalFamily = "",
  primaryMetric = null,
  proxyMetrics = [],
  first30DaySuccessDefinition = "",
} = {}) {
  return {
    id: `resolved_${String(summary || planningCategory || "goal").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
    planningPriority: 1,
    summary,
    planningCategory,
    goalFamily,
    measurabilityTier: primaryMetric?.targetValue ? "fully_measurable" : proxyMetrics.length ? "proxy_measurable" : "exploratory_fuzzy",
    primaryMetric,
    proxyMetrics,
    targetDate: "",
    targetHorizonWeeks: null,
    confidence: "medium",
    unresolvedGaps: [],
    tradeoffs: [],
    reviewCadence: "weekly",
    refinementTrigger: "block_start_or_metric_stall",
    first30DaySuccessDefinition,
  };
}

function buildBenchLog({ weight, reps, sets }) {
  return {
    checkin: { status: "completed_as_planned" },
    performanceRecords: [
      {
        scope: "exercise",
        exercise: "Bench Press",
        actualWeight: weight,
        actualReps: reps,
        actualSets: sets,
        prescribedWeight: weight,
        prescribedReps: reps,
        prescribedSets: sets,
      },
    ],
  };
}

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

test.describe("program inline session detail", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("program keeps the 15-week roadmap concise and shows visible future plan cards", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click({ force: true });

    await expect(page.getByTestId("program-current-week-highlight")).toBeVisible();
    await expect(page.getByTestId("program-current-day-highlight")).toBeVisible();
    await expect(page.getByTestId("program-building-over-time-highlight")).toBeVisible();
    await expect(page.getByTestId("program-roadmap")).toContainText("15-WEEK ARC");
    await expect(page.getByTestId("program-roadmap-grid").locator("[data-testid^='program-roadmap-week-']")).toHaveCount(15);
    await expect(page.getByTestId("program-future-weeks")).toContainText("COMING UP");
    await expect(page.getByTestId("program-future-weeks")).not.toContainText("LATER PHASES");
    await expect(page.getByTestId("program-future-weeks").locator("[data-testid^='program-future-week-card-']").first()).toBeVisible();
    await expect(page.getByTestId("program-future-weeks").locator("[data-testid^='program-future-week-preview-']").first()).toBeVisible();
    await expect(page.getByTestId("program-future-weeks-toggle-all")).toContainText(/show all/i);
  });

  test("current week grid makes today visually obvious at a glance", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const weekGrid = page.getByTestId("program-current-week-grid");
    await expect(weekGrid).toBeVisible();
    await expect(weekGrid.locator("[data-current-day='true']")).toHaveCount(1);
    await expect(weekGrid.locator("[data-current-day='true']")).toContainText("TODAY");
  });

  test("program repairs plan inputs inline instead of sending the user into Settings", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByRole("button", { name: "Skip for now" }).click({ force: true, timeout: 1000 }).catch(() => {});
    await page.getByTestId("app-tab-program").click({ force: true });

    await page.getByTestId("program-fix-metrics").click();
    await expect(page.getByTestId("program-inline-repair")).toBeVisible();
    await expect(page.getByTestId("metrics-baselines-section")).toBeVisible();
    await page.getByTestId("metrics-input-environment-mode").selectOption("Outdoor");
    await expect(page.getByTestId("metrics-input-environment-mode")).toHaveValue("Outdoor");
    await page.getByTestId("metrics-input-environment-equipment").selectOption("none");
    await page.getByTestId("metrics-input-environment-items").fill("running shoes, park loop");
    await page.getByTestId("metrics-input-environment-time").selectOption("45");
    await page.getByTestId("metrics-save-environment").click();

    await expect(page.getByTestId("program-inline-repair")).toContainText("Saved. Future planning now uses your current setup.");
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("settings-tab")).toHaveCount(0);
  });

  test("current week opens detail in the anchored panel and keeps only one row selected", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const thisWeek = page.getByTestId("program-this-week");
    const detailPanel = thisWeek.getByTestId("program-this-week-session-detail-panel");
    const rows = thisWeek.locator("[data-testid^='program-this-week-session-item-']");
    expect(await rows.count()).toBeGreaterThan(1);

    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);
    const firstButton = firstRow.locator("[data-testid^='program-this-week-session-button-']");
    const secondButton = secondRow.locator("[data-testid^='program-this-week-session-button-']");

    await expect(detailPanel).toBeVisible();
    await expect(detailPanel).toContainText("Choose a day in this week");

    await firstButton.focus();
    await firstButton.press("Enter");
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow).toHaveAttribute("data-session-selected", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(1);
    const firstPanelText = await detailPanel.innerText();

    await secondButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstRow).toHaveAttribute("data-session-selected", "false");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(secondRow).toHaveAttribute("data-session-selected", "true");
    await expect(secondRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    await expect(thisWeek.getByTestId("planned-session-plan")).toHaveCount(1);
    expect(await detailPanel.innerText()).not.toBe(firstPanelText);

    await secondButton.click();
    await expect(secondButton).toHaveAttribute("aria-expanded", "false");
    await expect(detailPanel.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel).toContainText("Choose a day in this week");
  });

  test("keyboard navigation moves between days and current-week selection survives rerenders", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const thisWeek = page.getByTestId("program-this-week");
    const detailPanel = thisWeek.getByTestId("program-this-week-session-detail-panel");
    const rows = thisWeek.locator("[data-testid^='program-this-week-session-item-']");
    expect(await rows.count()).toBeGreaterThan(1);

    const firstButton = rows.nth(0).locator("[data-testid^='program-this-week-session-button-']");
    const secondButton = rows.nth(1).locator("[data-testid^='program-this-week-session-button-']");

    await firstButton.focus();
    await firstButton.press("ArrowDown");
    await expect(secondButton).toBeFocused();

    await secondButton.press("Enter");
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();

    const futureWeekCard = page.getByTestId("program-future-weeks").locator("div[data-testid^='program-future-week-card-']").first();
    await futureWeekCard.locator("[data-testid^='program-future-week-toggle-']").click();

    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();

    await secondButton.focus();
    await secondButton.press("Escape");
    await expect(secondButton).toHaveAttribute("aria-expanded", "false");
    await expect(detailPanel.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel).toContainText("Choose a day in this week");
  });

  test("future week preview opens detail in the adjacent panel", async ({ page }) => {
    await completeRunningOnboarding(page);
    await page.getByTestId("app-tab-program").click();

    const futureWeeks = page.getByTestId("program-future-weeks");
    const futureWeekCard = futureWeeks.locator("div[data-testid^='program-future-week-card-']").first();
    await futureWeekCard.locator("[data-testid^='program-future-week-toggle-']").click();

    const detailPanel = futureWeekCard.getByTestId("program-future-week-session-detail-panel");
    const rows = futureWeekCard.locator("[data-testid^='program-future-week-session-item-']");
    expect(await rows.count()).toBeGreaterThan(1);

    const firstRow = rows.nth(0);
    const secondRow = rows.nth(1);
    const firstButton = firstRow.locator("[data-testid^='program-future-week-session-button-']");
    const secondButton = secondRow.locator("[data-testid^='program-future-week-session-button-']");

    await expect(detailPanel).toBeVisible();
    await expect(detailPanel).toContainText("Choose an upcoming day");

    await firstButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    await expect(secondRow.getByTestId("planned-session-plan")).toHaveCount(0);
    const firstPanelText = await detailPanel.innerText();

    await secondButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(secondRow.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel.getByTestId("planned-session-plan")).toBeVisible();
    expect(await detailPanel.innerText()).not.toBe(firstPanelText);

    await secondButton.click();
    await expect(secondButton).toHaveAttribute("aria-expanded", "false");
    await expect(detailPanel.getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(detailPanel).toContainText("Choose an upcoming day");
  });

  test("hybrid run-plus-strength roadmap keeps strength days visible in the zoomed-out view", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    payload.goals = [
      {
        id: "goal_1",
        name: "Run a 1:45 half marathon",
        category: "running",
        active: true,
        priority: 1,
        targetDate: "2026-10-10",
      },
      {
        id: "goal_2",
        name: "Bench 225",
        category: "strength",
        active: true,
        priority: 2,
      },
    ];

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });
    await page.getByTestId("app-tab-program").click();

    const roadmap = page.getByTestId("program-roadmap");
    await expect(roadmap).toBeVisible();
    await expect(roadmap).toContainText(/strength day|strength days/i);
    await expect(roadmap).toContainText(/long run/i);
  });

  test("strength-first roadmap follows the primary goal and keeps secondary-goal progress visible", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    payload.goals = [
      {
        id: "goal_1",
        name: "Bench 225",
        category: "strength",
        active: true,
        priority: 1,
        resolvedGoal: buildResolvedGoal({
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
        }),
      },
      {
        id: "goal_2",
        name: "Run a 1:45 half marathon",
        category: "running",
        active: true,
        priority: 2,
        targetDate: "2026-10-10",
        resolvedGoal: buildResolvedGoal({
          summary: "Run a 1:45 half marathon",
          planningCategory: "running",
          goalFamily: "performance",
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", targetValue: "1:45:00" },
          proxyMetrics: [
            { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
            { key: "long_run_duration", label: "Long run duration", unit: "min", kind: "proxy" },
          ],
        }),
      },
    ];
    payload.logs = {
      "2026-04-08": buildBenchLog({ weight: 195, reps: 3, sets: 2 }),
      "2026-04-10": { type: "Long Run", miles: 10, runTime: "86:00", pace: "8:36", feel: 3, checkin: { status: "completed_as_planned" } },
    };

    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });
    await page.getByTestId("app-tab-program").click();

    const roadmap = page.getByTestId("program-roadmap");
    await expect(roadmap).toBeVisible();
    await expect(roadmap).toContainText("STRENGTH BUILD");
    await expect(roadmap).not.toContainText("Peak visible long run");

    await expect(page.getByTestId("program-roadmap-goal-highlights")).toHaveCount(0);
    await expect(page.getByTestId("program-tab")).toContainText(/build pressing strength|strength work/i);
    await expect(page.getByTestId("program-tab")).toContainText(/run support/i);
  });
});
