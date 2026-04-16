# Friction Analytics Schema

This app records a compact, local-first event stream in `trainer_friction_analytics_v1` and emits the same payloads through `trainer:analytics` for test capture.

## Event shape

```json
{
  "id": "auth_sign_in_success_1713200000000_ab12cd",
  "schemaVersion": "2026-04-v1",
  "flow": "auth",
  "action": "sign_in",
  "outcome": "success",
  "name": "auth.sign_in.success",
  "ts": 1713200000000,
  "props": {
    "duration_ms": 184,
    "provider_ready": true
  }
}
```

## Design rules

- Keep payloads categorical and compact.
- Do not store freeform user text, notes, prompts, answers, or raw messages.
- Prefer counts, booleans, durations, modes, and normalized reason codes.
- Keep the local ring buffer small enough for debugging and product review on-device.

## Flows

- `auth`
  - Gate views, mode switches, sign-in, sign-up, local-mode entry, sign-out, delete account.
- `intake`
  - Stage views, continue attempts, blocked continues, restored sessions, stage exits, plan build.
- `goals`
  - Goal-management previews and applies.
- `logging`
  - Workout log, daily check-in, weekly check-in, nutrition log saves.
- `coach`
  - Surface views, deterministic plan previews, accepted changes, advisory questions.
- `sync`
  - Persist timing, retry events, entity sync writes.
- `settings`
  - Surface views, settings saves, delete diagnostics, cloud reload, device reset.

## Key metrics

- Auth friction
  - Sign-in failures
  - Confirmation-required signups
  - Average sign-out duration
  - Delete blocked by configuration
- Intake drag
  - Repeat Continue clicks on the same stage
  - Restored sessions
  - Abandoned stage exits
  - Completed first-plan builds
- Goal-management friction
  - Preview count vs apply count
  - Archive and restore actions
- Logging completion
  - Workout log saves
  - Daily and weekly check-ins
  - Nutrition saves
- Sync resilience
  - REST retries
  - Persist failures
  - Entity sync failures

## Product surface

Settings → Advanced now renders a `Friction summary` card set built from the last 7 days of local events on the current device. This is intended for product review and QA, not for end-user-facing coaching copy.
