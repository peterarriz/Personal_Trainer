const { test, expect } = require("@playwright/test");

const {
  gotoIntakeInLocalMode,
  completeIntroQuestionnaire,
  completeAnchors,
  waitForReview,
  confirmIntakeBuild,
  waitForPostOnboarding,
} = require("./intake-test-utils.js");

const BANNED_VISIBLE_PATTERNS = [
  /limited data/i,
  /adapted week/i,
  /audit mode/i,
  /reviewer report/i,
  /planning engine/i,
  /developer diagnostics/i,
  /staff diagnostics/i,
  /\bbackbone\b/i,
  /\bstrict mode\b/i,
  /\bcurrent basis\b/i,
  /\bactive layers\b/i,
  /\bclear active basis\b/i,
  /\btransparent basis\b/i,
];

const readVisibleText = async (page) => page.locator("body").evaluate((node) => (
  String(node?.innerText || "").replace(/\s+/g, " ").trim()
));

const expectNoInternalTerms = async (page, label) => {
  const text = await readVisibleText(page);
  for (const pattern of BANNED_VISIBLE_PATTERNS) {
    expect(text, `${label} should not show ${pattern}`).not.toMatch(pattern);
  }
};

test.describe("consumer copy guard", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("normal user flows stay free of internal tooling language", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a stronger half marathon",
      experienceLevel: "Intermediate",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });
    await completeAnchors(page, {
      target_timeline: { type: "date_or_month", value: "2026-10" },
      current_run_frequency: { type: "number", value: "3" },
      running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
      longest_recent_run: { type: "number", value: "7" },
      recent_pace_baseline: { type: "natural", value: "8:55 pace" },
    });
    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    const topLevelTabs = [
      ["Today", "app-tab-today"],
      ["Program", "app-tab-program"],
      ["Log", "app-tab-log"],
      ["Nutrition", "app-tab-nutrition"],
      ["Coach", "app-tab-coach"],
    ];

    for (const [label, testId] of topLevelTabs) {
      await page.getByTestId(testId).click();
      await expectNoInternalTerms(page, label);
    }

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await expectNoInternalTerms(page, "Settings shell");

    await page.getByTestId("settings-surface-account").click();
    await expect(page.getByTestId("settings-account-section")).toBeVisible();
    await page.getByTestId("settings-account-advanced").locator("summary").click();
    await expect(page.getByTestId("settings-reviewer-report-card")).toHaveCount(0);
    await expect(page.getByTestId("settings-sync-diagnostics")).toHaveCount(0);
    await expectNoInternalTerms(page, "Settings account");

    await page.getByTestId("settings-surface-advanced").click();
    await expect(page.getByTestId("settings-advanced-section")).toBeVisible();
    await expect(page.getByTestId("settings-friction-summary")).toHaveCount(0);
    await expect(page.getByText(/Internal diagnostics/i)).toHaveCount(0);
    await expectNoInternalTerms(page, "Settings advanced");
  });
});
