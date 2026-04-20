# Hybrid-Day Today Compositions

Visual mocks live in [docs/codex-audits/hybrid-day-today-compositions.html](./codex-audits/hybrid-day-today-compositions.html).

## Non-Negotiables

- A hybrid day is one coached session, not two stacked chores.
- Today gets one primary touchpoint with one combined duration.
- The session arc is always visible: what comes first, what follows, and why that order matters.
- The rationale is shared across the full session, not split into run copy and lift copy.
- Log inherits the same headline, arc, and session logic so the user feels like they are finishing the same workout they were shown on Today.

## Composition 1: Prime -> Build

Use this when the run is the higher-value adaptation and the strength work is there to reinforce positions, tissue tolerance, or supporting force without stealing freshness from the run.

- Best for: race prep, quality-run days, return-to-running blocks, and any day where pace, mechanics, or aerobic quality matter more than absolute load.
- Today rule: lead with the run, show the lift as the deliberate finish, and keep the total session framed as one clean build from fast feet to loaded positions.
- Log rule: keep one `Session actuals` container, show `Stage 1` run capture first, then `Stage 2` lift capture, with one shared feel and one total-duration closeout.

## Composition 2: Load -> Flush

Use this when the lift is the money work and the run exists to flush, extend aerobic volume, or close the day without compromising force production.

- Best for: main-lift progressions, lower-body strength blocks, re-entry to heavy lifting, and confidence-building days where quality under load must happen while the user is fresh.
- Today rule: lead with the lift, show the run as the recovery finish, and explain that the aerobic work supports the block instead of competing with it.
- Log rule: keep one `Session actuals` container, show `Stage 1` lift execution first, then `Stage 2` run capture, with the same total-duration rail and one save moment.

## Composition 3: Weave -> Finish

Use this when the point of the day is hybrid athleticism or density, and the work should feel continuous rather than sequential.

- Best for: tight time windows, general-athletic goals, hybrid conditioning days, and circuit-style sessions where neither lane needs maximal freshness.
- Today rule: show repeating mixed blocks instead of separate run and strength lanes, so the user understands the day as one continuous engine-plus-force session.
- Log rule: keep one `Block tracker` container where each block carries both its run split and strength completion, then close with one feel and one total-duration save.

## Selector

- If the run outcome is primary and the lift is supportive, use `Prime -> Build`.
- If the lift outcome is primary and the run is easy support, use `Load -> Flush`.
- If time is compressed or the day is intentionally mixed, use `Weave -> Finish`.

## Guardrail

Do not use `Weave -> Finish` when either lane needs true maximal freshness, high technical precision, or heavy exposure that would be weakened by interleaving.
