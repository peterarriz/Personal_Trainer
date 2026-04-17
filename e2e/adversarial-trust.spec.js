const { test, expect } = require("@playwright/test");

const {
  FAILURE_CLASSIFICATIONS,
  captureAdversarialScreenshot,
  expectReadableAction,
  normalizeSurfaceText,
  registerAdversarialCase,
} = require("./adversarial-test-helpers.js");
const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const {
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  gotoIntakeInLocalMode,
  waitForPostOnboarding,
  waitForReview,
} = require("./intake-test-utils.js");

const SUPABASE_URL = "https://forma.example.supabase.co";
const SUPABASE_KEY = "test-anon-key";
const RAW_RUN_TAG_PATTERN = /\b(?:easyrun|hardrun|longrun|travelrun)\b|\b(?:easy run day|hard run day|long run day|travel run day)\b/i;

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

const bootAuthEntry = async (page, {
  theme = "Atlas",
  mode = "Dark",
  width = 430,
  height = 932,
  colorScheme = "dark",
  forcedColors = "none",
} = {}) => {
  await page.emulateMedia({ colorScheme, forcedColors });
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ payloadSeed, supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_local_cache_v4");
    localStorage.setItem("trainer_local_cache_v4", JSON.stringify(payloadSeed));
  }, {
    payloadSeed: makeLocalPayload({ theme, mode }),
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  await page.goto("/");
  await expect(page.getByTestId("auth-gate")).toBeVisible();
};

const enterAppShell = async (page) => {
  const authGate = page.getByTestId("auth-gate");
  if (await authGate.isVisible().catch(() => false)) {
    await page.getByTestId("continue-local-mode").click();
  }
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("app-tab-settings")).toBeVisible();
};

const openAppearancePreferences = async (page, {
  theme = "Atlas",
  mode = "Dark",
  colorScheme = "dark",
} = {}) => {
  await page.emulateMedia({ colorScheme });
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings.appearance = { theme, mode };
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await enterAppShell(page);
  await page.getByTestId("app-tab-settings").click();
  await page.getByTestId("settings-surface-preferences").click();
  await expect(page.getByTestId("settings-preferences-section")).toBeVisible();
  await expect(page.getByTestId("settings-appearance-section")).toBeVisible();
};

const openSettingsAccountSurface = async (page) => {
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await page.getByTestId("settings-surface-account").click();
  await expect(page.getByTestId("settings-account-section")).toBeVisible();
};

const openSettingsAccountAdvanced = async (page) => {
  await page.getByTestId("settings-account-advanced").locator("summary").click();
};

const completeRunningOnboarding = async (page) => {
  await gotoIntakeInLocalMode(page);
  await completeIntroQuestionnaire(page, {
    goalText: "run a 1:45 half marathon",
    experienceLevel: "Intermediate",
    trainingDays: "4",
    sessionLength: "45 min",
    trainingLocation: "Gym",
    coachingStyle: "Balanced coaching",
  });
  await completeAnchors(page, {
    target_timeline: { type: "natural", value: "October" },
    current_run_frequency: { type: "natural", value: "4 runs/week" },
    running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
    longest_recent_run: { type: "natural", value: "7 miles" },
    recent_pace_baseline: { type: "natural", value: "8:55 pace" },
  }, { maxSteps: 6 });
  await waitForReview(page);
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
};

const completeSwimOnboarding = async (page) => {
  await gotoIntakeInLocalMode(page);
  await completeIntroQuestionnaire(page, {
    goalText: "swim a faster mile",
    experienceLevel: "Intermediate",
    trainingDays: "4",
    sessionLength: "45 min",
    trainingLocation: "Gym",
    coachingStyle: "Balanced coaching",
  });
  await completeAnchors(page, {
    recent_swim_anchor: { type: "natural", value: "1000 yd in 22:30" },
    swim_access_reality: { type: "choice", value: "pool" },
  }, { maxSteps: 4 });
  await waitForReview(page);
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
};

const buildSevenGoalStackFromLibrary = async (page, { finishBuild = true } = {}) => {
  await gotoIntakeInLocalMode(page);
  await expect(page.getByTestId("intake-goals-step")).toBeVisible();

  const selections = [
    ["running", "half_marathon"],
    ["strength", "bench_225"],
    ["physique", "get_leaner"],
    ["sport", "soccer_resilience"],
    ["health", "capability_longevity"],
    ["swim", "swim_endurance"],
    ["health", "build_energy"],
  ];
  for (const [categoryId, templateId] of selections) {
    await page.getByTestId(`intake-goal-category-${categoryId}`).click();
    await page.getByTestId(`intake-goal-template-${templateId}`).click();
  }

  await page.getByTestId("intake-goals-option-experience-level-intermediate").click();
  await page.getByTestId("intake-goals-option-training-days-4").click();
  await page.getByTestId("intake-goals-option-session-length-45").click();
  await page.getByTestId("intake-goals-option-training-location-gym").click();
  const coachingChip = page.getByTestId("intake-goals-option-coaching-style-balanced-coaching");
  if (await coachingChip.count()) {
    await coachingChip.click();
  }
  await page.getByTestId("intake-footer-continue").click();
  await expect.poll(async () => page.getByTestId("intake-root").getAttribute("data-intake-phase"), { timeout: 20_000 }).toBe("clarify");

  await completeAnchors(page, {
    target_timeline: { type: "natural", value: "October" },
    current_run_frequency: { type: "natural", value: "4 runs/week" },
    running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
    longest_recent_run: { type: "natural", value: "7 miles" },
    recent_pace_baseline: { type: "natural", value: "8:55 pace" },
    current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
    appearance_proxy_anchor_kind: { type: "choice", value: "current_bodyweight" },
    current_bodyweight: { type: "number", value: 185, unit: "lb" },
    current_waist: { type: "number", value: 34, unit: "in" },
    recent_swim_anchor: { type: "natural", value: "1000 yd in 22:30" },
    swim_access_reality: { type: "choice", value: "pool" },
  }, { maxSteps: 12 });
  await waitForReview(page);
  if (!finishBuild) return;
  await confirmIntakeBuild(page);
  await waitForPostOnboarding(page);
};

const openDetailedWorkoutLog = async (page) => {
  await page.getByTestId("app-tab-log").click();
  await expect(page.getByTestId("log-tab")).toBeVisible();
  await page.getByRole("button", { name: /open full detail entry/i }).click();
  await expect(page.getByTestId("log-detailed-entry")).toBeVisible();
};

const readThemeGridMetrics = async (page) => page.getByTestId("settings-theme-grid").evaluate((node) => {
  const gridRect = node.getBoundingClientRect();
  const cards = Array.from(node.querySelectorAll("button[data-selected]"));
  const previews = Array.from(node.querySelectorAll("[data-testid^='settings-theme-preview-']"));
  return {
    gridClientWidth: node.clientWidth,
    gridScrollWidth: node.scrollWidth,
    cardCount: cards.length,
    previewCount: previews.length,
    gridRight: gridRect.right,
    cards: cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        right: rect.right,
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
      };
    }),
    previews: previews.map((preview) => {
      const rect = preview.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        scrollWidth: preview.scrollWidth,
        clientWidth: preview.clientWidth,
      };
    }),
  };
});

test.describe("skeptical user adversarial coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 980 });
  });

  test("auth actions stay readable across harsh light and forced-color states", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.accessibilityBug,
      concern: "Unreadable auth actions make the recovery path look broken before a user even starts.",
      surfaces: ["auth"],
      notes: [
        "Checks the primary cloud CTA and the local-only rescue CTA under light and forced-color rendering.",
      ],
    });

    const scenarios = [
      {
        name: "solstice-light",
        theme: "Solstice",
        mode: "Light",
        colorScheme: "light",
        forcedColors: "none",
      },
      {
        name: "atlas-forced-colors",
        theme: "Atlas",
        mode: "Dark",
        colorScheme: "dark",
        forcedColors: "active",
      },
    ];

    for (const scenario of scenarios) {
      await bootAuthEntry(page, scenario);
      await page.getByTestId("auth-mode-signup").click();
      await expect(page.getByTestId("auth-submit")).toBeVisible();
      await expect(page.getByTestId("continue-local-mode")).toBeVisible();

      await expectReadableAction(page.getByTestId("auth-submit"));
      await expectReadableAction(page.getByTestId("continue-local-mode"));

      await captureAdversarialScreenshot(
        page,
        testInfo,
        `auth-${scenario.name}`,
        page.getByTestId("auth-gate")
      );
    }
  });

  test("theme gallery stays unclipped and premium at skeptical laptop width", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.polishBug,
      concern: "Appearance previews that clip or collide make the app feel unprofessional fast.",
      surfaces: ["settings", "preferences"],
      notes: [
        "Uses a tighter laptop viewport than the happy-path preference test and captures the actual grid state.",
      ],
    });

    await page.setViewportSize({ width: 1120, height: 860 });
    await openAppearancePreferences(page, {
      theme: "Voltage",
      mode: "System",
      colorScheme: "light",
    });

    const metrics = await readThemeGridMetrics(page);
    expect(metrics.cardCount).toBe(8);
    expect(metrics.previewCount).toBe(8);
    expect(metrics.gridScrollWidth).toBeLessThanOrEqual(metrics.gridClientWidth + 2);
    metrics.cards.forEach((card) => {
      expect(card.width).toBeGreaterThan(220);
      expect(card.height).toBeGreaterThan(250);
      expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 2);
      expect(card.right).toBeLessThanOrEqual(metrics.gridRight + 2);
    });
    metrics.previews.forEach((preview) => {
      expect(preview.width).toBeGreaterThan(180);
      expect(preview.height).toBeGreaterThan(150);
      expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth + 2);
    });

    await expectReadableAction(page.getByTestId("settings-theme-voltage"), { minContrast: 3 });
    await captureAdversarialScreenshot(
      page,
      testInfo,
      "appearance-grid-laptop",
      page.getByTestId("settings-appearance-section")
    );
  });

  test("delete-account not-configured state leaves clear rescue paths instead of a dead end", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.deadEnd,
      concern: "A blocked delete path cannot strand the user in Settings or make the account lifecycle ambiguous.",
      surfaces: ["settings", "account", "auth"],
      notes: [
        "Verifies the blocked state still gives clear escape hatches and that sign-out still escapes immediately.",
      ],
    });

    const session = makeSession();
    const payload = makeSignedInPayload();
    const stats = await mockSupabaseRuntime(page, {
      session,
      payload,
      deleteDiagnosticsBody: {
        ok: true,
        code: "delete_account_not_configured",
        configured: false,
        required: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
        missing: ["SUPABASE_SERVICE_ROLE_KEY"],
        message: "Account deletion is not configured on this deployment yet.",
        detail: "The deployment is missing the server-side Supabase role needed for permanent auth deletion.",
        fix: "Set SUPABASE_SERVICE_ROLE_KEY on the server deployment and redeploy before enabling permanent delete.",
      },
    });

    await bootAppWithSupabaseSeeds(page, { session, payload });
    await openSettingsAccountSurface(page);
    await openSettingsAccountAdvanced(page);

    await expect(page.getByTestId("settings-delete-account-status")).toContainText("not configured");
    await expect(page.getByTestId("settings-delete-account-help")).toContainText("sign out or reset this device");
    await expect(page.getByTestId("settings-delete-account-diagnostics")).toHaveCount(0);
    await expect(page.getByTestId("settings-delete-account-missing-envs")).toHaveCount(0);
    await expect(page.getByTestId("settings-delete-account")).toBeDisabled();
    await expect(page.getByTestId("settings-delete-account-retry-diagnostics")).toBeEnabled();
    await expect(page.getByTestId("settings-reset-device")).toBeEnabled();
    await expect(page.getByTestId("settings-logout")).toBeEnabled();
    await expect.poll(() => stats.deleteGetRequests).toBeGreaterThan(0);
    expect(stats.deletePostRequests).toBe(0);

    await captureAdversarialScreenshot(
      page,
      testInfo,
      "delete-account-not-configured",
      page.getByTestId("settings-account-section")
    );

    await page.getByTestId("settings-logout").click();
    await expect(page.getByTestId("settings-open-auth-gate")).toBeVisible({ timeout: 1200 });
    await page.getByTestId("settings-open-auth-gate").click();
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toBeVisible();
    await expect(page.getByTestId("auth-sync-status")).toContainText("Device-only");
  });

  test("sync timeout and retry copy stay aligned across settings, today, and program", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.contradiction,
      concern: "Retrying sync cannot sound healthy on one screen and broken on another.",
      surfaces: ["settings", "today", "program"],
      notes: [
        "Forces a trainer_data save timeout and checks the same retry state is rendered across the key planning surfaces.",
      ],
    });

    const session = makeSession();
    const payload = makeSignedInPayload();
    await mockSupabaseRuntime(page, { session, payload });
    await bootAppWithSupabaseSeeds(page, { session, payload });

    await page.route("**/rest/v1/trainer_data", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 504,
          contentType: "text/plain",
          body: "gateway timeout",
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "trainer_v1_user", user_id: session.user.id, data: payload }]),
      });
    });

    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-profile").click();
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByTestId("settings-surface-account").click();

    await expect(page.getByTestId("settings-sync-status")).toContainText("Retrying");
    await expect(page.getByTestId("settings-sync-status")).toContainText("Cloud sync is retrying in the background");
    const settingsStatus = normalizeSurfaceText(await page.getByTestId("settings-sync-status").innerText());

    await page.getByTestId("app-tab-today").click();
    await expect(page.getByTestId("today-sync-status")).toContainText("Retrying");
    await expect(page.getByTestId("today-sync-status")).toContainText("Cloud sync is retrying in the background");
    const todayStatus = normalizeSurfaceText(await page.getByTestId("today-sync-status").innerText());

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-sync-status")).toContainText("Retrying");
    await expect(page.getByTestId("program-sync-status")).toContainText("Cloud sync is retrying in the background");
    const programStatus = normalizeSurfaceText(await page.getByTestId("program-sync-status").innerText());

    expect(settingsStatus).toMatch(/cloud sync is retrying in the background/i);
    expect(todayStatus).toMatch(/cloud sync is retrying in the background/i);
    expect(programStatus).toMatch(/cloud sync is retrying in the background/i);
    expect(settingsStatus).not.toMatch(/cloud unavailable|device-only/i);
    expect(todayStatus).not.toMatch(/cloud unavailable|device-only/i);
    expect(programStatus).not.toMatch(/cloud unavailable|device-only/i);

    await captureAdversarialScreenshot(
      page,
      testInfo,
      "program-sync-retrying",
      page.getByTestId("program-tab")
    );
  });

  test("seven-goal intake keeps later priorities visible without collapsing into hidden extras", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.trustBreak,
      concern: "Large goal stacks cannot quietly collapse into hidden priorities or leave later goals stranded.",
      surfaces: ["intake", "settings", "goals"],
      notes: [
        "Uses the structured goal library instead of free text so the failure signal is large-stack flow quality, not parser luck.",
      ],
    });

    await buildSevenGoalStackFromLibrary(page, { finishBuild: false });

    const confirmPriorityLabels = await page.getByTestId("intake-goal-card-priority").allInnerTexts();
    expect(confirmPriorityLabels).toContain("Priority 1");
    expect(confirmPriorityLabels).toContain("Priority 7");
    await expect(page.getByTestId("intake-confirm-additional-goals")).toContainText("Priority 7");
    await expect(page.getByTestId("intake-confirm-additional-goals")).toContainText(/Priorities 4\+/i);

    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("settings-tab")).toBeVisible();
    await page.getByTestId("settings-surface-goals").click();
    await expect(page.getByTestId("settings-goals-section")).toBeVisible();
    await expect(page.getByTestId("settings-goals-management")).toBeVisible();
    await expect(page.getByTestId("settings-goals-management")).toContainText(/Priority 1|Priority 2/i);

    await captureAdversarialScreenshot(
      page,
      testInfo,
      "seven-goal-settings-stack",
      page.getByTestId("settings-goals-section")
    );
  });

  test("canonical day reality stays aligned across today, program, log, nutrition, and coach after a preference shift", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.contradiction,
      concern: "A preference-driven adaptation cannot produce one story in Today and another in Program, Log, Nutrition, or Coach.",
      surfaces: ["today", "program", "log", "nutrition", "coach", "settings"],
      notes: [
        "Also checks that a run-focused athlete still sees support work in the week instead of a pure mono-domain program.",
      ],
    });

    await completeRunningOnboarding(page);

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-this-week")).toContainText(/strength|mobility/i);

    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-surface-preferences").click();
    await page.getByRole("button", { name: /Aggressive/i }).first().click();

    await page.getByTestId("app-tab-today").click();
    const todayLabel = normalizeSurfaceText(await page.getByTestId("today-canonical-session-label").innerText());
    const todayPlanText = normalizeSurfaceText(await page.getByTestId("today-full-workout").getByTestId("planned-session-plan").innerText());
    await expect(page.getByTestId("today-change-summary")).toContainText("Aggressive preference");

    await page.getByTestId("app-tab-program").click();
    const programLabel = normalizeSurfaceText(await page.getByTestId("program-canonical-session-label").innerText());
    await expect(page.getByTestId("program-change-summary")).toContainText("Aggressive preference");

    await openDetailedWorkoutLog(page);
    const logLabel = normalizeSurfaceText(await page.getByTestId("log-canonical-session-label").innerText());
    const logPlanText = normalizeSurfaceText(await page.getByTestId("log-detailed-entry").getByTestId("planned-session-plan").innerText());

    await page.getByTestId("app-tab-nutrition").click();
    const nutritionLabel = normalizeSurfaceText(await page.getByTestId("nutrition-canonical-session-label").innerText());
    await expect(page.getByTestId("nutrition-canonical-reason")).toContainText("Aggressive preference");

    await page.getByTestId("app-tab-coach").click();
    const coachLabel = normalizeSurfaceText(await page.getByTestId("coach-canonical-session-label").innerText());
    await expect(page.getByTestId("coach-canonical-reason")).toContainText("Aggressive preference");

    expect(programLabel).toBe(todayLabel);
    expect(logLabel).toBe(todayLabel);
    expect(nutritionLabel).toBe(todayLabel);
    expect(coachLabel).toBe(todayLabel);
    expect(logPlanText).toBe(todayPlanText);

    await captureAdversarialScreenshot(
      page,
      testInfo,
      "coach-canonical-alignment",
      page.getByTestId("coach-tab")
    );
  });

  test("swim plans avoid raw running tags and still surface deliberate support work", async ({ page }) => {
    const testInfo = test.info();
    await registerAdversarialCase(testInfo, {
      classification: FAILURE_CLASSIFICATIONS.trustBreak,
      concern: "Swim plans cannot leak run taxonomy or look like swim-only tunnel vision with no coherent support work.",
      surfaces: ["today", "program", "nutrition", "coach"],
      notes: [
        "Checks for raw easyRun/hardRun label leakage and expects visible dryland, strength, or mobility support somewhere in the active week.",
      ],
    });

    await completeSwimOnboarding(page);

    const surfaces = [];

    await page.getByTestId("app-tab-today").click();
    surfaces.push(normalizeSurfaceText(await page.getByTestId("today-tab").innerText()));

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    const programWeekText = normalizeSurfaceText(await page.getByTestId("program-this-week").innerText());
    surfaces.push(programWeekText);
    expect(programWeekText).toMatch(/strength|mobility|dryland/i);

    await page.getByTestId("app-tab-nutrition").click();
    surfaces.push(normalizeSurfaceText(await page.getByTestId("nutrition-tab").innerText()));

    await page.getByTestId("app-tab-coach").click();
    surfaces.push(normalizeSurfaceText(await page.getByTestId("coach-tab").innerText()));

    const combinedSurfaceText = surfaces.join(" ");
    expect(combinedSurfaceText).not.toMatch(RAW_RUN_TAG_PATTERN);

    await captureAdversarialScreenshot(
      page,
      testInfo,
      "swim-program-taxonomy",
      page.getByTestId("coach-tab")
    );
  });
});
