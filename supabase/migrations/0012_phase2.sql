-- Ophixe phase 2: folders, form links, meetings, prefs, logos, personal
-- events, notifications feed, group discovery.
-- Requires 0001-0011 and 2026110801. Safe to re-run.

-- ── Community logos ────────────────────────────────────────────────────
alter table public.communities add column if not exists logo_url text;

-- ── Contact-list visibility (owner manages who shows as a contact) ─────
alter table public.community_members
  add column if not exists show_in_contact boolean not null default true;

-- ── Media links ────────────────────────────────────────────────────────
alter table public.community_media
  drop constraint if exists community_media_kind_check;
alter table public.community_media
  add constraint community_media_kind_check
  check (kind in ('image', 'video', 'link'));

-- ── File folders (files live inside a folder) ──────────────────────────
create table if not exists public.community_file_folders (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.community_file_folders enable row level security;

drop policy if exists "Members can read folders" on public.community_file_folders;
create policy "Members can read folders"
  on public.community_file_folders for select
  using (public.is_community_member(community_id));

drop policy if exists "Members can create folders" on public.community_file_folders;
create policy "Members can create folders"
  on public.community_file_folders for insert
  with check (public.is_community_member(community_id));

drop policy if exists "Admins and creators can delete folders"
  on public.community_file_folders;
create policy "Admins and creators can delete folders"
  on public.community_file_folders for delete
  using (
    public.is_community_admin(community_id) or created_by = auth.uid()
  );

alter table public.community_files
  add column if not exists folder_id uuid
  references public.community_file_folders (id) on delete set null;
create index if not exists idx_files_folder on public.community_files (folder_id);

-- ── Google-form links ──────────────────────────────────────────────────
create table if not exists public.community_form_links (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null,
  url text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.community_form_links enable row level security;

drop policy if exists "Members can read form links" on public.community_form_links;
create policy "Members can read form links"
  on public.community_form_links for select
  using (public.is_community_member(community_id));

drop policy if exists "Admins can manage form links" on public.community_form_links;
create policy "Admins can manage form links"
  on public.community_form_links for insert
  with check (public.is_community_admin(community_id));

drop policy if exists "Admins can delete form links" on public.community_form_links;
create policy "Admins can delete form links"
  on public.community_form_links for delete
  using (public.is_community_admin(community_id));

-- ── Meeting rooms ──────────────────────────────────────────────────────
create table if not exists public.community_meetings (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  kind text not null default 'room' check (kind in ('room', 'podcast', 'management')),
  conversation_id uuid references public.conversations (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.community_meetings enable row level security;

drop policy if exists "Members can read meeting rooms" on public.community_meetings;
create policy "Members can read meeting rooms"
  on public.community_meetings for select
  using (
    public.is_community_member(community_id)
    and (
      kind <> 'management'
      or public.is_community_admin(community_id)
    )
  );

drop policy if exists "Admins can manage meeting rooms" on public.community_meetings;
create policy "Admins can manage meeting rooms"
  on public.community_meetings for insert
  with check (public.is_community_admin(community_id));

drop policy if exists "Admins can delete meeting rooms" on public.community_meetings;
create policy "Admins can delete meeting rooms"
  on public.community_meetings for delete
  using (public.is_community_admin(community_id));

-- ── Personal events (private to-do tracking) ────────────────────────────
create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  event_date date not null,
  event_time text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.personal_events enable row level security;

drop policy if exists "Owners can read own personal events" on public.personal_events;
create policy "Owners can read own personal events"
  on public.personal_events for select
  using (user_id = auth.uid());

drop policy if exists "Owners can create own personal events" on public.personal_events;
create policy "Owners can create own personal events"
  on public.personal_events for insert
  with check (user_id = auth.uid());

drop policy if exists "Owners can update own personal events" on public.personal_events;
create policy "Owners can update own personal events"
  on public.personal_events for update
  using (user_id = auth.uid());

drop policy if exists "Owners can delete own personal events" on public.personal_events;
create policy "Owners can delete own personal events"
  on public.personal_events for delete
  using (user_id = auth.uid());

create index if not exists idx_personal_events_user_date
  on public.personal_events (user_id, event_date);

-- ── Community prefs (pin / low priority / archive) ─────────────────────
create table if not exists public.community_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  pinned boolean not null default false,
  low_priority boolean not null default false,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

alter table public.community_prefs enable row level security;

drop policy if exists "Owners can read own community prefs" on public.community_prefs;
create policy "Owners can read own community prefs"
  on public.community_prefs for select
  using (user_id = auth.uid());

drop policy if exists "Owners can write own community prefs" on public.community_prefs;
create policy "Owners can write own community prefs"
  on public.community_prefs for insert
  with check (user_id = auth.uid());

drop policy if exists "Owners can update own community prefs" on public.community_prefs;
create policy "Owners can update own community prefs"
  on public.community_prefs for update
  using (user_id = auth.uid());

-- ── Notifications feed ─────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  route text not null default '',
  ref_id text not null default '',
  community_id uuid references public.communities (id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Owners can read own notifications" on public.notifications;
create policy "Owners can read own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "Owners can update own notifications" on public.notifications;
create policy "Owners can update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- ── Notification prefs ─────────────────────────────────────────────────
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat boolean not null default true,
  announcements boolean not null default true,
  forms boolean not null default true,
  tasks boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "Owners can read own notification prefs" on public.notification_prefs;
create policy "Owners can read own notification prefs"
  on public.notification_prefs for select
  using (user_id = auth.uid());

drop policy if exists "Owners can write own notification prefs" on public.notification_prefs;
create policy "Owners can write own notification prefs"
  on public.notification_prefs for insert
  with check (user_id = auth.uid());

drop policy if exists "Owners can update own notification prefs" on public.notification_prefs;
create policy "Owners can update own notification prefs"
  on public.notification_prefs for update
  using (user_id = auth.uid());

-- ── Community group discovery (members see their community's groups) ───
drop policy if exists "Community members can read community groups"
  on public.conversations;
create policy "Community members can read community groups"
  on public.conversations for select
  using (
    is_group = true
    and community_id is not null
    and public.is_community_member(community_id)
  );

create or replace function public.join_group(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community uuid;
  v_group boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select community_id, is_group into v_community, v_group
  from public.conversations where id = p_conversation;
  if v_community is null or not v_group then
    raise exception 'Group not found.';
  end if;
  if not exists (
    select 1 from public.community_members
    where community_id = v_community and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Join the community first.';
  end if;
  insert into public.conversation_participants (conversation_id, user_id)
  values (p_conversation, auth.uid())
  on conflict do nothing;
end;
$$;

grant execute on function public.join_group(uuid) to authenticated;

-- ── Community logo uploads (public avatars bucket) ─────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'admin community logo upload'
  ) then
    create policy "admin community logo upload"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = 'community-logos'
        and exists (
          select 1 from community_members m
          where m.community_id::text = (storage.foldername(name))[2]
            and m.user_id = auth.uid()
            and m.status = 'active'
            and m.role in ('owner', 'admin')
        )
      );
  end if;
end $$;
