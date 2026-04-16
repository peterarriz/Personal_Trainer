# Adversarial Product Review And Perfection Roadmap

This document records the repo-grounded hardening pass that focused on the remaining trust breakers: auth lifecycle, cloud degradation, intake resilience, daily execution completeness, nutrition weekly usefulness, metrics editability, theme credibility, and broad adversarial validation.

## Audit Summary

| ID | Severity | Surface | Problem | Files / Modules | Status |
| --- | --- | --- | --- | --- | --- |
| PROD-001 | blocker | cloud | Transient Supabase failures spammed the UI with fallback noise and could make the product feel broken on open. | `src/modules-auth-storage.js`, `src/trainer-dashboard.jsx` | Fixed |
| PROD-002 | blocker | auth | Logout was missing from the normal flow. | `src/trainer-dashboard.jsx` | Fixed |
| PROD-003 | blocker | auth | Delete account removed app rows but did not guarantee account deletion semantics or clean local invalidation. | `api/auth/delete-account.js`, `src/modules-auth-storage.js`, `src/trainer-dashboard.jsx` | Fixed |
| PROD-004 | high | signup/profile | Email auth could drop the user into the app with an under-specified profile. | `src/trainer-dashboard.jsx`, `src/services/canonical-athlete-service.js` | Fixed |
| PROD-005 | blocker | intake | Mixed-mode intake steps presented structured controls and natural text as equal primary paths, especially on timeline fields. | `src/trainer-dashboard.jsx`, `src/services/intake-machine-service.js` | Fixed |
| PROD-006 | high | intake | Server-side interpretation failure could strand the user even after a valid answer. | `src/trainer-dashboard.jsx`, `src/services/intake-machine-service.js`, `e2e/intake.spec.js` | Fixed |
| PROD-007 | high | Today | Today still hid part of the prescribed workout and forced a Program detour for execution. | `src/services/day-prescription-display-service.js`, `src/trainer-dashboard.jsx` | Fixed |
| PROD-008 | high | Log | Fast logging had regressed away from useful plan prepopulation. | `src/trainer-dashboard.jsx`, logging helpers, browser tests | Fixed |
| PROD-009 | high | Nutrition | Weekly grocery/provisioning support was too conditional and daily logging could imply adherence too early. | `src/trainer-dashboard.jsx` | Fixed |
| PROD-010 | high | metrics/trust | Users could not inspect or override key planning assumptions without restarting intake. | `src/services/metrics-baselines-service.js`, `src/modules-planning.js`, `src/trainer-dashboard.jsx` | Fixed |
| PROD-011 | high | themes | Multiple theme options felt duplicated and light mode was not curated enough. | `src/services/brand-theme-service.js`, `tests/brand-theme-service.test.js` | Fixed |
| PROD-012 | high | support-tier honesty | The app did not clearly separate first-class, bounded, and exploratory goal support. | `src/services/support-tier-service.js`, `src/modules-planning.js`, `src/trainer-dashboard.jsx` | Fixed |
| PROD-013 | high | validation breadth | There was no broad deterministic pressure test across many athlete types and failure modes. | `src/services/synthetic-athlete-lab/*`, `scripts/run-synthetic-athlete-lab.js` | Fixed |

## What Changed

### Tier 1: Trust and lifecycle

- Added visible logout in Settings.
- Added real server-backed account deletion through `/api/auth/delete-account`.
- Cleared cached auth state and local runtime cache on delete.
- Prevented local cache repopulation during delete-account teardown by suspending persistence until a fresh sign-in or explicit local-mode continuation.
- Reclassified transient cloud errors as `SYNC RETRYING` so the product stays usable and calm in degraded mode.
- Reduced chatty shadow sync by fingerprinting goals and coach memory before attempting cloud writes.

### Tier 2: Intake and execution

- Added progressive signup and post-auth profile setup for name, units, timezone, birth year, height, weight, training age, environment, equipment, and session length.
- Tightened intake around a structured-first field contract with explicit `Type instead` fallback.
- Kept running goals optional and removed any universal race-date assumption.
- Kept server interpretation proposal-only so deterministic field writes still succeed when AI enhancement is unavailable.
- Restored full workout visibility on Today and preserved a fast logging path.
- Restored planned workout prepopulation for logging instead of forcing blank actual capture.

### Tier 3: Daily and weekly usefulness

- Split Nutrition into clear daily execution and weekly planning jobs.
- Ensured weekly grocery support remains visible whenever the weekly nutrition disclosure is opened.
- Added a secondary Metrics / Baselines management screen with provenance labels and plan-impact messaging.
- Added support-tier messaging so the app stays honest about domain maturity.
- Upgraded the curated theme system to 10 materially distinct identities with test coverage for real token differences.

### Tier 4: Pressure testing

- Added a deterministic synthetic-athlete lab with a 100-persona long-horizon release gate.
- Added clustered failure reporting and subsystem heatmaps.
- Added browser coverage for signup, logout, delete account, theme changes, weekly nutrition visibility, mobile surfaces, and intake structured-field behavior.

## Manual Smoke Priorities

Run the full checklist in `docs/MANUAL_SMOKE_TEST_CHECKLIST.md`, then add these high-risk passes:

- Sign up, complete profile setup, complete intake, and confirm Today is usable immediately.
- Delete account, confirm `trainer_auth_session_v1` and `trainer_local_cache_v4` are cleared, then verify the same email must sign up again.
- Force a transient cloud failure and confirm the UI settles into `SYNC RETRYING` without thrashing primary surfaces.
- Open Today and confirm the full workout is executable without leaving the tab.
- Open Nutrition weekly planning and confirm grocery support is visible even outside the shopping-day window.
- Change a baseline metric in Settings and confirm Today / Program visibly replan.
- Switch between several themes in dark and light mode and confirm the UI actually changes.

## Remaining Risks

- The dashboard still carries too much responsibility inside `src/trainer-dashboard.jsx`, so regression risk is lower than before but still not low.
- Account deletion depends on a working server environment with a valid Supabase service-role secret.
- The synthetic-athlete lab is deterministic and broad, but it is still a simulation. It complements browser tests; it does not replace real device QA.
