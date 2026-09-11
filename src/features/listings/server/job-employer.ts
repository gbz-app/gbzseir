import "server-only";
import { cache } from "react";
import { isUuid } from "../format";
import { one } from "../types";
import { createPublicClient } from "./public-client";

/** Extra employer facts for the job detail "İşveren" card. */
export type JobEmployerInfo = {
  /** Neighbourhood of the business (null when not set / not readable). */
  neighbourhoodName: string | null;
  /** The business's other live job ads (this one excluded); null when the count failed. */
  openJobs: number | null;
};

/**
 * Two cheap public reads (RLS as anon): the business neighbourhood and a head-only count of its other
 * active, non-expired job ads (same rule as the firm page's listings tab). Never throws: null on failure.
 */
export const getJobEmployerInfo = cache(async (businessId: string, listingId: string): Promise<JobEmployerInfo | null> => {
  if (!isUuid(businessId)) return null;
  try {
    const supabase = createPublicClient();
    const [biz, jobs] = await Promise.all([
      supabase.from("businesses").select("neighbourhoods!businesses_neighbourhood_id_fkey(name)").eq("id", businessId).maybeSingle(),
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("type", "job")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .neq("id", listingId),
    ]);
    const row = biz.error ? null : (biz.data as unknown as { neighbourhoods?: { name?: unknown } | Array<{ name?: unknown }> | null } | null);
    const nb = one(row?.neighbourhoods ?? null);
    return {
      neighbourhoodName: typeof nb?.name === "string" && nb.name ? nb.name : null,
      openJobs: jobs.error ? null : (jobs.count ?? null),
    };
  } catch {
    return null;
  }
});
