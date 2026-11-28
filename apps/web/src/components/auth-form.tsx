"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { authErrorMessage } from "@/lib/auth-messages";
import { EmailSchema, OtpCodeSchema } from "@/lib/schemas";
import { safeNextPath } from "@/lib/safe-redirect";

type Mode = "login" | "signup";

/** Passwordless: Supabase emails a one-time code (sent through the project's SMTP, Purelymail) and the user types it here. */
export function AuthForm({ mode, next, initialError }: { mode: Mode; next?: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null); // set once a code has been sent
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";
  const target = safeNextPath(next);

  async function sendCode(address: string) {
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      // Login never creates an account, so a typo cannot make a new one. The redirect is only
      // used if the email template still sends a link instead of a code.
      options: { shouldCreateUser: !isLogin, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
    });
    if (error) throw error;
    setEmail(address);
    setInfo("Kode sudah dikirim. Cek inbox atau folder spam.");
  }

  async function run(action: () => Promise<void>) {
    setError(null); setInfo(null);
    if (!isSupabaseConfigured) { setError("Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di apps/web/.env.local."); return; }
    setLoading(true);
    try { await action(); } catch (err) { setError(authErrorMessage(err)); } finally { setLoading(false); }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      if (!email) {
        const parsed = EmailSchema.safeParse(form.get("email") ?? "");
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Email tidak valid"); return; }
        await sendCode(parsed.data);
        return;
      }
      const parsed = OtpCodeSchema.safeParse(form.get("code") ?? "");
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Kode tidak valid"); return; }
      const { error } = await createClient().auth.verifyOtp({ email, token: parsed.data, type: "email" });
      if (error) throw error;
      router.replace(target); router.refresh();
    });
  }

  const input = "w-full rounded-lg border border-white/10 bg-[#171c21] px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30";
  const linkBtn = "font-medium text-brand-500 hover:text-brand-100 disabled:opacity-60";
  return <form onSubmit={onSubmit} className="space-y-4" noValidate>
    {!email
      ? <div key="email" className="space-y-1.5"><label htmlFor="email" className="text-sm font-medium">Email</label><input id="email" name="email" type="email" autoComplete="email" required className={input}/></div>
      : <div key="code" className="space-y-1.5">{/* own key, or React reuses the email <input> and its typed value */}
          <label htmlFor="code" className="text-sm font-medium">Kode dari email</label>
          <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required autoFocus className={`${input} font-mono tracking-[.3em]`}/>
          <p className="text-xs text-slate-400">Dikirim ke {email}. <button type="button" disabled={loading} onClick={() => void run(() => sendCode(email))} className={linkBtn}>Kirim ulang</button> · <button type="button" disabled={loading} onClick={() => { setEmail(null); setError(null); setInfo(null); }} className={linkBtn}>Ganti email</button></p>
        </div>}
    {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
    {info && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{info}</p>}
    <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">{loading ? "Memproses…" : !email ? "Kirim kode" : isLogin ? "Masuk" : "Daftar"}</button>
    <p className="text-center text-sm text-slate-400">{isLogin ? "Belum punya akun? " : "Sudah punya akun? "}<Link href={isLogin ? "/signup" : "/login"} className="font-medium text-brand-500 hover:text-brand-100">{isLogin ? "Daftar" : "Masuk"}</Link></p>
    <p className="text-center text-xs text-slate-500">Tanpa password: setiap masuk, kode sekali pakai dikirim ke emailmu.</p>
  </form>;
}
