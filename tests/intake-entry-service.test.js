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

test("starter goal types expose broad families first and keep custom as the final fallback", () => {
  const starterTypes = buildIntakeStarterGoalTypes();
  assert.deepEqual(starterTypes.map((item) => item.id), [
    "endurance",
    "strength",
    "physique",
    "general_fitness",
    "re_entry",
    "hybrid",
    "custom",
  ]);
  assert.equal(starterTypes.at(-1)?.label, "Custom");
  assert.equal(starterTypes.at(-1)?.eyebrow, "Custom");
  starterTypes.forEach((goalType) => {
    assert.ok(goalType.helper.length <= 72, `Goal type helper is too long: ${goalType.id}`);
  });
});

test("intake copy deck stays concise and week-one oriented", () => {
  assert.deepEqual(INTAKE_STAGE_CONTRACT.map((stage) => stage.label), ["Start", "Details", "Your plan"]);
  assert.equal(INTAKE_COPY_DECK.shell.title, "Getting started");
  assert.equal(INTAKE_COPY_DECK.summaryRail.title, "What your first week is built on");
  assert.equal(INTAKE_COPY_DECK.clarify.structuredToggle, "Quick picks");
  assert.equal(INTAKE_COPY_DECK.clarify.naturalToggle, "Write it myself");
  assert.match(INTAKE_COPY_DECK.shell.helper, /first week/i);
  assert.doesNotMatch(JSON.stringify(INTAKE_COPY_DECK), /coach note|guided|fallback|deterministic/i);
});

test("featured starter templates map each flagship family to canonical structured intents", () => {
  const endurance = listFeaturedIntakeGoalTemplates({ goalTypeId: "endurance" });
  const strength = listFeaturedIntakeGoalTemplates({ goalTypeId: "strength" });
  const physique = listFeaturedIntakeGoalTemplates({ goalTypeId: "physique" });

  assert.ok(endurance.some((template) => template.id === "train_for_run_race"));
  assert.ok(endurance.some((template) => template.id === "swim_better"));
  assert.ok(endurance.some((template) => template.id === "ride_stronger"));
  assert.ok(strength.some((template) => template.id === "improve_big_lifts"));
  assert.ok(strength.some((template) => template.id === "train_with_limited_equipment"));
  assert.ok(physique.some((template) => template.id === "lose_body_fat"));
  assert.ok(physique.some((template) => template.id === "keep_strength_while_cutting"));
});

test("legacy starter type aliases still resolve to the new family lanes", () => {
  const running = listFeaturedIntakeGoalTemplates({ goalTypeId: "running" });
  const swim = listFeaturedIntakeGoalTemplates({ goalTypeId: "swim" });
  const fatLoss = listFeaturedIntakeGoalTemplates({ goalTypeId: "fat_loss" });

  assert.ok(running.some((template) => template.id === "train_for_run_race"));
  assert.ok(swim.some((template) => template.id === "swim_better"));
  assert.ok(fatLoss.some((template) => template.id === "lose_body_fat"));
});

test("featured starter templates stay balanced and free of awkward spotlight goals", () => {
  const bannedFeaturedIds = new Set(["bench_225", "marathon", "wedding_leaner"]);

  buildIntakeStarterGoalTypes()
    .filter((goalType) => goalType.id !== "custom")
    .forEach((goalType) => {
      const featured = listFeaturedIntakeGoalTemplates({ goalTypeId: goalType.id });

      assert.equal(featured.length, 5, `Expected five featured templates for ${goalType.id}`);
      featured.forEach((template) => {
        assert.ok(!bannedFeaturedIds.has(template.id), `Banned featured template surfaced: ${template.id}`);
        assert.ok(template.title.length <= 32, `Featured title is too long: ${template.id}`);
        assert.ok(template.helper.length <= 90, `Featured helper is too long: ${template.id}`);
      });
    });
});

test("run-race starter metrics combine race setup and baseline in one adaptive step", () => {
  const questions = buildIntakeStarterMetricQuestions({
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "half_marathon" }),
  });

  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0].fieldKeys, ["event_distance", "target_timeline"]);
  assert.deepEqual(questions[1].fieldKeys, [
    "current_run_frequency",
    "longest_recent_run",
    "recent_pace_baseline",
  ]);
});

test("applying starter metrics stores reusable completeness fields for the first draft", () => {
  const outcome = applyIntakeStarterMetrics({
    answers: {},
    goalTypeId: "endurance",
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
