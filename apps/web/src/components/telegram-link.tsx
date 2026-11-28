"use client";

import { useCallback, useEffect, useState } from "react";
import { RPC, TABLES } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import { LINK_CODE_TTL_MS, TELEGRAM_BOT_USERNAME, botLink, startCommand } from "@/lib/telegram";
import { FormMessage, ghostBtn, primaryBtn } from "@/components/ui";
import type { TelegramLinkState } from "@/lib/types";

const card = "rounded-2xl border border-[#343b43] bg-[#232a32] p-5 shadow-[0_14px_40px_-28px_#000] sm:p-6";
const POLL_MS = 5_000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function TelegramLink({ initialLinkedAt, initiallyLinked }: { initiallyLinked: boolean; initialLinkedAt: string | null }) {
  const [supabase] = useState(() => createClient());
  const [linked, setLinked] = useState(initiallyLinked);
  const [linkedAt, setLinkedAt] = useState(initialLinkedAt);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<"create" | "unlink" | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const expired = code != null && now >= expiresAt;
  const waiting = code != null && !expired && !linked;

  const checkLink = useCallback(async () => {
    const { data, error: err } = await supabase.from(TABLES.profiles).select("telegram_chat_id,telegram_linked_at").maybeSingle<TelegramLinkState>();
    if (err) return false;
    if (data?.telegram_chat_id != null) {
      setLinked(true);
      setLinkedAt(data.telegram_linked_at);
      setCode(null);
      setInfo("Telegram berhasil terhubung.");
      return true;
    }
    return false;
  }, [supabase]);

  useEffect(() => {
    if (!code) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [code]);

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => { if (!document.hidden) void checkLink(); }, POLL_MS);
    return () => clearInterval(poll);
  }, [waiting, checkLink]);

  async function createCode() {
    setBusy("create"); setError(null); setInfo(null); setCopied(false);
    const { data, error: err } = await supabase.rpc(RPC.createTelegramLinkToken);
    setBusy(null);
    if (err || typeof data !== "string" || !data) { setError(err?.message ?? "Gagal membuat kode. Coba lagi."); return; }
    const t = Date.now();
    setNow(t); setExpiresAt(t + LINK_CODE_TTL_MS); setCode(data);
  }

  async function unlink() {
    setBusy("unlink"); setError(null); setInfo(null);
    const { error: err } = await supabase.rpc(RPC.unlinkTelegram);
    setBusy(null); setConfirmUnlink(false);
    if (err) { setError(err.message); return; }
    setLinked(false); setLinkedAt(null); setCode(null);
    setInfo("Telegram diputus. Peringatan tidak akan dikirim lagi.");
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Tidak bisa menyalin otomatis. Salin kode secara manual."); }
  }

  return (
    <div className="space-y-4">
      <FormMessage error={error} info={info} />
      {linked ? (
        <article className={card}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 font-mono text-xs text-emerald-300">Terhubung</span>
              <h2 className="mt-3 text-xl font-semibold">Peringatan dikirim ke Telegram</h2>
              <p className="mt-1 text-sm text-slate-400">Terhubung sejak {formatDateTime(linkedAt)}. Kamu menerima pesan saat AI mendeteksi masalah pada print.</p>
            </div>
            {confirmUnlink ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={unlink} disabled={busy === "unlink"} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60">{busy === "unlink" ? "Memutus…" : "Ya, putuskan"}</button>
                <button type="button" onClick={() => setConfirmUnlink(false)} disabled={busy === "unlink"} className={ghostBtn}>Batal</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmUnlink(true)} className={ghostBtn}>Putuskan Telegram</button>
            )}
          </div>
        </article>
      ) : (
        <article className={card}>
          <span className="rounded-full bg-slate-700/60 px-3 py-1 font-mono text-xs text-slate-300">Belum terhubung</span>
          <h2 className="mt-3 text-xl font-semibold">Hubungkan akun Telegram</h2>
          <p className="mt-1 text-sm text-slate-400">Terima peringatan saat AI mencurigai kegagalan print. Hanya peringatan: print tidak pernah dibatalkan otomatis.</p>

          {!code || expired ? (
            <div className="mt-5 space-y-3">
              {expired && <p role="status" className="text-sm text-amber-300">Kode sudah kedaluwarsa. Buat kode baru.</p>}
              <button type="button" onClick={createCode} disabled={busy === "create"} className={primaryBtn}>{busy === "create" ? "Membuat kode…" : expired ? "Buat kode baru" : "Buat kode tautan"}</button>
            </div>
          ) : (
            <ol className="mt-5 space-y-5 text-sm">
              <li>
                <p className="font-medium">1. Buka bot di Telegram</p>
                <p className="mt-1 text-slate-400">
                  {TELEGRAM_BOT_USERNAME ? <>Cari <span className="font-mono text-slate-200">@{TELEGRAM_BOT_USERNAME}</span>{botLink(code) && <> atau <a href={botLink(code)!} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-500 hover:text-brand-100">buka langsung</a></>}.</> : "Cari bot FilamentIQ di Telegram (tanyakan username bot ke tim jika belum tahu)."}
                </p>
              </li>
              <li>
                <p className="font-medium">2. Kirim perintah ini ke bot</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <code aria-label="Perintah untuk bot" className="rounded-lg border border-white/10 bg-[#171c21] px-4 py-3 font-mono text-lg tracking-wider">{startCommand(code)}</code>
                  <button type="button" onClick={() => copy(startCommand(code))} className={ghostBtn}>{copied ? "Tersalin" : "Salin"}</button>
                </div>
              </li>
              <li>
                <p className="font-medium">3. Tunggu konfirmasi</p>
                <p aria-live="polite" className="mt-1 text-slate-400">Menunggu bot… kode berlaku <span className="font-mono text-slate-200">{mmss(expiresAt - now)}</span> lagi. Halaman ini otomatis berubah saat tersambung.</p>
                <button type="button" onClick={() => void checkLink()} className={`${ghostBtn} mt-3`}>Cek sekarang</button>
              </li>
            </ol>
          )}
        </article>
      )}
    </div>
  );
}
