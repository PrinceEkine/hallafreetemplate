-- Per-message disappearing expiry: only messages sent while the timer is
-- on expire. Previously the purge applied the *current* conversation timer
-- to the whole history, wiping old messages the moment a timer was enabled.
-- Existing rows keep expires_at NULL (never expire): history is preserved.
-- Safe to re-run. Requires 2026111801_chat_safety.sql.
alter table public.messages
  add column if not exists expires_at timestamptz;

create or replace function public.set_message_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seconds integer;
begin
  select c.disappear_seconds into v_seconds
  from public.conversations c
  where c.id = new.conversation_id;
  if v_seconds is not null and v_seconds > 0 then
    new.expires_at := now() + make_interval(secs => v_seconds);
  else
    new.expires_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_message_expiry on public.messages;
create trigger trg_set_message_expiry
  before insert on public.messages
  for each row execute function public.set_message_expiry();

create index if not exists messages_expires_at_idx
  on public.messages (expires_at)
  where expires_at is not null;

create or replace function public.purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.messages m
  where m.expires_at is not null
    and m.expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
