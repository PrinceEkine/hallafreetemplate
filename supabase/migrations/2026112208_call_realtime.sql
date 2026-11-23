-- Live-call realtime repair: remote hang-up / invite-cancel detection never
-- fired on clients. Filtered DELETE subscriptions only match when the table
-- ships full old rows (default replica identity sends none), and the
-- presence table was never added to the realtime publication at all.
alter table public.call_signals replica identity full;
alter table public.call_presence replica identity full;
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_presence'
  ) then
    alter publication supabase_realtime add table public.call_presence;
  end if;
end
$$;
