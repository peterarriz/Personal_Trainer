const { runSyntheticAthleteLab } = require("../src/services/synthetic-athlete-lab/runner.js");

const report = runSyntheticAthleteLab();

console.log(JSON.stringify({
  summary: report.summary,
  globalChecks: report.globalChecks,
  topClusters: report.clusters.slice(0, 8),
  subsystemHeatmap: report.subsystemHeatmap,
}, null, 2));
