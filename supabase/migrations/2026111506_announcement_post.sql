-- Ophixe announcements can link to a post: tapping SEE MORE on a linked
-- announcement opens the post. Unlinked announcements open their detail.
-- Safe to re-run. Requires 0001_init.sql and 0002_content.sql.
alter table public.announcements
  add column if not exists post_id uuid
  references public.posts (id) on delete set null;

create index if not exists idx_announcements_post
  on public.announcements (post_id);
