# Local-First Vs Signed-In Guarantees

Date: 2026-04-17
Scope: workout and nutrition logging trust paths across signed-out local use, later sign-in, and signed-in same-device reopen

## What The Product Browser-Proves Today

| Scenario | Guarantee | Evidence | Status |
| --- | --- | --- | --- |
| Signed out, logging locally on the same device | Workout and nutrition logs save into local storage and survive reload or reopen on that device. | `e2e/workout-adaptation-persistence.spec.js`, `e2e/nutrition-underfueled-persistence.spec.js` | Proven |
| Signed out first, then later sign in to an empty cloud account on the same device | Exact local workout and nutrition mutations are promoted without being dropped, duplicated, or reinterpreted. The proven fields are the workout note, workout status, nutrition note, nutrition deviation kind, and nutrition issue. | `e2e/signed-in-adaptation-trust.spec.js` - `blank-cloud sign-in preserves exact local workout and nutrition logs without loss, duplication, or reinterpretation` | Proven |
| After that blank-cloud sign-in, reopen again while signed in on the same device | The same device keeps the promoted logs and the adapted plan state. | `e2e/signed-in-adaptation-trust.spec.js` - `blank-cloud sign-in keeps workout-driven adaptation across signed-in same-device reopen`; `blank-cloud sign-in keeps nutrition-driven adaptation across signed-in same-device reopen` | Proven |

## What Local-First Mode Guarantees

- While signed out, the current device is the source of truth.
- Workout and nutrition logs are persisted locally before sign-in.
- Reloading or reopening on that same device keeps those local mutations.
- If the user later signs into a blank cloud account on that same device, the exact saved local mutations above are uploaded without changing their meaning.

## What Signed-In Mode Guarantees

- On the same device, after a successful blank-cloud sign-in, the signed-in experience keeps the same workout and nutrition mutations.
- The same-device signed-in reopen path is proven for both:
  - workout-driven adaptation
  - nutrition-driven adaptation
- In this proven path, the app does not reinterpret:
  - `skipped` workout logs as another workout outcome
  - `under_fueled` nutrition logs as another adherence category

## What Is Not Guaranteed Yet

- Cloud-only restore after sign-in, without the original device-local cache
- Safe merge when the user signs into an already-populated cloud account
- Signed-in degraded-sync reload or reopen without losing unsynced workout or nutrition detail
- Signed-in explicit recovery via `Reload cloud data` after retry/outage without losing unsynced workout or nutrition detail
- End-to-end retry recovery proof showing no duplicate adaptation after a degraded signed-in sync path

## Practical Trust Boundary

- Honest current claim:
  - local-first logging is trustworthy on the same device
  - later blank-cloud sign-in on that same device preserves those mutations exactly
  - same-device signed-in reopen after that transition is trustworthy
- Not honest current claim:
  - that all signed-in restores are equally proven across devices or after degraded sync
