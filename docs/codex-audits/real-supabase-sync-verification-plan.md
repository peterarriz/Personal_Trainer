# Real Supabase Sync Verification Plan

This is the non-mocked browser harness for FORMA sync trust. It uses a real Supabase staging project and a real signed-in test account.

Primary harness:

- [e2e/real-sync-staging.spec.js](<C:/Users/Peter/Documents/Personal_Trainer/e2e/real-sync-staging.spec.js>)
- [e2e/real-sync-staging-helpers.js](<C:/Users/Peter/Documents/Personal_Trainer/e2e/real-sync-staging-helpers.js>)

Supporting config:

- [playwright.config.js](<C:/Users/Peter/Documents/Personal_Trainer/playwright.config.js>)
- [package.json](<C:/Users/Peter/Documents/Personal_Trainer/package.json>)

## Required Environment

The harness skips unless all of these are set:

- `FORMA_E2E_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_TEST_EMAIL`
- `SUPABASE_TEST_PASSWORD`

PowerShell example:

```powershell
$env:FORMA_E2E_BASE_URL="https://forma-staging.example.com"
$env:SUPABASE_URL="https://your-staging-project.supabase.co"
$env:SUPABASE_ANON_KEY="..."
$env:SUPABASE_TEST_EMAIL="sync-staging@forma.test"
$env:SUPABASE_TEST_PASSWORD="..."
npm run e2e:sync:staging
```

## Exact Test Data

The harness seeds a deterministic baseline into `trainer_data` before the browser work starts.

| Field | Seed value | Edited value |
| --- | --- | --- |
| Fixed browser time | `2026-04-17T12:00:00.000Z` | unchanged |
| Workout date key | `2026-04-17` | unchanged |
| Nutrition date key | `2026-04-16` | unchanged |
| Profile name | `FORMA Sync Seed Athlete` | `FORMA Sync Seed Athlete Updated` |
| Primary goal id | `goal_sync_primary` | unchanged |
| Primary goal summary | `Run a stronger half marathon` | `Run a 1:45 half marathon with explicit sync proof` |
| Workout status | empty | `skipped` |
| Workout note | empty | `Staging sync verification workout note` |
| Nutrition note | empty | `Staging sync verification nutrition note` |
| Nutrition deviation kind | empty | `under_fueled` |
| Nutrition issue | empty | `hunger` |

## Exact Browser Steps

1. Sign into Supabase directly through REST with the staging test account.
2. Delete the test user’s existing `trainer_data`, `goals`, and `coach_memory` rows.
3. Seed one deterministic `trainer_data` row with completed onboarding and one running goal.
4. Open browser context 1 with:
   - cleared `trainer_auth_session_v1`
   - cleared `trainer_local_cache_v4`
   - `trainer_debug=1`
   - `window.__E2E_SYNC_TEST = true`
   - frozen browser date `2026-04-17T12:00:00.000Z`
5. Load the app from `FORMA_E2E_BASE_URL`.
6. Sign in through the real UI with `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD`.
7. Verify the signed-in local cache matches the seeded cloud snapshot.
8. Edit profile display name in `Settings > Profile`.
9. Poll real Supabase until the cloud row reflects the new profile name.
10. Edit the first goal summary in `Settings > Goals`.
11. Poll real Supabase until the cloud row reflects the new goal summary.
12. Save a Today quick log with status `Skipped` and the exact workout note above.
13. Poll real Supabase until the cloud row reflects the workout status and note.
14. Save a Nutrition quick log on `2026-04-16` with `Under-fueled`, `Hunger`, and the exact nutrition note above.
15. Poll real Supabase until the cloud row reflects the nutrition note, deviation kind, and issue.
16. Refresh browser context 1.
17. Verify context 1 local cache and visible UI still match the expected snapshot.
18. Open browser context 2 with a clean auth/local state and the same debug hooks.
19. Load the app and sign in through the real UI again.
20. Refresh browser context 2 after sign-in.
21. Verify context 2 local cache and visible UI exactly match the expected snapshot.
22. Fetch `trainer_data` from Supabase one final time and verify the cloud row still matches the same expected snapshot.

## Pass / Fail Assertions

The run passes only if all of these are true:

- The first browser can sign in through the real auth UI.
- The seeded baseline loads from real Supabase into the first browser.
- Profile edit changes the real cloud row.
- Goal edit changes the real cloud row.
- Workout quick-log changes the real cloud row.
- Nutrition quick-log changes the real cloud row.
- Browser context 1 keeps the exact state after refresh.
- Browser context 2 loads the exact same state after sign-in.
- Browser context 2 keeps the exact same state after refresh.
- The final real Supabase `trainer_data` row exactly matches:
  - edited profile name
  - edited goal summary
  - workout status
  - workout note
  - nutrition note
  - nutrition deviation kind
  - nutrition issue

The run fails if any of these happen:

- Required staging env vars are missing.
- Supabase sign-in fails.
- Baseline cleanup or seeding fails.
- The app never leaves signed-out/auth state after valid credentials.
- Any mutation reaches local cache but not the real cloud row within the poll window.
- Browser 1 and browser 2 disagree on any of the parity fields above.
- Refresh on either browser loses any of the parity fields above.
- The UI stays in `Retrying` and the diagnostics snapshot does not expose a machine-readable reason.

## Machine-Readable Retry Rule

The harness does not accept a vague indefinite `Retrying` state.

If the sync snapshot stays in `retrying`, the test requires at least one of:

- failing endpoint
- HTTP status
- Supabase error code
- error message

This evidence comes from the diagnostics snapshot behind `window.__TRAINER_SYNC_TEST_HELPERS.snapshot()` and is also visible in the developer diagnostics panel in `Settings > Account`.

## Current Honesty Boundary

This harness is wired to a real staging project, but it was not executed in this repo session because no staging credentials were present locally. In this session, the helper/unit contract was verified and the browser harness was left ready to run against staging.
