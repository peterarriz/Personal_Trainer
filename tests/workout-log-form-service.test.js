const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WORKOUT_LOG_FAMILIES,
  WORKOUT_LOG_MODES,
  buildWorkoutLogFormRecommendation,
  buildWorkoutLogDraft,
  buildWorkoutLogEntryFromDraft,
  buildWorkoutQuickCaptureModel,
  hasWorkoutQuickCaptureValues,
} = require("../src/services/workout-log-form-service.js");
const { adaptStrengthWorkoutForState } = require("../src/services/strength-readiness-adaptation-service.js");

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
  assert.equal(draft.run.duration, "28");
  assert.equal(draft.run.distance, "2");
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

test("quick capture model keeps the default logging path compact for run days", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "hard-run",
      label: "Tempo Run",
      run: { t: "Tempo", d: "10 min easy + 20 min tempo + 10 min easy" },
    }),
  });

  const quickCapture = buildWorkoutQuickCaptureModel({ draft });

  assert.equal(quickCapture.completeActionLabel, "Quick complete");
  assert.equal(quickCapture.detailToggleLabel, "Add quick run details");
  assert.equal(quickCapture.saveActionLabel, "Save run");
  assert.equal(quickCapture.run.enabled, true);
  assert.deepEqual(
    quickCapture.run.fields.map((field) => field.id),
    ["duration", "distance", "pace"]
  );
  assert.equal(quickCapture.run.fields[0].value, "40");
  assert.match(quickCapture.supportLine, /full details are optional/i);
  assert.equal(hasWorkoutQuickCaptureValues({ draft }), false);
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
  assert.equal(draft.strength.rows[0].actualSets, "4");
  assert.equal(draft.strength.rows[0].actualReps, "6");
  assert.equal(draft.strength.rows[0].substitutionAllowed, true);
  assert.equal(draft.strength.rows[0].substitutionState, "prescribed");
  assert.equal(draft.strength.rows[0].canResetToPrescribed, false);
  assert.equal(hasWorkoutQuickCaptureValues({ draft }), false);
  assert.equal(draft.substitutionSupport.allowed, true);
});

test("untouched strength draft saves the prescribed sets and reps as default actuals", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength B",
    }),
    prescribedExercises: [
      { ex: "Barbell Bench Press", sets: "4x6", weight: 185 },
    ],
    logEntry: {},
  });

  const entry = buildWorkoutLogEntryFromDraft({
    draft,
    baseEntry: {},
    todayKey: "2026-04-11",
  });

  assert.equal(entry.strengthPerformance.length, 1);
  assert.equal(entry.strengthPerformance[0].actualSets, 4);
  assert.equal(entry.strengthPerformance[0].actualReps, 6);
  assert.equal(entry.strengthPerformance[0].actualWeight, 185);
});

test("strength day logs the adjusted reduced-load prescription by default", () => {
  const adaptedTraining = adaptStrengthWorkoutForState({
    workout: {
      type: "strength+prehab",
      label: "Strength B",
      strSess: "B",
      strengthDuration: "45-60 min heavy upper-body work",
      prescribedExercises: [
        { ex: "Bench press top set", sets: "1 top set + 3 backoff sets", reps: "4-6 reps" },
        { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps" },
        { ex: "Incline press", sets: "3 sets", reps: "8-10 reps" },
        { ex: "Arms or rear delts", sets: "2-3 sets", reps: "10-15 reps" },
      ],
    },
    state: "reduced_load",
  });

  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord(adaptedTraining),
    logEntry: {},
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.strength);
  assert.match(draft.plannedSummary.sessionLabel || "", /strength b/i);
  assert.equal(draft.strength.rows.length, 3);
  assert.equal(draft.strength.rows[0].exercise, "Bench press top set");
  assert.equal(draft.strength.rows[0].prescribedSets, 3);
  assert.equal(draft.strength.rows[0].prescribedReps, 10);
  assert.equal(draft.strength.rows[1].prescribedSets, 2);
  assert.match(draft.strength.rows[0].prescribedRepsText, /8-10 reps/i);
  assert.equal(draft.plannedSummary.sessionPlan.rows[0].title, "Bench press top set");
  assert.equal(draft.plannedSummary.sessionPlan.rows[2].title, "Incline press");
  assert.match(draft.plannedSummary.sessionPlan.rows[3].detail || "", /skip the optional finisher/i);
});

test("quick capture model limits strength rows while keeping prescribed context visible", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength B",
    }),
    prescribedExercises: [
      { ex: "Barbell Bench Press", sets: "4x6" },
      { ex: "Cable Row", sets: "3x10" },
      { ex: "Romanian Deadlift", sets: "3x8" },
      { ex: "Bulgarian Split Squat", sets: "3x10" },
    ],
  });

  const quickCapture = buildWorkoutQuickCaptureModel({ draft });

  assert.equal(quickCapture.detailToggleLabel, "Add quick sets and reps");
  assert.equal(quickCapture.saveActionLabel, "Save strength");
  assert.equal(quickCapture.strength.rows.length, 3);
  assert.equal(quickCapture.strength.hiddenRowCount, 1);
  assert.match(quickCapture.strength.rows[0].prescribedSummary, /4 sets/i);
});

test("run-day detailed logging stays seeded from the canonical planned session even if legacy generic fields exist", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "hard-run",
      label: "Tempo Run",
      run: { t: "Tempo", d: "10 min easy + 20 min tempo + 10 min easy" },
    }),
    logEntry: {
      pushups: "25",
      reps: "25",
      weight: "0",
    },
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.run);
  assert.equal(draft.generic.visible, false);
  assert.equal(draft.strength.rows.length, 0);
  assert.equal(draft.plannedSummary.sessionLabel, "Tempo Run");
  assert.equal(draft.plannedSummary.sessionPlan.available, true);
  assert.equal(draft.plannedSummary.sessionPlan.rows[1].title, "Tempo segment");
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

test("minimal quick run input can be saved without the full detail form", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "hard-run",
      label: "Intervals",
      run: { t: "Intervals", d: "1 mi warm-up + 4 x 5 min / 2 min + 1 mi cool-down" },
    }),
    logEntry: {},
  });

  draft.run.duration = "42";

  const entry = buildWorkoutLogEntryFromDraft({
    draft,
    baseEntry: {},
    todayKey: "2026-04-11",
  });

  assert.equal(hasWorkoutQuickCaptureValues({ draft }), true);
  assert.equal(entry.runTime, "42");
  assert.equal(entry.miles, "2");
  assert.equal(entry.actualSession.sessionFamily, WORKOUT_LOG_FAMILIES.run);
});

test("minimal quick strength input still preserves prescribed versus actual separation", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "strength+prehab",
      label: "Strength B",
    }),
    prescribedExercises: [
      { ex: "Barbell Bench Press", sets: "4x6", weight: 185 },
    ],
    logEntry: {},
  });

  draft.strength.rows[0].actualSets = "4";
  draft.strength.rows[0].actualReps = "5";
  draft.strength.rows[0].actualWeight = "185";

  const entry = buildWorkoutLogEntryFromDraft({
    draft,
    baseEntry: {},
    todayKey: "2026-04-11",
  });

  assert.equal(hasWorkoutQuickCaptureValues({ draft }), true);
  assert.equal(entry.strengthPerformance.length, 1);
  assert.equal(entry.strengthPerformance[0].prescribedSets, 4);
  assert.equal(entry.strengthPerformance[0].prescribedReps, 6);
  assert.equal(entry.strengthPerformance[0].actualSets, 4);
  assert.equal(entry.strengthPerformance[0].actualReps, 5);
  assert.equal(entry.strengthPerformance[0].actualWeight, 185);
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
  assert.equal(draft.run.duration, "40");
  assert.equal(draft.strength.enabled, true);
  assert.equal(draft.strength.rows.length, 1);
  assert.equal(draft.strength.rows[0].actualSets, "3");
  assert.equal(draft.strength.rows[0].actualReps, "10");
  assert.equal(draft.generic.visible, false);
  assert.equal(draft.sections.run.enabled, true);
  assert.equal(draft.sections.strength.enabled, true);
  assert.equal(draft.sections.generic.enabled, false);
  assert.deepEqual(
    draft.recommendedFields.map((field) => field.section),
    ["run", "run", "run", "run", "run", "strength", "strength", "strength", "strength", "strength", "strength"]
  );
});

test("run-only draft prefills planned values without counting them as user changes", () => {
  const draft = buildWorkoutLogDraft({
    dateKey: "2026-04-11",
    plannedDayRecord: buildPlannedDayRecord({
      type: "hard-run",
      label: "Tempo Run",
      run: { t: "Tempo", d: "10 min easy + 20 min tempo + 10 min easy" },
    }),
    logEntry: {},
  });

  assert.equal(draft.family, WORKOUT_LOG_FAMILIES.run);
  assert.equal(draft.run.duration, "40");
  assert.equal(hasWorkoutQuickCaptureValues({ draft }), false);
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
