import type { Metadata } from "next";
import { TABLES, VIEWS } from "@filamentiq/shared";
import { FinishJobForm } from "@/components/finish-job-form";
import { JobStatusBadge } from "@/components/job-status";
import { NewJobForm, type JobFormOptions } from "@/components/new-job-form";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { formatDateTime, formatDuration, formatGrams } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { GcodeFileRow, PrintJobRow, PrinterRow, SpoolInventoryRow } from "@/lib/types";

export const metadata: Metadata = { title: "Print job" };

export default async function JobsPage() {
  const supabase = await createClient();
  const [jobsRes, spoolsRes, printersRes, gcodesRes] = await Promise.all([
    supabase
      .from(TABLES.printJobs)
      .select("*, spools(name,material,color_name,color_hex,tare_weight_g,remaining_weight_g), printers(name), gcode_files(original_filename)")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<PrintJobRow[]>(),
    supabase.from(VIEWS.spoolInventory).select("id,name,material,brand,color_name,remaining_weight_g").is("archived_at", null).order("created_at", { ascending: false }).returns<SpoolInventoryRow[]>(),
    supabase.from(TABLES.printers).select("id,name").eq("is_active", true).order("name").returns<PrinterRow[]>(),
    supabase.from(TABLES.gcodeFiles).select("id,original_filename,filament_weight_g").eq("parse_status", "parsed").order("created_at", { ascending: false }).limit(100).returns<GcodeFileRow[]>(),
  ]);

  const options: JobFormOptions = {
    spools: (spoolsRes.data ?? []).map((s) => ({
      id: s.id,
      label: `${s.name || [s.brand, s.color_name].filter(Boolean).join(" ") || s.material} · sisa ${formatGrams(s.remaining_weight_g)}`,
    })),
    printers: (printersRes.data ?? []).map((p) => ({ id: p.id, label: p.name })),
    gcodes: (gcodesRes.data ?? []).map((g) => ({
      id: g.id,
      label: `${g.original_filename}${g.filament_weight_g != null ? ` · ~${formatGrams(g.filament_weight_g)}` : ""}`,
      suggestedName: g.original_filename.replace(/\.(gcode|gco|g)$/i, ""),
    })),
  };

  const jobs = jobsRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Print job" description="Mulai job, lalu catat berat spool setelah print untuk membandingkan estimasi dengan pemakaian nyata." />
      <NewJobForm options={options} />

      {jobsRes.error ? (
        <ErrorState message={jobsRes.error.message} />
      ) : jobs.length === 0 ? (
        <EmptyState title="Belum ada print job" hint="Mulai job pertamamu dengan memilih spool dan (opsional) file G-code." />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {jobs.map((j) => {
            const open = (j.status === "printing" || j.status === "queued") && j.actual_filament_g == null;
            const spoolName = j.spools ? j.spools.name || [j.spools.material, j.spools.color_name].filter(Boolean).join(" ") : null;
            return (
              <li key={j.id} className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{j.name}</p>
                    <p className="truncate text-xs text-stone-500">
                      {[j.project, spoolName, j.printers?.name, j.gcode_files?.original_filename].filter(Boolean).join(" · ") || "–"}
                    </p>
                  </div>
                  <JobStatusBadge status={j.status} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
                  <dt>Mulai</dt><dd className="text-right">{formatDateTime(j.started_at ?? j.created_at)}</dd>
                  <dt>Selesai</dt><dd className="text-right">{formatDateTime(j.ended_at)}</dd>
                  <dt>Estimasi filamen</dt><dd className="text-right">{formatGrams(j.est_filament_g)}</dd>
                  <dt>Estimasi durasi</dt><dd className="text-right">{formatDuration(j.est_duration_s)}</dd>
                  <dt>Pemakaian nyata</dt><dd className="text-right font-medium text-stone-900 dark:text-stone-100">{formatGrams(j.actual_filament_g)}</dd>
                  <dt>Selisih</dt>
                  <dd className="text-right">
                    {j.discrepancy_g == null ? "–" : `${j.discrepancy_g > 0 ? "+" : ""}${formatGrams(j.discrepancy_g)}${j.discrepancy_pct != null ? ` (${j.discrepancy_pct > 0 ? "+" : ""}${j.discrepancy_pct}%)` : ""}`}
                  </dd>
                </dl>
                {open && <FinishJobForm job={j} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
