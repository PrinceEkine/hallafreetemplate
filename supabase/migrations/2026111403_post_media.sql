-- Ophixe multi-image posts: extra pictures per post in post order.
-- The first picture stays on posts.image_url for older clients.
-- Safe to re-run. Requires 0002_content.sql.
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.post_media enable row level security;

create index if not exists post_media_post_position_idx
  on public.post_media (post_id, position);

drop policy if exists "Members can view post media" on public.post_media;
create policy "Members can view post media"
  on public.post_media for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Authors can add post media" on public.post_media;
create policy "Authors can add post media"
  on public.post_media for insert
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "Authors and admins can delete post media"
  on public.post_media;
create policy "Authors and admins can delete post media"
  on public.post_media for delete
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (
          p.author_id = auth.uid()
          or public.is_community_admin(p.community_id)
        )
    )
  );
