-- Filament ledger logic, reporting views, and small security-definer helpers.

-- ===========================================================================
-- Ledger RPCs (SECURITY INVOKER: they run under the caller's RLS)
-- ===========================================================================

-- Log a scale reading for a spool and update its remaining weight.
-- p_gross_weight_g is what the scale shows (spool + filament); tare is taken from the spool.
create or replace function public.record_weighin(
  p_spool_id        uuid,
  p_gross_weight_g  numeric,
  p_kind            public.weighin_kind default 'manual',
  p_print_job_id    uuid default null,
  p_note            text default null
)
returns public.spool_weighins
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_spool public.spools;
  v_row   public.spool_weighins;
begin
  select * into v_spool from public.spools where id = p_spool_id for update;
  if not found then
    raise exception 'Spool % not found', p_spool_id using errcode = 'P0002';
  end if;
  if p_gross_weight_g < v_spool.tare_weight_g then
    raise exception 'Scale reading (% g) is lighter than the empty spool (% g)', p_gross_weight_g, v_spool.tare_weight_g
      using errcode = '22023';
  end if;

  insert into public.spool_weighins (owner_id, spool_id, print_job_id, kind, gross_weight_g, tare_weight_g, note)
  values (v_spool.owner_id, p_spool_id, p_print_job_id, p_kind, p_gross_weight_g, v_spool.tare_weight_g, p_note)
  returning * into v_row;

  update public.spools set remaining_weight_g = v_row.net_weight_g where id = p_spool_id;
  return v_row;
end;
$$;

-- Close out a print: record the post-print scale reading, compute actual usage,
-- update spool inventory, and store the discrepancy vs the G-code estimate.
-- If p_gross_weight_before_g is null, the spool's current remaining weight is used as "before".
create or replace function public.finish_print_job(
  p_job_id                 uuid,
  p_gross_weight_after_g   numeric,
  p_status                 public.job_status default 'completed',
  p_gross_weight_before_g  numeric default null,
  p_tolerance_g            numeric default 2
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job     public.print_jobs;
  v_spool   public.spools;
  v_before  numeric;
  v_after   public.spool_weighins;
  v_used    numeric;
begin
  if p_status not in ('completed', 'failed', 'cancelled') then
    raise exception 'finish_print_job: status must be completed, failed or cancelled' using errcode = '22023';
  end if;

  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Print job % not found', p_job_id using errcode = 'P0002';
  end if;
  if v_job.spool_id is null then
    raise exception 'Print job % has no spool assigned', p_job_id using errcode = '22023';
  end if;
  if v_job.actual_filament_g is not null then
    raise exception 'Print job % already has an actual weight recorded', p_job_id using errcode = '23505';
  end if;

  if p_gross_weight_before_g is not null then
    perform public.record_weighin(v_job.spool_id, p_gross_weight_before_g, 'before_print', p_job_id);
  end if;

  select * into v_spool from public.spools where id = v_job.spool_id for update;
  v_before := coalesce(
    case when p_gross_weight_before_g is not null then p_gross_weight_before_g - v_spool.tare_weight_g end,
    v_job.weight_before_g,
    v_spool.remaining_weight_g
  );

  v_after := public.record_weighin(v_job.spool_id, p_gross_weight_after_g, 'after_print', p_job_id);
  v_used := v_before - v_after.net_weight_g;

  if v_used < -p_tolerance_g then
    raise exception 'Spool got heavier (before % g, after % g). Check the scale reading or the spool selection.',
      v_before, v_after.net_weight_g using errcode = '22023';
  end if;

  update public.print_jobs
     set weight_before_g   = v_before,
         weight_after_g    = v_after.net_weight_g,
         actual_filament_g = greatest(v_used, 0),
         status            = p_status,
         ended_at          = coalesce(ended_at, now())
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- ===========================================================================
-- Security-definer helpers (narrow, ownership-checked)
-- ===========================================================================

-- Store printer API key without ever letting the browser read it back.
create or replace function public.set_printer_credentials(p_printer_id uuid, p_api_key text, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.printers where id = p_printer_id and owner_id = auth.uid()) then
    raise exception 'Printer not found' using errcode = 'P0002';
  end if;
  insert into public.printer_credentials (printer_id, api_key, extra, updated_at)
  values (p_printer_id, p_api_key, coalesce(p_extra, '{}'::jsonb), now())
  on conflict (printer_id) do update set api_key = excluded.api_key, extra = excluded.extra, updated_at = now();
end;
$$;

create or replace function public.printer_has_credentials(p_printer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.printer_credentials c
    join public.printers p on p.id = c.printer_id
    where c.printer_id = p_printer_id and p.owner_id = auth.uid()
  );
$$;

-- Web UI: get a one-time code to send to the Telegram bot as `/start <code>`.
create or replace function public.create_telegram_link_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  delete from public.telegram_link_tokens where owner_id = auth.uid() and used_at is null;
  insert into public.telegram_link_tokens (token, owner_id) values (v_token, auth.uid());
  return v_token;
end;
$$;

-- Telegram bot (service role only): bind chat to the user who owns the token.
create or replace function public.consume_telegram_link_token(p_token text, p_chat_id bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  update public.telegram_link_tokens
     set used_at = now()
   where token = upper(p_token) and used_at is null and expires_at > now()
  returning owner_id into v_owner;
  if v_owner is null then
    return null;
  end if;
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id;
  update public.profiles set telegram_chat_id = p_chat_id, telegram_linked_at = now() where id = v_owner;
  return v_owner;
end;
$$;

create or replace function public.unlink_telegram()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set telegram_chat_id = null, telegram_linked_at = null where id = auth.uid();
$$;

revoke execute on function public.consume_telegram_link_token(text, bigint) from public, anon, authenticated;
revoke execute on function public.set_printer_credentials(uuid, text, jsonb) from public, anon;
revoke execute on function public.printer_has_credentials(uuid) from public, anon;
revoke execute on function public.create_telegram_link_token() from public, anon;
revoke execute on function public.unlink_telegram() from public, anon;
revoke execute on function public.record_weighin(uuid, numeric, public.weighin_kind, uuid, text) from public, anon;
revoke execute on function public.finish_print_job(uuid, numeric, public.job_status, numeric, numeric) from public, anon;
grant execute on function public.consume_telegram_link_token(text, bigint) to service_role;

-- ===========================================================================
-- Reporting views (security_invoker => RLS of the caller applies)
-- ===========================================================================

-- One row per job with material + electricity cost. "used_g" prefers the measured
-- (actual) weight and falls back to the G-code estimate.
create view public.v_print_job_costs with (security_invoker = true) as
select
  j.id,
  j.owner_id,
  j.name,
  j.project,
  j.status,
  j.printer_id,
  j.spool_id,
  j.gcode_file_id,
  j.started_at,
  j.ended_at,
  coalesce(j.ended_at, j.started_at, j.created_at)                  as job_date,
  j.est_filament_g,
  j.actual_filament_g,
  j.discrepancy_g,
  j.discrepancy_pct,
  coalesce(j.actual_filament_g, j.est_filament_g)                   as used_g,
  (j.actual_filament_g is not null)                                 as is_measured,
  (j.status in ('failed', 'cancelled'))                             as is_waste,
  s.material,
  s.brand,
  s.color_name,
  s.price_per_gram,
  coalesce(s.currency, pr.currency, 'IDR')                          as currency,
  round(coalesce(j.actual_filament_g, j.est_filament_g, 0) * coalesce(s.price_per_gram, 0), 2) as material_cost,
  e.energy_kwh,
  round(e.energy_kwh * coalesce(pr.electricity_rate_per_kwh, 0), 2) as energy_cost,
  round(coalesce(j.actual_filament_g, j.est_filament_g, 0) * coalesce(s.price_per_gram, 0)
        + e.energy_kwh * coalesce(pr.electricity_rate_per_kwh, 0), 2) as total_cost
from public.print_jobs j
left join public.spools   s  on s.id = j.spool_id
left join public.printers p  on p.id = j.printer_id
left join public.profiles pr on pr.id = j.owner_id
cross join lateral (
  select coalesce(
    j.energy_kwh,
    round(
      coalesce(extract(epoch from (j.ended_at - j.started_at)), j.est_duration_s, 0)::numeric
      / 3600.0 * coalesce(p.power_watts, 0) / 1000.0, 3)
  ) as energy_kwh
) e;

-- Spool inventory with usage stats.
create view public.v_spool_inventory with (security_invoker = true) as
select
  s.*,
  round(s.remaining_weight_g / s.initial_net_weight_g * 100, 1)        as remaining_pct,
  round(s.remaining_weight_g * s.price_per_gram, 2)                    as remaining_value,
  coalesce(u.jobs_count, 0)                                            as jobs_count,
  coalesce(u.measured_used_g, 0)                                       as measured_used_g,
  u.avg_discrepancy_pct,
  w.last_weighed_at
from public.spools s
left join lateral (
  select count(*)                         as jobs_count,
         sum(j.actual_filament_g)         as measured_used_g,
         round(avg(j.discrepancy_pct), 2) as avg_discrepancy_pct
  from public.print_jobs j
  where j.spool_id = s.id
) u on true
left join lateral (
  select max(measured_at) as last_weighed_at from public.spool_weighins w where w.spool_id = s.id
) w on true;

-- Spend per day in the user's timezone (for Recharts).
create view public.v_daily_spend with (security_invoker = true) as
select
  c.owner_id,
  (c.job_date at time zone coalesce(pr.timezone, 'Asia/Jakarta'))::date as day,
  count(*)                                    as jobs,
  round(sum(coalesce(c.used_g, 0)), 2)        as used_g,
  round(sum(c.est_filament_g), 2)             as est_g,
  round(sum(c.actual_filament_g), 2)          as actual_g,
  round(sum(c.material_cost), 2)              as material_cost,
  round(sum(c.energy_cost), 2)                as energy_cost,
  round(sum(c.total_cost), 2)                 as total_cost,
  round(sum(case when c.is_waste then c.used_g else 0 end), 2) as wasted_g
from public.v_print_job_costs c
left join public.profiles pr on pr.id = c.owner_id
group by 1, 2;

-- Spend per project.
create view public.v_project_spend with (security_invoker = true) as
select
  owner_id,
  coalesce(nullif(trim(project), ''), '(no project)') as project,
  count(*)                              as jobs,
  round(sum(coalesce(used_g, 0)), 2)    as used_g,
  round(sum(material_cost), 2)          as material_cost,
  round(sum(energy_cost), 2)            as energy_cost,
  round(sum(total_cost), 2)             as total_cost,
  round(avg(total_cost), 2)             as avg_cost_per_job,
  round(avg(discrepancy_pct), 2)        as avg_discrepancy_pct,
  min(job_date)                         as first_job_at,
  max(job_date)                         as last_job_at
from public.v_print_job_costs
group by 1, 2;

grant select on public.v_print_job_costs, public.v_spool_inventory, public.v_daily_spend, public.v_project_spend to authenticated;
revoke all on public.v_print_job_costs, public.v_spool_inventory, public.v_daily_spend, public.v_project_spend from anon;
