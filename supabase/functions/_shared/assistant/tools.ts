/**
 * Database tools Gemini can call. Every query runs through the *caller's* Supabase client,
 * so Row Level Security limits the model to the signed-in user's data. Tools are read-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TABLES, VIEWS } from "../contracts.ts";
import {
  aggregateConsumption,
  computeCost,
  discrepancyReport,
  type GroupBy,
  type JobCostRow,
  round,
  spoolFits,
} from "../ledger.ts";
import type { ToolDef } from "./loop.ts";

export interface ToolContext {
  db: SupabaseClient;
  userId: string;
  timeZone: string;
  now: Date;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

/** Offset (minutes) of `timeZone` from UTC at `date`. */
export function tzOffsetMinutes(timeZone: string, date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Start of a local calendar day as an ISO UTC timestamp. */
export function dayStartUtc(day: string, timeZone: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMinutes(timeZone, guess) * 60000).toISOString();
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

const JOB_COLUMNS =
  "id,name,project,status,spool_id,material,job_date,est_filament_g,actual_filament_g,discrepancy_pct,used_g,is_measured,is_waste,material_cost,energy_cost,total_cost,currency";

async function loadJobs(
  ctx: ToolContext,
  f: { from?: string; to?: string; project?: string; status?: string; spool_id?: string; material?: string },
  limit: number,
): Promise<JobCostRow[]> {
  let q = ctx.db.from(VIEWS.printJobCosts).select(JOB_COLUMNS).order("job_date", { ascending: false }).limit(limit);
  if (f.from) q = q.gte("job_date", dayStartUtc(f.from, ctx.timeZone));
  if (f.to) q = q.lt("job_date", dayStartUtc(nextDay(f.to), ctx.timeZone));
  if (f.project) q = q.ilike("project", `%${f.project}%`);
  if (f.status) q = q.eq("status", f.status);
  if (f.spool_id) q = q.eq("spool_id", f.spool_id);
  if (f.material) q = q.ilike("material", f.material);
  return check(await q) as unknown as JobCostRow[];
}

const dateRangeProps = {
  from: { type: "string", description: "Start date inclusive, YYYY-MM-DD in the user's timezone" },
  to: { type: "string", description: "End date inclusive, YYYY-MM-DD in the user's timezone" },
};

// ---------------------------------------------------------------------------
// tools
// ---------------------------------------------------------------------------
const getSpoolInventory: ToolDef<ToolContext, { material?: string; include_archived: boolean }> = {
  name: "get_spool_inventory",
  description:
    "List the user's filament spools with remaining weight (g), remaining %, price per gram, remaining value, number of jobs, and average estimate discrepancy %.",
  parameters: {
    type: "object",
    properties: {
      material: { type: "string", description: "Filter by material, e.g. PLA, PETG" },
      include_archived: { type: "boolean", description: "Include archived (used-up) spools. Default false." },
    },
  },
  args: z.object({ material: z.string().max(20).optional(), include_archived: z.boolean().default(false) }),
  async run(ctx, a) {
    let q = ctx.db
      .from(VIEWS.spoolInventory)
      .select(
        "id,name,material,brand,color_name,remaining_weight_g,remaining_pct,initial_net_weight_g,price,price_per_gram,remaining_value,currency,jobs_count,measured_used_g,avg_discrepancy_pct,last_weighed_at,archived_at",
      )
      .order("remaining_weight_g", { ascending: true })
      .limit(100);
    if (a.material) q = q.ilike("material", a.material);
    if (!a.include_archived) q = q.is("archived_at", null);
    const rows = check(await q) as Array<Record<string, unknown>>;
    return { count: rows.length, spools: rows.map((r) => ({ ...r, price_per_gram: round(Number(r.price_per_gram), 2) })) };
  },
};

const getPrintHistory: ToolDef<
  ToolContext,
  { from?: string; to?: string; project?: string; status?: string; spool_id?: string; limit: number }
> = {
  name: "get_print_history",
  description:
    "List print jobs (newest first) with estimated vs actual filament (g), discrepancy %, material cost, energy cost, and total cost. used_g is the measured weight when available, otherwise the G-code estimate (is_measured tells which).",
  parameters: {
    type: "object",
    properties: {
      ...dateRangeProps,
      project: { type: "string", description: "Project name (partial match)" },
      status: { type: "string", enum: ["queued", "printing", "completed", "failed", "cancelled"] },
      spool_id: { type: "string", description: "Spool UUID" },
      limit: { type: "integer", description: "Max rows, 1-50. Default 20." },
    },
  },
  args: z.object({
    from: isoDay.optional(),
    to: isoDay.optional(),
    project: z.string().max(80).optional(),
    status: z.enum(["queued", "printing", "completed", "failed", "cancelled"]).optional(),
    spool_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async run(ctx, a) {
    const jobs = await loadJobs(ctx, a, a.limit);
    return { count: jobs.length, jobs };
  },
};

const GROUP_BY = ["day", "week", "month", "project", "material", "spool", "status"] as const;

const getConsumptionSummary: ToolDef<ToolContext, { from?: string; to?: string; group_by: GroupBy; project?: string }> = {
  name: "get_consumption_summary",
  description:
    "Aggregate filament use and spending over a period, grouped by day/week/month/project/material/spool/status. Returns per-group jobs, grams used, grams wasted (failed/cancelled prints), material/energy/total cost, and average cost per job, plus overall totals. Use this for 'average cost per project', 'how much did I spend this month', 'how much filament did I waste'.",
  parameters: {
    type: "object",
    properties: {
      ...dateRangeProps,
      group_by: { type: "string", enum: [...GROUP_BY] },
      project: { type: "string", description: "Optional project filter (partial match)" },
    },
    required: ["group_by"],
  },
  args: z.object({ from: isoDay.optional(), to: isoDay.optional(), group_by: z.enum(GROUP_BY), project: z.string().max(80).optional() }),
  async run(ctx, a) {
    const jobs = await loadJobs(ctx, a, 2000);
    const groups = aggregateConsumption(jobs, a.group_by, ctx.timeZone);
    const totals = aggregateConsumption(jobs.map((j) => ({ ...j, project: "all" })), "project", ctx.timeZone)[0] ?? null;
    return { jobs_considered: jobs.length, truncated: jobs.length === 2000, currency: (jobs[0] as any)?.currency ?? "IDR", groups, totals };
  },
};

const getEstimateAccuracy: ToolDef<ToolContext, { from?: string; to?: string; spool_id?: string; material?: string }> = {
  name: "get_estimate_accuracy",
  description:
    "Compare G-code (slicer) filament estimates against actual weighed usage for measured jobs. Returns totals, mean and mean-absolute discrepancy %, a suggested correction factor for future estimates, and the worst jobs.",
  parameters: {
    type: "object",
    properties: { ...dateRangeProps, spool_id: { type: "string" }, material: { type: "string" } },
  },
  args: z.object({ from: isoDay.optional(), to: isoDay.optional(), spool_id: z.string().uuid().optional(), material: z.string().max(20).optional() }),
  async run(ctx, a) {
    const jobs = await loadJobs(ctx, a, 2000);
    return discrepancyReport(jobs);
  },
};

const findGcodeFiles: ToolDef<ToolContext, { search?: string; limit: number }> = {
  name: "find_gcode_files",
  description:
    "Search the user's uploaded G-code files by filename. Returns id, filename, material, estimated filament (g, mm), estimated duration (s), temperatures and layer height. Use to resolve a file the user mentions by name.",
  parameters: {
    type: "object",
    properties: { search: { type: "string", description: "Part of the filename" }, limit: { type: "integer", description: "1-20, default 10" } },
  },
  args: z.object({ search: z.string().max(100).optional(), limit: z.number().int().min(1).max(20).default(10) }),
  async run(ctx, a) {
    let q = ctx.db
      .from(TABLES.gcodeFiles)
      .select(
        "id,original_filename,slicer,filament_type,filament_weight_g,filament_length_mm,estimated_duration_s,nozzle_temp_c,bed_temp_c,layer_height_mm,layer_count,created_at",
      )
      .eq("parse_status", "parsed")
      .order("created_at", { ascending: false })
      .limit(a.limit);
    if (a.search) q = q.ilike("original_filename", `%${a.search}%`);
    const files = check(await q) as unknown[];
    return { count: files.length, files };
  },
};

async function loadRequirement(ctx: ToolContext, gcodeFileId?: string, grams?: number) {
  if (gcodeFileId) {
    const g = check(
      await ctx.db
        .from(TABLES.gcodeFiles)
        .select("id,original_filename,filament_type,filament_weight_g,estimated_duration_s")
        .eq("id", gcodeFileId)
        .maybeSingle(),
    ) as { id: string; original_filename: string; filament_type: string | null; filament_weight_g: number | null; estimated_duration_s: number | null } | null;
    if (!g) throw new Error("G-code file not found");
    if (g.filament_weight_g == null) throw new Error("This G-code file has no filament estimate");
    return { grams: Number(g.filament_weight_g), durationS: g.estimated_duration_s, material: g.filament_type, file: g.original_filename };
  }
  if (grams == null) throw new Error("Provide gcode_file_id or required_g");
  return { grams, durationS: null as number | null, material: null as string | null, file: null as string | null };
}

const recommendSpool: ToolDef<ToolContext, { gcode_file_id?: string; required_g?: number; material?: string }> = {
  name: "recommend_spool_for_job",
  description:
    "Rank the user's spools for an upcoming print. Adjusts the slicer estimate with each spool's historical discrepancy, checks whether the spool has enough filament (with a safety margin), and computes the material cost. Spools that fit come first, then cheapest, then the one that leaves the least leftover (uses up nearly-empty spools).",
  parameters: {
    type: "object",
    properties: {
      gcode_file_id: { type: "string", description: "UUID of an uploaded G-code file (preferred)" },
      required_g: { type: "number", description: "Filament needed in grams, if no G-code file" },
      material: { type: "string", description: "Restrict to a material; defaults to the G-code's filament type" },
    },
  },
  args: z
    .object({ gcode_file_id: z.string().uuid().optional(), required_g: z.number().positive().max(10000).optional(), material: z.string().max(20).optional() })
    .refine((a) => a.gcode_file_id || a.required_g, "gcode_file_id or required_g is required"),
  async run(ctx, a) {
    const req = await loadRequirement(ctx, a.gcode_file_id, a.required_g);
    const material = a.material ?? req.material ?? undefined;
    let q = ctx.db
      .from(VIEWS.spoolInventory)
      .select("id,name,material,brand,color_name,remaining_weight_g,price,initial_net_weight_g,avg_discrepancy_pct,currency")
      .is("archived_at", null)
      .limit(100);
    if (material) q = q.ilike("material", material);
    const spools = check(await q) as Array<{
      id: string;
      name: string | null;
      material: string;
      brand: string | null;
      color_name: string | null;
      remaining_weight_g: number;
      price: number;
      initial_net_weight_g: number;
      avg_discrepancy_pct: number | null;
      currency: string;
    }>;
    const ranked = spools
      .map((s) => {
        const factor = 1 + Math.max(0, Number(s.avg_discrepancy_pct ?? 0)) / 100;
        const adjusted = round(req.grams * factor);
        const fit = spoolFits(Number(s.remaining_weight_g), adjusted);
        const cost = computeCost({ grams: adjusted, spoolPrice: Number(s.price), spoolInitialNetWeightG: Number(s.initial_net_weight_g) });
        return {
          spool_id: s.id,
          label: [s.brand, s.material, s.color_name].filter(Boolean).join(" ") || s.name,
          remaining_g: Number(s.remaining_weight_g),
          adjusted_required_g: adjusted,
          ...fit,
          material_cost: cost.materialCost,
          price_per_gram: cost.pricePerGram,
          currency: s.currency,
        };
      })
      .sort((x, y) => Number(y.fits) - Number(x.fits) || x.material_cost - y.material_cost || x.remainingAfterG - y.remainingAfterG);
    return { job: { file: req.file, slicer_estimate_g: req.grams, material: material ?? null }, recommendations: ranked.slice(0, 10) };
  },
};

const estimatePrintCost: ToolDef<ToolContext, { spool_id: string; gcode_file_id?: string; grams?: number; duration_s?: number; printer_id?: string }> = {
  name: "estimate_print_cost",
  description:
    "Estimate the cost of a print on a specific spool: material cost from the spool's price per gram plus electricity from print duration, printer wattage and the user's tariff.",
  parameters: {
    type: "object",
    properties: {
      spool_id: { type: "string" },
      gcode_file_id: { type: "string" },
      grams: { type: "number", description: "Use if no G-code file" },
      duration_s: { type: "integer", description: "Overrides the G-code duration" },
      printer_id: { type: "string", description: "Printer for wattage; defaults to the user's first printer" },
    },
    required: ["spool_id"],
  },
  args: z
    .object({
      spool_id: z.string().uuid(),
      gcode_file_id: z.string().uuid().optional(),
      grams: z.number().positive().max(10000).optional(),
      duration_s: z.number().int().nonnegative().optional(),
      printer_id: z.string().uuid().optional(),
    })
    .refine((a) => a.gcode_file_id || a.grams, "gcode_file_id or grams is required"),
  async run(ctx, a) {
    const req = await loadRequirement(ctx, a.gcode_file_id, a.grams);
    const spool = check(
      await ctx.db.from(TABLES.spools).select("id,price,initial_net_weight_g,remaining_weight_g,currency").eq("id", a.spool_id).maybeSingle(),
    ) as { price: number; initial_net_weight_g: number; remaining_weight_g: number; currency: string } | null;
    if (!spool) throw new Error("Spool not found");
    let pq = ctx.db.from(TABLES.printers).select("id,name,power_watts").order("created_at").limit(1);
    if (a.printer_id) pq = pq.eq("id", a.printer_id);
    const printer = (check(await pq) as Array<{ id: string; name: string; power_watts: number }>)[0];
    const profile = check(await ctx.db.from(TABLES.profiles).select("electricity_rate_per_kwh").eq("id", ctx.userId).maybeSingle()) as {
      electricity_rate_per_kwh: number;
    } | null;
    const cost = computeCost({
      grams: req.grams,
      spoolPrice: Number(spool.price),
      spoolInitialNetWeightG: Number(spool.initial_net_weight_g),
      durationS: a.duration_s ?? req.durationS,
      printerPowerW: printer ? Number(printer.power_watts) : null,
      electricityRatePerKwh: profile ? Number(profile.electricity_rate_per_kwh) : null,
    });
    return { ...cost, currency: spool.currency, printer: printer?.name ?? null, fits: spoolFits(Number(spool.remaining_weight_g), req.grams) };
  },
};

const getTelemetrySummary: ToolDef<ToolContext, { printer_id?: string; print_job_id?: string; hours: number }> = {
  name: "get_telemetry_summary",
  description:
    "Summarize recent printer telemetry (nozzle/bed temperature min/avg/max, latest progress and layer) and recent AI monitoring warnings for a printer or job.",
  parameters: {
    type: "object",
    properties: {
      printer_id: { type: "string" },
      print_job_id: { type: "string" },
      hours: { type: "integer", description: "Look-back window in hours, 1-72. Default 6." },
    },
  },
  args: z.object({ printer_id: z.string().uuid().optional(), print_job_id: z.string().uuid().optional(), hours: z.number().int().min(1).max(72).default(6) }),
  async run(ctx, a) {
    const since = new Date(ctx.now.getTime() - a.hours * 3600_000).toISOString();
    let tq = ctx.db
      .from(TABLES.telemetry)
      .select("captured_at,printer_id,print_job_id,state,nozzle_temp_c,nozzle_target_c,bed_temp_c,bed_target_c,progress_pct,current_layer,total_layers,time_remaining_s")
      .gte("captured_at", since)
      .order("captured_at", { ascending: false })
      .limit(2000);
    let eq = ctx.db
      .from(TABLES.monitoringEvents)
      .select("created_at,printer_id,print_job_id,status,confidence,reason,alert_sent_at,acknowledged_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);
    if (a.printer_id) {
      tq = tq.eq("printer_id", a.printer_id);
      eq = eq.eq("printer_id", a.printer_id);
    }
    if (a.print_job_id) {
      tq = tq.eq("print_job_id", a.print_job_id);
      eq = eq.eq("print_job_id", a.print_job_id);
    }
    const [tRes, eRes] = await Promise.all([tq, eq]);
    const samples = check(tRes) as Array<Record<string, any>>;
    const events = check(eRes) as unknown[];
    const stats = (key: string) => {
      const xs = samples.map((s) => s[key]).filter((v): v is number => v != null).map(Number);
      return xs.length ? { min: Math.min(...xs), avg: round(xs.reduce((s, x) => s + x, 0) / xs.length, 1), max: Math.max(...xs) } : null;
    };
    return {
      window_hours: a.hours,
      samples: samples.length,
      latest: samples[0] ?? null,
      nozzle_temp_c: stats("nozzle_temp_c"),
      bed_temp_c: stats("bed_temp_c"),
      monitoring_events: events,
    };
  },
};

export const ASSISTANT_TOOLS: ToolDef<ToolContext>[] = [
  getSpoolInventory,
  getPrintHistory,
  getConsumptionSummary,
  getEstimateAccuracy,
  findGcodeFiles,
  recommendSpool,
  estimatePrintCost,
  getTelemetrySummary,
];

export function buildSystemInstruction(now: Date, timeZone: string, currency: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return [
    "You are FilamentIQ's Material Usage Assistant: a data analyst for one maker's 3D printing filament inventory, print history, costs and printer telemetry.",
    `Today is ${today} (timezone ${timeZone}). Money is in ${currency} unless a row says otherwise; format IDR like "Rp 12.345".`,
    "Rules:",
    "- Get every number from the tools. Never invent spools, jobs, prices or weights. If the data is empty, say so and suggest what to record (e.g. weigh the spool after a print).",
    "- Say whether figures are measured (weighed) or slicer estimates. used_g falls back to the estimate when a job was not weighed.",
    "- Resolve relative dates ('this month', 'last week') to YYYY-MM-DD before calling tools.",
    "- Prefer one aggregate tool call over many small ones. Do not repeat a call you already made.",
    "- You are read-only: you cannot change data, start/stop prints, or control the printer. Monitoring alerts are warnings only.",
    "- Reply in the user's language (Bahasa Indonesia or English), short and concrete: lead with the answer, then 2-4 supporting numbers.",
  ].join("\n");
}
