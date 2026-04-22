const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

const now = new Date();
const stamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  "-",
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
  String(now.getSeconds()).padStart(2, "0"),
].join("");

const artifactRoot = path.join(repoRoot, "artifacts", "launch-gate", stamp);
const latestRoot = path.join(repoRoot, "artifacts", "launch-gate", "latest");
const logsRoot = path.join(artifactRoot, "logs");
const manualPackRoot = path.join(artifactRoot, "manual-qa-pack");

const ensureDir = (dirPath = "") => {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
};

const normalizeSlashes = (value = "") => String(value || "").replace(/\\/g, "/");
const relativePath = (filePath = "") => normalizeSlashes(path.relative(repoRoot, filePath));

const writeText = (filePath = "", content = "") => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ""), "utf8");
};

const copyFileIfPresent = (sourcePath = "", targetPath = "") => {
  if (!sourcePath || !targetPath || !fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
};

const parseBuildMetrics = (output = "") => {
  const normalized = String(output || "");
  const appBundleMatch = normalized.match(/app\.bundle\.[^\s]+ - ([\d.]+) KB/i);
  const vendorBundleMatch = normalized.match(/vendor ([\d.]+) KB/i);
  return {
    appBundleKb: appBundleMatch ? Number(appBundleMatch[1]) : null,
    vendorBundleKb: vendorBundleMatch ? Number(vendorBundleMatch[1]) : null,
  };
};

const parseManualPackWorksheetPath = (output = "") => {
  const normalized = String(output || "");
  const worksheetMatch = normalized.match(/^Worksheet:\s+(.+)$/im);
  if (!worksheetMatch?.[1]) return "";
  return path.resolve(repoRoot, worksheetMatch[1].trim());
};

const CHECKS = [
  {
    id: "build",
    label: "Build and repo hygiene",
    command: "npm run build:verified",
    categories: ["today", "log", "plan", "intake", "hybrid", "trust", "sync", "design", "journeys"],
    parseMetrics: parseBuildMetrics,
  },
  {
    id: "today_unit",
    label: "Today unit and clarity contracts",
    command: "node -r sucrase/register --test tests/today-prescription-surface-service.test.js tests/surface-clarity-contract.test.js",
    categories: ["today", "trust", "design"],
  },
  {
    id: "today_e2e",
    label: "Today execution flow",
    command: "npx playwright test e2e/today-surface.spec.js --reporter=line --workers=1",
    categories: ["today", "journeys", "trust"],
  },
  {
    id: "log_unit",
    label: "Log actuals and trust contracts",
    command: "node -r sucrase/register --test tests/workout-log-form-service.test.js tests/checkins-trust-model.test.js",
    categories: ["log", "trust"],
  },
  {
    id: "log_e2e",
    label: "Log completion and reopen flow",
    command: "npx playwright test e2e/log-prescribed-workflow.spec.js --reporter=line --workers=1",
    categories: ["log", "journeys"],
  },
  {
    id: "plan_unit",
    label: "Plan weekly model and planning benchmarks",
    command: "node -r sucrase/register --test tests/plan-surface-service.test.js tests/hybrid-planning-engine.test.js tests/dynamic-plan-engine.test.js tests/program-block-model.test.js tests/benchmarks/goal-coverage-benchmark.test.js tests/benchmarks/plan-quality-benchmark.test.js tests/benchmarks/archetype-differentiation.test.js",
    categories: ["plan", "hybrid"],
  },
  {
    id: "plan_e2e",
    label: "Plan weekly comprehension flow",
    command: "npx playwright test e2e/plan-surface.spec.js --reporter=line --workers=1",
    categories: ["plan", "journeys"],
  },
  {
    id: "intake_unit",
    label: "Structured intake and copy-budget contracts",
    command: "node -r sucrase/register --test tests/intake-entry-service.test.js tests/goal-template-catalog-service.test.js tests/intake-goal-flow-service.test.js tests/intake-machine-service.test.js tests/ux-quality-gates.test.js",
    categories: ["intake", "design"],
  },
  {
    id: "intake_e2e",
    label: "Structured intake journeys",
    command: "npx playwright test e2e/intake.spec.js e2e/intake-one-screen.spec.js e2e/intake-reliability.spec.js --reporter=line --workers=1",
    categories: ["intake", "journeys"],
  },
  {
    id: "trust_unit",
    label: "Compact trust and provenance contracts",
    command: "node -r sucrase/register --test tests/compact-trust-service.test.js tests/today-prescription-surface-service.test.js tests/plan-surface-service.test.js tests/surface-clarity-contract.test.js",
    categories: ["trust", "today", "plan"],
  },
  {
    id: "trust_e2e",
    label: "Surface clarity and trust guard",
    command: "npx playwright test e2e/surface-clarity-guard.spec.js --reporter=line --workers=1",
    categories: ["trust", "design"],
  },
  {
    id: "sync_unit",
    label: "Sync/auth/local authority contracts",
    command: "node -r sucrase/register --test tests/auth-storage-local-authority.test.js tests/goals-sync-contract.test.js tests/sync-state-service.test.js tests/runtime-endpoint-availability-service.test.js tests/internal-access-policy-service.test.js tests/settings-surface-model.test.js tests/useSettingsDeleteDiagnostics.test.js",
    categories: ["sync", "trust"],
  },
  {
    id: "account_e2e",
    label: "Account lifecycle reliability flow",
    command: "npx playwright test e2e/account-lifecycle.spec.js --reporter=line --workers=1",
    categories: ["sync", "journeys"],
  },
  {
    id: "sync_state_e2e",
    label: "Sync failure-state rendering",
    command: "npx playwright test e2e/sync-state.spec.js --grep \"signed-out devices stop at the account gate even when a saved local copy exists|provider outage surfaces a fatal sync state instead of a vague broken local mode\" --reporter=line --workers=1",
    categories: ["sync"],
  },
  {
    id: "design_e2e",
    label: "UX tap budgets and theme intent",
    command: "npx playwright test e2e/ux-quality-gates.spec.js e2e/theme-preferences.spec.js --reporter=line --workers=1",
    categories: ["design", "journeys", "intake"],
  },
];

const CATEGORY_DEFINITIONS = [
  {
    id: "today",
    label: "Today clarity",
    description: "One prescription, concise rationale, obvious execution shape.",
    checkIds: ["build", "today_unit", "today_e2e", "trust_unit"],
  },
  {
    id: "log",
    label: "Log usability",
    description: "Planned vs actual stays obvious, save/reopen stays trustworthy.",
    checkIds: ["build", "log_unit", "log_e2e"],
  },
  {
    id: "plan",
    label: "Plan coherence",
    description: "The week orients without duplicating Today.",
    checkIds: ["build", "plan_unit", "plan_e2e"],
  },
  {
    id: "intake",
    label: "Intake quality",
    description: "Structured capture, low click burden, fuzzy goals still supported.",
    checkIds: ["build", "intake_unit", "intake_e2e", "design_e2e"],
  },
  {
    id: "hybrid",
    label: "Hybrid goal realism",
    description: "Competing goals produce coherent weeks and recovery-aware sequencing.",
    checkIds: ["build", "plan_unit"],
  },
  {
    id: "trust",
    label: "Trust and provenance clarity",
    description: "Compact explanation, no debug leakage, clear prescribed vs actual boundaries.",
    checkIds: ["build", "trust_unit", "trust_e2e", "sync_unit"],
  },
  {
    id: "sync",
    label: "Sync and auth reliability",
    description: "Local/cloud/auth transitions stay boring and predictable.",
    checkIds: ["build", "sync_unit", "account_e2e", "sync_state_e2e"],
    manualReview: [
      "Run the real staging two-device sync pack with live Supabase before launch.",
    ],
  },
  {
    id: "design",
    label: "Design and craft proxy checks",
    description: "Clarity budgets, CTA discipline, theme intent, and density controls.",
    checkIds: ["build", "today_unit", "intake_unit", "trust_e2e", "design_e2e"],
    manualReview: [
      "A human premium-read pass is still required across dark, light, and small-phone hardware.",
    ],
  },
  {
    id: "journeys",
    label: "Key journey stability",
    description: "Sign in, intake, Today, Log, Plan, and Settings basics all hold together.",
    checkIds: ["build", "today_e2e", "log_e2e", "plan_e2e", "intake_e2e", "account_e2e", "design_e2e"],
  },
];

const runCommand = ({ id = "", label = "", command = "" } = {}) => {
  const logPath = path.join(logsRoot, `${id}.log`);
  const startedAt = Date.now();
  console.log(`[launch-gate] ${label}`);
  console.log(`  -> ${command}`);
  const result = spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: process.env.CI || "1",
      PLAYWRIGHT_FORCE_TTY: "0",
    },
    maxBuffer: 50 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt;
  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join(result.stdout && result.stderr ? "\n" : "");
  writeText(logPath, combinedOutput);
  const parsedMetrics = typeof result.commandMetrics === "function"
    ? result.commandMetrics(combinedOutput)
    : null;
  return {
    id,
    label,
    command,
    logPath,
    durationMs,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: typeof result.status === "number" ? result.status : 1,
    metrics: parsedMetrics,
  };
};

const evaluateCategory = ({ category = null, checkResults = {}, buildMetrics = {} } = {}) => {
  const checks = (category?.checkIds || []).map((checkId) => checkResults[checkId]).filter(Boolean);
  const failedChecks = checks.filter((check) => check.status !== "PASS");
  const warnings = [];

  if (category?.id === "design" && Number.isFinite(buildMetrics?.appBundleKb) && buildMetrics.appBundleKb > 4500) {
    warnings.push(`Split app bundle is still heavy at ${buildMetrics.appBundleKb.toFixed(1)} KB.`);
  }
  if (Array.isArray(category?.manualReview)) warnings.push(...category.manualReview);

  const status = failedChecks.length > 0
    ? "FAIL"
    : warnings.length > 0
    ? "WARN"
    : "PASS";

  const score = status === "PASS"
    ? 100
    : status === "WARN"
    ? 70
    : 0;

  return {
    id: category.id,
    label: category.label,
    description: category.description,
    status,
    score,
    checks: checks.map((check) => ({
      id: check.id,
      label: check.label,
      status: check.status,
      logPath: relativePath(check.logPath),
      durationMs: check.durationMs,
    })),
    failedChecks: failedChecks.map((check) => check.label),
    warnings,
  };
};

const summarizeOverallVerdict = (categoryResults = []) => {
  const failCount = categoryResults.filter((category) => category.status === "FAIL").length;
  const warnCount = categoryResults.filter((category) => category.status === "WARN").length;
  const passCount = categoryResults.filter((category) => category.status === "PASS").length;
  const score = Math.round(
    categoryResults.reduce((sum, category) => sum + Number(category.score || 0), 0)
    / Math.max(1, categoryResults.length)
  );
  const verdict = failCount > 0
    ? "FAIL"
    : warnCount > 0
    ? "WARN"
    : "PASS";
  return {
    verdict,
    score,
    passCount,
    warnCount,
    failCount,
  };
};

const buildWeaknesses = ({ categoryResults = [], buildMetrics = {} } = {}) => {
  const weaknesses = [];
  categoryResults.forEach((category) => {
    if (category.status === "FAIL") {
      weaknesses.push(`${category.label}: failing checks -> ${category.failedChecks.join(", ")}`);
      return;
    }
    if (category.status === "WARN") {
      weaknesses.push(`${category.label}: ${category.warnings[0]}`);
    }
  });
  if (Number.isFinite(buildMetrics?.appBundleKb) && buildMetrics.appBundleKb > 4500) {
    weaknesses.push(`Front-end payload: app bundle is still ${buildMetrics.appBundleKb.toFixed(1)} KB in the split build.`);
  }
  return Array.from(new Set(weaknesses)).slice(0, 6);
};

const renderMarkdown = ({
  summary = {},
  categoryResults = [],
  checkResults = [],
  buildMetrics = {},
  manualPack = {},
  weaknesses = [],
} = {}) => {
  const categoryTable = [
    "| Category | Status | Score | Notes |",
    "| --- | --- | --- | --- |",
    ...categoryResults.map((category) => {
      const notes = category.status === "FAIL"
        ? `Failing checks: ${category.failedChecks.join(", ")}`
        : category.warnings.length
        ? category.warnings.join(" ")
        : "Deterministic checks are green.";
      return `| ${category.label} | ${category.status} | ${category.score} | ${notes} |`;
    }),
  ].join("\n");

  const checkTable = [
    "| Check | Status | Duration | Log |",
    "| --- | --- | --- | --- |",
    ...checkResults.map((check) => `| ${check.label} | ${check.status} | ${Math.round(check.durationMs / 1000)}s | [${path.basename(check.logPath)}](../${relativePath(check.logPath)}) |`),
  ].join("\n");

  const weaknessLines = weaknesses.length > 0
    ? weaknesses.map((item) => `- ${item}`).join("\n")
    : "- No major weaknesses surfaced in this run.";

  const buildSummary = Number.isFinite(buildMetrics?.appBundleKb)
    ? `- Split app bundle: ${buildMetrics.appBundleKb.toFixed(1)} KB\n- Vendor bundle: ${Number.isFinite(buildMetrics?.vendorBundleKb) ? buildMetrics.vendorBundleKb.toFixed(1) : "n/a"} KB`
    : "- Build metrics were not parsed from the current run.";

  const manualSection = [
    "## Manual / External Review Still Required",
    "",
    "- Real two-device staging sync: run `npm run e2e:sync:staging` against a live environment.",
    "- Premium visual review: dark, light, and small-phone passes still need human signoff.",
    manualPack?.worksheetPath
      ? `- Manual review pack: [manual-qa-run.md](../${relativePath(manualPack.worksheetPath)})`
      : "- Manual review pack: not generated in this run.",
  ].join("\n");

  return `# Launch Gate Scorecard

- Generated: ${now.toISOString()}
- Verdict: **${summary.verdict}**
- Readiness score: **${summary.score}/100**
- Category spread: ${summary.passCount} pass / ${summary.warnCount} warn / ${summary.failCount} fail

## Category Scorecard

${categoryTable}

## Biggest Weaknesses Exposed

${weaknessLines}

## Deterministic Checks

${checkTable}

## Build Metrics

${buildSummary}

${manualSection}
`;
};

const main = () => {
  ensureDir(artifactRoot);
  ensureDir(logsRoot);

  const checkResultsById = {};
  let buildMetrics = {};

  for (const check of CHECKS) {
    const result = runCommand(check);
    if (check.parseMetrics) {
      result.metrics = check.parseMetrics(fs.readFileSync(result.logPath, "utf8"));
      if (check.id === "build") buildMetrics = result.metrics || {};
    }
    checkResultsById[check.id] = result;
  }

  console.log("[launch-gate] Generating companion manual review pack...");
  const manualPackCommand = `node scripts/run-manual-qa-pack.cjs --env local --output "${normalizeSlashes(path.relative(repoRoot, manualPackRoot))}"`;
  const manualPackRun = spawnSync(manualPackCommand, {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
  });
  const manualPackLogPath = path.join(logsRoot, "manual-pack.log");
  const manualPackOutput = [manualPackRun.stdout, manualPackRun.stderr].filter(Boolean).join("\n");
  writeText(manualPackLogPath, manualPackOutput);

  const manualPack = {
    status: manualPackRun.status === 0 ? "PASS" : "FAIL",
    logPath: manualPackLogPath,
    worksheetPath: parseManualPackWorksheetPath(manualPackOutput),
  };

  const categoryResults = CATEGORY_DEFINITIONS.map((category) => evaluateCategory({
    category,
    checkResults: checkResultsById,
    buildMetrics,
  }));
  const summary = summarizeOverallVerdict(categoryResults);
  const weaknesses = buildWeaknesses({ categoryResults, buildMetrics });

  const resultsJson = {
    generatedAt: now.toISOString(),
    summary,
    buildMetrics,
    categories: categoryResults,
    checks: Object.values(checkResultsById).map((check) => ({
      ...check,
      logPath: relativePath(check.logPath),
    })),
    manualPack: {
      ...manualPack,
      logPath: relativePath(manualPack.logPath),
      worksheetPath: manualPack.worksheetPath ? relativePath(manualPack.worksheetPath) : "",
    },
    weaknesses,
  };

  const markdown = renderMarkdown({
    summary,
    categoryResults,
    checkResults: Object.values(checkResultsById),
    buildMetrics,
    manualPack,
    weaknesses,
  });

  const resultsPath = path.join(artifactRoot, "results.json");
  const markdownPath = path.join(artifactRoot, "launch-gate-scorecard.md");
  writeText(resultsPath, JSON.stringify(resultsJson, null, 2));
  writeText(markdownPath, markdown);

  fs.rmSync(latestRoot, { recursive: true, force: true });
  ensureDir(latestRoot);
  copyFileIfPresent(resultsPath, path.join(latestRoot, "results.json"));
  copyFileIfPresent(markdownPath, path.join(latestRoot, "launch-gate-scorecard.md"));

  console.log("");
  console.log(`[launch-gate] Verdict: ${summary.verdict} (${summary.score}/100)`);
  console.log(`[launch-gate] Artifact: ${relativePath(markdownPath)}`);
  if (weaknesses.length) {
    console.log("[launch-gate] Top weaknesses:");
    weaknesses.forEach((item) => console.log(`  - ${item}`));
  }

  process.exit(summary.failCount > 0 ? 1 : 0);
};

main();
