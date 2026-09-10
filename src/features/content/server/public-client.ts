import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

let client: SupabaseClient<Database> | null = null;

/**
 * Anonymous, cookie-free Supabase client for public reads inside cached server functions.
 * It never touches cookies, so pages that use it can stay static / ISR (unlike @/lib/supabase/server).
 */
export function createPublicClient(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
