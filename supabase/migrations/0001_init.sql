-- Ophixe initial schema: profiles, communities, memberships, announcements.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to re-run: every statement is idempotent.

-- ── Profiles (one row per auth user) ──────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set
    phone = coalesce(excluded.phone, public.profiles.phone),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Communities (company / estate / group) ───────────────────────────────
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  privacy text not null default 'public' check (privacy in ('public', 'private')),
  who_can_join text not null default 'anyone'
    check (who_can_join in ('anyone', 'approval', 'invite')),
  website text not null default '',
  invite_code text not null default substr(md5(random()::text), 1, 8) unique,
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.communities enable row level security;

-- ── Memberships ──────────────────────────────────────────────────────────
create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'removed')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

alter table public.community_members enable row level security;

-- ── Membership helpers (security definer: bypass RLS, no recursion) ──────
create or replace function public.is_community_member(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_community_admin(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'admin')
  );
$$;

-- Owner automatically becomes an active owner-member on community creation.
create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_members (community_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (community_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_community_created on public.communities;
create trigger on_community_created
  after insert on public.communities
  for each row execute function public.add_owner_membership();

-- ── Community policies ───────────────────────────────────────────────────
drop policy if exists "Public communities are visible to signed-in users" on public.communities;
create policy "Public communities are visible to signed-in users"
  on public.communities for select
  using (
    auth.uid() is not null
    and (
      privacy = 'public'
      or owner_id = auth.uid()
      or public.is_community_member(id)
    )
  );

drop policy if exists "Signed-in users can create communities" on public.communities;
create policy "Signed-in users can create communities"
  on public.communities for insert
  with check (auth.uid() is not null and owner_id = auth.uid());

drop policy if exists "Owners can update their community" on public.communities;
create policy "Owners can update their community"
  on public.communities for update
  using (owner_id = auth.uid());

drop policy if exists "Owners can delete their community" on public.communities;
create policy "Owners can delete their community"
  on public.communities for delete
  using (owner_id = auth.uid());

-- ── Membership policies ──────────────────────────────────────────────────
drop policy if exists "Members can view their community roster" on public.community_members;
create policy "Members can view their community roster"
  on public.community_members for select
  using (
    user_id = auth.uid()
    or public.is_community_member(community_id)
  );

drop policy if exists "Users can request to join" on public.community_members;
create policy "Users can request to join"
  on public.community_members for insert
  with check (user_id = auth.uid());

drop policy if exists "Admins can approve and manage members" on public.community_members;
create policy "Admins can approve and manage members"
  on public.community_members for update
  using (public.is_community_admin(community_id));

drop policy if exists "Admins can remove members, users can leave" on public.community_members;
create policy "Admins can remove members, users can leave"
  on public.community_members for delete
  using (
    user_id = auth.uid()
    or public.is_community_admin(community_id)
  );

-- ── Announcements ────────────────────────────────────────────────────────
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  author_id uuid references public.profiles (id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "Members can read announcements" on public.announcements;
create policy "Members can read announcements"
  on public.announcements for select
  using (public.is_community_member(community_id));

drop policy if exists "Admins can post announcements" on public.announcements;
create policy "Admins can post announcements"
  on public.announcements for insert
  with check (public.is_community_admin(community_id));

drop policy if exists "Admins can edit announcements" on public.announcements;
create policy "Admins can edit announcements"
  on public.announcements for update
  using (public.is_community_admin(community_id));

drop policy if exists "Admins can delete announcements" on public.announcements;
create policy "Admins can delete announcements"
  on public.announcements for delete
  using (public.is_community_admin(community_id));
