import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the real migration on an in-memory Postgres with Supabase-like roles.
const MIGRATION = readFileSync(new URL("../supabase/migrations/20261128000001_assistant_quota.sql", import.meta.url), "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const db = new PGlite();

async function as<T>(role: "authenticated" | "anon", uid: string | null, sql: string) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return await db.query<T>(sql); } finally { await db.exec("reset role;"); }
}
const quota = async (uid: string, perMin = 10, perDay = 100) =>
  (await as<{ r: string | null }>("authenticated", uid, `select public.use_assistant_quota(${perMin}, ${perDay}) as r`)).rows[0]!.r;
const usage = async (uid: string) => (await db.query<{ n: number }>(`select count(*)::int n from public.ai_usage where owner_id = '${uid}'`)).rows[0]!.n;

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; grant usage on schema auth to authenticated, anon;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(MIGRATION);
}, 30_000);

describe("use_assistant_quota", () => {
  it("allows 10 a minute and does not record refused calls", async () => {
    for (let i = 0; i < 10; i++) expect(await quota(A)).toBeNull();
    expect(await quota(A)).toBe("minute");
    expect(await usage(A)).toBe(10);
  });

  it("allows 100 per 24 h; older usage stops counting and is pruned after 2 days", async () => {
    await db.exec(`insert into public.ai_usage (owner_id, created_at) select '${B}', now() - interval '1 hour' from generate_series(1, 99)`);
    expect(await quota(B)).toBeNull();
    expect(await quota(B)).toBe("day");
    await db.exec(`update public.ai_usage set created_at = now() - interval '3 days' where owner_id = '${B}'`);
    expect(await quota(B)).toBeNull();
    expect(await usage(B)).toBe(1);
  });

  it("users cannot delete, edit or forge usage, and see only their own", async () => {
    await expect(as("authenticated", A, "delete from public.ai_usage")).rejects.toThrow();
    await expect(as("authenticated", A, "update public.ai_usage set created_at = now() - interval '9 days'")).rejects.toThrow();
    await expect(as("authenticated", A, `insert into public.ai_usage (owner_id) values ('${B}')`)).rejects.toThrow();
    expect(await usage(A)).toBe(10);
    expect((await as<{ n: number }>("authenticated", A, "select count(*)::int n from public.ai_usage")).rows[0]!.n).toBe(10);
  });

  it("refuses anonymous and logged-out callers", async () => {
    await expect(as("anon", null, "select public.use_assistant_quota(10, 100)")).rejects.toThrow();
    await expect(as("authenticated", null, "select public.use_assistant_quota(10, 100)")).rejects.toThrow();
  });

  it("huge limits passed by a caller only add to their own usage", async () => {
    expect(await quota(A, 1_000_000, 1_000_000)).toBeNull();
    expect(await usage(A)).toBe(11);
    expect(await usage(B)).toBe(1);
  });
});
