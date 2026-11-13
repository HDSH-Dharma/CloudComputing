import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant-chat";

export const metadata: Metadata = { title: "AI Material Assistant" };
export default function AssistantPage() {
  return <div className="mx-auto max-w-5xl space-y-6"><header><p className="font-mono text-xs font-semibold uppercase tracking-[.18em] text-indigo-300">Gemini / account-aware analysis</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">AI Material Assistant</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Ask questions about filament inventory, print estimates, actual consumption, and costs. The assistant retrieves relevant records from your account before answering.</p></header><AssistantChat/><p className="text-xs leading-5 text-slate-500">Your printer must be connected and sending telemetry before the assistant can analyze live temperatures or print progress. Vision monitoring and Telegram alerts need the separate printer polling worker.</p></div>;
}
