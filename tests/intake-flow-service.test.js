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
 const dirty = "No right answers \u00e2\u20ac\u201d just pick what fits best. Coach is assessing your timeline\u00e2\u20ac\u00a6";
 assert.equal(
 sanitizeIntakeText(dirty),
 "No right answers - just pick what fits best. Coach is assessing your timeline..."
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
 const context = buildIntakeInjuryConstraintContext({
 injuryText: "Right Achilles gets cranky with speed work.",
 injuryImpact: "Limits running",
 });

 assert.equal(context.hasCurrentIssue, true);
 assert.equal(context.injuryText, "Right Achilles gets cranky with speed work. (Limits running)");
 assert.equal(context.rawInjuryText, "Right Achilles gets cranky with speed work.");
 assert.equal(context.injuryImpact, "Limits running");
 assert.equal(context.injuryArea, "Achilles");
 assert.deepEqual(context.constraints, ["Right Achilles gets cranky with speed work. (Limits running)"]);
 assert.match(context.movementSummary || "", /Achilles mild tightness/i);
 assert.equal(context.capabilityProfile?.runningRestricted, true);
});

test("injury constraint context stays empty when the user says nothing is current", () => {
 const context = buildIntakeInjuryConstraintContext({
 injuryText: "Nothing current",
 injuryImpact: "Not sure",
 });

 assert.equal(context.hasCurrentIssue, false);
 assert.equal(context.injuryText, "Nothing current");
 assert.equal(context.rawInjuryText, "Nothing current");
 assert.equal(context.injuryImpact, "Not sure");
 assert.equal(context.injuryArea, "");
 assert.equal(context.capabilityProfile, null);
 assert.equal(context.movementSummary, "");
 assert.deepEqual(context.constraints, []);
});

test("structured injury input works even when no free-text note is provided", () => {
 const context = buildIntakeInjuryConstraintContext({
 injuryArea: "Shoulder",
 injurySide: "right",
 injuryLimitations: ["upper_body_push", "overhead"],
 injuryImpact: "Limits lifting",
 });

 assert.equal(context.hasCurrentIssue, true);
 assert.equal(context.injuryArea, "Shoulder");
 assert.equal(context.injurySide, "right");
 assert.deepEqual(context.injuryLimitations, ["upper_body_push", "overhead"]);
 assert.match(context.injuryText, /Shoulder/i);
 assert.equal(context.capabilityProfile?.upperBodyPushRestricted, true);
 assert.equal(context.capabilityProfile?.runningRestricted, false);
});
