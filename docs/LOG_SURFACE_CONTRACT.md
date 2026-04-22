# Log Surface Contract

## Product job

Log answers one question: `What actually happened?`

It owns:
- prescribed vs actual session review
- completion outcome
- workout actuals
- substitutions
- notes and recovery signals

It does not own:
- plan generation
- weekly roadmap context
- Today-style prescription coaching

## Source of truth

The authoritative structured workout log lives in:
- `logs[dateKey]`

The adaptation-friendly daily mirror is derived from the Log save path and written to:
- `dailyCheckins[dateKey]`

Log save must keep those two in sync without inventing a second manual entry flow.

## Visible structure

The active Log screen should render:
1. one compact prescribed summary card
2. one completion selector: `Completed / Partial / Skipped / Swapped`
3. modality-aware actual inputs
4. one compact trust row
5. optional notes and recovery signals
6. one clear sticky save action

## Logging rules

- `Completed` should auto-resolve to `as prescribed` or `modified` based on actuals.
- `Swapped` is for a genuinely different session or modality, not a hacked rename.
- Strength logging should preserve prescribed rows and actual rows separately.
- Cardio logging should preserve prescribed intent while allowing substitute modality.
- Recovery or mobility-only work must be loggable without pretending it was strength.

## Persistence rules

- Saving from Log must serialize deterministic actual fields, not only notes.
- Saving must mirror blocker / readiness / feel signals into `dailyCheckins`.
- Reopening the same day must rebuild the UI from saved data cleanly.
- Today must not host a parallel mini-log system.
- Log trust should stay compact: `Prescribed loaded`, current actual state, and `Used later`.

## Test coverage

Unit coverage:
- `tests/workout-log-form-service.test.js`
- `tests/checkins-trust-model.test.js`

Browser coverage:
- `e2e/log-prescribed-workflow.spec.js`

Required browser paths:
- full prescribed completion
- shortened modified workout
- cardio substitute
- reopen and confirm saved state persists
