#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn, spawnSync } = require("node:child_process");

const { loadLocalEnv } = require("./_lib/load-local-env.cjs");
const {
  REAL_SYNC_LOCAL_BASE_URL,
  buildRealSyncProofPlan,
  createRealSyncProofIdentity,
} = require("../e2e/real-sync-staging-helpers.js");

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

const artifactRoot = path.join(repoRoot, "artifacts", "staging-sync-proof", stamp);
const latestRoot = path.join(repoRoot, "artifacts", "staging-sync-proof", "latest");
const logsDir = path.join(artifactRoot, "logs");
const resultPath = path.join(artifactRoot, "result.json");
const markdownPath = path.join(artifactRoot, "staging-sync-proof.md");
const logPath = path.join(logsDir, "playwright.log");

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

const resetLatest = () => {
  fs.rmSync(latestRoot, { recursive: true, force: true });
  ensureDir(latestRoot);
  if (fs.existsSync(artifactRoot)) {
    copyRecursive(artifactRoot, latestRoot);
  }
};

const normalizeSlashes = (value = "") => String(value || "").replace(/\\/g, "/");
const relativeToRepo = (value = "") => normalizeSlashes(path.relative(repoRoot, value));

const parseJsonSafely = (value = "") => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const writeArtifact = (result = {}, logText = "") => {
  ensureDir(logsDir);
  fs.writeFileSync(logPath, logText || "", "utf8");
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");

  const markdown = [
    "# Staging Sync Proof",
    "",
    `- Generated: ${result.generatedAt || new Date().toISOString()}`,
    `- Status: ${result.status || "unknown"}`,
    `- Proof mode: ${result.proofMode || "unknown"}`,
    `- Base URL: ${result.baseUrl || "[missing]"}`,
    result.missing?.length ? `- Missing env: ${result.missing.join(", ")}` : "- Missing env: none",
    result.logPath ? `- Log: [${relativeToRepo(result.logPath)}](../${relativeToRepo(result.logPath)})` : "",
    "",
    "## Summary",
    "",
    result.summary || "No summary recorded.",
    "",
    "## Notes",
    "",
    ...(Array.isArray(result.notes) && result.notes.length
      ? result.notes.map((note) => `- ${note}`)
      : ["- No extra notes."]),
    "",
    "## Command",
    "",
    "```powershell",
    "npm run qa:sync:proof",
    "```",
    "",
  ].filter(Boolean).join("\n");

  fs.writeFileSync(markdownPath, markdown, "utf8");
  resetLatest();
};

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

const adminRequest = async ({
  supabaseUrl = "",
  serviceRoleKey = "",
  method = "GET",
  pathSuffix = "",
  body,
} = {}) => {
  const res = await fetch(`${String(supabaseUrl || "").replace(/\/+$/, "")}/auth/v1/admin${pathSuffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    res,
    text,
    json: parseJsonSafely(text),
  };
};

const provisionProofUser = async ({
  supabaseUrl = "",
  serviceRoleKey = "",
  stampValue = "",
} = {}) => {
  const identity = createRealSyncProofIdentity({ stamp: stampValue });
  const response = await adminRequest({
    supabaseUrl,
    serviceRoleKey,
    method: "POST",
    pathSuffix: "/users",
    body: {
      email: identity.email,
      password: identity.password,
      email_confirm: true,
      user_metadata: {
        source: "qa_sync_proof",
        label: identity.label,
      },
    },
  });
  if (!response.res.ok) {
    throw new Error(`Proof-user provisioning failed: ${response.res.status} ${response.text}`);
  }
  const userId = String(response.json?.id || response.json?.user?.id || "").trim();
  if (!userId) {
    throw new Error("Proof-user provisioning returned no user id.");
  }
  return {
    ...identity,
    userId,
  };
};

const deleteProofUser = async ({
  supabaseUrl = "",
  serviceRoleKey = "",
  userId = "",
} = {}) => {
  if (!userId) return;
  const response = await adminRequest({
    supabaseUrl,
    serviceRoleKey,
    method: "DELETE",
    pathSuffix: `/users/${encodeURIComponent(userId)}`,
  });
  if (!response.res.ok) {
    throw new Error(`Proof-user cleanup failed: ${response.res.status} ${response.text}`);
  }
};

const probePasswordGrant = async ({
  supabaseUrl = "",
  apiKey = "",
  email = "",
  password = "",
} = {}) => {
  const res = await fetch(`${String(supabaseUrl || "").replace(/\/+$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  const json = parseJsonSafely(text);
  return {
    ok: Boolean(res.ok && json?.access_token && json?.user?.id),
    status: res.status,
    message: String(json?.message || text || "").trim(),
  };
};

const startLocalRealBackendServer = async ({
  supabaseUrl = "",
  supabaseAnonKey = "",
} = {}) => {
  let serverOutput = "";
  const buildEnv = {
    ...process.env,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
  };
  const buildRun = spawnSync("cmd", ["/c", "npm run build"], {
    cwd: repoRoot,
    env: buildEnv,
    encoding: "utf8",
    shell: false,
    maxBuffer: 50 * 1024 * 1024,
  });
  const buildOutput = [buildRun.stdout || "", buildRun.stderr || ""].filter(Boolean).join("\n");
  if (buildRun.status !== 0) {
    throw new Error(`Local sync-proof build failed.\n${buildOutput}`.trim());
  }

  const server = spawn("cmd", ["/c", "npx.cmd serve dist -l 4173"], {
    cwd: repoRoot,
    env: buildEnv,
    stdio: "pipe",
  });
  server.stdout.on("data", (chunk) => {
    serverOutput += String(chunk || "");
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += String(chunk || "");
  });
  await waitForServer(REAL_SYNC_LOCAL_BASE_URL);
  return {
    baseUrl: REAL_SYNC_LOCAL_BASE_URL,
    getOutput: () => [buildOutput, serverOutput].filter(Boolean).join("\n"),
    stop: () => {
      if (!server?.pid) return;
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    },
  };
};

const main = async () => {
  loadLocalEnv({ cwd: repoRoot });
  ensureDir(logsDir);

  const initialPlan = buildRealSyncProofPlan(process.env);
  if (!initialPlan.canRun) {
    const result = {
      generatedAt: new Date().toISOString(),
      status: "SKIPPED",
      proofMode: initialPlan.proofMode,
      baseUrl: initialPlan.hasBaseUrl ? initialPlan.baseUrl : "",
      missing: initialPlan.blockingMissing,
      summary: "Real two-device sync proof could not run because the required backend or auth inputs are still missing in this workspace.",
      notes: [
        "This proof now falls back to a local build against the configured Supabase project when no remote app URL is set.",
        "When email/password test credentials are missing, the harness can provision a disposable proof user only if a service-role key is available.",
      ],
      logPath,
    };
    writeArtifact(result, "");
    console.log(`[sync-proof] SKIPPED - missing env: ${initialPlan.blockingMissing.join(", ")}`);
    console.log(`[sync-proof] Artifact: ${relativeToRepo(markdownPath)}`);
    process.exit(0);
  }

  let localServer = null;
  let provisionedUser = null;
  let executionLog = "";
  const notes = [];
  let result = null;

  try {
    let executionEmail = initialPlan.email;
    let executionPassword = initialPlan.password;

    if (initialPlan.usesProvisionedUser) {
      provisionedUser = await provisionProofUser({
        supabaseUrl: initialPlan.supabaseUrl,
        serviceRoleKey: initialPlan.serviceRoleKey,
        stampValue: stamp,
      });
      executionEmail = provisionedUser.email;
      executionPassword = provisionedUser.password;
      notes.push("Provisioned a disposable proof user through the Supabase admin API because no test email/password was configured locally.");
    }

    if (initialPlan.proofMode === "local_real_backend") {
      const authProbe = await probePasswordGrant({
        supabaseUrl: initialPlan.supabaseUrl,
        apiKey: initialPlan.supabaseAnonKey,
        email: executionEmail,
        password: executionPassword,
      });
      if (!authProbe.ok) {
        throw new Error(`Configured public auth key rejected password auth (${authProbe.status}${authProbe.message ? `: ${authProbe.message}` : ""}). Update SUPABASE_ANON_KEY before rerunning sync proof.`);
      }
    }

    let executionBaseUrl = initialPlan.baseUrl;
    if (initialPlan.proofMode === "local_real_backend") {
      localServer = await startLocalRealBackendServer({
        supabaseUrl: initialPlan.supabaseUrl,
        supabaseAnonKey: initialPlan.supabaseAnonKey,
      });
      executionBaseUrl = localServer.baseUrl;
      notes.push("Ran the browser proof against a local build wired to the configured real Supabase project because no remote staging URL was configured.");
    } else {
      notes.push("Ran the browser proof directly against the configured remote app URL.");
    }

    const executionEnv = {
      ...process.env,
      FORMA_E2E_BASE_URL: executionBaseUrl,
      SUPABASE_URL: initialPlan.supabaseUrl,
      SUPABASE_ANON_KEY: initialPlan.supabaseAnonKey,
      SUPABASE_TEST_EMAIL: executionEmail,
      SUPABASE_TEST_PASSWORD: executionPassword,
    };

    const spawned = spawnSync("cmd", ["/c", "npx playwright test e2e/real-sync-staging.spec.js --reporter=line"], {
      cwd: repoRoot,
      env: executionEnv,
      encoding: "utf8",
      shell: false,
      maxBuffer: 50 * 1024 * 1024,
    });

    executionLog = [
      localServer?.getOutput ? localServer.getOutput() : "",
      spawned.stdout || "",
      spawned.stderr || "",
    ].filter(Boolean).join("\n");

    const ok = spawned.status === 0;
    result = {
      generatedAt: new Date().toISOString(),
      status: ok ? "PASS" : "FAIL",
      proofMode: initialPlan.proofMode,
      baseUrl: executionBaseUrl,
      missing: [],
      exitCode: Number(spawned.status || 0),
      summary: ok
        ? "The real two-device sync proof completed successfully and verified signed-in cloud continuity, refresh persistence, and second-device parity."
        : "The real two-device sync proof failed. Inspect the attached Playwright log before calling sync trustworthy.",
      notes: [...notes],
      logPath,
    };
  } catch (error) {
    executionLog = [executionLog, error?.stack || error?.message || String(error)].filter(Boolean).join("\n");
    const message = String(error?.message || "").trim();
    result = {
      generatedAt: new Date().toISOString(),
      status: "FAIL",
      proofMode: initialPlan.proofMode,
      baseUrl: initialPlan.proofMode === "local_real_backend" ? REAL_SYNC_LOCAL_BASE_URL : initialPlan.baseUrl,
      missing: [],
      summary: message || "The sync proof harness failed before the browser verification could finish.",
      notes: [...notes],
      logPath,
    };
  } finally {
    if (provisionedUser?.userId) {
      try {
        await deleteProofUser({
          supabaseUrl: initialPlan.supabaseUrl,
          serviceRoleKey: initialPlan.serviceRoleKey,
          userId: provisionedUser.userId,
        });
        result?.notes?.push("Deleted the disposable proof user after the run.");
      } catch (cleanupError) {
        result?.notes?.push(`Disposable proof-user cleanup needs attention: ${cleanupError.message}`);
      }
    }
    if (localServer) {
      try {
        localServer.stop();
      } catch (stopError) {
        result?.notes?.push(`Local sync-proof server cleanup needs attention: ${stopError.message}`);
      }
    }
  }

  writeArtifact(result, executionLog);
  console.log(`[sync-proof] ${result.status}`);
  console.log(`[sync-proof] Artifact: ${relativeToRepo(markdownPath)}`);
  if (result.status !== "PASS") {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
