import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLaunchPersonaCoverage,
  generateLaunchSimulationPersonas,
  LAUNCH_SIMULATION_PERSONA_COUNT,
  LAUNCH_SIMULATION_WEEKS,
} from "../src/services/synthetic-athlete-lab/launch-persona-generator.js";

test("launch persona generator emits 1,000 unique personas with required quota coverage", () => {
  const personas = generateLaunchSimulationPersonas();
  const coverage = buildLaunchPersonaCoverage(personas);

  assert.equal(personas.length, LAUNCH_SIMULATION_PERSONA_COUNT);
  assert.equal(new Set(personas.map((persona) => persona.id)).size, LAUNCH_SIMULATION_PERSONA_COUNT);
  assert.equal(new Set(personas.map((persona) => persona.name)).size, LAUNCH_SIMULATION_PERSONA_COUNT);
  assert.ok(personas.every((persona) => persona.primaryGoal));
  assert.ok(personas.every((persona) => typeof persona.reviewLens === "string" && persona.reviewLens.length > 0));
  assert.ok(personas.every((persona) => Array.isArray(persona.fiveYearLifecycleEvents)));
  assert.ok(personas.every((persona) => persona.fiveYearLifecycleEvents.every((event) => Number(event.week) >= 1 && Number(event.week) <= LAUNCH_SIMULATION_WEEKS)));
  assert.ok(Object.values(coverage.quotaChecks).every((entry) => entry.meetsMinimum));
  assert.ok(Object.values(coverage.lensTargetChecks).every((entry) => entry.meetsMinimum));
});

test("launch persona generator covers the major goal domains, equipment realities, and friction types", () => {
  const personas = generateLaunchSimulationPersonas();
  const coverage = buildLaunchPersonaCoverage(personas);

  [
    "running",
    "swimming",
    "strength",
    "hybrid",
    "body_comp",
    "powerlifting",
    "tactical",
    "travel",
    "medical",
  ].forEach((goalCategory) => {
    assert.ok(Number(coverage.goalCategoryCounts[goalCategory] || 0) > 0, `expected goal coverage for ${goalCategory}`);
  });

  [
    "full_gym",
    "mixed",
    "minimal",
  ].forEach((equipmentAccess) => {
    assert.ok(Number(coverage.equipmentAccessCounts[equipmentAccess] || 0) > 0, `expected equipment coverage for ${equipmentAccess}`);
  });

  [
    "editsGoalBeforeConfirm",
    "removesAndReplacesGoal",
    "customGoalEntry",
    "conflictingGoals",
    "unrealisticTimeline",
    "localOnlyThenTestsSync",
  ].forEach((frictionKey) => {
    assert.ok(Number(coverage.frictionCounts[frictionKey] || 0) > 0, `expected friction coverage for ${frictionKey}`);
  });
});
