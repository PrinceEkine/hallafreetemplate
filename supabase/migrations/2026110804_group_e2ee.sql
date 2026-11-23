-- Ophixe group E2EE (pairwise fan-out).
-- Each new group message stores the sender's own envelope in messages.body
-- and one sealed envelope per member in message_envelopes. Members open
-- only their own envelope with the sender's public key, so the server never
-- sees new group plaintext. Pre-existing plaintext group history stays
-- readable as-is.
--
-- Design notes:
-- - Writes go through send_group_message (one atomic message+envelopes
--   insert) so realtime subscribers never see a message without envelopes.
--   There is intentionally NO direct-insert policy on message_envelopes.
-- - Reads are recipient-scoped: members keep their history after leaving,
--   and late joiners see placeholders for messages sent before they
--   joined (no envelope exists for them).
-- - Chat-list previews redact envelope bodies instead of showing JSON.
-- Safe to re-run.

create table if not exists public.message_envelopes (
  message_id uuid not null references public.messages (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  envelope text not null check (char_length(envelope) between 1 and 8000),
  created_at timestamptz not null default now(),
  primary key (message_id, recipient_id)
);

alter table public.message_envelopes enable row level security;

create index if not exists message_envelopes_recipient_idx
  on public.message_envelopes (recipient_id, message_id);

drop policy if exists "Recipients read their own envelopes"
  on public.message_envelopes;
create policy "Recipients read their own envelopes"
  on public.message_envelopes for select
  using (recipient_id = auth.uid());

-- Encrypted envelopes inflate ~4/3 plus JSON framing, so bodies must fit
-- the composer's max message after sealing (this also fixes long DMs).
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (char_length(body) between 1 and 8000);

-- Never preview envelope JSON in chat lists (groups and DMs alike).
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
    last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.update_conversation_preview();

create or replace function public.send_group_message(
  p_conversation uuid,
  p_body text,
  p_reply_to uuid default null,
  p_envelopes jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group boolean;
  v_id uuid;
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select is_group into v_group
  from public.conversations
  where id = p_conversation;
  if v_group is null then
    raise exception 'Chat not found.';
  end if;
  if not v_group then
    raise exception 'Secure group messaging is only for group chats.';
  end if;
  if not public.is_conversation_member(p_conversation) then
    raise exception 'You are not a member of this chat.';
  end if;
  insert into public.messages (conversation_id, sender_id, body, reply_to)
  values (p_conversation, auth.uid(), p_body, p_reply_to)
  returning id into v_id;
  for v_row in select * from jsonb_array_elements(p_envelopes) loop
    insert into public.message_envelopes (message_id, recipient_id, envelope)
    select v_id, (v_row->>'recipient_id')::uuid, v_row->>'envelope'
    where exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation
        and user_id = (v_row->>'recipient_id')::uuid
    )
    on conflict (message_id, recipient_id) do nothing;
  end loop;
  return v_id;
end;
$$;

grant execute on function public.send_group_message(uuid, text, uuid, jsonb)
  to authenticated;
