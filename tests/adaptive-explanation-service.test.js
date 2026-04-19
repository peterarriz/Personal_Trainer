const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADAPTIVE_EXPLANATION_CATEGORIES,
  buildAdaptivePrescriptionExplanation,
  buildAdaptiveOutcomeExplanation,
} = require("../src/services/adaptive-explanation-service.js");

test("adaptive prescription explanation stays user-safe while matching the chosen adaptive action", () => {
  const explanation = buildAdaptivePrescriptionExplanation({
    week: {
      adaptivePolicyTraces: [
        {
          decisionPointId: "hybrid_run_lift_balance_template",
          chosenActionId: "strength_supportive_hybrid",
          usedAdaptiveChoice: true,
          decisionMode: "active",
          candidateScores: [
            { actionId: "balanced_hybrid", confidenceScore: 0, sampleSize: 0 },
            { actionId: "strength_supportive_hybrid", confidenceScore: 89, sampleSize: 16 },
          ],
          contextSnapshot: {
            hybridAthlete: true,
            runningGoalActive: true,
            strengthGoalActive: true,
          },
        },
      ],
    },
    changeSummary: {
      inputType: "workout_log",
    },
  });

  assert.equal(explanation.category, ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization);
  assert.equal(explanation.sourceLabel, "Based on your recent training");
  assert.match(explanation.line, /lift focus|run load|hard efforts/i);
  assert.doesNotMatch(explanation.line, /hybrid_run_lift_balance_template|strength_supportive_hybrid|confidenceScore|sampleSize/i);
  assert.equal(explanation.internal.adaptiveDecision.decisionPointId, "hybrid_run_lift_balance_template");
});

test("hybrid session-format explanation stays concise and human", () => {
  const explanation = buildAdaptivePrescriptionExplanation({
    week: {
      adaptivePolicyTraces: [
        {
          decisionPointId: "hybrid_session_format_choice",
          chosenActionId: "favor_short_split_sessions",
          usedAdaptiveChoice: true,
          decisionMode: "active",
          candidateScores: [
            { actionId: "keep_current_structure", confidenceScore: 0, sampleSize: 0 },
            { actionId: "favor_short_split_sessions", confidenceScore: 85, sampleSize: 15 },
          ],
          contextSnapshot: {
            hybridMeaningful: true,
            hybridCohort: "inconsistent_schedule_hybrid",
          },
        },
      ],
    },
    changeSummary: {
      inputType: "workout_log",
    },
  });

  assert.equal(explanation.category, ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization);
  assert.match(explanation.line, /shorter separate blocks|busy hybrid weeks/i);
  assert.doesNotMatch(explanation.line, /hybrid_session_format_choice|favor_short_split_sessions|confidenceScore|sampleSize/i);
});

test("protective explanation avoids overclaiming when the week is held back for recovery", () => {
  const explanation = buildAdaptivePrescriptionExplanation({
    week: {
      adaptivePolicyTraces: [
        {
          decisionPointId: "progression_aggressiveness_band",
          chosenActionId: "conservative_band",
          usedAdaptiveChoice: true,
          decisionMode: "active",
          candidateScores: [
            { actionId: "default_band", confidenceScore: 0, sampleSize: 0 },
            { actionId: "conservative_band", confidenceScore: 75, sampleSize: 9 },
          ],
          contextSnapshot: {
            scheduleReliability: "variable",
          },
        },
      ],
    },
    decision: {
      mode: "reduced_load",
      modeLabel: "Reduced load",
    },
    changeSummary: {
      inputType: "workout_log",
      headline: "Load came down this week.",
    },
  });

  assert.equal(explanation.category, ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment);
  assert.equal(explanation.sourceLabel, "Recovery-first change");
  assert.match(explanation.line, /progression steadier|pushing harder would cost more/i);
  assert.match(explanation.detailLine, /watching completion and recovery|early read/i);
});

test("user-driven explanation stays clearly labeled when the user changes training setup", () => {
  const explanation = buildAdaptivePrescriptionExplanation({
    changeSummary: {
      inputType: "training_preference",
      surfaceLine: "Outdoor preference changed the setup for today.",
    },
    provenance: {
      events: [{ actor: "user" }],
    },
  });

  assert.equal(explanation.category, ADAPTIVE_EXPLANATION_CATEGORIES.userDrivenModification);
  assert.equal(explanation.sourceLabel, "You changed this");
  assert.equal(explanation.line, "Outdoor preference changed the setup for today.");
});

test("shadow-only adaptive traces stay out of the user-facing explanation layer", () => {
  const explanation = buildAdaptivePrescriptionExplanation({
    week: {
      adaptivePolicyTraces: [
        {
          decisionPointId: "time_crunched_session_format_choice",
          shadowTopActionId: "short_separate_sessions",
          fallbackReason: "shadow_mode",
          decisionMode: "shadow",
          candidateScores: [
            { actionId: "default_structure", confidenceScore: 0, sampleSize: 0 },
            { actionId: "short_separate_sessions", confidenceScore: 90, sampleSize: 18 },
          ],
          contextSnapshot: {
            timeCrunched: true,
          },
        },
      ],
    },
    planningBasisLine: "This follows your current block and top priorities.",
  });

  assert.equal(explanation.category, ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic);
  assert.equal(explanation.sourceLabel, "Plan rule");
  assert.equal(explanation.line, "This follows your current block and top priorities.");
  assert.doesNotMatch(explanation.line, /shorter blocks|busy weeks|recent training/i);
});

test("outcome explanation distinguishes skipped, modified, and pain-limited days", () => {
  const skipped = buildAdaptiveOutcomeExplanation({
    comparison: { completionKind: "skipped" },
    actualCheckin: {},
  });
  const modified = buildAdaptiveOutcomeExplanation({
    comparison: { completionKind: "modified", sameSessionFamily: true },
    actualCheckin: {},
  });
  const pain = buildAdaptiveOutcomeExplanation({
    comparison: { completionKind: "modified" },
    actualCheckin: { blocker: "pain_injury" },
  });

  assert.equal(skipped.sourceLabel, "Based on your recent training");
  assert.match(skipped.line, /make-up volume|actually landed/i);
  assert.equal(modified.sourceLabel, "You changed this");
  assert.match(modified.line, /session intent|changed the dose/i);
  assert.equal(pain.sourceLabel, "Recovery-first change");
  assert.match(pain.line, /Pain changed the day/i);
});
