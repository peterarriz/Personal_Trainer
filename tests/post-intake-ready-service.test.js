const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPostIntakeReadyModel,
} = require("../src/services/post-intake-ready-service.js");

const buildWeekRow = ({
  absoluteWeek,
  phase = "BASE",
  focus = "Build the first full week without overloading it.",
  longRun = "75 min",
} = {}) => ({
  absoluteWeek,
  weekLabel: `Week ${absoluteWeek}`,
  planWeek: {
    phase,
    weeklyIntent: {
      focus,
    },
    sessionsByDay: {
      1: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "35 min" } },
      2: { type: "strength+prehab", label: "Strength A", strSess: "A", strengthDose: "35 min strength" },
      4: { type: "hard-run", label: "Tempo", run: { t: "Tempo", d: "30 min tempo" } },
      6: { type: "long-run", label: "Long Run", run: { t: "Long", d: longRun } },
    },
  },
});

test("post-intake ready model gives a clear first action, week shape, and roadmap", () => {
  const horizon = [
    buildWeekRow({ absoluteWeek: 1, phase: "BASE", longRun: "75 min" }),
    buildWeekRow({ absoluteWeek: 2, phase: "BASE", longRun: "80 min" }),
    buildWeekRow({ absoluteWeek: 3, phase: "BUILD", longRun: "85 min" }),
    buildWeekRow({ absoluteWeek: 4, phase: "BUILD", longRun: "65 min" }),
  ];

  const model = buildPostIntakeReadyModel({
    currentWeek: 1,
    currentDayOfWeek: 4,
    currentWeekRow: horizon[0],
    rollingHorizon: horizon,
    liveTodayTraining: { type: "hard-run", label: "Tempo", run: { t: "Tempo", d: "30 min tempo" } },
    todayPrescriptionSummary: {
      sessionLabel: "Tempo run",
      expectedDuration: "45 min",
      why: "Build threshold pacing while the rest of the week stays repeatable.",
      structure: "10 min easy, 20 min tempo, 10 min easy",
    },
  });

  assert.equal(model.title, "You're ready");
  assert.equal(model.firstAction.title, "Tempo run");
  assert.match(model.firstAction.detail, /threshold pacing/i);
  assert.match(model.weekShape.summary, /4 sessions/i);
  assert.equal(model.roadmap.rows.length, 4);
  assert.match(model.roadmap.summary, /next few weeks|next block|lighter week|builds toward/i);
  assert.equal(model.checklist.items[0].done, false);
  assert.match(model.adaptation.lines[0], /log today|latest log/i);
});

test("post-intake ready model keeps recovery days reassuring instead of blank", () => {
  const weekRow = {
    absoluteWeek: 1,
    planWeek: {
      weeklyIntent: {
        focus: "Start controlled so the first quality day lands well.",
      },
      sessionsByDay: {
        4: { type: "rest", label: "Recovery" },
        5: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "30 min" } },
        6: { type: "long-run", label: "Long Run", run: { t: "Long", d: "70 min" } },
      },
    },
  };

  const model = buildPostIntakeReadyModel({
    currentWeek: 1,
    currentDayOfWeek: 4,
    currentWeekRow: weekRow,
    rollingHorizon: [weekRow],
    liveTodayTraining: { type: "rest", label: "Recovery" },
    todayPrescriptionSummary: {
      sessionLabel: "Recovery day",
      expectedDuration: "15 min reset",
    },
  });

  assert.equal(model.firstAction.eyebrow, "Today starts easy");
  assert.match(model.firstAction.detail, /stays light/i);
  assert.match(model.checklist.items[0].label, /reset/i);
});

test("post-intake ready model keeps a strength-first current week from falling back to stale run copy", () => {
  const staleRoadmapRow = {
    absoluteWeek: 2,
    template: {
      phase: "BASE",
      mon: { t: "Easy", d: "35 min" },
      fri: { t: "Easy", d: "30 min" },
      sat: { t: "Long", d: "60 min" },
      str: "A",
    },
  };
  const liveStrengthWeek = {
    absoluteWeek: 2,
    weekLabel: "Strength block - Week 2",
    planWeek: {
      phase: "BASE",
      weeklyIntent: {
        focus: "Build strength first while conditioning stays supportive.",
      },
      sessionsByDay: {
        1: { type: "strength+prehab", label: "Strength A", strSess: "A", strengthDose: "30-40 min base strength" },
        3: { type: "conditioning", label: "Supportive Conditioning", fallback: "20-30 min bike or incline walk" },
        5: { type: "strength+prehab", label: "Strength B", strSess: "B", strengthDose: "35-45 min strength" },
      },
    },
  };

  const model = buildPostIntakeReadyModel({
    currentWeek: 2,
    currentDayOfWeek: 1,
    currentWeekRow: liveStrengthWeek,
    rollingHorizon: [staleRoadmapRow],
    liveTodayTraining: liveStrengthWeek.planWeek.sessionsByDay[1],
    todayPrescriptionSummary: {
      sessionLabel: "Strength A",
      expectedDuration: "40 min",
      why: "Build strength first while the rest of the week stays easy to repeat.",
    },
  });

  assert.match(model.weekShape.summary, /strength day/i);
  assert.doesNotMatch(model.weekShape.summary, /key run|long run/i);
  assert.equal(model.weekShape.cells.find((cell) => cell.dayLabel === "Mon")?.shortDetail, "30-40 min strength");
});
