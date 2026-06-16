-- 2026_06_referral_pro.sql
-- Referral-earned Pro: server-enforced, idempotent Pro grants at 5-invite milestones.
-- Safe to paste into the Supabase SQL editor and re-run (idempotent).
--
-- Security model: clients may READ their own referral rows only. Every write
-- (attribution + reward grants) happens server-side in Edge Functions using the
-- service role, which bypasses RLS. A user therefore cannot forge "completed"
-- referrals to self-grant Pro.

-- ============================================================================
-- profiles: referral code + Pro mirror columns (display only; RC is the truth)
-- ============================================================================
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referral_reward_months integer not null default 0;
alter table public.profiles add column if not exists pro_expires_at timestamptz;
alter table public.profiles add column if not exists pro_since timestamptz;
alter table public.profiles add column if not exists pro_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_referral_code_key') then
    begin
      alter table public.profiles add constraint profiles_referral_code_key unique (referral_code);
    exception when others then
      raise notice 'Could not add unique constraint on profiles.referral_code: %', sqlerrm;
    end;
  end if;
end $$;

-- ============================================================================
-- user_referrals: one row per referred user
-- ============================================================================
create table if not exists public.user_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  status text not null default 'completed' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint user_referrals_no_self check (referrer_id <> referred_id)
);

-- Backfill columns if the table pre-existed with a narrower shape.
alter table public.user_referrals add column if not exists referral_code text;
alter table public.user_referrals add column if not exists status text not null default 'completed';
alter table public.user_referrals add column if not exists created_at timestamptz not null default now();
alter table public.user_referrals add column if not exists completed_at timestamptz;

-- Ensure both FKs cascade on profile deletion (covers pre-existing tables too).
-- The referred_id FK MUST keep the default name so PostgREST embeds still work.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'user_referrals_referrer_id_fkey') then
    alter table public.user_referrals drop constraint user_referrals_referrer_id_fkey;
  end if;
  alter table public.user_referrals
    add constraint user_referrals_referrer_id_fkey
    foreign key (referrer_id) references public.profiles(id) on delete cascade;
exception when others then
  raise notice 'referrer_id FK setup: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'user_referrals_referred_id_fkey') then
    alter table public.user_referrals drop constraint user_referrals_referred_id_fkey;
  end if;
  alter table public.user_referrals
    add constraint user_referrals_referred_id_fkey
    foreign key (referred_id) references public.profiles(id) on delete cascade;
exception when others then
  raise notice 'referred_id FK setup: %', sqlerrm;
end $$;

-- One referral per referred user (guarded against pre-existing duplicates).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_referrals_referred_id_key') then
    begin
      alter table public.user_referrals add constraint user_referrals_referred_id_key unique (referred_id);
    exception when others then
      raise notice 'Could not add unique constraint on user_referrals.referred_id (duplicates?): %', sqlerrm;
    end;
  end if;
end $$;

create index if not exists user_referrals_referrer_id_idx on public.user_referrals (referrer_id);

-- ============================================================================
-- referral_reward_grants: idempotent ledger of granted milestones
-- ============================================================================
create table if not exists public.referral_reward_grants (
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  milestone_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'granted')),
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (referrer_id, milestone_number)
);

-- ============================================================================
-- Row Level Security: read-own only; no client writes.
-- ============================================================================
alter table public.user_referrals enable row level security;
alter table public.referral_reward_grants enable row level security;

-- Drop every existing policy so no stale client-write policy can remain.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_referrals' loop
    execute format('drop policy if exists %I on public.user_referrals', pol.policyname);
  end loop;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'referral_reward_grants' loop
    execute format('drop policy if exists %I on public.referral_reward_grants', pol.policyname);
  end loop;
end $$;

create policy "Referral parties can read their referrals"
  on public.user_referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

create policy "Referrer can read their reward grants"
  on public.referral_reward_grants for select
  using (auth.uid() = referrer_id);

-- ============================================================================
-- reconcile_referral_pro: atomic, serialized milestone reconciliation.
--
-- Runs as SECURITY DEFINER and takes a per-referrer advisory lock so concurrent
-- callers (e.g. two friends signing up at once, or a signup racing the referrer
-- opening the Referrals screen) can never double-grant or lose a month. It marks
-- every earned milestone "granted" and updates the display-only mirror columns,
-- then returns the authoritative expiry. The Edge Function performs the actual
-- RevenueCat grant with that expiry AND re-pushes it on every call, which
-- self-heals any transient RevenueCat failure or out-of-order write (RC sets an
-- absolute expiry). Because milestones go straight to "granted" under the lock,
-- there is no "pending" state that can get stuck; the ON CONFLICT also promotes
-- any legacy pending rows. Execution is restricted to the service role.
-- ============================================================================
create or replace function public.reconcile_referral_pro(p_referrer uuid)
returns table (granted_now integer, months_total integer, pro_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed integer;
  v_earned integer;
  v_granted integer;
  v_delta integer;
  v_cur_expiry timestamptz;
  v_pro_since timestamptz;
  v_base timestamptz;
  v_new_expiry timestamptz;
begin
  -- Serialize all reconciliation for this referrer for the txn duration.
  perform pg_advisory_xact_lock(hashtext('refpro:' || p_referrer::text));

  select count(*) into v_completed
  from public.user_referrals
  where referrer_id = p_referrer and status = 'completed';

  v_earned := floor(v_completed / 5);

  select count(*) into v_granted
  from public.referral_reward_grants
  where referrer_id = p_referrer and status = 'granted';

  if v_earned > v_granted then
    v_delta := v_earned - v_granted;

    insert into public.referral_reward_grants (referrer_id, milestone_number, status, granted_at, created_at)
    select p_referrer, gs, 'granted', now(), now()
    from generate_series(v_granted + 1, v_earned) as gs
    on conflict (referrer_id, milestone_number)
      do update set status = 'granted',
                    granted_at = coalesce(referral_reward_grants.granted_at, now());

    select profiles.pro_expires_at, profiles.pro_since
      into v_cur_expiry, v_pro_since
    from public.profiles where id = p_referrer;

    -- Stack the newly earned months on any existing (paid or referral) expiry.
    v_base := greatest(now(), coalesce(v_cur_expiry, now()));
    v_new_expiry := v_base + make_interval(months => v_delta);

    update public.profiles set
      pro_expires_at = v_new_expiry,
      pro_since = coalesce(v_pro_since, now()),
      pro_source = 'referral',
      referral_reward_months = v_earned
    where id = p_referrer;

    granted_now := v_delta;
    months_total := v_earned;
    pro_expires_at := v_new_expiry;
  else
    select profiles.pro_expires_at into v_cur_expiry
    from public.profiles where id = p_referrer;

    granted_now := 0;
    months_total := v_granted;
    pro_expires_at := v_cur_expiry;
  end if;

  return next;
end;
$$;

revoke all on function public.reconcile_referral_pro(uuid) from public;
grant execute on function public.reconcile_referral_pro(uuid) to service_role;
