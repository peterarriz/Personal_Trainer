const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCoachActionHistoryModel,
  buildCoachActionPreviewModel,
  buildCoachAskAnythingStateModel,
  buildCoachModeCards,
  buildCoachRecentQuestionModel,
  buildCoachQuickChangeActions,
  COACH_SURFACE_MODES,
} = require("../src/services/coach-surface-service.js");
const { COACH_TOOL_ACTIONS } = require("../src/modules-coach-engine.js");

test("buildCoachQuickChangeActions exposes distinct deterministic actions for run-focused plans", () => {
  const actions = buildCoachQuickChangeActions({
    currentWeek: 6,
    todayWorkout: { type: "long-run", label: "Long Run" },
    injuryArea: "Achilles",
  });

  assert.ok(actions.length >= 6);
  assert.ok(actions.some((entry) => entry.label === "Make today a recovery day"));
  assert.ok(actions.some((entry) => entry.label === "Reduce this week's volume"));
  assert.ok(actions.some((entry) => entry.label === "Swap high-impact for low-impact"));
  assert.ok(actions.some((entry) => entry.label === "Move long run"));
});

test("buildCoachActionPreviewModel describes deterministic impact without applying it", () => {
  const preview = buildCoachActionPreviewModel({
    action: {
      type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME,
      payload: { pct: 12, reason: "manual_volume_reduction" },
    },
    commitResult: {
      ok: true,
      accepted: { acceptancePolicy: "acceptance_only" },
      mutation: {
        adjustments: {
          dayOverrides: {},
          nutritionOverrides: {},
          weekVolumePct: { 6: 88 },
          extra: {},
        },
        weekNotes: {
          6: "Coach reduced this week volume by 12% for recovery control.",
        },
        planAlerts: [],
        personalization: {},
      },
    },
    currentWeek: 6,
    todayKey: "2026-04-14",
    todayWorkout: { label: "Tempo Run", type: "run" },
  });

  assert.equal(preview.status, "ready");
  assert.equal(preview.headline, "Reduce this week's volume");
  assert.equal(preview.likelyEffect, "This week lands at 88% of normal volume.");
  assert.ok(preview.effectLines.some((line) => /This week lands at 88% of normal volume\./.test(line)));
  assert.ok(preview.effectLines.some((line) => /reduced this week volume by 12% for recovery control\./i.test(line)));
  assert.match(preview.auditLine, /review first, then apply/i);
});

test("buildCoachActionHistoryModel keeps accepted action audit detail visible", () => {
  const history = buildCoachActionHistoryModel({
    coachActions: [{
      id: "coach_act_1",
      type: COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY,
      reason: "Protect recovery after travel.",
      ts: new Date("2026-04-14T12:00:00Z").getTime(),
      proposalSource: "coach_change_plan",
      acceptedBy: "deterministic_gate",
      provenance: {
        summary: "Accepted through deterministic gate after preview.",
      },
    }],
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].headline, "Make today a recovery day");
  assert.equal(history[0].detail, "Protect recovery after travel.");
  assert.equal(history[0].proposalSourceLabel, "coach change plan");
  assert.match(history[0].auditLine, /deterministic gate/i);
});

test("buildCoachModeCards keeps the three-job model explicit", () => {
  const cards = buildCoachModeCards({ activeMode: COACH_SURFACE_MODES.changePlan });

  assert.deepEqual(
    cards.map((card) => card.label),
    ["Adjust today", "Adjust this week", "Ask coach"]
  );
  assert.equal(cards[1].active, true);
  assert.equal(cards[2].emphasis, "secondary");
  assert.match(cards[2].description, /preview a change/i);
});

test("buildCoachRecentQuestionModel keeps transcript history collapsed into short prompts", () => {
  const recent = buildCoachRecentQuestionModel({
    messages: [
      { role: "assistant", text: "Coach answer", ts: new Date("2026-04-14T12:00:00Z").getTime() },
      { role: "user", text: "Should I push this week?", ts: new Date("2026-04-14T12:05:00Z").getTime() },
      { role: "user", text: "What should change today?", ts: new Date("2026-04-14T12:10:00Z").getTime() },
    ],
  });

  assert.equal(recent.count, 2);
  assert.equal(recent.entries[0].question, "What should change today?");
  assert.match(recent.summary, /2 recent questions/i);
});

test("buildCoachAskAnythingStateModel stays advisory-only with or without AI availability", () => {
  const unavailable = buildCoachAskAnythingStateModel({ apiKey: "" });
  const available = buildCoachAskAnythingStateModel({ apiKey: "test-key" });

  assert.equal(unavailable.aiAvailable, true);
  assert.equal(unavailable.canMutatePlan, false);
  assert.equal(available.aiAvailable, true);
  assert.equal(available.advisoryOnly, true);
  assert.equal(available.canMutatePlan, false);
  assert.equal(available.headline, "Answers only");
  assert.match(available.detail, /chat never changes your plan/i);
});
