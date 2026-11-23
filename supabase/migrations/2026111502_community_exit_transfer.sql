-- Ophixe community exit with ownership handover: when the owner exits and
-- active members remain, ownership moves to the longest-standing other admin
-- (else the longest-standing member) and the owner simply leaves. Deleting
-- still happens only when the last active member exits.
-- Safe to re-run. Requires 2026111405_community_exit.sql.
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
    perform public._destroy_community(p_community);
    return 'deleted';
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
