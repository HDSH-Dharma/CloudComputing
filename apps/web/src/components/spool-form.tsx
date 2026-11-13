"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SpoolInputSchema, TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Field, FormMessage, ghostBtn, inputClass, num, primaryBtn, str } from "./ui";

export function SpoolForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setInfo(null);
    if (!isSupabaseConfigured) { setError("Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di apps/web/.env.local."); return; }
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = SpoolInputSchema.safeParse({
      name: str(f.get("name")), material: str(f.get("material")), brand: str(f.get("brand")), color_name: str(f.get("color_name")),
      color_hex: f.get("use_color") ? str(f.get("color_hex")) : undefined,
      diameter_mm: num(f.get("diameter_mm")), density_g_cm3: num(f.get("density_g_cm3")),
      initial_net_weight_g: num(f.get("initial_net_weight_g")), tare_weight_g: num(f.get("tare_weight_g")),
      price: num(f.get("price")), currency: str(f.get("currency")), purchased_at: str(f.get("purchased_at")),
    });
    if (!parsed.success) { const issue = parsed.error.issues[0]; setError(`${issue?.path.join(".") || "Form"}: ${issue?.message ?? "input tidak valid"}`); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) { setError("Sesi masuk berakhir. Masuk kembali sebelum menambahkan spool."); router.replace("/login?next=%2Fspools"); return; }
      const { error: insertError } = await supabase.from(TABLES.spools).insert({
        name: parsed.data.name ?? null, material: parsed.data.material, brand: parsed.data.brand ?? null,
        color_name: parsed.data.color_name ?? null, color_hex: parsed.data.color_hex ?? null,
        diameter_mm: parsed.data.diameter_mm, density_g_cm3: parsed.data.density_g_cm3 ?? 1.24,
        initial_net_weight_g: parsed.data.initial_net_weight_g, tare_weight_g: parsed.data.tare_weight_g,
        price: parsed.data.price, currency: parsed.data.currency, purchased_at: parsed.data.purchased_at ?? null,
      });
      if (insertError) throw insertError;
      formEl.reset(); setInfo("Spool berhasil disimpan ke inventaris Supabase."); router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tidak dapat menyimpan spool.";
      setError(message.includes("row-level security") || message.includes("permission denied") ? "Supabase menolak penyimpanan. Pastikan migrasi RLS spool sudah diterapkan dan sesi masih aktif." : message);
    } finally { setLoading(false); }
  }
  if (!open) return <button className={primaryBtn} onClick={() => setOpen(true)}>+ Add spool</button>;
  return <form onSubmit={onSubmit} noValidate className="w-full space-y-4 rounded-2xl border border-white/10 bg-[#232a32] p-4 sm:p-5">
    <div className="flex items-center justify-between"><h2 className="font-semibold">New spool</h2><button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Close</button></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Material *" htmlFor="material"><input id="material" name="material" list="materials" defaultValue="PLA" required className={inputClass}/><datalist id="materials">{["PLA","PETG","ABS","ASA","TPU","Nylon"].map(m=><option key={m} value={m}/>)}</datalist></Field>
      <Field label="Name" htmlFor="name"><input id="name" name="name" maxLength={80} className={inputClass}/></Field>
      <Field label="Brand" htmlFor="brand"><input id="brand" name="brand" maxLength={60} className={inputClass}/></Field>
      <Field label="Color name" htmlFor="color_name"><input id="color_name" name="color_name" maxLength={40} className={inputClass}/></Field>
      <Field label="Color" htmlFor="color_hex"><div className="flex items-center gap-2"><input id="color_hex" name="color_hex" type="color" defaultValue="#ed7549" className="h-9 w-12 rounded border border-white/10 bg-transparent p-1"/><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="use_color"/> Save color</label></div></Field>
      <Field label="Diameter (mm)" htmlFor="diameter_mm"><input id="diameter_mm" name="diameter_mm" type="number" step="0.01" defaultValue={1.75} className={inputClass}/></Field>
      <Field label="Initial net weight (g) *" htmlFor="initial_net_weight_g"><input id="initial_net_weight_g" name="initial_net_weight_g" type="number" step="0.1" min="0" required className={inputClass}/></Field>
      <Field label="Empty spool weight (g)" htmlFor="tare_weight_g"><input id="tare_weight_g" name="tare_weight_g" type="number" step="0.1" min="0" defaultValue={0} className={inputClass}/></Field>
      <Field label="Density (g/cm³)" htmlFor="density_g_cm3" hint="Defaults to 1.24"><input id="density_g_cm3" name="density_g_cm3" type="number" step="0.001" min="0" className={inputClass}/></Field>
      <Field label="Price *" htmlFor="price"><input id="price" name="price" type="number" step="any" min="0" required className={inputClass}/></Field>
      <Field label="Currency" htmlFor="currency"><input id="currency" name="currency" defaultValue="IDR" maxLength={3} className={`${inputClass} uppercase`}/></Field>
      <Field label="Purchase date" htmlFor="purchased_at"><input id="purchased_at" name="purchased_at" type="date" className={inputClass}/></Field>
    </div>
    <FormMessage error={error} info={info}/><button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Saving…" : "Save spool"}</button>
  </form>;
}
