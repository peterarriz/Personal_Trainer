import test from "node:test";
import assert from "node:assert/strict";

import { createAuthStorageModule, LOCAL_CACHE_KEY } from "../src/modules-auth-storage.js";

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
  assert.deepEqual(JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY)), payload);
});
