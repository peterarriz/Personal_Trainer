const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCanonicalRuntimeStateFromStorage,
  buildPersistedTrainerPayload,
} = require("../src/services/persistence-adapter-service.js");
const {
  buildPersistedPlanWeekReview,
  createPersistedPlanWeekRecord,
  listCommittedPlanWeekRecords,
  PLAN_WEEK_RECORD_COMMITMENT,
  upsertPersistedPlanWeekRecord,
} = require("../src/services/plan-week-persistence-service.js");

const buildPlanWeekFixture = ({
  weekNumber = 4,
  phase = "BUILDING",
  label = `BUILDING - Week ${weekNumber}`,
  startDate = "2026-04-06",
  endDate = "2026-04-12",
  focus = "Half-marathon quality and durability",
  summary = "Run quality leads the week while strength stays supportive.",
} = {}) => ({
  id: `plan_week_${weekNumber}`,
  weekNumber,
  absoluteWeek: weekNumber,
  phase,
  label,
  kind: "plan",
  specificity: "high",
  startDate,
  endDate,
  status: "planned",
  adjusted: false,
  architecture: "race_prep_dominant",
  programBlock: {
    id: `program_block_${weekNumber}`,
    label: `${phase} - Run-dominant + strength-maintenance`,
    architecture: "race_prep_dominant",
    phase,
    window: {
      startWeek: weekNumber,
      endWeek: weekNumber,
      weekIndexInBlock: 1,
      totalWeeks: 1,
      weeksRemaining: 0,
    },
    dominantEmphasis: {
      category: "running",
      label: "Half marathon",
      objective: "Run quality and durability lead the block.",
      role: "dominant",
    },
    secondaryEmphasis: {
      category: "strength",
      label: "Strength maintenance",
      objective: "Keep 1-2 lifts alive without stealing recovery.",
      role: "secondary",
    },
    recoveryPosture: {
      level: "balanced",
      summary: "Protect key run quality without stacking extra fatigue.",
    },
    nutritionPosture: {
      mode: "performance_support",
      summary: "Fuel the key run sessions and recover enough to repeat them.",
    },
    successCriteria: ["Hit the key run sessions and keep strength supportive."],
    constraints: ["Keep lower-body fatigue controlled."],
    tradeoffs: ["Strength volume stays capped while running leads."],
    goalAllocation: {
      prioritized: "Half marathon",
      maintained: ["Strength maintenance"],
      minimized: "non-primary volume",
    },
    drivers: ["Half marathon", phase],
    summary,
  },
  blockIntent: {
    prioritized: "Half marathon",
    maintained: ["Strength maintenance"],
    minimized: "non-primary volume",
    narrative: summary,
  },
  split: null,
  weeklyIntent: {
    id: `weekly_intent_${weekNumber}`,
    weekNumber,
    programBlockId: `program_block_${weekNumber}`,
    blockLabel: `${phase} - Run-dominant + strength-maintenance`,
    focus,
    aggressionLevel: "steady",
    recoveryBias: "moderate",
    volumeBias: "baseline",
    performanceBias: "high",
    nutritionEmphasis: "Fuel key sessions and recover cleanly.",
    weeklyConstraints: ["Keep lower-body fatigue controlled."],
    status: "planned",
    adjusted: false,
    volumePct: 100,
    successDefinition: "Hit the key run sessions and keep strength supportive.",
    drivers: [focus],
    blockTradeoffs: ["Strength volume stays capped while running leads."],
    rationale: summary,
  },
  focus,
  aggressionLevel: "steady",
  recoveryBias: "moderate",
  volumeBias: "baseline",
  performanceBias: "high",
  nutritionEmphasis: "Fuel key sessions and recover cleanly.",
  successDefinition: "Hit the key run sessions and keep strength supportive.",
  drivers: [focus],
  rationale: summary,
  sessionsByDay: {
    1: { type: "easy-run", label: "Easy Run", run: { t: "Easy", d: "35 min" } },
    4: { type: "hard-run", label: "Tempo Run", run: { t: "Tempo", d: "30 min" } },
    6: { type: "long-run", label: "Long Run", run: { t: "Long", d: "70 min" } },
  },
  template: {
    phase,
    label: `${phase} template`,
  },
  summary,
  constraints: ["Keep lower-body fatigue controlled."],
  source: {
    sessionModel: "canonical_week_pattern",
    specificity: "high",
    planningModel: "program_block",
    hasCanonicalSessions: true,
    usesTemplateFallback: false,
  },
});

test("PlanWeek records persist through the storage boundary", () => {
  const planWeek = buildPlanWeekFixture();
  const record = createPersistedPlanWeekRecord({
    planWeek,
    capturedAt: 1712664000000,
    weeklyCheckin: { energy: 4, stress: 2, confidence: 4, ts: 1712664000000 },
  });

  const payload = buildPersistedTrainerPayload({
    runtimeState: {
      logs: {},
      dailyCheckins: {},
      nutritionActualLogs: {},
      planWeekRecords: { "4": record },
    },
  });

  const restored = buildCanonicalRuntimeStateFromStorage({
    storedPayload: payload,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  assert.deepEqual(restored.planWeekRecords["4"], record);
  assert.equal(restored.planWeekRecords["4"].record.label, "BUILDING - Week 4");
  assert.equal(restored.planWeekRecords["4"].weeklyCheckin.energy, 4);
});

test("Committed week history excludes projected entries and preserves durable metadata on upsert", () => {
  const committed = createPersistedPlanWeekRecord({
    planWeek: buildPlanWeekFixture({ weekNumber: 4, startDate: "2026-04-06", endDate: "2026-04-12" }),
    capturedAt: 1712664000000,
  });
  const projected = createPersistedPlanWeekRecord({
    planWeek: buildPlanWeekFixture({ weekNumber: 5, label: "PEAK - Week 5", phase: "PEAK", startDate: "2026-04-13", endDate: "2026-04-19" }),
    capturedAt: 1713268800000,
    commitment: PLAN_WEEK_RECORD_COMMITMENT.projected,
  });

  const committedOnly = listCommittedPlanWeekRecords({
    "4": committed,
    "5": projected,
  });

  assert.equal(committedOnly.length, 1);
  assert.equal(committedOnly[0].absoluteWeek, 4);

  const updated = upsertPersistedPlanWeekRecord({
    planWeekRecords: { "4": committed },
    planWeek: buildPlanWeekFixture({
      weekNumber: 4,
      summary: "Run quality still leads, but weekly check-in now biases recovery slightly more.",
    }),
    capturedAt: 1712750400000,
    weeklyCheckin: { energy: 3, stress: 3, confidence: 4, ts: 1712750400000 },
  });

  assert.equal(updated.changed, true);
  assert.equal(updated.record.firstCommittedAt, committed.firstCommittedAt);
  assert.equal(updated.record.lastCommittedAt, 1712750400000);
  assert.equal(updated.record.weeklyCheckin.energy, 3);
});

test("Older payloads without PlanWeek records still load safely", () => {
  const restored = buildCanonicalRuntimeStateFromStorage({
    storedPayload: {
      logs: {},
      dailyCheckins: {},
      plannedDayRecords: {},
      weeklyCheckins: {},
      nutritionActualLogs: {},
    },
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  assert.deepEqual(restored.planWeekRecords, {});
});

test("week review story emphasizes planned work, actual work, and next effect without losing audit metadata", () => {
  const record = createPersistedPlanWeekRecord({
    planWeek: buildPlanWeekFixture({ weekNumber: 4 }),
    capturedAt: 1712664000000,
    weeklyCheckin: { energy: 2, stress: 4, confidence: 3, ts: 1712664000000 },
  });

  const review = buildPersistedPlanWeekReview({
    planWeekRecord: record,
    logs: {
      "2026-04-06": { type: "Easy Run" },
    },
    weeklyCheckins: {},
    currentWeek: 4,
  });

  assert.equal(review.story.classificationLabel, "In progress");
  assert.match(review.story.plannedSummary, /Planned 3 training sessions/i);
  assert.match(review.story.actualSummary, /Logged 1 of 3 planned sessions/i);
  assert.match(review.story.whatMattered, /Low energy or higher stress/i);
  assert.match(review.story.nextEffect, /remaining days|make-up volume/i);
  assert.equal(review.commitment, "committed");
  assert.equal(review.durability, "durable");
});
