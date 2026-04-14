const { assertSyntheticLabSafeEnvironment } = require("../src/services/synthetic-athlete-lab/env-guard.js");
const {
  runSyntheticAthleteLab,
  SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS,
} = require("../src/services/synthetic-athlete-lab/runner.js");
const {
  SYNTHETIC_ATHLETE_PERSONAS,
} = require("../src/services/synthetic-athlete-lab/persona-catalog.js");

assertSyntheticLabSafeEnvironment(process.env);

const args = process.argv.slice(2);
const personaArgIndex = args.indexOf("--persona");
const weeksArgIndex = args.indexOf("--weeks");
const selectedPersonaId = personaArgIndex >= 0 ? String(args[personaArgIndex + 1] || "").trim() : "";
const selectedWeeks = weeksArgIndex >= 0 ? Number(args[weeksArgIndex + 1] || 0) : 0;

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

const report = runSyntheticAthleteLab({
  personas: selectedPersonas.length ? selectedPersonas : null,
  weeks: Number.isFinite(selectedWeeks) && selectedWeeks > 0 ? selectedWeeks : undefined,
});
const focusPersona = report.personaResults[0] || null;

console.log(JSON.stringify({
  summary: report.summary,
  focusPersona: focusPersona ? {
    personaId: focusPersona.personaId,
    name: focusPersona.name,
    simulationWeeks: focusPersona.simulationWeeks,
    overallScore: focusPersona.overallScore,
    overallPass: focusPersona.overallPass,
    categoryScores: focusPersona.categoryScores,
    severeBlockers: focusPersona.severeBlockers,
    mediumIssues: focusPersona.mediumIssues,
    recommendedFixClusters: focusPersona.recommendedFixClusters,
  } : null,
  releaseGateMatrix: report.releaseGateMatrix,
  topClusters: report.clusters.slice(0, 8),
  browserProbes: report.browserProbes,
}, null, 2));
