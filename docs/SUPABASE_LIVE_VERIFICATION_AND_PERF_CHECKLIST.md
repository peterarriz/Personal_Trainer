# Supabase Live Verification And Perf Checklist

## What Changed
- Added `supabase/migrations/20260413_policy_perf_followup.sql`.
- Re-applied wrapped ownership policies for:
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
  - `push_subscriptions`
  - `exercise_performance`
  - `app_events`
- Safely drops `public.trainer_data_id_uidx` only when the `trainer_data` primary key already exists.
- App-side write amplification is reduced by payload dedupe in `src/modules-auth-storage.js` and explicit-save profile editing in Settings.

## Apply Migrations
1. Confirm the linked project is the intended non-local target.
2. Run `supabase migration list`.
3. Run `supabase db push --linked`.
4. Confirm the new migration appears as applied.

## Verify Policies
Run:

```sql
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'trainer_data','goals','plans','sessions','session_logs','daily_checkins',
    'garmin_data','nutrition_logs','my_places','coach_memory','injury_flags',
    'push_subscriptions','exercise_performance','app_events'
  )
order by tablename, policyname;
```

Check that ownership comparisons use the wrapped pattern `((select auth.uid()) = user_id)` instead of bare direct calls.

## Verify Duplicate Index Removal
Run:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'trainer_data'
order by indexname;
```

`trainer_data_id_uidx` should be gone after the follow-up migration if the primary key exists.

## Rerun Advisor
1. Open the Supabase advisor/linter after migration completion.
2. Capture the before/after warning counts.
3. Confirm whether `auth_rls_initplan` warnings disappeared for the tables above.
4. If warnings remain, compare the live policy SQL from `pg_policies` against the migration text before making new changes.

## Validate App-Side Load Reduction
- Open the app signed in.
- Edit Account profile fields in Settings and confirm no network write happens until `Save account profile`.
- Trigger repeated no-op saves and confirm duplicate `trainer_data` writes do not continue.
- Check that Today remains usable when network state changes.

## 24-Hour Perf Check
- Capture database CPU and request volume before rollout.
- Capture the same metrics 24 hours after rollout.
- Compare:
  - advisor warnings
  - `trainer_data` write frequency
  - user-visible sync thrash
  - database CPU trend
- If CPU does not improve, inspect real query patterns before dropping more indexes.
