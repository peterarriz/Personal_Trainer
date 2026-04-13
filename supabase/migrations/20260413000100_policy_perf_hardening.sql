-- Harden common RLS predicates so Postgres can cache the auth lookup once per
-- statement instead of evaluating auth.uid() row-by-row. This follows the
-- Supabase advisor guidance for policy performance without changing ownership
-- semantics.

do $$
declare
  tbl text;
  tables text[] := array[
    'trainer_data',
    'goals',
    'plans',
    'sessions',
    'session_logs',
    'daily_checkins',
    'garmin_data',
    'nutrition_logs',
    'my_places',
    'coach_memory',
    'injury_flags',
    'exercise_performance',
    'push_subscriptions',
    'app_events'
  ];
begin
  foreach tbl in array tables loop
    if to_regclass(format('public.%I', tbl)) is null then
      continue;
    end if;
    execute format('alter table if exists public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', tbl || '_delete_own', tbl);
  end loop;
end
$$;
