import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Ringkasan print, stok filamen, dan biaya akan tampil di sini.
        </p>
      </header>
      <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700">
        Belum ada data. Mulai dengan menambah spool dan printer pada tahap berikutnya.
      </div>
    </div>
  );
}
