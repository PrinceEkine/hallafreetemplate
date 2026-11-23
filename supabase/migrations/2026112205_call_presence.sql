-- Live call presence: per-member mute/share flags per call, so tiles
-- show who is muted and only one person shares a screen at a time.
-- Rows are ephemeral: clients delete their own on leave, and call
-- start/end sweeps the whole call (crashed clients included).
-- Run: supabase db push

create table if not exists public.call_presence (
  scope text not null check (scope in ('chat', 'room')),
  ref_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  agora_uid bigint not null,
  muted boolean not null default false,
  sharing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (scope, ref_id, user_id)
);

alter table public.call_presence enable row level security;

-- Exactly one screen-sharer per call: a second sharer fails to write.
create unique index if not exists call_presence_single_sharer
  on public.call_presence (scope, ref_id)
  where sharing;

drop policy if exists "Call participants read presence" on public.call_presence;
create policy "Call participants read presence"
  on public.call_presence for select to authenticated
  using (
    (scope = 'chat' and public.is_conversation_member(ref_id))
    or (
      scope = 'room'
      and exists (
        select 1 from public.community_meetings m
        where m.id = call_presence.ref_id
          and public.is_community_member(m.community_id)
      )
    )
  );

drop policy if exists "Participants write own presence" on public.call_presence;
create policy "Participants write own presence"
  on public.call_presence for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (scope = 'chat' and public.is_conversation_member(ref_id))
      or (
        scope = 'room'
        and exists (
          select 1 from public.community_meetings m
          where m.id = call_presence.ref_id
            and public.is_community_member(m.community_id)
        )
      )
    )
  );

drop policy if exists "Participants update own presence" on public.call_presence;
create policy "Participants update own presence"
  on public.call_presence for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Participants delete own presence" on public.call_presence;
create policy "Participants delete own presence"
  on public.call_presence for delete to authenticated
  using (user_id = auth.uid());

-- Sweep a whole call's flags (call start/end). Any participant may run
-- it; membership is checked inside.
create or replace function public.clear_call_presence(
  p_scope text,
  p_ref uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_scope = 'chat' and not public.is_conversation_member(p_ref) then
    return;
  end if;
  if p_scope = 'room' and not exists (
    select 1 from public.community_meetings m
    where m.id = p_ref and public.is_community_member(m.community_id)
  ) then
    return;
  end if;
  delete from public.call_presence
  where scope = p_scope and ref_id = p_ref;
end;
$$;

grant execute on function public.clear_call_presence(text, uuid) to authenticated;
