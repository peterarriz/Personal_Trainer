const { test, expect } = require("@playwright/test");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");

async function bootSignedInTodaySurface(page) {
  const session = makeSession();
  const payload = makeSignedInPayload();
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("today-tab")).toBeVisible();
}

test.describe("today surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("baseline today rendering stays focused on one prescription", async ({ page }) => {
    await bootSignedInTodaySurface(page);

    await expect(page.getByTestId("today-session-card")).toBeVisible();
    await expect(page.getByTestId("today-focus-line")).toBeVisible();
    await expect(page.getByTestId("today-change-summary")).toBeVisible();
    await expect(page.getByTestId("today-trust-row")).toBeVisible();
    await expect(page.getByTestId("today-session-plan")).toBeVisible();
    await expect(page.getByTestId("today-rules")).toBeVisible();
    await expect(page.getByTestId("today-adjust-section")).toBeVisible();
    await expect(page.getByTestId("today-tab").getByTestId("planned-session-plan")).toHaveCount(0);
    await expect(page.getByTestId("today-quick-log")).toHaveCount(0);
    await expect(page.getByText("Runtime Inspector")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => typeof window.__trainerRuntime)).toBe("undefined");

    const blockCount = await page.getByTestId("today-full-workout").locator(":scope > div").count();
    expect(blockCount).toBeGreaterThanOrEqual(3);
    expect(blockCount).toBeLessThanOrEqual(5);

    const helpDisclosures = page.locator('[data-testid^="today-exercise-help-"]');
    if (await helpDisclosures.count()) {
      const firstHelpDisclosure = helpDisclosures.first();
      await expect(firstHelpDisclosure).toBeVisible();
      await firstHelpDisclosure.locator("summary").click();
      await expect(firstHelpDisclosure.getByRole("link", { name: /watch demo/i })).toBeVisible();
    }
  });

  test("shortening the workout rewrites the visible prescription deterministically", async ({ page }) => {
    await bootSignedInTodaySurface(page);

    await page.getByTestId("today-primary-cta").click();
    await expect(page.getByTestId("today-adjust-panel")).toBeVisible();
    await page.getByRole("button", { name: "Short on time" }).click();

    await expect(page.getByTestId("today-change-summary")).toContainText("Time is tight today");
    await expect(page.getByTestId("today-trust-row")).toContainText("Time cap");
    await expect(page.getByTestId("today-rules")).toContainText(/cut the accessory block|finish feeling better/i);
  });

  test("low-energy adjustment keeps the prescription conservative instead of creating a second plan", async ({ page }) => {
    await bootSignedInTodaySurface(page);

    await page.getByTestId("today-primary-cta").click();
    await expect(page.getByTestId("today-adjust-panel")).toBeVisible();
    await page.getByRole("button", { name: "Low energy" }).click();

    await expect(page.getByTestId("today-change-summary")).toContainText("Recovery looks softer today");
    await expect(page.getByTestId("today-trust-row")).toContainText("Low recovery");
    await expect(page.getByTestId("today-full-workout")).toContainText(/Leave 2-3 reps in reserve|Easy to steady|Controlled/);
  });
});
