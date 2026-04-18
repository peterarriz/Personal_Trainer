# Cloud Sync Root Cause And Verification

## Root Cause

FORMA had two separate sync reliability problems:

1. Transient auth refresh failures were being treated like dead sessions.
   - `refreshSession()` swallowed every refresh error and returned `null`.
   - `ensureValidSession()` then labeled both invalid refresh tokens and temporary failures as `refresh_failed`.
   - On app boot or during a write, that pushed signed-in users into local-only fallback or sign-in-required states even when the failure was only a timeout, network interruption, or temporary auth outage.

2. The browser build only accepted `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Server code already accepted either `SUPABASE_*` or `VITE_SUPABASE_*`.
   - The browser bundle did not, so a deployment could have working server routes but a misconfigured client bundle if only the server-style variable names were present.

## Live Runtime Finding

The public Vercel alias was inspected directly on April 18, 2026.

- The live HTML already injected a real `window.__SUPABASE_URL`.
- The live HTML already injected a real `window.__SUPABASE_ANON_KEY`.

That means lack of client cloud config is a valid deployment risk, but it is not enough by itself to explain the current production fallback reports. The stronger production-facing failure mode is the auth refresh misclassification above.

## Code Fix

The patch does four things:

1. Distinguishes terminal refresh failures from transient ones.
   - `invalid_grant`, missing refresh sessions, and 400/401 refresh failures still count as real auth failures.
   - timeouts, fetch failures, 429s, and 5xx refresh failures now stay retryable.

2. Preserves the signed-in session during transient refresh failures.
   - Boot no longer drops a valid cached session into a fake signed-out path just because refresh had a temporary problem.

3. Exposes browser client-config diagnostics.
   - The build now records which env source supplied the browser Supabase URL and anon key.

4. Expands sync diagnostics.
   - failing request path
   - last successful cloud write
   - last successful cloud read
   - pending local writes
   - auth state
   - retry reason
   - browser client-config source and error

## Diagnostics Surface

Open the debug diagnostics in:

- `Settings > Account > Developer sync diagnostics`

Enable the panel locally or in staging with:

```js
localStorage.setItem("trainer_debug", "1");
location.reload();
```

The panel now shows:

- last sync attempt path and method
- last failing endpoint and HTTP status
- retry reason and last error message
- last successful cloud write
- last successful cloud read
- auth refresh result
- auth session state
- client cloud config source
- local pending-write state
- realtime reconnect state

## Real Supabase Verification

Use the existing real-environment harness:

- [e2e/real-sync-staging.spec.js](</C:/Users/Peter/Documents/Personal_Trainer/e2e/real-sync-staging.spec.js>)
- [e2e/real-sync-staging-helpers.js](</C:/Users/Peter/Documents/Personal_Trainer/e2e/real-sync-staging-helpers.js>)

Required environment:

- `FORMA_E2E_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_TEST_EMAIL`
- `SUPABASE_TEST_PASSWORD`

PowerShell:

```powershell
$env:FORMA_E2E_BASE_URL="https://your-staging-forma-url"
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-key"
$env:SUPABASE_TEST_EMAIL="your-staging-user@example.com"
$env:SUPABASE_TEST_PASSWORD="your-password"
cmd /c npm run e2e:sync:staging
```

What the run verifies:

- sign in through the real UI
- load seeded cloud state into browser 1
- save profile, goals, workout log, and nutrition to real Supabase
- refresh browser 1 without losing parity
- sign in on browser 2 and verify the same state
- confirm the final `trainer_data` row in Supabase matches both browsers

## What Was Verified In This Repo Session

- Focused auth/persistence unit tests passed.
- Sync diagnostics reducer tests passed.
- Standard `npm run build` passed.
- A build with only `SUPABASE_URL` and `SUPABASE_ANON_KEY` set passed and confirmed the browser bundle now accepts server-style env names.
- The live public Vercel alias was inspected and confirmed to already contain a real browser Supabase URL and anon key.

## What Was Not Fully Verified In This Repo Session

- The full two-device real Supabase Playwright harness was not executed because this workspace did not contain:
  - `FORMA_E2E_BASE_URL`
  - `SUPABASE_TEST_EMAIL`
  - `SUPABASE_TEST_PASSWORD`

- A new patched Vercel deployment was not produced from this workspace because the local repo is not linked to Vercel and the Vercel CLI is not available here.
