const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDayPrescriptionDisplay,
} = require("../src/services/day-prescription-display-service.js");

test("strength placeholder sessions expand into concise prescription detail", () => {
  const summary = buildDayPrescriptionDisplay({
    training: {
      type: "strength+prehab",
      label: "Strength B",
      strSess: "B",
      strengthDose: "40-55 min strength progression",
      success: "Build or maintain strength while supporting durability.",
      explanation: "This keeps the strength lane moving while the block stays hybrid.",
    },
    week: {
      successDefinition: "Keep the strength lane moving without stealing recovery from key runs.",
    },
  });

  assert.equal(summary.sessionLabel, "Full-body strength B");
  assert.equal(summary.sessionType, "Strength");
  assert.match(summary.structure, /40-55 min strength progression/i);
  assert.match(summary.expectedDuration, /40-55 min/i);
  assert.match(summary.movementNote, /A\/B labels mean alternating lift templates/i);
  assert.match(summary.why, /strength lane moving/i);
});

test("run sessions infer useful duration and keep interval structure legible", () => {
  const summary = buildDayPrescriptionDisplay({
    training: {
      type: "hard-run",
      label: "Intervals",
      run: {
        t: "Intervals",
        d: "1mi+4ÃƒÆ’Ã¢â‚¬â€8min/3min+1mi",
      },
      explanation: "This is the main quality session for the week.",
    },
  });

  assert.equal(summary.sessionType, "Quality run");
  assert.match(summary.structure, /intervals:/i);
  assert.match(summary.structure, /8min/i);
  assert.match(summary.expectedDuration, /3[0-9]-4[0-9] min/i);
});

test("unclear movement names get a short explanation note", () => {
  const summary = buildDayPrescriptionDisplay({
    training: {
      type: "strength+prehab",
      label: "Push-Up Complex",
      strengthDose: "3 rounds, short rests, accessory finish",
    },
  });

  assert.equal(summary.sessionLabel, "Push-Up Complex");
  assert.match(summary.movementNote, /strings a few movements together/i);
});
