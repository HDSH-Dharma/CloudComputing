/**
 * Print-state detection for the video demo. Pure functions: run in the browser (motion)
 * and in tests. Two signals are combined:
 *   1. Motion (algorithm): pixel difference between frames 1 s apart. A printing head
 *      always moves, so a long stretch without motion means the print stopped.
 *   2. Vision (AI): Gemini compares two frames ~10 s apart and says what it sees.
 *   3. Classifier (ML, optional): a small model trained in ml/train.ipynb scores every frame in the browser.
 *      It never decides on its own: a streak of "looks like a failure" asks Gemini to check right away.
 * Rules (first match wins):
 *   - AI saw a failure (spaghetti, detached part, blob, layer shift) with confidence >= 0.7, at any point -> failure
 *   - no motion for STALL_SECONDS and AI saw a finished part -> success
 *   - no motion for STALL_SECONDS otherwise                    -> stalled
 *   - else                                                     -> printing
 */
import { z } from "zod";

export const PIXEL_DELTA = 25; // grey-level change that counts as "this pixel changed" (camera noise is ~5-15)
export const MOTION_EPS = 0.004; // < 0.4 % changed pixels = no motion
export const STALL_SECONDS = 20; // video seconds without motion before we call it stopped
export const AI_CONFIDENCE = 0.7;
export const ML_FAILURE = 0.8; // classifier failure probability that counts as "looks like a failure"
export const ML_STREAK = 3; // consecutive 1 s frames before asking Gemini early (one odd frame is not enough)

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

/** `history` is every AI result so far, newest first. */
export function decide(samples: MotionSample[], history: VisionResult[]): Decision {
  const stillFor = stillSeconds(samples);
  // A failed print never recovers, so a confident failure sticks even if a later frame looks fine.
  const failed = history.find((v) => v.state === "failure" && v.confidence >= AI_CONFIDENCE);
  if (failed) return { verdict: "failure", reason: `AI: ${failed.reason}`, stillFor };
  const vision = history[0] ?? null;
  if (stillFor >= STALL_SECONDS) {
    if (vision && vision.state === "completed" && vision.confidence >= AI_CONFIDENCE) {
      return { verdict: "success", reason: `Tidak ada gerakan ${Math.round(stillFor)} dtk dan AI melihat objek selesai: ${vision.reason}`, stillFor };
    }
    return { verdict: "stalled", reason: `Tidak ada gerakan selama ${Math.round(stillFor)} dtk tetapi print belum terlihat selesai.`, stillFor };
  }
  return { verdict: "printing", reason: "Head masih bergerak dan AI tidak melihat kegagalan.", stillFor };
}

/** True once per streak: when the last ML_STREAK failure probabilities (newest last) all pass ML_FAILURE. */
export function mlTrigger(failureProbs: number[]): boolean {
  const n = failureProbs.length;
  if (n < ML_STREAK || failureProbs.slice(-ML_STREAK).some((p) => p < ML_FAILURE)) return false;
  return n === ML_STREAK || failureProbs[n - ML_STREAK - 1]! < ML_FAILURE;
}

/** Canvas RGBA pixels -> the model's input: RGB planes (CHW), 0-1. */
export function rgbaToChw(rgba: ArrayLike<number>): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4]! / 255;
    out[n + i] = rgba[i * 4 + 1]! / 255;
    out[2 * n + i] = rgba[i * 4 + 2]! / 255;
  }
  return out;
}
