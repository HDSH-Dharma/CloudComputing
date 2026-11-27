/**
 * POST /functions/v1/monitor-demo   { before, after, motion }  (base64 JPEG frames ~10 s apart)
 * -> VisionResult { state, failure_type, confidence, reason }
 *
 * Demo only: frames come from a video played in the browser and are not stored.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { VisionRequestSchema, type VisionResult, VisionResultSchema } from "../_shared/monitor/detect.ts";
import { withRetry } from "../_shared/assistant/retry.ts";
import { authenticate, corsHeaders, errorResponse, HttpError, json, requireEnv } from "../_shared/http.ts";

const env = (k: string) => Deno.env.get(k);
const SUPABASE_URL = requireEnv(env, "SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv(env, "SUPABASE_ANON_KEY");
const ORIGINS = (env("CORS_ORIGINS") ?? "*").split(",").map((s) => s.trim());
const MODEL = env("GEMINI_MODEL") ?? "gemini-3.8-flash";
const ai = new GoogleGenAI({ apiKey: requireEnv(env, "GEMINI_API_KEY") });

// shortcut: per-isolate limit, resets when the isolate restarts; move to a DB counter if this leaves demo use.
const PER_MINUTE = 20;
const calls = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) throw new HttpError(429, "Terlalu banyak analisis, coba lagi sebentar.");
  recent.push(now);
  calls.set(userId, recent);
}

const PROMPT = `You watch a 3D printer (FDM) through a camera. Image 1 was taken about 10 seconds before image 2.
Pixel motion between frames 1 s apart is MOTION (0-1, below 0.004 means nothing moved).
Classify image 2:
- "failure": spaghetti (loose tangled filament), part detached or knocked over, big blob on the nozzle, or layer shift.
- "completed": a finished object on the bed and the print head parked away from it, nothing printing.
- "printing": a print in progress that looks normal.
- "idle": no print on the bed or the camera shows nothing useful.
Use failure_type "none" unless state is "failure". Give confidence 0-1 and one short reason in Indonesian.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    state: { type: Type.STRING, enum: ["printing", "failure", "completed", "idle"] },
    failure_type: { type: Type.STRING, enum: ["none", "spaghetti", "detached", "blob", "layer_shift", "other"] },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING },
  },
  required: ["state", "failure_type", "confidence", "reason"],
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req, ORIGINS);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const { user } = await authenticate(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    const body = VisionRequestSchema.parse(await req.json());
    rateLimit(user.id);

    const res = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents: [{
          role: "user",
          parts: [
            { text: `${PROMPT}\nMOTION = ${body.motion.toFixed(4)}` },
            { inlineData: { mimeType: "image/jpeg", data: body.before } },
            { inlineData: { mimeType: "image/jpeg", data: body.after } },
          ],
        }],
        config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      })
    );
    let parsed: unknown;
    try { parsed = JSON.parse(res.text ?? ""); } catch { throw new HttpError(502, "AI tidak mengembalikan JSON yang valid."); }
    const result = VisionResultSchema.safeParse(parsed);
    if (!result.success) throw new HttpError(502, "Jawaban AI tidak sesuai format.", result.error.flatten());
    return json(result.data satisfies VisionResult, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
