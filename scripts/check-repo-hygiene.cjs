const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();

const trackedOutput = execFileSync("git", ["ls-files", "-z"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

const trackedFiles = trackedOutput
  .split("\0")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .filter((filePath) => fs.existsSync(path.join(ROOT, filePath)));

const allowedRootEntries = new Set([
  ".env.example",
  ".github",
  ".gitignore",
  "api",
  "bundlesize.config.js",
  "CLAUDE.md",
  "docs",
  "e2e",
  "fonts",
  "icons",
  "manifest.json",
  "package-lock.json",
  "package.json",
  "playwright.config.js",
  "README.md",
  "scripts",
  "service-worker.js",
  "splash",
  "src",
  "supabase",
  "tests",
  "vercel.json",
]);

const blockedTrackedPatterns = [
  /^index\.html$/,
  /^artifacts\//,
  /^dist\//,
  /^playwright-report\//,
  /^test-results\//,
  /^[^/]+\.patch$/i,
  /(^|\/)[^/]+\.(bak|orig|rej|tmp)$/i,
];

const unexpectedRootEntries = [...new Set(
  trackedFiles
    .map((filePath) => filePath.split("/")[0])
    .filter((entry) => !allowedRootEntries.has(entry))
)];

const blockedTrackedFiles = trackedFiles.filter((filePath) => (
  blockedTrackedPatterns.some((pattern) => pattern.test(filePath))
));

if (unexpectedRootEntries.length || blockedTrackedFiles.length) {
  console.error("Repo hygiene check failed.");
  if (unexpectedRootEntries.length) {
    console.error("\nUnexpected tracked repo-root entries:");
    unexpectedRootEntries.forEach((entry) => console.error(`- ${entry}`));
  }
  if (blockedTrackedFiles.length) {
    console.error("\nBlocked tracked generated/debris files:");
    blockedTrackedFiles.forEach((filePath) => console.error(`- ${filePath}`));
  }
  process.exit(1);
}

console.log("Repo hygiene check passed.");
