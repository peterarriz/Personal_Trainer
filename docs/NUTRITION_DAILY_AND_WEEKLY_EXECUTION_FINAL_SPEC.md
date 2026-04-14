# Nutrition Daily And Weekly Execution Final Spec

## Daily Execution
The daily nutrition surface has two jobs:
- show today's targets and meal guidance
- let the user log what actually happened without implying adherence in advance

## Daily Actual Model
Daily actual logging now uses one coherent outcome model:
- `deviationKind`
- `issue`
- `note`
- `hydrationOz`
- `hydrationTargetOz`
- `supplementTaken`

`quickStatus` remains a derived compatibility field, not a separate user-facing state machine.

## Weekly Execution
The weekly surface must help with:
- meal pattern planning
- grocery staples
- prep structure
- travel and convenience fallbacks
- connection to the current training week

## Trust Rules
- Planned and actual nutrition stay separate.
- No adherence badge should imply success before the user logs an actual result.
- Weekly review should describe real drift patterns, not assume compliance.
