const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalTimingPresentation,
  buildVisiblePlanningHorizonLabel,
  OPEN_ENDED_TIMING_VALUE,
  resolveGoalTimingShape,
} = require("../src/services/goal-timing-service.js");

test("visible planning horizon label defaults to the next 3 months", () => {
  assert.equal(buildVisiblePlanningHorizonLabel(12), "next 3 months");
  assert.equal(buildVisiblePlanningHorizonLabel(16), "next 4 months");
});

test("goal timing presentation distinguishes exact dates, horizons, and open-ended goals", () => {
  const exactDate = buildGoalTimingPresentation({
    targetDate: "2026-09-01",
  }, {
    now: "2026-04-14T12:00:00.000Z",
  });
  const targetHorizon = buildGoalTimingPresentation({
    targetHorizonWeeks: 20,
  });
  const openEnded = buildGoalTimingPresentation({});

  assert.equal(exactDate.label, "Target date: Sep 1, 2026");
  assert.match(exactDate.detail, /next 3 months show the next phase/i);
  assert.equal(targetHorizon.label, "Target horizon: about 20 weeks");
  assert.match(targetHorizon.detail, /longer push/i);
  assert.equal(openEnded.label, "Open-ended");
  assert.match(openEnded.detail, /next phase, not a finish line/i);
});

test("open-ended timing shape stays first-class in normalization", () => {
  const timing = resolveGoalTimingShape({
    targetDate: OPEN_ENDED_TIMING_VALUE,
    targetHorizonWeeks: null,
  });

  assert.equal(timing.mode, "open_ended");
  assert.equal(timing.openEnded, true);
});
