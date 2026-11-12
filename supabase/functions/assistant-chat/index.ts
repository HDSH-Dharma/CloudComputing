/**
 * POST /functions/v1/assistant-chat   { sessionId?, message }
 * -> { sessionId, reply, toolCalls[], steps, stepLimitReached }
 *
 * Runs the Gemini function-calling loop with read-only DB tools. All queries use the
 * caller's JWT, so RLS keeps the model inside the user's own data.
 */
import type { Content } from "@google/genai";
import { AssistantChatRequestSchema, type AssistantChatResponse, TABLES } from "../_shared/contracts.ts";
import { TtlCache } from "../_shared/assistant/cache.ts";
import { createGeminiModelClient } from "../_shared/assistant/gemini.ts";
import { runAssistant } from "../_shared/assistant/loop.ts";
import { ASSISTANT_TOOLS, buildSystemInstruction, type ToolContext } from "../_shared/assistant/tools.ts";
import { authenticate, corsHeaders, errorResponse, HttpError, json, requireEnv } from "../_shared/http.ts";

const env = (k: string) => Deno.env.get(k);
const SUPABASE_URL = requireEnv(env, "SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv(env, "SUPABASE_ANON_KEY");
const ORIGINS = (env("CORS_ORIGINS") ?? "*").split(",").map((s) => s.trim());
const MAX_STEPS = Number(env("ASSISTANT_MAX_STEPS") ?? 6);
const HISTORY_MESSAGES = 20;
const RATE_LIMIT_PER_MINUTE = Number(env("ASSISTANT_RATE_LIMIT_PER_MINUTE") ?? 10);

const model = createGeminiModelClient({
  apiKey: requireEnv(env, "GEMINI_API_KEY"),
  model: env("GEMINI_MODEL") ?? "gemini-2.5-flash",
  retry: { retries: 3, onRetry: (e, n, ms) => console.warn(`gemini retry #${n} in ${Math.round(ms)}ms`, String(e)) },
});
// Lives as long as the isolate: reuses tool results across turns of the same session for 60 s.
const toolCache = new TtlCache(60_000, 1000);

Deno.serve(async (req) => {
  const cors = corsHeaders(req, ORIGINS);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const { db, user } = await authenticate(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    const body = AssistantChatRequestSchema.parse(await req.json());

    // Rate limit (DB-backed so it holds across isolates).
    const { count } = await db
      .from(TABLES.aiChatMessages)
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) throw new HttpError(429, "Too many questions — try again in a minute");

    // Session (RLS guarantees it is ours).
    let sessionId = body.sessionId;
    if (sessionId) {
      const { data } = await db.from(TABLES.aiChatSessions).select("id").eq("id", sessionId).maybeSingle();
      if (!data) throw new HttpError(404, "Chat session not found");
    } else {
      const { data, error } = await db.from(TABLES.aiChatSessions).insert({ owner_id: user.id, title: body.message.slice(0, 80) }).select("id").single();
      if (error) throw new HttpError(400, error.message);
      sessionId = data.id as string;
    }

    // Text-only history (tool traffic is not replayed — keeps prompts small).
    const { data: past } = await db
      .from(TABLES.aiChatMessages)
      .select("role,text")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })
      .limit(HISTORY_MESSAGES);
    const history: Content[] = (past ?? []).reverse().map((m) => ({ role: m.role as string, parts: [{ text: m.text as string }] }));

    const { data: profile } = await db.from(TABLES.profiles).select("timezone,currency").eq("id", user.id).maybeSingle();
    const timeZone = (profile?.timezone as string) ?? "Asia/Jakarta";
    const now = new Date();

    await db.from(TABLES.aiChatMessages).insert({ session_id: sessionId, owner_id: user.id, role: "user", text: body.message });

    const ctx: ToolContext = { db, userId: user.id, timeZone, now };
    const result = await runAssistant({
      model,
      tools: ASSISTANT_TOOLS,
      ctx,
      systemInstruction: buildSystemInstruction(now, timeZone, (profile?.currency as string) ?? "IDR"),
      history,
      userMessage: body.message,
      maxSteps: MAX_STEPS,
      cache: toolCache,
      cacheScope: `${user.id}:${sessionId}:`,
    });

    await db.from(TABLES.aiChatMessages).insert({
      session_id: sessionId,
      owner_id: user.id,
      role: "model",
      text: result.reply,
      tool_calls: result.toolCalls,
    });
    await db.from(TABLES.aiChatSessions).update({ updated_at: now.toISOString() }).eq("id", sessionId);

    const response: AssistantChatResponse = {
      sessionId: sessionId!,
      reply: result.reply,
      toolCalls: result.toolCalls,
      steps: result.steps,
      stepLimitReached: result.stepLimitReached,
    };
    return json(response, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
