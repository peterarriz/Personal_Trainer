# Workout Source Of Truth Finalization

## Goal

Today, Program, and Log must read the same planned session contract for the live day.

## Canonical Contract

- The canonical planned session for the current day is the resolved `PlanDay` training object.
- Presentation for that session must be derived through `buildDayPrescriptionDisplay(...)`.
- Detailed logging must be seeded from `buildWorkoutLogDraft(...)`, which now carries `plannedSummary` from the same display contract.

## Current-Day Rules

- Today renders the planned session from `todayPrescriptionSummary`.
- Program overlays the current-day row with the live `PlanDay` session before rendering current-week drill-in.
- Log detailed capture renders the same planned session card before actual-entry fields.
- For run-plus-strength days, all three surfaces must receive the same prescribed strength rows via `buildStrengthPrescriptionEntriesForLogging(...)`.

## Summary-Only Fallback

- Summary-only rendering is allowed only when the stored training object truly lacks structured rows.
- It is no longer the default fallback for common supported session types.
- Run, swim, power, and supported strength sessions should expose grouped session blocks.

## Logging Contract

- Quick logging remains a fast completion path.
- Detailed logging is seeded from the same canonical planned session shown on Today and Program.
- Planned and actual remain separate in both storage and copy.
- Legacy generic fields must not override a run-day planned family or fabricate strength rows.

## Acceptance Checks

- The planned session card text matches across Today, Program current-week drill-in, and Log detailed capture for the live day.
- Run-only days do not seed generic push-up rows from stale legacy log fields.
- Detail naming stays simple: quick complete, quick details, detailed workout log.

## Implemented In

- `src/services/day-prescription-display-service.js`
- `src/services/workout-log-form-service.js`
- `src/trainer-dashboard.jsx`
- `tests/day-prescription-display-service.test.js`
- `tests/workout-log-form-service.test.js`
- `e2e/mobile-surfaces.spec.js`
