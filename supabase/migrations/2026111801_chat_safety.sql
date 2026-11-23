-- Ophixe chat safety: user blocks, user reports, disappearing messages.
-- Safe to re-run.

-- ── User blocks (enforced on DMs only) ─────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists "Users read own blocks" on public.user_blocks;
create policy "Users read own blocks"
  on public.user_blocks for select
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "Users can block" on public.user_blocks;
create policy "Users can block"
  on public.user_blocks for insert
  with check (blocker_id = auth.uid());

drop policy if exists "Users can unblock" on public.user_blocks;
create policy "Users can unblock"
  on public.user_blocks for delete
  using (blocker_id = auth.uid());

-- True when a 1-1 DM has a block running in either direction. Groups are
-- never affected: blocking is between two people, not communities.
create or replace function public.dm_has_block(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = cid and c.is_group = false
  ) and (
    select count(*) from public.conversation_participants
    where conversation_id = cid
  ) = 2 and exists (
    select 1
    from public.conversation_participants p1
    join public.conversation_participants p2
      on p1.conversation_id = p2.conversation_id
      and p1.user_id <> p2.user_id
    join public.user_blocks b
      on b.blocker_id = p1.user_id and b.blocked_id = p2.user_id
    where p1.conversation_id = cid
  );
$$;

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not public.dm_has_block(conversation_id)
  );

-- ── User reports (same admin queue as post reports) ────────────────────
alter table public.content_reports
  add column if not exists reported_user_id uuid references public.profiles (id) on delete cascade,
  add column if not exists conversation_id uuid references public.conversations (id) on delete cascade;

alter table public.content_reports drop constraint if exists content_reports_one_target;
alter table public.content_reports add constraint content_reports_one_target check (
  (post_id is not null)::int
  + (announcement_id is not null)::int
  + (reported_user_id is not null)::int = 1
);

create index if not exists content_reports_user_idx
  on public.content_reports (reported_user_id);

-- ── Disappearing messages ──────────────────────────────────────────────
-- Timer lives on the conversation (null = off). Any participant may change
-- it through the RPC; an hourly purge hard-deletes expired rows (envelopes
-- and mentions cascade). Clients also hide expired rows instantly.
alter table public.conversations
  add column if not exists disappear_seconds integer
  check (disappear_seconds is null or disappear_seconds > 0);

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
  if p_seconds is not null and p_seconds not in (86400, 604800, 7776000) then
    raise exception 'Invalid timer.';
  end if;
  update public.conversations
  set disappear_seconds = p_seconds
  where id = p_conversation;
end;
$$;

grant execute on function public.set_disappear_seconds(uuid, integer) to authenticated;

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
  using public.conversations c
  where m.conversation_id = c.id
    and c.disappear_seconds is not null
    and m.created_at < now() - make_interval(secs => c.disappear_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Hourly purge. If pg_cron is unavailable the push still succeeds and the
-- client-side hiding carries the feature; schedule from the dashboard then:
--   select cron.schedule('purge-disappearing-messages', '0 * * * *',
--     'select public.purge_expired_messages();');
do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('purge-disappearing-messages');
  exception when others then
    -- Not scheduled yet.
  end;
  perform cron.schedule(
    'purge-disappearing-messages',
    '0 * * * *',
    'select public.purge_expired_messages();'
  );
exception when others then
  raise notice 'pg_cron unavailable, skipping disappearing-message schedule: %', sqlerrm;
end $$;
