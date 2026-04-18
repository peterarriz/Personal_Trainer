const { test, expect } = require("@playwright/test");

const { readLocalCache } = require("./intake-test-utils.js");
const {
  REAL_SYNC_TEST_DATA,
  resolveRealSyncEnv,
  buildRealSyncSeedPayload,
  buildParitySnapshotFromPayload,
  hasMachineReadableRetryReason,
} = require("./real-sync-staging-helpers.js");

const AUTH_CACHE_KEY = "trainer_auth_session_v1";
const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
const VIEWPORT = { width: 1366, height: 960 };

const domClick = async (locator) => {
  await expect(locator).toBeVisible();
  await locator.evaluate((node) => node.click());
};

const escapeRegExp = (value = "") => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const installRealSyncBrowserHooks = async (context) => {
  await context.addInitScript(({
    authCacheKey,
    localCacheKey,
    fixedIsoString,
  }) => {
    const seedGuardKey = "__forma_real_sync_seeded__";
    const fixedNow = new Date(fixedIsoString).getTime();
    const OriginalDate = Date;
    function MockDate(...args) {
      if (this instanceof MockDate) {
        return args.length === 0 ? new OriginalDate(fixedNow) : new OriginalDate(...args);
      }
      return OriginalDate(...args);
    }
    MockDate.now = () => fixedNow;
    MockDate.parse = OriginalDate.parse;
    MockDate.UTC = OriginalDate.UTC;
    MockDate.prototype = OriginalDate.prototype;
    globalThis.Date = MockDate;
    window.Date = MockDate;

    window.__E2E_SYNC_TEST = true;
    try {
      localStorage.setItem("trainer_debug", "1");
      if (!sessionStorage.getItem(seedGuardKey)) {
        localStorage.removeItem(authCacheKey);
        localStorage.removeItem(localCacheKey);
        sessionStorage.setItem(seedGuardKey, "1");
      }
    } catch {}
  }, {
    authCacheKey: AUTH_CACHE_KEY,
    localCacheKey: LOCAL_CACHE_KEY,
    fixedIsoString: REAL_SYNC_TEST_DATA.fixedNowIso,
  });
};

const parseJsonSafely = (value = "") => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const signInToSupabase = async (request, env) => {
  const res = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseAnonKey,
    },
    data: {
      email: env.email,
      password: env.password,
    },
  });
  const text = await res.text();
  const json = parseJsonSafely(text);
  if (!res.ok) {
    throw new Error(`Supabase sign-in failed: ${res.status()} ${text}`);
  }
  if (!json?.access_token || !json?.user?.id) {
    throw new Error("Supabase sign-in returned no access token or user id.");
  }
  return {
    accessToken: json.access_token,
    userId: json.user.id,
  };
};

const supabaseRest = async (request, env, {
  token = "",
  method = "GET",
  path = "",
  body,
  prefer = "",
} = {}) => {
  const headers = {
    apikey: env.supabaseAnonKey,
    Authorization: `Bearer ${token || env.supabaseAnonKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await request.fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    data: body,
  });
  const text = await res.text();
  return {
    res,
    text,
    json: parseJsonSafely(text),
  };
};

const resetAndSeedTrainerData = async (request, env) => {
  const auth = await signInToSupabase(request, env);
  const payload = buildRealSyncSeedPayload();
  const trainerRowId = `trainer_v1_${auth.userId}`;
  const userFilter = `user_id=eq.${auth.userId}`;

  for (const table of ["trainer_data", "goals", "coach_memory"]) {
    const cleanup = await supabaseRest(request, env, {
      token: auth.accessToken,
      method: "DELETE",
      path: `${table}?${userFilter}`,
    });
    if (!cleanup.res.ok && cleanup.res.status() !== 404) {
      throw new Error(`Cleanup failed for ${table}: ${cleanup.res.status()} ${cleanup.text}`);
    }
  }

  const seeded = await supabaseRest(request, env, {
    token: auth.accessToken,
    method: "POST",
    path: "trainer_data",
    prefer: "return=representation,resolution=merge-duplicates",
    body: {
      id: trainerRowId,
      user_id: auth.userId,
      data: payload,
      updated_at: new Date(Date.parse(REAL_SYNC_TEST_DATA.fixedNowIso)).toISOString(),
    },
  });
  if (!seeded.res.ok) {
    throw new Error(`Seeding trainer_data failed: ${seeded.res.status()} ${seeded.text}`);
  }

  return {
    ...auth,
    payload,
  };
};

const fetchCloudTrainerPayload = async (request, env, {
  accessToken,
  userId,
} = {}) => {
  const response = await supabaseRest(request, env, {
    token: accessToken,
    method: "GET",
    path: `trainer_data?user_id=eq.${userId}&select=*`,
  });
  if (!response.res.ok) {
    throw new Error(`Cloud trainer_data fetch failed: ${response.res.status()} ${response.text}`);
  }
  const rows = Array.isArray(response.json) ? response.json : [];
  return rows[0]?.data || {};
};

const openSettingsSurface = async (page, surfaceTestId, expectedSectionTestId) => {
  await domClick(page.getByTestId("app-tab-settings"));
  await expect(page.getByTestId("settings-tab")).toBeVisible();
  await domClick(page.getByTestId(surfaceTestId));
  await expect(page.getByTestId(expectedSectionTestId)).toBeVisible();
};

const signInThroughUi = async (page, env) => {
  const authGate = page.getByTestId("auth-gate");
  if (!(await authGate.isVisible().catch(() => false))) {
    await openSettingsSurface(page, "settings-surface-account", "settings-account-section");
    if (await page.getByTestId("settings-open-auth-gate").isVisible().catch(() => false)) {
      await domClick(page.getByTestId("settings-open-auth-gate"));
    }
  }

  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await page.getByTestId("auth-email").fill(env.email);
  await page.getByTestId("auth-password").fill(env.password);
  await domClick(page.getByTestId("auth-submit"));
  await expect.poll(async () => {
    const raw = await page.evaluate((authKey) => window.localStorage.getItem(authKey), AUTH_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.user?.id || "";
  }).not.toBe("");
  await expect(page.getByTestId("auth-gate")).toHaveCount(0);
  await expect(page.getByTestId("today-session-card")).toBeVisible();
};

const saveProfileName = async (page, nextName) => {
  await openSettingsSurface(page, "settings-surface-profile", "settings-profile-section");
  await page.getByPlaceholder("Display name").fill(nextName);
  await domClick(page.getByRole("button", { name: "Save profile" }));
};

const editPrimaryGoalSummary = async (page, nextSummary) => {
  await openSettingsSurface(page, "settings-surface-goals", "settings-goals-section");
  await domClick(page.locator("[data-testid^='settings-goal-edit-']").first());
  await expect(page.getByTestId("settings-goal-editor")).toBeVisible();
  await page.getByTestId("settings-goal-editor-summary").fill(nextSummary);
  await domClick(page.getByTestId("settings-goal-editor-preview"));
  await expect(page.getByTestId("settings-goals-impact-preview")).toContainText(nextSummary);
  await domClick(page.getByTestId("settings-goals-confirm-preview"));
  await expect(page.getByTestId("settings-goals-management")).toContainText(nextSummary);
};

const saveTodayQuickLog = async (page, {
  statusLabel,
  note = "",
} = {}) => {
  await domClick(page.getByTestId("app-tab-today"));
  await domClick(page.getByTestId("today-primary-cta"));
  const quickLog = page.getByTestId("today-quick-log");
  await expect(quickLog).toBeVisible();
  await domClick(quickLog.getByRole("button", { name: new RegExp(`^${escapeRegExp(statusLabel)}$`, "i") }));
  if (note) {
    await quickLog.getByPlaceholder("Optional note").fill(note);
  }
  await domClick(page.getByTestId("today-save-log"));
  await expect(page.getByTestId("today-save-status")).toContainText(/saved|marked/i);
};

const logUnderFueledDay = async (page, note) => {
  await domClick(page.getByTestId("app-tab-nutrition"));
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(REAL_SYNC_TEST_DATA.nutritionDateKey);
  await domClick(page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Under-fueled" }));
  await domClick(page.getByTestId("nutrition-quick-log").getByRole("button", { name: "Hunger" }));
  await page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)").fill(note);
  await domClick(page.getByTestId("nutrition-save-quick"));
  await expect(page.getByTestId("nutrition-save-status")).toContainText(/saved/i);
};

const readSyncSnapshot = async (page) => page.evaluate(() => window.__TRAINER_SYNC_TEST_HELPERS?.snapshot?.() || null);

const waitForRetryStateToSettleOrExplain = async (page, label, timeoutMs = 12000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await readSyncSnapshot(page);
    if (!snapshot || snapshot.displayedStateId !== "retrying") return;
    if (hasMachineReadableRetryReason(snapshot)) return;
    await page.waitForTimeout(300);
  }
  const finalSnapshot = await readSyncSnapshot(page);
  if (finalSnapshot?.displayedStateId === "retrying") {
    expect(
      hasMachineReadableRetryReason(finalSnapshot),
      `${label}: sync stayed in retrying without a machine-readable reason`,
    ).toBe(true);
  }
};

const readLocalParitySnapshot = async (page) => {
  const payload = await readLocalCache(page);
  return buildParitySnapshotFromPayload(payload || {});
};

const expectParityInUi = async (page, expected) => {
  await openSettingsSurface(page, "settings-surface-profile", "settings-profile-section");
  await expect(page.getByPlaceholder("Display name")).toHaveValue(expected.profileName);

  await openSettingsSurface(page, "settings-surface-goals", "settings-goals-section");
  await expect(page.getByTestId("settings-goals-management")).toContainText(expected.goalSummary);

  await domClick(page.getByTestId("app-tab-today"));
  await domClick(page.getByTestId("today-primary-cta"));
  await expect(page.getByTestId("today-quick-log").getByPlaceholder("Optional note")).toHaveValue(expected.workoutNote);

  await domClick(page.getByTestId("app-tab-nutrition"));
  await expect(page.getByTestId("nutrition-tab")).toBeVisible();
  await page.getByTestId("nutrition-log-date-select").selectOption(REAL_SYNC_TEST_DATA.nutritionDateKey);
  await expect(
    page.getByTestId("nutrition-quick-log").getByPlaceholder("Quick note (optional)")
  ).toHaveValue(expected.nutritionNote);
};

test.describe("real Supabase staging sync parity", () => {
  test.describe.configure({ timeout: 180000 });

  const env = resolveRealSyncEnv();
  test.skip(env.missing.length > 0, `Requires staging env vars: ${env.missing.join(", ")}`);

  test("sign in, mutate state, refresh, and verify exact cloud parity across two browsers", async ({ browser, request }) => {
    const seeded = await resetAndSeedTrainerData(request, env);
    const expected = buildParitySnapshotFromPayload(seeded.payload);

    const deviceOne = await browser.newContext({ viewport: VIEWPORT });
    const deviceTwo = await browser.newContext({ viewport: VIEWPORT });

    try {
      await installRealSyncBrowserHooks(deviceOne);
      const pageOne = await deviceOne.newPage();
      await pageOne.goto("/");
      await signInThroughUi(pageOne, env);
      await waitForRetryStateToSettleOrExplain(pageOne, "initial sign-in load");

      await expect.poll(async () => readLocalParitySnapshot(pageOne)).toEqual(expected);

      expected.profileName = REAL_SYNC_TEST_DATA.editedProfileName;
      await saveProfileName(pageOne, expected.profileName);
      await expect.poll(async () => {
        await waitForRetryStateToSettleOrExplain(pageOne, "profile save");
        return buildParitySnapshotFromPayload(
          await fetchCloudTrainerPayload(request, env, seeded)
        );
      }).toEqual(expected);

      expected.goalSummary = REAL_SYNC_TEST_DATA.editedGoalSummary;
      await editPrimaryGoalSummary(pageOne, expected.goalSummary);
      await expect.poll(async () => {
        await waitForRetryStateToSettleOrExplain(pageOne, "goal edit");
        return buildParitySnapshotFromPayload(
          await fetchCloudTrainerPayload(request, env, seeded)
        );
      }).toEqual(expected);

      expected.workoutStatus = REAL_SYNC_TEST_DATA.workoutStatus;
      expected.workoutNote = REAL_SYNC_TEST_DATA.workoutNote;
      await saveTodayQuickLog(pageOne, {
        statusLabel: REAL_SYNC_TEST_DATA.workoutStatus,
        note: REAL_SYNC_TEST_DATA.workoutNote,
      });
      await expect.poll(async () => {
        await waitForRetryStateToSettleOrExplain(pageOne, "workout save");
        return buildParitySnapshotFromPayload(
          await fetchCloudTrainerPayload(request, env, seeded)
        );
      }).toEqual(expected);

      expected.nutritionNote = REAL_SYNC_TEST_DATA.nutritionNote;
      expected.nutritionDeviationKind = REAL_SYNC_TEST_DATA.nutritionDeviationKind;
      expected.nutritionIssue = REAL_SYNC_TEST_DATA.nutritionIssue;
      await logUnderFueledDay(pageOne, REAL_SYNC_TEST_DATA.nutritionNote);
      await expect.poll(async () => {
        await waitForRetryStateToSettleOrExplain(pageOne, "nutrition save");
        return buildParitySnapshotFromPayload(
          await fetchCloudTrainerPayload(request, env, seeded)
        );
      }).toEqual(expected);

      await pageOne.reload();
      await expect(pageOne.getByTestId("today-session-card")).toBeVisible();
      await waitForRetryStateToSettleOrExplain(pageOne, "device one refresh");
      await expect.poll(async () => readLocalParitySnapshot(pageOne)).toEqual(expected);
      await expectParityInUi(pageOne, expected);

      await installRealSyncBrowserHooks(deviceTwo);
      const pageTwo = await deviceTwo.newPage();
      await pageTwo.goto("/");
      await signInThroughUi(pageTwo, env);
      await waitForRetryStateToSettleOrExplain(pageTwo, "device two sign-in load");
      await pageTwo.reload();
      await expect(pageTwo.getByTestId("today-session-card")).toBeVisible();
      await waitForRetryStateToSettleOrExplain(pageTwo, "device two hard refresh");
      await expect.poll(async () => readLocalParitySnapshot(pageTwo)).toEqual(expected);
      await expectParityInUi(pageTwo, expected);

      await expect.poll(async () => {
        const cloudPayload = await fetchCloudTrainerPayload(request, env, seeded);
        return buildParitySnapshotFromPayload(cloudPayload);
      }).toEqual(expected);
    } finally {
      await Promise.allSettled([
        deviceOne.close(),
        deviceTwo.close(),
      ]);
    }
  });
});
