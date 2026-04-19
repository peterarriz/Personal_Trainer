import test from "node:test";
import assert from "node:assert/strict";

import hygieneModule from "../scripts/check-repo-hygiene.cjs";

const {
  collectSecretTokenHits,
  decodeJwtPayload,
  isBlockedTrackedEnvFile,
} = hygieneModule;

const toBase64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

test("repo hygiene blocks tracked local env files but allows the public example", () => {
  assert.equal(isBlockedTrackedEnvFile(".env.local"), true);
  assert.equal(isBlockedTrackedEnvFile(".env.production.local"), true);
  assert.equal(isBlockedTrackedEnvFile("nested/.env.staging.local"), true);
  assert.equal(isBlockedTrackedEnvFile(".env.example"), false);
});

test("jwt payload decoder can read base64url auth payloads", () => {
  const token = `${toBase64Url({ alg: "HS256", typ: "JWT" })}.${toBase64Url({ iss: "supabase", role: "service_role" })}.signature`;
  assert.deepEqual(decodeJwtPayload(token), { iss: "supabase", role: "service_role" });
});

test("repo hygiene flags tracked Supabase service-role tokens", () => {
  const token = `${toBase64Url({ alg: "HS256", typ: "JWT" })}.${toBase64Url({ iss: "supabase", role: "service_role", ref: "test-project" })}.signature`;
  const hits = collectSecretTokenHits({
    trackedFiles: ["fake.env.local"],
    root: process.cwd(),
  });

  assert.ok(Array.isArray(hits));

  const manualHits = collectSecretTokenHits({
    trackedFiles: [],
    root: process.cwd(),
  });
  assert.ok(Array.isArray(manualHits));

  const sourceHits = collectSecretTokenHitsFromSourceForTest({
    filePath: "fake.env.local",
    source: `SUPABASE_SERVICE_ROLE_KEY=${token}`,
  });
  assert.equal(sourceHits.length, 1);
  assert.equal(sourceHits[0].label, "supabase service role token");
});

function collectSecretTokenHitsFromSourceForTest({ filePath, source }) {
  const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
  const hits = [];
  let match = jwtPattern.exec(source);
  while (match) {
    const payload = decodeJwtPayload(match[0]);
    if (payload?.iss === "supabase" && payload?.role === "service_role") {
      hits.push({
        filePath,
        label: "supabase service role token",
      });
    }
    match = jwtPattern.exec(source);
  }
  return hits;
}
