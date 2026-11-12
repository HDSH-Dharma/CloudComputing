/**
 * Gemini function-calling loop for the AI Material Usage Assistant.
 *  - hard limit on model steps per interaction (maxSteps)
 *  - identical tool calls reuse earlier results (TtlCache, scoped per user/session)
 *  - tool arguments validated with Zod; tool errors are returned to the model, not thrown
 *  - transient model errors are retried inside the ModelClient (see gemini.ts / retry.ts)
 */
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import type { z } from "zod";
import type { ToolCallTrace } from "../contracts.ts";
import { stableStringify, TtlCache } from "./cache.ts";

export interface FunctionCallLike {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ModelTurn {
  content: Content;
  functionCalls: FunctionCallLike[];
  text: string;
}

export interface ModelRequest {
  contents: Content[];
  systemInstruction: string;
  tools: FunctionDeclaration[];
  allowTools: boolean;
}

export interface ModelClient {
  generate(req: ModelRequest): Promise<ModelTurn>;
}

export interface ToolDef<Ctx, A = any> {
  name: string;
  description: string;
  /** JSON Schema for Gemini (keep in sync with `args`) */
  parameters: Record<string, unknown>;
  args: z.ZodType<A, z.ZodTypeDef, unknown>;
  run(ctx: Ctx, args: A): Promise<unknown>;
}

export interface RunAssistantOptions<Ctx> {
  model: ModelClient;
  tools: ToolDef<Ctx>[];
  ctx: Ctx;
  systemInstruction: string;
  history: Content[];
  userMessage: string;
  maxSteps?: number;
  maxCallsPerStep?: number;
  cache?: TtlCache;
  /** prefix for cache keys — use `${userId}:` so users never share results */
  cacheScope: string;
}

export interface RunAssistantResult {
  reply: string;
  steps: number;
  stepLimitReached: boolean;
  toolCalls: ToolCallTrace[];
  contents: Content[];
}

export const STEP_LIMIT_NOTE =
  "SYSTEM NOTE: the tool-call budget for this question is used up. Answer now using only the data you already have. " +
  "If something is missing, say what is missing instead of guessing.";

const EMPTY_REPLY = "Maaf, saya belum bisa menjawab pertanyaan itu. Coba ulangi dengan kata lain. (Sorry, I couldn't produce an answer.)";

export function toolDeclarations<Ctx>(tools: ToolDef<Ctx>[]): FunctionDeclaration[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export async function runAssistant<Ctx>(opts: RunAssistantOptions<Ctx>): Promise<RunAssistantResult> {
  const { model, tools, ctx, systemInstruction, userMessage, maxSteps = 6, maxCallsPerStep = 8, cacheScope } = opts;
  const cache = opts.cache ?? new TtlCache();
  const byName = new Map(tools.map((t) => [t.name, t]));
  const decls = toolDeclarations(tools);
  const contents: Content[] = [...opts.history, { role: "user", parts: [{ text: userMessage }] }];
  const traces: ToolCallTrace[] = [];

  async function execute(call: FunctionCallLike): Promise<Part> {
    const tool = byName.get(call.name);
    const respond = (response: Record<string, unknown>): Part => ({
      functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response },
    });
    if (!tool) {
      traces.push({ name: call.name, args: call.args ?? {}, cached: false, ok: false, error: "unknown tool" });
      return respond({ error: `Unknown tool "${call.name}". Available: ${[...byName.keys()].join(", ")}` });
    }
    const parsed = tool.args.safeParse(call.args ?? {});
    if (!parsed.success) {
      const error = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      traces.push({ name: call.name, args: call.args ?? {}, cached: false, ok: false, error });
      return respond({ error: `Invalid arguments: ${error}` });
    }
    const key = `${cacheScope}${call.name}:${stableStringify(parsed.data)}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      traces.push({ name: call.name, args: parsed.data as Record<string, unknown>, cached: true, ok: true });
      return respond({ result: hit });
    }
    try {
      const result = await tool.run(ctx, parsed.data);
      cache.set(key, result);
      traces.push({ name: call.name, args: parsed.data as Record<string, unknown>, cached: false, ok: true });
      return respond({ result });
    } catch (e) {
      traces.push({ name: call.name, args: parsed.data as Record<string, unknown>, cached: false, ok: false, error: errMessage(e) });
      return respond({ error: errMessage(e) });
    }
  }

  let steps = 0;
  while (steps < maxSteps) {
    steps++;
    const turn = await model.generate({ contents, systemInstruction, tools: decls, allowTools: true });
    contents.push(turn.content);
    if (turn.functionCalls.length === 0) {
      return { reply: turn.text.trim() || EMPTY_REPLY, steps, stepLimitReached: false, toolCalls: traces, contents };
    }
    const calls = turn.functionCalls.slice(0, maxCallsPerStep);
    const parts = await Promise.all(calls.map(execute));
    for (const skipped of turn.functionCalls.slice(maxCallsPerStep)) {
      parts.push({ functionResponse: { ...(skipped.id ? { id: skipped.id } : {}), name: skipped.name, response: { error: "Skipped: too many parallel calls in one step." } } });
    }
    contents.push({ role: "user", parts });
  }

  // Step budget exhausted: one last call with tools disabled to force an answer.
  const last = contents[contents.length - 1]!;
  const finalContents: Content[] = [...contents.slice(0, -1), { ...last, parts: [...(last.parts ?? []), { text: STEP_LIMIT_NOTE }] }];
  const final = await model.generate({ contents: finalContents, systemInstruction, tools: decls, allowTools: false });
  contents.push(final.content);
  return { reply: final.text.trim() || EMPTY_REPLY, steps: steps + 1, stepLimitReached: true, toolCalls: traces, contents };
}
