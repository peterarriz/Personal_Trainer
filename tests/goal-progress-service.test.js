const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalProgressTracking,
  buildGoalProgressTrackingFromGoals,
  GOAL_PROGRESS_STATUSES,
} = require("../src/services/goal-progress-service.js");
const { normalizeGoals } = require("../src/services/canonical-athlete-service.js");

const buildResolvedGoal = ({
  summary,
  planningCategory,
  goalFamily = "",
  measurabilityTier = "fully_measurable",
  primaryMetric = null,
  proxyMetrics = [],
  first30DaySuccessDefinition = "",
  reviewCadence = "weekly",
} = {}) => ({
  id: `resolved_${String(summary || planningCategory || "goal").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
  planningPriority: 1,
  summary,
  planningCategory,
  goalFamily,
  measurabilityTier,
  primaryMetric,
  proxyMetrics,
  targetDate: "",
  targetHorizonWeeks: null,
  confidence: "medium",
  unresolvedGaps: [],
  tradeoffs: [],
  reviewCadence,
  refinementTrigger: "block_start_or_metric_stall",
  first30DaySuccessDefinition,
});

const buildBenchLog = ({ weight, reps, sets }) => ({
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
});

const buildAccessoryLog = (records = []) => ({
  checkin: { status: "completed_as_planned" },
  performanceRecords: records.map((record) => ({
    scope: "exercise",
    exercise: record.exercise,
    actualWeight: record.weight,
    actualReps: record.reps,
    actualSets: record.sets,
    prescribedWeight: record.weight,
    prescribedReps: record.reps,
    prescribedSets: record.sets,
  })),
});

test("event goals track pace, run volume, and workout progression from resolved goal structure", () => {
  const goals = normalizeGoals([{
    id: "goal_1",
    name: "Legacy race goal label",
    category: "running",
    priority: 1,
    active: true,
    resolvedGoal: buildResolvedGoal({
      summary: "Run a half marathon in 1:45:00",
      planningCategory: "running",
      goalFamily: "performance",
      primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", targetValue: "1:45:00" },
      proxyMetrics: [
        { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
        { key: "long_run_duration", label: "Long run duration", unit: "min", kind: "proxy" },
        { key: "quality_session_completion", label: "Quality session completion", unit: "sessions", kind: "proxy" },
      ],
    }),
  }]);

  const result = buildGoalProgressTrackingFromGoals({
    goals,
    logs: {
      "2026-03-30": { type: "Tempo Run", miles: 6, runTime: "49:00", pace: "8:10", feel: 4, checkin: { status: "completed_as_planned" } },
      "2026-04-04": { type: "Intervals", miles: 5, runTime: "40:25", pace: "8:05", feel: 4, checkin: { status: "completed_as_planned" } },
      "2026-04-07": { type: "Long Run", miles: 10, runTime: "86:00", pace: "8:36", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-09": { type: "Tempo Run", miles: 4, runTime: "31:40", pace: "7:55", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    now: "2026-04-10",
  });

  assert.equal(result.goalCards.length, 1);
  assert.equal(result.goalCards[0].summary, "Run a half marathon in 1:45:00");
  assert.deepEqual(result.goalCards[0].trackedItems.map((item) => item.key), [
    "goal_pace_anchor",
    "weekly_run_frequency",
    "long_run_duration",
  ]);
  assert.match(result.goalCards[0].trackedItems[0].targetDisplay, /Goal pace 8:0[01]\/mi/i);
  assert.match(result.goalCards[0].trackedItems[1].currentDisplay, /runs, .* mi, .* min in the last 14 days/i);
  assert.ok(result.goalCards[0].trackedItems.every((item) => item.why.length > 10));
});

test("strength goals track working sets, performance records, and projected distance to target", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Bench 225",
        planningCategory: "strength",
        goalFamily: "strength",
        primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
      }),
    ],
    logs: {
      "2026-03-25": buildBenchLog({ weight: 185, reps: 5, sets: 3 }),
      "2026-04-08": buildBenchLog({ weight: 195, reps: 3, sets: 2 }),
    },
    now: "2026-04-10",
  });

  const itemsByKey = Object.fromEntries(result.goalCards[0].trackedItems.map((item) => [item.key, item]));
  assert.match(itemsByKey.top_set_load.currentDisplay, /195 lb x 3 x 2/i);
  assert.match(itemsByKey.performance_record.currentDisplay, /Best logged top set 195 lb/i);
  assert.match(itemsByKey.projected_goal_progress.currentDisplay, /30 lb remaining to 225 lb/i);
  assert.equal(result.goalCards[0].status, GOAL_PROGRESS_STATUSES.onTrack);
  assert.equal(result.goalCards[0].progressAnchor.kind, "exact_metric");
  assert.match(result.goalCards[0].progressAnchor.distanceLabel, /30 lb to goal/i);
  assert.equal(result.goalCards[0].progressAnchor.currentLabel, "195 lb current");
});

test("strength goals can surface accessory support evidence without pretending it is the main lift", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Bench 225",
        planningCategory: "strength",
        goalFamily: "strength",
        primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
        driverProfile: {
          version: "2026-04-goal-driver-graph-v1",
          primaryDomain: "strength_hypertrophy",
          primaryOutcomeId: "bench_press_strength",
          primaryOutcomeLabel: "Bench press strength",
          focusLabel: "Bench support graph",
          directDrivers: [{ id: "horizontal_press_strength", label: "Horizontal pressing strength", weight: 0.4 }],
          supportDrivers: [
            { id: "anterior_delt_strength", label: "Shoulder pressing support", weight: 0.18 },
            { id: "triceps_strength", label: "Triceps strength", weight: 0.18 },
            { id: "upper_back_stability", label: "Upper-back stability", weight: 0.14 },
          ],
          protectiveDrivers: [{ id: "shoulder_tolerance", label: "Shoulder tolerance", weight: 0.1 }],
          transferNotes: [],
        },
      }),
    ],
    logs: {
      "2026-04-02": buildAccessoryLog([
        { exercise: "Incline DB Press", weight: 135, reps: 8, sets: 3 },
        { exercise: "Lateral Raise", weight: 20, reps: 15, sets: 3 },
      ]),
      "2026-04-09": buildAccessoryLog([
        { exercise: "Chest-Supported Row", weight: 90, reps: 10, sets: 3 },
      ]),
    },
    now: "2026-04-10",
  });

  const itemsByKey = Object.fromEntries(result.goalCards[0].trackedItems.map((item) => [item.key, item]));
  assert.ok(itemsByKey.support_work_coverage);
  assert.match(itemsByKey.support_work_coverage.currentDisplay, /support drivers/i);
  assert.match(itemsByKey.support_work_coverage.trendDisplay, /Incline DB Press|Lateral Raise|Chest-Supported Row/i);
  assert.match(itemsByKey.projected_goal_progress.currentDisplay, /still needs to be logged/i);
});

test("strength protocol goals track the exact working-load gap instead of pretending a top single is enough", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Bench press 225 lb for 3 x 6",
        planningCategory: "strength",
        goalFamily: "strength",
        primaryMetric: {
          key: "bench_press_weight",
          label: "Bench press",
          unit: "lb",
          targetValue: "225",
          targetSets: 3,
          targetReps: 6,
        },
      }),
    ],
    logs: {
      "2026-03-30": buildBenchLog({ weight: 155, reps: 6, sets: 4 }),
      "2026-04-08": buildBenchLog({ weight: 165, reps: 5, sets: 3 }),
    },
    now: "2026-04-10",
  });

  const itemsByKey = Object.fromEntries(result.goalCards[0].trackedItems.map((item) => [item.key, item]));
  assert.match(itemsByKey.top_set_load.targetDisplay, /225 lb for 3 x 6/i);
  assert.match(itemsByKey.performance_record.currentDisplay, /Best logged 3 x 6 load 155 lb/i);
  assert.match(itemsByKey.projected_goal_progress.currentDisplay, /70 lb remaining to 225 lb for 3 x 6/i);
});

test("time-bound goals stop calling themselves on-track after the deadline passes unmet", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Run a half marathon in 1:45:00",
        planningCategory: "running",
        goalFamily: "performance",
        primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", targetValue: "1:45:00" },
        proxyMetrics: [
          { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
          { key: "long_run_duration", label: "Long run duration", unit: "min", kind: "proxy" },
        ],
      }),
    ].map((goal) => ({
      ...goal,
      targetDate: "2026-10-18",
    })),
    logs: {
      "2026-10-10": { type: "Long Run", miles: 10, runTime: "86:00", pace: "8:36", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-10-15": { type: "Tempo Run", miles: 5, runTime: "39:30", pace: "7:54", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    now: "2026-11-15",
  });

  assert.notEqual(result.goalCards[0].status, GOAL_PROGRESS_STATUSES.onTrack);
  assert.match(result.goalCards[0].statusSummary, /target window has passed|re-plan/i);
  assert.match(result.goalCards[0].honestyNote, /date window passed|truthful re-plan/i);
});

test("body-composition goals use live proxy trends like bodyweight, waist, and consistency", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Get lean for summer",
        planningCategory: "body_comp",
        goalFamily: "body_comp",
        measurabilityTier: "proxy_measurable",
        proxyMetrics: [
          { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
          { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", kind: "proxy" },
        ],
      }),
    ],
    logs: {
      "2026-04-03": { type: "Strength", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-08": { type: "Easy Run", miles: 3, runTime: "28:00", pace: "9:20", feel: 3, checkin: { status: "completed_modified" } },
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
    now: "2026-04-10",
  });

  const itemsByKey = Object.fromEntries(result.goalCards[0].trackedItems.map((item) => [item.key, item]));
  assert.match(itemsByKey.bodyweight_trend.currentDisplay, /185\.9 lb latest/i);
  assert.match(itemsByKey.waist_circumference.currentDisplay, /34\.8 in latest/i);
  assert.equal(itemsByKey.progress_photos, undefined);
  assert.ok(result.goalCards[0].statusSummary.includes("trend measures"));
});

test("appearance goals stay review-based and avoid fake exact precision", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Look athletic again",
        planningCategory: "body_comp",
        goalFamily: "appearance",
        measurabilityTier: "proxy_measurable",
        proxyMetrics: [
          { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
          { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", kind: "proxy" },
        ],
      }),
    ],
    logs: {
      "2026-04-09": { type: "Strength", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    bodyweights: [
      { date: "2026-04-09", w: 186.4 },
    ],
    now: "2026-04-10",
  });

  const card = result.goalCards[0];
  const checklist = card.trackedItems.find((item) => item.key === "appearance_review_checklist");
  assert.equal(card.status, GOAL_PROGRESS_STATUSES.reviewBased);
  assert.ok(checklist);
  assert.match(checklist.currentDisplay, /\d\/3 review anchors updated this cycle/i);
  assert.match(card.honestyNote, /never get a fake exact completion score/i);
  assert.equal(card.progressAnchor.kind, "status");
  assert.match(card.progressAnchor.headline, /Building through proxies/i);
});

test("swim speed goals track benchmark retests, swim reality, and consistency without pretending they are generic cardio", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Swim a faster mile",
        planningCategory: "general_fitness",
        primaryMetric: { key: "swim_mile_time", label: "Swim mile time", unit: "time", targetValue: "28:00" },
        proxyMetrics: [
          { key: "swim_benchmark_retest", label: "Swim benchmark retest", unit: "benchmark", kind: "proxy" },
          { key: "weekly_swim_frequency", label: "Weekly swim frequency", unit: "sessions", kind: "proxy" },
          { key: "swim_access_reality", label: "Swim access reality", unit: "", kind: "proxy" },
        ],
        goalFamily: "swimming_endurance_technique",
      }),
    ],
    logs: {
      "2026-04-02": { type: "Swim", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-09": { type: "Swim", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    manualProgressInputs: {
      benchmarks: {
        swim_benchmark: [
          { date: "2026-03-20", value: "1000 yd in 22:30" },
          { date: "2026-04-10", value: "1000 yd in 21:50" },
        ],
      },
      metrics: {
        swim_access_reality: [
          { date: "2026-04-10", value: "pool", label: "Pool only" },
        ],
      },
    },
    now: "2026-04-14",
  });

  const card = result.goalCards[0];
  const itemsByKey = Object.fromEntries(card.trackedItems.map((item) => [item.key, item]));
  assert.equal(card.trackedItems[0].key, "swim_benchmark_retest");
  assert.match(itemsByKey.swim_benchmark_retest.currentDisplay, /1000 yd in 21:50/i);
  assert.match(itemsByKey.swim_benchmark_retest.trendDisplay, /40 sec faster/i);
  assert.match(itemsByKey.swim_access_reality.currentDisplay, /Pool only/i);
  assert.match(card.statusSummary, /repeatable benchmark|swim reality/i);
});

test("exploratory re-entry goals become trackable through consistency, readiness, and baseline improvements", () => {
  const result = buildGoalProgressTracking({
    resolvedGoals: [
      buildResolvedGoal({
        summary: "Get back in shape",
        planningCategory: "general_fitness",
        goalFamily: "re_entry",
        measurabilityTier: "exploratory_fuzzy",
        first30DaySuccessDefinition: "Complete 10 of the next 12 planned sessions over 30 days.",
      }),
    ],
    logs: {
      "2026-03-20": { type: "Walk", runTime: "20", feel: 2, checkin: { status: "completed_modified" } },
      "2026-03-29": { type: "Strength", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-03": { type: "Easy Run", miles: 2, runTime: "22:00", pace: "11:00", feel: 3, checkin: { status: "completed_as_planned" } },
      "2026-04-06": { type: "Strength", feel: 4, checkin: { status: "completed_as_planned" } },
      "2026-04-09": { type: "Easy Run", miles: 3, runTime: "29:00", pace: "9:40", feel: 4, checkin: { status: "completed_as_planned" } },
    },
    weeklyCheckins: {
      "13": { energy: 2, stress: 4, confidence: 2, ts: new Date("2026-03-30T12:00:00Z").getTime() },
      "14": { energy: 4, stress: 2, confidence: 4, ts: new Date("2026-04-07T12:00:00Z").getTime() },
    },
    now: "2026-04-10",
  });

  const card = result.goalCards[0];
  assert.equal(card.status, GOAL_PROGRESS_STATUSES.reviewBased);
  assert.match(card.statusSummary, /Complete 10 of the next 12 planned sessions over 30 days/i);
  assert.deepEqual(card.trackedItems.map((item) => item.key), [
    "weekly_training_frequency",
    "readiness_anchor",
    "baseline_improvement",
    "baseline_benchmark",
  ]);
  assert.match(card.nextReviewFocus, /10 of the next 12 planned sessions/i);
});
