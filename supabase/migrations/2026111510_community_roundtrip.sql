-- Ophixe community roundtrip: member posting, empty groups, edited flags,
-- admins-only announcements, content reports, and admin member search.
-- Safe to re-run. Requires 0001_init.sql, 0002_content.sql, 0008_security.sql,
-- 0010_social.sql, 0012_phase2.sql and 2026110802_push_triggers.sql.
--
-- 1. Any active member can post (replaces the 0011 admin-only rule).
--    Announcements stay admin-only.
drop policy if exists "Admins can create posts" on public.posts;
drop policy if exists "Members can create posts" on public.posts;
create policy "Members can create posts"
  on public.posts for insert
  with check (
    author_id = auth.uid()
    and public.is_community_member(community_id)
  );

-- 2. Groups may start empty; the admin adds people later from Group info.
create or replace function public.create_group(
  p_community uuid, p_title text, p_members uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text;
  v_member uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  v_title := trim(p_title);
  if char_length(v_title) < 1 or char_length(v_title) > 60 then
    raise exception 'Give the group a name (1-60 characters).';
  end if;
  if not exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Join the community first.';
  end if;
  select count(*) into v_count
  from public.community_members
  where community_id = p_community
    and status = 'active'
    and user_id = any (p_members);
  if v_count <> coalesce(array_length(p_members, 1), 0) then
    raise exception 'Everyone added must belong to the community.';
  end if;
  insert into public.conversations (community_id, is_group, title)
  values (p_community, true, v_title)
  returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;
  if p_members is not null then
    foreach v_member slice 0 in array p_members loop
      if v_member <> auth.uid() then
        insert into public.conversation_participants (conversation_id, user_id)
        values (v_id, v_member)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return v_id;
end;
$$;

grant execute on function public.create_group(uuid, text, uuid[]) to authenticated;

-- 3. Edited flags: updated_at stays null until the first edit.
alter table public.posts add column if not exists updated_at timestamptz;
alter table public.announcements add column if not exists updated_at timestamptz;

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

drop trigger if exists trg_posts_touch on public.posts;
create trigger trg_posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_announcements_touch on public.announcements;
create trigger trg_announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();

-- 4. Announcements can be restricted to admins only.
alter table public.announcements
  add column if not exists admins_only boolean not null default false;

drop policy if exists "Members can read announcements" on public.announcements;
create policy "Members can read announcements"
  on public.announcements for select
  using (
    public.is_community_member(community_id)
    and (not admins_only or public.is_community_admin(community_id))
  );

-- 5. Members can report a post or an announcement to their admins.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete cascade,
  announcement_id uuid references public.announcements (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint content_reports_one_target check (
    (post_id is not null)::int + (announcement_id is not null)::int = 1
  )
);

create index if not exists content_reports_community_idx
  on public.content_reports (community_id);

alter table public.content_reports enable row level security;

drop policy if exists "Members can report content" on public.content_reports;
create policy "Members can report content"
  on public.content_reports for insert
  with check (
    reporter_id = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Admins can read content reports" on public.content_reports;
create policy "Admins can read content reports"
  on public.content_reports for select
  using (public.is_community_admin(community_id));

drop policy if exists "Admins can clear content reports" on public.content_reports;
create policy "Admins can clear content reports"
  on public.content_reports for delete
  using (public.is_community_admin(community_id));

create or replace function public.trg_content_report_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'content_report',
    'report_id', new.id
  ));
  return new;
end $$;

drop trigger if exists trg_content_report_fanout on public.content_reports;
create trigger trg_content_report_fanout after insert on public.content_reports
  for each row execute function public.trg_content_report_fanout();

-- 6. Admin adds a member directly by user id (for name-search results).
create or replace function public.admin_add_member_by_id(
  p_community uuid, p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_community_admin(p_community) then
    raise exception 'Only an admin can add members.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'That account no longer exists.';
  end if;
  select status into v_status
  from public.community_members
  where community_id = p_community and user_id = p_user;
  if v_status = 'active' then
    raise exception 'They are already a member.';
  end if;
  if v_status = 'pending' then
    update public.community_members set status = 'active'
    where community_id = p_community and user_id = p_user;
  else
    insert into public.community_members (community_id, user_id, role, status)
    values (p_community, p_user, 'member', 'active');
  end if;
  perform post_fanout(jsonb_build_object(
    'event', 'member_added',
    'community_id', p_community,
    'user_id', p_user
  ));
  return p_user;
end;
$$;

grant execute on function public.admin_add_member_by_id(uuid, uuid) to authenticated;

-- 7. Admin searches people to add by name or phone number. Directory
--    searches only see fellow members, so this definer lookup is scoped
--    to users outside the community.
create or replace function public.search_users_to_add(
  p_community uuid, p_query text
)
returns table (user_id uuid, full_name text, avatar_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text;
  v_digits text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_community_admin(p_community) then
    raise exception 'Only an admin can add members.';
  end if;
  v_q := replace(replace(trim(coalesce(p_query, '')), '%', ''), '_', '');
  if char_length(v_q) < 2 then
    return;
  end if;
  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  return query
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  left join public.profile_contacts c on c.user_id = p.id
  where not exists (
    select 1 from public.community_members m
    where m.community_id = p_community
      and m.user_id = p.id
      and m.status in ('active', 'pending')
  )
  and (
    p.full_name ilike '%' || v_q || '%'
    or (
      char_length(v_digits) >= 3
      and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
        like '%' || v_digits || '%'
    )
  )
  order by p.full_name
  limit 20;
end;
$$;

grant execute on function public.search_users_to_add(uuid, text) to authenticated;
