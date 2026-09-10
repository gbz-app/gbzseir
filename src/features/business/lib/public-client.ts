import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BUSINESS_CACHE_TAG, BUSINESS_REVALIDATE_SECONDS } from "./cache-tags";

/**
 * Cookie-less anon Supabase client for PUBLIC data (firm pages, directory, sitemap, home rail).
 * - Never reads cookies, so pages that use it stay statically renderable / ISR-cacheable.
 * - RLS returns only what any visitor may see (approved businesses, public reviews, active listings).
 * - Every request goes through the Next.js data cache for BUSINESS_REVALIDATE_SECONDS with the
 *   BUSINESS_CACHE_TAG tag, so data stays fresh on any route that renders it (home, sitemap...) and owner edits
 *   can expire it immediately (actions.ts -> updateTag).
 */
export function createPublicClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, next: { revalidate: BUSINESS_REVALIDATE_SECONDS, tags: [BUSINESS_CACHE_TAG] } }),
    },
  });
}
