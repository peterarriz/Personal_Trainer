#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { resolveRealSyncEnv } = require("../e2e/real-sync-staging-helpers.js");

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

const writeArtifact = (result = {}, logText = "") => {
  ensureDir(logsDir);
  fs.writeFileSync(logPath, logText || "", "utf8");
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");

  const markdown = [
    "# Staging Sync Proof",
    "",
    `- Generated: ${result.generatedAt || new Date().toISOString()}`,
    `- Status: ${result.status || "unknown"}`,
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

const env = resolveRealSyncEnv(process.env);
ensureDir(logsDir);

if (env.missing.length) {
  const result = {
    generatedAt: new Date().toISOString(),
    status: "SKIPPED",
    baseUrl: env.baseUrl || "",
    missing: env.missing,
    summary: "Real two-device staging sync proof was not run because the required staging environment variables are still missing in this workspace.",
    notes: [
      "Set the five required staging env vars before rerunning this proof.",
      "This artifact is still useful because it records exactly why the proof did not run instead of leaving the launch state ambiguous.",
      "The underlying browser proof remains e2e/real-sync-staging.spec.js.",
    ],
    logPath,
  };
  writeArtifact(result, "");
  console.log(`[sync-proof] SKIPPED - missing env: ${env.missing.join(", ")}`);
  console.log(`[sync-proof] Artifact: ${relativeToRepo(markdownPath)}`);
  process.exit(0);
}

const commandArgs = ["playwright", "test", "e2e/real-sync-staging.spec.js", "--reporter=line"];
const spawned = spawnSync("npx.cmd", commandArgs, {
  cwd: repoRoot,
  env: process.env,
  encoding: "utf8",
  shell: false,
});

const combinedLog = [spawned.stdout || "", spawned.stderr || ""].filter(Boolean).join("\n");
const ok = spawned.status === 0;
const result = {
  generatedAt: new Date().toISOString(),
  status: ok ? "PASS" : "FAIL",
  baseUrl: env.baseUrl || "",
  missing: [],
  exitCode: Number(spawned.status || 0),
  summary: ok
    ? "The real two-device staging sync proof completed successfully against the provided staging environment."
    : "The real two-device staging sync proof failed. Inspect the attached Playwright log before calling sync trustworthy.",
  notes: [
    "This command is the release-grade proof for signed-in cloud continuity, refresh persistence, and second-device parity.",
    "Use this artifact alongside the launch gate instead of relying on memory that staging was checked recently.",
  ],
  logPath,
};

writeArtifact(result, combinedLog);
console.log(`[sync-proof] ${result.status}`);
console.log(`[sync-proof] Artifact: ${relativeToRepo(markdownPath)}`);
if (!ok) {
  process.exit(spawned.status || 1);
}
