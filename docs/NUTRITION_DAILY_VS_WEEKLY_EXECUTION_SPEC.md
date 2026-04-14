# Nutrition Daily Vs Weekly Execution Spec

## Product Rule

Nutrition has two distinct jobs:

- `Today`: tell me what to do today and let me log what actually happened.
- `This week`: help me provision the week with practical grocery and prep support.

These jobs should not be blended into one wall of text.

## Today Nutrition

Default view:

- today's target
- one short rationale line
- quick actual logging
- hydration support
- explicit saved state

Rules:

- Planned and actual stay separate.
- The app must not imply adherence until the user confirms it.
- Save feedback is plain-English and timestamped.

## Weekly Nutrition / Grocery Planning

Weekly planning lives behind the `This week and grocery planning` disclosure.

It should show:

- weekly nutrition headline
- weekly adaptation line
- planned-vs-actual line
- grocery / provisioning support
- low-friction fallback ideas

Important rule:

- Grocery support must remain visible whenever the weekly planning section is opened.
- It must not disappear just because the current day is outside the shopping-day window.

## Relation To Training

Daily nutrition should reflect today's training load.

Weekly nutrition should reflect:

- current training week shape
- travel / convenience reality
- repeated under-fueling or hydration drift

One weak nutrition day should not rewrite the whole training week. Repeated trend signals may protect recovery or cap intensity.

## Verification

- `e2e/auth-and-management.spec.js`
- `e2e/mobile-surfaces.spec.js`
- nutrition review and comparison unit tests
