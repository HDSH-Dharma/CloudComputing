import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="space-y-3">
        <p className="text-5xl font-bold text-brand-500">404</p>
        <p className="text-sm text-stone-600 dark:text-stone-400">Halaman tidak ditemukan.</p>
        <Link href="/dashboard" className="inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Ke dashboard</Link>
      </div>
    </main>
  );
}
