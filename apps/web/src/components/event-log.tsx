"use client";

import { formatDateTime } from "@/lib/format";
import { ghostBtn } from "@/components/ui";
import type { MonitoringEventRow } from "@/lib/types";

export function EventLog({ events, busyId, error, onAcknowledge }: { events: MonitoringEventRow[]; busyId: string | null; error: string | null; onAcknowledge: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">{error}</p>}
      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-600/70 p-6 text-center text-sm text-slate-400">
          Belum ada hasil analisis. Event muncul setelah Gemini Vision mengevaluasi perubahan visual pada print.
        </div>
      ) : (
        <ul className="divide-y divide-white/[.07]">
          {events.map((e) => {
            const warn = e.status === "warning";
            return (
              <li key={e.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 font-mono text-xs ${warn ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`}>{warn ? "Peringatan" : "Normal"}</span>
                    <span className="font-mono text-xs text-slate-400">keyakinan {Math.round(Number(e.confidence) * 100)}%</span>
                    {e.alert_sent_at && <span className="font-mono text-xs text-sky-300">Telegram terkirim</span>}
                    {e.acknowledged_at && <span className="font-mono text-xs text-slate-500">dikonfirmasi</span>}
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{e.reason}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}{e.model ? ` · ${e.model}` : ""}</p>
                </div>
                {warn && !e.acknowledged_at && (
                  <button type="button" disabled={busyId === e.id} onClick={() => onAcknowledge(e.id)} className={`${ghostBtn} shrink-0`}>
                    {busyId === e.id ? "Menyimpan…" : "Tandai sudah dicek"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
