const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_BENCHMARK_CASES,
} = require("./goal-coverage-benchmark-data.js");
const {
  runGoalBenchmark,
} = require("./goal-benchmark-helpers.js");

const report = runGoalBenchmark(GOAL_BENCHMARK_CASES);

const summarizeFailures = (entries = [], limit = 6) => JSON.stringify(
  entries.slice(0, limit).map((entry) => ({
    caseId: entry.caseId,
    resolutionMode: entry.resolutionMode,
    archetype: entry.primary?.planArchetypeId || "",
    failures: entry.failures.map((failure) => failure.code),
  })),
  null,
  2
);

test("goal benchmark corpus stays broad, mixed, and adversarial", () => {
  const flows = new Set(GOAL_BENCHMARK_CASES.map((caseDef) => caseDef.flow));
  const edgeCases = GOAL_BENCHMARK_CASES.filter((caseDef) => caseDef.shouldRequireCustom);
  const mainstreamCases = GOAL_BENCHMARK_CASES.filter((caseDef) => !caseDef.shouldRequireCustom);
  const plainEnglishCases = GOAL_BENCHMARK_CASES.filter((caseDef) => /\s/.test(caseDef.rawGoalText || ""));

  assert.ok(GOAL_BENCHMARK_CASES.length >= 500);
  assert.ok(mainstreamCases.length >= 500);
  assert.ok(edgeCases.length >= 6);
  assert.ok(plainEnglishCases.length >= 200);
  assert.deepEqual([...flows].sort(), ["goal_switch", "structured_intake"]);
});

test("mainstream benchmark cases stay on structured paths without benchmark failures", () => {
  const mainstream = report.evaluations.filter((entry) => !entry.shouldRequireCustom);
  const failures = mainstream.filter((entry) => entry.failures.length);

  assert.equal(report.summary.structuredResolutionRate, 1);
  assert.equal(report.summary.inappropriateCustomFallbackRate, 0);
  assert.equal(report.summary.topFailureModes.length, 0);
  assert.equal(failures.length, 0, summarizeFailures(failures));
});

test("edge custom cases stay out of flagship structured resolution", () => {
  const edge = report.evaluations.filter((entry) => entry.shouldRequireCustom);
  const structuredEdges = edge.filter((entry) => ["structured_archetype", "structured_intent_only"].includes(entry.resolutionMode));

  assert.ok(edge.length >= 6);
  assert.equal(report.summary.appropriateCustomRate, 1);
  assert.equal(structuredEdges.length, 0, summarizeFailures(structuredEdges));
});
