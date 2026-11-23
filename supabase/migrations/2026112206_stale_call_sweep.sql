-- Stale-ring sweeper: chat call rows abandoned alive (caller hung up
-- offline, crashed app) would ring the peer forever. Delete chat signals
-- older than two hours unless an open log row proves the call was
-- answered and may still run. Meeting rooms are exempt by design: rooms
-- persist until an admin or the starter ends them.
-- Run: supabase db push

create or replace function public.purge_stale_calls()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.call_signals s
  where s.scope = 'chat'
    and s.started_at < now() - interval '2 hours'
    and not exists (
      select 1 from public.call_logs l
      where l.conversation_id = s.ref_id
        and l.answered = true
        and l.ended_at is null
    );
end;
$$;

-- Hourly cleanup where pg_cron exists (Supabase hosted). Any failure here
-- must never fail the migration: the client also revalidates on focus.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-stale-calls',
      '17 * * * *',
      'select public.purge_stale_calls()'
    );
  end if;
exception when others then
  raise notice 'pg_cron unavailable, skipping stale-call schedule: %', sqlerrm;
end;
$$;
