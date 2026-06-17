-- Fix get_twin_matches: it was far too strict and returned no matches for most
-- users. The previous version aggregated each candidate user's bottles with a
-- CROSS JOIN LATERAL unnest(top||heart||base notes). Any collection row whose
-- notes arrays were empty produced zero unnested rows and was therefore dropped
-- entirely — so a user's shared BOTTLES only counted if that user also happened
-- to have notes data populated. Since notes are frequently empty, bottle-only
-- overlaps never surfaced and the screen showed "No twins yet".
--
-- This version aggregates bottles and notes independently (notes via a LEFT
-- JOIN) so shared bottles always count, regardless of whether either side has
-- notes. Scoring is unchanged: shared bottles weigh 3x, shared notes 1x, and a
-- user is eligible with as little as ONE shared bottle OR note.
--
-- Every column reference is fully table-qualified. This function uses
-- RETURNS TABLE, whose output columns (user_id, is_pro, ...) are in scope as
-- PL/pgSQL variables; an unqualified `where user_id = ...` or `select is_pro`
-- is therefore ambiguous and Postgres raises an error (variable_conflict).
-- Qualifying every column (and ordering by the explicit score expression)
-- avoids that.
--
-- Idempotent: paste into the Supabase SQL editor to apply.

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
  select coalesce(p.is_pro, false) into v_is_pro
  from public.profiles p
  where p.id = v_uid;

  if v_is_pro then
    v_effective_limit := least(greatest(coalesce(p_limit, v_pro_cap), 1), v_pro_cap);
  else
    v_effective_limit := v_free_cap;
  end if;

  -- My bottles as "name|brand" lowercased keys.
  select coalesce(array_agg(distinct lower(uc.perfume_name) || '|' || lower(uc.perfume_brand)), '{}')
  into v_my_bottles
  from public.user_collections uc
  where uc.user_id = v_uid;

  -- My notes (top + heart + base) deduped, trimmed + lowercased.
  select coalesce(array_agg(distinct lower(trim(s.n))), '{}')
  into v_my_notes
  from (
    select unnest(coalesce(uc.top_notes, '{}'::text[])
                  || coalesce(uc.heart_notes, '{}'::text[])
                  || coalesce(uc.base_notes, '{}'::text[])) as n
    from public.user_collections uc
    where uc.user_id = v_uid
  ) s
  where length(trim(s.n)) > 0;

  if (array_length(v_my_bottles, 1) is null) and (array_length(v_my_notes, 1) is null) then
    return;
  end if;

  -- Count total eligible matches first so we can compute has_more without
  -- ever sending extra user identities to the client.
  with other_bottles as (
    select
      uc.user_id as uid,
      array_agg(distinct lower(uc.perfume_name) || '|' || lower(uc.perfume_brand)) as their_bottles
    from public.user_collections uc
    where uc.user_id <> v_uid
    group by uc.user_id
  ),
  other_notes as (
    select
      uc.user_id as uid,
      array_agg(distinct lower(trim(n.note))) as their_notes
    from public.user_collections uc
    cross join lateral unnest(
      coalesce(uc.top_notes, '{}'::text[])
      || coalesce(uc.heart_notes, '{}'::text[])
      || coalesce(uc.base_notes, '{}'::text[])
    ) as n(note)
    where uc.user_id <> v_uid
      and length(trim(n.note)) > 0
    group by uc.user_id
  ),
  scored as (
    select
      b.uid,
      coalesce(cardinality(array(select unnest(b.their_bottles) intersect select unnest(v_my_bottles))), 0) as sb,
      coalesce(cardinality(array(select unnest(coalesce(nt.their_notes, '{}')) intersect select unnest(v_my_notes))), 0) as sn
    from other_bottles b
    left join other_notes nt on nt.uid = b.uid
  )
  select count(*)::int into v_total_eligible
  from scored s
  where (s.sb + s.sn) > 0;

  v_has_more := v_total_eligible > v_effective_limit;

  return query
  with other_bottles as (
    select
      uc.user_id as uid,
      array_agg(distinct lower(uc.perfume_name) || '|' || lower(uc.perfume_brand)) as their_bottles
    from public.user_collections uc
    where uc.user_id <> v_uid
    group by uc.user_id
  ),
  other_notes as (
    select
      uc.user_id as uid,
      array_agg(distinct lower(trim(n.note))) as their_notes
    from public.user_collections uc
    cross join lateral unnest(
      coalesce(uc.top_notes, '{}'::text[])
      || coalesce(uc.heart_notes, '{}'::text[])
      || coalesce(uc.base_notes, '{}'::text[])
    ) as n(note)
    where uc.user_id <> v_uid
      and length(trim(n.note)) > 0
    group by uc.user_id
  ),
  scored as (
    select
      b.uid,
      coalesce(cardinality(array(select unnest(b.their_bottles) intersect select unnest(v_my_bottles))), 0) as sb,
      coalesce(cardinality(array(select unnest(coalesce(nt.their_notes, '{}')) intersect select unnest(v_my_notes))), 0) as sn
    from other_bottles b
    left join other_notes nt on nt.uid = b.uid
  )
  select
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.avatar_emoji,
    coalesce(p.is_pro, false),
    s.sb,
    s.sn,
    (s.sb * 3 + s.sn),
    v_has_more
  from scored s
  join public.profiles p on p.id = s.uid
  where (s.sb + s.sn) > 0
  order by (s.sb * 3 + s.sn) desc, s.sb desc
  limit v_effective_limit;
end;
$$;

grant execute on function public.get_twin_matches(int) to authenticated;
