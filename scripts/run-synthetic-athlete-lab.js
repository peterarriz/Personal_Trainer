const { assertSyntheticLabSafeEnvironment } = require("../src/services/synthetic-athlete-lab/env-guard.js");
const { runSyntheticAthleteLab } = require("../src/services/synthetic-athlete-lab/runner.js");

assertSyntheticLabSafeEnvironment(process.env);

const report = runSyntheticAthleteLab();

console.log(JSON.stringify({
  summary: report.summary,
  globalChecks: report.globalChecks,
  topClusters: report.clusters.slice(0, 8),
  subsystemHeatmap: report.subsystemHeatmap,
}, null, 2));
