import test from "node:test";
import assert from "node:assert/strict";

import { createAuthStorageModule } from "../src/modules-auth-storage.js";
import { buildPersistedTrainerPayload } from "../src/services/persistence-adapter-service.js";
import { SYNC_DIAGNOSTIC_EVENT_TYPES } from "../src/services/sync-diagnostics-service.js";

const noop = () => {};

const buildSession = () => ({
  access_token: "header.payload.signature",
  refresh_token: "refresh-token",
  user: { id: "00000000-0000-0000-0000-000000000001", email: "athlete@example.com" },
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});

const buildPayload = ({
  label = "Tempo Run",
  note = "Local mutation",
  ts = 1714000000000,
  nutritionActualLogs = {},
} = {}) => buildPersistedTrainerPayload({
  runtimeState: {
    logs: {
      "2026-04-16": {
        date: "2026-04-16",
        type: label,
        notes: note,
        actualSession: {
          status: "skipped",
          sessionLabel: label,
        },
        checkin: {
          status: "skipped",
          note,
          ts,
        },
        ts,
      },
    },
    dailyCheckins: {
      "2026-04-16": {
        status: "skipped",
        note,
        ts,
      },
    },
    personalization: {
      profile: {
        onboardingComplete: true,
        profileSetupComplete: true,
      },
    },
    goals: [],
    coachActions: [],
    coachPlanAdjustments: {},
    weeklyCheckins: {},
    nutritionFavorites: {},
    nutritionActualLogs,
    plannedDayRecords: {},
    planWeekRecords: {},
  },
  timestamp: ts,
});

const installLocalStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
  global.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
  return store;
};

const createModule = ({ fetchImpl, reportSyncDiagnostic = noop }) => {
  global.window = {
    __SUPABASE_URL: "https://example.supabase.co",
    __SUPABASE_ANON_KEY: "anon-key",
  };
  return createAuthStorageModule({
    safeFetchWithTimeout: fetchImpl,
    logDiag: noop,
    mergePersonalization: (base, patch) => ({ ...(base || {}), ...(patch || {}) }),
    normalizeGoals: (goals) => goals,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
    reportSyncDiagnostic,
  });
};

test("sbLoad prefers a newer pending local cache over stale cloud rows and clears the pending marker after replay", async () => {
  const session = buildSession();
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: 1713990000000,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Tempo Run",
      note: "Unsynced local copy",
      ts: 1714000000000,
    }),
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: 1714000000000,
      lastCloudSyncTs: 1713990000000,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  const requests = [];
  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
          text: async () => "",
        };
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  let appliedLogs = null;
  await module.sbLoad({
    authSession: session,
    setters: {
      setLogs: (value) => {
        appliedLogs = value;
      },
    },
    persistAll: noop,
    setAuthSession: noop,
  });

  assert.equal(appliedLogs?.["2026-04-16"]?.type, "Local Tempo Run");
  const replayPost = requests.find((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
  assert.equal(replayPost?.body?.data?.logs?.["2026-04-16"]?.type, "Local Tempo Run");

  const savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, false);
  assert.equal(savedCache?.logs?.["2026-04-16"]?.type, "Local Tempo Run");
});

test("sbLoad keeps the pending marker when the local replay still cannot reach the cloud", async () => {
  const session = buildSession();
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: 1713990000000,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Tempo Run",
      note: "Unsynced local copy",
      ts: 1714000000000,
    }),
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: 1714000000000,
      lastCloudSyncTs: 1713990000000,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
          text: async () => "",
        };
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: false,
          status: 504,
          json: async () => ([]),
          text: async () => "gateway timeout",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  let appliedLogs = null;
  await assert.rejects(
    module.sbLoad({
      authSession: session,
      setters: {
        setLogs: (value) => {
          appliedLogs = value;
        },
      },
      persistAll: noop,
      setAuthSession: noop,
    })
  );

  assert.equal(appliedLogs?.["2026-04-16"]?.type, "Local Tempo Run");
  const savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, true);
  assert.equal(savedCache?.logs?.["2026-04-16"]?.type, "Local Tempo Run");
});

test("sbLoad replays pending nutrition actual logs from newer local cache into cloud and clears the pending marker", async () => {
  const session = buildSession();
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: 1713990000000,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Tempo Run",
      note: "Unsynced local copy",
      ts: 1714000000000,
      nutritionActualLogs: {
        "2026-04-15": {
          dateKey: "2026-04-15",
          deviationKind: "under_fueled",
          issue: "hunger",
          note: "Missed the pre-run meal",
          loggedAt: 1714000000000,
        },
      },
    }),
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: 1714000000000,
      lastCloudSyncTs: 1713990000000,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  const requests = [];
  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
          text: async () => "",
        };
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  let appliedNutritionActualLogs = null;
  await module.sbLoad({
    authSession: session,
    setters: {
      setNutritionActualLogs: (value) => {
        appliedNutritionActualLogs = value;
      },
    },
    persistAll: noop,
    setAuthSession: noop,
  });

  assert.equal(appliedNutritionActualLogs?.["2026-04-15"]?.note, "Missed the pre-run meal");
  const replayPost = requests.find((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
  assert.equal(replayPost?.body?.data?.nutritionActualLogs?.["2026-04-15"]?.note, "Missed the pre-run meal");

  const savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, false);
  assert.equal(savedCache?.nutritionActualLogs?.["2026-04-15"]?.note, "Missed the pre-run meal");
});

test("sbLoad resumes newer pending onboarding intake locally without replaying it to cloud yet", async () => {
  const session = buildSession();
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: 1713990000000,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Setup Draft",
      note: "Resume my unfinished intake",
      ts: 1714000000000,
    }),
    personalization: {
      profile: {
        onboardingComplete: false,
        profileSetupComplete: true,
      },
    },
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: 1714000000000,
      lastCloudSyncTs: 1713990000000,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  const requests = [];
  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  let appliedLogs = null;
  await module.sbLoad({
    authSession: session,
    setters: {
      setLogs: (value) => {
        appliedLogs = value;
      },
    },
    persistAll: noop,
    setAuthSession: noop,
  });

  assert.equal(appliedLogs?.["2026-04-16"]?.type, "Local Setup Draft");
  const replayPost = requests.find((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
  assert.equal(replayPost, undefined);

  const savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, true);
  assert.equal(savedCache?.personalization?.profile?.onboardingComplete, false);
});

test("pending local replay after a transient failure reconciles once and does not replay again on the next identical load", async () => {
  const session = buildSession();
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: 1713990000000,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Tempo Run",
      note: "Unsynced retry copy",
      ts: 1714000000000,
      nutritionActualLogs: {
        "2026-04-15": {
          dateKey: "2026-04-15",
          deviationKind: "under_fueled",
          issue: "hunger",
          note: "Retry recovery meal note",
          loggedAt: 1714000000000,
        },
      },
    }),
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: 1714000000000,
      lastCloudSyncTs: 1713990000000,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  let failReplayPost = true;
  const requests = [];
  const cloudRows = [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }];
  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      const method = options.method || "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ url, method, body });
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => cloudRows,
          text: async () => "",
        };
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && method === "POST") {
        if (failReplayPost) {
          failReplayPost = false;
          return {
            ok: false,
            status: 504,
            json: async () => ([]),
            text: async () => "gateway timeout",
          };
        }
        cloudRows[0] = {
          id: body.id || "trainer_v1_user",
          user_id: body.user_id || session.user.id,
          data: body.data || {},
        };
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  await assert.rejects(
    module.sbLoad({
      authSession: session,
      setters: {},
      persistAll: noop,
      setAuthSession: noop,
    })
  );

  let savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, true);
  assert.equal(savedCache?.dailyCheckins?.["2026-04-16"]?.note, "Unsynced retry copy");
  assert.equal(savedCache?.nutritionActualLogs?.["2026-04-15"]?.note, "Retry recovery meal note");

  await module.sbLoad({
    authSession: session,
    setters: {},
    persistAll: noop,
    setAuthSession: noop,
  });

  savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, false);
  assert.equal(savedCache?.dailyCheckins?.["2026-04-16"]?.note, "Unsynced retry copy");
  assert.equal(savedCache?.nutritionActualLogs?.["2026-04-15"]?.note, "Retry recovery meal note");
  assert.equal(cloudRows[0]?.data?.dailyCheckins?.["2026-04-16"]?.note, "Unsynced retry copy");
  assert.equal(cloudRows[0]?.data?.nutritionActualLogs?.["2026-04-15"]?.note, "Retry recovery meal note");

  const replayPostsAfterRecovery = requests.filter((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST").length;

  await module.sbLoad({
    authSession: session,
    setters: {},
    persistAll: noop,
    setAuthSession: noop,
  });

  const replayPostsAfterRepeatLoad = requests.filter((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST").length;
  assert.equal(replayPostsAfterRepeatLoad, replayPostsAfterRecovery);
});

test("sbLoad prefers pending local writes when payloads differ even if local and cloud timestamps tie", async () => {
  const session = buildSession();
  const sharedTs = 1714000000000;
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: sharedTs,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Tempo Run",
      note: "Pending local recovery copy",
      ts: sharedTs,
    }),
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: sharedTs,
      lastCloudSyncTs: sharedTs,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  const requests = [];
  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
          text: async () => "",
        };
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  let appliedLogs = null;
  await module.sbLoad({
    authSession: session,
    setters: {
      setLogs: (value) => {
        appliedLogs = value;
      },
    },
    persistAll: noop,
    setAuthSession: noop,
  });

  assert.equal(appliedLogs?.["2026-04-16"]?.type, "Local Tempo Run");
  const replayPost = requests.find((request) => /\/rest\/v1\/trainer_data$/.test(request.url) && request.method === "POST");
  assert.equal(replayPost?.body?.data?.dailyCheckins?.["2026-04-16"]?.note, "Pending local recovery copy");

  const savedCache = JSON.parse(global.localStorage.getItem("trainer_local_cache_v4") || "{}");
  assert.equal(savedCache?.syncMeta?.pendingCloudWrite, false);
  assert.equal(savedCache?.dailyCheckins?.["2026-04-16"]?.note, "Pending local recovery copy");
});

test("persistAll reports trainer_data save diagnostics with status, retry eligibility, and pending local writes", async () => {
  installLocalStorage();
  const session = buildSession();
  const diagnostics = [];
  const module = createModule({
    reportSyncDiagnostic: (event) => diagnostics.push(event),
    fetchImpl: async (url, options = {}) => {
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: false,
          status: 504,
          json: async () => ([]),
          text: async () => "gateway timeout",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  const result = await module.persistAll({
    payload: buildPayload(),
    authSession: session,
    setStorageStatus: noop,
    setAuthSession: noop,
  });

  assert.equal(result?.ok, false);
  const saveAttempt = diagnostics.find((event) => event?.type === SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveAttempt);
  const saveFailure = diagnostics.find((event) => event?.type === SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveResult && event?.ok === false);
  assert.equal(saveAttempt?.endpoint, "rest/v1/trainer_data");
  assert.equal(saveAttempt?.method, "POST");
  assert.equal(saveFailure?.httpStatus, 504);
  assert.equal(saveFailure?.retryEligible, true);
  assert.equal(saveFailure?.pendingLocalWrites, true);
});

test("ensureValidSession reports auth refresh diagnostics when the refresh token is rejected", async () => {
  installLocalStorage();
  const diagnostics = [];
  const expiredSession = {
    ...buildSession(),
    expires_at: Math.floor((Date.now() - 60_000) / 1000),
  };
  const module = createModule({
    reportSyncDiagnostic: (event) => diagnostics.push(event),
    fetchImpl: async (url) => {
      if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(url)) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: "Invalid refresh token", code: "invalid_grant" }),
          text: async () => JSON.stringify({ message: "Invalid refresh token", code: "invalid_grant" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  const result = await module.ensureValidSession(expiredSession, { reason: "unit_test_refresh_failure" });

  assert.equal(result?.status, "refresh_failed");
  const refreshFailure = diagnostics.find((event) => event?.type === SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshResult && event?.ok === false);
  assert.equal(refreshFailure?.endpoint, "auth/v1/token?grant_type=refresh_token");
  assert.equal(refreshFailure?.httpStatus, 401);
  assert.equal(refreshFailure?.supabaseErrorCode, "invalid_grant");
});

test("ensureValidSession keeps the cached session when refresh fails transiently", async () => {
  installLocalStorage();
  const diagnostics = [];
  const expiredSession = {
    ...buildSession(),
    expires_at: Math.floor((Date.now() - 60_000) / 1000),
  };
  const module = createModule({
    reportSyncDiagnostic: (event) => diagnostics.push(event),
    fetchImpl: async (url) => {
      if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(url)) {
        const error = new Error("network request failed");
        error.code = "fetch_network";
        throw error;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  const result = await module.ensureValidSession(expiredSession, { reason: "unit_test_refresh_transient" });

  assert.equal(result?.status, "transient");
  assert.equal(result?.session?.user?.id, expiredSession.user.id);
  const refreshFailure = diagnostics.find((event) => event?.type === SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshResult && event?.ok === false);
  assert.equal(refreshFailure?.retryEligible, true);
  assert.equal(refreshFailure?.supabaseErrorCode, "fetch_network");
});

test("persistAll stays in retryable local fallback when refresh fails transiently", async () => {
  installLocalStorage();
  const statuses = [];
  const expiredSession = {
    ...buildSession(),
    expires_at: Math.floor((Date.now() - 60_000) / 1000),
  };
  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(url)) {
        const error = new Error("network request failed");
        error.code = "fetch_network";
        throw error;
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: "JWT expired", code: "PGRST301" }),
          text: async () => JSON.stringify({ message: "JWT expired", code: "PGRST301" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  const result = await module.persistAll({
    payload: buildPayload(),
    authSession: expiredSession,
    setStorageStatus: (status) => statuses.push(status),
    setAuthSession: noop,
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.status?.reason, "sync_temporarily_failed");
  assert.equal(statuses.at(-1)?.reason, "sync_temporarily_failed");
});

test("sbLoad reports when a newer pending local cache outranks the cloud row", async () => {
  const session = buildSession();
  const cloudPayload = buildPayload({
    label: "Cloud Easy Run",
    note: "Older cloud copy",
    ts: 1713990000000,
  });
  const localPayload = {
    ...buildPayload({
      label: "Local Tempo Run",
      note: "Unsynced local copy",
      ts: 1714000000000,
    }),
    syncMeta: {
      pendingCloudWrite: true,
      lastLocalMutationTs: 1714000000000,
      lastCloudSyncTs: 1713990000000,
    },
  };
  installLocalStorage({
    trainer_local_cache_v4: localPayload,
  });

  const diagnostics = [];
  const module = createModule({
    reportSyncDiagnostic: (event) => diagnostics.push(event),
    fetchImpl: async (url, options = {}) => {
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: cloudPayload }],
          text: async () => "",
        };
      }
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  await module.sbLoad({
    authSession: session,
    setters: {},
    persistAll: noop,
    setAuthSession: noop,
  });

  const authorityDecision = diagnostics.find((event) => event?.type === SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheDecision);
  assert.equal(authorityDecision?.decision, "prefer_pending_local");
  assert.equal(authorityDecision?.localTs, 1714000000000);
  assert.equal(authorityDecision?.cloudTs, 1713990000000);
});
