import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TtlCache, stableStringify } from "../supabase/functions/_shared/assistant/cache.ts";
import { type ModelClient, type ModelTurn, runAssistant, STEP_LIMIT_NOTE, type ToolDef } from "../supabase/functions/_shared/assistant/loop.ts";
import { isTransientError, withRetry } from "../supabase/functions/_shared/assistant/retry.ts";
import { ASSISTANT_TOOLS, dayStartUtc, tzOffsetMinutes } from "../supabase/functions/_shared/assistant/tools.ts";

const call = (name: string, args: Record<string, unknown> = {}, id?: string): ModelTurn => ({
  content: { role: "model", parts: [{ functionCall: { name, args, id } }] },
  functionCalls: [{ name, args, id }],
  text: "",
});
const answer = (text: string): ModelTurn => ({ content: { role: "model", parts: [{ text }] }, functionCalls: [], text });

function scriptedModel(turns: ModelTurn[]) {
  const requests: Parameters<ModelClient["generate"]>[0][] = [];
  const model: ModelClient = {
    generate: vi.fn(async (req) => {
      requests.push(structuredClone(req));
      const next = turns.shift();
      if (!next) throw new Error("model called too many times");
      return next;
    }),
  };
  return { model, requests };
}

const inventory: ToolDef<{ hits: number }, { material?: string }> = {
  name: "get_spool_inventory",
  description: "x",
  parameters: { type: "object", properties: { material: { type: "string" } } },
  args: z.object({ material: z.string().optional() }),
  async run(ctx, a) {
    ctx.hits++;
    return [{ id: "s1", material: a.material ?? "PLA", remaining_weight_g: 500 }];
  },
};
const broken: ToolDef<{ hits: number }, Record<string, never>> = {
  name: "broken",
  description: "x",
  parameters: { type: "object", properties: {} },
  args: z.object({}),
  async run() {
    throw new Error("db down");
  },
};

const base = { systemInstruction: "sys", history: [], cacheScope: "user-1:" };

describe("runAssistant", () => {
  it("calls a tool, feeds the result back, and returns the model's answer", async () => {
    const { model, requests } = scriptedModel([call("get_spool_inventory", { material: "PLA" }, "c1"), answer("You have 500 g of PLA.")]);
    const ctx = { hits: 0 };
    const r = await runAssistant({ ...base, model, tools: [inventory], ctx, userMessage: "How much PLA?" });
    expect(r.reply).toBe("You have 500 g of PLA.");
    expect(r.steps).toBe(2);
    expect(r.stepLimitReached).toBe(false);
    expect(r.toolCalls).toEqual([{ name: "get_spool_inventory", args: { material: "PLA" }, cached: false, ok: true }]);
    const fnResponse = requests[1]!.contents.at(-1)!.parts![0]!.functionResponse!;
    expect(fnResponse).toMatchObject({ id: "c1", name: "get_spool_inventory", response: { result: [{ id: "s1" }] } });
  });

  it("reuses earlier tool results for identical calls (key order does not matter)", async () => {
    const cache = new TtlCache();
    const ctx = { hits: 0 };
    const { model } = scriptedModel([
      call("get_spool_inventory", { material: "PLA" }),
      call("get_spool_inventory", { material: "PLA" }),
      answer("done"),
    ]);
    const r = await runAssistant({ ...base, model, tools: [inventory], ctx, userMessage: "q", cache });
    expect(ctx.hits).toBe(1);
    expect(r.toolCalls.map((t) => t.cached)).toEqual([false, true]);
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("does not share cached results across users", async () => {
    const cache = new TtlCache();
    const ctx = { hits: 0 };
    for (const scope of ["user-1:", "user-2:"]) {
      const { model } = scriptedModel([call("get_spool_inventory", {}), answer("ok")]);
      await runAssistant({ ...base, cacheScope: scope, model, tools: [inventory], ctx, userMessage: "q", cache });
    }
    expect(ctx.hits).toBe(2);
  });

  it("returns tool errors, bad args and unknown tools to the model instead of crashing", async () => {
    const { model, requests } = scriptedModel([
      {
        content: { role: "model", parts: [] },
        functionCalls: [
          { name: "broken", args: {} },
          { name: "get_spool_inventory", args: { material: 42 } },
          { name: "drop_tables", args: {} },
        ],
        text: "",
      },
      answer("Sorry, the database is unavailable."),
    ]);
    const r = await runAssistant({ ...base, model, tools: [inventory, broken], ctx: { hits: 0 }, userMessage: "q" });
    expect(r.reply).toContain("unavailable");
    expect(r.toolCalls.map((t) => t.ok)).toEqual([false, false, false]);
    const responses = requests[1]!.contents.at(-1)!.parts!.map((p) => p.functionResponse!.response as { error: string });
    expect(responses[0]!.error).toBe("db down");
    expect(responses[1]!.error).toMatch(/Invalid arguments: material/);
    expect(responses[2]!.error).toMatch(/Unknown tool/);
  });

  it("enforces the step limit and forces a final answer with tools disabled", async () => {
    const { model, requests } = scriptedModel([
      call("get_spool_inventory", { material: "A" }),
      call("get_spool_inventory", { material: "B" }),
      answer("Best effort answer."),
    ]);
    const r = await runAssistant({ ...base, model, tools: [inventory], ctx: { hits: 0 }, userMessage: "q", maxSteps: 2 });
    expect(r.stepLimitReached).toBe(true);
    expect(r.reply).toBe("Best effort answer.");
    const last = requests[2]!;
    expect(last.allowTools).toBe(false);
    expect(last.contents.at(-1)!.parts!.at(-1)).toEqual({ text: STEP_LIMIT_NOTE });
  });
});

describe("withRetry", () => {
  const noSleep = { sleep: async () => {} };
  it("retries transient errors then succeeds", async () => {
    let n = 0;
    const r = await withRetry(async () => {
      if (++n < 3) throw Object.assign(new Error("rate limited"), { status: 429 });
      return "ok";
    }, noSleep);
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });
  it("does not retry client errors", async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw Object.assign(new Error("bad request"), { status: 400 });
      }, noSleep),
    ).rejects.toThrow("bad request");
    expect(n).toBe(1);
  });
  it("gives up after the retry budget", async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw new Error("fetch failed");
      }, { ...noSleep, retries: 2 }),
    ).rejects.toThrow("fetch failed");
    expect(n).toBe(3);
  });
  it("classifies errors", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
  });
});

describe("tool definitions", () => {
  it("have unique names and JSON schemas whose properties match the Zod args", () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of ASSISTANT_TOOLS) {
      const props = Object.keys((t.parameters as { properties: object }).properties).sort();
      let shape: z.ZodTypeAny = t.args as z.ZodTypeAny;
      while (shape instanceof z.ZodEffects) shape = shape.innerType();
      expect(Object.keys((shape as z.AnyZodObject).shape).sort(), t.name).toEqual(props);
    }
  });
  it("converts local days to UTC boundaries", () => {
    expect(tzOffsetMinutes("Asia/Jakarta", new Date("2026-11-01T00:00:00Z"))).toBe(420);
    expect(dayStartUtc("2026-11-01", "Asia/Jakarta")).toBe("2026-10-31T17:00:00.000Z");
  });
});
