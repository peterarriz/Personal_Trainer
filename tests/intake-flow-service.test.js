import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeHomeEquipmentResponse,
  sanitizeIntakeText,
} from "../src/services/intake-flow-service.js";

test("sanitizeIntakeText cleans mojibake in intake copy", () => {
  const dirty = "No right answers Ã¢â‚¬â€ just pick what fits best. Coach is assessing your timelineÃ¢â‚¬Â¦";
  assert.equal(
    sanitizeIntakeText(dirty),
    "No right answers - just pick what fits best. Coach is assessing your timeline..."
  );
});

test("normalizeHomeEquipmentResponse preserves custom equipment text instead of raw Other", () => {
  assert.deepEqual(
    normalizeHomeEquipmentResponse({
      selection: ["Dumbbells", "Other"],
      otherText: "Rowing machine",
    }),
    {
      normalized: ["Dumbbells", "Rowing machine"],
      display: "Dumbbells / Rowing machine",
      otherText: "Rowing machine",
    }
  );
});
