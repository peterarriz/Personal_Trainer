const fs = require("fs");
const path = require("path");

const {
  buildAdaptiveLearningAnalysisFixtureDataset,
} = require("../src/services/adaptive-learning-analysis-fixture-service.js");
const {
  runAdaptiveLearningAnalysis,
} = require("../src/services/adaptive-learning-analysis-service.js");
const {
  buildAdaptivePolicyShadowEvaluationFixtureDataset,
} = require("../src/services/adaptive-policy-shadow-evaluation-fixture-service.js");
const {
  buildAdaptivePolicyShadowEvaluation,
} = require("../src/services/adaptive-policy-shadow-evaluation-service.js");
const {
  buildAdaptivePolicyPromotionBundle,
  buildAdaptivePromotionArtifacts,
} = require("../src/services/adaptive-policy-operator-service.js");

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "artifacts", "adaptive-policy-promotion");
const DEFAULT_ANALYSIS_DIR = path.join(process.cwd(), "artifacts", "adaptive-learning-analysis");
const DEFAULT_SHADOW_DIR = path.join(process.cwd(), "artifacts", "adaptive-policy-shadow-evaluation");

const getArgValue = (flag, fallback = "") => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const getArgValues = (flag) => process.argv.reduce((acc, value, index) => {
  if (value !== flag) return acc;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) acc.push(next);
  return acc;
}, []);

const hasFlag = (flag) => process.argv.includes(flag);

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const writeTextFile = (filePath, content) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ""), "utf8");
};

const loadJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const loadAnalysisResults = (targetPath) => {
  const absolutePath = path.resolve(process.cwd(), targetPath);
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    return loadJsonFile(path.join(absolutePath, "results.json"));
  }
  return loadJsonFile(absolutePath);
};

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
const includeMediumConfidence = hasFlag("--include-medium-confidence");
const analysisPath = getArgValue("--analysis", DEFAULT_ANALYSIS_DIR);
const shadowPath = getArgValue("--shadow", DEFAULT_SHADOW_DIR);
const outputDir = path.resolve(process.cwd(), getArgValue("--output", DEFAULT_OUTPUT_DIR));
const requestedDecisionPointIds = getArgValues("--decision-point");

let analysisResults = null;
let shadowEvaluationResults = null;

if (fixtureMode) {
  const analysisFixture = buildAdaptiveLearningAnalysisFixtureDataset();
  const shadowFixture = buildAdaptivePolicyShadowEvaluationFixtureDataset();
  analysisResults = runAdaptiveLearningAnalysis({
    sources: analysisFixture.sources,
    analysisLabel: "fixture_adaptive_policy_promotion_analysis",
  });
  shadowEvaluationResults = buildAdaptivePolicyShadowEvaluation({
    sources: shadowFixture.sources,
    evaluationLabel: "fixture_adaptive_policy_promotion_shadow",
  });
} else {
  analysisResults = loadAnalysisResults(analysisPath);
  shadowEvaluationResults = loadShadowEvaluationResults(shadowPath);
}

const bundle = buildAdaptivePolicyPromotionBundle({
  analysisResults,
  shadowEvaluationResults,
  decisionPointIds: requestedDecisionPointIds,
  includeMediumConfidence,
});
const artifacts = buildAdaptivePromotionArtifacts({ bundle });

ensureDir(outputDir);
writeTextFile(path.join(outputDir, "promotion-results.json"), artifacts.promotionResultsJson);
writeTextFile(path.join(outputDir, "adaptive-policy-evidence.json"), artifacts.adaptivePolicyEvidenceJson);
writeTextFile(path.join(outputDir, "adaptive-learning-config.shadow.json"), artifacts.adaptiveLearningShadowConfigJson);
writeTextFile(path.join(outputDir, "adaptive-learning-config.active.json"), artifacts.adaptiveLearningActiveConfigJson);
writeTextFile(path.join(outputDir, "promotion-report.md"), artifacts.promotionReportMarkdown);

console.log("Adaptive policy promotion bundle complete.");
console.log(`Eligible decision points: ${bundle.summary.eligibleDecisionPointCount}`);
console.log(`Promoted decision points: ${bundle.summary.promotedDecisionPointCount}`);
console.log(`Blocked decision points: ${bundle.summary.blockedDecisionPointCount}`);
console.log(`Recommendation: ${bundle.summary.recommendation}`);
console.log(`Artifacts written to: ${outputDir}`);
