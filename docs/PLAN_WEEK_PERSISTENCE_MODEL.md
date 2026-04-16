# PlanWeek Persistence Model

For the higher-level planning contract, read `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md` first.

`PlanWeek` is now persisted as a first-class durable record for committed weeks.

This does not replace the in-memory planner. It gives the existing planner a durable week-history layer so historical review does not have to reconstruct prior weeks from templates.

Hierarchy:

`UserProfile -> Goals -> ProgramBlock -> WeeklyIntent -> PlanWeek -> PlanDay -> prescriptions -> actuals`

Durable history:

`PlanWeek -> persisted PlanWeek record -> weekly review surfaces`

## Purpose

The persistence layer exists to answer two different questions cleanly:

- "What is the current or historical committed week plan?"
- "What does the future horizon currently project?"

Those are not the same thing.

Committed `PlanWeek` records are durable.
Projected future weeks remain in-memory planning previews.

## Persisted Record Shape

Each stored week record lives under `runtimeState.planWeekRecords`.

Map shape:

```js
{
  "4": {
    model: "plan_week_record",
    historyVersion: 1,
    weekKey: "4",
    weekNumber: 4,
    absoluteWeek: 4,
    startDate: "2026-04-06",
    endDate: "2026-04-12",
    commitment: "committed",
    durability: "durable",
    sourceType: "current_plan_week",
    firstCommittedAt: 1712664000000,
    lastCommittedAt: 1712664000000,
    weeklyCheckin: {
      energy: 4,
      stress: 2,
      confidence: 4,
      ts: 1712664000000
    },
    summary: "Run quality leads the week while strength stays supportive.",
    record: {
      id: "plan_week_4",
      weekNumber: 4,
      absoluteWeek: 4,
      phase: "BUILDING",
      label: "BUILDING - Week 4",
      status: "planned",
      adjusted: false,
      architecture: "race_prep_dominant",
      programBlock: { ... },
      weeklyIntent: { ... },
      sessionsByDay: { ... },
      constraints: [ ... ],
      summary: "Run quality leads the week while strength stays supportive.",
      source: {
        sessionModel: "canonical_week_pattern",
        planningModel: "program_block",
        hasCanonicalSessions: true
      }
    }
  }
}
```

## Save / Load Behavior

- The canonical runtime state now includes `planWeekRecords`.
- The persistence adapter saves `planWeekRecords` into the same durable trainer payload as logs, check-ins, and prescribed-day history.
- Load normalization treats missing `planWeekRecords` as `{}` so older payloads still restore safely.
- Legacy raw week snapshots can be normalized into the new record envelope as `legacy_backfill` durability when needed.

## Committed vs Projected

Committed:

- the current week once a canonical `PlanWeek` exists in runtime
- older weeks that were previously current and were already committed
- archived committed week history when a plan arc is reset

Projected:

- future horizon rows
- template-derived preview weeks
- directional placeholders

Projected weeks are intentionally not written into `planWeekRecords`.

That means:

- Program can trust committed week history as durable review data
- future previews can stay flexible without pretending they are historical fact

## UI Usage

Program now:

- treats the current week as a committed week when a durable record exists
- shows committed week history from persisted records
- keeps future week preview explicitly marked as projected

Log / review now:

- shows committed week history from durable records when available
- uses archived `planWeekHistory` for old plan arcs when present
- falls back to older prescribed-day history only when archived week history is missing

## Remaining Fallbacks

These still exist intentionally:

- `resolveProgramDisplayHorizon(...)` / `buildFallbackProgramPreviewWeeks(...)` for projected future preview when canonical horizon rows are unavailable
- historical review fallback to `weeklyCheckins` and current derived week context when old payloads do not yet have `planWeekRecords`
- archive-era fallback to `prescribedDayHistory` and legacy planned-day reconstruction when older archives lack `planWeekHistory`

## Follow-Up

- Add optional week-level revision history if intra-week plan evolution needs a durable timeline, not just the latest committed snapshot
- Persist richer week review summaries if long-term analytics should avoid recomputing even actual outcome summaries from logs
- Continue migrating archive-era review toward committed week history so fewer older arcs rely on prescribed-day-only fallbacks
