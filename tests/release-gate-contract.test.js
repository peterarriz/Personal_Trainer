const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ADVERSARIAL_USER_FLOW_STEPS,
  ADVERSARIAL_USER_TEST_MATRIX,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_REQUIREMENTS,
  buildReleaseGateChecklistModel,
} = require("../src/services/release-gate-contract.js");

test("adversarial user matrix keeps the full 51-scenario release set", () => {
  assert.equal(ADVERSARIAL_USER_TEST_MATRIX.length, 51);

  const ids = ADVERSARIAL_USER_TEST_MATRIX.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], "AU-01");
  assert.equal(ids.at(-1), "AU-51");

  const scenarios = ADVERSARIAL_USER_TEST_MATRIX.map((item) => item.scenario);
  assert.ok(scenarios.includes("User who deletes account and recreates it."));
  assert.ok(scenarios.includes("User who compares Today, Program, Log, and Coach for contradictions."));
  assert.ok(scenarios.includes("Hostile trainer who thinks the app is trying to replace him and uses it to ridicule the logic and prescribed workouts to clients."));
});

test("every adversarial scenario keeps the required end-to-end flow coverage", () => {
  assert.deepEqual(ADVERSARIAL_USER_FLOW_STEPS, [
    "account access",
    "intake",
    "first week",
    "logging",
    "plan change",
    "degraded state",
  ]);
});

test("release gate requirements keep the full multi-layer ship checklist", () => {
  const labels = RELEASE_GATE_REQUIREMENTS.map((item) => item.label);

  assert.deepEqual(labels, [
    "clean auth lifecycle behavior",
    "accessible account access screens",
    "reduced intake click count",
    "working delete-account behavior or honest environment-gated messaging",
    "no cross-surface plan contradictions",
    "no domain label leakage",
    "coherent goals management and auditability",
    "stable degraded-state handling",
    "adversarial e2e pass",
    "expanded persona-lab pass",
    "manual browser/device/export pass",
  ]);
  assert.match(RELEASE_GATE_POLICY.summary, /not release-ready on unit tests alone|synthetic lab alone/i);
});

test("release gate checklist model stays machine-readable for scripts and docs", () => {
  const model = buildReleaseGateChecklistModel();

  assert.equal(model.policy.scenarioCount, 51);
  assert.equal(model.scenarios.length, 51);
  assert.equal(model.gateRequirements.length, 11);
  assert.deepEqual(model.adversarialFlowSteps, ADVERSARIAL_USER_FLOW_STEPS);
  assert.equal(model.gateRequirements[0]?.evidence.join(" + "), "manual + automated");
});
