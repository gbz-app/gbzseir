import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type BrowserSupabase = SupabaseClient<Database>;

let browserClient: BrowserSupabase | undefined;

/**
 * Supabase client for Client Components (singleton per tab). Session lives in cookies
 * shared with the server client and refreshed by src/proxy.ts.
 */
export function createClient(): BrowserSupabase {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ) as BrowserSupabase;
  }
  return browserClient;
}
