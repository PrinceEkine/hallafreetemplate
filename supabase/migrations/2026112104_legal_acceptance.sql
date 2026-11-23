-- Legal acceptance: each profile records when (and which version of) the
-- Terms of Use + Privacy Policy the user accepted. The existing own-profile
-- update policy already permits these self-writes; no new policy needed.
-- Run: supabase db push

alter table public.profiles
  add column if not exists accepted_terms_at timestamptz;

alter table public.profiles
  add column if not exists accepted_terms_version text;
