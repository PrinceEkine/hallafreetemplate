-- Ophixe meeting video rooms + stale-event purge.
-- Safe to re-run. Requires 0012_phase2.sql (community_meetings, events)
-- and 2026111407_call_signals.sql (call_signals, trg_call_fanout).
--
-- 1. meeting_members: the people an admin invites to a room. Invitees get
--    an in-app incoming-call popup (and a push) when the meeting starts.
-- 2. call_signals joins the realtime publication so the popup fires live.
-- 3. Room calls fan out a push like chat calls do (push-fanout 'call').
-- 4. purge_stale_events() deletes events 5+ working days past their date.
--    Runs nightly via pg_cron where available; the app also calls it
--    opportunistically when the events list loads.

-- ── Invited members per room ────────────────────────────────────────────
create table if not exists public.meeting_members (
  meeting_id uuid not null references public.community_meetings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

alter table public.meeting_members enable row level security;

drop policy if exists "Community members can read room invites"
  on public.meeting_members;
create policy "Community members can read room invites"
  on public.meeting_members for select
  using (
    exists (
      select 1 from public.community_meetings m
      where m.id = meeting_id
      and public.is_community_member(m.community_id)
    )
  );

drop policy if exists "Admins can invite to rooms"
  on public.meeting_members;
create policy "Admins can invite to rooms"
  on public.meeting_members for insert
  with check (
    exists (
      select 1 from public.community_meetings m
      where m.id = meeting_id
      and public.is_community_admin(m.community_id)
    )
  );

drop policy if exists "Admins can uninvite from rooms"
  on public.meeting_members;
create policy "Admins can uninvite from rooms"
  on public.meeting_members for delete
  using (
    exists (
      select 1 from public.community_meetings m
      where m.id = meeting_id
      and public.is_community_admin(m.community_id)
    )
  );

create index if not exists meeting_members_user_idx
  on public.meeting_members (user_id);

-- ── Realtime: stream call signals to clients ────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;
end
$$;

-- ── Fan out room calls too ──────────────────────────────────────────────
create or replace function trg_call_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'call',
    'signal_id', new.id
  ));
  return new;
end $$;

drop trigger if exists trg_call_fanout on call_signals;
create trigger trg_call_fanout after insert on call_signals
  for each row execute function trg_call_fanout();

-- ── Stale events: auto-delete 5 working days after the event ────────────
-- A working day is Mon–Fri. Counting starts the day after the event, so an
-- event on Monday is removed once Tue, Wed, Thu, Fri and the next Monday
-- have all passed. Future events always count zero and are never removed.
create or replace function public.purge_stale_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
begin
  with gone as (
    delete from public.events e
    where (
      select count(*)
      from generate_series(
        (e.event_date + 1)::timestamptz,
        current_date::timestamptz,
        interval '1 day'
      ) as d
      where extract(isodow from d) < 6
    ) >= 5
    returning id
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

grant execute on function public.purge_stale_events() to authenticated;

-- Nightly cleanup where pg_cron exists (Supabase hosted). Any failure here
-- (no extension, job already scheduled) is swallowed on purpose: the app
-- triggers the same purge when the events list loads.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-stale-events',
      '0 3 * * *',
      'select public.purge_stale_events()'
    );
  end if;
exception when others then
  null;
end $$;
