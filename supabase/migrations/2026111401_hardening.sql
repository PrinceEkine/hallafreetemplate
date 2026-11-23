-- Ophixe hardening (2026-11-14 audit): join-policy pin, hot-path indexes,
-- pending Paystack top-ups, withdrawal self-review guard.
-- Safe to re-run. Requires 0001_init.sql and 0006_wallet.sql.

-- ── 1. Join policy: users may only ever insert themselves as a pending
-- member, or as active when the community is open to anyone. ──────────────
drop policy if exists "Users can request to join" on public.community_members;
create policy "Users can request to join"
  on public.community_members for insert
  with check (
    user_id = auth.uid()
    and role = 'member'
    and (
      status = 'pending'
      or (
        status = 'active'
        and exists (
          select 1 from public.communities
          where id = community_id and who_can_join = 'anyone'
        )
      )
    )
  );

-- ── 2. Hot-path indexes (membership checks run per row under RLS) ─────────
CREATE INDEX if not exists community_members_user_status_idx
  on public.community_members (user_id, status, community_id);
CREATE INDEX if not exists community_members_community_idx
  on public.community_members (community_id);
CREATE INDEX if not exists announcements_community_idx
  on public.announcements (community_id);

-- ── 3. Pending Paystack top-ups (reconcile paid-but-uncredited funding) ───
create table if not exists public.wallet_topups (
  reference text primary key,
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending'
    check (status in ('pending', 'credited', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.wallet_topups enable row level security;

drop policy if exists "Users can view own top-ups" on public.wallet_topups;
create policy "Users can view own top-ups"
  on public.wallet_topups for select
  using (user_id = auth.uid());

-- ── 4. Withdrawals: reviewers cannot approve their own request ────────────
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
  if v_req.user_id = auth.uid() then
    raise exception 'You cannot review your own withdrawal.';
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
