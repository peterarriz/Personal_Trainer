import test from "node:test";
import assert from "node:assert/strict";

import { STORAGE_STATUS_REASONS, buildStorageStatus } from "../src/modules-auth-storage.js";
import {
  buildSyncStateModel,
  buildSyncSurfaceModel,
  createInitialSyncPresentationState,
  createInitialSyncRuntimeState,
  reduceSyncRuntimeState,
  stabilizeSyncStatePresentation,
  SYNC_TRANSIENT_COOLDOWN_MS,
  SYNC_TRANSIENT_MIN_DWELL_MS,
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

test("provider misconfiguration resolves to fatal-error state with local fallback guidance", () => {
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
  assert.match(model.nextStep, /keep using this device locally/i);
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
  assert.match(model.detail, /little behind/i);
  assert.equal(model.assurance, "");
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
  assert.equal(model.detail, "Cloud sync is retrying in the background.");
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
  assert.equal(todaySurface.showCompactChip, true);
  assert.equal(todaySurface.compactMessage, syncedState.headline);
  assert.equal(settingsSurface.showFullCard, true);
  assert.equal(settingsSurface.title, syncedState.headline);
});

test("compact workout surfaces use the passive chip for transient sync states", () => {
  const retryingState = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "local",
      label: "SYNC RETRYING",
      reason: STORAGE_STATUS_REASONS.transient,
      detail: "Cloud sync timed out. Local changes are still saved safely on this device.",
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 5000 }),
    authInitializing: false,
    appLoading: false,
    now: 5000,
  });

  const todaySurface = buildSyncSurfaceModel({
    syncState: retryingState,
    surface: SYNC_SURFACE_KEYS.today,
  });
  const programSurface = buildSyncSurfaceModel({
    syncState: retryingState,
    surface: SYNC_SURFACE_KEYS.program,
  });

  assert.equal(todaySurface.showFullCard, false);
  assert.equal(todaySurface.showCompactChip, true);
  assert.equal(todaySurface.compactMessage, "Cloud sync is retrying in the background.");
  assert.equal(programSurface.showFullCard, false);
  assert.equal(programSurface.showCompactChip, true);
});

test("sync presentation holds a transient state for the minimum dwell before changing", () => {
  const retryingState = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "local",
      label: "SYNC RETRYING",
      reason: STORAGE_STATUS_REASONS.transient,
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 6000 }),
    authInitializing: false,
    appLoading: false,
    now: 6000,
  });
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
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 6000 }),
    authInitializing: false,
    appLoading: false,
    now: 6000,
  });

  const initialPresentation = createInitialSyncPresentationState({
    syncState: retryingState,
    now: 6000,
  });
  const heldPresentation = stabilizeSyncStatePresentation({
    currentPresentation: initialPresentation,
    syncState: syncedState,
    now: 6000 + 1000,
  });

  assert.equal(heldPresentation.displayedState.id, SYNC_STATE_IDS.retrying);
  assert.equal(heldPresentation.nextUpdateAt, 6000 + SYNC_TRANSIENT_MIN_DWELL_MS);

  const transitionedPresentation = stabilizeSyncStatePresentation({
    currentPresentation: heldPresentation,
    syncState: syncedState,
    now: 6000 + SYNC_TRANSIENT_MIN_DWELL_MS,
  });

  assert.equal(transitionedPresentation.displayedState.id, SYNC_STATE_IDS.synced);
});

test("sync presentation enforces cool-down before reviving the same transient warning", () => {
  const retryingState = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "local",
      label: "SYNC RETRYING",
      reason: STORAGE_STATUS_REASONS.transient,
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 7000 }),
    authInitializing: false,
    appLoading: false,
    now: 7000,
  });
  const syncingState = buildSyncStateModel({
    storageStatus: buildStorageStatus({
      mode: "syncing",
      label: "SYNCING",
      reason: STORAGE_STATUS_REASONS.synced,
      detail: "Cloud sync is working normally.",
    }),
    authSession: {
      user: { id: "user_1" },
    },
    syncRuntime: {
      ...createInitialSyncRuntimeState({ isOnline: true, now: 7000 }),
      cloudSyncInFlight: true,
      updatedAt: 7000,
    },
    authInitializing: false,
    appLoading: false,
    now: 7000,
  });
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
    syncRuntime: createInitialSyncRuntimeState({ isOnline: true, now: 7000 }),
    authInitializing: false,
    appLoading: false,
    now: 7000,
  });

  const initialPresentation = createInitialSyncPresentationState({
    syncState: retryingState,
    now: 7000,
  });
  const syncedPresentation = stabilizeSyncStatePresentation({
    currentPresentation: initialPresentation,
    syncState: syncedState,
    now: 7000 + SYNC_TRANSIENT_MIN_DWELL_MS,
  });
  const cooledPresentation = stabilizeSyncStatePresentation({
    currentPresentation: syncedPresentation,
    syncState: syncingState,
    now: 7000 + SYNC_TRANSIENT_MIN_DWELL_MS + 1000,
  });

  assert.equal(cooledPresentation.displayedState.id, SYNC_STATE_IDS.synced);
  assert.equal(
    cooledPresentation.nextUpdateAt,
    7000 + SYNC_TRANSIENT_MIN_DWELL_MS + SYNC_TRANSIENT_COOLDOWN_MS
  );
});

test("realtime recovery returns stale-cloud surfaces to synced once cloud updates land", () => {
  const startedAt = Date.UTC(2026, 3, 15, 14, 0, 0);
  let runtime = createInitialSyncRuntimeState({ isOnline: true, now: startedAt });

  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.realtimeInterrupted,
    at: startedAt + 100,
  });
  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.realtimeResumed,
    at: startedAt + 200,
  });
  runtime = reduceSyncRuntimeState(runtime, {
    type: SYNC_RUNTIME_EVENT_TYPES.cloudSyncSucceeded,
    at: startedAt + 300,
  });

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
    now: startedAt + 400,
  });

  assert.equal(model.id, SYNC_STATE_IDS.synced);
  assert.equal(model.chipLabel, "Synced");
  assert.match(model.detail, /working normally|local copy/i);
});
