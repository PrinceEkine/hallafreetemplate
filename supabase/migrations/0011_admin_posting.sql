-- Ophixe admin posting: admin-only posts, constrained self-joins, post titles, event banners.
-- Requires 0001_init.sql and 0002_content.sql. Safe to re-run.

alter table public.posts add column if not exists title text not null default '';
alter table public.events add column if not exists banner_url text;

-- Posts can only be created by community admins (members read).
drop policy if exists "Members can create posts" on public.posts;
create policy "Admins can create posts"
  on public.posts for insert
  with check (
    author_id = auth.uid()
    and public.is_community_admin(community_id)
  );

-- Self-serve joins can only ever create plain members (never admins/owners).
drop policy if exists "Users can request to join" on public.community_members;
create policy "Users can request to join"
  on public.community_members for insert
  with check (user_id = auth.uid() and role = 'member');
