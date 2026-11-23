-- Ophixe comment moderation: authors can edit their own comments, members
-- can report a comment to their community admins, and each report fans out
-- to the admins' notifications. Delete was already author-or-admin.
-- Safe to re-run. Requires 0010_social.sql and 2026110802_push_triggers.sql.
drop policy if exists "Authors and admins can edit comments" on public.post_comments;
create policy "Authors and admins can edit comments"
  on public.post_comments for update
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_admin(p.community_id)
    )
  );

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists comment_reports_community_idx
  on public.comment_reports (community_id);

alter table public.comment_reports enable row level security;

drop policy if exists "Members can report comments" on public.comment_reports;
create policy "Members can report comments"
  on public.comment_reports for insert
  with check (
    reporter_id = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Admins can read reports" on public.comment_reports;
create policy "Admins can read reports"
  on public.comment_reports for select
  using (public.is_community_admin(community_id));

drop policy if exists "Admins can clear reports" on public.comment_reports;
create policy "Admins can clear reports"
  on public.comment_reports for delete
  using (public.is_community_admin(community_id));

create or replace function public.trg_comment_report_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'comment_report',
    'report_id', new.id
  ));
  return new;
end $$;

drop trigger if exists trg_comment_report_fanout on public.comment_reports;
create trigger trg_comment_report_fanout after insert on public.comment_reports
  for each row execute function public.trg_comment_report_fanout();
