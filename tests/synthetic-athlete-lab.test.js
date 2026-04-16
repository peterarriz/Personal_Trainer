const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SYNTHETIC_ATHLETE_PERSONAS,
} = require("../src/services/synthetic-athlete-lab/persona-catalog.js");
const {
  runSyntheticAthleteLab,
  SYNTHETIC_ATHLETE_CATALOG_MODES,
  SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS,
  SYNTHETIC_ATHLETE_RELEASE_GATE_SCHEMA_VERSION,
  SYNTHETIC_ATHLETE_RELEASE_GATE_THRESHOLD_PROPOSAL,
} = require("../src/services/synthetic-athlete-lab/runner.js");

const REQUIRED_CLUSTER_IDS = [
  "intake_friction",
  "goal_miscapture",
  "hidden_secondary_goals",
  "baseline_timing_problems",
  "ugly_confusing_copy",
  "coach_ambiguity",
  "audit_confidence_erosion",
  "long_horizon_time_confusion",
  "sport_domain_mismatch",
  "support_tier_dishonesty",
  "plan_degradation",
];

test("synthetic athlete lab still emits actionable failures when a persona lacks required anchors", () => {
  const report = runSyntheticAthleteLab({
    personas: [
      {
        id: "failing_swim_probe",
        name: "Failing swim probe",
        ageRange: "34-34",
        trainingAgeYears: 2,
        goalIntents: ["swim a faster mile"],
        supportTierExpectation: "tier_2",
        bodyCompContext: "performance-first",
        strengthContext: "basic dryland work",
        enduranceContext: "pool swimmer with no benchmark supplied",
        scheduleReality: "3 swim sessions",
      },
    ],
    includeArchetypeMatrix: false,
  });
  const focus = report.personaResults[0];

  assert.equal(report.summary.personaCount, 1);
  assert.equal(report.summary.simulationWeeks, 26);
  assert.equal(report.summary.overallPass, false);
  assert.equal(focus.personaId, "failing_swim_probe");
  assert.equal(focus.simulationWeeks, 26);
  assert.ok(Array.isArray(focus.timeline));
  assert.equal(focus.timeline.length, 26);
  assert.ok(Array.isArray(focus.failures));
  assert.ok(focus.failures.length > 0);
  assert.ok(focus.mediumIssues.length + focus.severeBlockers.length > 0);
  assert.equal(typeof focus.categoryScores.intake_clarity_score, "number");
  assert.equal(typeof focus.categoryScores.plan_credibility_score, "number");
  assert.equal(typeof focus.categoryScores.coach_usefulness_score, "number");
  assert.equal(typeof focus.categoryScores.settings_goals_management_score, "number");
  assert.equal(typeof focus.categoryScores.logging_usefulness_score, "number");
  assert.equal(typeof focus.categoryScores.review_confidence_score, "number");
  assert.equal(typeof focus.categoryScores.adaptation_honesty_score, "number");
  assert.ok(focus.failures.every((failure) => Array.isArray(failure.likelyFiles) && failure.likelyFiles.length > 0));
  assert.ok(focus.failures.every((failure) => Array.isArray(failure.specRefs) && failure.specRefs.length > 0));
  assert.ok(focus.failures.every((failure) => typeof failure.stepRef === "string" && failure.stepRef.length > 0));
  assert.ok(Array.isArray(report.browserProbes));
  assert.ok(report.browserProbes.length >= 4);
});

test("synthetic athlete lab keeps the required failure cluster taxonomy and browser probes visible", () => {
  const report = runSyntheticAthleteLab();

  assert.deepEqual(Object.keys(report.clusterTaxonomy).sort(), REQUIRED_CLUSTER_IDS.slice().sort());
  assert.ok(report.browserProbes.some((probe) => probe.specRef === "e2e/synthetic-athlete-lab.spec.js"));
  assert.ok(report.browserProbes.some((probe) => probe.specRef === "e2e/coach.spec.js"));
  assert.ok(report.browserProbes.some((probe) => probe.specRef === "e2e/program.spec.js"));
  assert.ok(report.browserProbes.some((probe) => probe.specRef === "e2e/goal-settings.spec.js"));
  const skepticalProbe = report.browserProbes.find((probe) => probe.specRef === "e2e/adversarial-trust.spec.js");
  assert.ok(skepticalProbe);
  assert.deepEqual(
    skepticalProbe.failureClassifications,
    ["trust break", "dead end", "contradiction", "accessibility bug", "polish bug"]
  );
});

test("synthetic athlete lab release gate matrix covers obese beginner, swimmer, strength, hybrid, and hostile-trainer archetypes", () => {
  const report = runSyntheticAthleteLab();
  const matrixIds = report.releaseGateMatrix.map((entry) => entry.personaId).sort();

  assert.deepEqual(matrixIds, SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS.slice().sort());
  assert.ok(matrixIds.includes("hostile_trainer_anti_ai"));
  assert.ok(report.releaseGateMatrix.every((entry) => entry.verdict === "credible"));
});

test("synthetic athlete lab can target a selected persona and shorter simulation window", () => {
  const persona = SYNTHETIC_ATHLETE_PERSONAS.find((entry) => entry.id === "bench_225_office_worker");
  const report = runSyntheticAthleteLab({
    personas: [persona],
    weeks: 12,
    includeArchetypeMatrix: false,
  });

  assert.equal(report.summary.personaCount, 1);
  assert.equal(report.summary.simulationWeeks, 12);
  assert.equal(report.personaResults[0].personaId, "bench_225_office_worker");
  assert.equal(report.personaResults[0].simulationWeeks, 12);
  assert.deepEqual(report.releaseGateMatrix, []);
});

test("synthetic athlete lab can run the expanded 100-persona release gate for six months with cohort and fairness reporting", () => {
  const report = runSyntheticAthleteLab({
    catalogMode: SYNTHETIC_ATHLETE_CATALOG_MODES.expanded,
    targetPersonaCount: 100,
    weeks: 26,
    includeArchetypeMatrix: false,
  });

  assert.equal(report.schemaVersion, SYNTHETIC_ATHLETE_RELEASE_GATE_SCHEMA_VERSION);
  assert.equal(report.summary.personaCount, 100);
  assert.equal(report.summary.catalogMode, SYNTHETIC_ATHLETE_CATALOG_MODES.expanded);
  assert.equal(report.summary.simulationWeeks, 26);
  assert.equal(report.releaseGate.thresholds.minimumPersonaCount, SYNTHETIC_ATHLETE_RELEASE_GATE_THRESHOLD_PROPOSAL.minimumPersonaCount);
  assert.equal(report.releaseGate.thresholds.minimumSimulationWeeks, SYNTHETIC_ATHLETE_RELEASE_GATE_THRESHOLD_PROPOSAL.minimumSimulationWeeks);
  assert.ok(report.catalogCoverage.exactUsers > 0);
  assert.ok(report.catalogCoverage.vagueUsers > 0);
  assert.ok(report.catalogCoverage.chaoticUsers > 0);
  assert.ok(report.catalogCoverage.dateBasedGoalUsers > 0);
  assert.ok(report.catalogCoverage.openEndedGoalUsers > 0);
  assert.ok(report.catalogCoverage.coachNeverUsers > 0);
  assert.ok(report.catalogCoverage.coachOveruseUsers > 0);
  assert.ok(report.catalogCoverage.swimUsers > 0);
  assert.ok(report.catalogCoverage.hybridDomainUsers > 0);
  assert.deepEqual(
    report.releaseDimensionSummary.dimensions.map((dimension) => dimension.id),
    ["coherence", "progressionRealism", "safety", "adaptationQuality", "crossSurfaceConformity"]
  );
  assert.ok(report.cohortCoverage.required.every((cohort) => cohort.meetsMinimum));
  assert.equal(report.cohortCoverage.requiredMissing.length, 0);
  assert.equal(typeof report.fairnessSignals.maximumAverageGap, "number");
  assert.equal(typeof report.fairnessSignals.maximumDimensionGap, "number");
  assert.ok(report.rootCauseClusters.every((cluster) => Array.isArray(cluster.cohorts)));
  assert.ok(report.personaResults.every((result) => Array.isArray(result.cohortTags)));
  assert.ok(report.personaResults.every((result) => typeof result.releaseDimensionScores.coherence === "number"));
});

test("synthetic athlete lab stays reproducible for the same personas and horizon", () => {
  const personas = [
    SYNTHETIC_ATHLETE_PERSONAS.find((entry) => entry.id === "novice_obese_beginner"),
    SYNTHETIC_ATHLETE_PERSONAS.find((entry) => entry.id === "recreational_swimmer"),
  ].filter(Boolean);
  const first = runSyntheticAthleteLab({
    personas,
    weeks: 8,
    includeArchetypeMatrix: false,
  });
  const second = runSyntheticAthleteLab({
    personas,
    weeks: 8,
    includeArchetypeMatrix: false,
  });

  const summarize = (report) => ({
    summary: report.summary,
    releaseDimensionSummary: report.releaseDimensionSummary,
    cohortCoverage: report.cohortCoverage,
    fairnessSignals: report.fairnessSignals,
    clusters: report.rootCauseClusters,
    personaResults: report.personaResults.map((result) => ({
      personaId: result.personaId,
      cohortTags: result.cohortTags,
      releaseDimensionScores: result.releaseDimensionScores,
      overallScore: result.overallScore,
      overallPass: result.overallPass,
      failures: result.failures.map((failure) => ({
        clusterId: failure.clusterId,
        severity: failure.severity,
        message: failure.message,
        stepRef: failure.stepRef,
      })),
      timeline: result.timeline,
    })),
  });

  assert.deepEqual(summarize(first), summarize(second));
});

test("synthetic athlete lab no longer loops proxy-choice intake or flags plain-English maintenance copy as lane theater", () => {
  const report = runSyntheticAthleteLab({
    personas: [
      {
        id: "appearance_proxy_regression",
        name: "Appearance proxy regression",
        ageRange: "29-29",
        trainingAgeYears: 3,
        goalIntents: ["I want to look athletic again"],
        supportTierExpectation: "tier_1",
        bodyCompContext: "vague aesthetic goal with high expectations",
        strengthContext: "former athlete, now detrained",
        scheduleReality: "4 flexible sessions",
        baselineMetrics: { bodyweight: 168, waist: 33 },
      },
      {
        id: "travel_copy_regression",
        name: "Travel copy regression",
        ageRange: "41-41",
        trainingAgeYears: 3,
        goalIntents: ["maintain strength", "lose 10 pounds"],
        supportTierExpectation: "tier_1",
        bodyCompContext: "fat loss while traveling heavily",
        strengthContext: "hotel-gym capable",
        enduranceContext: "walk-heavy travel days",
        equipmentReality: "hotel gyms only",
        scheduleReality: "constant travel with compressed workout windows",
        travelLikelihood: "high",
        baselineMetrics: { bodyweight: 201, waist: 40 },
      },
    ],
    weeks: 8,
    includeArchetypeMatrix: false,
  });

  const appearancePersona = report.personaResults.find((entry) => entry.personaId === "appearance_proxy_regression");
  const travelPersona = report.personaResults.find((entry) => entry.personaId === "travel_copy_regression");

  assert.ok(appearancePersona);
  assert.ok(travelPersona);
  assert.ok(!appearancePersona.failures.some((failure) => failure.clusterId === "intake_friction"));
  assert.ok(!appearancePersona.failures.some((failure) => failure.clusterId === "baseline_timing_problems"));
  assert.ok(!travelPersona.failures.some((failure) => failure.clusterId === "ugly_confusing_copy"));
});
