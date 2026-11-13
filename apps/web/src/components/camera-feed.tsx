"use client";

import { useEffect, useState } from "react";

export function CameraFeed({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src) return <CameraPlaceholder message="No camera URL configured"/>;
  return <div className="relative flex min-h-56 items-center justify-center overflow-hidden bg-[#151a1f]">
    {failed ? <CameraPlaceholder message="Camera feed could not be reached from this device"/> : <img src={src} alt="Live printer camera feed" onError={() => setFailed(true)} className="h-full max-h-[360px] min-h-56 w-full object-contain"/>}
    <a href={src} target="_blank" rel="noreferrer" className="absolute bottom-3 right-3 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white backdrop-blur hover:bg-black/80">Open camera feed</a>
  </div>;
}
function CameraPlaceholder({ message }: { message: string }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><div className="grid size-16 place-items-center rounded-full border border-emerald-200/30 text-2xl text-emerald-200/70">Camera</div><p className="mt-4 font-mono text-xs uppercase tracking-widest text-slate-300">DroidCam</p><p className="mt-2 text-sm text-slate-400">{message}</p><p className="mt-1 text-xs text-slate-500">Keep the phone and browser on the same Wi-Fi network.</p></div>;
}
