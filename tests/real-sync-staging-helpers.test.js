const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REAL_SYNC_REQUIRED_ENV_VARS,
  REAL_SYNC_LOCAL_BASE_URL,
  REAL_SYNC_TEST_DATA,
  resolveRealSyncEnv,
  getSupabaseServiceRoleKey,
  createRealSyncProofIdentity,
  buildRealSyncProofPlan,
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

test("buildRealSyncProofPlan falls back to a local real-backend proof when the staging URL is absent", () => {
  const plan = buildRealSyncProofPlan({
    SUPABASE_URL: "https://forma.example.supabase.co/",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  });

  assert.equal(plan.proofMode, "local_real_backend");
  assert.equal(plan.baseUrl, REAL_SYNC_LOCAL_BASE_URL);
  assert.equal(plan.canProvisionUser, true);
  assert.equal(plan.usesProvisionedUser, true);
  assert.equal(plan.canRun, true);
  assert.deepEqual(plan.blockingMissing, []);
});

test("getSupabaseServiceRoleKey accepts legacy env aliases", () => {
  assert.equal(
    getSupabaseServiceRoleKey({
      SUPABASE_SERVICE_KEY: "legacy-service-role-key",
    }),
    "legacy-service-role-key",
  );
});

test("createRealSyncProofIdentity returns a deterministic disposable proof user", () => {
  const identity = createRealSyncProofIdentity({ stamp: "2026-04-23T15:45:12.000Z" });

  assert.match(identity.email, /^sync-proof-2026-04-23t15-45-12-000z@example\.com$/);
  assert.match(identity.password, /^FormaSync![A-Z0-9]{10}9$/);
  assert.equal(identity.label, "2026-04-23t15-45-12-000z");
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
