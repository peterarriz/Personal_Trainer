require("sucrase/register");

const fs = require("fs");
const path = require("path");
const {
  ADVERSARIAL_USER_FLOW_STEPS,
  ADVERSARIAL_USER_TEST_MATRIX,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_REQUIREMENTS,
} = require("../src/services/release-gate-contract.js");

const args = process.argv.slice(2);

const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  return String(args[index + 1] || fallback).trim();
};

const sanitizeSlug = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "manual-qa";

const now = new Date();
const stamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  "-",
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
].join("");

const envName = getArgValue("--env", "local");
const targetUrl = getArgValue("--url", envName === "local" ? "http://localhost:3000" : "");
const tester = getArgValue("--tester", "");
const releaseLabel = getArgValue("--release", "");
const outputRoot = getArgValue("--output", path.join("tmp", "manual-qa-pack"));

const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.resolve(repoRoot, outputRoot, `${stamp}-${sanitizeSlug(envName)}`);
const screenshotsDir = path.join(outputDir, "screenshots");
const videosDir = path.join(outputDir, "videos");
const pdfDir = path.join(outputDir, "pdf");
const notesPath = path.join(outputDir, "notes.md");
const worksheetPath = path.join(outputDir, "manual-qa-run.md");
const packDocPath = path.resolve(repoRoot, "docs", "MANUAL_QA_RELEASE_PACK.md");

fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });
fs.mkdirSync(pdfDir, { recursive: true });

const caseRows = [
  ["QA-00", "Preflight and shell"],
  ["QA-01", "Appearance and theme distinctness"],
  ["QA-02", "Auth entry, sign in, and local continue"],
  ["QA-03", "Account lifecycle, sign out, and delete"],
  ["QA-04", "Intake and first plan"],
  ["QA-05", "Today, Program, and plan review"],
  ["QA-06", "Coach"],
  ["QA-07", "Logging"],
  ["QA-08", "Nutrition"],
  ["QA-09", "Settings: goals, baselines, programs, styles, and advanced"],
  ["QA-10", "Sync and local resilience"],
  ["QA-11", "Export, backup, restore, and destructive safety"],
  ["QA-12", "Print preview and PDF"],
];

const deviceRows = [
  ["Desktop", "1440 x 900 or larger", "", ""],
  ["Laptop", "1280 x 800 or 1366 x 768", "", ""],
  ["Tablet portrait", "820 x 1180", "", ""],
  ["Tablet landscape", "1180 x 820", "", ""],
  ["Phone portrait", "390 x 844 or 393 x 852", "", ""],
];

const browserRows = [
  ["Chrome stable", "", ""],
  ["Edge stable", "", ""],
  ["Safari / WebKit", "", ""],
  ["Firefox stable", "", ""],
];

const themeRows = [
  ["Dark", "", ""],
  ["Light", "", ""],
  ["System", "", ""],
  ["Theme A", "", ""],
  ["Theme B", "", ""],
  ["Theme C", "", ""],
];

const matrixRows = ADVERSARIAL_USER_TEST_MATRIX.map((item) => [
  item.id,
  item.scenario,
  "",
  "",
  "",
]);

const releaseGateRows = RELEASE_GATE_REQUIREMENTS.map((item) => [
  item.id,
  item.label,
  item.evidence.join(" + "),
  "",
  "",
]);

const renderTable = (headers = [], rows = []) => [
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`),
].join("\n");

const worksheet = `# Manual QA Run\n
## Run Info

- Date: ${now.toISOString()}
- Environment: ${envName}
- URL: ${targetUrl || "[fill in target URL]"}
- Tester: ${tester || "[fill in tester]"}
- Release / branch: ${releaseLabel || "[fill in release or branch]"}
- QA pack: ${packDocPath}
- Artifact folder: ${outputDir}

## Summary

- Overall result: [Pass / Pass with notes / Fail / Blocked]
- Blockers:
- Major issues:
- Minor issues:
- Notes:

## Device Matrix

${renderTable(["Device", "Viewport", "Status", "Notes"], deviceRows)}

## Browser Matrix

${renderTable(["Browser", "Status", "Notes"], browserRows)}

## Theme Matrix

${renderTable(["Theme or mode", "Status", "Notes"], themeRows)}

## Adversarial User Matrix

Every matrix scenario must be exercised through:

${ADVERSARIAL_USER_FLOW_STEPS.map((step, index) => `${index + 1}. ${step}`).join("\n")}

${renderTable(["Scenario", "User story", "Status", "Artifacts", "Notes"], matrixRows)}

## Release Gate

- Policy: ${RELEASE_GATE_POLICY.summary}
- Scenario count required in the matrix: ${RELEASE_GATE_POLICY.scenarioCount}

${renderTable(["Gate", "Requirement", "Evidence type", "Status", "Notes"], releaseGateRows)}

## Case Results

${renderTable(["Case", "Area", "Status", "Severity", "Artifacts", "Notes"], caseRows.map(([id, area]) => [id, area, "", "", "", ""]))}

## Export / PDF Files

${renderTable(["Artifact", "Saved", "Notes"], [
  ["Today print preview PDF", "", ""],
  ["Program print preview PDF", "", ""],
  ["Log or review print preview PDF", "", ""],
  ["Nutrition print preview PDF", "", ""],
  ["Settings account print preview PDF", "", ""],
  ["Backup export code capture", "", ""],
])}

## Defects

List every failure here with:

- case ID
- device + browser + theme
- exact steps
- expected vs actual
- artifact filename
- console or network notes
`;

const notesTemplate = `# Manual QA Notes\n
- Use this folder for screenshots, PDFs, and short notes tied to the worksheet.
- Naming pattern:
  - QA-02-auth-phone-dark-chrome.png
  - QA-11-export-laptop-light-edge.png
  - QA-12-program-print-preview-chrome.pdf
`;

fs.writeFileSync(worksheetPath, worksheet, "utf8");
fs.writeFileSync(notesPath, notesTemplate, "utf8");

console.log(`Manual QA pack ready.`);
console.log(`Pack doc: ${packDocPath}`);
console.log(`Worksheet: ${worksheetPath}`);
console.log(`Artifacts: ${outputDir}`);
console.log(`Screenshots: ${screenshotsDir}`);
console.log(`PDFs: ${pdfDir}`);
console.log(`Suggested next steps:`);
console.log(`  1. npm run build`);
console.log(`  2. npm run dev`);
console.log(`  3. Open the worksheet and fill results as you go.`);
