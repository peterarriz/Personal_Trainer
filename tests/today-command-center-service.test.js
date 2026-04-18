const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTodayCommandCenterModel,
  TODAY_COMMAND_CENTER_RULES,
} = require("../src/services/today-command-center-service.js");

test("run-only days stay single-lane and keep the action simple", () => {
  const model = buildTodayCommandCenterModel({
    training: {
      type: "easy-run",
      label: "Easy run",
      run: { t: "Easy", d: "35 min" },
    },
    summary: {
      structure: "Easy: 35 min",
      purpose: "Build aerobic work without burning recovery.",
    },
    changeSummary: "This session stays on plan today.",
  });

  assert.equal(model.dayKind, "run_only");
  assert.equal(model.baseDayKind, "run_only");
  assert.equal(model.shouldMergeLanes, false);
  assert.equal(model.primaryActionLabel, "Log today");
  assert.match(model.heroSupportLine, /35 min|aerobic/i);
});

test("strength-only days stay strength-first instead of reading as hybrid", () => {
  const model = buildTodayCommandCenterModel({
    training: {
      type: "strength+prehab",
      label: "Strength A",
      strSess: "A",
      strengthDose: "40 min strength",
    },
    summary: {
      structure: "Strength A for 40 min",
      purpose: "Build full-body strength with repeatable main lifts and accessories.",
      sessionPlan: {
        sections: [
          { key: "strength", rows: [{ title: "Front squat" }] },
        ],
      },
    },
    changeSummary: "This strength session stays on plan today.",
  });

  assert.equal(model.dayKind, "strength_only");
  assert.equal(model.baseDayKind, "strength_only");
  assert.equal(model.shouldMergeLanes, false);
  assert.equal(model.statusLabel, "Strength day");
  assert.match(model.heroSupportLine, /strength/i);
});

test("hybrid days merge run and strength only when both lanes are really present", () => {
  const model = buildTodayCommandCenterModel({
    training: {
      type: "run+strength",
      label: "Run + strength",
      run: { t: "Easy", d: "30 min" },
      strSess: "B",
    },
    summary: {
      sessionPlan: {
        sections: [
          { key: "run", rows: [{ title: "Easy run" }] },
          { key: "strength", rows: [{ title: "Bench press" }] },
        ],
      },
    },
    changeSummary: "Both parts of the session stay on plan today.",
  });

  assert.equal(model.dayKind, "hybrid");
  assert.equal(model.baseDayKind, "hybrid");
  assert.equal(model.shouldMergeLanes, true);
  assert.equal(model.statusLabel, "Hybrid day");
  assert.match(model.heroSupportLine, /run first/i);
});

test("rest days stay reassuring and swap the primary action to recovery logging", () => {
  const model = buildTodayCommandCenterModel({
    training: {
      type: "rest",
      label: "Recovery",
    },
    summary: {
      purpose: "Absorb work and protect the next productive session.",
    },
  });

  assert.equal(model.dayKind, "rest");
  assert.equal(model.baseDayKind, "rest");
  assert.equal(model.primaryActionLabel, "Log recovery");
  assert.match(model.heroSupportLine, /recover|light|reset/i);
  assert.match(model.adaptationSummary, /stays light|productive session/i);
});

test("reduced-load days keep the underlying session but explain the lighter version plainly", () => {
  const model = buildTodayCommandCenterModel({
    training: {
      type: "hard-run",
      label: "Tempo",
      run: { t: "Tempo", d: "30 min tempo" },
    },
    summary: {
      structure: "Tempo: 30 min",
    },
    readinessState: "reduced_load",
    changeSummary: "",
    nextStep: "",
  });

  assert.equal(model.dayKind, "reduced_load");
  assert.equal(model.baseDayKind, "run_only");
  assert.equal(model.statusLabel, "Reduced load");
  assert.match(model.adaptationSummary, /load came down/i);
  assert.match(model.nextStepLine, /controlled|log/i);
});

test("command-center rules stay defined for every required Today mode", () => {
  assert.ok(TODAY_COMMAND_CENTER_RULES.strength_only);
  assert.ok(TODAY_COMMAND_CENTER_RULES.run_only);
  assert.ok(TODAY_COMMAND_CENTER_RULES.hybrid);
  assert.ok(TODAY_COMMAND_CENTER_RULES.rest);
  assert.ok(TODAY_COMMAND_CENTER_RULES.reduced_load);
});
