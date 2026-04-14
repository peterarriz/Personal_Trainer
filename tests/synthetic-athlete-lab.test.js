const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SYNTHETIC_ATHLETE_PERSONAS,
} = require("../src/services/synthetic-athlete-lab/persona-catalog.js");
const {
  runSyntheticAthleteLab,
  SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS,
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

test("synthetic athlete lab runs a 26-week adversarial report for the focus persona and emits actionable failures", () => {
  const report = runSyntheticAthleteLab();
  const focus = report.personaResults[0];

  assert.equal(report.summary.personaCount, 1);
  assert.equal(report.summary.simulationWeeks, 26);
  assert.equal(report.summary.overallPass, false);
  assert.equal(focus.personaId, "novice_obese_beginner");
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
});

test("synthetic athlete lab release gate matrix covers obese beginner, swimmer, strength, and hybrid archetypes", () => {
  const report = runSyntheticAthleteLab();
  const matrixIds = report.releaseGateMatrix.map((entry) => entry.personaId).sort();

  assert.deepEqual(matrixIds, SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS.slice().sort());
  assert.ok(report.releaseGateMatrix.some((entry) => entry.verdict === "watch" || entry.verdict === "blocked"));
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
