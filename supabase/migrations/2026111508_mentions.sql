-- Ophixe @mentions: tagging a member in a post comment or a group chat
-- drops a mention row that fans out to their notifications (in-app + push).
-- Chat bodies stay encrypted; detection runs on the sender's plaintext.
-- Safe to re-run. Requires 0001_init.sql and 2026110802_push_triggers.sql.
create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  mentioned_by uuid not null references public.profiles (id) on delete cascade,
  community_id uuid references public.communities (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.post_comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists mentions_user_idx
  on public.mentions (mentioned_user_id);

alter table public.mentions enable row level security;

drop policy if exists "Members can mention" on public.mentions;
create policy "Members can mention"
  on public.mentions for insert
  with check (mentioned_by = auth.uid());

drop policy if exists "Members can read own mentions" on public.mentions;
create policy "Members can read own mentions"
  on public.mentions for select
  using (
    mentioned_user_id = auth.uid() or mentioned_by = auth.uid()
  );

create or replace function public.trg_mention_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'mention',
    'mention_id', new.id
  ));
  return new;
end $$;

drop trigger if exists trg_mention_fanout on public.mentions;
create trigger trg_mention_fanout after insert on public.mentions
  for each row execute function public.trg_mention_fanout();
