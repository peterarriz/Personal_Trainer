const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPlanSurfaceModel,
} = require("../src/services/plan-surface-service.js");

const buildRunSession = (label, detail) => ({
  type: /long/i.test(label) ? "long-run" : /tempo|quality/i.test(label) ? "hard-run" : "easy-run",
  label,
  run: { t: label, d: detail },
});

const buildStrengthSession = (label, detail = "45 min strength") => ({
  type: "strength+prehab",
  label,
  strengthDose: detail,
  strengthDuration: detail,
});

test("plan surface model builds a committed hybrid week with preview context", () => {
  const model = buildPlanSurfaceModel({
    planDay: {
      dateKey: "2026-04-22",
      resolved: {
        training: buildStrengthSession("Upper Strength", "50 min strength"),
      },
    },
    surfaceModel: {
      display: {
        purpose: "Hybrid week: strength stays visible while the run lane keeps moving.",
      },
    },
    currentPlanWeek: {
      label: "Build Week 4",
      summary: "Push the hybrid week forward without crowding recovery.",
      weeklyIntent: {
        focus: "Build pressing strength, keep the tempo run sharp, and protect the long run.",
      },
      sessionsByDay: {
        1: buildRunSession("Easy Run", "35 min"),
        2: buildStrengthSession("Upper Strength", "50 min strength"),
        4: buildRunSession("Tempo Run", "3 x 8 min"),
        5: buildStrengthSession("Lower Strength", "45 min strength"),
        6: buildRunSession("Long Run", "80 min"),
      },
    },
    currentWeek: 4,
    rollingHorizon: [
      {
        absoluteWeek: 5,
        weekLabel: "Build Week 5",
        planWeek: {
          weeklyIntent: {
            focus: "Hold the lifting work and extend the long run slightly.",
          },
          sessionsByDay: {
            1: buildRunSession("Easy Run", "40 min"),
            3: buildStrengthSession("Upper Strength", "45 min strength"),
            4: buildRunSession("Tempo Run", "4 x 8 min"),
            6: buildRunSession("Long Run", "90 min"),
          },
        },
      },
    ],
    athleteGoals: [
      { summary: "Bench 225", planningCategory: "strength" },
      { summary: "Half marathon", planningCategory: "running" },
      { summary: "Visible abs", planningCategory: "body_comp" },
    ],
  });

  assert.equal(model.commitmentLabel, "Committed week");
  assert.match(model.intentLine, /pressing strength/i);
  assert.match(model.balanceLine, /run day/i);
  assert.equal(model.currentWeekDays.length, 7);
  assert.ok(model.alignmentItems.length >= 3);
  assert.match(model.alignmentItems[0].detail, /strength day/i);
  assert.match(model.alignmentItems[1].detail, /long run|run day/i);
  assert.equal(model.previewWeek.label, "Build Week 5");
  assert.match(model.previewWeek.focus, /extend the long run/i);
  assert.ok(model.upcomingKeySessions.some((item) => /tempo|long run|strength/i.test(item.title)));
  assert.ok(model.weekTrustModel.chips.some((chip) => chip.label === "Adaptive today"));
});

test("plan surface model marks modified or missed committed days clearly", () => {
  const model = buildPlanSurfaceModel({
    planDay: {
      dateKey: "2026-04-24",
      resolved: {
        training: buildRunSession("Tempo Run", "3 x 8 min"),
      },
      decision: {
        modifiedFromBase: true,
      },
      flags: {
        isModified: true,
      },
    },
    currentPlanWeek: {
      label: "Build Week 2",
      weeklyIntent: {
        focus: "Keep the quality run, strength touch, and recovery day coherent.",
      },
      sessionsByDay: {
        1: buildStrengthSession("Upper Strength", "45 min strength"),
        2: buildRunSession("Easy Run", "30 min"),
        4: buildRunSession("Tempo Run", "3 x 8 min"),
        6: buildRunSession("Long Run", "70 min"),
      },
    },
    currentWeek: 2,
    logs: {
      "2026-04-21": {
        actualSession: {
          status: "completed_modified",
          sessionLabel: "Upper Strength",
          sessionType: "strength+prehab",
        },
      },
      "2026-04-23": {
        actualSession: {
          status: "skipped",
        },
      },
    },
    dailyCheckins: {
      "2026-04-21": { status: "completed_modified" },
      "2026-04-23": { status: "skipped" },
    },
  });

  const modifiedDay = model.currentWeekDays.find((day) => day.dateKey === "2026-04-21");
  const missedDay = model.currentWeekDays.find((day) => day.dateKey === "2026-04-23");
  const todayDay = model.currentWeekDays.find((day) => day.dateKey === "2026-04-24");

  assert.equal(modifiedDay.status.label, "Adjusted");
  assert.equal(missedDay.status.label, "Missed");
  assert.equal(todayDay.status.label, "Adjusted");
  assert.ok(todayDay.trustModel.chips.some((chip) => chip.label === "Adaptive day"));
  assert.ok(todayDay.trustModel.chips.some((chip) => chip.label === "Adjusted"));
  assert.match(model.currentWeekSummaryLine, /adjusted|missed/i);
});

test("preview weeks stay clearly forecast even when the current week is committed", () => {
  const model = buildPlanSurfaceModel({
    planDay: {
      dateKey: "2026-04-20",
      resolved: {
        training: buildRunSession("Easy Run", "35 min"),
      },
    },
    currentPlanWeek: {
      label: "Week 1",
      weeklyIntent: {
        focus: "Set the opening rhythm and keep the week finishable.",
      },
      sessionsByDay: {
        1: buildRunSession("Easy Run", "35 min"),
        3: buildStrengthSession("Strength A", "40 min strength"),
        6: buildRunSession("Long Run", "60 min"),
      },
    },
    currentWeek: 1,
    rollingHorizon: [
      {
        absoluteWeek: 2,
        weekLabel: "Week 2",
        planWeek: {
          weeklyIntent: {
            focus: "Add a little more density while the long run grows.",
          },
          sessionsByDay: {
            1: buildRunSession("Easy Run", "40 min"),
            3: buildStrengthSession("Strength A", "45 min strength"),
            4: buildRunSession("Tempo Run", "20 min tempo"),
            6: buildRunSession("Long Run", "70 min"),
          },
        },
      },
    ],
  });

  assert.equal(model.roadmapRows[0].stateLabel, "Committed");
  assert.equal(model.roadmapRows[1].stateLabel, "Preview");
  assert.ok(model.previewWeek.days.every((day) => day.status.label === "Preview"));
  assert.ok(model.previewWeek.days.every((day) => day.trustModel.chips.some((chip) => chip.label === "Preview")));
  assert.match(model.commitmentLine, /future weeks stay preview-only/i);
});

test("plan surface adds exact goal distance rails and honest proxy status cards", () => {
  const model = buildPlanSurfaceModel({
    planDay: {
      dateKey: "2026-04-22",
      resolved: {
        training: buildStrengthSession("Upper Strength", "50 min strength"),
      },
    },
    currentPlanWeek: {
      label: "Build Week 4",
      weeklyIntent: {
        focus: "Build pressing strength, keep the run lane moving, and stay leaner.",
      },
      sessionsByDay: {
        1: buildRunSession("Easy Run", "35 min"),
        2: buildStrengthSession("Upper Strength", "50 min strength"),
        4: buildRunSession("Tempo Run", "3 x 8 min"),
        6: buildRunSession("Long Run", "80 min"),
      },
    },
    currentWeek: 4,
    athleteGoals: [
      {
        id: "goal_bench",
        active: true,
        priority: 1,
        resolvedGoal: {
          id: "resolved_goal_bench",
          summary: "Bench 225",
          planningCategory: "strength",
          goalFamily: "strength",
          planningPriority: 1,
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
        },
      },
      {
        id: "goal_abs",
        active: true,
        priority: 2,
        resolvedGoal: {
          id: "resolved_goal_abs",
          summary: "Visible abs",
          planningCategory: "body_comp",
          goalFamily: "appearance",
          planningPriority: 2,
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [
            { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
            { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", kind: "proxy" },
          ],
          reviewCadence: "weekly",
        },
      },
    ],
    logs: {
      "2026-04-01": {
        performanceRecords: [
          {
            scope: "exercise",
            exercise: "Bench Press",
            actualWeight: 185,
            actualReps: 5,
            actualSets: 3,
            prescribedWeight: 185,
            prescribedReps: 5,
            prescribedSets: 3,
          },
        ],
        checkin: { status: "completed_as_planned" },
      },
      "2026-04-08": {
        performanceRecords: [
          {
            scope: "exercise",
            exercise: "Bench Press",
            actualWeight: 195,
            actualReps: 3,
            actualSets: 2,
            prescribedWeight: 195,
            prescribedReps: 3,
            prescribedSets: 2,
          },
        ],
        checkin: { status: "completed_as_planned" },
      },
    },
    bodyweights: [
      { date: "2026-04-02", w: 188.4 },
      { date: "2026-04-20", w: 185.8 },
    ],
  });

  assert.equal(model.goalDistanceItems.length, 2);
  const exactItem = model.goalDistanceItems.find((item) => item.kind === "exact_metric");
  const statusItem = model.goalDistanceItems.find((item) => item.kind === "status");
  assert.ok(exactItem);
  assert.match(exactItem.summary, /Bench 225/i);
  assert.match(exactItem.distanceLabel, /30 lb to goal/i);
  assert.equal(exactItem.currentLabel, "195 lb current");
  assert.ok(exactItem.progressRatio > 0);
  assert.ok(statusItem);
  assert.match(statusItem.summary, /Visible abs/i);
  assert.match(statusItem.detailLine, /review-based|appearance proxies|cadence/i);
});
