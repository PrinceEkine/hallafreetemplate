-- Community profile fields: contact email + rules (admins), with
-- role-checked RPCs so members can edit About/Website and admins can
-- save without being the owner (table UPDATE is owner-only).
alter table public.communities add column if not exists email text;
alter table public.communities add column if not exists rules text;

-- Any active member may refresh the public About + Website.
create or replace function public.update_community_profile(
  p_community uuid, p_description text, p_website text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_community_member(p_community) then
    raise exception 'Join this community first.' using errcode = '42501';
  end if;
  update public.communities
     set description = trim(p_description),
         website = trim(p_website)
   where id = p_community;
end;
$$;

-- Admins (and owners) edit the main details.
create or replace function public.update_community_fields(
  p_community uuid, p_name text, p_description text, p_website text, p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_community_admin(p_community) then
    raise exception 'Only admins can edit this community.' using errcode = '42501';
  end if;
  if char_length(trim(p_name)) < 3 then
    raise exception 'Give your community a name (3+ characters).';
  end if;
  update public.communities
     set name = trim(p_name),
         description = trim(p_description),
         website = trim(p_website),
         phone = nullif(trim(p_phone), '')
   where id = p_community;
end;
$$;

create or replace function public.update_community_logo(
  p_community uuid, p_logo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_community_admin(p_community) then
    raise exception 'Only admins can edit this community.' using errcode = '42501';
  end if;
  update public.communities set logo_url = p_logo where id = p_community;
end;
$$;

-- Admin-only extras: contact email + rules (1000 chars max).
create or replace function public.update_community_admin_fields(
  p_community uuid, p_email text, p_rules text
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
  update public.communities
     set email = nullif(trim(p_email), ''),
         rules = nullif(trim(p_rules), '')
   where id = p_community;
end;
$$;
