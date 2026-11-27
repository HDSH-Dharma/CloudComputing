import { describe, expect, it } from "vitest";
import { mergeNewestFirst } from "../apps/web/src/lib/realtime-merge.ts";

const ev = (id: string, created_at: string, note = "") => ({ id, created_at, note });

describe("mergeNewestFirst", () => {
  it("adds a new row on top and keeps the newest max", () => {
    const list = [ev("b", "2026-11-28T10:00:00Z"), ev("a", "2026-11-28T09:00:00Z")];
    expect(mergeNewestFirst(list, ev("c", "2026-11-28T11:00:00Z"), 2).map((r) => r.id)).toEqual(["c", "b"]);
  });
  it("replaces an updated row instead of duplicating it", () => {
    const list = [ev("b", "2026-11-28T10:00:00Z"), ev("a", "2026-11-28T09:00:00Z")];
    const out = mergeNewestFirst(list, ev("a", "2026-11-28T09:00:00Z", "acknowledged"), 30);
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
    expect(out[1]!.note).toBe("acknowledged");
  });
});
