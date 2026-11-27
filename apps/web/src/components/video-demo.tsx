"use client";

import { useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { decide, EDGE_FUNCTIONS, type MotionSample, motionScore, STALL_SECONDS, type Verdict, type VisionResult } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";

const MOTION_EVERY_S = 1;
const AI_EVERY_S = 10;
const card = "rounded-2xl border border-[#343b43] bg-[#232a32] p-5";
const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  printing: { label: "Sedang print", cls: "border-sky-400/30 bg-sky-400/10 text-sky-200" },
  failure: { label: "Gagal", cls: "border-red-400/30 bg-red-400/10 text-red-200" },
  success: { label: "Sukses", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
  stalled: { label: "Berhenti / macet", cls: "border-amber-400/30 bg-amber-400/10 text-amber-200" },
};

type AiLog = VisionResult & { t: number };

/** Draws the current video frame onto a canvas of the given width and returns it. */
function grab(video: HTMLVideoElement, canvas: HTMLCanvasElement, width: number) {
  canvas.width = width;
  canvas.height = Math.round((width * video.videoHeight) / video.videoWidth) || width;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx;
}

export function VideoDemo() {
  const [src, setSrc] = useState<string>();
  const [samples, setSamples] = useState<MotionSample[]>([]);
  const [log, setLog] = useState<AiLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const video = useRef<HTMLVideoElement>(null);
  const small = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const st = useRef({ prev: null as Uint8ClampedArray | null, prevJpeg: null as string | null, lastMotion: 0, nextMotion: 0, nextAi: 0, busy: false });

  function reset(t = 0) {
    st.current = { prev: null, prevJpeg: null, lastMotion: 0, nextMotion: t, nextAi: t, busy: false };
    setSamples([]); setLog([]); setError(undefined);
  }

  async function analyse(t: number, after: string, motion: number) {
    const before = st.current.prevJpeg;
    st.current.prevJpeg = after;
    if (!before || st.current.busy) return;
    st.current.busy = true; setBusy(true);
    try {
      const { data, error: err } = await createClient().functions.invoke<VisionResult>(EDGE_FUNCTIONS.monitorDemo, { body: { before, after, motion } });
      if (err) {
        const body = err instanceof FunctionsHttpError ? await err.context.json().catch(() => null) as { error?: string } | null : null;
        throw new Error(body?.error ?? err.message);
      }
      if (data) setLog((old) => [{ ...data, t }, ...old]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisis AI gagal.");
    } finally { st.current.busy = false; setBusy(false); }
  }

  function onTime() {
    const v = video.current;
    if (!v || !small.current || !big.current || v.videoWidth === 0) return;
    const t = v.currentTime;
    if (t >= st.current.nextMotion) {
      st.current.nextMotion = t + MOTION_EVERY_S;
      const ctx = grab(v, small.current, 160);
      const px = ctx.getImageData(0, 0, small.current.width, small.current.height).data;
      const prev = st.current.prev;
      st.current.prev = px;
      if (prev) { const m = motionScore(prev, px); st.current.lastMotion = m; setSamples((old) => [...old, { t, motion: m }]); }
    }
    if (t >= st.current.nextAi) {
      st.current.nextAi = t + AI_EVERY_S;
      grab(v, big.current, 512);
      const jpeg = big.current.toDataURL("image/jpeg", 0.7).split(",")[1]!;
      void analyse(t, jpeg, st.current.lastMotion);
    }
  }

  const vision = log[0] ?? null;
  const d = decide(samples, vision);
  const lastMotion = samples.at(-1)?.motion ?? 0;

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
    <section className={`${card} space-y-4`}>
      <label className="block text-sm">
        <span className="mb-2 block text-slate-300">Pilih video printer (diputar di browser, tidak di-upload)</span>
        <input type="file" accept="video/*" className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-white"
          onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (src) URL.revokeObjectURL(src); reset(); setSrc(URL.createObjectURL(f)); }} />
      </label>
      {src && <video ref={video} src={src} controls muted playsInline onTimeUpdate={onTime} onSeeked={(e) => reset(e.currentTarget.currentTime)} className="w-full rounded-xl bg-black" />}
      <canvas ref={small} hidden /><canvas ref={big} hidden />
      <p className="text-xs text-slate-500">Tips: video dipercepat (2×) tetap bisa dipakai; deteksi memakai waktu video, bukan waktu nyata.</p>
    </section>

    <section className="space-y-4">
      <div className={`rounded-2xl border p-5 ${VERDICT[d.verdict].cls}`} aria-live="polite">
        <p className="font-mono text-xs uppercase tracking-[.18em] opacity-70">Status</p>
        <p className="mt-1 text-2xl font-semibold">{src ? VERDICT[d.verdict].label : "Belum ada video"}</p>
        {src && <p className="mt-2 text-sm opacity-90">{d.reason}</p>}
      </div>
      <dl className={`${card} grid grid-cols-2 gap-y-2 text-sm`}>
        <dt className="text-slate-400">Gerakan terakhir</dt><dd className="text-right">{(lastMotion * 100).toFixed(2)}% piksel</dd>
        <dt className="text-slate-400">Diam selama</dt><dd className="text-right">{Math.round(d.stillFor)} / {STALL_SECONDS} dtk</dd>
        <dt className="text-slate-400">Analisis AI</dt><dd className="text-right">{busy ? "Menganalisis…" : `${log.length}×`}</dd>
      </dl>
      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      <div className={card}>
        <h2 className="mb-3 font-semibold">Hasil AI per {AI_EVERY_S} dtk</h2>
        {log.length === 0 ? <p className="text-sm text-slate-500">Belum ada. AI mulai di detik ke-{AI_EVERY_S} video.</p> :
          <ul className="space-y-2 text-sm">{log.map((r) => <li key={r.t} className="border-b border-white/[.06] pb-2">
            <span className="font-mono text-xs text-slate-500">{r.t.toFixed(0)} dtk</span>{" "}
            <b>{r.state}</b>{r.failure_type !== "none" && ` (${r.failure_type})`} · {Math.round(r.confidence * 100)}%
            <p className="text-slate-400">{r.reason}</p></li>)}</ul>}
      </div>
    </section>

    <section className={`${card} space-y-2 text-sm text-slate-300 xl:col-span-2`}>
      <h2 className="font-semibold text-slate-100">Cara deteksinya</h2>
      <p><b>1. Algoritma gerakan (tanpa AI).</b> Setiap 1 dtk, frame dikecilkan ke 160 px lalu dibandingkan dengan frame sebelumnya. Piksel yang tingkat abu-abunya berubah lebih dari 25 dihitung. Kalau kurang dari 0,4% piksel berubah, berarti tidak ada gerakan. Head printer yang sedang print selalu bergerak, jadi diam {STALL_SECONDS} dtk berarti print berhenti.</p>
      <p><b>2. AI vision (Gemini).</b> Setiap {AI_EVERY_S} dtk, dua frame (sekarang dan {AI_EVERY_S} dtk sebelumnya) dikirim ke Gemini. Gemini menjawab printing / failure / completed / idle, jenis kegagalannya (spaghetti, lepas dari bed, gumpalan, layer bergeser), tingkat keyakinan, dan alasannya.</p>
      <p><b>3. Keputusan.</b> <b>Gagal</b> = AI melihat kegagalan dengan keyakinan ≥ 70%. <b>Sukses</b> = diam {STALL_SECONDS} dtk dan AI melihat objek selesai. <b>Macet</b> = diam {STALL_SECONDS} dtk tetapi objek belum selesai. Selain itu <b>sedang print</b>.</p>
    </section>
  </div>;
}
