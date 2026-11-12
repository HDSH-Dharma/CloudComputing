import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GcodeMetadataSchema } from "../supabase/functions/_shared/contracts.ts";
import { parseDurationToSeconds, parseGcode, parseGcodeStream } from "../supabase/functions/_shared/gcode/parser.ts";
import { filamentMmToGrams } from "../supabase/functions/_shared/ledger.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseDurationToSeconds", () => {
  it.each([
    ["1h 23m 4s", 4984],
    ["1d 2h 3m 4s", 93784],
    ["45m 12s", 2712],
    ["6123", 6123],
    ["nonsense", null],
  ])("%s -> %s", (input, expected) => expect(parseDurationToSeconds(input)).toBe(expected));
});

describe("parseGcode", () => {
  it("reads PrusaSlicer header and footer config", () => {
    const m = parseGcode(fixture("prusaslicer.gcode"));
    expect(GcodeMetadataSchema.parse(m)).toBeTruthy();
    expect(m.slicer).toBe("PrusaSlicer 2.8.1+win64");
    expect(m.filamentType).toBe("PLA");
    expect(m.filamentLengthMm).toBe(3920.53);
    expect(m.filamentWeightG).toBe(11.69);
    expect(m.estimatedDurationS).toBe(4984);
    expect(m.nozzleTempC).toBe(215);
    expect(m.bedTempC).toBe(60);
    expect(m.layerHeightMm).toBe(0.2);
    expect(m.firstLayerHeightMm).toBe(0.2);
    expect(m.maxZMm).toBe(48.2);
    expect(m.sources.filamentWeightG).toBe("header");
    // layer count is not in Prusa headers -> computed from Z moves
    expect(m.layerCount).toBe(2);
    expect(m.sources.layerCount).toBe("computed");
  });

  it("reads Cura comments (metres, TIME, LAYER_COUNT) and M-code temperatures", () => {
    const m = parseGcode(fixture("cura.gcode"));
    expect(m.slicer).toBe("Cura 5.7.1");
    expect(m.flavor).toBe("Marlin");
    expect(m.filamentLengthMm).toBeCloseTo(4258.91, 2);
    expect(m.filamentWeightG).toBeCloseTo(filamentMmToGrams(4258.91, 1.75, 1.24), 1);
    expect(m.sources.filamentWeightG).toBe("computed");
    expect(m.estimatedDurationS).toBe(6123);
    expect(m.layerHeightMm).toBe(0.16);
    expect(m.layerCount).toBe(3);
    expect(m.nozzleTempC).toBe(210);
    expect(m.bedTempC).toBe(65);
    expect(m.sources.nozzleTempC).toBe("computed");
  });

  it("reads Bambu Studio header block (colon style, combined time line)", () => {
    const m = parseGcode(fixture("bambu.gcode"));
    expect(m.slicer).toBe("BambuStudio 01.09.07.52");
    expect(m.filamentType).toBe("PETG");
    expect(m.filamentLengthMm).toBe(32850);
    expect(m.filamentWeightG).toBe(99.85);
    expect(m.estimatedDurationS).toBe(7098);
    expect(m.layerCount).toBe(95);
    expect(m.nozzleTempC).toBe(240);
    expect(m.bedTempC).toBe(80);
    expect(m.layerHeightMm).toBe(0.24);
    expect(m.firstLayerHeightMm).toBe(0.24);
    expect(m.filamentDensity).toBe(1.27);
  });

  it("falls back to simulating moves when there is no slicer header", () => {
    const m = parseGcode(fixture("raw-no-header.gcode"));
    // absolute E: 0->20 (incl. retract -2 / unretract +2), reset, then 0->5  => 25 mm
    expect(m.filamentLengthMm).toBe(25);
    expect(m.sources.filamentLengthMm).toBe("computed");
    expect(m.filamentWeightG).toBeCloseTo(filamentMmToGrams(25), 2);
    expect(m.filamentDiameterMm).toBe(1.75);
    expect(m.sources.filamentDiameterMm).toBe("default");
    expect(m.nozzleTempC).toBe(205);
    expect(m.bedTempC).toBe(55);
    expect(m.firstLayerHeightMm).toBe(0.3);
    expect(m.layerCount).toBe(4);
    expect(m.layerHeightMm).toBe(0.2);
    expect(m.maxZMm).toBe(0.9);
    expect(m.estimatedDurationS).toBeGreaterThan(0);
    expect(m.sources.estimatedDurationS).toBe("computed");
  });

  it("stream parser gives the same result as the string parser, even when chunks split lines", async () => {
    const text = fixture("prusaslicer.gcode");
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    expect(await parseGcodeStream(stream)).toEqual(parseGcode(text));
  });
});
