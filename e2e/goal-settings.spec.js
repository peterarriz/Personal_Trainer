const { test, expect } = require("@playwright/test");

require("sucrase/register");

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
    unresolvedGaps: [],
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
  await page.addInitScript((seed) => {
    const lockedAuthSession = JSON.stringify(seed.authSession);
    const lockedCachePayload = JSON.stringify(seed.persistedPayload);
    window.localStorage.setItem("trainer_auth_session_v1", lockedAuthSession);
    window.localStorage.setItem("trainer_local_cache_v4", lockedCachePayload);
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (key === "trainer_auth_session_v1") {
        return originalSetItem.call(this, key, lockedAuthSession);
      }
      if (key === "trainer_local_cache_v4") {
        return originalSetItem.call(this, key, lockedCachePayload);
      }
      return originalSetItem.call(this, key, value);
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (/example\.supabase\.co/i.test(url)) {
        if (/\/rest\/v1\//i.test(url)) {
          return new Response(JSON.stringify({ message: "stubbed integration failure" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (/\/auth\/v1\/logout/i.test(url)) {
          return new Response("", { status: 204 });
        }
        return new Response(JSON.stringify({ message: "stubbed auth response" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
  }, seedState);
};

const openGoalManagement = async (page) => {
  await seedAppState(page);
  await page.goto(`/?e2e=${Date.now()}`);
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click({ force: true });
  await page.getByTestId("settings-surface-goals").click();
  await expect(page.getByTestId("settings-goals-section")).toBeVisible();
  await expect(page.getByTestId("settings-goals-management")).toBeVisible();
};

test("Settings goals management reprioritizes with preview before commit", async ({ page }) => {
  await openGoalManagement(page);

  await expect(page.getByTestId("settings-goal-card-goal_bench_record")).toContainText("Target horizon: about 16 weeks");

  await page.getByTestId("settings-goal-move-up-goal_bench_record").click();
  await page.getByTestId("settings-goals-preview-reorder").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("Bench press 225 lb moves into Priority 1");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goal-card-goal_bench_record")).toContainText("Priority 1");
  await expect(page.getByTestId("settings-goal-card-goal_running_record")).toContainText("Priority 2");
});

test("Settings goals management edits a dated goal into an open-ended goal with preview", async ({ page }) => {
  await openGoalManagement(page);

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText("Target date:");

  await page.getByTestId("settings-goal-edit-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-timing-open_ended").click();
  await page.getByTestId("settings-goal-editor-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("Open-ended");
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("next 3 months");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText("Open-ended");
});

test("Settings goals management can add a library-based goal without relying on free text", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goals-add").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-category-swim").click();
  await page.getByTestId("settings-goal-editor-template-swim_faster_mile").click();
  await page.getByTestId("settings-goal-editor-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("Swim a faster mile");
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("joins the active priority order");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goals-management")).toContainText("Swim a faster mile");
});

test("Settings goals management can swap an active goal onto a library path without typing a new description", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-edit-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-category-physique").click();
  await page.getByTestId("settings-goal-editor-template-look_athletic_again").click();
  await page.getByTestId("settings-goal-editor-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("Look athletic again");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toContainText("Look athletic again");
});

test("Settings goals management archives and restores a goal through explicit previews", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-archive-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-archive-sheet")).toBeVisible();
  await page.getByTestId("settings-goal-archive-status-archived").click();
  await page.getByTestId("settings-goal-archive-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("is archived");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goals-bucket-archived")).toContainText("Archived goals");
  await expect(page.getByTestId("settings-archived-goal-goal_cut_record")).toBeVisible();
  await page.getByTestId("settings-goal-restore-goal_cut_record").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("returns to the active priority order");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toBeVisible();
});

test("Settings goals management marks a goal completed without rewriting the active stack immediately", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-archive-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-archive-sheet")).toBeVisible();
  await page.getByTestId("settings-goal-archive-status-completed").click();
  await page.getByTestId("settings-goal-archive-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("marked completed");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goals-bucket-completed")).toContainText("Completed goals");
  await expect(page.getByTestId("settings-archived-goal-goal_cut_record")).toBeVisible();
});

test("Settings goals management pauses and resumes a goal through explicit previews", async ({ page }) => {
  await openGoalManagement(page);

  await page.getByTestId("settings-goal-archive-goal_cut_record").click();
  await expect(page.getByTestId("settings-goal-archive-sheet")).toBeVisible();
  await page.getByTestId("settings-goal-archive-status-paused").click();
  await page.getByTestId("settings-goal-archive-preview").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("into paused goals");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goals-bucket-paused")).toContainText("Paused goals");
  await expect(page.getByTestId("settings-goal-restore-goal_cut_record")).toContainText("Resume");
  await page.getByTestId("settings-goal-restore-goal_cut_record").click();
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText("returns to the active priority order");
  await page.getByTestId("settings-goals-confirm-preview").click();

  await expect(page.getByTestId("settings-goal-card-goal_cut_record")).toBeVisible();
});
