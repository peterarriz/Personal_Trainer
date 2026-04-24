#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { chromium } = require("@playwright/test");

const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("../e2e/auth-runtime-test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || fallback).trim() : fallback;
};

const requestedUrl = getArgValue("--url", "");
const outputRoot = getArgValue("--output", path.join("artifacts", "visual-review-pack"));
const reviewer = getArgValue("--reviewer", "");
const reviewNote = getArgValue("--note", "");
const reviewStatus = args.includes("--approve")
  ? "PASS"
  : args.includes("--reject")
  ? "FAIL"
  : "PENDING";
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
const outputDir = path.resolve(repoRoot, outputRoot, stamp);
const screenshotsDir = path.join(outputDir, "screenshots");
const summaryPath = path.join(outputDir, "summary.json");
const markdownPath = path.join(outputDir, "visual-review-pack.md");
const latestRoot = path.resolve(repoRoot, "artifacts", "visual-review-pack", "latest");
const localServerUrl = "http://127.0.0.1:4173";
const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "anon-key",
};

const ensureDir = (dirPath = "") => {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
};

const copyRecursive = (fromPath, toPath) => {
  const stats = fs.statSync(fromPath);
  if (stats.isDirectory()) {
    ensureDir(toPath);
    for (const entry of fs.readdirSync(fromPath)) {
      copyRecursive(path.join(fromPath, entry), path.join(toPath, entry));
    }
    return;
  }
  ensureDir(path.dirname(toPath));
  fs.copyFileSync(fromPath, toPath);
};

const relativeToRepo = (value = "") => path.relative(repoRoot, value).replace(/\\/g, "/");

const waitForServer = async (url, timeoutMs = 60_000) => {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const startStaticServer = async () => {
  execFileSync("cmd", ["/c", "npm run build"], {
    cwd: repoRoot,
    env: buildEnv,
    stdio: "inherit",
  });
  const server = spawn("cmd", ["/c", "npx.cmd serve dist -l 4173"], {
    cwd: repoRoot,
    env: buildEnv,
    stdio: "pipe",
  });
  server.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
  server.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));
  await waitForServer(localServerUrl);
  return server;
};

const withAppearance = (mode = "Dark") => {
  const payload = makeSignedInPayload();
  payload.personalization = payload.personalization || {};
  payload.personalization.settings = payload.personalization.settings || {};
  payload.personalization.settings.appearance = {
    theme: "Atlas",
    mode,
  };
  return payload;
};

const bootSignedInPage = async (page, { mode = "Dark", colorScheme = "dark", viewport = null } = {}) => {
  if (viewport) await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme });
  const session = makeSession();
  const payload = withAppearance(mode);
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload, path: "/" });
  await page.getByTestId("today-session-card").waitFor({ state: "visible" });
};

const openAuthGate = async (page, { viewport = null } = {}) => {
  if (viewport) await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const authGate = page.getByTestId("auth-gate");
  if (await authGate.isVisible().catch(() => false)) return;
  await page.getByTestId("app-tab-settings").click();
  await page.getByTestId("settings-surface-account").click();
  const openAuthButton = page.getByTestId("settings-open-auth-gate");
  if (await openAuthButton.isVisible().catch(() => false)) {
    await openAuthButton.click();
  }
  await authGate.waitFor({ state: "visible" });
};

const captureDefinitionList = [
  {
    id: "auth-desktop-dark",
    mode: "auth",
    viewport: { width: 1440, height: 1400 },
    colorScheme: "dark",
    summary: "Auth/account access on desktop",
  },
  {
    id: "today-desktop-dark",
    mode: "today",
    viewport: { width: 1440, height: 1600 },
    colorScheme: "dark",
    appearanceMode: "Dark",
    summary: "Today prescription hero in dark mode",
  },
  {
    id: "log-desktop-dark",
    mode: "log",
    viewport: { width: 1440, height: 1800 },
    colorScheme: "dark",
    appearanceMode: "Dark",
    summary: "Log surface in dark mode",
  },
  {
    id: "plan-desktop-dark",
    mode: "plan",
    viewport: { width: 1440, height: 1800 },
    colorScheme: "dark",
    appearanceMode: "Dark",
    summary: "Plan weekly orientation in dark mode",
  },
  {
    id: "nutrition-desktop-dark",
    mode: "nutrition",
    viewport: { width: 1440, height: 2200 },
    colorScheme: "dark",
    appearanceMode: "Dark",
    summary: "Nutrition today-first surface in dark mode",
  },
  {
    id: "settings-desktop-dark",
    mode: "settings",
    viewport: { width: 1440, height: 1800 },
    colorScheme: "dark",
    appearanceMode: "Dark",
    summary: "Settings trust surface in dark mode",
  },
  {
    id: "today-mobile-light",
    mode: "today",
    viewport: { width: 390, height: 1400 },
    colorScheme: "light",
    appearanceMode: "Light",
    summary: "Today on small-phone light mode",
  },
  {
    id: "plan-mobile-light",
    mode: "plan",
    viewport: { width: 390, height: 1500 },
    colorScheme: "light",
    appearanceMode: "Light",
    summary: "Plan on small-phone light mode",
  },
];

const captureSurface = async (page, definition, baseUrl) => {
  const screenshotPath = path.join(screenshotsDir, `${definition.id}.png`);
  if (definition.mode === "auth") {
    await openAuthGate(page, { viewport: definition.viewport });
    await page.getByTestId("auth-gate").screenshot({ path: screenshotPath });
    return screenshotPath;
  }

  await bootSignedInPage(page, {
    mode: definition.appearanceMode || "Dark",
    colorScheme: definition.colorScheme || "dark",
    viewport: definition.viewport,
  });

  if (definition.mode === "today") {
    await page.getByTestId("today-tab").waitFor({ state: "visible" });
  } else if (definition.mode === "log") {
    await page.getByTestId("app-tab-log").click();
    await page.getByTestId("log-tab").waitFor({ state: "visible" });
  } else if (definition.mode === "plan") {
    await page.getByTestId("app-tab-program").click();
    await page.getByTestId("program-tab").waitFor({ state: "visible" });
  } else if (definition.mode === "nutrition") {
    await page.getByTestId("app-tab-nutrition").click();
    await page.getByTestId("nutrition-tab").waitFor({ state: "visible" });
  } else if (definition.mode === "settings") {
    await page.getByTestId("app-tab-settings").click();
    await page.getByTestId("settings-tab").waitFor({ state: "visible" });
    await page.getByTestId("settings-surface-account").click();
    await page.getByTestId("settings-account-section").waitFor({ state: "visible" });
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
};

const writeSummary = ({ baseUrl = "", results = [] } = {}) => {
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    reviewer: reviewer || "",
    reviewStatus,
    reviewNotes: reviewNote ? [reviewNote] : [],
    reviewedAt: reviewer || reviewStatus !== "PENDING" ? new Date().toISOString() : "",
    captures: results.map((result) => ({
      id: result.id,
      summary: result.summary,
      file: path.basename(result.path),
    })),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  const markdown = [
    "# Visual Review Pack",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Base URL: ${baseUrl}`,
    "",
    "## Review",
    "",
    `- Status: ${summary.reviewStatus}`,
    `- Reviewer: ${summary.reviewer || "[pending]"}`,
    `- Reviewed at: ${summary.reviewedAt || "[pending]"}`,
    ...(summary.reviewNotes.length
      ? ["", ...summary.reviewNotes.map((note) => `- ${note}`)]
      : []),
    "",
    "## Captures",
    "",
    ...results.map((result) => `- ${result.id}: ${result.summary} ([${path.basename(result.path)}](./screenshots/${path.basename(result.path)}))`),
    "",
    "## How To Use",
    "",
    "- Review these images next to the current launch gate scorecard.",
    "- Look for hierarchy drift, clipped content, weak CTA emphasis, and theme inconsistency.",
    "- This is a proxy pack, not a replacement for live device QA.",
    "",
  ].join("\n");
  fs.writeFileSync(markdownPath, markdown, "utf8");
};

const resetLatest = () => {
  fs.rmSync(latestRoot, { recursive: true, force: true });
  ensureDir(latestRoot);
  copyRecursive(outputDir, latestRoot);
};

(async () => {
  ensureDir(screenshotsDir);
  const baseUrl = requestedUrl || localServerUrl;
  const server = requestedUrl ? null : await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const definition of captureDefinitionList) {
      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: definition.viewport,
      });
      const page = await context.newPage();
      const pathForCapture = await captureSurface(page, definition, baseUrl);
      results.push({
        id: definition.id,
        summary: definition.summary,
        path: pathForCapture,
      });
      await context.close();
    }
  } finally {
    await browser.close();
    if (server?.pid) {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    }
  }

  writeSummary({ baseUrl, results });
  resetLatest();
  console.log(`[visual-review] Captured ${results.length} screenshots.`);
  console.log(`[visual-review] Artifact: ${relativeToRepo(markdownPath)}`);
})().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
