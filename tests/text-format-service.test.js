import test from "node:test";
import assert from "node:assert/strict";

import {
  joinDisplayParts,
  repairMojibakeText,
} from "../src/services/text-format-service.js";

test("repairMojibakeText repairs middot corruption", () => {
  assert.equal(repairMojibakeText("APR 9 Ã‚Â· WEEK 1"), "APR 9 · WEEK 1");
});

test("repairMojibakeText repairs workout title corruption", () => {
  assert.equal(repairMojibakeText("Easy Run Ã‚Â· 2 mi"), "Easy Run · 2 mi");
});

test("joinDisplayParts uses a clean middot separator", () => {
  assert.equal(joinDisplayParts(["APR 9", "WEEK 1"]), "APR 9 · WEEK 1");
});

test("repairMojibakeText repairs pace range corruption", () => {
  assert.equal(repairMojibakeText("10:15Ã¢â‚¬â€œ10:30/mi"), "10:15–10:30/mi");
});

test("repairMojibakeText repairs set x rep corruption", () => {
  assert.equal(repairMojibakeText("4Ãƒâ€”8"), "4×8");
});
