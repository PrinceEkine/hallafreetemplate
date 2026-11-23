-- Ophixe social: post comments + group chat creation.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql, 0002_content.sql and 0004_chat.sql. Safe to re-run.

-- ── Post comments ────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.post_comments enable row level security;

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);

drop policy if exists "Members can read comments" on public.post_comments;
create policy "Members can read comments"
  on public.post_comments for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Members can comment" on public.post_comments;
create policy "Members can comment"
  on public.post_comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Authors and admins can delete comments" on public.post_comments;
create policy "Authors and admins can delete comments"
  on public.post_comments for delete
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_community_admin(p.community_id)
    )
  );

create or replace function public.bump_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts
    set comments_count = comments_count + 1
    where id = new.post_id;
    return new;
  else
    update public.posts
    set comments_count = greatest(0, comments_count - 1)
    where id = old.post_id;
    return old;
  end if;
end;
$$;

drop trigger if exists on_comment_changed on public.post_comments;
create trigger on_comment_changed
  after insert or delete on public.post_comments
  for each row execute function public.bump_comments_count();

-- ── Group chat creation ──────────────────────────────────────────────────
create or replace function public.create_group(
  p_community uuid, p_title text, p_members uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text;
  v_member uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  v_title := trim(p_title);
  if char_length(v_title) < 1 or char_length(v_title) > 60 then
    raise exception 'Give the group a name (1-60 characters).';
  end if;
  if p_members is null or array_length(p_members, 1) is null then
    raise exception 'Add at least one person.';
  end if;
  if not exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Join the community first.';
  end if;
  select count(*) into v_count
  from public.community_members
  where community_id = p_community
    and status = 'active'
    and user_id = any (p_members);
  if v_count <> array_length(p_members, 1) then
    raise exception 'Everyone added must belong to the community.';
  end if;
  insert into public.conversations (community_id, is_group, title)
  values (p_community, true, v_title)
  returning id into v_id;
  insert into public.conversation_participants (conversation_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;
  foreach v_member slice 0 in array p_members loop
    if v_member <> auth.uid() then
      insert into public.conversation_participants (conversation_id, user_id)
      values (v_id, v_member)
      on conflict do nothing;
    end if;
  end loop;
  return v_id;
end;
$$;

grant execute on function public.create_group(uuid, text, uuid[]) to authenticated;
