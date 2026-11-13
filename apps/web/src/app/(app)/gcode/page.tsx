import type { Metadata } from "next";
import { TABLES } from "@filamentiq/shared";
import { GcodeMetadata, GcodeStatusBadge } from "@/components/gcode-metadata";
import { GcodeUpload } from "@/components/gcode-upload";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { GcodeFileRow } from "@/lib/types";

export const metadata: Metadata = { title: "G-code" };

export default async function GcodePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLES.gcodeFiles)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<GcodeFileRow[]>();

  return (
    <div className="space-y-6">
      <PageHeader title="Upload G-code" description="Unggah file G-code untuk membaca estimasi filamen, durasi, suhu, dan layer." />
      <GcodeUpload />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Riwayat upload</h2>
        {error ? (
          <ErrorState message={error.message} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="Belum ada file G-code" hint="File yang kamu unggah akan muncul di sini." />
        ) : (
          <ul className="space-y-3">
            {data.map((f) => (
              <li key={f.id} className="rounded-xl border border-stone-200 dark:border-stone-800">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.original_filename}</p>
                      <p className="text-xs text-stone-500">
                        {formatDateTime(f.created_at)}
                        {f.parse_status === "parsed" && ` · ${formatNumber(f.filament_weight_g, "g", 1)} · ${formatDuration(f.estimated_duration_s)}`}
                      </p>
                    </div>
                    <GcodeStatusBadge status={f.parse_status} />
                  </summary>
                  <div className="border-t border-stone-100 p-4 dark:border-stone-800">
                    {f.parse_status === "parsed" ? (
                      <GcodeMetadata file={f} />
                    ) : (
                      <p className="text-sm text-red-700 dark:text-red-300">{f.parse_error ?? "Belum di-parse."}</p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
