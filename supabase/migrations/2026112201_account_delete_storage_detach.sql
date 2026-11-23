-- Account deletion repair: detach surviving owned files before the wipe.
-- storage.objects.owner references auth.users WITHOUT cascade (Supabase
-- owns that schema and defines no ON DELETE action), so any owned row the
-- wipe deliberately keeps — community logos, community files, surviving
-- event banners — aborts the whole delete_my_account call with a foreign
-- key violation. Detach those leftovers (files stay for the community,
-- ownerless) right before the auth user goes.
-- Run: supabase db push

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

  -- 4b. Detach whatever owned rows step 4 kept: without this, the
  -- non-cascading storage.objects.owner FK fails the auth delete below.
  update storage.objects set owner = null where owner = uid;

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
