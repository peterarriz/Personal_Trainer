const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildProgramCatalogViewModel,
  createDefaultProgramSelectionState,
  createProgramInstance,
  createStyleSelection,
  getProgramDefinitionById,
  getStyleDefinitionById,
  listProgramDefinitions,
  normalizeProgramsSelectionState,
  PROGRAM_FIDELITY_MODES,
} = require("../src/services/program-catalog-service.ts");

test("program catalog exposes seeded programs and styles", () => {
  const programs = listProgramDefinitions();
  const foundation = getProgramDefinitionById("program_foundation_training");
  const style = getStyleDefinitionById("style_athletic_recomp");

  assert.ok(programs.length >= 8);
  assert.equal(foundation.displayName, "Foundation Training");
  assert.equal(style.displayName, "Athletic Recomp");
});

test("default programs state is stable and normalizes missing values", () => {
  const defaults = createDefaultProgramSelectionState();
  const normalized = normalizeProgramsSelectionState({ activeProgramInstance: { programDefinitionId: "program_foundation_training" } });

  assert.deepEqual(defaults.selectionHistory, []);
  assert.equal(normalized.activeProgramInstance.programDefinitionId, "program_foundation_training");
  assert.deepEqual(normalized.selectionHistory, []);
  assert.equal(normalized.activeStyleSelection, null);
});

test("catalog view model marks active program and style", () => {
  const foundation = getProgramDefinitionById("program_foundation_training");
  const athleticRecomp = getStyleDefinitionById("style_athletic_recomp");
  const programInstance = createProgramInstance({
    programDefinition: foundation,
    fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
    athleteProfile: { goals: [] },
  });
  const styleSelection = createStyleSelection({
    styleDefinition: athleticRecomp,
  });

  const viewModel = buildProgramCatalogViewModel({
    activeProgramInstance: programInstance,
    activeStyleSelection: styleSelection,
  });

  const activeProgramCard = viewModel.programSections.flatMap((section) => section.items).find((item) => item.id === foundation.id);
  const activeStyleCard = viewModel.styleSections.flatMap((section) => section.items).find((item) => item.id === athleticRecomp.id);

  assert.equal(activeProgramCard.isActive, true);
  assert.equal(activeStyleCard.isActive, true);
});
