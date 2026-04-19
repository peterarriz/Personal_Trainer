const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadLocalEnv } = require("./_lib/load-local-env.cjs");

const { ADAPTIVE_POLICY_CONFIG_DIR } = require("../src/services/adaptive-policy-config-service.js");

loadLocalEnv();

const DEFAULT_OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "adaptive-policy-staging-evaluation");
const DEFAULT_CONFIG_DIR = path.join(process.cwd(), ADAPTIVE_POLICY_CONFIG_DIR);

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

const writeText = (filePath, value) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value || ""), "utf8");
};

const writeJson = (filePath, value) => {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const timestampLabel = () => {
  const now = new Date();
  const parts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const getEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

const ensureStagingEnv = () => {
  const missing = [];
  if (!getEnv("SUPABASE_URL", "VITE_SUPABASE_URL")) missing.push("SUPABASE_URL");
  if (!getEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_KEY")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length) {
    throw new Error(
      `Adaptive staging evaluation needs ${missing.join(", ")} in the environment.`
    );
  }
};

const runNodeScript = (scriptPath, args = []) => {
  const result = spawnSync(
    process.execPath,
    ["-r", "sucrase/register", scriptPath, ...args],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    }
  );
  if (result.status !== 0) {
    throw new Error(`Command failed: ${[scriptPath, ...args].join(" ")}`);
  }
};

function main() {
  const outputRootArg = getArgValue("--output-root", DEFAULT_OUTPUT_ROOT);
  const outputRoot = path.resolve(process.cwd(), outputRootArg, timestampLabel());
  const source = sanitizeText(getArgValue("--source", "auto"), 40).toLowerCase() || "auto";
  const userId = sanitizeText(getArgValue("--user-id", ""), 120);
  const label = sanitizeText(getArgValue("--label", "adaptive_policy_staging_evaluation"), 160);
  const configPath = path.resolve(
    process.cwd(),
    getArgValue("--config", path.join(DEFAULT_CONFIG_DIR, "adaptive-learning-config.applied.json"))
  );
  const evidencePath = path.resolve(
    process.cwd(),
    getArgValue("--evidence", path.join(DEFAULT_CONFIG_DIR, "adaptive-policy-evidence.json"))
  );
  const skipAnalysis = hasFlag("--skip-analysis");
  const skipPolicyReplay = hasFlag("--skip-policy-replay");

  ensureStagingEnv();
  ensureDir(outputRoot);

  const exportDir = path.join(outputRoot, "export");
  const analysisDir = path.join(outputRoot, "analysis");
  const shadowDir = path.join(outputRoot, "shadow");
  const launchDir = path.join(outputRoot, "launch-readiness");

  const exportArgs = [
    "scripts/run-adaptive-learning-export.js",
    "--source", source,
    "--output", exportDir,
    "--label", `${label}_export`,
  ];
  if (userId) {
    exportArgs.push("--user-id", userId);
  }
  runNodeScript(exportArgs[0], exportArgs.slice(1));

  if (!skipAnalysis) {
    runNodeScript("scripts/run-adaptive-learning-analysis.js", [
      "--input", path.join(exportDir, "adaptive-learning-export.json"),
      "--output", analysisDir,
      "--label", `${label}_analysis`,
    ]);
  }

  const shadowArgs = [
    "scripts/run-adaptive-policy-shadow-evaluation.js",
    "--input", path.join(exportDir, "adaptive-learning-export.json"),
    "--output", shadowDir,
    "--label", `${label}_shadow`,
  ];

  if (!skipPolicyReplay && fs.existsSync(configPath) && fs.existsSync(evidencePath)) {
    shadowArgs.push("--config", configPath, "--evidence", evidencePath);
  }

  runNodeScript(shadowArgs[0], shadowArgs.slice(1));

  runNodeScript("scripts/run-adaptive-policy-launch-readiness.js", [
    "--shadow", shadowDir,
    "--output", launchDir,
  ]);

  const shadowResults = readJson(path.join(shadowDir, "results.json"));
  const launchResults = readJson(path.join(launchDir, "results.json"));
  const summary = {
    label,
    source,
    userId,
    usedPolicyReplay: !skipPolicyReplay && fs.existsSync(configPath) && fs.existsSync(evidencePath),
    exportDir,
    analysisDir: skipAnalysis ? null : analysisDir,
    shadowDir,
    launchDir,
    shadowEvaluation: {
      decisionRowCount: Number(shadowResults?.summary?.decisionRowCount || 0),
      agreementRate: Number(shadowResults?.summary?.agreementRate || 0),
      divergenceRate: Number(shadowResults?.summary?.divergenceRate || 0),
    },
    launchReadiness: launchResults?.summary || {},
  };

  const report = [
    "# Adaptive Policy Staging Evaluation",
    "",
    `- Label: ${label}`,
    `- Source: ${source}`,
    `- User filter: ${userId || "all users"}`,
    `- Policy replay: ${summary.usedPolicyReplay ? "enabled" : "logged shadow only"}`,
    `- Shadow rows: ${summary.shadowEvaluation.decisionRowCount}`,
    `- Agreement rate: ${Math.round((summary.shadowEvaluation.agreementRate || 0) * 100)}%`,
    `- Divergence rate: ${Math.round((summary.shadowEvaluation.divergenceRate || 0) * 100)}%`,
    `- Launch status: ${launchResults?.summary?.overallStatus || "unknown"}`,
    `- Activation recommendation: ${launchResults?.summary?.activationRecommendation || "keep_in_shadow"}`,
    "",
    "## Artifact Paths",
    "",
    `- Export: ${exportDir}`,
    ...(skipAnalysis ? [] : [`- Analysis: ${analysisDir}`]),
    `- Shadow evaluation: ${shadowDir}`,
    `- Launch readiness: ${launchDir}`,
    "",
  ].join("\n");

  writeJson(path.join(outputRoot, "results.json"), summary);
  writeText(path.join(outputRoot, "staging-evaluation-report.md"), report);

  console.log("Adaptive policy staging evaluation complete.");
  console.log(`Output root: ${outputRoot}`);
  console.log(`Launch status: ${launchResults?.summary?.overallStatus || "unknown"}`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
