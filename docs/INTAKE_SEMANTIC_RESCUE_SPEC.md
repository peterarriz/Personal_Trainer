# Intake Semantic Rescue Spec

## Structured-First Contract
- Each intake field gets one primary input mode.
- Free-text fallback exists only behind an explicit `Type instead` switch.
- Date timelines prefer a native month or date input before natural-language parsing.
- Enumerated choices stay chip/button-first by default.

## Optionality Rules
- Goals are not forced to be event goals.
- Running goals can proceed without an exact race date when the user is not pursuing an event.
- Month/year is acceptable when month precision is enough.
- Exact date is only required when exactness materially affects planning.

## Semantic Fidelity Rules
- Raw goal intent remains inspectable.
- Normalized interpretation must stay faithful to the raw intent.
- Implausible parse outputs must be flagged or blocked instead of silently accepted.
- Deterministic field saves must not dead-end just because AI enhancement fails.

## Regression Cases Covered
- `run a 30 minute marathon` must stay a marathon-time goal and preserve `0:30:00`.
- `bench press 225 lbs, not 45 lb dumbbells` must keep `225` as the benchmark target.

## UX Rules
- Keep prompts short and field-scoped.
- Avoid giant gate speeches before the next concrete question.
- Review summaries should stay concise and human-readable.
