# Auth And Supabase Reliability Spec

## Purpose

The product must stay trustworthy when auth is changing state or when cloud sync is degraded. This spec defines the canonical lifecycle and the quiet degraded-mode contract.

## Auth Lifecycle Contract

### Sign up

- Auth credentials are created through Supabase auth.
- The signup request includes initial profile metadata:
  - `displayName`
  - `units`
  - `timezone`
- Successful signup does not imply a complete athlete identity. The runtime immediately routes the user into profile setup if `profileSetupComplete` is false.

### Profile setup

Immediate post-auth profile setup captures:

- display name
- timezone
- units
- birth year
- height
- weight
- training age
- environment
- equipment
- session length

This data is stored in canonical personalization state and then flows into canonical athlete derivation and planning.

### Sign out

- Sign out is user-visible in Settings.
- Sign out clears cached auth session state and moves the app into local mode.
- Sign out does not delete local planning data by default.

### Delete account

- `Delete account` means delete the auth identity, not only app rows.
- The client calls `/api/auth/delete-account`.
- The route uses the Supabase service role to resolve the current auth user from the bearer token and delete that user server-side.
- After success:
  - auth session is cleared
  - local auth cache is removed
  - local runtime cache is removed
  - persistence is suspended until the user signs in again or explicitly continues in local mode

## Quiet Degraded Mode

### Status model

The app uses stable storage-status objects instead of noisy banners.

- `SYNCED`: cloud writes succeeded.
- `SYNC RETRYING`: transient timeout/network failure. Local writes still succeeded.
- `NOT SIGNED IN`: local-only mode because no active auth session exists.
- `ACCOUNT DELETED`: auth identity and local cache were removed from this device.
- `SIGNED OUT`: explicit logout paused cloud sync.

### Rules

- Local writes are always attempted first.
- Transient failures must not dominate Today or other execution surfaces.
- Repeated identical status writes are deduped.
- Cloud recovery should settle back to `SYNCED` without replay noise.

## Supabase Policy Hardening

Migration: `supabase/migrations/20260413_policy_perf_hardening.sql`

The migration rewrites common ownership policies to use:

- `((select auth.uid()) = user_id)`

instead of row-by-row `auth.uid()` evaluation. This follows Supabase advisor guidance and preserves existing ownership semantics while reducing planner and sync overhead.

Tables covered:

- `trainer_data`
- `goals`
- `plans`
- `sessions`
- `session_logs`
- `daily_checkins`
- `garmin_data`
- `nutrition_logs`
- `my_places`
- `coach_memory`
- `injury_flags`
- `exercise_performance`
- `push_subscriptions`
- `app_events`

## Write Amplification Controls

`src/modules-auth-storage.js` now fingerprints two noisy shadow-sync payloads before posting:

- goals
- coach memory

If the stable fingerprint has not changed, the shadow sync is skipped. This reduces duplicate writes and unnecessary retry storms.

## Verification

Automated verification includes:

- `tests/goals-sync-contract.test.js`
- `e2e/auth-and-management.spec.js`

The browser suite verifies:

- signup -> profile setup
- logout
- delete account
- post-delete sign-in failure path
- local auth/cache clearing
