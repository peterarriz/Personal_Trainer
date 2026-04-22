const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTodayTrustModel,
  buildPlanWeekTrustModel,
  buildPlanDayTrustModel,
  buildLogTrustModel,
} = require("../src/services/compact-trust-service.js");

test("today trust model favors decision-relevant explicit and inferred factors", () => {
  const model = buildTodayTrustModel({
    surfaceModel: {
      explanationCategory: "adaptive_personalization",
    },
    adjustments: {
      time: "short",
      recovery: "low_energy",
      soreness: "legs",
    },
    environmentSelection: {
      scope: "today",
      mode: "Home",
    },
    family: "hybrid",
  });

  const labels = model.chips.map((chip) => chip.label);
  assert.ok(labels.includes("Time cap"));
  assert.ok(labels.includes("Low recovery"));
  assert.ok(labels.includes("Sore legs"));
  assert.ok(labels.includes("Home setup") || labels.includes("Recent workouts") || labels.includes("Goal balance"));
  assert.ok(labels.length <= 4);
});

test("plan trust models distinguish committed, adaptive, and preview states cleanly", () => {
  const weekModel = buildPlanWeekTrustModel({
    currentDay: {
      isToday: true,
      status: { key: "upcoming" },
    },
    previewWeek: {
      days: [{ dayKey: 1 }],
    },
  });
  const dayModel = buildPlanDayTrustModel({
    day: {
      isToday: true,
      status: { key: "adjusted" },
    },
  });
  const previewDayModel = buildPlanDayTrustModel({
    day: {
      status: { key: "preview" },
    },
    preview: true,
  });

  assert.deepEqual(weekModel.chips.map((chip) => chip.label), ["Adaptive today", "Next week can change"]);
  assert.ok(dayModel.chips.some((chip) => chip.label === "Committed"));
  assert.ok(dayModel.chips.some((chip) => chip.label === "Adaptive day"));
  assert.ok(dayModel.chips.some((chip) => chip.label === "Adjusted"));
  assert.deepEqual(previewDayModel.chips.map((chip) => chip.label), ["Preview", "Can change"]);
});

test("log trust model keeps planned, actual, and downstream use visible without verbose copy", () => {
  const model = buildLogTrustModel({
    completionSelection: "swapped",
    hasSignalsInput: true,
    actualModalityKey: "bike",
  });

  assert.deepEqual(model.chips.map((chip) => chip.label), [
    "Prescribed loaded",
    "Cardio substitute",
    "Recovery signal",
    "Used later",
  ]);
});

