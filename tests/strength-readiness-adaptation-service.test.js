const test = require("node:test");
const assert = require("node:assert/strict");

const {
  adaptStrengthRowsForState,
  adaptStrengthWorkoutForState,
  isStrengthWorkoutCandidate,
} = require("../src/services/strength-readiness-adaptation-service.js");

const buildWorkout = () => ({
  type: "strength+prehab",
  label: "Upper-Body Strength",
  strSess: "B",
  strengthDuration: "45-60 min heavy upper-body work",
  strengthDose: "45-60 min heavy upper-body work",
  optionalSecondary: "Optional: short incline walk cooldown",
  intensityGuidance: "Heavy pressing with quality backoff work",
  prescribedExercises: [
    { ex: "Bench press top set", sets: "1 top set + 3 backoff sets", reps: "4-6 reps", note: "Heavy press stays central." },
    { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps", note: "Pair heavy pressing with heavy pulling." },
    { ex: "Incline press", sets: "3 sets", reps: "8-10 reps", note: "Upper-body volume supports physique goals." },
    { ex: "Arms or rear delts", sets: "2-3 sets", reps: "10-15 reps", note: "Keep the bodybuilding layer visible." },
  ],
});

test("steady strength adaptation preserves the full prescription and marks the mode", () => {
  const workout = adaptStrengthWorkoutForState({ workout: buildWorkout(), state: "steady" });

  assert.equal(isStrengthWorkoutCandidate(workout), true);
  assert.equal(workout.strengthPrescriptionMode, "steady");
  assert.equal(workout.prescribedExercises.length, 4);
  assert.equal(workout.prescribedExercises[0].ex, "Bench press top set");
  assert.match(workout.densityGuidance || "", /normal session density/i);
  assert.match(workout.effortGuidance || "", /1-2 reps in reserve/i);
});

test("reduced-load strength adaptation trims the session and lowers the dose", () => {
  const workout = adaptStrengthWorkoutForState({ workout: buildWorkout(), state: "reduced_load" });

  assert.equal(workout.strengthPrescriptionMode, "reduced_load");
  assert.equal(workout.prescribedExercises.length, 3);
  assert.equal(workout.strengthDuration, "20-30 min reduced-load strength");
  assert.equal(workout.intensityGuidance, "Controlled strength only");
  assert.match(workout.optionalSecondary || "", /skip the optional finisher/i);
  assert.match(workout.effortGuidance || "", /2-3 reps in reserve/i);
  assert.equal(workout.prescribedExercises[0].sets, "3 sets");
  assert.equal(workout.prescribedExercises[0].reps, "8-10 reps");
  assert.equal(workout.prescribedExercises[0].rest, "60-90s");
});

test("recovery strength adaptation keeps a short technique-focused version instead of wiping the lane", () => {
  const workout = adaptStrengthWorkoutForState({ workout: buildWorkout(), state: "recovery" });

  assert.equal(workout.type, "strength+prehab");
  assert.equal(workout.strengthPrescriptionMode, "recovery");
  assert.equal(workout.prescribedExercises.length, 2);
  assert.equal(workout.strengthDose, "12-18 min recovery strength");
  assert.equal(workout.intensityGuidance, "Recovery strength only");
  assert.match(workout.densityGuidance || "", /very low density/i);
  assert.match(workout.effortGuidance || "", /3-4 reps in reserve/i);
  assert.equal(workout.prescribedExercises[0].sets, "2 sets");
  assert.equal(workout.prescribedExercises[1].rest, "75-120s");
});

test("row-only adaptation can produce a recovery pair from a longer session", () => {
  const rows = adaptStrengthRowsForState({ rows: buildWorkout().prescribedExercises, state: "recovery" }).rows;

  assert.equal(rows.length, 2);
  assert.equal(rows[0].ex, "Bench press top set");
  assert.match(rows[1].ex, /pull-up|pull-down/i);
});
