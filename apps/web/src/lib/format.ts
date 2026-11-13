export function formatMoney(value: number | null | undefined, currency = "IDR") {
  if (value == null) return "–";
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2 }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export function formatGrams(value: number | null | undefined) {
  if (value == null) return "–";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)} g`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} j ${m} m` : `${m} m`;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "–";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(value: number | null | undefined, unit = "", digits = 2) {
  if (value == null) return "–";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(value)}${unit ? ` ${unit}` : ""}`;
}
