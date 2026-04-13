const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  generateTodayPlan,
  normalizeGoals,
} = require("../src/modules-planning.js");
const {
  buildGoalCapabilityPacket,
  DOMAIN_ADAPTER_IDS,
} = require("../src/services/goal-capability-resolution-service.js");
const { createEmptyTrainingContext } = require("../src/services/training-context-service.js");

const BASE_WEEK = {
  phase: "BUILDING",
  label: "Sharpen",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "30 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "60 min" },
  str: "A",
  nutri: "hardRun",
};

const WEEK_TEMPLATES = [BASE_WEEK];

const buildGoals = (goalDefs = []) => normalizeGoals(goalDefs.map((goal, index) => ({
  id: goal.id || `goal_${index + 1}`,
  name: goal.name,
  category: goal.category || "general_fitness",
  active: goal.active !== false,
  priority: goal.priority || index + 1,
  targetDate: goal.targetDate || "",
  measurableTarget: goal.measurableTarget || "",
  resolvedGoal: goal.resolvedGoal || null,
})));

const buildComposer = ({
  goals,
  personalization = {},
  logs = {},
  dailyCheckins = {},
  nutritionActualLogs = {},
  weeklyNutritionReview = null,
  coachActions = [],
  plannedDayRecords = {},
  currentWeek = 1,
  todayKey = "2026-04-15",
  currentDayOfWeek = 3,
} = {}) => composeGoalNativePlan({
  goals,
  personalization,
  momentum: { inconsistencyRisk: "low", momentumState: "stable" },
  learningLayer: {},
  baseWeek: BASE_WEEK,
  currentWeek,
  weekTemplates: WEEK_TEMPLATES,
  logs,
  dailyCheckins,
  nutritionActualLogs,
  weeklyNutritionReview,
  coachActions,
  todayKey,
  currentDayOfWeek,
  plannedDayRecords,
  planWeekRecords: {},
});

const buildPlannedDayRecord = (dateKey, training) => ({
  id: `plan_day_${dateKey}`,
  dateKey,
  base: { training },
  resolved: { training },
});

test("training preference materially changes week shape and today explanation", () => {
  const goals = buildGoals([
    { name: "Run a 1:45 half marathon", category: "running", targetDate: "2026-10-10" },
  ]);

  const conservativeComposer = buildComposer({
    goals,
    personalization: {
      settings: {
        trainingPreferences: {
          intensityPreference: "Conservative",
        },
      },
    },
  });
  const aggressiveComposer = buildComposer({
    goals,
    personalization: {
      settings: {
        trainingPreferences: {
          intensityPreference: "Aggressive",
        },
      },
    },
  });

  assert.equal(conservativeComposer.trainingPreferencePolicy?.id, "conservative");
  assert.equal(aggressiveComposer.trainingPreferencePolicy?.id, "aggressive");
  assert.equal(conservativeComposer.dayTemplates?.[5]?.type, "rest");
  assert.notEqual(aggressiveComposer.dayTemplates?.[0]?.type, "rest");
  assert.match(conservativeComposer.changeSummary?.surfaceLine || "", /Conservative preference/i);
  assert.match(aggressiveComposer.changeSummary?.surfaceLine || "", /Aggressive preference/i);

  const aggressiveToday = generateTodayPlan(
    {
      primaryGoalKey: "running",
      experienceLevel: "intermediate",
      daysPerWeek: 4,
      constraints: [],
      trainingContext: createEmptyTrainingContext(),
    },
    {
      todayKey: "2026-04-15",
      logs: {},
    },
    {
      fatigueScore: 2,
      trend: "stable",
      momentum: "stable",
      injuryLevel: "none",
    },
    {
      plannedSession: aggressiveComposer.dayTemplates?.[4] || null,
      planningBasis: aggressiveComposer.planningBasis,
      programBlock: aggressiveComposer.programBlock,
      weeklyIntent: { focus: "Sharpen quality work" },
      changeSummary: aggressiveComposer.changeSummary,
    }
  );

  assert.match(aggressiveToday.reason || "", /Aggressive preference changed the week shape/i);
});

test("skipped key session is carried forward instead of silently ignored", () => {
  const goals = buildGoals([
    { name: "Run a 1:45 half marathon", category: "running", targetDate: "2026-10-10" },
  ]);
  const baselineComposer = buildComposer({
    goals,
    todayKey: "2026-04-17",
    currentDayOfWeek: 5,
  });

  const adaptedComposer = buildComposer({
    goals,
    todayKey: "2026-04-17",
    currentDayOfWeek: 5,
    logs: {
      "2026-04-16": {
        checkin: { status: "skipped" },
      },
    },
    plannedDayRecords: {
      "2026-04-16": buildPlannedDayRecord("2026-04-16", baselineComposer.dayTemplates?.[4]),
    },
  });

  assert.match(adaptedComposer.changeSummary?.headline || "", /carried forward/i);
  assert.equal(adaptedComposer.dayTemplates?.[0]?.label, baselineComposer.dayTemplates?.[4]?.label);
  assert.equal(adaptedComposer.dayTemplates?.[4]?.type, "rest");
});

test("repeated harder-than-expected logs cap the next exposure", () => {
  const goals = buildGoals([
    { name: "Bench 225", category: "strength" },
  ]);
  const baselineComposer = buildComposer({
    goals,
    todayKey: "2026-04-15",
    currentDayOfWeek: 3,
  });

  const adaptedComposer = buildComposer({
    goals,
    todayKey: "2026-04-15",
    currentDayOfWeek: 3,
    logs: {
      "2026-04-10": {
        checkin: { status: "completed_modified", sessionFeel: "harder_than_expected" },
      },
      "2026-04-12": {
        checkin: { status: "completed_modified", sessionFeel: "harder_than_expected" },
      },
    },
  });

  assert.match(adaptedComposer.changeSummary?.headline || "", /Volume was capped/i);
  assert.notEqual(adaptedComposer.dayTemplates?.[5]?.label, baselineComposer.dayTemplates?.[5]?.label);
  assert.match(adaptedComposer.dayTemplates?.[5]?.label || "", /controlled|recovery/i);
});

test("under-fueling trend protects the next quality session without rewriting the whole week", () => {
  const goals = buildGoals([
    { name: "Run a 1:45 half marathon", category: "running", targetDate: "2026-10-10" },
  ]);
  const baselineComposer = buildComposer({
    goals,
    todayKey: "2026-04-15",
    currentDayOfWeek: 3,
  });

  const adaptedComposer = buildComposer({
    goals,
    todayKey: "2026-04-15",
    currentDayOfWeek: 3,
    weeklyNutritionReview: {
      adaptation: {
        shouldAdapt: true,
        mode: "protect_key_session_fueling",
        summary: "Fueling is off track this week, so intensity stays capped until recovery stabilizes.",
        support: "Repeated under-fueling showed up before performance-relevant days.",
      },
    },
  });

  assert.match(adaptedComposer.changeSummary?.headline || "", /fueling stabilizes/i);
  assert.equal(baselineComposer.dayTemplates?.[4]?.type, "hard-run");
  assert.equal(adaptedComposer.dayTemplates?.[4]?.type, "easy-run");
  assert.match(adaptedComposer.changeSummary?.preserved || "", /structure stays intact/i);
});

test("swim goals route through the shared swimming adapter instead of generic fallback", () => {
  const goals = buildGoals([
    { name: "Swim a faster mile", category: "general_fitness" },
  ]);
  const composer = buildComposer({ goals });

  assert.equal(composer.domainAdapter?.id, DOMAIN_ADAPTER_IDS.swimming);
  assert.equal(composer.goalCapabilityStack?.primary?.primaryDomain, DOMAIN_ADAPTER_IDS.swimming);
  assert.ok(Object.values(composer.dayTemplates || {}).some((session) => /^swim-/.test(String(session?.type || ""))));
  assert.equal(composer.programBlock?.dominantEmphasis?.category, "swimming");
});

test("vertical jump goals route through the shared power adapter", () => {
  const goals = buildGoals([
    { name: "Improve vertical jump for basketball", category: "general_fitness" },
  ]);
  const composer = buildComposer({ goals });

  assert.equal(composer.domainAdapter?.id, DOMAIN_ADAPTER_IDS.power);
  assert.equal(composer.goalCapabilityStack?.primary?.primaryDomain, DOMAIN_ADAPTER_IDS.power);
  assert.ok(Object.values(composer.dayTemplates || {}).some((session) => /power|plyo|sprint-support/.test(String(session?.type || ""))));
  assert.equal(composer.programBlock?.dominantEmphasis?.category, "power");
});

test("unknown goals fall back to the nearest safe foundation packet without pretending niche mastery", () => {
  const packet = buildGoalCapabilityPacket({
    goal: {
      id: "goal_unknown",
      name: "Improve obstacle course fitness",
      category: "general_fitness",
    },
  });

  assert.equal(packet.primaryDomain, DOMAIN_ADAPTER_IDS.foundation);
  assert.equal(packet.fallbackPlanningMode, "foundation_then_specialize");
  assert.equal(packet.confidence, "low");
  assert.ok(packet.candidateDomainAdapters.includes(DOMAIN_ADAPTER_IDS.foundation));
});
