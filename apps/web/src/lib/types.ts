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
