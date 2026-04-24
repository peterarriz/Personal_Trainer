const { makeSignedInPayload } = require("./auth-runtime-test-helpers.js");

const REAL_SYNC_REQUIRED_ENV_VARS = Object.freeze([
  "FORMA_E2E_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_TEST_EMAIL",
  "SUPABASE_TEST_PASSWORD",
]);
const REAL_SYNC_LOCAL_BASE_URL = "http://127.0.0.1:4173";

const REAL_SYNC_TEST_DATA = Object.freeze({
  fixedNowIso: "2026-04-17T12:00:00.000Z",
  workoutDateKey: "2026-04-17",
  nutritionDateKey: "2026-04-16",
  goalId: "goal_sync_primary",
  baselineProfileName: "FORMA Sync Seed Athlete",
  editedProfileName: "FORMA Sync Seed Athlete Updated",
  baselineGoalSummary: "Run a stronger half marathon",
  editedGoalSummary: "Run a 1:45 half marathon with explicit sync proof",
  workoutStatus: "skipped",
  workoutNote: "Staging sync verification workout note",
  nutritionDeviationKind: "under_fueled",
  nutritionIssue: "hunger",
  nutritionNote: "Staging sync verification nutrition note",
});

const sanitizeEnvValue = (value = "") => String(value || "").trim();
const sanitizeProofSuffix = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 40);

const resolveRealSyncEnv = (env = process.env) => {
  const values = REAL_SYNC_REQUIRED_ENV_VARS.reduce((acc, key) => {
    acc[key] = sanitizeEnvValue(env?.[key] || "");
    return acc;
  }, {});
  const missing = REAL_SYNC_REQUIRED_ENV_VARS.filter((key) => !values[key]);
  return {
    baseUrl: values.FORMA_E2E_BASE_URL,
    supabaseUrl: values.SUPABASE_URL.replace(/\/+$/, ""),
    supabaseAnonKey: values.SUPABASE_ANON_KEY,
    email: values.SUPABASE_TEST_EMAIL,
    password: values.SUPABASE_TEST_PASSWORD,
    missing,
    values,
  };
};

const getSupabaseServiceRoleKey = (env = process.env) => {
  const candidates = [
    env?.SUPABASE_SERVICE_ROLE_KEY,
    env?.SUPABASE_SERVICE_ROLE,
    env?.SUPABASE_SERVICE_KEY,
  ];
  return candidates.find((value) => sanitizeEnvValue(value)) || "";
};

const createRealSyncProofIdentity = ({ stamp = "" } = {}) => {
  const suffix = sanitizeProofSuffix(stamp || new Date().toISOString()) || "proof";
  const passwordSeed = suffix.replace(/-/g, "").toUpperCase().slice(-10).padStart(10, "A");
  return {
    email: `sync-proof-${suffix}@example.com`,
    password: `FormaSync!${passwordSeed}9`,
    label: suffix,
  };
};

const buildRealSyncProofPlan = (env = process.env) => {
  const resolved = resolveRealSyncEnv(env);
  const serviceRoleKey = getSupabaseServiceRoleKey(env);
  const hasBaseUrl = Boolean(resolved.baseUrl);
  const hasSupabaseUrl = Boolean(resolved.supabaseUrl);
  const hasAnonKey = Boolean(resolved.supabaseAnonKey);
  const hasUserCredentials = Boolean(resolved.email && resolved.password);
  const canProvisionUser = !hasUserCredentials && Boolean(serviceRoleKey && hasSupabaseUrl && hasAnonKey);
  const blockingMissing = [];

  if (!hasSupabaseUrl) blockingMissing.push("SUPABASE_URL");
  if (!hasAnonKey) blockingMissing.push("SUPABASE_ANON_KEY");
  if (!hasUserCredentials && !canProvisionUser) {
    if (!resolved.email) blockingMissing.push("SUPABASE_TEST_EMAIL");
    if (!resolved.password) blockingMissing.push("SUPABASE_TEST_PASSWORD");
  }

  return {
    ...resolved,
    serviceRoleKey,
    proofMode: hasBaseUrl ? "remote_staging" : "local_real_backend",
    baseUrl: hasBaseUrl ? resolved.baseUrl : REAL_SYNC_LOCAL_BASE_URL,
    hasBaseUrl,
    hasUserCredentials,
    canProvisionUser,
    usesProvisionedUser: !hasUserCredentials && canProvisionUser,
    blockingMissing: Array.from(new Set(blockingMissing)),
    canRun: blockingMissing.length === 0,
  };
};

const buildRealSyncSeedPayload = ({
  now = Date.parse(REAL_SYNC_TEST_DATA.fixedNowIso),
} = {}) => {
  const payload = makeSignedInPayload();
  payload.ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  payload.logs = {};
  payload.dailyCheckins = {};
  payload.nutritionActualLogs = {};
  payload.personalization = {
    ...(payload.personalization || {}),
    profile: {
      ...(payload.personalization?.profile || {}),
      name: REAL_SYNC_TEST_DATA.baselineProfileName,
      onboardingComplete: true,
      profileSetupComplete: true,
    },
  };
  payload.goals = [{
    id: REAL_SYNC_TEST_DATA.goalId,
    name: REAL_SYNC_TEST_DATA.baselineGoalSummary,
    summary: REAL_SYNC_TEST_DATA.baselineGoalSummary,
    category: "running",
    planningCategory: "running",
    active: true,
    priority: 1,
    targetDate: "2026-10-10",
  }];
  return payload;
};

const normalizeGoalList = (goals = []) => (
  Array.isArray(goals)
    ? goals.filter((goal) => goal && typeof goal === "object")
    : []
);

const readGoalSummary = (goal = null) => {
  if (!goal || typeof goal !== "object") return "";
  return String(
    goal.summary
    || goal.name
    || goal.title
    || goal.resolvedGoal?.summary
    || goal.resolvedGoal?.name
    || ""
  ).trim();
};

const findPrimaryGoalRecord = (goals = [], goalId = REAL_SYNC_TEST_DATA.goalId) => {
  const normalizedGoals = normalizeGoalList(goals);
  if (!normalizedGoals.length) return null;

  const directIdMatch = normalizedGoals.find((goal) => String(goal?.id || "") === String(goalId));
  if (directIdMatch) return directIdMatch;

  const resolvedIdMatch = normalizedGoals.find((goal) => String(goal?.resolvedGoal?.id || "") === String(goalId));
  if (resolvedIdMatch) return resolvedIdMatch;

  const activeByPriority = normalizedGoals
    .filter((goal) => goal?.active !== false)
    .sort((left, right) => {
      const leftPriority = Number(left?.priority || Number.MAX_SAFE_INTEGER);
      const rightPriority = Number(right?.priority || Number.MAX_SAFE_INTEGER);
      return leftPriority - rightPriority;
    });
  return activeByPriority[0] || normalizedGoals[0] || null;
};

const findGoalValue = (goals = [], goalId = REAL_SYNC_TEST_DATA.goalId) => {
  const match = findPrimaryGoalRecord(goals, goalId);
  return readGoalSummary(match);
};

const buildParitySnapshotFromPayload = (payload = {}) => ({
  profileName: String(payload?.personalization?.profile?.name || "").trim(),
  goalSummary: findGoalValue(payload?.goals || []),
  workoutStatus: String(payload?.logs?.[REAL_SYNC_TEST_DATA.workoutDateKey]?.actualSession?.status || "").trim(),
  workoutNote: String(payload?.dailyCheckins?.[REAL_SYNC_TEST_DATA.workoutDateKey]?.note || "").trim(),
  nutritionNote: String(payload?.nutritionActualLogs?.[REAL_SYNC_TEST_DATA.nutritionDateKey]?.note || "").trim(),
  nutritionDeviationKind: String(payload?.nutritionActualLogs?.[REAL_SYNC_TEST_DATA.nutritionDateKey]?.deviationKind || "").trim(),
  nutritionIssue: String(payload?.nutritionActualLogs?.[REAL_SYNC_TEST_DATA.nutritionDateKey]?.issue || "").trim(),
});

const hasMachineReadableRetryReason = (syncSnapshot = {}) => {
  const diagnostics = syncSnapshot?.diagnostics || syncSnapshot || {};
  return Boolean(
    diagnostics?.lastFailingEndpoint
    || diagnostics?.lastHttpStatus
    || diagnostics?.lastSupabaseErrorCode
    || diagnostics?.lastErrorMessage
  );
};

module.exports = {
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
};
