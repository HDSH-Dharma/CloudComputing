"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { BUCKETS, EDGE_FUNCTIONS, storagePaths } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import type { GcodeFileRow } from "@/lib/types";
import { GcodeMetadata, GcodeStatusBadge } from "./gcode-metadata";
import { FormMessage } from "./ui";

const MAX_BYTES = 200 * 1024 * 1024; // matches the `gcode` bucket limit
const EXT = /\.(gcode|gco|g)$/i;

type Phase = "idle" | "uploading" | "parsing";

export function GcodeUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GcodeFileRow | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    if (!EXT.test(file.name)) return setError("Hanya file .gcode, .gco, atau .g yang didukung.");
    if (file.size === 0) return setError("File kosong.");
    if (file.size > MAX_BYTES) return setError("Ukuran file maksimal 200 MB.");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError("Sesi habis. Silakan masuk lagi.");

    setPhase("uploading");
    const storagePath = storagePaths.gcode(user.id, crypto.randomUUID());
    const { error: upErr } = await supabase.storage.from(BUCKETS.gcode).upload(storagePath, file, { contentType: "text/plain", upsert: false });
    if (upErr) {
      setPhase("idle");
      return setError(`Upload gagal: ${upErr.message}`);
    }

    setPhase("parsing");
    const { data, error: fnErr } = await supabase.functions.invoke<GcodeFileRow>(EDGE_FUNCTIONS.gcodeParse, {
      body: { storagePath, originalFilename: file.name },
    });
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";

    if (fnErr) {
      // 422 = file stored but could not be parsed; the body is still the gcode_files row.
      if (fnErr instanceof FunctionsHttpError) {
        const body = await fnErr.context.json().catch(() => null);
        if (body && typeof body === "object" && "parse_status" in body) {
          setResult(body as GcodeFileRow);
          router.refresh();
          return;
        }
        return setError((body as { error?: string } | null)?.error ?? fnErr.message);
      }
      return setError(fnErr.message);
    }
    setResult(data);
    router.refresh();
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && phase === "idle") void handleFile(f);
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-4">
      <label
        htmlFor="gcode-file"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-8 text-center transition ${dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-700/10" : "border-stone-300 hover:border-brand-500 dark:border-stone-700"} ${busy ? "pointer-events-none opacity-70" : ""}`}
      >
        <span className="font-medium">
          {phase === "uploading" ? "Mengunggah…" : phase === "parsing" ? "Membaca metadata G-code…" : "Pilih atau seret file G-code ke sini"}
        </span>
        <span className="text-xs text-stone-500">.gcode, .gco, .g · maks 200 MB</span>
        <input
          ref={inputRef}
          id="gcode-file"
          type="file"
          accept=".gcode,.gco,.g"
          disabled={busy}
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
      </label>

      <FormMessage error={error} />

      {result && (
        <section aria-live="polite" className="space-y-3 rounded-xl border border-stone-200 p-4 sm:p-5 dark:border-stone-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="min-w-0 truncate font-semibold">{result.original_filename}</h2>
            <GcodeStatusBadge status={result.parse_status} />
          </div>
          {result.parse_status === "parsed" ? (
            <>
              <GcodeMetadata file={result} />
              <p className="text-xs text-stone-500"><span className="text-amber-600">*</span> nilai tidak ada di header slicer (dihitung atau default); arahkan kursor untuk detail.</p>
            </>
          ) : (
            <FormMessage error={result.parse_error ?? "File tersimpan tetapi tidak bisa di-parse."} />
          )}
        </section>
      )}
    </div>
  );
}
