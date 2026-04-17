const { test, expect } = require("@playwright/test");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  gotoIntakeInLocalMode,
  waitForReview,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
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
}

async function bootSignedInTodaySurface(page, {
  theme = "Atlas",
  mode = "Dark",
} = {}) {
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings.appearance = { theme, mode };
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("today-tab")).toBeVisible();
}

const normalizeSurfaceText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

const readOverflowMetrics = async (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return {
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    transform: style.transform,
    writingMode: style.writingMode,
  };
});

const readVisibleChildMetrics = async (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return {
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    items: Array.from(node.querySelectorAll("button, input, textarea, summary, [role='alert'], [role='status']"))
      .filter((child) => child.getClientRects().length > 0)
      .map((child) => {
        const childRect = child.getBoundingClientRect();
        const childStyle = getComputedStyle(child);
        return {
          left: childRect.left,
          right: childRect.right,
          top: childRect.top,
          bottom: childRect.bottom,
          clientWidth: child.clientWidth,
          scrollWidth: child.scrollWidth,
          clientHeight: child.clientHeight,
          scrollHeight: child.scrollHeight,
          transform: childStyle.transform,
          writingMode: childStyle.writingMode,
        };
      }),
  };
});

test.describe("mobile surface simplification", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("mobile intake keeps the staged shell, summary rail, and footer actions usable", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "Bench 225 and get leaner by summer",
      additionalGoals: ["Jump higher again", "Keep shoulders healthy"],
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      stopAtInterpretation: true,
    });

    await expect.poll(async () => await page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toBe("clarify");
    await expect(page.getByTestId("intake-summary-rail")).toBeVisible();
    await expect(page.getByTestId("intake-footer-continue")).toBeVisible();
    await expect(page.getByTestId("intake-transcript")).toHaveCount(0);
    await expect(page.locator("[data-testid='intake-confirm-goal-card']")).toHaveCount(4);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1", "Priority 2", "Priority 3", "Priority 4"]);
    await expect(page.getByTestId("intake-confirm-additional-goals")).toBeVisible();
  });

  test("today is action-first, program is read-first, and settings owns plan management", async ({ page }) => {
    await completeRunningOnboarding(page);

    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-session-card")).toBeVisible();
    await expect(page.getByTestId("today-full-workout")).toBeVisible();
    await expect(page.getByTestId("today-quick-log")).toBeVisible();
    await expect(page.getByTestId("today-save-log")).toBeVisible();
    await expect(page.getByTestId("today-tab").getByTestId("planned-session-plan")).toHaveCount(1);
    await expect(page.getByTestId("today-tab").getByText("LOG TODAY", { exact: true })).toHaveCount(1);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-this-week")).toBeVisible();
    await expect(page.getByTestId("program-future-weeks")).toBeVisible();
    await expect(page.getByText("Edit goals and plan")).toBeVisible();
    await expect(page.getByText("PROGRAMS + STYLES").first()).not.toBeVisible();
    await expect(page.getByText("Refine Current Goal").first()).not.toBeVisible();
    await expect(page.getByText("Start New Goal Arc").first()).not.toBeVisible();

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await expect(page.getByTestId("settings-account-section")).toBeVisible();
    await expect(page.getByTestId("settings-goals-section")).not.toBeVisible();
    await expect(page.getByTestId("settings-advanced-section")).not.toBeVisible();

    await page.getByTestId("settings-surface-goals").click();
    await expect(page.getByTestId("settings-goals-section")).toBeVisible();
    await expect(page.getByTestId("settings-goals-management")).toBeVisible();
    await expect(page.getByText("Programs and styles")).toHaveCount(0);
    await expect(page.getByText("Advanced text request", { exact: true })).toHaveCount(0);

    await page.getByTestId("settings-surface-programs").click();
    await expect(page.getByTestId("settings-programs-section")).toBeVisible();
    await expect(page.getByText("PLAN STYLE").first()).toBeVisible();

    await page.getByTestId("settings-surface-advanced").click();
    await expect(page.getByTestId("settings-advanced-section")).toBeVisible();
    await expect(page.getByTestId("settings-advanced-section").getByText("DEVICES", { exact: true })).toBeVisible();
    await expect(page.getByText("Experimental goal request")).toHaveCount(0);
    await expect(page.getByTestId("settings-friction-summary")).toHaveCount(0);
    await expect(page.getByText("Apple Health").first()).toBeVisible();
    await expect(page.getByText("Garmin Connect").first()).toBeVisible();
    await expect(page.getByPlaceholder("Anthropic key (optional)")).toHaveCount(0);
  });

  test("today, program, and log each expose planned session blocks on mobile", async ({ page }) => {
    await completeRunningOnboarding(page);

    const todayPlan = page.getByTestId("today-full-workout").getByTestId("planned-session-plan");
    await expect(todayPlan).toBeVisible();
    const todayPlanText = (await todayPlan.innerText()).replace(/\s+/g, " ").trim();
    expect(todayPlanText.length).toBeGreaterThan(20);

    await page.getByTestId("app-tab-program").click();
    const programThisWeek = page.getByTestId("program-this-week");
    const currentRows = programThisWeek.locator("[data-testid^='program-this-week-session-item-']");
    expect(await currentRows.count()).toBeGreaterThan(1);
    const firstRow = currentRows.nth(0);
    const secondRow = currentRows.nth(1);
    const firstButton = firstRow.locator("[data-testid^='program-this-week-session-button-']");
    const secondButton = secondRow.locator("[data-testid^='program-this-week-session-button-']");

    await firstButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toBeVisible();
    await expect(secondRow.getByTestId("planned-session-plan")).toHaveCount(0);

    await secondButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstRow.getByTestId("planned-session-plan")).toHaveCount(0);
    const programPlan = secondRow.getByTestId("planned-session-plan");
    await expect(programPlan).toBeVisible();
    const programPlanText = (await programPlan.innerText()).replace(/\s+/g, " ").trim();
    expect(programPlanText.length).toBeGreaterThan(20);

    await secondButton.click();
    await expect(programThisWeek.getByTestId("planned-session-plan")).toHaveCount(0);

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByText("Detailed workout log")).toHaveCount(0);
    await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
    const logPlan = page.getByTestId("log-detailed-entry").getByTestId("planned-session-plan");
    await expect(logPlan).toBeVisible();
    const logPlanText = (await logPlan.innerText()).replace(/\s+/g, " ").trim();
    expect(logPlanText).toBe(todayPlanText);
  });

  test("today keeps narrow-layout text and quick-log controls unclipped on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await bootSignedInTodaySurface(page);

    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-preferences").click();
    await page.getByRole("button", { name: /Aggressive/i }).first().click();

    await page.getByTestId("app-tab-today").click();

    const quickLog = page.getByTestId("today-quick-log");
    await quickLog.getByRole("button", { name: /completed as planned/i }).click();
    await quickLog.getByRole("button", { name: /about right/i }).click();
    await quickLog.getByPlaceholder("Optional note").fill("Felt better after the warmup, but the ankle still needed extra rest between sets.");
    await quickLog.getByPlaceholder(/Bodyweight/i).fill("182");
    await page.getByTestId("today-save-log").click();
    await expect(page.getByTestId("today-save-status")).toContainText(/saved/i);

    const textTargets = [
      "today-canonical-session-label",
      "today-canonical-reason",
      "today-change-summary",
      "today-plan-basis",
      "today-save-status",
    ];
    for (const testId of textTargets) {
      const locator = page.getByTestId(testId);
      if (!await locator.count()) continue;
      const metrics = await readOverflowMetrics(locator);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 2);
      expect(metrics.writingMode).toBe("horizontal-tb");
    }

    const quickLogMetrics = await readVisibleChildMetrics(quickLog);
    quickLogMetrics.items.forEach((item) => {
      expect(item.left).toBeGreaterThanOrEqual(quickLogMetrics.left - 1);
      expect(item.right).toBeLessThanOrEqual(quickLogMetrics.right + 1);
      expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth + 2);
      expect(item.scrollHeight).toBeLessThanOrEqual(item.clientHeight + 2);
      expect(item.writingMode).toBe("horizontal-tb");
    });
  });

  test("canonical session label stays aligned across today, program, log, nutrition, and coach", async ({ page }) => {
    await completeRunningOnboarding(page);

    const todayLabel = normalizeSurfaceText(await page.getByTestId("today-canonical-session-label").innerText());
    expect(todayLabel.length).toBeGreaterThan(3);

    await page.getByTestId("app-tab-program").click();
    const programLabel = normalizeSurfaceText(await page.getByTestId("program-canonical-session-label").innerText());
    expect(programLabel).toBe(todayLabel);

    await page.getByTestId("app-tab-log").click();
    const logLabel = normalizeSurfaceText(await page.getByTestId("log-canonical-session-label").innerText());
    expect(logLabel).toBe(todayLabel);

    await page.getByTestId("app-tab-nutrition").click();
    const nutritionLabel = normalizeSurfaceText(await page.getByTestId("nutrition-canonical-session-label").innerText());
    expect(nutritionLabel).toBe(todayLabel);

    await page.getByTestId("app-tab-coach").click();
    const coachLabel = normalizeSurfaceText(await page.getByTestId("coach-canonical-session-label").innerText());
    expect(coachLabel).toBe(todayLabel);
  });

  test("workout and nutrition logging show strong saved state on mobile", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-log").click();
    await expect(page.getByTestId("log-tab")).toBeVisible();
    await page.getByTestId("log-complete-prescribed").click();
    await expect(page.getByTestId("log-save-status")).toContainText("Saved");

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();
    await page.getByRole("button", { name: /followed plan/i }).click();
    await page.getByTestId("nutrition-save-quick").click();
    await expect(page.getByTestId("nutrition-save-status")).toContainText("Saved");
  });

  test("training preference changes propagate across Today, Program, Nutrition, and Coach", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-preferences").click();
    await page.getByRole("button", { name: /Aggressive/i }).first().click();

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-change-summary")).toContainText("Aggressive preference");

    await page.getByTestId("app-tab-nutrition").click();
    await expect(page.getByTestId("nutrition-tab")).toBeVisible();
    await expect(page.getByTestId("nutrition-canonical-reason")).toContainText("Aggressive preference");

    await page.getByTestId("app-tab-coach").click();
    await expect(page.getByTestId("coach-tab")).toBeVisible();
    await expect(page.getByTestId("coach-canonical-reason")).toContainText("Aggressive preference");

    await page.getByTestId("app-tab-today").click();
    await expect(page.getByTestId("today-tab")).toBeVisible();
    await expect(page.getByTestId("today-change-summary")).toContainText("Aggressive preference");
  });

  test("coach stays focused on conversation and decisions, not configuration", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-coach").click();
    await expect(page.getByTestId("coach-tab")).toBeVisible();
    await expect(page.getByTestId("coach-mode-switcher")).toBeVisible();
    await expect(page.getByTestId("coach-mode-panel-adjust_today")).toBeVisible();
    await expect(page.getByPlaceholder("Anthropic key (optional)")).toHaveCount(0);
    await expect(page.getByPlaceholder("Failure patterns").first()).not.toBeVisible();

    const headline = page.getByTestId("coach-today-headline");
    await page.getByTestId("coach-today-prompt-i-m-traveling-today").click();
    await expect(headline).toContainText(/travel|lowest-friction/i);
    const travelReply = await headline.innerText();

    await page.getByTestId("coach-today-prompt-my-achilles-feels-tight").click();
    await expect.poll(async () => (await headline.innerText()).trim()).not.toBe(travelReply.trim());
    await expect(headline).toContainText(/protect|pain|irritated/i);
  });

  test("missing metrics route straight into baselines from Program", async ({ page }) => {
    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await page.getByTestId("program-fix-metrics").click();

    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await expect(page.getByTestId("settings-baselines-section")).toBeVisible();
    await expect(page.getByTestId("settings-metrics-baselines")).toBeVisible();
    await expect(page.getByText("Opened from Plan because a few inputs are still needed before the next block can get more specific.")).toBeVisible();
  });
});
