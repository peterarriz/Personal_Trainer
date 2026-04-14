const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getProgramDefinitionById,
  getStyleDefinitionById,
} = require("../src/services/program-catalog-service.ts");
const {
  buildStyleOverlayPreview,
  isStyleCompatibleWithProgram,
  resolveStyleOverlayImpact,
} = require("../src/services/style-overlay-service.ts");

test("style overlay preview stays display-oriented and anchored to the selected style", () => {
  const styleDefinition = getStyleDefinitionById("style_fight_camp_lean");
  const preview = buildStyleOverlayPreview({
    styleDefinition,
  });

  assert.equal(preview.title, "Fight-Camp Lean");
  assert.ok(/conditioning/i.test(preview.biasSummary));
  assert.ok(preview.emphasisBits.length >= 2);
});

test("style compatibility rejects known incompatible program combinations", () => {
  const styleDefinition = getStyleDefinitionById("style_golden_era_hypertrophy");
  const runningProgram = getProgramDefinitionById("program_marathon_base");

  assert.equal(
    isStyleCompatibleWithProgram({
      styleDefinition,
      programDefinition: runningProgram,
    }),
    false
  );
});

test("overlay impact preserves hard rules when a style is layered onto a program", () => {
  const styleDefinition = getStyleDefinitionById("style_athletic_recomp");
  const programDefinition = getProgramDefinitionById("program_foundation_training");
  const impact = resolveStyleOverlayImpact({
    styleDefinition,
    programDefinition,
  });

  assert.ok(impact.lockedRules.some((line) => line.includes("Foundation Training")));
  assert.ok(impact.adaptableElements.some((line) => /exercise selection/i.test(line)));
});
