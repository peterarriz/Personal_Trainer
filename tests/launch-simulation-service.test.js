import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLaunchSimulationArtifacts,
  buildLaunchSimulationWeekSequence,
  refreshLaunchSimulationFromExisting,
  runLaunchSimulation,
} from "../src/services/synthetic-athlete-lab/launch-simulation-service.js";

test("launch simulation service emits machine-readable outputs, issue clusters, and markdown artifacts", () => {
  const simulation = runLaunchSimulation({
    personaCount: 40,
    weeks: 52,
    mode: "quick",
  });

  assert.equal(simulation.mode, "quick");
  assert.equal(simulation.personas.length, 40);
  assert.equal(simulation.deterministicReport.summary.personaCount, 40);
  assert.equal(simulation.deterministicReport.summary.simulationWeeks, 52);
  assert.ok(Array.isArray(simulation.issueClusters));
  assert.ok(simulation.issueClusters.length > 0);
  assert.ok(typeof simulation.verdict.verdict === "string" && simulation.verdict.verdict.length > 0);
  assert.ok(typeof simulation.metrics.intakeCompletionRate === "number");
  assert.ok(typeof simulation.metrics.postIntakePlanCreationRate === "number");
  assert.ok(typeof simulation.metrics.averageSatisfaction === "number");
  assert.ok(Array.isArray(simulation.metrics.launchPersonaOutcomes));
  assert.equal(simulation.metrics.launchPersonaOutcomes.length, 40);
  assert.ok(simulation.artifacts.launchReportMarkdown.includes("# Launch Simulation Report"));
  assert.ok(simulation.artifacts.topPersonaNarrativesMarkdown.includes("# Top Persona Narratives"));
  assert.ok(simulation.artifacts.fixPlanMarkdown.includes("# Fix Plan"));
});

test("launch simulation builds a compressed long-horizon checkpoint sequence for five-year runs", () => {
  const simulation = runLaunchSimulation({
    personaCount: 24,
    weeks: 260,
    mode: "full",
  });

  assert.equal(simulation.deterministicReport.summary.simulationWeeks, 260);
  assert.equal(simulation.deterministicReport.summary.compressedLongitudinalModel, true);
  assert.ok(simulation.deterministicReport.summary.checkpointWeekCount < 260);
  assert.ok(simulation.deterministicReport.summary.checkpointWeekCount >= 30);
  assert.ok(buildLaunchSimulationWeekSequence({
    effectiveWeeks: 260,
    personas: simulation.personas,
  }).includes(244));
});

test("launch simulation artifacts serializer keeps the required durable files diffable", () => {
  const simulation = runLaunchSimulation({
    personaCount: 12,
    weeks: 26,
    mode: "quick",
  });
  const artifacts = buildLaunchSimulationArtifacts({
    personas: simulation.personas,
    personaCoverage: simulation.personaCoverage,
    results: simulation,
    issueClusters: simulation.issueClusters,
  });

  assert.doesNotThrow(() => JSON.parse(artifacts.personasJson));
  assert.doesNotThrow(() => JSON.parse(artifacts.personaCoverageJson));
  assert.doesNotThrow(() => JSON.parse(artifacts.resultsJson));
  assert.doesNotThrow(() => JSON.parse(artifacts.issueClustersJson));
  const parsedResults = JSON.parse(artifacts.resultsJson);
  assert.equal(Array.isArray(parsedResults.personas), false);
  assert.equal(Array.isArray(parsedResults.deterministicReport.personaResults), true);
  assert.ok(parsedResults.deterministicReport.personaResults[0].timelineHighlights.length <= 10);
  assert.match(artifacts.launchReportMarkdown, /Verdict/i);
  assert.match(artifacts.topPersonaNarrativesMarkdown, /## 1\./);
  assert.match(artifacts.fixPlanMarkdown, /Impact score/i);
});

test("launch simulation can refresh an existing deterministic run with deployed browser probes", () => {
  const simulation = runLaunchSimulation({
    personaCount: 18,
    weeks: 52,
    mode: "quick",
  });
  const refreshed = refreshLaunchSimulationFromExisting({
    existingResults: simulation,
    browserResults: {
      mode: "deployed_smoke_probe",
      targetPersonaCount: 18,
      attemptedPersonaCount: 2,
      passedPersonaCount: 2,
      runs: [
        { ok: true, accessibilityChecked: false, title: "desktop probe" },
        { ok: true, accessibilityChecked: true, title: "mobile probe" },
      ],
    },
    deployedReachability: {
      reachable: true,
      baseUrl: "https://example.com",
      runs: [],
    },
    mode: "deployed",
  });

  assert.equal(refreshed.mode, "deployed");
  assert.equal(refreshed.browserSummary.attemptedPersonaCount, 2);
  assert.equal(refreshed.deployedReachability.reachable, true);
  assert.match(refreshed.artifacts.launchReportMarkdown, /Browser mode: deployed_smoke_probe/i);
});

test("launch simulation honors an explicit browser target count for representative local persona chunks", () => {
  const simulation = runLaunchSimulation({
    personaCount: 18,
    weeks: 26,
    mode: "full",
    browserTargetPersonaCount: 6,
    browserResults: {
      mode: "browser_persona_chunk_local",
      targetPersonaCount: 6,
      attemptedPersonaCount: 6,
      passedPersonaCount: 5,
      runs: [
        { ok: true, accessibilityChecked: false, title: "persona 1" },
        { ok: true, accessibilityChecked: false, title: "persona 2" },
        { ok: true, accessibilityChecked: false, title: "persona 3" },
        { ok: true, accessibilityChecked: false, title: "persona 4" },
        { ok: true, accessibilityChecked: false, title: "persona 5" },
        { ok: false, accessibilityChecked: false, title: "persona 6" },
      ],
    },
  });

  assert.equal(simulation.browserSummary.targetPersonaCount, 6);
  assert.equal(simulation.browserSummary.attemptedPersonaCount, 6);
  assert.equal(simulation.browserSummary.complete, true);
  assert.equal(simulation.browserSummary.releaseGateIncomplete, false);
});
