const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKOUT_LOG_FAMILIES,
  WORKOUT_LOG_MODES,
  buildWorkoutLogFormRecommendation,
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

test("recommendation service maps run sessions to running fields", () => {
  const recommendation = buildWorkoutLogFormRecommendation({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "hard-run",
      label: "Tempo Run",
      run: { t: "Tempo", d: "10 min easy + 20 min tempo + 10 min easy" },
    }),
  });

  assert.equal(recommendation.recommendedMode, WORKOUT_LOG_MODES.running);
  assert.deepEqual(
    recommendation.recommendedFields.map((field) => field.id),
    ["distance", "duration", "pace", "feel", "notes"]
  );
  assert.equal(recommendation.sections.run.enabled, true);
  assert.equal(recommendation.sections.strength.enabled, false);
  assert.equal(recommendation.sections.generic.enabled, false);
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
  assert.equal(draft.strength.rows[0].substitutionAllowed, true);
  assert.equal(draft.strength.rows[0].substitutionState, "prescribed");
  assert.equal(draft.strength.rows[0].canResetToPrescribed, false);
  assert.equal(draft.substitutionSupport.allowed, true);
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
  draft.strength.rows[0].isSubstituted = true;
  draft.strength.rows[0].substitutionState = "substituted";
  draft.strength.rows[0].canResetToPrescribed = true;
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

test("actual records matched to a prescribed row mark the row as substituted", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength B",
    }),
    prescribedExercises: [
      { ex: "Barbell Bench Press", sets: "4x6" },
    ],
    logEntry: {
      date: "2026-04-11",
      strengthPerformance: [
        {
          exercise: "Dumbbell Bench Press",
          actualSets: 4,
          actualReps: 8,
          actualWeight: 80,
        },
      ],
    },
  });

  assert.equal(draft.strength.rows[0].exercise, "Dumbbell Bench Press");
  assert.equal(draft.strength.rows[0].isSubstituted, true);
  assert.equal(draft.strength.rows[0].substitutionState, "substituted");
  assert.equal(draft.strength.rows[0].canResetToPrescribed, true);
});

test("canonical training exercise rows can seed strength logging without extra wiring", () => {
  const recommendation = buildWorkoutLogFormRecommendation({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength A",
      prescribedExercises: [
        { ex: "Goblet Squat", sets: "3x10" },
        { ex: "Single-Arm Row", sets: "3x12" },
      ],
    }),
  });

  assert.equal(recommendation.recommendedMode, WORKOUT_LOG_MODES.strength);
  assert.equal(recommendation.prefilledExerciseRows.length, 2);
  assert.equal(recommendation.prefilledExerciseRows[0].exercise, "Goblet Squat");
  assert.equal(recommendation.sections.strength.hasPrescribedStructure, true);
  assert.deepEqual(
    recommendation.sections.strength.fields.filter((field) => field.fastPath).map((field) => field.id),
    ["actualSets", "actualReps", "actualWeight"]
  );
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
  assert.equal(draft.generic.visible, false);
  assert.equal(draft.sections.run.enabled, true);
  assert.equal(draft.sections.strength.enabled, true);
  assert.equal(draft.sections.generic.enabled, false);
  assert.deepEqual(
    draft.recommendedFields.map((field) => field.section),
    ["run", "run", "run", "run", "run", "strength", "strength", "strength", "strength", "strength", "strength"]
  );
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

test("generic fallback sessions recommend a compact fallback schema", () => {
  const recommendation = buildWorkoutLogFormRecommendation({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "session",
      label: "Open Gym",
    }),
  });

  assert.equal(recommendation.recommendedMode, WORKOUT_LOG_MODES.generic);
  assert.equal(recommendation.sections.generic.enabled, true);
  assert.equal(recommendation.sections.run.enabled, false);
  assert.equal(recommendation.sections.strength.enabled, false);
  assert.deepEqual(
    recommendation.recommendedFields.map((field) => field.id),
    ["reps", "weight", "feel", "notes"]
  );
  assert.equal(recommendation.substitutionSupport.allowed, false);
});
