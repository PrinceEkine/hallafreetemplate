-- Fan-out config in a table (no superuser privileges needed to manage).
-- ALTER DATABASE ... SET is blocked for this project's roles (42501) both
-- via the CLI and the dashboard SQL Editor, so the triggers read their
-- config from public.app_settings instead of app.settings.* DB settings.
-- The URL is seeded here; set the secret once via the dashboard SQL Editor:
--   update public.app_settings set value = '<FANOUT_SECRET>',
--     updated_at = now() where key = 'fanout_secret';
-- Triggers stay silent until both values are non-empty. Safe to re-run.

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- No policies: with RLS on and zero policies, only the table owner and
-- security-definer functions can read/write. App clients are locked out.
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values
  ('fanout_url', 'https://eatxkfopyljdomzbhzym.supabase.co/functions/v1/push-fanout')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Insert-only: never overwrite an existing secret on re-run.
insert into public.app_settings (key, value) values
  ('fanout_secret', '')
on conflict (key) do nothing;

create or replace function post_fanout(payload jsonb)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  fanout_url text;
  fanout_secret text;
begin
  select value into fanout_url from public.app_settings where key = 'fanout_url';
  select value into fanout_secret from public.app_settings where key = 'fanout_secret';
  if fanout_url is null or fanout_secret is null
    or fanout_url = '' or fanout_secret = '' then
    return;
  end if;
  begin
    perform net.http_post(
      url := fanout_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-fanout-secret', fanout_secret
      ),
      body := payload
    );
  exception when others then
    raise log 'push fanout failed: %', sqlerrm;
  end;
end $$;
