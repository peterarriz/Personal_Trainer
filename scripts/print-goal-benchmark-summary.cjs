const {
  GOAL_BENCHMARK_CASES,
} = require("../tests/benchmarks/goal-coverage-benchmark-data.js");
const {
  runGoalBenchmark,
} = require("../tests/benchmarks/goal-benchmark-helpers.js");

const pct = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;

const report = runGoalBenchmark(GOAL_BENCHMARK_CASES);
const { summary } = report;

console.log("Goal Benchmark Summary");
console.log("======================");
console.log(`Cases: ${summary.totalCases} total (${summary.mainstreamCases} mainstream, ${summary.edgeCases} edge/custom)`);
console.log(`Structured resolution rate: ${pct(summary.structuredResolutionRate)}`);
console.log(`Inappropriate custom fallback rate: ${pct(summary.inappropriateCustomFallbackRate)}`);
console.log(`Appropriate custom rate: ${pct(summary.appropriateCustomRate)}`);
console.log(`Average plan score: ${summary.averagePlanScore.toFixed(2)}`);
console.log("");
console.log("Family Summary");
Object.entries(summary.familySummary || {}).forEach(([family, stats]) => {
  console.log(`- ${family}: ${stats.planQualityPass}/${stats.total} plan-quality passes, ${stats.structured}/${stats.total} structured`);
});
console.log("");
console.log("Top Mainstream Failure Modes");
if ((summary.topFailureModes || []).length) {
  summary.topFailureModes.forEach((entry) => console.log(`- ${entry.code}: ${entry.count}`));
} else {
  console.log("- none");
}
console.log("");
console.log("Edge/Custom Failure Modes");
if ((summary.edgeFailureModes || []).length) {
  summary.edgeFailureModes.forEach((entry) => console.log(`- ${entry.code}: ${entry.count}`));
} else {
  console.log("- none");
}
console.log("");
console.log("Top Archetypes");
(summary.archetypeDistribution || []).slice(0, 10).forEach((entry) => {
  console.log(`- ${entry.archetypeId}: ${entry.count}`);
});
