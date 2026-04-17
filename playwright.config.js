const { defineConfig } = require("@playwright/test");

const externalBaseURL = process.env.FORMA_E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "";
const useExternalBaseURL = Boolean(String(externalBaseURL || "").trim());
const defaultServiceWorkerMode = process.env.PLAYWRIGHT_SERVICE_WORKERS === "allow" ? "allow" : "block";

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  use: {
    baseURL: useExternalBaseURL ? externalBaseURL : "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    serviceWorkers: defaultServiceWorkerMode,
  },
  webServer: useExternalBaseURL
    ? undefined
    : {
      command: "cmd /c \"set VITE_SUPABASE_URL=https://example.supabase.co&& set VITE_SUPABASE_ANON_KEY=anon-key&& npm.cmd run build&& npx.cmd serve dist -l 4173\"",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 180_000,
    },
});
