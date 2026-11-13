import { formatBytes, formatDuration, formatNumber } from "@/lib/format";
import type { GcodeFileRow } from "@/lib/types";

const SOURCE_LABEL = { header: "dari header slicer", computed: "dihitung dari G-code", default: "nilai default" } as const;

/** Parsed G-code metadata as a definition grid. Fields not read from the header are flagged. */
export function GcodeMetadata({ file }: { file: GcodeFileRow }) {
  const src = file.metadata?.sources ?? {};
  const rows: { label: string; value: string; key?: string }[] = [
    { label: "Slicer", value: file.slicer ?? "–" },
    { label: "Jenis filamen", value: file.filament_type ?? "–", key: "filamentType" },
    { label: "Berat filamen (estimasi)", value: formatNumber(file.filament_weight_g, "g"), key: "filamentWeightG" },
    { label: "Panjang filamen", value: file.filament_length_mm == null ? "–" : `${formatNumber(file.filament_length_mm / 1000, "m")}`, key: "filamentLengthMm" },
    { label: "Durasi estimasi", value: formatDuration(file.estimated_duration_s), key: "estimatedDurationS" },
    { label: "Suhu nozzle", value: formatNumber(file.nozzle_temp_c, "°C", 0), key: "nozzleTempC" },
    { label: "Suhu bed", value: formatNumber(file.bed_temp_c, "°C", 0), key: "bedTempC" },
    { label: "Tinggi layer", value: formatNumber(file.layer_height_mm, "mm", 3), key: "layerHeightMm" },
    { label: "Tinggi layer pertama", value: formatNumber(file.first_layer_height_mm, "mm", 3), key: "firstLayerHeightMm" },
    { label: "Jumlah layer", value: formatNumber(file.layer_count, "", 0), key: "layerCount" },
    { label: "Tinggi maks (Z)", value: formatNumber(file.max_z_mm, "mm"), key: "maxZMm" },
    { label: "Diameter filamen", value: formatNumber(file.filament_diameter_mm, "mm"), key: "filamentDiameterMm" },
    { label: "Ukuran file", value: formatBytes(file.size_bytes) },
  ];

  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const s = r.key ? src[r.key] : undefined;
        return (
          <div key={r.label} className="flex justify-between gap-3 border-b border-stone-100 pb-1 dark:border-stone-800">
            <dt className="text-stone-500">{r.label}</dt>
            <dd className="text-right font-medium" title={s ? SOURCE_LABEL[s] : undefined}>
              {r.value}
              {s && s !== "header" && r.value !== "–" && <span className="ml-1 text-xs font-normal text-amber-600">*</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function GcodeStatusBadge({ status }: { status: GcodeFileRow["parse_status"] }) {
  const map = {
    parsed: ["Berhasil di-parse", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"],
    failed: ["Gagal di-parse", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"],
    pending: ["Menunggu", "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300"],
  } as const;
  const [label, cls] = map[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
