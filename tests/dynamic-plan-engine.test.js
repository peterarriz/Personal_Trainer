const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  buildPlanWeek,
  generateTodayPlan,
  normalizeGoals,
} = require("../src/modules-planning.js");
const {
  buildGoalCapabilityPacket,
  DOMAIN_ADAPTER_IDS,
} = require("../src/services/goal-capability-resolution-service.js");
const { NUTRITION_DAY_TYPES } = require("../src/services/nutrition-day-taxonomy-service.js");
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

test("under-fueling trend also caps a future long run when it is the next quality exposure", () => {
  const goals = buildGoals([
    { name: "Run a 1:45 half marathon", category: "running", targetDate: "2026-10-10" },
  ]);
  const baselineComposer = buildComposer({
    goals,
    todayKey: "2026-04-16",
    currentDayOfWeek: 4,
  });

  const adaptedComposer = buildComposer({
    goals,
    todayKey: "2026-04-16",
    currentDayOfWeek: 4,
    weeklyNutritionReview: {
      adaptation: {
        shouldAdapt: true,
        mode: "protect_key_session_fueling",
        summary: "Fueling is off track this week, so intensity stays capped until recovery stabilizes.",
        support: "Repeated under-fueling showed up before performance-relevant days.",
      },
    },
  });

  assert.equal(baselineComposer.dayTemplates?.[6]?.type, "long-run");
  assert.equal(adaptedComposer.dayTemplates?.[6]?.type, "easy-run");
  assert.match(adaptedComposer.dayTemplates?.[6]?.label || "", /long run \(capped\)/i);
  assert.match(adaptedComposer.changeSummary?.headline || "", /fueling stabilizes/i);
});

test("swim goals route through the shared swimming adapter instead of generic fallback", () => {
  const goals = buildGoals([
    { name: "Swim a faster mile", category: "general_fitness" },
  ]);
  const composer = buildComposer({ goals });
  const sessions = Object.values(composer.dayTemplates || {}).filter(Boolean);
  const swimSessions = sessions.filter((session) => /^swim-/.test(String(session?.type || "")));
  const drylandSupport = sessions.filter((session) => session?.type === "strength+prehab");

  assert.equal(composer.domainAdapter?.id, DOMAIN_ADAPTER_IDS.swimming);
  assert.equal(composer.goalCapabilityStack?.primary?.primaryDomain, DOMAIN_ADAPTER_IDS.swimming);
  assert.ok(swimSessions.length >= 3);
  assert.ok(swimSessions.every((session) => String(session?.nutri || "").startsWith("swim_")));
  assert.ok(drylandSupport.length >= 2);
  assert.ok(drylandSupport.every((session) => session?.nutri === NUTRITION_DAY_TYPES.strengthSupport));
  assert.ok(drylandSupport.some((session) => /mobility|activation|support/i.test(String(session?.optionalSecondary || ""))));
  assert.equal(composer.programBlock?.dominantEmphasis?.category, "swimming");
});

test("run-focused goals keep explicit support work instead of run-only prescription spam", () => {
  const goals = buildGoals([
    { name: "Run a faster 5k", category: "running", targetDate: "2026-09-01" },
  ]);
  const composer = buildComposer({ goals });
  const sessions = Object.values(composer.dayTemplates || {}).filter(Boolean);
  const supportSessions = sessions.filter((session) => ["run+strength", "strength+prehab"].includes(String(session?.type || "")));

  assert.ok(supportSessions.length >= 2);
  assert.ok(supportSessions.some((session) => session?.nutri === NUTRITION_DAY_TYPES.hybridSupport));
  assert.ok(supportSessions.some((session) => session?.nutri === NUTRITION_DAY_TYPES.strengthSupport));
  assert.ok(supportSessions.every((session) => String(session?.optionalSecondary || "").trim().length > 0));
});

test("weekly rationale makes the concurrent run, bench, and cut tradeoff explicit", () => {
  const goals = buildGoals([
    { name: "Run a 1:45 half marathon", category: "running", targetDate: "2026-10-10" },
    { name: "Bench 225", category: "strength", priority: 2 },
    { name: "Lose 15 lb", category: "body_comp", priority: 3 },
  ]);

  const composer = buildComposer({
    goals,
    personalization: {
      travelState: { access: "full gym" },
      userGoalProfile: { days_per_week: 5, session_length: "45" },
      profile: { estimatedFitnessLevel: "intermediate" },
    },
  });
  const planWeek = buildPlanWeek({
    weekNumber: 1,
    template: BASE_WEEK,
    weekTemplates: WEEK_TEMPLATES,
    referenceTemplate: BASE_WEEK,
    goals,
    architecture: composer.architecture,
    programBlock: composer.programBlock,
    programContext: composer.programContext,
    blockIntent: composer.blockIntent,
    split: composer.split,
    sessionsByDay: composer.dayTemplates,
    weeklyCheckin: { energy: 3, stress: 2, confidence: 4 },
    coachPlanAdjustments: {},
    failureMode: {},
    constraints: composer.constraints,
  });

  assert.match(
    planWeek.weeklyIntent?.rationale || "",
    /Held back: Bench 225 stays in maintenance territory, not a maximal bench-progression push\./i
  );
  assert.match(
    planWeek.weeklyIntent?.rationale || "",
    /Lose 15 lb stays moderate and recovery-compatible, not an aggressive cut\./i
  );
  assert.match(
    planWeek.weeklyIntent?.rationale || "",
    /Why: the app cannot honestly promise maximal bench progress, maximal race improvement, and maximal fat loss in the same block\./i
  );
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
