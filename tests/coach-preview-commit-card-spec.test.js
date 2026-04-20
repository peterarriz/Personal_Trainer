const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COACH_PREVIEW_COMMIT_CARD_EXAMPLES,
  COACH_PREVIEW_COMMIT_CARD_RULES,
  COACH_PREVIEW_COMMIT_JOBS,
  buildCoachPreviewCommitCardModel,
  shouldShowCoachPreviewConsequence,
} = require("../src/services/coach-preview-commit-card-spec.js");

test("all three coach jobs ship with redesigned preview-commit examples", () => {
  [
    COACH_PREVIEW_COMMIT_JOBS.adjustToday,
    COACH_PREVIEW_COMMIT_JOBS.adjustWeek,
    COACH_PREVIEW_COMMIT_JOBS.askCoach,
  ].forEach((job) => {
    const example = COACH_PREVIEW_COMMIT_CARD_EXAMPLES[job];
    assert.ok(example, `missing example for ${job}`);
    assert.match(example.commitLabel, /^Commit /);
    assert.ok(example.consequenceLead);
    assert.ok(example.why);
    assert.ok(example.commitScopeLine);
  });
});

test("preview-commit model keeps consequence ahead of why and uses commit language", () => {
  const model = buildCoachPreviewCommitCardModel({
    job: COACH_PREVIEW_COMMIT_JOBS.adjustWeek,
  });

  assert.equal(model.consequenceLabel, "What changes");
  assert.equal(model.whyLabel, "Why this is the call");
  assert.match(model.commitLabel, /^Commit /);
  assert.match(model.consequenceLead, /-12%|stays/i);
});

test("consequence shows whenever the preview has a numeric delta or preserved anchor", () => {
  assert.equal(
    shouldShowCoachPreviewConsequence({
      deterministicActionReady: true,
      numericDeltaKnown: true,
    }),
    true
  );

  assert.equal(
    shouldShowCoachPreviewConsequence({
      deterministicActionReady: true,
      preservedAnchorKnown: true,
    }),
    true
  );
});

test("consequence is optional only in the rare no-delta no-anchor case", () => {
  assert.equal(
    shouldShowCoachPreviewConsequence({
      deterministicActionReady: true,
      materiallyDistinctOutcome: false,
      consequenceLead: "",
      consequenceChips: [],
      numericDeltaKnown: false,
      preservedAnchorKnown: false,
    }),
    false
  );
});

test("shared card rules explicitly demote why and promote commit language", () => {
  assert.match(COACH_PREVIEW_COMMIT_CARD_RULES.hierarchy.join(" "), /Consequence leads/i);
  assert.match(COACH_PREVIEW_COMMIT_CARD_RULES.hierarchy.join(" "), /Commit closes/i);
  assert.match(COACH_PREVIEW_COMMIT_CARD_RULES.consequenceOptionalRule, /optional only when/i);
});
