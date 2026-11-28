/** Turns a Supabase Auth error into a short Indonesian message for the login form. */
export function authErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String(err.code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "otp_expired" || /expired or is invalid/i.test(message)) return "Kode salah atau sudah kedaluwarsa. Minta kode baru.";
  if (code === "otp_disabled" || /signups not allowed/i.test(message)) return "Email ini belum terdaftar. Daftar dulu lewat halaman Daftar.";
  if (code.startsWith("over_") || /rate limit|only request this after/i.test(message)) return "Terlalu sering meminta kode. Tunggu sebentar lalu coba lagi.";
  if (code === "email_address_invalid") return "Email tidak valid.";
  return message || "Terjadi kesalahan. Coba lagi.";
}
