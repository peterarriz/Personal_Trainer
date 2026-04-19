const fs = require("fs");
const path = require("path");

const { chromium } = require("@playwright/test");

const {
  assertSyntheticLabSafeEnvironment,
} = require("../src/services/synthetic-athlete-lab/env-guard.js");
const {
  LAUNCH_SIMULATION_PERSONA_COUNT,
  LAUNCH_SIMULATION_WEEKS,
} = require("../src/services/synthetic-athlete-lab/launch-persona-generator.js");
const {
  buildLaunchSimulationArtifacts,
  refreshLaunchSimulationFromExisting,
  runLaunchSimulation,
} = require("../src/services/synthetic-athlete-lab/launch-simulation-service.js");

const ARTIFACT_ROOT = path.join(process.cwd(), "artifacts", "launch-simulation");
const DEPLOYED_BASE_URL = "https://personal-trainer-snowy-tau.vercel.app";

const MODE_CONFIG = Object.freeze({
  quick: {
    personaCount: 120,
    weeks: 52,
    shouldProbeDeployment: false,
  },
  full: {
    personaCount: LAUNCH_SIMULATION_PERSONA_COUNT,
    weeks: LAUNCH_SIMULATION_WEEKS,
    shouldProbeDeployment: false,
  },
  deployed: {
    personaCount: LAUNCH_SIMULATION_PERSONA_COUNT,
    weeks: LAUNCH_SIMULATION_WEEKS,
    shouldProbeDeployment: true,
  },
  report: {
    personaCount: LAUNCH_SIMULATION_PERSONA_COUNT,
    weeks: LAUNCH_SIMULATION_WEEKS,
    shouldProbeDeployment: false,
    readExisting: true,
  },
});

const parseArgs = (argv = process.argv.slice(2)) => {
  const modeIndex = argv.indexOf("--mode");
  const personaCountIndex = argv.indexOf("--count");
  const weeksIndex = argv.indexOf("--weeks");
  const baseUrlIndex = argv.indexOf("--base-url");
  const mode = modeIndex >= 0 ? String(argv[modeIndex + 1] || "full").trim().toLowerCase() : "full";
  return {
    mode,
    personaCount: personaCountIndex >= 0 ? Number(argv[personaCountIndex + 1] || 0) : 0,
    weeks: weeksIndex >= 0 ? Number(argv[weeksIndex + 1] || 0) : 0,
    baseUrl: baseUrlIndex >= 0 ? String(argv[baseUrlIndex + 1] || "").trim() : "",
  };
};

const ensureDir = (dirPath = "") => {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
};

const writeTextFile = (filePath = "", content = "") => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ""), "utf8");
};

const loadExistingResults = () => {
  const resultsPath = path.join(ARTIFACT_ROOT, "results.json");
  if (!fs.existsSync(resultsPath)) {
    throw new Error("No prior launch-simulation results found. Run qa:launch-simulation or qa:launch-simulation:quick first.");
  }
  return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
};

const loadExistingJsonArtifact = (fileName = "") => {
  const filePath = path.join(ARTIFACT_ROOT, fileName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const writeArtifacts = ({
  simulation = null,
} = {}) => {
  const artifacts = buildLaunchSimulationArtifacts({
    personas: simulation?.personas || [],
    personaCoverage: simulation?.personaCoverage || {},
    results: simulation || {},
    issueClusters: simulation?.issueClusters || [],
  });

  writeTextFile(path.join(ARTIFACT_ROOT, "personas.json"), artifacts.personasJson);
  writeTextFile(path.join(ARTIFACT_ROOT, "persona-coverage.json"), artifacts.personaCoverageJson);
  writeTextFile(path.join(ARTIFACT_ROOT, "results.json"), artifacts.resultsJson);
  writeTextFile(path.join(ARTIFACT_ROOT, "issue-clusters.json"), artifacts.issueClustersJson);
  writeTextFile(path.join(ARTIFACT_ROOT, "launch-report.md"), artifacts.launchReportMarkdown);
  writeTextFile(path.join(ARTIFACT_ROOT, "top-persona-narratives.md"), artifacts.topPersonaNarrativesMarkdown);
  writeTextFile(path.join(ARTIFACT_ROOT, "fix-plan.md"), artifacts.fixPlanMarkdown);
};

const readAuthShellMetrics = async (page) => page.evaluate(() => {
  const rail = document.querySelector('[data-testid="auth-entry-rail"]');
  const form = document.querySelector('[data-testid="auth-entry-form"]');
  const localCta = document.querySelector('[data-testid="continue-local-mode"]');
  const bounds = (node) => {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    const rect = node.getBoundingClientRect();
    return {
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1)),
      top: Number(rect.top.toFixed(1)),
      left: Number(rect.left.toFixed(1)),
    };
  };
  return {
    title: document.title || "",
    authGateVisible: Boolean(document.querySelector('[data-testid="auth-gate"]')),
    localFallbackVisible: Boolean(localCta),
    railBounds: bounds(rail),
    formBounds: bounds(form),
  };
});

const probeDeployment = async ({
  baseUrl = DEPLOYED_BASE_URL,
  outputDir = ARTIFACT_ROOT,
} = {}) => {
  ensureDir(path.join(outputDir, "screenshots"));
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  try {
    const profiles = [
      {
        id: "desktop",
        viewport: { width: 1440, height: 1100 },
      },
      {
        id: "mobile",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    ];
    for (const profile of profiles) {
      const context = await browser.newContext(profile);
      const page = await context.newPage();
      const screenshotPath = path.join(outputDir, "screenshots", `deployed-auth-${profile.id}.png`);
      try {
        const response = await page.goto(baseUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const metrics = await readAuthShellMetrics(page);
        runs.push({
          personaId: `probe_${profile.id}`,
          ok: Boolean(response && response.ok()),
          accessibilityChecked: profile.id === "mobile",
          path: [`Open ${baseUrl} on ${profile.id}`],
          screenshots: [screenshotPath],
          traces: [],
          title: `${profile.id} auth surface probe`,
          categories: ["visual/polish problem"],
          severity: "low",
          rootCauseHypothesis: metrics.localFallbackVisible
            ? "Consumer auth entry is still exposing a local fallback."
            : "No immediate auth-surface failure detected.",
          recommendedFix: metrics.localFallbackVisible
            ? "Hide local fallback for first-time consumer access and require account creation first."
            : "No immediate change required from this probe alone.",
          expectedUserImpact: metrics.localFallbackVisible
            ? "New users can bypass account-backed onboarding."
            : "Auth gate is visually reachable on this profile.",
          metrics,
          responseStatus: response?.status?.() || null,
        });
      } catch (error) {
        runs.push({
          personaId: `probe_${profile.id}`,
          ok: false,
          accessibilityChecked: profile.id === "mobile",
          path: [`Open ${baseUrl} on ${profile.id}`],
          screenshots: fs.existsSync(screenshotPath) ? [screenshotPath] : [],
          traces: [],
          title: `${profile.id} deployed reachability failure`,
          categories: ["flaky-test/instrumentation issue"],
          severity: "high",
          rootCauseHypothesis: error?.message || "Reachability probe failed.",
          recommendedFix: "Check the deployed app, runtime logs, or platform routing.",
          expectedUserImpact: "Users on this profile may not even reach the app shell.",
          metrics: null,
          responseStatus: null,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return {
    reachable: runs.some((run) => run.ok),
    baseUrl,
    runs,
  };
};

const buildBrowserResultsFromReachability = (reachability = null, {
  targetPersonaCount = 0,
} = {}) => {
  const runs = Array.isArray(reachability?.runs) ? reachability.runs : [];
  return {
    mode: "deployed_smoke_probe",
    targetPersonaCount,
    attemptedPersonaCount: runs.length,
    passedPersonaCount: runs.filter((run) => run.ok).length,
    runs,
    reachability,
  };
};

const main = async () => {
  const args = parseArgs();
  const modeConfig = MODE_CONFIG[args.mode] || MODE_CONFIG.full;

  ensureDir(ARTIFACT_ROOT);

  if (modeConfig.readExisting) {
    const existing = loadExistingResults();
    writeArtifacts({ simulation: existing });
    console.log(JSON.stringify({
      mode: args.mode,
      artifactRoot: ARTIFACT_ROOT,
      reusedExistingResults: true,
      verdict: existing?.verdict?.verdict || null,
    }, null, 2));
    return;
  }

  if (!modeConfig.shouldProbeDeployment) {
    assertSyntheticLabSafeEnvironment(process.env);
  }

  const personaCount = Number.isFinite(args.personaCount) && args.personaCount > 0
    ? args.personaCount
    : modeConfig.personaCount;
  const weeks = Number.isFinite(args.weeks) && args.weeks > 0
    ? args.weeks
    : modeConfig.weeks;

  let deployedReachability = null;
  let browserResults = null;
  if (modeConfig.shouldProbeDeployment) {
    deployedReachability = await probeDeployment({
      baseUrl: args.baseUrl || process.env.FORMA_E2E_BASE_URL || DEPLOYED_BASE_URL,
      outputDir: ARTIFACT_ROOT,
    });
    browserResults = buildBrowserResultsFromReachability(deployedReachability, {
      targetPersonaCount: personaCount,
    });
  }

  const existingResults = modeConfig.shouldProbeDeployment ? loadExistingResults() : null;
  const simulation = existingResults
    ? refreshLaunchSimulationFromExisting({
        existingResults: {
          ...existingResults,
          personas: loadExistingJsonArtifact("personas.json") || [],
          personaCoverage: loadExistingJsonArtifact("persona-coverage.json") || {},
        },
        browserResults,
        deployedReachability,
        mode: args.mode,
      })
    : runLaunchSimulation({
        personaCount,
        weeks,
        browserResults,
        deployedReachability,
        implementedFixIds: ["anonymous_access_before_account"],
        mode: args.mode,
      });

  writeArtifacts({ simulation });

  console.log(JSON.stringify({
    mode: args.mode,
    artifactRoot: ARTIFACT_ROOT,
    verdict: simulation?.verdict?.verdict || null,
    blockingReasons: simulation?.verdict?.blockingReasons || [],
    summary: {
      personaCount: simulation?.deterministicReport?.summary?.personaCount || 0,
      simulationWeeks: simulation?.deterministicReport?.summary?.simulationWeeks || 0,
      checkpointWeekCount: simulation?.deterministicReport?.summary?.checkpointWeekCount || 0,
      browserAttemptedPersonaCount: simulation?.browserSummary?.attemptedPersonaCount || 0,
      browserComplete: simulation?.browserSummary?.complete || false,
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
