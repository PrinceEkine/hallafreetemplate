-- Custom member tags: an admin-chosen label per membership (usher, choir,
-- security desk...), shown on the directory and the member profile.
-- No policy change: the admin membership-update policy already allows
-- admin writes to community_members rows.
-- Run: supabase db push

alter table public.community_members
  add column if not exists tag text;
