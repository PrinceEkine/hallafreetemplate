-- Ophixe tasks gain an in-between state: open -> in_progress -> done.
-- Safe to re-run. Requires 2026110801_community_modules.sql.
alter table public.community_tasks
  drop constraint if exists community_tasks_status_check;
alter table public.community_tasks
  add constraint community_tasks_status_check
  check (status in ('open', 'in_progress', 'done'));
