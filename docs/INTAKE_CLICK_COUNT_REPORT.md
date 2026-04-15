# Intake Click Count Report

This report captures the expected click-count change for the redesigned intake goal step before any follow-up clarification fields.

## Contract counts

| Goal path | Previous clicks | New clicks | Reduction |
| --- | ---: | ---: | ---: |
| Run a 5K | 9 | 6 | 3 |
| Run a faster 5K | 9 | 6 | 3 |
| Half marathon | 9 | 6 | 3 |
| Bench 225 | 9 | 6 | 3 |
| Gain muscle | 9 | 6 | 3 |
| Lose 10 lb | 9 | 6 | 3 |
| Look athletic again | 9 | 6 | 3 |
| Swim a faster mile | 9 | 6 | 3 |
| Get back in shape | 9 | 6 | 3 |
| Custom fallback | 8 | 5 | 3 |

## What changed

- Goal type selection now leads the flow instead of free-text or a full-library browse.
- Common paths use a featured goal card instead of category-plus-template-plus-extra-continue.
- Coaching tone is optional and defaults to `Balanced coaching`.
- The separate interpretation stop is no longer required before clarify or review.

## Verification note

- The current-flow contract above is revalidated by the starter-path unit tests in `tests/intake-entry-service.test.js` and the live goal-library/browser paths in `e2e/intake-goal-library.spec.js`.
- The `Previous clicks` column remains the historical baseline from the pre-rebuild flow; that legacy UI no longer exists locally to re-measure side by side.
