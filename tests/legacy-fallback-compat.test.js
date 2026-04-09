const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLegacyHistoryDisplayLabel,
  resolveArchivedPlannedDayRecordCompat,
  resolveLegacyPlannedDayHistoryEntry,
} = require("../src/services/legacy-fallback-compat-service.js");
const {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  PRESCRIBED_DAY_DURABILITY,
} = require("../src/services/prescribed-day-history-service.js");
const { resolveNutritionActualLogStoreCompat } = require("../src/modules-nutrition.js");

test("legacy planned-day history prefers legacy snapshots before schedule reconstruction", () => {
  const entry = resolveLegacyPlannedDayHistoryEntry({
    dateKey: "2026-04-08",
    legacySnapshot: {
      baseLabel: "Tempo Run",
      resolvedLabel: "Tempo Run Reduced",
      modifiedFromBase: true,
      mode: "reduced_load",
      ts: 1712664000000,
    },
    resolvePlanWeekNumberForDateKey: () => 3,
    resolveScheduleWorkout: () => ({ label: "Schedule Fallback" }),
  });

  const record = getCurrentPrescribedDayRecord(entry);
  assert.equal(record.source, "legacy_log_snapshot");
  assert.equal(record.resolved.training.label, "Tempo Run Reduced");
  assert.equal(record.durability, PRESCRIBED_DAY_DURABILITY.legacyBackfill);
});

test("legacy planned-day history only uses schedule fallback when no stronger historical source exists", () => {
  const entry = resolveLegacyPlannedDayHistoryEntry({
    dateKey: "2026-04-09",
    allowScheduleFallback: true,
    planStartDate: "2026-04-01",
    fallbackStartDate: "2026-04-01",
    resolvePlanWeekNumberForDateKey: () => 2,
    resolveScheduleWorkout: (week, day) => ({
      type: day === 4 ? "hard-run" : "rest",
      label: `Week ${week} fallback`,
      week: { phase: "BUILD" },
      nutri: "hardRun",
    }),
  });

  const record = getCurrentPrescribedDayRecord(entry);
  assert.equal(record.source, "legacy_schedule_helper");
  assert.equal(record.decision.mode, "static_schedule");
  assert.equal(record.durability, PRESCRIBED_DAY_DURABILITY.fallbackDerived);
});

test("archive compatibility resolves durable planned records before snapshot fallbacks", () => {
  const durableEntry = createPrescribedDayHistoryEntry({
    plannedDayRecord: {
      id: "plan_day_2026-04-07",
      dateKey: "2026-04-07",
      source: "plan_day_engine",
      base: { training: { label: "Canonical Tempo", type: "hard-run" } },
      resolved: { training: { label: "Canonical Tempo", type: "hard-run" } },
      decision: { mode: "progression_ready", modifiedFromBase: false },
      provenance: { summary: "Canonical", keyDrivers: [], events: [] },
      flags: {},
    },
    capturedAt: 1712577600000,
  });

  const resolved = resolveArchivedPlannedDayRecordCompat({
    dateKey: "2026-04-07",
    historyEntry: durableEntry,
    legacySnapshot: { resolvedLabel: "Legacy Tempo" },
  });

  assert.equal(resolved.resolved.training.label, "Canonical Tempo");
});

test("legacy helper-derived history labels stay sanitized and deterministic", () => {
  const label = buildLegacyHistoryDisplayLabel("Tempo Run (modified)", (value) => value.toUpperCase());
  assert.equal(label, "TEMPO RUN");
});

test("nutrition compatibility prefers canonical actual logs and otherwise normalizes legacy nutrition feedback", () => {
  const canonical = resolveNutritionActualLogStoreCompat({
    nutritionActualLogs: {
      "2026-04-08": {
        id: "actual_nutrition_2026-04-08",
        dateKey: "2026-04-08",
        hydrationOz: 90,
      },
    },
    legacyNutritionFeedback: {
      "2026-04-08": {
        hydrationOz: 40,
      },
    },
  });
  assert.equal(canonical["2026-04-08"].hydrationOz, 90);

  const normalized = resolveNutritionActualLogStoreCompat({
    nutritionActualLogs: null,
    legacyNutritionFeedback: {
      "2026-04-08": {
        status: "on_track",
        hydrationOz: 72,
        hydrationTargetOz: 96,
        supplementTaken: ["creatine"],
      },
    },
  });
  assert.equal(normalized["2026-04-08"].quickStatus, "on_track");
  assert.equal(normalized["2026-04-08"].supplements.count, 1);
});
