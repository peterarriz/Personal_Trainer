#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium, devices } = require("@playwright/test");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const ARTIFACT_ROOT = path.join(ROOT, "artifacts", "performance", "mobile-profile");
const BUILD_SCRIPT = path.join(ROOT, "scripts", "build.js");
const MID_TIER_PROFILE = Object.freeze({
  deviceName: "Pixel 5 emulation",
  cpuSlowdownRate: 4,
  network: {
    latency: 150,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 90 * 1024,
    connectionType: "cellular4g",
  },
});
const BASE_ENV = {
  ...process.env,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "anon-key",
};
const NPM_EXECUTABLE = process.platform === "win32" ? "npm.cmd" : "npm";

const timestamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readBuildMeta = () => JSON.parse(fs.readFileSync(path.join(DIST, "build-meta.json"), "utf8"));

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: BASE_ENV,
    ...options,
  });
  child.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
  });
  child.on("error", reject);
});

const waitForHttp = (url, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  const deadline = Date.now() + timeoutMs;
  const attempt = () => {
    const request = http.get(url, (response) => {
      response.resume();
      if (response.statusCode >= 200 && response.statusCode < 500) {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
      } else {
        setTimeout(attempt, 250);
      }
    });
    request.on("error", () => {
      if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${url}`));
      else setTimeout(attempt, 250);
    });
  };
  attempt();
});

const startStaticServer = async (port) => {
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/c", "npx.cmd", "serve", "dist", "-l", String(port)], {
      cwd: ROOT,
      env: BASE_ENV,
      stdio: "pipe",
    })
    : spawn("npx", ["serve", "dist", "-l", String(port)], {
      cwd: ROOT,
      env: BASE_ENV,
      stdio: "pipe",
    });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await waitForHttp(`http://127.0.0.1:${port}/`);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`Static server failed to start.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return {
    port,
    child,
    stop: async () => {
      if (process.platform === "win32") {
        await new Promise((resolve) => {
          const killer = spawn("cmd.exe", ["/c", "taskkill", "/pid", String(child.pid), "/t", "/f"], {
            cwd: ROOT,
            stdio: "ignore",
          });
          killer.on("exit", () => resolve());
          killer.on("error", () => resolve());
        });
        return;
      }
      child.kill("SIGTERM");
      await wait(500);
      if (!child.killed) child.kill("SIGKILL");
    },
  };
};

const attachMobileConditions = async (page) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: MID_TIER_PROFILE.network.latency,
    downloadThroughput: MID_TIER_PROFILE.network.downloadThroughput,
    uploadThroughput: MID_TIER_PROFILE.network.uploadThroughput,
    connectionType: MID_TIER_PROFILE.network.connectionType,
  });
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: MID_TIER_PROFILE.cpuSlowdownRate,
  });
  return session;
};

const initPageState = async (page) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      // ignore
    }
  });
};

const readRuntimeMetrics = async (page) => {
  await page.waitForFunction(() => Boolean(window.__FORMA_BOOT_METRICS__?.interactiveAt), null, { timeout: 60_000 });
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paintEntries = performance.getEntriesByType("paint");
    const paintMap = Object.fromEntries(paintEntries.map((entry) => [entry.name, Math.round(entry.startTime)]));
    const resourceEntries = performance.getEntriesByType("resource");
    const resourceTransferSize = resourceEntries.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0);
    const boot = window.__FORMA_BOOT_METRICS__ || {};
    return {
      responseStartMs: Math.round(nav?.responseStart || 0),
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd || 0),
      loadEventEndMs: Math.round(nav?.loadEventEnd || 0),
      firstPaintMs: paintMap["first-paint"] || null,
      firstContentfulPaintMs: paintMap["first-contentful-paint"] || null,
      interactiveMs: Math.round(boot.interactiveAt || 0),
      htmlTransferBytes: Number(nav?.transferSize || 0),
      totalTransferBytes: Number(nav?.transferSize || 0) + resourceTransferSize,
      resourceCount: resourceEntries.length,
      initialSurface: boot.initialSurface || "",
      serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    };
  });
};

const waitForShell = async (page) => {
  await page.waitForFunction(() => {
    const buildError = document.body?.innerText?.includes?.("BUILD ERROR");
    if (buildError) throw new Error("Build error rendered in root.");
    return Boolean(
      window.__FORMA_BOOT_METRICS__?.interactiveAt
      || document.querySelector("[data-testid='auth-gate']")
      || document.querySelector("[data-testid='today-tab']")
    );
  }, null, { timeout: 60_000 });
};

const navigateAndMeasure = async (page, url, action = "goto") => {
  if (action === "reload") await page.reload({ waitUntil: "load" });
  else await page.goto(url, { waitUntil: "load" });
  await waitForShell(page);
  return readRuntimeMetrics(page);
};

const measureMode = async ({ mode, port }) => {
  await runCommand(process.execPath, [BUILD_SCRIPT, `--mode=${mode}`]);
  const buildMeta = readBuildMeta();
  const server = await startStaticServer(port);
  const browser = await chromium.launch({ headless: true });
  const baseURL = `http://127.0.0.1:${port}/`;
  const contextOptions = {
    ...devices["Pixel 5"],
    baseURL,
  };

  try {
    const coldContext = await browser.newContext({
      ...contextOptions,
      serviceWorkers: "block",
    });
    const coldPage = await coldContext.newPage();
    await initPageState(coldPage);
    await attachMobileConditions(coldPage);
    const cold = await navigateAndMeasure(coldPage, baseURL, "goto");
    const warm = await navigateAndMeasure(coldPage, baseURL, "reload");

    const repeatPage = await coldContext.newPage();
    await attachMobileConditions(repeatPage);
    const repeatVisit = await navigateAndMeasure(repeatPage, baseURL, "goto");
    await coldContext.close();

    let serviceWorkerAssisted = {
      supported: false,
      reason: "Service worker control was not available for this build.",
    };

    if (mode === "split") {
      const swContext = await browser.newContext({
        ...contextOptions,
        serviceWorkers: "allow",
      });
      const swPage = await swContext.newPage();
      await initPageState(swPage);
      const swSession = await attachMobileConditions(swPage);
      await navigateAndMeasure(swPage, baseURL, "goto");
      await swPage.waitForFunction(() => navigator.serviceWorker?.ready, null, { timeout: 30_000 });
      await swPage.reload({ waitUntil: "load" });
      await swPage.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30_000 });
      await swSession.send("Network.emulateNetworkConditions", {
        offline: true,
        latency: MID_TIER_PROFILE.network.latency,
        downloadThroughput: MID_TIER_PROFILE.network.downloadThroughput,
        uploadThroughput: MID_TIER_PROFILE.network.uploadThroughput,
        connectionType: MID_TIER_PROFILE.network.connectionType,
      });
      const offlineRepeat = await navigateAndMeasure(swPage, baseURL, "goto");
      serviceWorkerAssisted = {
        supported: true,
        offlineRepeat,
      };
      await swContext.close();
    }

    return {
      mode,
      buildMeta,
      scenarios: {
        cold,
        warm,
        repeatVisit,
        serviceWorkerAssisted,
      },
    };
  } finally {
    await browser.close();
    await server.stop();
  }
};

const toKb = (bytes) => `${(Number(bytes || 0) / 1024).toFixed(1)} KB`;

const buildMarkdown = ({ results, outputDir }) => {
  const [inlineResult, splitResult] = results;
  const inlineCold = inlineResult.scenarios.cold;
  const splitCold = splitResult.scenarios.cold;
  const splitWarm = splitResult.scenarios.warm;
  const splitRepeat = splitResult.scenarios.repeatVisit;
  const splitSw = splitResult.scenarios.serviceWorkerAssisted;

  return `# FORMA Mobile Performance Audit

Generated: ${new Date().toISOString()}

## Harness

- Device profile: ${MID_TIER_PROFILE.deviceName}
- CPU slowdown: ${MID_TIER_PROFILE.cpuSlowdownRate}x
- Network: ${MID_TIER_PROFILE.network.connectionType}, ${MID_TIER_PROFILE.network.latency} ms RTT, ${Math.round((MID_TIER_PROFILE.network.downloadThroughput * 8) / 1024)} kbps down, ${Math.round((MID_TIER_PROFILE.network.uploadThroughput * 8) / 1024)} kbps up
- Browser: Playwright Chromium
- Baseline build: legacy inline single-file HTML
- Candidate build: split cacheable asset build with service worker registration

## Build Size

| Build | index.html | app JS | vendor JS | asset files |
| --- | ---: | ---: | ---: | ---: |
| Inline | ${toKb(inlineResult.buildMeta.htmlBytes)} | ${toKb(inlineResult.buildMeta.appBytes)} | ${toKb(inlineResult.buildMeta.vendorBytes)} | ${inlineResult.buildMeta.assets.length} |
| Split | ${toKb(splitResult.buildMeta.htmlBytes)} | ${toKb(splitResult.buildMeta.appBytes)} | ${toKb(splitResult.buildMeta.vendorBytes)} | ${splitResult.buildMeta.assets.length} |

## Timing

| Scenario | Build | FCP | Interactive | Load event | Transfer |
| --- | --- | ---: | ---: | ---: | ---: |
| Cold | Inline | ${inlineCold.firstContentfulPaintMs ?? "n/a"} ms | ${inlineCold.interactiveMs} ms | ${inlineCold.loadEventEndMs} ms | ${toKb(inlineCold.totalTransferBytes)} |
| Cold | Split | ${splitCold.firstContentfulPaintMs ?? "n/a"} ms | ${splitCold.interactiveMs} ms | ${splitCold.loadEventEndMs} ms | ${toKb(splitCold.totalTransferBytes)} |
| Warm reload | Split | ${splitWarm.firstContentfulPaintMs ?? "n/a"} ms | ${splitWarm.interactiveMs} ms | ${splitWarm.loadEventEndMs} ms | ${toKb(splitWarm.totalTransferBytes)} |
| Repeat visit | Split | ${splitRepeat.firstContentfulPaintMs ?? "n/a"} ms | ${splitRepeat.interactiveMs} ms | ${splitRepeat.loadEventEndMs} ms | ${toKb(splitRepeat.totalTransferBytes)} |
| SW-assisted offline repeat | Split | ${splitSw.supported ? `${splitSw.offlineRepeat.firstContentfulPaintMs ?? "n/a"} ms` : "unsupported"} | ${splitSw.supported ? `${splitSw.offlineRepeat.interactiveMs} ms` : "unsupported"} | ${splitSw.supported ? `${splitSw.offlineRepeat.loadEventEndMs} ms` : "unsupported"} | ${splitSw.supported ? toKb(splitSw.offlineRepeat.totalTransferBytes) : "unsupported"} |

## Findings

- The legacy build is dominated by one oversized HTML document. Every cold load reparses framework code, Supabase, and app code inside the document before the app can become interactive.
- The split build makes 'index.html' tiny and cacheable, then shifts the cost to dedicated JS assets the browser and service worker can reuse.
- Warm and repeat visits are the main win. The split build removes repeated HTML re-download and repeated inline script parse from the critical path.
- Service-worker-assisted repeat behavior is only available in the split build because the legacy inline build never registered a service worker.

## Recommendation

- Do not keep the inline single-file build as the production architecture.
- Ship the split cacheable build now.
- Still plan a later migration to a fully modern chunked pipeline if FORMA needs materially better cold-start parse time, because the current split build still ships one large app bundle.

## Artifacts

- JSON results: [mobile-profile-results.json](${path.join(outputDir, "mobile-profile-results.json").replace(/\\/g, "/")})
`;
};

(async () => {
  const outputDir = path.join(ARTIFACT_ROOT, timestamp());
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("Profiling legacy inline build...");
  const inlineResult = await measureMode({ mode: "inline", port: 4281 });
  console.log("Profiling split build...");
  const splitResult = await measureMode({ mode: "split", port: 4282 });

  const results = [inlineResult, splitResult];
  fs.writeFileSync(
    path.join(outputDir, "mobile-profile-results.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      profile: MID_TIER_PROFILE,
      results,
    }, null, 2)
  );
  const markdown = buildMarkdown({ results, outputDir });
  fs.writeFileSync(path.join(outputDir, "mobile-performance-summary.md"), markdown);

  console.log(markdown);
  console.log(`Saved artifacts to ${outputDir}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
