-- Admin-only community group deletion (Teams long-press > Delete).
-- Cascades remove participants, messages, envelopes, and reactions;
-- meeting rooms pointing at the group keep their row with conversation_id
-- nulled (on delete set null). Voice note files in storage are left in
-- place; they are unreadable without a member's envelope.
-- Safe to re-run.

create or replace function public.delete_group_chat(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community uuid;
  v_group boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select community_id, is_group into v_community, v_group
  from public.conversations where id = p_conversation;
  if v_group is null then
    raise exception 'Chat not found.';
  end if;
  if not v_group then
    raise exception 'Only group chats can be deleted.';
  end if;
  if v_community is null then
    raise exception 'Only community groups can be deleted.';
  end if;
  if not public.is_community_admin(v_community) then
    raise exception 'Only admins can delete this group.';
  end if;
  delete from public.conversations where id = p_conversation;
end;
$$;

grant execute on function public.delete_group_chat(uuid) to authenticated;
