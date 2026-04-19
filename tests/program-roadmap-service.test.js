const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildProgramTrajectoryHeaderModel,
  buildProgramRoadmapRows,
  buildProgramWeekGridCells,
} = require("../src/services/program-roadmap-service.js");

const buildWeekRow = ({
  absoluteWeek,
  phase,
  label,
  longRun,
  quality = "Tempo",
  strengthSession = "A",
  cutback = false,
} = {}) => ({
  absoluteWeek,
  weekLabel: `${phase} - Week ${absoluteWeek}`,
  cutback,
  template: {
    phase,
    label,
    mon: { t: "Easy", d: "35 min" },
    thu: { t: quality, d: quality === "Intervals" ? "5 x 3 min" : "30 min tempo" },
    fri: { t: "Easy", d: "30 min" },
    sat: { t: "Long", d: longRun },
    str: strengthSession,
  },
});

test("half-marathon roadmap keeps 15 weeks of visible progression and long-run growth", () => {
  const displayHorizon = [
    buildWeekRow({ absoluteWeek: 4, phase: "BASE", label: "Foundation", longRun: "6 mi" }),
    buildWeekRow({ absoluteWeek: 5, phase: "BASE", label: "Foundation 2", longRun: "7 mi" }),
    buildWeekRow({ absoluteWeek: 6, phase: "BUILDING", label: "Sharpen 1", longRun: "8 mi", quality: "Intervals" }),
    buildWeekRow({ absoluteWeek: 7, phase: "BUILDING", label: "Sharpen 2", longRun: "6 mi", cutback: true }),
    buildWeekRow({ absoluteWeek: 8, phase: "BUILDING", label: "Sharpen 3", longRun: "9 mi" }),
    buildWeekRow({ absoluteWeek: 9, phase: "PEAK", label: "Peak 1", longRun: "10 mi", quality: "Intervals" }),
    buildWeekRow({ absoluteWeek: 10, phase: "PEAK", label: "Peak 2", longRun: "11 mi" }),
    buildWeekRow({ absoluteWeek: 11, phase: "PEAK", label: "Peak 3", longRun: "12 mi" }),
    buildWeekRow({ absoluteWeek: 12, phase: "TAPER", label: "Back off", longRun: "9 mi", cutback: true }),
    buildWeekRow({ absoluteWeek: 13, phase: "TAPER", label: "Sharpen", longRun: "7 mi" }),
    buildWeekRow({ absoluteWeek: 14, phase: "TAPER", label: "Race prep", longRun: "13.1 mi" }),
    buildWeekRow({ absoluteWeek: 15, phase: "RESET", label: "Reset", longRun: "45 min", cutback: true }),
    buildWeekRow({ absoluteWeek: 16, phase: "RESET", label: "Reset 2", longRun: "50 min" }),
    buildWeekRow({ absoluteWeek: 17, phase: "BASE", label: "Rebuild", longRun: "55 min" }),
    buildWeekRow({ absoluteWeek: 18, phase: "BASE", label: "Rebuild 2", longRun: "60 min" }),
  ];

  const rows = buildProgramRoadmapRows({ displayHorizon, currentWeek: 4 });

  assert.equal(rows.length, 15);
  assert.equal(rows[0].isCurrentWeek, true);
  assert.equal(rows[1].longRunDeltaLabel, "+1mi");
  assert.equal(rows[3].cutback, true);
  assert.equal(rows[3].longRunDeltaLabel, "-2mi");
  assert.match(rows[10].longRunLabel, /13\.1 mi/i);
  assert.equal(rows[5].qualityLabel, "1 quality session");
});

test("hybrid roadmap keeps strength days legible instead of reading like pure race prep", () => {
  const displayHorizon = [
    {
      absoluteWeek: 9,
      weekLabel: "Hybrid Build - Week 9",
      planWeek: {
        phase: "BUILDING",
        weeklyIntent: { focus: "Keep long-run progress while protecting two upper-body strength touches." },
        sessionsByDay: {
          1: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "40 min" } },
          2: { type: "strength+prehab", label: "Upper Strength A", strSess: "A", strengthDose: "45 min top set + backoff strength" },
          4: { type: "hard-run", label: "Tempo", run: { t: "Tempo", d: "35 min tempo" } },
          5: { type: "strength+prehab", label: "Upper Strength B", strSess: "B", strengthDose: "40 min controlled strength" },
          6: { type: "long-run", label: "Long Run", run: { t: "Long", d: "80 min" } },
        },
      },
    },
  ];

  const [row] = buildProgramRoadmapRows({ displayHorizon, currentWeek: 9 });

  assert.equal(row.isCurrentWeek, true);
  assert.equal(row.qualityCount, 1);
  assert.equal(row.runCount, 3);
  assert.equal(row.runLabel, "3 run days");
  assert.equal(row.strengthCount, 2);
  assert.equal(row.strengthLabel, "2 strength days");
  assert.match(row.longRunLabel, /80 min/i);
  assert.match(row.focus, /two upper-body strength touches/i);
});

test("trajectory header answers where the block is going without cloning Today", () => {
  const roadmapRows = buildProgramRoadmapRows({
    displayHorizon: [
      buildWeekRow({ absoluteWeek: 9, phase: "BUILDING", label: "Build 1", longRun: "8 mi" }),
      buildWeekRow({ absoluteWeek: 10, phase: "BUILDING", label: "Build 2", longRun: "9 mi" }),
      buildWeekRow({ absoluteWeek: 11, phase: "PEAK", label: "Peak 1", longRun: "10 mi" }),
    ],
    currentWeek: 9,
  });

  const model = buildProgramTrajectoryHeaderModel({
    roadmapRows,
    phaseNarrative: [
      { name: "Build", startWeek: 9, endWeek: 10 },
      { name: "Peak", startWeek: 11, endWeek: 12 },
    ],
    currentWeek: 9,
    primaryCategory: "running",
    currentWeekLabel: "Build - Week 9",
    currentWeekFocus: "Keep the quality session clean and the long run moving.",
  });

  assert.match(model.heading, /build|milestone/i);
  assert.match(model.chapterLabel, /build/i);
  assert.match(model.nextMilestoneLine, /9 mi|week 10/i);
  assert.match(model.arcLine, /peak|week 11/i);
});

test("current-week grid marks today clearly and overlays the live session", () => {
  const weekRow = {
    absoluteWeek: 12,
    planWeek: {
      sessionsByDay: {
        1: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "35 min" } },
        2: { type: "strength+prehab", label: "Strength A", strSess: "A", strengthDose: "40 min strength" },
        4: { type: "hard-run", label: "Tempo", run: { t: "Tempo", d: "30 min tempo" } },
        6: { type: "long-run", label: "Long Run", run: { t: "Long", d: "75 min" } },
      },
    },
  };

  const cells = buildProgramWeekGridCells({
    weekRow,
    currentWeek: 12,
    currentDayOfWeek: 4,
    liveTodayTraining: {
      type: "hard-run",
      label: "Tempo (Reduced-load)",
      run: { t: "Easy Aerobic", d: "20-30 min easy aerobic" },
    },
  });

  assert.equal(cells.length, 7);
  assert.equal(cells.filter((cell) => cell.isToday).length, 1);
  assert.equal(cells.find((cell) => cell.isToday)?.dayLabel, "Thu");
  assert.match(cells.find((cell) => cell.isToday)?.title || "", /tempo \(reduced-load\)/i);
  assert.equal(cells.find((cell) => cell.dayLabel === "Wed")?.isRest, true);
});
