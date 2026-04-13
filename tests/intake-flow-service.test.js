import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIntakeInjuryConstraintContext,
  INTAKE_INJURY_IMPACT_OPTIONS,
  normalizeHomeEquipmentResponse,
  normalizeIntakeInjuryImpact,
  sanitizeIntakeText,
} from "../src/services/intake-flow-service.js";

test("sanitizeIntakeText cleans mojibake in intake copy", () => {
  const dirty = "No right answers ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â just pick what fits best. Coach is assessing your timelineÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  assert.equal(
    sanitizeIntakeText(dirty),
    "No right answers — just pick what fits best. Coach is assessing your timeline…"
  );
});

test("sanitizeIntakeText strips backticks and humanizes intake engine tokens", () => {
  const dirty = "Use `current_run_frequency` before `running_endurance_anchor_kind` so `goal_stack_confirmation` stays clean.";
  const clean = sanitizeIntakeText(dirty);

  assert.equal(clean.includes("`"), false);
  assert.equal(/current_run_frequency|running_endurance_anchor_kind|goal_stack_confirmation/i.test(clean), false);
  assert.match(clean, /runs per week/i);
  assert.match(clean, /running benchmark/i);
  assert.match(clean, /goal order/i);
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

test("injury follow-up options stay plain-English and deterministic", () => {
  assert.deepEqual(INTAKE_INJURY_IMPACT_OPTIONS, [
    "Minor / manageable",
    "Limits running",
    "Limits lifting",
    "Not sure",
  ]);
  assert.equal(normalizeIntakeInjuryImpact("limits running"), "Limits running");
});

test("injury constraint context folds the follow-up chip into the plain-English intake note", () => {
  assert.deepEqual(
    buildIntakeInjuryConstraintContext({
      injuryText: "Right Achilles gets cranky with speed work.",
      injuryImpact: "Limits running",
    }),
    {
      hasCurrentIssue: true,
      injuryText: "Right Achilles gets cranky with speed work. (Limits running)",
      rawInjuryText: "Right Achilles gets cranky with speed work.",
      injuryImpact: "Limits running",
      constraints: ["Right Achilles gets cranky with speed work. (Limits running)"],
    }
  );
});

test("injury constraint context stays empty when the user says nothing is current", () => {
  assert.deepEqual(
    buildIntakeInjuryConstraintContext({
      injuryText: "Nothing current",
      injuryImpact: "Not sure",
    }),
    {
      hasCurrentIssue: false,
      injuryText: "Nothing current",
      rawInjuryText: "Nothing current",
      injuryImpact: "Not sure",
      constraints: [],
    }
  );
});
