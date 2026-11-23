-- Member profile upgrades: persistent call history plus an admin roster
-- bypass so community admins can see group counts on member profiles.
-- Run: supabase db push

-- Call history: one row per call session, stamped at start/end.
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  meeting_id uuid references public.community_meetings (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete cascade,
  media text not null default 'voice' check (media in ('voice', 'video')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint call_logs_scope_chk check (
    (conversation_id is null) <> (meeting_id is null)
  )
);

alter table public.call_logs enable row level security;

drop policy if exists "Starters can log calls" on public.call_logs;
create policy "Starters can log calls"
  on public.call_logs for insert
  with check (started_by = auth.uid());

drop policy if exists "Starters and participants can end logs" on public.call_logs;
create policy "Starters and participants can end logs"
  on public.call_logs for update
  using (
    started_by = auth.uid()
    or (
      conversation_id is not null
      and public.is_conversation_member(conversation_id)
    )
  )
  with check (
    started_by = auth.uid()
    or (
      conversation_id is not null
      and public.is_conversation_member(conversation_id)
    )
  );

drop policy if exists "Starters, participants and admins can read logs" on public.call_logs;
create policy "Starters, participants and admins can read logs"
  on public.call_logs for select
  using (
    started_by = auth.uid()
    or (
      conversation_id is not null
      and public.is_conversation_member(conversation_id)
    )
    or (
      conversation_id is not null
      and exists (
        select 1 from public.conversations c
        where c.id = call_logs.conversation_id
          and c.community_id is not null
          and public.is_community_admin(c.community_id)
      )
    )
    or (
      meeting_id is not null
      and exists (
        select 1 from public.community_meetings m
        where m.id = call_logs.meeting_id
          and public.is_community_admin(m.community_id)
      )
    )
  );

create index if not exists call_logs_starter_idx
  on public.call_logs (started_by, started_at desc);
create index if not exists call_logs_conversation_idx
  on public.call_logs (conversation_id, started_at desc);

-- Admins can view group rosters in their own communities (group counts
-- and member management on profiles), not anywhere else.
drop policy if exists "Community admins can view rosters" on public.conversation_participants;
create policy "Community admins can view rosters"
  on public.conversation_participants for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.community_id is not null
        and public.is_community_admin(c.community_id)
    )
  );
