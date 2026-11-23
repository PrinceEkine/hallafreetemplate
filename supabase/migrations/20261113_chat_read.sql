-- Chat read-state fixes: track the last sender, auto-mark the sender as read,
-- and stream read states live. Safe to re-run.
--
-- Root causes fixed:
-- 1. The chat list flagged a conversation unread whenever last_message_at was
--    newer than my last_read_at, even when *I* sent that last message.
-- 2. Sending never advanced my own last_read_at, so my own sends instantly
--    showed an unread badge.
-- 3. conversation_participants was not in the realtime publication, so "Seen"
--    receipts never updated live.

alter table public.conversations
  add column if not exists last_message_sender_id uuid
  references public.profiles (id) on delete set null;

create index if not exists conversations_last_sender_idx
  on public.conversations (last_message_sender_id);

-- Keep the envelope redaction from 2026110804_group_e2ee.sql and extend the
-- trigger to record the sender and mark the sender as read atomically (no
-- client clock-skew race between the insert and a follow-up markRead).
create or replace function public.update_conversation_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_preview = case
        when new.body like '{"v":1,%' then '[Encrypted message]'
        else left(new.body, 120)
      end,
      last_message_at = new.created_at,
      last_message_sender_id = new.sender_id
  where id = new.conversation_id;
  update public.conversation_participants
  set last_read_at = greatest(last_read_at, new.created_at)
  where conversation_id = new.conversation_id
    and user_id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.update_conversation_preview();

-- Backfill the new column from current history.
update public.conversations c
set last_message_sender_id = (
  select m.sender_id
  from public.messages m
  where m.conversation_id = c.id
  order by m.created_at desc
  limit 1
)
where c.last_message_sender_id is null
  and c.last_message_at is not null;

-- Clear stale self-unread badges left behind by the old trigger.
update public.conversation_participants cp
set last_read_at = c.last_message_at
from public.conversations c
where cp.conversation_id = c.id
  and c.last_message_sender_id = cp.user_id
  and c.last_message_at is not null
  and cp.last_read_at < c.last_message_at;

-- Stream read-state updates so "Seen" receipts update live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_participants'
  ) then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end
$$;
