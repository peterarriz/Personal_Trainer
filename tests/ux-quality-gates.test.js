const test = require("node:test");
const assert = require("node:assert/strict");

const {
  INTAKE_COPY_DECK,
  INTAKE_STAGE_CONTRACT,
  buildIntakeStarterGoalTypes,
  listFeaturedIntakeGoalTemplates,
} = require("../src/services/intake-entry-service.js");
const {
  listGoalTemplateCategories,
} = require("../src/services/goal-template-catalog-service.js");
const {
  buildSyncStateModel,
  createInitialSyncRuntimeState,
  SYNC_STATE_IDS,
  SYNC_STATE_TONES,
} = require("../src/services/sync-state-service.js");
const {
  STORAGE_STATUS_REASONS,
  buildStorageStatus,
} = require("../src/modules-auth-storage.js");

const flattenStrings = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenStrings(entry));
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((entry) => flattenStrings(entry));
};

const countWarningTokens = (value = "") => (
  String(value || "").match(/\b(retrying|retry|failed|unavailable|behind|needs review|offline|fatal|error|warning)\b/gi)?.length || 0
);

test("intake stays within the three-screen contract and concise copy budgets", () => {
  const starterTypes = buildIntakeStarterGoalTypes();
  const intakeStrings = flattenStrings([INTAKE_STAGE_CONTRACT, INTAKE_COPY_DECK, starterTypes]);

  assert.ok(INTAKE_STAGE_CONTRACT.length <= 3);
  INTAKE_STAGE_CONTRACT.forEach((stage) => {
    assert.ok(stage.label.length <= 12, `Stage label is too long: ${stage.label}`);
    assert.ok(stage.helper.length <= 84, `Stage helper is too long: ${stage.key}`);
  });

  assert.ok(starterTypes.length <= 7);
  starterTypes.forEach((goalType) => {
    assert.ok(goalType.label.length <= 18, `Goal type label is too long: ${goalType.id}`);
    assert.ok(goalType.helper.length <= 72, `Goal type helper is too long: ${goalType.id}`);
  });

  intakeStrings.forEach((line) => {
    assert.ok(line.length <= 96, `Intake copy line is too long: ${line}`);
  });
  assert.doesNotMatch(intakeStrings.join(" "), /anchor confidence|placeholder|provider key|failure pattern|deterministic|experimental/i);
});

test("goal-library browse chrome stays compact and each visible lane keeps five featured choices", () => {
  const categories = listGoalTemplateCategories();
  const visibleStarterTypes = buildIntakeStarterGoalTypes().filter((goalType) => goalType.id !== "custom");

  assert.ok(categories.length <= 7);
  categories.forEach((category) => {
    assert.ok(category.label.length <= 24, `Category label is too long: ${category.id}`);
    assert.ok(category.helper.length <= 80, `Category helper is too long: ${category.id}`);
  });

  visibleStarterTypes.forEach((goalType) => {
    const featured = listFeaturedIntakeGoalTemplates({ goalTypeId: goalType.id });
    assert.equal(featured.length, 5, `Expected five featured templates for ${goalType.id}`);
    featured.forEach((template) => {
      assert.ok(template.title.length <= 32, `Featured title is too long: ${template.id}`);
      assert.ok(template.helper.length <= 90, `Featured helper is too long: ${template.id}`);
    });
  });
});

test("sync trust states keep short copy and controlled warning density", () => {
  const signedIn = { user: { id: "user_1" } };
  const runtime = createInitialSyncRuntimeState({ isOnline: true, now: 1000 });
  const sampledStates = [
    buildSyncStateModel({
      storageStatus: buildStorageStatus({
        mode: "cloud",
        label: "SYNCED",
        reason: STORAGE_STATUS_REASONS.synced,
        detail: "Cloud sync is working normally.",
      }),
      authSession: signedIn,
      syncRuntime: runtime,
      now: 1000,
    }),
    buildSyncStateModel({
      storageStatus: buildStorageStatus({
        mode: "syncing",
        label: "SYNCING",
        reason: STORAGE_STATUS_REASONS.transient,
        detail: "Cloud sync timed out.",
      }),
      authSession: signedIn,
      syncRuntime: {
        ...runtime,
        cloudSyncInFlight: true,
        retryEligible: true,
        lastCloudFailureAt: 1090,
      },
      now: 1100,
    }),
    buildSyncStateModel({
      storageStatus: buildStorageStatus({
        mode: "cloud",
        label: "SYNCED",
        reason: STORAGE_STATUS_REASONS.synced,
        detail: "Cloud sync is working normally.",
      }),
      authSession: signedIn,
      syncRuntime: {
        ...runtime,
        realtimeInterrupted: true,
        realtimeInterruptedAt: 1050,
      },
      now: 1200,
    }),
    buildSyncStateModel({
      storageStatus: buildStorageStatus({
        mode: "local",
        label: "PROVIDER ERROR",
        reason: STORAGE_STATUS_REASONS.providerUnavailable,
        detail: "Cloud sync provider is unavailable or misconfigured.",
      }),
      authSession: signedIn,
      syncRuntime: runtime,
      now: 1300,
    }),
  ];

  sampledStates.forEach((state) => {
    const combinedCopy = [state.headline, state.detail, state.assurance, state.nextStep].filter(Boolean).join(" ");
    const warningBudget = state.tone === SYNC_STATE_TONES.critical ? 4 : state.tone === SYNC_STATE_TONES.caution ? 3 : 2;

    assert.ok(combinedCopy.length <= 260, `Sync state copy is too long for ${state.id}`);
    assert.ok(countWarningTokens(combinedCopy) <= warningBudget, `Sync warning density is too high for ${state.id}`);
  });

  assert.equal(sampledStates[0].id, SYNC_STATE_IDS.synced);
  assert.equal(sampledStates[1].id, SYNC_STATE_IDS.retrying);
  assert.equal(sampledStates[2].id, SYNC_STATE_IDS.staleCloud);
  assert.equal(sampledStates[3].id, SYNC_STATE_IDS.fatalError);
});
