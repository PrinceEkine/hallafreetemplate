-- Ophixe community round 2: admin post edits, announcement pictures,
-- @mention tagging for posts/announcements, 24h exit grace, and group
-- envelope backfill for keyless-era messages.
-- Safe to re-run. Requires 0001_init.sql, 0002_content.sql, 0004_chat.sql,
-- 0008_security.sql, 0010_social.sql, 0012_phase2.sql,
-- 2026110801_community_modules.sql, 2026110802_push_triggers.sql,
-- 2026110804_group_e2ee.sql, 2026111403_post_media.sql,
-- 2026111405_community_exit.sql, 2026111502_community_exit_transfer.sql,
-- 2026111506_announcement_post.sql, 2026111508_mentions.sql,
-- 2026111510_community_roundtrip.sql.

-- 1. Admins can edit any community post (authors keep their own rule).
drop policy if exists "Admins can edit posts" on public.posts;
create policy "Admins can edit posts"
  on public.posts for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

-- 2. Admins can attach pictures to any community post.
drop policy if exists "Authors can add post media" on public.post_media;
drop policy if exists "Authors and admins can add post media" on public.post_media;
create policy "Authors and admins can add post media"
  on public.post_media for insert
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (
          p.author_id = auth.uid()
          or public.is_community_admin(p.community_id)
        )
    )
  );

-- 3. Post-media files can be removed by the uploader or a community admin.
-- Path shape: <community_id>/<user_id>/<file>.
drop policy if exists "post media owner delete" on storage.objects;
create policy "post media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or exists (
        select 1 from public.community_members m
        where m.community_id::text = (storage.foldername(name))[1]
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.role in ('owner', 'admin')
      )
    )
  );

-- 4. Announcement pictures (up to 4 per announcement, enforced by the app).
create table if not exists public.announcement_media (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.announcement_media enable row level security;

create index if not exists announcement_media_announcement_position_idx
  on public.announcement_media (announcement_id, position);

drop policy if exists "Members can view announcement media" on public.announcement_media;
create policy "Members can view announcement media"
  on public.announcement_media for select
  using (
    exists (
      select 1 from public.announcements a
      where a.id = announcement_id
        and public.is_community_member(a.community_id)
    )
  );

drop policy if exists "Authors and admins can add announcement media" on public.announcement_media;
create policy "Authors and admins can add announcement media"
  on public.announcement_media for insert
  with check (
    exists (
      select 1 from public.announcements a
      where a.id = announcement_id
        and (
          a.author_id = auth.uid()
          or public.is_community_admin(a.community_id)
        )
    )
  );

drop policy if exists "Authors and admins can delete announcement media" on public.announcement_media;
create policy "Authors and admins can delete announcement media"
  on public.announcement_media for delete
  using (
    exists (
      select 1 from public.announcements a
      where a.id = announcement_id
        and (
          a.author_id = auth.uid()
          or public.is_community_admin(a.community_id)
        )
    )
  );

-- 5. Mentions can tag announcements, and authors can re-tag on edit.
alter table public.mentions
  add column if not exists announcement_id uuid
  references public.announcements (id) on delete cascade;

create index if not exists mentions_announcement_idx
  on public.mentions (announcement_id);

drop policy if exists "Authors can clear own mentions" on public.mentions;
create policy "Authors can clear own mentions"
  on public.mentions for delete
  using (mentioned_by = auth.uid());

-- 6. Exit grace: the last member out schedules deletion in 24 hours
-- instead of deleting immediately, so info can still be exported and a
-- rejoin (any active membership) cancels the deletion.
alter table public.communities
  add column if not exists scheduled_delete_at timestamptz;
alter table public.communities
  add column if not exists scheduled_delete_by uuid
  references public.profiles (id) on delete set null;

create or replace function public.exit_community(p_community uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count int;
  v_mine text;
  v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select owner_id into v_owner
  from public.communities where id = p_community;
  if v_owner is null then
    raise exception 'Community not found.';
  end if;
  select status into v_mine
  from public.community_members
  where community_id = p_community and user_id = auth.uid();
  if v_mine is distinct from 'active' then
    raise exception 'You are not a member of this community.';
  end if;
  select count(*) into v_count
  from public.community_members
  where community_id = p_community and status = 'active';
  if v_count <= 1 then
    update public.communities
    set scheduled_delete_at = now() + interval '24 hours',
        scheduled_delete_by = auth.uid()
    where id = p_community;
    delete from public.community_members
    where community_id = p_community and user_id = auth.uid();
    return 'scheduled';
  end if;
  if v_owner = auth.uid() then
    select user_id into v_next
    from public.community_members
    where community_id = p_community
      and status = 'active'
      and user_id <> auth.uid()
    order by (role = 'admin') desc, created_at asc
    limit 1;
    if v_next is null then
      raise exception 'No other member can take ownership.';
    end if;
    update public.communities set owner_id = v_next where id = p_community;
    update public.community_members set role = 'owner'
    where community_id = p_community and user_id = v_next;
    delete from public.community_members
    where community_id = p_community and user_id = auth.uid();
    return 'transferred';
  end if;
  delete from public.community_members
  where community_id = p_community and user_id = auth.uid();
  return 'left';
end;
$$;

grant execute on function public.exit_community(uuid) to authenticated;

create or replace function public.cancel_scheduled_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    update public.communities
    set scheduled_delete_at = null, scheduled_delete_by = null
    where id = new.community_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cancel_scheduled_delete on public.community_members;
create trigger trg_cancel_scheduled_delete
  after insert or update of status on public.community_members
  for each row execute function public.cancel_scheduled_delete();

-- Deletes expired, memberless communities. Safe to expose: it is a no-op
-- unless both conditions hold. The app calls it opportunistically; for
-- strict timing also schedule it (dashboard > pg_cron):
--   select cron.schedule('purge-communities', '0 * * * *',
--     'select public.purge_expired_communities()');
create or replace function public.purge_expired_communities()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select c.id from public.communities c
    where c.scheduled_delete_at is not null
      and c.scheduled_delete_at <= now()
      and not exists (
        select 1 from public.community_members m
        where m.community_id = c.id and m.status = 'active'
      )
  loop
    perform public._destroy_community(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

grant execute on function public.purge_expired_communities() to authenticated;

-- 7. Senders can backfill envelopes for group messages sent before a
-- member's chat key existed. Only the sender, only current members,
-- existing envelopes untouched.
create or replace function public.backfill_group_envelopes(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_n int := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  for v_row in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    insert into public.message_envelopes (message_id, recipient_id, envelope)
    select
      (v_row->>'message_id')::uuid,
      (v_row->>'recipient_id')::uuid,
      v_row->>'envelope'
    where exists (
      select 1 from public.messages m
      where m.id = (v_row->>'message_id')::uuid
        and m.sender_id = auth.uid()
    )
    and exists (
      select 1
      from public.messages m
      join public.conversation_participants p
        on p.conversation_id = m.conversation_id
      where m.id = (v_row->>'message_id')::uuid
        and p.user_id = (v_row->>'recipient_id')::uuid
    )
    on conflict (message_id, recipient_id) do nothing;
    if found then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

grant execute on function public.backfill_group_envelopes(jsonb) to authenticated;
