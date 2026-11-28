"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { EDGE_FUNCTIONS, TABLES, type AssistantChatResponse, type ToolCallTrace } from "@filamentiq/shared";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { ChatSessionRow } from "@/lib/types";

export type ChatMessage = { role: "user" | "model"; text: string; tools?: ToolCallTrace[]; stepLimitReached?: boolean };
type Message = ChatMessage;
const suggestions = [
  "Which spool should I use for my next job?",
  "How much filament did I use this month?",
  "What is my average print cost per project?",
];
const toolLabels: Record<string, string> = {
  get_spool_inventory: "Checked spool inventory",
  get_print_history: "Reviewed print history",
  get_consumption_summary: "Calculated material consumption",
  get_estimate_accuracy: "Compared estimates with measured usage",
  find_gcode_files: "Searched uploaded G-code",
  recommend_spool_for_job: "Compared suitable spools",
  estimate_print_cost: "Estimated print cost",
  get_telemetry_summary: "Reviewed printer telemetry",
};

const argsText = (args: Record<string, unknown>) => {
  const text = JSON.stringify(args);
  return text === "{}" ? "" : text.length > 140 ? `${text.slice(0, 139)}…` : text;
};

export function AssistantChat({ initialSessions = [], initialSessionId, initialMessages = [] }: { initialSessions?: ChatSessionRow[]; initialSessionId?: string; initialMessages?: ChatMessage[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sessions, setSessions] = useState<ChatSessionRow[]>(initialSessions);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setError(undefined);
    setMessages((old) => [...old, { role: "user", text: message }]);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Your session expired. Sign in again to continue.");
      const { data, error: invokeError } = await supabase.functions.invoke<AssistantChatResponse>(EDGE_FUNCTIONS.assistantChat, {
        body: { ...(sessionId ? { sessionId } : {}), message },
      });
      if (invokeError) {
        if (invokeError instanceof FunctionsHttpError) {
          const body = await invokeError.context.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error ?? invokeError.message);
        }
        throw invokeError;
      }
      if (!data) throw new Error("The assistant returned an empty response. Please try again.");
      setSessionId(data.sessionId);
      setMessages((old) => [...old, { role: "model", text: data.reply, tools: data.toolCalls, stepLimitReached: data.stepLimitReached }]);
      window.history.replaceState(null, "", `/assistant?session=${data.sessionId}`);
      const list = await supabase.from(TABLES.aiChatSessions).select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30).returns<ChatSessionRow[]>();
      if (!list.error && list.data) setSessions(list.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the assistant. Please try again.");
    } finally {
      setBusy(false);
      textarea.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  }

  const history = <nav aria-label="Conversation history" className="space-y-1">
    <Link href="/assistant" className={`block rounded-lg px-3 py-2 text-sm ${!sessionId ? "bg-indigo-300/10 font-semibold text-indigo-200" : "text-slate-300 hover:bg-white/[.05]"}`}>+ New conversation</Link>
    {sessions.length === 0 ? <p className="px-3 py-2 text-xs text-slate-500">No saved conversations yet.</p> : sessions.map((s) => <Link key={s.id} href={`/assistant?session=${s.id}`} aria-current={s.id === sessionId ? "page" : undefined} className={`block rounded-lg px-3 py-2 ${s.id === sessionId ? "bg-white/[.07]" : "hover:bg-white/[.04]"}`}><span className="block truncate text-sm text-slate-200">{s.title || "Untitled conversation"}</span><span className="block text-[11px] text-slate-500">{formatDateTime(s.updated_at)}</span></Link>)}
  </nav>;
  return <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
  <aside className="rounded-2xl border border-[#343b43] bg-[#232a32] p-3 lg:self-start">
    <details className="lg:hidden"><summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-300">History ({sessions.length})</summary><div className="mt-2">{history}</div></details>
    <div className="hidden max-h-[70vh] overflow-y-auto lg:block"><p className="px-3 pb-2 pt-1 font-mono text-[11px] uppercase tracking-[.18em] text-slate-500">History</p>{history}</div>
  </aside>
  <section className="overflow-hidden rounded-2xl border border-[#343b43] bg-[#232a32] shadow-[0_14px_40px_-28px_#000]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-400/10 font-mono text-lg text-indigo-300">AI</span><div><h2 className="font-semibold">Material assistant</h2><p className="text-xs text-slate-400">Ask about your inventory, print history, and costs</p></div></div>
      {messages.length > 0 && <button type="button" onClick={() => { setMessages([]); setSessionId(undefined); setError(undefined); window.history.replaceState(null, "", "/assistant"); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[.05]">New conversation</button>}
    </header>
    <div aria-live="polite" className="max-h-[min(55vh,560px)] min-h-64 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
      {messages.length === 0 ? <div className="flex min-h-52 flex-col justify-center"><p className="text-lg font-medium">Your print data, ready to explore.</p><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">The assistant can look up your own spool inventory, G-code estimates, weigh-ins, print history, and cost summaries. It only reads data from your account.</p><div className="mt-5 flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" disabled={busy} onClick={() => void send(item)} className="rounded-full border border-white/10 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-indigo-300/40 hover:bg-indigo-300/[.07]">{item}</button>)}</div></div> : messages.map((item, index) => <article key={`${index}-${item.role}`} className={`max-w-[90%] rounded-2xl px-4 py-3 ${item.role === "user" ? "ml-auto bg-[#3a2c28] text-orange-50" : "border border-white/[.07] bg-[#1c2229] text-slate-100"}`}><p className="whitespace-pre-wrap text-sm leading-6">{item.text}</p>{item.tools && item.tools.length > 0 && <details className="mt-3 border-t border-white/[.08] pt-2"><summary className="cursor-pointer text-xs text-slate-500">Data used ({item.tools.length} lookups)</summary><ul className="mt-2 space-y-1.5">{item.tools.map((tool, i) => <li key={`${tool.name}-${i}`} className={`text-xs ${tool.ok ? "text-slate-400" : "text-red-300"}`}>{tool.ok ? "✓" : "!"} {toolLabels[tool.name] ?? tool.name}{tool.cached ? " (cached)" : ""}{tool.error ? `: ${tool.error}` : ""}{argsText(tool.args) && <code className="mt-0.5 block break-all font-mono text-[11px] text-slate-500">{argsText(tool.args)}</code>}</li>)}</ul></details>}{item.stepLimitReached && <p className="mt-3 text-xs text-amber-300">The assistant hit its lookup limit, so this answer may be incomplete. Try a narrower question.</p>}</article>)}
      {busy && <div className="max-w-[90%] rounded-2xl border border-white/[.07] bg-[#1c2229] px-4 py-3 text-sm text-slate-400">Checking your data and preparing an answer...</div>}
      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
    </div>
    <form onSubmit={onSubmit} className="border-t border-white/[.07] p-4 sm:px-6"><div className="flex items-end gap-3 rounded-xl border border-white/10 bg-[#171c21] p-2 focus-within:border-indigo-300/50"><textarea ref={textarea} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} maxLength={2000} rows={2} placeholder="Ask about spool usage, job cost, or your print history..." aria-label="Message the material assistant" className="max-h-40 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-600"/><button type="submit" disabled={busy || !draft.trim()} className="rounded-lg bg-indigo-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "..." : "Send"}</button></div><p className="mt-2 px-1 text-[11px] text-slate-500">Enter to send, Shift+Enter for a new line. Answers can be wrong; verify important measurements.</p></form>
  </section>
  </div>;
}
