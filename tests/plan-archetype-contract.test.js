const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  normalizeGoals,
} = require("../src/modules-planning.js");
const {
  buildGoalProgressTrackingFromGoals,
} = require("../src/services/goal-progress-service.js");
const {
  buildNutritionSurfaceModel,
} = require("../src/services/nutrition-surface-service.js");
const {
  buildTodayCommandCenterModel,
} = require("../src/services/today-command-center-service.js");
const {
  assemblePlanWeekRuntime,
} = require("../src/services/plan-week-service.js");
const {
  buildProgramRoadmapRows,
} = require("../src/services/program-roadmap-service.js");
const {
  findPlanArchetypeById,
} = require("../src/data/plan-archetypes/index.js");
const {
  PLAN_ARCHETYPE_CONTRACT_IDS,
  auditPlanArchetypeContract,
  resolvePlanArchetypeContract,
  selectRepresentativeSessionForContract,
} = require("../src/services/plan-archetype-contract-service.js");

const BASE_WEEK = {
  phase: "BUILDING",
  label: "Sharpen",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "30 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "60 min" },
  str: "A",
  nutri: "hardRun",
};

const WEEK_TEMPLATES = Array.from({ length: 15 }).map((_, index) => ({
  ...BASE_WEEK,
  phase: index < 5 ? "BASE" : index < 10 ? "BUILDING" : "PEAK",
  label: `Phase ${index + 1}`,
  sat: { t: "Long", d: `${60 + (index * 5)} min` },
}));

const METRIC_LABELS = {
  bench_press_weight: { label: "Bench press", unit: "lb", targetValue: "225" },
  half_marathon_time: { label: "Half marathon time", unit: "time", targetValue: "1:45:00" },
  bodyweight_trend: { label: "Bodyweight trend", unit: "lb", targetValue: "" },
  routine_restart_consistency: { label: "Routine restart consistency", unit: "", targetValue: "" },
  run_lift_consistency: { label: "Run + lift consistency", unit: "", targetValue: "" },
};

const humanizeMetricLabel = (key = "") => String(key || "")
  .replace(/_/g, " ")
  .replace(/\b\w/g, (char) => char.toUpperCase());

const buildPrimaryMetric = (archetype, fallbackKey = "") => {
  const metricKey = archetype?.primaryMetrics?.[0] || fallbackKey || "";
  const shape = METRIC_LABELS[metricKey] || { label: humanizeMetricLabel(metricKey), unit: "", targetValue: "" };
  return metricKey
    ? {
        key: metricKey,
        label: shape.label,
        unit: shape.unit,
        targetValue: shape.targetValue,
      }
    : null;
};

const buildProxyMetrics = (archetype) => (archetype?.proxyMetrics || []).map((metricKey) => ({
  key: metricKey,
  label: humanizeMetricLabel(metricKey),
  unit: "",
  kind: "proxy",
}));

const buildResolvedGoalFromArchetype = (archetype) => ({
  id: `resolved_${archetype.id}`,
  summary: archetype.displayName,
  planningCategory: archetype.planningCategory,
  planningPriority: 1,
  goalFamily: archetype.goalFamily,
  measurabilityTier: archetype.goalFamily === "re_entry"
    ? "exploratory_fuzzy"
    : ["body_comp", "appearance", "hybrid"].includes(archetype.goalFamily)
    ? "proxy_measurable"
    : "fully_measurable",
  confidence: "high",
  primaryMetric: buildPrimaryMetric(archetype),
  proxyMetrics: buildProxyMetrics(archetype),
  first30DaySuccessDefinition: archetype.goalFamily === "re_entry"
    ? "Complete 10 of the next 12 planned sessions over 30 days."
    : "",
  reviewCadence: "weekly",
  unresolvedGaps: [],
  tradeoffs: [],
  weeklyStructureTemplate: archetype.weeklyStructureTemplate,
  progressionStrategy: archetype.progressionStrategy,
  fatigueManagementStrategy: archetype.fatigueManagementStrategy,
  planArchetypeId: archetype.id,
  primaryDomain: archetype.primaryDomain,
  resolverHints: archetype.resolverHints,
});

const buildGoals = (goalDefs = []) => normalizeGoals(goalDefs.map((goal, index) => ({
  id: goal.id || `goal_${index + 1}`,
  name: goal.name,
  category: goal.category || "general_fitness",
  active: goal.active !== false,
  priority: goal.priority || index + 1,
  targetDate: goal.targetDate || "",
  measurableTarget: goal.measurableTarget || "",
  resolvedGoal: goal.resolvedGoal || null,
})));

const buildComposer = ({
  goals,
  todayKey = "2026-04-15",
  currentDayOfWeek = 3,
} = {}) => composeGoalNativePlan({
  goals,
  personalization: {},
  momentum: { inconsistencyRisk: "low", momentumState: "stable" },
  learningLayer: {},
  baseWeek: BASE_WEEK,
  currentWeek: 1,
  weekTemplates: WEEK_TEMPLATES,
  logs: {},
  dailyCheckins: {},
  nutritionActualLogs: {},
  coachActions: [],
  todayKey,
  currentDayOfWeek,
  plannedDayRecords: {},
  planWeekRecords: {},
});

const buildBenchLog = ({ date, weight, reps, sets, type = "Strength" }) => ({
  [date]: {
    type,
    checkin: { status: "completed_as_planned" },
    performanceRecords: [
      {
        scope: "exercise",
        exercise: "Bench Press",
        actualWeight: weight,
        actualReps: reps,
        actualSets: sets,
        prescribedWeight: weight,
        prescribedReps: reps,
        prescribedSets: sets,
      },
    ],
  },
});

const SCENARIOS = [
  {
    label: "strength-only",
    contractId: PLAN_ARCHETYPE_CONTRACT_IDS.strengthOnly,
    archetypeId: "lift_focus_bench",
    category: "strength",
    logs: {
      ...buildBenchLog({ date: "2026-03-31", weight: 185, reps: 5, sets: 3 }),
      ...buildBenchLog({ date: "2026-04-09", weight: 195, reps: 3, sets: 2 }),
    },
    expectedNutritionLane: "strength_only",
    expectedTodayKind: "strength_only",
    expectedMerge: false,
    assertProgram: (row) => {
      assert.ok(row.strengthCount >= 1);
      assert.equal(row.runCount, 0);
    },
  },
  {
    label: "endurance-only",
    contractId: PLAN_ARCHETYPE_CONTRACT_IDS.enduranceOnly,
    archetypeId: "run_half_completion_builder",
    category: "running",
    targetDate: "2026-09-20",
    logs: {
      "2026-03-30": { type: "Tempo Run", miles: 6, runTime: "49:00", pace: "8:10", feel: 4, checkin: { status: "completed_as_planned" } },
      "2026-04-04": { type: "Intervals", miles: 5, runTime: "40:25", pace: "8:05", feel: 4, checkin: { status: "completed_as_planned" } },
      "2026-04-07": { type: "Long Run", miles: 10, runTime: "86:00", pace: "8:36", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-09": { type: "Tempo Run", miles: 4, runTime: "31:40", pace: "7:55", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    expectedNutritionLane: "endurance",
    expectedTodayKind: "run_only",
    expectedMerge: false,
    assertProgram: (row) => {
      assert.ok(row.runCount >= 2);
      assert.notEqual(row.longRunLabel, "No long run");
    },
  },
  {
    label: "physique-first",
    contractId: PLAN_ARCHETYPE_CONTRACT_IDS.physiqueFirst,
    archetypeId: "fat_loss_strength_retention",
    category: "body_comp",
    logs: {
      "2026-04-03": { type: "Strength", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-08": { type: "Conditioning", runTime: "28:00", feel: 3, checkin: { status: "completed_modified" } },
    },
    bodyweights: [
      { date: "2026-03-26", w: 188.2 },
      { date: "2026-04-09", w: 185.9 },
    ],
    manualProgressInputs: {
      measurements: {
        waist_circumference: [
          { date: "2026-03-28", value: 35.5 },
          { date: "2026-04-09", value: 34.8 },
        ],
      },
    },
    expectedNutritionLane: "strength_only",
    expectedTodayKind: "strength_only",
    expectedMerge: false,
    assertProgram: (row) => {
      assert.ok(row.strengthCount >= 1);
      assert.equal(row.runCount, 0);
    },
  },
  {
    label: "re-entry",
    contractId: PLAN_ARCHETYPE_CONTRACT_IDS.reEntry,
    archetypeId: "protected_restart_low_capacity",
    category: "general_fitness",
    logs: {
      "2026-03-20": { type: "Walk", runTime: "20", feel: 2, checkin: { status: "completed_modified" } },
      "2026-03-29": { type: "Strength", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-06": { type: "Strength", feel: 4, checkin: { status: "completed_as_planned" } },
      "2026-04-09": { type: "Walk", runTime: "25", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    weeklyCheckins: {
      "13": { energy: 2, stress: 4, confidence: 2, ts: new Date("2026-03-30T12:00:00Z").getTime() },
      "14": { energy: 4, stress: 2, confidence: 4, ts: new Date("2026-04-07T12:00:00Z").getTime() },
    },
    expectedNutritionLane: "strength_only",
    expectedTodayKind: "strength_only",
    expectedMerge: false,
    assertProgram: (row, runtime) => {
      assert.ok(row.strengthCount >= 1);
      assert.equal(row.qualityCount, 0);
      const currentSessionTypes = Object.values(runtime.currentPlanWeek?.sessionsByDay || {}).map((session) => String(session?.type || ""));
      assert.equal(currentSessionTypes.includes("long-run"), false);
    },
  },
  {
    label: "hybrid",
    contractId: PLAN_ARCHETYPE_CONTRACT_IDS.hybrid,
    archetypeId: "run_lift_running_priority",
    category: "running",
    targetDate: "2026-09-20",
    logs: {
      ...buildBenchLog({ date: "2026-03-31", weight: 185, reps: 5, sets: 3, type: "Run + Strength" }),
      "2026-04-03": { type: "Easy Run", miles: 3, runTime: "28:00", pace: "9:20", feel: 3, checkin: { status: "completed_as_planned" } },
      ...buildBenchLog({ date: "2026-04-09", weight: 195, reps: 3, sets: 2, type: "Run + Strength" }),
    },
    expectedNutritionLane: "hybrid",
    expectedTodayKind: "hybrid",
    expectedMerge: true,
    assertProgram: (row) => {
      assert.ok(row.strengthCount >= 1);
      assert.ok(row.runCount >= 1);
    },
  },
];

for (const scenario of SCENARIOS) {
  test(`${scenario.label} archetype contract blocks mixed-domain drift`, () => {
    const archetype = findPlanArchetypeById(scenario.archetypeId);
    assert.ok(archetype, `Missing archetype ${scenario.archetypeId}`);

    const goals = buildGoals([{
      name: archetype.displayName,
      category: scenario.category,
      targetDate: scenario.targetDate || "",
      resolvedGoal: buildResolvedGoalFromArchetype(archetype),
    }]);

    const composer = buildComposer({ goals });
    const contract = resolvePlanArchetypeContract({
      goals,
      primaryGoal: goals[0],
      planArchetypeId: composer.planContract?.planArchetypeId || archetype.id,
      primaryDomain: composer.planContract?.primaryDomain || archetype.primaryDomain,
      planningCategory: archetype.planningCategory,
      goalFamily: archetype.goalFamily,
      architecture: composer.architecture,
    });

    assert.equal(contract.id, scenario.contractId);
    assert.equal(composer.planContract?.id, scenario.contractId);
    assert.equal(composer.planContractAudit?.ok, true);

    const sessionTypes = Object.values(composer.dayTemplates || {})
      .map((session) => String(session?.type || ""))
      .filter(Boolean);

    sessionTypes.forEach((type) => {
      assert.ok(contract.allowedSessionTypes.includes(type), `${scenario.label} emitted unsupported session type ${type}`);
    });
    contract.forbiddenSessionTypes.forEach((type) => {
      assert.equal(sessionTypes.includes(type), false, `${scenario.label} emitted forbidden session type ${type}`);
    });

    const progress = buildGoalProgressTrackingFromGoals({
      goals,
      logs: scenario.logs || {},
      bodyweights: scenario.bodyweights || [],
      weeklyCheckins: scenario.weeklyCheckins || {},
      manualProgressInputs: scenario.manualProgressInputs || {},
      now: "2026-04-15",
    });
    const trackedItems = progress.goalCards[0]?.trackedItems || [];
    const audit = auditPlanArchetypeContract({
      contract,
      dayTemplates: composer.dayTemplates,
      trackedItems,
    });
    assert.equal(audit.ok, true, audit.violations.map((item) => item.message).join(" | "));

    const representativeSession = selectRepresentativeSessionForContract({
      contract,
      dayTemplates: composer.dayTemplates,
    });
    assert.ok(representativeSession, `${scenario.label} did not expose a representative session`);

    const nutritionModel = buildNutritionSurfaceModel({
      dayType: representativeSession?.nutri || "",
      todayWorkout: representativeSession,
      nutritionLayer: { targets: { p: 190, c: 240 } },
      realWorldNutrition: {
        performanceGuidance: {
          dayOf: "Keep the meal simple and repeatable.",
          recovery: "Recover with protein and carbs after training.",
        },
      },
      fallbackMeal: "Rice, protein, fruit, and water.",
    });
    assert.equal(nutritionModel.laneKey, scenario.expectedNutritionLane);

    const todayModel = buildTodayCommandCenterModel({
      training: representativeSession,
      summary: {
        structure: representativeSession?.run?.d || representativeSession?.swim?.d || representativeSession?.strengthDose || representativeSession?.fallback || "",
        purpose: representativeSession?.label || "",
      },
      changeSummary: "This session stays on plan today.",
    });
    assert.equal(todayModel.dayKind, scenario.expectedTodayKind);
    assert.equal(todayModel.shouldMergeLanes, scenario.expectedMerge);

    const runtime = assemblePlanWeekRuntime({
      todayKey: "2026-04-15",
      currentWeek: 1,
      dayOfWeek: 3,
      goals,
      baseWeek: BASE_WEEK,
      weekTemplates: WEEK_TEMPLATES,
      planComposer: composer,
      momentum: { inconsistencyRisk: "low", momentumState: "stable" },
      learningLayer: {},
      weeklyCheckins: {},
      coachPlanAdjustments: {},
      failureMode: {},
      environmentSelection: null,
      horizonWeeks: 12,
    });
    const roadmapRows = buildProgramRoadmapRows({
      displayHorizon: runtime.rollingHorizon,
      currentWeek: 1,
    });
    assert.ok(roadmapRows.length >= 12);
    scenario.assertProgram(roadmapRows[0], runtime);
  });
}
