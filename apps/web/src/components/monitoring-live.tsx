"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BUCKETS, TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { EventLog } from "@/components/event-log";
import { TelemetryChart } from "@/components/telemetry-chart";
import { mergeNewestFirst } from "@/lib/realtime-merge";
import type { MonitoringEventRow, SnapshotRow, TelemetryRow } from "@/lib/types";

const POLL_MS = 10_000; // only used while the realtime connection is down
const STALE_MS = 2 * 60_000;
const URL_TTL_S = 300;
const TELEMETRY_COLS = "id,captured_at,state,nozzle_temp_c,nozzle_target_c,bed_temp_c,bed_target_c,progress_pct,current_layer,total_layers,z_height_mm,time_remaining_s";
const card = "rounded-2xl border border-[#343b43] bg-[#232a32] p-5 shadow-[0_14px_40px_-28px_#000]";

type Props = { printerId: string; initialTelemetry: TelemetryRow[]; initialSnapshot: SnapshotRow | null; initialEvents: MonitoringEventRow[] };

export function MonitoringLive({ printerId, initialTelemetry, initialSnapshot, initialEvents }: Props) {
  const [supabase] = useState(() => createClient());
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [events, setEvents] = useState(initialEvents);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [ackBusy, setAckBusy] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const signed = useRef<{ id: string; at: number } | null>(null);

  const signUrl = useCallback(async (snap: SnapshotRow | null) => {
    if (!snap) { setImageUrl(null); signed.current = null; return; }
    const cur = signed.current;
    if (cur && cur.id === snap.id && Date.now() - cur.at < (URL_TTL_S - 60) * 1000) return;
    const { data, error } = await supabase.storage.from(BUCKETS.snapshots).createSignedUrl(snap.storage_path, URL_TTL_S);
    if (error || !data) { setImageError(error?.message ?? "Gagal membuat URL snapshot"); return; }
    setImageError(null);
    signed.current = { id: snap.id, at: Date.now() };
    setImageUrl(data.signedUrl);
  }, [supabase]);

  const refresh = useCallback(async () => {
    const [t, s, e] = await Promise.all([
      supabase.from(TABLES.telemetry).select(TELEMETRY_COLS).eq("printer_id", printerId).order("captured_at", { ascending: false }).limit(120).returns<TelemetryRow[]>(),
      supabase.from(TABLES.snapshots).select("id,storage_path,captured_at,diff_score,ssim,analyzed").eq("printer_id", printerId).order("captured_at", { ascending: false }).limit(1).returns<SnapshotRow[]>(),
      supabase.from(TABLES.monitoringEvents).select("id,status,confidence,reason,model,alert_sent_at,acknowledged_at,created_at").eq("printer_id", printerId).order("created_at", { ascending: false }).limit(30).returns<MonitoringEventRow[]>(),
    ]);
    const err = t.error?.message ?? s.error?.message ?? e.error?.message ?? null;
    setPollError(err);
    setNow(Date.now());
    if (!t.error && t.data) setTelemetry([...t.data].reverse());
    if (!s.error) { const latest = s.data?.[0] ?? null; setSnapshot(latest); await signUrl(latest); }
    if (!e.error && e.data) setEvents(e.data);
  }, [supabase, printerId, signUrl]);

  useEffect(() => { void signUrl(snapshot); }, [signUrl, snapshot]);

  // Supabase Realtime: new rows arrive as soon as they are written. RLS still applies per user.
  useEffect(() => {
    const filter = `printer_id=eq.${printerId}`;
    const channel = supabase.channel(`monitoring:${printerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLES.telemetry, filter }, ({ new: row }) => {
        setTelemetry((old) => [...old, row as TelemetryRow].slice(-120));
        setNow(Date.now());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.snapshots, filter }, ({ new: row }) => {
        const snap = row as SnapshotRow;
        if (snap.id) setSnapshot((cur) => (!cur || snap.captured_at >= cur.captured_at ? snap : cur)); // deletes carry no row
      })
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.monitoringEvents, filter }, ({ new: row }) => {
        const ev = row as MonitoringEventRow;
        if (ev.id) setEvents((old) => mergeNewestFirst(old, ev, 30));
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void refresh(); // catch up on anything missed while connecting
      });
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, printerId, refresh]);

  // Fallback while realtime is down; with realtime up, only the clock ticks for the "stale" badge.
  useEffect(() => {
    const tick = () => { if (document.hidden) return; if (live) setNow(Date.now()); else void refresh(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [refresh, live]);

  async function acknowledge(id: string) {
    setAckBusy(id); setAckError(null);
    const at = new Date().toISOString();
    const { error } = await supabase.from(TABLES.monitoringEvents).update({ acknowledged_at: at }).eq("id", id);
    setAckBusy(null);
    if (error) { setAckError(error.message); return; }
    setEvents((list) => list.map((ev) => (ev.id === id ? { ...ev, acknowledged_at: at } : ev)));
  }

  const last = telemetry[telemetry.length - 1];
  const stale = !last || now - Date.parse(last.captured_at) > STALE_MS;
  const openWarnings = events.filter((e) => e.status === "warning" && !e.acknowledged_at).length;
  const stats: [string, string][] = [
    ["Status", last?.state ?? "–"],
    ["Nozzle", last?.nozzle_temp_c != null ? `${formatNumber(last.nozzle_temp_c, "°C", 1)}${last.nozzle_target_c ? ` / ${formatNumber(last.nozzle_target_c, "°C", 0)}` : ""}` : "–"],
    ["Bed", last?.bed_temp_c != null ? `${formatNumber(last.bed_temp_c, "°C", 1)}${last.bed_target_c ? ` / ${formatNumber(last.bed_target_c, "°C", 0)}` : ""}` : "–"],
    ["Layer", last?.current_layer != null ? `${last.current_layer}${last.total_layers ? ` / ${last.total_layers}` : ""}` : "–"],
    ["Progres", last?.progress_pct != null ? `${formatNumber(last.progress_pct, "%", 1)}` : "–"],
    ["Sisa waktu", formatDuration(last?.time_remaining_s)],
  ];

  return (
    <div className="space-y-5">
      {pollError && <p role="alert" className="rounded-xl border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">Gagal memperbarui data: {pollError}</p>}
      {openWarnings > 0 && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{openWarnings} peringatan belum dicek. Periksa printer dan tandai di log di bawah.</p>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map(([label, value]) => <article key={label} className={`${card} p-4`}><p className="font-mono text-xs text-slate-400">{label}</p><p className="mt-2 truncate text-lg font-semibold">{value}</p></article>)}
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <article className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Suhu</h2>
            <div className="flex gap-2">
              <span className={`rounded-full px-3 py-1 font-mono text-xs ${stale ? "bg-amber-400/10 text-amber-300" : "bg-emerald-400/10 text-emerald-300"}`}>{last ? (stale ? `Data lama · ${formatDateTime(last.captured_at)}` : "Live") : "Belum ada data"}</span>
              <span className={`rounded-full px-3 py-1 font-mono text-xs ${live ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-400/10 text-slate-400"}`} title={live ? "Data masuk lewat Supabase Realtime" : `Realtime terputus, cek ulang tiap ${POLL_MS / 1000} dtk`}>{live ? "Realtime" : "Polling"}</span>
            </div>
          </div>
          {telemetry.length ? <div className="mt-4"><TelemetryChart rows={telemetry} /></div> : <div className="mt-4 grid h-56 place-items-center rounded-xl border border-dashed border-slate-600/70 p-6 text-center text-sm text-slate-400">Belum ada telemetry. Pastikan worker pemantauan berjalan untuk printer ini.</div>}
        </article>
        <article className={`${card} overflow-hidden p-0`}>
          <div className="aspect-video w-full bg-[#171c21]">
            {imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={imageUrl} alt="Snapshot terbaru dari kamera printer" className="size-full object-cover" onError={() => { signed.current = null; setImageError("Gambar gagal dimuat."); }} /> : <div className="grid size-full place-items-center p-6 text-center text-sm text-slate-400">{snapshot ? "Memuat snapshot…" : "Belum ada snapshot dari kamera."}</div>}
          </div>
          <div className="px-5 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-slate-300">Snapshot terbaru</p>
            <p className="mt-1 text-xs text-slate-500">{snapshot ? `${formatDateTime(snapshot.captured_at)}${snapshot.diff_score != null ? ` · selisih ${(Number(snapshot.diff_score) * 100).toFixed(1)}%` : ""}${snapshot.analyzed ? " · dianalisis" : ""}` : "–"}</p>
            {imageError && <p role="alert" className="mt-2 text-xs text-red-300">{imageError}</p>}
          </div>
        </article>
      </section>
      <article className={card}>
        <p className="font-mono text-xs uppercase tracking-[.18em] text-slate-400">Gemini Vision</p>
        <h2 className="mb-4 mt-2 text-xl font-semibold">Log monitoring</h2>
        <EventLog events={events} busyId={ackBusy} error={ackError} onAcknowledge={acknowledge} />
      </article>
    </div>
  );
}
