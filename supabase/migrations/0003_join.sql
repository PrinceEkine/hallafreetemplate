-- Ophixe join flow: secure invite-code RPC.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql. Safe to re-run.

-- Join a community with an invite code. Runs as the database owner so it can
-- look up private communities, but only ever adds the *signed-in* user, and
-- respects the community's who_can_join setting ('anyone' joins instantly,
-- anything else creates a pending request for admins to approve).
create or replace function public.join_community_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_who_can_join text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select id, who_can_join into v_community_id, v_who_can_join
  from public.communities
  where invite_code = lower(trim(p_code));

  if v_community_id is null then
    raise exception 'Invalid invite code.';
  end if;

  insert into public.community_members (community_id, user_id, role, status)
  values (
    v_community_id,
    auth.uid(),
    'member',
    case when v_who_can_join = 'anyone' then 'active' else 'pending' end
  )
  on conflict (community_id, user_id) do nothing;

  return v_community_id;
end;
$$;

grant execute on function public.join_community_by_code(text) to authenticated;
