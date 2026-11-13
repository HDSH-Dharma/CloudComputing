"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FinishPrintJobInputSchema, RPC } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { formatGrams } from "@/lib/format";
import type { PrintJobRow } from "@/lib/types";
import { Field, FormMessage, ghostBtn, inputClass, num, primaryBtn } from "./ui";

export function FinishJobForm({ job }: { job: PrintJobRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const spool = job.spools;
  // Expected scale reading = empty spool + recorded remaining filament (before this print).
  const expectedBefore = spool ? spool.tare_weight_g + spool.remaining_weight_g : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const parsed = FinishPrintJobInputSchema.safeParse({
      p_job_id: job.id,
      p_gross_weight_after_g: num(f.get("after")),
      p_status: f.get("status"),
      p_gross_weight_before_g: num(f.get("before")) ?? null,
    });
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return setError(i?.path.includes("p_gross_weight_after_g") ? "Berat setelah print wajib diisi (0–10000 g)" : (i?.message ?? "Input tidak valid"));
    }

    setLoading(true);
    const { data, error } = await createClient().rpc(RPC.finishPrintJob, parsed.data).single<PrintJobRow>();
    setLoading(false);
    if (error) return setError(error.message);

    const used = data?.actual_filament_g;
    const pct = data?.discrepancy_pct;
    setInfo(
      `Tersimpan. Terpakai ${formatGrams(used)}` +
        (job.est_filament_g != null ? ` (estimasi ${formatGrams(job.est_filament_g)}${pct != null ? `, selisih ${pct}%` : ""})` : "") + ".",
    );
    setOpen(false);
    router.refresh();
  }

  if (!job.spool_id) {
    return <p className="text-xs text-amber-700 dark:text-amber-400">Job ini belum punya spool, jadi berat tidak bisa dicatat.</p>;
  }
  if (!open) {
    return (
      <div className="space-y-2">
        <button className={primaryBtn} onClick={() => setOpen(true)}>Selesai print · input berat</button>
        <FormMessage info={info} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-lg bg-stone-100 p-3 dark:bg-stone-900">
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Timbang <b>spool beserta sisa filamen</b> (angka di timbangan, bukan berat filamen saja).
        {expectedBefore != null && <> Perkiraan sebelum print: {formatGrams(expectedBefore)} (spool kosong {formatGrams(spool?.tare_weight_g)} + sisa tercatat).</>}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Berat setelah print (g) *" htmlFor={`after-${job.id}`}>
          <input id={`after-${job.id}`} name="after" type="number" step="0.1" min="0" required autoFocus className={inputClass} />
        </Field>
        <Field label="Berat sebelum print (g)" htmlFor={`before-${job.id}`} hint="Opsional, jika kamu menimbangnya">
          <input id={`before-${job.id}`} name="before" type="number" step="0.1" min="0" className={inputClass} />
        </Field>
        <Field label="Status akhir" htmlFor={`status-${job.id}`}>
          <select id={`status-${job.id}`} name="status" defaultValue="completed" className={inputClass}>
            <option value="completed">Selesai</option>
            <option value="failed">Gagal</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </Field>
      </div>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </form>
  );
}
