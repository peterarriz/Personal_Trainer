import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCoachVoicePrompt,
  resolveCoachVoiceDisplayCopy,
  sanitizeCoachVoiceVariant,
} from "../src/services/intake-coach-voice-service.js";

test("buildCoachVoicePrompt keeps the request bound to one known field", () => {
  const prompt = buildCoachVoicePrompt({
    field_id: "current_run_frequency",
    label: "Runs per week",
    question_template: "How many times are you running in a normal week?",
    why_it_matters: "This tells me how much running fits your life right now.",
    examples: ["3", "4 runs/week"],
    tone: "supportive_trainer",
  });

  assert.match(prompt, /current_run_frequency/);
  assert.match(prompt, /questionText/);
  assert.match(prompt, /reassuranceLine/);
  assert.match(prompt, /Do not ask for any additional information/i);
});

test("valid coach-voice phrasing can upgrade copy without changing the active field binding", () => {
  const anchor = {
    anchor_id: "running_baseline:current_run_frequency",
    field_id: "current_run_frequency",
    question: "How many times are you running in a normal week?",
    why_it_matters: "Run frequency is the fastest way to size how much running fits right now.",
    coach_voice_line: "Coach note: give me your normal week, not your best one.",
  };

  const fallbackCopy = resolveCoachVoiceDisplayCopy({ anchor, phrasing: null });
  const aiCopy = resolveCoachVoiceDisplayCopy({
    anchor,
    phrasing: {
      questionText: "On a normal week, how many runs are you getting in?",
      helperText: "This tells me how much running we can build around right now.",
      reassuranceLine: "Coach note: a normal week is exactly what I want here.",
    },
  });

  assert.equal(anchor.anchor_id, "running_baseline:current_run_frequency");
  assert.equal(anchor.field_id, "current_run_frequency");
  assert.equal(fallbackCopy.questionText, "How many times are you running in a normal week?");
  assert.equal(aiCopy.questionText, "On a normal week, how many runs are you getting in?");
  assert.equal(aiCopy.helperText.includes("running"), true);
});

test("coach-voice sanitizer rejects extra fields and unsupported claims", () => {
  const sanitized = sanitizeCoachVoiceVariant({
    phrasing: {
      questionText: "How many runs are you getting in each week and what's your longest run?",
      helperText: "This guarantees I can build the perfect plan.",
      reassuranceLine: "Coach note: I definitely know exactly what you need.",
      extraField: "target_timeline",
    },
  });

  assert.equal(sanitized, null);
});

test("coach-voice display falls back to deterministic copy when phrasing fails strict sanitization", () => {
  const anchor = {
    anchor_id: "race_timeline:target_timeline",
    field_id: "target_timeline",
    question: "What race date or target month are you aiming at right now?",
    why_it_matters: "This tells me how much runway we have for the first block.",
    coach_voice_line: "Coach note: a rough month is enough if you do not know the exact date yet.",
  };

  const tooLongHelper = `${"This helps ".repeat(30)}right now.`;
  const displayCopy = resolveCoachVoiceDisplayCopy({
    anchor,
    phrasing: {
      questionText: "What race date or target month are you aiming at right now?",
      helperText: tooLongHelper,
      reassuranceLine: "Coach note: a rough month is plenty here.",
    },
  });

  assert.equal(displayCopy.questionText, anchor.question);
  assert.equal(displayCopy.helperText, anchor.why_it_matters);
  assert.equal(displayCopy.reassuranceLine, anchor.coach_voice_line);
});
