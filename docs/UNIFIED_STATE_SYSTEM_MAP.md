# Unified State System Map

## Goal
FORMA should explain save and sync calmly, with the same state language everywhere.

Harmless states stay quiet.
Serious states become visible and actionable.

## Reusable primitives
- `StateFeedbackBanner` in [src/components/StateFeedbackPrimitives.jsx](</C:/Users/Peter/Documents/Personal_Trainer/src/components/StateFeedbackPrimitives.jsx>)
- `StateFeedbackChip` in [src/components/StateFeedbackPrimitives.jsx](</C:/Users/Peter/Documents/Personal_Trainer/src/components/StateFeedbackPrimitives.jsx>)
- Sync state copy in [src/services/sync-state-service.js](</C:/Users/Peter/Documents/Personal_Trainer/src/services/sync-state-service.js>)
- Save state copy in [src/services/save-feedback-service.js](</C:/Users/Peter/Documents/Personal_Trainer/src/services/save-feedback-service.js>)

## State map
| State | Tone | User-facing meaning | Default treatment | Action |
| --- | --- | --- | --- | --- |
| `loading` | neutral | FORMA is checking saved data or account state | full card on auth/settings, quiet elsewhere | wait |
| `saving` | info | A save is in flight | compact banner near the action | wait |
| `saved` + synced | success | latest change is saved and account is current | quiet saved banner after a write | none |
| `saved` + retrying | caution | latest change is safe here, account copy is still catching up | compact banner or chip | none unless it persists |
| `saved` + offline | caution | latest change is safe on this device because the user is offline or signed out | compact banner or chip | reconnect or sign in when needed |
| `stale-cloud` | caution | this device is ahead of other devices for the moment | compact chip on planning surfaces, fuller explanation in Settings | refresh in Settings if it stays stuck |
| `conflict` | critical | FORMA found a version mismatch and did not guess | full card | review in Settings before replacing data |
| `fatal` | critical | account sync is unavailable because of provider or deployment failure | full card | keep using current device locally until fixed |

## Presentation rules
- Healthy sync is quiet on Today, Program, Log, Nutrition, and Coach.
- Healthy sync stays visible in Settings so the account surface can act as the source of truth.
- Save confirmations inherit sync context. Example: `Saved here` appears instead of a false healthy success when sync is retrying or offline.
- Copy names the real reason when possible. Example: `Offline`, `Signed out`, `Cloud behind`, `Cloud unavailable`.
- Avoid vague fallback terms like `Retrying` or `Device-only` when a more precise reason is known.

## Integrated surfaces
- Today, Program, Log, Nutrition, Coach, Settings, and Auth now resolve from the same sync state model.
- Today, Log, Nutrition, Coach, and Settings now use the shared save-feedback model for local save confirmation and error handling.

## Diagnostics
- Consumer mode only shows calm status copy.
- Exact request path, auth state, pending writes, retry reason, and last cloud read/write stay behind the Settings developer diagnostics surface.
