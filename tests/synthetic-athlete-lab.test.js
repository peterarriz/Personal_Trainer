const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SYNTHETIC_ATHLETE_PERSONAS,
} = require("../src/services/synthetic-athlete-lab/persona-catalog.js");
const {
  runSyntheticAthleteLab,
} = require("../src/services/synthetic-athlete-lab/runner.js");

test("synthetic athlete lab covers at least 50 personas and emits a clustered deterministic report", () => {
  const report = runSyntheticAthleteLab();

  assert.ok(SYNTHETIC_ATHLETE_PERSONAS.length >= 50);
  assert.equal(report.summary.personaCount, SYNTHETIC_ATHLETE_PERSONAS.length);
  assert.equal(report.globalChecks.themeCount, 10);
  assert.equal(report.globalChecks.distinctDarkThemes, 10);
  assert.equal(report.globalChecks.distinctLightThemes, 10);
  assert.equal(report.globalChecks.transientCloudStatus.label, "SYNC RETRYING");
  assert.ok(Array.isArray(report.personaResults));
  assert.ok(Array.isArray(report.clusters));
  assert.ok(report.clusters.length > 0);
  assert.ok(Object.keys(report.subsystemHeatmap || {}).length > 0);
});

test("synthetic athlete lab keeps first-class, bounded, and exploratory personas visible", () => {
  const report = runSyntheticAthleteLab();
  const byId = Object.fromEntries(report.personaResults.map((entry) => [entry.personaId, entry]));

  assert.equal(byId.novice_obese_beginner.supportTierExpected, "tier_1");
  assert.equal(byId.recreational_swimmer.supportTierActual, "tier_2");
  assert.equal(byId.vertical_jump_basketball.supportTierActual, "tier_2");
  assert.equal(byId.no_goal_foundation_user.snapshots.resolvedGoalCount, 0);
  assert.ok(byId.ocr_weekend_warrior.failures.some((failure) => failure.subsystem));
});
