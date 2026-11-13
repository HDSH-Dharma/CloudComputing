"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";

type NavLink = { href: string; label: string };
const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/assistant", label: "AI assistant" },
  { href: "/jobs", label: "Print jobs" },
  { href: "/spools", label: "Filament inventory" },
];
const setupLinks: NavLink[] = [
  { href: "/printers", label: "Printers" },
  { href: "/gcode", label: "G-code files" },
];
function NavGroup({ title, links, pathname, onNavigate }: { title: string; links: NavLink[]; pathname: string; onNavigate?: () => void }) {
  return <div><p className="mb-3 px-3 font-mono text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">{title}</p><nav aria-label={title} className="flex flex-col gap-1">{links.map(({ href, label }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`rounded-xl px-3.5 py-3 text-sm transition ${active ? "bg-[#3a2c28] font-semibold text-[#f18a63]" : "text-slate-400 hover:bg-white/[.04] hover:text-slate-100"}`}>{label}</Link>;
  })}</nav></div>;
}
export function AppNav({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const account = <div className="space-y-3 border-t border-white/[.08] pt-4"><div className="flex items-center gap-2 px-3 text-xs text-slate-400"><span className="size-2 rounded-full bg-emerald-400"/>Cloud sync connected</div><p className="truncate px-3 text-xs text-slate-500" title={email}>{email}</p><form action={signOut}><button className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/[.04] hover:text-white">Sign out</button></form></div>;
  return <><header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[.08] bg-[#20272f]/95 px-4 py-3 backdrop-blur md:hidden"><Logo/><button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="mobile-menu" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm">{open ? "Close" : "Menu"}</button></header>{open && <div id="mobile-menu" className="space-y-5 border-b border-white/[.08] bg-[#20272f] p-4 md:hidden"><NavGroup title="Workspace" links={mainLinks} pathname={pathname} onNavigate={() => setOpen(false)}/><NavGroup title="Setup" links={setupLinks} pathname={pathname} onNavigate={() => setOpen(false)}/>{account}</div>}<aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-white/[.08] bg-[#242b33] px-5 py-7 md:flex"><div className="space-y-9"><Logo className="px-3 text-lg"/><NavGroup title="Workspace" links={mainLinks} pathname={pathname}/><NavGroup title="Setup" links={setupLinks} pathname={pathname}/></div>{account}</aside></>;
}
