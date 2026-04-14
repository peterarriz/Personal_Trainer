const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const {
  createPrescribedDayHistoryEntry,
  upsertPrescribedDayHistoryEntry,
} = require("../src/services/prescribed-day-history-service.js");
const {
  createPersistedPlanWeekRecord,
} = require("../src/services/plan-week-persistence-service.js");
const {
  buildArchivedDayReview,
  buildArchivedPlanAudit,
  buildHistoricalWeekAuditEntries,
} = require("../src/services/history-audit-service.js");

const buildPlanRecord = ({
  dateKey = "2026-04-07",
  label = "Tempo Intervals",
  mode = "progression_ready",
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}_${label.replace(/\s+/g, "_").toLowerCase()}`,
  dateKey,
  week: { number: 8, phase: "BUILD" },
  base: {
    training: { label, type: "hard-run", run: { t: "Tempo", d: "3 x 8 min" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: 2700, c: 280, p: 190, f: 68 } } },
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: { label, type: "hard-run", run: { t: "Tempo", d: "3 x 8 min" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: 2700, c: 280, p: 190, f: 68 } } },
    recovery: { state: "ready" },
    supplements: null,
  },
  decision: { mode, modifiedFromBase: mode !== "progression_ready" },
  provenance: { summary: `Plan saved as ${label}.`, keyDrivers: ["weekly intent"], events: [] },
  flags: {},
});

test("archived day review preserves original plan, latest plan, and actual outcome as separate fields", () => {
  const dateKey = "2026-04-07";
  const original = buildPlanRecord({ dateKey, label: "Tempo Intervals" });
  const revised = buildPlanRecord({ dateKey, label: "Tempo Intervals Reduced", mode: "reduced_load" });
  const initialHistory = createPrescribedDayHistoryEntry({
    plannedDayRecord: original,
    capturedAt: 1712664000000,
  });
  const updatedHistory = upsertPrescribedDayHistoryEntry({
    dateKey,
    existingEntry: initialHistory,
    plannedDayRecord: revised,
    capturedAt: 1712671200000,
    reason: "same_day_adjustment",
  }).nextEntry;

  const archive = {
    id: "archive_test",
    archivedAt: "2026-04-12T12:00:00.000Z",
    planArcLabel: "2026-04-01 -> 2026-04-12",
    prescribedDayHistory: {
      [dateKey]: updatedHistory,
    },
    logEntries: [
      {
        date: dateKey,
        type: "Tempo Run Modified",
        notes: "Backed off after a rough warmup.",
        feel: "2",
        checkin: { status: "completed_modified", note: "Reduced volume", ts: 1712674800000 },
      },
    ],
  };

  const review = buildArchivedDayReview({ archive, dateKey });

  assert.equal(review.originalPrescription.label, "Tempo Intervals");
  assert.equal(review.latestPrescription.label, "Tempo Intervals Reduced");
  assert.equal(review.actualLog.type, "Tempo Run Modified");
  assert.equal(review.story.plannedSummary.label, "Tempo Intervals Reduced");
  assert.ok(review.story.actualSummary.label.length > 0);
  assert.ok(review.story.mainLesson.length > 0);
  assert.ok(review.story.nextEffect.length > 0);
  assert.equal(review.revisions.length, 2);
});

test("archived plan audit builds reusable week and day review entries", () => {
  const dateKey = "2026-04-07";
  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: buildPlanRecord({ dateKey, label: "Long Run" }),
    capturedAt: 1712664000000,
  });
  const weekRecord = createPersistedPlanWeekRecord({
    planWeek: {
      id: "plan_week_8",
      weekNumber: 8,
      absoluteWeek: 8,
      label: "BUILD - Week 8",
      phase: "BUILD",
      startDate: "2026-04-06",
      endDate: "2026-04-12",
      status: "planned",
      summary: "Hold quality while trimming fatigue.",
      weeklyIntent: { focus: "Manage fatigue" },
      sessionsByDay: {
        4: { type: "hard-run", label: "Tempo" },
        6: { type: "long-run", label: "Long Run" },
      },
    },
    capturedAt: 1712664000000,
  });

  const archive = {
    id: "archive_test_2",
    archivedAt: "2026-04-12T12:00:00.000Z",
    planArcLabel: "Archive 2",
    prescribedDayHistory: {
      [dateKey]: historyEntry,
    },
    planWeekHistory: {
      "8": weekRecord,
    },
    logEntries: [
      {
        date: dateKey,
        type: "Long Run",
        notes: "Completed as planned.",
      },
    ],
  };

  const audit = buildArchivedPlanAudit({ archive });

  assert.equal(audit.weekReviews.length, 1);
  assert.equal(audit.dayEntries.length, 1);
  assert.equal(audit.dayEntries[0].plannedLabel, "Long Run");
  assert.equal(audit.dayEntries[0].actualLabel, "Long Run");
});

test("historical week audit entries normalize committed week records for review surfaces", () => {
  const entries = buildHistoricalWeekAuditEntries({
    planWeekRecords: {
      "8": createPersistedPlanWeekRecord({
        planWeek: {
          id: "plan_week_8",
          weekNumber: 8,
          absoluteWeek: 8,
          label: "BUILD - Week 8",
          phase: "BUILD",
          startDate: "2026-04-06",
          endDate: "2026-04-12",
          status: "planned",
          summary: "Hold quality while trimming fatigue.",
          weeklyIntent: { focus: "Manage fatigue" },
          sessionsByDay: {
            4: { type: "hard-run", label: "Tempo" },
          },
        },
        capturedAt: 1712664000000,
      }),
    },
    logs: {
      "2026-04-07": { type: "Tempo Run" },
    },
    weeklyCheckins: {
      "8": { energy: 3, stress: 2, confidence: 4, ts: 1712664000000 },
    },
    currentWeek: 8,
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, "BUILD - Week 8");
  assert.equal(entries[0].loggedSessionCount, 1);
  assert.equal(entries[0].weeklyCheckin.energy, 3);
  assert.ok(entries[0].story.plannedSummary.length > 0);
  assert.ok(entries[0].story.actualSummary.length > 0);
  assert.ok(entries[0].story.nextEffect.length > 0);
});
