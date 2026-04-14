create extension if not exists pgcrypto;

create table if not exists public.trainer_data (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  category text,
  title text,
  target_value numeric,
  current_value numeric,
  target_date date,
  priority integer default 1,
  status text default 'active',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date,
  phase_boundaries jsonb not null default '{}'::jsonb,
  status text default 'active',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  date date,
  type text,
  prescription jsonb not null default '{}'::jsonb,
  status text default 'scheduled',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  date date,
  completion_status text,
  feel_rating integer,
  note text,
  distance_mi numeric,
  duration_min numeric,
  avg_hr integer,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date,
  sleep_score integer,
  stress_score integer,
  energy_score integer,
  body_battery integer,
  resting_hr integer,
  garmin_readiness integer,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.garmin_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date,
  body_battery_start integer,
  sleep_hours numeric,
  sleep_score integer,
  stress_score integer,
  resting_hr integer,
  steps integer,
  activities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date,
  protein_target numeric,
  carbs_target numeric,
  calories_target numeric,
  water_oz_logged numeric,
  water_target numeric,
  reflection text,
  supplement_log jsonb not null default '[]'::jsonb,
  weekly_inventory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.my_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  category text,
  location_context text,
  menu_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_1 text,
  field_2 text,
  field_3 text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.injury_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body_part text,
  status text,
  onset_date date,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.trainer_data add column if not exists id text;
alter table if exists public.trainer_data add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.trainer_data add column if not exists data jsonb not null default '{}'::jsonb;
alter table if exists public.trainer_data add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.goals add column if not exists id uuid default gen_random_uuid();
alter table if exists public.goals add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.goals add column if not exists type text;
alter table if exists public.goals add column if not exists category text;
alter table if exists public.goals add column if not exists title text;
alter table if exists public.goals add column if not exists target_value numeric;
alter table if exists public.goals add column if not exists current_value numeric;
alter table if exists public.goals add column if not exists target_date date;
alter table if exists public.goals add column if not exists priority integer default 1;
alter table if exists public.goals add column if not exists status text default 'active';
alter table if exists public.goals add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.plans add column if not exists id uuid default gen_random_uuid();
alter table if exists public.plans add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.plans add column if not exists start_date date;
alter table if exists public.plans add column if not exists phase_boundaries jsonb not null default '{}'::jsonb;
alter table if exists public.plans add column if not exists status text default 'active';
alter table if exists public.plans add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.sessions add column if not exists id uuid default gen_random_uuid();
alter table if exists public.sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.sessions add column if not exists plan_id uuid references public.plans(id) on delete set null;
alter table if exists public.sessions add column if not exists date date;
alter table if exists public.sessions add column if not exists type text;
alter table if exists public.sessions add column if not exists prescription jsonb not null default '{}'::jsonb;
alter table if exists public.sessions add column if not exists status text default 'scheduled';
alter table if exists public.sessions add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.session_logs add column if not exists id uuid default gen_random_uuid();
alter table if exists public.session_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.session_logs add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table if exists public.session_logs add column if not exists date date;
alter table if exists public.session_logs add column if not exists completion_status text;
alter table if exists public.session_logs add column if not exists feel_rating integer;
alter table if exists public.session_logs add column if not exists note text;
alter table if exists public.session_logs add column if not exists distance_mi numeric;
alter table if exists public.session_logs add column if not exists duration_min numeric;
alter table if exists public.session_logs add column if not exists avg_hr integer;
alter table if exists public.session_logs add column if not exists exercises jsonb not null default '[]'::jsonb;
alter table if exists public.session_logs add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.daily_checkins add column if not exists id uuid default gen_random_uuid();
alter table if exists public.daily_checkins add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.daily_checkins add column if not exists date date;
alter table if exists public.daily_checkins add column if not exists sleep_score integer;
alter table if exists public.daily_checkins add column if not exists stress_score integer;
alter table if exists public.daily_checkins add column if not exists energy_score integer;
alter table if exists public.daily_checkins add column if not exists body_battery integer;
alter table if exists public.daily_checkins add column if not exists resting_hr integer;
alter table if exists public.daily_checkins add column if not exists garmin_readiness integer;
alter table if exists public.daily_checkins add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.garmin_data add column if not exists id uuid default gen_random_uuid();
alter table if exists public.garmin_data add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.garmin_data add column if not exists date date;
alter table if exists public.garmin_data add column if not exists body_battery_start integer;
alter table if exists public.garmin_data add column if not exists sleep_hours numeric;
alter table if exists public.garmin_data add column if not exists sleep_score integer;
alter table if exists public.garmin_data add column if not exists stress_score integer;
alter table if exists public.garmin_data add column if not exists resting_hr integer;
alter table if exists public.garmin_data add column if not exists steps integer;
alter table if exists public.garmin_data add column if not exists activities jsonb not null default '[]'::jsonb;
alter table if exists public.garmin_data add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.nutrition_logs add column if not exists id uuid default gen_random_uuid();
alter table if exists public.nutrition_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.nutrition_logs add column if not exists date date;
alter table if exists public.nutrition_logs add column if not exists protein_target numeric;
alter table if exists public.nutrition_logs add column if not exists carbs_target numeric;
alter table if exists public.nutrition_logs add column if not exists calories_target numeric;
alter table if exists public.nutrition_logs add column if not exists water_oz_logged numeric;
alter table if exists public.nutrition_logs add column if not exists water_target numeric;
alter table if exists public.nutrition_logs add column if not exists reflection text;
alter table if exists public.nutrition_logs add column if not exists supplement_log jsonb not null default '[]'::jsonb;
alter table if exists public.nutrition_logs add column if not exists weekly_inventory jsonb not null default '{}'::jsonb;
alter table if exists public.nutrition_logs add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.my_places add column if not exists id uuid default gen_random_uuid();
alter table if exists public.my_places add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.my_places add column if not exists name text;
alter table if exists public.my_places add column if not exists category text;
alter table if exists public.my_places add column if not exists location_context text;
alter table if exists public.my_places add column if not exists menu_items jsonb not null default '[]'::jsonb;
alter table if exists public.my_places add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.coach_memory add column if not exists id uuid default gen_random_uuid();
alter table if exists public.coach_memory add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.coach_memory add column if not exists field_1 text;
alter table if exists public.coach_memory add column if not exists field_2 text;
alter table if exists public.coach_memory add column if not exists field_3 text;
alter table if exists public.coach_memory add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.injury_flags add column if not exists id uuid default gen_random_uuid();
alter table if exists public.injury_flags add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.injury_flags add column if not exists body_part text;
alter table if exists public.injury_flags add column if not exists status text;
alter table if exists public.injury_flags add column if not exists onset_date date;
alter table if exists public.injury_flags add column if not exists active boolean not null default true;
alter table if exists public.injury_flags add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.exercise_performance add column if not exists id uuid default gen_random_uuid();
alter table if exists public.exercise_performance add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.exercise_performance add column if not exists exercise_name text;
alter table if exists public.exercise_performance add column if not exists date date;
alter table if exists public.exercise_performance add column if not exists prescribed_weight numeric;
alter table if exists public.exercise_performance add column if not exists actual_weight numeric;
alter table if exists public.exercise_performance add column if not exists prescribed_reps integer;
alter table if exists public.exercise_performance add column if not exists actual_reps integer;
alter table if exists public.exercise_performance add column if not exists prescribed_sets integer;
alter table if exists public.exercise_performance add column if not exists actual_sets integer;
alter table if exists public.exercise_performance add column if not exists band_tension text;
alter table if exists public.exercise_performance add column if not exists bodyweight_only boolean not null default false;
alter table if exists public.exercise_performance add column if not exists feel_this_session integer;
alter table if exists public.exercise_performance add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table if exists public.exercise_performance add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.push_subscriptions add column if not exists id uuid default gen_random_uuid();
alter table if exists public.push_subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.push_subscriptions add column if not exists subscription jsonb not null default '{}'::jsonb;
alter table if exists public.push_subscriptions add column if not exists created_at timestamptz not null default timezone('utc', now());

update public.goals set id = gen_random_uuid() where id is null;
update public.plans set id = gen_random_uuid() where id is null;
update public.sessions set id = gen_random_uuid() where id is null;
update public.session_logs set id = gen_random_uuid() where id is null;
update public.daily_checkins set id = gen_random_uuid() where id is null;
update public.garmin_data set id = gen_random_uuid() where id is null;
update public.nutrition_logs set id = gen_random_uuid() where id is null;
update public.my_places set id = gen_random_uuid() where id is null;
update public.coach_memory set id = gen_random_uuid() where id is null;
update public.injury_flags set id = gen_random_uuid() where id is null;
update public.exercise_performance set id = gen_random_uuid() where id is null;
update public.push_subscriptions set id = gen_random_uuid() where id is null;

create unique index if not exists trainer_data_id_uidx on public.trainer_data(id);
create index if not exists trainer_data_user_id_idx on public.trainer_data(user_id);

create unique index if not exists goals_id_uidx on public.goals(id) where id is not null;
create index if not exists goals_user_status_priority_idx on public.goals(user_id, status, priority);

create unique index if not exists plans_id_uidx on public.plans(id) where id is not null;
create index if not exists plans_user_status_idx on public.plans(user_id, status);

create unique index if not exists sessions_id_uidx on public.sessions(id) where id is not null;
create index if not exists sessions_user_date_idx on public.sessions(user_id, date);
create index if not exists sessions_plan_id_date_idx on public.sessions(plan_id, date);

create unique index if not exists session_logs_id_uidx on public.session_logs(id) where id is not null;
create index if not exists session_logs_user_date_idx on public.session_logs(user_id, date);
create index if not exists session_logs_session_id_date_idx on public.session_logs(session_id, date);

create unique index if not exists daily_checkins_id_uidx on public.daily_checkins(id) where id is not null;
create index if not exists daily_checkins_user_date_idx on public.daily_checkins(user_id, date);

create unique index if not exists garmin_data_id_uidx on public.garmin_data(id) where id is not null;
create index if not exists garmin_data_user_date_idx on public.garmin_data(user_id, date);

create unique index if not exists nutrition_logs_id_uidx on public.nutrition_logs(id) where id is not null;
create index if not exists nutrition_logs_user_date_idx on public.nutrition_logs(user_id, date);

create unique index if not exists my_places_id_uidx on public.my_places(id) where id is not null;
create index if not exists my_places_user_category_idx on public.my_places(user_id, category);

create unique index if not exists coach_memory_id_uidx on public.coach_memory(id) where id is not null;
create index if not exists coach_memory_user_id_idx on public.coach_memory(user_id);

create unique index if not exists injury_flags_id_uidx on public.injury_flags(id) where id is not null;
create index if not exists injury_flags_user_active_idx on public.injury_flags(user_id, active);

create unique index if not exists exercise_performance_id_uidx on public.exercise_performance(id) where id is not null;
create index if not exists exercise_performance_user_exercise_idx on public.exercise_performance(user_id, exercise_name);
create index if not exists exercise_performance_user_date_idx on public.exercise_performance(user_id, date);

create unique index if not exists push_subscriptions_id_uidx on public.push_subscriptions(id) where id is not null;
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

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
    'push_subscriptions'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', tbl || '_delete_own', tbl);
  end loop;
end
$$;
