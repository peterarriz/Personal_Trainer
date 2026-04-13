-- Follow-up pass for Supabase advisor drift:
-- 1. Re-apply wrapped auth.uid() predicates across every owned table,
--    including tables added outside the earlier hardening migration.
-- 2. Remove the duplicate trainer_data(id) index now that the table already
--    has a primary key on id.
-- 3. Keep ownership indexes honest without blindly adding redundant copies.
--    Existing leading user_id indexes are left in place when they already
--    satisfy ownership filtering.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
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
    'push_subscriptions',
    'exercise_performance',
    'app_events'
  ]
  loop
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
end $$;

do $$
declare
  trainer_data_pk_exists boolean;
begin
  select exists (
    select 1
    from pg_index idx
    join pg_class cls on cls.oid = idx.indrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'trainer_data'
      and idx.indisprimary
  )
  into trainer_data_pk_exists;

  if trainer_data_pk_exists then
    execute 'drop index if exists public.trainer_data_id_uidx';
  end if;
end $$;
