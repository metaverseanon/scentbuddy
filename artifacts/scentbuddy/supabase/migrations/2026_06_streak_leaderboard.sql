-- Log-streak leaderboard. Ranks users by their CURRENT consecutive-day wear
-- streak (the same definition the app uses on the Diary screen: a run of
-- distinct logged days ending today or yesterday, computed in UTC to match the
-- client which derives dates via Date.toISOString()).
--
-- wear_diary is owner-scoped RLS, so cross-user aggregation must run in a
-- SECURITY DEFINER function (same pattern as get_twin_matches / get_blind_test).
-- The function only ever returns (user_id, streak) — never any private diary
-- contents. Idempotent. Paste into the Supabase SQL editor.

create or replace function public.get_streak_leaderboard(limit_count int default 10)
returns table (user_id uuid, streak int)
language sql
stable
security definer
set search_path = public
as $$
  with distinct_days as (
    select wd.user_id as uid, wd.date::date as d
    from public.wear_diary wd
    where wd.user_id is not null and wd.date is not null
    group by wd.user_id, wd.date::date
  ),
  grouped as (
    -- "Islands" technique: consecutive dates share the same grp key because
    -- (date - its row number) stays constant across a run of consecutive days.
    select
      dd.uid,
      dd.d,
      dd.d - (row_number() over (partition by dd.uid order by dd.d))::int as grp
    from distinct_days dd
  ),
  runs as (
    select
      g.uid,
      count(*)::int as run_len,
      max(g.d) as run_end
    from grouped g
    group by g.uid, g.grp
  )
  select r.uid as user_id, r.run_len as streak
  from runs r
  where r.run_end >= (current_date - 1)  -- run must end today or yesterday
    and r.run_len > 0
  order by r.run_len desc, r.uid
  -- Clamp to a sane range so a caller can't request unbounded/negative output.
  limit least(greatest(coalesce(limit_count, 10), 1), 100);
$$;

-- SECURITY DEFINER functions are executable by PUBLIC by default; lock it down
-- to signed-in users only (matches the app's other cross-user RPCs).
revoke execute on function public.get_streak_leaderboard(int) from public;
grant execute on function public.get_streak_leaderboard(int) to authenticated;

notify pgrst, 'reload schema';
