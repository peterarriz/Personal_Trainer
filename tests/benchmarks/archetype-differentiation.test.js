const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_BENCHMARK_CASES,
} = require("./goal-coverage-benchmark-data.js");
const {
  evaluateBenchmarkCase,
} = require("./goal-benchmark-helpers.js");

const findCase = (caseId) => {
  const caseDef = GOAL_BENCHMARK_CASES.find((entry) => entry.id === caseId);
  assert.ok(caseDef, `Missing benchmark case ${caseId}`);
  return caseDef;
};

const evaluateCase = (caseId) => evaluateBenchmarkCase(findCase(caseId));

test("obviously different archetypes stay materially different in generated weeks", () => {
  const marathon = evaluateCase("run_marathon_completion_run_intermediate_structured_intake_1");
  const dumbbellHypertrophy = evaluateCase("build_muscle_limited_home_structured_intake_1");
  const returnRun = evaluateCase("return_to_running_run_partial_structured_intake_1");
  const halfImprove = evaluateCase("run_half_improvement_run_intermediate_structured_intake_1");
  const busyFatLoss = evaluateCase("busy_life_body_comp_physique_busy_structured_intake_1");
  const recomp = evaluateCase("recomp_physique_standard_structured_intake_1");
  const protectedRestart = evaluateCase("restart_safely_reentry_protected_structured_intake_1");
  const consistency = evaluateCase("build_consistency_general_reset_structured_intake_1");
  const runPriority = evaluateCase("run_lift_running_priority_hybrid_running_structured_intake_1");
  const strengthPriority = evaluateCase("run_lift_strength_priority_hybrid_strength_structured_intake_1");
  const swimImprove = evaluateCase("swim_endurance_swim_pool_structured_intake_1");
  const cyclingBase = evaluateCase("cycling_fitness_cycling_road_structured_intake_1");

  assert.notEqual(marathon.primary?.planArchetypeId, dumbbellHypertrophy.primary?.planArchetypeId);
  assert.ok(marathon.features.counts.run >= 3);
  assert.equal(dumbbellHypertrophy.features.counts.run, 0);
  assert.ok(dumbbellHypertrophy.features.counts.strength >= 3);

  assert.equal(returnRun.features.counts.runQuality, 0);
  assert.ok(halfImprove.features.counts.runQuality >= 1);
  assert.ok(returnRun.features.counts.recovery > halfImprove.features.counts.recovery);

  assert.ok(busyFatLoss.features.maxApproxMinutes < recomp.features.maxApproxMinutes);
  assert.ok(busyFatLoss.features.counts.nonRest <= recomp.features.counts.nonRest);

  assert.ok(protectedRestart.features.counts.recovery >= consistency.features.counts.recovery);
  assert.doesNotMatch(protectedRestart.features.textCorpus, /\bthreshold|interval|race-pace\b/);

  assert.ok(runPriority.features.counts.longRun >= 1);
  assert.ok(strengthPriority.features.counts.strength >= 2);
  assert.notDeepEqual(runPriority.features.counts, strengthPriority.features.counts);

  assert.ok(swimImprove.features.counts.swim >= 3);
  assert.equal(swimImprove.features.counts.ride, 0);
  assert.ok(cyclingBase.features.counts.ride >= 3);
  assert.equal(cyclingBase.features.counts.swim, 0);
  assert.match(swimImprove.features.textCorpus, /\btechnique\b/);
  assert.match(cyclingBase.features.textCorpus, /\bcadence|ride\b/);
});
