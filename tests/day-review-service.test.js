const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const { buildDayReview } = require("../src/services/day-review-service.js");
const {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  getCurrentPrescribedDayRevision,
} = require("../src/services/prescribed-day-history-service.js");

const buildPlannedRecord = ({
  dateKey = "2026-04-09",
  label = "Tempo Run",
  type = "hard-run",
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: 10, phase: "BUILD" },
  base: {
    training: { label, type, run: { t: "Tempo", d: "3 x 8 min" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: 2700 } } },
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: { label, type, run: { t: "Tempo", d: "3 x 8 min" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: 2700 } } },
    recovery: { state: "ready" },
    supplements: null,
  },
  decision: { mode: "progression_ready", modifiedFromBase: false },
  provenance: { summary: "Planned tempo run.", keyDrivers: ["tempo work"], events: [] },
  flags: {},
});

test("day review adds a trust explanation for skipped days without exposing internal ids", () => {
  const dateKey = "2026-04-09";
  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: buildPlannedRecord({ dateKey }),
    capturedAt: 1712664000000,
  });

  const review = buildDayReview({
    dateKey,
    logs: {
      [dateKey]: {
        actualSession: {
          status: "skipped",
        },
      },
    },
    dailyCheckins: {
      [dateKey]: {
        status: "skipped",
        note: "Travel day ran long.",
      },
    },
    nutritionActualLogs: {},
    resolvePrescribedHistory: () => historyEntry,
    getCurrentPrescribedDayRevision,
    getCurrentPrescribedDayRecord,
  });

  assert.equal(review.story.explanationSourceLabel, "Based on your recent training");
  assert.match(review.story.explanationLine, /make-up volume|actually landed/i);
  assert.doesNotMatch(review.story.explanationLine, /decisionPointId|chosenActionId|sampleSize/i);
});

test("day review marks pain-limited days as recovery-first changes", () => {
  const dateKey = "2026-04-10";
  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: buildPlannedRecord({ dateKey, label: "Lower Strength", type: "strength+prehab" }),
    capturedAt: 1712664000000,
  });

  const review = buildDayReview({
    dateKey,
    logs: {
      [dateKey]: {
        actualSession: {
          status: "completed_modified",
          sessionType: "strength",
          sessionLabel: "Lower Strength Reduced",
        },
      },
    },
    dailyCheckins: {
      [dateKey]: {
        status: "completed_modified",
        blocker: "pain_injury",
      },
    },
    nutritionActualLogs: {},
    resolvePrescribedHistory: () => historyEntry,
    getCurrentPrescribedDayRevision,
    getCurrentPrescribedDayRecord,
  });

  assert.equal(review.story.explanationSourceLabel, "Recovery-first change");
  assert.match(review.story.explanationLine, /Pain changed the day/i);
});
