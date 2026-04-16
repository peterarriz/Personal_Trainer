import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalyticsEvent,
  buildFrictionDashboardModel,
  createFrictionAnalytics,
  FRICTION_ANALYTICS_STORAGE_KEY,
  sanitizeAnalyticsProps,
  summarizeAnalyticsEvents,
} from "../src/services/friction-analytics-service.js";

const createStorageStub = () => {
  const state = new Map();
  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, String(value));
    },
    removeItem(key) {
      state.delete(key);
    },
  };
};

test("analytics props strip sensitive freeform fields before persistence", () => {
  const sanitized = sanitizeAnalyticsProps({
    stage: "clarify",
    message: "do not keep this",
    raw_text: "never persist",
    note: "nope",
    input_mode: "manual",
    nested: {
      prompt: "remove nested prompt",
      retry_count: 2,
    },
  });

  assert.deepEqual(sanitized, {
    stage: "clarify",
    input_mode: "manual",
    nested: {
      retry_count: 2,
    },
  });
});

test("buildAnalyticsEvent normalizes names and payload shape", () => {
  const event = buildAnalyticsEvent({
    flow: "Auth",
    action: "Sign Out",
    outcome: "Success",
    props: {
      duration_ms: 184.2222,
      local_resume_available: true,
    },
    ts: 1234,
  });

  assert.equal(event.flow, "auth");
  assert.equal(event.action, "sign_out");
  assert.equal(event.outcome, "success");
  assert.equal(event.name, "auth.sign_out.success");
  assert.equal(event.ts, 1234);
  assert.equal(event.props.duration_ms, 184.22);
  assert.equal(event.props.local_resume_available, true);
});

test("tracker persists recent events and dispatches the custom payload", () => {
  const storage = createStorageStub();
  const dispatched = [];
  const tracker = createFrictionAnalytics({
    storageLike: storage,
    maxEvents: 2,
    now: () => 100,
    dispatch: (detail) => dispatched.push(detail),
  });

  tracker.track({ flow: "auth", action: "sign_in", outcome: "requested" });
  tracker.track({ flow: "auth", action: "sign_in", outcome: "success" });
  tracker.track({ flow: "auth", action: "sign_out", outcome: "success" });

  const events = tracker.readEvents();
  assert.equal(events.length, 2);
  assert.equal(events[0].name, "auth.sign_in.success");
  assert.equal(events[1].name, "auth.sign_out.success");
  assert.equal(dispatched.length, 3);
  assert.match(storage.getItem(FRICTION_ANALYTICS_STORAGE_KEY), /auth\.sign_out\.success/);
});

test("summary surfaces the main friction counts and dashboard copy", () => {
  const now = Date.UTC(2026, 3, 15, 12, 0, 0);
  const events = [
    buildAnalyticsEvent({ flow: "auth", action: "sign_in", outcome: "requested", ts: now - 1000 }),
    buildAnalyticsEvent({ flow: "auth", action: "sign_in", outcome: "error", ts: now - 900 }),
    buildAnalyticsEvent({ flow: "auth", action: "sign_out", outcome: "success", ts: now - 800, props: { duration_ms: 240 } }),
    buildAnalyticsEvent({ flow: "auth", action: "delete_account", outcome: "blocked", ts: now - 700 }),
    buildAnalyticsEvent({ flow: "intake", action: "continue", outcome: "requested", ts: now - 600, props: { attempt_in_stage: 1 } }),
    buildAnalyticsEvent({ flow: "intake", action: "continue", outcome: "requested", ts: now - 500, props: { attempt_in_stage: 2 } }),
    buildAnalyticsEvent({ flow: "intake", action: "session_restore", outcome: "restored", ts: now - 450 }),
    buildAnalyticsEvent({ flow: "intake", action: "stage_exit", outcome: "abandoned", ts: now - 430 }),
    buildAnalyticsEvent({ flow: "intake", action: "plan_build", outcome: "completed", ts: now - 400 }),
    buildAnalyticsEvent({ flow: "goals", action: "management_preview", outcome: "requested", ts: now - 300 }),
    buildAnalyticsEvent({ flow: "goals", action: "management_apply", outcome: "success", ts: now - 250 }),
    buildAnalyticsEvent({ flow: "logging", action: "workout_log", outcome: "success", ts: now - 200 }),
    buildAnalyticsEvent({ flow: "sync", action: "rest_retry", outcome: "retry", ts: now - 150 }),
    buildAnalyticsEvent({ flow: "sync", action: "persist_all", outcome: "error", ts: now - 100 }),
    buildAnalyticsEvent({ flow: "coach", action: "advisory_question", outcome: "success", ts: now - 50 }),
  ];

  const summary = summarizeAnalyticsEvents({ events, now });
  assert.equal(summary.flows.auth.signInFailures, 1);
  assert.equal(summary.flows.auth.deleteBlockedCount, 1);
  assert.equal(summary.flows.auth.avgSignOutMs, 240);
  assert.equal(summary.flows.intake.repeatedContinues, 1);
  assert.equal(summary.flows.intake.stageRestores, 1);
  assert.equal(summary.flows.intake.stageAbandons, 1);
  assert.equal(summary.flows.goals.previewCount, 1);
  assert.equal(summary.flows.goals.applyCount, 1);
  assert.equal(summary.flows.logging.workoutSaves, 1);
  assert.equal(summary.flows.sync.retries, 1);
  assert.equal(summary.flows.sync.persistErrors, 1);
  assert.equal(summary.flows.coach.advisoryQuestions, 1);
  assert.match(summary.cards[0].headline, /repeat continues/i);
  assert.match(summary.frictionSignals[1], /blocked deletes|delete-account/i);

  const dashboard = buildFrictionDashboardModel({ events, now });
  assert.equal(dashboard.header.title, "Friction summary");
  assert.equal(dashboard.cards.length, 4);
  assert.equal(dashboard.sections.length, 2);
  assert.match(dashboard.sections[0].items[0], /Auth attempts/i);
});
