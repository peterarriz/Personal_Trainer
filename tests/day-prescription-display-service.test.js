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
  assert.match(summary.movementNote, /second full-body strength template/i);
  assert.equal(summary.exercisePreview.available, false);
  assert.match(summary.exercisePreview.note, /summary-level structure/i);
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
  assert.match(summary.movementNote, /variation cluster/i);
});

test("strength sessions surface exercise-level detail when prescribed rows exist", () => {
  const summary = buildDayPrescriptionDisplay({
    training: {
      type: "strength+prehab",
      label: "Strength B",
      strSess: "B",
    },
    prescribedExercises: [
      { ex: "Push-Up Complex", sets: "3 rounds", note: "No rest within round." },
      { ex: "Band Bent-over Row", sets: "4", reps: "15", note: "Row to chest." },
      { ex: "Hollow Body Hold", sets: "4", reps: "30 sec", note: "Lower back pressed down." },
    ],
  });

  assert.equal(summary.exercisePreview.available, true);
  assert.equal(summary.exercisePreview.rows.length, 3);
  assert.equal(summary.exercisePreview.rows[0].exercise, "Push-Up Complex");
  assert.match(summary.exercisePreview.rows[0].movementNote, /variation cluster/i);
  assert.equal(summary.exercisePreview.rows[1].structure, "4 x 15");
});

test("exercise preview keeps the full prescribed structure available for Today execution", () => {
  const summary = buildDayPrescriptionDisplay({
    training: {
      type: "strength",
      label: "Strength Circuit A",
    },
    prescribedExercises: [
      { ex: "Goblet Squat", sets: "3", reps: "10" },
      { ex: "Push-Up", sets: "3", reps: "12" },
      { ex: "DB Row", sets: "3", reps: "10" },
      { ex: "Split Squat", sets: "3", reps: "8/side" },
      { ex: "Carry", sets: "3", reps: "40m" },
    ],
  });

  assert.equal(summary.exercisePreview.available, true);
  assert.equal(summary.exercisePreview.rows.length, 5);
  assert.equal(summary.exercisePreview.note, "");
});
