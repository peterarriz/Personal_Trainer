const { spawnSync } = require("child_process");
const path = require("path");

const parseArgs = (argv = process.argv.slice(2)) => {
  const readValue = (flag, fallback = "") => {
    const index = argv.indexOf(flag);
    return index >= 0 ? String(argv[index + 1] || fallback).trim() : fallback;
  };
  return {
    start: readValue("--start", "0"),
    count: readValue("--count", "25"),
    total: readValue("--total", "1000"),
    outputDir: readValue("--output-dir", path.join(process.cwd(), "artifacts", "launch-simulation", "browser-chunks")),
    outputFile: readValue("--output-file", ""),
    baseUrl: readValue("--base-url", process.env.FORMA_E2E_BASE_URL || ""),
    resume: readValue("--resume", "1"),
    failOnError: readValue("--fail-on-error", "0"),
  };
};

const main = () => {
  const args = parseArgs();
  const env = {
    ...process.env,
    LAUNCH_BROWSER_START: args.start,
    LAUNCH_BROWSER_COUNT: args.count,
    LAUNCH_BROWSER_TOTAL: args.total,
    LAUNCH_BROWSER_OUTPUT_DIR: args.outputDir,
    LAUNCH_BROWSER_RESUME: args.resume,
    LAUNCH_BROWSER_FAIL_ON_ERROR: args.failOnError,
  };

  if (args.outputFile) env.LAUNCH_BROWSER_OUTPUT_FILE = args.outputFile;
  if (args.baseUrl) env.FORMA_E2E_BASE_URL = args.baseUrl;

  const child = process.platform === "win32"
    ? spawnSync(
        "cmd.exe",
        ["/d", "/s", "/c", "npx playwright test e2e/launch-browser-chunk.spec.js --reporter=line"],
        {
          cwd: process.cwd(),
          env,
          stdio: "inherit",
        }
      )
    : spawnSync(
        "npx",
        ["playwright", "test", "e2e/launch-browser-chunk.spec.js", "--reporter=line"],
        {
          cwd: process.cwd(),
          env,
          stdio: "inherit",
        }
      );

  if (child.error) {
    console.error(child.error.stack || child.error.message || String(child.error));
    process.exit(1);
  }

  process.exit(child.status == null ? 1 : child.status);
};

main();
