# Intake Field Input Contract

## Purpose

Intake is structured-first. Every required field gets one primary answer shape. Natural language remains available when it helps, but it is always a fallback, never a competing default path.

## Core Rules

1. One field, one primary control.
2. Free text fallback is explicit through `Type instead`.
3. AI extraction is proposal-only.
4. Deterministic validation decides what is saved.
5. Goals are optional.
6. Running goals do not imply a race by default.
7. Missing data is allowed when the app can proceed safely in foundation or low-confidence mode.

## Primary Input Shapes

### Enumerated choice

Use chips or buttons.

Examples:

- benchmark kind
- proxy-metric kind
- yes / no / skip

### Number

Use a numeric field, optionally with unit toggles.

Examples:

- current run frequency
- bodyweight
- waist
- longest recent run

### Strength top set

Use the structured top-set widget first.

Examples:

- weight
- reps
- optional estimated-max mode

### Date or month

Use the timeline widget first.

- `Target month` uses native month input.
- `Exact date` uses native date input.
- Natural timeline entry is available only after explicit switch to `Type instead`.

## Timeline Rules

- Use exact date only when exact date matters.
- Use month/year when month precision is enough.
- A non-event running goal must not require a race date.
- A general consistency or foundation goal must not force a target date.

Examples:

- `I want to run more consistently` -> no race date required.
- `Half marathon in October` -> month/year is enough.
- `Race on May 18` -> exact date is accepted.

## Failure Handling

- A valid structured answer must still save even if server-side interpretation is unavailable.
- The user must never hit a dead end after a valid field answer.
- Repeated questions are prevented by field binding and transcript dedupe.
- A single answer only clears the bound field unless a deliberate structured multi-field save is defined and validated.

## UX Contract

- Default hint text explains the structured control in plain English.
- `Type instead` is present only when safe natural fallback exists.
- Natural fallback text is scoped: only the active field is eligible for extraction.
- Internal engine or schema terms must not appear in normal UI.

## Verification

Primary coverage:

- `tests/intake-machine-service.test.js`
- `tests/intake-goal-flow-service.test.js`
- `tests/intake-transcript-service.test.js`
- `e2e/intake.spec.js`
- `e2e/intake-test-utils.js`
