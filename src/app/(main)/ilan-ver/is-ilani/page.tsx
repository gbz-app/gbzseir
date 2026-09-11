import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { routes, withQuery } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { getMyBusiness, getOwnListing, safeCategories } from "@/features/listings/server/queries";
import { jobDraftFromDetail, type JobDraft } from "@/features/listings/wizard-drafts";
import { JobWizard } from "@/features/listings/components/job-wizard";

export const metadata: Metadata = { title: "İş İlanı Ver", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** E7 - İş ilanı ver / düzenle (sadece onaylı işletmeler). */
export default async function PostJobPage({ searchParams }: Props) {
  const raw = (await searchParams).duzenle;
  const editParam = typeof raw === "string" && raw ? raw : null;
  const path = editParam ? withQuery(routes.listings.postJob(), { duzenle: editParam }) : routes.listings.postJob();
  const { user } = await requireProfile(path);

  let initial: JobDraft | null = null;
  let editId: string | null = null;
  let listingBusinessId: string | null = null;
  if (editParam) {
    const own = await getOwnListing(user.id, editParam);
    if (!own || own.type !== "job") notFound();
    editId = own.id;
    initial = jobDraftFromDetail(own);
    listingBusinessId = own.business_id;
  }

  // An owner can have several businesses: an edit keeps the ad's own business, a new ad uses the active one.
  const business = await getMyBusiness(user.id, listingBusinessId);
  if (!business || business.status !== "approved") redirect(routes.listings.post());
  const sectors = (await safeCategories()).filter((c) => c.type === "job");

  return (
    <JobWizard
      sectors={sectors}
      business={{
        id: business.id,
        name: business.name,
        slug: business.slug,
        logo_url: business.logo_url,
        verification_level: business.verification_level,
        phone: business.phone,
      }}
      editId={editId}
      initial={initial}
    />
  );
}
