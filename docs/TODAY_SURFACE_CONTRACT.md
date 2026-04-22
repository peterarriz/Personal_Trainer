# Today Surface Contract

## Product job

Today answers one question: `What should I do right now?`

It does not own:
- workout logging
- weekly planning context
- long-form coach explanation
- duplicate summaries of the same prescription

## Source of truth

Today is driven from the canonical `PlanDay` runtime:
- prescribed training: `planDay.resolved.training`
- current display summary: `planDaySurfaceModels.today.display` when present
- canonical reasoning lines: `planDaySurfaceModels.today`

The visible Today view-model is built in:
- `src/services/today-prescription-surface-service.js`

The screen renderer lives in:
- `src/trainer-dashboard.jsx` inside `TodayTab`

## Visible structure

First load should show only:
1. compact header with date and `Today's Plan`
2. focus line
3. one-sentence `Why today`
4. one compact trust row
4. one workout representation
5. short `Rules for today`
6. compact `Adjust Today`

## Adjustment model

`Adjust Today` is an overlay on the prescribed day, not a new source of truth.

Adjustment state is:
- local to the current day
- persisted in session storage
- deterministic from the current prescribed day plus the chosen adjustment toggles

Supported adjustments:
- short on time
- low energy
- legs sore
- upper body sore
- low impact
- treadmill, bike, elliptical substitutions
- swap exercise
- push a little harder
- temporary setup override for today only

## Rendering rules

- `Why today` should stay to one sentence unless a true edge case forces more.
- Trust context should stay to short chips such as `Recent workouts`, `Time cap`, or `Sore legs`.
- Strength and hybrid days should collapse into `3-5` blocks, not one block per lift.
- Recent-session context should appear only when it materially changes the prescription.
- The page should show exactly one visible workout plan.

## Guardrails

Browser and contract checks live in:
- `src/services/surface-clarity-contract.js`
- `tests/surface-clarity-contract.test.js`
- `e2e/surface-clarity-guard.spec.js`
- `e2e/today-surface.spec.js`

## Test expectations

Unit coverage should prove:
- the Today prescription model stays concise
- strength and hybrid days stay inside the block budget
- adjustments rewrite the visible prescription deterministically

Browser coverage should prove:
- baseline Today renders one prescription surface
- `Short on time` rewrites the visible plan
- `Low energy` rewrites the visible plan conservatively
