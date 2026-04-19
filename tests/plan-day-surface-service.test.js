const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCanonicalPlanSurfaceAudit,
  buildCanonicalPlanSurfaceModel,
} = require("../src/services/plan-day-surface-service.js");
const { buildPlannedDayRecord } = require("../src/modules-checkins.js");

const buildCanonicalPlanDayFixture = () => ({
  id: "plan_day_2026-04-15",
  dateKey: "2026-04-15",
  week: {
    currentWeek: 6,
    phase: "BUILD",
    summary: "Threshold swim stays in place while the week carries an aggressive preference bias.",
    successDefinition: "Keep the threshold swim quality clean.",
    planningBasis: {
      todayLine: "Today's session keeps the aggressive preference while preserving the swim backbone.",
      activeProgramName: "Masters Swim Base",
    },
    changeSummary: {
      inputType: "training_preference",
      headline: "Aggressive preference changed the week shape.",
      preserved: "The main weekly backbone stays intact.",
      surfaceLine: "Aggressive preference changed the week shape. The main weekly backbone stays intact.",
    },
    programBlock: {
      label: "Swim build",
      summary: "Threshold work supports the current build block.",
      successCriteria: ["Hold threshold pace without losing form."],
    },
  },
  base: {
    training: {
      type: "swim-threshold",
      label: "Threshold swim",
      swim: {
        focus: "Threshold swim",
        setLine: "3 x 400 @ threshold with 60 sec easy between reps",
      },
      nutri: "hardRun",
    },
  },
  resolved: {
    training: {
      type: "swim-threshold",
      label: "Threshold swim",
      swim: {
        focus: "Threshold swim",
        setLine: "3 x 400 @ threshold with 60 sec easy between reps",
      },
      explanation: "Aggressive preference changed the week shape. The main weekly backbone stays intact.",
      nutri: "hardRun",
    },
    nutrition: {
      dayType: "hardRun",
      prescription: { dayType: "hardRun" },
      actual: null,
      comparison: { status: "not_logged", summary: "No nutrition log yet." },
    },
    recovery: {
      state: "progression",
      stateLabel: "Progression-ready",
      recoveryLine: "Push today while recovery still looks supportive.",
      prescription: {
        summary: "Push today while recovery still looks supportive.",
      },
    },
    supplements: {
      plan: { items: [{ name: "Electrolytes", timing: "pre-swim" }] },
    },
    logging: {
      status: "not_logged",
      hasCheckin: false,
      hasNutritionLog: false,
    },
  },
  decision: {
    mode: "progression",
    modeLabel: "Progression-ready",
    modifiedFromBase: true,
  },
  provenance: {
    summary: "Aggressive preference changed the week shape. The main weekly backbone stays intact.",
    keyDrivers: ["Aggressive preference", "Threshold swim backbone"],
    events: [],
  },
  flags: {
    isModified: true,
  },
});

test("canonical plan-day surface models stay aligned across Today, Program, Log, Nutrition, and Coach", () => {
  const planDay = buildCanonicalPlanDayFixture();
  const plannedDayRecord = buildPlannedDayRecord(planDay);

  const surfaceModels = {
    today: buildCanonicalPlanSurfaceModel({ surface: "today", planDay }),
    program: buildCanonicalPlanSurfaceModel({ surface: "program", planDay }),
    log: buildCanonicalPlanSurfaceModel({ surface: "log", plannedDayRecord }),
    nutrition: buildCanonicalPlanSurfaceModel({ surface: "nutrition", planDay }),
    coach: buildCanonicalPlanSurfaceModel({ surface: "coach", planDay }),
  };
  const audit = buildCanonicalPlanSurfaceAudit({
    canonicalSurface: surfaceModels.today,
    surfaceModels,
  });

  assert.equal(surfaceModels.today.display.sessionLabel, "Threshold swim");
  assert.equal(surfaceModels.program.display.sessionLabel, surfaceModels.today.display.sessionLabel);
  assert.equal(surfaceModels.log.display.sessionLabel, surfaceModels.today.display.sessionLabel);
  assert.equal(surfaceModels.nutrition.display.sessionLabel, surfaceModels.today.display.sessionLabel);
  assert.equal(surfaceModels.coach.display.sessionLabel, surfaceModels.today.display.sessionLabel);
  assert.equal(surfaceModels.program.display.structure, surfaceModels.today.display.structure);
  assert.equal(surfaceModels.log.display.structure, surfaceModels.today.display.structure);
  assert.equal(surfaceModels.nutrition.display.purpose, surfaceModels.today.display.purpose);
  assert.equal(surfaceModels.coach.preferenceAndAdaptationLine, surfaceModels.today.preferenceAndAdaptationLine);
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.mismatches, []);
});

test("preference and adaptation messaging is shared across all surface models", () => {
  const planDay = buildCanonicalPlanDayFixture();
  const plannedDayRecord = buildPlannedDayRecord(planDay);
  const expectedLine = "Aggressive preference changed the week shape. The main weekly backbone stays intact.";
  const models = [
    buildCanonicalPlanSurfaceModel({ surface: "today", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "program", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "log", plannedDayRecord }),
    buildCanonicalPlanSurfaceModel({ surface: "nutrition", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "coach", planDay }),
  ];

  models.forEach((model) => {
    assert.equal(model.preferenceAndAdaptationLine, expectedLine);
    assert.match(model.canonicalReasonLine, /Aggressive preference/i);
  });
});

test("canonical reason prefers shared plan-day change messaging over surface-specific why copy", () => {
  const model = buildCanonicalPlanSurfaceModel({
    surface: "nutrition",
    training: {
      type: "run-easy",
      label: "Easy run",
      explanation: "Surface-local copy says this is a re-entry jog.",
    },
    week: {
      changeSummary: {
        inputType: "training_preference",
        headline: "Aggressive preference changed the day shape.",
        preserved: "The endurance backbone stays intact.",
        surfaceLine: "Aggressive preference changed the day shape. The endurance backbone stays intact.",
      },
    },
    provenance: {
      summary: "Aggressive preference changed the day shape. The endurance backbone stays intact.",
    },
  });

  assert.equal(
    model.canonicalReasonLine,
    "Aggressive preference changed the day shape. The endurance backbone stays intact."
  );
  assert.equal(
    model.preferenceAndAdaptationLine,
    model.canonicalReasonLine
  );
});

test("explicit week overrides enrich a plan-day surface model when the stored day is missing live change data", () => {
  const planDay = {
    ...buildCanonicalPlanDayFixture(),
    week: {
      currentWeek: 6,
      phase: "BUILD",
      summary: "Stored day week exists but is missing change detail.",
    },
    provenance: {
      summary: "Stored provenance is still generic.",
    },
  };

  const model = buildCanonicalPlanSurfaceModel({
    surface: "coach",
    planDay,
    week: {
      changeSummary: {
        inputType: "training_preference",
        headline: "Aggressive preference changed the day shape.",
        preserved: "The swim backbone stays intact.",
        surfaceLine: "Aggressive preference changed the day shape. The swim backbone stays intact.",
      },
      planningBasis: {
        todayLine: "Aggressive preference changed the day shape. The swim backbone stays intact.",
      },
    },
  });

  assert.equal(
    model.canonicalReasonLine,
    "Aggressive preference changed the day shape. The swim backbone stays intact."
  );
  assert.equal(
    model.preferenceAndAdaptationLine,
    "Aggressive preference changed the day shape. The swim backbone stays intact."
  );
});

test("surface audit flags render-model drift when one surface diverges from the canonical day", () => {
  const planDay = buildCanonicalPlanDayFixture();
  const goodSurface = buildCanonicalPlanSurfaceModel({ surface: "today", planDay });
  const driftedSurface = {
    ...buildCanonicalPlanSurfaceModel({ surface: "program", planDay }),
    auditSnapshot: {
      ...buildCanonicalPlanSurfaceModel({ surface: "program", planDay }).auditSnapshot,
      sessionLabel: "Push-Up Session",
    },
  };

  const audit = buildCanonicalPlanSurfaceAudit({
    canonicalSurface: goodSurface,
    surfaceModels: {
      today: goodSurface,
      program: driftedSurface,
    },
  });

  assert.equal(audit.ok, false);
  assert.equal(audit.mismatches.length, 1);
  assert.equal(audit.mismatches[0].surface, "program");
  assert.equal(audit.mismatches[0].field, "sessionLabel");
  assert.equal(audit.mismatches[0].actual, "Push-Up Session");
});

test("adaptive explanation source and copy stay aligned across all major surfaces", () => {
  const planDay = {
    ...buildCanonicalPlanDayFixture(),
    week: {
      ...buildCanonicalPlanDayFixture().week,
      adaptivePolicyTraces: [
        {
          decisionPointId: "time_crunched_session_format_choice",
          chosenActionId: "short_separate_sessions",
          usedAdaptiveChoice: true,
          decisionMode: "active",
          candidateScores: [
            {
              actionId: "default_structure",
              confidenceScore: 0,
              sampleSize: 0,
            },
            {
              actionId: "short_separate_sessions",
              confidenceScore: 86,
              sampleSize: 14,
            },
          ],
          contextSnapshot: {
            timeCrunched: true,
            scheduleReliability: "busy",
          },
        },
      ],
    },
  };
  const plannedDayRecord = buildPlannedDayRecord(planDay);
  const models = [
    buildCanonicalPlanSurfaceModel({ surface: "today", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "program", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "log", plannedDayRecord }),
    buildCanonicalPlanSurfaceModel({ surface: "nutrition", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "coach", planDay }),
  ];

  models.forEach((model) => {
    assert.equal(model.explanationSourceLabel, "Based on your recent training");
    assert.match(model.canonicalReasonLine, /shorter blocks|busy weeks/i);
    assert.doesNotMatch(model.canonicalReasonLine, /time_crunched_session_format_choice|short_separate_sessions|confidenceScore|sampleSize/i);
  });
  assert.equal(new Set(models.map((model) => model.canonicalReasonLine)).size, 1);
  assert.equal(new Set(models.map((model) => model.explanationSourceLabel)).size, 1);
});

test("hybrid tradeoff explanations stay aligned across Today, Program, Log, Nutrition, and Coach", () => {
  const baseFixture = buildCanonicalPlanDayFixture();
  const planDay = {
    ...baseFixture,
    week: {
      ...baseFixture.week,
      adaptivePolicyTraces: [
        {
          decisionPointId: "hybrid_run_lift_balance_template",
          chosenActionId: "run_supportive_hybrid",
          usedAdaptiveChoice: true,
          decisionMode: "active",
          candidateScores: [
            { actionId: "balanced_hybrid", confidenceScore: 0, sampleSize: 0 },
            { actionId: "run_supportive_hybrid", confidenceScore: 82, sampleSize: 12 },
          ],
          contextSnapshot: {
            hybridMeaningful: true,
            hybridCohort: "performance_hybrid",
          },
        },
      ],
    },
  };
  const plannedDayRecord = buildPlannedDayRecord(planDay);
  const models = [
    buildCanonicalPlanSurfaceModel({ surface: "today", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "program", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "log", plannedDayRecord }),
    buildCanonicalPlanSurfaceModel({ surface: "nutrition", planDay }),
    buildCanonicalPlanSurfaceModel({ surface: "coach", planDay }),
  ];

  models.forEach((model) => {
    assert.equal(model.explanationSourceLabel, "Based on your recent training");
    assert.match(model.canonicalReasonLine, /key run lane|lower-body lift load|peaks do not stack/i);
    assert.doesNotMatch(model.canonicalReasonLine, /hybrid_run_lift_balance_template|run_supportive_hybrid|confidenceScore|sampleSize/i);
  });
  assert.equal(new Set(models.map((model) => model.canonicalReasonLine)).size, 1);
});
