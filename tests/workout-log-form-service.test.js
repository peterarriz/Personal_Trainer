const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKOUT_LOG_FAMILIES,
  buildWorkoutLogDraft,
  buildWorkoutLogEntryFromDraft,
} = require("../src/services/workout-log-form-service.js");

const buildPlannedDayRecord = (training) => ({
  dateKey: "2026-04-11",
  resolved: { training },
});

test("run day builds run-focused logging fields first", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "hard-run",
      label: "Intervals",
      run: { t: "Intervals", d: "1 mi warm-up + 4 x 5 min / 2 min + 1 mi cool-down" },
    }),
    logEntry: {},
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.run);
  assert.equal(draft.run.enabled, true);
  assert.match(draft.run.purpose, /quality run/i);
  assert.match(draft.run.structure, /4 x 5 min/i);
  assert.equal(draft.strength.enabled, false);
});

test("strength day prefills prescribed exercise logging path", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength B",
    }),
    prescribedExercises: [
      { ex: "Barbell Bench Press", sets: "4x6" },
      { ex: "Cable Row", sets: "3x10" },
    ],
    logEntry: {},
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.strength);
  assert.equal(draft.strength.enabled, true);
  assert.equal(draft.strength.hasPrescribedStructure, true);
  assert.equal(draft.strength.rows.length, 2);
  assert.equal(draft.strength.rows[0].exercise, "Barbell Bench Press");
  assert.equal(draft.strength.rows[0].prescribedSets, 4);
  assert.equal(draft.strength.rows[0].prescribedReps, 6);
});

test("exercise substitution path preserves actual exercise change", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength B",
    }),
    prescribedExercises: [
      { ex: "Barbell Bench Press", sets: "4x6" },
    ],
    logEntry: {},
  });

  draft.feel = "4";
  draft.strength.rows[0].exercise = "Dumbbell Bench Press";
  draft.strength.rows[0].actualSets = "4";
  draft.strength.rows[0].actualReps = "8";
  draft.strength.rows[0].actualWeight = "80";

  const entry = buildWorkoutLogEntryFromDraft({
    draft,
    baseEntry: {},
    todayKey: "2026-04-11",
  });

  assert.equal(entry.strengthPerformance.length, 1);
  assert.equal(entry.strengthPerformance[0].exercise, "Dumbbell Bench Press");
  assert.equal(entry.strengthPerformance[0].actualSets, 4);
  assert.equal(entry.strengthPerformance[0].actualReps, 8);
  assert.equal(entry.strengthPerformance[0].actualWeight, 80);
});

test("mixed session builds split run and strength logging paths", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "run+strength",
      label: "Tempo + strength",
      run: { t: "Tempo", d: "10 min easy + 20 min tempo + 10 min easy" },
    }),
    prescribedExercises: [
      { ex: "Goblet Squat", sets: "3x10" },
    ],
    logEntry: {},
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.mixed);
  assert.equal(draft.run.enabled, true);
  assert.equal(draft.strength.enabled, true);
  assert.equal(draft.strength.rows.length, 1);
});

test("strength session without prescribed structure degrades to generic fallback", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength",
      label: "Strength session",
    }),
    prescribedExercises: [],
    logEntry: {},
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.strength);
  assert.equal(draft.strength.enabled, true);
  assert.equal(draft.strength.hasPrescribedStructure, false);
  assert.equal(draft.strength.rows.length, 0);
  assert.equal(draft.generic.visible, true);
});
