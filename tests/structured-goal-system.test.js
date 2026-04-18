const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listGoalDiscoveryFamilies,
} = require("../src/data/goal-families/index.js");
const {
  listStructuredGoalIntents,
} = require("../src/data/goal-intents/index.js");
const {
  listPlanArchetypes,
} = require("../src/data/plan-archetypes/index.js");
const {
  buildGoalTemplateSelection,
} = require("../src/services/goal-template-catalog-service.js");
const {
  resolveStructuredGoalPath,
} = require("../src/services/goal-resolution/structured-goal-resolution-service.js");
const {
  composeGoalNativePlan,
  normalizeGoals,
} = require("../src/modules-planning.js");

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

const field = (value, raw = value) => ({ value, raw: raw == null ? value : raw });

const buildIntakeContext = ({
  days = 4,
  sessionLength = "45 min",
  trainingLocation = "Gym",
  equipment = [],
  fields = {},
} = {}) => ({
  scheduleReality: {
    trainingDaysPerWeek: days,
    sessionLength,
    trainingLocation,
  },
  equipmentAccessContext: {
    equipment,
    trainingLocation,
  },
  goalCompletenessContext: {
    fields,
  },
});

const resolveGoal = ({
  templateId,
  rawIntentText,
  intakeContext,
}) => {
  const resolution = resolveStructuredGoalPath({
    rawIntentText,
    templateSelection: buildGoalTemplateSelection({ templateId }),
    intakeContext,
    now: new Date("2026-04-16T12:00:00Z"),
  });
  assert.ok(resolution?.resolvedGoal, `Expected a structured resolution for ${templateId || rawIntentText}`);
  return resolution.resolvedGoal;
};

const buildPlannerGoal = (resolvedGoal) => normalizeGoals([{
  id: `goal_${resolvedGoal.planArchetypeId || resolvedGoal.structuredIntentId || "structured"}`,
  name: resolvedGoal.summary,
  category: resolvedGoal.planningCategory,
  active: true,
  priority: 1,
  targetDate: resolvedGoal.targetDate || "",
  resolvedGoal,
}]);

const composeForResolvedGoal = (resolvedGoal) => composeGoalNativePlan({
  goals: buildPlannerGoal(resolvedGoal),
  personalization: {},
  momentum: { inconsistencyRisk: "low", momentumState: "stable" },
  learningLayer: {},
  baseWeek: BASE_WEEK,
  currentWeek: 1,
  weekTemplates: [BASE_WEEK],
  logs: {},
  bodyweights: [],
  dailyCheckins: {},
  nutritionActualLogs: {},
  weeklyNutritionReview: null,
  coachActions: [],
  todayKey: "2026-04-16",
  currentDayOfWeek: 4,
  plannedDayRecords: {},
  planWeekRecords: {},
});

test("goal taxonomy and archetype schema stay internally consistent", () => {
  const families = new Set(listGoalDiscoveryFamilies().map((family) => family.id).filter((id) => id !== "all"));
  const intents = listStructuredGoalIntents({ familyId: "all" });
  const intentIds = new Set(intents.map((intent) => intent.id));
  const archetypes = listPlanArchetypes();
  const seenIds = new Set();
  const seenDisplayNames = new Set();

  assert.ok(intents.length >= 25);
  assert.ok(archetypes.length >= 30);

  archetypes.forEach((archetype) => {
    assert.ok(!seenIds.has(archetype.id), `Duplicate archetype id: ${archetype.id}`);
    seenIds.add(archetype.id);
    assert.ok(!seenDisplayNames.has(archetype.displayName), `Duplicate public archetype label: ${archetype.displayName}`);
    seenDisplayNames.add(archetype.displayName);
    assert.ok(families.has(archetype.family), `Unknown archetype family: ${archetype.family}`);
    assert.ok(archetype.active, `Inactive archetype in flagship catalog: ${archetype.id}`);
    assert.ok(archetype.weeklyStructureTemplate?.patternId, `Missing weekly pattern: ${archetype.id}`);
    assert.ok(archetype.progressionStrategy?.id, `Missing progression strategy: ${archetype.id}`);
    assert.ok(archetype.fatigueManagementStrategy?.id, `Missing fatigue strategy: ${archetype.id}`);
    assert.ok(archetype.primaryDomain, `Missing primary domain: ${archetype.id}`);
    archetype.supportedGoalIntents.forEach((intentId) => {
      assert.ok(intentIds.has(intentId), `Broken intent reference ${intentId} in ${archetype.id}`);
    });
  });
});

test("structured intake covers mainstream goals across every flagship family without falling back to custom", () => {
  const scenarios = [
    {
      label: "half marathon improvement",
      templateId: "half_marathon",
      rawIntentText: "Improve my half marathon time",
      intakeContext: buildIntakeContext({
        days: 5,
        sessionLength: "60 min",
        trainingLocation: "Outdoor",
        fields: {
          event_distance: field("half_marathon", "Half marathon"),
          current_run_frequency: field(4, "4"),
          recent_pace_baseline: field("1:58 half marathon", "1:58 half marathon"),
          target_timeline: field("2026-09-20", "2026-09-20"),
          training_age: field("intermediate", "Intermediate"),
        },
      }),
      expectedArchetype: "run_half_improvement_intermediate",
    },
    {
      label: "dumbbell strength",
      templateId: "train_with_limited_equipment",
      rawIntentText: "Get stronger with dumbbells only",
      intakeContext: buildIntakeContext({
        days: 3,
        sessionLength: "45 min",
        trainingLocation: "Home",
        equipment: ["dumbbells"],
        fields: {
          equipment_profile: field("dumbbells_only", "Dumbbells only"),
          training_age: field("returning", "Returning"),
          progression_posture: field("standard", "Standard"),
        },
      }),
      expectedArchetype: "limited_equipment_strength",
    },
    {
      label: "swim fitness",
      templateId: "swim_faster_mile",
      rawIntentText: "Swim for fitness and better endurance",
      intakeContext: buildIntakeContext({
        days: 3,
        sessionLength: "45 min",
        trainingLocation: "Pool",
        fields: {
          recent_swim_anchor: field("1000 yd in 22:30", "1000 yd in 22:30"),
          swim_access_reality: field("pool", "Pool"),
        },
      }),
      expectedArchetypePrefix: "swim_",
    },
    {
      label: "cycling fitness",
      templateId: "ride_stronger",
      rawIntentText: "Build cycling fitness",
      intakeContext: buildIntakeContext({
        days: 4,
        sessionLength: "60 min",
        trainingLocation: "Road",
        fields: {
          primary_modality: field("cycling", "Cycling"),
          current_endurance_anchor: field("20 mile ride", "20 mile ride"),
        },
      }),
      expectedArchetype: "cycling_endurance_base",
    },
    {
      label: "run and lift",
      templateId: "run_and_lift",
      rawIntentText: "Run and lift at the same time",
      intakeContext: buildIntakeContext({
        days: 5,
        sessionLength: "45 min",
        trainingLocation: "Gym",
        equipment: ["barbell", "dumbbells"],
        fields: {
          hybrid_priority: field("running", "Running"),
          equipment_profile: field("full_gym", "Full gym"),
        },
      }),
      expectedArchetype: "run_lift_running_priority",
    },
    {
      label: "protected restart",
      templateId: "restart_safely",
      rawIntentText: "Restart safely after time off",
      intakeContext: buildIntakeContext({
        days: 3,
        sessionLength: "30 min",
        trainingLocation: "Home",
        fields: {
          starting_capacity_anchor: field("10_easy_minutes", "10 easy min"),
          progression_posture: field("protective", "Protective"),
        },
      }),
      expectedArchetype: "protected_restart_low_capacity",
    },
  ];

  scenarios.forEach((scenario) => {
    const resolvedGoal = resolveGoal(scenario);
    assert.ok(resolvedGoal.planArchetypeId, `Missing archetype for ${scenario.label}`);
    if (scenario.expectedArchetype) assert.equal(resolvedGoal.planArchetypeId, scenario.expectedArchetype);
    if (scenario.expectedArchetypePrefix) assert.match(resolvedGoal.planArchetypeId, new RegExp(`^${scenario.expectedArchetypePrefix}`));
  });
});

test("resolver degrades conservatively when anchors are missing", () => {
  const resolvedGoal = resolveGoal({
    templateId: "return_to_running",
    rawIntentText: "Return to running safely",
    intakeContext: buildIntakeContext({
      days: 2,
      sessionLength: "30 min",
      trainingLocation: "Outdoor",
      fields: {
        progression_posture: field("protective", "Protective"),
      },
    }),
  });

  assert.equal(resolvedGoal.planArchetypeId, "run_return_conservative");
  assert.notEqual(resolvedGoal.confidence, "high");
  assert.ok((resolvedGoal.missingAnchors || []).length >= 1);
});

test("planner produces materially different first weeks across distinct archetypes", () => {
  const marathonGoal = resolveGoal({
    templateId: "marathon",
    rawIntentText: "Train for a marathon",
    intakeContext: buildIntakeContext({
      days: 5,
      sessionLength: "60 min",
      trainingLocation: "Outdoor",
      fields: {
        event_distance: field("marathon", "Marathon"),
        current_run_frequency: field(4, "4"),
        target_timeline: field("2026-10-01", "2026-10-01"),
      },
    }),
  });
  const dumbbellGoal = resolveGoal({
    templateId: "train_with_limited_equipment",
    rawIntentText: "Train with dumbbells only",
    intakeContext: buildIntakeContext({
      days: 4,
      sessionLength: "45 min",
      trainingLocation: "Home",
      equipment: ["dumbbells"],
      fields: {
        equipment_profile: field("dumbbells_only", "Dumbbells only"),
        training_age: field("intermediate", "Intermediate"),
      },
    }),
  });

  const marathonPlan = composeForResolvedGoal(marathonGoal);
  const dumbbellPlan = composeForResolvedGoal(dumbbellGoal);

  const marathonTypes = Object.values(marathonPlan.dayTemplates || {}).map((session) => session?.type).filter(Boolean);
  const dumbbellTypes = Object.values(dumbbellPlan.dayTemplates || {}).map((session) => session?.type).filter(Boolean);

  assert.ok(marathonTypes.includes("long-run"));
  assert.ok(marathonTypes.includes("hard-run"));
  assert.ok(dumbbellTypes.filter((type) => type === "strength+prehab").length >= 3);
  assert.ok(!dumbbellTypes.includes("long-run"));
  assert.notDeepEqual(marathonTypes, dumbbellTypes);
});

test("structured lift targets shape the resolved strength goal summary and primary metric", () => {
  const resolvedGoal = resolveGoal({
    templateId: "improve_big_lifts",
    rawIntentText: "Improve my big lifts",
    intakeContext: buildIntakeContext({
      days: 4,
      sessionLength: "45 min",
      trainingLocation: "Gym",
      equipment: ["barbell", "bench"],
      fields: {
        lift_focus: field("bench", "Bench"),
        lift_target_weight: field(245, "245"),
        lift_target_reps: field(3, "3"),
        target_timeline: field("12 weeks", "12 weeks"),
        current_strength_baseline: field("205 x 5", "205 x 5"),
      },
    }),
  });

  assert.equal(resolvedGoal.primaryMetric?.key, "bench_press_weight");
  assert.equal(resolvedGoal.primaryMetric?.targetValue, "245");
  assert.equal(resolvedGoal.primaryMetric?.targetReps, 3);
  assert.match(resolvedGoal.summary || "", /bench press 245 lb for 3 reps/i);
});

test("cycling and triathlon goals drive dedicated planner overlays instead of generic conditioning fallback", () => {
  const cyclingGoal = resolveGoal({
    templateId: "ride_stronger",
    rawIntentText: "Ride stronger",
    intakeContext: buildIntakeContext({
      days: 4,
      sessionLength: "60 min",
      trainingLocation: "Road",
      fields: {
        primary_modality: field("cycling", "Cycling"),
        current_endurance_anchor: field("90 minute ride", "90 minute ride"),
      },
    }),
  });
  const triathlonGoal = resolveGoal({
    templateId: "triathlon_multisport",
    rawIntentText: "Train for a sprint triathlon",
    intakeContext: buildIntakeContext({
      days: 5,
      sessionLength: "45 min",
      trainingLocation: "Mixed",
      fields: {
        event_distance: field("sprint_triathlon", "Sprint"),
        hybrid_priority: field("balanced", "Balanced"),
        recent_swim_anchor: field("400 yd in 10:00", "400 yd in 10:00"),
      },
    }),
  });

  const cyclingPlan = composeForResolvedGoal(cyclingGoal);
  const triathlonPlan = composeForResolvedGoal(triathlonGoal);
  const cyclingLabels = Object.values(cyclingPlan.dayTemplates || {}).map((session) => String(session?.label || ""));
  const triathlonTypes = Object.values(triathlonPlan.dayTemplates || {}).map((session) => String(session?.type || ""));

  assert.equal(cyclingPlan.domainAdapter?.id, "cycling_endurance");
  assert.ok(cyclingLabels.some((label) => /ride/i.test(label)));
  assert.equal(triathlonPlan.domainAdapter?.id, "triathlon_multisport");
  assert.ok(triathlonTypes.some((type) => /^swim-/.test(type)));
  assert.ok(triathlonTypes.includes("easy-run"));
  assert.ok(Object.values(triathlonPlan.dayTemplates || {}).some((session) => /bike|brick/i.test(String(session?.label || ""))));
});
