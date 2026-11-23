-- Ophixe community polls: persistent polls that live in the side nav,
-- never scroll away like chat polls. Admins create and close; every active
-- member gets one vote per poll; results stay visible forever.
-- Safe to re-run. Requires 0001_init.sql and 2026110802_push_triggers.sql.
create table if not exists public.community_polls (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  question text not null,
  created_by uuid not null references public.profiles (id),
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  label text not null,
  position int not null default 0
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists poll_options_poll_idx
  on public.poll_options (poll_id);
create index if not exists poll_votes_poll_idx
  on public.poll_votes (poll_id);
create index if not exists community_polls_community_idx
  on public.community_polls (community_id);

alter table public.community_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "Members can view polls" on public.community_polls;
create policy "Members can view polls"
  on public.community_polls for select
  using (public.is_community_member(community_id));

drop policy if exists "Admins can create polls" on public.community_polls;
create policy "Admins can create polls"
  on public.community_polls for insert
  with check (
    public.is_community_admin(community_id) and created_by = auth.uid()
  );

drop policy if exists "Admins can close polls" on public.community_polls;
create policy "Admins can close polls"
  on public.community_polls for update
  using (public.is_community_admin(community_id));

drop policy if exists "Members can view poll options"
  on public.poll_options;
create policy "Members can view poll options"
  on public.poll_options for select
  using (
    exists (
      select 1 from public.community_polls p
      where p.id = poll_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Admins can add poll options" on public.poll_options;
create policy "Admins can add poll options"
  on public.poll_options for insert
  with check (
    exists (
      select 1 from public.community_polls p
      where p.id = poll_id and public.is_community_admin(p.community_id)
    )
  );

drop policy if exists "Members can view poll votes" on public.poll_votes;
create policy "Members can view poll votes"
  on public.poll_votes for select
  using (
    exists (
      select 1 from public.community_polls p
      where p.id = poll_id and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Members can cast one vote" on public.poll_votes;
create policy "Members can cast one vote"
  on public.poll_votes for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.community_polls p
      where p.id = poll_id
        and p.closed = false
        and public.is_community_member(p.community_id)
    )
  );

drop policy if exists "Members can change their vote" on public.poll_votes;
create policy "Members can change their vote"
  on public.poll_votes for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.community_polls p
      where p.id = poll_id
        and p.closed = false
        and public.is_community_member(p.community_id)
    )
  );

create or replace function public.trg_poll_fanout()
returns trigger language plpgsql as $$
begin
  perform post_fanout(jsonb_build_object(
    'event', 'poll',
    'poll_id', new.id
  ));
  return new;
end $$;

drop trigger if exists trg_poll_fanout on public.community_polls;
create trigger trg_poll_fanout after insert on public.community_polls
  for each row execute function public.trg_poll_fanout();
