# Sync Degradation Recovery Proof

Date: 2026-04-17
Scope: signed-in retry/outage behavior for workout and nutrition logs, explicit recovery, reopen behavior, and duplicate-replay risk

## Browser-Proven

### The retry state keeps real user detail, not just a banner

- `e2e/signed-in-adaptation-trust.spec.js`
  - `retrying workout logs survive explicit recovery once cloud sync returns`
  - `retrying nutrition logs survive explicit recovery once cloud sync returns`
  - `signed-in degraded-sync workout reopen keeps pending local workout detail visible`
  - `signed-in degraded-sync nutrition reopen keeps pending local nutrition detail visible`
- `e2e/local-sync-trust.spec.js`
  - `reload during retry keeps the pending marker and preserves the unsynced nutrition detail`

What these tests prove:

- signed-in workout and nutrition logs can be created while cloud writes are failing
- the local cache records those mutations during the retry state
- a reload during retry keeps the pending marker and preserves the unsynced nutrition detail
- a signed-in reopen during retry keeps the pending local workout and nutrition detail visible
- once the cloud path recovers, the explicit `Reload cloud data` action preserves the pending workout and nutrition detail, replays it into cloud, and clears the pending marker

## Service-Seam Proven

### Pending local replay can recover once the cloud path works again

- `tests/auth-storage-local-authority.test.js`
  - `pending local replay after a transient failure reconciles once and does not replay again on the next identical load`
  - `sbLoad prefers pending local writes when payloads differ even if local and cloud timestamps tie`

What this proves:

- if a pending local cache differs from the cloud row, `sbLoad()` will keep local authority during recovery
- once the cloud path recovers, the next `sbLoad()` can replay that local payload into cloud storage
- a second identical `sbLoad()` does not replay the same payload again

This is the deterministic storage-seam reconciliation contract currently proven in-repo.

## What Is Still Not Proven

- The browser product copy says cloud sync is retrying in the background, but the repo still does not independently prove an autonomous background retry finishes reconciliation without user action.
- End-to-end browser proof that degraded-sync recovery cannot trigger duplicate future adaptations is still missing.
- Safe merge when another device changed the cloud row during the same unsynced window is still not proven.

## Honest Current Claim

- It is honest to say the signed-in browser product now preserves workout and nutrition detail through retry/outage reload, reopen, and explicit recovery on the same device.
- It is honest to say the storage layer has a deterministic one-time replay contract after transient failure.
- It is not yet honest to say populated-cloud conflict resolution or duplicate-adaptation avoidance after degraded recovery are fully proven end-to-end.
