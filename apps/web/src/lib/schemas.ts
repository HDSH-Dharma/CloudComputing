import { z } from "zod";

export const CredentialsSchema = z.object({
  email: z.string().trim().email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter").max(72, "Password maksimal 72 karakter"),
});
export type Credentials = z.infer<typeof CredentialsSchema>;
