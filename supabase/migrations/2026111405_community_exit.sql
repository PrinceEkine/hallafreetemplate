-- Ophixe community exit/delete/transfer: leaving removes one membership,
-- the last person out deletes the community (groups included), and owners
-- hand over or delete explicitly. Group chats get the same last-person rule.
-- Safe to re-run. Requires 0001_init.sql and 0004_chat.sql.

-- ── Internal destroy (groups first: conversations survive community delete
-- via SET NULL, but a deleted community must take its groups with it).
-- Scoped DMs are left alone: they belong to their two members. ────────────
create or replace function public._destroy_community(p_community uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversations
  where community_id = p_community and is_group = true;
  delete from public.communities where id = p_community;
end;
$$;

revoke all on function public._destroy_community(uuid)
  from public, anon, authenticated;

-- ── Exit: leave, or delete when you are the last active member ────────────
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
    perform public._destroy_community(p_community);
    return 'deleted';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Transfer ownership or delete the community first.';
  end if;
  delete from public.community_members
  where community_id = p_community and user_id = auth.uid();
  return 'left';
end;
$$;

grant execute on function public.exit_community(uuid) to authenticated;

-- ── Owner-only explicit delete ────────────────────────────────────────────
create or replace function public.delete_community(p_community uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select owner_id into v_owner
  from public.communities where id = p_community;
  if v_owner is null then
    raise exception 'Community not found.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Only the owner can delete this community.';
  end if;
  perform public._destroy_community(p_community);
end;
$$;

grant execute on function public.delete_community(uuid) to authenticated;

-- ── Owner hands the community to another active member ────────────────────
create or replace function public.transfer_community_ownership(
  p_community uuid, p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not exists (
    select 1 from public.communities
    where id = p_community and owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can transfer ownership.';
  end if;
  if p_new_owner = auth.uid() then
    raise exception 'You already own this community.';
  end if;
  if not exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = p_new_owner
      and status = 'active'
  ) then
    raise exception 'The new owner must be an active member.';
  end if;
  update public.communities set owner_id = p_new_owner where id = p_community;
  update public.community_members set role = 'owner'
  where community_id = p_community and user_id = p_new_owner;
  update public.community_members set role = 'admin'
  where community_id = p_community and user_id = auth.uid();
end;
$$;

grant execute on function public.transfer_community_ownership(uuid, uuid)
  to authenticated;

-- ── Group chats: leave, or delete the group when last out ─────────────────
create or replace function public.leave_group_chat(p_conversation uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group boolean;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select is_group into v_group
  from public.conversations where id = p_conversation;
  if v_group is null then
    raise exception 'Chat not found.';
  end if;
  if not v_group then
    raise exception 'This is not a group chat.';
  end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation and user_id = auth.uid()
  ) then
    raise exception 'You are not in this group.';
  end if;
  select count(*) into v_count
  from public.conversation_participants
  where conversation_id = p_conversation;
  if v_count <= 1 then
    delete from public.conversations where id = p_conversation;
    return 'deleted';
  end if;
  delete from public.conversation_participants
  where conversation_id = p_conversation and user_id = auth.uid();
  return 'left';
end;
$$;

grant execute on function public.leave_group_chat(uuid) to authenticated;
