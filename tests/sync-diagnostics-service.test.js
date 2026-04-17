import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialSyncDiagnosticsState,
  formatSyncDiagnosticTimestamp,
  reduceSyncDiagnosticsState,
  SYNC_DIAGNOSTIC_EVENT_TYPES,
} from "../src/services/sync-diagnostics-service.js";

test("sync diagnostics reducer records trainer_data retry metadata with pending local writes", () => {
  const startedAt = Date.UTC(2026, 3, 17, 12, 0, 0);
  let state = createInitialSyncDiagnosticsState({ now: startedAt });

  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveAttempt,
    endpoint: "rest/v1/trainer_data",
    method: "POST",
    source: "persist_all",
    pendingLocalWrites: true,
    at: startedAt + 100,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.trainerDataSaveResult,
    ok: false,
    endpoint: "rest/v1/trainer_data",
    method: "POST",
    httpStatus: 504,
    errorMessage: "gateway timeout",
    retryEligible: true,
    pendingLocalWrites: true,
    at: startedAt + 300,
  });

  assert.equal(state.lastSyncAttemptAt, startedAt + 100);
  assert.equal(state.lastEndpoint, "rest/v1/trainer_data");
  assert.equal(state.lastFailingEndpoint, "rest/v1/trainer_data");
  assert.equal(state.lastHttpStatus, 504);
  assert.equal(state.retryEligible, true);
  assert.equal(state.pendingLocalWrites, true);
  assert.equal(state.trainerDataSave.lastStatus, "failed");
});

test("sync diagnostics reducer tracks auth refresh failures, realtime reconnects, and local cache authority", () => {
  const startedAt = Date.UTC(2026, 3, 17, 13, 0, 0);
  let state = createInitialSyncDiagnosticsState({ now: startedAt });

  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshAttempt,
    endpoint: "auth/v1/token?grant_type=refresh_token",
    method: "POST",
    at: startedAt + 100,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.authRefreshResult,
    ok: false,
    endpoint: "auth/v1/token?grant_type=refresh_token",
    method: "POST",
    httpStatus: 401,
    supabaseErrorCode: "invalid_grant",
    errorMessage: "Invalid refresh token",
    at: startedAt + 150,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeStatus,
    status: "TIMED_OUT",
    at: startedAt + 200,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncAttempt,
    reason: "realtime_reconnected",
    at: startedAt + 250,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.realtimeResyncResult,
    ok: false,
    reason: "realtime_reconnected",
    errorCode: "fetch_timeout",
    httpStatus: 504,
    at: startedAt + 300,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheState,
    hasPendingWrites: true,
    lastLocalMutationTs: startedAt + 325,
    lastCloudSyncTs: startedAt - 10_000,
    at: startedAt + 330,
  });
  state = reduceSyncDiagnosticsState(state, {
    type: SYNC_DIAGNOSTIC_EVENT_TYPES.localCacheDecision,
    decision: "prefer_pending_local",
    reason: "pending local cache is newer than the cloud copy",
    localTs: startedAt + 325,
    cloudTs: startedAt - 10_000,
    at: startedAt + 340,
  });

  assert.equal(state.authRefresh.lastStatus, "failed");
  assert.equal(state.authRefresh.lastSupabaseErrorCode, "invalid_grant");
  assert.equal(state.realtime.lastStatus, "TIMED_OUT");
  assert.equal(state.realtime.reconnectAttempts, 1);
  assert.equal(state.realtime.lastResyncStatus, "failed");
  assert.equal(state.localCache.hasPendingWrites, true);
  assert.equal(state.localCache.authorityDecision, "prefer_pending_local");
  assert.equal(formatSyncDiagnosticTimestamp(state.localCache.authorityAt), new Date(startedAt + 340).toISOString());
});
