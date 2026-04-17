const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const { normalizeActualNutritionLog } = require("../src/modules-nutrition.js");
const { createPrescribedDayHistoryEntry } = require("../src/services/prescribed-day-history-service.js");
const {
  buildWeeklyNutritionReview,
} = require("../src/services/weekly-nutrition-review-service.js");

const buildNutritionPlanDay = ({
  dateKey,
  dayType = "easyRun",
  calories = 2500,
  supplementPlan = ["Creatine"],
} = {}) => ({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: 9, phase: "BUILDING" },
  base: {
    training: { label: `${dayType} session`, type: "run" },
    nutrition: {
      prescription: {
        dayType,
        targets: { cal: calories, p: 190, c: 240, f: 70, hydrationTargetOz: 100 },
      },
    },
    recovery: null,
    supplements: { plan: supplementPlan },
  },
  resolved: {
    training: { label: `${dayType} session`, type: "run" },
    nutrition: {
      prescription: {
        dayType,
        targets: { cal: calories, p: 190, c: 240, f: 70, hydrationTargetOz: 100 },
      },
    },
    recovery: { state: "ready" },
    supplements: { plan: supplementPlan },
  },
  decision: { mode: "as_planned", modifiedFromBase: false },
  provenance: { summary: "Canonical nutrition plan day.", keyDrivers: [], events: [] },
  flags: {},
});

const buildHistoryEntry = (config = {}) => createPrescribedDayHistoryEntry({
  plannedDayRecord: buildPlannedDayRecord(buildNutritionPlanDay(config)),
  capturedAt: 1712750400000,
  reason: "daily_decision_capture",
});

test("weekly nutrition review keeps planned vs actual separate and surfaces recurring weekly signals", () => {
  const plannedDayRecords = {
    "2026-04-05": buildHistoryEntry({ dateKey: "2026-04-05", dayType: "run_easy", supplementPlan: ["Creatine", "Electrolytes"] }),
    "2026-04-06": buildHistoryEntry({ dateKey: "2026-04-06", dayType: "run_quality", supplementPlan: ["Creatine", "Electrolytes"] }),
    "2026-04-07": buildHistoryEntry({ dateKey: "2026-04-07", dayType: "run_easy", supplementPlan: ["Creatine", "Electrolytes"] }),
    "2026-04-08": buildHistoryEntry({ dateKey: "2026-04-08", dayType: "run_long", supplementPlan: ["Creatine", "Electrolytes"] }),
  };
  const livePlanDay = buildNutritionPlanDay({
    dateKey: "2026-04-09",
    dayType: "run_easy",
    supplementPlan: ["Creatine", "Electrolytes"],
  });
  const nutritionActualLogs = {
    "2026-04-05": normalizeActualNutritionLog({
      dateKey: "2026-04-05",
      feedback: {
        status: "on_track",
        hydrationOz: 100,
        hydrationTargetOz: 100,
        supplementTaken: ["Creatine", "Electrolytes"],
      },
    }),
    "2026-04-06": normalizeActualNutritionLog({
      dateKey: "2026-04-06",
      feedback: {
        issue: "hunger",
        hydrationOz: 50,
        hydrationTargetOz: 100,
        supplementTaken: ["Creatine"],
        actualNutrition: {
          quickStatus: "off_track",
          note: "Missed my post-run meal and got hungry later.",
        },
      },
    }),
    "2026-04-07": normalizeActualNutritionLog({
      dateKey: "2026-04-07",
      feedback: {
        status: "decent",
        hydrationOz: 90,
        hydrationTargetOz: 100,
        supplementTaken: ["Creatine", "Electrolytes"],
        actualNutrition: {
          note: "Mostly followed the plan, but timing drifted.",
        },
      },
    }),
    "2026-04-08": normalizeActualNutritionLog({
      dateKey: "2026-04-08",
      feedback: {
        issue: "hunger",
        hydrationOz: 70,
        hydrationTargetOz: 100,
        supplementTaken: [],
        actualNutrition: {
          quickStatus: "off_track",
          note: "Busy work day and skipped lunch.",
        },
      },
    }),
  };

  const review = buildWeeklyNutritionReview({
    anchorDateKey: "2026-04-09",
    windowDays: 5,
    planDay: livePlanDay,
    plannedDayRecords,
    nutritionActualLogs,
  });

  assert.equal(review.model, "weekly_nutrition_review");
  assert.equal(review.prescribed.daysWithPrescription, 5);
  assert.equal(review.prescribed.hardTrainingDays, 2);
  assert.equal(review.actual.loggedDays, 4);
  assert.equal(review.adherence.onPlanDays, 2);
  assert.equal(review.deviationPattern.dominant, "under_fueled");
  assert.equal(review.friction.dominantCause, "hunger");
  assert.equal(review.friction.topCauses[0].key, "hunger");
  assert.equal(review.supplements.expectedDays, 5);
  assert.equal(review.adaptation.mode, "protect_key_session_fueling");
  assert.match(review.coaching.plannedVsActualLine, /stored or generated nutrition guidance/i);
  assert.match(review.coaching.plannedVsActualLine, /logged actual nutrition/i);
});

test("weekly nutrition review includes today's live prescription even before it is durably captured", () => {
  const review = buildWeeklyNutritionReview({
    anchorDateKey: "2026-04-09",
    windowDays: 1,
    planDay: buildNutritionPlanDay({
      dateKey: "2026-04-09",
      dayType: "strength",
      supplementPlan: ["Creatine"],
    }),
    plannedDayRecords: {},
    nutritionActualLogs: {},
  });

  assert.equal(review.prescribed.daysWithPrescription, 1);
  assert.equal(review.supplements.expectedDays, 1);
  assert.equal(review.actual.loggedDays, 0);
  assert.equal(review.adaptation.mode, "hold");
  assert.equal(review.adaptation.shouldAdapt, false);
});

test("weekly nutrition review chooses hydration reinforcement when hydration consistency is the main drift", () => {
  const plannedDayRecords = {
    "2026-04-06": buildHistoryEntry({ dateKey: "2026-04-06", dayType: "easyRun" }),
    "2026-04-07": buildHistoryEntry({ dateKey: "2026-04-07", dayType: "easyRun" }),
    "2026-04-08": buildHistoryEntry({ dateKey: "2026-04-08", dayType: "easyRun" }),
    "2026-04-09": buildHistoryEntry({ dateKey: "2026-04-09", dayType: "easyRun" }),
  };
  const nutritionActualLogs = {
    "2026-04-06": normalizeActualNutritionLog({
      dateKey: "2026-04-06",
      feedback: { status: "on_track", hydrationOz: 45, hydrationTargetOz: 100, supplementTaken: ["Creatine"] },
    }),
    "2026-04-07": normalizeActualNutritionLog({
      dateKey: "2026-04-07",
      feedback: { status: "on_track", hydrationOz: 60, hydrationTargetOz: 100, supplementTaken: ["Creatine"] },
    }),
    "2026-04-08": normalizeActualNutritionLog({
      dateKey: "2026-04-08",
      feedback: { status: "decent", hydrationOz: 55, hydrationTargetOz: 100, supplementTaken: ["Creatine"] },
    }),
    "2026-04-09": normalizeActualNutritionLog({
      dateKey: "2026-04-09",
      feedback: { status: "on_track", hydrationOz: 92, hydrationTargetOz: 100, supplementTaken: ["Creatine"] },
    }),
  };

  const review = buildWeeklyNutritionReview({
    anchorDateKey: "2026-04-09",
    windowDays: 4,
    plannedDayRecords,
    nutritionActualLogs,
  });

  assert.equal(review.hydration.belowTargetDays, 3);
  assert.equal(review.adaptation.mode, "reinforce_hydration");
  assert.equal(review.adaptation.shouldAdapt, true);
  assert.match(review.adaptation.summary, /hydration/i);
});
