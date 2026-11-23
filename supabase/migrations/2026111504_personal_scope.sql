-- Ophixe personal events stay inside the community they were set in.
-- The column is nullable so existing rows keep working; new rows always
-- carry the community they were created under.
-- Safe to re-run. Requires 0012_phase2.sql.
alter table public.personal_events
  add column if not exists community_id uuid
  references public.communities (id) on delete cascade;

create index if not exists idx_personal_events_user_community
  on public.personal_events (user_id, community_id);
