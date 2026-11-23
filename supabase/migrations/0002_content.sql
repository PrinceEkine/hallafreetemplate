-- Ophixe content schema: posts, events, storage buckets.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql. Safe to re-run.

-- ── Posts (community feed) ───────────────────────────────────────────────
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "Members can read posts" on public.posts;
create policy "Members can read posts"
  on public.posts for select
  using (public.is_community_member(community_id));

drop policy if exists "Members can create posts" on public.posts;
create policy "Members can create posts"
  on public.posts for insert
  with check (
    author_id = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Authors can edit own posts" on public.posts;
create policy "Authors can edit own posts"
  on public.posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "Authors and admins can delete posts" on public.posts;
create policy "Authors and admins can delete posts"
  on public.posts for delete
  using (
    author_id = auth.uid()
    or public.is_community_admin(community_id)
  );

-- ── Events ───────────────────────────────────────────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null,
  description text not null default '',
  event_date date not null,
  event_time text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists "Members can read events" on public.events;
create policy "Members can read events"
  on public.events for select
  using (public.is_community_member(community_id));

drop policy if exists "Admins can create events" on public.events;
create policy "Admins can create events"
  on public.events for insert
  with check (public.is_community_admin(community_id));

drop policy if exists "Admins can edit events" on public.events;
create policy "Admins can edit events"
  on public.events for update
  using (public.is_community_admin(community_id));

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
  on public.events for delete
  using (public.is_community_admin(community_id));

-- ── Storage buckets (avatars public, evidence private) ───────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('evidence', 'evidence', false)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly viewable" on storage.objects;
create policy "Avatar images are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view own evidence" on storage.objects;
create policy "Users can view own evidence"
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload own evidence" on storage.objects;
create policy "Users can upload own evidence"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
