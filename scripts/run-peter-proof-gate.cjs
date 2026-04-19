require("sucrase/register");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { assertSyntheticLabSafeEnvironment } = require("../src/services/synthetic-athlete-lab/env-guard.js");
const {
  runSyntheticAthleteLab,
} = require("../src/services/synthetic-athlete-lab/runner.js");
const {
  SYNTHETIC_ATHLETE_PERSONAS,
} = require("../src/services/synthetic-athlete-lab/persona-catalog.js");
const {
  RELEASE_GATE_POLICY,
} = require("../src/services/release-gate-contract.js");

const args = process.argv.slice(2);
const repoRoot = path.resolve(__dirname, "..");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const UNIT_TEST_FILES = Object.freeze([
  "tests/goal-resolution-service.test.js",
  "tests/goal-support-honesty-service.test.js",
  "tests/intake-completeness-service.test.js",
  "tests/support-tier-service.test.js",
  "tests/goal-pace-scorecard-service.test.js",
  "tests/peter-plan-audit-service.test.js",
  "tests/nutrition-compatibility-audit-service.test.js",
  "tests/plan-evolution-export-service.test.js",
  "tests/auth-storage-local-authority.test.js",
]);

const ADVERSARIAL_E2E_SPECS = Object.freeze([
  "e2e/adversarial-trust.spec.js",
]);

const PETER_PERSONA_SUBSET_IDS = Object.freeze([
  "half_runner_no_date",
  "bench_225_office_worker",
  "summer_athletic_wedding",
  "hybrid_athlete_split",
  "powerlifter_bench_aesthetics_exact",
]);

const STOPLIGHT = Object.freeze({
  green: "GREEN",
  yellow: "YELLOW",
  red: "RED",
});

const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  return String(args[index + 1] || fallback).trim();
};

const sanitizeSlug = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "peter-proof-gate";

const timestamp = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const toRepoPath = (absolutePath = "") => path.relative(repoRoot, absolutePath).replace(/\\/g, "/");

const toMarkdownLink = (label, targetPath) => {
  const relative = path.relative(runDir, targetPath).replace(/\\/g, "/");
  return `[${label}](${relative})`;
};

const quoteCommand = (parts = []) => parts.map((part) => (
  /\s/.test(part) ? `"${part}"` : part
)).join(" ");

const writeLog = (logPath, content) => {
  fs.writeFileSync(logPath, String(content || ""), "utf8");
};

const runProcess = ({
  label,
  command,
  commandArgs = [],
  env = {},
  cwd = repoRoot,
  logPath,
  shell = false,
} = {}) => {
  console.log(`Running ${label}...`);
  const startedAt = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
    stdio: "pipe",
    shell,
  });
  const durationMs = Date.now() - startedAt;
  const combinedOutput = [
    `# ${label}`,
    "",
    `Command: ${quoteCommand([command, ...commandArgs])}`,
    `DurationMs: ${durationMs}`,
    `ExitCode: ${typeof result.status === "number" ? result.status : "null"}`,
    result.error ? `SpawnError: ${result.error.message}` : "",
    "",
    "## STDOUT",
    "",
    result.stdout || "",
    "",
    "## STDERR",
    "",
    result.stderr || "",
  ].join("\n");
  writeLog(logPath, combinedOutput);
  return {
    ok: result.status === 0 && !result.error,
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
    durationMs,
    logPath,
    commandLine: quoteCommand([command, ...commandArgs]),
  };
};

const extractManualPackPaths = (stdout = "") => {
  const lines = String(stdout || "").split(/\r?\n/);
  const readValue = (prefix) => {
    const line = lines.find((entry) => entry.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : "";
  };
  return {
    packDocPath: readValue("Pack doc: "),
    worksheetPath: readValue("Worksheet: "),
    artifactsPath: readValue("Artifacts: "),
    screenshotsPath: readValue("Screenshots: "),
    pdfsPath: readValue("PDFs: "),
  };
};

const describeManualPack = (manualPackPaths = {}) => {
  if (!manualPackPaths.worksheetPath || !manualPackPaths.artifactsPath) {
    return "Manual QA pack output paths were not emitted as expected.";
  }
  return "Manual QA worksheet generated. Human execution is still required for RG-11.";
};

const buildPersonaSubsetReport = ({
  weeks = 12,
} = {}) => {
  assertSyntheticLabSafeEnvironment(process.env);
  const personas = SYNTHETIC_ATHLETE_PERSONAS.filter((persona) => PETER_PERSONA_SUBSET_IDS.includes(persona.id));
  const report = runSyntheticAthleteLab({
    personas,
    weeks,
    catalogMode: "focus",
  });
  const missingPersonas = PETER_PERSONA_SUBSET_IDS.filter((id) => !personas.some((persona) => persona.id === id));
  const failingPersonas = report.personaResults.filter((result) => !result.overallPass);
  const severeBlockers = report.personaResults.reduce((sum, result) => sum + (Array.isArray(result.severeBlockers) ? result.severeBlockers.length : 0), 0);
  const mediumIssues = report.personaResults.reduce((sum, result) => sum + (Array.isArray(result.mediumIssues) ? result.mediumIssues.length : 0), 0);
  const blocked = missingPersonas.length > 0 || failingPersonas.length > 0 || severeBlockers > 0 || mediumIssues > 0;
  return {
    report,
    missingPersonas,
    failingPersonas,
    severeBlockers,
    mediumIssues,
    blocked,
  };
};

const buildPersonaSubsetMarkdown = ({ report, missingPersonas = [], failingPersonas = [] } = {}) => {
  const personaRows = (report?.personaResults || []).map((result) => [
    result.personaId,
    result.name,
    result.overallPass ? "pass" : "fail",
    String(result.overallScore),
    String(Array.isArray(result.severeBlockers) ? result.severeBlockers.length : 0),
    String(Array.isArray(result.mediumIssues) ? result.mediumIssues.length : 0),
  ]);
  const matrixRows = (report?.releaseGateMatrix || []).map((entry) => [
    entry.personaId,
    entry.verdict,
    String((entry.blockers || []).length),
  ]);
  return [
    "# Peter Persona-Lab Subset",
    "",
    `- Catalog mode: ${report?.summary?.catalogMode || "focus"}`,
    `- Persona count: ${report?.summary?.personaCount || 0}`,
    `- Simulation weeks: ${report?.summary?.simulationWeeks || 0}`,
    `- Overall pass: ${report?.summary?.overallPass ? "true" : "false"}`,
    `- Severe blockers: ${report?.summary?.severeBlockerCount || 0}`,
    `- Medium issues: ${report?.summary?.mediumIssueCount || 0}`,
    "",
    "This subset is Peter-shaped and intentionally does not try to satisfy the full 100-persona / 26-week synthetic release threshold.",
    "The full release gate remains a separate command. This subset is green only when the selected personas themselves stay blocker-free.",
    "",
    missingPersonas.length
      ? `Missing personas: ${missingPersonas.join(", ")}`
      : "Missing personas: none",
    failingPersonas.length
      ? `Failing personas: ${failingPersonas.map((result) => result.personaId).join(", ")}`
      : "Failing personas: none",
    "",
    "| Persona | Name | Verdict | Score | Severe | Medium |",
    "| --- | --- | --- | --- | --- | --- |",
    ...personaRows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "| Quick probe persona | Archetype verdict | Blockers |",
    "| --- | --- | --- |",
    ...matrixRows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "Full synthetic release gate context:",
    `- Global release gate candidate: ${report?.summary?.releaseGateCandidate ? "true" : "false"}`,
    `- Failing global threshold checks: ${Array.isArray(report?.releaseGate?.failingChecks) ? report.releaseGate.failingChecks.length : 0}`,
  ].join("\n");
};

const outputRoot = path.resolve(repoRoot, getArgValue("--output", path.join("artifacts", "peter-proof-gate")), sanitizeSlug(timestamp()));
const runDir = ensureDir(outputRoot);
const logsDir = ensureDir(path.join(runDir, "logs"));
const reportsDir = ensureDir(path.join(runDir, "reports"));
const playwrightOutputDir = ensureDir(path.join(runDir, "playwright-output"));
const manualOutputRoot = ensureDir(path.join(runDir, "manual-pack"));

const unitLogPath = path.join(logsDir, "unit-tests.log");
const e2eLogPath = path.join(logsDir, "adversarial-e2e.log");
const personaJsonPath = path.join(reportsDir, "persona-subset-report.json");
const personaMdPath = path.join(reportsDir, "persona-subset-report.md");
const manualLogPath = path.join(logsDir, "manual-pack.log");
const adaptiveLaunchLogPath = path.join(logsDir, "adaptive-launch-readiness.log");
const summaryPath = path.join(runDir, "stoplight-summary.md");
const summaryJsonPath = path.join(runDir, "stoplight-summary.json");
const adaptiveLaunchOutputDir = ensureDir(path.join(runDir, "adaptive-launch-readiness"));

const steps = [];

const unitResult = runProcess({
  label: "Peter-relevant unit tests",
  command: process.execPath,
  commandArgs: ["-r", "sucrase/register", "--test", ...UNIT_TEST_FILES],
  logPath: unitLogPath,
});
steps.push({
  id: "unit_tests",
  label: "Peter-relevant unit tests",
  status: unitResult.ok ? STOPLIGHT.green : STOPLIGHT.red,
  detail: unitResult.ok
    ? `Passed ${UNIT_TEST_FILES.length} test files.`
    : `Unit test run failed with exit code ${unitResult.exitCode}.`,
  blocked: !unitResult.ok,
  artifacts: [
    { label: "unit test log", path: unitLogPath },
  ],
  commandLine: unitResult.commandLine,
});

const e2eResult = runProcess({
  label: "Adversarial e2e tests",
  command: process.platform === "win32" ? "cmd.exe" : npxCommand,
  commandArgs: process.platform === "win32"
    ? [
        "/d",
        "/s",
        "/c",
        `${npxCommand} playwright test ${ADVERSARIAL_E2E_SPECS.join(" ")} --reporter=line --output ${playwrightOutputDir}`,
      ]
    : [
        "playwright",
        "test",
        ...ADVERSARIAL_E2E_SPECS,
        "--reporter=line",
        "--output",
        playwrightOutputDir,
      ],
  logPath: e2eLogPath,
});
steps.push({
  id: "adversarial_e2e",
  label: "Adversarial e2e tests",
  status: e2eResult.ok ? STOPLIGHT.green : STOPLIGHT.red,
  detail: e2eResult.ok
    ? `Passed ${ADVERSARIAL_E2E_SPECS.length} Playwright spec file.`
    : `Adversarial browser suite failed with exit code ${e2eResult.exitCode}.`,
  blocked: !e2eResult.ok,
  artifacts: [
    { label: "adversarial e2e log", path: e2eLogPath },
    { label: "playwright output", path: playwrightOutputDir },
  ],
  commandLine: e2eResult.commandLine,
});

let personaStep;
try {
  const personaSubset = buildPersonaSubsetReport({
    weeks: Number(getArgValue("--persona-weeks", "12")) || 12,
  });
  fs.writeFileSync(personaJsonPath, JSON.stringify(personaSubset.report, null, 2), "utf8");
  fs.writeFileSync(personaMdPath, buildPersonaSubsetMarkdown(personaSubset), "utf8");
  personaStep = {
    id: "persona_subset",
    label: "Peter persona-lab subset",
    status: personaSubset.blocked ? STOPLIGHT.red : STOPLIGHT.green,
    detail: personaSubset.blocked
      ? `Subset failed: ${personaSubset.failingPersonas.length} persona verdicts failed, ${personaSubset.severeBlockers} severe blockers, ${personaSubset.mediumIssues} medium issues.`
      : `Subset passed for ${personaSubset.report.summary.personaCount} personas over ${personaSubset.report.summary.simulationWeeks} weeks. Global 100-persona threshold intentionally not applied here.`,
    blocked: personaSubset.blocked,
    artifacts: [
      { label: "persona subset json", path: personaJsonPath },
      { label: "persona subset markdown", path: personaMdPath },
    ],
    commandLine: "internal runSyntheticAthleteLab subset",
  };
} catch (error) {
  writeLog(personaJsonPath, JSON.stringify({ error: error.message }, null, 2));
  fs.writeFileSync(personaMdPath, `# Peter Persona-Lab Subset\n\nFailed to run: ${error.message}\n`, "utf8");
  personaStep = {
    id: "persona_subset",
    label: "Peter persona-lab subset",
    status: STOPLIGHT.red,
    detail: `Persona subset failed to run: ${error.message}`,
    blocked: true,
    artifacts: [
      { label: "persona subset json", path: personaJsonPath },
      { label: "persona subset markdown", path: personaMdPath },
    ],
    commandLine: "internal runSyntheticAthleteLab subset",
  };
}
steps.push(personaStep);

const manualResult = runProcess({
  label: "Manual QA pack generation",
  command: process.execPath,
  commandArgs: [
    path.join("scripts", "run-manual-qa-pack.cjs"),
    "--env",
    getArgValue("--manual-env", "local"),
    "--url",
    getArgValue("--manual-url", "http://127.0.0.1:4173"),
    "--release",
    getArgValue("--manual-release", "peter-proof-gate"),
    "--output",
    toRepoPath(manualOutputRoot),
  ],
  logPath: manualLogPath,
});
const manualPackPaths = extractManualPackPaths(manualResult.stdout);
const manualArtifacts = [
  { label: "manual pack log", path: manualLogPath },
];
[
  ["manual pack doc", manualPackPaths.packDocPath],
  ["manual worksheet", manualPackPaths.worksheetPath],
  ["manual artifacts", manualPackPaths.artifactsPath],
  ["manual screenshots folder", manualPackPaths.screenshotsPath],
  ["manual pdf folder", manualPackPaths.pdfsPath],
].forEach(([label, maybePath]) => {
  if (maybePath) manualArtifacts.push({ label, path: path.resolve(maybePath) });
});
steps.push({
  id: "manual_pack",
  label: "Manual QA pack generation",
  status: manualResult.ok ? STOPLIGHT.yellow : STOPLIGHT.red,
  detail: manualResult.ok
    ? describeManualPack(manualPackPaths)
    : `Manual QA pack generation failed with exit code ${manualResult.exitCode}.`,
  blocked: !manualResult.ok,
  artifacts: manualArtifacts,
  commandLine: manualResult.commandLine,
});

const adaptiveLaunchResult = runProcess({
  label: "Adaptive launch-readiness gate",
  command: process.execPath,
  commandArgs: [
    path.join("scripts", "run-adaptive-policy-launch-readiness.js"),
    "--fixture",
    "--output",
    toRepoPath(adaptiveLaunchOutputDir),
  ],
  logPath: adaptiveLaunchLogPath,
});

let adaptiveLaunchSummary = null;
if (adaptiveLaunchResult.ok) {
  try {
    adaptiveLaunchSummary = JSON.parse(
      fs.readFileSync(path.join(adaptiveLaunchOutputDir, "results.json"), "utf8")
    );
  } catch (error) {
    adaptiveLaunchSummary = {
      parseError: error.message,
    };
  }
}

const adaptiveLaunchRecommendation = adaptiveLaunchSummary?.summary?.activationRecommendation || "";
const adaptiveLaunchArtifacts = [
  { label: "adaptive launch log", path: adaptiveLaunchLogPath },
  { label: "adaptive launch results", path: path.join(adaptiveLaunchOutputDir, "results.json") },
  { label: "adaptive launch report", path: path.join(adaptiveLaunchOutputDir, "launch-readiness-report.md") },
];

let adaptiveLaunchStatus = STOPLIGHT.red;
let adaptiveLaunchDetail = `Adaptive launch-readiness gate failed with exit code ${adaptiveLaunchResult.exitCode}.`;
if (adaptiveLaunchResult.ok) {
  if (adaptiveLaunchRecommendation === "keep_in_shadow") {
    adaptiveLaunchStatus = STOPLIGHT.green;
    adaptiveLaunchDetail = "Gate ran and recommends keep_in_shadow. That is launch-safe while adaptive remains off or shadow-only.";
  } else if (adaptiveLaunchRecommendation === "eligible_for_limited_active_rollout") {
    adaptiveLaunchStatus = STOPLIGHT.green;
    adaptiveLaunchDetail = "Gate ran and at least one bounded decision point is eligible for a limited rollout.";
  } else if (adaptiveLaunchSummary?.parseError) {
    adaptiveLaunchStatus = STOPLIGHT.yellow;
    adaptiveLaunchDetail = `Gate ran, but results.json could not be parsed: ${adaptiveLaunchSummary.parseError}`;
  } else {
    adaptiveLaunchStatus = STOPLIGHT.yellow;
    adaptiveLaunchDetail = "Gate ran, but the activation recommendation was not recognized. Review the adaptive launch artifacts before rollout.";
  }
}

steps.push({
  id: "adaptive_launch_readiness",
  label: "Adaptive launch-readiness gate",
  status: adaptiveLaunchStatus,
  detail: adaptiveLaunchDetail,
  blocked: !adaptiveLaunchResult.ok,
  artifacts: adaptiveLaunchArtifacts,
  commandLine: adaptiveLaunchResult.commandLine,
});

const hasRed = steps.some((step) => step.status === STOPLIGHT.red || step.blocked);
const hasYellow = steps.some((step) => step.status === STOPLIGHT.yellow);
const overallStatus = hasRed ? STOPLIGHT.red : hasYellow ? STOPLIGHT.yellow : STOPLIGHT.green;
const overallDetail = hasRed
  ? "At least one gate layer is blocked."
  : hasYellow
  ? "Automated layers passed, but the manual browser/device/export pass is still pending."
  : "All configured layers passed.";

const summary = {
  generatedAt: new Date().toISOString(),
  overallStatus,
  overallDetail,
  policy: RELEASE_GATE_POLICY.summary,
  runDir,
  steps: steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status,
    detail: step.detail,
    blocked: step.blocked,
    commandLine: step.commandLine,
    artifacts: step.artifacts.map((artifact) => ({
      label: artifact.label,
      path: artifact.path,
      repoPath: toRepoPath(artifact.path),
    })),
  })),
};

fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf8");

const summaryMarkdown = [
  "# Peter Proof Gate Stoplight Summary",
  "",
  `- Generated: ${summary.generatedAt}`,
  `- Overall: ${overallStatus}`,
  `- Detail: ${overallDetail}`,
  `- Release-gate policy: ${RELEASE_GATE_POLICY.summary}`,
  "",
  "| Layer | Stoplight | Blocked | Detail |",
  "| --- | --- | --- | --- |",
  ...steps.map((step) => `| ${step.label} | ${step.status} | ${step.blocked ? "yes" : "no"} | ${step.detail} |`),
  "",
  "## Artifacts",
  "",
  ...steps.flatMap((step) => [
    `### ${step.label}`,
    "",
    ...step.artifacts.map((artifact) => `- ${toMarkdownLink(artifact.label, artifact.path)}`),
    "",
  ]),
  "### Stoplight summary",
  "",
  `- ${toMarkdownLink("stoplight-summary.json", summaryJsonPath)}`,
  "",
  "## Commands",
  "",
  ...steps.map((step) => `- ${step.label}: \`${step.commandLine}\``),
  "",
  "## Notes",
  "",
  "- The persona-lab layer uses a Peter-shaped subset and does not attempt to satisfy the full synthetic release threshold of 100 personas over 26 weeks.",
  "- The manual-pack layer only generates the worksheet and artifact folders. RG-11 still requires a human pass before a release can be called ready.",
  "- The adaptive launch-readiness layer is safety-only. A keep_in_shadow recommendation is acceptable for launch while adaptive remains off or shadow-only.",
].join("\n");

fs.writeFileSync(summaryPath, summaryMarkdown, "utf8");

console.log("");
console.log("PETER PROOF GATE");
steps.forEach((step) => {
  console.log(`[${step.status}] ${step.label}: ${step.detail}`);
});
console.log(`[${overallStatus}] Overall: ${overallDetail}`);
console.log(`Summary: ${summaryPath}`);

process.exitCode = hasRed ? 1 : 0;
