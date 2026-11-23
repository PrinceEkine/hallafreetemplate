-- LinkedIn-pattern community invites: an admin invites by name, the
-- invitee accepts from Notifications and joins directly (no approval
-- queue — the admin already chose them).

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists member_invites_pending_once
  on public.member_invites (community_id, user_id)
  where status = 'pending';

alter table public.member_invites enable row level security;

drop policy if exists "Admins can manage invites" on public.member_invites;
create policy "Admins can manage invites"
  on public.member_invites for all
  using (is_community_admin(community_id))
  with check (is_community_admin(community_id));

drop policy if exists "Invitees can read own invites" on public.member_invites;
create policy "Invitees can read own invites"
  on public.member_invites for select
  using (user_id = auth.uid());

drop policy if exists "Invitees can respond to invites" on public.member_invites;
create policy "Invitees can respond to invites"
  on public.member_invites for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admins may write invite notices (and nothing else) into notifications.
drop policy if exists "Admins can send invite notices" on public.notifications;
create policy "Admins can send invite notices"
  on public.notifications for insert
  with check (
    kind = 'community'
    and community_id is not null
    and is_community_admin(community_id)
  );

-- Accept an invite: addressed to me, still pending → active member.
-- Never touches roles: an existing admin row stays admin.
create or replace function public.accept_community_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community uuid;
  v_user uuid;
  v_status text;
begin
  select community_id, user_id, status
    into v_community, v_user, v_status
    from public.member_invites
   where id = p_invite_id;
  if not found then
    raise exception 'Invite not found.' using errcode = 'P0001';
  end if;
  if v_user != auth.uid() then
    raise exception 'This invite is for someone else.' using errcode = '42501';
  end if;
  if v_status != 'pending' then
    return v_community;
  end if;
  insert into public.community_members (community_id, user_id, role, status)
  values (v_community, v_user, 'member', 'active')
  on conflict (community_id, user_id)
  do update set status = 'active'
    where community_members.status != 'active';
  update public.member_invites
     set status = 'accepted', responded_at = now()
   where id = p_invite_id;
  return v_community;
end;
$$;
