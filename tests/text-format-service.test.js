import test from "node:test";
import assert from "node:assert/strict";

import {
  joinDisplayParts,
  repairMojibakeText,
  sanitizeDisplayCopy,
} from "../src/services/text-format-service.js";

test("repairMojibakeText repairs middot corruption", () => {
  const broken = "APR 9 \u00c2\u00b7 WEEK 1";
  assert.equal(repairMojibakeText(broken), "APR 9 - WEEK 1");
});

test("repairMojibakeText repairs workout title corruption", () => {
  const broken = "Easy Run \u00c2\u00b7 2 mi";
  assert.equal(repairMojibakeText(broken), "Easy Run - 2 mi");
});

test("joinDisplayParts uses a clean plain-text separator", () => {
  assert.equal(joinDisplayParts(["APR 9", "WEEK 1"]), "APR 9 - WEEK 1");
});

test("repairMojibakeText repairs pace range corruption", () => {
  const broken = "10:15\u00e2\u20ac\u201c10:30/mi";
  assert.equal(repairMojibakeText(broken), "10:15 - 10:30/mi");
});

test("repairMojibakeText repairs set x rep corruption", () => {
  const broken = "4\u00c3\u00d78";
  assert.equal(repairMojibakeText(broken), "4x8");
});

test("sanitizeDisplayCopy strips backticks and humanizes technical tokens", () => {
  const clean = sanitizeDisplayCopy("`current_run_frequency` then `goalStackConfirmation`.");

  assert.equal(clean.includes("`"), false);
  assert.equal(/current_run_frequency|goalStackConfirmation/i.test(clean), false);
  assert.match(clean, /runs per week/i);
  assert.match(clean, /goal order/i);
});

test("sanitizeDisplayCopy normalizes display punctuation to plain text", () => {
  const clean = sanitizeDisplayCopy("No right answers \u2014 just pick what fits best. Coach is assessing your timeline\u2026");

  assert.equal(clean, "No right answers - just pick what fits best. Coach is assessing your timeline...");
});
