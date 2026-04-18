import test from "node:test";
import assert from "node:assert/strict";

import { formatRunTarget } from "../src/services/session-label-format-service.js";

test("formatRunTarget keeps minutes as minutes instead of misreading min as miles", () => {
  assert.equal(formatRunTarget("60 min"), "60 min");
  assert.equal(formatRunTarget("20-30 min easy aerobic"), "20-30 min");
});

test("formatRunTarget keeps mileage intact when the prescription is in miles", () => {
  assert.equal(formatRunTarget("6 mi"), "6 mi");
  assert.equal(formatRunTarget("8-10 miles easy"), "8-10 mi");
});

test("formatRunTarget uses the first visible target when a descriptor contains both time and distance", () => {
  assert.equal(formatRunTarget("60 min or 6 mi"), "60 min");
  assert.equal(formatRunTarget("6 mi or 60 min"), "6 mi");
});
