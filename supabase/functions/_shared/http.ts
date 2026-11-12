/** HTTP helpers shared by Edge Functions: CORS, JSON responses, auth, error mapping. */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function corsHeaders(req: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export function errorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof HttpError) return json({ error: err.message, details: err.details }, err.status, headers);
  if (err instanceof ZodError) return json({ error: "Invalid request", details: err.flatten() }, 400, headers);
  if (err instanceof SyntaxError) return json({ error: "Body must be valid JSON" }, 400, headers);
  console.error(err);
  return json({ error: "Internal error" }, 500, headers);
}

export interface AuthedContext {
  db: SupabaseClient;
  user: User;
}

/** Supabase client that acts AS the caller (their JWT), so RLS applies to every query. */
export async function authenticate(req: Request, supabaseUrl: string, anonKey: string): Promise<AuthedContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Missing bearer token");
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(authHeader.slice("Bearer ".length));
  if (error || !data.user) throw new HttpError(401, "Invalid or expired session");
  return { db, user: data.user };
}

export function requireEnv(get: (k: string) => string | undefined, key: string): string {
  const v = get(key);
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
}
