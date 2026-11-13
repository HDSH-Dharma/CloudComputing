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
