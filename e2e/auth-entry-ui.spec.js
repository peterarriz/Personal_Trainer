const { test, expect } = require("@playwright/test");

const SUPABASE_URL = "https://forma.example.supabase.co";
const SUPABASE_KEY = "test-anon-key";

const makeLocalPayload = ({ theme = "Atlas", mode = "Dark" } = {}) => ({
  logs: {},
  bw: [],
  paceOverrides: {},
  weekNotes: {},
  planAlerts: [],
  personalization: {
    profile: {
      name: "Athlete",
      timezone: "America/Chicago",
      onboardingComplete: false,
      profileSetupComplete: false,
    },
    settings: {
      units: { weight: "lbs", height: "ft_in", distance: "miles" },
      trainingPreferences: { intensityPreference: "Standard", defaultEnvironment: "Gym" },
      appearance: { theme, mode },
    },
  },
  goals: [],
  coachActions: [],
  coachPlanAdjustments: { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} },
  dailyCheckins: {},
  plannedDayRecords: {},
  planWeekRecords: {},
  weeklyCheckins: {},
  nutritionFavorites: { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] },
  nutritionActualLogs: {},
  v: 6,
  contractVersion: "runtime_storage_v1",
  ts: Date.now(),
});

async function bootAuthEntry(page, {
  theme = "Atlas",
  mode = "Dark",
  width = 390,
  height = 844,
  colorScheme = "dark",
  forcedColors = "none",
  seedLocalCache = true,
  debugMode = false,
} = {}) {
  await page.emulateMedia({ colorScheme, forcedColors });
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ payloadSeed, supabaseUrl, supabaseKey, shouldSeedLocalCache, shouldEnableDebug }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_local_cache_v4");
    localStorage.removeItem("trainer_debug");
    if (shouldEnableDebug) {
      localStorage.setItem("trainer_debug", "1");
    }
    if (shouldSeedLocalCache) {
      localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
    }
  }, {
    payloadSeed: makeLocalPayload({ theme, mode }),
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    shouldSeedLocalCache: seedLocalCache,
    shouldEnableDebug: debugMode,
  });
  await page.goto("/");
  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await expect(page.getByTestId("auth-path-cloud")).toBeVisible();
  await expect(page.getByTestId("auth-path-local")).toHaveCount(0);
}

test.describe("auth entry UI", () => {
  test("first-time consumer auth entry does not expose local fallback", async ({ page }) => {
    await bootAuthEntry(page, {
      theme: "Atlas",
      mode: "Dark",
      width: 390,
      height: 844,
      colorScheme: "dark",
      seedLocalCache: false,
    });

    await expect(page.getByTestId("continue-local-mode")).toHaveCount(0);
    await expect(page.getByText(/create your account before you start/i)).toBeVisible();
  });

  test("auth entry preserves action hierarchy and stacks cleanly on mobile", async ({ page }) => {
    await bootAuthEntry(page, {
      theme: "Atlas",
      mode: "Dark",
      width: 390,
      height: 844,
      colorScheme: "dark",
      debugMode: true,
    });

    await expect(page.getByTestId("auth-submit")).toHaveAttribute("data-auth-variant", "primary");
    await expect(page.getByTestId("continue-local-mode")).toHaveAttribute("data-auth-variant", "tertiary");
    await expect(page.getByTestId("auth-mode-signin")).toHaveAttribute("data-auth-variant", "tertiary");
    await expect(page.getByTestId("auth-mode-signup")).toHaveAttribute("data-auth-variant", "tertiary");
    await expect(page.getByTestId("auth-local-cta-description")).toContainText(/this device|cloud/i);
    await expect(page.getByTestId("auth-local-cta")).toContainText(/use local data instead/i);

    await page.getByTestId("auth-mode-signup").click();
    await expect(page.getByTestId("auth-signup-name")).toBeVisible();
    await expect(page.getByTestId("auth-primary-caption")).toContainText(/cloud backup|account/i);

    const railBox = await page.getByTestId("auth-entry-rail").boundingBox();
    const formBox = await page.getByTestId("auth-entry-form").boundingBox();
    expect(railBox).toBeTruthy();
    expect(formBox).toBeTruthy();
    expect(formBox.y).toBeGreaterThan(railBox.y + railBox.height - 8);
  });

  test("auth entry keeps the decision rail and form side by side on laptop widths", async ({ page }) => {
    await bootAuthEntry(page, {
      theme: "Circuit",
      mode: "Dark",
      width: 1280,
      height: 900,
      colorScheme: "dark",
      debugMode: true,
    });

    const railBox = await page.getByTestId("auth-entry-rail").boundingBox();
    const formBox = await page.getByTestId("auth-entry-form").boundingBox();
    expect(railBox).toBeTruthy();
    expect(formBox).toBeTruthy();
    expect(formBox.x).toBeGreaterThan(railBox.x + railBox.width - 16);

    await page.getByTestId("auth-mode-signup").click();
    await expect(page.getByTestId("auth-signup-timezone")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();
  });

  test("local-data CTA remains visibly rendered in light mode", async ({ page }) => {
    await bootAuthEntry(page, {
      theme: "Solstice",
      mode: "Light",
      width: 430,
      height: 932,
      colorScheme: "light",
      debugMode: true,
    });

    const styles = await page.getByTestId("continue-local-mode").evaluate((node) => {
      const computed = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        variant: node.getAttribute("data-auth-variant"),
        color: computed.color,
        backgroundImage: computed.backgroundImage,
        borderColor: computed.borderColor,
        opacity: computed.opacity,
        minHeight: rect.height,
      };
    });

    expect(styles.variant).toBe("tertiary");
    expect(styles.opacity).toBe("1");
    expect(styles.minHeight).toBeGreaterThan(32);
    expect(styles.color).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i);
    expect(styles.backgroundImage).toBe("none");
  });

  test("forced-colors mode keeps auth actions readable and present", async ({ page }) => {
    await bootAuthEntry(page, {
      theme: "Atlas",
      mode: "Dark",
      width: 430,
      height: 932,
      colorScheme: "dark",
      forcedColors: "active",
      debugMode: true,
    });

    await page.getByTestId("auth-mode-signup").click();
    await expect(page.getByTestId("auth-submit")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();

    const styles = await page.getByTestId("continue-local-mode").evaluate((node) => {
      const computed = window.getComputedStyle(node);
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
      };
    });

    expect(styles.color).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i);
    expect(styles.backgroundColor).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i);
    expect(styles.borderColor).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i);
  });
});
