# Sync Degradation Recovery Proof

Date: 2026-04-17
Scope: signed-in retry/outage behavior for workout and nutrition logs, explicit recovery, and duplicate-replay risk

## Browser-Proven

### The retry state is not just a banner

- `e2e/signed-in-adaptation-trust.spec.js`
  - `retrying workout logs still have ambiguous explicit recovery semantics after sync returns`
  - `retrying nutrition logs still have ambiguous explicit recovery semantics after sync returns`

What these tests prove:

- signed-in workout and nutrition logs can be created while cloud writes are failing
- the local cache records those mutations during the retry state
- using the current explicit recovery action, `Reload cloud data`, clears the pending marker
- in the current browser/runtime path, that same recovery action also drops the unsynced workout or nutrition detail instead of preserving it

This is a real trust gap, not a missing assertion.

## Service-Seam Proven

### Pending local replay can recover once the cloud path works again

- `tests/auth-storage-local-authority.test.js`
  - `pending local replay after a transient failure reconciles once and does not replay again on the next identical load`

What this proves:

- if a newer pending local cache exists, `sbLoad()` can keep it after a failed replay attempt
- once the cloud path recovers, the next `sbLoad()` can replay that local payload into cloud storage
- a second identical `sbLoad()` does not replay the same payload again

This is the deterministic storage-seam reconciliation contract currently proven in-repo.

## Recovery Rule Ambiguity

- The browser product copy says cloud sync is retrying in the background.
- The repo does not currently provide independent browser proof that an autonomous background retry finishes reconciliation without user action.
- The only explicit recovery control proven in-browser is `Reload cloud data` from Settings.
- In the current browser/runtime path, that explicit recovery control is not trustworthy for pending workout or nutrition logs captured during outage:
  - the pending marker clears
  - the unsynced detail disappears

So the current product-level recovery rule is ambiguous:

- storage seam: replay-on-recovery is proven and idempotent
- browser/runtime path: explicit recovery still loses user-visible detail

## Duplicate Future Adaptation Status

- Browser level: not proven after degraded signed-in recovery, because the user-visible log detail is lost before the future plan state can be trusted
- Storage seam: duplicate replay is not happening on repeated identical recovery loads

## Honest Current Claim

- It is honest to say the storage layer has a deterministic one-time replay contract after transient failure.
- It is not honest to say the signed-in browser product already preserves workout and nutrition logs cleanly through retry/outage recovery.
