import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSyntheticLabSafeEnvironment,
  getSyntheticLabSafetyState,
} from "../src/services/synthetic-athlete-lab/env-guard.js";

test("synthetic athlete lab allows local and staging-style Supabase URLs", () => {
  const state = getSyntheticLabSafetyState({
    SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_URL: "https://forma.staging.internal",
  });

  assert.equal(state.blocked, false);
  assert.equal(state.unsafeUrls.length, 0);
});

test("synthetic athlete lab blocks production-looking Supabase URLs by default", () => {
  assert.throws(
    () => assertSyntheticLabSafeEnvironment({
      SUPABASE_URL: "https://real-prod-project.supabase.co",
    }),
    /refused to run with production-looking Supabase URLs/i
  );
});

test("synthetic athlete lab can be intentionally overridden for troubleshooting", () => {
  const state = assertSyntheticLabSafeEnvironment({
    SUPABASE_URL: "https://real-prod-project.supabase.co",
    FORMA_ALLOW_UNSAFE_SYNTHETIC_LAB: "1",
  });

  assert.equal(state.blocked, false);
  assert.equal(state.overrideEnabled, true);
  assert.equal(state.unsafeUrls.length, 1);
});

