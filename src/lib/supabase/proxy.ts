import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/**
 * Refresh the Supabase session cookie on each matched request (called from src/proxy.ts).
 * Guests without auth cookies are passed through without any Supabase call. `signedIn` tells the caller whether a valid session exists.
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; signedIn: boolean }> {
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasAuthCookie) return { response: NextResponse.next({ request }), signedIn: false };

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must not be cached by CDNs.
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not run code between createServerClient and getClaims (per @supabase/ssr guidance).
  const { data } = await supabase.auth.getClaims();
  return { response, signedIn: !!data?.claims?.sub };
}
