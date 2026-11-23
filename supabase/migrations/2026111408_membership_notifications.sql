-- Ophixe membership notifications: join requests, joins, approvals,
-- leaves and admin-added members all surface in notifications.
-- Safe to re-run. Requires 0001_init.sql, 0008_security.sql and 0012_phase2.sql.

alter table public.notification_prefs
  add column if not exists community boolean not null default true;

create or replace function trg_membership_insert()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'membership',
    'op', 'INSERT',
    'status', new.status,
    'community_id', new.community_id,
    'user_id', new.user_id
  ));
  return new;
end $$;

drop trigger if exists trg_membership_insert on community_members;
create trigger trg_membership_insert after insert on community_members
  for each row execute function trg_membership_insert();

create or replace function trg_membership_update()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    perform post_fanout(jsonb_build_object(
      'event', 'membership',
      'op', 'UPDATE',
      'status', new.status,
      'old_status', old.status,
      'community_id', new.community_id,
      'user_id', new.user_id
    ));
  end if;
  return new;
end $$;

drop trigger if exists trg_membership_update on community_members;
create trigger trg_membership_update after update of status on community_members
  for each row execute function trg_membership_update();

create or replace function trg_membership_delete()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'membership',
    'op', 'DELETE',
    'community_id', old.community_id,
    'user_id', old.user_id
  ));
  return old;
end $$;

drop trigger if exists trg_membership_delete on community_members;
create trigger trg_membership_delete after delete on community_members
  for each row execute function trg_membership_delete();

-- Admin adds a member directly by phone number. The join trigger tells
-- the other admins; the direct fan-out tells the added member.
create or replace function public.admin_add_member(
  p_community uuid, p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_community_admin(p_community) then
    raise exception 'Only an admin can add members.';
  end if;
  select user_id into v_user
  from public.profile_contacts
  where phone = trim(p_phone);
  if v_user is null then
    raise exception 'No account uses that number yet. They must sign up first.';
  end if;
  select status into v_status
  from public.community_members
  where community_id = p_community and user_id = v_user;
  if v_status = 'active' then
    raise exception 'They are already a member.';
  end if;
  if v_status = 'pending' then
    update public.community_members set status = 'active'
    where community_id = p_community and user_id = v_user;
  else
    insert into public.community_members (community_id, user_id, role, status)
    values (p_community, v_user, 'member', 'active');
  end if;
  perform post_fanout(jsonb_build_object(
    'event', 'member_added',
    'community_id', p_community,
    'user_id', v_user
  ));
  return v_user;
end;
$$;

grant execute on function public.admin_add_member(uuid, text) to authenticated;
