# Intake Redesign Execution

## Direction

FORMA intake now follows a `living-card` setup direction:

- one evolving setup surface
- one stable summary region
- one early plan-shape preview
- one explicit deterministic confirmation boundary

The goal was to make intake feel premium and shorter without rewriting the planner or weakening the goal-resolution contract.

## What Was Simplified

- The opening is featured-first instead of browse-first.
- Goal selection, week-one realities, and missing anchors now feel like one setup surface instead of separate chores.
- The user no longer has to pass through a visibly separate interpretation stop before seeing progress.
- The stable summary region keeps the evolving draft visible instead of making the user remember prior steps.
- The first 1 to 2 weeks are previewed before final build so the effort feels worth it sooner.

## What Stayed The Same

- Deterministic goal resolution still owns the canonical handoff.
- Explicit confirmation still gates writes to canonical goal state.
- Structured-first controls still lead when a field materially changes the first plan.
- The planner still builds from confirmed resolved goals, not from vague proposal-only text.

## Before Vs After

### Before

- intake felt like a sequence of chores
- the opening paid too much attention to template plumbing
- interpretation, clarify, and confirm felt more separate than they needed to
- plan payoff arrived too late

### After

- intake feels like one setup surface
- the goal path is clearer on first load
- exact-goal users move faster
- fuzzy-goal users see draft structure before commit
- the confirmation boundary still exists, but the visible flow feels tighter and calmer

## What Remains For Later

- broader visual cleanup of lower-traffic onboarding edge states
- more refined preview copy for niche goal families
- additional click-budget tuning for rare multi-goal and library-heavy flows

## Why This Was The Right Scope

This pass focused on the highest drop-off leverage:

- reduce visible friction
- increase trust
- show payoff sooner
- preserve deterministic safety

That keeps the intake safer to ship than a deeper architectural rewrite while still materially improving launch quality.
