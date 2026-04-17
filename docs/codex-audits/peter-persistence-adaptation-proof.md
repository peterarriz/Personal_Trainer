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

### Signed-in degraded sync preserves unsynced detail across reload or reopen

- Characterized by `e2e/local-sync-trust.spec.js`
  - `reload during retry currently keeps the pending marker but drops the unsynced nutrition detail`
- Characterized by `e2e/signed-in-adaptation-trust.spec.js`
  - `signed-in degraded-sync workout reopen currently keeps the pending marker but drops the unsynced workout note`
- Characterized by `e2e/signed-in-adaptation-trust.spec.js`
  - `retrying workout logs still have ambiguous explicit recovery semantics after sync returns`
  - `retrying nutrition logs still have ambiguous explicit recovery semantics after sync returns`
- Current result:
  - the pending marker survives
  - the user-visible unsynced detail does not
  - even the explicit `Reload cloud data` recovery path currently clears the pending marker while dropping the unsynced workout or nutrition detail
  - this is a real trust gap, not a missing test

### Retry recovery without duplicate adaptation

- Not proven end-to-end in the browser
- Service seam proven by `tests/auth-storage-local-authority.test.js`
  - `pending local replay after a transient failure reconciles once and does not replay again on the next identical load`
- Why browser proof is still missing:
  - the degraded signed-in browser path drops the unsynced workout or nutrition detail before a recovery proof can be completed
  - the one-time replay contract is proven only at the storage seam today

## Current Independent Verdict

- Proven:
  - local workout persistence
  - local nutrition persistence
  - adaptation after saved workout logs
  - adaptation after saved nutrition logs
  - cross-surface consistency after those local mutations
  - blank-cloud sign-in promotion
  - same-device signed-in reopen after blank-cloud sign-in
- Not proven:
  - cloud-only restore after sign-in
  - populated-cloud merge
  - degraded signed-in reload without data loss
  - duplicate-adaptation avoidance after degraded recovery
