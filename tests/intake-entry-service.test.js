const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeStarterMetrics,
  INTAKE_COPY_DECK,
  INTAKE_STAGE_CONTRACT,
  buildIntakeStarterGoalTypes,
  buildIntakeStarterMetricQuestions,
  inferIntakeStarterGoalTypeId,
  listFeaturedIntakeGoalTemplates,
} = require("../src/services/intake-entry-service.js");
const {
  buildGoalTemplateSelection,
} = require("../src/services/goal-template-catalog-service.js");

test("starter goal types lead with common goal families and keep custom as a deliberate final path", () => {
  const starterTypes = buildIntakeStarterGoalTypes();
  assert.deepEqual(starterTypes.map((item) => item.id), [
    "running",
    "strength",
    "fat_loss",
    "swim",
    "general_fitness",
    "custom",
  ]);
  assert.equal(starterTypes.at(-1)?.label, "Custom");
  assert.equal(starterTypes.at(-1)?.eyebrow, "Custom");
});

test("intake copy deck keeps the staged setup vocabulary concise and non-chatty", () => {
  assert.deepEqual(INTAKE_STAGE_CONTRACT.map((stage) => stage.label), ["Setup", "Details", "Build"]);
  assert.equal(INTAKE_COPY_DECK.shell.title, "Intake");
  assert.equal(INTAKE_COPY_DECK.summaryRail.title, "What week one will use");
  assert.equal(INTAKE_COPY_DECK.clarify.structuredToggle, "Structured");
  assert.equal(INTAKE_COPY_DECK.clarify.naturalToggle, "Free text");
  assert.match(INTAKE_COPY_DECK.shell.helper, /week one/i);
  assert.doesNotMatch(JSON.stringify(INTAKE_COPY_DECK), /coach note|tell me|guided|in your words|fallback|fewer clicks/i);
});

test("featured starter templates keep the common paths mapped to clear presets", () => {
  const running = listFeaturedIntakeGoalTemplates({ goalTypeId: "running" });
  const strength = listFeaturedIntakeGoalTemplates({ goalTypeId: "strength" });
  const fatLoss = listFeaturedIntakeGoalTemplates({ goalTypeId: "fat_loss" });

  assert.ok(running.some((template) => template.id === "run_first_5k"));
  assert.ok(running.some((template) => template.id === "half_marathon"));
  assert.ok(strength.some((template) => template.id === "bench_225"));
  assert.ok(fatLoss.some((template) => template.id === "lose_10_lb"));
  assert.ok(fatLoss.some((template) => template.id === "look_athletic_again"));
});

test("running starter metrics combine timeline and baseline in one adaptive step", () => {
  const questions = buildIntakeStarterMetricQuestions({
    goalTypeId: "running",
    selection: buildGoalTemplateSelection({ templateId: "half_marathon" }),
  });

  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0].fieldKeys, ["target_timeline"]);
  assert.deepEqual(questions[1].fieldKeys, [
    "current_run_frequency",
    "longest_recent_run",
    "recent_pace_baseline",
  ]);
});

test("applying starter metrics stores reusable completeness fields for the first draft", () => {
  const outcome = applyIntakeStarterMetrics({
    answers: {},
    goalTypeId: "swim",
    selection: buildGoalTemplateSelection({ templateId: "open_water_swim" }),
    values: {
      recent_swim_anchor: "1000 yd in 22:30",
      swim_access_reality: "open_water",
    },
  });

  assert.equal(outcome.isValid, true);
  assert.equal(outcome.answers.intake_completeness.fields.recent_swim_anchor.raw, "1000 yd in 22:30");
  assert.equal(outcome.answers.intake_completeness.fields.swim_access_reality.value, "open_water");
});

test("starter goal type inference keeps custom text out of the preset-first lanes", () => {
  assert.equal(inferIntakeStarterGoalTypeId({
    selection: buildGoalTemplateSelection({ templateId: "bench_225" }),
    answers: {},
  }), "strength");
  assert.equal(inferIntakeStarterGoalTypeId({
    selection: null,
    answers: { goal_intent: "Prepare for a firefighter physical test" },
  }), "custom");
});
