import type { Metadata } from "next";
import { BUCKETS, TABLES } from "@filamentiq/shared";
import { SurveyForm } from "@/components/survey-form";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { formatDateTime, formatGrams, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SurveySampleRow } from "@/lib/types";

export const metadata: Metadata = { title: "Survey spool" };

const URL_TTL_S = 3600;

export default async function SurveyPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLES.spoolSurveySamples)
    .select("*")
    .order("measured_at", { ascending: false })
    .returns<SurveySampleRow[]>();

  const paths = (data ?? []).map((s) => s.photo_path);
  const { data: signed } = paths.length ? await supabase.storage.from(BUCKETS.spoolPhotos).createSignedUrls(paths, URL_TTL_S) : { data: [] };
  const urlOf = new Map((signed ?? []).map((u) => [u.path, u.signedUrl]));

  return (
    <div className="space-y-6">
      <PageHeader title="Survey spool" description="Timbang spool asli dan foto. Data ini jadi acuan AI untuk menaksir sisa filamen dari foto." />
      <SurveyForm />
      {error ? (
        <ErrorState message={error.message} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="Belum ada sampel" hint="Timbang spool, foto, lalu simpan sampel pertama." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => {
            const url = urlOf.get(s.photo_path);
            return (
              <li key={s.id} className="space-y-3 rounded-xl border border-white/10 p-4">
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-[#171c21]">
                  {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={`Foto spool ${[s.brand, s.material, s.color_name].filter(Boolean).join(" ")}`} className="size-full object-cover" /> : null}
                </div>
                <p className="truncate font-medium">{[s.brand, s.material, s.color_name].filter(Boolean).join(" · ")}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
                  <dt>Filamen bersih</dt><dd className="text-right font-semibold text-slate-100">{formatGrams(s.net_weight_g)}</dd>
                  <dt>Timbangan / spool kosong</dt><dd className="text-right">{formatGrams(s.gross_weight_g)} / {formatGrams(s.tare_weight_g)}</dd>
                  {s.price_per_kg != null && <><dt>Nilai sisa</dt><dd className="text-right">{formatMoney((s.net_weight_g / 1000) * s.price_per_kg, s.currency)}</dd></>}
                  <dt>Diukur</dt><dd className="text-right">{formatDateTime(s.measured_at)}</dd>
                </dl>
                {s.note && <p className="text-xs text-slate-500">{s.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
