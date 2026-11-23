-- Ophixe likes: toggleable post likes with cached counts.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql and 0002_content.sql. Safe to re-run.

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

drop policy if exists "Members can view likes" on public.post_likes;
create policy "Members can view likes"
  on public.post_likes for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Members can like posts" on public.post_likes;
create policy "Members can like posts"
  on public.post_likes for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Users can unlike posts" on public.post_likes;
create policy "Users can unlike posts"
  on public.post_likes for delete
  using (user_id = auth.uid());

create or replace function public.toggle_post_like(p_post_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_liked boolean;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select community_id into v_community_id
  from public.posts where id = p_post_id;
  if v_community_id is null then
    raise exception 'Post not found.';
  end if;
  if not public.is_community_member(v_community_id) then
    raise exception 'Join the community first.';
  end if;
  if exists (
    select 1 from public.post_likes
    where post_id = p_post_id and user_id = auth.uid()
  ) then
    delete from public.post_likes
    where post_id = p_post_id and user_id = auth.uid();
    v_liked := false;
  else
    insert into public.post_likes (post_id, user_id)
    values (p_post_id, auth.uid())
    on conflict do nothing;
    v_liked := true;
  end if;
  update public.posts
  set likes_count = greatest(0, likes_count + case when v_liked then 1 else -1 end)
  where id = p_post_id
  returning likes_count into v_count;
  return json_build_object('liked', v_liked, 'count', v_count);
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;
