# Legacy Fallback Inventory

This inventory tracks the remaining compatibility seams that still protect older saved data, archive-era review, and pre-canonical planning history.

## Prescribed History Fallbacks

| Fallback | Where It Lives | Trigger | Why It Still Exists | Risk | Deletion Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Legacy prescribed snapshot reconstruction | `src/services/legacy-fallback-compat-service.js` via `buildLegacyPlannedDayRecordFromSnapshot(...)` and `resolveLegacyPlannedDayHistoryEntry(...)` | A log/archive row has `prescribedPlanSnapshot` but no canonical `plannedDayRecords[dateKey]` entry | Older workout logs only stored a lightweight prescribed snapshot, so review/history still needs a readable planned session | Medium | Backfill every historical log/archive row to durable prescribed-day history before deleting |
| Template-derived historical backfill | `src/services/legacy-fallback-compat-service.js` via `buildLegacyPlannedDayRecordFromWorkout(...)` and `resolveLegacyPlannedDayHistoryEntry(...)` | A date has log/check-in/nutrition history but no canonical prescribed-day record and no legacy snapshot | Prevents blank historical comparison rows for older dates that predate canonical PlanDay storage | High | Replace all schedule-template reconstruction with migrated historical prescribed-day snapshots or accept those dates as non-reviewable |
| Static schedule helper used by fallback reconstruction | `src/trainer-dashboard.jsx` via `getTodayWorkout(...)` | Compatibility helper requests a schedule-derived day for an old date | The old week-template model still defines the only recoverable planning context for some legacy dates | High | Remove once no compatibility helper depends on static week templates for historical reconstruction |

## Nutrition Compatibility

| Fallback | Where It Lives | Trigger | Why It Still Exists | Risk | Deletion Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Load `nutritionFeedback` into canonical actual logs | `src/modules-nutrition.js` via `resolveNutritionActualLogStoreCompat(...)`; used by `src/services/persistence-adapter-service.js` and reset undo restore in `src/trainer-dashboard.jsx` | Stored payload or undo snapshot has `nutritionFeedback` but no `nutritionActualLogs` | Older saves and undo snapshots still serialize nutrition in the legacy shape | Medium | Migrate or expire older saves/snapshots and verify restores no longer need `nutritionFeedback` |
| Adaptive nutrition reads legacy nutrition feedback when canonical logs are missing | `src/modules-nutrition.js` inside `deriveAdaptiveNutrition(...)` | Runtime receives older payloads that have not been normalized onto `nutritionActualLogs` | Keeps deterministic nutrition adaptation usable while old saves still circulate | Low | Remove once load-time compatibility guarantees canonical actual logs for every active runtime |
| Reverse bridge back to `nutritionFeedback` shape | `src/modules-nutrition.js` via `buildLegacyNutritionFeedbackFromActualLog(...)` and `buildLegacyNutritionFeedbackCollectionFromActualLogs(...)` | Export/migration tooling or compatibility consumers still ask for the old map shape | Some tooling/docs still reference the old payload contract | Low | Delete after migration tooling and remaining docs no longer consume the old format |

## Archive Review Compatibility

| Fallback | Where It Lives | Trigger | Why It Still Exists | Risk | Deletion Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Archived week review falls back from `planWeekHistory` to prescribed-day history/snapshot reconstruction | `src/trainer-dashboard.jsx` archive review surface with `resolveArchivedPlannedDayRecordCompat(...)` | Archived plan arc lacks durable `planWeekHistory` | Older archived arcs predate persisted PlanWeek history, so weekly review still needs a readable fallback | Medium | Rebuild or migrate historical archives to durable `planWeekHistory` |
| Archive/log helper-derived labels | `src/services/legacy-fallback-compat-service.js` via `buildLegacyHistoryDisplayLabel(...)`; used in `src/trainer-dashboard.jsx` | Old logs lack canonical `actualSession.sessionLabel` or preserved workout labels | Prevents noisy or parenthetical legacy labels from leaking into review UIs | Low | Standardize labels on historical log rows or migrate review surfaces to canonical actual-session naming only |

## Program Preview / Horizon Backfills

| Fallback | Where It Lives | Trigger | Why It Still Exists | Risk | Deletion Prerequisite |
| --- | --- | --- | --- | --- | --- |
| Template-derived Program horizon preview | `src/services/plan-week-service.js` via `buildFallbackProgramPreviewWeeks(...)` and `resolveProgramDisplayHorizon(...)` | Canonical rolling horizon rows are unavailable | Keeps Program usable while some older states still lack durable/canonical week rows | Medium | Guarantee canonical horizon assembly for all active runtimes and archived views |

## Highest-Risk Seams

1. `resolveLegacyPlannedDayHistoryEntry(...)` schedule-template reconstruction is the riskiest seam because it synthesizes history from week templates instead of durable historical records.
2. `getTodayWorkout(...)` remains a critical legacy dependency because several older history/review flows still rely on it for fallback reconstruction.
3. Archive review fallback from missing `planWeekHistory` to prescribed-day history means some older arcs still present reconstructed rather than committed weekly context.

## Suspicious But Not Ready To Delete

- The reset-undo nutrition restore path in `src/trainer-dashboard.jsx` still needs legacy nutrition normalization because undo snapshots can outlive migrations.
- Helper-derived display labels are narrow and low-risk, but they are still covering inconsistent old log shapes rather than a fully canonical historical label model.
- Program preview fallback is acceptable for future weeks, but any accidental reuse of that preview as if it were committed history would be a correctness problem.
