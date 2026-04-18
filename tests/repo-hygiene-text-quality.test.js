import test from "node:test";
import assert from "node:assert/strict";

import { runRepoHygieneCheck } from "../scripts/check-repo-hygiene.cjs";

test("repo hygiene blocks mojibake and em dashes in user-facing sources", () => {
  const result = runRepoHygieneCheck();

  assert.deepEqual(result.unexpectedRootEntries, []);
  assert.deepEqual(result.blockedTrackedFiles, []);
  assert.deepEqual(result.bannedTextHits, []);
});
