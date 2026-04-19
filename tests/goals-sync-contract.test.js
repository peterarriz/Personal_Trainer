import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyStorageError,
  createAuthStorageModule,
  AUTH_CACHE_KEY,
  LOCAL_CACHE_KEY,
  STORAGE_STATUS_REASONS,
  TRANSIENT_PERSIST_RETRY_COOLDOWN_MS,
} from "../src/modules-auth-storage.js";

const noop = () => {};

test("syncGoals strips non-UUID runtime ids before posting to Supabase goals", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  await module.syncGoals({
    goals: [
      {
        id: "g_primary",
        name: "Primary goal",
        type: "time_bound",
        category: "running",
        priority: 1,
        targetDate: "2026-06-01",
        active: true,
      },
    ],
    authSession: {
      access_token: "header.payload.signature",
      refresh_token: "refresh-token",
      user: { id: "00000000-0000-0000-0000-000000000001" },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
    setAuthSession: noop,
  });

  const insertRequest = requests.find((request) => /\/rest\/v1\/goals$/.test(request.url) && request.method === "POST");
  assert.ok(insertRequest, "expected a POST request to /rest/v1/goals");
  assert.deepEqual(insertRequest.body, [
    {
      user_id: "00000000-0000-0000-0000-000000000001",
      type: "time_bound",
      category: "running",
      title: "Primary goal",
      target_value: null,
      current_value: null,
      target_date: "2026-06-01",
      priority: 1,
      status: "active",
    },
  ]);
});

test("syncGoals preserves valid UUID ids when posting to Supabase goals", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  await module.syncGoals({
    goals: [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Primary goal",
        type: "time_bound",
        category: "running",
        priority: 1,
        targetDate: "2026-06-01",
        active: true,
      },
    ],
    authSession: {
      access_token: "header.payload.signature",
      refresh_token: "refresh-token",
      user: { id: "00000000-0000-0000-0000-000000000001" },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
    setAuthSession: noop,
  });

  const insertRequest = requests.find((request) => /\/rest\/v1\/goals$/.test(request.url) && request.method === "POST");
  assert.ok(insertRequest, "expected a POST request to /rest/v1/goals");
  assert.equal(insertRequest.body?.[0]?.id, "123e4567-e89b-12d3-a456-426614174000");
});

test("handleSignOut clears the cached auth session and marks storage as signed out", async () => {
  const localStore = new Map();
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => { localStore.set(key, String(value)); },
    removeItem: (key) => { localStore.delete(key); },
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
      });
      return {
        ok: true,
        status: 204,
        json: async () => ({}),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  localStorage.setItem("trainer_auth_session_v1", JSON.stringify(authSession));

  let nextSession = authSession;
  let nextStorageStatus = null;

  await module.handleSignOut({
    authSession,
    setAuthSession: (value) => { nextSession = value; },
    setStorageStatus: (value) => { nextStorageStatus = value; },
  });

  assert.equal(nextSession, null);
  assert.equal(localStorage.getItem("trainer_auth_session_v1"), "null");
  assert.equal(nextStorageStatus?.reason, "signed_out");
  assert.ok(requests.some((request) => /\/auth\/v1\/logout$/.test(request.url) && request.method === "POST"));
});

test("handleSignUp sends initial profile metadata with the auth request", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "header.payload.signature",
          refresh_token: "refresh-token",
          user: { id: "00000000-0000-0000-0000-000000000001", email: "athlete@example.com" },
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  let nextSession = null;
  const result = await module.handleSignUp({
    authEmail: "athlete@example.com",
    authPassword: "secret-pass",
    authProfile: {
      displayName: "Peter",
      units: "imperial",
      timezone: "America/Chicago",
    },
    redirectTo: "https://forma.example.app/",
    setAuthError: noop,
    setAuthNotice: noop,
    setAuthSession: (value) => { nextSession = value; },
  });

  const signUpRequest = requests.find((request) => /\/auth\/v1\/signup$/.test(request.url));
  assert.equal(signUpRequest?.method, "POST");
  assert.equal(signUpRequest?.body?.email, "athlete@example.com");
  assert.equal(signUpRequest?.body?.data?.display_name, "Peter");
  assert.equal(signUpRequest?.body?.data?.preferred_units, "imperial");
  assert.equal(signUpRequest?.body?.data?.timezone, "America/Chicago");
  assert.equal(signUpRequest?.body?.redirect_to, "https://forma.example.app/");
  assert.equal(result?.ok, true);
  assert.equal(nextSession?.user?.email, "athlete@example.com");
});

test("signup confirmation flow requests a redirect and can resend the confirmation email", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (/\/auth\/v1\/signup$/.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "00000000-0000-0000-0000-000000000099",
              email: "confirm-me@example.com",
            },
          }),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  let nextNotice = "";
  const signUpResult = await module.handleSignUp({
    authEmail: "confirm-me@example.com",
    authPassword: "secret-pass",
    redirectTo: "https://forma.example.app/",
    setAuthError: noop,
    setAuthNotice: (value) => { nextNotice = value; },
    setAuthSession: noop,
  });

  assert.equal(signUpResult?.ok, true);
  assert.equal(signUpResult?.needsEmailConfirmation, true);
  assert.equal(signUpResult?.pendingConfirmationEmail, "confirm-me@example.com");
  assert.match(nextNotice, /check your email/i);

  const resendResult = await module.handleResendSignupConfirmation({
    authEmail: "confirm-me@example.com",
    redirectTo: "https://forma.example.app/",
    setAuthError: noop,
    setAuthNotice: (value) => { nextNotice = value; },
  });

  const resendRequest = requests.find((request) => /\/auth\/v1\/resend$/.test(request.url));
  assert.equal(resendResult?.ok, true);
  assert.equal(resendRequest?.method, "POST");
  assert.equal(resendRequest?.body?.email, "confirm-me@example.com");
  assert.equal(resendRequest?.body?.type, "signup");
  assert.equal(resendRequest?.body?.redirect_to, "https://forma.example.app/");
  assert.match(nextNotice, /confirmation email resent/i);
});

test("handleSignUp detects Supabase's already-registered obfuscated response and avoids the misleading check-your-email notice", async () => {
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url) => {
      if (/\/auth\/v1\/signup$/.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "00000000-0000-0000-0000-000000000099",
              email: "already@example.com",
              identities: [],
            },
          }),
          text: async () => "",
        };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  let nextNotice = "";
  const result = await module.handleSignUp({
    authEmail: "already@example.com",
    authPassword: "secret-pass",
    redirectTo: "https://forma.example.app/",
    setAuthError: noop,
    setAuthNotice: (value) => { nextNotice = value; },
    setAuthSession: noop,
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.alreadyRegistered, true);
  assert.equal(result?.needsEmailConfirmation, false);
  assert.equal(result?.pendingConfirmationEmail, "");
  assert.match(nextNotice, /already registered/i);
  assert.doesNotMatch(nextNotice, /check your email/i);
});

test("handleSignUp surfaces a helpful message when Supabase blocks email delivery", async () => {
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        message: "Email address not authorized",
        error_code: "email_address_not_authorized",
      }),
      text: async () => JSON.stringify({
        message: "Email address not authorized",
        error_code: "email_address_not_authorized",
      }),
    }),
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  let authError = "";
  const result = await module.handleSignUp({
    authEmail: "athlete@example.com",
    authPassword: "secret-pass",
    redirectTo: "https://forma.example.app/",
    setAuthError: (value) => { authError = value; },
    setAuthNotice: noop,
    setAuthSession: noop,
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, "email_delivery_not_authorized");
  assert.match(authError, /custom smtp|team email/i);
});

test("handleSignUp surfaces invalid public auth key misconfiguration clearly", async () => {
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        message: "Invalid API key",
      }),
      text: async () => JSON.stringify({
        message: "Invalid API key",
      }),
    }),
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  let authError = "";
  const result = await module.handleSignUp({
    authEmail: "athlete@example.com",
    authPassword: "secret-pass",
    redirectTo: "https://forma.example.app/",
    setAuthError: (value) => { authError = value; },
    setAuthNotice: noop,
    setAuthSession: noop,
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, "invalid_api_key");
  assert.match(authError, /public auth key/i);
});

test("persistAll keeps local cache active when no signed-in session exists", async () => {
  const localStore = new Map();
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => { localStore.set(key, String(value)); },
    removeItem: (key) => { localStore.delete(key); },
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async () => {
      throw new Error("network should not be called without auth");
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  let nextStorageStatus = null;
  const payload = {
    version: "runtime_storage_v1",
    logs: {},
    bodyweights: [],
    paceOverrides: {},
    weekNotes: {},
    planAlerts: [],
    personalization: { profile: { onboardingComplete: true } },
    goals: [],
    coachActions: [],
    coachPlanAdjustments: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
  };

  await module.persistAll({
    payload,
    authSession: null,
    setStorageStatus: (value) => { nextStorageStatus = value; },
    setAuthSession: noop,
  });

  assert.equal(nextStorageStatus?.reason, "not_signed_in");
  const cachedPayload = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY));
  assert.deepEqual(
    { ...cachedPayload, syncMeta: undefined, adaptiveLearning: undefined },
    { ...payload, syncMeta: undefined, adaptiveLearning: undefined }
  );
  assert.equal(cachedPayload?.syncMeta?.pendingCloudWrite, false);
});

test("persistAll keeps signed-in onboarding setup local until onboarding completes", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const payload = {
    version: "runtime_storage_v1",
    logs: {},
    bodyweights: [],
    paceOverrides: {},
    weekNotes: {},
    planAlerts: [],
    personalization: {
      profile: {
        onboardingComplete: false,
        profileSetupComplete: true,
      },
    },
    goals: [],
    coachActions: [],
    coachPlanAdjustments: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
    v: 6,
    contractVersion: "runtime_storage_v1",
    ts: 1713330000000,
  };

  let nextStorageStatus = null;
  const result = await module.persistAll({
    payload,
    authSession,
    setStorageStatus: (value) => { nextStorageStatus = value; },
    setAuthSession: noop,
  });

  assert.equal(result?.skipped, true);
  assert.equal(result?.deferred, true);
  assert.equal(nextStorageStatus?.reason, STORAGE_STATUS_REASONS.setupDeferred);
  assert.equal(requests.length, 0);
});

test("persistAll skips unchanged goal and coach-memory shadow syncs on repeated saves", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const payload = {
    version: "runtime_storage_v1",
    logs: {},
    bodyweights: [],
    paceOverrides: {},
    weekNotes: {},
    planAlerts: [],
    personalization: {
      profile: {
        onboardingComplete: true,
      },
      coachMemory: {
        wins: ["Stays consistent"],
        constraints: ["Busy mornings"],
      },
    },
    goals: [
      {
        id: "goal_1",
        name: "Bench 225",
        category: "strength",
        priority: 1,
        active: true,
      },
    ],
    coachActions: [],
    coachPlanAdjustments: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
  };

  await module.persistAll({
    payload,
    authSession,
    setStorageStatus: noop,
    setAuthSession: noop,
  });
  await module.persistAll({
    payload,
    authSession,
    setStorageStatus: noop,
    setAuthSession: noop,
  });

  const goalsPosts = requests.filter((request) => /\/rest\/v1\/goals$/.test(request.url) && request.method === "POST");
  const coachMemoryPosts = requests.filter((request) => /\/rest\/v1\/coach_memory$/.test(request.url) && request.method === "POST");
  const trainerDataPosts = requests.filter((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");

  assert.equal(goalsPosts.length, 1);
  assert.equal(coachMemoryPosts.length, 1);
  assert.equal(trainerDataPosts.length, 1);
});

test("persistAll ignores timestamp-only payload churn when deciding whether cloud state changed", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const basePayload = {
    version: "runtime_storage_v1",
    logs: {},
    bodyweights: [],
    paceOverrides: {},
    weekNotes: {},
    planAlerts: [],
    personalization: {
      profile: {
        onboardingComplete: true,
        profileSetupComplete: true,
      },
      coachMemory: {
        wins: ["Stayed consistent"],
      },
    },
    goals: [],
    coachActions: [],
    coachPlanAdjustments: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
    v: 6,
    contractVersion: "runtime_storage_v1",
  };

  await module.persistAll({
    payload: { ...basePayload, ts: 1713330000000 },
    authSession,
    setStorageStatus: noop,
    setAuthSession: noop,
  });
  await module.persistAll({
    payload: { ...basePayload, ts: 1713330001000 },
    authSession,
    setStorageStatus: noop,
    setAuthSession: noop,
  });

  const trainerDataPosts = requests.filter((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
  assert.equal(trainerDataPosts.length, 1);
});

test("persistAll backs off repeated transient cloud-save attempts instead of hammering trainer_data", async () => {
  const requests = [];
  const localStore = new Map();
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => { localStore.set(key, String(value)); },
    removeItem: (key) => { localStore.delete(key); },
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: false,
        status: 504,
        json: async () => ([]),
        text: async () => "gateway timeout",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const basePayload = {
    version: "runtime_storage_v1",
    logs: {},
    bodyweights: [],
    paceOverrides: {},
    weekNotes: {},
    planAlerts: [],
    personalization: {
      profile: {
        onboardingComplete: true,
        profileSetupComplete: true,
      },
    },
    goals: [],
    coachActions: [],
    coachPlanAdjustments: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
    v: 6,
    contractVersion: "runtime_storage_v1",
  };

  const firstResult = await module.persistAll({
    payload: { ...basePayload, ts: 1713330000000 },
    authSession,
    setStorageStatus: noop,
    setAuthSession: noop,
  });
  const secondResult = await module.persistAll({
    payload: {
      ...basePayload,
      ts: 1713330001000,
      dailyCheckins: {
        "2026-04-17": {
          status: "skipped",
          note: "second local mutation",
          ts: 1713330001000,
        },
      },
    },
    authSession,
    setStorageStatus: noop,
    setAuthSession: noop,
  });

  const trainerDataPosts = requests.filter((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
  assert.equal(firstResult?.status?.reason, STORAGE_STATUS_REASONS.transient);
  assert.equal(secondResult?.status?.reason, STORAGE_STATUS_REASONS.transient);
  assert.equal(secondResult?.cooldown, true);
  assert.equal(trainerDataPosts.length, 1);

  const cachedPayload = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "{}");
  assert.equal(cachedPayload?.syncMeta?.pendingCloudWrite, true);
  assert.equal(cachedPayload?.dailyCheckins?.["2026-04-17"]?.note, "second local mutation");
});

test("persistAll retries cloud save again after the transient cooldown window expires", async () => {
  const realDateNow = Date.now;
  let now = 1713330000000;
  Date.now = () => now;
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
  };

  let shouldFail = true;
  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
      });
      return {
        ok: !shouldFail,
        status: shouldFail ? 504 : 200,
        json: async () => ([]),
        text: async () => shouldFail ? "gateway timeout" : "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(now / 1000) + 3600,
  };
  const payload = {
    version: "runtime_storage_v1",
    logs: {},
    bodyweights: [],
    paceOverrides: {},
    weekNotes: {},
    planAlerts: [],
    personalization: {
      profile: {
        onboardingComplete: true,
        profileSetupComplete: true,
      },
    },
    goals: [],
    coachActions: [],
    coachPlanAdjustments: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
    v: 6,
    contractVersion: "runtime_storage_v1",
    ts: now,
  };

  try {
    const firstResult = await module.persistAll({
      payload,
      authSession,
      setStorageStatus: noop,
      setAuthSession: noop,
    });
    assert.equal(firstResult?.status?.reason, STORAGE_STATUS_REASONS.transient);

    now += 1000;
    const secondResult = await module.persistAll({
      payload: { ...payload, ts: now },
      authSession,
      setStorageStatus: noop,
      setAuthSession: noop,
    });
    assert.equal(secondResult?.cooldown, true);

    shouldFail = false;
    now += TRANSIENT_PERSIST_RETRY_COOLDOWN_MS + 1;
    const thirdResult = await module.persistAll({
      payload: { ...payload, ts: now, weekNotes: { "4": "retry after cooldown" } },
      authSession,
      setStorageStatus: noop,
      setAuthSession: noop,
    });
    assert.equal(thirdResult?.synced, true);

    const trainerDataPosts = requests.filter((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
    assert.equal(trainerDataPosts.length, 2);
  } finally {
    Date.now = realDateNow;
  }
});

test("transient network storage failures are labeled as retrying instead of permanent fallback", () => {
  const status = classifyStorageError(new Error("FETCH_NETWORK: load failed"));

  assert.equal(status.reason, STORAGE_STATUS_REASONS.transient);
  assert.equal(status.label, "SYNC RETRYING");
  assert.match(status.detail, /temporarily unreachable|saved safely/i);
});

test("handleDeleteAccount calls the server delete path and clears local caches", async () => {
  const localStore = new Map();
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  global.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => { localStore.set(key, String(value)); },
    removeItem: (key) => { localStore.delete(key); },
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      const method = options.method || "GET";
      requests.push({
        url,
        method,
        headers: options.headers || {},
      });
      if (url === "/api/auth/delete-account" && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            code: "delete_account_configured",
            configured: true,
            required: [],
            missing: [],
            message: "Permanent account delete is available for this signed-in account on this deployment.",
            detail: "The deployment can verify the signed-in account and perform the delete.",
            fix: "",
          }),
          text: async () => "",
        };
      }
      if (url === "/api/auth/delete-account" && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, code: "delete_account_deleted", message: "Account deleted." }),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authSession));
  localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ version: "runtime_storage_v1" }));

  let nextSession = authSession;
  let nextStorageStatus = null;
  let cleared = false;

  await module.handleDeleteAccount({
    authSession,
    setAuthSession: (value) => { nextSession = value; },
    setStorageStatus: (value) => { nextStorageStatus = value; },
    clearLocalData: async () => { cleared = true; },
  });

  assert.equal(nextSession, null);
  assert.equal(cleared, true);
  assert.equal(localStorage.getItem(AUTH_CACHE_KEY), null);
  assert.equal(localStorage.getItem(LOCAL_CACHE_KEY), null);
  assert.equal(nextStorageStatus?.reason, STORAGE_STATUS_REASONS.accountDeleted);
  assert.ok(requests.some((request) => request.url === "/api/auth/delete-account" && request.method === "GET"));
  const diagnosticsRequest = requests.find((request) => request.url === "/api/auth/delete-account" && request.method === "GET");
  assert.match(String(diagnosticsRequest?.headers?.Authorization || ""), /^Bearer /);
  assert.ok(requests.some((request) => request.url === "/api/auth/delete-account" && request.method === "POST"));
});

test("handleDeleteAccount stops before POST when delete-account diagnostics report missing deployment config", async () => {
  const requests = [];
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };

  const module = createAuthStorageModule({
    safeFetchWithTimeout: async (url, options = {}) => {
      const method = options.method || "GET";
      requests.push({ url, method, headers: options.headers || {} });
      if (url === "/api/auth/delete-account" && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            code: "delete_account_not_configured",
            configured: false,
            required: [],
            missing: [],
            message: "Permanent account delete is not available on this deployment.",
            detail: "This deployment does not currently support permanent account delete.",
            fix: "",
          }),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    },
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  const authSession = {
    access_token: "header.payload.signature",
    refresh_token: "refresh-token",
    user: { id: "00000000-0000-0000-0000-000000000001" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  await assert.rejects(
    module.handleDeleteAccount({
      authSession,
      setAuthSession: noop,
      setStorageStatus: noop,
      clearLocalData: async () => {},
    }),
    (error) => {
      assert.equal(error?.code, "delete_account_not_configured");
      assert.deepEqual(error?.missing, []);
      assert.equal(String(error?.fix || ""), "");
      return true;
    }
  );

  assert.ok(requests.some((request) => request.url === "/api/auth/delete-account" && request.method === "GET"));
  const diagnosticsRequest = requests.find((request) => request.url === "/api/auth/delete-account" && request.method === "GET");
  assert.match(String(diagnosticsRequest?.headers?.Authorization || ""), /^Bearer /);
  assert.equal(requests.some((request) => request.url === "/api/auth/delete-account" && request.method === "POST"), false);
});
