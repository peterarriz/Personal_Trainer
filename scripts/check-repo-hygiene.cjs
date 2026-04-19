const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();

const allowedRootEntries = new Set([
  ".env.example",
  ".github",
  ".gitignore",
  "api",
  "bundlesize.config.js",
  "CLAUDE.md",
  "config",
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
  /^supabase\/\.temp\//,
  /^test-results\//,
  /^[^/]+\.patch$/i,
  /(^|\/)[^/]+\.(bak|orig|rej|tmp)$/i,
];

const textGuardRoots = [/^src\//, /^api\//, /^tests\//, /^e2e\//];
const textGuardExtensions = /\.(js|jsx|ts|tsx|md)$/i;
const bannedTextRules = Object.freeze([
  { label: "em dash", pattern: /\u2014/g },
  { label: "mojibake bullet", pattern: /\u00c2\u00b7/g },
  { label: "mojibake degree", pattern: /\u00c2\u00b0/g },
  { label: "mojibake multiply", pattern: /\u00c3\u00d7/g },
  { label: "mojibake apostrophe", pattern: /\u00e2\u20ac\u2122/g },
  { label: "mojibake dash", pattern: /\u00e2\u20ac[\u201c\u201d]/g },
  { label: "mojibake ellipsis", pattern: /\u00e2\u20ac\u00a6/g },
  { label: "mojibake quote", pattern: /\u00e2\u20ac(?:\u0153|\u009d)/g },
  { label: "multi-pass mojibake", pattern: /(?:\u00c3\u0192|\u00c3\u00a2\u00e2\u201a\u00ac|\u00c3\u00af\u00c2\u00bf\u00c2\u00bd)/g },
]);

const computeLineAndColumn = (source = "", offset = 0) => {
  const slice = source.slice(0, offset);
  const lines = slice.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length || 0) + 1,
  };
};

const getTrackedFiles = (root = ROOT) => {
  const trackedOutput = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });

  return trackedOutput
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((filePath) => fs.existsSync(path.join(root, filePath)));
};

const isBlockedTrackedEnvFile = (filePath = "") => {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath) return false;
  if (normalizedPath === ".env.example") return false;
  return /(^|\/)\.env(?:\.[^/]+)?(?:\.local)?$/i.test(normalizedPath);
};

const decodeJwtPayload = (token = "") => {
  const [, payload = ""] = String(token || "").split(".");
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

const collectSecretTokenHits = ({ root = ROOT, trackedFiles = [] } = {}) => {
  const hits = [];
  const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

  trackedFiles.forEach((filePath) => {
    const absolutePath = path.join(root, filePath);
    let source = "";
    try {
      source = fs.readFileSync(absolutePath, "utf8");
    } catch {
      return;
    }
    let match = jwtPattern.exec(source);
    while (match) {
      const token = String(match[0] || "");
      const payload = decodeJwtPayload(token);
      if (payload?.iss === "supabase" && payload?.role === "service_role") {
        const { line, column } = computeLineAndColumn(source, match.index);
        const lineText = source.split("\n")[line - 1] || "";
        hits.push({
          filePath,
          label: "supabase service role token",
          line,
          column,
          excerpt: lineText.trim(),
        });
      }
      match = jwtPattern.exec(source);
    }
    jwtPattern.lastIndex = 0;
  });

  return hits;
};

const collectBannedTextHits = ({ root = ROOT, trackedFiles = [] } = {}) => {
  const textGuardFiles = trackedFiles.filter((filePath) => (
    textGuardExtensions.test(filePath)
    && textGuardRoots.some((pattern) => pattern.test(filePath))
  ));

  const hits = [];
  textGuardFiles.forEach((filePath) => {
    const absolutePath = path.join(root, filePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    bannedTextRules.forEach(({ label, pattern }) => {
      pattern.lastIndex = 0;
      let match = pattern.exec(source);
      while (match) {
        const { line, column } = computeLineAndColumn(source, match.index);
        const lineText = source.split("\n")[line - 1] || "";
        hits.push({
          filePath,
          label,
          line,
          column,
          excerpt: lineText.trim(),
        });
        match = pattern.exec(source);
      }
      pattern.lastIndex = 0;
    });
  });

  return hits;
};

const runRepoHygieneCheck = ({ root = ROOT } = {}) => {
  const trackedFiles = getTrackedFiles(root);
  const unexpectedRootEntries = [...new Set(
    trackedFiles
      .map((filePath) => filePath.split("/")[0])
      .filter((entry) => !allowedRootEntries.has(entry))
  )];

  const blockedTrackedFiles = trackedFiles.filter((filePath) => (
    blockedTrackedPatterns.some((pattern) => pattern.test(filePath))
    || isBlockedTrackedEnvFile(filePath)
  ));

  const bannedTextHits = collectBannedTextHits({ root, trackedFiles });
  const secretTokenHits = collectSecretTokenHits({ root, trackedFiles });

  return {
    root,
    trackedFiles,
    unexpectedRootEntries,
    blockedTrackedFiles,
    bannedTextHits,
    secretTokenHits,
    passed: !unexpectedRootEntries.length && !blockedTrackedFiles.length && !bannedTextHits.length && !secretTokenHits.length,
  };
};

const printRepoHygieneFailure = (result) => {
  console.error("Repo hygiene check failed.");
  if (result.unexpectedRootEntries.length) {
    console.error("\nUnexpected tracked repo-root entries:");
    result.unexpectedRootEntries.forEach((entry) => console.error(`- ${entry}`));
  }
  if (result.blockedTrackedFiles.length) {
    console.error("\nBlocked tracked generated/debris files:");
    result.blockedTrackedFiles.forEach((filePath) => console.error(`- ${filePath}`));
  }
  if (result.secretTokenHits.length) {
    console.error("\nTracked secret token hits:");
    result.secretTokenHits.forEach(({ filePath, label, line, column, excerpt }) => {
      console.error(`- ${filePath}:${line}:${column} [${label}] ${excerpt}`);
    });
  }
  if (result.bannedTextHits.length) {
    console.error("\nBanned text encoding or punctuation hits:");
    result.bannedTextHits.forEach(({ filePath, label, line, column, excerpt }) => {
      console.error(`- ${filePath}:${line}:${column} [${label}] ${excerpt}`);
    });
  }
};

if (require.main === module) {
  const result = runRepoHygieneCheck();
  if (!result.passed) {
    printRepoHygieneFailure(result);
    process.exit(1);
  }
  console.log("Repo hygiene check passed.");
}

module.exports = {
  bannedTextRules,
  collectSecretTokenHits,
  decodeJwtPayload,
  isBlockedTrackedEnvFile,
  runRepoHygieneCheck,
};
