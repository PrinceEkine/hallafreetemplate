-- Ophixe call signaling: one row per live call. Chat calls fan out an
-- incoming-call push; room calls stay in-app (rooms list reads this table).
-- Clients insert on join and delete on leave; a crashed starter's row is
-- replaced by the next starter (delete-then-insert in lib/agora.ts).
-- Safe to re-run. Requires 0001_init.sql and 0004_chat.sql.
create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('chat', 'room')),
  ref_id uuid not null,
  community_id uuid references public.communities (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete cascade,
  media text not null default 'voice' check (media in ('voice', 'video')),
  started_at timestamptz not null default now()
);

alter table public.call_signals enable row level security;

create unique index if not exists call_signals_scope_ref_idx
  on public.call_signals (scope, ref_id);

drop policy if exists "Participants and members can view calls"
  on public.call_signals;
create policy "Participants and members can view calls"
  on public.call_signals for select
  using (
    (scope = 'chat' and public.is_conversation_member(ref_id))
    or (
      scope = 'room' and community_id is not null
      and public.is_community_member(community_id)
    )
  );

drop policy if exists "Participants and members can start calls"
  on public.call_signals;
create policy "Participants and members can start calls"
  on public.call_signals for insert
  with check (
    started_by = auth.uid()
    and (
      (scope = 'chat' and public.is_conversation_member(ref_id))
      or (
        scope = 'room' and community_id is not null
        and public.is_community_member(community_id)
      )
    )
  );

drop policy if exists "Participants and members can end calls"
  on public.call_signals;
create policy "Participants and members can end calls"
  on public.call_signals for delete
  using (
    (scope = 'chat' and public.is_conversation_member(ref_id))
    or (
      scope = 'room' and community_id is not null
      and public.is_community_member(community_id)
    )
  );

create or replace function trg_call_fanout()
returns trigger language plpgsql as $$
begin
  if new.scope = 'chat' then
    perform post_fanout(jsonb_build_object(
      'event', 'call',
      'signal_id', new.id
    ));
  end if;
  return new;
end $$;

drop trigger if exists trg_call_fanout on call_signals;
create trigger trg_call_fanout after insert on call_signals
  for each row execute function trg_call_fanout();
