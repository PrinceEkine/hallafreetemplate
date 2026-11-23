-- Online presence: the app heartbeats this column while foregrounded
-- (and once when backgrounding, so it reads as the true last moment).
-- Online = seen within two minutes. No policy change: the profiles
-- read/update rules already scope rows to fellow members and self.
-- Run: supabase db push

alter table public.profiles
  add column if not exists last_seen timestamptz;
