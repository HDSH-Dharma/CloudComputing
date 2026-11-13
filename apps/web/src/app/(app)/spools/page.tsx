import type { Metadata } from "next";
import { VIEWS } from "@filamentiq/shared";
import { SpoolForm } from "@/components/spool-form";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { formatDateTime, formatGrams, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SpoolInventoryRow } from "@/lib/types";

export const metadata: Metadata = { title: "Inventaris spool" };

export default async function SpoolsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(VIEWS.spoolInventory)
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<SpoolInventoryRow[]>();

  return (
    <div className="space-y-6">
      <PageHeader title="Inventaris spool" description="Stok filamen, nilai sisa, dan akurasi estimasi per spool." />
      <SpoolForm />
      {error ? (
        <ErrorState message={error.message} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="Belum ada spool" hint="Tambahkan spool pertamamu untuk mulai melacak pemakaian filamen." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => {
            const pct = Math.max(0, Math.min(100, s.remaining_pct ?? 0));
            const low = pct < 15;
            return (
              <li key={s.id} className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 size-8 shrink-0 rounded-full border border-stone-300 dark:border-stone-700"
                    style={{ background: s.color_hex ?? "transparent" }}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name || [s.brand, s.color_name].filter(Boolean).join(" ") || s.material}</p>
                    <p className="truncate text-xs text-stone-500">
                      {[s.material, s.brand, s.color_name, `${s.diameter_mm} mm`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{formatGrams(s.remaining_weight_g)} <span className="text-stone-500">/ {formatGrams(s.initial_net_weight_g)}</span></span>
                    <span className={low ? "font-semibold text-red-600" : "text-stone-500"}>{s.remaining_pct ?? 0}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Sisa filamen">
                    <div className={`h-full ${low ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
                  <dt>Nilai sisa</dt><dd className="text-right">{formatMoney(s.remaining_value, s.currency)}</dd>
                  <dt>Harga/gram</dt><dd className="text-right">{formatMoney(s.price_per_gram, s.currency)}</dd>
                  <dt>Jumlah job</dt><dd className="text-right">{s.jobs_count}</dd>
                  <dt>Selisih rata-rata</dt><dd className="text-right">{s.avg_discrepancy_pct == null ? "–" : `${s.avg_discrepancy_pct}%`}</dd>
                  <dt>Terakhir ditimbang</dt><dd className="text-right">{formatDateTime(s.last_weighed_at)}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
