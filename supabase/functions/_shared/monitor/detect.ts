/**
 * Print-state detection for the video demo. Pure functions: run in the browser (motion)
 * and in tests. Two signals are combined:
 *   1. Motion (algorithm): pixel difference between frames 1 s apart. A printing head
 *      always moves, so a long stretch without motion means the print stopped.
 *   2. Vision (AI): Gemini compares two frames ~10 s apart and says what it sees.
 * Rules (first match wins):
 *   - AI sees a failure (spaghetti, detached part, blob, layer shift) with confidence >= 0.7 -> failure
 *   - no motion for STALL_SECONDS and AI saw a finished part -> success
 *   - no motion for STALL_SECONDS otherwise                    -> stalled
 *   - else                                                     -> printing
 */
import { z } from "zod";

export const PIXEL_DELTA = 25; // grey-level change that counts as "this pixel changed" (camera noise is ~5-15)
export const MOTION_EPS = 0.004; // < 0.4 % changed pixels = no motion
export const STALL_SECONDS = 20; // video seconds without motion before we call it stopped
export const AI_CONFIDENCE = 0.7;

export const VisionState = z.enum(["printing", "failure", "completed", "idle"]);
export type VisionState = z.infer<typeof VisionState>;

/** JSON Gemini must return for a frame pair. */
export const VisionResultSchema = z.object({
  state: VisionState,
  failure_type: z.enum(["none", "spaghetti", "detached", "blob", "layer_shift", "other"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
});
export type VisionResult = z.infer<typeof VisionResultSchema>;

export const VisionRequestSchema = z.object({
  before: z.string().min(100).max(1_500_000), // base64 JPEG, ~10 s earlier
  after: z.string().min(100).max(1_500_000), // base64 JPEG, now
  motion: z.number().min(0).max(1),
});
export type VisionRequest = z.infer<typeof VisionRequestSchema>;

/** Fraction of pixels whose grey level changed by more than PIXEL_DELTA. Inputs are RGBA (canvas ImageData). */
export function motionScore(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const ga = 0.299 * a[i]! + 0.587 * a[i + 1]! + 0.114 * a[i + 2]!;
    const gb = 0.299 * b[i]! + 0.587 * b[i + 1]! + 0.114 * b[i + 2]!;
    if (Math.abs(ga - gb) > PIXEL_DELTA) changed++;
  }
  return changed / (a.length / 4);
}

export type Verdict = "printing" | "failure" | "success" | "stalled";
export interface MotionSample { t: number; motion: number } // t = video seconds
export interface Decision { verdict: Verdict; reason: string; stillFor: number }

/** Seconds (video time) since motion was last seen, measured from the newest sample. */
export function stillSeconds(samples: MotionSample[]): number {
  if (samples.length === 0) return 0;
  const now = samples[samples.length - 1]!.t;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i]!.motion >= MOTION_EPS) return now - samples[i]!.t;
  }
  return now - samples[0]!.t;
}

export function decide(samples: MotionSample[], vision: VisionResult | null): Decision {
  const stillFor = stillSeconds(samples);
  if (vision && vision.state === "failure" && vision.confidence >= AI_CONFIDENCE) {
    return { verdict: "failure", reason: `AI: ${vision.reason}`, stillFor };
  }
  if (stillFor >= STALL_SECONDS) {
    if (vision && vision.state === "completed" && vision.confidence >= AI_CONFIDENCE) {
      return { verdict: "success", reason: `Tidak ada gerakan ${Math.round(stillFor)} dtk dan AI melihat objek selesai: ${vision.reason}`, stillFor };
    }
    return { verdict: "stalled", reason: `Tidak ada gerakan selama ${Math.round(stillFor)} dtk tetapi print belum terlihat selesai.`, stillFor };
  }
  return { verdict: "printing", reason: "Head masih bergerak dan AI tidak melihat kegagalan.", stillFor };
}
