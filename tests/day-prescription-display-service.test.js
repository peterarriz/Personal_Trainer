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

  assert.equal(summary.sessionType, "Strength");
  assert.match(summary.structure, /40-55 min strength progression/i);
  assert.match(summary.expectedDuration, /40-55 min/i);
  assert.match(summary.why, /strength lane moving/i);
});

test("run sessions infer useful duration and repair visible encoding in structure", () => {
  const summary = buildDayPrescriptionDisplay({
    training: {
      type: "hard-run",
      label: "Intervals",
      run: {
        t: "Intervals",
        d: "1mi+4Ãƒâ€”8min/3min+1mi",
      },
      explanation: "This is the main quality session for the week.",
    },
  });

  assert.equal(summary.sessionType, "Quality run");
  assert.match(summary.structure, /4×8min/i);
  assert.match(summary.expectedDuration, /3[0-9]-4[0-9] min/i);
});
