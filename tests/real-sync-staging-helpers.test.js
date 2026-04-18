const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REAL_SYNC_REQUIRED_ENV_VARS,
  REAL_SYNC_TEST_DATA,
  resolveRealSyncEnv,
  buildRealSyncSeedPayload,
  buildParitySnapshotFromPayload,
  hasMachineReadableRetryReason,
  findGoalValue,
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

test("findGoalValue reads the seeded goal by its stable id", () => {
  const value = findGoalValue([
    {
      id: REAL_SYNC_TEST_DATA.goalId,
      summary: REAL_SYNC_TEST_DATA.baselineGoalSummary,
      active: true,
      priority: 1,
    },
  ]);

  assert.equal(value, REAL_SYNC_TEST_DATA.baselineGoalSummary);
});

test("findGoalValue follows resolvedGoal id when the top-level goal id changes", () => {
  const value = findGoalValue([
    {
      id: "goal_1_run_a_1_45_half_marathon_with_explicit_sync_proof",
      name: REAL_SYNC_TEST_DATA.editedGoalSummary,
      summary: "",
      active: true,
      priority: 1,
      resolvedGoal: {
        id: REAL_SYNC_TEST_DATA.goalId,
        summary: REAL_SYNC_TEST_DATA.editedGoalSummary,
      },
    },
  ]);

  assert.equal(value, REAL_SYNC_TEST_DATA.editedGoalSummary);
});

test("findGoalValue falls back to the active highest-priority goal", () => {
  const value = findGoalValue([
    {
      id: "goal_secondary",
      name: "Secondary goal",
      active: true,
      priority: 2,
    },
    {
      id: "goal_primary",
      name: "Primary goal from fallback",
      active: true,
      priority: 1,
    },
  ], "missing_goal_id");

  assert.equal(value, "Primary goal from fallback");
});
