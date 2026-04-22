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
      explanationCategory: "adaptive_personalization",
      explanationSourceLabel: "Based on your recent training",
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
  assert.equal(model.blocks.length, 5);
  assert.equal(model.blocks[0].number, 1);
  assert.match(model.blocks[0].title, /session arc/i);
  assert.match(model.blocks[0].prescription, /30 min/i);
  assert.match(model.blocks[1].title, /strength touchpoint/i);
  assert.match(model.blocks[1].prescription, /DB bench press/i);
  assert.doesNotMatch(model.blocks[1].prescription, /Dead bug/i);
  assert.match(model.blocks[2].title, /core \/ accessory/i);
  assert.match(model.blocks[2].prescription, /Dead bug/i);
  assert.match(model.blocks[3].title, /mobility/i);
  assert.match(model.blocks[4].title, /optional finisher/i);
  assert.match(model.whyLine, /aggressive preference active/i);
  assert.ok(model.trustModel?.chips?.some((chip) => chip.label === "Recent workouts"));
  assert.ok(model.trustModel?.chips?.some((chip) => chip.label === "Goal balance"));
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
  assert.match(model.sessionLabel, /easy aerobic work/i);
  assert.match(model.blocks[0].title, /bike substitution/i);
  assert.match(model.blocks[0].prescription, /bike/i);
  assert.equal(model.blocks.length, 3);
  assert.equal(model.blocks[1].title, "Mobility");
  assert.match(model.blocks[1].prescription, /ankle|calf|hip/i);
  assert.match(model.blocks[2].title, /core \/ accessory/i);
  assert.match(model.blocks[2].prescription, /nearest dumbbell|bodyweight/i);
  assert.match(model.blocks[2].variant, /two clean rounds/i);
  assert.ok(model.trustModel?.chips?.some((chip) => chip.label === "Time cap"));
  assert.ok(model.trustModel?.chips?.some((chip) => chip.label === "Low recovery"));
  assert.ok(model.trustModel?.chips?.some((chip) => chip.label === "Sore legs"));
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

test("strength days stay inside a 3-5 block budget instead of exploding into one card per lift", () => {
  const model = buildTodayPrescriptionSurfaceModel({
    dateKey: "2026-04-21",
    training: {
      type: "strength+prehab",
      label: "Strength A",
      strengthDuration: "45 min",
    },
    summary: {
      sessionLabel: "Strength A",
      structure: "Main lift + support",
      why: "Today is for clean strength work without unnecessary fatigue.",
    },
    prescribedExercises: [
      { ex: "Back squat", sets: "4", reps: "5", prescribedWeight: "225" },
      { ex: "Romanian deadlift", sets: "3", reps: "8", prescribedWeight: "185" },
      { ex: "Walking lunge", sets: "3", reps: "10 / side" },
      { ex: "Hanging knee raise", sets: "3", reps: "12" },
      { ex: "Face pull", sets: "3", reps: "15" },
    ],
  });

  assert.ok(model.blocks.length >= 3);
  assert.ok(model.blocks.length <= 5);
  assert.equal(model.blocks[0].title, "Warm-up");
  assert.equal(model.blocks[1].title, "Back squat");
  assert.equal(model.blocks[2].title, "Romanian deadlift");
  assert.match(model.blocks[3].title, /accessory \/ core/i);
  assert.match(model.blocks[3].prescription, /Walking lunge/i);
});
