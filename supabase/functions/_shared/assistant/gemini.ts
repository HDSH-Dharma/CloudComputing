/** Adapter from @google/genai to the ModelClient interface used by the loop (keeps the loop testable). */
import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import type { ModelClient } from "./loop.ts";
import { type RetryOptions, withRetry } from "./retry.ts";

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  retry?: RetryOptions;
}

export function createGeminiModelClient(opts: GeminiClientOptions): ModelClient {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? "gemini-2.5-flash";
  return {
    async generate({ contents, systemInstruction, tools, allowTools }) {
      const res = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: opts.temperature ?? 0.2,
              tools: [{ functionDeclarations: tools }],
              toolConfig: {
                functionCallingConfig: { mode: allowTools ? FunctionCallingConfigMode.AUTO : FunctionCallingConfigMode.NONE },
              },
            },
          }),
        opts.retry,
      );
      const text = res.text ?? "";
      const content = res.candidates?.[0]?.content ?? { role: "model", parts: [{ text }] };
      return {
        content: { ...content, role: "model" },
        text,
        functionCalls: (res.functionCalls ?? []).map((fc) => ({ id: fc.id, name: fc.name ?? "", args: (fc.args ?? {}) as Record<string, unknown> })),
      };
    },
  };
}
