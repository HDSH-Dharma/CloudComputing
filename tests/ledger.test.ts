import { describe, expect, it } from "vitest";
import {
  aggregateConsumption,
  computeCost,
  computeUsage,
  densityFor,
  discrepancyReport,
  filamentGramsToMm,
  filamentMmToGrams,
  type JobCostRow,
  spoolFits,
} from "../supabase/functions/_shared/ledger.ts";

const job = (o: Partial<JobCostRow>): JobCostRow => ({
  id: "j",
  name: "job",
  project: null,
  status: "completed",
  spool_id: "s1",
  material: "PLA",
  job_date: "2026-11-10T05:00:00Z",
  est_filament_g: null,
  actual_filament_g: null,
  discrepancy_pct: null,
  used_g: 0,
  is_waste: false,
  material_cost: 0,
  energy_cost: 0,
  total_cost: 0,
  ...o,
});

describe("filament math", () => {
  it("1 m of 1.75 mm PLA weighs ~2.98 g", () => {
    expect(filamentMmToGrams(1000, 1.75, 1.24)).toBeCloseTo(2.9825, 3);
  });
  it("grams <-> mm round-trips", () => {
    expect(filamentGramsToMm(filamentMmToGrams(3920.53))).toBeCloseTo(3920.53, 6);
  });
  it("density lookup", () => {
    expect(densityFor("petg")).toBe(1.27);
    expect(densityFor("PLA Silk")).toBe(1.24);
    expect(densityFor(null)).toBe(1.24);
  });
});

describe("computeUsage", () => {
  it("computes actual usage and discrepancy vs estimate", () => {
    expect(computeUsage(650, 636.8, 11.69)).toEqual({ actualG: 13.2, discrepancyG: 1.51, discrepancyPct: 12.92 });
  });
  it("clamps tiny negative readings (scale noise) to zero", () => {
    expect(computeUsage(500, 501).actualG).toBe(0);
  });
  it("rejects a spool that got clearly heavier", () => {
    expect(() => computeUsage(500, 520)).toThrow(RangeError);
  });
});

describe("computeCost", () => {
  it("adds material and electricity cost", () => {
    const c = computeCost({
      grams: 100,
      spoolPrice: 200_000,
      spoolInitialNetWeightG: 1000,
      durationS: 7200,
      printerPowerW: 150,
      electricityRatePerKwh: 1444.7,
    });
    expect(c).toEqual({ grams: 100, pricePerGram: 200, materialCost: 20_000, energyKwh: 0.3, energyCost: 433.41, totalCost: 20_433.41 });
  });
});

describe("spoolFits", () => {
  it("keeps a safety margin", () => {
    expect(spoolFits(110, 100).fits).toBe(true); // margin 10 g
    expect(spoolFits(105, 100).fits).toBe(false);
    expect(spoolFits(20, 10).safetyMarginG).toBe(5); // min margin
  });
});

describe("aggregateConsumption", () => {
  const rows = [
    job({ id: "a", project: "Drone", used_g: 50, material_cost: 9000, total_cost: 9500, energy_cost: 500 }),
    job({ id: "b", project: "Drone", used_g: 10, material_cost: 1800, total_cost: 1900, energy_cost: 100, status: "failed", is_waste: true }),
    job({ id: "c", project: null, used_g: 20, material_cost: 3600, total_cost: 3600, job_date: "2026-11-10T18:30:00Z" }),
  ];
  it("groups by project with waste and averages", () => {
    const g = aggregateConsumption(rows, "project");
    expect(g.find((x) => x.key === "Drone")).toMatchObject({ jobs: 2, usedG: 60, wastedG: 10, totalCost: 11400, avgCostPerJob: 5700 });
    expect(g.find((x) => x.key === "(no project)")?.jobs).toBe(1);
  });
  it("groups by day in the user's timezone", () => {
    // 18:30Z on the 10th is 01:30 on the 11th in Jakarta (UTC+7)
    expect(aggregateConsumption(rows, "day", "Asia/Jakarta").map((g) => g.key)).toEqual(["2026-11-10", "2026-11-11"]);
  });
});

describe("discrepancyReport", () => {
  it("summarises measured jobs only", () => {
    const r = discrepancyReport([
      job({ id: "a", name: "A", est_filament_g: 100, actual_filament_g: 110 }),
      job({ id: "b", name: "B", est_filament_g: 50, actual_filament_g: 45 }),
      job({ id: "c", name: "C", est_filament_g: 30, actual_filament_g: null }),
    ]);
    expect(r).toMatchObject({
      measuredJobs: 2,
      totalEstimatedG: 150,
      totalActualG: 155,
      totalDiscrepancyG: 5,
      meanDiscrepancyPct: 0,
      meanAbsDiscrepancyPct: 10,
      suggestedCorrectionFactor: 1.033,
    });
    expect(r.worst[0]?.name).toBe("A");
  });
});
