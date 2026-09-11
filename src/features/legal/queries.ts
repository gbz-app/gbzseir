import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isLegalSlug, type LegalSlug, type LegalText } from "./meta";

export const LEGAL_REVALIDATE_SECONDS = 3600;

/**
 * Cookie-less anon client. RLS returns only published versions whose published_at has passed; requests go through the
 * Next.js data cache (1 h), and admin publishes expire the /yasal page itself (revalidatePublic paths).
 */
function createLegalClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, next: { revalidate: LEGAL_REVALIDATE_SECONDS } }),
    },
  });
}

/** Latest published version of a text. null = none yet, or the lookup failed (logged; the page shows a fallback). */
export const getPublishedLegalText = cache(async (slug: LegalSlug): Promise<LegalText | null> => {
  const { data: r, error } = await createLegalClient()
    .from("legal_texts")
    .select("slug,version,title,body_md,pending_review,published_at")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[legal] load", slug, error.code, error.message);
    return null;
  }
  if (!r || !r.published_at || !isLegalSlug(r.slug)) return null;
  return { slug: r.slug, version: r.version, title: r.title, body: r.body_md, pendingReview: r.pending_review, publishedAt: r.published_at };
});
