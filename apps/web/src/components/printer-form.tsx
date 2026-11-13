"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RPC, TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { ApiKeySchema, PRINTER_API_TYPES, PrinterInputSchema } from "@/lib/schemas";
import { DROIDCAM_DEFAULT_URL } from "@/lib/camera";
import { Field, FormMessage, ghostBtn, inputClass, num, primaryBtn, str } from "./ui";

export function PrinterForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const formEl = e.currentTarget;
    const f = new FormData(formEl);

    const parsed = PrinterInputSchema.safeParse({
      name: f.get("name"),
      model: str(f.get("model")),
      api_type: f.get("api_type"),
      base_url: f.get("base_url"),
      webcam_url: str(f.get("webcam_url")),
      nozzle_diameter_mm: num(f.get("nozzle_diameter_mm")),
      power_watts: num(f.get("power_watts")),
    });
    const key = ApiKeySchema.safeParse(f.get("api_key"));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Input tidak valid");
    if (!key.success) return setError(key.error.issues[0]?.message ?? "API key tidak valid");

    setLoading(true);
    const supabase = createClient();
    const { data: printer, error: insertErr } = await supabase.from(TABLES.printers).insert(parsed.data).select("id").single();
    if (insertErr || !printer) {
      setLoading(false);
      setError(insertErr?.message ?? "Gagal menyimpan printer");
      return;
    }
    const { error: rpcErr } = await supabase.rpc(RPC.setPrinterCredentials, { p_printer_id: printer.id, p_api_key: key.data });
    setLoading(false);
    router.refresh();
    if (rpcErr) {
      setError(`Printer tersimpan, tapi API key gagal disimpan: ${rpcErr.message}. Setel ulang lewat tombol "Setel API key" di daftar.`);
      return;
    }
    formEl.reset();
    setInfo("Printer ditambahkan dan API key tersimpan.");
  }

  if (!open) return <button className={primaryBtn} onClick={() => setOpen(true)}>+ Tambah printer</button>;

  return (
    <form onSubmit={onSubmit} noValidate className="w-full space-y-4 rounded-xl border border-stone-200 p-4 sm:p-5 dark:border-stone-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Printer baru</h2>
        <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Tutup</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nama *" htmlFor="name"><input id="name" name="name" required maxLength={80} className={inputClass} /></Field>
        <Field label="Model" htmlFor="model"><input id="model" name="model" maxLength={80} className={inputClass} /></Field>
        <Field label="Tipe API *" htmlFor="api_type">
          <select id="api_type" name="api_type" defaultValue="octoprint" className={inputClass}>
            {PRINTER_API_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Base URL *" htmlFor="base_url" hint="URL tunnel yang bisa dijangkau dari server, mis. https://printer.example.com">
          <input id="base_url" name="base_url" type="url" required className={inputClass} />
        </Field>
        <Field label="URL webcam / DroidCam" htmlFor="webcam_url" hint="Phone and browser must be on the same Wi-Fi."><input id="webcam_url" name="webcam_url" type="url" defaultValue={DROIDCAM_DEFAULT_URL} className={inputClass} /></Field>
        <Field label="API key / access code *" htmlFor="api_key" hint="Hanya bisa ditulis, tidak bisa dibaca kembali.">
          <input id="api_key" name="api_key" type="password" autoComplete="off" required className={inputClass} />
        </Field>
        <Field label="Diameter nozzle (mm)" htmlFor="nozzle_diameter_mm"><input id="nozzle_diameter_mm" name="nozzle_diameter_mm" type="number" step="0.05" defaultValue={0.4} className={inputClass} /></Field>
        <Field label="Daya (watt)" htmlFor="power_watts" hint="Dipakai untuk menghitung biaya listrik"><input id="power_watts" name="power_watts" type="number" step="1" min="0" defaultValue={120} className={inputClass} /></Field>
      </div>
      <FormMessage error={error} info={info} />
      <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Menyimpan…" : "Simpan printer"}</button>
    </form>
  );
}
