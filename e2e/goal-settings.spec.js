const { test, expect } = require("@playwright/test");

require("sucrase/register");

test.describe.configure({ timeout: 120000 });

const {
  bootAppWithSupabaseSeeds,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const {
  buildPersistedTrainerPayload,
  DEFAULT_COACH_PLAN_ADJUSTMENTS,
  DEFAULT_NUTRITION_FAVORITES,
} = require("../src/services/persistence-adapter-service.js");

const buildGoal = ({
  runtimeId,
  recordId,
  summary,
  category = "strength",
  goalFamily = "strength",
  priority = 1,
  targetDate = "",
  targetHorizonWeeks = null,
  primaryMetric = null,
  proxyMetrics = [],
  unresolvedGaps = [],
} = {}) => ({
  id: runtimeId,
  goalRecordId: recordId,
  name: summary,
  category,
  priority,
  active: true,
  status: "active",
  targetDate,
  targetHorizonWeeks,
  measurableTarget: primaryMetric?.targetValue ? `${primaryMetric.label} ${primaryMetric.targetValue}` : summary,
  primaryMetric,
  proxyMetrics,
  tracking: category === "running"
    ? { mode: "progress_tracker", metricKey: primaryMetric?.key || proxyMetrics?.[0]?.key || "" }
    : category === "body_comp"
    ? { mode: "weekly_checkin", metricKey: proxyMetrics?.[0]?.key || primaryMetric?.key || "", unit: proxyMetrics?.[0]?.unit || "lb" }
    : { mode: "logged_lifts", metricKey: primaryMetric?.key || "", unit: primaryMetric?.unit || "lb" },
  resolvedGoal: {
    id: recordId,
    summary,
    planningCategory: category,
    goalFamily,
    planningPriority: priority,
    targetDate,
    targetHorizonWeeks,
    primaryMetric,
    proxyMetrics,
    confirmedByUser: true,
    confirmationSource: "e2e_seed",
    confidence: "medium",
    measurabilityTier: primaryMetric?.targetValue ? "fully_measurable" : proxyMetrics.length ? "proxy_measurable" : "exploratory_fuzzy",
    tradeoffs: category === "strength" ? ["Strength focus can steal some recovery from running."] : [],
    unresolvedGaps,
    reviewCadence: "weekly",
    refinementTrigger: "30_day_resolution_review",
  },
});

const buildSeedState = () => ({
  authSession: {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "tester@example.com",
    },
  },
  persistedPayload: buildPersistedTrainerPayload({
    runtimeState: {
      bodyweights: [{ date: "2026-04-14", w: 188 }],
      goals: [
        buildGoal({
          runtimeId: "goal_running",
          recordId: "goal_running_record",
          summary: "Run a half marathon in 1:45:00",
          category: "running",
          goalFamily: "performance",
          priority: 1,
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", targetValue: "1:45:00", unit: "time" },
        }),
        buildGoal({
          runtimeId: "goal_bench",
          recordId: "goal_bench_record",
          summary: "Bench press 225 lb",
          category: "strength",
          goalFamily: "strength",
          priority: 2,
          targetHorizonWeeks: 16,
          primaryMetric: { key: "bench_press_weight", label: "Bench 1RM", targetValue: "225", unit: "lb" },
        }),
        buildGoal({
          runtimeId: "goal_cut",
          recordId: "goal_cut_record",
          summary: "Get lean for summer",
          category: "body_comp",
          goalFamily: "body_comp",
          priority: 3,
          targetDate: "2026-07-01",
          proxyMetrics: [{ key: "waist", label: "Waist trend", unit: "in" }],
          unresolvedGaps: ["Target shape still needs tightening."],
        }),
        {
          id: "g_resilience",
          name: "Resilience & injury prevention",
          category: "injury_prevention",
          priority: 4,
          active: true,
          status: "active",
          resolvedGoal: null,
          tracking: { mode: "progress_tracker" },
        },
      ],
      personalization: {
        profile: {
          name: "Taylor",
          timezone: "America/Chicago",
          birthYear: 1994,
          age: 32,
          weight: 188,
          bodyweight: 188,
          height: "6'0\"",
          trainingAgeYears: 3,
          onboardingComplete: true,
          profileSetupComplete: true,
        },
        settings: {
          units: { weight: "lbs", height: "ft_in", distance: "miles" },
          trainingPreferences: { intensityPreference: "Standard", defaultEnvironment: "Gym" },
          appearance: { theme: "System" },
        },
        goalManagement: {
          version: 1,
          archivedGoals: [],
          history: [],
        },
      },
      coachPlanAdjustments: DEFAULT_COACH_PLAN_ADJUSTMENTS,
      nutritionFavorites: DEFAULT_NUTRITION_FAVORITES,
    },
  }),
});

const seedAppState = async (page) => {
  const seedState = buildSeedState();
  await mockSupabaseRuntime(page, {
    session: seedState.authSession,
    payload: seedState.persistedPayload,
  });
  return seedState;
};

const openGoalManagement = async (page) => {
  const seedState = await seedAppState(page);
  await bootAppWithSupabaseSeeds(page, {
    session: seedState.authSession,
    payload: seedState.persistedPayload,
    path: `/?e2e=${Date.now()}`,
  });
  await expect(page.getByTestId("app-tab-settings")).toBeVisible();
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await page.getByTestId("settings-surface-goals").click();
  await expect(page.getByTestId("settings-goals-section")).toBeVisible();
  await expect(page.getByTestId("settings-goals-management")).toBeVisible();
  await expect(page.getByTestId("settings-goals-section")).not.toContainText(/authoritative place|older plan-management/i);
};

const confirmGoalPreview = async (page) => {
  await page.getByTestId("settings-goals-confirm-preview").evaluate((node) => node.click());
};

test("Settings goals management reprioritizes with preview before commit", async ({ page }) => {
  await openGoalManagement(page);

  await expect(page.getByTestId("settings-goal-card-goal_bench_record")).toContainText("Target horizon: about 16 weeks");

  await page.getByTestId("settings-goal-move-up-goal_bench_record").click();
  await page.getByTestId("settings-goals-preview-reorder").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/Bench press 225 lb moves to the top|Priority 1 is Bench press 225 lb/i);
  await confirmGoalPreview(page);

  await expect(page.getByTestId("settings-goal-card-goal_bench_record")).toContainText("Priority 1");
  await expect(page.getByTestId("settings-goal-card-goal_running_record")).toContainText("Priority 2");
});

test("Settings goals cards let the user repair open target details in place", async ({ page }) => {
  await openGoalManagement(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText("Still open: Target shape still needs tightening.");
  await page.getByTestId("settings-goal-fix-clarity-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await expect(page.getByTestId("settings-goal-editor-summary")).toHaveValue("Get lean for summer");
});

test("Settings goals management edits a dated goal into an open-ended goal with preview", async ({ page }) => {
  await openGoalManagement(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText("Target date:");

  await page.getByTestId("settings-goal-edit-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-timing-open_ended").click();
  await page.getByTestId("settings-goal-editor-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/Open-ended|No fixed deadline|next 3 months/i);
  await confirmGoalPreview(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText("Open-ended");
});

test("Settings goals management can add a library-based goal without relying on free text", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goals-add").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-category-endurance").click();
  await page.getByTestId("settings-goal-editor-template-swim_better").click();
  await page.getByTestId("settings-goal-editor-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/Improve swim fitness|Swim better/i);
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/joins your active goals|enters the active stack|active goals/i);
  await confirmGoalPreview(page);

  await expect(page.getByTestId("settings-goals-management")).toContainText(/Swim better|Improve swim fitness/i);
});

test("Settings goals management can swap an active goal onto a library path without typing a new description", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-edit-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-category-physique").click();
  await page.getByTestId("settings-goal-editor-template-get_leaner").click();
  await page.getByTestId("settings-goal-editor-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/Get leaner|look athletic/i);
  await confirmGoalPreview(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText(/Get leaner|look athletic/i);
});

test("Settings goals management archives and restores a goal through explicit previews", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-archive-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-archive-sheet")).toBeVisible();
  await page.getByTestId("settings-goal-archive-status-archived").click();
  await page.getByTestId("settings-goal-archive-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("is archived");
  await confirmGoalPreview(page);

  await page.getByTestId("settings-goals-lifecycle").locator("summary").first().click();
  await expect(page.getByTestId("settings-goals-bucket-archived")).toContainText("Archived goals");
  await expect(page.getByTestId("settings-archived-goal-goal_cut_record")).toBeVisible();
  await page.getByTestId("settings-goal-restore-goal_cut_record").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/returns to your active goals|starts shaping the plan again/i);
  await confirmGoalPreview(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toBeVisible();
});

test("Settings goals management marks a goal completed without rewriting the active stack immediately", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-archive-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-archive-sheet")).toBeVisible();
  await page.getByTestId("settings-goal-archive-status-completed").click();
  await page.getByTestId("settings-goal-archive-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/marked complete|is marked complete/i);
  await confirmGoalPreview(page);

  await page.getByTestId("settings-goals-lifecycle").locator("summary").first().click();
  await expect(page.getByTestId("settings-goals-bucket-completed")).toContainText("Completed goals");
  await expect(page.getByTestId("settings-archived-goal-goal_cut_record")).toBeVisible();
});

test("Settings goals management pauses and resumes a goal through explicit previews", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-archive-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-archive-sheet")).toBeVisible();
  await page.getByTestId("settings-goal-archive-status-paused").click();
  await page.getByTestId("settings-goal-archive-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/into Paused|into paused/i);
  await confirmGoalPreview(page);

  await page.getByTestId("settings-goals-lifecycle").locator("summary").first().click();
  await expect(page.getByTestId("settings-goals-bucket-paused")).toContainText("Paused goals");
  await expect(page.getByTestId("settings-goal-restore-goal_cut_record")).toContainText("Resume");
  await page.getByTestId("settings-goal-restore-goal_cut_record").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(/returns to your active goals|starts shaping the plan again/i);
  await confirmGoalPreview(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toBeVisible();
});
