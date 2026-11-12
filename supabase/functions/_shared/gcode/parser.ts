/**
 * Streaming G-code metadata parser.
 *
 * Strategy: trust the slicer's own header/footer comments first (PrusaSlicer, OrcaSlicer,
 * Bambu Studio, Cura, SuperSlicer), then fill gaps by simulating the moves
 * (extrusion, Z levels, temperatures, feedrate-based time). Every field records its source.
 *
 * Works line-by-line so large files never need to be held in memory:
 *   const p = new GcodeParser(); for (const line of lines) p.feedLine(line); p.result();
 */
import type { FieldSource, GcodeMetadata } from "../contracts.ts";
import { DEFAULT_DIAMETER_MM, densityFor, filamentGramsToMm, filamentMmToGrams, round } from "../ledger.ts";

/** "1d 2h 3m 4s" | "2h 3m" | "45m 12s" | "3600" -> seconds */
export function parseDurationToSeconds(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(re)) {
    matched = true;
    const v = Number(m[1]);
    total += m[2] === "d" ? v * 86400 : m[2] === "h" ? v * 3600 : m[2] === "m" ? v * 60 : v;
  }
  return matched ? Math.round(total) : null;
}

/** "1234.5, 0.0" -> 1234.5 (multi-extruder lists are summed) */
function sumNumberList(v: string | undefined): number | null {
  if (v == null) return null;
  const nums = v
    .split(/[,;]/)
    .map((x) => Number.parseFloat(x))
    .filter((x) => Number.isFinite(x));
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

function firstNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number.parseFloat(v.split(/[,;]/)[0] ?? "");
  return Number.isFinite(n) ? n : null;
}

const normKey = (k: string) => k.trim().toLowerCase().replace(/\s+/g, " ");

export class GcodeParser {
  private header = new Map<string, string>();
  private slicer: string | null = null;
  private lineCount = 0;

  // machine state
  private absPos = true;
  private relE = false;
  private pos = { X: 0, Y: 0, Z: 0, E: 0 };
  private feed = 1500; // mm/min
  private extrudedMm = 0;
  private timeS = 0;
  private m73FirstRemainingMin: number | null = null;

  // layers
  private layerZs: number[] = [];
  private maxZ = 0;

  // temperatures (first non-zero targets)
  private firstNozzle: number | null = null;
  private firstBed: number | null = null;

  feedLine(rawLine: string): void {
    this.lineCount++;
    const line = rawLine.trim();
    if (!line) return;

    const semi = line.indexOf(";");
    if (semi === 0) {
      this.parseComment(line.slice(1).trim());
      return;
    }
    const code = (semi > 0 ? line.slice(0, semi) : line).trim().toUpperCase();
    if (code) this.parseCommand(code);
  }

  private parseComment(c: string): void {
    if (!c) return;
    const lower = c.toLowerCase();
    if (!this.slicer) {
      const gen = /^generated (?:by|with)\s+(.+?)(?:\s+on\s+\d{4}-\d{2}-\d{2}.*)?$/i.exec(c);
      if (gen?.[1]) this.slicer = gen[1].replace(/_SteamEngine/i, "").trim();
      else if (/^bambustudio\s+[\d.]+/i.test(c)) this.slicer = c.trim();
    }
    if (lower.startsWith("layer_change") || lower === "layer change") return;

    if (c.includes(" = ")) {
      // PrusaSlicer / Orca / Bambu config block: "; key = value"
      const i = c.indexOf(" = ");
      this.header.set(normKey(c.slice(0, i)), c.slice(i + 3).trim());
      return;
    }
    // Cura ";TIME:3600" and Bambu "; model printing time: 1h 2m; total estimated time: 1h 5m"
    for (const seg of c.split(";")) {
      const i = seg.indexOf(":");
      if (i <= 0) continue;
      const key = normKey(seg.slice(0, i));
      if (key.length > 60) continue;
      this.header.set(key, seg.slice(i + 1).trim());
    }
  }

  private parseCommand(code: string): void {
    const head = /^([GMT])(\d+)/.exec(code);
    if (!head) return;
    const cmd = `${head[1]}${Number(head[2])}`;
    const params: Record<string, number> = {};
    for (const m of code.slice(head[0].length).matchAll(/([A-Z])\s*(-?\d*\.?\d+)/g)) {
      params[m[1]!] = Number(m[2]);
    }

    switch (cmd) {
      case "G0":
      case "G1":
      case "G2":
      case "G3":
        this.move(params);
        break;
      case "G28": {
        const axes = (["X", "Y", "Z"] as const).filter((a) => a in params);
        for (const a of axes.length ? axes : (["X", "Y", "Z"] as const)) this.pos[a] = 0;
        break;
      }
      case "G90":
        this.absPos = true;
        break;
      case "G91":
        this.absPos = false;
        break;
      case "M82":
        this.relE = false;
        break;
      case "M83":
        this.relE = true;
        break;
      case "G92":
        for (const a of ["X", "Y", "Z", "E"] as const) if (a in params) this.pos[a] = params[a]!;
        break;
      case "M104":
      case "M109":
        if (this.firstNozzle == null && (params.S ?? 0) > 0) this.firstNozzle = params.S!;
        break;
      case "M140":
      case "M190":
        if (this.firstBed == null && (params.S ?? 0) > 0) this.firstBed = params.S!;
        break;
      case "M73":
        if (this.m73FirstRemainingMin == null && params.R != null) this.m73FirstRemainingMin = params.R;
        break;
    }
  }

  private move(p: Record<string, number>): void {
    if (p.F != null && p.F > 0) this.feed = p.F;
    const prev = { ...this.pos };
    for (const a of ["X", "Y", "Z"] as const) {
      if (a in p) this.pos[a] = this.absPos ? p[a]! : this.pos[a] + p[a]!;
    }
    let dE = 0;
    if ("E" in p) {
      const relative = this.relE || !this.absPos;
      dE = relative ? p.E! : p.E! - this.pos.E;
      this.pos.E = relative ? this.pos.E + p.E! : p.E!;
      this.extrudedMm += dE;
    }

    const dx = this.pos.X - prev.X;
    const dy = this.pos.Y - prev.Y;
    const dz = this.pos.Z - prev.Z;
    const xyz = Math.hypot(dx, dy, dz);
    const dist = xyz > 0 ? xyz : Math.abs(dE);
    if (dist > 0) this.timeS += dist / (this.feed / 60);

    if (dE > 0 && Math.hypot(dx, dy) > 0) {
      const z = round(this.pos.Z, 3);
      const last = this.layerZs[this.layerZs.length - 1];
      if (last == null || z > last) this.layerZs.push(z);
      if (z > this.maxZ) this.maxZ = z;
    }
  }

  private h(...keys: string[]): string | undefined {
    for (const k of keys) {
      const v = this.header.get(k);
      if (v != null && v !== "") return v;
    }
    return undefined;
  }

  result(): GcodeMetadata {
    const sources: Record<string, FieldSource> = {};
    const pick = <T>(field: string, header: T | null | undefined, computed: T | null | undefined, fallback?: T): T | null => {
      if (header != null && !(typeof header === "number" && !Number.isFinite(header))) {
        sources[field] = "header";
        return header;
      }
      if (computed != null && !(typeof computed === "number" && !Number.isFinite(computed))) {
        sources[field] = "computed";
        return computed;
      }
      if (fallback !== undefined) {
        sources[field] = "default";
        return fallback;
      }
      return null;
    };

    const filamentType = pick("filamentType", this.h("filament_type", "filament_settings_id")?.split(/[;,]/)[0]?.replace(/"/g, "").trim() || null, null);
    const diameter = pick("filamentDiameterMm", firstNumber(this.h("filament_diameter")), null, DEFAULT_DIAMETER_MM)!;
    const density = pick("filamentDensity", firstNumber(this.h("filament_density")), null, densityFor(filamentType))!;

    // Filament length: Prusa/Orca "[mm]", Bambu "total filament length [mm]", Cura "filament used" in metres.
    let headerLen = sumNumberList(this.h("filament used [mm]", "total filament length [mm]"));
    if (headerLen == null) {
      const cura = this.h("filament used");
      if (cura && /m\s*$/i.test(cura) && !/mm\s*$/i.test(cura)) {
        const metres = sumNumberList(cura.replace(/m/gi, ""));
        if (metres != null) headerLen = metres * 1000;
      }
    }
    const computedLen = this.extrudedMm > 0 ? round(this.extrudedMm) : null;
    const filamentLengthMm = pick("filamentLengthMm", headerLen, computedLen);

    const headerWeight = sumNumberList(this.h("total filament used [g]", "filament used [g]", "total filament weight [g]"));
    const filamentWeightG = pick(
      "filamentWeightG",
      headerWeight != null && headerWeight > 0 ? headerWeight : null,
      filamentLengthMm != null ? round(filamentMmToGrams(filamentLengthMm, diameter, density)) : null,
    );
    // if only weight was known, back-compute length
    const finalLength =
      filamentLengthMm ?? (filamentWeightG != null ? ((sources.filamentLengthMm = "computed"), round(filamentGramsToMm(filamentWeightG, diameter, density))) : null);

    const headerDuration = (() => {
      const v = this.h("estimated printing time (normal mode)", "total estimated time", "estimated printing time", "time");
      return v != null ? parseDurationToSeconds(v) : this.m73FirstRemainingMin != null ? Math.round(this.m73FirstRemainingMin * 60) : null;
    })();
    const estimatedDurationS = pick("estimatedDurationS", headerDuration, this.timeS > 0 ? Math.round(this.timeS) : null);

    const nozzleTempC = pick("nozzleTempC", firstNumber(this.h("temperature", "nozzle_temperature")), this.firstNozzle);
    const bedTempC = pick("bedTempC", firstNumber(this.h("bed_temperature")), this.firstBed);

    const computedLayerHeight = (() => {
      if (this.layerZs.length < 3) return null;
      const counts = new Map<number, number>();
      for (let i = 2; i < this.layerZs.length; i++) {
        const d = round(this.layerZs[i]! - this.layerZs[i - 1]!, 3);
        if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    })();
    const layerHeightMm = pick("layerHeightMm", firstNumber(this.h("layer_height", "layer height")), computedLayerHeight);
    const firstLayerHeightMm = pick(
      "firstLayerHeightMm",
      firstNumber(this.h("first_layer_height", "initial_layer_print_height")),
      this.layerZs[0] != null && this.layerZs[0] > 0 ? this.layerZs[0] : null,
    );
    const layerCount = pick("layerCount", firstNumber(this.h("total layer number", "layer_count", "total_layer_count")), this.layerZs.length || null);
    const maxZMm = pick("maxZMm", firstNumber(this.h("max_layer_z")), this.maxZ > 0 ? this.maxZ : null);

    return {
      slicer: this.slicer,
      flavor: this.h("flavor", "gcode_flavor") ?? null,
      filamentType,
      filamentLengthMm: finalLength,
      filamentWeightG,
      filamentDiameterMm: diameter,
      filamentDensity: density,
      estimatedDurationS,
      nozzleTempC,
      bedTempC,
      layerHeightMm,
      firstLayerHeightMm,
      layerCount: layerCount != null ? Math.round(layerCount) : null,
      maxZMm,
      sources,
      lineCount: this.lineCount,
    };
  }
}

/** Parse a whole G-code string. */
export function parseGcode(text: string): GcodeMetadata {
  const p = new GcodeParser();
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop(); // trailing newline is not a line
  for (const line of lines) p.feedLine(line);
  return p.result();
}

/** Parse from a byte stream (e.g. a Storage download) without buffering the whole file. */
export async function parseGcodeStream(stream: ReadableStream<Uint8Array>): Promise<GcodeMetadata> {
  const p = new GcodeParser();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      p.feedLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  buf += decoder.decode();
  if (buf) p.feedLine(buf);
  return p.result();
}
