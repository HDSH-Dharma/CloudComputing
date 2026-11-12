/**
 * Shared contracts for FilamentIQ — the single source of truth used by:
 *   - Supabase Edge Functions (Deno)         -> import "../_shared/contracts.ts"
 *   - Next.js frontend / monitoring worker   -> import { ... } from "@filamentiq/shared"
 *
 * Keep this file dependency-free except for `zod` so it runs in both Deno and Node.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Table, view, bucket names
// ---------------------------------------------------------------------------
export const TABLES = {
  profiles: "profiles",
  printers: "printers",
  spools: "spools",
  spoolWeighins: "spool_weighins",
  gcodeFiles: "gcode_files",
  printJobs: "print_jobs",
  telemetry: "telemetry",
  snapshots: "snapshots",
  monitoringEvents: "monitoring_events",
  aiChatSessions: "ai_chat_sessions",
  aiChatMessages: "ai_chat_messages",
} as const;

export const VIEWS = {
  printJobCosts: "v_print_job_costs",
  spoolInventory: "v_spool_inventory",
  dailySpend: "v_daily_spend",
  projectSpend: "v_project_spend",
} as const;

export const RPC = {
  recordWeighin: "record_weighin",
  finishPrintJob: "finish_print_job",
  setPrinterCredentials: "set_printer_credentials",
  printerHasCredentials: "printer_has_credentials",
  createTelegramLinkToken: "create_telegram_link_token",
  consumeTelegramLinkToken: "consume_telegram_link_token", // service role only
  unlinkTelegram: "unlink_telegram",
} as const;

export const BUCKETS = {
  gcode: "gcode",
  snapshots: "snapshots",
} as const;

export const EDGE_FUNCTIONS = {
  gcodeParse: "gcode-parse",
  assistantChat: "assistant-chat",
} as const;

// ---------------------------------------------------------------------------
// Storage paths (first folder MUST be the owner's uid — enforced by storage RLS)
// ---------------------------------------------------------------------------
export const storagePaths = {
  /** gcode/{ownerId}/{fileId}.gcode */
  gcode: (ownerId: string, fileId: string) => `${ownerId}/${fileId}.gcode`,
  /** snapshots/{ownerId}/{printerId}/{yyyy-mm-dd}/{epochMs}.jpg */
  snapshot: (ownerId: string, printerId: string, capturedAt: Date, ext: "jpg" | "png" | "webp" = "jpg") =>
    `${ownerId}/${printerId}/${capturedAt.toISOString().slice(0, 10)}/${capturedAt.getTime()}.${ext}`,
  /** true if the path belongs to the given owner */
  isOwnedBy: (path: string, ownerId: string) => path.split("/")[0] === ownerId && !path.includes(".."),
};

// ---------------------------------------------------------------------------
// Monitoring (Gemini Vision output) — written by the monitoring worker
// ---------------------------------------------------------------------------
export const MonitoringStatus = z.enum(["normal", "warning"]);
export type MonitoringStatus = z.infer<typeof MonitoringStatus>;

/** The JSON Gemini Vision must return for a (T-10, now) frame pair + telemetry. */
export const MonitoringResultSchema = z.object({
  status: MonitoringStatus,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(1000),
});
export type MonitoringResult = z.infer<typeof MonitoringResultSchema>;

/** Send a Telegram alert only for confident warnings. */
export const ALERT_CONFIDENCE_THRESHOLD = 0.7;
export const shouldAlert = (r: MonitoringResult, threshold = ALERT_CONFIDENCE_THRESHOLD) =>
  r.status === "warning" && r.confidence >= threshold;

/** Normalized telemetry sample (one row in `telemetry`), regardless of OctoPrint / Moonraker / Bambu. */
export const TelemetrySampleSchema = z.object({
  printer_id: z.string().uuid(),
  print_job_id: z.string().uuid().nullable().optional(),
  captured_at: z.string().datetime({ offset: true }),
  state: z.string().nullable().optional(),
  nozzle_temp_c: z.number().nullable().optional(),
  nozzle_target_c: z.number().nullable().optional(),
  bed_temp_c: z.number().nullable().optional(),
  bed_target_c: z.number().nullable().optional(),
  progress_pct: z.number().min(0).max(100).nullable().optional(),
  current_layer: z.number().int().nullable().optional(),
  total_layers: z.number().int().nullable().optional(),
  z_height_mm: z.number().nullable().optional(),
  time_remaining_s: z.number().int().nullable().optional(),
  raw: z.unknown().optional(),
});
export type TelemetrySample = z.infer<typeof TelemetrySampleSchema>;

// ---------------------------------------------------------------------------
// G-code metadata
// ---------------------------------------------------------------------------
export const FieldSource = z.enum(["header", "computed", "default"]);
export type FieldSource = z.infer<typeof FieldSource>;

export const GcodeMetadataSchema = z.object({
  slicer: z.string().nullable(),
  flavor: z.string().nullable(),
  filamentType: z.string().nullable(),
  filamentLengthMm: z.number().nonnegative().nullable(),
  filamentWeightG: z.number().nonnegative().nullable(),
  filamentDiameterMm: z.number().positive(),
  filamentDensity: z.number().positive(),
  estimatedDurationS: z.number().int().nonnegative().nullable(),
  nozzleTempC: z.number().nullable(),
  bedTempC: z.number().nullable(),
  layerHeightMm: z.number().positive().nullable(),
  firstLayerHeightMm: z.number().positive().nullable(),
  layerCount: z.number().int().nonnegative().nullable(),
  maxZMm: z.number().nullable(),
  /** where each value came from: the slicer header, our own computation, or a default */
  sources: z.record(z.string(), FieldSource),
  lineCount: z.number().int().nonnegative(),
});
export type GcodeMetadata = z.infer<typeof GcodeMetadataSchema>;

// ---------------------------------------------------------------------------
// Edge Function API contracts
// ---------------------------------------------------------------------------

/** POST /functions/v1/gcode-parse — after the browser uploads the file to Storage. */
export const GcodeParseRequestSchema = z.object({
  storagePath: z.string().min(3).max(500),
  originalFilename: z.string().min(1).max(255),
});
export type GcodeParseRequest = z.infer<typeof GcodeParseRequestSchema>;

/** POST /functions/v1/assistant-chat */
export const AssistantChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});
export type AssistantChatRequest = z.infer<typeof AssistantChatRequestSchema>;

export const ToolCallTraceSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  cached: z.boolean(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type ToolCallTrace = z.infer<typeof ToolCallTraceSchema>;

export const AssistantChatResponseSchema = z.object({
  sessionId: z.string().uuid(),
  reply: z.string(),
  toolCalls: z.array(ToolCallTraceSchema),
  steps: z.number().int(),
  stepLimitReached: z.boolean(),
});
export type AssistantChatResponse = z.infer<typeof AssistantChatResponseSchema>;

/** Body for the finish_print_job RPC (post-print weight entry form). */
export const FinishPrintJobInputSchema = z.object({
  p_job_id: z.string().uuid(),
  p_gross_weight_after_g: z.number().nonnegative().max(10000),
  p_status: z.enum(["completed", "failed", "cancelled"]).default("completed"),
  p_gross_weight_before_g: z.number().nonnegative().max(10000).nullable().optional(),
});
export type FinishPrintJobInput = z.infer<typeof FinishPrintJobInputSchema>;

/** Spool registration form. */
export const SpoolInputSchema = z.object({
  name: z.string().max(80).optional(),
  material: z.string().min(1).max(20).default("PLA"),
  brand: z.string().max(60).optional(),
  color_name: z.string().max(40).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  diameter_mm: z.number().positive().default(1.75),
  density_g_cm3: z.number().positive().optional(),
  initial_net_weight_g: z.number().positive().max(10000),
  tare_weight_g: z.number().nonnegative().max(2000).default(0),
  price: z.number().nonnegative(),
  currency: z.string().length(3).default("IDR"),
  purchased_at: z.string().date().optional(),
});
export type SpoolInput = z.infer<typeof SpoolInputSchema>;
