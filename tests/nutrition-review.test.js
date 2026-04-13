const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const {
  compareNutritionPrescriptionToActual,
  normalizeActualNutritionLog,
} = require("../src/modules-nutrition.js");
const { buildDayReview } = require("../src/services/day-review-service.js");
const {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  getCurrentPrescribedDayRevision,
  upsertPrescribedDayHistoryEntry,
} = require("../src/services/prescribed-day-history-service.js");

const buildPlannedRecord = ({
  dateKey = "2026-04-08",
  label = "Upper Strength",
  nutritionCalories = 2500,
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: 9 },
  base: {
    training: { label, type: "strength", strengthTrack: "upper" },
    nutrition: { prescription: { dayType: "strength", targets: { cal: nutritionCalories, p: 190, c: 220, f: 72, hydrationTargetOz: 100 } } },
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: { label, type: "strength", strengthTrack: "upper" },
    nutrition: { prescription: { dayType: "strength", targets: { cal: nutritionCalories, p: 190, c: 220, f: 72, hydrationTargetOz: 100 } } },
    recovery: { state: "ready" },
    supplements: null,
  },
  decision: { mode: "progression_ready", modifiedFromBase: false },
  provenance: { summary: "Planned strength day.", keyDrivers: [], events: [] },
  flags: {},
});

test("nutrition actuals normalize and compare against prescription without legacy ambiguity", () => {
  const actualNutritionLog = normalizeActualNutritionLog({
    dateKey: "2026-04-08",
    feedback: {
      issue: "hunger",
      hydrationOz: 48,
      hydrationTargetOz: 96,
      supplementTaken: ["creatine", "electrolytes"],
      actualNutrition: {
        quickStatus: "decent",
        note: "Missed my post-workout meal and felt hungry later.",
      },
    },
  });

  const comparison = compareNutritionPrescriptionToActual({
    nutritionPrescription: { dayType: "hardRun", targets: { cal: 2700 } },
    actualNutritionLog,
  });

  assert.equal(actualNutritionLog.model, "actual_nutrition_log_v1");
  assert.equal(actualNutritionLog.deviationKind, "under_fueled");
  assert.equal(actualNutritionLog.followedPlan, false);
  assert.equal(actualNutritionLog.hydration.pct, 50);
  assert.deepEqual(actualNutritionLog.supplements.takenNames.sort(), ["creatine", "electrolytes"]);
  assert.equal(comparison.hasActual, true);
  assert.equal(comparison.deviationKind, "under_fueled");
  assert.equal(comparison.matters, "high");
});

test("nutrition actuals can be logged from a single deviation model without a separate status field", () => {
  const actualNutritionLog = normalizeActualNutritionLog({
    dateKey: "2026-04-09",
    feedback: {
      deviationKind: "followed",
      issue: "",
      note: "Followed the plan cleanly.",
      hydrationOz: 84,
      hydrationTargetOz: 96,
    },
  });

  assert.equal(actualNutritionLog.deviationKind, "followed");
  assert.equal(actualNutritionLog.quickStatus, "on_track");
  assert.equal(actualNutritionLog.adherence, "high");
  assert.equal(actualNutritionLog.followedPlan, true);
});

test("day review keeps original and latest prescription separate from actual execution", () => {
  const dateKey = "2026-04-08";
  const originalRecord = buildPlannedRecord({ dateKey, label: "Upper Strength" });
  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: originalRecord,
    capturedAt: 1712750400000,
    reason: "daily_decision_capture",
  });

  const adjustedRecord = buildPlannedRecord({
    dateKey,
    label: "Upper Strength Reduced Load",
    nutritionCalories: 2400,
  });
  const { nextEntry } = upsertPrescribedDayHistoryEntry({
    dateKey,
    existingEntry: historyEntry,
    plannedDayRecord: adjustedRecord,
    capturedAt: 1712754000000,
    reason: "same_day_adjustment",
  });

  const actualNutrition = normalizeActualNutritionLog({
    dateKey,
    feedback: {
      status: "on_track",
      hydrationOz: 96,
      hydrationTargetOz: 100,
      note: "Stayed close to the reduced-load target.",
    },
  });

  const review = buildDayReview({
    dateKey,
    logs: {
      [dateKey]: {
        actualSession: {
          status: "completed_modified",
          sessionType: "strength",
          sessionLabel: "Upper Strength plus accessories",
        },
      },
    },
    dailyCheckins: {
      [dateKey]: { status: "completed_modified", note: "Reduced volume after warmup." },
    },
    nutritionActualLogs: { [dateKey]: actualNutrition },
    resolvePrescribedHistory: () => nextEntry,
    getCurrentPrescribedDayRevision,
    getCurrentPrescribedDayRecord,
  });

  assert.equal(review.originalPrescription.label, "Upper Strength");
  assert.equal(review.latestPrescription.label, "Upper Strength Reduced Load");
  assert.equal(review.actualWorkout.actualSession.sessionLabel, "Upper Strength plus accessories");
  assert.equal(review.currentRecord.resolved.training.label, "Upper Strength Reduced Load");
  assert.equal(review.comparison.completionKind, "modified");
  assert.equal(review.revisionTimeline.length, 2);
});
