-- Ophixe dues without Paystack: per-community bank account plus member
-- transfer claims confirmed by admins.
-- Safe to re-run. Requires 0001_init.sql, 0006_wallet.sql, 2026111401_hardening.sql.

-- ── 1. Bank account per community (set by community admins) ──────────────
alter table public.communities
  add column if not exists bank_name text not null default '';
alter table public.communities
  add column if not exists account_number text not null default '';
alter table public.communities
  add column if not exists account_name text not null default '';

create or replace function public.set_community_bank(
  p_community uuid, p_bank text, p_number text, p_name text
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
  if not public.is_community_admin(p_community) then
    raise exception 'Only an admin can set the account.';
  end if;
  if char_length(trim(p_number)) < 4 then
    raise exception 'Enter a valid account number.';
  end if;
  update public.communities
  set bank_name = trim(p_bank),
      account_number = trim(p_number),
      account_name = trim(p_name)
  where id = p_community;
end;
$$;

grant execute on function public.set_community_bank(uuid, text, text, text)
  to authenticated;

-- ── 2. Transfer claims (member paid by transfer, admin confirms) ─────────
create table if not exists public.transfer_claims (
  id uuid primary key default gen_random_uuid(),
  due_id uuid not null references public.community_dues (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz
);

alter table public.transfer_claims enable row level security;

-- One pending claim per member per due; rejected claims can be re-filed.
create unique index if not exists transfer_claims_pending_once
  on public.transfer_claims (due_id, user_id)
  where status = 'pending';

create index if not exists transfer_claims_community_status_idx
  on public.transfer_claims (community_id, status);

drop policy if exists "Owners and admins can view claims"
  on public.transfer_claims;
create policy "Owners and admins can view claims"
  on public.transfer_claims for select
  using (
    user_id = auth.uid()
    or public.is_community_admin(community_id)
  );

-- Claims move only through these RPCs (no direct insert/update policies).
create or replace function public.claim_due_paid(p_due_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due public.community_dues;
  v_id uuid;
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
  if exists (
    select 1 from public.transfer_claims
    where due_id = p_due_id and user_id = auth.uid() and status = 'pending'
  ) then
    raise exception 'You already claimed this due. Wait for confirmation.';
  end if;
  insert into public.transfer_claims (due_id, community_id, user_id)
  values (p_due_id, v_due.community_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.claim_due_paid(uuid) to authenticated;

create or replace function public.review_transfer_claim(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.transfer_claims;
  v_due public.community_dues;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'Invalid status.';
  end if;
  select * into v_claim from public.transfer_claims where id = p_id;
  if v_claim.id is null then
    raise exception 'Claim not found.';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'Already reviewed.';
  end if;
  if not public.is_community_admin(v_claim.community_id) then
    raise exception 'Only an admin can review this.';
  end if;
  if v_claim.user_id = auth.uid() then
    raise exception 'You cannot review your own claim.';
  end if;
  if p_status = 'confirmed' then
    select * into v_due
    from public.community_dues where id = v_claim.due_id;
    insert into public.due_payments (due_id, user_id, amount_kobo)
    values (v_claim.due_id, v_claim.user_id, v_due.amount_kobo)
    on conflict (due_id, user_id) do nothing;
  end if;
  update public.transfer_claims
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;
end;
$$;

grant execute on function public.review_transfer_claim(uuid, text)
  to authenticated;

-- ── 3. Retire the Paystack reconcile table (funding is transfer-only) ─────
drop table if exists public.wallet_topups;
