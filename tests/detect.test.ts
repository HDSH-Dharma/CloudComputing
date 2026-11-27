import { describe, expect, it } from "vitest";
import { decide, MOTION_EPS, motionScore, STALL_SECONDS, stillSeconds, type VisionResult } from "../supabase/functions/_shared/monitor/detect.ts";

const frame = (n: number, grey: number) => Array.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 255 : grey));
const vision = (state: VisionResult["state"], confidence = 0.9): VisionResult => ({ state, failure_type: state === "failure" ? "spaghetti" : "none", confidence, reason: "x" });
const samples = (still: number, total = 60) => Array.from({ length: total + 1 }, (_, t) => ({ t, motion: t <= total - still ? 0.05 : 0 }));

describe("motionScore", () => {
  it("is 0 for identical frames and ignores small noise", () => {
    expect(motionScore(frame(100, 120), frame(100, 120))).toBe(0);
    expect(motionScore(frame(100, 120), frame(100, 130))).toBe(0);
  });
  it("counts changed pixels", () => {
    const b = frame(100, 120);
    for (let p = 0; p < 10; p++) b.fill(250, p * 4, p * 4 + 3);
    expect(motionScore(frame(100, 120), b)).toBeCloseTo(0.1);
  });
  it("returns 0 for mismatched or empty frames", () => {
    expect(motionScore([], [])).toBe(0);
    expect(motionScore(frame(2, 0), frame(3, 0))).toBe(0);
  });
});

describe("decide", () => {
  it("still time counts from the last moving sample", () => {
    expect(stillSeconds(samples(15))).toBe(15);
    expect(stillSeconds([{ t: 0, motion: MOTION_EPS / 2 }, { t: 5, motion: 0 }])).toBe(5);
  });
  it("printing while the head moves", () => {
    expect(decide(samples(0), vision("printing")).verdict).toBe("printing");
  });
  it("confident AI failure wins even while moving; low confidence does not", () => {
    expect(decide(samples(0), vision("failure")).verdict).toBe("failure");
    expect(decide(samples(0), vision("failure", 0.5)).verdict).toBe("printing");
  });
  it("no motion + finished part = success, otherwise stalled", () => {
    expect(decide(samples(STALL_SECONDS), vision("completed")).verdict).toBe("success");
    expect(decide(samples(STALL_SECONDS), vision("printing")).verdict).toBe("stalled");
    expect(decide(samples(STALL_SECONDS), null).verdict).toBe("stalled");
    expect(decide(samples(STALL_SECONDS - 1), vision("completed")).verdict).toBe("printing");
  });
});
