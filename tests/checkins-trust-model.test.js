const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPlannedDayRecord,
  comparePlannedDayToActual,
} = require("../src/modules-checkins.js");

const withMockedNow = (isoString, run) => {
  const originalNow = Date.now;
  Date.now = () => new Date(isoString).getTime();
  try {
    run();
  } finally {
    Date.now = originalNow;
  }
};

const buildStrengthPlanRecord = ({
  dateKey = "2026-04-05",
  label = "Lower A",
  type = "strength",
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: 6 },
  base: {
    training: { label, type, strengthTrack: "lower" },
    nutrition: null,
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: { label, type, strengthTrack: "lower" },
    nutrition: null,
    recovery: { state: "ready" },
    supplements: null,
  },
  decision: { mode: "progression_ready", modifiedFromBase: false },
  provenance: { summary: "Base progression day.", keyDrivers: [], events: [] },
  flags: {},
});

test("modified completion keeps planned-vs-actual separation", () => {
  const plannedDayRecord = buildStrengthPlanRecord();
  const comparison = comparePlannedDayToActual({
    dateKey: "2026-04-05",
    plannedDayRecord,
    dailyCheckin: { status: "completed_modified" },
    actualLog: {
      actualSession: {
        status: "completed_modified",
        sessionType: "strength",
        sessionLabel: "Lower A trimmed for time",
      },
    },
  });

  assert.equal(comparison.completionKind, "modified");
  assert.equal(comparison.differenceKind, "modified");
  assert.equal(comparison.severity, "minor");
  assert.equal(comparison.sameSessionFamily, true);
  assert.match(comparison.summary, /modified/i);
  assert.equal(plannedDayRecord.resolved.training.label, "Lower A");
});

test("explicit swapped sessions stay custom instead of collapsing into generic modified", () => {
  const plannedDayRecord = buildStrengthPlanRecord({
    label: "Easy Run",
    type: "hard-run",
  });
  const comparison = comparePlannedDayToActual({
    dateKey: "2026-04-05",
    plannedDayRecord,
    dailyCheckin: { status: "completed_modified" },
    actualLog: {
      actualSession: {
        status: "completed_modified",
        userSelection: "swapped",
        swapFromPlan: true,
        sessionType: "bike",
        sessionLabel: "Bike substitute",
      },
    },
  });

  assert.equal(comparison.completionKind, "custom_session");
  assert.equal(comparison.differenceKind, "custom_session");
  assert.equal(comparison.customSession, true);
  assert.match(comparison.summary, /swapped from plan/i);
});

test("skipped, grace, and expired states stay distinct", () => {
  const plannedDayRecord = buildStrengthPlanRecord();

  const skipped = comparePlannedDayToActual({
    dateKey: "2026-04-05",
    plannedDayRecord,
    dailyCheckin: { status: "skipped" },
    actualLog: {},
  });

  assert.equal(skipped.completionKind, "skipped");
  assert.equal(skipped.differenceKind, "skipped");
  assert.equal(skipped.severity, "material");

  withMockedNow("2026-04-06T12:00:00Z", () => {
    const grace = comparePlannedDayToActual({
      dateKey: "2026-04-05",
      plannedDayRecord,
      dailyCheckin: {},
      actualLog: {},
    });

    assert.equal(grace.status, "not_logged_grace");
    assert.equal(grace.completionKind, "pending");
    assert.equal(grace.differenceKind, "pending");
    assert.equal(grace.matters, false);
  });

  withMockedNow("2026-04-08T12:00:00Z", () => {
    const expired = comparePlannedDayToActual({
      dateKey: "2026-04-05",
      plannedDayRecord,
      dailyCheckin: {},
      actualLog: {},
    });

    assert.equal(expired.status, "not_logged_expired");
    assert.equal(expired.completionKind, "unknown");
    assert.equal(expired.differenceKind, "not_logged_over_48h");
    assert.equal(expired.severity, "material");
  });
});
