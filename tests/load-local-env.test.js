import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadLocalEnv, parseEnvFile } from "../scripts/_lib/load-local-env.cjs";

test("parseEnvFile handles comments, quotes, and plain assignments", () => {
  const parsed = parseEnvFile(`
# comment
SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_ROLE_KEY="service-role"
ENABLE_ADAPTIVE_EVENT_SINK='true'
`);

  assert.equal(parsed.SUPABASE_URL, "https://example.supabase.co");
  assert.equal(parsed.SUPABASE_SERVICE_ROLE_KEY, "service-role");
  assert.equal(parsed.ENABLE_ADAPTIVE_EVENT_SINK, "true");
});

test("loadLocalEnv reads .env.local first and does not overwrite existing env vars", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forma-env-"));
  const envLocalPath = path.join(tempDir, ".env.local");
  const envPath = path.join(tempDir, ".env");

  fs.writeFileSync(envLocalPath, [
    "SUPABASE_URL=https://local.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=local-role",
  ].join("\n"));
  fs.writeFileSync(envPath, [
    "SUPABASE_URL=https://fallback.supabase.co",
    "ENABLE_ADAPTIVE_EVENT_SINK=true",
  ].join("\n"));

  const previousUrl = process.env.SUPABASE_URL;
  const previousRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousSink = process.env.ENABLE_ADAPTIVE_EVENT_SINK;

  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.ENABLE_ADAPTIVE_EVENT_SINK = "existing";

  try {
    const loaded = loadLocalEnv({ cwd: tempDir });
    assert.equal(loaded.length, 2);
    assert.equal(process.env.SUPABASE_URL, "https://local.supabase.co");
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, "local-role");
    assert.equal(process.env.ENABLE_ADAPTIVE_EVENT_SINK, "existing");
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousRole;
    if (previousSink === undefined) delete process.env.ENABLE_ADAPTIVE_EVENT_SINK;
    else process.env.ENABLE_ADAPTIVE_EVENT_SINK = previousSink;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
