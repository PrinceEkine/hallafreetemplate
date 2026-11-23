-- Ophixe security hardening.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql. Safe to re-run.
--
-- 1. Profiles become visible to fellow community members (names are needed
--    for member lists, authors, and chat). Phone numbers move to a separate
--    owner-only table so they are never exposed through member lists.

create table if not exists public.profile_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text unique
);

alter table public.profile_contacts enable row level security;

drop policy if exists "Users can view own contact" on public.profile_contacts;
create policy "Users can view own contact"
  on public.profile_contacts for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own contact" on public.profile_contacts;
create policy "Users can insert own contact"
  on public.profile_contacts for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own contact" on public.profile_contacts;
create policy "Users can update own contact"
  on public.profile_contacts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Backfill only when the legacy column still exists (fresh databases).
-- Databases already migrated via the dashboard no longer have
-- profiles.phone, so this must be conditional to stay re-runnable.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'phone'
  ) then
    insert into public.profile_contacts (user_id, phone)
    select id, phone from public.profiles where phone is not null
    on conflict (user_id) do update set phone = excluded.phone;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

alter table public.profiles drop column if exists phone;

drop policy if exists "Users can view community member profiles" on public.profiles;
create policy "Users can view community member profiles"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1
      from public.community_members m1
      join public.community_members m2 on m1.community_id = m2.community_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
        and m1.status = 'active'
        and m2.status = 'active'
    )
  );

-- 2. Pin search_path on the shared updated_at trigger.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
