-- Push tokens move out of profiles (readable by every shared-community
-- member) into an owner-only table, like phone numbers. The fanout function
-- reads this table with the service key; clients can only touch their own row.
create table if not exists public.push_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can view own push token" on public.push_tokens;
create policy "Users can view own push token"
  on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists "Users can save own push token" on public.push_tokens;
create policy "Users can save own push token"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own push token" on public.push_tokens;
create policy "Users can update own push token"
  on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Adopt existing tokens, then remove the readable column.
insert into public.push_tokens (user_id, token)
select id, push_token from public.profiles where push_token is not null
on conflict (user_id) do update set
  token = excluded.token, updated_at = now();

alter table public.profiles drop column if exists push_token;
