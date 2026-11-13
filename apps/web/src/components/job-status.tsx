import type { JobStatus } from "@/lib/types";

const MAP: Record<JobStatus, [string, string]> = {
  queued: ["Antre", "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300"],
  printing: ["Mencetak", "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"],
  completed: ["Selesai", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"],
  failed: ["Gagal", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"],
  cancelled: ["Dibatalkan", "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"],
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const [label, cls] = MAP[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
