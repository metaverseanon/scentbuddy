-- ScentBuddy: Community Posts (text + optional image)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Idempotent: safe to re-run.

-- 1) Posts table -------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (length(text) between 1 and 1000),
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_posts_created on public.community_posts(created_at desc);
create index if not exists idx_community_posts_user on public.community_posts(user_id);

-- 2) RLS ---------------------------------------------------------------------
alter table public.community_posts enable row level security;

drop policy if exists "community_posts_select_all" on public.community_posts;
create policy "community_posts_select_all"
  on public.community_posts for select
  using (true);

drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
  on public.community_posts for insert
  with check (auth.uid() = user_id);

drop policy if exists "community_posts_delete_own" on public.community_posts;
create policy "community_posts_delete_own"
  on public.community_posts for delete
  using (auth.uid() = user_id);

-- 3) Storage bucket for post images -----------------------------------------
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read"
  on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "post_images_owner_insert" on storage.objects;
create policy "post_images_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "post_images_owner_delete" on storage.objects;
create policy "post_images_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
