import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { routes, withQuery } from "@/core/routes";
import { CITY } from "@/config/site";
import { PageHeader } from "@/components/shared/page-header";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ShareButton } from "@/components/shared/share-button";
import { JsonLd } from "@/components/seo/json-ld";
import { EDITABLE_STATUSES } from "@/features/listings/constants";
import { jobPostingJsonLd } from "@/features/listings/seo";
import { getListingDetail, safeCategories } from "@/features/listings/server/queries";
import { displayState, jobModelFromDetail } from "@/features/listings/view-models";
import { JobDetailView } from "@/features/listings/components/detail-views";
import { StatusNotice } from "@/features/listings/components/detail-parts";
import { ActionBarSpacer, JobActionBar, ListingDetailMenu, ReportFooter, ViewTracker } from "@/features/listings/components/detail-actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await getListingDetail(id);
  if (!d || d.type !== "job") return { title: "İş ilanı bulunamadı", robots: { index: false } };
  const live = displayState(d.status, d.expires_at) === "live";
  const company = d.business?.name;
  return {
    title: company ? `${d.title} - ${company}` : d.title,
    description: (d.description || `${CITY.name} iş ilanı`).slice(0, 160),
    alternates: { canonical: routes.listings.job(d.id) },
    robots: live ? undefined : { index: false, follow: true },
  };
}

/** E4 - İş ilanı detay (telefon üyeliksiz görünür, başvuru butonu/CV yok). */
export default async function JobPage({ params }: Props) {
  const { id } = await params;
  const detail = await getListingDetail(id);
  if (!detail) notFound();
  if (detail.type !== "job") redirect(routes.listings.classified(detail.id));

  const categories = await safeCategories();
  const model = jobModelFromDetail(detail, categories);
  const editHref = (EDITABLE_STATUSES as readonly string[]).includes(detail.status)
    ? withQuery(routes.listings.postJob(), { duzenle: detail.id })
    : null;
  const manageHref = routes.profile.jobs();
  const similarHref = routes.listings.root("is-ilanlari", { kategori: model.sectorSlug });

  return (
    <>
      {model.state === "live" && !detail.is_demo ? <JsonLd data={jobPostingJsonLd(detail, model)} /> : null}
      <PageHeader
        title="İş İlanı"
        backHref={routes.listings.root("is-ilanlari")}
        hideBottomNav
        actions={
          <>
            <FavoriteButton targetType="listing" targetId={detail.id} />
            <ShareButton title={detail.title} iconOnly variant="ghost" />
            <ListingDetailMenu listingId={detail.id} ownerId={detail.owner_id} editHref={editHref} manageHref={manageHref} />
          </>
        }
      />
      <JobDetailView
        model={model}
        isDemo={detail.is_demo}
        notice={<StatusNotice state={model.state} kind="job" rejectionReason={detail.rejection_reason} />}
        footer={<ReportFooter listingId={detail.id} ownerId={detail.owner_id} />}
      />
      <ActionBarSpacer />
      <JobActionBar
        listingId={detail.id}
        ownerId={detail.owner_id}
        phone={detail.business?.phone ?? null}
        state={model.state}
        similarHref={similarHref}
        editHref={editHref}
        manageHref={manageHref}
        isDemo={detail.is_demo}
      />
      {model.state === "live" ? <ViewTracker listingId={detail.id} /> : null}
    </>
  );
}
