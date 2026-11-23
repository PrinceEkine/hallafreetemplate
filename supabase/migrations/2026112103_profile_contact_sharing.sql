-- Member profile sharing: contacts (email + phone) and call history become
-- visible to fellow active members of shared communities on member profiles.
-- People who share no community with the member still see nothing.
-- Run: supabase db push

-- 1. Store the auth email alongside the phone so profiles can show it to
-- fellow members. (Auth emails are not readable through the API.)
alter table public.profile_contacts
  add column if not exists email text;

-- Backfill every known user from auth.users. New signups are covered by
-- the trigger below plus a client-side sync on every sign-in.
insert into public.profile_contacts (user_id, email)
select au.id, au.email
from auth.users au
on conflict (user_id) do update set email = excluded.email;

-- Keep the signup trigger writing the email for future users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  insert into public.profile_contacts (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

-- 2. Contacts readable by the owner plus fellow active members of any
-- shared community (same sharing rule as member profile names).
drop policy if exists "Users can view own contact" on public.profile_contacts;
create policy "Members can view shared contacts"
  on public.profile_contacts for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.community_members m1
      join public.community_members m2 on m1.community_id = m2.community_id
      where m1.user_id = auth.uid()
        and m2.user_id = profile_contacts.user_id
        and m1.status = 'active'
        and m2.status = 'active'
    )
  );

-- 3. Call logs in shared communities readable by their active members, so
-- a member profile can show call history to non-admin viewers. Admins keep
-- their wider roster bypass below; starters and participants are unchanged.
drop policy if exists "Starters, participants and admins can read logs" on public.call_logs;
create policy "Starters, participants, members and admins can read logs"
  on public.call_logs for select
  using (
    started_by = auth.uid()
    or (
      conversation_id is not null
      and public.is_conversation_member(conversation_id)
    )
    or (
      conversation_id is not null
      and exists (
        select 1 from public.conversations c
        where c.id = call_logs.conversation_id
          and c.community_id is not null
          and public.is_community_admin(c.community_id)
      )
    )
    or (
      meeting_id is not null
      and exists (
        select 1 from public.community_meetings m
        where m.id = call_logs.meeting_id
          and public.is_community_admin(m.community_id)
      )
    )
    or (
      conversation_id is not null
      and exists (
        select 1
        from public.conversations c
        join public.community_members m on m.community_id = c.community_id
        where c.id = call_logs.conversation_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
    or (
      meeting_id is not null
      and exists (
        select 1
        from public.community_meetings m
        join public.community_members m2 on m2.community_id = m.community_id
        where m.id = call_logs.meeting_id
          and m2.user_id = auth.uid()
          and m2.status = 'active'
      )
    )
  );
