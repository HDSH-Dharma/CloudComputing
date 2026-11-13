import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-stone-700 dark:bg-stone-900";
export const primaryBtn =
  "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60";
export const ghostBtn =
  "rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60 dark:border-stone-700 dark:hover:bg-stone-800";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-stone-600 dark:text-stone-400">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center dark:border-stone-700">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      Gagal memuat data: {message}
    </p>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (info) return <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{info}</p>;
  return null;
}

/** "" -> undefined, otherwise Number (NaN stays NaN so Zod reports it). */
export function num(v: FormDataEntryValue | null): number | undefined {
  if (v == null || String(v).trim() === "") return undefined;
  return Number(String(v).replace(",", "."));
}
/** "" -> undefined, otherwise trimmed string. */
export function str(v: FormDataEntryValue | null): string | undefined {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? undefined : s;
}
