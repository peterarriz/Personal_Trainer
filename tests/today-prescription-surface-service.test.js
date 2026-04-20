const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
  buildTodayPrescriptionSurfaceModel,
} = require("../src/services/today-prescription-surface-service.js");

test("today prescription model builds a concise coach-led day surface", () => {
  const model = buildTodayPrescriptionSurfaceModel({
    dateKey: "2026-04-20",
    training: {
      type: "run+strength",
      label: "Easy run + upper support",
      run: { t: "Easy", d: "30 min" },
      strengthDuration: "18 min",
    },
    summary: {
      sessionLabel: "Easy run + upper support",
      structure: "30 min easy run, then upper support",
      why: "You lifted hard yesterday, so today keeps the week moving without stacking more fatigue.",
    },
    surfaceModel: {
      changeSummaryLine: "Aggressive preference active, but today still stays controlled.",
      canonicalReasonLine: "Recent work supports a controlled aerobic and strength touchpoint.",
    },
    whyNowLine: "You lifted hard yesterday, so today should stay useful without adding more cost.",
    prescribedExercises: [
      { ex: "DB bench press", sets: "3", reps: "8" },
      { ex: "Chest-supported row", sets: "3", reps: "10" },
      { ex: "Dead bug", sets: "3", reps: "8 / side" },
    ],
  });

  assert.equal(model.headerTitle, "Today's Plan");
  assert.match(model.dateLabel, /monday|apr/i);
  assert.equal(model.sessionLabel, "Easy run + upper support");
  assert.match(model.focusLine, /aerobic|strength|trunk/i);
  assert.equal(model.blocks.length, 4);
  assert.equal(model.blocks[0].number, 1);
  assert.match(model.blocks[0].title, /run \+ strength arc/i);
  assert.match(model.blocks[0].prescription, /30 min/i);
  assert.match(model.blocks[0].prescription, /bench|row/i);
  assert.match(model.whyLine, /aggressive preference active/i);
  assert.ok(model.rules.length >= 2);
});

test("today prescription adjustments rewrite the visible prescription deterministically", () => {
  const model = buildTodayPrescriptionSurfaceModel({
    dateKey: "2026-04-20",
    training: {
      type: "easy-run",
      label: "Easy aerobic work",
      run: { t: "Easy", d: "35 min" },
    },
    summary: {
      sessionLabel: "Easy aerobic work",
      structure: "35 min easy run",
      why: "This is a simple aerobic day.",
    },
    prescribedExercises: [
      { ex: "Goblet squat", sets: "3", reps: "8" },
      { ex: "Push-up", sets: "3", reps: "10" },
      { ex: "Side plank", sets: "3", reps: "30 sec" },
    ],
    adjustments: {
      ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
      time: "short",
      recovery: "low_energy",
      soreness: "legs",
      impact: "low_impact",
      cardioSwap: "bike",
      swapExercises: true,
    },
    environmentSelection: {
      scope: "today",
      mode: "Home",
    },
  });

  assert.match(model.whyLine, /time is tight today/i);
  assert.match(model.focusLine, /controlled work|recovery protection/i);
  assert.match(model.blocks[0].title, /run \+ strength arc/i);
  assert.match(model.blocks[0].prescription, /bike/i);
  assert.match(model.blocks[1].prescription, /ankle|calf|hip/i);
  assert.match(model.blocks[2].prescription, /nearest dumbbell|bodyweight/i);
  assert.ok(model.blocks.length <= 4);
  assert.deepEqual(model.adjustmentSummary, [
    "Short on time",
    "Low energy",
    "Legs sore",
    "Low impact",
    "Bike swap",
    "Exercise swap",
    "Home setup",
  ]);
  assert.match(model.rules.join(" "), /no hard impact|cut the accessory block/i);
});
