const fs = require("fs");
const path = require("path");

const {
  buildAdaptiveLearningAnalysisFixtureDataset,
} = require("../src/services/adaptive-learning-analysis-fixture-service.js");
const {
  runAdaptiveLearningAnalysis,
} = require("../src/services/adaptive-learning-analysis-service.js");

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "artifacts", "adaptive-learning-analysis");

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
const inputPath = getArgValue("--input", "");
const outputDir = path.resolve(process.cwd(), getArgValue("--output", DEFAULT_OUTPUT_DIR));
const analysisLabel = getArgValue("--label", fixtureMode ? "fixture_adaptive_learning_analysis" : "offline_adaptive_learning_analysis");
const minSampleSize = Number(getArgValue("--min-sample-size", "4")) || 4;
const minPolicySampleSize = Number(getArgValue("--min-policy-sample-size", "6")) || 6;

let sources = [];
let fixtureMetadata = null;

if (fixtureMode || !inputPath) {
  const fixture = buildAdaptiveLearningAnalysisFixtureDataset();
  sources = fixture.sources;
  fixtureMetadata = fixture;
} else {
  sources = loadSourcesFromPath(inputPath);
}

const results = runAdaptiveLearningAnalysis({
  sources,
  minSampleSize,
  minPolicySampleSize,
  analysisLabel,
});

ensureDir(outputDir);
writeTextFile(path.join(outputDir, "normalized-events.json"), results.artifacts.normalizedEventsJson);
writeTextFile(path.join(outputDir, "analysis-rows.json"), results.artifacts.analysisRowsJson);
writeTextFile(path.join(outputDir, "results.json"), results.artifacts.resultsJson);
writeTextFile(path.join(outputDir, "candidate-policy-suggestions.json"), results.artifacts.candidatePolicySuggestionsJson);
writeTextFile(path.join(outputDir, "failure-clusters.json"), results.artifacts.failureClustersJson);
writeTextFile(path.join(outputDir, "cohort-summaries.json"), results.artifacts.cohortSummariesJson);
writeTextFile(path.join(outputDir, "analysis-report.md"), results.artifacts.analysisReportMarkdown);
if (fixtureMetadata) {
  writeTextFile(path.join(outputDir, "fixture-metadata.json"), JSON.stringify(fixtureMetadata, null, 2));
}

console.log(`Adaptive learning analysis complete: ${analysisLabel}`);
console.log(`Actors analyzed: ${results.summary.actorCount}`);
console.log(`Normalized events: ${results.summary.eventCount}`);
console.log(`Recommendation rows: ${results.summary.recommendationRowCount}`);
console.log(`High-confidence candidate rules: ${results.summary.highConfidenceRuleCount}`);
console.log(`Artifacts written to: ${outputDir}`);
