"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BUCKETS, storagePaths, TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { Field, FormMessage, inputClass, num, primaryBtn, str } from "./ui";

const MAX_BYTES = 10 * 1024 * 1024; // matches the `spool-photos` bucket limit
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export function SurveyForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setInfo(null);
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const photo = f.get("photo");
    const gross = num(f.get("gross_weight_g"));
    const tare = num(f.get("tare_weight_g"));

    if (!(photo instanceof File) || photo.size === 0) return setError("Foto spool wajib diisi.");
    const ext = EXT[photo.type as keyof typeof EXT];
    if (!ext) return setError("Foto harus JPG, PNG, atau WebP.");
    if (photo.size > MAX_BYTES) return setError("Ukuran foto maksimal 10 MB.");
    if (gross === undefined || tare === undefined || !(gross > 0) || !(tare >= 0)) return setError("Isi berat timbangan dan berat spool kosong.");
    if (gross < tare) return setError("Berat timbangan tidak boleh lebih kecil dari berat spool kosong.");

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setError("Sesi habis. Silakan masuk lagi.");

      const id = crypto.randomUUID();
      const photoPath = storagePaths.spoolPhoto(user.id, id, ext);
      const { error: upErr } = await supabase.storage.from(BUCKETS.spoolPhotos).upload(photoPath, photo, { contentType: photo.type, upsert: false });
      if (upErr) return setError(`Upload foto gagal: ${upErr.message}`);

      const { error: insErr } = await supabase.from(TABLES.spoolSurveySamples).insert({
        id, photo_path: photoPath, gross_weight_g: gross, tare_weight_g: tare,
        material: str(f.get("material")) ?? "PLA", brand: str(f.get("brand")) ?? null, color_name: str(f.get("color_name")) ?? null,
        diameter_mm: num(f.get("diameter_mm")) ?? 1.75, price_per_kg: num(f.get("price_per_kg")) ?? null, note: str(f.get("note")) ?? null,
      });
      if (insErr) {
        // Don't leave an orphan photo behind when the row is rejected.
        await supabase.storage.from(BUCKETS.spoolPhotos).remove([photoPath]);
        return setError(insErr.message);
      }
      formEl.reset(); setInfo(`Sampel tersimpan: ${gross - tare} g filamen bersih.`); router.refresh();
    } finally { setLoading(false); }
  }

  return <form onSubmit={onSubmit} noValidate className="w-full space-y-4 rounded-2xl border border-white/10 bg-[#232a32] p-4 sm:p-5">
    <h2 className="font-semibold">Sampel baru</h2>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Foto spool *" htmlFor="photo" hint="Foto dari samping, filamen terlihat jelas"><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className={inputClass}/></Field>
      <Field label="Berat timbangan (g) *" htmlFor="gross_weight_g" hint="Spool + filamen"><input id="gross_weight_g" name="gross_weight_g" type="number" step="0.1" min="0" required className={inputClass}/></Field>
      <Field label="Berat spool kosong (g) *" htmlFor="tare_weight_g"><input id="tare_weight_g" name="tare_weight_g" type="number" step="0.1" min="0" required className={inputClass}/></Field>
      <Field label="Material" htmlFor="material"><input id="material" name="material" list="survey-materials" defaultValue="PLA" className={inputClass}/><datalist id="survey-materials">{["PLA","PETG","ABS","ASA","TPU","Nylon"].map(m=><option key={m} value={m}/>)}</datalist></Field>
      <Field label="Brand" htmlFor="brand"><input id="brand" name="brand" maxLength={60} className={inputClass}/></Field>
      <Field label="Warna" htmlFor="color_name"><input id="color_name" name="color_name" maxLength={40} className={inputClass}/></Field>
      <Field label="Diameter (mm)" htmlFor="diameter_mm"><input id="diameter_mm" name="diameter_mm" type="number" step="0.01" defaultValue={1.75} className={inputClass}/></Field>
      <Field label="Harga per kg (IDR)" htmlFor="price_per_kg"><input id="price_per_kg" name="price_per_kg" type="number" step="any" min="0" className={inputClass}/></Field>
      <Field label="Catatan" htmlFor="note"><input id="note" name="note" maxLength={200} className={inputClass}/></Field>
    </div>
    <FormMessage error={error} info={info}/>
    <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Menyimpan…" : "Simpan sampel"}</button>
  </form>;
}
