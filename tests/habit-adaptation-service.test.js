const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyExercisePreferenceRows,
  buildHabitAdaptationContext,
} = require("../src/services/habit-adaptation-service.js");

const buildPlannedDayRecord = (dateKey, training) => ({
  id: `plan_day_${dateKey}`,
  dateKey,
  base: { training },
  resolved: { training },
});

const buildStrengthLog = (records = []) => ({
  checkin: { status: "completed_as_planned" },
  performanceRecords: records.map((record) => ({
    scope: "exercise",
    exercise: record.exercise,
    actualWeight: record.weight,
    actualReps: record.reps,
    actualSets: record.sets,
    prescribedWeight: record.weight,
    prescribedReps: record.reps,
    prescribedSets: record.sets,
  })),
});

const buildCardioLog = ({
  status = "completed_modified",
  label = "Bike aerobic",
  modality = "bike",
  notes = "",
} = {}) => ({
  checkin: { status },
  actualSession: {
    sessionLabel: label,
    modality,
  },
  notes,
});

test("habit adaptation flags chronic misses on the same weekday", () => {
  const context = buildHabitAdaptationContext({
    todayKey: "2026-04-21",
    plannedDayRecords: {
      "2026-03-28": buildPlannedDayRecord("2026-03-28", { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } }),
      "2026-04-04": buildPlannedDayRecord("2026-04-04", { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } }),
      "2026-04-11": buildPlannedDayRecord("2026-04-11", { type: "long-run", label: "Long Run", run: { t: "Long", d: "60 min" } }),
    },
    logs: {
      "2026-03-28": { checkin: { status: "skipped" } },
      "2026-04-04": { checkin: { status: "skipped" } },
      "2026-04-11": { checkin: { status: "skipped" } },
    },
  });

  assert.equal(context.chronicMissDayKey, 6);
  assert.equal(context.weekdayStats?.[6]?.skippedCount, 3);
  assert.match((context.summaryLines || []).join(" "), /repeated misses/i);
});

test("habit adaptation learns dominant accessory substitutions and can apply them to future rows", () => {
  const context = buildHabitAdaptationContext({
    todayKey: "2026-04-21",
    plannedDayRecords: {
      "2026-04-08": buildPlannedDayRecord("2026-04-08", {
        type: "strength+prehab",
        label: "Bench Maintenance A",
        prescribedExercises: [
          { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps", note: "Pair heavy pressing with strong pulling." },
          { ex: "Lateral raise", sets: "3 sets", reps: "12-15 reps", note: "Shoulder support." },
        ],
      }),
      "2026-04-15": buildPlannedDayRecord("2026-04-15", {
        type: "strength+prehab",
        label: "Bench Maintenance B",
        prescribedExercises: [
          { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps", note: "Pair heavy pressing with strong pulling." },
          { ex: "Lateral raise", sets: "3 sets", reps: "12-15 reps", note: "Shoulder support." },
        ],
      }),
    },
    logs: {
      "2026-04-08": buildStrengthLog([
        { exercise: "Chest-Supported Row", weight: 90, reps: 10, sets: 3 },
        { exercise: "Lateral Raise", weight: 20, reps: 15, sets: 3 },
      ]),
      "2026-04-15": buildStrengthLog([
        { exercise: "Chest-Supported Row", weight: 95, reps: 10, sets: 3 },
        { exercise: "Lateral Raise", weight: 20, reps: 15, sets: 3 },
      ]),
    },
  });

  const preference = (context.exercisePreferences || []).find((entry) => entry.pattern === "upper_pull");
  assert.ok(preference);
  assert.equal(preference.preferredExercise, "Chest-Supported Row");

  const applied = applyExercisePreferenceRows({
    rows: [
      { ex: "Weighted pull-up or pull-down", sets: "4 sets", reps: "6-8 reps", note: "Pair heavy pressing with strong pulling." },
      { ex: "Bench press top set", sets: "1 top set + 3 backoff sets", reps: "4-6 reps", note: "Heavy press stays central." },
    ],
    exercisePreferences: context.exercisePreferences,
  });

  assert.equal(applied.changed, true);
  assert.equal(applied.rows?.[0]?.ex, "Chest-Supported Row");
  assert.equal(applied.rows?.[1]?.ex, "Bench press top set");
});

test("habit adaptation learns cardio mode preferences, low-impact bias, and the long-session day that actually happens", () => {
  const context = buildHabitAdaptationContext({
    todayKey: "2026-04-21",
    plannedDayRecords: {
      "2026-03-31": buildPlannedDayRecord("2026-03-31", { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "30 min" } }),
      "2026-04-02": buildPlannedDayRecord("2026-04-02", { type: "conditioning", label: "Conditioning Intervals" }),
      "2026-04-07": buildPlannedDayRecord("2026-04-07", { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "35 min" } }),
      "2026-04-09": buildPlannedDayRecord("2026-04-09", { type: "conditioning", label: "Conditioning Intervals" }),
      "2026-04-12": buildPlannedDayRecord("2026-04-12", { type: "long-run", label: "Long Run", run: { t: "Long", d: "65 min" } }),
      "2026-04-19": buildPlannedDayRecord("2026-04-19", { type: "long-run", label: "Long Run", run: { t: "Long", d: "70 min" } }),
    },
    logs: {
      "2026-03-31": buildCardioLog({ label: "Steady bike aerobic", modality: "bike" }),
      "2026-04-02": buildCardioLog({ label: "Elliptical conditioning", modality: "elliptical" }),
      "2026-04-07": buildCardioLog({ label: "Steady bike aerobic", modality: "bike" }),
      "2026-04-09": buildCardioLog({ label: "Elliptical conditioning", modality: "elliptical" }),
      "2026-04-12": buildCardioLog({ status: "completed_as_planned", label: "Outdoor long run", modality: "outdoor run" }),
      "2026-04-19": buildCardioLog({ status: "completed_as_planned", label: "Outdoor long run", modality: "outdoor run" }),
    },
  });

  assert.equal(context.cardioPreferences?.easyAerobic?.mode, "bike");
  assert.equal(context.cardioPreferences?.conditioning?.mode, "elliptical");
  assert.equal(context.cardioPreferences?.preferredLongSessionDayKey, 0);
  assert.equal(context.lowImpactBias, true);
  assert.match((context.summaryLines || []).join(" "), /long sessions most often land on sunday/i);
  assert.match((context.summaryLines || []).join(" "), /low-impact cardio/i);
});

test("habit adaptation learns recurring add-on accessories and accessory patterns to stop forcing", () => {
  const context = buildHabitAdaptationContext({
    todayKey: "2026-04-21",
    plannedDayRecords: {
      "2026-04-01": buildPlannedDayRecord("2026-04-01", {
        type: "strength+prehab",
        label: "Strength Support A",
        prescribedExercises: [
          { ex: "Bench Press", sets: "4 sets", reps: "6 reps", note: "Main press." },
          { ex: "Standing Calf Raise", sets: "3 sets", reps: "15 reps", note: "Lower-leg support." },
        ],
      }),
      "2026-04-08": buildPlannedDayRecord("2026-04-08", {
        type: "strength+prehab",
        label: "Strength Support B",
        prescribedExercises: [
          { ex: "Bench Press", sets: "4 sets", reps: "6 reps", note: "Main press." },
          { ex: "Standing Calf Raise", sets: "3 sets", reps: "15 reps", note: "Lower-leg support." },
        ],
      }),
      "2026-04-15": buildPlannedDayRecord("2026-04-15", {
        type: "strength+prehab",
        label: "Strength Support C",
        prescribedExercises: [
          { ex: "Bench Press", sets: "4 sets", reps: "6 reps", note: "Main press." },
          { ex: "Standing Calf Raise", sets: "3 sets", reps: "15 reps", note: "Lower-leg support." },
        ],
      }),
    },
    logs: {
      "2026-04-01": buildStrengthLog([
        { exercise: "Bench Press", weight: 155, reps: 8, sets: 3 },
        { exercise: "Ab Wheel Rollout", weight: 0, reps: 10, sets: 3 },
      ]),
      "2026-04-08": buildStrengthLog([
        { exercise: "Bench Press", weight: 160, reps: 6, sets: 4 },
        { exercise: "Ab Wheel Rollout", weight: 0, reps: 10, sets: 3 },
      ]),
      "2026-04-15": buildStrengthLog([
        { exercise: "Bench Press", weight: 160, reps: 6, sets: 4 },
        { exercise: "Ab Wheel Rollout", weight: 0, reps: 12, sets: 3 },
      ]),
    },
  });

  const addOnPreference = (context.accessoryAddOnPreferences || []).find((entry) => entry.pattern === "trunk");
  const avoidPattern = (context.avoidAccessoryPatterns || []).find((entry) => entry.pattern === "lower_leg_support");

  assert.ok(addOnPreference);
  assert.equal(addOnPreference.preferredExercise, "Ab Wheel Rollout");
  assert.ok(avoidPattern);
  assert.ok(Number(avoidPattern.omittedCount) >= 3);
  assert.match((context.summaryLines || []).join(" "), /keep adding ab wheel rollout/i);
  assert.match((context.summaryLines || []).join(" "), /stop being treated as mandatory/i);
});
