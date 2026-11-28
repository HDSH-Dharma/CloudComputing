/** Row shapes returned by the views/tables the UI reads (numeric columns arrive as JS numbers via PostgREST). */
export type SpoolInventoryRow = {
  id: string;
  name: string | null;
  material: string;
  brand: string | null;
  color_name: string | null;
  color_hex: string | null;
  diameter_mm: number;
  initial_net_weight_g: number;
  tare_weight_g: number;
  remaining_weight_g: number;
  price: number;
  currency: string;
  price_per_gram: number;
  purchased_at: string | null;
  archived_at: string | null;
  remaining_pct: number | null;
  remaining_value: number | null;
  jobs_count: number;
  measured_used_g: number;
  avg_discrepancy_pct: number | null;
  last_weighed_at: string | null;
};

export type PrinterRow = {
  id: string;
  name: string;
  model: string | null;
  api_type: "octoprint" | "moonraker" | "bambu";
  base_url: string;
  webcam_url: string | null;
  nozzle_diameter_mm: number;
  power_watts: number;
  is_active: boolean;
  last_seen_at: string | null;
};

export type GcodeFileRow = {
  id: string;
  storage_path: string;
  original_filename: string;
  size_bytes: number | null;
  parse_status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  slicer: string | null;
  filament_type: string | null;
  filament_length_mm: number | null;
  filament_weight_g: number | null;
  filament_diameter_mm: number | null;
  filament_density: number | null;
  estimated_duration_s: number | null;
  nozzle_temp_c: number | null;
  bed_temp_c: number | null;
  layer_height_mm: number | null;
  first_layer_height_mm: number | null;
  layer_count: number | null;
  max_z_mm: number | null;
  /** Full GcodeMetadata; `sources` tells whether each field came from the slicer header, was computed, or defaulted. */
  metadata: { sources?: Record<string, "header" | "computed" | "default"> } | null;
  created_at: string;
};

export type JobStatus = "queued" | "printing" | "completed" | "failed" | "cancelled";

export type PrintJobRow = {
  id: string;
  name: string;
  project: string | null;
  status: JobStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  est_filament_g: number | null;
  est_duration_s: number | null;
  weight_before_g: number | null;
  weight_after_g: number | null;
  actual_filament_g: number | null;
  discrepancy_g: number | null;
  discrepancy_pct: number | null;
  spool_id: string | null;
  spools: { name: string | null; material: string; color_name: string | null; color_hex: string | null; tare_weight_g: number; remaining_weight_g: number } | null;
  printers: { name: string } | null;
  gcode_files: { original_filename: string } | null;
};

/** v_daily_spend — one row per day in the user's timezone. Aggregates can be null when no job in the day has the value. */
export type DailySpendRow = {
  day: string;
  jobs: number;
  used_g: number | null;
  est_g: number | null;
  actual_g: number | null;
  material_cost: number | null;
  energy_cost: number | null;
  total_cost: number | null;
  wasted_g: number | null;
};

/** v_project_spend — one row per project. */
export type ProjectSpendRow = {
  project: string;
  jobs: number;
  used_g: number | null;
  material_cost: number | null;
  energy_cost: number | null;
  total_cost: number | null;
  avg_cost_per_job: number | null;
  avg_discrepancy_pct: number | null;
  last_job_at: string | null;
};

/** v_print_job_costs — one row per job with material + energy cost. */
export type JobCostRow = {
  id: string;
  name: string;
  project: string | null;
  status: JobStatus;
  job_date: string;
  est_filament_g: number | null;
  actual_filament_g: number | null;
  discrepancy_g: number | null;
  discrepancy_pct: number | null;
  used_g: number | null;
  is_measured: boolean;
  is_waste: boolean;
  material: string | null;
  currency: string;
  material_cost: number | null;
  energy_cost: number | null;
  total_cost: number | null;
};

export type ProfileSettings = { currency: string; electricity_rate_per_kwh: number };

/** telemetry — one normalized sample per poll, written by the worker. */
export type TelemetryRow = {
  id: number;
  captured_at: string;
  state: string | null;
  nozzle_temp_c: number | null;
  nozzle_target_c: number | null;
  bed_temp_c: number | null;
  bed_target_c: number | null;
  progress_pct: number | null;
  current_layer: number | null;
  total_layers: number | null;
  z_height_mm: number | null;
  time_remaining_s: number | null;
};

export type SnapshotRow = {
  id: string;
  storage_path: string;
  captured_at: string;
  diff_score: number | null;
  ssim: number | null;
  analyzed: boolean;
};

export type MonitoringEventRow = {
  id: string;
  status: "normal" | "warning";
  confidence: number;
  reason: string;
  model: string | null;
  alert_sent_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

/** ai_chat_sessions — one row per conversation with the material assistant. */
export type ChatSessionRow = { id: string; title: string | null; updated_at: string };

/** ai_chat_messages — `tool_calls` is [{name,args,cached,ok,error?}] on model turns. */
export type ChatMessageRow = { id: number; role: "user" | "model"; text: string; tool_calls: unknown };

/** profiles — only the Telegram link state; the chat id itself is never rendered. */
export type TelegramLinkState = { telegram_chat_id: number | null; telegram_linked_at: string | null };
