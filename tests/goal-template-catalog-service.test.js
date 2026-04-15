const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalTemplateSelection,
  buildGoalTemplateSelectionsFromAnswers,
  findGoalTemplateSelectionForGoalText,
  listGoalTemplateCategories,
  listGoalTemplates,
} = require("../src/services/goal-template-catalog-service.js");

test("goal template catalog exposes an all-goals browse path and searchable presets", () => {
  const categories = listGoalTemplateCategories();
  assert.equal(categories[0]?.id, "all");
  assert.ok(categories.some((category) => category.id === "swim"));

  const allTemplates = listGoalTemplates({ categoryId: "all" });
  const swimTemplates = listGoalTemplates({ categoryId: "swim", query: "mile" });
  assert.ok(allTemplates.length > swimTemplates.length);
  assert.ok(swimTemplates.some((template) => template.id === "swim_faster_mile"));
});

test("goal template selections rebuild from answers and match specific goal text", () => {
  const answers = {
    goal_template_stack: [
      buildGoalTemplateSelection({ templateId: "bench_225" }),
      buildGoalTemplateSelection({ templateId: "get_leaner" }),
      buildGoalTemplateSelection({ customGoalText: "Play pickup basketball without calf flareups" }),
    ],
  };

  const selections = buildGoalTemplateSelectionsFromAnswers({ answers });
  assert.equal(selections.length, 3);
  assert.equal(selections[0].templateId, "bench_225");
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
