create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default timezone('utc', now())
);

create index if not exists app_events_user_timestamp_idx
  on public.app_events (user_id, timestamp desc);

create index if not exists app_events_user_type_idx
  on public.app_events (user_id, event_type);

alter table public.app_events enable row level security;

drop policy if exists "app_events_select_own" on public.app_events;
create policy "app_events_select_own"
  on public.app_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "app_events_insert_own" on public.app_events;
create policy "app_events_insert_own"
  on public.app_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "app_events_update_own" on public.app_events;
create policy "app_events_update_own"
  on public.app_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "app_events_delete_own" on public.app_events;
create policy "app_events_delete_own"
  on public.app_events
  for delete
  using (auth.uid() = user_id);
