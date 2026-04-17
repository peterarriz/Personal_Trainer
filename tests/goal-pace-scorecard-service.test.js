const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPeterAuditGoalFixture,
} = require("../src/services/audits/peter-audit-fixture.js");
const {
  buildPeterTwelveWeekPlanAudit,
} = require("../src/services/audits/peter-plan-audit-service.js");
const {
  buildGoalPaceScorecard,
  GOAL_PACE_CONFIDENCE,
  GOAL_PACE_VERDICTS,
} = require("../src/services/audits/goal-pace-scorecard-service.js");

const buildAnchorsFromFixture = (fixture) => ({
  benchTopSet: fixture.assumptions.anchors.benchTopSet,
  running: {
    weeklyFrequency: fixture.assumptions.anchors.running.weeklyFrequency,
    longestRecentRunMiles: fixture.assumptions.anchors.running.longestRecentRunMiles,
    recentPaceText: fixture.assumptions.anchors.running.recentPaceText,
  },
  bodyweight: fixture.assumptions.anchors.bodyweight,
  waist: fixture.assumptions.anchors.waist,
});

test("Peter fixture scorecard stays honest: bench, half marathon, and weight are paceable, visible abs stays unknown", () => {
  const fixture = buildPeterAuditGoalFixture();
  const scorecard = buildGoalPaceScorecard({
    goals: fixture.goals,
    anchors: buildAnchorsFromFixture(fixture),
    now: fixture.referenceDate,
    deadline: fixture.deadline,
  });
  const bySummary = Object.fromEntries(scorecard.map((entry) => [entry.summary, entry]));

  assert.equal(bySummary["Run a half marathon in 1:45:00"].verdict, GOAL_PACE_VERDICTS.onPace);
  assert.equal(bySummary["Bench press 225 lb"].verdict, GOAL_PACE_VERDICTS.onPace);
  assert.equal(bySummary["Lose 15 lb"].verdict, GOAL_PACE_VERDICTS.onPace);
  assert.equal(bySummary["Improve midsection definition by the target window"].verdict, GOAL_PACE_VERDICTS.unknown);
  assert.match(bySummary["Improve midsection definition by the target window"].reason, /cannot deterministically prove|visual outcome/i);
});

test("bench verdict turns off-pace when the current top set is too far away", () => {
  const fixture = buildPeterAuditGoalFixture();
  const scorecard = buildGoalPaceScorecard({
    goals: fixture.goals,
    anchors: {
      ...buildAnchorsFromFixture(fixture),
      benchTopSet: { exercise: "Bench Press", weight: 135, reps: 5 },
    },
    now: fixture.referenceDate,
    deadline: fixture.deadline,
  });
  const benchVerdict = scorecard.find((entry) => entry.summary === "Bench press 225 lb");

  assert.equal(benchVerdict.verdict, GOAL_PACE_VERDICTS.offPace);
  assert.match(benchVerdict.reason, /steep rate|concurrent/i);
});

test("half-marathon verdict turns off-pace when pace and long-run anchors are too soft", () => {
  const fixture = buildPeterAuditGoalFixture();
  const scorecard = buildGoalPaceScorecard({
    goals: fixture.goals,
    anchors: {
      ...buildAnchorsFromFixture(fixture),
      running: {
        weeklyFrequency: 2,
        longestRecentRunMiles: 3,
        recentPaceText: "10:30",
      },
    },
    now: fixture.referenceDate,
    deadline: fixture.deadline,
  });
  const runVerdict = scorecard.find((entry) => entry.summary === "Run a half marathon in 1:45:00");

  assert.equal(runVerdict.verdict, GOAL_PACE_VERDICTS.offPace);
  assert.match(runVerdict.majorLimitingFactor, /long-run anchor|run frequency|pace/i);
});

test("numeric weight-loss verdict turns off-pace when the deadline forces an aggressive weekly loss rate", () => {
  const scorecard = buildGoalPaceScorecard({
    goals: [{
      id: "goal_weight",
      resolvedGoal: {
        summary: "Lose 15 lb",
        goalFamily: "body_comp",
        primaryMetric: { key: "bodyweight_change", targetValue: "-15" },
      },
    }],
    anchors: {
      bodyweight: { value: 160 },
    },
    now: "2026-10-15",
    deadline: "2026-12-01",
  });

  assert.equal(scorecard[0].verdict, GOAL_PACE_VERDICTS.offPace);
  assert.equal(scorecard[0].confidence, GOAL_PACE_CONFIDENCE.medium);
});

test("scorecard returns unknown when required anchors are missing", () => {
  const fixture = buildPeterAuditGoalFixture();
  const scorecard = buildGoalPaceScorecard({
    goals: fixture.goals,
    anchors: {},
    now: fixture.referenceDate,
    deadline: fixture.deadline,
  });
  const bySummary = Object.fromEntries(scorecard.map((entry) => [entry.summary, entry]));

  assert.equal(bySummary["Run a half marathon in 1:45:00"].verdict, GOAL_PACE_VERDICTS.unknown);
  assert.equal(bySummary["Bench press 225 lb"].verdict, GOAL_PACE_VERDICTS.unknown);
  assert.equal(bySummary["Lose 15 lb"].verdict, GOAL_PACE_VERDICTS.unknown);
});

test("plan-aware scorecard downgrades optimistic anchor-only verdicts when the live 12-week block contradicts the required work", () => {
  const fixture = buildPeterAuditGoalFixture();
  const planAudit = buildPeterTwelveWeekPlanAudit();
  const scorecard = buildGoalPaceScorecard({
    goals: fixture.goals,
    anchors: buildAnchorsFromFixture(fixture),
    now: fixture.referenceDate,
    deadline: fixture.deadline,
    planAudit,
  });
  const bySummary = Object.fromEntries(scorecard.map((entry) => [entry.summary, entry]));

  assert.equal(bySummary["Run a half marathon in 1:45:00"].verdict, GOAL_PACE_VERDICTS.offPace);
  assert.equal(bySummary["Run a half marathon in 1:45:00"].confidence, GOAL_PACE_CONFIDENCE.medium);
  assert.match(bySummary["Run a half marathon in 1:45:00"].reason, /45-60 min|long run/i);

  assert.equal(bySummary["Bench press 225 lb"].verdict, GOAL_PACE_VERDICTS.offPace);
  assert.equal(bySummary["Bench press 225 lb"].confidence, GOAL_PACE_CONFIDENCE.medium);
  assert.match(bySummary["Bench press 225 lb"].reason, /bench work|bench-specific|run-led/i);

  assert.equal(bySummary["Lose 15 lb"].verdict, GOAL_PACE_VERDICTS.onPace);
  assert.equal(bySummary["Lose 15 lb"].confidence, GOAL_PACE_CONFIDENCE.low);
  assert.match(bySummary["Lose 15 lb"].reason, /running-led|lightly operationalizes the cut/i);

  assert.equal(bySummary["Improve midsection definition by the target window"].verdict, GOAL_PACE_VERDICTS.unknown);
  assert.equal(bySummary["Improve midsection definition by the target window"].confidence, GOAL_PACE_CONFIDENCE.low);
  assert.match(bySummary["Improve midsection definition by the target window"].reason, /cannot deterministically prove|does not operationalize a distinct appearance lane/i);
});
