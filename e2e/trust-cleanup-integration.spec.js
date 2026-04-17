const { test, expect } = require("@playwright/test");

require("sucrase/register");

const {
  buildPersistedTrainerPayload,
  DEFAULT_COACH_PLAN_ADJUSTMENTS,
  DEFAULT_NUTRITION_FAVORITES,
} = require("../src/services/persistence-adapter-service.js");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const AUTH_CACHE_KEY = "trainer_auth_session_v1";
const LOCAL_CACHE_KEY = "trainer_local_cache_v4";

const buildSeedState = () => {
  const todayKey = new Date().toISOString().split("T")[0];
  return {
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
        bodyweights: [{ date: todayKey, w: 186 }],
        personalization: {
          profile: {
            name: "Taylor",
            age: 32,
            weight: 186,
            height: "6'0\"",
            onboardingComplete: true,
          },
          settings: {
            appearance: { theme: "System" },
          },
          connectedDevices: {},
          localFoodContext: {
            city: "Chicago",
            groceryOptions: ["Trader Joe's"],
          },
        },
        coachPlanAdjustments: DEFAULT_COACH_PLAN_ADJUSTMENTS,
        nutritionFavorites: DEFAULT_NUTRITION_FAVORITES,
      },
    }),
  };
};

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

const openApp = async (page) => {
  await seedAppState(page);
  await page.goto(`/?e2e=${Date.now()}`);
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  await expect(page.getByTestId("app-tab-nutrition")).toBeVisible();
  const skipAppleHealth = page.getByRole("button", { name: "Skip for now" });
  await skipAppleHealth.waitFor({ state: "visible", timeout: 1500 }).catch(() => null);
  if (await skipAppleHealth.isVisible().catch(() => false)) {
    await skipAppleHealth.click({ force: true });
    await expect(skipAppleHealth).toBeHidden();
  }
};

const openSettings = async (page) => {
  await page.getByRole("button", { name: "Open settings" }).click({ force: true });
};

const openTab = async (page, testId) => {
  await page.getByTestId(testId).click({ force: true });
};

const getHydrationButton = (page) => page.locator(".card").filter({ hasText: "HYDRATION / SUPPLEMENT" }).getByRole("button").first();

const readHydrationNumbers = async (page) => {
  const text = await getHydrationButton(page).innerText();
  const match = text.match(/(\d+)\s+oz logged[\s\S]*?(?:Target|Suggested)\s+(\d+)\s+oz/i);
  if (!match) {
    throw new Error(`Could not parse hydration text: ${text}`);
  }
  return {
    loggedOz: Number(match[1]),
    targetOz: Number(match[2]),
  };
};

test("Settings account controls show visible feedback and sign-out result", async ({ page }) => {
  const session = makeSession({ email: "tester@example.com" });
  const payload = makeSignedInPayload();
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  const skipAppleHealth = page.getByRole("button", { name: "Skip for now" });
  await skipAppleHealth.waitFor({ state: "visible", timeout: 1500 }).catch(() => null);
  if (await skipAppleHealth.isVisible().catch(() => false)) {
    await skipAppleHealth.click({ force: true });
    await expect(skipAppleHealth).toBeHidden();
  }
  await openSettings(page);

  const accountSection = page.getByTestId("settings-account-section");
  await expect(accountSection.getByText("Account & sync")).toBeVisible();
  await expect(accountSection.getByText("Signed in as tester@example.com")).toBeVisible();
  await expect(page.getByTestId("settings-sync-status")).toBeVisible();
  await expect(page.getByTestId("settings-sync-status")).toContainText(/Cloud and device are aligned|Synced/i);

  await page.getByRole("button", { name: "Reload cloud data" }).click();
  await expect(page.getByText(/Reloaded cloud data|Cloud data could not be reloaded right now/i)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Sign in to cloud account")).toBeVisible();
});

test("Nutrition hydration logging stays usable across and above target", async ({ page }) => {
  await openApp(page);
  await openTab(page, "app-tab-nutrition");
  await expect(page.getByText("TODAY'S MEAL STRATEGY")).toBeVisible();

  const before = await readHydrationNumbers(page);
  for (let index = 0; index < 12; index += 1) {
    const current = await readHydrationNumbers(page);
    if (current.loggedOz > current.targetOz) break;
    await getHydrationButton(page).click();
    await expect.poll(async () => (await readHydrationNumbers(page)).loggedOz).toBeGreaterThan(current.loggedOz);
  }
  const after = await readHydrationNumbers(page);

  expect(after.loggedOz).toBeGreaterThan(before.loggedOz);
  expect(after.loggedOz).toBeGreaterThan(after.targetOz);
  await expect(page.getByText(/Target \d+ oz|Suggested \d+ oz/)).toBeVisible();
});

test("Nutrition hides supplement checklist until a stored plan exists", async ({ page }) => {
  await openApp(page);
  await openTab(page, "app-tab-nutrition");
  await expect(page.getByText("TODAY'S MEAL STRATEGY")).toBeVisible();

  const hydrationCard = page.locator(".card").filter({ hasText: "HYDRATION / SUPPLEMENT" });
  await expect(hydrationCard.getByText("No supplement checklist is shown until a stored supplement plan is attached to today.")).toBeVisible();
  await expect(hydrationCard.getByRole("button", { name: "Why" })).toHaveCount(0);
});

test("Coach keeps only applied-action surfaces visible", async ({ page }) => {
  await openApp(page);
  await openTab(page, "app-tab-coach");

  await expect(page.getByTestId("coach-mode-switcher")).toBeVisible();
  await expect(page.getByTestId("coach-mode-panel-adjust_today")).toBeVisible();
  await expect(page.getByText("Helpful?")).toHaveCount(0);
  await expect(page.getByText("MEMORY / SETTINGS")).toHaveCount(0);
  await expect(page.getByPlaceholder("Anthropic key (optional)")).toHaveCount(0);

  await page.getByTestId("coach-preview-adjust-today").click();
  await expect(page.getByTestId("coach-action-preview")).toContainText(/Week \d+ volume target becomes|Nothing changes until/i);
});

test("Program and Log history copy stays free of internal jargon", async ({ page }) => {
  await openApp(page);

  await openTab(page, "app-tab-program");
  await expect(page.getByTestId("program-this-week")).toBeVisible();
  await expect(page.getByTestId("program-week-review")).toBeVisible();
  await expect(page.getByTestId("program-week-review")).toContainText("WHAT WAS PLANNED");
  await expect(page.getByTestId("program-week-review")).toContainText("WHAT CHANGES NEXT");
  await expect(page.getByText("COMMITTED WEEK HISTORY")).toHaveCount(0);
  await expect(page.getByText(/durable\s+PlanWeek|canonical\s+PlanWeek|PlanWeek snapshot/i)).toHaveCount(0);
  await expect(page.getByTestId("program-week-review").getByText(/Capture \d+:|revision|Durability:/i)).toHaveCount(0);

  await openTab(page, "app-tab-log");
  const logTab = page.getByTestId("log-tab");
  await logTab.getByTestId("log-day-review-disclosure").getByText("Saved day review", { exact: true }).click();
  const dayReview = logTab.locator("[data-testid='history-day-review-card']").first();
  await expect(dayReview).toBeVisible();
  const dayReviewPrimary = dayReview.getByTestId("history-day-review-primary");
  await expect(dayReviewPrimary).toBeVisible();
  await expect(dayReviewPrimary.getByText("Why It Mattered", { exact: true })).toBeVisible();
  await expect(dayReviewPrimary.getByText("What changes next", { exact: true })).toBeVisible();
  await expect(dayReviewPrimary.getByText(/Capture \d+:|Saved because:|Durability:/i)).toHaveCount(0);
  await expect(page.getByText("WEEK REVIEW HISTORY")).toHaveCount(1);
  await expect(page.getByText(/Rev\s+\d+\s+of\s+\d+/i)).toHaveCount(0);
  await expect(page.getByText(/durable\s+PlanWeek|canonical\s+PlanWeek|PlanWeek snapshot/i)).toHaveCount(0);

  await dayReview.getByText("Audit mode").click();
  await expect(dayReview.getByText("Plan capture history")).toBeVisible();
  await expect(dayReview.getByText(/Saved because:/i)).toBeVisible();
});

test("Today keeps one workout surface and Log keeps detailed entry inside Log workout", async ({ page }) => {
  await openApp(page);

  const todayTab = page.getByTestId("today-tab");
  await expect(todayTab).toBeVisible();
  await expect(todayTab.getByTestId("planned-session-plan")).toHaveCount(1);
  await expect(todayTab.getByText("LOG TODAY", { exact: true })).toHaveCount(1);

  await openTab(page, "app-tab-log");
  await expect(page.getByTestId("log-tab")).toBeVisible();
  await expect(page.getByText("Detailed workout log")).toHaveCount(0);
  const detailedEntry = page.getByTestId("log-detailed-entry");
  await expect(detailedEntry).toBeVisible();
  await expect(detailedEntry.getByTestId("planned-session-plan")).toBeVisible();
});
