-- Invite-via-email/phone lookup: admins resolving a registered user
-- also land the invite in-app (plus the external mail/SMS composer).
-- Admin-gated per community so addresses cannot be harvested.
create or replace function public.find_invite_user_by_email(
  p_community uuid, p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not is_community_admin(p_community) then
    raise exception 'Only admins can invite.' using errcode = '42501';
  end if;
  select c.user_id into v_user
    from public.profile_contacts c
   where lower(c.email) = lower(trim(p_email))
   limit 1;
  return v_user;
end;
$$;

create or replace function public.find_invite_user_by_phone(
  p_community uuid, p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_digits text;
begin
  if not is_community_admin(p_community) then
    raise exception 'Only admins can invite.' using errcode = '42501';
  end if;
  v_digits := regexp_replace(trim(p_phone), '\D', '', 'g');
  if char_length(v_digits) < 7 then
    return null;
  end if;
  select c.user_id into v_user
    from public.profile_contacts c
   where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10)
       = right(v_digits, 10)
   limit 1;
  return v_user;
end;
$$;
