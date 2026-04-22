import test from "node:test";
import assert from "node:assert/strict";

import { getMovementExplanation } from "../src/services/movement-explanation-service.js";

test("resolves common unclear movement labels into short usable explanations", () => {
  const explanation = getMovementExplanation("Push-Up Complex");

  assert.equal(explanation.found, true);
  assert.equal(explanation.canonicalLabel, "Push-Up Complex");
  assert.match(explanation.whatItIs, /variation cluster/i);
  assert.match(explanation.howToDoIt, /listed push-up variations/i);
  assert.match(explanation.repCountsAs, /full pass/i);
  assert.deepEqual(explanation.commonSubstitutions, [
    "Incline push-up series",
    "Knee push-up series",
    "DB floor press",
  ]);
});

test("strength templates resolve as reusable A/B explanations", () => {
  const strengthA = getMovementExplanation("Strength A");
  const strengthB = getMovementExplanation({ label: "Strength B" });

  assert.equal(strengthA.found, true);
  assert.equal(strengthA.canonicalLabel, "Strength A");
  assert.match(strengthA.whatItIs, /first full-body strength template/i);
  assert.match(strengthA.setupNotes, /squat, press, pull, and hinge/i);

  assert.equal(strengthB.found, true);
  assert.equal(strengthB.canonicalLabel, "Strength B");
  assert.match(strengthB.whatItIs, /second full-body strength template/i);
  assert.match(strengthB.howToDoIt, /alternate lift order/i);
});

test("conditioning and run templates resolve with rep guidance", () => {
  const circuit = getMovementExplanation("Circuit");
  const tempo = getMovementExplanation("Tempo Run");
  const intervals = getMovementExplanation("Intervals");
  const prehab = getMovementExplanation("Prehab / durability work");

  assert.match(circuit.repCountsAs, /completed round/i);
  assert.match(tempo.whatItIs, /comfortably-hard run/i);
  assert.match(intervals.repCountsAs, /hard segment plus its recovery/i);
  assert.match(prehab.whatItIs, /low-load accessory work/i);
  assert.match(prehab.cautionNotes, /not a conditioning test/i);
});

test("common gym lifts resolve with real setup cues and a demo search link", () => {
  const bench = getMovementExplanation("Barbell Bench Press");
  const incline = getMovementExplanation("Incline DB Press");
  const carry = getMovementExplanation("Farmer Carry");

  assert.equal(bench.found, true);
  assert.match(bench.whatItIs, /horizontal press/i);
  assert.match(bench.setupNotes, /feet planted|upper back/i);
  assert.match(bench.demoSearchUrl, /youtube\.com\/results\?search_query=/i);

  assert.equal(incline.found, true);
  assert.match(incline.whatItIs, /angled press/i);
  assert.match(incline.howToDoIt, /low incline/i);

  assert.equal(carry.found, true);
  assert.match(carry.repCountsAs, /distance or time/i);
});

test("unknown labels return a safe empty explanation object", () => {
  const explanation = getMovementExplanation("Sunday Reset");

  assert.equal(explanation.found, false);
  assert.equal(explanation.label, "Sunday Reset");
  assert.equal(explanation.whatItIs, "");
  assert.deepEqual(explanation.commonSubstitutions, []);
  assert.equal(explanation.demoSearchUrl, "");
});
