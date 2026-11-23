-- File folders: admin-only creation plus All / Admin / select-members
-- visibility on folders and files. Safe to re-run.
--
-- Existing rows keep working: both visibility columns default to 'all'.

alter table public.community_file_folders
  add column if not exists visibility text not null default 'all'
  check (visibility in ('all', 'admin', 'selected'));

alter table public.community_files
  add column if not exists visibility text not null default 'all'
  check (visibility in ('all', 'admin', 'selected'));

create table if not exists public.community_file_visible_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  folder_id uuid references public.community_file_folders (id) on delete cascade,
  file_id uuid references public.community_files (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (folder_id is not null and file_id is null)
    or (folder_id is null and file_id is not null)
  )
);

create unique index if not exists file_visible_members_folder_user_idx
  on public.community_file_visible_members (folder_id, user_id)
  where folder_id is not null;
create unique index if not exists file_visible_members_file_user_idx
  on public.community_file_visible_members (file_id, user_id)
  where file_id is not null;
create index if not exists file_visible_members_user_idx
  on public.community_file_visible_members (user_id);

alter table public.community_file_visible_members enable row level security;

-- Who can see the select-members lists: the listed user and community admins.
drop policy if exists "Admins manage visible members"
  on public.community_file_visible_members;
create policy "Admins manage visible members"
  on public.community_file_visible_members for all
  using (
    user_id = auth.uid()
    or public.is_community_admin(community_id)
  )
  with check (public.is_community_admin(community_id));

-- Folders: members read what is visible to them.
drop policy if exists "Members can read folders"
  on public.community_file_folders;
create policy "Members can read folders"
  on public.community_file_folders for select
  using (
    public.is_community_member(community_id)
    and (
      visibility = 'all'
      or created_by = auth.uid()
      or (
        visibility = 'admin'
        and public.is_community_admin(community_id)
      )
      or exists (
        select 1 from public.community_file_visible_members v
        where v.folder_id = community_file_folders.id
          and v.user_id = auth.uid()
      )
    )
  );

-- Only admins can create folders.
drop policy if exists "Members can create folders"
  on public.community_file_folders;
drop policy if exists "Admins can create folders"
  on public.community_file_folders;
create policy "Admins can create folders"
  on public.community_file_folders for insert
  with check (public.is_community_admin(community_id));

-- Only admins can rename folders or change their visibility.
drop policy if exists "Admins can update folders"
  on public.community_file_folders;
create policy "Admins can update folders"
  on public.community_file_folders for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

-- Files: members read what is visible to them.
drop policy if exists "member read files" on public.community_files;
create policy "member read files"
  on public.community_files for select
  to authenticated
  using (
    exists (
      select 1 from public.community_members m
      where m.community_id = community_files.community_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    and (
      visibility = 'all'
      or created_by = auth.uid()
      or (
        visibility = 'admin'
        and public.is_community_admin(community_files.community_id)
      )
      or exists (
        select 1 from public.community_file_visible_members v
        where v.file_id = community_files.id
          and v.user_id = auth.uid()
      )
    )
  );

-- Members upload visible-to-all files; only admins may restrict visibility.
drop policy if exists "member write files" on public.community_files;
create policy "member write files"
  on public.community_files for insert
  to authenticated
  with check (
    exists (
      select 1 from public.community_members m
      where m.community_id = community_files.community_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    and (
      visibility = 'all'
      or public.is_community_admin(community_files.community_id)
    )
  );

-- Only admins can change file visibility.
drop policy if exists "Admins can update files" on public.community_files;
create policy "Admins can update files"
  on public.community_files for update
  to authenticated
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));
