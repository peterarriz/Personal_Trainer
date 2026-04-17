# Peter Persistence And Adaptation Proof

Date: 2026-04-17
Scope: independent trust-path proof for persistence, adaptation, sync, and cross-surface consistency

## Browser-Proven

### Workout logs persist across local reload and reopen

- Proven by `e2e/workout-adaptation-persistence.spec.js`
  - `a skipped key session is carried forward after persistence and reopen`
  - `repeated harder-than-expected sessions persist and cap the next exposure`
- What this proves:
  - workout logs are saved through the UI
  - logs survive reload or reopen
  - future planning changes materially
  - Today, Program, Log, Nutrition, and Coach stay aligned after the mutation

### Nutrition logs persist across local reload and reopen

- Proven by `e2e/nutrition-underfueled-persistence.spec.js`
  - `under-fueled days persist across reload and soften the next quality session with one consistent reason line`
- What this proves:
  - nutrition logs are saved through the UI
  - logs survive reload
  - under-fueling changes the next planned session
  - Today, Program, Log, Nutrition, and Coach show the same adaptation reason

### Local-first to signed-in transition works when the cloud account is blank

- Proven by `e2e/local-sync-trust.spec.js`
  - `blank cloud sign-in promotes local workout and nutrition logs instead of dropping them`
- Proven by `e2e/signed-in-adaptation-trust.spec.js`
  - `blank-cloud sign-in preserves exact local workout and nutrition logs without loss, duplication, or reinterpretation`
  - `blank-cloud sign-in keeps workout-driven adaptation across signed-in same-device reopen`
  - `blank-cloud sign-in keeps nutrition-driven adaptation across signed-in same-device reopen`
- What this proves:
  - local workout and nutrition mutations are not dropped when the user signs into an empty cloud account
  - the saved workout status, workout note, nutrition deviation kind, and nutrition notes survive that transition exactly on the same device
  - on the same device, a later signed-in reopen still shows the saved logs and the adapted plan state

## Service-Seam Proven

### Pending local mutations can be replayed into stale cloud rows

- Proven by `tests/auth-storage-local-authority.test.js`
  - `sbLoad prefers a newer pending local cache over stale cloud rows and clears the pending marker after replay`
  - `sbLoad replays pending nutrition actual logs from newer local cache into cloud and clears the pending marker`
- What this proves:
  - the auth-storage layer knows how to prefer newer pending local workout and nutrition data over stale cloud copies
  - the pending marker clears after a successful replay

### Signed-in degraded sync now preserves user-visible detail on the same device

- Proven by `e2e/signed-in-adaptation-trust.spec.js`
  - `retrying workout logs survive explicit recovery once cloud sync returns`
  - `retrying nutrition logs survive explicit recovery once cloud sync returns`
  - `signed-in degraded-sync workout reopen keeps pending local workout detail visible`
  - `signed-in degraded-sync nutrition reopen keeps pending local nutrition detail visible`
- Proven by `e2e/local-sync-trust.spec.js`
  - `reload during retry keeps the pending marker and preserves the unsynced nutrition detail`
- What this proves:
  - during signed-in retry/outage, reload and reopen keep the pending marker and the unsynced workout or nutrition detail on the same device
  - the explicit `Reload cloud data` recovery action can now preserve those pending mutations and reconcile them into cloud once the path recovers

## Explicitly Not Proven

### Cloud-only restore after blank-cloud sign-in

- Characterized by `e2e/signed-in-adaptation-trust.spec.js`
  - `cloud-only reopen after blank-cloud sign-in is still not independently proven`
- Current result:
  - an auth-only reopen does not yet give independent browser proof that cloud-backed restore rebuilt the adapted state

### Sign-in to a populated cloud account merges local-only workout logs safely

- Characterized by `e2e/local-sync-trust.spec.js`
  - `signing into a populated cloud account does not merge local-only workout logs`
- Current result:
  - there is no deterministic local-vs-cloud merge proof for this path

### Retry recovery without duplicate adaptation

- Not proven end-to-end in the browser
- Service seam proven by `tests/auth-storage-local-authority.test.js`
  - `pending local replay after a transient failure reconciles once and does not replay again on the next identical load`
- Browser recovery detail is now proven, but duplicate-adaptation avoidance after that recovery still is not.
- Why browser proof is still missing:
  - the one-time replay contract is proven only at the storage seam today
  - there is not yet a browser assertion that a recovered retry path changes the future plan exactly once and no more

## Current Independent Verdict

- Proven:
  - local workout persistence
  - local nutrition persistence
  - adaptation after saved workout logs
  - adaptation after saved nutrition logs
  - cross-surface consistency after those local mutations
  - blank-cloud sign-in promotion
  - same-device signed-in reopen after blank-cloud sign-in
  - same-device degraded-sync reload/reopen preserves unsynced workout and nutrition detail
  - explicit `Reload cloud data` recovery preserves and reconciles those pending same-device mutations
- Not proven:
  - cloud-only restore after sign-in
  - populated-cloud merge
  - duplicate-adaptation avoidance after degraded recovery
