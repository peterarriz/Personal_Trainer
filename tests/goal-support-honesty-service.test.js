const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPeterAuditGoalFixture,
} = require("../src/services/audits/peter-audit-fixture.js");
const {
  buildGoalSupportHonestyAudit,
  classifyGoalSupportLevel,
  GOAL_SUPPORT_LEVELS,
} = require("../src/services/audits/goal-support-honesty-service.js");

test("Peter fixture keeps all four explicit goals visible with deterministic assumptions", () => {
  const fixture = buildPeterAuditGoalFixture();

  assert.equal(fixture.referenceDate, "2026-04-16");
  assert.equal(fixture.deadline, "2026-12-31");
  assert.equal(fixture.goals.length, 4);
  assert.equal(fixture.goals[0].resolvedGoal.summary, "Run a half marathon in 1:45:00");
  assert.equal(fixture.goals[1].resolvedGoal.summary, "Bench press 225 lb");
  assert.equal(fixture.goals[2].resolvedGoal.primaryMetric.key, "bodyweight_change");
  assert.equal(fixture.goals[3].resolvedGoal.goalFamily, "appearance");
});

test("support honesty audit keeps bench, half marathon, weight loss, and visible abs in the right support tiers", () => {
  const fixture = buildPeterAuditGoalFixture();
  const audit = buildGoalSupportHonestyAudit({ goals: fixture.goals });
  const bySummary = Object.fromEntries(audit.map((entry) => [entry.summary, entry]));

  assert.equal(bySummary["Run a half marathon in 1:45:00"].supportLevel, GOAL_SUPPORT_LEVELS.firstClass);
  assert.equal(bySummary["Bench press 225 lb"].supportLevel, GOAL_SUPPORT_LEVELS.firstClass);
  assert.equal(bySummary["Lose 15 lb"].supportLevel, GOAL_SUPPORT_LEVELS.firstClass);
  assert.equal(bySummary["Improve midsection definition by the target window"].supportLevel, GOAL_SUPPORT_LEVELS.loose);
  assert.match(bySummary["Improve midsection definition by the target window"].reason, /proxy-tracked|indirect/i);
});

test("appearance goals can never be classified as first-class support by the honesty audit", () => {
  const support = classifyGoalSupportLevel({
    summary: "Have visible abs by summer",
    goalFamily: "appearance",
    planningCategory: "body_comp",
    proxyMetrics: [{ key: "waist_circumference" }],
  });

  assert.equal(support.level, GOAL_SUPPORT_LEVELS.loose);
  assert.match(support.reason, /proxy|indirect/i);
});

test("body-fat percentage targets stay out of first-class support even if they live in the body-comp lane", () => {
  const support = classifyGoalSupportLevel({
    summary: "Get under 12% body fat",
    goalFamily: "body_comp",
    planningCategory: "body_comp",
    proxyMetrics: [{ key: "waist_circumference" }, { key: "bodyweight_trend" }],
  });

  assert.equal(support.level, GOAL_SUPPORT_LEVELS.loose);
  assert.match(support.reason, /body-fat|proxy|indirect/i);
});
