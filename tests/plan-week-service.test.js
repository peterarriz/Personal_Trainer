const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveProgramDisplayHorizon } = require("../src/services/plan-week-service.js");

const buildRollingRow = (absoluteWeek) => ({
  kind: "plan",
  absoluteWeek,
  weekLabel: `Week ${absoluteWeek}`,
  template: {
    phase: absoluteWeek <= 8 ? "BASE" : "BUILDING",
    label: `Template ${absoluteWeek}`,
    mon: { t: "Easy", d: "30 min" },
    thu: { t: "Tempo", d: "20 min" },
    fri: { t: "Easy", d: "25 min" },
    sat: { t: "Long", d: `${40 + absoluteWeek} min` },
    str: absoluteWeek % 2 === 0 ? "B" : "A",
  },
});

test("resolveProgramDisplayHorizon extends a shorter canonical horizon up to the requested preview length", () => {
  const rollingHorizon = Array.from({ length: 12 }, (_, index) => buildRollingRow(index + 1));

  const rows = resolveProgramDisplayHorizon({
    rollingHorizon,
    currentWeek: 4,
    currentPlanWeek: null,
    weekTemplates: rollingHorizon.map((row) => row.template),
    goals: [{ id: "goal_1", name: "Run a 1:45 half marathon", category: "running", active: true, priority: 1 }],
    planComposer: {},
    weeklyCheckins: {},
    previewLength: 15,
  });

  assert.equal(rows.length, 15);
  assert.equal(rows[0].absoluteWeek, 1);
  assert.equal(rows[11].absoluteWeek, 12);
  assert.equal(rows[12].absoluteWeek, 13);
  assert.equal(rows[14].absoluteWeek, 15);
  assert.match(rows[14].weekLabel || "", /week 15/i);
});

test("resolveProgramDisplayHorizon replaces a stale current-week horizon row with the live plan week", () => {
  const rollingHorizon = Array.from({ length: 4 }, (_, index) => buildRollingRow(index + 1));
  const liveCurrentPlanWeek = {
    label: "Strength block - Week 2",
    sessionsByDay: {
      1: { type: "strength+prehab", label: "Strength A", strSess: "A", strengthDose: "45 min strength" },
      3: { type: "conditioning", label: "Supportive Conditioning", fallback: "20-30 min bike or incline walk" },
      5: { type: "strength+prehab", label: "Strength B", strSess: "B", strengthDose: "40 min strength" },
    },
  };

  const rows = resolveProgramDisplayHorizon({
    rollingHorizon,
    currentWeek: 2,
    currentPlanWeek: liveCurrentPlanWeek,
    weekTemplates: rollingHorizon.map((row) => row.template),
    goals: [{ id: "goal_1", name: "Bench 225", category: "strength", active: true, priority: 1 }],
    planComposer: {},
    weeklyCheckins: {},
    previewLength: 4,
  });

  assert.equal(rows[1].absoluteWeek, 2);
  assert.equal(rows[1].weekLabel, "Strength block - Week 2");
  assert.equal(rows[1].planWeek, liveCurrentPlanWeek);
  assert.equal(rows[1].planWeek?.sessionsByDay?.[1]?.type, "strength+prehab");
});
