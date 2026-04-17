# Program Surface Endurance IA

## Consumer-first goal
The Program tab should answer these questions in order:

1. Where is this plan going over the next several months?
2. What phase am I in right now?
3. How is weekly endurance stress progressing?
4. If I also lift, where do those strength touches live?
5. What is the exact current-week and near-term prescription?

The old `Later Phases` block did not answer that well enough. It hid future work behind phase summaries instead of making weekly progression legible.

## Proposed IA
1. `15-Week Roadmap`
   Shows the next 15 weeks as the primary future-facing view.
   Each week exposes: week number, phase name, weekly focus, long-run target, long-run delta from the prior week, quality-session count, and strength-touch count.
   The current week is visually highlighted.

2. `Current Week Detail`
   Keeps near-term day-level detail.
   Adds a visible 7-day strip so the current day is obvious at a glance before the user reads the deeper session cards.

3. `Near-Term Adaptive Detail`
   Keeps the next 3 weeks inspectable at session level.
   This is no longer the main explanation of future structure. It is the drilldown.

4. `Week Review`
   Remains the trust layer for what was planned, what happened, and what changes next.

## Why this is better for endurance trust
- Endurance users can see long-run growth week by week instead of inferring it from block names.
- Hybrid users can see whether strength is still alive without opening each future week.
- The current week stays actionable, but the surface no longer treats future work as an afterthought.
- The roadmap is explicit that it is projected structure, not a promise that every later day is already final.

## Acceptance criteria

### Half-marathon user
- The Program tab shows a `15-Week Roadmap` as the primary future view.
- The roadmap exposes all 15 visible weeks, not just the next 3.
- Each roadmap week shows a phase label and a long-run target.
- Long-run growth is visible week to week through a delta label when comparable.
- The current week is visually distinct from the rest of the roadmap.
- The current-week strip shows exactly one `TODAY` marker.
- Near-term future weeks remain inspectable at day level below the roadmap.
- `Later Phases` is not the primary future-facing UI.

### Hybrid run-plus-strength user
- The roadmap still shows long-run progression.
- The roadmap also shows visible strength-touch counts for each week.
- The weekly focus copy does not read like pure race prep when strength is active.
- The current-week strip and near-term detail remain available exactly as for a pure endurance user.

## Proof hooks
- `program-roadmap`
- `program-roadmap-grid`
- `program-roadmap-week-{absoluteWeek}`
- `program-current-week-grid`
- `program-future-weeks`
