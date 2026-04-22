import test from "node:test";
import assert from "node:assert/strict";

import {
  DELETE_DIAGNOSTICS_STALE_MS,
  shouldReuseDeleteDiagnosticsResult,
} from "../src/domains/settings/settings-surface-model.js";

test("delete diagnostics results are reused while the last successful check is still fresh", () => {
  const now = 1_716_000_000_000;

  assert.equal(
    shouldReuseDeleteDiagnosticsResult({
      diagnostics: {
        checked: true,
        checkedAt: now - 30_000,
        configured: true,
      },
      now,
    }),
    true
  );
});

test("delete diagnostics results are not reused when unchecked or stale", () => {
  const now = 1_716_000_000_000;

  assert.equal(
    shouldReuseDeleteDiagnosticsResult({
      diagnostics: {
        checked: false,
        checkedAt: now,
      },
      now,
    }),
    false
  );

  assert.equal(
    shouldReuseDeleteDiagnosticsResult({
      diagnostics: {
        checked: true,
        checkedAt: now - DELETE_DIAGNOSTICS_STALE_MS - 1,
      },
      now,
    }),
    false
  );
});
