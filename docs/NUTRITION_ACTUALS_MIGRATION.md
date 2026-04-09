# Nutrition Actuals Migration

## Goal

`ActualNutritionLog` is now the primary runtime and persistence model for nutrition actuals.

This migration keeps older saved data readable, but new saves should land in the normalized
`nutritionActualLogs` store rather than the legacy `nutritionFeedback` map.

## Canonical Model

Canonical runtime and storage path:

- `nutritionActualLogs[dateKey] -> ActualNutritionLog`

Key rules:

- `nutritionActualLogs` is the writable source of truth.
- Nutrition, Coach, Logging, and `PlanDay` should all read the same normalized record.
- Legacy `nutritionFeedback` is compatibility input only.

## Compatibility Strategy

Load behavior:

- If persisted payload contains `nutritionActualLogs`, use it as-is.
- If persisted payload predates the migration and only contains `nutritionFeedback`, normalize it on load with `normalizeActualNutritionLogCollection(...)`.

Save behavior:

- New saves persist `nutritionActualLogs`.
- New saves do not write `nutritionFeedback` as a parallel truth store.

Compatibility helpers:

- `normalizeActualNutritionLogCollection(...)`
- `mergeActualNutritionLogUpdate(...)`
- `buildLegacyNutritionFeedbackFromActualLog(...)`
- `buildLegacyNutritionFeedbackCollectionFromActualLogs(...)`

## Boundary Notes

Runtime boundary:

- Dashboard state owns `nutritionActualLogs`.
- UI save actions update normalized logs first.

Persistence boundary:

- `src/services/persistence-adapter-service.js` translates persisted payloads to canonical runtime state.
- Legacy `nutritionFeedback` is only consulted during storage compatibility normalization.

Planning boundary:

- `PlanDay` and adaptive nutrition logic consume normalized `nutritionActualLogs`.

## Sunset Plan For `nutritionFeedback`

Safe to do later:

1. Remove the load fallback from `payload.nutritionFeedback` once old saves are no longer in circulation.
2. Delete legacy compatibility helpers that reconstruct `nutritionFeedback` shape for migration tooling.
3. Update older architecture docs that still describe `nutritionFeedback` as runtime truth.

Do not remove yet:

- legacy load normalization in `src/services/persistence-adapter-service.js`
- compatibility helper surface in `src/modules-nutrition.js`

## Remaining Legacy Touch Points

Code paths that still directly reference `nutritionFeedback` after this migration:

- `src/services/persistence-adapter-service.js`
  Compatibility load fallback from old persisted payloads.
- `src/trainer-dashboard.jsx`
  Compatibility restore path for older `planResetUndo.snapshot` payloads that predate `nutritionActualLogs`.

There are also older docs that still mention `nutritionFeedback` as current truth and should be updated in a later documentation sweep.
