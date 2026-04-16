# Ideal Intake Flow

This document describes the current intended intake contract for the live app.

Use this together with:

- `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md`
- `docs/INTAKE_AI_BOUNDARY.md`
- `docs/INTAKE_FIELD_INPUT_CONTRACT.md`

## Current Runtime Notes

- Intake is a guided setup flow, not a fake chat transcript.
- The live entry point is goal-type-first, with custom text as a fallback rather than the default.
- The flow is structured-first: when a required field has a primary control, that control leads.
- The user sees ordered priorities, not lead/maintained/background lane jargon.
- Confirmation and plan build operate only on the active ordered goal stack.
- Open-ended goals remain valid. Not every goal needs a hard end date.

## Product Objective

By the time intake finishes, the app should have:

- the user’s raw goal intent
- an ordered priority stack the user understands
- the minimum anchors required for a credible first plan
- an honest timing shape: exact date, target horizon, or open-ended
- enough training-context reality to avoid obviously fake prescriptions
- explicit confirmation before canonical goal state is written

Intake should not:

- feel like chat theater
- bury users in schema language
- ask optional questions before the first plan is credible
- invent secondary goals or fake timing precision
- strand users if AI interpretation is unavailable

## High-Level Flow

### 1. Goal entry

The user starts with:

- a goal type selection for common paths
- a library-backed goal choice when one exists
- a custom goal path when the user needs it

The opening should feel like premium setup, not a transcript.

### 2. Inline anchor collection

Once the app knows the goal direction, it asks only for anchors that materially change the first plan.

Examples:

- running baseline
- swim access and recent swim benchmark
- current bodyweight or proxy metric
- current strength baseline
- days per week, session window, and training environment

### 3. Proposal and review

AI or deterministic interpretation may propose structure, but the app shows that as a reviewable draft.

The review step should clarify:

- the ordered priority stack
- what the app will optimize first
- what is supportive but still intentional
- what timing is known right now
- what is still uncertain

### 4. Confirmation

Only after explicit confirmation does the app:

- finalize resolved goals
- finalize ordered priorities
- finalize timing shape
- hand off canonical planner-facing state

## Priority Language

User-facing intake should use:

- `Priority 1`
- `Priority 2`
- `Priority 3`
- `Later priority`

Avoid older phrasing like:

- `lead goal`
- `maintained goal`
- `background goal`
- `deferred lane`

Internal arbitration can still use those terms, but the setup UI should not lean on them.

## Timing Rules

Timing should be honest and minimal.

Supported shapes:

- `Exact date`
- `Target horizon`
- `Open-ended`

Rules:

- race or event goals may need a real date or month window
- body-composition or general-fitness goals do not need a fake deadline
- open-ended goals still deserve a real first plan
- the visible 12-week plan is not the same thing as the full goal deadline

User-facing language should make that explicit:

- `No fixed deadline. We will treat this as an ongoing goal and show the next phase in the visible plan.`

## AI Boundary Inside Intake

AI is allowed to:

- interpret messy wording
- suggest structure
- propose metrics
- suggest a timing shape
- surface missing clarifications

AI is not allowed to:

- write canonical goals directly
- decide the final priority order without confirmation
- bypass deterministic validation
- create plan state by itself

If the intake gateway fails, the local deterministic path still has to keep the user moving.

## Structured-First Contract

Required fields should use one primary control each.

Examples:

- date or month input for time-bound goals
- numeric input for baseline quantities
- top-set widget for strength baseline
- chips or buttons for small enumerated choices

Natural language is still allowed, but only through an explicit fallback like `Type instead`.

## Minimum Questions

Ask only what changes the first plan materially.

Ask now:

- primary goal direction
- priority order when multiple goals matter
- training frequency and session window
- environment and equipment when they affect exercise selection
- baseline anchors that materially change starting dose or safety

Defer until later if they do not block credibility:

- nice-to-have style nuance
- optional deeper metrics
- secondary optimization details
- aspirational future goals that are not active priorities yet

## Confirmation Copy Contract

The confirmation surface should answer:

- what the planner is optimizing first
- what else is still being balanced
- what the first plan is planning around
- whether timing is exact, horizon-based, or open-ended
- whether anything important is still unknown

It should not:

- dump internal tokens
- expose role jargon
- sound like the AI is the source of truth

## Hand-Off To Planning

After confirmation, the handoff is:

`raw goal intent -> interpreted proposal -> confirmed resolved goals -> ordered priorities -> planner`

The planner then owns:

- ProgramBlock
- WeeklyIntent
- PlanWeek
- PlanDay
- adaptation from actual behavior

## Verification

Primary runtime and contract coverage:

- `tests/intake-goal-flow-service.test.js`
- `tests/intake-entry-service.test.js`
- `tests/intake-transcript-service.test.js`
- `tests/ai-boundary-regression.test.js`
- `e2e/intake.spec.js`
