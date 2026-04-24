const { test, expect } = require("@playwright/test");

require("sucrase/register");

const {
  SUPABASE_KEY,
  SUPABASE_URL,
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const {
  installIntakeAiMocks,
} = require("./intake-test-utils.js");

const makeAuthGatePayload = () => ({
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
      appearance: { theme: "Circuit", mode: "Dark" },
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

const makeLargeLocalResumePayload = (days = 1800) => {
  const logs = {};
  const dailyCheckins = {};
  const plannedDayRecords = {};
  const planWeekRecords = {};
  const nutritionActualLogs = {};
  for (let index = 0; index < days; index += 1) {
    const dateKey = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
    logs[dateKey] = {
      date: dateKey,
      completed: true,
      notes: "training note ".repeat(12),
      exercises: Array.from({ length: 8 }, (_, exerciseIndex) => ({
        name: `Lift ${exerciseIndex}`,
        sets: [{ reps: 10, weight: 95 + exerciseIndex }, { reps: 8, weight: 105 + exerciseIndex }],
      })),
    };
    dailyCheckins[dateKey] = { energy: index % 5, soreness: index % 4, sleep: 7, note: "check ".repeat(8) };
    plannedDayRecords[dateKey] = {
      dateKey,
      base: { training: { label: "Base session", blocks: [] } },
      resolved: { training: { label: "Resolved session", blocks: [] } },
      decision: { mode: "base" },
    };
    nutritionActualLogs[dateKey] = { calories: 2300, protein: 175, note: "meal ".repeat(8) };
    if (index % 7 === 0) planWeekRecords[`week_${index / 7}`] = { summary: "week ".repeat(16), score: index % 100 };
  }
  return {
    ...makeAuthGatePayload(),
    logs,
    dailyCheckins,
    plannedDayRecords,
    planWeekRecords,
    nutritionActualLogs,
    personalization: {
      ...makeAuthGatePayload().personalization,
      profile: {
        name: "Large Local Athlete",
        timezone: "America/Chicago",
        onboardingComplete: true,
        profileSetupComplete: true,
      },
    },
    goals: [{ id: "large-local-goal", name: "Keep the large saved plan responsive", active: true, priority: 1 }],
    syncMeta: { pendingCloudWrite: true, lastLocalMutationTs: Date.now(), lastCloudSyncTs: 0 },
  };
};

const bootAuthGate = async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(({ payloadSeed, supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_auth_recovery_v1");
    localStorage.setItem("trainer_debug", "1");
    localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
  }, {
    payloadSeed: makeAuthGatePayload(),
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  await page.goto("/");
  await expect(page.getByTestId("auth-gate")).toBeVisible();
};

const bootAuthGateWithLargeLocalCache = async (page) => {
  const payloadSeed = makeLargeLocalResumePayload();
  const serializedPayload = JSON.stringify(payloadSeed);
  expect(serializedPayload.length).toBeGreaterThan(2_000_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(({ payload }) => {
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_auth_recovery_v1");
    localStorage.removeItem("trainer_debug");
    localStorage.setItem("trainer_local_cache_v4", payload);
  }, { payload: serializedPayload });
  await page.goto("/");
  await expect(page.getByTestId("auth-gate")).toBeVisible();
};

const trustedMouseClick = async (page, locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
};

const installIntakeSessionWriteProbe = async (page) => {
  await page.addInitScript(() => {
    window.__INTAKE_SESSION_WRITES = [];
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (String(key) === "intake_session_v1") {
        try {
          window.__INTAKE_SESSION_WRITES.push({
            ts: Date.now(),
            length: String(value || "").length,
          });
        } catch {}
      }
      return originalSetItem.apply(this, arguments);
    };
  });
};

const readIntakeSessionWriteCount = async (page) => (
  page.evaluate(() => Array.isArray(window.__INTAKE_SESSION_WRITES) ? window.__INTAKE_SESSION_WRITES.length : 0)
);

const expectPageResponsive = async (page) => {
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    window.setTimeout(() => resolve("responsive"), 0);
  })), { timeout: 5_000 }).toBe("responsive");
};

const expectLocatorCenterHitTarget = async (locator) => {
  await expect(locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === node || Boolean(node.contains(hit));
  })).resolves.toBe(true);
};

const expectReadableSelectedChip = async (locator, expectedLabel) => {
  await expect(locator).toBeVisible();
  await expect(locator).toContainText(expectedLabel);
  await expect(locator.evaluate((node) => {
    const parseRgb = (value) => {
      const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const [red, green, blue] = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return [red, green, blue].every(Number.isFinite) ? [red, green, blue] : null;
    };
    const luminance = ([red, green, blue]) => {
      const channels = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    };
    const style = window.getComputedStyle(node);
    const textColor = parseRgb(style.color);
    const backgroundColor = parseRgb(style.backgroundColor);
    if (!textColor || !backgroundColor) return false;
    const light = Math.max(luminance(textColor), luminance(backgroundColor));
    const dark = Math.min(luminance(textColor), luminance(backgroundColor));
    return ((light + 0.05) / (dark + 0.05)) >= 4.5;
  })).resolves.toBe(true);
};

const bootPostLoginIntake = async (page) => {
  const session = makeSession({ email: "intake-freeze@example.com" });
  const payload = makeAuthGatePayload();
  await installIntakeSessionWriteProbe(page);
  await installIntakeAiMocks(page);
  await mockSupabaseRuntime(page, { session, payload, signInStatus: 200 });
  await bootAuthGate(page);

  await page.getByTestId("auth-email").fill("intake-freeze@example.com");
  await page.getByTestId("auth-password").fill("correct-horse-battery-staple");
  await expect(page.getByTestId("auth-submit")).toBeEnabled();
  await trustedMouseClick(page, page.getByTestId("auth-submit"));
  await expect(page.getByTestId("intake-root")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("intake-goals-step")).toBeVisible();
  await expectPageResponsive(page);
};

test.describe("interaction freeze regression", () => {
  test("auth mode switch accepts trusted mouse input without freezing the page", async ({ page }) => {
    await bootAuthGate(page);

    await trustedMouseClick(page, page.getByTestId("auth-mode-signup"));
    await expect(page.getByTestId("auth-signup-name")).toBeVisible();
    await expect(page.evaluate(() => document.body.innerText.includes("Create your account"))).resolves.toBe(true);

    await trustedMouseClick(page, page.getByTestId("auth-mode-signin"));
    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.evaluate(() => document.body.innerText.includes("Sign in"))).resolves.toBe(true);
  });

  test("auth gate accepts browser-autofilled credentials that React did not see yet", async ({ page }) => {
    const session = makeSession({ email: "autofill-athlete@example.com" });
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload, signInStatus: 200 });
    await bootAuthGate(page);

    await page.evaluate(() => {
      const email = document.querySelector('[data-testid="auth-email"]');
      const password = document.querySelector('[data-testid="auth-password"]');
      if (email) email.value = "autofill-athlete@example.com";
      if (password) password.value = "correct-horse-battery-staple";
    });

    await expect(page.getByTestId("auth-submit")).toBeEnabled();
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("app-root")).toBeVisible();
  });

  test("large saved local plans do not block auth field input", async ({ page }) => {
    await bootAuthGateWithLargeLocalCache(page);

    await page.getByTestId("auth-email").fill("large-local@example.com", { timeout: 10_000 });
    await page.getByTestId("auth-password").fill("password123", { timeout: 10_000 });

    await expect(page.getByTestId("auth-email")).toHaveValue("large-local@example.com");
    await expect(page.getByTestId("auth-password")).toHaveValue("password123");
  });

  test("signed-in shell remains clickable across lazy-loaded surfaces", async ({ page }) => {
    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });
    await expect(page.getByTestId("app-root")).toBeVisible();

    const surfaces = [
      ["app-tab-log", "log-detailed-entry"],
      ["app-tab-program", "program-trajectory-header"],
      ["app-tab-nutrition", "nutrition-execution-plan-header"],
      ["app-tab-coach", "coach-tab"],
      ["app-tab-settings", "settings-tab"],
      ["app-tab-today", "today-session-card"],
    ];

    for (const [tabTestId, surfaceTestId] of surfaces) {
      await page.getByTestId(tabTestId).click();
      await expect(page.getByTestId(surfaceTestId)).toBeVisible();
      await expectPageResponsive(page);
    }

    const settingsSurfaces = [
      ["settings-surface-profile", "settings-profile-section"],
      ["settings-surface-goals", "settings-goals-section"],
      ["settings-surface-baselines", "settings-baselines-section"],
      ["settings-surface-programs", "settings-programs-section"],
      ["settings-surface-preferences", "settings-preferences-section"],
      ["settings-surface-account", "settings-account-section"],
      ["settings-surface-advanced", "settings-advanced-section"],
    ];

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    for (const [surfaceNavTestId, surfaceTestId] of settingsSurfaces) {
      const nav = page.getByTestId(surfaceNavTestId);
      if (await nav.count()) {
        await nav.click();
        await expect(page.getByTestId(surfaceTestId)).toBeVisible();
        await expectPageResponsive(page);
      }
    }
  });

  test("post-login intake accepts trusted interactions without storage-write storms", async ({ page }) => {
    await bootPostLoginIntake(page);

    await page.waitForTimeout(1_400);
    await expect(readIntakeSessionWriteCount(page)).resolves.toBeLessThanOrEqual(4);
    await expectReadableSelectedChip(page.getByTestId("intake-goals-option-experience-level-beginner"), "Beginner");

    await page.getByTestId("intake-goals-toggle-custom").click();
    await expect(page.getByTestId("intake-goals-primary-input")).toBeVisible();
    await expectPageResponsive(page);
    await expectLocatorCenterHitTarget(page.getByTestId("intake-goals-primary-input"));
    await page.getByTestId("intake-goals-primary-input").fill("Build strength without getting stuck in intake", { force: true });
    await expect(page.getByTestId("intake-goals-primary-input")).toHaveValue("Build strength without getting stuck in intake");
    await expectPageResponsive(page);

    await page.getByTestId("intake-goals-add").click();
    await expect(page.getByTestId("intake-goal-selection-draft")).toBeVisible();
    await page.getByTestId("intake-goal-selection-commit").click();
    await expect(page.getByTestId("intake-selected-goals")).toContainText(/build strength without getting stuck/i);
    await expectPageResponsive(page);

    const requiredChips = [
      "intake-goals-option-experience-level-intermediate",
      "intake-goals-option-training-days-4",
      "intake-goals-option-session-length-45-min",
      "intake-goals-option-training-location-gym",
      "intake-goals-option-coaching-style-balanced-coaching",
    ];
    for (const testId of requiredChips) {
      const chip = page.getByTestId(testId);
      if (await chip.count()) {
        await chip.click();
        await expectPageResponsive(page);
      }
    }

    await expect(page.getByTestId("intake-footer-continue")).toBeEnabled();
    await page.getByTestId("intake-footer-continue").click();
    await expect.poll(() => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toMatch(/clarify|confirm|building|goals/);
    await expectPageResponsive(page);
  });
});
