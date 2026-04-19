# Adaptive Event Sink And Export

Updated: 2026-04-18

## Purpose

This closes the first major follow-up from the adaptive instrumentation pass:

- adaptive events no longer need to live only inside the main `trainer_data` payload
- signed-in sessions can replay events to a dedicated server-side sink
- operators can export adaptive history for offline analysis without scraping the client cache

This is still launch-safe:

- the live planner remains deterministic
- the existing payload path remains as a fallback
- sink replay is opportunistic and silent

## Runtime Pieces

Client replay:

- `src/services/adaptive-learning-sink-service.js`
- `src/services/adaptive-learning-store-service.js`
- `src/modules-auth-storage.js`

Server endpoint:

- `api/adaptive-learning/events.js`
- `api/_lib/adaptive-learning.js`

Offline export:

- `src/services/adaptive-learning-export-service.js`
- `scripts/run-adaptive-learning-export.js`

## Deployment Flags

Required for the dedicated sink:

- `ENABLE_ADAPTIVE_EVENT_SINK=true`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `SUPABASE_ADAPTIVE_EVENTS_TABLE`
  Default: `adaptive_learning_events`

If the sink is not configured, the app keeps using the existing payload-backed fallback and does not fail normal product saves.

## Expected Table Shape

The endpoint expects an append-only table with at least these columns:

- `id text primary key`
- `user_id text not null`
- `actor_id text not null`
- `local_actor_id text`
- `event_name text not null`
- `event_version integer not null`
- `schema_version text`
- `occurred_at timestamptz not null`
- `dedupe_key text`
- `decision_id text`
- `recommendation_join_key text`
- `payload jsonb not null`
- `created_at timestamptz default now()`

## Export Command

Export from the dedicated sink when enabled, otherwise fall back to `trainer_data`:

```bash
npm run qa:adaptive-learning:export -- --source auto
```

Optional:

```bash
--source sink
--source trainer_data
--user-id <supabase-user-id>
--output artifacts/adaptive-learning-export/custom-run
```

## Current Limits

- The dedicated sink is additive, not yet the sole source of truth.
- The app still keeps adaptive history in the persisted trainer payload as a fallback.
- This pass does not create automatic warehouse transforms or retention policies.
- Promotion and rollout still depend on the existing shadow-eval and launch-readiness gates.

## Recommended Next Step

Once the sink is configured in staging:

1. export real adaptive history
2. run shadow evaluation against that real dataset
3. compare sink counts against payload-backed counts
4. only then consider reducing reliance on the payload path
