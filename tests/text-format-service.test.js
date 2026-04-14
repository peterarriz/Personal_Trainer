import test from "node:test";
import assert from "node:assert/strict";

import {
  joinDisplayParts,
  repairMojibakeText,
  sanitizeDisplayCopy,
} from "../src/services/text-format-service.js";

test("repairMojibakeText repairs middot corruption", () => {
  assert.equal(repairMojibakeText("APR 9 Ãƒâ€šÃ‚Â· WEEK 1"), "APR 9 · WEEK 1");
});

test("repairMojibakeText repairs workout title corruption", () => {
  assert.equal(repairMojibakeText("Easy Run Ãƒâ€šÃ‚Â· 2 mi"), "Easy Run · 2 mi");
});

test("joinDisplayParts uses a clean middot separator", () => {
  assert.equal(joinDisplayParts(["APR 9", "WEEK 1"]), "APR 9 · WEEK 1");
});

test("repairMojibakeText repairs pace range corruption", () => {
  assert.equal(repairMojibakeText("10:15ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“10:30/mi"), "10:15–10:30/mi");
});

test("repairMojibakeText repairs set x rep corruption", () => {
  assert.equal(repairMojibakeText("4ÃƒÆ’Ã¢â‚¬â€8"), "4×8");
});

test("sanitizeDisplayCopy strips backticks and humanizes technical tokens", () => {
  const clean = sanitizeDisplayCopy("`current_run_frequency` then `goalStackConfirmation`.");

  assert.equal(clean.includes("`"), false);
  assert.equal(/current_run_frequency|goalStackConfirmation/i.test(clean), false);
  assert.match(clean, /runs per week/i);
  assert.match(clean, /goal order/i);
});
