import "server-only";
import { cache } from "react";
import { isUuid } from "../format";
import { createPublicClient } from "./public-client";

/** Extra employer facts for the job detail "İşveren" card. */
export type JobEmployerInfo = {
  /** District slug of the business (null when not set / not readable). */
  districtId: string | null;
  /** The business's other live job ads (this one excluded); null when the count failed. */
  openJobs: number | null;
};

/**
 * Two cheap public reads (RLS as anon): the business district and a head-only count of its other
 * active, non-expired job ads (same rule as the firm page's listings tab). Never throws: null on failure.
 */
export const getJobEmployerInfo = cache(async (businessId: string, listingId: string): Promise<JobEmployerInfo | null> => {
  if (!isUuid(businessId)) return null;
  try {
    const supabase = createPublicClient();
    const [biz, jobs] = await Promise.all([
      supabase.from("businesses").select("district_id").eq("id", businessId).maybeSingle(),
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("type", "job")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .neq("id", listingId),
    ]);
    return {
      districtId: biz.error ? null : (biz.data?.district_id ?? null),
      openJobs: jobs.error ? null : (jobs.count ?? null),
    };
  } catch {
    return null;
  }
});
