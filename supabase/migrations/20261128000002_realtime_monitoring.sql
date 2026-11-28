-- The monitoring page subscribes to these tables with Supabase Realtime instead of polling.
-- Realtime still applies each table's RLS, so a user only receives rows of their own printers.
do $$
declare
  t text;
begin
  foreach t in array array['telemetry', 'snapshots', 'monitoring_events'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
