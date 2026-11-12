-- FilamentIQ core schema
-- Conventions:
--   * every user-owned row has owner_id -> auth.users (defaults to auth.uid() for client inserts)
--   * weights in grams, lengths in mm, temperatures in °C, durations in seconds
--   * money as numeric(14,2) in the spool's currency (default IDR)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.printer_api_type as enum ('octoprint', 'moonraker', 'bambu');
create type public.job_status as enum ('queued', 'printing', 'completed', 'failed', 'cancelled');
-- Matches Gemini Vision's JSON contract: status: normal | warning
create type public.monitor_status as enum ('normal', 'warning');
create type public.weighin_kind as enum ('initial', 'before_print', 'after_print', 'manual');
create type public.parse_status as enum ('pending', 'parsed', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text,
  currency                 text not null default 'IDR',
  -- PLN household tariff (R-1 >= 1300 VA) as a default; user-editable.
  electricity_rate_per_kwh numeric(12, 2) not null default 1444.70 check (electricity_rate_per_kwh >= 0),
  timezone                 text not null default 'Asia/Jakarta',
  telegram_chat_id         bigint unique,
  telegram_linked_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time codes for linking Telegram: web UI calls create_telegram_link_token(),
-- user sends `/start <token>` to the bot, bot (service role) calls consume_telegram_link_token().
create table public.telegram_link_tokens (
  token      text primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Printers ("printer profiles / printer specifications")
-- ---------------------------------------------------------------------------
create table public.printers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  model         text,
  api_type      public.printer_api_type not null,
  base_url      text not null,           -- tunnel URL reachable from the cloud
  webcam_url    text,
  nozzle_diameter_mm numeric(3, 2) not null default 0.40,
  power_watts   numeric(8, 1) not null default 120 check (power_watts >= 0),
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index printers_owner_idx on public.printers (owner_id);
create trigger printers_updated_at before update on public.printers
  for each row execute function public.set_updated_at();

-- Printer API keys / Bambu access codes. RLS on with NO end-user policies:
-- only the service role (monitoring worker) can read. Users write via set_printer_credentials().
create table public.printer_credentials (
  printer_id  uuid primary key references public.printers (id) on delete cascade,
  api_key     text not null,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Spools & weigh-ins (filament ledger)
-- ---------------------------------------------------------------------------
create table public.spools (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text,
  material              text not null default 'PLA',
  brand                 text,
  color_name            text,
  color_hex             text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  diameter_mm           numeric(4, 2) not null default 1.75 check (diameter_mm > 0),
  density_g_cm3         numeric(5, 3) not null default 1.240 check (density_g_cm3 > 0),
  initial_net_weight_g  numeric(10, 2) not null check (initial_net_weight_g > 0),
  tare_weight_g         numeric(10, 2) not null default 0 check (tare_weight_g >= 0),  -- empty spool weight
  remaining_weight_g    numeric(10, 2) not null,
  price                 numeric(14, 2) not null default 0 check (price >= 0),
  currency              text not null default 'IDR',
  price_per_gram        numeric(14, 6) generated always as (price / initial_net_weight_g) stored,
  purchased_at          date,
  archived_at           timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index spools_owner_idx on public.spools (owner_id);
create trigger spools_updated_at before update on public.spools
  for each row execute function public.set_updated_at();

create or replace function public.spools_default_remaining()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.remaining_weight_g := coalesce(new.remaining_weight_g, new.initial_net_weight_g);
  return new;
end;
$$;
create trigger spools_default_remaining before insert on public.spools
  for each row execute function public.spools_default_remaining();

create table public.spool_weighins (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spool_id        uuid not null references public.spools (id) on delete cascade,
  print_job_id    uuid,  -- FK added below
  kind            public.weighin_kind not null default 'manual',
  gross_weight_g  numeric(10, 2) not null check (gross_weight_g >= 0),  -- what the scale shows
  tare_weight_g   numeric(10, 2) not null default 0,
  net_weight_g    numeric(10, 2) generated always as (gross_weight_g - tare_weight_g) stored,
  measured_at     timestamptz not null default now(),
  note            text
);
create index spool_weighins_spool_idx on public.spool_weighins (spool_id, measured_at desc);

-- ---------------------------------------------------------------------------
-- G-code files
-- ---------------------------------------------------------------------------
create table public.gcode_files (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path           text not null unique,  -- inside bucket `gcode`: {owner_id}/{uuid}.gcode
  original_filename      text not null,
  size_bytes             bigint,
  sha256                 text,
  parse_status           public.parse_status not null default 'pending',
  parse_error            text,
  slicer                 text,
  filament_type          text,
  filament_length_mm     numeric(12, 2),
  filament_weight_g      numeric(10, 2),
  filament_diameter_mm   numeric(4, 2),
  filament_density       numeric(5, 3),
  estimated_duration_s   integer,
  nozzle_temp_c          numeric(5, 1),
  bed_temp_c             numeric(5, 1),
  layer_height_mm        numeric(5, 3),
  first_layer_height_mm  numeric(5, 3),
  layer_count            integer,
  max_z_mm               numeric(8, 2),
  metadata               jsonb not null default '{}'::jsonb,  -- full GcodeMetadata (with per-field sources)
  created_at             timestamptz not null default now()
);
create index gcode_files_owner_idx on public.gcode_files (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Print jobs (printing history)
-- ---------------------------------------------------------------------------
create table public.print_jobs (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null,
  project            text,
  printer_id         uuid references public.printers (id) on delete set null,
  gcode_file_id      uuid references public.gcode_files (id) on delete set null,
  spool_id           uuid references public.spools (id) on delete set null,
  status             public.job_status not null default 'queued',
  started_at         timestamptz,
  ended_at           timestamptz,
  est_filament_g     numeric(10, 2),
  est_duration_s     integer,
  weight_before_g    numeric(10, 2),  -- net spool weight before print
  weight_after_g     numeric(10, 2),  -- net spool weight after print
  actual_filament_g  numeric(10, 2) check (actual_filament_g is null or actual_filament_g >= 0),
  discrepancy_g      numeric(10, 2) generated always as (actual_filament_g - est_filament_g) stored,
  discrepancy_pct    numeric(8, 2) generated always as (
                       case when est_filament_g > 0
                            then round((actual_filament_g - est_filament_g) / est_filament_g * 100, 2)
                       end) stored,
  energy_kwh         numeric(10, 3),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index print_jobs_owner_idx on public.print_jobs (owner_id, created_at desc);
create index print_jobs_spool_idx on public.print_jobs (spool_id);
create index print_jobs_printer_status_idx on public.print_jobs (printer_id, status);
create trigger print_jobs_updated_at before update on public.print_jobs
  for each row execute function public.set_updated_at();

alter table public.spool_weighins
  add constraint spool_weighins_print_job_fk
  foreign key (print_job_id) references public.print_jobs (id) on delete set null;

-- Copy estimates from the linked G-code file when not supplied.
create or replace function public.print_jobs_fill_estimates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g public.gcode_files;
begin
  if new.gcode_file_id is not null and (new.est_filament_g is null or new.est_duration_s is null) then
    select * into g from public.gcode_files where id = new.gcode_file_id;
    if found then
      new.est_filament_g := coalesce(new.est_filament_g, g.filament_weight_g);
      new.est_duration_s := coalesce(new.est_duration_s, g.estimated_duration_s);
    end if;
  end if;
  return new;
end;
$$;
create trigger print_jobs_fill_estimates before insert or update of gcode_file_id on public.print_jobs
  for each row execute function public.print_jobs_fill_estimates();

-- ---------------------------------------------------------------------------
-- Monitoring (written by the monitoring worker / Edge Function with the service role)
-- ---------------------------------------------------------------------------
create table public.telemetry (
  id               bigint generated always as identity primary key,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  printer_id       uuid not null references public.printers (id) on delete cascade,
  print_job_id     uuid references public.print_jobs (id) on delete set null,
  captured_at      timestamptz not null default now(),
  state            text,
  nozzle_temp_c    numeric(5, 1),
  nozzle_target_c  numeric(5, 1),
  bed_temp_c       numeric(5, 1),
  bed_target_c     numeric(5, 1),
  progress_pct     numeric(5, 2) check (progress_pct is null or progress_pct between 0 and 100),
  current_layer    integer,
  total_layers     integer,
  z_height_mm      numeric(8, 2),
  time_remaining_s integer,
  raw              jsonb
);
create index telemetry_printer_time_idx on public.telemetry (printer_id, captured_at desc);
create index telemetry_job_time_idx on public.telemetry (print_job_id, captured_at);

create table public.snapshots (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  printer_id    uuid not null references public.printers (id) on delete cascade,
  print_job_id  uuid references public.print_jobs (id) on delete set null,
  storage_path  text not null unique,   -- inside bucket `snapshots`
  captured_at   timestamptz not null default now(),
  diff_score    numeric(6, 4),          -- pixel difference vs previous frame (0..1)
  ssim          numeric(6, 4),          -- structural similarity vs previous frame (0..1)
  analyzed      boolean not null default false
);
create index snapshots_printer_time_idx on public.snapshots (printer_id, captured_at desc);

create table public.monitoring_events (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users (id) on delete cascade,
  printer_id             uuid not null references public.printers (id) on delete cascade,
  print_job_id           uuid references public.print_jobs (id) on delete set null,
  snapshot_id            uuid references public.snapshots (id) on delete set null,           -- "now" frame
  reference_snapshot_id  uuid references public.snapshots (id) on delete set null,           -- T-10 frame
  status                 public.monitor_status not null,
  confidence             numeric(4, 3) not null check (confidence between 0 and 1),
  reason                 text not null,
  model                  text,
  telemetry              jsonb,
  alert_sent_at          timestamptz,
  acknowledged_at        timestamptz,
  created_at             timestamptz not null default now()
);
create index monitoring_events_printer_idx on public.monitoring_events (printer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- AI Material Usage Assistant chat history
-- ---------------------------------------------------------------------------
create table public.ai_chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ai_chat_sessions_owner_idx on public.ai_chat_sessions (owner_id, updated_at desc);
create trigger ai_chat_sessions_updated_at before update on public.ai_chat_sessions
  for each row execute function public.set_updated_at();

create table public.ai_chat_messages (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.ai_chat_sessions (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'model')),
  text        text not null,
  tool_calls  jsonb,  -- [{name, args, cached, ok}] so the UI can show "how I got this"
  created_at  timestamptz not null default now()
);
create index ai_chat_messages_session_idx on public.ai_chat_messages (session_id, id);
