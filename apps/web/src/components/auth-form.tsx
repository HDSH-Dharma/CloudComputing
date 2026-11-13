"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CredentialsSchema } from "@/lib/schemas";
import { safeNextPath } from "@/lib/safe-redirect";

type Mode = "login" | "signup";
export function AuthForm({ mode, next, initialError }: { mode: Mode; next?: string; initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setInfo(null);
    if (!isSupabaseConfigured) { setError("Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di apps/web/.env.local."); return; }
    const form = new FormData(e.currentTarget);
    const parsed = CredentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Input tidak valid"); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const target = safeNextPath(next);
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        router.replace(target); router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` } });
        if (error) throw error;
        if (data.session) { router.replace(target); router.refresh(); }
        else setInfo("Akun berhasil dibuat. Periksa email dan klik tautan konfirmasi untuk mengaktifkannya.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.";
      setError(message.includes("Invalid login credentials") ? "Email atau kata sandi salah." : message.includes("Email not confirmed") ? "Konfirmasi emailmu sebelum masuk." : message);
    } finally { setLoading(false); }
  }
  const input = "w-full rounded-lg border border-white/10 bg-[#171c21] px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30";
  return <form onSubmit={onSubmit} className="space-y-4" noValidate>
    <div className="space-y-1.5"><label htmlFor="email" className="text-sm font-medium">Email</label><input id="email" name="email" type="email" autoComplete="email" required className={input}/></div>
    <div className="space-y-1.5"><label htmlFor="password" className="text-sm font-medium">Password</label><input id="password" name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={8} className={input}/></div>
    {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
    {info && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{info}</p>}
    <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">{loading ? "Memproses…" : isLogin ? "Masuk" : "Daftar"}</button>
    <p className="text-center text-sm text-slate-400">{isLogin ? "Belum punya akun? " : "Sudah punya akun? "}<Link href={isLogin ? "/signup" : "/login"} className="font-medium text-brand-500 hover:text-brand-100">{isLogin ? "Daftar" : "Masuk"}</Link></p>
  </form>;
}
