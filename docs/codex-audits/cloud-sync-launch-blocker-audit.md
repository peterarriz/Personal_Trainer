# Cloud Sync Launch-Blocker Audit

Date: 2026-04-17

## Scope

- `src/modules-auth-storage.js`
- `src/services/sync-state-service.js`
- `src/services/sync-diagnostics-service.js`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsAccountSection.jsx`
- `e2e/sync-state.spec.js`
- `e2e/local-sync-trust.spec.js`
- `e2e/signed-in-adaptation-trust.spec.js`

## Root Cause Analysis

The main production blocker was not a single broken fetch. It was an observability gap around the shared sync boundary:

1. Signed-in cloud failures were being reduced to generic `Retrying cloud sync` / `Device-only` copy.
2. The runtime did not preserve enough evidence to tell whether the failure came from:
   - `trainer_data` save
   - `trainer_data` load
   - auth refresh
   - realtime reconnect / resync
   - local-cache authority arbitration
3. That made real-device reports look random even when the actual failing seam was deterministic.

The existing storage hardening from the earlier audit remains relevant:

- unfinished onboarding stays local-first
- timestamp-only payload churn no longer triggers fake cloud changes
- transient save cooldown prevents request storms
- same-user cloud persists are serialized

Those fixes reduced the blast radius, but they did not make the failing path inspectable enough for launch.

## Exact Failing Path

Browser-proven degraded path:

1. User is signed in and mutates state that calls `persistAll(...)`.
2. `persistAll` writes local cache first, then calls `sbSave(...)`.
3. `sbSave` calls `authFetchWithRetry(...)` against `POST /rest/v1/trainer_data`.
4. When that request returns `504` or times out, the client classifies it as transient and falls back to local storage.
5. The visible sync chip says `Retrying cloud sync`, but before this patch there was no product-facing way to see:
   - the failing endpoint
   - the HTTP status
   - whether auth refresh was involved
   - whether local pending writes still existed

Fresh-device cross-device restore is now browser-proven:

1. Device 1 mutates profile, goals, workout log, and nutrition log.
2. Shared cloud row updates through `trainer_data`.
3. A second signed-in device with no local cache loads from cloud.
4. A hard refresh on that second device keeps the same synced state.

## Code Changes

### 1. Exact sync diagnostics state

Added `src/services/sync-diagnostics-service.js`:

- deterministic reducer for:
  - `trainer_data` save/load attempts + results
  - auth refresh attempts + results
  - realtime status / reconnect / resync
  - local-cache pending-write state
  - local-cache authority decisions

### 2. Auth/storage instrumentation

`src/modules-auth-storage.js` now:

- emits diagnostics for `trainer_data` save/load attempts and results
- preserves endpoint + method on fetch/network failures
- parses HTTP response metadata into structured errors
- emits auth-refresh diagnostics including HTTP status and Supabase error code
- emits local-cache pending-write state whenever cache is saved/cleared
- emits local-cache authority decisions when pending local data outranks cloud

### 3. Runtime/realtime instrumentation

`src/trainer-dashboard.jsx` now:

- stores a live sync diagnostics state beside the user-facing sync state
- records realtime auth failures
- records realtime subscription status changes
- records realtime resync attempts and failures
- exposes diagnostics through the existing sync test harness

### 4. Developer-only panel

`Settings > Account & sync > Advanced recovery and destructive actions` now includes a debug-only diagnostics panel showing:

- last sync attempt time
- last sync source
- last endpoint + method
- last failing endpoint
- HTTP status
- Supabase error code
- retry eligibility
- pending local writes
- auth refresh status
- realtime reconnect/resync status
- local-cache authority decision

## Browser-Proven Acceptance Criteria

### Proven

- `e2e/sync-state.spec.js`
  - generic retry state still renders consistently across Today / Program / Settings
  - developer diagnostics now show the exact `trainer_data` failure metadata behind that generic retry state
- `e2e/local-sync-trust.spec.js`
  - local workout + nutrition logs promote into blank cloud on later sign-in
  - retry/outage still preserves the pending marker while the known nutrition-detail recovery gap remains explicit
  - profile, goals, workout logs, and nutrition logs now sync from device 1 into a fresh signed-in device and survive hard refresh on that second device
- `e2e/signed-in-adaptation-trust.spec.js`
  - existing signed-in adaptation trust paths still pass on the hardened storage boundary

### Acceptance standard used

For the cross-device proof to count, the second device had to show all of the following after a hard refresh:

- updated profile name
- updated goals stack
- updated workout log note
- updated nutrition log note

That path now passes deterministically in browser coverage.

## Deterministic Unit Coverage

- `tests/sync-diagnostics-service.test.js`
  - reducer records `trainer_data` retry metadata
  - reducer records auth refresh failures, realtime reconnects, and local-cache authority
- `tests/auth-storage-local-authority.test.js`
  - `persistAll` emits `trainer_data` save diagnostics with status + retry metadata
  - `ensureValidSession` emits auth refresh diagnostics on rejected refresh tokens
  - `sbLoad` emits local-cache authority decisions when pending local state outranks cloud

## Vercel / Live Deployment Handling

What the repo currently does:

- `scripts/build.js` injects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into `window.__SUPABASE_URL` / `window.__SUPABASE_ANON_KEY`
- if those are missing or malformed, the app falls into explicit provider-unavailable local mode instead of pretending cloud sync is healthy

What is still not proven live:

- I could not inspect the live Vercel project because the available Vercel connector token is expired
- there is no local live Supabase credential set in this repo session for a real deployment smoke test

So deployment-level root cause is still only partially audited:

- code path for env misconfiguration is clear and browser-characterized
- live env/project state was not independently verified in this pass

## Current Guarantees vs Gaps

### Guaranteed by deterministic repo evidence

- exact sync failure metadata is now available in-product for developers/debug staff
- `trainer_data` retry failures are no longer opaque
- auth refresh failures can now be distinguished from ordinary `trainer_data` failures
- realtime interruption / resync state is inspectable
- local pending writes and cache authority decisions are inspectable
- fresh-device cross-device sync for profile/goals/logs/nutrition is browser-proven

### Still not proven

- live Vercel deployment env correctness
- live Supabase project health / RLS / auth provider behavior on production credentials
- already-open second-device stale-cache reconciliation without explicit reload

That last one was intentionally not claimed here. The new browser proof covers fresh-device cloud restore plus hard refresh, not realtime multi-client reconciliation on an already-open stale tab.
