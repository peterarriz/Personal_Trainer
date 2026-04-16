const { assertSyntheticLabSafeEnvironment } = require("../src/services/synthetic-athlete-lab/env-guard.js");
const {
  runSyntheticAthleteLab,
  SYNTHETIC_ATHLETE_CATALOG_MODES,
  SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS,
  SYNTHETIC_ATHLETE_RELEASE_GATE_SCHEMA_VERSION,
} = require("../src/services/synthetic-athlete-lab/runner.js");
const {
  SYNTHETIC_ATHLETE_PERSONAS,
} = require("../src/services/synthetic-athlete-lab/persona-catalog.js");

assertSyntheticLabSafeEnvironment(process.env);

const args = process.argv.slice(2);
const personaArgIndex = args.indexOf("--persona");
const weeksArgIndex = args.indexOf("--weeks");
const catalogArgIndex = args.indexOf("--catalog");
const countArgIndex = args.indexOf("--count");
const selectedPersonaId = personaArgIndex >= 0 ? String(args[personaArgIndex + 1] || "").trim() : "";
const selectedWeeks = weeksArgIndex >= 0 ? Number(args[weeksArgIndex + 1] || 0) : 0;
const selectedCount = countArgIndex >= 0 ? Number(args[countArgIndex + 1] || 0) : 0;
const requestedCatalogMode = catalogArgIndex >= 0 ? String(args[catalogArgIndex + 1] || "").trim().toLowerCase() : "";

const catalogModeMap = {
  focus: SYNTHETIC_ATHLETE_CATALOG_MODES.focus,
  quick: SYNTHETIC_ATHLETE_CATALOG_MODES.focus,
  "release-gate": SYNTHETIC_ATHLETE_CATALOG_MODES.releaseGate,
  matrix: SYNTHETIC_ATHLETE_CATALOG_MODES.releaseGate,
  archetype: SYNTHETIC_ATHLETE_CATALOG_MODES.releaseGate,
  release_gate: SYNTHETIC_ATHLETE_CATALOG_MODES.releaseGate,
  releasegate: SYNTHETIC_ATHLETE_CATALOG_MODES.releaseGate,
  expanded: SYNTHETIC_ATHLETE_CATALOG_MODES.expanded,
  full: SYNTHETIC_ATHLETE_CATALOG_MODES.expanded,
  all: SYNTHETIC_ATHLETE_CATALOG_MODES.all,
};
const selectedCatalogMode = catalogModeMap[requestedCatalogMode] || SYNTHETIC_ATHLETE_CATALOG_MODES.expanded;

const selectedPersonas = selectedPersonaId
  ? SYNTHETIC_ATHLETE_PERSONAS.filter((persona) => persona.id === selectedPersonaId)
  : [];

if (selectedPersonaId && selectedPersonas.length === 0) {
  console.error(JSON.stringify({
    error: `Unknown persona id: ${selectedPersonaId}`,
    availableReleaseGatePersonas: SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS,
  }, null, 2));
  process.exit(1);
}

const summarizeFailure = (failure = {}) => ({
  severity: failure.severity,
  clusterId: failure.clusterId,
  message: failure.message,
  stepRef: failure.stepRef,
  screenshots: failure.screenshots || [],
  likelyFiles: failure.likelyFiles || [],
  specRefs: failure.specRefs || [],
  recommendedFixCluster: failure.recommendedFixCluster || "",
});

const summarizePersona = (result = {}) => ({
  personaId: result.personaId,
  name: result.name,
  simulationWeeks: result.simulationWeeks,
  overallScore: result.overallScore,
  overallPass: result.overallPass,
  cohortTags: result.cohortTags || [],
  releaseDimensionScores: result.releaseDimensionScores || {},
  supportTierExpected: result.supportTierExpected,
  supportTierActual: result.supportTierActual,
  categoryScores: result.categoryScores,
  severeBlockers: (result.severeBlockers || []).map(summarizeFailure),
  mediumIssues: (result.mediumIssues || []).map(summarizeFailure),
  recommendedFixClusters: result.recommendedFixClusters || [],
});

const report = runSyntheticAthleteLab({
  personas: selectedPersonas.length ? selectedPersonas : null,
  weeks: Number.isFinite(selectedWeeks) && selectedWeeks > 0 ? selectedWeeks : undefined,
  catalogMode: selectedPersonas.length ? SYNTHETIC_ATHLETE_CATALOG_MODES.focus : selectedCatalogMode,
  targetPersonaCount: Number.isFinite(selectedCount) && selectedCount > 0 ? selectedCount : undefined,
});

console.log(JSON.stringify({
  schemaVersion: report.schemaVersion || SYNTHETIC_ATHLETE_RELEASE_GATE_SCHEMA_VERSION,
  summary: report.summary,
  releaseGate: report.releaseGate,
  catalog: {
    availablePersonas: SYNTHETIC_ATHLETE_PERSONAS.length,
    selectedCatalogMode: report.summary.catalogMode,
    selectedPersonaCount: report.personaResults.length,
    requestedCount: Number.isFinite(selectedCount) && selectedCount > 0 ? selectedCount : null,
    releaseGatePersonas: SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS,
  },
  catalogCoverage: report.catalogCoverage,
  releaseDimensionSummary: report.releaseDimensionSummary,
  cohortCoverage: report.cohortCoverage,
  fairnessSignals: report.fairnessSignals,
  personaResults: report.personaResults.map(summarizePersona),
  releaseGateMatrix: report.releaseGateMatrix,
  topClusters: report.rootCauseClusters.slice(0, 12),
  browserProbes: report.browserProbes,
}, null, 2));
