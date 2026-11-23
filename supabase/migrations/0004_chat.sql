-- Ophixe chat schema: conversations, participants, messages + realtime.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql. Safe to re-run.

-- ── Conversations (DMs, optionally scoped to a community) ─────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references public.communities (id) on delete cascade,
  is_group boolean not null default false,
  title text not null default '',
  last_message_preview text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- ── Membership helper ────────────────────────────────────────────────────
create or replace function public.is_conversation_member(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = cid and user_id = auth.uid()
  );
$$;

-- ── Conversation policies ────────────────────────────────────────────────
drop policy if exists "Participants can read conversations" on public.conversations;
create policy "Participants can read conversations"
  on public.conversations for select
  using (public.is_conversation_member(id));

drop policy if exists "Signed-in users can create conversations" on public.conversations;
create policy "Signed-in users can create conversations"
  on public.conversations for insert
  with check (auth.uid() is not null);

-- ── Participant policies ─────────────────────────────────────────────────
drop policy if exists "Participants can view the roster" on public.conversation_participants;
create policy "Participants can view the roster"
  on public.conversation_participants for select
  using (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
  );

drop policy if exists "Users can join, members can add" on public.conversation_participants;
create policy "Users can join, members can add"
  on public.conversation_participants for insert
  with check (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
  );

drop policy if exists "Users can update own read state" on public.conversation_participants;
create policy "Users can update own read state"
  on public.conversation_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can leave conversations" on public.conversation_participants;
create policy "Users can leave conversations"
  on public.conversation_participants for delete
  using (user_id = auth.uid());

-- ── Message policies ─────────────────────────────────────────────────────
drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
  on public.messages for select
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- ── Keep the chat list preview fresh ─────────────────────────────────────
create or replace function public.update_conversation_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_preview = left(new.body, 120),
      last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.update_conversation_preview();

-- ── Create (or reuse) a 1-1 DM ───────────────────────────────────────────
create or replace function public.create_dm(p_other uuid, p_community uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_other = auth.uid() then
    raise exception 'You cannot chat with yourself.';
  end if;

  if p_community is not null then
    if not exists (
      select 1 from public.community_members
      where community_id = p_community and user_id = auth.uid() and status = 'active'
    ) then
      raise exception 'Join the community first.';
    end if;
    if not exists (
      select 1 from public.community_members
      where community_id = p_community and user_id = p_other and status = 'active'
    ) then
      raise exception 'That person is not in this community.';
    end if;
  else
    if not exists (
      select 1
      from public.community_members m1
      join public.community_members m2 on m1.community_id = m2.community_id
      where m1.user_id = auth.uid() and m2.user_id = p_other
        and m1.status = 'active' and m2.status = 'active'
    ) then
      raise exception 'You share no community with this person.';
    end if;
  end if;

  select c.id into v_id
  from public.conversations c
  where c.is_group = false
    and c.community_id is not distinct from p_community
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = c.id and user_id = auth.uid()
    )
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = c.id and user_id = p_other
    )
    and (
      select count(*) from public.conversation_participants
      where conversation_id = c.id
    ) = 2
  limit 1;

  if v_id is null then
    insert into public.conversations (community_id, is_group, title)
    values (p_community, false, '')
    returning id into v_id;
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_id, auth.uid()), (v_id, p_other);
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_dm(uuid, uuid) to authenticated;

-- ── Realtime: stream new messages to clients ─────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
