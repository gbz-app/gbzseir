import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type AdminSupabase = SupabaseClient<Database>;

/**
 * Service-role client. BYPASSES RLS. Server-only (route handlers, cron, notify).
 * Never import this from a Client Component, never return its raw results to users unfiltered.
 */
export function createAdminClient(): AdminSupabase {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as AdminSupabase;
}
