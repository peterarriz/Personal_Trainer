const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  REQUIRED_VISUAL_CAPTURE_IDS,
  getSyncProofWarning,
  getVisualReviewWarning,
  readLaunchProofArtifacts,
} = require("../scripts/_lib/launch-proof-artifacts.cjs");

const makeTempRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), "forma-proof-artifacts-"));

test("readLaunchProofArtifacts marks fresh passing sync and visual evidence as passing", () => {
  const root = makeTempRepo();
  const now = new Date().toISOString();

  try {
    const syncDir = path.join(root, "artifacts", "staging-sync-proof", "latest");
    const visualDir = path.join(root, "artifacts", "visual-review-pack", "latest");
    fs.mkdirSync(syncDir, { recursive: true });
    fs.mkdirSync(visualDir, { recursive: true });

    fs.writeFileSync(path.join(syncDir, "result.json"), JSON.stringify({
      generatedAt: now,
      status: "PASS",
      proofMode: "local_real_backend",
      summary: "Local real-backend sync proof passed.",
    }, null, 2));

    fs.writeFileSync(path.join(visualDir, "summary.json"), JSON.stringify({
      generatedAt: now,
      reviewStatus: "PASS",
      reviewer: "Codex",
      captures: REQUIRED_VISUAL_CAPTURE_IDS.map((id) => ({ id, file: `${id}.png` })),
    }, null, 2));

    const proofArtifacts = readLaunchProofArtifacts({ root });
    assert.equal(proofArtifacts.syncProof.pass, true);
    assert.equal(proofArtifacts.visualReview.pass, true);
    assert.equal(getSyncProofWarning(proofArtifacts.syncProof), "");
    assert.equal(getVisualReviewWarning(proofArtifacts.visualReview), "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sync proof warning surfaces the skipped summary when env is incomplete", () => {
  const root = makeTempRepo();

  try {
    const syncDir = path.join(root, "artifacts", "staging-sync-proof", "latest");
    fs.mkdirSync(syncDir, { recursive: true });
    fs.writeFileSync(path.join(syncDir, "result.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: "SKIPPED",
      summary: "Missing FORMA_E2E_BASE_URL and SUPABASE_TEST_EMAIL.",
    }, null, 2));

    const proofArtifacts = readLaunchProofArtifacts({ root });
    assert.equal(proofArtifacts.syncProof.pass, false);
    assert.equal(getSyncProofWarning(proofArtifacts.syncProof), "Missing FORMA_E2E_BASE_URL and SUPABASE_TEST_EMAIL.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("visual review warning stays active until approval, reviewer name, and captures all exist", () => {
  const root = makeTempRepo();

  try {
    const visualDir = path.join(root, "artifacts", "visual-review-pack", "latest");
    fs.mkdirSync(visualDir, { recursive: true });
    fs.writeFileSync(path.join(visualDir, "summary.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      reviewStatus: "PASS",
      reviewer: "",
      captures: REQUIRED_VISUAL_CAPTURE_IDS.slice(0, 2).map((id) => ({ id, file: `${id}.png` })),
    }, null, 2));

    const proofArtifacts = readLaunchProofArtifacts({ root });
    assert.equal(proofArtifacts.visualReview.pass, false);
    assert.match(getVisualReviewWarning(proofArtifacts.visualReview), /reviewer name is missing/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
