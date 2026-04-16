const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  normalizeGoals,
  DEFAULT_PLANNING_HORIZON_WEEKS,
  getHorizonAnchor,
} = require("../src/modules-planning.js");
const {
  buildGoalTimingPresentation,
  OPEN_ENDED_TIMING_VALUE,
  resolveGoalTimingShape,
} = require("../src/services/goal-timing-service.js");
const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const {
  createPersistedPlanWeekRecord,
  listCommittedPlanWeekRecords,
  PLAN_WEEK_RECORD_COMMITMENT,
} = require("../src/services/plan-week-persistence-service.js");
const {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  upsertPrescribedDayHistoryEntry,
} = require("../src/services/prescribed-day-history-service.js");

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

const buildComposer = (goals = []) => composeGoalNativePlan({
  goals,
  personalization: {},
  momentum: { inconsistencyRisk: "low", momentumState: "stable" },
  learningLayer: {},
  baseWeek: BASE_WEEK,
  currentWeek: 1,
  weekTemplates: [BASE_WEEK],
  logs: {},
  dailyCheckins: {},
  nutritionActualLogs: {},
  coachActions: [],
  todayKey: "2026-04-15",
  currentDayOfWeek: 3,
  plannedDayRecords: {},
  planWeekRecords: {},
});

const buildPlanDayFixture = ({
  dateKey = "2026-04-07",
  label = "Tempo Run",
  calories = 2700,
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: 8, phase: "BUILD" },
  base: {
    training: { label, type: "hard", run: { t: "tempo", d: "10 min warmup, 3 x 8 min tempo" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: calories, c: 280, p: 190, f: 68 } } },
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: { label, type: "hard", run: { t: "tempo", d: "10 min warmup, 3 x 8 min tempo" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: calories, c: 280, p: 190, f: 68 } } },
    recovery: { state: "ready" },
    supplements: null,
  },
  decision: { mode: "progression_ready", modifiedFromBase: false },
  provenance: { summary: "Original plan day.", keyDrivers: ["weekly intent"], events: [] },
  flags: {},
});

const buildPlanWeekFixture = ({
  weekNumber = 4,
  label = `BUILDING - Week ${weekNumber}`,
} = {}) => ({
  id: `plan_week_${weekNumber}`,
  weekNumber,
  absoluteWeek: weekNumber,
  phase: "BUILDING",
  label,
  kind: "plan",
  specificity: "high",
  startDate: "2026-04-06",
  endDate: "2026-04-12",
  status: "planned",
  adjusted: false,
  architecture: "race_prep_dominant",
  weeklyIntent: {
    id: `weekly_intent_${weekNumber}`,
    weekNumber,
    focus: "Run quality and durability",
    rationale: "Run quality leads the week while strength stays supportive.",
  },
  sessionsByDay: {
    1: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "35 min" } },
    4: { type: "hard-run", label: "Tempo Run", run: { t: "Tempo", d: "30 min" } },
    6: { type: "long-run", label: "Long Run", run: { t: "Long", d: "70 min" } },
  },
  template: {
    phase: "BUILDING",
    label: "BUILDING template",
  },
  summary: "Run quality leads the week while strength stays supportive.",
  source: {
    sessionModel: "canonical_week_pattern",
    planningModel: "program_block",
    hasCanonicalSessions: true,
    usesTemplateFallback: false,
  },
});

test("priority order changes the dominant planning architecture instead of acting like cosmetic metadata", () => {
  const runFirst = buildGoals([
    { name: "Run a faster 10k", category: "running", priority: 1, targetDate: "2026-09-01" },
    { name: "Bench 225", category: "strength", priority: 2 },
  ]);
  const strengthFirst = buildGoals([
    { name: "Run a faster 10k", category: "running", priority: 2, targetDate: "2026-09-01" },
    { name: "Bench 225", category: "strength", priority: 1 },
  ]);

  const runComposer = buildComposer(runFirst);
  const strengthComposer = buildComposer(strengthFirst);

  assert.equal(runComposer.programBlock?.dominantEmphasis?.category, "running");
  assert.equal(runComposer.programBlock?.secondaryEmphasis?.category, "strength");
  assert.equal(runComposer.architecture, "event_prep_upper_body_maintenance");

  assert.equal(strengthComposer.programBlock?.dominantEmphasis?.category, "strength");
  assert.equal(strengthComposer.programBlock?.secondaryEmphasis?.category, "running");
  assert.equal(strengthComposer.architecture, "strength_dominant");
});

test("visible planning horizon stays separate from longer goal deadlines", () => {
  const goals = buildGoals([
    { name: "Run a faster 10k", category: "running", priority: 1, targetDate: "2026-09-01" },
  ]);
  const horizonAnchor = getHorizonAnchor(goals, DEFAULT_PLANNING_HORIZON_WEEKS);
  const timing = buildGoalTimingPresentation({
    targetDate: "2026-12-31",
  }, {
    now: "2026-04-15T12:00:00.000Z",
  });

  assert.equal(DEFAULT_PLANNING_HORIZON_WEEKS, 12);
  assert.equal(horizonAnchor.weekIndex, 20);
  assert.equal(horizonAnchor.withinHorizon, false);
  assert.match(timing.detail, /next 3 months show the next phase toward this longer goal/i);
});

test("open-ended goals remain valid planning inputs and do not require hard end dates", () => {
  const timing = resolveGoalTimingShape({
    targetDate: OPEN_ENDED_TIMING_VALUE,
    targetHorizonWeeks: null,
  });
  const presentation = buildGoalTimingPresentation({});
  const composer = buildComposer(buildGoals([
    { name: "Get generally fitter", category: "general_fitness", priority: 1 },
  ]));

  assert.equal(timing.mode, "open_ended");
  assert.equal(presentation.label, "Open-ended");
  assert.match(presentation.detail, /next phase, not a finish line/i);
  assert.ok(Object.values(composer.dayTemplates || {}).filter(Boolean).length > 0);
});

test("material prescribed-day changes append history instead of rewriting original truth", () => {
  const dateKey = "2026-04-07";
  const originalRecord = buildPlanDayFixture({ dateKey, label: "Tempo Run", calories: 2700 });
  const originalEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: originalRecord,
    capturedAt: 1712664000000,
  });
  const revisedRecord = buildPlanDayFixture({ dateKey, label: "Tempo Run Reduced Load", calories: 2825 });
  const revisedEntry = upsertPrescribedDayHistoryEntry({
    dateKey,
    existingEntry: originalEntry,
    plannedDayRecord: revisedRecord,
    capturedAt: 1712671200000,
    reason: "same_day_adjustment",
  });

  assert.equal(revisedEntry.changed, true);
  assert.equal(revisedEntry.nextEntry.revisions.length, 2);
  assert.equal(revisedEntry.nextEntry.revisions[0].record.resolved.training.label, "Tempo Run");
  assert.equal(getCurrentPrescribedDayRecord(revisedEntry.nextEntry).resolved.training.label, "Tempo Run Reduced Load");
});

test("projected weeks stay out of committed week history", () => {
  const committed = createPersistedPlanWeekRecord({
    planWeek: buildPlanWeekFixture({ weekNumber: 4 }),
    capturedAt: 1712664000000,
  });
  const projected = createPersistedPlanWeekRecord({
    planWeek: buildPlanWeekFixture({ weekNumber: 5, label: "PEAK - Week 5" }),
    capturedAt: 1713268800000,
    commitment: PLAN_WEEK_RECORD_COMMITMENT.projected,
  });

  const committedOnly = listCommittedPlanWeekRecords({
    "4": committed,
    "5": projected,
  });

  assert.equal(committedOnly.length, 1);
  assert.equal(committedOnly[0].absoluteWeek, 4);
});
