-- LinkedIn-style work-email join: a community approves an email
-- domain, staff verify an address on it, and verified staff join
-- directly (invite-only communities still need their code).
alter table public.communities add column if not exists email_domain text;

-- Exact-match public lookup: reveals nothing but the matching name.
create or replace function public.find_community_by_email_domain(p_domain text)
returns table (id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name
    from public.communities c
   where lower(c.email_domain) = lower(trim(p_domain))
   limit 1;
$$;

drop function if exists public.update_community_admin_fields(uuid, text, text);
create function public.update_community_admin_fields(
  p_community uuid, p_email text, p_rules text, p_email_domain text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_community_admin(p_community) then
    raise exception 'Only admins can change these settings.' using errcode = '42501';
  end if;
  if p_rules is not null and char_length(trim(p_rules)) > 1000 then
    raise exception 'Rules must be 1000 characters or less.' using errcode = '22001';
  end if;
  if trim(coalesce(p_email_domain, '')) != ''
     and (
       trim(p_email_domain) like '%@%'
       or trim(p_email_domain) not like '%.%'
       or trim(p_email_domain) like '% %'
     ) then
    raise exception 'Enter a domain like company.com.' using errcode = '22001';
  end if;
  update public.communities
     set email = nullif(trim(p_email), ''),
         rules = nullif(trim(p_rules), ''),
         email_domain = nullif(lower(trim(p_email_domain)), '')
   where id = p_community;
end;
$$;

-- Verified join: my SIGNED-IN email must sit on the approved domain,
-- which only a completed OTP check can establish. Never bypasses
-- invite-only, never touches roles.
create or replace function public.join_verified_community(p_community uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text;
  v_rule text;
  v_email text;
  v_status text;
begin
  select lower(trim(c.email_domain)), lower(coalesce(c.who_can_join, 'approval'))
    into v_domain, v_rule
    from public.communities c
   where c.id = p_community;
  if not found or v_domain is null or v_domain = '' then
    raise exception 'This community has no approved email domain.' using errcode = 'P0001';
  end if;
  select lower(split_part(u.email, '@', 2)) into v_email
    from auth.users u where u.id = auth.uid();
  if v_email is distinct from v_domain then
    raise exception 'Your signed-in email is not on the approved domain.' using errcode = '42501';
  end if;
  if v_rule = 'invite' then
    return 'needs_code';
  end if;
  insert into public.community_members (community_id, user_id, role, status)
  values (p_community, auth.uid(), 'member', 'active')
  on conflict (community_id, user_id)
  do update set status = 'active'
    where community_members.status != 'active';
  select status into v_status
    from public.community_members
   where community_id = p_community and user_id = auth.uid();
  return coalesce(v_status, 'active');
end;
$$;
