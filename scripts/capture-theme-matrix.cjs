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

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "theme-matrix");
const SERVER_URL = "http://127.0.0.1:4173";
const BUILD_ENV = {
  ...process.env,
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-key",
};

const waitForServer = async (url, timeoutMs = 60_000) => {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      // Wait for the server to come up.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const startStaticServer = async () => {
  execFileSync("npm.cmd", ["run", "build"], {
    shell: true,
    cwd: ROOT,
    env: BUILD_ENV,
    stdio: "inherit",
  });

  const server = spawn("cmd", ["/c", "npx.cmd serve dist -l 4173"], {
    cwd: ROOT,
    env: BUILD_ENV,
    stdio: "pipe",
  });

  server.stdout.on("data", (chunk) => process.stdout.write(String(chunk)));
  server.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));

  await waitForServer(SERVER_URL);
  return server;
};

const openAppearancePreferences = async (page, {
  mode = "Dark",
  colorScheme = "dark",
} = {}) => {
  await page.emulateMedia({ colorScheme });
  const session = makeSession();
  const payload = makeSignedInPayload();
  payload.personalization.settings.appearance = { theme: "Atlas", mode };
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await page.getByTestId("app-tab-settings").click();
  await page.getByTestId("settings-surface-preferences").click();
  await page.getByTestId("settings-appearance-section").waitFor();
};

const captureMatrix = async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: SERVER_URL,
    viewport: { width: 1440, height: 1700 },
  });
  const page = await context.newPage();
  const variants = [
    { file: "dark", mode: "Dark", colorScheme: "dark" },
    { file: "light", mode: "Light", colorScheme: "light" },
    { file: "system-dark", mode: "System", colorScheme: "dark" },
    { file: "system-light", mode: "System", colorScheme: "light" },
  ];

  try {
    for (const variant of variants) {
      await openAppearancePreferences(page, variant);
      await page.getByTestId("settings-appearance-section").screenshot({
        path: path.join(OUTPUT_DIR, `${variant.file}.png`),
      });
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      url: SERVER_URL,
      files: variants.map((variant) => ({
        file: `${variant.file}.png`,
        mode: variant.mode,
        colorScheme: variant.colorScheme,
      })),
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  } finally {
    await context.close();
    await browser.close();
    if (server?.pid) {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    }
  }
};

captureMatrix().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
