const fs = require("fs");
const path = require("path");

const {
  buildAdaptivePolicyShadowEvaluationFixtureDataset,
} = require("../src/services/adaptive-policy-shadow-evaluation-fixture-service.js");
const {
  buildAdaptivePolicyShadowEvaluation,
} = require("../src/services/adaptive-policy-shadow-evaluation-service.js");
const {
  buildAdaptiveLaunchReadinessArtifacts,
  buildAdaptiveLaunchReadinessCheck,
} = require("../src/services/adaptive-policy-operator-service.js");

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "artifacts", "adaptive-launch-readiness");
const DEFAULT_SHADOW_DIR = path.join(process.cwd(), "artifacts", "adaptive-policy-shadow-evaluation");

const getArgValue = (flag, fallback = "") => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const hasFlag = (flag) => process.argv.includes(flag);

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const writeTextFile = (filePath, content) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ""), "utf8");
};

const loadJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const loadShadowEvaluationResults = (targetPath) => {
  const absolutePath = path.resolve(process.cwd(), targetPath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    return loadJsonFile(absolutePath);
  }
  const summary = loadJsonFile(path.join(absolutePath, "results.json"));
  return {
    ...summary,
    promotionChecklist: loadJsonFile(path.join(absolutePath, "promotion-checklist.json")),
    harmfulCohorts: loadJsonFile(path.join(absolutePath, "harmful-cohorts.json")),
    underpoweredCohorts: loadJsonFile(path.join(absolutePath, "underpowered-cohorts.json")),
  };
};

const fixtureMode = hasFlag("--fixture");
const shadowPath = getArgValue("--shadow", DEFAULT_SHADOW_DIR);
const outputDir = path.resolve(process.cwd(), getArgValue("--output", DEFAULT_OUTPUT_DIR));
const minShadowRows = Number(getArgValue("--min-shadow-rows", "40")) || 40;
const minHoldoutRows = Number(getArgValue("--min-holdout-rows", "12")) || 12;

let shadowEvaluationResults = null;

if (fixtureMode) {
  const fixture = buildAdaptivePolicyShadowEvaluationFixtureDataset();
  shadowEvaluationResults = buildAdaptivePolicyShadowEvaluation({
    sources: fixture.sources,
    evaluationLabel: "fixture_adaptive_launch_readiness",
  });
} else {
  shadowEvaluationResults = loadShadowEvaluationResults(shadowPath);
}

const results = buildAdaptiveLaunchReadinessCheck({
  shadowEvaluationResults,
  minShadowRows,
  minHoldoutRows,
});
const artifacts = buildAdaptiveLaunchReadinessArtifacts({ results });

ensureDir(outputDir);
writeTextFile(path.join(outputDir, "results.json"), artifacts.resultsJson);
writeTextFile(path.join(outputDir, "launch-readiness-report.md"), artifacts.launchReadinessReportMarkdown);

console.log("Adaptive launch readiness check complete.");
console.log(`Overall status: ${results.summary.overallStatus}`);
console.log(`Activation recommendation: ${results.summary.activationRecommendation}`);
console.log(`Shadow rows: ${results.summary.decisionRowCount}`);
console.log(`Harmful cohorts: ${results.summary.harmfulCohortCount}`);
console.log(`Artifacts written to: ${outputDir}`);
