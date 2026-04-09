# Persistence Contract

## Goal
Keep canonical runtime state separate from the current storage layout so save/load flows are explicit, reviewable, and less prone to drift.

## Canonical Runtime State

The persistence adapter treats this as the canonical mutable app state:

- `logs`
- `bodyweights`
- `paceOverrides`
- `weekNotes`
- `planAlerts`
- `personalization`
- `goals`
- `coachActions`
- `coachPlanAdjustments`
- `dailyCheckins`
- `plannedDayRecords`
- `weeklyCheckins`
- `nutritionFavorites`
- `nutritionActualLogs`

This canonical runtime state is assembled and normalized before persistence. Derived objects such as `PlanDay`, `PlanWeek`, rolling horizon previews, readiness summaries, nutrition comparisons, runtime inspector snapshots, and AI packets are not persisted as truth.

## Persisted Storage Shape

### Primary blob

Current durable app snapshot still lives in `trainer_data.data` and local cache with this shape:

```js
{
  logs,
  bw,
  paceOverrides,
  weekNotes,
  planAlerts,
  personalization,
  goals,
  coachActions,
  coachPlanAdjustments,
  dailyCheckins,
  plannedDayRecords,
  weeklyCheckins,
  nutritionFavorites,
  nutritionActualLogs,
  v: 6,
  contractVersion: "runtime_storage_v1",
  ts
}
```

### Shadow persistence paths

These still exist beside the blob and are not yet transactional with it:

- `session_logs`
- `exercise_performance`
- `goals`
- `coach_memory`

They are secondary persistence paths and currently serve sync/query convenience, not primary truth replacement.

## Compatibility Transformations

### Runtime -> storage

- canonical runtime `bodyweights` becomes persisted `bw`
- runtime `personalization` passes through compatibility shaping before save so legacy goal/profile fields remain available
- canonical runtime state is cloned and normalized before being written

### Storage -> runtime

- persisted `bw` becomes runtime `bodyweights`
- persisted `personalization` is merged onto `DEFAULT_PERSONALIZATION`
- persisted `goals` are normalized before becoming runtime state
- missing collections fall back to empty/default canonical shapes

### Import/export

- import payloads are decoded through the same storage-to-runtime adapter
- export payloads are encoded through the same runtime-to-storage adapter
- local-cache fallback after cloud load failure now uses the adapter directly instead of hand-mapping fields

## Versioning Strategy

- Keep the existing blob version `v: 6` for backward compatibility.
- Add `contractVersion: "runtime_storage_v1"` as the adapter contract marker.
- New additive fields should prefer `contractVersion` checks over implicit field guessing.
- Any future breaking blob change should bump both:
- blob version `v`
- adapter contract version string

## Canonical Entities That Deserve Dedicated Persistence First

- `plannedDayRecords`: already canonical and versioned, high value, review-critical
- `dailyCheckins`: direct athlete truth, should not rely on merged log shadows forever
- `nutritionActualLogs`: actual outcome data with growing planning impact
- `coachPlanAdjustments`: accepted plan mutations that currently affect runtime truth directly
- `goals` and canonical goal/profile state: already partially shadowed, should converge on one durable contract

## Values That Are Derived And Should Not Be Stored As Truth

- `PlanDay`
- `PlanWeek`
- rolling-horizon previews
- readiness/recovery derived summaries
- nutrition comparison summaries
- momentum / validation / optimization / failure-mode layers
- runtime inspector snapshots
- AI packets, prompts, and transient streaming state

## Current Risks That Remain

- `trainer_data.data` is still a large monolithic blob, so partial writes are not isolated by entity.
- Shadow-table writes are separate calls and can drift from the primary blob.
- There is no cross-write transaction between blob save and shadow row sync.
- `personalization` still contains both canonical and compatibility-era fields, which increases payload ambiguity.
- Import/restore still trusts blob-wide payload shape more than entity-specific schema validation.

## Payload Versioning Gaps

- `v: 6` exists, but load behavior is still mostly shape-based rather than version-gated.
- Shadow tables do not share the blob version or contract version.
- No checksum or revision token links the blob to shadow-row sync state.
- Compatibility fields inside `personalization` do not have field-level migration markers.

## Implemented Boundary

The explicit adapter now lives in:

- `src/services/persistence-adapter-service.js`

It is responsible for:

- building canonical runtime state
- translating canonical runtime state into the persisted blob
- translating persisted blob data back into canonical runtime state
- applying canonical runtime state to React setters
- handling import/export encoding through the same boundary
