-- Ophixe saved posts: per-user save list for the home Saved filter.
-- Safe to re-run.

create table if not exists public.post_saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.post_saves enable row level security;

drop policy if exists "Users read own saves" on public.post_saves;
create policy "Users read own saves"
  on public.post_saves for select
  using (user_id = auth.uid());

drop policy if exists "Users can save posts" on public.post_saves;
create policy "Users can save posts"
  on public.post_saves for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can unsave posts" on public.post_saves;
create policy "Users can unsave posts"
  on public.post_saves for delete
  using (user_id = auth.uid());
