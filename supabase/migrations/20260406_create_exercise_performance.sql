create table if not exists public.exercise_performance (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  date date not null,
  prescribed_weight numeric null,
  actual_weight numeric null,
  prescribed_reps integer null,
  actual_reps integer null,
  prescribed_sets integer null,
  actual_sets integer null,
  band_tension text null,
  bodyweight_only boolean not null default false,
  feel_this_session integer null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, exercise_name, date)
);

create index if not exists exercise_performance_user_date_idx
  on public.exercise_performance (user_id, date desc);

alter table public.exercise_performance enable row level security;

drop policy if exists "exercise_performance_select_own" on public.exercise_performance;
create policy "exercise_performance_select_own"
  on public.exercise_performance
  for select
  using (auth.uid() = user_id);

drop policy if exists "exercise_performance_insert_own" on public.exercise_performance;
create policy "exercise_performance_insert_own"
  on public.exercise_performance
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "exercise_performance_update_own" on public.exercise_performance;
create policy "exercise_performance_update_own"
  on public.exercise_performance
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "exercise_performance_delete_own" on public.exercise_performance;
create policy "exercise_performance_delete_own"
  on public.exercise_performance
  for delete
  using (auth.uid() = user_id);
