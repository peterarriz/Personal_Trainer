const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONSUMER_SURFACE_BANNED_REGEX_SOURCES,
  SURFACE_CLARITY_CONTRACT,
  getSurfaceClarityContract,
} = require("../src/services/surface-clarity-contract.js");

test("surface clarity contract defines the guarded launch surfaces", () => {
  const surfaces = Object.keys(SURFACE_CLARITY_CONTRACT);
  assert.deepEqual(surfaces, ["today", "program", "log", "coach"]);

  surfaces.forEach((surfaceId) => {
    const contract = getSurfaceClarityContract(surfaceId);
    assert.ok(contract);
    assert.equal(contract.id, surfaceId);
    assert.ok(contract.rootTestId);
    assert.ok(contract.tabTestId);
    assert.ok(contract.primaryActionTestId);
    assert.ok(contract.labelTestId);
    assert.ok(contract.reasonTestId);
    assert.equal(typeof contract.reasonDisclosureTestId, "string");
    assert.ok(Array.isArray(contract.actionLayerTestIds));
    assert.ok(contract.actionLayerTestIds.length > 0);
    assert.ok(Number.isInteger(contract.visibleWordBudget));
    assert.ok(contract.visibleWordBudget > 0);
    assert.equal(contract.primaryButtonBudget.maxVisible, 1);
    assert.equal(contract.primaryButtonBudget.minVisible, 1);
  });
});

test("surface clarity contract keeps the key first-load guardrails explicit", () => {
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.today.collapsedDisclosureTestIds, []);
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.today.actionLayerTestIds, ["today-primary-cta"]);
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.today.visibleCountBudgets, [
    { testId: "planned-session-plan", maxVisible: 0, minVisible: 0 },
    { testId: "today-session-plan", maxVisible: 1, minVisible: 1 },
    { testId: "today-adjust-section", maxVisible: 1, minVisible: 0 },
  ]);
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.log.actionLayerTestIds, ["log-save-quick"]);
  assert.equal(SURFACE_CLARITY_CONTRACT.log.reasonTestId, "log-trust-row");
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.program.visibleCountBudgets, [
    { testId: "program-current-day-highlight", maxVisible: 0, minVisible: 0 },
    { testId: "planned-session-plan", maxVisible: 0, minVisible: 0 },
  ]);
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.log.collapsedDisclosureTestIds, [
    "log-advanced-fields",
    "log-day-review-disclosure",
    "log-recent-history-disclosure",
  ]);
  assert.deepEqual(SURFACE_CLARITY_CONTRACT.coach.collapsedDisclosureTestIds, [
    "coach-week-options-disclosure",
    "coach-recent-questions-disclosure",
  ]);
});

test("surface clarity contract shares the banned internal-language list with browser guards", () => {
  const patterns = CONSUMER_SURFACE_BANNED_REGEX_SOURCES.map((entry) => `${entry.source}/${entry.flags}`);
  assert.ok(patterns.includes("reviewer report/i"));
  assert.ok(patterns.includes("\\\\bcurrent basis\\\\b/i"));
  assert.ok(patterns.includes("\\\\bactive layers\\\\b/i"));
});
