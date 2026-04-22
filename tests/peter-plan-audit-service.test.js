const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPeterTwelveWeekPlanAudit,
} = require("../src/services/audits/peter-plan-audit-service.js");

test("Peter 12-week audit proves the upgraded hybrid planner fixed the headline contradictions and leaves only explicit residual tradeoffs", () => {
  const audit = buildPeterTwelveWeekPlanAudit();
  const riskKeys = audit.riskFlags.map((flag) => flag.key);

  assert.equal(audit.weeks.length, 12);
  assert.deepEqual(audit.summary.deloadWeeks, [4, 8, 12]);
  assert.ok(audit.summary.weeklyRunFrequency.every((count) => count === 3));
  assert.ok(audit.summary.longRunDetails.some((detail) => /8|9/.test(detail)));
  assert.ok(audit.summary.nutritionDayTypes.includes("run_long"));
  assert.ok(audit.summary.nutritionDayTypes.includes("run_quality"));
  assert.ok(audit.summary.nutritionDayTypes.includes("hybrid_support"));
  assert.ok(audit.summary.explicitBenchExposureCount >= 12);
  assert.ok(!riskKeys.includes("long_run_progression_flat"));
  assert.ok(!riskKeys.includes("bench_specificity_missing"));
  assert.ok(riskKeys.includes("strength_exposure_sparse"));
  assert.ok(riskKeys.includes("body_comp_lane_not_explicit"));
});
