import type { Metadata } from "next";
import Link from "next/link";
import { TABLES } from "@filamentiq/shared";
import { MonitoringLive } from "@/components/monitoring-live";
import { EmptyState, ErrorState, ghostBtn, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { MonitoringEventRow, PrinterRow, SnapshotRow, TelemetryRow } from "@/lib/types";

export const metadata: Metadata = { title: "Live monitoring" };

const TELEMETRY_COLS = "id,captured_at,state,nozzle_temp_c,nozzle_target_c,bed_temp_c,bed_target_c,progress_pct,current_layer,total_layers,z_height_mm,time_remaining_s";

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<{ printer?: string }> }) {
  const { printer: wanted } = await searchParams;
  const supabase = await createClient();
  const { data: printers, error } = await supabase.from(TABLES.printers).select("id,name,model,is_active,last_seen_at").order("name").returns<PrinterRow[]>();
  const header = <PageHeader title="Live monitoring" description="Snapshot kamera, telemetry, dan hasil analisis AI. Hanya peringatan: print tidak pernah dibatalkan otomatis." action={<Link href="/monitoring/demo" className={ghostBtn}>Demo dari video</Link>} />;
  if (error) return <div className="space-y-6">{header}<ErrorState message={error.message} /></div>;
  if (!printers?.length) return <div className="space-y-6">{header}<EmptyState title="Belum ada printer" hint="Tambahkan printer di halaman Printers untuk mulai memantau." /></div>;

  const printer = printers.find((p) => p.id === wanted) ?? printers.find((p) => p.is_active) ?? printers[0]!;
  const [t, s, e] = await Promise.all([
    supabase.from(TABLES.telemetry).select(TELEMETRY_COLS).eq("printer_id", printer.id).order("captured_at", { ascending: false }).limit(120).returns<TelemetryRow[]>(),
    supabase.from(TABLES.snapshots).select("id,storage_path,captured_at,diff_score,ssim,analyzed").eq("printer_id", printer.id).order("captured_at", { ascending: false }).limit(1).returns<SnapshotRow[]>(),
    supabase.from(TABLES.monitoringEvents).select("id,status,confidence,reason,model,alert_sent_at,acknowledged_at,created_at").eq("printer_id", printer.id).order("created_at", { ascending: false }).limit(30).returns<MonitoringEventRow[]>(),
  ]);
  const loadError = t.error?.message ?? s.error?.message ?? e.error?.message;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        {printers.map((p) => <Link key={p.id} href={`/monitoring?printer=${p.id}`} aria-current={p.id === printer.id ? "page" : undefined} className={`rounded-xl border px-3.5 py-2 text-sm transition ${p.id === printer.id ? "border-brand-500/40 bg-brand-500/10 font-semibold text-brand-100" : "border-white/10 text-slate-400 hover:bg-white/[.04]"}`}>{p.name}</Link>)}
        <span className="ml-auto text-xs text-slate-500">Terakhir terlihat: {formatDateTime(printer.last_seen_at)}</span>
      </div>
      {loadError && <ErrorState message={loadError} />}
      <MonitoringLive key={printer.id} printerId={printer.id} initialTelemetry={[...(t.data ?? [])].reverse()} initialSnapshot={s.data?.[0] ?? null} initialEvents={e.data ?? []} />
    </div>
  );
}
