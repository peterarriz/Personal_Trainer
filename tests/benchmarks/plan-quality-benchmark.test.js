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

test("conservative running plans stay safe but still specific", () => {
  const raceCase = evaluateCase("run_5k_beginner_consistency_busy_structured_intake_1");
  const returnCase = evaluateCase("return_to_running_reentry_protected_structured_intake_1");

  assert.equal(raceCase.primary?.planArchetypeId, "run_5k_completion_novice");
  assert.ok(raceCase.features.counts.run >= 2);
  assert.ok(raceCase.features.counts.longRun >= 1);
  assert.equal(raceCase.failures.length, 0);

  assert.equal(returnCase.primary?.planArchetypeId, "run_return_conservative");
  assert.equal(returnCase.features.counts.runQuality, 0);
  assert.ok(returnCase.features.counts.run >= 2);
  assert.equal(returnCase.failures.length, 0);
});

test("swim, cycling, and triathlon plans keep modality-specific structure", () => {
  const swimCase = evaluateCase("swim_endurance_swim_pool_structured_intake_1");
  const cyclingCase = evaluateCase("cycling_fitness_cycling_road_structured_intake_1");
  const triCase = evaluateCase("triathlon_beginner_swim_returning_structured_intake_1");

  assert.ok(swimCase.features.counts.swim >= 3);
  assert.match(swimCase.features.textCorpus, /\btechnique\b/);
  assert.match(swimCase.features.textCorpus, /\bendurance|threshold|aerobic\b/);

  assert.ok(cyclingCase.features.counts.ride >= 3);
  assert.match(cyclingCase.features.textCorpus, /\blong ride\b/);
  assert.match(cyclingCase.features.textCorpus, /\btempo|cadence|aerobic ride\b/);

  assert.ok(triCase.features.counts.swim >= 1);
  assert.ok(triCase.features.counts.ride >= 1);
  assert.ok(triCase.features.counts.run >= 1);
  assert.match(triCase.features.textCorpus, /\bbrick|transition\b/);
  assert.equal(triCase.failures.length, 0);
});

test("physique, low-impact re-entry, and aesthetic hybrids keep believable protection", () => {
  const eventCutCase = evaluateCase("event_cut_physique_busy_structured_intake_1");
  const lowImpactCase = evaluateCase("low_impact_restart_reentry_low_impact_structured_intake_1");
  const aestheticHybridCase = evaluateCase("aesthetic_plus_endurance_physique_standard_structured_intake_1");

  assert.equal(eventCutCase.primary?.planArchetypeId, "event_cut_structured");
  assert.ok(eventCutCase.features.counts.strength >= 2);
  assert.match(eventCutCase.features.textCorpus, /\bstrength retention|conditioning intervals|tempo conditioning\b/);

  assert.equal(lowImpactCase.primary?.planArchetypeId, "low_impact_restart");
  assert.doesNotMatch(lowImpactCase.features.textCorpus, /\btempo|interval|threshold|reactive\b/);
  assert.ok(lowImpactCase.features.counts.recovery >= 2);

  assert.equal(aestheticHybridCase.primary?.planArchetypeId, "aesthetic_endurance_blend");
  assert.ok(aestheticHybridCase.features.counts.strength >= 2);
  assert.ok(aestheticHybridCase.features.counts.run >= 2);
  assert.equal(aestheticHybridCase.failures.length, 0);
});
