const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REAL_SYNC_REQUIRED_ENV_VARS,
  REAL_SYNC_TEST_DATA,
  resolveRealSyncEnv,
  buildRealSyncSeedPayload,
  buildParitySnapshotFromPayload,
  hasMachineReadableRetryReason,
} = require("../e2e/real-sync-staging-helpers.js");

test("resolveRealSyncEnv reports missing staging requirements explicitly", () => {
  const resolved = resolveRealSyncEnv({
    FORMA_E2E_BASE_URL: "https://forma-staging.example.com",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_TEST_EMAIL: "",
    SUPABASE_TEST_PASSWORD: "secret",
  });

  assert.deepEqual(
    resolved.missing,
    ["SUPABASE_URL", "SUPABASE_TEST_EMAIL"],
  );
  assert.equal(REAL_SYNC_REQUIRED_ENV_VARS.length, 5);
});

test("buildRealSyncSeedPayload creates a deterministic signed-in baseline", () => {
  const payload = buildRealSyncSeedPayload({ now: 12345 });
  const snapshot = buildParitySnapshotFromPayload(payload);

  assert.equal(payload.ts, 12345);
  assert.deepEqual(snapshot, {
    profileName: REAL_SYNC_TEST_DATA.baselineProfileName,
    goalSummary: REAL_SYNC_TEST_DATA.baselineGoalSummary,
    workoutStatus: "",
    workoutNote: "",
    nutritionNote: "",
    nutritionDeviationKind: "",
    nutritionIssue: "",
  });
});

test("hasMachineReadableRetryReason only passes when retry diagnostics expose concrete evidence", () => {
  assert.equal(
    hasMachineReadableRetryReason({
      diagnostics: {
        lastFailingEndpoint: "",
        lastHttpStatus: null,
        lastSupabaseErrorCode: "",
        lastErrorMessage: "",
      },
    }),
    false,
  );

  assert.equal(
    hasMachineReadableRetryReason({
      diagnostics: {
        lastFailingEndpoint: "rest/v1/trainer_data",
        lastHttpStatus: 504,
        lastSupabaseErrorCode: "",
        lastErrorMessage: "gateway timeout",
      },
    }),
    true,
  );
});
