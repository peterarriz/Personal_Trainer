const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_CHANGE_MODES,
  buildGoalChangeArchiveEntry,
  buildGoalChangeHistoryEvent,
  prepareGoalChangeActiveState,
  resolveGoalChangePlanStartDate,
} = require("../src/services/goal-change-service.js");

test("start-new-arc changes reset active planning artifacts but keep past day truth", () => {
  const result = prepareGoalChangeActiveState({
    mode: GOAL_CHANGE_MODES.startNewGoalArc,
    todayKey: "2026-04-10",
    currentWeek: 6,
    plannedDayRecords: {
      "2026-04-08": { id: "past_day" },
      "2026-04-10": { id: "today_day" },
      "2026-04-12": { id: "future_day" },
    },
    planWeekRecords: {
      "4": { model: "plan_week_record", historyVersion: 1, weekKey: "4", absoluteWeek: 4, record: { id: "week_4", absoluteWeek: 4 } },
      "6": { model: "plan_week_record", historyVersion: 1, weekKey: "6", absoluteWeek: 6, record: { id: "week_6", absoluteWeek: 6 } },
    },
    weeklyCheckins: {
      "5": { energy: 3, ts: 1 },
      "6": { energy: 4, ts: 2 },
    },
    weekNotes: {
      "4": "Older week note",
      "6": "Current week note",
    },
    planAlerts: [{ id: "alert_1" }],
    paceOverrides: { BASE: { easy: "10:00" } },
    coachPlanAdjustments: { weekVolumePct: { 6: 80 } },
    defaultCoachPlanAdjustments: { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} },
  });

  assert.deepEqual(Object.keys(result.plannedDayRecords), ["2026-04-08"]);
  assert.deepEqual(result.planWeekRecords, {});
  assert.deepEqual(result.weeklyCheckins, {});
  assert.deepEqual(result.weekNotes, {});
  assert.deepEqual(result.planAlerts, []);
  assert.deepEqual(result.paceOverrides, {});
  assert.deepEqual(result.coachPlanAdjustments, { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} });
});

test("refining a goal keeps past week snapshots but drops current/future active plan truth", () => {
  const result = prepareGoalChangeActiveState({
    mode: GOAL_CHANGE_MODES.refineCurrentGoal,
    todayKey: "2026-04-10",
    currentWeek: 6,
    plannedDayRecords: {
      "2026-04-07": { id: "past_day" },
      "2026-04-10": { id: "today_day" },
    },
    planWeekRecords: {
      "4": { model: "plan_week_record", historyVersion: 1, weekKey: "4", absoluteWeek: 4, record: { id: "week_4", absoluteWeek: 4 } },
      "6": { model: "plan_week_record", historyVersion: 1, weekKey: "6", absoluteWeek: 6, record: { id: "week_6", absoluteWeek: 6 } },
      "7": { model: "plan_week_record", historyVersion: 1, weekKey: "7", absoluteWeek: 7, record: { id: "week_7", absoluteWeek: 7 } },
    },
    weeklyCheckins: {
      "5": { energy: 3, ts: 1 },
      "6": { energy: 4, ts: 2 },
    },
    weekNotes: {
      "5": "Past week note",
      "6": "Current week note",
      "7": "Future week note",
    },
    planAlerts: [{ id: "alert_1" }],
    paceOverrides: { BASE: { easy: "10:00" } },
    coachPlanAdjustments: { weekVolumePct: { 6: 80 } },
    defaultCoachPlanAdjustments: { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} },
  });

  assert.deepEqual(Object.keys(result.plannedDayRecords), ["2026-04-07"]);
  assert.deepEqual(Object.keys(result.planWeekRecords), ["4"]);
  assert.deepEqual(Object.keys(result.weekNotes), ["5"]);
  assert.deepEqual(Object.keys(result.weeklyCheckins), ["5", "6"]);
  assert.deepEqual(result.planAlerts, []);
  assert.deepEqual(result.paceOverrides, { BASE: { easy: "10:00" } });
});

test("goal change archives capture previous and next goal context without mutating logs", () => {
  const archive = buildGoalChangeArchiveEntry({
    todayKey: "2026-04-10",
    mode: GOAL_CHANGE_MODES.startNewGoalArc,
    rawGoalIntent: "bench 225 then run a fall half marathon",
    currentGoalState: { planStartDate: "2026-01-01", primaryGoal: "Bench 225" },
    goals: [
      { id: "goal_1", name: "Bench 225", active: true, priority: 1 },
      { id: "goal_2", name: "Keep body comp", active: true, priority: 2 },
      { id: "g_resilience", name: "Resilience & injury prevention", active: true, priority: 4, category: "injury_prevention" },
    ],
    resolvedGoals: [
      { id: "resolved_1", summary: "Bench 225", planningPriority: 1 },
      { id: "resolved_2", summary: "Run a fall half marathon", planningPriority: 2 },
    ],
    plannedDayRecords: { "2026-04-09": { id: "plan_day_1" } },
    planWeekRecords: { "5": { model: "plan_week_record", historyVersion: 1, weekKey: "5", absoluteWeek: 5, record: { id: "week_5", absoluteWeek: 5 } } },
    weeklyCheckins: { "5": { energy: 4, ts: 1 } },
    logs: {
      "2026-04-08": { type: "Strength", notes: "Old goal work" },
    },
  });

  assert.equal(archive.archiveType, "goal_change");
  assert.equal(archive.goalChange.mode, GOAL_CHANGE_MODES.startNewGoalArc);
  assert.deepEqual(archive.goalChange.previousGoals, ["Bench 225", "Keep body comp"]);
  assert.deepEqual(archive.goalChange.nextGoals, ["Bench 225", "Run a fall half marathon"]);
  assert.equal(archive.logEntries[0].date, "2026-04-08");
  assert.match(archive.planArcLabel, /2026-01-01 -> 2026-04-10/i);
});

test("goal change events and plan start dates stay explicit", () => {
  const event = buildGoalChangeHistoryEvent({
    todayKey: "2026-04-10",
    mode: GOAL_CHANGE_MODES.reprioritizeGoalStack,
    rawGoalIntent: "lose fat but keep strength",
    previousGoals: ["Half marathon", "Bench 225"],
    nextGoals: ["Lose fat while keeping strength", "Keep strength in the plan while another priority leads"],
    archivedPlanId: "goal_change_archive_123",
  });

  assert.equal(event.mode, GOAL_CHANGE_MODES.reprioritizeGoalStack);
  assert.equal(event.effectiveDate, "2026-04-10");
  assert.equal(event.archivedPlanId, "goal_change_archive_123");
  assert.deepEqual(event.previousGoals, ["Half marathon", "Bench 225"]);
  assert.equal(resolveGoalChangePlanStartDate({
    mode: GOAL_CHANGE_MODES.startNewGoalArc,
    todayKey: "2026-04-10",
    existingPlanStartDate: "2026-01-01",
  }), "2026-04-10");
  assert.equal(resolveGoalChangePlanStartDate({
    mode: GOAL_CHANGE_MODES.refineCurrentGoal,
    todayKey: "2026-04-10",
    existingPlanStartDate: "2026-01-01",
  }), "2026-01-01");
});
