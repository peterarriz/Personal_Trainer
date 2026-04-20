const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

const bootSettingsShell = async (page, mutatePayload = null) => {
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings = {
    ...payload.personalization.settings,
    notifications: {
      allOff: false,
      weeklyReminderOn: true,
      weeklyReminderTime: "18:00",
      proactiveNudgeOn: true,
    },
    trainingPreferences: {
      ...payload.personalization.settings.trainingPreferences,
      weeklyCheckinDay: "Sun",
    },
  };
  if (typeof mutatePayload === "function") {
    mutatePayload(payload);
  }

  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
};

const openSettingsSurface = async (page, surfaceKey, sectionTestId) => {
  await page.getByTestId(`settings-surface-${surfaceKey}`).click();
  await expect(page.getByTestId(sectionTestId)).toBeVisible();
};

test.describe("settings surface integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
  });

  test("settings surface map stays consumer-focused and only shows one primary job at a time", async ({ page }) => {
    await bootSettingsShell(page);

    await expect(page.locator("button[data-testid^='settings-surface-']")).toHaveCount(7);
    await expect(page.getByTestId("settings-account-section")).toBeVisible();

    await openSettingsSurface(page, "profile", "settings-profile-section");
    await expect(page.getByTestId("settings-account-section")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();

    await openSettingsSurface(page, "goals", "settings-goals-section");
    await expect(page.getByTestId("settings-profile-section")).toHaveCount(0);
    await expect(page.getByTestId("settings-goals-management")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Plan" })).toBeVisible();

    await openSettingsSurface(page, "baselines", "settings-baselines-section");
    await expect(page.getByTestId("settings-goals-section")).toHaveCount(0);
    await expect(page.getByTestId("settings-metrics-baselines")).toBeVisible();

    await openSettingsSurface(page, "programs", "settings-programs-section");
    await expect(page.getByTestId("settings-baselines-section")).toHaveCount(0);
    await expect(page.getByText("PLAN LAYERS").first()).toBeVisible();

    await openSettingsSurface(page, "preferences", "settings-preferences-section");
    await expect(page.getByTestId("settings-programs-section")).toHaveCount(0);
    await expect(page.getByTestId("settings-theme-grid")).toBeVisible();
    await expect(page.getByTestId("settings-notifications-section")).toBeVisible();
    await expect(page.getByTestId("settings-reminders-status")).toContainText(/planned, not live/i);
    await expect(page.getByTestId("settings-reviewer-report-card")).toHaveCount(0);

    await openSettingsSurface(page, "advanced", "settings-advanced-section");
    await expect(page.getByTestId("settings-preferences-section")).toHaveCount(0);
    await expect(page.getByText("Apple Health").first()).toBeVisible();
    await expect(page.getByText("Garmin Connect").first()).toBeVisible();
    await expect(page.getByTestId("settings-friction-summary")).toHaveCount(0);
    await expect(page.getByText(/Internal diagnostics/i)).toHaveCount(0);
    await expect(page.getByPlaceholder("Anthropic key (optional)")).toHaveCount(0);
  });

  test("profile and appearance changes persist across settings surface switches and local storage", async ({ page }) => {
    await bootSettingsShell(page);

    await openSettingsSurface(page, "profile", "settings-profile-section");
    const nameInput = page.locator('input[placeholder="Display name"]');
    await nameInput.fill("Jordan");
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect.poll(() => page.evaluate(() => {
      const payload = JSON.parse(localStorage.getItem("trainer_local_cache_v4") || "{}");
      const personalization = payload && typeof payload === "object" ? payload.personalization : null;
      const profile = personalization && typeof personalization === "object" ? personalization.profile : null;
      return profile && typeof profile === "object" ? profile.name || "" : "";
    })).toBe("Jordan");

    await openSettingsSurface(page, "preferences", "settings-preferences-section");
    await page.getByTestId("settings-theme-circuit").click();
    await expect(page.getByTestId("settings-theme-circuit")).toHaveAttribute("data-selected", "true");
    await expect.poll(() => page.evaluate(() => {
      const payload = JSON.parse(localStorage.getItem("trainer_local_cache_v4") || "{}");
      const personalization = payload && typeof payload === "object" ? payload.personalization : null;
      const settings = personalization && typeof personalization === "object" ? personalization.settings : null;
      const appearance = settings && typeof settings === "object" ? settings.appearance : null;
      return appearance && typeof appearance === "object" ? appearance.theme || "" : "";
    })).toBe("Circuit");

    await openSettingsSurface(page, "advanced", "settings-advanced-section");
    await expect(page.getByTestId("settings-friction-summary")).toHaveCount(0);

    await openSettingsSurface(page, "profile", "settings-profile-section");
    await expect(nameInput).toHaveValue("Jordan");

    await openSettingsSurface(page, "preferences", "settings-preferences-section");
    await expect(page.getByTestId("settings-theme-circuit")).toHaveAttribute("data-selected", "true");
  });
});
