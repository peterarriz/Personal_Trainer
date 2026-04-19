const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyIntakeStarterMetrics,
  buildPendingIntakeStarterMetricQuestion,
  INTAKE_COPY_DECK,
  INTAKE_STAGE_CONTRACT,
  buildIntakeStarterMetricDraft,
  buildIntakeStarterFieldSchema,
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
  assert.deepEqual(
    questions[1].inputFields.map((field) => field.key),
    ["current_run_frequency", "longest_recent_run_value", "longest_recent_run_unit", "recent_pace_baseline"]
  );
});

test("applying starter metrics stores reusable completeness fields for the first draft", () => {
  const outcome = applyIntakeStarterMetrics({
    answers: {},
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "open_water_swim" }),
    values: {
      recent_swim_distance_value: "1000",
      recent_swim_distance_unit: "yd",
      recent_swim_time_minutes: "22",
      recent_swim_time_seconds: "30",
      swim_access_reality: "open_water",
    },
  });

  assert.equal(outcome.isValid, true);
  assert.equal(outcome.answers.intake_completeness.fields.recent_swim_anchor.raw, "1000 yd in 22:30");
  assert.equal(outcome.answers.intake_completeness.fields.swim_access_reality.value, "open_water");
});

test("structured running starter metrics convert split baseline inputs into canonical planning fields", () => {
  const outcome = applyIntakeStarterMetrics({
    answers: {},
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "half_marathon" }),
    values: {
      event_distance: "half_marathon",
      target_timeline: "October",
      current_run_frequency: "4",
      longest_recent_run_value: "8",
      longest_recent_run_unit: "miles",
    },
  });

  assert.equal(outcome.isValid, true);
  assert.equal(outcome.answers.intake_completeness.fields.current_run_frequency.value, 4);
  assert.equal(outcome.answers.intake_completeness.fields.longest_recent_run.raw, "8 miles");
});

test("pending-goal save can require only the target-defining starter question", () => {
  const pendingQuestion = buildPendingIntakeStarterMetricQuestion({
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "train_for_run_race" }),
  });
  const outcome = applyIntakeStarterMetrics({
    answers: {},
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "train_for_run_race" }),
    values: {
      event_distance: "half_marathon",
    },
    questions: [pendingQuestion],
    requireAll: true,
  });

  assert.equal(outcome.isValid, true);
  assert.equal(outcome.answers.intake_completeness.fields.event_distance.value, "half_marathon");
  assert.equal(outcome.answers.intake_completeness.fields.target_timeline, undefined);
  assert.equal(outcome.answers.intake_completeness.fields.current_run_frequency, undefined);
});

test("continuing intake can require the full starter detail set for a saved goal", () => {
  const outcome = applyIntakeStarterMetrics({
    answers: {},
    goalTypeId: "strength",
    selection: buildGoalTemplateSelection({ templateId: "improve_big_lifts" }),
    values: {
      lift_focus: "bench",
      lift_target_weight: "245",
      target_timeline: "12 weeks",
    },
    requireAll: true,
  });

  assert.equal(outcome.isValid, false);
  assert.match(outcome.fieldErrors.current_strength_baseline_weight || "", /recent weight|current load|estimated max/i);
});

test("only broad goals with a real specificity choice block save for one inline pick", () => {
  const runningPending = buildPendingIntakeStarterMetricQuestion({
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "train_for_run_race" }),
  });
  const liftPending = buildPendingIntakeStarterMetricQuestion({
    goalTypeId: "strength",
    selection: buildGoalTemplateSelection({ templateId: "improve_big_lifts" }),
  });
  const strengthPending = buildPendingIntakeStarterMetricQuestion({
    goalTypeId: "strength",
    selection: buildGoalTemplateSelection({ templateId: "get_stronger" }),
  });
  const hybridPending = buildPendingIntakeStarterMetricQuestion({
    goalTypeId: "hybrid",
    selection: buildGoalTemplateSelection({ templateId: "run_and_lift" }),
  });

  assert.deepEqual(runningPending?.inputFields.map((field) => field.key), ["event_distance"]);
  assert.deepEqual(liftPending?.inputFields.map((field) => field.key), ["lift_focus"]);
  assert.deepEqual(hybridPending?.inputFields.map((field) => field.key), ["hybrid_priority"]);
  assert.equal(strengthPending, null);
});

test("improve-big-lifts schema exposes numeric target and baseline fields on the first screen", () => {
  const schema = buildIntakeStarterFieldSchema({
    goalTypeId: "strength",
    selection: buildGoalTemplateSelection({ templateId: "improve_big_lifts" }),
  });

  assert.equal(schema.length, 2);
  assert.deepEqual(
    schema[0].fields.map((field) => field.key),
    ["lift_focus", "lift_target_weight", "lift_target_reps", "target_timeline"]
  );
  assert.deepEqual(
    schema[1].fields.map((field) => field.key),
    ["current_strength_baseline_weight", "current_strength_baseline_reps"]
  );
});

test("improve-big-lifts starter metrics frame target numbers as user-entered inputs, not fake prefilled values", () => {
  const questions = buildIntakeStarterMetricQuestions({
    goalTypeId: "strength",
    selection: buildGoalTemplateSelection({ templateId: "improve_big_lifts" }),
  });

  const targetQuestion = questions[0];
  const targetLoadField = targetQuestion.inputFields.find((field) => field.key === "lift_target_weight");
  const targetRepField = targetQuestion.inputFields.find((field) => field.key === "lift_target_reps");

  assert.equal(targetLoadField?.placeholder, "Type your target load");
  assert.match(targetLoadField?.helperText || "", /enter your own number here\. example: 225 lb\./i);
  assert.equal(targetRepField?.placeholder, "Type target reps");
  assert.match(targetRepField?.helperText || "", /enter your own rep target here\. example: 1 or 5\./i);
});

test("exact-goal presets prefill the starter draft with the specific target details", () => {
  const benchDraft = buildIntakeStarterMetricDraft({
    goalTypeId: "strength",
    selection: buildGoalTemplateSelection({ templateId: "bench_225" }),
    answers: {},
  });
  const halfDraft = buildIntakeStarterMetricDraft({
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "half_marathon" }),
    answers: {},
  });

  assert.equal(benchDraft.lift_focus, "bench");
  assert.equal(benchDraft.lift_target_weight, "225");
  assert.equal(halfDraft.event_distance, "half_marathon");
});

test("swim schema exposes structured distance, time, and access fields instead of one required free-text anchor", () => {
  const schema = buildIntakeStarterFieldSchema({
    goalTypeId: "endurance",
    selection: buildGoalTemplateSelection({ templateId: "swim_better" }),
  });

  assert.deepEqual(
    schema[0].fields.map((field) => field.key),
    [
      "recent_swim_distance_value",
      "recent_swim_distance_unit",
      "recent_swim_time_minutes",
      "recent_swim_time_seconds",
      "swim_access_reality",
      "goal_focus",
    ]
  );
});

test("hybrid schema keeps the strength baseline on the first screen for direct-build flows", () => {
  const schema = buildIntakeStarterFieldSchema({
    goalTypeId: "hybrid",
    selection: buildGoalTemplateSelection({ templateId: "run_and_lift" }),
  });

  assert.deepEqual(
    schema.map((section) => section.key),
    ["hybrid_profile", "strength_baseline"]
  );
  assert.deepEqual(
    schema[1].fields.map((field) => field.key),
    ["current_strength_baseline_weight", "current_strength_baseline_reps"]
  );
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
