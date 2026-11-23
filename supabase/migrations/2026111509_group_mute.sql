-- Ophixe group profile support: members can mute a conversation, and
-- muted members no longer receive its message notifications.
-- Safe to re-run. Requires 0004_chat.sql.
alter table public.conversation_participants
  add column if not exists muted boolean not null default false;
