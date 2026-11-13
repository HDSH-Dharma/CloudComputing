"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SpoolInputSchema, TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { Field, FormMessage, ghostBtn, inputClass, num, primaryBtn, str } from "./ui";

export function SpoolForm() {
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

    const parsed = SpoolInputSchema.safeParse({
      name: str(f.get("name")),
      material: str(f.get("material")),
      brand: str(f.get("brand")),
      color_name: str(f.get("color_name")),
      color_hex: f.get("use_color") ? str(f.get("color_hex")) : undefined,
      diameter_mm: num(f.get("diameter_mm")),
      density_g_cm3: num(f.get("density_g_cm3")),
      initial_net_weight_g: num(f.get("initial_net_weight_g")),
      tare_weight_g: num(f.get("tare_weight_g")),
      price: num(f.get("price")),
      currency: str(f.get("currency")),
      purchased_at: str(f.get("purchased_at")),
    });
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      setError(`${i?.path.join(".") || "Form"}: ${i?.message ?? "input tidak valid"}`);
      return;
    }

    setLoading(true);
    const { error } = await createClient().from(TABLES.spools).insert(parsed.data);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    formEl.reset();
    setInfo("Spool ditambahkan.");
    router.refresh();
  }

  if (!open) {
    return <button className={primaryBtn} onClick={() => setOpen(true)}>+ Tambah spool</button>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="w-full space-y-4 rounded-xl border border-stone-200 p-4 sm:p-5 dark:border-stone-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Spool baru</h2>
        <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Tutup</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Material *" htmlFor="material">
          <input id="material" name="material" list="materials" defaultValue="PLA" required className={inputClass} />
          <datalist id="materials">{["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon"].map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Nama" htmlFor="name"><input id="name" name="name" maxLength={80} className={inputClass} /></Field>
        <Field label="Merek" htmlFor="brand"><input id="brand" name="brand" maxLength={60} className={inputClass} /></Field>
        <Field label="Nama warna" htmlFor="color_name"><input id="color_name" name="color_name" maxLength={40} className={inputClass} /></Field>
        <Field label="Kode warna" htmlFor="color_hex">
          <div className="flex items-center gap-2">
            <input id="color_hex" name="color_hex" type="color" defaultValue="#f26a1b" className="h-9 w-12 rounded border border-stone-300 bg-transparent p-1 dark:border-stone-700" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="use_color" /> Simpan warna</label>
          </div>
        </Field>
        <Field label="Diameter (mm)" htmlFor="diameter_mm"><input id="diameter_mm" name="diameter_mm" type="number" step="0.01" defaultValue={1.75} className={inputClass} /></Field>
        <Field label="Berat bersih awal (g) *" htmlFor="initial_net_weight_g" hint="Isi filamen saja, mis. 1000">
          <input id="initial_net_weight_g" name="initial_net_weight_g" type="number" step="0.1" min="0" required className={inputClass} />
        </Field>
        <Field label="Berat spool kosong (g)" htmlFor="tare_weight_g" hint="Untuk menghitung berat bersih dari timbangan">
          <input id="tare_weight_g" name="tare_weight_g" type="number" step="0.1" min="0" defaultValue={0} className={inputClass} />
        </Field>
        <Field label="Densitas (g/cm³)" htmlFor="density_g_cm3" hint="Kosongkan untuk default 1,24">
          <input id="density_g_cm3" name="density_g_cm3" type="number" step="0.001" min="0" className={inputClass} />
        </Field>
        <Field label="Harga *" htmlFor="price"><input id="price" name="price" type="number" step="any" min="0" required className={inputClass} /></Field>
        <Field label="Mata uang" htmlFor="currency"><input id="currency" name="currency" defaultValue="IDR" maxLength={3} className={`${inputClass} uppercase`} /></Field>
        <Field label="Tanggal beli" htmlFor="purchased_at"><input id="purchased_at" name="purchased_at" type="date" className={inputClass} /></Field>
      </div>
      <FormMessage error={error} info={info} />
      <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Menyimpan…" : "Simpan spool"}</button>
    </form>
  );
}
