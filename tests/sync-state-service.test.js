import test from "node:test";
import assert from "node:assert/strict";

import { STORAGE_STATUS_REASONS, buildStorageStatus } from "../src/modules-auth-storage.js";
import {
  buildSyncStateModel,
  buildSyncSurfaceModel,
  createInitialSyncRuntimeState,
  reduceSyncRuntimeState,
  SYNC_RUNTIME_EVENT_TYPES,
  SYNC_STATE_IDS,
  SYNC_STATE_TONES,
  SYNC_SURFACE_KEYS,
} from "../src/services/sync-state-service.js";

test("sync runtime reducer tracks start, retry, and recovery without losing local-write context", () => {
  const startedAt = Date.UTC(2026, 3, 15, 12, 0, 0);
  let runtime = createInitialSyncRuntimeState({ isOnline: true, now: startedAt });

  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.localMutationRecorded,
    signedIn: true,
    at: startedAt + 100,
  });
  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncStarted,
    source: "persist_all",
    at: startedAt + 200,
  });
  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncFailed,
    source: "persist_all",
    errorCode: "fetch_timeout",
    errorMessage: "Cloud sync timed out.",
    retryEligible: true,
    pendingLocalWrites: true,
    at: startedAt + 300,
  });

  assert.equal(runtime.cloudSyncInFlight, false);
  assert.equal(runtime.lastErrorCode, "fetch_timeout");
  assert.equal(runtime.retryEligible, true);
  assert.equal(runtime.pendingLocalWrites, true);

  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncSucceeded,
    source: "persist_all",
    at: startedAt + 500,
  });

  assert.equal(runtime.lastCloudSuccessAt, startedAt + 500);
  assert.equal(runtime.pendingLocalWrites, false);
  assert.equal(runtime.lastErrorCode, "");
});

test("provider misconfiguration resolves to fatal-error state with admin guidance", () => {
  const model = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "local",
      label: "PROVIDER ERROR",
      reason: STORAGE_STATUS_REASONS.providerUnavailable,
      detail: "Cloud sync provider is unavailable or misconfigured.",
    }),
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 1000 }),
    authInitializing: false,
    appLoading: false,
    now: 1000,
  });

  assert.equal(model.id, SYNC_STATE_IDS.fatalError);
  assert.equal(model.tone, SYNC_STATE_TONES.critical);
  assert.match(model.nextStep, /admin action/i);
});

test("signed-out local resume path resolves to offline-local instead of fake syncing", () => {
  const model = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "local",
      label: "SIGNED OUT",
      reason: STORAGE_STATUS_REASONS.signedOut,
      detail: "You are signed out, so cloud sync is paused until you sign back in.",
    }),
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 2000 }),
    hasLocalCache: true,
    authInitializing: false,
    appLoading: false,
    now: 2000,
  });

  assert.equal(model.id, SYNC_STATE_IDS.offlineLocal);
  assert.equal(model.reasonKey, "signed_out");
  assert.match(model.detail, /sign back in/i);
  assert.match(model.assurance, /local/i);
});

test("realtime interruption surfaces stale-cloud while preserving local assurance", () => {
  const runtime = reduceSyncRuntimeState(
    createInitialSyncRuntimeState({ isOnline: true, now: 3000 }),
    {
      type: SYNC_RUNTIME_EVENT_TYPES.realtimeInterrupted,
      at: 3200,
    }
  );
  const model = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "cloud",
      label: "SYNCED",
      reason: STORAGE_STATUS_REASONS.synced,
      detail: "Cloud sync is working normally.",
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: runtime,
    authInitializing: false,
    appLoading: false,
    now: 3300,
  });

  assert.equal(model.id, SYNC_STATE_IDS.staleCloud);
  assert.match(model.detail, /may lag|interrupted/i);
  assert.match(model.assurance, /locally/i);
});

test("retry-eligible sync stays in retrying state even if a fresh cloud attempt starts", () => {
  const startedAt = Date.UTC(2026, 3, 15, 13, 0, 0);
  let runtime = createInitialSyncRuntimeState({ isOnline: true, now: startedAt });

  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncFailed,
    errorCode: "fetch_timeout",
    errorMessage: "Cloud sync timed out.",
    retryEligible: true,
    pendingLocalWrites: true,
    at: startedAt + 100,
  });
  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncStarted,
    source: "reload_cloud",
    at: startedAt + 200,
  });

  const model = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "syncing",
      label: "RETRYING",
      reason: STORAGE_STATUS_REASONS.transient,
      detail: "Cloud sync timed out, so FORMA is keeping the latest state locally while it retries.",
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: runtime,
    authInitializing: false,
    appLoading: false,
    now: startedAt + 250,
  });

  assert.equal(model.id, SYNC_STATE_IDS.retrying);
  assert.equal(model.chipLabel, "Retrying");
  assert.match(model.detail, /timed out|retries/i);
});

test("surface models keep settings persistent while today stays quiet when synced", () => {
  const syncedState = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "cloud",
      label: "SYNCED",
      reason: STORAGE_STATUS_REASONS.synced,
      detail: "Cloud sync is working normally.",
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 4000 }),
    authInitializing: false,
    appLoading: false,
    now: 4000,
  });
  const todaySurface = buildSyncSurfaceModel({
    syncState: syncedState,
    surface: SYNC_SURFACE_KEYS.today,
  });
  const settingsSurface = buildSyncSurfaceModel({
    syncState: syncedState,
    surface: SYNC_SURFACE_KEYS.settings,
  });

  assert.equal(todaySurface.showFullCard, false);
  assert.equal(todaySurface.showInline, false);
  assert.equal(settingsSurface.showFullCard, true);
  assert.equal(settingsSurface.title, syncedState.headline);
});
