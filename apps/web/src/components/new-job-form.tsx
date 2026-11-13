"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { NewPrintJobSchema } from "@/lib/schemas";
import { Field, FormMessage, ghostBtn, inputClass, primaryBtn, str } from "./ui";

export type JobFormOptions = {
  spools: { id: string; label: string }[];
  printers: { id: string; label: string }[];
  gcodes: { id: string; label: string; suggestedName: string }[];
};

export function NewJobForm({ options }: { options: JobFormOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = NewPrintJobSchema.safeParse({
      name,
      project: str(f.get("project")),
      spool_id: str(f.get("spool_id")),
      printer_id: str(f.get("printer_id")),
      gcode_file_id: str(f.get("gcode_file_id")),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Input tidak valid");

    setLoading(true);
    const { error } = await createClient()
      .from(TABLES.printJobs)
      .insert({ ...parsed.data, status: "printing", started_at: new Date().toISOString() });
    setLoading(false);
    if (error) return setError(error.message);
    formEl.reset();
    setName("");
    setInfo("Job dimulai. Isi berat spool setelah print selesai.");
    router.refresh();
  }

  if (!open) return <button className={primaryBtn} onClick={() => setOpen(true)}>+ Mulai print job</button>;

  return (
    <form onSubmit={onSubmit} noValidate className="w-full space-y-4 rounded-xl border border-stone-200 p-4 sm:p-5 dark:border-stone-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Print job baru</h2>
        <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Tutup</button>
      </div>
      {options.spools.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Belum ada spool. Tambahkan spool dulu di menu Inventaris spool.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="File G-code" htmlFor="gcode_file_id" hint="Estimasi filamen dan durasi diambil otomatis dari file ini.">
          <select
            id="gcode_file_id"
            name="gcode_file_id"
            defaultValue=""
            className={inputClass}
            onChange={(e) => {
              const g = options.gcodes.find((x) => x.id === e.target.value);
              if (g && !name.trim()) setName(g.suggestedName);
            }}
          >
            <option value="">Tanpa G-code</option>
            {options.gcodes.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="Nama job *" htmlFor="name">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={inputClass} />
        </Field>
        <Field label="Spool *" htmlFor="spool_id">
          <select id="spool_id" name="spool_id" defaultValue="" required className={inputClass}>
            <option value="" disabled>Pilih spool</option>
            {options.spools.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Printer" htmlFor="printer_id">
          <select id="printer_id" name="printer_id" defaultValue="" className={inputClass}>
            <option value="">Tidak dipilih</option>
            {options.printers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Proyek" htmlFor="project" hint="Dipakai untuk ringkasan pengeluaran per proyek">
          <input id="project" name="project" maxLength={80} className={inputClass} />
        </Field>
      </div>
      <FormMessage error={error} info={info} />
      <button type="submit" disabled={loading || options.spools.length === 0} className={primaryBtn}>{loading ? "Menyimpan…" : "Mulai print"}</button>
    </form>
  );
}
