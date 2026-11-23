-- Ophixe wallet schema: balances, dues, withdrawals.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql. Safe to re-run. Amounts are in kobo.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Wallets (one per user) ───────────────────────────────────────────────
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  balance_kobo bigint not null default 0 check (balance_kobo >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

drop policy if exists "Users can view own wallet" on public.wallets;
create policy "Users can view own wallet"
  on public.wallets for select
  using (user_id = auth.uid());

drop trigger if exists on_wallet_updated on public.wallets;
create trigger on_wallet_updated
  before update on public.wallets
  for each row execute function public.touch_updated_at();

-- ── Wallet transactions (completed movements only) ───────────────────────
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  kind text not null check (kind in ('credit', 'debit')),
  amount_kobo bigint not null check (amount_kobo > 0),
  reference text not null unique,
  description text not null default '',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

drop policy if exists "Users can view own transactions" on public.wallet_transactions;
create policy "Users can view own transactions"
  on public.wallet_transactions for select
  using (
    exists (
      select 1 from public.wallets
      where id = wallet_id and user_id = auth.uid()
    )
  );

-- ── Community dues ───────────────────────────────────────────────────────
create table if not exists public.community_dues (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.community_dues enable row level security;

drop policy if exists "Members can view dues" on public.community_dues;
create policy "Members can view dues"
  on public.community_dues for select
  using (public.is_community_member(community_id));

drop policy if exists "Admins can create dues" on public.community_dues;
create policy "Admins can create dues"
  on public.community_dues for insert
  with check (public.is_community_admin(community_id));

create table if not exists public.due_payments (
  id uuid primary key default gen_random_uuid(),
  due_id uuid not null references public.community_dues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  created_at timestamptz not null default now(),
  unique (due_id, user_id)
);

alter table public.due_payments enable row level security;

drop policy if exists "Payers and admins can view due payments" on public.due_payments;
create policy "Payers and admins can view due payments"
  on public.due_payments for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.community_dues d
      where d.id = due_id and public.is_community_admin(d.community_id)
    )
  );

-- ── Withdrawal requests ──────────────────────────────────────────────────
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  account_number text not null,
  bank text not null,
  account_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.withdrawal_requests enable row level security;

drop policy if exists "Owners and shared admins can view withdrawals" on public.withdrawal_requests;
create policy "Owners and shared admins can view withdrawals"
  on public.withdrawal_requests for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.community_members m
      join public.community_members me on m.community_id = me.community_id
      where m.user_id = withdrawal_requests.user_id
        and me.user_id = auth.uid()
        and me.status = 'active'
        and me.role in ('owner', 'admin')
        and m.status = 'active'
    )
  );

-- ── Get-or-create my wallet ──────────────────────────────────────────────
create or replace function public.my_wallet()
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_wallet from public.wallets where user_id = auth.uid();
  if v_wallet.id is null then
    insert into public.wallets (user_id) values (auth.uid())
    returning * into v_wallet;
  end if;
  return v_wallet;
end;
$$;

grant execute on function public.my_wallet() to authenticated;

-- ── Credit a wallet (Paystack webhook only — never callable by users) ────
create or replace function public.credit_wallet(
  p_wallet_id uuid, p_amount bigint, p_reference text, p_meta jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.wallet_transactions
    (wallet_id, kind, amount_kobo, reference, description, meta)
  values (p_wallet_id, 'credit', p_amount, p_reference, 'Wallet funding', p_meta)
  on conflict (reference) do nothing
  returning id into v_id;
  if v_id is not null then
    update public.wallets
    set balance_kobo = balance_kobo + p_amount, updated_at = now()
    where id = p_wallet_id;
  end if;
end;
$$;

revoke all on function public.credit_wallet(uuid, bigint, text, jsonb)
  from public, anon, authenticated;

-- ── Pay a due from wallet balance ────────────────────────────────────────
create or replace function public.pay_due(p_due_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due public.community_dues;
  v_wallet_id uuid;
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_due from public.community_dues where id = p_due_id;
  if v_due.id is null then
    raise exception 'Due not found.';
  end if;
  if not public.is_community_member(v_due.community_id) then
    raise exception 'Join the community first.';
  end if;
  if exists (
    select 1 from public.due_payments
    where due_id = p_due_id and user_id = auth.uid()
  ) then
    raise exception 'Already paid.';
  end if;
  select id into v_wallet_id from public.wallets where user_id = auth.uid();
  if v_wallet_id is null then
    raise exception 'Insufficient balance.';
  end if;
  update public.wallets
  set balance_kobo = balance_kobo - v_due.amount_kobo, updated_at = now()
  where id = v_wallet_id and balance_kobo >= v_due.amount_kobo;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Insufficient balance.';
  end if;
  insert into public.due_payments (due_id, user_id, amount_kobo)
  values (p_due_id, auth.uid(), v_due.amount_kobo);
  insert into public.wallet_transactions
    (wallet_id, kind, amount_kobo, reference, description)
  values (
    v_wallet_id, 'debit', v_due.amount_kobo,
    'due_' || p_due_id::text || '_' || auth.uid()::text,
    v_due.title
  );
end;
$$;

grant execute on function public.pay_due(uuid) to authenticated;

-- ── Request a withdrawal ─────────────────────────────────────────────────
create or replace function public.request_withdrawal(
  p_amount bigint, p_account_number text, p_bank text, p_account_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_balance bigint;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_amount < 50000 then
    raise exception 'Minimum withdrawal is ₦500.';
  end if;
  select id, balance_kobo into v_wallet_id, v_balance
  from public.wallets where user_id = auth.uid();
  if v_wallet_id is null or v_balance < p_amount then
    raise exception 'Insufficient balance.';
  end if;
  insert into public.withdrawal_requests
    (wallet_id, user_id, amount_kobo, account_number, bank, account_name)
  values (v_wallet_id, auth.uid(), p_amount, p_account_number, p_bank, p_account_name)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.request_withdrawal(bigint, text, text, text)
  to authenticated;

-- ── Review a withdrawal (shared-community admins) ────────────────────────
create or replace function public.review_withdrawal(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.withdrawal_requests;
  v_is_admin boolean;
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_status not in ('paid', 'rejected') then
    raise exception 'Invalid status.';
  end if;
  select * into v_req from public.withdrawal_requests where id = p_id;
  if v_req.id is null then
    raise exception 'Request not found.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Already reviewed.';
  end if;
  select exists (
    select 1
    from public.community_members m
    join public.community_members me on m.community_id = me.community_id
    where m.user_id = v_req.user_id
      and me.user_id = auth.uid()
      and me.status = 'active'
      and me.role in ('owner', 'admin')
      and m.status = 'active'
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'Only an admin can review this.';
  end if;
  if p_status = 'paid' then
    update public.wallets
    set balance_kobo = balance_kobo - v_req.amount_kobo, updated_at = now()
    where id = v_req.wallet_id and balance_kobo >= v_req.amount_kobo;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'Insufficient balance.';
    end if;
    insert into public.wallet_transactions
      (wallet_id, kind, amount_kobo, reference, description)
    values (
      v_req.wallet_id, 'debit', v_req.amount_kobo,
      'wd_' || p_id::text,
      'Withdrawal to ' || v_req.bank || ' ' || v_req.account_number
    );
  end if;
  update public.withdrawal_requests set status = p_status where id = p_id;
end;
$$;

grant execute on function public.review_withdrawal(uuid, text) to authenticated;
