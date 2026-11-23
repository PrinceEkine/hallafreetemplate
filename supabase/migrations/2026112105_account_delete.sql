-- In-app account deletion: one atomic server-side wipe plus the storage
-- policy the client needs to truly delete its public photos first.
-- Run: supabase db push
--
-- What happens, in order:
--   1. Owned communities move to the longest-standing admin (else member),
--      exactly like exit_community; owner-only communities are destroyed.
--   2. Nullable authorship on shared records (announcements, events, dues,
--      reviews) is detached so community history survives anonymously.
--   3. The user's own messages and polls go (envelopes, reactions, votes
--      cascade); everything else user-linked cascades off the profile row.
--   4. Storage rows owned by the user are revoked, except community-shared
--      assets (logos, community files, surviving event banners).
--   5. auth.users goes, cascading profiles and every cascading child.
--   6. Conversations left participant-less are removed.

-- Users truly delete their own public post photos (client pre-wipe) the
-- same way they already delete their own avatar.
drop policy if exists "Users can delete own post media" on storage.objects;
create policy "Users can delete own post media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Owners wiping a dying community also clear its shared images (logos,
-- banners, members' post photos); mirrors the community-media precedent.
drop policy if exists "Owners can delete community images" on storage.objects;
create policy "Owners can delete community images"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'post-media')
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername(name))[1]
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

-- Anonymous deletion feedback: one row per deleted account, deliberately
-- NOT linked to any user (the point of deletion is that nothing remains).
create table if not exists public.deletion_feedback (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.deletion_feedback enable row level security;

drop policy if exists "Anyone signed in can leave deletion feedback" on public.deletion_feedback;
create policy "Anyone signed in can leave deletion feedback"
  on public.deletion_feedback for insert to authenticated
  with check (true);

drop function if exists public.delete_my_account();
create or replace function public.delete_my_account(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_community record;
  v_next uuid;
  v_transferred text[] := '{}';
  v_destroyed text[] := '{}';
begin
  if uid is null then
    raise exception 'You must be signed in.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Please tell us why you are leaving.';
  end if;
  insert into public.deletion_feedback (reason)
  values (trim(p_reason));

  -- 1. Owned communities: hand over, or destroy when nobody else is in.
  for v_community in
    select id, name from public.communities where owner_id = uid
  loop
    select user_id into v_next
    from public.community_members
    where community_id = v_community.id
      and status = 'active'
      and user_id <> uid
    order by (role = 'admin') desc, created_at asc
    limit 1;
    if v_next is null then
      perform public._destroy_community(v_community.id);
      v_destroyed := v_destroyed || v_community.name;
    else
      update public.communities set owner_id = v_next
      where id = v_community.id;
      update public.community_members set role = 'owner'
      where community_id = v_community.id and user_id = v_next;
      v_transferred := v_transferred || v_community.name;
    end if;
  end loop;

  -- 2. Detach authorship from shared records (nullable, no cascade).
  update public.announcements set author_id = null where author_id = uid;
  update public.events set created_by = null where created_by = uid;
  update public.community_dues set created_by = null where created_by = uid;
  update public.form_submissions set reviewed_by = null
  where reviewed_by = uid;
  update public.transfer_claims set reviewed_by = null
  where reviewed_by = uid;

  -- 3. Own rows with blocking NOT NULL author links.
  delete from public.messages where sender_id = uid;
  delete from public.community_polls where created_by = uid;

  -- 4. Revoke every file row the user owns, except community-shared
  -- assets that must survive them (logos, community files, and banners
  -- of events that stay up with detached authorship).
  delete from storage.objects o
  where o.owner = uid
    and o.bucket_id not in ('community-media', 'community-files', 'releases')
    and not (
      o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] <> 'profile'
    )
    and not (
      o.bucket_id = 'post-media'
      and exists (
        select 1 from public.events e where e.banner_url = o.name
      )
    );

  -- 5. The auth user; profiles and every cascading child follow.
  delete from auth.users where id = uid;

  -- 6. Conversations left with no participants (e.g. zero-member groups
  -- the user created).
  delete from public.conversations c
  where not exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = c.id
  );

  return jsonb_build_object(
    'transferred', v_transferred,
    'destroyed', v_destroyed
  );
end;
$$;

grant execute on function public.delete_my_account(text) to authenticated;
