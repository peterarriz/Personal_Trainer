const test = require("node:test");
const assert = require("node:assert/strict");

const {
  composeGoalNativePlan,
  generateTodayPlan,
  normalizeGoals,
} = require("../src/modules-planning.js");
const { deterministicCoachPacket } = require("../src/modules-coach-engine.js");
const {
  createProgramInstance,
  createStyleSelection,
  getProgramDefinitionById,
  getStyleDefinitionById,
  PROGRAM_FIDELITY_MODES,
} = require("../src/services/program-catalog-service.ts");
const {
  deriveLiveProgramPlanningBasis,
  deriveProgramAdherenceState,
  PLANNING_PRECEDENCE_STACK,
  PROGRAM_FIDELITY_STATUS,
  PROGRAM_RUNTIME_FIDELITY,
} = require("../src/services/program-live-planning-service.js");
const { createPersistedPlanWeekRecord } = require("../src/services/plan-week-persistence-service.js");
const { buildTrainingContextFromEditor } = require("../src/services/training-context-service.js");

const BASE_WEEK = {
  phase: "BASE",
  label: "Foundation",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "25 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "50 min" },
  str: "A",
  nutri: "easyRun",
};

const buildAthleteProfile = ({
  goals = [],
  daysPerWeek = 4,
  experienceLevel = "intermediate",
  trainingContext = null,
} = {}) => ({
  goals,
  userProfile: {
    daysPerWeek,
    experienceLevel,
    sessionLength: trainingContext?.sessionDuration?.value || "45",
    trainingContext,
  },
  trainingContext,
});

const buildPersonalization = ({
  trainingContext = null,
  daysPerWeek = 4,
  fitnessLevel = "intermediate",
  programs = null,
  injuryLevel = "none",
} = {}) => ({
  trainingContext,
  programs,
  userGoalProfile: {
    days_per_week: daysPerWeek,
    session_length: trainingContext?.sessionDuration?.value || "45",
  },
  profile: {
    estimatedFitnessLevel: fitnessLevel,
    fitnessLevel,
  },
  injuryPainState: {
    level: injuryLevel,
    area: "Achilles",
  },
});

const buildComposer = ({
  goals = [],
  personalization = {},
  athleteProfile = null,
  currentWeek = 1,
} = {}) => composeGoalNativePlan({
  goals,
  personalization,
  momentum: { inconsistencyRisk: "low", momentumState: "stable" },
  learningLayer: {},
  currentWeek,
  baseWeek: BASE_WEEK,
  weekTemplates: [BASE_WEEK],
  athleteProfile,
  logs: {},
  plannedDayRecords: {},
  planWeekRecords: {},
});

test("precedence stack stays deterministic and ordered", () => {
  assert.deepEqual(PLANNING_PRECEDENCE_STACK, [
    "hard safety, injury, and contraindications",
    "hard equipment constraints",
    "hard schedule reality",
    "active program hard rules",
    "explicit goal stack",
    "active program soft rules",
    "active style biases",
    "default house planning logic",
    "low-importance preferences",
  ]);
});

test("goal-optional half marathon program becomes the live week backbone", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Home",
    equipment: "mixed",
    equipmentItems: ["safe running access"],
    time: "45",
  });
  const athleteProfile = buildAthleteProfile({
    goals: [],
    daysPerWeek: 4,
    experienceLevel: "beginner",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_half_marathon_base");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    fitnessLevel: "beginner",
    programs: { activeProgramInstance },
  });

  const composer = buildComposer({
    goals: [],
    personalization,
    athleteProfile,
  });

  const sessions = Object.values(composer.dayTemplates || {}).filter(Boolean);
  const runSessions = sessions.filter((session) => /run/.test(String(session?.type || "")));

  assert.equal(composer.planningBasis.activeProgramId, "program_half_marathon_base");
  assert.equal(composer.planningBasis.basisMode, "program_backbone");
  assert.equal(runSessions.length, 4);
  assert.ok(runSessions.some((session) => session?.type === "long-run"));
  assert.equal(composer.planningBasis.expectedSessionsPerWeek, 4);
  assert.match(composer.planningBasis.planBasisExplanation?.basisSummary || "", /Half Marathon Base/i);
});

test("powerbuilding strict materially reshapes the real week around lifting", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    equipmentItems: ["barbell", "rack", "bench", "cable stack"],
    time: "60+",
  });
  const goals = normalizeGoals([
    { id: "g1", name: "Get stronger", category: "strength", active: true, priority: 1 },
  ]);
  const athleteProfile = buildAthleteProfile({
    goals,
    daysPerWeek: 4,
    experienceLevel: "intermediate",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_powerbuilding_builder");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.runAsWritten,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    fitnessLevel: "intermediate",
    programs: { activeProgramInstance },
  });

  const composer = buildComposer({
    goals,
    personalization,
    athleteProfile,
  });
  const labels = Object.values(composer.dayTemplates || {}).map((session) => session?.label).filter(Boolean);

  assert.equal(composer.runtimeFidelityMode, PROGRAM_RUNTIME_FIDELITY.strict);
  assert.ok(labels.some((label) => /lower-body strength/i.test(label)));
  assert.ok(labels.some((label) => /upper-body strength/i.test(label)));
  assert.ok(labels.some((label) => /lower-body hypertrophy/i.test(label)));
  assert.ok(labels.some((label) => /upper-body hypertrophy/i.test(label)));
});

test("style selection changes the live week even without a named program", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Home",
    equipment: "mixed",
    equipmentItems: ["dumbbells", "safe running access"],
    time: "45",
  });
  const goals = normalizeGoals([
    { id: "g1", name: "General fitness", category: "general_fitness", active: true, priority: 1 },
  ]);
  const athleteProfile = buildAthleteProfile({
    goals,
    daysPerWeek: 4,
    experienceLevel: "intermediate",
    trainingContext,
  });
  const styleDefinition = getStyleDefinitionById("style_fight_camp_lean");
  const activeStyleSelection = createStyleSelection({ styleDefinition });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    programs: { activeStyleSelection },
  });

  const composer = buildComposer({
    goals,
    personalization,
    athleteProfile,
  });
  const sessions = Object.values(composer.dayTemplates || {}).filter(Boolean);

  assert.equal(composer.planningBasis.activeStyleId, "style_fight_camp_lean");
  assert.ok(sessions.some((session) => session?.label === "Fight-Camp Conditioning"));
  assert.ok(sessions.some((session) => session?.strengthDuration === "25-35 min density strength"));
});

test("program style-only mode changes the live week without pretending to run the full template", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    equipmentItems: ["barbell", "rack", "bench", "cable stack"],
    time: "45",
  });
  const goals = normalizeGoals([
    { id: "g1", name: "General fitness", category: "general_fitness", active: true, priority: 1 },
  ]);
  const athleteProfile = buildAthleteProfile({
    goals,
    daysPerWeek: 4,
    experienceLevel: "intermediate",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_powerbuilding_builder");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.useAsStyle,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    fitnessLevel: "intermediate",
    programs: { activeProgramInstance },
  });

  const composer = buildComposer({
    goals,
    personalization,
    athleteProfile,
  });
  const strengthSessions = Object.values(composer.dayTemplates || {}).filter((session) => /strength/.test(String(session?.type || "")));

  assert.equal(composer.runtimeFidelityMode, PROGRAM_RUNTIME_FIDELITY.styleOnly);
  assert.equal(composer.planningBasis.basisMode, "program_used_as_style");
  assert.ok(strengthSessions.some((session) => /top set \+ backoff/i.test(String(session?.optionalSecondary || ""))));
  assert.match(composer.planningBasis.planBasisExplanation?.todayLine || "", /directional influence/i);
});

test("generateTodayPlan carries the active basis into today's explanation", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Home",
    equipment: "mixed",
    equipmentItems: ["safe running access"],
    time: "45",
  });
  const athleteProfile = buildAthleteProfile({
    goals: [],
    daysPerWeek: 4,
    experienceLevel: "beginner",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_half_marathon_base");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    fitnessLevel: "beginner",
    programs: { activeProgramInstance },
  });
  const composer = buildComposer({
    goals: [],
    personalization,
    athleteProfile,
  });

  const todayPlan = generateTodayPlan(
    {
      primaryGoalKey: "general_fitness",
      experienceLevel: "beginner",
      daysPerWeek: 4,
      constraints: [],
      trainingContext,
    },
    {
      todayKey: "2026-04-12",
      logs: {
        "2026-04-09": { type: "easy run", checkin: { status: "completed_as_planned" }, miles: 3 },
      },
    },
    {
      fatigueScore: 2,
      trend: "stable",
      momentum: "stable",
      injuryLevel: "none",
    },
    {
      planningBasis: composer.planningBasis,
      plannedSession: composer.dayTemplates?.[1] || null,
      weeklyIntent: { focus: "Build running durability" },
      programBlock: composer.programBlock,
    }
  );

  assert.match(todayPlan.reason, /Half Marathon Base/i);
});

test("coach packet explains active program basis and adherence without pretending exactness", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Home",
    equipment: "mixed",
    equipmentItems: ["safe running access"],
    time: "45",
  });
  const athleteProfile = buildAthleteProfile({
    goals: [],
    daysPerWeek: 4,
    experienceLevel: "beginner",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_half_marathon_base");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    fitnessLevel: "beginner",
    programs: { activeProgramInstance },
  });
  const composer = buildComposer({
    goals: [],
    personalization,
    athleteProfile,
  });

  const packet = deterministicCoachPacket({
    input: "Why is today set up this way?",
    todayWorkout: { label: "Easy Run", run: { d: "35 min" } },
    currentWeek: 1,
    logs: {},
    bodyweights: [],
    personalization: {
      ...personalization,
      trainingState: { loadStatus: "steady" },
    },
    learning: {},
    salvage: {},
    planComposer: composer,
    optimizationLayer: {},
    failureMode: {},
    momentum: { momentumState: "stable", inconsistencyRisk: "low" },
    strengthLayer: {},
    nutritionLayer: {},
    nutritionComparison: null,
    arbitration: {},
    expectations: {},
    memoryInsights: [],
    coachMemoryContext: null,
    realWorldNutrition: {},
    recalibration: {},
  });

  assert.match(packet.coachBrief, /Half Marathon Base/i);
  assert.match(packet.coachBrief, /PLAN BASIS:/i);
  assert.match(packet.coachBrief, /ADHERENCE:/i);
});

test("coach packets stay materially different for travel versus poor sleep prompts", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    equipmentItems: ["barbell", "safe running access"],
    time: "45",
  });
  const athleteProfile = buildAthleteProfile({
    goals: [{ id: "goal_1", name: "Run a stronger half marathon", category: "running", active: true, priority: 1 }],
    trainingContext,
  });
  const personalization = buildPersonalization({
    trainingContext,
    fitnessLevel: "intermediate",
  });
  const composer = buildComposer({
    goals: athleteProfile.goals,
    personalization,
    athleteProfile,
  });
  const baseArgs = {
    todayWorkout: { label: "Tempo Run", type: "hard-run", run: { t: "Tempo", d: "35 min" } },
    currentWeek: 3,
    logs: {},
    bodyweights: [],
    personalization: {
      ...personalization,
      trainingState: { loadStatus: "steady", fatigueScore: 4 },
      travelState: { isTravelWeek: false, access: "gym" },
    },
    learning: {},
    salvage: {},
    planComposer: composer,
    optimizationLayer: {},
    failureMode: {},
    momentum: { momentumState: "stable", inconsistencyRisk: "low", fatigueNotes: 2 },
    strengthLayer: {},
    nutritionLayer: { dayType: "hardRun", targets: { cal: 2700, p: 180, c: 300 } },
    nutritionComparison: null,
    arbitration: { primary: { category: "running" } },
    expectations: {},
    memoryInsights: [],
    coachMemoryContext: null,
    realWorldNutrition: {},
    recalibration: {},
  };

  const travelPacket = deterministicCoachPacket({
    ...baseArgs,
    input: "I'm traveling today",
  });
  const sleepPacket = deterministicCoachPacket({
    ...baseArgs,
    input: "I slept badly and feel cooked today",
  });

  assert.match(travelPacket.notices.join(" "), /travel/i);
  assert.doesNotMatch(sleepPacket.notices.join(" "), /travel/i);
  assert.notDeepEqual(
    travelPacket.actions.map((action) => action.type),
    sleepPacket.actions.map((action) => action.type)
  );
});

test("strict program mode downgrades when recent execution drifts too far from the backbone", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Home",
    equipment: "mixed",
    equipmentItems: ["safe running access"],
    time: "45",
  });
  const athleteProfile = buildAthleteProfile({
    goals: [],
    daysPerWeek: 4,
    experienceLevel: "intermediate",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_half_marathon_base");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.runAsWritten,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 4,
    fitnessLevel: "intermediate",
    programs: { activeProgramInstance },
  });
  const record = createPersistedPlanWeekRecord({
    planWeek: {
      id: "plan_week_1",
      weekNumber: 1,
      absoluteWeek: 1,
      startDate: "2026-04-06",
      endDate: "2026-04-12",
      sessionsByDay: {
        1: { type: "easy-run", label: "Easy Run", keySession: true },
        3: { type: "hard-run", label: "Steady / Quality Run", keySession: true },
        5: { type: "easy-run", label: "Easy Run + Strides", keySession: true },
        6: { type: "long-run", label: "Long Run", keySession: true },
      },
      planningBasis: {
        activeProgramId: "program_half_marathon_base",
      },
    },
    capturedAt: Date.now(),
  });

  const adherence = deriveProgramAdherenceState({
    activeProgramInstance,
    programDefinition,
    logs: {
      "2026-04-08": {
        type: "Strength",
        checkin: { status: "completed_as_planned" },
      },
    },
    plannedDayRecords: {},
    planWeekRecords: { "1": record },
  });

  assert.equal(adherence.state, "off_program");

  const liveBasis = deriveLiveProgramPlanningBasis({
    personalization,
    goals: [],
    athleteProfile,
    defaultArchitecture: "race_prep_dominant",
    baseWeek: BASE_WEEK,
    logs: {
      "2026-04-08": {
        type: "Strength",
        checkin: { status: "completed_as_planned" },
      },
    },
    plannedDayRecords: {},
    planWeekRecords: { "1": record },
  });

  assert.equal(liveBasis.runtimeFidelityMode, PROGRAM_RUNTIME_FIDELITY.adapted);
  assert.equal(liveBasis.planningBasis.fidelityStatus, PROGRAM_FIDELITY_STATUS.downgradedForDrift);
  assert.match(liveBasis.planningBasis.adherence.summary, /no longer counts as strict|drift/i);
});

test("hard schedule reality can suspend a strict advanced template", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    equipmentItems: ["barbell", "rack", "bench", "cable stack"],
    time: "45",
  });
  const athleteProfile = buildAthleteProfile({
    goals: [],
    daysPerWeek: 2,
    experienceLevel: "intermediate",
    trainingContext,
  });
  const programDefinition = getProgramDefinitionById("program_powerbuilding_builder");
  const activeProgramInstance = createProgramInstance({
    programDefinition,
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.runAsWritten,
  });
  const personalization = buildPersonalization({
    trainingContext,
    daysPerWeek: 2,
    fitnessLevel: "intermediate",
    programs: { activeProgramInstance },
  });

  const liveBasis = deriveLiveProgramPlanningBasis({
    personalization,
    goals: [],
    athleteProfile,
    defaultArchitecture: "hybrid_performance",
    baseWeek: BASE_WEEK,
    logs: {},
    plannedDayRecords: {},
    planWeekRecords: {},
  });

  assert.equal(liveBasis.usesProgramBackbone, false);
  assert.equal(liveBasis.planningBasis.fidelityStatus, PROGRAM_FIDELITY_STATUS.suspended);
  assert.equal(liveBasis.planningBasis.basisMode, "program_suspended_fallback");
  assert.match(liveBasis.planningBasis.planBasisExplanation.basisSummary, /not running it literally right now/i);
});

test("switching the active program midstream immediately rebases the live week", () => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Travel",
    equipment: "hotel_gym",
    equipmentItems: ["adjustable dumbbells", "bench", "treadmill"],
    time: "45",
  });
  const goals = normalizeGoals([
    { id: "g1", name: "Stay in shape while traveling", category: "general_fitness", active: true, priority: 1 },
  ]);
  const athleteProfile = buildAthleteProfile({
    goals,
    daysPerWeek: 4,
    experienceLevel: "intermediate",
    trainingContext,
  });
  const foundationInstance = createProgramInstance({
    programDefinition: getProgramDefinitionById("program_foundation_training"),
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });
  const travelInstance = createProgramInstance({
    programDefinition: getProgramDefinitionById("program_hotel_gym_travel_build"),
    athleteProfile,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
  });

  const foundationComposer = buildComposer({
    goals,
    athleteProfile,
    personalization: buildPersonalization({
      trainingContext,
      daysPerWeek: 4,
      programs: { activeProgramInstance: foundationInstance },
    }),
    currentWeek: 3,
  });
  const travelComposer = buildComposer({
    goals,
    athleteProfile,
    personalization: buildPersonalization({
      trainingContext,
      daysPerWeek: 4,
      programs: { activeProgramInstance: travelInstance },
    }),
    currentWeek: 3,
  });

  const foundationLabels = Object.values(foundationComposer.dayTemplates || {}).map((session) => session?.label).filter(Boolean);
  const travelLabels = Object.values(travelComposer.dayTemplates || {}).map((session) => session?.label).filter(Boolean);

  assert.equal(foundationComposer.planningBasis.activeProgramId, "program_foundation_training");
  assert.equal(travelComposer.planningBasis.activeProgramId, "program_hotel_gym_travel_build");
  assert.ok(foundationLabels.includes("Foundation Strength A"));
  assert.ok(travelLabels.includes("Hotel Density Strength A"));
  assert.notDeepEqual(foundationLabels, travelLabels);
  assert.match(travelComposer.planningBasis.planBasisExplanation?.basisSummary || "", /Hotel Gym Travel Build/i);
});
