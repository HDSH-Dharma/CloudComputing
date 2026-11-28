import type { Metadata } from "next";
import { TABLES } from "@filamentiq/shared";
import { TelegramLink } from "@/components/telegram-link";
import { ErrorState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { TelegramLinkState } from "@/lib/types";

export const metadata: Metadata = { title: "Telegram" };

export default async function TelegramPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLES.profiles).select("telegram_chat_id,telegram_linked_at").maybeSingle<TelegramLinkState>();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Notifikasi Telegram" description="Hubungkan akunmu agar peringatan dari monitoring AI dikirim ke Telegram." />
      {error ? <ErrorState message={error.message} /> : <TelegramLink initiallyLinked={data?.telegram_chat_id != null} initialLinkedAt={data?.telegram_linked_at ?? null} />}
    </div>
  );
}
