/**
 * POST /functions/v1/gcode-parse   { storagePath, originalFilename }
 *
 * Flow: browser uploads the file to Storage bucket `gcode` at `{uid}/{uuid}.gcode`
 * (storage RLS enforces the uid prefix), then calls this function. We stream the file,
 * extract metadata, and upsert a `gcode_files` row — all as the caller, under RLS.
 */
import { BUCKETS, GcodeMetadataSchema, GcodeParseRequestSchema, storagePaths, TABLES } from "../_shared/contracts.ts";
import { parseGcodeStream } from "../_shared/gcode/parser.ts";
import { authenticate, corsHeaders, errorResponse, HttpError, json, requireEnv } from "../_shared/http.ts";

const env = (k: string) => Deno.env.get(k);
const SUPABASE_URL = requireEnv(env, "SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv(env, "SUPABASE_ANON_KEY");
const ORIGINS = (env("CORS_ORIGINS") ?? "*").split(",").map((s) => s.trim());
const HASH_LIMIT_BYTES = 50 * 1024 * 1024;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req, ORIGINS);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const { db, user } = await authenticate(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    const body = GcodeParseRequestSchema.parse(await req.json());
    if (!storagePaths.isOwnedBy(body.storagePath, user.id)) throw new HttpError(403, "storagePath must start with your user id");
    if (!/\.(gcode|gco|g)$/i.test(body.originalFilename)) throw new HttpError(400, "Only .gcode / .gco / .g files are supported");

    const { data: blob, error } = await db.storage.from(BUCKETS.gcode).download(body.storagePath);
    if (error || !blob) throw new HttpError(404, "File not found in storage");

    const base = {
      owner_id: user.id,
      storage_path: body.storagePath,
      original_filename: body.originalFilename,
      size_bytes: blob.size,
      sha256: blob.size <= HASH_LIMIT_BYTES ? await sha256Hex(await blob.arrayBuffer()) : null,
    };

    let row: Record<string, unknown>;
    try {
      const meta = GcodeMetadataSchema.parse(await parseGcodeStream(blob.stream()));
      if (meta.filamentLengthMm == null && meta.filamentWeightG == null) throw new Error("No extrusion found — is this a G-code file?");
      row = {
        ...base,
        parse_status: "parsed",
        parse_error: null,
        slicer: meta.slicer,
        filament_type: meta.filamentType,
        filament_length_mm: meta.filamentLengthMm,
        filament_weight_g: meta.filamentWeightG,
        filament_diameter_mm: meta.filamentDiameterMm,
        filament_density: meta.filamentDensity,
        estimated_duration_s: meta.estimatedDurationS,
        nozzle_temp_c: meta.nozzleTempC,
        bed_temp_c: meta.bedTempC,
        layer_height_mm: meta.layerHeightMm,
        first_layer_height_mm: meta.firstLayerHeightMm,
        layer_count: meta.layerCount,
        max_z_mm: meta.maxZMm,
        metadata: meta,
      };
    } catch (e) {
      row = { ...base, parse_status: "failed", parse_error: e instanceof Error ? e.message : String(e) };
    }

    const { data, error: dbError } = await db.from(TABLES.gcodeFiles).upsert(row, { onConflict: "storage_path" }).select().single();
    if (dbError) throw new HttpError(400, dbError.message);
    return json(data, row.parse_status === "parsed" ? 200 : 422, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
