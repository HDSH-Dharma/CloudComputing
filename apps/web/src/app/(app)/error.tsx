"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950">
      <h2 className="font-semibold text-red-800 dark:text-red-200">Terjadi kesalahan</h2>
      <p className="text-sm text-red-700 dark:text-red-300">{error.message || "Coba lagi sebentar."}</p>
      <button onClick={reset} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800">Coba lagi</button>
    </div>
  );
}
