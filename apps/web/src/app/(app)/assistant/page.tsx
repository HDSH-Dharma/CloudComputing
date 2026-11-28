import type { Metadata } from "next";
import { TABLES, ToolCallTraceSchema } from "@filamentiq/shared";
import { z } from "zod";
import { AssistantChat, type ChatMessage } from "@/components/assistant-chat";
import { ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessageRow, ChatSessionRow } from "@/lib/types";

export const metadata: Metadata = { title: "AI Material Assistant" };

const uuid = z.string().uuid();
const tools = z.array(ToolCallTraceSchema);

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { session } = await searchParams;
  const supabase = await createClient();
  const sessionsRes = await supabase.from(TABLES.aiChatSessions).select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30).returns<ChatSessionRow[]>();

  const wanted = uuid.safeParse(session);
  let activeId: string | undefined;
  let initial: ChatMessage[] = [];
  let historyError: string | undefined;
  if (wanted.success) {
    const msgs = await supabase.from(TABLES.aiChatMessages).select("id,role,text,tool_calls").eq("session_id", wanted.data).order("id", { ascending: true }).returns<ChatMessageRow[]>();
    if (msgs.error) historyError = msgs.error.message;
    else if (msgs.data.length) {
      activeId = wanted.data;
      initial = msgs.data.map((m) => {
        const parsed = tools.safeParse(m.tool_calls);
        return { role: m.role, text: m.text, tools: parsed.success && parsed.data.length ? parsed.data : undefined };
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-indigo-300">Gemini / account-aware analysis</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">AI Material Assistant</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Ask questions about filament inventory, print estimates, actual consumption, and costs. The assistant retrieves relevant records from your account before answering.</p>
      </header>
      {sessionsRes.error && <ErrorState message={sessionsRes.error.message} />}
      {historyError && <ErrorState message={historyError} />}
      <AssistantChat key={activeId ?? "new"} initialSessions={sessionsRes.data ?? []} initialSessionId={activeId} initialMessages={initial} />
      <p className="text-xs leading-5 text-slate-500">Your printer must be connected and sending telemetry before the assistant can analyze live temperatures or print progress. Vision monitoring and Telegram alerts need the separate printer polling worker.</p>
    </div>
  );
}
