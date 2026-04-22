import test from "node:test";
import assert from "node:assert/strict";

import { createAuthStorageModule } from "../src/modules-auth-storage.js";
import { buildPersistedTrainerPayload } from "../src/services/persistence-adapter-service.js";
import { SYNC_DIAGNOSTIC_EVENT_TYPES } from "../src/services/sync-diagnostics-service.js";
import { createAdaptiveLearningStore } from "../src/services/adaptive-learning-store-service.js";
import {
  ADAPTIVE_LEARNING_EVENT_NAMES,
  ADAPTIVE_RECOMMENDATION_KINDS,
} from "../src/services/adaptive-learning-event-service.js";

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

const createModule = ({ fetchImpl, reportSyncDiagnostic = noop, adaptiveLearningStore = null }) => {
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
    adaptiveLearningStore,
  });
};

const buildAdaptiveRecommendationPayload = () => ({
  recommendationKind: ADAPTIVE_RECOMMENDATION_KINDS.dayPrescription,
  recommendationJoinKey: "join_1",
  goalStack: [{ id: "goal_1", summary: "Run faster", category: "running", priority: 1, active: true }],
  planStage: {
    currentPhase: "BUILD",
    currentWeek: 3,
    currentDay: 2,
    dateKey: "2026-04-18",
    planWeekId: "plan_week_3",
    planDayId: "plan_day_2026-04-18",
  },
  contextualInputs: {},
  candidateOptionsConsidered: [],
  chosenOption: {
    optionKey: "tempo",
    label: "Tempo run",
    source: "deterministic_engine",
    accepted: true,
  },
  whyChosen: ["Threshold focus"],
  provenance: {
    source: "plan_day_resolution",
    summary: "Resolved from planner",
  },
  sourceSurface: "today",
  owner: "planning",
});

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

test("persistAll replays pending adaptive events to the dedicated sink after a cloud save", async () => {
  installLocalStorage();
  const session = buildSession();
  const adaptiveLearningStore = createAdaptiveLearningStore();
  adaptiveLearningStore.recordEvent({
    eventName: ADAPTIVE_LEARNING_EVENT_NAMES.recommendationGenerated,
    dedupeKey: "day_prescription_plan_day_2026-04-18",
    payload: buildAdaptiveRecommendationPayload(),
  });

  const requests = [];
  const module = createModule({
    adaptiveLearningStore,
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (/\/rest\/v1\/trainer_data$/.test(url) && (options.method || "GET") === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      if (url === "/api/adaptive-learning/events" && (options.method || "GET") === "POST") {
        return {
          ok: true,
          status: 202,
          json: async () => ({
            ok: true,
            code: "adaptive_events_ingested",
            ingestedEventIds: options.body ? JSON.parse(options.body).eventIds : [],
            pendingEventIds: [],
            transport: "supabase_event_sink",
          }),
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

  const payload = buildPayload({
    label: "Local Tempo Run",
    note: "Unsynced local copy",
    ts: 1714000000000,
  });

  const result = await module.persistAll({
    payload,
    authSession: session,
    setStorageStatus: noop,
    setAuthSession: noop,
  });

  assert.equal(result.ok, true);
  const sinkRequest = requests.find((request) => request.url === "/api/adaptive-learning/events" && request.method === "POST");
  assert.equal(Boolean(sinkRequest), true);
  assert.equal(Array.isArray(sinkRequest?.body?.events), true);
  assert.equal(sinkRequest?.body?.events?.length >= 1, true);
  assert.equal(adaptiveLearningStore.getSnapshot().pendingServerEventIds.length, 0);
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

test("sbLoad coalesces concurrent cloud reloads for the same signed-in user", async () => {
  const session = buildSession();
  installLocalStorage();

  let trainerDataGetRequests = 0;
  let resolveTrainerDataGet;
  const trainerDataGetPromise = new Promise((resolve) => {
    resolveTrainerDataGet = resolve;
  });

  const module = createModule({
    fetchImpl: async (url) => {
      if (/\/rest\/v1\/trainer_data\?user_id=eq\./.test(url)) {
        trainerDataGetRequests += 1;
        await trainerDataGetPromise;
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "trainer_v1_user", user_id: session.user.id, data: buildPayload({ label: "Cloud Tempo Run" }) }],
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

  const firstLoad = module.sbLoad({
    authSession: session,
    setters: {},
    persistAll: noop,
    setAuthSession: noop,
  });
  const secondLoad = module.sbLoad({
    authSession: session,
    setters: {},
    persistAll: noop,
    setAuthSession: noop,
  });

  resolveTrainerDataGet();
  const [firstResult, secondResult] = await Promise.all([firstLoad, secondLoad]);

  assert.equal(trainerDataGetRequests, 1);
  assert.equal(firstResult?.synced, true);
  assert.equal(secondResult?.synced, true);
});

test("sign out invalidates an in-flight cloud save so stale success cannot overwrite signed-out state", async () => {
  const session = buildSession();
  const localStore = installLocalStorage({
    trainer_auth_session_v1: session,
  });
  const statuses = [];

  let resolveTrainerDataPost;
  const trainerDataPostPromise = new Promise((resolve) => {
    resolveTrainerDataPost = resolve;
  });

  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      const method = options.method || "GET";
      if (/\/rest\/v1\/trainer_data$/.test(url) && method === "POST") {
        await trainerDataPostPromise;
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
      if (/\/auth\/v1\/logout$/.test(url) && method === "POST") {
        return {
          ok: true,
          status: 204,
          json: async () => ({}),
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

  const persistPromise = module.persistAll({
    payload: buildPayload(),
    authSession: session,
    setStorageStatus: (status) => statuses.push(status),
    setAuthSession: noop,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  let nextSession = session;
  await module.handleSignOut({
    authSession: session,
    setAuthSession: (value) => {
      nextSession = value;
    },
    setStorageStatus: (status) => statuses.push(status),
  });

  resolveTrainerDataPost();
  const persistResult = await persistPromise;

  assert.equal(persistResult?.stale, true);
  assert.equal(nextSession, null);
  assert.equal(statuses.at(-1)?.reason, "signed_out");
  assert.equal(localStore.get("trainer_auth_session_v1"), "null");
  assert.ok(localStore.has("trainer_local_cache_v4"));
});

test("delete account invalidates an in-flight cloud save so cleared device state stays cleared", async () => {
  const session = buildSession();
  const localStore = installLocalStorage({
    trainer_auth_session_v1: session,
    trainer_local_cache_v4: buildPayload(),
  });
  const statuses = [];

  let resolveTrainerDataPost;
  const trainerDataPostPromise = new Promise((resolve) => {
    resolveTrainerDataPost = resolve;
  });

  const module = createModule({
    fetchImpl: async (url, options = {}) => {
      const method = options.method || "GET";
      if (/\/rest\/v1\/trainer_data$/.test(url) && method === "POST") {
        await trainerDataPostPromise;
        return {
          ok: true,
          status: 200,
          json: async () => ([]),
          text: async () => "",
        };
      }
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
        json: async () => ([]),
        text: async () => "",
      };
    },
  });

  const persistPromise = module.persistAll({
    payload: buildPayload(),
    authSession: session,
    setStorageStatus: (status) => statuses.push(status),
    setAuthSession: noop,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  let nextSession = session;
  await module.handleDeleteAccount({
    authSession: session,
    setAuthSession: (value) => {
      nextSession = value;
    },
    setStorageStatus: (status) => statuses.push(status),
    setAuthError: noop,
    clearLocalData: async () => {},
  });

  resolveTrainerDataPost();
  const persistResult = await persistPromise;

  assert.equal(persistResult?.stale, true);
  assert.equal(nextSession, null);
  assert.equal(statuses.at(-1)?.reason, "account_deleted");
  assert.equal(localStore.get("trainer_auth_session_v1"), undefined);
  assert.equal(localStore.get("trainer_local_cache_v4"), undefined);
});
