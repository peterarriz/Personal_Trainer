const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalTemplateSelection,
  buildGoalTemplateSelectionsFromAnswers,
  findGoalTemplateById,
  findGoalTemplateSelectionForGoalText,
  listGoalSpecificityPresets,
  listGoalTemplateCategories,
  listGoalTemplates,
} = require("../src/services/goal-template-catalog-service.js");
const {
  buildIntakeStarterGoalTypes,
  listFeaturedIntakeGoalTemplates,
} = require("../src/services/intake-entry-service.js");

test("goal template catalog exposes a broad all-goals path and still honors legacy category aliases", () => {
  const categories = listGoalTemplateCategories();
  assert.equal(categories[0]?.id, "all");
  assert.ok(categories.some((category) => category.id === "endurance"));

  const allTemplates = listGoalTemplates({ categoryId: "all" });
  const swimTemplates = listGoalTemplates({ categoryId: "swim", query: "mile" });
  assert.ok(allTemplates.length > swimTemplates.length);
  assert.ok(swimTemplates.some((template) => template.id === "swim_better"));
});

test("goal template selections rebuild from answers and preserve canonical ids plus legacy aliases", () => {
  const answers = {
    goal_template_stack: [
      buildGoalTemplateSelection({ templateId: "bench_225" }),
      buildGoalTemplateSelection({ templateId: "get_leaner" }),
      buildGoalTemplateSelection({ customGoalText: "Play pickup basketball without calf flareups" }),
    ],
  };

  const selections = buildGoalTemplateSelectionsFromAnswers({ answers });
  assert.equal(selections.length, 3);
  assert.equal(selections[0].templateId, "improve_big_lifts");
  assert.equal(selections[0].legacyTemplateId, "bench_225");
  assert.equal(findGoalTemplateSelectionForGoalText({
    answers,
    goalText: "Get leaner",
    index: 1,
  })?.templateId, "get_leaner");
  assert.equal(findGoalTemplateSelectionForGoalText({
    answers,
    goalText: "Play pickup basketball without calf flareups",
    index: 2,
  })?.entryMode, "custom");
});

test("every non-all goal category has broad coverage and plain-language browse copy", () => {
  const categories = listGoalTemplateCategories();
  const visibleCategories = categories.filter((category) => category.id !== "all");

  assert.equal(visibleCategories.length, 6);

  visibleCategories.forEach((category) => {
    const templates = listGoalTemplates({ categoryId: category.id });
    const ids = new Set(templates.map((template) => template.id));

    assert.ok(templates.length >= 4, `Expected at least four templates in ${category.id}`);
    assert.equal(ids.size, templates.length, `Expected unique template ids in ${category.id}`);
    assert.ok(category.label.length <= 24, `Category label is too long: ${category.label}`);
    assert.ok(category.helper.length <= 80, `Category helper is too long: ${category.id}`);
    assert.doesNotMatch(`${category.label} ${category.helper}`, /anchor confidence|placeholder|basis|layer|taxonomy/i);
    templates.forEach((template) => {
      assert.equal(template.categoryId, category.id);
      assert.ok(template.title.length <= 36, `Template title is too long: ${template.id}`);
      assert.ok(template.helper.length <= 110, `Template helper is too long: ${template.id}`);
    });
  });
});

test("featured goal picks stay discoverable in their category lanes and avoid banned spotlight goals", () => {
  const bannedFeaturedIds = new Set(["bench_225", "marathon", "wedding_leaner"]);

  buildIntakeStarterGoalTypes()
    .filter((goalType) => goalType.id !== "custom")
    .forEach((goalType) => {
      const categoryTemplates = listGoalTemplates({ categoryId: goalType.categoryId });
      const categoryIds = new Set(categoryTemplates.map((template) => template.id));
      const featured = listFeaturedIntakeGoalTemplates({ goalTypeId: goalType.id });

      assert.equal(featured.length, 5, `Expected exactly five featured templates for ${goalType.id}`);
      featured.forEach((template) => {
        const queryToken = String(template.title || template.summary || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .find((token) => token.length >= 3);
        const queryMatches = listGoalTemplates({
          categoryId: goalType.categoryId,
          query: queryToken || template.id,
        });

        assert.ok(!bannedFeaturedIds.has(template.id), `Banned featured template surfaced: ${template.id}`);
        assert.ok(categoryIds.has(template.id), `Featured template is missing from category browse: ${template.id}`);
        assert.ok(queryMatches.some((candidate) => candidate.id === template.id), `Featured template is not discoverable by query: ${template.id}`);
      });
    });
});

test("high-visibility goal templates keep stable copy, metrics, and legacy-specific defaults", () => {
  const bench = findGoalTemplateById("bench_225");
  const tenK = findGoalTemplateById("run_10k");
  const toneUp = findGoalTemplateById("tone_up");

  assert.equal(bench?.primaryMetric?.key, "bench_press_weight");
  assert.equal(bench?.id, "improve_big_lifts");
  assert.equal(tenK?.categoryId, "endurance");
  assert.equal(tenK?.specificityDefaults?.event_distance, "10k");
  assert.equal(toneUp?.planningCategory, "body_comp");
  assert.doesNotMatch(JSON.stringify([bench, tenK, toneUp]), /anchor confidence|placeholder|deterministic/i);
});

test("specificity presets expose exact-goal options beneath broad paths and keep distinct saved ids", () => {
  const runRacePresets = listGoalSpecificityPresets({ templateId: "train_for_run_race" });
  const bigLiftPresets = listGoalSpecificityPresets({ templateId: "improve_big_lifts" });
  const halfMarathonSelection = buildGoalTemplateSelection({ templateId: "half_marathon" });
  const broadRunSelection = buildGoalTemplateSelection({ templateId: "train_for_run_race" });

  assert.ok(runRacePresets.some((preset) => preset.id === "half_marathon"));
  assert.ok(runRacePresets.some((preset) => preset.id === "marathon"));
  assert.ok(bigLiftPresets.some((preset) => preset.id === "bench_225"));
  assert.equal(halfMarathonSelection?.legacyTemplateId, "half_marathon");
  assert.notEqual(halfMarathonSelection?.id, broadRunSelection?.id);
});
