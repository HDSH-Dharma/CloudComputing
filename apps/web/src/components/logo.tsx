export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">F</span>
      FilamentIQ
    </span>
  );
}
