# Plan Surface Contract

Plan is the orientation surface.

It answers:
- what this week is trying to do
- where today fits
- what key sessions are still coming
- what is committed now versus still preview-only

It does not own:
- the full Today prescription
- workout logging
- long rationale essays

## Content model

1. `Plan` hero
   - committed week label
   - one weekly intent line
   - current-day context in one quiet block
   - compact trust row for week state
   - goal-alignment tiles
   - direct links to `Today` and `Log`

2. `Visible arc`
   - current week plus a short preview strip
   - current week marked `Committed`
   - later weeks marked `Preview`

3. `This week`
   - compact 7-day weekly grid
   - status states on each day
   - one detail panel for the selected day
   - compact trust row for committed vs adaptive vs preview state
   - no full Today prescription duplication
   - upcoming key sessions list

4. `Next week preview`
   - one forecast card
   - preview-only day statuses
   - compact detail panel for orientation only

## Status rules

- `Completed`: the committed day was logged as prescribed.
- `Adjusted`: the committed day changed through live planning or the logged session differed from plan.
- `Missed`: the committed day was skipped or left unresolved beyond the logging window.
- `Recovery`: the day is intentionally light or off.
- `Upcoming`: the committed day is still ahead.
- `Preview`: the day belongs to a future forecast week and is not locked.

## Guardrails

- Plan can show one-line day context, but not the full Today workout blocks.
- Plan can deep-link to `Today` and `Log`, but it is not a secondary logging surface.
- Forecast weeks must always read as preview-only and never look committed.
