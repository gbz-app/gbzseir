import { createClient } from "@/lib/supabase/client";

/**
 * Fire-and-forget: counts one share of a listing in its owner's statistics (log_listing_share dedupes per caller per
 * listing per day and ignores the owner). Never throws, never blocks sharing.
 */
export function logListingShare(listingId: string): void {
  if (!listingId) return;
  try {
    void createClient()
      .rpc("log_listing_share", { p_listing: listingId })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* statistics must never break sharing */
  }
}
