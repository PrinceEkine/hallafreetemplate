-- Ophixe community modules: tasks, projects, media, files, events, E2EE keys.
-- Safe to run more than once: every statement is idempotent.
-- Apply with: supabase db push   (or paste into the SQL editor)

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

create table if not exists community_tasks (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  title text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  due_date date null,
  assignee_id uuid null references profiles(id) on delete set null,
  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_projects (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'planning'
    check (status in ('planning', 'active', 'done')),
  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_media (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  path text not null,
  kind text not null default 'image' check (kind in ('image', 'video')),
  caption text not null default '',
  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists community_files (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  name text not null,
  path text not null,
  size_bytes bigint not null default 0,
  mime text not null default '',
  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists event_rsvps (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'going',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2. Columns on existing tables
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists public_key text;
alter table profiles add column if not exists avatar_url text;
alter table posts add column if not exists image_url text;
alter table announcements add column if not exists image_url text;
alter table communities add column if not exists settings jsonb not null default '{}';
alter table conversations add column if not exists community_id uuid
  references communities(id) on delete set null;
alter table events add column if not exists community_id uuid
  references communities(id) on delete set null;
alter table events add column if not exists created_by uuid
  references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_tasks_updated_at on community_tasks;
create trigger trg_tasks_updated_at
  before update on community_tasks
  for each row execute function set_updated_at();

drop trigger if exists trg_projects_updated_at on community_projects;
create trigger trg_projects_updated_at
  before update on community_projects
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Indexes (every hot list path is covered)
-- ---------------------------------------------------------------------------

create index if not exists idx_tasks_community_created
  on community_tasks (community_id, created_at desc);
create index if not exists idx_tasks_assignee on community_tasks (assignee_id);
create index if not exists idx_projects_community_created
  on community_projects (community_id, created_at desc);
create index if not exists idx_media_community_created
  on community_media (community_id, created_at desc);
create index if not exists idx_files_community_created
  on community_files (community_id, created_at desc);
create index if not exists idx_rsvps_event_going
  on event_rsvps (event_id) where status = 'going';
create index if not exists idx_messages_conversation_created
  on messages (conversation_id, created_at desc);
create index if not exists idx_posts_community_created
  on posts (community_id, created_at desc);
create index if not exists idx_announcements_community_created
  on announcements (community_id, created_at desc);
create index if not exists idx_events_date on events (event_date);
create index if not exists idx_events_community on events (community_id);
create index if not exists idx_members_community_status
  on community_members (community_id, status);
create index if not exists idx_members_user_status
  on community_members (user_id, status);
create index if not exists idx_participants_conversation
  on conversation_participants (conversation_id);
create index if not exists idx_participants_user
  on conversation_participants (user_id);
create index if not exists idx_comments_post_created
  on post_comments (post_id, created_at);
create index if not exists idx_submissions_community_status_created
  on form_submissions (community_id, status, created_at desc);
create index if not exists idx_conversations_community
  on conversations (community_id);

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

alter table community_tasks enable row level security;
alter table community_projects enable row level security;
alter table community_media enable row level security;
alter table community_files enable row level security;
alter table event_rsvps enable row level security;
alter table events enable row level security;

-- Tasks: members read/write, admins and creators delete.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_tasks' and policyname = 'member read tasks') then
    create policy "member read tasks" on community_tasks for select to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_tasks.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_tasks' and policyname = 'member write tasks') then
    create policy "member write tasks" on community_tasks for insert to authenticated
      with check (exists (select 1 from community_members m where m.community_id = community_tasks.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_tasks' and policyname = 'member update tasks') then
    create policy "member update tasks" on community_tasks for update to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_tasks.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_tasks' and policyname = 'admin delete tasks') then
    create policy "admin delete tasks" on community_tasks for delete to authenticated
      using (
        community_tasks.created_by = auth.uid()
        or exists (select 1 from community_members m where m.community_id = community_tasks.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
      );
  end if;
end $$;

-- Projects: members read, admins write.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_projects' and policyname = 'member read projects') then
    create policy "member read projects" on community_projects for select to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_projects.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_projects' and policyname = 'admin write projects') then
    create policy "admin write projects" on community_projects for insert to authenticated
      with check (exists (select 1 from community_members m where m.community_id = community_projects.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_projects' and policyname = 'admin update projects') then
    create policy "admin update projects" on community_projects for update to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_projects.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_projects' and policyname = 'admin delete projects') then
    create policy "admin delete projects" on community_projects for delete to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_projects.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')));
  end if;
end $$;

-- Media and files: members read/write, owners and admins delete.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_media' and policyname = 'member read media') then
    create policy "member read media" on community_media for select to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_media.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_media' and policyname = 'member write media') then
    create policy "member write media" on community_media for insert to authenticated
      with check (exists (select 1 from community_members m where m.community_id = community_media.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_media' and policyname = 'owner delete media') then
    create policy "owner delete media" on community_media for delete to authenticated
      using (
        community_media.created_by = auth.uid()
        or exists (select 1 from community_members m where m.community_id = community_media.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_files' and policyname = 'member read files') then
    create policy "member read files" on community_files for select to authenticated
      using (exists (select 1 from community_members m where m.community_id = community_files.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_files' and policyname = 'member write files') then
    create policy "member write files" on community_files for insert to authenticated
      with check (exists (select 1 from community_members m where m.community_id = community_files.community_id and m.user_id = auth.uid() and m.status = 'active'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_files' and policyname = 'owner delete files') then
    create policy "owner delete files" on community_files for delete to authenticated
      using (
        community_files.created_by = auth.uid()
        or exists (select 1 from community_members m where m.community_id = community_files.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
      );
  end if;
end $$;

-- RSVPs: anyone signed in reads counts, users manage their own row.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_rsvps' and policyname = 'signed-in read rsvps') then
    create policy "signed-in read rsvps" on event_rsvps for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_rsvps' and policyname = 'own rsvp write') then
    create policy "own rsvp write" on event_rsvps for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_rsvps' and policyname = 'own rsvp delete') then
    create policy "own rsvp delete" on event_rsvps for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- Events: signed-in users read, community admins (or the creator) write.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'signed-in read events') then
    create policy "signed-in read events" on events for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'admin write events') then
    create policy "admin write events" on events for insert to authenticated
      with check (
        created_by = auth.uid()
        and (
          community_id is null
          or exists (select 1 from community_members m where m.community_id = events.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'admin delete events') then
    create policy "admin delete events" on events for delete to authenticated
      using (
        created_by = auth.uid()
        or (
          community_id is not null
          and exists (select 1 from community_members m where m.community_id = events.community_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Storage buckets and policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('post-media', 'post-media', true),
  ('community-media', 'community-media', false),
  ('community-files', 'community-files', false)
on conflict (id) do update set public = excluded.public;

-- Public buckets: anyone reads, signed-in users upload under their own id.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read avatars') then
    create policy "public read avatars" on storage.objects for select to public
      using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'own avatar upload') then
    create policy "own avatar upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read post media') then
    create policy "public read post media" on storage.objects for select to public
      using (bucket_id = 'post-media');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'member post media upload') then
    create policy "member post media upload" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'post-media'
        and exists (select 1 from community_members m where m.community_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.status = 'active')
      );
  end if;
end $$;

-- Private buckets: only active members of the community in path segment 1.
-- Path shape: <community_id>/<user_id>/<file>
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'member read community media') then
    create policy "member read community media" on storage.objects for select to authenticated
      using (
        bucket_id in ('community-media', 'community-files')
        and exists (select 1 from community_members m where m.community_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.status = 'active')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'member upload community media') then
    create policy "member upload community media" on storage.objects for insert to authenticated
      with check (
        bucket_id in ('community-media', 'community-files')
        and exists (select 1 from community_members m where m.community_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.status = 'active')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner delete community media') then
    create policy "owner delete community media" on storage.objects for delete to authenticated
      using (
        bucket_id in ('community-media', 'community-files')
        and (
          (storage.foldername(name))[2] = auth.uid()::text
          or exists (select 1 from community_members m where m.community_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Optional: mask encrypted chat previews
-- ---------------------------------------------------------------------------
-- Encrypted DMs store a JSON envelope in messages.body. If a trigger copies
-- body into conversations.last_message_preview, the preview shows ciphertext
-- (harmless, but ugly). Only apply this if you know that trigger exists and
-- want a clean label instead:
--
-- create or replace function mask_encrypted_preview()
-- returns trigger language plpgsql as $$
-- begin
--   if new.body like '{"v":1,%' then
--     new.body := '{"v":1}';
--   end if;
--   return new;
-- end $$;
-- (Wire it into your own preview trigger; the app works without it.)
