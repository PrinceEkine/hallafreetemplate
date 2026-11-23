-- Contact page upgrades: a community phone number shown instead of the
-- invite code, plus a support roster any active member can be added to.
-- Run: supabase db push

alter table public.communities
  add column if not exists phone text not null default '';

alter table public.community_members
  add column if not exists is_support boolean not null default false;

create index if not exists community_members_support_idx
  on public.community_members (community_id)
  where status = 'active' and is_support = true;
