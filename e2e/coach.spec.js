const { test, expect } = require("@playwright/test");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  gotoIntakeInLocalMode,
  readLocalCache,
  waitForReview,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");

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
}

test.describe("coach surface", () => {
  test("mode switcher cleanly separates deterministic and advisory surfaces", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-coach").click();
    await expect(page.getByTestId("coach-tab")).toBeVisible();
    await expect(page.getByTestId("coach-mode-panel-today_week")).toBeVisible();

    await page.getByTestId("coach-mode-button-change_plan").click();
    await expect(page.getByTestId("coach-mode-panel-change_plan")).toBeVisible();
    await expect(page.getByTestId("coach-action-preview")).toContainText("Pick a change");

    await page.getByTestId("coach-mode-button-ask_anything").click();
    await expect(page.getByTestId("coach-mode-panel-ask_anything")).toBeVisible();
    await expect(page.getByTestId("coach-advisory-boundary")).toContainText(/Advisory|off/i);
  });

  test("deterministic change preview does not mutate until acceptance", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-coach").click();
    const beforeCache = await readLocalCache(page);
    const beforeActionCount = Array.isArray(beforeCache?.coachActions) ? beforeCache.coachActions.length : 0;

    await page.getByTestId("coach-mode-button-change_plan").click();
    await page.getByTestId("coach-change-action-reduce_week_volume").click();

    await expect(page.getByTestId("coach-action-preview")).toContainText(/Week \d+ volume target becomes|Take pressure off this week/i);
    await expect(page.getByTestId("coach-preview-accept")).toBeVisible();

    const previewCache = await readLocalCache(page);
    expect(Array.isArray(previewCache?.coachActions) ? previewCache.coachActions.length : 0).toBe(beforeActionCount);

    await page.getByTestId("coach-preview-accept").click();
    await expect(page.getByText("Accepted and saved. Future plan logic will now see this change.")).toBeVisible();
    await expect(page.getByTestId("coach-action-history")).toContainText("Reduce this week's volume");

    await expect.poll(async () => {
      const cache = await readLocalCache(page);
      return Array.isArray(cache?.coachActions) ? cache.coachActions.length : 0;
    }).toBe(beforeActionCount + 1);
  });

  test("ask anything stays advisory-only and does not mutate plan state", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("coach_api_key", "test-key");
    });
    await page.route("https://api.anthropic.com/v1/messages", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "access-control-allow-origin": "*",
        },
        body: 'data: {"delta":{"text":"Advisory only answer. "}}\n\ndata: {"delta":{"text":"Keep the plan boundary intact."}}\n\n',
      });
    });

    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-coach").click();
    const beforeCache = await readLocalCache(page);

    await page.getByTestId("coach-mode-button-ask_anything").click();
    await expect(page.getByTestId("coach-mode-panel-ask_anything")).toBeVisible();
    await page.getByTestId("coach-ask-input").fill("Should I push this week?");
    await page.getByTestId("coach-ask-send").click();

    await expect(page.getByTestId("coach-ask-message").last()).toContainText("Advisory only answer. Keep the plan boundary intact.");
    await expect(page.getByTestId("coach-preview-accept")).toHaveCount(0);

    const afterCache = await readLocalCache(page);
    expect(afterCache?.coachActions || []).toEqual(beforeCache?.coachActions || []);
    expect(afterCache?.coachPlanAdjustments || {}).toEqual(beforeCache?.coachPlanAdjustments || {});
  });
});
