const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PROOF_MAX_AGE_HOURS = 72;
const REQUIRED_VISUAL_CAPTURE_IDS = Object.freeze([
  "auth-desktop-dark",
  "today-desktop-dark",
  "log-desktop-dark",
  "plan-desktop-dark",
  "nutrition-desktop-dark",
  "settings-desktop-dark",
  "today-mobile-light",
  "plan-mobile-light",
]);

const normalizeSlashes = (value = "") => String(value || "").replace(/\\/g, "/");

const readJsonIfPresent = (filePath = "") => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const isFreshTimestamp = (value = "", { now = Date.now(), maxAgeHours = DEFAULT_PROOF_MAX_AGE_HOURS } = {}) => {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return false;
  const ageMs = now - parsed;
  if (ageMs < -5 * 60 * 1000) return false;
  return ageMs <= maxAgeHours * 60 * 60 * 1000;
};

const readSyncProofArtifact = ({
  root = process.cwd(),
  maxAgeHours = DEFAULT_PROOF_MAX_AGE_HOURS,
} = {}) => {
  const resultPath = path.join(root, "artifacts", "staging-sync-proof", "latest", "result.json");
  const data = readJsonIfPresent(resultPath);
  if (!data) {
    return {
      available: false,
      path: normalizeSlashes(path.relative(root, resultPath)),
      status: "MISSING",
      generatedAt: "",
      fresh: false,
      pass: false,
      proofMode: "",
      summary: "",
      missing: [],
      baseUrl: "",
    };
  }

  const status = String(data.status || "UNKNOWN").trim().toUpperCase();
  const generatedAt = String(data.generatedAt || "").trim();
  const fresh = isFreshTimestamp(generatedAt, { maxAgeHours });
  return {
    available: true,
    path: normalizeSlashes(path.relative(root, resultPath)),
    status,
    generatedAt,
    fresh,
    pass: status === "PASS" && fresh,
    proofMode: String(data.proofMode || "").trim(),
    summary: String(data.summary || "").trim(),
    missing: Array.isArray(data.missing) ? data.missing : [],
    baseUrl: String(data.baseUrl || "").trim(),
  };
};

const readVisualReviewArtifact = ({
  root = process.cwd(),
  maxAgeHours = DEFAULT_PROOF_MAX_AGE_HOURS,
} = {}) => {
  const summaryPath = path.join(root, "artifacts", "visual-review-pack", "latest", "summary.json");
  const data = readJsonIfPresent(summaryPath);
  if (!data) {
    return {
      available: false,
      path: normalizeSlashes(path.relative(root, summaryPath)),
      status: "MISSING",
      generatedAt: "",
      fresh: false,
      pass: false,
      reviewer: "",
      reviewStatus: "PENDING",
      reviewNotes: [],
      captures: [],
      missingCaptureIds: [...REQUIRED_VISUAL_CAPTURE_IDS],
      baseUrl: "",
    };
  }

  const captures = Array.isArray(data.captures) ? data.captures : [];
  const captureIds = new Set(captures.map((capture) => String(capture?.id || "").trim()).filter(Boolean));
  const missingCaptureIds = REQUIRED_VISUAL_CAPTURE_IDS.filter((id) => !captureIds.has(id));
  const generatedAt = String(data.generatedAt || "").trim();
  const fresh = isFreshTimestamp(generatedAt, { maxAgeHours });
  const reviewer = String(data.reviewer || "").trim();
  const reviewStatus = String(data.reviewStatus || "PENDING").trim().toUpperCase();

  return {
    available: true,
    path: normalizeSlashes(path.relative(root, summaryPath)),
    status: reviewStatus,
    generatedAt,
    fresh,
    pass: fresh && reviewStatus === "PASS" && Boolean(reviewer) && missingCaptureIds.length === 0,
    reviewer,
    reviewStatus,
    reviewNotes: Array.isArray(data.reviewNotes) ? data.reviewNotes : [],
    captures,
    missingCaptureIds,
    baseUrl: String(data.baseUrl || "").trim(),
  };
};

const readLaunchProofArtifacts = ({
  root = process.cwd(),
  maxAgeHours = DEFAULT_PROOF_MAX_AGE_HOURS,
} = {}) => ({
  syncProof: readSyncProofArtifact({ root, maxAgeHours }),
  visualReview: readVisualReviewArtifact({ root, maxAgeHours }),
});

const getSyncProofWarning = (artifact = null) => {
  if (!artifact?.available) return "Run `npm run qa:sync:proof` to attach a real sync proof artifact.";
  if (!artifact.fresh) return "Refresh `npm run qa:sync:proof`; the latest sync proof artifact is stale.";
  if (artifact.status === "PASS") return "";
  if (artifact.summary) return artifact.summary;
  return "Run `npm run qa:sync:proof` until the real sync proof passes.";
};

const getVisualReviewWarning = (artifact = null) => {
  if (!artifact?.available) return "Run `npm run qa:visual-review -- --reviewer <name> --approve` to attach a reviewed visual signoff.";
  if (!artifact.fresh) return "Refresh `npm run qa:visual-review`; the latest visual review artifact is stale.";
  if (artifact.reviewStatus === "FAIL") {
    return artifact.reviewNotes[0] || "The latest visual review signoff reported design blockers.";
  }
  if (artifact.reviewStatus !== "PASS") {
    return "A reviewed visual signoff is still required across dark, light, and small-phone captures.";
  }
  if (!artifact.reviewer) {
    return "Visual review approval is present, but the reviewer name is missing.";
  }
  if (artifact.missingCaptureIds.length > 0) {
    return `Visual review is missing required captures: ${artifact.missingCaptureIds.join(", ")}.`;
  }
  return "";
};

module.exports = {
  DEFAULT_PROOF_MAX_AGE_HOURS,
  REQUIRED_VISUAL_CAPTURE_IDS,
  getSyncProofWarning,
  getVisualReviewWarning,
  isFreshTimestamp,
  readLaunchProofArtifacts,
  readSyncProofArtifact,
  readVisualReviewArtifact,
};
