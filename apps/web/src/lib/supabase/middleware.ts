import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth"];
const isPublic = (path: string) => PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** Refreshes the Supabase session cookie and gates protected routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  if (!isSupabaseConfigured) {
    if (!isPublic(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=Configure%20Supabase%20credentials%20to%20sign%20in";
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  let user = null;
  try { user = (await supabase.auth.getUser()).data.user; } catch { user = null; }
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
