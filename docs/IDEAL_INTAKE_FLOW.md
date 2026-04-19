# Ideal Intake Flow

This document describes the current shipped intake contract for the live app.

Use this together with:

- `docs/INTAKE_AI_BOUNDARY.md`
- `docs/INTAKE_FIELD_INPUT_CONTRACT.md`
- `docs/INTAKE_REDESIGN_EXECUTION.md`

## Current Runtime Notes

- Intake is goal-first, structured-first, and explicitly not a fake chat transcript.
- The visible shell is one living setup surface: a main action card, a stable summary region, and a footer action layer.
- The first screen leads with featured goal families and featured paths. The full goal library is still available, but it is no longer the first thing a user has to browse.
- The summary region stays visible across the flow and answers:
  - `What you said`
  - `What we'll optimize first`
  - `What we'll track`
  - `What's still open`
- A draft plan-shape preview appears before final build so the user can see the first two weeks take shape before committing.
- Explicit confirmation still gates the canonical handoff. The planner does not consume proposal-only state.

## Product Objective

By the time intake finishes, the app should have:

- the user’s raw goal intent
- an ordered priority stack the user understands
- the minimum anchors required for a credible first plan
- enough training-context reality to avoid obviously fake week-one prescriptions
- a visible draft plan shape
- explicit confirmation before canonical goal state is written

Intake should not:

- feel like chat theater
- look like a giant form
- bury the first payoff behind logistics
- invent fake certainty for fuzzy goals
- write canonical planning state before the user confirms

## Shipped Flow

### 1. Choose the closest goal path

The opening surface should let the user move quickly in one of two ways:

- tap a featured goal path
- write a custom goal when the featured paths miss

The opening should feel like premium setup, not like a transcript or a schema browser.

### 2. Tighten only the week-one realities

The main card then asks only for details that materially change the first plan:

- experience level
- training days
- session length
- training environment
- home equipment when needed
- injury or recovery limits when they matter

The flow should stop collecting once the first plan is credible.

### 3. Keep the draft visible while clarifying

The stable summary region stays visible while the user moves from goal selection into clarify.

It should keep the user oriented around:

- the active goal stack
- the first thing the plan will optimize
- what will be tracked at the start
- what still needs one more answer

### 4. Show plan shape before build

Before final build, the intake surface should show a credible preview of the first 1 to 2 weeks.

That preview is read-only and should help the user answer:

- what week one will feel like
- whether the current direction looks believable
- what the next milestone is

The preview is meant to create trust and payoff before the final handoff.

### 5. Confirm, then build

Only after explicit confirmation may the app:

- finalize resolved goals
- finalize ordered priorities
- finalize timing shape
- write canonical planner-facing state
- generate the first real plan

## Stable Summary Region Contract

The summary region is the trust anchor of the intake.

It should always answer:

- `What you said`
- `What we'll optimize first`
- `What we'll track`
- `What's still open`

If a section is still incomplete, the UI should say so plainly instead of faking precision.

## Fast Paths

### Exact-goal users

If the user already knows the target, the flow should behave like:

1. choose the closest featured path or enter a precise custom goal
2. fill only the missing anchors that change week one
3. see the draft preview
4. confirm
5. build

This path should feel fast and intentional, not slowed down by generic follow-ups.

### Fuzzy-goal users

If the user starts broad, the flow should behave like:

1. choose the closest family or write the broad goal
2. see how FORMA is interpreting the direction through the live summary
3. answer only the small number of anchors needed to make week one real
4. see the draft preview
5. confirm

This path should not pretend the user gave exact metrics they did not give.

## AI Boundary Inside Intake

AI is allowed to:

- interpret messy wording
- suggest structure
- surface missing clarifications
- help produce a proposal-only draft

AI is not allowed to:

- write canonical goals directly
- bypass deterministic validation
- finalize the goal order without confirmation
- create planner-facing state by itself

If the intake AI path is unavailable, deterministic structured controls still need to carry the user through build.

## Structured-First Contract

Required fields should use one primary control each.

Examples:

- chips for small enumerated choices
- numeric controls for baseline quantities
- date or month input for time-bound goals
- structured strength-baseline controls

Natural language is still allowed, but it should be a fallback, not the default shell.

## Confirmation Copy Contract

The confirmation-ready intake state should answer:

- what the plan is optimizing first
- what else is still being balanced
- what the first plan is planning around
- what is still unknown
- what the first weeks are likely to look like

It should not:

- dump internal tokens
- expose role jargon
- sound like the AI is the source of truth

## Hand-Off To Planning

The handoff remains:

`raw goal intent -> proposal-only draft -> confirmed resolved goals -> ordered priorities -> planner`

The planner then owns:

- ProgramBlock
- WeeklyIntent
- PlanWeek
- PlanDay
- later adaptation from actual behavior

## Verification

Primary runtime and contract coverage:

- `tests/intake-entry-service.test.js`
- `tests/intake-machine-service.test.js`
- `tests/intake-plan-preview-service.test.js`
- `e2e/intake.spec.js`
- `e2e/intake-one-screen.spec.js`
- `e2e/mobile-surfaces.spec.js`
