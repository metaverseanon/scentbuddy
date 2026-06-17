-- Layered wear support. A single logged "wear" can now include multiple
-- fragrances applied together (layering). Each fragrance is still stored as its
-- own wear_diary row (so streaks, stats, and DNA keep counting every scent),
-- but all rows from the same layered combo share a layer_group_id so the UI can
-- render them as a single grouped entry.
--
-- Nullable + idempotent: existing single wears (layer_group_id IS NULL) are
-- unaffected, and this is safe to re-run. Paste into the Supabase SQL editor.

alter table public.wear_diary
  add column if not exists layer_group_id uuid;

create index if not exists wear_diary_layer_group_idx
  on public.wear_diary (layer_group_id);
