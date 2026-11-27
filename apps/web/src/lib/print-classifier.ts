import { rgbaToChw } from "@filamentiq/shared";

/** Model trained in ml/train.ipynb. Both files go in apps/web/public/models/. */
const MODEL_URL = "/models/print-cls.onnx";
const META_URL = "/models/print-cls.json";

export interface PrintClassifier {
  /** Probability (0-1) that the current video frame shows a failed print. */
  failureProb(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<number>;
}

/** Returns null when no model has been exported yet; the demo then runs on motion + Gemini only. */
export async function loadPrintClassifier(): Promise<PrintClassifier | null> {
  const meta = await fetch(META_URL);
  if (!meta.ok) return null;
  const { names, imgsz } = (await meta.json()) as { names: string[]; imgsz: number };
  const failIdx = names.indexOf("failure");
  if (failIdx < 0) throw new Error("print-cls.json has no 'failure' class.");

  const ort = await import("onnxruntime-web/wasm"); // Next bundles the .wasm next to the chunk, no CDN needed
  ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which the app does not set
  const session = await ort.InferenceSession.create(MODEL_URL);

  return {
    async failureProb(video, canvas) {
      // Same as training: shortest edge to imgsz, then centre crop.
      const side = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = canvas.height = imgsz;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, imgsz, imgsz);
      const input = new ort.Tensor("float32", rgbaToChw(ctx.getImageData(0, 0, imgsz, imgsz).data), [1, 3, imgsz, imgsz]);
      const out = await session.run({ [session.inputNames[0]!]: input });
      return (out[session.outputNames[0]!]!.data as Float32Array)[failIdx]!;
    },
  };
}
