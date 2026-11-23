-- Call history truth: track whether anyone ever joined. NULL means
-- unknown (rows from before this migration, or calls still live); the
-- app marks the open row answered when the first peer joins, and the
-- client closes unanswered rows as false when the call ends.
-- Run: supabase db push

alter table public.call_logs
  add column if not exists answered boolean;

-- Any participant of the chat (or member of the meeting's community)
-- may mark the open row answered. Best-effort: never raises for
-- strangers, it just marks nothing.
create or replace function public.mark_call_answered(
  p_conversation_id uuid,
  p_meeting_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_log uuid;
begin
  if uid is null then
    return;
  end if;
  if p_conversation_id is not null then
    if not exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id and user_id = uid
    ) then
      return;
    end if;
    select id into v_log
    from public.call_logs
    where conversation_id = p_conversation_id
      and ended_at is null
    order by started_at desc
    limit 1;
  elsif p_meeting_id is not null then
    if not exists (
      select 1
      from public.community_meetings m
      join public.community_members cm on cm.community_id = m.community_id
      where m.id = p_meeting_id
        and cm.user_id = uid
        and cm.status = 'active'
    ) then
      return;
    end if;
    select id into v_log
    from public.call_logs
    where meeting_id = p_meeting_id
      and ended_at is null
    order by started_at desc
    limit 1;
  else
    return;
  end if;
  if v_log is not null then
    update public.call_logs set answered = true where id = v_log;
  end if;
end;
$$;

grant execute on function public.mark_call_answered(uuid, uuid) to authenticated;
