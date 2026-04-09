# Performance Record Model

## Goal

Make one canonical performance outcome model that the app can use for:

- exercise-level strength progression
- session-level endurance and mixed-session review
- future adaptation surfaces

The canonical runtime home is:

```js
logs[dateKey].performanceRecords
```

The shared normalization boundary lives in:

```js
src/services/performance-record-service.js
```

## What Is Canonical

`PerformanceRecord` is now the canonical actual-performance model.

- It lives inside the canonical `logs` runtime entity.
- It is created or normalized on load, import, realtime hydration, and local log writes.
- Strength progression now reads canonical exercise records instead of reading raw `strengthPerformance` arrays directly.
- Endurance/session fitness reads now have a canonical session-level record path as well.

## Canonical Shape

```ts
type PerformanceRecord = {
  id: string
  version: "2026-04-performance-record-v1"
  date: string // YYYY-MM-DD
  scope: "exercise" | "session"
  domain: "strength" | "endurance" | "mixed" | "general"
  source: string

  sessionType: string
  sessionLabel: string
  sessionFamily: "strength" | "run" | "hybrid" | "recovery" | "custom" | "unknown"
  sessionStatus: string

  exercise: string
  exerciseKey: string
  liftKey: string
  bucket: string
  mode: "weighted" | "band" | "bodyweight" | ""

  prescribed: {
    weight: number | null
    reps: number | null
    sets: number | null
    bandTension: string | null
    bodyweightOnly: boolean
  } | null

  actual: {
    weight?: number | null
    reps?: number | null
    sets?: number | null

    distanceMiles?: number | null
    durationMinutes?: number | null
    paceText?: string | null
    avgHr?: number | null
    maxHr?: number | null
    calories?: number | null
    hrPaceRatio?: number | null
    hrDrift?: number | null
    recoveryHr?: number | null
    exerciseCount?: number
    note?: string | null
  }

  metrics: {
    feelScore: number
    completionRatio?: number | null
    resistanceValue?: number | null
    estimatedVolume?: number | null
    paceSeconds?: number | null
    distanceMiles?: number | null
    durationMinutes?: number | null
    avgHr?: number | null
    maxHr?: number | null
    calories?: number | null
    hrPaceRatio?: number | null
    hrDrift?: number | null
    recoveryHr?: number | null
  }
}
```

Notes:

- `scope: "exercise"` is used for lift/accessory outputs that matter for progression.
- `scope: "session"` is used for run/endurance or mixed-session summaries.
- Exercise records keep prescription, actual output, and only a small set of progression metrics.
- Session records intentionally stay light; they store useful adaptation inputs but do not introduce advanced analytics.

## Current Runtime Rules

- A logged strength session produces one exercise record per logged exercise.
- A logged run or mixed session produces a session record when there is structured actual data.
- Legacy log fields are normalized into `performanceRecords` on read so old saved data still works.
- The app keeps `performanceRecords` and a legacy `strengthPerformance` mirror in sync during normalization.

## Audit: Reads

| Area | Current reader | Canonical use |
| --- | --- | --- |
| Strength history shaping | `buildStrengthHistoryByExercise` in `src/trainer-dashboard.jsx` | reads exercise-scope `performanceRecords` |
| Progressive overload engine | `deriveProgressiveOverloadAdjustmentsV2` in `src/trainer-dashboard.jsx` | consumes canonical exercise records |
| Strength tracker / goal progress | `deriveStrengthProgressTracker` in `src/trainer-dashboard.jsx` | prefers canonical exercise records, falls back to older text parsing only when needed |
| Session-family comparison | `comparePlannedDayToActual` in `src/modules-checkins.js` | checks canonical performance records before legacy mirrors |
| Fitness/endurance signals | `deriveFitnessLayer` in `src/trainer-dashboard.jsx` | prefers canonical session records for run/endurance metrics |
| Log review prefills | `openHistoryEntry` in `src/trainer-dashboard.jsx` | prefers canonical exercise records for weight/reps review |

## Audit: Writes

| Area | Current writer | Canonical write behavior |
| --- | --- | --- |
| Quick check-in logging | `saveDailyCheckin` in `src/trainer-dashboard.jsx` | materialized log is normalized into `performanceRecords` |
| Manual log edit | `saveDetailed` -> `saveLogs` in `src/trainer-dashboard.jsx` | saved log is normalized into `performanceRecords` |
| Generic log save path | `saveLogs` in `src/trainer-dashboard.jsx` | changed log is normalized before persistence and progression |
| Realtime hydration | `buildRealtimeLogEntry` in `src/trainer-dashboard.jsx` | shadow row payload is normalized into `performanceRecords` |
| Blob/import/cache load | `buildCanonicalRuntimeState` in `src/services/persistence-adapter-service.js` | all logs are normalized into `performanceRecords` |
| Session log shadow sync | `syncSessionLogForDate` in `src/modules-auth-storage.js` | shadow `exercises` JSON is derived from canonical records |
| Exercise shadow sync | `syncExercisePerformanceRows` in `src/trainer-dashboard.jsx` | `exercise_performance` rows are derived from canonical exercise records |

## What Still Coexists Temporarily

These structures still exist, but they are no longer the intended canonical performance history:

- `logs[dateKey].strengthPerformance`
  Compatibility mirror for existing UI and shadow-row payloads.
- `personalization.strengthProgression`
  Still stores prescriptions, projected tracking, and pending notifications.
  This is progression state, not canonical performance history.
- `session_logs.exercises`
  Shadow-row storage format derived from canonical records for sync/realtime convenience.
- `exercise_performance`
  Shadow table derived from canonical exercise records.
- Legacy standalone log fields such as `weight`, `reps`, and `pushups`
  Read only as normalization fallbacks for older data.

## Practical Boundary Going Forward

- New adaptation logic should read from `performanceRecords`.
- New review surfaces should render from `performanceRecords`.
- Legacy mirrors should only exist at compatibility edges until those edges are retired.
