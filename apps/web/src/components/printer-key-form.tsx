"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RPC } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { ApiKeySchema } from "@/lib/schemas";
import { FormMessage, ghostBtn, inputClass, primaryBtn } from "./ui";

export function PrinterKeyForm({ printerId, hasKey }: { printerId: string; hasKey: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = ApiKeySchema.safeParse(new FormData(e.currentTarget).get("api_key"));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "API key tidak valid");
    setLoading(true);
    const { error } = await createClient().rpc(RPC.setPrinterCredentials, { p_printer_id: printerId, p_api_key: parsed.data });
    setLoading(false);
    if (error) return setError(error.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button className={ghostBtn} onClick={() => setOpen(true)}>{hasKey ? "Ganti API key" : "Setel API key"}</button>;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
      <input name="api_key" type="password" autoComplete="off" required placeholder="API key baru" aria-label="API key baru" className={inputClass} />
      <FormMessage error={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </form>
  );
}
