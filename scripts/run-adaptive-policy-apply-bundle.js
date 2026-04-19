const fs = require("fs");
const path = require("path");

const {
  ADAPTIVE_POLICY_CONFIG_DIR,
  buildAdaptivePolicyBundleApplicationArtifacts,
} = require("../src/services/adaptive-policy-config-service.js");

const DEFAULT_BUNDLE_DIR = path.join(process.cwd(), "artifacts", "adaptive-policy-promotion");
const DEFAULT_TARGET_DIR = path.join(process.cwd(), ADAPTIVE_POLICY_CONFIG_DIR);

const getArgValue = (flag, fallback = "") => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
};

const hasFlag = (flag) => process.argv.includes(flag);

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const readBundle = (bundleDir) => {
  const absoluteDir = path.resolve(process.cwd(), bundleDir);
  const summaryPath = path.join(absoluteDir, "promotion-results.json");
  const evidencePath = path.join(absoluteDir, "adaptive-policy-evidence.json");
  const shadowConfigPath = path.join(absoluteDir, "adaptive-learning-config.shadow.json");
  const activeConfigPath = path.join(absoluteDir, "adaptive-learning-config.active.json");
  [summaryPath, evidencePath, shadowConfigPath, activeConfigPath].forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Adaptive policy bundle is missing required artifact: ${filePath}`);
    }
  });
  return {
    sourceDir: absoluteDir,
    bundle: {
      ...readJson(summaryPath),
      evidenceSnapshot: readJson(evidencePath),
      shadowConfig: readJson(shadowConfigPath),
      activeConfig: readJson(activeConfigPath),
    },
  };
};

const writeTextFile = (filePath, content) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ""), "utf8");
};

function main() {
  const bundleDir = getArgValue("--bundle", DEFAULT_BUNDLE_DIR);
  const targetDir = path.resolve(process.cwd(), getArgValue("--target", DEFAULT_TARGET_DIR));
  const applyMode = sanitizeText(getArgValue("--mode", "shadow"), 40).toLowerCase() || "shadow";
  const sourceLabel = sanitizeText(getArgValue("--source-label", ""), 160);
  const dryRun = hasFlag("--dry-run");

  const { sourceDir, bundle } = readBundle(bundleDir);
  const artifacts = buildAdaptivePolicyBundleApplicationArtifacts({
    bundle,
    sourceDir,
    sourceLabel,
    applyMode,
    appliedAt: Date.now(),
  });

  if (!dryRun) {
    ensureDir(targetDir);
    Object.entries(artifacts.files).forEach(([fileName, content]) => {
      writeTextFile(path.join(targetDir, fileName), content);
    });
  }

  console.log(`Adaptive policy bundle ${dryRun ? "preview" : "apply"} complete.`);
  console.log(`Apply mode: ${artifacts.manifest.applyMode}`);
  console.log(`Promoted decision points: ${artifacts.manifest.promotedDecisionPointIds.length}`);
  console.log(`Target dir: ${targetDir}`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
