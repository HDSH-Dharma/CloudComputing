"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";

export type NavItem = { href: string; label: string; ready: boolean };

/** Flip `ready` to true as each stage's page lands. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", ready: true },
  { href: "/spools", label: "Inventaris spool", ready: false },
  { href: "/printers", label: "Printer", ready: false },
  { href: "/gcode", label: "G-code", ready: false },
  { href: "/jobs", label: "Print job", ready: false },
  { href: "/monitoring", label: "Live monitoring", ready: false },
  { href: "/assistant", label: "Asisten AI", ready: false },
  { href: "/telegram", label: "Telegram", ready: false },
];

export function AppNav({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const base = "flex items-center justify-between rounded-lg px-3 py-2 text-sm";
        if (!item.ready) {
          return (
            <span key={item.href} aria-disabled className={`${base} cursor-not-allowed text-stone-400 dark:text-stone-600`}>
              {item.label}
              <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] uppercase dark:bg-stone-800">Segera</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`${base} ${active ? "bg-brand-100 font-medium text-brand-700 dark:bg-brand-700/20 dark:text-brand-100" : "hover:bg-stone-200/60 dark:hover:bg-stone-800"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-stone-800">
      <p className="truncate px-3 text-xs text-stone-500" title={email}>{email}</p>
      <form action={signOut}>
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-200/60 dark:hover:bg-stone-800">Keluar</button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur md:hidden dark:border-stone-800 dark:bg-stone-950/90">
        <Logo />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
        >
          {open ? "Tutup" : "Menu"}
        </button>
      </header>
      {open && (
        <div id="mobile-menu" className="space-y-4 border-b border-stone-200 bg-stone-50 p-4 md:hidden dark:border-stone-800 dark:bg-stone-950">
          {links}
          {account}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-stone-200 p-4 md:flex dark:border-stone-800">
        <div className="space-y-6">
          <Logo className="px-3 text-lg" />
          {links}
        </div>
        {account}
      </aside>
    </>
  );
}
