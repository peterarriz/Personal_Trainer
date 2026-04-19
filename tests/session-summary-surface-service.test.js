const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCanonicalPlanSurfaceModel,
} = require("../src/services/plan-day-surface-service.js");
const {
  buildSharedSessionSummaryModel,
} = require("../src/services/session-summary-surface-service.js");
const {
  buildTodayCommandCenterModel,
} = require("../src/services/today-command-center-service.js");

test("shared session summary keeps Today and Program on the same current-day title and rationale", () => {
  const surfaceModel = buildCanonicalPlanSurfaceModel({
    surface: "today",
    training: {
      type: "hard-run",
      label: "Tempo",
      run: { t: "Tempo", d: "30 min tempo" },
    },
    week: {
      changeSummary: {
        surfaceLine: "Today shifts a little shorter so the quality still lands cleanly.",
      },
    },
  });
  const commandCenterModel = buildTodayCommandCenterModel({
    training: surfaceModel.training,
    summary: surfaceModel.display,
    changeSummary: "Today shifts a little shorter so the quality still lands cleanly.",
    explanation: surfaceModel.explanationModel,
    nextStep: "Finish the tempo, then log it.",
  });

  const todaySummary = buildSharedSessionSummaryModel({
    surfaceModel,
    commandCenterModel,
  });
  const programSummary = buildSharedSessionSummaryModel({
    surfaceModel,
    commandCenterModel,
    sessionContextLine: "Thu • Tempo • 30 min tempo. This is today's place inside the current chapter.",
  });

  assert.equal(todaySummary.title, "Tempo");
  assert.equal(programSummary.title, todaySummary.title);
  assert.equal(programSummary.rationaleLine, todaySummary.rationaleLine);
  assert.match(programSummary.programContextLine, /current chapter/i);
});

test("hybrid shared session summary keeps the day intentional instead of reading like stacked chores", () => {
  const surfaceModel = buildCanonicalPlanSurfaceModel({
    surface: "today",
    training: {
      type: "run+strength",
      label: "Run + strength",
      run: { t: "Easy", d: "30 min" },
      strSess: "B",
      strengthDose: "30-40 min strength",
    },
    week: {
      changeSummary: {
        surfaceLine: "Both parts stay paired so the week does not peak both lanes at once.",
      },
    },
  });
  const commandCenterModel = buildTodayCommandCenterModel({
    training: surfaceModel.training,
    summary: surfaceModel.display,
    changeSummary: "Both parts stay paired so the week does not peak both lanes at once.",
    explanation: surfaceModel.explanationModel,
    nextStep: "Run first, then finish the strength work.",
  });

  const summary = buildSharedSessionSummaryModel({
    surfaceModel,
    commandCenterModel,
  });

  assert.equal(summary.dayKind, "hybrid");
  assert.ok(summary.metaItems.includes("Run + strength"));
  assert.match(summary.specialLine, /hybrid day/i);
  assert.match(summary.rationaleLine, /paired|both lanes/i);
});

test("rest-day shared session summary stays coached instead of sounding empty", () => {
  const surfaceModel = buildCanonicalPlanSurfaceModel({
    surface: "today",
    training: {
      type: "rest",
      label: "Recovery",
    },
    week: {
      changeSummary: {
        surfaceLine: "Recovery stays light today so the next key session lands better.",
      },
    },
  });
  const commandCenterModel = buildTodayCommandCenterModel({
    training: surfaceModel.training,
    summary: surfaceModel.display,
    changeSummary: "Recovery stays light today so the next key session lands better.",
    explanation: surfaceModel.explanationModel,
    nextStep: "Keep the day light and log recovery if needed.",
  });

  const summary = buildSharedSessionSummaryModel({
    surfaceModel,
    commandCenterModel,
  });

  assert.equal(summary.dayKind, "rest");
  assert.match(summary.rationaleLine, /recovery stays light|next key session/i);
  assert.match(summary.programContextLine, /recovery slot|not an empty day/i);
});
