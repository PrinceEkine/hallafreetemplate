-- Ophixe push support: store each user's Expo push token.
-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Requires 0001_init.sql. Safe to re-run.

alter table public.profiles
  add column if not exists push_token text;
