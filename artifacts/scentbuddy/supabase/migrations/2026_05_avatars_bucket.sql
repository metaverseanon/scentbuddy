-- ScentBuddy: avatars storage bucket
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- Idempotent: safe to re-run.
--
-- Creates the `avatars` public-read bucket used by the Account screen for
-- profile pictures. Files are stored at `<user_id>/avatar.jpg`. Each user
-- may only insert/update/delete inside their own folder; anyone may read.

-- 1) Bucket -----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 2) RLS policies on storage.objects ---------------------------------------
-- Public read for any avatar
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Owner-only insert (path must start with their auth.uid())
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-only update (needed because the client uploads with upsert: true)
drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-only delete (used by AuthProvider when removing avatar)
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
