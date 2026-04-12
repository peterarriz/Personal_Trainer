const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalPlanDay } = require("../src/modules-planning.js");
const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const { normalizeActualNutritionLog } = require("../src/modules-nutrition.js");
const { buildDayReview } = require("../src/services/day-review-service.js");
const {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  getCurrentPrescribedDayRevision,
} = require("../src/services/prescribed-day-history-service.js");
const { buildRecoveryPrescription } = require("../src/services/recovery-supplement-service.js");

const buildProgramBlock = () => ({
  id: "program_block_1",
  label: "Hybrid Build Block",
  phase: "BUILDING",
  dominantEmphasis: { label: "Run durability" },
  recoveryPosture: { summary: "Protect recovery between quality days." },
  constraints: [],
  successCriteria: ["Land the key sessions cleanly."],
});

const buildWeeklyIntent = () => ({
  id: "weekly_intent_9",
  status: "planned",
  adjusted: false,
  rationale: "Push the key work while keeping recovery usable.",
  weeklyConstraints: [],
  successDefinition: "Complete the key sessions and keep recovery stable.",
});

const buildCanonicalDay = () => {
  const actualNutrition = normalizeActualNutritionLog({
    dateKey: "2026-04-09",
    feedback: {
      status: "on_track",
      hydrationOz: 95,
      hydrationTargetOz: 100,
      supplementTaken: ["Creatine", "Electrolytes"],
      actualNutrition: { note: "Meals landed on time." },
    },
  });

  return buildCanonicalPlanDay({
    dateKey: "2026-04-09",
    dayOfWeek: 4,
    currentWeek: 9,
    baseWeek: { phase: "BUILDING", label: "Build week" },
    basePlannedDay: {
      type: "hard-run",
      label: "Tempo Run",
      nutri: "hardRun",
      recoveryRecommendation: "Easy cooldown and mobility after the run.",
      success: "Hit the work and finish the recovery work.",
    },
    resolvedDay: {
      type: "hard-run",
      label: "Tempo Run",
      nutri: "hardRun",
      recoveryRecommendation: "Finish with mobility and protect the rest of the day.",
      success: "Keep quality high and close the loop with recovery.",
      intensityGuidance: "controlled quality",
    },
    readiness: {
      state: "reduced_load",
      stateLabel: "Reduced load",
      source: "deterministic_engine",
      recoveryLine: "Cap intensity, land mobility, and keep the rest of the day easy.",
      userVisibleLine: "Recovery is a little tight, so the day stays protective.",
      factors: ["low_sleep"],
      metrics: { sleep: 2, stress: 4, soreness: 3 },
    },
    nutrition: {
      prescription: {
        dayType: "hardRun",
        targets: { cal: 2700, p: 190, c: 280, f: 68, hydrationTargetOz: 100 },
        supplements: ["Creatine", "Electrolytes", "Magnesium"],
      },
      actual: actualNutrition,
      comparison: { adherence: "high", deviationKind: "followed", summary: "Nutrition matched the plan." },
    },
    context: {
      architecture: "hybrid_performance",
      programBlock: buildProgramBlock(),
      weeklyIntent: buildWeeklyIntent(),
      planWeek: {
        id: "plan_week_9",
        status: "planned",
        adjusted: false,
        summary: "Build week summary",
        constraints: [],
      },
      supplementPlan: ["Creatine", "Electrolytes", "Magnesium"],
    },
    adjustments: {
      injuryState: { level: "moderate_pain", area: "Achilles" },
    },
    logging: {
      dateKey: "2026-04-09",
      dailyCheckin: {
        status: "completed_modified",
        sessionFeel: "harder_than_expected",
        note: "Needed to keep the day controlled.",
        readiness: { sleep: 2, stress: 4, soreness: 3 },
        actualRecovery: {
          sleepHours: 7.5,
          mobilityMinutes: 12,
          tissueWorkMinutes: 6,
          painProtocolCompleted: true,
          recoveryNote: "Mobility and tendon work done.",
        },
        ts: 1712750400000,
      },
      nutritionLog: actualNutrition,
      supplementLog: { Creatine: true, Electrolytes: true, Magnesium: false },
      sessionStatus: "completed_modified",
    },
  });
};

test("PlanDay promotes recovery and supplements into first-class canonical children", () => {
  const planDay = buildCanonicalDay();

  assert.equal(planDay.base.recovery.prescription.model, "recovery_prescription_v1");
  assert.equal(planDay.resolved.recovery.prescription.model, "recovery_prescription_v1");
  assert.equal(planDay.resolved.recovery.actual.model, "actual_recovery_log_v1");
  assert.equal(planDay.resolved.supplements.plan.model, "supplement_plan_v1");
  assert.equal(planDay.resolved.supplements.plan.items.length, 3);
  assert.equal(planDay.resolved.supplements.actual.adherence, "partial");
  assert.equal(planDay.resolved.recovery.prescription.hydrationSupport.targetOz, 100);
  assert.equal(planDay.resolved.recovery.actual.hydrationSupport.followed, true);
  assert.equal(planDay.resolved.recovery.actual.painProtocolCompleted, true);
  assert.match(planDay.resolved.recovery.prescription.painManagementProtocol.summary, /Achilles/i);
});

test("day review keeps recovery prescription separate from actual recovery logging", () => {
  const planDay = buildCanonicalDay();
  const plannedRecord = buildPlannedDayRecord(planDay);
  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: plannedRecord,
    capturedAt: 1712750400000,
    reason: "daily_decision_capture",
  });

  const review = buildDayReview({
    dateKey: "2026-04-09",
    logs: {
      "2026-04-09": {
        actualSession: {
          status: "completed_modified",
          sessionType: "hard-run",
          sessionLabel: "Tempo Run",
        },
      },
    },
    dailyCheckins: {
      "2026-04-09": {
        status: "completed_modified",
        sessionFeel: "harder_than_expected",
        note: "Needed to keep it controlled.",
        readiness: { sleep: 2, stress: 4, soreness: 3 },
        actualRecovery: {
          sleepHours: 7.5,
          mobilityMinutes: 12,
          tissueWorkMinutes: 6,
          painProtocolCompleted: true,
          recoveryNote: "Mobility and tendon work done.",
        },
        ts: 1712750400000,
      },
    },
    nutritionActualLogs: {
      "2026-04-09": normalizeActualNutritionLog({
        dateKey: "2026-04-09",
        feedback: {
          status: "on_track",
          hydrationOz: 95,
          hydrationTargetOz: 100,
          supplementTaken: ["Creatine", "Electrolytes"],
        },
      }),
    },
    resolvePrescribedHistory: () => historyEntry,
    getCurrentPrescribedDayRevision,
    getCurrentPrescribedDayRecord,
  });

  assert.equal(review.currentRecord.resolved.recovery.prescription.model, "recovery_prescription_v1");
  assert.equal(review.currentRecord.resolved.supplements.plan.model, "supplement_plan_v1");
  assert.equal(review.actualRecovery.model, "actual_recovery_log_v1");
  assert.equal(review.actualRecovery.mobilityMinutes, 12);
  assert.equal(review.actualRecovery.supplementAdherence.expectedCount, 3);
  assert.equal(review.actualRecovery.supplementAdherence.matchedCount, 2);
  assert.match(review.actualRecovery.note, /mobility/i);
});

test("recovery prescription calls out when hydration targets are not explicitly stored", () => {
  const recovery = buildRecoveryPrescription({
    dateKey: "2026-04-10",
    training: {
      type: "strength",
    },
    nutritionPrescription: {
      dayType: "strength",
      targets: { cal: 2500, p: 195, c: 220, f: 72 },
    },
  });

  assert.equal(recovery.hydrationSupport.targetOz, null);
  assert.match(recovery.hydrationSupport.summary, /no explicit hydration target is stored/i);
});
