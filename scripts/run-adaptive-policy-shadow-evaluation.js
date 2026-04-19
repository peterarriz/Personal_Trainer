const fs = require("fs");
const path = require("path");

const {
  buildAdaptivePolicyShadowEvaluationFixtureDataset,
} = require("../src/services/adaptive-policy-shadow-evaluation-fixture-service.js");
const {
  buildAdaptivePolicyShadowEvaluation,
} = require("../src/services/adaptive-policy-shadow-evaluation-service.js");
const {
  buildAdaptivePolicyShadowEvaluationArtifacts,
} = require("../src/services/adaptive-policy-shadow-evaluation-reporting.js");

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "artifacts", "adaptive-policy-shadow-evaluation");

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

const loadSourcesFromPath = (targetPath) => {
  const absolutePath = path.resolve(process.cwd(), targetPath);
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
      const childPath = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) return loadSourcesFromPath(childPath);
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) return [];
      return [loadJsonFile(childPath)];
    });
  }
  return [loadJsonFile(absolutePath)];
};

const fixtureMode = hasFlag("--fixture");
const useFixturePolicy = hasFlag("--use-fixture-policy");
const inputPath = getArgValue("--input", "");
const configPath = getArgValue("--config", "");
const evidencePath = getArgValue("--evidence", "");
const outputDir = path.resolve(process.cwd(), getArgValue("--output", DEFAULT_OUTPUT_DIR));
const evaluationLabel = getArgValue("--label", fixtureMode ? "fixture_adaptive_policy_shadow_evaluation" : "adaptive_policy_shadow_evaluation");
const holdoutPercentage = Number(getArgValue("--holdout-percentage", "20")) || 20;
const minCohortSampleSize = Number(getArgValue("--min-cohort-sample-size", "5")) || 5;
const minRows = Number(getArgValue("--min-rows", "20")) || 20;
const minHoldoutRows = Number(getArgValue("--min-holdout-rows", "8")) || 8;

let sources = [];
let fixtureMetadata = null;
let adaptivePolicyConfig = null;
let adaptivePolicyEvidence = null;

if (fixtureMode || !inputPath) {
  const fixture = buildAdaptivePolicyShadowEvaluationFixtureDataset();
  sources = fixture.sources;
  fixtureMetadata = fixture;
  if (useFixturePolicy) {
    adaptivePolicyConfig = fixture.adaptivePolicyConfig;
    adaptivePolicyEvidence = fixture.adaptivePolicyEvidence;
  }
} else {
  sources = loadSourcesFromPath(inputPath);
}

if (configPath) adaptivePolicyConfig = loadJsonFile(path.resolve(process.cwd(), configPath));
if (evidencePath) adaptivePolicyEvidence = loadJsonFile(path.resolve(process.cwd(), evidencePath));

const results = buildAdaptivePolicyShadowEvaluation({
  sources,
  adaptivePolicyConfig,
  adaptivePolicyEvidence,
  holdoutPercentage,
  minCohortSampleSize,
  evaluationLabel,
  promotionThresholds: {
    minRows,
    minHoldoutRows,
  },
});

const artifacts = buildAdaptivePolicyShadowEvaluationArtifacts({ results });

ensureDir(outputDir);
writeTextFile(path.join(outputDir, "results.json"), artifacts.resultsJson);
writeTextFile(path.join(outputDir, "decision-rows.json"), artifacts.decisionRowsJson);
writeTextFile(path.join(outputDir, "decision-point-summaries.json"), artifacts.decisionPointSummariesJson);
writeTextFile(path.join(outputDir, "cohort-summaries.json"), artifacts.cohortSummariesJson);
writeTextFile(path.join(outputDir, "hybrid-decision-point-summaries.json"), artifacts.hybridDecisionPointSummariesJson);
writeTextFile(path.join(outputDir, "hybrid-cohort-summaries.json"), artifacts.hybridCohortSummariesJson);
writeTextFile(path.join(outputDir, "hybrid-outcome-label-summaries.json"), artifacts.hybridOutcomeLabelSummariesJson);
writeTextFile(path.join(outputDir, "harmful-cohorts.json"), artifacts.harmfulCohortsJson);
writeTextFile(path.join(outputDir, "underpowered-cohorts.json"), artifacts.underpoweredCohortsJson);
writeTextFile(path.join(outputDir, "confidence-band-summaries.json"), artifacts.confidenceBandSummariesJson);
writeTextFile(path.join(outputDir, "promotion-checklist.json"), artifacts.promotionChecklistJson);
writeTextFile(path.join(outputDir, "shadow-evaluation-report.md"), artifacts.shadowEvaluationReportMarkdown);
if (fixtureMetadata) {
  writeTextFile(path.join(outputDir, "fixture-metadata.json"), JSON.stringify({
    actorCount: fixtureMetadata.actorCount,
    scenarios: fixtureMetadata.scenarios,
    replayPolicyIncluded: Boolean(useFixturePolicy),
  }, null, 2));
}

console.log(`Adaptive policy shadow evaluation complete: ${results.summary.evaluationLabel}`);
console.log(`Replay mode: ${results.replayMode}`);
console.log(`Shadow decision rows: ${results.summary.decisionRowCount}`);
console.log(`Agreement rate: ${Math.round((results.summary.agreementRate || 0) * 100)}%`);
console.log(`Divergence rate: ${Math.round((results.summary.divergenceRate || 0) * 100)}%`);
console.log(`Artifacts written to: ${outputDir}`);
