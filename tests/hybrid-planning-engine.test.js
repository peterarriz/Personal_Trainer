const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  normalizeGoals,
} = require("../src/modules-planning.js");
const {
  buildTrainingContextFromEditor,
} = require("../src/services/training-context-service.js");

const BASE_WEEK = {
  phase: "BUILD",
  label: "Build",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "30 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "60 min" },
  str: "A",
  nutri: "hardRun",
};

const WEEK_TEMPLATES = [
  BASE_WEEK,
  { ...BASE_WEEK, label: "Build 2", fri: { t: "Easy", d: "35 min" }, sat: { t: "Long", d: "70 min" } },
];

const buildGoals = (goalDefs = []) => normalizeGoals(goalDefs.map((goal, index) => ({
  id: goal.id || `goal_${index + 1}`,
  name: goal.name,
  category: goal.category,
  active: goal.active !== false,
  priority: goal.priority || index + 1,
  targetDate: goal.targetDate || "",
  resolvedGoal: goal.resolvedGoal || null,
})));

const buildComposer = ({
  goals,
  personalization = {},
  logs = {},
  plannedDayRecords = {},
  currentDayOfWeek = 2,
  todayKey = "2026-04-15",
} = {}) => composeGoalNativePlan({
  goals,
  personalization,
  momentum: { inconsistencyRisk: "low", momentumState: "stable" },
  learningLayer: {},
  baseWeek: BASE_WEEK,
  currentWeek: 1,
  weekTemplates: WEEK_TEMPLATES,
  logs,
  dailyCheckins: {},
  nutritionActualLogs: {},
  weeklyNutritionReview: null,
  coachActions: [],
  todayKey,
  currentDayOfWeek,
  plannedDayRecords,
  planWeekRecords: {},
});

const getNonRestSessions = (composer = null) => Object.values(composer?.dayTemplates || {}).filter((session) => session && session.type !== "rest");
const getTextCorpus = (composer = null) => getNonRestSessions(composer).map((session) => [
  session?.label || "",
  session?.strengthDose || "",
  session?.run?.d || "",
  ...(session?.prescribedExercises || []).map((exercise) => exercise?.ex || ""),
].join(" ")).join(" ").toLowerCase();

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

const buildCardioLog = ({
  status = "completed_modified",
  label = "Bike aerobic",
  modality = "bike",
} = {}) => ({
  checkin: { status },
  actualSession: {
    sessionLabel: label,
    modality,
  },
});

test("multi-goal hybrid weeks keep primary, maintained, and support goals legible", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-05-25" },
      { name: "Bench 225", category: "strength", priority: 2 },
      { name: "Visible abs", category: "body_comp", priority: 3 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
  });

  assert.ok(["event_prep_upper_body_maintenance", "race_prep_dominant"].includes(composer.architecture));
  assert.ok(composer.blockIntent.maintained.some((label) => /bench/i.test(label)));
  assert.ok(composer.blockIntent.support.some((label) => /abs|visible/i.test(label)));
  assert.ok(getNonRestSessions(composer).some((session) => session.type === "long-run"));
  assert.ok(getNonRestSessions(composer).some((session) => session.upperBodyBias));
});

test("hybrid weeks do not stack lower-body strength directly against hard run anchors", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Bench 225", category: "strength", priority: 1 },
      { name: "Run a 1:45 half marathon", category: "running", priority: 2, targetDate: "2026-09-20" },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
  });

  const dayEntries = Object.entries(composer.dayTemplates || {}).map(([day, session]) => ({ day: Number(day), session })).filter((entry) => entry.session);
  dayEntries.forEach(({ day, session }) => {
    const lowerBodyLoad = String(session?.lowerBodyLoad || "").toLowerCase();
    if (!["moderate", "high"].includes(lowerBodyLoad)) return;
    const previousType = String(composer.dayTemplates?.[day - 1]?.type || "").toLowerCase();
    const nextType = String(composer.dayTemplates?.[day + 1]?.type || "").toLowerCase();
    assert.ok(!["hard-run", "long-run"].includes(previousType));
    assert.ok(!["hard-run", "long-run"].includes(nextType));
  });
});

test("schedule-constrained hybrid weeks preserve both lanes instead of deleting strength entirely", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a strong 10K", category: "running", priority: 1, targetDate: "2026-08-01" },
      { name: "Get stronger", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 3, session_length: "30" },
    },
  });

  const sessions = getNonRestSessions(composer);
  assert.ok(sessions.length <= 3);
  assert.ok(sessions.some((session) => ["strength+prehab", "run+strength"].includes(session.type)));
  assert.ok(sessions.some((session) => session.type === "hard-run"));
  assert.ok(sessions.some((session) => session.type === "long-run" || session.type === "easy-run"));
});

test("explicit weekday availability moves key work onto realistic days and keeps off-days as optional recovery", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    equipmentItems: ["full rack", "barbell", "bench", "treadmill"],
    availableDays: ["tue", "thu", "sun"],
    time: "45",
  });
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-09-20" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      trainingContext,
      userGoalProfile: { days_per_week: 5, session_length: "45", available_days: ["tue", "thu", "sun"] },
    },
  });

  const activeDayKeys = Object.entries(composer.dayTemplates || {})
    .filter(([, session]) => session && session.type !== "rest" && !session?.isRecoverySlot)
    .map(([dayKey]) => Number(dayKey))
    .sort((left, right) => left - right);

  assert.ok(activeDayKeys.every((dayKey) => [0, 2, 4].includes(dayKey)));
  assert.equal(composer.dayTemplates?.[0]?.type, "long-run");
  assert.equal(composer.dayTemplates?.[6]?.type, "rest");
  assert.match(String(composer.dayTemplates?.[6]?.optionalSecondary || ""), /walk|mobility|bike/i);
  assert.match((composer.constraints || []).join(" ").toLowerCase(), /usual 3-day window|weekend|primary work now lands/);
});

test("home-only hybrid weeks stay equipment-honest while still prescribing real strength work", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Home",
    equipment: "dumbbells_only",
    equipmentItems: ["dumbbells", "bench", "running shoes"],
    time: "45",
  });
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a faster half marathon", category: "running", priority: 1, targetDate: "2026-09-01" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      trainingContext,
      userGoalProfile: { days_per_week: 4, session_length: "45" },
    },
  });

  const textCorpus = getTextCorpus(composer);
  assert.doesNotMatch(textCorpus, /\bbarbell|rack|leg press|smith\b/);
  assert.match(textCorpus, /\bdb|dumbbell|push-up|push up|row\b/);
  assert.ok(getNonRestSessions(composer).some((session) => Array.isArray(session?.prescribedExercises) && session.prescribedExercises.length > 0));
});

test("recent lower-body strain biases the next strength touch away from lower-body loading", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a strong half marathon", category: "running", priority: 1, targetDate: "2026-07-15" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    currentDayOfWeek: 2,
    todayKey: "2026-04-15",
    logs: {
      "2026-04-13": { actualSession: { bodyStatus: "legs_sore", recoveryState: "low", sessionLabel: "Long run" } },
      "2026-04-14": { actualSession: { bodyStatus: "beat_up", recoveryState: "low", sessionLabel: "Lower-body strength" } },
    },
  });

  assert.ok((composer.constraints || []).some((line) => /recent lower-body stress/i.test(line)));
  const futureStrengthSessions = Object.entries(composer.dayTemplates || {})
    .filter(([day, session]) => Number(day) >= 2 && session?.type === "strength+prehab")
    .map(([, session]) => session);
  assert.ok(futureStrengthSessions.every((session) => session.upperBodyBias === true || String(session?.lowerBodyLoad || "").toLowerCase() === "none"));
});

test("recent bench-support work shifts the next accessory packet toward trunk and tolerance instead of repeating the same rows", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-08-15" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    logs: {
      "2026-04-10": buildAccessoryLog([
        { exercise: "Incline DB Press", weight: 90, reps: 8, sets: 3 },
        { exercise: "Lateral Raise", weight: 20, reps: 15, sets: 3 },
      ]),
      "2026-04-16": buildAccessoryLog([
        { exercise: "Chest-Supported Row", weight: 90, reps: 10, sets: 3 },
        { exercise: "Cable Pressdown", weight: 60, reps: 12, sets: 3 },
      ]),
    },
    todayKey: "2026-04-21",
    currentDayOfWeek: 2,
  });

  const textCorpus = getTextCorpus(composer);
  assert.match(textCorpus, /\bcarry|plank|serratus|external rotation\b/);
});

test("support gaps surface as visible weekly touchpoints instead of only hiding inside lift packets", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-08-15" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    todayKey: "2026-04-21",
    currentDayOfWeek: 2,
  });

  const touchpointSessions = Object.values(composer.dayTemplates || {}).filter((session) => Array.isArray(session?.supportTouchpoints) && session.supportTouchpoints.length);
  const touchpointBuckets = touchpointSessions.flatMap((session) => session.supportTouchpoints.map((entry) => entry.bucket));
  const touchpointCopy = touchpointSessions.map((session) => String(session?.optionalSecondary || "").toLowerCase()).join(" ");

  assert.ok(touchpointBuckets.includes("strength"));
  assert.ok(touchpointBuckets.includes("durability"));
  assert.match(touchpointCopy, /shoulders|upper back|triceps|scap|trunk/);
  assert.match(touchpointCopy, /calves|ankles|single-leg|durability|lower-leg/);
});

test("repeated misses on Saturday move key work off the chronic miss day when a recovery slot can absorb it", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-08-15" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    todayKey: "2026-04-15",
    currentDayOfWeek: 2,
    plannedDayRecords: {
      "2026-03-28": { id: "plan_day_2026-03-28", dateKey: "2026-03-28", resolved: { training: { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } } } },
      "2026-04-04": { id: "plan_day_2026-04-04", dateKey: "2026-04-04", resolved: { training: { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } } } },
      "2026-04-11": { id: "plan_day_2026-04-11", dateKey: "2026-04-11", resolved: { training: { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } } } },
    },
    logs: {
      "2026-03-28": { checkin: { status: "skipped" } },
      "2026-04-04": { checkin: { status: "skipped" } },
      "2026-04-11": { checkin: { status: "skipped" } },
    },
  });

  assert.equal(composer.dayTemplates?.[6]?.type, "rest");
  assert.equal(composer.dayTemplates?.[0]?.type, "long-run");
  assert.match((composer.constraints || []).join(" "), /moved from saturday to sunday/i);
});

test("long-session work moves onto the day it actually gets done most often", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-08-15" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    todayKey: "2026-04-21",
    currentDayOfWeek: 2,
    plannedDayRecords: {
      "2026-04-05": { id: "plan_day_2026-04-05", dateKey: "2026-04-05", resolved: { training: { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } } } },
      "2026-04-12": { id: "plan_day_2026-04-12", dateKey: "2026-04-12", resolved: { training: { type: "long-run", label: "Long Run", run: { t: "Long", d: "65 min" } } } },
    },
    logs: {
      "2026-04-05": buildCardioLog({ status: "completed_as_planned", label: "Outdoor long run", modality: "outdoor run" }),
      "2026-04-12": buildCardioLog({ status: "completed_as_planned", label: "Outdoor long run", modality: "outdoor run" }),
    },
  });

  assert.equal(composer.dayTemplates?.[0]?.type, "long-run");
  assert.equal(composer.dayTemplates?.[6]?.type, "rest");
  assert.match((composer.constraints || []).join(" "), /long-session work moved to sunday/i);
});

test("repeated conditioning choices bias future support cardio toward the preferred mode", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a strong 10K", category: "running", priority: 1, targetDate: "2026-08-01" },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    todayKey: "2026-04-21",
    currentDayOfWeek: 2,
    plannedDayRecords: {
      "2026-04-07": { id: "plan_day_2026-04-07", dateKey: "2026-04-07", resolved: { training: { type: "conditioning", label: "Conditioning Intervals" } } },
      "2026-04-14": { id: "plan_day_2026-04-14", dateKey: "2026-04-14", resolved: { training: { type: "conditioning", label: "Conditioning Intervals" } } },
    },
    logs: {
      "2026-04-07": buildCardioLog({ label: "Bike conditioning", modality: "bike" }),
      "2026-04-14": buildCardioLog({ label: "Bike conditioning", modality: "bike" }),
    },
  });

  const textCorpus = getTextCorpus(composer);
  assert.match(textCorpus, /bike conditioning|steady bike|spin/);
  assert.match((composer.why || []).join(" ").toLowerCase(), /conditioning sessions now bias toward bike/i);
});

test("recurring add-on accessories stay visible in future strength support packets", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Bench 225", category: "strength", priority: 1 },
      { name: "Run a 1:45 half marathon", category: "running", priority: 2, targetDate: "2026-08-15" },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    todayKey: "2026-04-21",
    currentDayOfWeek: 2,
    plannedDayRecords: {
      "2026-04-08": {
        id: "plan_day_2026-04-08",
        dateKey: "2026-04-08",
        resolved: {
          training: {
            type: "strength+prehab",
            label: "Bench Maintenance A",
            prescribedExercises: [
              { ex: "Bench Press", sets: "4 sets", reps: "6 reps", note: "Main press." },
              { ex: "Chest-Supported Row", sets: "3 sets", reps: "8-10 reps", note: "Upper pull support." },
            ],
          },
        },
      },
      "2026-04-15": {
        id: "plan_day_2026-04-15",
        dateKey: "2026-04-15",
        resolved: {
          training: {
            type: "strength+prehab",
            label: "Bench Maintenance B",
            prescribedExercises: [
              { ex: "Bench Press", sets: "4 sets", reps: "6 reps", note: "Main press." },
              { ex: "Chest-Supported Row", sets: "3 sets", reps: "8-10 reps", note: "Upper pull support." },
            ],
          },
        },
      },
    },
    logs: {
      "2026-04-08": buildAccessoryLog([
        { exercise: "Bench Press", weight: 155, reps: 8, sets: 3 },
        { exercise: "Chest-Supported Row", weight: 90, reps: 10, sets: 3 },
        { exercise: "Ab Wheel Rollout", weight: 0, reps: 10, sets: 3 },
      ]),
      "2026-04-15": buildAccessoryLog([
        { exercise: "Bench Press", weight: 160, reps: 6, sets: 4 },
        { exercise: "Chest-Supported Row", weight: 95, reps: 10, sets: 3 },
        { exercise: "Ab Wheel Rollout", weight: 0, reps: 12, sets: 3 },
      ]),
    },
  });

  assert.match(getTextCorpus(composer), /ab wheel rollout/);
  assert.match((composer.why || []).join(" ").toLowerCase(), /ab wheel rollout now stays in the support packet/i);
});

test("repeated logged accessory substitutions become future exercise defaults for that pattern", () => {
  const composer = buildComposer({
    goals: buildGoals([
      { name: "Run a 1:45 half marathon", category: "running", priority: 1, targetDate: "2026-08-15" },
      { name: "Bench 225", category: "strength", priority: 2 },
    ]),
    personalization: {
      userGoalProfile: { days_per_week: 5, session_length: "45" },
    },
    todayKey: "2026-04-21",
    currentDayOfWeek: 2,
    plannedDayRecords: {
      "2026-04-08": {
        id: "plan_day_2026-04-08",
        dateKey: "2026-04-08",
        resolved: {
          training: {
            type: "strength+prehab",
            label: "Bench Maintenance A",
            prescribedExercises: [
              { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps", note: "Pair heavy pressing with strong pulling." },
            ],
          },
        },
      },
      "2026-04-15": {
        id: "plan_day_2026-04-15",
        dateKey: "2026-04-15",
        resolved: {
          training: {
            type: "strength+prehab",
            label: "Bench Maintenance B",
            prescribedExercises: [
              { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps", note: "Pair heavy pressing with strong pulling." },
            ],
          },
        },
      },
    },
    logs: {
      "2026-04-08": buildAccessoryLog([
        { exercise: "Chest-Supported Row", weight: 90, reps: 10, sets: 3 },
      ]),
      "2026-04-15": buildAccessoryLog([
        { exercise: "Chest-Supported Row", weight: 95, reps: 10, sets: 3 },
      ]),
    },
  });

  const textCorpus = getTextCorpus(composer);
  assert.match(textCorpus, /chest-supported row/);
  assert.doesNotMatch(textCorpus, /weighted pull-up or pull-down/);
});
