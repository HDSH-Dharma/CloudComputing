/**
 * Filament ledger math. Pure functions, no I/O — used by the G-code parser,
 * the AI assistant tools, and the frontend cost calculator.
 *
 * The database mirrors the core of this in SQL (finish_print_job, v_print_job_costs).
 * If you change a formula here, change it there too (and vice versa).
 */

/** Typical densities in g/cm³, used when neither the G-code nor the spool says otherwise. */
export const MATERIAL_DENSITY: Readonly<Record<string, number>> = {
  PLA: 1.24,
  "PLA+": 1.24,
  PETG: 1.27,
  ABS: 1.04,
  ASA: 1.07,
  TPU: 1.21,
  PA: 1.14,
  NYLON: 1.14,
  PC: 1.2,
  PVA: 1.23,
  HIPS: 1.04,
};
export const DEFAULT_DENSITY = 1.24;
export const DEFAULT_DIAMETER_MM = 1.75;

export const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export function densityFor(material: string | null | undefined): number {
  if (!material) return DEFAULT_DENSITY;
  const key = material.trim().toUpperCase();
  return MATERIAL_DENSITY[key] ?? MATERIAL_DENSITY[key.split(/[\s-]/)[0] ?? ""] ?? DEFAULT_DENSITY;
}

/** Filament length (mm) -> mass (g). volume = π·r²·L (mm³); 1 cm³ = 1000 mm³. */
export function filamentMmToGrams(lengthMm: number, diameterMm = DEFAULT_DIAMETER_MM, densityGcm3 = DEFAULT_DENSITY): number {
  const r = diameterMm / 2;
  return ((Math.PI * r * r * lengthMm) / 1000) * densityGcm3;
}

/** Mass (g) -> filament length (mm). */
export function filamentGramsToMm(grams: number, diameterMm = DEFAULT_DIAMETER_MM, densityGcm3 = DEFAULT_DENSITY): number {
  const r = diameterMm / 2;
  return (grams * 1000) / densityGcm3 / (Math.PI * r * r);
}

/** What the scale shows minus the empty spool. */
export const netWeight = (grossG: number, tareG: number) => grossG - tareG;

export interface UsageResult {
  actualG: number;
  /** actual - estimate (positive = used more than the slicer predicted) */
  discrepancyG: number | null;
  discrepancyPct: number | null;
}

/** Actual usage from before/after net weights, plus discrepancy vs the G-code estimate. */
export function computeUsage(beforeNetG: number, afterNetG: number, estimatedG?: number | null, toleranceG = 2): UsageResult {
  const used = beforeNetG - afterNetG;
  if (used < -toleranceG) {
    throw new RangeError(`Spool got heavier (before ${beforeNetG} g, after ${afterNetG} g)`);
  }
  const actualG = round(Math.max(used, 0));
  if (estimatedG == null) return { actualG, discrepancyG: null, discrepancyPct: null };
  return {
    actualG,
    discrepancyG: round(actualG - estimatedG),
    discrepancyPct: estimatedG > 0 ? round(((actualG - estimatedG) / estimatedG) * 100) : null,
  };
}

export const pricePerGram = (price: number, initialNetWeightG: number) => (initialNetWeightG > 0 ? price / initialNetWeightG : 0);

export interface CostInput {
  grams: number;
  spoolPrice: number;
  spoolInitialNetWeightG: number;
  durationS?: number | null;
  printerPowerW?: number | null;
  electricityRatePerKwh?: number | null;
}

export interface CostBreakdown {
  grams: number;
  pricePerGram: number;
  materialCost: number;
  energyKwh: number;
  energyCost: number;
  totalCost: number;
}

export function computeCost(input: CostInput): CostBreakdown {
  const ppg = pricePerGram(input.spoolPrice, input.spoolInitialNetWeightG);
  const materialCost = input.grams * ppg;
  const energyKwh = ((input.durationS ?? 0) / 3600) * ((input.printerPowerW ?? 0) / 1000);
  const energyCost = energyKwh * (input.electricityRatePerKwh ?? 0);
  return {
    grams: round(input.grams),
    pricePerGram: round(ppg, 4),
    materialCost: round(materialCost),
    energyKwh: round(energyKwh, 3),
    energyCost: round(energyCost),
    totalCost: round(materialCost + energyCost),
  };
}

export interface SpoolFit {
  fits: boolean;
  remainingAfterG: number;
  /** extra margin we keep for purge, skirt, and estimate error */
  safetyMarginG: number;
}

/** Does the spool have enough filament for a job (with a safety margin)? */
export function spoolFits(remainingG: number, requiredG: number, marginPct = 10, minMarginG = 5): SpoolFit {
  const safetyMarginG = round(Math.max(requiredG * (marginPct / 100), minMarginG));
  const remainingAfterG = round(remainingG - requiredG);
  return { fits: remainingAfterG >= safetyMarginG, remainingAfterG, safetyMarginG };
}

/** Job row shape used by aggregations (a subset of v_print_job_costs). */
export interface JobCostRow {
  id: string;
  name: string;
  project: string | null;
  status: string;
  spool_id: string | null;
  material: string | null;
  job_date: string;
  est_filament_g: number | null;
  actual_filament_g: number | null;
  discrepancy_pct: number | null;
  used_g: number | null;
  is_waste: boolean;
  material_cost: number | null;
  energy_cost: number | null;
  total_cost: number | null;
}

export type GroupBy = "day" | "week" | "month" | "project" | "material" | "spool" | "status";

export interface ConsumptionGroup {
  key: string;
  jobs: number;
  usedG: number;
  wastedG: number;
  materialCost: number;
  energyCost: number;
  totalCost: number;
  avgCostPerJob: number;
}

function groupKey(row: JobCostRow, by: GroupBy, timeZone: string): string {
  switch (by) {
    case "project":
      return row.project?.trim() || "(no project)";
    case "material":
      return row.material ?? "(unknown)";
    case "spool":
      return row.spool_id ?? "(no spool)";
    case "status":
      return row.status;
    default: {
      const d = new Date(row.job_date);
      const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      if (by === "day") return day;
      if (by === "month") return day.slice(0, 7);
      // ISO week starting Monday
      const local = new Date(`${day}T00:00:00Z`);
      const dow = (local.getUTCDay() + 6) % 7;
      local.setUTCDate(local.getUTCDate() - dow);
      return `week of ${local.toISOString().slice(0, 10)}`;
    }
  }
}

export function aggregateConsumption(rows: JobCostRow[], by: GroupBy, timeZone = "Asia/Jakarta"): ConsumptionGroup[] {
  const groups = new Map<string, ConsumptionGroup>();
  for (const r of rows) {
    const key = groupKey(r, by, timeZone);
    const g = groups.get(key) ?? { key, jobs: 0, usedG: 0, wastedG: 0, materialCost: 0, energyCost: 0, totalCost: 0, avgCostPerJob: 0 };
    const used = Number(r.used_g ?? 0);
    g.jobs += 1;
    g.usedG += used;
    if (r.is_waste) g.wastedG += used;
    g.materialCost += Number(r.material_cost ?? 0);
    g.energyCost += Number(r.energy_cost ?? 0);
    g.totalCost += Number(r.total_cost ?? 0);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      usedG: round(g.usedG),
      wastedG: round(g.wastedG),
      materialCost: round(g.materialCost),
      energyCost: round(g.energyCost),
      totalCost: round(g.totalCost),
      avgCostPerJob: round(g.totalCost / g.jobs),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface DiscrepancyReport {
  measuredJobs: number;
  totalEstimatedG: number;
  totalActualG: number;
  totalDiscrepancyG: number;
  meanDiscrepancyPct: number | null;
  meanAbsDiscrepancyPct: number | null;
  /** multiply slicer estimates by this to predict real usage */
  suggestedCorrectionFactor: number | null;
  worst: Array<{ id: string; name: string; estG: number; actualG: number; pct: number | null }>;
}

export function discrepancyReport(rows: JobCostRow[], worstN = 5): DiscrepancyReport {
  const measured = rows.filter((r) => r.actual_filament_g != null && r.est_filament_g != null && Number(r.est_filament_g) > 0);
  const est = measured.reduce((s, r) => s + Number(r.est_filament_g), 0);
  const act = measured.reduce((s, r) => s + Number(r.actual_filament_g), 0);
  const pcts = measured.map((r) => ((Number(r.actual_filament_g) - Number(r.est_filament_g)) / Number(r.est_filament_g)) * 100);
  const mean = (xs: number[]) => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return {
    measuredJobs: measured.length,
    totalEstimatedG: round(est),
    totalActualG: round(act),
    totalDiscrepancyG: round(act - est),
    meanDiscrepancyPct: mean(pcts),
    meanAbsDiscrepancyPct: mean(pcts.map(Math.abs)),
    suggestedCorrectionFactor: est > 0 ? round(act / est, 3) : null,
    worst: measured
      .map((r, i) => ({ id: r.id, name: r.name, estG: Number(r.est_filament_g), actualG: Number(r.actual_filament_g), pct: round(pcts[i]!) }))
      .sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0))
      .slice(0, worstN),
  };
}
