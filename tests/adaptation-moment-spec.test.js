const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADAPTATION_MOMENT_KIND_SPECS,
  ADAPTATION_MOMENT_PLACEMENT_SPECS,
  ADAPTATION_MOMENT_SOURCE_LABELS,
  buildAdaptationMomentModel,
  collapseToSentence,
} = require("../src/services/adaptation-moment-spec.js");

const BANNED_JARGON = /decision point|action id|confidence score|sample size|rule id|\bml\b|\bai\b/i;

test("every adaptation kind ships with one-sentence coach-facing guidance and example copy", () => {
  const expectedKinds = [
    "reduced_load",
    "protect",
    "drift_downgrade",
    "coach_accepted",
    "user_edit",
    "carry_forward",
    "progression",
  ];

  expectedKinds.forEach((kind) => {
    const spec = ADAPTATION_MOMENT_KIND_SPECS[kind];
    assert.ok(spec, `missing spec for ${kind}`);
    assert.ok(spec.label);
    assert.ok(spec.useWhen);
    assert.ok(spec.collapsedRule);
    assert.ok(spec.detailRule);
    assert.ok(spec.exampleWhy);
    assert.equal((spec.exampleWhy.match(/[.!?]/g) || []).length, 1);
    assert.doesNotMatch(spec.exampleWhy, BANNED_JARGON);
    assert.ok(Array.isArray(spec.exampleDetails));
    assert.ok(spec.exampleDetails.length >= 2);
  });
});

test("adaptation model collapses multi-line system fragments into one visible sentence and dedupes detail lines", () => {
  const model = buildAdaptationMomentModel({
    kind: "drift_downgrade",
    why: "The next stretch gets simpler because recent execution drifted hard from the written version. Extra sentence that should not survive.",
    rationale: "What changed: the week now runs in a simpler fit.",
    detailLines: [
      "What changed: the week now runs in a simpler fit.",
      "What earns next: a steadier week of completion brings the stronger version back.",
    ],
    preservedLine: "What earns next: a steadier week of completion brings the stronger version back.",
  });

  assert.equal(model.why, "The next stretch gets simpler because recent execution drifted hard from the written version.");
  assert.equal(model.detailLines.filter((line) => /what changed/i.test(line)).length, 1);
  assert.match(model.detailLines.join(" "), /steadier week of completion/i);
});

test("placement spec covers Today, Program, Log, and Coach with explicit replacement rules", () => {
  ["today", "program", "log", "coach"].forEach((surface) => {
    const spec = ADAPTATION_MOMENT_PLACEMENT_SPECS[surface];
    assert.ok(spec, `missing placement spec for ${surface}`);
    assert.ok(spec.placement);
    assert.ok(spec.defaultState);
    assert.ok(spec.replaces);
    assert.ok(spec.rule);
  });
});

test("sentence collapsing keeps the first readable sentence only", () => {
  assert.equal(
    collapseToSentence("Saved. Tomorrow is unchanged. Another sentence."),
    "Saved."
  );
});

test("shared source labels stay stable", () => {
  assert.equal(ADAPTATION_MOMENT_SOURCE_LABELS.planRule, "Plan rule");
  assert.equal(ADAPTATION_MOMENT_SOURCE_LABELS.recentTraining, "Based on your recent training");
  assert.equal(ADAPTATION_MOMENT_SOURCE_LABELS.userChanged, "You changed this");
  assert.equal(ADAPTATION_MOMENT_SOURCE_LABELS.recoveryFirst, "Recovery-first change");
});
