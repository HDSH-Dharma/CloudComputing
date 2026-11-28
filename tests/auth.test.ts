import { describe, expect, it } from "vitest";
import { authErrorMessage } from "../apps/web/src/lib/auth-messages.ts";
import { EmailSchema, OtpCodeSchema } from "../apps/web/src/lib/schemas.ts";

const authError = (code: string, message = "x") => Object.assign(new Error(message), { code });

describe("login form", () => {
  it("accepts emails and numeric codes only", () => {
    expect(EmailSchema.parse("  Dharma@Example.com ")).toBe("dharma@example.com");
    expect(EmailSchema.safeParse("not-an-email").success).toBe(false);
    expect(OtpCodeSchema.parse(" 123456 ")).toBe("123456");
    expect(OtpCodeSchema.safeParse("12345").success).toBe(false);
    expect(OtpCodeSchema.safeParse("12a456").success).toBe(false);
  });

  it("explains Supabase auth errors in Indonesian", () => {
    expect(authErrorMessage(authError("otp_expired"))).toMatch(/kedaluwarsa/);
    expect(authErrorMessage(new Error("Token has expired or is invalid"))).toMatch(/kedaluwarsa/);
    expect(authErrorMessage(authError("otp_disabled", "Signups not allowed for otp"))).toMatch(/belum terdaftar/);
    expect(authErrorMessage(authError("over_email_send_rate_limit"))).toMatch(/Terlalu sering/);
    expect(authErrorMessage(new Error("For security purposes, you can only request this after 42 seconds."))).toMatch(/Terlalu sering/);
    expect(authErrorMessage(new Error("Something else"))).toBe("Something else");
    expect(authErrorMessage("weird")).toBe("Terjadi kesalahan. Coba lagi.");
  });
});
