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
