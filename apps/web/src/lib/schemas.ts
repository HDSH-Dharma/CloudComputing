import { z } from "zod";

export const CredentialsSchema = z.object({
  email: z.string().trim().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter").max(72, "Password maksimal 72 karakter"),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

// --- Printer setup form (columns of `printers`; the API key goes through the set_printer_credentials RPC) ---
export const PRINTER_API_TYPES = ["octoprint", "moonraker", "bambu"] as const;

const optionalUrl = z
  .string()
  .trim()
  .url("URL tidak valid (contoh: https://printer.example.com)")
  .max(300)
  .optional();

export const PrinterInputSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  model: z.string().trim().max(80).optional(),
  api_type: z.enum(PRINTER_API_TYPES),
  base_url: z.string().trim().url("URL tidak valid (contoh: https://printer.example.com)").max(300),
  webcam_url: optionalUrl,
  nozzle_diameter_mm: z.number().positive("Harus > 0").max(2).default(0.4),
  power_watts: z.number().nonnegative("Tidak boleh negatif").max(5000).default(120),
});
export type PrinterInput = z.infer<typeof PrinterInputSchema>;

export const ApiKeySchema = z.string().trim().min(1, "API key wajib diisi").max(500);
