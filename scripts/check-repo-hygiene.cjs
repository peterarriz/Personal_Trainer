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

const textGuardRoots = [/^src\//, /^api\//, /^tests\//];
const textGuardExtensions = /\.(js|jsx|ts|tsx|md)$/i;
const textGuardExclusions = new Set([
  "src/services/text-format-service.js",
]);
const bannedTextSequences = [
  { label: "em dash", value: "\u2014" },
  { label: "mojibake bullet", value: "\u00c2\u00b7" },
  { label: "mojibake multiply", value: "\u00c3\u00d7" },
  { label: "mojibake euro-cluster", value: "\u00e2\u20ac" },
];

const unexpectedRootEntries = [...new Set(
  trackedFiles
    .map((filePath) => filePath.split("/")[0])
    .filter((entry) => !allowedRootEntries.has(entry))
)];

const blockedTrackedFiles = trackedFiles.filter((filePath) => (
  blockedTrackedPatterns.some((pattern) => pattern.test(filePath))
));

const computeLineAndColumn = (source = "", offset = 0) => {
  const slice = source.slice(0, offset);
  const lines = slice.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length || 0) + 1,
  };
};

const textGuardFiles = trackedFiles.filter((filePath) => (
  !textGuardExclusions.has(filePath)
  && textGuardExtensions.test(filePath)
  && textGuardRoots.some((pattern) => pattern.test(filePath))
));

const bannedTextHits = [];
for (const filePath of textGuardFiles) {
  const absolutePath = path.join(ROOT, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  bannedTextSequences.forEach(({ label, value }) => {
    let offset = source.indexOf(value);
    while (offset !== -1) {
      const { line, column } = computeLineAndColumn(source, offset);
      const lineText = source.split("\n")[line - 1] || "";
      bannedTextHits.push({
        filePath,
        label,
        line,
        column,
        excerpt: lineText.trim(),
      });
      offset = source.indexOf(value, offset + value.length);
    }
  });
}

if (unexpectedRootEntries.length || blockedTrackedFiles.length || bannedTextHits.length) {
  console.error("Repo hygiene check failed.");
  if (unexpectedRootEntries.length) {
    console.error("\nUnexpected tracked repo-root entries:");
    unexpectedRootEntries.forEach((entry) => console.error(`- ${entry}`));
  }
  if (blockedTrackedFiles.length) {
    console.error("\nBlocked tracked generated/debris files:");
    blockedTrackedFiles.forEach((filePath) => console.error(`- ${filePath}`));
  }
  if (bannedTextHits.length) {
    console.error("\nBanned text encoding or punctuation hits:");
    bannedTextHits.forEach(({ filePath, label, line, column, excerpt }) => {
      console.error(`- ${filePath}:${line}:${column} [${label}] ${excerpt}`);
    });
  }
  process.exit(1);
}

console.log("Repo hygiene check passed.");
