-- Ophixe chat upgrades: message edit/delete + encrypted chat media bucket.
-- Safe to re-run. Requires 0004_chat.sql, 2026110804_group_e2ee.sql.
--
-- Edits are sender-only and blocked once anyone else has seen the message
-- (any other participant's last_read_at >= the message's created_at).
-- Deletes are sender-only soft deletes (deleted_at) allowed at any time;
-- clients render a tombstone. The preview trigger also refreshes on edit.

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists messages_conversation_deleted_idx
  on public.messages (conversation_id, created_at desc)
  where deleted_at is null;

-- ── Sender-only edit/delete policies ───────────────────────────────────
drop policy if exists "Senders can edit own unseen messages" on public.messages;
create policy "Senders can edit own unseen messages"
  on public.messages for update
  using (sender_id = auth.uid() and deleted_at is null)
  with check (sender_id = auth.uid());

drop policy if exists "Senders can delete own messages" on public.messages;
create policy "Senders can delete own messages"
  on public.messages for delete
  using (sender_id = auth.uid());

-- ── Block edits once the message has been seen ──────────────────────────
create or replace function public.block_seen_message_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Deletes (soft via deleted_at, or hard) always pass; only body edits
  -- after being seen are rejected.
  if new.deleted_at is distinct from old.deleted_at then
    return new;
  end if;
  if new.body is not distinct from old.body then
    return new;
  end if;
  if exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = old.conversation_id
      and p.user_id <> old.sender_id
      and p.last_read_at >= old.created_at
  ) then
    raise exception 'Message was already seen and can no longer be edited.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_seen_message_edit on public.messages;
create trigger trg_block_seen_message_edit
  before update on public.messages
  for each row execute function public.block_seen_message_edit();

-- ── Keep the preview fresh on edit as well as on insert ─────────────────
drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.update_conversation_preview();

create or replace function public.update_conversation_preview_on_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  select m.id into v_latest
  from public.messages m
  where m.conversation_id = new.conversation_id
    and m.deleted_at is null
  order by m.created_at desc
  limit 1;
  -- Only the newest visible message owns the preview row.
  if v_latest is distinct from new.id then
    return new;
  end if;
  update public.conversations
  set last_message_preview = case
        when new.body like '{"v":1,%' then '[Encrypted message]'
        else left(new.body, 120)
      end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_edited on public.messages;
create trigger on_message_edited
  after update of body on public.messages
  for each row execute function public.update_conversation_preview_on_edit();

-- ── Group edit RPC: re-seal every envelope atomically ───────────────────
-- The sender re-encrypts the new plaintext for each member; the server only
-- swaps ciphertext after verifying sender + unseen.
create or replace function public.edit_group_message(
  p_message uuid,
  p_body text,
  p_envelopes jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convo uuid;
  v_sender uuid;
  v_created timestamptz;
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select conversation_id, sender_id, created_at
    into v_convo, v_sender, v_created
  from public.messages
  where id = p_message and deleted_at is null;
  if v_convo is null then
    raise exception 'Message not found.';
  end if;
  if v_sender <> auth.uid() then
    raise exception 'You can only edit your own messages.';
  end if;
  if exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = v_convo
      and p.user_id <> auth.uid()
      and p.last_read_at >= v_created
  ) then
    raise exception 'Message was already seen and can no longer be edited.';
  end if;
  update public.messages
  set body = p_body, edited_at = now()
  where id = p_message;
  delete from public.message_envelopes where message_id = p_message;
  for v_item in select * from jsonb_array_elements(p_envelopes)
  loop
    insert into public.message_envelopes (message_id, recipient_id, envelope)
    values (
      p_message,
      (v_item->>'recipient_id')::uuid,
      v_item->>'envelope'
    )
    on conflict (message_id, recipient_id) do update
      set envelope = excluded.envelope;
  end loop;
end;
$$;

grant execute on function public.edit_group_message(uuid, text, jsonb) to authenticated;

-- ── Encrypted chat media: sealed pic/video/doc attachments ──────────────
-- Paths look like {conversation_id}/{uuid}.bin (see lib/media.ts).
-- Same guarantee as voice notes: the bucket holds only secretbox ciphertext
-- and the per-file key travels inside the chat's E2EE envelope.
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "Participants can upload chat media" on storage.objects;
create policy "Participants can upload chat media"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Participants can read chat media" on storage.objects;
create policy "Participants can read chat media"
  on storage.objects for select
  using (
    bucket_id = 'chat-media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Participants can delete chat media" on storage.objects;
create policy "Participants can delete chat media"
  on storage.objects for delete
  using (
    bucket_id = 'chat-media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
