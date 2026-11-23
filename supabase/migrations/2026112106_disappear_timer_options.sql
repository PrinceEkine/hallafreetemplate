-- Disappearing-message timer options: 1 hour, 24 hours, 7 days, 30 days.
-- 90 days stays accepted so older clients and existing rows keep working.
-- Safe to re-run. Requires 2026111801_chat_safety.sql.
create or replace function public.set_disappear_seconds(
  p_conversation uuid,
  p_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_conversation_member(p_conversation) then
    raise exception 'You are not in this chat.';
  end if;
  if p_seconds is not null
    and p_seconds not in (3600, 86400, 604800, 2592000, 7776000)
  then
    raise exception 'Invalid timer.';
  end if;
  update public.conversations
  set disappear_seconds = p_seconds
  where id = p_conversation;
end;
$$;

grant execute on function public.set_disappear_seconds(uuid, integer) to authenticated;
