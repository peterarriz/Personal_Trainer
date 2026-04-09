const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlannedDayRecord } = require("../src/modules-checkins.js");
const {
  buildCanonicalRuntimeStateFromStorage,
  buildPersistedTrainerPayload,
} = require("../src/services/persistence-adapter-service.js");
const {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  upsertPrescribedDayHistoryEntry,
} = require("../src/services/prescribed-day-history-service.js");

const buildPlanRecord = ({
  dateKey = "2026-04-07",
  label = "Tempo Intervals",
  calories = 2700,
  provenanceSummary = "Original plan day.",
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: 8, phase: "BUILD" },
  base: {
    training: { label, type: "hard", run: { t: "tempo", d: "10 min warmup, 3 x 8 min tempo" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: calories, c: 280, p: 190, f: 68 } } },
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: { label, type: "hard", run: { t: "tempo", d: "10 min warmup, 3 x 8 min tempo" } },
    nutrition: { prescription: { dayType: "hardRun", targets: { cal: calories, c: 280, p: 190, f: 68 } } },
    recovery: { state: "ready" },
    supplements: null,
  },
  decision: { mode: "progression_ready", modifiedFromBase: false },
  provenance: { summary: provenanceSummary, keyDrivers: ["weekly intent"], events: [] },
  flags: {},
});

test("PlanDay history snapshots persist through the storage boundary", () => {
  const dateKey = "2026-04-07";
  const plannedDayRecord = buildPlanRecord({ dateKey });
  const historyEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord,
    capturedAt: 1712664000000,
    reason: "daily_decision_capture",
  });

  const payload = buildPersistedTrainerPayload({
    runtimeState: {
      plannedDayRecords: { [dateKey]: historyEntry },
      logs: {},
      dailyCheckins: {},
      nutritionActualLogs: {},
    },
  });

  const restored = buildCanonicalRuntimeStateFromStorage({
    storedPayload: payload,
    DEFAULT_PERSONALIZATION: {},
    DEFAULT_MULTI_GOALS: [],
  });

  assert.deepEqual(restored.plannedDayRecords[dateKey], historyEntry);
  assert.equal(
    getCurrentPrescribedDayRecord(restored.plannedDayRecords[dateKey]).resolved.training.label,
    "Tempo Intervals",
  );
});

test("prescribed-day revision dedupe ignores non-material drift but captures real plan changes", () => {
  const dateKey = "2026-04-07";
  const baseRecord = buildPlanRecord({ dateKey, provenanceSummary: "Original summary." });
  const originalEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: baseRecord,
    capturedAt: 1712664000000,
  });

  const cosmeticChange = buildPlanRecord({
    dateKey,
    provenanceSummary: "Reworded summary only.",
  });
  const deduped = upsertPrescribedDayHistoryEntry({
    dateKey,
    existingEntry: originalEntry,
    plannedDayRecord: cosmeticChange,
    capturedAt: 1712667600000,
    reason: "daily_decision_refresh",
  });

  assert.equal(deduped.changed, false);
  assert.equal(deduped.nextEntry.revisions.length, 1);

  const materialChange = buildPlanRecord({
    dateKey,
    label: "Tempo Intervals Reduced Load",
    calories: 2825,
    provenanceSummary: "Adjusted after readiness drop.",
  });
  const revised = upsertPrescribedDayHistoryEntry({
    dateKey,
    existingEntry: deduped.nextEntry,
    plannedDayRecord: materialChange,
    capturedAt: 1712671200000,
    reason: "same_day_adjustment",
  });

  assert.equal(revised.changed, true);
  assert.equal(revised.nextEntry.revisions.length, 2);
  assert.equal(getCurrentPrescribedDayRecord(revised.nextEntry).resolved.training.label, "Tempo Intervals Reduced Load");
});
