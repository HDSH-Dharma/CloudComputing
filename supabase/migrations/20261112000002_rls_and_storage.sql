-- Row Level Security: users can only see and change their own rows.
-- Monitoring tables are written by the service role (bypasses RLS) and are read-only for users.
-- Note: `(select auth.uid())` is evaluated once per statement instead of per row.
-- Note: in WITH CHECK clauses, `exists (select 1 from public.spools where id = ...)` is itself
--       filtered by RLS, so it also proves the referenced row belongs to the caller.

alter table public.profiles             enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.printers             enable row level security;
alter table public.printer_credentials  enable row level security;
alter table public.spools               enable row level security;
alter table public.spool_weighins       enable row level security;
alter table public.gcode_files          enable row level security;
alter table public.print_jobs           enable row level security;
alter table public.telemetry            enable row level security;
alter table public.snapshots            enable row level security;
alter table public.monitoring_events    enable row level security;
alter table public.ai_chat_sessions     enable row level security;
alter table public.ai_chat_messages     enable row level security;

-- profiles -----------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Telegram fields can only be set by the bot (service role) via consume_telegram_link_token().
revoke update on public.profiles from authenticated;
grant update (display_name, currency, electricity_rate_per_kwh, timezone) on public.profiles to authenticated;

-- telegram_link_tokens: no policies (access only through security-definer functions)
-- printer_credentials:  no policies (service role only; write via set_printer_credentials())

-- printers -----------------------------------------------------------------
create policy "printers: read own" on public.printers
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "printers: insert own" on public.printers
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "printers: update own" on public.printers
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "printers: delete own" on public.printers
  for delete to authenticated using (owner_id = (select auth.uid()));

-- spools -------------------------------------------------------------------
create policy "spools: read own" on public.spools
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "spools: insert own" on public.spools
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "spools: update own" on public.spools
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "spools: delete own" on public.spools
  for delete to authenticated using (owner_id = (select auth.uid()));

-- spool_weighins (append-only ledger: no update) ---------------------------
create policy "weighins: read own" on public.spool_weighins
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "weighins: insert own" on public.spool_weighins
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.spools s where s.id = spool_id)
    and (print_job_id is null or exists (select 1 from public.print_jobs j where j.id = print_job_id))
  );
create policy "weighins: delete own" on public.spool_weighins
  for delete to authenticated using (owner_id = (select auth.uid()));

-- gcode_files --------------------------------------------------------------
create policy "gcode: read own" on public.gcode_files
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "gcode: insert own" on public.gcode_files
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
create policy "gcode: update own" on public.gcode_files
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "gcode: delete own" on public.gcode_files
  for delete to authenticated using (owner_id = (select auth.uid()));

-- print_jobs ---------------------------------------------------------------
create policy "jobs: read own" on public.print_jobs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "jobs: insert own" on public.print_jobs
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and (spool_id      is null or exists (select 1 from public.spools s      where s.id = spool_id))
    and (printer_id    is null or exists (select 1 from public.printers p    where p.id = printer_id))
    and (gcode_file_id is null or exists (select 1 from public.gcode_files g where g.id = gcode_file_id))
  );
create policy "jobs: update own" on public.print_jobs
  for update to authenticated using (owner_id = (select auth.uid())) with check (
    owner_id = (select auth.uid())
    and (spool_id      is null or exists (select 1 from public.spools s      where s.id = spool_id))
    and (printer_id    is null or exists (select 1 from public.printers p    where p.id = printer_id))
    and (gcode_file_id is null or exists (select 1 from public.gcode_files g where g.id = gcode_file_id))
  );
create policy "jobs: delete own" on public.print_jobs
  for delete to authenticated using (owner_id = (select auth.uid()));

-- monitoring (read-only for users) ------------------------------------------
create policy "telemetry: read own" on public.telemetry
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "snapshots: read own" on public.snapshots
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "events: read own" on public.monitoring_events
  for select to authenticated using (owner_id = (select auth.uid()));
-- users may only acknowledge an alert
create policy "events: acknowledge own" on public.monitoring_events
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke insert, update, delete on public.telemetry, public.snapshots, public.monitoring_events from authenticated;
grant update (acknowledged_at) on public.monitoring_events to authenticated;

-- AI chat ------------------------------------------------------------------
create policy "chat sessions: read own" on public.ai_chat_sessions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "chat sessions: insert own" on public.ai_chat_sessions
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "chat sessions: update own" on public.ai_chat_sessions
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "chat sessions: delete own" on public.ai_chat_sessions
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "chat messages: read own" on public.ai_chat_messages
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "chat messages: insert own" on public.ai_chat_messages
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.ai_chat_sessions s where s.id = session_id)
  );

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;

-- ===========================================================================
-- Storage buckets (both private). Object paths always start with the owner's uid:
--   gcode/{owner_id}/{uuid}.gcode
--   snapshots/{owner_id}/{printer_id}/{yyyy-mm-dd}/{epoch_ms}.jpg
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gcode', 'gcode', false, 209715200, null),  -- 200 MB, G-code has no reliable MIME type
  ('snapshots', 'snapshots', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "gcode objects: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'gcode' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "gcode objects: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gcode' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "gcode objects: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gcode' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Snapshots are uploaded by the service role; users can only view (via signed URLs).
create policy "snapshot objects: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'snapshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
