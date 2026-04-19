create table if not exists public.adaptive_learning_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id text not null,
  local_actor_id text,
  event_name text not null,
  event_version integer not null,
  schema_version text,
  occurred_at timestamptz not null,
  dedupe_key text,
  decision_id text,
  recommendation_join_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists adaptive_learning_events_user_occurred_idx
  on public.adaptive_learning_events (user_id, occurred_at);

create index if not exists adaptive_learning_events_event_name_idx
  on public.adaptive_learning_events (event_name);

create index if not exists adaptive_learning_events_join_key_idx
  on public.adaptive_learning_events (recommendation_join_key);

create index if not exists adaptive_learning_events_decision_id_idx
  on public.adaptive_learning_events (decision_id);

alter table public.adaptive_learning_events enable row level security;
