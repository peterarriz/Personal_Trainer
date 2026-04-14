const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalEditorDraft,
  buildGoalManagementPreview,
  buildGoalSettingsViewModel,
  GOAL_ARCHIVE_STATUSES,
  GOAL_MANAGEMENT_CHANGE_TYPES,
} = require("../src/services/goal-management-service.js");

const buildGoal = ({
  runtimeId,
  recordId,
  summary,
  category = "strength",
  goalFamily = "strength",
  priority = 1,
  targetDate = "",
  targetHorizonWeeks = null,
  primaryMetric = null,
  proxyMetrics = [],
  active = true,
  status = active ? "active" : GOAL_ARCHIVE_STATUSES.archived,
  tradeoffs = [],
} = {}) => ({
  id: runtimeId || `goal_slot_${priority}`,
  goalRecordId: recordId || `goal_record_${priority}`,
  name: summary,
  category,
  priority,
  active,
  status,
  targetDate,
  targetHorizonWeeks,
  primaryMetric,
  proxyMetrics,
  tradeoffs,
  resolvedGoal: {
    id: recordId || `goal_record_${priority}`,
    summary,
    planningCategory: category,
    goalFamily,
    planningPriority: priority,
    targetDate,
    targetHorizonWeeks,
    primaryMetric,
    proxyMetrics,
    confirmedByUser: true,
    confirmationSource: "test_seed",
    confidence: "medium",
    measurabilityTier: primaryMetric?.targetValue ? "fully_measurable" : proxyMetrics.length ? "proxy_measurable" : "exploratory_fuzzy",
    tradeoffs,
    unresolvedGaps: [],
    reviewCadence: "weekly",
    refinementTrigger: "30_day_resolution_review",
  },
});

test("goal settings view model shows current and archived goals with field provenance", () => {
  const personalization = {
    goalManagement: {
      archivedGoals: [
        buildGoal({
          runtimeId: "goal_old",
          recordId: "goal_old_record",
          summary: "Run a spring 10k",
          category: "running",
          goalFamily: "performance",
          priority: 1,
          active: false,
          status: GOAL_ARCHIVE_STATUSES.completed,
          targetDate: "2026-05-10",
          primaryMetric: { key: "ten_k_time", label: "10k time", targetValue: "46:00", unit: "time" },
        }),
      ],
      history: [],
    },
  };
  const view = buildGoalSettingsViewModel({
    goals: [
      buildGoal({
        runtimeId: "goal_bench",
        recordId: "goal_bench_record",
        summary: "Bench press 225 lb",
        category: "strength",
        goalFamily: "strength",
        priority: 1,
        primaryMetric: { key: "bench_press_weight", label: "Bench 1RM", targetValue: "225", unit: "lb" },
        tradeoffs: ["Heavy bench focus can slow running progress."],
      }),
      buildGoal({
        runtimeId: "goal_body_comp",
        recordId: "goal_body_comp_record",
        summary: "Get leaner by summer",
        category: "body_comp",
        goalFamily: "body_comp",
        priority: 2,
        targetHorizonWeeks: 12,
        proxyMetrics: [{ key: "waist", label: "Waist trend", unit: "in" }],
      }),
    ],
    personalization,
    now: "2026-04-14T12:00:00.000Z",
  });

  assert.equal(view.currentGoals.length, 2);
  assert.equal(view.archivedGoals.length, 1);
  assert.equal(view.currentGoals[0].summary, "Bench press 225 lb");
  assert.equal(view.currentGoals[1].timingLabel, "12-week horizon");
  assert.match(view.currentGoals[0].fieldRows.find((row) => row.field === "summary")?.provenanceSummary || "", /confirmed|imported/i);
  assert.equal(view.archivedGoals[0].status, GOAL_ARCHIVE_STATUSES.completed);
});

test("reprioritize preview updates order and impact copy before commit", () => {
  const goals = [
    buildGoal({
      runtimeId: "goal_running",
      recordId: "goal_running_record",
      summary: "Run a half marathon in 1:45:00",
      category: "running",
      goalFamily: "performance",
      priority: 1,
      primaryMetric: { key: "half_marathon_time", label: "Half marathon time", targetValue: "1:45:00", unit: "time" },
    }),
    buildGoal({
      runtimeId: "goal_bench",
      recordId: "goal_bench_record",
      summary: "Bench press 225 lb",
      category: "strength",
      goalFamily: "strength",
      priority: 2,
      primaryMetric: { key: "bench_press_weight", label: "Bench 1RM", targetValue: "225", unit: "lb" },
    }),
  ];

  const preview = buildGoalManagementPreview({
    goals,
    personalization: { goalManagement: { archivedGoals: [], history: [] } },
    change: {
      type: GOAL_MANAGEMENT_CHANGE_TYPES.reprioritize,
      orderedGoalIds: ["goal_bench_record", "goal_running_record"],
    },
    now: "2026-04-14T12:00:00.000Z",
  });

  assert.ok(preview);
  assert.equal(preview.nextViewModel.currentGoals[0].summary, "Bench press 225 lb");
  assert.match(preview.impactLines[0], /Bench press 225 lb moves into Priority 1/i);
  assert.deepEqual(preview.nextOrder, ["goal_bench_record", "goal_running_record"]);
});

test("editing a goal can convert an exact-date target into an open-ended goal before commit", () => {
  const goal = buildGoal({
    runtimeId: "goal_cut",
    recordId: "goal_cut_record",
    summary: "Get lean for vacation",
    category: "body_comp",
    goalFamily: "body_comp",
    priority: 1,
    targetDate: "2026-07-01",
    proxyMetrics: [{ key: "waist", label: "Waist trend", unit: "in" }],
  });
  const draft = buildGoalEditorDraft({ goal });
  draft.timingMode = "open_ended";
  draft.targetDate = "";
  draft.targetHorizonWeeks = "";

  const preview = buildGoalManagementPreview({
    goals: [goal],
    personalization: { goalManagement: { archivedGoals: [], history: [] } },
    change: {
      type: GOAL_MANAGEMENT_CHANGE_TYPES.edit,
      goalId: "goal_cut_record",
      draft,
    },
    now: "2026-04-14T12:00:00.000Z",
  });

  assert.ok(preview);
  assert.equal(preview.nextViewModel.currentGoals[0].timingLabel, "Open-ended");
  assert.ok(preview.changedFields.some((field) => field.field === "targetDate" || field.field === "openEnded"));
  assert.match(preview.impactLines.join(" "), /open-ended/i);
});

test("archive and restore previews keep goal history while moving goals in and out of the active stack", () => {
  const goals = [
    buildGoal({
      runtimeId: "goal_bench",
      recordId: "goal_bench_record",
      summary: "Bench press 225 lb",
      category: "strength",
      goalFamily: "strength",
      priority: 1,
      primaryMetric: { key: "bench_press_weight", label: "Bench 1RM", targetValue: "225", unit: "lb" },
    }),
    buildGoal({
      runtimeId: "goal_cut",
      recordId: "goal_cut_record",
      summary: "Get leaner",
      category: "body_comp",
      goalFamily: "body_comp",
      priority: 2,
      proxyMetrics: [{ key: "waist", label: "Waist trend", unit: "in" }],
    }),
  ];
  const basePersonalization = { goalManagement: { archivedGoals: [], history: [] } };

  const archivePreview = buildGoalManagementPreview({
    goals,
    personalization: basePersonalization,
    change: {
      type: GOAL_MANAGEMENT_CHANGE_TYPES.archive,
      goalId: "goal_cut_record",
      archiveStatus: GOAL_ARCHIVE_STATUSES.completed,
    },
    now: "2026-04-14T12:00:00.000Z",
  });

  assert.ok(archivePreview);
  assert.equal(archivePreview.nextViewModel.currentGoals.length, 1);
  assert.equal(archivePreview.nextGoalManagement.archivedGoals.length, 1);
  assert.equal(archivePreview.nextGoalManagement.archivedGoals[0].status, GOAL_ARCHIVE_STATUSES.completed);

  const restorePreview = buildGoalManagementPreview({
    goals: archivePreview.nextGoals,
    personalization: {
      ...basePersonalization,
      goalManagement: archivePreview.nextGoalManagement,
    },
    change: {
      type: GOAL_MANAGEMENT_CHANGE_TYPES.restore,
      goalId: "goal_cut_record",
    },
    now: "2026-04-15T12:00:00.000Z",
  });

  assert.ok(restorePreview);
  assert.equal(restorePreview.nextViewModel.currentGoals.length, 2);
  assert.equal(restorePreview.nextGoalManagement.archivedGoals.length, 0);
  assert.match(restorePreview.impactLines.join(" "), /returns to the active stack/i);
});
