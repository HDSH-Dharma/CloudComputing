import type { ReactNode } from "react";

export const inputClass = "w-full rounded-lg border border-white/10 bg-[#171c21] px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30";
export const primaryBtn = "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60";
export const ghostBtn = "rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/[.05] disabled:opacity-60";
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="text-sm text-slate-400">{description}</p>}</div>{action}</header>;
}
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center"><p className="font-medium">{title}</p>{hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return <p role="alert" className="rounded-xl border border-red-900 bg-red-950/60 p-4 text-sm text-red-200">Gagal memuat data: {message}</p>;
}
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-1"><label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>{children}{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>;
}
export function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (error) return <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">{error}</p>;
  if (info) return <p role="status" className="rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-200">{info}</p>;
  return null;
}
export function num(v: FormDataEntryValue | null): number | undefined { if (v == null || String(v).trim() === "") return undefined; return Number(String(v).replace(",", ".")); }
export function str(v: FormDataEntryValue | null): string | undefined { const s = v == null ? "" : String(v).trim(); return s === "" ? undefined : s; }
