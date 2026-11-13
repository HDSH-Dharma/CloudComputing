import type { Metadata } from "next";
import { RPC, TABLES } from "@filamentiq/shared";
import { PrinterForm } from "@/components/printer-form";
import { DroidCamConfig } from "@/components/droidcam-config";
import { PrinterKeyForm } from "@/components/printer-key-form";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { PrinterRow } from "@/lib/types";

export const metadata: Metadata = { title: "Printer" };

export default async function PrintersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLES.printers)
    .select("id,name,model,api_type,base_url,webcam_url,nozzle_diameter_mm,power_watts,is_active,last_seen_at")
    .order("created_at", { ascending: false })
    .returns<PrinterRow[]>();

  // The API key is write-only; ask the RPC whether one is stored.
  const printers = await Promise.all(
    (data ?? []).map(async (p) => {
      const { data: has } = await supabase.rpc(RPC.printerHasCredentials, { p_printer_id: p.id });
      return { ...p, hasKey: has === true };
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Setup printer" description="Daftarkan printer dan kredensial API agar monitoring bisa berjalan." />
      <PrinterForm />
      {error ? (
        <ErrorState message={error.message} />
      ) : printers.length === 0 ? (
        <EmptyState title="Belum ada printer" hint="Tambahkan printer OctoPrint, Moonraker, atau Bambu milikmu." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {printers.map((p) => (
            <li key={p.id} className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-stone-500">{[p.model, p.api_type, `nozzle ${p.nozzle_diameter_mm} mm`].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.hasKey ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                  {p.hasKey ? "API key tersimpan" : "API key belum diatur"}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
                <dt>Base URL</dt><dd className="truncate text-right" title={p.base_url}>{p.base_url}</dd>
                <dt>Daya</dt><dd className="text-right">{p.power_watts} W</dd>
                <dt>Terakhir terlihat</dt><dd className="text-right">{formatDateTime(p.last_seen_at)}</dd>
                <dt>Status</dt><dd className="text-right">{p.is_active ? "Aktif" : "Nonaktif"}</dd>
              </dl>
              <PrinterKeyForm printerId={p.id} hasKey={p.hasKey} />
              <DroidCamConfig printerId={p.id} currentUrl={p.webcam_url} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
