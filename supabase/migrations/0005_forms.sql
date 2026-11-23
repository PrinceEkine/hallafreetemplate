-- Ophixe forms schema: staff requests + admin approvals + evidence access.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql and 0002_content.sql. Safe to re-run.

-- ── Form submissions ─────────────────────────────────────────────────────
create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'data_correction', 'exit_request', 'payment_issue',
    'query_response', 'relocation'
  )),
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.form_submissions enable row level security;

create index if not exists form_submissions_community_status_idx
  on public.form_submissions (community_id, status);

drop policy if exists "Members can submit forms" on public.form_submissions;
create policy "Members can submit forms"
  on public.form_submissions for insert
  with check (
    submitted_by = auth.uid()
    and public.is_community_member(community_id)
  );

drop policy if exists "Submitters and admins can read forms" on public.form_submissions;
create policy "Submitters and admins can read forms"
  on public.form_submissions for select
  using (
    submitted_by = auth.uid()
    or public.is_community_admin(community_id)
  );

drop policy if exists "Admins can review forms" on public.form_submissions;
create policy "Admins can review forms"
  on public.form_submissions for update
  using (public.is_community_admin(community_id))
  with check (public.is_community_admin(community_id));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_form_submission_updated on public.form_submissions;
create trigger on_form_submission_updated
  before update on public.form_submissions
  for each row execute function public.touch_updated_at();

-- ── Evidence paths are community-first: evidence/{community}/{user}/{file} ──
drop policy if exists "Users can upload own evidence" on storage.objects;
create policy "Users can upload own evidence"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists "Users can view own evidence" on storage.objects;
create policy "Users can view own evidence"
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists "Admins can view community evidence" on storage.objects;
create policy "Admins can view community evidence"
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and public.is_community_admin(((storage.foldername(name))[1])::uuid)
  );
