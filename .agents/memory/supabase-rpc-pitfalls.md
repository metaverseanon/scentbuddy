---
name: Supabase RPC (PL/pgSQL) pitfalls
description: Non-obvious gotchas writing SECURITY DEFINER RETURNS TABLE RPCs for the ScentBuddy Supabase backend.
---

# RETURNS TABLE output columns collide with table columns

A PL/pgSQL function declared `returns table (user_id uuid, is_pro boolean, ...)`
puts those output column names in scope as variables inside the body. Any
UNQUALIFIED column reference that shares a name (e.g. `where user_id = v_uid`,
`select coalesce(is_pro, false) from profiles`) is ambiguous, and Postgres
raises `column reference "..." is ambiguous` (the default
`plpgsql.variable_conflict = error`). The whole RPC then fails at runtime, which
the app surfaces as an empty/failed result — not an obvious crash.

**Rule:** fully table-qualify EVERY column reference in such functions (alias the
tables), rename internal CTE columns that clash (e.g. `user_id as uid`), and
`ORDER BY` the explicit expression rather than an output-column alias that
matches an out-param.

**Why:** the original `get_twin_matches` (in `2026_05_blind_tests.sql`) and the
sibling blind-test RPCs were written with unqualified refs; combined with a
notes-unnest bug that dropped users with empty notes, twins returned nothing.
The fix in `2026_06_twin_matches_fix.sql` qualifies all columns and aggregates
bottles (GROUP BY) and notes (LEFT JOIN) independently so bottle-only overlaps
surface.

**How to apply:** whenever editing or adding a SECURITY DEFINER `returns table`
RPC (twin matches, blind test, future RPCs), qualify columns and never leave a
body reference whose bare name equals an out-param.

# SECURITY DEFINER functions are PUBLIC-executable by default

A freshly created function grants `EXECUTE` to `PUBLIC`, so a `SECURITY DEFINER`
RPC that reads owner-scoped (RLS-private) data — e.g. `get_streak_leaderboard`
over `wear_diary` — is callable by `anon` unless you lock it down.

**Rule:** for any SECURITY DEFINER RPC that bypasses RLS, add
`revoke execute on function public.fn(args) from public;` then
`grant execute ... to authenticated;`. Also clamp any caller-supplied `limit`
(`limit least(greatest(coalesce(n,10),1),100)`) so it can't request unbounded
or negative output.

**Why:** a SECURITY DEFINER function reads with the definer's (elevated)
privileges; the only access boundary left is the EXECUTE grant, and the default
PUBLIC grant defeats the intended authenticated-only boundary.
