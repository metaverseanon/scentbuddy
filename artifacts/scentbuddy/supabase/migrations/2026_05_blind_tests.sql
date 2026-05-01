-- ScentBuddy: Blind Test schema (with secrecy-enforcing RPCs)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Idempotent: safe to re-run.

-- 1) Tests table -------------------------------------------------------------
create table if not exists public.blind_tests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  perfume_name text not null,
  perfume_brand text not null,
  concentration text,
  top_notes text[] default '{}',
  heart_notes text[] default '{}',
  base_notes text[] default '{}',
  description text,
  image_url text,
  is_public boolean default true,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_blind_tests_creator on public.blind_tests(creator_id);
create index if not exists idx_blind_tests_created on public.blind_tests(created_at desc);

-- 2) Ratings table -----------------------------------------------------------
create table if not exists public.blind_test_ratings (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.blind_tests(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  would_buy boolean,
  guessed_family text,
  comment text,
  created_at timestamptz not null default now(),
  unique (test_id, rater_id)
);

create index if not exists idx_blind_test_ratings_test on public.blind_test_ratings(test_id);
create index if not exists idx_blind_test_ratings_rater on public.blind_test_ratings(rater_id);

-- 3) RLS ---------------------------------------------------------------------
alter table public.blind_tests enable row level security;
alter table public.blind_test_ratings enable row level security;

-- Tests: only the creator can directly SELECT (clients use RPCs for everything else).
drop policy if exists "blind_tests_select" on public.blind_tests;
create policy "blind_tests_select" on public.blind_tests
  for select using (creator_id = auth.uid());

drop policy if exists "blind_tests_insert" on public.blind_tests;
create policy "blind_tests_insert" on public.blind_tests
  for insert with check (creator_id = auth.uid());

drop policy if exists "blind_tests_update" on public.blind_tests;
create policy "blind_tests_update" on public.blind_tests
  for update using (creator_id = auth.uid());

drop policy if exists "blind_tests_delete" on public.blind_tests;
create policy "blind_tests_delete" on public.blind_tests
  for delete using (creator_id = auth.uid());

-- Ratings: only the creator of the test OR the rater themselves can SELECT
-- (prevents leaking aggregate stats / others' opinions before user has rated).
drop policy if exists "blind_test_ratings_select" on public.blind_test_ratings;
create policy "blind_test_ratings_select" on public.blind_test_ratings
  for select using (
    rater_id = auth.uid()
    or exists (
      select 1 from public.blind_tests t
      where t.id = blind_test_ratings.test_id and t.creator_id = auth.uid()
    )
  );

drop policy if exists "blind_test_ratings_insert" on public.blind_test_ratings;
create policy "blind_test_ratings_insert" on public.blind_test_ratings
  for insert with check (rater_id = auth.uid());

drop policy if exists "blind_test_ratings_update" on public.blind_test_ratings;
create policy "blind_test_ratings_update" on public.blind_test_ratings
  for update using (rater_id = auth.uid());

-- 4) RPCs (SECURITY DEFINER, conditionally redact name/brand) ----------------

-- Returns a single test, redacting perfume_name + perfume_brand unless the
-- caller is the creator OR has already rated this test.
create or replace function public.get_blind_test(p_test_id uuid)
returns table (
  id uuid,
  creator_id uuid,
  perfume_name text,
  perfume_brand text,
  concentration text,
  top_notes text[],
  heart_notes text[],
  base_notes text[],
  description text,
  image_url text,
  is_public boolean,
  closes_at timestamptz,
  created_at timestamptz,
  revealed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_can_reveal boolean;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  select (
    t.creator_id = v_uid
    or exists (select 1 from public.blind_test_ratings r where r.test_id = t.id and r.rater_id = v_uid)
  )
  into v_can_reveal
  from public.blind_tests t
  where t.id = p_test_id;

  if v_can_reveal is null then
    return; -- no row
  end if;

  return query
  select
    t.id,
    t.creator_id,
    case when v_can_reveal then t.perfume_name else null end as perfume_name,
    case when v_can_reveal then t.perfume_brand else null end as perfume_brand,
    t.concentration,
    t.top_notes,
    t.heart_notes,
    t.base_notes,
    t.description,
    case when v_can_reveal then t.image_url else null end as image_url,
    t.is_public,
    t.closes_at,
    t.created_at,
    v_can_reveal as revealed
  from public.blind_tests t
  where t.id = p_test_id
    and (t.is_public = true or t.creator_id = v_uid);
end;
$$;

grant execute on function public.get_blind_test(uuid) to authenticated;

-- Returns a redacted list of public blind tests the caller has not yet rated
-- and did not create. Always omits perfume_name + perfume_brand + image_url.
create or replace function public.get_ratable_blind_tests(p_limit int default 40)
returns table (
  id uuid,
  creator_id uuid,
  concentration text,
  top_notes text[],
  heart_notes text[],
  base_notes text[],
  description text,
  closes_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.creator_id,
    t.concentration,
    t.top_notes,
    t.heart_notes,
    t.base_notes,
    t.description,
    t.closes_at,
    t.created_at
  from public.blind_tests t
  where t.is_public = true
    and t.creator_id <> auth.uid()
    and not exists (
      select 1 from public.blind_test_ratings r
      where r.test_id = t.id and r.rater_id = auth.uid()
    )
  order by t.created_at desc
  limit greatest(coalesce(p_limit, 40), 1);
$$;

grant execute on function public.get_ratable_blind_tests(int) to authenticated;

-- 5) Twin Finder RPC ---------------------------------------------------------
-- Computes similarity = (shared bottles * 3 + shared notes) and returns top
-- matches. Server enforces the limit AND entitlement so free clients can't
-- bypass gating by passing a larger p_limit.
--   - Free users: capped at 3 real rows (FREE_LIMIT). A `has_more` boolean
--     is returned on every row so the client can show an "Unlock more" CTA
--     without ever receiving extra user identities.
--   - Pro users: capped at 100 rows.
-- Drop first because the return signature changed (added has_more column).
drop function if exists public.get_twin_matches(int);
create function public.get_twin_matches(p_limit int default 3)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  avatar_emoji text,
  is_pro boolean,
  shared_bottles int,
  shared_notes int,
  score int,
  has_more boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_my_bottles text[];
  v_my_notes text[];
  v_is_pro boolean;
  v_effective_limit int;
  v_total_eligible int;
  v_has_more boolean;
  v_free_cap constant int := 3;
  v_pro_cap constant int := 100;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  -- Server-side entitlement check. Plan cap is enforced here, NOT trusted
  -- from the client — even if the client sends p_limit=10000, free users
  -- will only ever receive v_free_cap rows.
  select coalesce(is_pro, false) into v_is_pro
  from public.profiles
  where id = v_uid;

  if v_is_pro then
    v_effective_limit := least(greatest(coalesce(p_limit, v_pro_cap), 1), v_pro_cap);
  else
    v_effective_limit := v_free_cap;
  end if;

  -- My bottles as "name|brand" lowercased keys
  select coalesce(array_agg(distinct lower(perfume_name) || '|' || lower(perfume_brand)), '{}')
  into v_my_bottles
  from public.user_collections
  where user_id = v_uid;

  -- My notes (top + heart + base) deduped + lowercased
  select coalesce(array_agg(distinct lower(n)), '{}')
  into v_my_notes
  from (
    select unnest(coalesce(top_notes, '{}'::text[])
                  || coalesce(heart_notes, '{}'::text[])
                  || coalesce(base_notes, '{}'::text[])) as n
    from public.user_collections
    where user_id = v_uid
  ) s
  where length(trim(n)) > 0;

  if array_length(v_my_bottles, 1) is null and array_length(v_my_notes, 1) is null then
    return;
  end if;

  -- Count total eligible matches first so we can compute has_more without
  -- ever sending extra user identities to the client.
  with other_user_data as (
    select
      uc.user_id,
      array_agg(distinct lower(uc.perfume_name) || '|' || lower(uc.perfume_brand)) as their_bottles,
      array_agg(distinct lower(n)) filter (where length(trim(n)) > 0) as their_notes
    from public.user_collections uc
    cross join lateral unnest(
      coalesce(uc.top_notes, '{}'::text[])
      || coalesce(uc.heart_notes, '{}'::text[])
      || coalesce(uc.base_notes, '{}'::text[])
    ) as n
    where uc.user_id <> v_uid
    group by uc.user_id
  ),
  scored as (
    select
      o.user_id,
      coalesce(cardinality(array(select unnest(o.their_bottles) intersect select unnest(v_my_bottles))), 0) as sb,
      coalesce(cardinality(array(select unnest(coalesce(o.their_notes, '{}')) intersect select unnest(v_my_notes))), 0) as sn
    from other_user_data o
  )
  select count(*)::int into v_total_eligible
  from scored s
  where (s.sb + s.sn) > 0;

  v_has_more := v_total_eligible > v_effective_limit;

  return query
  with other_user_data as (
    select
      uc.user_id,
      array_agg(distinct lower(uc.perfume_name) || '|' || lower(uc.perfume_brand)) as their_bottles,
      array_agg(distinct lower(n)) filter (where length(trim(n)) > 0) as their_notes
    from public.user_collections uc
    cross join lateral unnest(
      coalesce(uc.top_notes, '{}'::text[])
      || coalesce(uc.heart_notes, '{}'::text[])
      || coalesce(uc.base_notes, '{}'::text[])
    ) as n
    where uc.user_id <> v_uid
    group by uc.user_id
  ),
  scored as (
    select
      o.user_id,
      coalesce(cardinality(array(select unnest(o.their_bottles) intersect select unnest(v_my_bottles))), 0) as sb,
      coalesce(cardinality(array(select unnest(coalesce(o.their_notes, '{}')) intersect select unnest(v_my_notes))), 0) as sn
    from other_user_data o
  )
  select
    p.id as user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.avatar_emoji,
    coalesce(p.is_pro, false) as is_pro,
    s.sb as shared_bottles,
    s.sn as shared_notes,
    (s.sb * 3 + s.sn) as score,
    v_has_more as has_more
  from scored s
  join public.profiles p on p.id = s.user_id
  where (s.sb + s.sn) > 0
  order by score desc, s.sb desc
  limit v_effective_limit;
end;
$$;

grant execute on function public.get_twin_matches(int) to authenticated;
