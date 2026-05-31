-- Conversion funnel analytics.
-- Lightweight client-side event log so install -> paywall -> purchase can be
-- measured. Events are written from the app (often pre-auth during onboarding),
-- so user_id is nullable and an anon_id ties pre-auth events to the same device.
-- Idempotent — safe to paste into the Supabase SQL editor and re-run.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anon_id text,
  event text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at);
create index if not exists analytics_events_user_idx
  on public.analytics_events (user_id);
create index if not exists analytics_events_anon_idx
  on public.analytics_events (anon_id);

alter table public.analytics_events enable row level security;

-- Clients (including the anon role during onboarding) may append events only.
-- No select/update/delete is granted to clients; funnel analysis is done with
-- the service role in the SQL editor.
drop policy if exists "analytics_events_insert" on public.analytics_events;
create policy "analytics_events_insert"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (
    user_id is null or user_id = auth.uid()
  );
