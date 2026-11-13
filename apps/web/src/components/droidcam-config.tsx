"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TABLES } from "@filamentiq/shared";
import { DROIDCAM_DEFAULT_URL } from "@/lib/camera";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "./ui";

export function DroidCamConfig({ printerId, currentUrl }: { printerId: string; currentUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(currentUrl || DROIDCAM_DEFAULT_URL);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    let parsed: URL;
    try { parsed = new URL(url); } catch { setMessage("Enter a valid camera URL."); return; }
    if (!["http:", "https:"].includes(parsed.protocol)) { setMessage("Camera URL must use HTTP or HTTPS."); return; }
    setBusy(true);
    const { error } = await createClient().from(TABLES.printers).update({ webcam_url: parsed.toString() }).eq("id", printerId);
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Camera URL saved."); router.refresh();
  }
  return <form onSubmit={save} className="mt-4 space-y-2 border-t border-white/[.07] pt-4">
    <label htmlFor={`droidcam-${printerId}`} className="block text-xs font-medium text-slate-300">DroidCam stream URL</label>
    <div className="flex flex-wrap gap-2"><input id={`droidcam-${printerId}`} value={url} onChange={event => setUrl(event.target.value)} className={`${inputClass} min-w-0 flex-1`} placeholder={DROIDCAM_DEFAULT_URL}/><button type="submit" disabled={busy} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Saving..." : "Save camera"}</button></div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Default: 10.0.178.164, port 4747, /video. Same Wi-Fi required.</span><a href={url} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-100">Test stream</a></div>
    {message && <p role="status" className="text-xs text-slate-300">{message}</p>}
  </form>;
}
