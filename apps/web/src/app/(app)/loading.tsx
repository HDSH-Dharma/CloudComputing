export default function Loading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      <div className="h-40 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
    </div>
  );
}
