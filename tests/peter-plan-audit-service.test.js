const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPeterTwelveWeekPlanAudit,
} = require("../src/services/audits/peter-plan-audit-service.js");

test("Peter 12-week audit exposes the current planner's main contradictions instead of pretending they are fine", () => {
  const audit = buildPeterTwelveWeekPlanAudit();
  const riskKeys = audit.riskFlags.map((flag) => flag.key);

  assert.equal(audit.weeks.length, 12);
  assert.deepEqual(audit.summary.deloadWeeks, [4, 8, 12]);
  assert.ok(audit.summary.weeklyRunFrequency.every((count) => count === 3));
  assert.ok(audit.summary.nutritionDayTypes.includes("run_long"));
  assert.ok(audit.summary.nutritionDayTypes.includes("run_quality"));
  assert.ok(audit.summary.nutritionDayTypes.includes("strength_support"));
  assert.ok(riskKeys.includes("long_run_progression_flat"));
  assert.ok(riskKeys.includes("bench_specificity_missing"));
  assert.ok(riskKeys.includes("strength_exposure_sparse"));
  assert.ok(riskKeys.includes("body_comp_lane_not_explicit"));
});
