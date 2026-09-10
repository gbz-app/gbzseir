import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type PublicSupabase = SupabaseClient<Database>;

/**
 * Cookie-less anon client for PUBLIC data in Server Components (poi, duty, places).
 * Unlike @/lib/supabase/server it does not read cookies, so pages stay static / ISR.
 * Every request goes through Next's fetch cache with the given revalidate time (use GET RPCs: { get: true }).
 */
export function createPublicClient(revalidate: number, tags: string[] = ["nearby"]): PublicSupabase {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, next: { revalidate, tags } }),
    },
  }) as PublicSupabase;
}
