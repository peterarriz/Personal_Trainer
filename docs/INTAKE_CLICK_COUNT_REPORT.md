# Intake Click Count Report

This report captures the shipped click-count contract for the redesigned intake opening and the first visible payoff.

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

## First-payoff contract

The redesign is not only about fewer taps. It is also about showing useful payoff before final build.

Current contract:

- the stable summary region is visible from the opening screen
- the plan-shape preview becomes visible once the goal path and minimum week-one realities are in place
- the featured fast path reaches a visible draft preview within 7 primary taps

## What changed

- Goal type selection leads the flow instead of free-text or a full-library browse.
- Common paths use featured goal cards instead of category-plus-template-plus-extra-continue.
- The summary region stays visible instead of appearing late as a separate review stop.
- The separate interpretation stop is no longer required before clarify or review.
- The user can see the first two weeks take shape before final build.

## Verification note

- Starter-path contract coverage lives in `tests/intake-entry-service.test.js`.
- Preview contract coverage lives in `tests/intake-plan-preview-service.test.js`.
- The live fast-path and preview contract are revalidated in `e2e/intake-one-screen.spec.js`.
- The broader shipped intake flow is revalidated in `e2e/intake.spec.js` and `e2e/mobile-surfaces.spec.js`.
- The `Previous clicks` column remains the historical baseline from the pre-rebuild flow; that legacy UI no longer exists locally to re-measure side by side.
